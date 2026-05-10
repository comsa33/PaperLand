"""AdjacentGapDetector 기본 동작 검증."""

from __future__ import annotations

import polars as pl

from paperland.detectors import AdjacentGapDetector
from paperland.gridding import coords_to_h3


def _make_cells_df(rows):
    return pl.DataFrame(
        rows,
        schema={
            "cell_id": pl.Utf8,
            "paper_count": pl.Int64,
            "recent_count": pl.Int64,
            "centroid_x": pl.Float64,
            "centroid_y": pl.Float64,
            "top_keywords": pl.List(pl.Utf8),
            "dominant_category": pl.Utf8,
        },
    )


def test_empty_input_returns_empty():
    cells = _make_cells_df([])
    result = AdjacentGapDetector().detect(cells)
    assert result.is_empty()


def test_detector_finds_sparse_cell_surrounded_by_dense():
    # 인접한 hex 셀들을 만들기 위해 grid_disk 활용
    import h3

    center = coords_to_h3(0.0, 0.0)
    neighbors = list(h3.grid_disk(center, 1) - {center})

    rows = []
    # 중심 셀: 0 papers (sparse)
    rows.append({
        "cell_id": center,
        "paper_count": 0,
        "recent_count": 0,
        "centroid_x": 0.0,
        "centroid_y": 0.0,
        "top_keywords": [],
        "dominant_category": "cs.CL",
    })
    # 이웃 셀: 모두 dense
    for nc in neighbors:
        rows.append({
            "cell_id": nc,
            "paper_count": 20,
            "recent_count": 15,
            "centroid_x": 0.5,
            "centroid_y": 0.5,
            "top_keywords": ["transformer", "attention"],
            "dominant_category": "cs.CL",
        })

    cells = _make_cells_df(rows)
    result = AdjacentGapDetector().detect(cells)

    assert not result.is_empty()
    candidate_ids = result["cell_id"].to_list()
    assert center in candidate_ids
    assert result["score"][0] > 0
