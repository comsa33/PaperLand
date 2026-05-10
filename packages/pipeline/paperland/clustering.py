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

    vectorizer = CountVectorizer(
        ngram_range=(1, 2),
        stop_words="english",
        min_df=min_df,
        max_features=20000,
    )
    counts = vectorizer.fit_transform(joined)
    tfidf = TfidfTransformer().fit_transform(counts)
    feature_names = vectorizer.get_feature_names_out()

    result: dict[int, list[str]] = {}
    for idx, cid in enumerate(cluster_ids):
        row = tfidf[idx].toarray().flatten()
        top_idx = row.argsort()[::-1][:top_n]
        keywords = [feature_names[i] for i in top_idx if row[i] > 0]
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
