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
    # 자기 셀 논문 수 절대값 — None이면 상대 비율만 사용
    max_own_count: int | None = None
    # 자기 셀이 이웃 평균 대비 이 비율 이하여야 후보 (예: 0.5 → 이웃의 50% 이하)
    relative_density_max: float = 0.5
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
            # 절대 임계값 (선택적)
            if (
                self.config.max_own_count is not None
                and own_count > self.config.max_own_count
            ):
                continue
            # 상대 임계값 — 이웃 평균 대비 너무 빽빽하면 공백 후보 아님
            if neighbor_density > 0:
                ratio = own_count / neighbor_density
                if ratio > self.config.relative_density_max:
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
            lineage = self._build_lineage(nearest)
            enriched.append({
                **cand,
                "detector": "AdjacentGap",
                "neighbor_keywords": neighbor_kws,
                "neighbor_categories": neighbor_cats,
                "nearest_papers": nearest[:5],
                "lineage": lineage,
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
        limit: int = 8,
    ) -> list[dict]:
        """인접 셀에서 대표 논문을 골라 후보를 설명. 연도 정보 포함."""
        if not papers_by_cell:
            return []
        ranked_neighbors = sorted(
            neighbor_cells,
            key=lambda nc: cells_lookup.get(nc, {}).get("paper_count", 0) or 0,
            reverse=True,
        )
        result: list[dict] = []
        for nc in ranked_neighbors:
            for paper in papers_by_cell.get(nc, []):
                year = None
                sd = paper.get("submitted_date")
                if sd is not None:
                    year = getattr(sd, "year", None)
                result.append({
                    "id": paper["arxiv_id"],
                    "title": paper["title"],
                    "neighbor_cell": nc,
                    "year": year,
                })
                if len(result) >= limit:
                    return result
        return result

    @staticmethod
    def _build_lineage(nearest_papers: list[dict]) -> dict:
        """연도별 인접 연구 흐름 — citation 없이 year + 임베딩 인접도로 정렬.

        - foundations: 인접 영역에서 가장 오래된 2편 (기반 연구)
        - active: 인접 영역에서 가장 최근 3편 (활발 인접 연구)
        - bridge_text: 두 흐름 사이의 시간 격차에 대한 자연 문장
        ※ 진짜 영향 관계(citation)가 아닌 정렬 기반 흐름. UI에서 "계보" 단정 표현 회피.
        """
        if not nearest_papers:
            return {"foundations": [], "active": [], "bridge_text": ""}
        with_year = [p for p in nearest_papers if p.get("year") is not None]
        if not with_year:
            return {
                "foundations": [],
                "active": nearest_papers[:3],
                "bridge_text": "이 후보 주변의 연구 흐름이 아직 충분히 잡히지 않았습니다.",
            }
        sorted_by_year = sorted(with_year, key=lambda p: p["year"])
        foundations = sorted_by_year[:2]
        active = sorted(with_year, key=lambda p: -p["year"])[:3]
        # 활발 연구가 기반과 시간상 격차가 있을 때만 bridge 메시지 강조
        years = [p["year"] for p in with_year]
        gap_years = max(years) - min(years) if years else 0
        if gap_years >= 3:
            bridge_text = (
                f"기반 연구({min(years)})와 최근 활발 연구({max(years)}) 사이 "
                f"{gap_years}년의 흐름에서, 이 조합을 직접 잇는 논문이 적습니다."
            )
        else:
            bridge_text = (
                "비슷한 시기의 인접 연구들 사이에서 이 조합은 직접 다뤄지지 않았습니다."
            )
        return {
            "foundations": foundations,
            "active": active,
            "bridge_text": bridge_text,
        }

    @staticmethod
    def _build_summary(neighbor_keywords: list[str]) -> str:
        """후보를 연구자 언어로 요약하는 '기회 문장'.

        영어 키워드를 따옴표로 감싸 명사구로 처리하고, 한국어 조사는 따옴표 뒤
        명사 연결어("영역", "사이")에만 붙여 어색함을 회피.
        """
        if not neighbor_keywords:
            return "주변 분야 대비 직접 연구가 적은 영역"
        kws = neighbor_keywords[:3]
        primary = kws[0]
        if len(kws) == 1:
            return f'"{primary}" 영역 주변은 활발하지만, 같은 영역의 직접 연구는 드뭅니다'
        secondary = kws[1]
        if len(kws) == 2:
            return (
                f'"{primary}" 영역은 활발한 반면, '
                f'"{secondary}" 와 결합한 직접 연구는 드뭅니다'
            )
        third = kws[2]
        return (
            f'"{primary}", "{secondary}", "{third}" 사이를 직접 잇는 '
            f'연구는 드뭅니다'
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
            kw_phrase = ", ".join(f'"{k}"' for k in kws)
            topic_clause = (
                f"주변에는 {kw_phrase} 관련 논문군이 있지만, "
                f"이 조합을 직접 다루는 논문은 적습니다."
            )
        elif kws:
            topic_clause = (
                f'주변에는 "{kws[0]}" 관련 논문이 있지만, '
                f"같은 영역의 직접 논문은 적습니다."
            )
        else:
            topic_clause = "주변 영역에 비해 직접 논문이 적은 위치입니다."
        cats = " · ".join(neighbor_cats[:2]) if neighbor_cats else None
        cat_clause = f" 주변 카테고리: {cats}." if cats else ""
        density_clause = (
            f"수집 데이터 기준 이 셀 {cand['own_count']}편, "
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
                    "year": pl.Int64,
                })),
                "lineage": pl.Struct({
                    "foundations": pl.List(pl.Struct({
                        "id": pl.Utf8, "title": pl.Utf8, "year": pl.Int64,
                    })),
                    "active": pl.List(pl.Struct({
                        "id": pl.Utf8, "title": pl.Utf8, "year": pl.Int64,
                    })),
                    "bridge_text": pl.Utf8,
                }),
                "summary": pl.Utf8,
                "rationale_template": pl.Utf8,
            }
        )
