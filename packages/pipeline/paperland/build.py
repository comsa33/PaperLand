"""V0 정적 artifact 빌드.

출력 (apps/web/public/data/ 또는 data/serving/):
  manifest.json
  cells.json
  papers_index.json
  cluster_labels.json
  whitespace_top10.json
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import polars as pl

from .schemas import Manifest


def _sha256_short(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode()).hexdigest()[:16]


def _write_json(path: Path, data: Any) -> str:
    """JSON 직렬화 + 체크섬 반환."""
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return _sha256_short(text)


def build_artifacts(
    out_dir: Path,
    cells_df: pl.DataFrame,
    coords_df: pl.DataFrame,
    papers_df: pl.DataFrame,
    cluster_labels: dict[int, list[str]],
    whitespace_top: pl.DataFrame,
    embedding_model: str,
    categories: list[str],
    map_epoch: str | None = None,
) -> Manifest:
    """V0 artifact 5종을 out_dir에 기록하고 manifest를 반환."""
    out_dir = Path(out_dir)
    map_epoch = map_epoch or datetime.now(timezone.utc).strftime("%Y-W%V")

    # 1. cells.json
    cells_payload = []
    for row in cells_df.to_dicts():
        cells_payload.append({
            "cell_id": row["cell_id"],
            "paper_count": int(row["paper_count"]),
            "recent_count": int(row["recent_count"]),
            "centroid_x": float(row["centroid_x"]),
            "centroid_y": float(row["centroid_y"]),
            "top_keywords": row.get("top_keywords") or [],
            "dominant_category": row.get("dominant_category"),
        })
    cells_checksum = _write_json(out_dir / "cells.json", cells_payload)

    # 2. papers_index.json — 슬림 인덱스 (필요 필드만)
    paper_lookup = {row["arxiv_id"]: row for row in papers_df.to_dicts()}
    papers_payload = []
    for coord in coords_df.to_dicts():
        meta = paper_lookup.get(coord["arxiv_id"])
        if not meta:
            continue
        papers_payload.append({
            "id": coord["arxiv_id"],
            "title": meta["title"],
            "x": float(coord["x"]),
            "y": float(coord["y"]),
            "cell_id": coord.get("cell_id"),
            "year": meta["submitted_date"].year if meta.get("submitted_date") else None,
            "category": meta.get("primary_category"),
        })
    papers_checksum = _write_json(out_dir / "papers_index.json", papers_payload)

    # 3. cluster_labels.json
    cluster_payload = {
        str(cid): {"keywords": kws[:10]} for cid, kws in cluster_labels.items()
    }
    clusters_checksum = _write_json(out_dir / "cluster_labels.json", cluster_payload)

    # 4. whitespace_top10.json
    ws_payload = []
    for row in whitespace_top.to_dicts():
        neighbor_kws = row.get("neighbor_keywords") or []
        ws_payload.append({
            "cell_id": row["cell_id"],
            "summary": row.get("summary") or "",
            "rationale": row["rationale_template"],
            "score": float(row["score"]),
            "detector": row["detector"],
            "neighbor_keywords": neighbor_kws,
            "neighbor_categories": row.get("neighbor_categories") or [],
            "nearest_papers": row.get("nearest_papers") or [],
            "own_count": int(row["own_count"]),
            "neighbor_density": float(row["neighbor_density"]),
            "suggested_queries": _build_suggested_queries(neighbor_kws),
        })
    ws_checksum = _write_json(out_dir / "whitespace_top10.json", ws_payload)

    # 5. manifest.json (마지막에 작성 — deploy switch)
    manifest = Manifest(
        map_epoch=map_epoch,
        embedding_model=embedding_model,
        categories=categories,
        paper_count=len(papers_payload),
        built_at=datetime.now(timezone.utc).isoformat(),
        artifact_checksums={
            "cells.json": cells_checksum,
            "papers_index.json": papers_checksum,
            "cluster_labels.json": clusters_checksum,
            "whitespace_top10.json": ws_checksum,
        },
    )
    _write_json(out_dir / "manifest.json", manifest.model_dump())
    return manifest


def _build_suggested_queries(keywords: list[str]) -> list[str]:
    """공백 영역 인접 키워드 기반 추가 검색 쿼리 (템플릿 — LLM 미사용, V0)."""
    if not keywords:
        return []
    base = keywords[:3]
    queries: list[str] = []
    if len(base) >= 2:
        queries.append(" ".join(base[:2]))
        queries.append(f"{base[0]} {base[1]} survey")
    if len(base) >= 3:
        queries.append(" ".join(base))
    return queries[:3]
