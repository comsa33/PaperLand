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
    cluster_centroids: dict[int, dict[str, float]] | None = None,
    map_epoch: str | None = None,
    primary_category: str | None = None,
) -> Manifest:
    """카테고리별 V0 artifact 빌드.

    구조:
      out_dir/                       (예: apps/web/public/data/cs-cl/)
        latest.json                  → {"epoch": "2026-W19"}
        2026-W19/                    실제 artifact (epoch별 immutable)
          manifest.json
          cells.json
          papers_index.json
          cluster_labels.json
          whitespace_top10.json

    동시에 out_dir.parent/catalog.json (예: apps/web/public/data/catalog.json)을
    갱신해 사용 가능한 데이터셋 목록을 노출.
    """
    out_dir = Path(out_dir)
    map_epoch = map_epoch or datetime.now(timezone.utc).strftime("%Y-W%V")
    epoch_dir = out_dir / map_epoch
    epoch_dir.mkdir(parents=True, exist_ok=True)

    # 1. cells.json — 각 셀에 neighbor_density / ratio 미리 계산해 두어
    #    UI가 "왜 공백 후보가 아닌가"를 설명할 수 있게 한다.
    from .gridding import cell_neighbors

    own_counts = {
        row["cell_id"]: int(row["paper_count"]) for row in cells_df.to_dicts()
    }
    cells_payload = []
    for row in cells_df.to_dicts():
        cell_id = row["cell_id"]
        nbr_ids = cell_neighbors(cell_id, k=1)
        nbr_counts = [own_counts.get(n, 0) for n in nbr_ids]
        neighbor_density = (
            float(sum(nbr_counts) / len(nbr_counts)) if nbr_counts else 0.0
        )
        own = int(row["paper_count"])
        ratio = own / neighbor_density if neighbor_density > 0 else None
        cells_payload.append({
            "cell_id": cell_id,
            "paper_count": own,
            "recent_count": int(row["recent_count"]),
            "centroid_x": float(row["centroid_x"]),
            "centroid_y": float(row["centroid_y"]),
            "top_keywords": row.get("top_keywords") or [],
            "dominant_category": row.get("dominant_category"),
            "neighbor_density": neighbor_density,
            "self_neighbor_ratio": ratio,
        })
    cells_checksum = _write_json(epoch_dir / "cells.json", cells_payload)

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
    papers_checksum = _write_json(epoch_dir / "papers_index.json", papers_payload)

    # 3. cluster_labels.json — 키워드 + centroid (지도 라벨용)
    raw_labels: dict[int, list[str]] = {
        cid: kws for cid, kws in cluster_labels.items() if kws
    }
    chosen_labels = _assign_unique_labels(raw_labels)
    cluster_payload: dict[str, dict[str, Any]] = {}
    for cid, kws in raw_labels.items():
        entry: dict[str, Any] = {
            "keywords": kws[:10],
            "label": chosen_labels.get(cid, _build_cluster_label(kws)),
        }
        if cluster_centroids and cid in cluster_centroids:
            entry["centroid_x"] = cluster_centroids[cid]["x"]
            entry["centroid_y"] = cluster_centroids[cid]["y"]
            entry["paper_count"] = int(cluster_centroids[cid].get("count", 0))
        cluster_payload[str(cid)] = entry
    clusters_checksum = _write_json(epoch_dir / "cluster_labels.json", cluster_payload)

    # 4. whitespace_top10.json
    ws_payload = []
    for row in whitespace_top.to_dicts():
        neighbor_kws = row.get("neighbor_keywords") or []
        lineage = row.get("lineage") or {
            "foundations": [],
            "active": [],
            "bridge_text": "",
            "bridge_text_ko": "",
            "bridge_text_en": "",
        }
        # 호환: 구버전 lineage에 ko/en 누락 시 보강
        lineage.setdefault("bridge_text_ko", lineage.get("bridge_text", ""))
        lineage.setdefault("bridge_text_en", "")
        summary_ko = row.get("summary_ko") or row.get("summary") or ""
        summary_en = row.get("summary_en") or ""
        rationale_ko = row.get("rationale_ko") or row.get("rationale_template") or ""
        rationale_en = row.get("rationale_en") or ""
        ws_payload.append({
            "cell_id": row["cell_id"],
            "summary": summary_ko,
            "summary_ko": summary_ko,
            "summary_en": summary_en,
            "rationale": rationale_ko,
            "rationale_ko": rationale_ko,
            "rationale_en": rationale_en,
            "score": float(row["score"]),
            "detector": row["detector"],
            "neighbor_keywords": neighbor_kws,
            "neighbor_categories": row.get("neighbor_categories") or [],
            "nearest_papers": row.get("nearest_papers") or [],
            "lineage": lineage,
            "own_count": int(row["own_count"]),
            "neighbor_density": float(row["neighbor_density"]),
            "coherence": float(row.get("coherence") or 0.0),
            "candidate_type": row.get("candidate_type") or "sparse_bridge",
            "suggested_queries": _build_suggested_queries(neighbor_kws),
        })
    ws_checksum = _write_json(epoch_dir / "whitespace_top10.json", ws_payload)

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
    _write_json(epoch_dir / "manifest.json", manifest.model_dump())

    # latest.json — 빌드 epoch 포인터 (immutable epoch dir + mutable latest 분리)
    _write_json(
        out_dir / "latest.json",
        {"epoch": map_epoch, "manifest": f"{map_epoch}/manifest.json"},
    )

    # catalog.json — 부모 디렉토리에서 데이터셋 인벤토리 갱신.
    if primary_category:
        _update_catalog(out_dir, primary_category, manifest)

    return manifest


def _update_catalog(category_dir: Path, primary: str, manifest: Manifest) -> None:
    """부모 디렉토리(예: apps/web/public/data/)의 catalog.json에 자기 항목 갱신."""
    data_root = category_dir.parent
    catalog_path = data_root / "catalog.json"
    catalog: dict[str, Any] = {"datasets": []}
    if catalog_path.exists():
        try:
            catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        except Exception:
            catalog = {"datasets": []}
    if "datasets" not in catalog or not isinstance(catalog["datasets"], list):
        catalog["datasets"] = []
    slug = category_dir.name  # 디렉토리 이름이 곧 slug (예: cs-cl)
    entry = {
        "primary": primary,
        "slug": slug,
        "label": primary,
        "epoch": manifest.map_epoch,
        "paper_count": manifest.paper_count,
        "embedding_model": manifest.embedding_model,
        "categories": list(manifest.categories),
        "built_at": manifest.built_at,
    }
    # 기존 같은 primary가 있으면 교체, 없으면 추가
    replaced = False
    new_list: list[dict[str, Any]] = []
    for d in catalog["datasets"]:
        if isinstance(d, dict) and d.get("primary") == primary:
            new_list.append(entry)
            replaced = True
        else:
            new_list.append(d)
    if not replaced:
        new_list.append(entry)
    catalog["datasets"] = new_list
    catalog["updated_at"] = datetime.now(timezone.utc).isoformat()
    _write_json(catalog_path, catalog)


def _build_cluster_label(keywords: list[str]) -> str:
    """클러스터를 한눈에 식별할 짧은 영역 라벨 (지도 위 텍스트)."""
    if not keywords:
        return ""
    # 다어 구문 우선 → 짧고 의미적
    multiword = [k for k in keywords if " " in k]
    pick = multiword[0] if multiword else keywords[0]
    return _titlecase(pick)


def _titlecase(s: str) -> str:
    return " ".join(w.capitalize() for w in s.split())


def _assign_unique_labels(cluster_keywords: dict[int, list[str]]) -> dict[int, str]:
    """클러스터 라벨이 서로 중복되지 않게 키워드 후보를 차례로 시도.

    동일한 1순위 라벨이 두 클러스터에서 나오면, 2순위·3순위 후보로 내려간다.
    필요하면 1·2순위를 결합해 변별력을 확보 (예: "Knowledge Grounding").
    """
    used: set[str] = set()
    chosen: dict[int, str] = {}
    # 클러스터 사이즈가 큰 순으로 우선 배정 (큰 영역이 우선 라벨 선점)
    order = sorted(
        cluster_keywords.keys(),
        key=lambda c: -len(cluster_keywords[c]),
    )
    for cid in order:
        kws = cluster_keywords[cid]
        candidates = [k for k in kws if " " in k] + [k for k in kws if " " not in k]
        picked: str | None = None
        for cand in candidates:
            label = _titlecase(cand)
            if label not in used:
                picked = label
                break
        if picked is None:
            # 1·2위 결합 — 마지막 fallback
            base = _titlecase(candidates[0]) if candidates else f"Cluster {cid}"
            second = _titlecase(candidates[1]) if len(candidates) > 1 else ""
            picked = f"{base} · {second}".strip(" · ")
            i = 2
            while picked in used and i < len(candidates):
                picked = f"{base} · {_titlecase(candidates[i])}"
                i += 1
        used.add(picked)
        chosen[cid] = picked
    return chosen


def _build_suggested_queries(keywords: list[str]) -> list[str]:
    """인접 키워드 기반 검색 쿼리 — phrase는 그대로 보존, 키워드 자체만 중복 제거.

    예) ['fine tuning', 'prompt tuning', 'speculative decoding']
        → 'fine tuning prompt tuning',
           'fine tuning prompt tuning survey',
           'fine tuning prompt tuning speculative decoding'

    이전 word-level dedup이 'fine tuning prompt tuning' → 'fine tuning prompt'로
    줄여 phrase가 깨지던 문제 수정.
    """
    if not keywords:
        return []
    # 약한 라벨 (지나치게 일반적이거나 c-TF-IDF 노이즈)
    weak = {
        "large language",
        "language llms",
        "language language",
        "sequence sequence",
        "state art",
        "real world",
        "open source",
        "low rank",
        "case study",
    }
    pruned = [k for k in keywords if k.lower().strip() not in weak]
    base = pruned[:3] if pruned else keywords[:3]

    queries: list[str] = []
    if len(base) >= 2:
        queries.append(f"{base[0]} {base[1]}")
        queries.append(f"{base[0]} {base[1]} survey")
    if len(base) >= 3:
        queries.append(f"{base[0]} {base[1]} {base[2]}")
    # query-level dedup
    out: list[str] = []
    seen_q: set[str] = set()
    for q in queries:
        if q not in seen_q:
            out.append(q)
            seen_q.add(q)
    return out[:3]
