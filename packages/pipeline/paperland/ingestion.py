"""arXiv 수집.

V0: 단발 수집 (전체 cs.CL 5년치).
V1+: OAI-PMH incremental harvest (`from=last_successful_harvest − overlap_window`).

이 모듈은 V0를 위한 최소 인터페이스만 제공.
실제 수집은 사용자 보유 `arxiv-paper-scraping` 프로젝트의 결과물을 입력으로 받거나,
또는 `httpx` 기반의 단순 페이지네이션 클라이언트를 사용할 수 있음.
"""

from __future__ import annotations

from pathlib import Path

import polars as pl

from .schemas import Paper


def load_papers_from_parquet(path: Path | str) -> pl.DataFrame:
    """기존 수집 결과(Parquet)에서 Papers DataFrame 로드."""
    df = pl.read_parquet(path)
    required = {"arxiv_id", "title", "abstract", "primary_category", "submitted_date"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"필수 컬럼 누락: {missing}")
    return df


def load_papers_from_jsonl(path: Path | str) -> pl.DataFrame:
    """JSONL에서 로드 (테스트/픽스처용)."""
    return pl.read_ndjson(path)


def validate_papers(df: pl.DataFrame) -> pl.DataFrame:
    """Pydantic Paper 스키마로 검증된 행만 통과시킴."""
    valid_rows = []
    for row in df.to_dicts():
        try:
            Paper(**row)
            valid_rows.append(row)
        except Exception:
            continue
    return pl.DataFrame(valid_rows)
