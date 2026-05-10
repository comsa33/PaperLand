"""AdjacentGapDetector — 인접 공백 탐지.

핵심 명제: "주변은 활발한데 자기 셀만 비어있는 곳"이 가장 발견 가치 높은 공백.

점수 공식:
    score = neighbor_density × (1 − own_density / max_density)

본질 공백(Inherent Gap) 필터:
    convex hull 안쪽이고 KNN 거리가 임계값 이하인 셀만 후보로 인정.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import h3
import numpy as np
import polars as pl
from scipy.spatial import ConvexHull, Delaunay

from ..gridding import cell_neighbors

# ──────────────────── 키워드 → 연구 질문 변환 ────────────────────
# cs.CL 분야의 핵심 용어를 method / domain / task / model 4가지로 분류
# 그 위에서 자연어 연구 질문 문장을 합성. (LLM 미사용, 템플릿 기반)
_METHOD_KEYWORDS = {
    "fine tuning", "instruction tuning", "lora", "qlora", "rlhf", "alignment",
    "preference learning", "reward modeling", "prompt tuning", "in context",
    "chain of thought", "self consistency", "self correction", "verification",
    "self verification", "claim verification", "retrieval", "rag",
    "retrieval augmented", "dense passage retrieval", "vector index",
    "knowledge distillation", "quantization", "model quantization",
    "structured pruning", "speculative decoding", "kv cache",
    "kv cache compression", "constitutional ai",
}
_DOMAIN_KEYWORDS = {
    "knowledge graphs", "knowledge graph", "knowledge editing", "social media",
    "fake news", "hate speech", "peer review", "code switching",
    "speech recognition", "sign language", "low resource", "multilingual",
    "cross lingual", "medical", "clinical", "legal", "biomedical",
    "scientific", "mathematical", "code generation", "coding agents",
    "agent systems", "ai agents",
}
_TASK_KEYWORDS = {
    "question answering", "summarization", "machine translation",
    "named entity recognition", "sentiment classification", "sentiment analysis",
    "text classification", "dialogue systems", "dialogue", "reasoning",
    "math word problem", "symbolic reasoning", "image captioning",
    "video understanding", "visual question answering",
    "multimodal grounding", "translation", "parsing",
}
_MODEL_KEYWORDS = {
    "transformer", "transformers", "language model", "language models",
    "large language", "large language model", "language llms", "llms",
    "llm", "vision language", "multimodal", "agent", "agents",
}


def _phrase_signature(phrase: str) -> str:
    """phrase를 단복수/공백/대소문자에 둔감한 signature로 변환.

    'Medical Image' / 'medical images' / 'medical image' 모두 같은 sig.
    각 단어의 끝 's'를 (4자 이상에서) 제거 — 보수적인 plural 룰.
    'class' 같은 짧은 단어는 끝 's' 보존.
    """
    parts = []
    for w in phrase.lower().split():
        w = w.strip()
        if len(w) >= 4 and w.endswith("ies"):
            w = w[:-3] + "y"
        elif len(w) >= 4 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        if w:
            parts.append(w)
    return " ".join(parts)


def _classify_keyword(kw: str) -> str:
    """키워드를 method / domain / task / model / unknown 중 하나로 분류.

    1) 사전 정확 매칭
    2) 부분 문자열 매칭
    3) 어휘 패턴 휴리스틱 (접미사·키워드)
    """
    norm = kw.lower().strip()

    # 1) 사전 정확 매칭
    if norm in _MODEL_KEYWORDS:
        return "model"
    if norm in _METHOD_KEYWORDS:
        return "method"
    if norm in _DOMAIN_KEYWORDS:
        return "domain"
    if norm in _TASK_KEYWORDS:
        return "task"

    # 2) 부분 문자열 매칭
    if any(t in norm for t in ("language model", "llm", "large language")):
        return "model"
    if any(t in norm for t in _METHOD_KEYWORDS):
        return "method"
    if any(t in norm for t in _DOMAIN_KEYWORDS):
        return "domain"
    if any(t in norm for t in _TASK_KEYWORDS):
        return "task"

    # 3) 어휘 패턴
    if any(
        s in norm
        for s in (
            "answering", "classification", "translation", "generation",
            "summarization", "captioning", "parsing", "detection",
            "extraction", "tagging", "completion", "evaluation",
        )
    ):
        return "task"
    if any(
        s in norm
        for s in (
            "tuning", "distillation", "decoding", "alignment", "retrieval",
            "verification", "consistency", "reasoning", "prompting",
            "reflection", "augmentation",
        )
    ):
        return "method"
    if any(
        s in norm
        for s in (
            "data", "dataset", "domain", "graph", "speech", "media",
            "language", "code", "benchmark", "review", "switching",
            "traces", "trace",
        )
    ):
        return "domain"
    return "unknown"


def _dedup_roles(kws: list[str], roles: list[str]) -> tuple[list[str], list[str]]:
    """같은 role(특히 model)이 중복되면 첫 것만 유지하여 변별력 확보."""
    out_kws: list[str] = []
    out_roles: list[str] = []
    seen_roles: set[str] = set()
    for k, r in zip(kws, roles):
        # model 중복은 첫 것만 (나머지는 unknown으로 강등해 메시지에 안 쓰이게)
        if r == "model" and "model" in seen_roles:
            continue
        out_kws.append(k)
        out_roles.append(r)
        if r != "unknown":
            seen_roles.add(r)
    return out_kws, out_roles


def _compose_question_en(kws: list[str], roles: list[str]) -> str | None:
    """역할 시퀀스 → 영문 연구 질문 (한국어 패턴과 1:1 대응)."""
    if not kws:
        return None
    role_set = set(roles)

    def quoted(k: str) -> str:
        return f'"{k}"'

    if {"model", "domain", "task"}.issubset(role_set):
        m = next(k for k, r in zip(kws, roles) if r == "model")
        d = next(k for k, r in zip(kws, roles) if r == "domain")
        t = next(k for k, r in zip(kws, roles) if r == "task")
        return (
            f"While {quoted(m)} approaches are active in the {quoted(d)} area, "
            f"directly tying them to {quoted(t)} is relatively under-studied."
        )
    if {"model", "domain"} == role_set or (
        {"model", "domain"}.issubset(role_set) and "task" not in role_set
    ):
        m = next(k for k, r in zip(kws, roles) if r == "model")
        d = next(k for k, r in zip(kws, roles) if r == "domain")
        extras = [k for k, r in zip(kws, roles) if r not in {"model", "domain"}]
        extra_clause = (
            f" (incl. {', '.join(quoted(e) for e in extras)})" if extras else ""
        )
        return (
            f"Direct combinations of {quoted(m)} with the {quoted(d)} area"
            f"{extra_clause} are relatively under-studied."
        )
    if {"method", "domain"}.issubset(role_set):
        meth = next(k for k, r in zip(kws, roles) if r == "method")
        d = next(k for k, r in zip(kws, roles) if r == "domain")
        return (
            f"While {quoted(meth)} is active, applying it directly to the "
            f"{quoted(d)} area is relatively under-studied."
        )
    if {"method", "task"}.issubset(role_set):
        meth = next(k for k, r in zip(kws, roles) if r == "method")
        t = next(k for k, r in zip(kws, roles) if r == "task")
        return (
            f"Tackling {quoted(t)} directly with {quoted(meth)} is "
            f"relatively under-studied."
        )
    if {"domain", "task"}.issubset(role_set):
        d = next(k for k, r in zip(kws, roles) if r == "domain")
        t = next(k for k, r in zip(kws, roles) if r == "task")
        return (
            f"Tackling {quoted(t)} directly within the {quoted(d)} area is "
            f"relatively under-studied."
        )
    if {"model", "task"}.issubset(role_set):
        m = next(k for k, r in zip(kws, roles) if r == "model")
        t = next(k for k, r in zip(kws, roles) if r == "task")
        return (
            f"Using {quoted(m)} to tackle {quoted(t)} directly is "
            f"relatively under-studied."
        )
    if "model" in role_set and len(kws) >= 2:
        m = next(k for k, r in zip(kws, roles) if r == "model")
        others = [k for k, r in zip(kws, roles) if r != "model"]
        if others:
            others_phrase = ", ".join(quoted(o) for o in others[:2])
            return (
                f"Direct combinations of {quoted(m)} with {others_phrase} are "
                f"relatively under-studied."
            )
    domain_kws = [k for k, r in zip(kws, roles) if r == "domain"]
    if len(domain_kws) >= 2:
        return (
            f"Direct bridges between {quoted(domain_kws[0])} and "
            f"{quoted(domain_kws[1])} are relatively under-studied."
        )
    return None


def _compose_question(kws: list[str], roles: list[str]) -> str | None:
    """역할 시퀀스를 보고 연구 질문 문장을 합성. 매칭 실패 시 None."""
    if not kws:
        return None
    role_set = set(roles)

    def quoted(k: str) -> str:
        return f'"{k}"'

    # 패턴 A: model + domain + task → "{model}이 {domain}에 쓰이지만, 이 위에서 {task}의 직접 연구는 적음"
    if {"model", "domain", "task"}.issubset(role_set):
        m = next(k for k, r in zip(kws, roles) if r == "model")
        d = next(k for k, r in zip(kws, roles) if r == "domain")
        t = next(k for k, r in zip(kws, roles) if r == "task")
        return (
            f"{quoted(m)} 기반 접근이 {quoted(d)} 영역에서 활발한 반면, "
            f"이를 {quoted(t)}로 직접 연결하는 연구는 상대적으로 적습니다."
        )

    # 패턴 B: model + domain → "{model}을 {domain}에 직접 적용하는 연구가 적음"
    if {"model", "domain"} == role_set or (
        {"model", "domain"}.issubset(role_set) and "task" not in role_set
    ):
        m = next(k for k, r in zip(kws, roles) if r == "model")
        d = next(k for k, r in zip(kws, roles) if r == "domain")
        extras = [k for k, r in zip(kws, roles) if r not in {"model", "domain"}]
        extra_clause = f" ({', '.join(quoted(e) for e in extras)} 측면 포함)" if extras else ""
        return (
            f"{quoted(m)}을 {quoted(d)} 영역에 직접 결합하는 연구가{extra_clause} "
            f"상대적으로 적습니다."
        )

    # 패턴 C: method + domain → "{method}가 {domain}에 활발하지만, 직접 결합 연구가 적음"
    if {"method", "domain"}.issubset(role_set):
        meth = next(k for k, r in zip(kws, roles) if r == "method")
        d = next(k for k, r in zip(kws, roles) if r == "domain")
        return (
            f"{quoted(meth)} 기법이 활발한 반면, 이를 {quoted(d)} 영역에 "
            f"직접 적용하는 연구는 상대적으로 적습니다."
        )

    # 패턴 D: method + task → "{method}로 {task}를 직접 다루는 연구가 적음"
    if {"method", "task"}.issubset(role_set):
        meth = next(k for k, r in zip(kws, roles) if r == "method")
        t = next(k for k, r in zip(kws, roles) if r == "task")
        return (
            f"{quoted(meth)}로 {quoted(t)}를 직접 다루는 연구가 상대적으로 적습니다."
        )

    # 패턴 E: domain + task → "{domain}에서 {task}를 직접 다루는 연구가 적음"
    if {"domain", "task"}.issubset(role_set):
        d = next(k for k, r in zip(kws, roles) if r == "domain")
        t = next(k for k, r in zip(kws, roles) if r == "task")
        return (
            f"{quoted(d)} 영역에서 {quoted(t)}를 직접 다루는 연구가 "
            f"상대적으로 적습니다."
        )

    # 패턴 F: model + task → "{model}로 {task}를 직접 다루는 연구가 적음"
    if {"model", "task"}.issubset(role_set):
        m = next(k for k, r in zip(kws, roles) if r == "model")
        t = next(k for k, r in zip(kws, roles) if r == "task")
        return (
            f"{quoted(m)}을 활용해 {quoted(t)}를 직접 다루는 연구가 "
            f"상대적으로 적습니다."
        )

    # 패턴 G: model 단독 + 나머지 → "{model}을 다른 영역에 직접 결합하는 연구가 적음"
    if "model" in role_set and len(kws) >= 2:
        m = next(k for k, r in zip(kws, roles) if r == "model")
        others = [k for k, r in zip(kws, roles) if r != "model"]
        if others:
            others_phrase = ", ".join(quoted(o) for o in others[:2])
            return (
                f"{quoted(m)}을 {others_phrase} 측면에 직접 결합하는 연구가 "
                f"상대적으로 적습니다."
            )

    # 패턴 H: domain 둘 이상 → "{domain1}과 {domain2}를 직접 잇는 연구가 적음"
    domain_kws = [k for k, r in zip(kws, roles) if r == "domain"]
    if len(domain_kws) >= 2:
        return (
            f"{quoted(domain_kws[0])}과 {quoted(domain_kws[1])}를 직접 잇는 "
            f"연구가 상대적으로 적습니다."
        )

    return None



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

            # 본질 공백 필터 — own_count > 0이면 이미 도달된 영역이므로 통과.
            # (논문이 있는데 reachability에서 떨어지는 건 논리적 모순이라 사용자 신뢰가 깎임.)
            if (
                own_count == 0
                and paper_coords is not None
                and not self._is_reachable(cell_id, paper_coords)
            ):
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
                cand["cell_id"],
                cand["neighbor_cells"],
                neighbor_kws,
                cells_lookup,
                papers_by_cell,
            )
            # coherence 평균 — 키워드와 인접 논문 제목의 의미 정합도
            coh_vals = [int(p.get("coherence") or 0) for p in nearest[:5]]
            avg_coherence = (sum(coh_vals) / len(coh_vals)) if coh_vals else 0.0
            # 정합도가 너무 낮으면 후보 자체를 신뢰할 수 없으므로 제외
            # (대표 논문 5편 평균이 1단어도 안 겹치는 후보는 키워드 노이즈일 가능성 큼)
            if nearest and avg_coherence < 0.6:
                continue
            summary_ko, summary_en = self._build_summary_pair(neighbor_kws)
            rationale_ko, rationale_en = self._build_rationale_pair(
                cand, neighbor_kws, neighbor_cats
            )
            lineage = self._build_lineage(nearest)
            enriched.append({
                **cand,
                "detector": "AdjacentGap",
                "neighbor_keywords": neighbor_kws,
                "neighbor_categories": neighbor_cats,
                "nearest_papers": nearest[:12],
                "lineage": lineage,
                "summary": summary_ko,
                "summary_ko": summary_ko,
                "summary_en": summary_en,
                "rationale_template": rationale_ko,
                "rationale_ko": rationale_ko,
                "rationale_en": rationale_en,
                "coherence": float(avg_coherence),
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
    def _coherence(title: str, kw_tokens: set[str]) -> int:
        """후보 키워드 토큰과 논문 제목 단어의 교집합 크기."""
        if not title:
            return 0
        title_tokens = set(re.findall(r"\b[a-z]{3,}\b", title.lower()))
        return len(title_tokens & kw_tokens)

    @staticmethod
    def _kw_token_set(neighbor_keywords: list[str]) -> set[str]:
        out: set[str] = set()
        for kw in neighbor_keywords:
            for t in kw.lower().split():
                if len(t) >= 3:
                    out.add(t)
        return out

    @classmethod
    def _collect_nearest_papers(
        cls,
        cell_id: str,
        neighbor_cells: list[str],
        neighbor_keywords: list[str],
        cells_lookup: dict[str, dict],
        papers_by_cell: dict[str, list[dict]],
        limit: int = 12,
    ) -> list[dict]:
        """인접 셀에서 대표 논문을 골라 후보를 설명.

        수집 → coherence(키워드와의 제목 토큰 겹침) 우선 + 연도/셀 다양성 결합.
        """
        if not papers_by_cell:
            return []
        kw_tokens = cls._kw_token_set(neighbor_keywords)

        def to_node(paper: dict, nc: str) -> dict:
            sd = paper.get("submitted_date")
            year = getattr(sd, "year", None) if sd is not None else None
            title = paper["title"]
            return {
                "id": paper["arxiv_id"],
                "title": title,
                "neighbor_cell": nc,
                "year": year,
                "coherence": cls._coherence(title, kw_tokens),
            }

        # 모든 후보 paper를 수집한 뒤 coherence DESC + paper_count DESC + year DESC로 정렬.
        # 그 후 (셀, 연도) 다양성 보존하며 limit 까지 채움.
        all_nodes: list[dict] = []
        for nc in neighbor_cells:
            cell_count = cells_lookup.get(nc, {}).get("paper_count", 0) or 0
            for paper in papers_by_cell.get(nc, []):
                node = to_node(paper, nc)
                node["_cell_count"] = cell_count
                all_nodes.append(node)
        all_nodes.sort(
            key=lambda n: (
                -int(n.get("coherence") or 0),
                -int(n.get("_cell_count") or 0),
                -int(n.get("year") or 0),
            )
        )

        result: list[dict] = []
        seen_ids: set[str] = set()
        seen_year_per_cell: dict[str, set[int]] = {}
        # 1차 패스: 다양성 (셀 × 연도) 보존하며 coherence 큰 순서로 채움
        for n in all_nodes:
            cell = n["neighbor_cell"]
            yr = n.get("year")
            if yr is not None:
                seen = seen_year_per_cell.setdefault(cell, set())
                if yr in seen:
                    continue
                seen.add(int(yr))
            if n["id"] in seen_ids:
                continue
            seen_ids.add(n["id"])
            n.pop("_cell_count", None)
            result.append(n)
            if len(result) >= limit:
                return result
        # 2차 패스: 부족하면 다양성 무시하고 채움
        for n in all_nodes:
            if n["id"] in seen_ids:
                continue
            seen_ids.add(n["id"])
            n.pop("_cell_count", None)
            result.append(n)
            if len(result) >= limit:
                return result
        return result

    @staticmethod
    def _build_lineage(nearest_papers: list[dict]) -> dict:
        """연도별 인접 연구 흐름 — citation 없이 year + 임베딩 인접도로 정렬.

        - foundations: 인접 영역에서 가장 오래된 2편 (기반 연구)
        - active: 인접 영역에서 가장 최근 3편 (활발 인접 연구)
        - bridge_text / bridge_text_ko / bridge_text_en: 시간 격차 해석 문장
        ※ 진짜 영향 관계(citation)가 아닌 정렬 기반 흐름. UI에서 "계보" 단정 표현 회피.
        """
        empty = {
            "foundations": [],
            "active": [],
            "bridge_text": "",
            "bridge_text_ko": "",
            "bridge_text_en": "",
        }
        if not nearest_papers:
            return empty
        with_year = [p for p in nearest_papers if p.get("year") is not None]
        if not with_year:
            ko = "이 후보 주변의 연구 흐름이 아직 충분히 잡히지 않았습니다."
            en = "Surrounding research flow is not yet rich enough to chart."
            return {
                "foundations": [],
                "active": nearest_papers[:3],
                "bridge_text": ko,
                "bridge_text_ko": ko,
                "bridge_text_en": en,
            }
        def slim(p: dict) -> dict:
            return {"id": p["id"], "title": p["title"], "year": p.get("year")}

        sorted_by_year = sorted(with_year, key=lambda p: p["year"])
        foundations = [slim(p) for p in sorted_by_year[:2]]
        active = [slim(p) for p in sorted(with_year, key=lambda p: -p["year"])[:3]]
        years = [p["year"] for p in with_year]
        gap_years = max(years) - min(years) if years else 0
        n_total = len(with_year)
        if gap_years >= 3:
            ko = (
                f"기반 연구({min(years)})와 최근 활발 연구({max(years)}) 사이 "
                f"{gap_years}년 동안 인접 영역 {n_total}편이 쌓였지만, "
                f"이 두 흐름을 직접 잇는 연구는 이 셀에서 상대적으로 드뭅니다."
            )
            en = (
                f"Across the {gap_years}-year span from foundations ({min(years)}) "
                f"to recent active work ({max(years)}), {n_total} adjacent papers "
                f"accumulate — papers directly bridging the two flows remain "
                f"underexplored in this cell."
            )
        else:
            ko = (
                f"비슷한 시기({min(years)}–{max(years)})의 인접 연구 {n_total}편 "
                f"사이에서, 이 조합을 직접 다룬 연구는 상대적으로 드뭅니다."
            )
            en = (
                f"Among {n_total} contemporaneous adjacent papers "
                f"({min(years)}–{max(years)}), direct bridges remain underexplored."
            )
        return {
            "foundations": foundations,
            "active": active,
            "bridge_text": ko,
            "bridge_text_ko": ko,
            "bridge_text_en": en,
        }

    @classmethod
    def _build_summary_pair(
        cls, neighbor_keywords: list[str]
    ) -> tuple[str, str]:
        """(ko, en) 한국어/영어 연구 질문 문장 쌍 생성."""
        if not neighbor_keywords:
            return (
                "주변 분야 대비 직접 연구가 적은 영역입니다",
                "An area with relatively few direct studies versus its surroundings.",
            )
        kws_raw = neighbor_keywords[:5]
        roles_raw = [_classify_keyword(k) for k in kws_raw]
        kws, roles = _dedup_roles(kws_raw, roles_raw)
        kws, roles = kws[:3], roles[:3]
        ko = _compose_question(kws, roles) or cls._fallback_summary_ko(kws)
        en = _compose_question_en(kws, roles) or cls._fallback_summary_en(kws)
        return ko, en

    @classmethod
    def _build_summary(cls, neighbor_keywords: list[str]) -> str:
        """단일 한국어 summary (backward compatibility)."""
        ko, _ = cls._build_summary_pair(neighbor_keywords)
        return ko

    @staticmethod
    def _fallback_summary_ko(kws: list[str]) -> str:
        if len(kws) == 1:
            return f'"{kws[0]}" 영역 주변은 활발하지만, 같은 영역의 직접 연구는 드뭅니다'
        if len(kws) == 2:
            return (
                f'"{kws[0]}" 영역은 활발한 반면, '
                f'"{kws[1]}" 와 결합한 직접 연구는 드뭅니다'
            )
        return (
            f'"{kws[0]}", "{kws[1]}", "{kws[2]}" 사이를 직접 잇는 '
            f"연구는 드뭅니다"
        )

    @staticmethod
    def _fallback_summary_en(kws: list[str]) -> str:
        if len(kws) == 1:
            return (
                f'Activity around "{kws[0]}" exists, but direct studies in the '
                f"same area are sparse."
            )
        if len(kws) == 2:
            return (
                f'While "{kws[0]}" is active, direct combinations with '
                f'"{kws[1]}" are relatively under-studied.'
            )
        return (
            f'Direct bridges across "{kws[0]}", "{kws[1]}", "{kws[2]}" '
            f"are relatively under-studied."
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
        """이웃 셀들의 top_keywords를 합산. 단복수 정규화로 'medical image' /
        'medical images' 같은 near-duplicate가 두 번 들어가지 않게 한다.
        """
        from collections import Counter

        # surface 형태별 카운트
        surface_counter: Counter[str] = Counter()
        for nc in neighbor_cells:
            if nc in cells_lookup:
                for kw in cells_lookup[nc].get("top_keywords") or []:
                    surface_counter[kw] += 1

        # signature 별 합산 + 가장 자주 나오는 surface 형태 선택
        sig_to_surfaces: dict[str, Counter[str]] = {}
        sig_total: Counter[str] = Counter()
        for surface, c in surface_counter.items():
            sig = _phrase_signature(surface)
            sig_to_surfaces.setdefault(sig, Counter())[surface] += c
            sig_total[sig] += c

        result: list[str] = []
        for sig, _ in sig_total.most_common():
            # 같은 signature 안에서는 가장 자주 나온 surface 채택
            best_surface = sig_to_surfaces[sig].most_common(1)[0][0]
            result.append(best_surface)
            if len(result) >= 5:
                break
        return result

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

    @classmethod
    def _build_rationale_pair(
        cls,
        cand: dict,
        neighbor_keywords: list[str],
        neighbor_cats: list[str],
    ) -> tuple[str, str]:
        """근거 템플릿 — (ko, en) 쌍."""
        kws = neighbor_keywords[:3]
        if len(kws) >= 2:
            kw_phrase = ", ".join(f'"{k}"' for k in kws)
            ko_topic = (
                f"이 영역 주변에는 {kw_phrase} 관련 논문군이 따로따로 활발하지만, "
                f"이들을 직접 한 연구로 묶는 논문은 수집 데이터 기준 적습니다."
            )
            en_topic = (
                f"Papers around {kw_phrase} are individually active nearby, but "
                f"works that directly combine them are scarce in the collected data."
            )
        elif kws:
            ko_topic = (
                f'이 영역 주변에는 "{kws[0]}" 관련 논문이 활발하지만, '
                f"같은 영역의 직접 연구는 수집 데이터 기준 적습니다."
            )
            en_topic = (
                f'Papers around "{kws[0]}" are active, but direct studies in the '
                f"same area are scarce in the collected data."
            )
        else:
            ko_topic = "주변 영역에 비해 직접 논문이 적은 위치입니다."
            en_topic = "A spot with relatively few direct papers compared to its surroundings."
        density_ko = (
            f" (이 셀 {cand['own_count']}편 vs 인접 셀 평균 {cand['neighbor_density']:.1f}편)"
        )
        density_en = (
            f" (this cell: {cand['own_count']} vs neighbor avg: {cand['neighbor_density']:.1f})"
        )
        return ko_topic + density_ko, en_topic + density_en

    @classmethod
    def _build_rationale(
        cls, cand: dict, neighbor_keywords: list[str], neighbor_cats: list[str]
    ) -> str:
        """단일 ko (backward compatibility)."""
        ko, _ = cls._build_rationale_pair(cand, neighbor_keywords, neighbor_cats)
        return ko

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
                    "coherence": pl.Int64,
                })),
                "lineage": pl.Struct({
                    "foundations": pl.List(pl.Struct({
                        "id": pl.Utf8, "title": pl.Utf8, "year": pl.Int64,
                    })),
                    "active": pl.List(pl.Struct({
                        "id": pl.Utf8, "title": pl.Utf8, "year": pl.Int64,
                    })),
                    "bridge_text": pl.Utf8,
                    "bridge_text_ko": pl.Utf8,
                    "bridge_text_en": pl.Utf8,
                }),
                "summary": pl.Utf8,
                "summary_ko": pl.Utf8,
                "summary_en": pl.Utf8,
                "rationale_template": pl.Utf8,
                "rationale_ko": pl.Utf8,
                "rationale_en": pl.Utf8,
                "coherence": pl.Float64,
            }
        )
