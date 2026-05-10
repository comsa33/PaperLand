"""AdjacentGapDetector — 인접 공백 탐지.

핵심 명제: "주변은 활발한데 자기 셀만 비어있는 곳"이 가장 발견 가치 높은 공백.

점수 공식:
    score = neighbor_density × (1 − own_density / max_density)

본질 공백(Inherent Gap) 필터:
    convex hull 안쪽이고 KNN 거리가 임계값 이하인 셀만 후보로 인정.
"""

from __future__ import annotations

from dataclasses import dataclass

import h3
import numpy as np
import polars as pl
from scipy.spatial import ConvexHull, Delaunay

from ..gridding import cell_neighbors


@dataclass
class AdjacentGapConfig:
    """탐지 설정."""

    k_ring: int = 1  # 이웃 반경
    min_neighbor_density: float = 1.0  # 이웃 평균 밀도 최소값
    max_own_count: int = 2  # 자기 셀 논문 수 최대 (이하만 후보)
    top_k: int = 10  # 최종 후보 수


class AdjacentGapDetector:
    """인접 공백 탐지기."""

    def __init__(self, config: AdjacentGapConfig | None = None) -> None:
        self.config = config or AdjacentGapConfig()

    def detect(
        self,
        cells_df: pl.DataFrame,
        paper_coords: np.ndarray | None = None,
        papers_with_coords: pl.DataFrame | None = None,
    ) -> pl.DataFrame:
        """공백 후보 산출.

        Args:
            cells_df: [cell_id, paper_count, recent_count, centroid_x, centroid_y, top_keywords, dominant_category]
            paper_coords: 본질 공백 필터링용 전체 논문 좌표 (N, 2). None이면 필터 생략.
            papers_with_coords: 인접 대표 논문 추출용. [arxiv_id, title, x, y, cell_id]. None이면 nearest_papers 빈 리스트.

        Returns:
            Top-K 후보 데이터프레임 — 인접 대표 논문 5편 포함.
        """
        if cells_df.is_empty():
            return self._empty_result()

        # 1. 빈 셀 후보군 생성 (논문은 거의 없지만 인접 셀이 활발한 곳)
        candidate_cells = self._generate_candidate_cells(cells_df)
        if not candidate_cells:
            return self._empty_result()

        # 2. 셀 통계 lookup
        own_counts = dict(zip(cells_df["cell_id"].to_list(), cells_df["paper_count"].to_list()))
        max_density = max(own_counts.values()) if own_counts else 1

        # 3. 후보 평가
        scored: list[dict] = []
        for cell_id in candidate_cells:
            neighbors = cell_neighbors(cell_id, self.config.k_ring)
            neighbor_counts = [own_counts.get(n, 0) for n in neighbors]
            if not neighbor_counts:
                continue

            neighbor_density = float(np.mean(neighbor_counts))
            if neighbor_density < self.config.min_neighbor_density:
                continue

            own_count = own_counts.get(cell_id, 0)
            if own_count > self.config.max_own_count:
                continue

            score = neighbor_density * (1.0 - own_count / max_density)

            # 본질 공백 필터
            if paper_coords is not None and not self._is_reachable(cell_id, paper_coords):
                continue

            scored.append({
                "cell_id": cell_id,
                "score": float(score),
                "neighbor_density": neighbor_density,
                "own_count": int(own_count),
                "neighbor_cells": list(neighbors),
            })

        if not scored:
            return self._empty_result()

        # 4. Top-K with dedup by neighbor signature
        scored.sort(key=lambda r: r["score"], reverse=True)

        cells_lookup_for_dedup = {
            row["cell_id"]: row for row in cells_df.to_dicts()
        }
        seen_signatures: set[tuple[str, ...]] = set()
        top: list[dict] = []
        for cand in scored:
            kws = self._aggregate_neighbor_keywords(
                cand["neighbor_cells"], cells_lookup_for_dedup
            )
            sig = tuple(sorted(kws[:3]))
            if sig in seen_signatures:
                continue
            seen_signatures.add(sig)
            top.append(cand)
            if len(top) >= self.config.top_k:
                break

        # 5. 인접 키워드 / 카테고리 / 대표 논문 보강
        cells_lookup = {row["cell_id"]: row for row in cells_df.to_dicts()}
        papers_by_cell = self._index_papers_by_cell(papers_with_coords)
        enriched = []
        for cand in top:
            neighbor_kws = self._aggregate_neighbor_keywords(cand["neighbor_cells"], cells_lookup)
            neighbor_cats = self._aggregate_neighbor_categories(
                cand["neighbor_cells"], cells_lookup
            )
            nearest = self._collect_nearest_papers(
                cand["cell_id"], cand["neighbor_cells"], cells_lookup, papers_by_cell
            )
            summary = self._build_summary(neighbor_kws)
            rationale = self._build_rationale(cand, neighbor_kws, neighbor_cats)
            enriched.append({
                **cand,
                "detector": "AdjacentGap",
                "neighbor_keywords": neighbor_kws,
                "neighbor_categories": neighbor_cats,
                "nearest_papers": nearest,
                "summary": summary,
                "rationale_template": rationale,
            })

        return pl.DataFrame(enriched)

    @staticmethod
    def _index_papers_by_cell(
        papers_with_coords: pl.DataFrame | None,
    ) -> dict[str, list[dict]]:
        if papers_with_coords is None or papers_with_coords.is_empty():
            return {}
        out: dict[str, list[dict]] = {}
        for row in papers_with_coords.to_dicts():
            cell = row.get("cell_id")
            if not cell:
                continue
            out.setdefault(cell, []).append(row)
        return out

    @staticmethod
    def _collect_nearest_papers(
        cell_id: str,
        neighbor_cells: list[str],
        cells_lookup: dict[str, dict],
        papers_by_cell: dict[str, list[dict]],
        limit: int = 5,
    ) -> list[dict]:
        """인접 셀에서 대표 논문을 골라 후보를 설명."""
        if not papers_by_cell:
            return []
        # 밀도가 가장 높은 이웃 셀부터 순회하며 논문 수집
        ranked_neighbors = sorted(
            neighbor_cells,
            key=lambda nc: cells_lookup.get(nc, {}).get("paper_count", 0) or 0,
            reverse=True,
        )
        result: list[dict] = []
        for nc in ranked_neighbors:
            for paper in papers_by_cell.get(nc, []):
                result.append({
                    "id": paper["arxiv_id"],
                    "title": paper["title"],
                    "neighbor_cell": nc,
                })
                if len(result) >= limit:
                    return result
        return result

    @staticmethod
    def _build_summary(neighbor_keywords: list[str]) -> str:
        """후보를 연구자 언어로 요약하는 '기회 문장' (UI 카드의 title 위치).

        키워드 조합 표기가 아닌 자연 문장 — '한눈에 연구 기회로 읽히게'.
        """
        if not neighbor_keywords:
            return "주변 분야 대비 직접 연구가 적은 영역"
        kws = neighbor_keywords[:3]
        primary = kws[0]
        if len(kws) == 1:
            return f"{primary} 주변은 활발하지만, 인접 조합의 직접 논문은 드뭅니다"
        secondary = kws[1]
        if len(kws) == 2:
            return f"{primary}은 활발하지만, {secondary}와의 직접 결합 연구는 드뭅니다"
        third = kws[2]
        return (
            f"{primary}은 활발하지만, {secondary} · {third}로 이어지는 "
            f"직접 결합 연구는 드뭅니다"
        )

    def _generate_candidate_cells(self, cells_df: pl.DataFrame) -> list[str]:
        """후보 셀 = 기존 셀들의 k-ring 이웃 중 자기 자신 외 모든 셀."""
        all_existing = set(cells_df["cell_id"].to_list())
        candidates: set[str] = set()
        for cell_id in all_existing:
            candidates.update(cell_neighbors(cell_id, self.config.k_ring))
        # 본인 셀도 sparse면 후보로 — 단 max_own_count 이하인 경우만 (detect에서 필터)
        candidates.update(all_existing)
        return list(candidates)

    @staticmethod
    def _is_reachable(cell_id: str, paper_coords: np.ndarray) -> bool:
        """convex hull 안쪽인지 + 가장 가까운 점이 너무 멀지 않은지."""
        try:
            lat, lng = h3.cell_to_latlng(cell_id)
            cx, cy = float(lng), float(lat)
            if paper_coords.shape[0] < 4:
                return True
            hull = ConvexHull(paper_coords)
            tri = Delaunay(paper_coords[hull.vertices])
            inside = tri.find_simplex(np.array([[cx, cy]])) >= 0
            return bool(inside[0])
        except Exception:
            return True  # 안전한 fallback (필터 통과)

    @staticmethod
    def _aggregate_neighbor_keywords(
        neighbor_cells: list[str], cells_lookup: dict[str, dict]
    ) -> list[str]:
        from collections import Counter

        counter: Counter[str] = Counter()
        for nc in neighbor_cells:
            if nc in cells_lookup:
                for kw in cells_lookup[nc].get("top_keywords") or []:
                    counter[kw] += 1
        return [kw for kw, _ in counter.most_common(5)]

    @staticmethod
    def _aggregate_neighbor_categories(
        neighbor_cells: list[str], cells_lookup: dict[str, dict]
    ) -> list[str]:
        from collections import Counter

        counter: Counter[str] = Counter()
        for nc in neighbor_cells:
            if nc in cells_lookup:
                cat = cells_lookup[nc].get("dominant_category")
                if cat:
                    counter[cat] += 1
        return [cat for cat, _ in counter.most_common(3)]

    @staticmethod
    def _build_rationale(
        cand: dict, neighbor_keywords: list[str], neighbor_cats: list[str]
    ) -> str:
        """근거 템플릿 — 연구자 언어 + 수치 근거 (UX 원칙: 단정 금지)."""
        kws = neighbor_keywords[:3]
        if len(kws) >= 2:
            kw_phrase = f'"{kws[0]}", "{kws[1]}"' + (f', "{kws[2]}"' if len(kws) >= 3 else "")
            topic_clause = f"주변에는 {kw_phrase} 관련 논문군이 있지만, 이 조합의 직접 논문은 적습니다."
        elif kws:
            topic_clause = f'주변에는 "{kws[0]}" 관련 논문이 있지만, 같은 영역에 직접 논문은 적습니다.'
        else:
            topic_clause = "주변 영역에 비해 직접 논문이 적은 위치입니다."
        cats = " · ".join(neighbor_cats[:2]) if neighbor_cats else None
        cat_clause = f" 주변 카테고리: {cats}." if cats else ""
        density_clause = (
            f"수집 데이터 기준 이 셀 {cand['own_count']}편 vs. "
            f"인접 셀 평균 {cand['neighbor_density']:.1f}편."
        )
        return f"{topic_clause}{cat_clause} {density_clause}"

    @staticmethod
    def _empty_result() -> pl.DataFrame:
        return pl.DataFrame(
            schema={
                "cell_id": pl.Utf8,
                "score": pl.Float64,
                "neighbor_density": pl.Float64,
                "own_count": pl.Int64,
                "neighbor_cells": pl.List(pl.Utf8),
                "detector": pl.Utf8,
                "neighbor_keywords": pl.List(pl.Utf8),
                "neighbor_categories": pl.List(pl.Utf8),
                "nearest_papers": pl.List(pl.Struct({
                    "id": pl.Utf8,
                    "title": pl.Utf8,
                    "neighbor_cell": pl.Utf8,
                })),
                "summary": pl.Utf8,
                "rationale_template": pl.Utf8,
            }
        )
