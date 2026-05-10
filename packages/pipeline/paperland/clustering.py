"""클러스터링 (HDBSCAN) + sklearn 기반 c-TF-IDF 키워드 추출.

V0: 직접 구현 (BERTopic 의존성 회피).
V1+: BERTopic 옵션 추가 가능.
"""

from __future__ import annotations

import re
from collections import defaultdict

import numpy as np
import polars as pl
from sklearn.feature_extraction.text import CountVectorizer, TfidfTransformer

NOISE_LABEL = -1


def cluster_hdbscan(
    embeddings: np.ndarray,
    min_cluster_size: int = 15,
    min_samples: int | None = None,
    metric: str = "euclidean",
) -> np.ndarray:
    """HDBSCAN으로 클러스터 라벨 산출."""
    try:
        import hdbscan
    except ImportError as e:
        raise ImportError("hdbscan 이 필요합니다.") from e

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric=metric,
        prediction_data=True,  # approximate_predict 활성화 (V1+ 증분 할당용)
    )
    return clusterer.fit_predict(embeddings)


def cluster_kmeans(
    embeddings: np.ndarray,
    n_clusters: int = 10,
    random_state: int = 42,
) -> np.ndarray:
    """KMeans로 K개 클러스터 강제 할당 — V0 실데이터에서 noise 비율이 높을 때 사용.

    cosine 유사도 기준 군집화를 위해 입력을 L2 정규화한 뒤 euclidean KMeans 적용
    (정규화된 벡터의 euclidean ≈ cosine).
    """
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import normalize

    normed = normalize(embeddings, norm="l2")
    km = KMeans(n_clusters=n_clusters, random_state=random_state, n_init="auto")
    return km.fit_predict(normed)


def extract_cluster_keywords(
    papers_df: pl.DataFrame,
    cluster_labels: np.ndarray,
    top_n: int = 10,
    min_df: int = 2,
) -> dict[int, list[str]]:
    """c-TF-IDF로 클러스터별 대표 키워드 추출.

    각 클러스터의 모든 abstract를 하나의 "문서"로 합쳐 TF-IDF 계산.
    """
    if len(cluster_labels) != len(papers_df):
        raise ValueError("cluster_labels 와 papers_df 길이 불일치")

    # 클러스터별 문서 모으기
    cluster_docs: dict[int, list[str]] = defaultdict(list)
    for label, abstract in zip(cluster_labels, papers_df["abstract"].to_list()):
        if label == NOISE_LABEL:
            continue
        cluster_docs[int(label)].append(_clean_text(abstract))

    if not cluster_docs:
        return {}

    cluster_ids = sorted(cluster_docs.keys())
    joined = [" ".join(cluster_docs[cid]) for cid in cluster_ids]

    # 문장(phrase) 경계 존중하는 사용자 정의 analyzer.
    # 이렇게 하지 않으면 ". " 로 구분된 합성 abstract에서 인접 phrase의 끝-시작 단어가
    # 가짜 bigram을 만들어 라벨이 왜곡됨 (예: "self verification. claim verification" → 가짜 "verification claim").
    sklearn_stop = _english_stopwords()

    def phrase_aware_analyzer(text: str) -> list[str]:
        ngrams: list[str] = []
        for phrase in re.split(r"[.\n]+", text):
            tokens = [
                t for t in re.findall(r"\b\w\w+\b", phrase.lower())
                if t not in sklearn_stop
            ]
            ngrams.extend(tokens)
            for i in range(len(tokens) - 1):
                ngrams.append(f"{tokens[i]} {tokens[i + 1]}")
        return ngrams

    vectorizer = CountVectorizer(
        analyzer=phrase_aware_analyzer,
        min_df=min_df,
        max_features=20000,
    )
    counts = vectorizer.fit_transform(joined)
    tfidf = TfidfTransformer().fit_transform(counts)
    feature_names = vectorizer.get_feature_names_out()

    # 다어 구문(bigram)을 1차 후보로, 단일 단어는 보충용으로만 사용
    is_multiword = np.array([" " in name for name in feature_names])

    # 변별력 확보: 절반 이상의 클러스터에 공통으로 등장하는 글로벌 키워드를 페널티.
    # cs.CL 실데이터에서 "large language", "language model" 등이 모든 클러스터를 덮어
    # 라벨이 다 비슷해지는 현상을 방지.
    n_clusters_total = tfidf.shape[0]
    appears_in_clusters = np.array([
        int((tfidf[:, j].toarray().flatten() > 0).sum())
        for j in range(tfidf.shape[1])
    ])
    is_global = appears_in_clusters >= max(2, int(0.6 * n_clusters_total))

    # 의미가 약하거나 사용자에게 라벨로서 신뢰를 깎는 bigram. 여기에 등장하면 점수 0.
    # ('large language' 단독은 노이즈 — 'large language model' 같은 trigram이 데이터에
    # 충분히 있을 때만 의미가 있는데, 우리는 bigram 윈도우라 그런 trigram이 잡히지 않음.)
    weak_bigrams = {
        "large language",  # 'large language model' 의 일부 — 단독 bigram은 노이즈
        "language llms",
        "language large",
        "language language",
        "llms llms",
        "sequence sequence",
        "model model",
        "data data",
        "task task",
    }
    is_weak = np.array([name in weak_bigrams for name in feature_names])

    result: dict[int, list[str]] = {}
    for idx, cid in enumerate(cluster_ids):
        row = tfidf[idx].toarray().flatten()
        # 글로벌 키워드는 점수에 0.3배 페널티, 약한 bigram은 0 (제외)
        adjusted = row * np.where(is_global, 0.3, 1.0)
        adjusted = adjusted * np.where(is_weak, 0.0, 1.0)
        order = adjusted.argsort()[::-1]

        multiword_picks: list[str] = []
        unigram_backup: list[str] = []
        for i in order:
            if row[i] <= 0:
                break
            if is_multiword[i]:
                if len(multiword_picks) < top_n:
                    multiword_picks.append(feature_names[i])
            else:
                token = feature_names[i]
                if any(token in m.split() for m in multiword_picks):
                    continue
                unigram_backup.append(feature_names[i])
            if len(multiword_picks) >= top_n:
                break

        keywords = multiword_picks[:]
        if len(keywords) < top_n:
            for kw in unigram_backup:
                if kw not in keywords:
                    keywords.append(kw)
                if len(keywords) >= top_n:
                    break
        result[cid] = keywords
    return result


def keywords_per_paper(
    papers_df: pl.DataFrame,
    cluster_labels: np.ndarray,
    cluster_keywords: dict[int, list[str]],
) -> dict[str, list[str]]:
    """각 논문에 대해 그 논문이 속한 클러스터의 키워드를 매핑."""
    out: dict[str, list[str]] = {}
    for arxiv_id, label in zip(papers_df["arxiv_id"].to_list(), cluster_labels):
        out[arxiv_id] = cluster_keywords.get(int(label), [])[:5]
    return out


def _clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text.lower()


def _english_stopwords() -> frozenset[str]:
    """sklearn 내장 영어 stopwords + 일반 학술 필러."""
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

    extras = {
        "study", "studies", "method", "methods", "approach", "approaches",
        "result", "results", "model", "models", "training", "experiments",
        "performance", "evaluation", "ablation", "case", "empirical",
        # cs.CL 실데이터에서 너무 자주 나와 라벨로 부적합한 일반어
        "novel", "propose", "proposed", "achieve", "achieves",
        "art", "state",  # "state of the art" → bigram "state art" 방지
        "real", "world",  # "real world"
        "open", "source",  # "open source"
        "scale", "scales", "scalable",
        "show", "shows", "shown", "demonstrate", "demonstrates",
    }
    return frozenset(ENGLISH_STOP_WORDS) | extras
