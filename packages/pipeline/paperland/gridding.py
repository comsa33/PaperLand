"""h3 hex 격자화."""

from __future__ import annotations

from collections import Counter

import h3
import numpy as np
import polars as pl

# h3 셀 해상도 — V0는 cs.CL 단일 분야이므로 비교적 세밀하게.
# UMAP 2D 좌표 범위는 보통 [-15, 15] 정도 → 위도/경도로 매핑해 사용.
H3_RESOLUTION = 4


def coords_to_h3(x: float, y: float, resolution: int = H3_RESOLUTION) -> str:
    """UMAP 2D 좌표를 h3 셀 ID로 변환.

    UMAP 출력은 위도/경도가 아니지만, h3는 좌표를 위경도로만 받음.
    [-90, 90] × [-180, 180] 범위로 단순 클리핑하여 사용 (의미는 추상적 격자).
    """
    lat = float(np.clip(y, -89.9, 89.9))
    lng = float(np.clip(x, -179.9, 179.9))
    return h3.latlng_to_cell(lat, lng, resolution)


def assign_cells(coords_df: pl.DataFrame, resolution: int = H3_RESOLUTION) -> pl.DataFrame:
    """coords_df에 cell_id 컬럼 추가.

    Args:
        coords_df: 컬럼 [arxiv_id, x, y]
        resolution: h3 해상도

    Returns:
        [arxiv_id, x, y, cell_id]
    """
    cells = [
        coords_to_h3(x, y, resolution)
        for x, y in zip(coords_df["x"].to_list(), coords_df["y"].to_list())
    ]
    return coords_df.with_columns(pl.Series("cell_id", cells))


def aggregate_cells(
    papers_df: pl.DataFrame,
    coords_df: pl.DataFrame,
    keywords_per_paper: dict[str, list[str]] | None = None,
    recent_year_threshold: int | None = None,
) -> pl.DataFrame:
    """셀 단위 집계.

    Args:
        papers_df: [arxiv_id, primary_category, submitted_date]
        coords_df: [arxiv_id, x, y, cell_id]
        keywords_per_paper: arxiv_id → 키워드 리스트 (선택)
        recent_year_threshold: 이 연도 이후를 'recent'로 집계

    Returns:
        [cell_id, paper_count, recent_count, top_keywords, dominant_category, centroid_x, centroid_y]
    """
    df = coords_df.join(papers_df, on="arxiv_id", how="inner")

    # 셀별 집계
    cell_groups = df.group_by("cell_id")
    agg = cell_groups.agg(
        pl.len().alias("paper_count"),
        pl.col("x").mean().alias("centroid_x"),
        pl.col("y").mean().alias("centroid_y"),
        pl.col("primary_category").mode().first().alias("dominant_category"),
        pl.col("arxiv_id").alias("paper_ids"),
        pl.col("submitted_date").alias("dates"),
    )

    # recent_count 계산
    if recent_year_threshold is not None:
        recent_counts = []
        for dates in agg["dates"].to_list():
            recent_counts.append(sum(1 for d in dates if d.year >= recent_year_threshold))
        agg = agg.with_columns(pl.Series("recent_count", recent_counts))
    else:
        agg = agg.with_columns(pl.col("paper_count").alias("recent_count"))

    # top_keywords 계산
    top_keywords_col: list[list[str]] = []
    for paper_ids in agg["paper_ids"].to_list():
        if keywords_per_paper:
            kw_counter: Counter[str] = Counter()
            for pid in paper_ids:
                for kw in keywords_per_paper.get(pid, []):
                    kw_counter[kw] += 1
            top_keywords_col.append([kw for kw, _ in kw_counter.most_common(5)])
        else:
            top_keywords_col.append([])
    agg = agg.with_columns(pl.Series("top_keywords", top_keywords_col))

    return agg.drop(["paper_ids", "dates"])


def cell_neighbors(cell_id: str, k: int = 1) -> set[str]:
    """h3 k-ring 이웃 셀."""
    return set(h3.grid_disk(cell_id, k)) - {cell_id}
