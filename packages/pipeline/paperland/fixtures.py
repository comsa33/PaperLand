"""샘플 픽스처 생성.

GPU/외부 데이터 없이 합성 논문을 만들어 V0 파이프라인을 end-to-end 검증.
프론트 개발 초기에 즉시 렌더할 수 있는 JSON artifact를 생산.
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from random import Random

import numpy as np
import polars as pl

from .build import build_artifacts
from .clustering import cluster_hdbscan, extract_cluster_keywords, keywords_per_paper
from .detectors import AdjacentGapDetector
from .gridding import aggregate_cells, assign_cells
from .schemas import Manifest

# 합성 시 사용할 토픽 단어 풀 (cs.CL 분위기)
TOPIC_VOCABS = [
    ["transformer", "attention", "language model", "pretraining", "tokenization"],
    ["retrieval", "augmented", "rag", "knowledge", "vector database"],
    ["hallucination", "factuality", "grounding", "verification", "evaluation"],
    ["dialogue", "conversational", "agent", "tool use", "planning"],
    ["alignment", "rlhf", "preference", "safety", "reward model"],
    ["multimodal", "vision language", "image text", "captioning", "video"],
    ["efficiency", "quantization", "distillation", "pruning", "inference"],
    ["reasoning", "chain of thought", "step by step", "math", "logic"],
    ["evaluation", "benchmark", "leaderboard", "metric", "human evaluation"],
    ["instruction", "fine tuning", "lora", "adapter", "parameter efficient"],
]


def generate_fixtures(
    out_dir: Path,
    n_papers: int = 300,
    n_clusters: int = 8,
    seed: int = 42,
    embedding_dim: int = 32,
) -> Manifest:
    """합성 논문으로 V0 artifact 생산."""
    rng = np.random.default_rng(seed)
    pyrand = Random(seed)

    papers_df, embeddings, true_labels = _synthesize_papers(
        n_papers=n_papers,
        n_clusters=n_clusters,
        embedding_dim=embedding_dim,
        rng=rng,
        pyrand=pyrand,
    )

    coords = _embeddings_to_2d(embeddings, rng)
    coords_df = pl.DataFrame({
        "arxiv_id": papers_df["arxiv_id"],
        "x": coords[:, 0],
        "y": coords[:, 1],
    })

    # HDBSCAN — 합성 데이터 기준 small min_cluster_size
    cluster_labels = cluster_hdbscan(
        embeddings, min_cluster_size=max(5, n_papers // (n_clusters * 4))
    )
    cluster_keywords = extract_cluster_keywords(papers_df, cluster_labels)
    paper_keywords = keywords_per_paper(papers_df, cluster_labels, cluster_keywords)

    # 격자화
    coords_df = assign_cells(coords_df)
    cells_df = aggregate_cells(
        papers_df=papers_df.select(["arxiv_id", "primary_category", "submitted_date"]),
        coords_df=coords_df,
        keywords_per_paper=paper_keywords,
        recent_year_threshold=date.today().year - 2,
    )

    # 인공적으로 일부 셀을 비워서 AdjacentGap 후보 생성
    cells_df = _inject_synthetic_gaps(cells_df, rng)

    # 공백 후보 탐지
    detector = AdjacentGapDetector()
    whitespace = detector.detect(
        cells_df=cells_df,
        paper_coords=coords,
    )

    # 빌드
    return build_artifacts(
        out_dir=Path(out_dir),
        cells_df=cells_df,
        coords_df=coords_df,
        papers_df=papers_df,
        cluster_labels=cluster_keywords,
        whitespace_top=whitespace,
        embedding_model="synthetic-fixture@v0",
        categories=["cs.CL"],
    )


def _synthesize_papers(
    n_papers: int,
    n_clusters: int,
    embedding_dim: int,
    rng: np.random.Generator,
    pyrand: Random,
) -> tuple[pl.DataFrame, np.ndarray, np.ndarray]:
    """클러스터 구조를 가진 합성 논문 + 임베딩 생성."""
    n_clusters = min(n_clusters, len(TOPIC_VOCABS))
    centers = rng.normal(0, 5, size=(n_clusters, embedding_dim))

    rows = []
    embeddings = []
    labels = []
    today = date.today()
    for i in range(n_papers):
        cid = i % n_clusters
        vocab = TOPIC_VOCABS[cid]
        emb = centers[cid] + rng.normal(0, 1, size=embedding_dim)
        embeddings.append(emb)
        labels.append(cid)

        title_words = pyrand.sample(vocab, k=min(3, len(vocab)))
        title = " ".join(w.title() for w in title_words) + f" (cluster {cid})"
        abstract_words = pyrand.choices(vocab, k=20) + pyrand.choices(
            ["model", "training", "dataset", "performance", "results", "method"], k=10
        )
        abstract = " ".join(abstract_words) + ". " + " ".join(pyrand.choices(vocab, k=15))

        days_back = pyrand.randint(0, 365 * 5)
        submitted = today - timedelta(days=days_back)

        rows.append({
            "arxiv_id": f"synth.{i:04d}",
            "title": title,
            "abstract": abstract,
            "authors": [f"Author {pyrand.randint(1, 999)}"],
            "categories": ["cs.CL"],
            "primary_category": "cs.CL",
            "submitted_date": submitted,
        })

    df = pl.DataFrame(rows)
    return df, np.array(embeddings), np.array(labels)


def _embeddings_to_2d(embeddings: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """합성 임베딩의 첫 2차원만 사용 (UMAP 생략 — 픽스처 빠른 빌드).

    실데이터에선 projection.fit_umap()을 사용.
    """
    coords = embeddings[:, :2].copy()
    coords += rng.normal(0, 0.3, coords.shape)
    return coords


def _inject_synthetic_gaps(cells_df: pl.DataFrame, rng: np.random.Generator) -> pl.DataFrame:
    """일부 클러스터 사이 공백을 인위적으로 보강 (AdjacentGap 후보 가시성)."""
    # 합성 fixture에서는 자연 발생 공백으로 충분 — 추가 조작 없이 반환.
    return cells_df
