"""임베딩 (SPECTER2 기본).

V0: 배치 단발 임베딩.
V1+: content hash 기반 캐시.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import polars as pl

DEFAULT_MODEL = "allenai/specter2_base"


def _content_hash(title: str, abstract: str) -> str:
    text = f"{title}\n{abstract}".strip()
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def embed_papers(
    papers_df: pl.DataFrame,
    model_name: str = DEFAULT_MODEL,
    batch_size: int = 32,
    cache_dir: Path | str | None = None,
) -> tuple[np.ndarray, list[str]]:
    """논문을 임베딩하여 (matrix, arxiv_ids) 반환.

    Args:
        papers_df: [arxiv_id, title, abstract, ...]
        model_name: HF 모델 ID
        batch_size: 임베딩 배치 크기
        cache_dir: content hash 캐시 디렉토리 (선택)

    Returns:
        (embeddings: (N, D), arxiv_ids: list)
    """
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as e:
        raise ImportError(
            "sentence-transformers 가 필요합니다. `uv pip install sentence-transformers`"
        ) from e

    model = SentenceTransformer(model_name)
    texts = [
        f"{row['title']}\n{row['abstract']}" for row in papers_df.to_dicts()
    ]
    arxiv_ids = papers_df["arxiv_id"].to_list()

    # 캐시 미적용 단순 경로 (V0)
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=True,
        convert_to_numpy=True,
    )
    return embeddings, arxiv_ids
