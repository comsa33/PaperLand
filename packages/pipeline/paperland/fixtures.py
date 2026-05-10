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

# 합성 시 사용할 토픽 단어 풀 — 변별력 있는 도메인 어휘 (cs.CL 분위기)
TOPIC_VOCABS = [
    [
        "transformer architecture", "self attention", "positional encoding",
        "language model pretraining", "subword tokenization",
    ],
    [
        "retrieval augmented generation", "dense passage retrieval", "vector index",
        "knowledge grounding", "external memory",
    ],
    [
        "hallucination detection", "factual consistency", "claim verification",
        "uncertainty estimation", "self consistency",
    ],
    [
        "dialogue policy", "task oriented agent", "tool augmented llm",
        "agent planning", "react prompting",
    ],
    [
        "rlhf alignment", "preference learning", "reward modeling",
        "safety guardrail", "constitutional ai",
    ],
    [
        "vision language pretraining", "image captioning", "video understanding",
        "visual question answering", "multimodal grounding",
    ],
    [
        "model quantization", "knowledge distillation", "structured pruning",
        "speculative decoding", "kv cache compression",
    ],
    [
        "chain of thought reasoning", "math word problem", "symbolic reasoning",
        "program of thought", "self verification",
    ],
    [
        "benchmark construction", "human evaluation", "leaderboard contamination",
        "robustness probing", "adversarial nli",
    ],
    [
        "instruction tuning", "low rank adapter", "qlora finetuning",
        "parameter efficient transfer", "prompt tuning",
    ],
]

# 노이즈 단어는 토픽 변별을 흐리게 하므로 매우 적게.
NEUTRAL_FILLERS = ["empirical study", "ablation", "scalability", "case study"]


def generate_fixtures(
    out_dir: Path,
    n_papers: int = 600,
    n_clusters: int = 8,
    seed: int = 42,
    embedding_dim: int = 32,
) -> Manifest:
    """합성 논문으로 V0 artifact 생산.

    파라미터 기본값: 클러스터당 평균 ~75편 → 활발한 점유 영역과 명확한 빈 영역 대비.
    """
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
        embeddings, min_cluster_size=max(8, n_papers // (n_clusters * 3))
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

    # 공백 후보 탐지 — 인접 대표 논문 추출용 papers_with_coords 전달
    papers_with_coords = papers_df.select(["arxiv_id", "title"]).join(
        coords_df, on="arxiv_id", how="inner"
    )
    detector = AdjacentGapDetector()
    whitespace = detector.detect(
        cells_df=cells_df,
        paper_coords=coords,
        papers_with_coords=papers_with_coords,
    )

    # 클러스터 centroid 산출 — 지도 위 영역 라벨용
    cluster_centroids = _compute_cluster_centroids(coords_df, cluster_labels, papers_df)

    # 빌드
    return build_artifacts(
        out_dir=Path(out_dir),
        cells_df=cells_df,
        coords_df=coords_df,
        papers_df=papers_df,
        cluster_labels=cluster_keywords,
        cluster_centroids=cluster_centroids,
        whitespace_top=whitespace,
        embedding_model="synthetic-fixture@v0",
        categories=["cs.CL"],
    )


def _compute_cluster_centroids(
    coords_df: pl.DataFrame,
    cluster_labels_arr: np.ndarray,
    papers_df: pl.DataFrame,
) -> dict[int, dict[str, float]]:
    """각 클러스터의 (x, y) 중심점 — 지도 라벨 배치용."""
    arxiv_to_label = dict(zip(papers_df["arxiv_id"].to_list(), cluster_labels_arr))
    out: dict[int, dict[str, float]] = {}
    grouped: dict[int, list[tuple[float, float]]] = {}
    for row in coords_df.to_dicts():
        label = int(arxiv_to_label.get(row["arxiv_id"], -1))
        if label == -1:
            continue
        grouped.setdefault(label, []).append((row["x"], row["y"]))
    for cid, points in grouped.items():
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        out[cid] = {
            "x": float(sum(xs) / len(xs)),
            "y": float(sum(ys) / len(ys)),
            "count": len(points),
        }
    return out


def _synthesize_papers(
    n_papers: int,
    n_clusters: int,
    embedding_dim: int,
    rng: np.random.Generator,
    pyrand: Random,
) -> tuple[pl.DataFrame, np.ndarray, np.ndarray]:
    """클러스터 구조를 가진 합성 논문 + 임베딩 생성.

    중심은 첫 2차원에 원형 배치하여 2D 투영 후 명확한 영역 분리가 보이게 함.
    클러스터 사이는 비워두어 AdjacentGap detector가 명확한 후보를 잡도록 유도.
    """
    n_clusters = min(n_clusters, len(TOPIC_VOCABS))
    # 첫 2차원: 원형 배치 — h3 res3 격자 기준 클러스터들이 서로 1~3 셀 거리에 오도록
    # 가까이 두어, 사이 공백 셀이 명확한 "공백 후보"가 되게 함.
    radius = 4.0
    angles = np.linspace(0, 2 * np.pi, n_clusters, endpoint=False)
    centers = rng.normal(0, 0.5, size=(n_clusters, embedding_dim))
    centers[:, 0] = radius * np.cos(angles)
    centers[:, 1] = radius * np.sin(angles)

    rows = []
    embeddings = []
    labels = []
    today = date.today()
    for i in range(n_papers):
        cid = i % n_clusters
        vocab = TOPIC_VOCABS[cid]
        # 클러스터 내부는 매우 좁게 — 첫 2차원만 작은 노이즈로 hex 셀에 강하게 집중
        emb = centers[cid].copy()
        # 2D 좌표는 매우 좁게 — 클러스터당 1~3 hex 셀에 집중되어 명확한 영역화
        emb[:2] += rng.normal(0, 0.25, size=2)
        emb[2:] += rng.normal(0, 0.5, size=embedding_dim - 2)
        embeddings.append(emb)
        labels.append(cid)

        title_kws = pyrand.sample(vocab, k=min(2, len(vocab)))
        title = " ".join(kw.title() for kw in title_kws)
        # 합성 abstract는 클러스터 vocab만 사용 — c-TF-IDF가 일반 필러에 휘둘리지 않게.
        abstract = ". ".join(pyrand.choices(vocab, k=20)) + "."

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
