"""파이프라인 단계 간 공유 스키마."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class Paper(BaseModel):
    """정제된 논문 메타데이터."""

    arxiv_id: str = Field(..., description="canonical arXiv ID (예: 2401.12345)")
    title: str
    abstract: str
    authors: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    primary_category: str
    submitted_date: date
    updated_date: date | None = None


class CellStats(BaseModel):
    """hex 셀 단위 집계."""

    cell_id: str
    paper_count: int
    recent_count: int
    top_keywords: list[str]
    dominant_category: str | None
    centroid_x: float
    centroid_y: float


class WhitespaceCandidate(BaseModel):
    """공백 후보."""

    cell_id: str
    detector: str
    score: float
    rationale_template: str
    neighbor_keywords: list[str]
    nearest_papers: list[str]
    suggested_queries: list[str]


class Manifest(BaseModel):
    """배포 manifest (V0)."""

    schema_version: str = "1.0"
    map_epoch: str
    embedding_model: str
    categories: list[str]
    paper_count: int
    built_at: str
    artifact_checksums: dict[str, str] = Field(default_factory=dict)
