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


def _phrase_signature(phrase: str) -> str:
    """단복수/대소문자/공백 둔감 signature. detectors와 동일 룰."""
    parts = []
    for w in phrase.lower().split():
        w = w.strip()
        if len(w) >= 4 and w.endswith("ies"):
            w = w[:-3] + "y"
        elif len(w) >= 4 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        if w:
            parts.append(w)
    return " ".join(parts)


# 토큰화 전 lowercase 텍스트에 적용. 하이픈으로 끊기는 합성어를 한 토큰으로 묶어
# 'chest x-ray' 같은 phrase가 'chest', 'x', 'ray'로 쪼개져 'chest ray' 같은
# 가짜 bigram을 만드는 회귀를 차단한다.
# 순서 중요 — str.replace 은 substring 매칭이라 plural을 먼저 둬야 'x-rays'가
# 'x-ray' 룰에 먼저 잡혀 'xrays'로 잘못 변환되는 버그를 피한다.
_HYPHEN_COMPOUNDS: tuple[tuple[str, str], ...] = (
    ("x-rays", "xray"),
    ("x-ray", "xray"),
    ("ct-scans", "ctscan"),
    ("ct-scan", "ctscan"),
    ("mri-scans", "mriscan"),
    ("mri-scan", "mriscan"),
)


def _preprocess_phrase(text: str) -> str:
    out = text
    for src, dst in _HYPHEN_COMPOUNDS:
        out = out.replace(src, dst)
    return out


# 토큰화·집계 후 surface 형태에 적용. preprocess로 합쳐진 합성어를 사용자에게
# 보여줄 때 다시 정상 표기로 복원하고, 잘 알려진 phrase는 표준형으로 통일한다.
_PHRASE_ALIASES: dict[str, str] = {
    "chest xray": "chest x-ray",
    "lung xray": "lung x-ray",
    "ctscan image": "ct scan",
    "ctscan images": "ct scan",
    "mriscan image": "mri scan",
}


def _canonicalize_surface(phrase: str) -> str:
    return _PHRASE_ALIASES.get(phrase, phrase)


# 라벨로서 의미가 약하거나 abstract 미사용 표현에서 자주 만들어져 신뢰를 깎는 phrase.
# weak_bigrams에 추가되어 keyword 후보 점수를 0으로 만든다.
_NOISY_PHRASES: frozenset[str] = frozenset({
    "light image",
    "light images",
    "shed light",
    "sheds light",
    "shedding light",
    "high quality",
    "low quality",
    "wide range",
})


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
            normed = _preprocess_phrase(phrase.lower())
            tokens = [
                t for t in re.findall(r"\b\w\w+\b", normed)
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
    } | set(_NOISY_PHRASES)
    is_weak = np.array([name in weak_bigrams for name in feature_names])

    result: dict[int, list[str]] = {}
    for idx, cid in enumerate(cluster_ids):
        row = tfidf[idx].toarray().flatten()
        # 글로벌 키워드는 점수에 0.3배 페널티, 약한 bigram은 0 (제외)
        adjusted = row * np.where(is_global, 0.3, 1.0)
        adjusted = adjusted * np.where(is_weak, 0.0, 1.0)
        order = adjusted.argsort()[::-1]

        multiword_picks: list[str] = []
        seen_sigs: set[str] = set()
        unigram_backup: list[str] = []
        for i in order:
            if row[i] <= 0:
                break
            if is_multiword[i]:
                cand = feature_names[i]
                sig = _phrase_signature(cand)
                # 같은 signature(단복수/대소문자 차이만)인 phrase는 점수 높은 첫
                # 것만 채택. 'medical image'와 'medical images'를 동시 채택하던
                # 회귀를 차단.
                if sig in seen_sigs:
                    continue
                if len(multiword_picks) < top_n:
                    multiword_picks.append(cand)
                    seen_sigs.add(sig)
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
        # surface canonicalization — preprocess가 합친 'chest xray' 같은 토큰을
        # 사용자 표기('chest x-ray')로 복원하고 잘 알려진 phrase를 통일.
        result[cid] = [_canonicalize_surface(k) for k in keywords]
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


def extract_cell_keywords(
    papers_df: pl.DataFrame,
    coords_with_cells: pl.DataFrame,
    top_n: int = 5,
    min_papers_per_cell: int = 1,
) -> dict[str, list[str]]:
    """h3 셀 단위 c-TF-IDF — 각 셀을 '문서'로 보고 abstract만으로 로컬 키워드 산출.

    cluster 키워드를 셀에 그대로 상속하던 구조는 "지도 라벨이 다른 위치에 있는데
    셀 패널에 클러스터 라벨이 뜨는" 의미 단위 혼선의 원인이었다. 셀 키워드는 항상
    그 셀의 논문 abstract에서 직접 계산해야 사용자가 본 위치의 의미와 일치한다.

    Args:
        papers_df: [arxiv_id, abstract]
        coords_with_cells: [arxiv_id, cell_id]
        top_n: 셀당 최대 키워드 수
        min_papers_per_cell: 키워드를 계산할 최소 논문 수 (그 미만은 [])
    """
    if papers_df.is_empty() or coords_with_cells.is_empty():
        return {}

    # cell → abstract 묶기
    abstract_by_id = dict(
        zip(papers_df["arxiv_id"].to_list(), papers_df["abstract"].to_list())
    )
    cell_docs: dict[str, list[str]] = defaultdict(list)
    for row in coords_with_cells.to_dicts():
        cell_id = row.get("cell_id")
        arxiv_id = row.get("arxiv_id")
        if not cell_id or not arxiv_id:
            continue
        text = abstract_by_id.get(arxiv_id)
        if text:
            cell_docs[cell_id].append(_clean_text(text))

    # 키워드를 계산할 셀만 필터
    eligible = {
        cell: docs
        for cell, docs in cell_docs.items()
        if len(docs) >= min_papers_per_cell
    }
    if not eligible:
        return {}

    cell_ids = sorted(eligible.keys())
    joined = [" ".join(eligible[cid]) for cid in cell_ids]

    sklearn_stop = _english_stopwords()

    def phrase_aware_analyzer(text: str) -> list[str]:
        ngrams: list[str] = []
        for phrase in re.split(r"[.\n]+", text):
            normed = _preprocess_phrase(phrase.lower())
            tokens = [
                t for t in re.findall(r"\b\w\w+\b", normed)
                if t not in sklearn_stop
            ]
            ngrams.extend(tokens)
            for i in range(len(tokens) - 1):
                ngrams.append(f"{tokens[i]} {tokens[i + 1]}")
        return ngrams

    # 셀은 클러스터보다 훨씬 작아 min_df=1로 두지 않으면 키워드가 거의 안 잡힌다.
    vectorizer = CountVectorizer(
        analyzer=phrase_aware_analyzer,
        min_df=1,
        max_features=50000,
    )
    counts = vectorizer.fit_transform(joined)
    tfidf = TfidfTransformer().fit_transform(counts)
    feature_names = vectorizer.get_feature_names_out()
    is_multiword = np.array([" " in name for name in feature_names])

    # 셀 단위에서도 너무 흔한 phrase는 변별력 약화 → 페널티.
    n_total = tfidf.shape[0]
    appears = np.array([
        int((tfidf[:, j].toarray().flatten() > 0).sum())
        for j in range(tfidf.shape[1])
    ])
    is_global = appears >= max(2, int(0.4 * n_total))

    weak_bigrams = {
        "large language",
        "language llms",
        "language language",
        "sequence sequence",
        "model model",
        "data data",
        "task task",
    } | set(_NOISY_PHRASES)
    is_weak = np.array([name in weak_bigrams for name in feature_names])

    result: dict[str, list[str]] = {}
    for idx, cid in enumerate(cell_ids):
        row = tfidf[idx].toarray().flatten()
        adjusted = row * np.where(is_global, 0.4, 1.0)
        adjusted = adjusted * np.where(is_weak, 0.0, 1.0)
        order = adjusted.argsort()[::-1]

        multiword_picks: list[str] = []
        seen_sigs: set[str] = set()
        unigram_backup: list[str] = []
        for i in order:
            if row[i] <= 0:
                break
            name = feature_names[i]
            if is_multiword[i]:
                sig = _phrase_signature(name)
                if sig in seen_sigs:
                    continue
                if len(multiword_picks) < top_n:
                    multiword_picks.append(name)
                    seen_sigs.add(sig)
            else:
                if any(name in m.split() for m in multiword_picks):
                    continue
                unigram_backup.append(name)
            if len(multiword_picks) >= top_n:
                break

        kws = multiword_picks[:]
        if len(kws) < top_n:
            for kw in unigram_backup:
                if kw not in kws:
                    kws.append(kw)
                if len(kws) >= top_n:
                    break
        result[cid] = [_canonicalize_surface(k) for k in kws]
    return result


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
        # 코드/URL/저장소 artifact — 연구 개념이 아니라 인용된 링크 토큰
        # cs.CV 등에서 'https github'이 #1 후보로 떠 데모 신뢰를 깨던 회귀.
        "http", "https", "www", "com", "org", "net", "github", "gitlab",
        "url", "link", "repository", "repo", "code", "anonymous",
        "available", "supplementary", "github io", "huggingface",
    }
    return frozenset(ENGLISH_STOP_WORDS) | extras
