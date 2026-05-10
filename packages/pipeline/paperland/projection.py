"""차원축소 (UMAP 2D).

V0: 단발 fit.
V1+: 기존 reducer를 저장해두고 신규 논문에 transform()만 적용.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import polars as pl


def fit_umap(
    embeddings: np.ndarray,
    n_neighbors: int = 30,
    min_dist: float = 0.1,
    metric: str = "cosine",
    random_state: int = 42,
):
    """UMAP reducer를 학습하고 반환."""
    try:
        import umap
    except ImportError as e:
        raise ImportError("umap-learn 이 필요합니다.") from e
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        metric=metric,
        random_state=random_state,
    )
    reducer.fit(embeddings)
    return reducer


def project_to_2d(reducer, embeddings: np.ndarray) -> np.ndarray:
    """학습된 reducer로 2D 좌표 산출."""
    return reducer.transform(embeddings)


def coords_to_dataframe(arxiv_ids: list[str], coords: np.ndarray) -> pl.DataFrame:
    return pl.DataFrame({
        "arxiv_id": arxiv_ids,
        "x": coords[:, 0].astype(float),
        "y": coords[:, 1].astype(float),
    })


def save_reducer(reducer, path: Path | str) -> None:
    import joblib

    Path(path).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(reducer, path)


def load_reducer(path: Path | str):
    import joblib

    return joblib.load(path)
