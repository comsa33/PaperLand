"""arXiv 공개 API 기반 경량 수집 (V0 real preview 용도).

OAI-PMH 본격 도입 전, 단발 수집을 위한 가벼운 클라이언트.
- arXiv API: http://export.arxiv.org/api/query
- 정중한 rate limit (3초 간격)
- 카테고리 + 기간 필터
- 결과를 Paper 스키마로 변환

V1.5에서 OAI-PMH incremental harvest로 교체될 예정.
"""

from __future__ import annotations

import logging
import time
import xml.etree.ElementTree as ET
from datetime import date, datetime
from typing import Iterator

import httpx

from .schemas import Paper

ARXIV_API_BASE = "http://export.arxiv.org/api/query"
NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "arxiv": "http://arxiv.org/schemas/atom",
}
DEFAULT_DELAY_SECONDS = 3.0  # arXiv 정중한 rate limit
PAGE_SIZE = 100  # arXiv 권장 max

log = logging.getLogger(__name__)


def fetch_papers(
    category: str = "cs.CL",
    max_results: int = 1000,
    page_size: int = PAGE_SIZE,
    delay: float = DEFAULT_DELAY_SECONDS,
    since: date | None = None,
) -> Iterator[Paper]:
    """arXiv API에서 카테고리별 최신 논문을 yield.

    Args:
        category: arXiv 카테고리 (예: "cs.CL")
        max_results: 가져올 최대 논문 수
        page_size: 페이지당 결과 수
        delay: API 호출 사이 대기 시간 (초)
        since: 이 날짜 이후 제출된 논문만 (None이면 전부)
    """
    fetched = 0
    start = 0
    with httpx.Client(timeout=60.0) as client:
        while fetched < max_results:
            wanted = min(page_size, max_results - fetched)
            params = {
                "search_query": f"cat:{category}",
                "start": start,
                "max_results": wanted,
                "sortBy": "submittedDate",
                "sortOrder": "descending",
            }
            log.info("arXiv fetch start=%d size=%d", start, wanted)
            res = client.get(ARXIV_API_BASE, params=params)
            res.raise_for_status()
            entries = list(_parse_feed(res.text))
            if not entries:
                break
            stopped_for_date = False
            for paper in entries:
                if since and paper.submitted_date < since:
                    stopped_for_date = True
                    break
                yield paper
                fetched += 1
                if fetched >= max_results:
                    break
            if stopped_for_date:
                break
            start += len(entries)
            if len(entries) < wanted:
                break
            time.sleep(delay)


def _parse_feed(xml_text: str) -> Iterator[Paper]:
    root = ET.fromstring(xml_text)
    for entry in root.findall("atom:entry", NS):
        try:
            yield _entry_to_paper(entry)
        except Exception as e:
            log.warning("entry parse failed: %s", e)
            continue


def _entry_to_paper(entry: ET.Element) -> Paper:
    raw_id = _text(entry, "atom:id")
    arxiv_id = raw_id.rsplit("/", 1)[-1].split("v")[0] if raw_id else ""
    title = _text(entry, "atom:title", "").replace("\n", " ").strip()
    summary = _text(entry, "atom:summary", "").replace("\n", " ").strip()
    submitted = _parse_date(_text(entry, "atom:published"))
    updated = _parse_date(_text(entry, "atom:updated"))
    primary = entry.find("arxiv:primary_category", NS)
    primary_category = (
        primary.get("term") if primary is not None else "cs.CL"
    )
    categories = [
        c.get("term")
        for c in entry.findall("atom:category", NS)
        if c.get("term")
    ]
    authors = [
        _text(a, "atom:name", "")
        for a in entry.findall("atom:author", NS)
    ]
    return Paper(
        arxiv_id=arxiv_id,
        title=title,
        abstract=summary,
        authors=authors,
        categories=categories,
        primary_category=primary_category,
        submitted_date=submitted,
        updated_date=updated,
    )


def _text(parent: ET.Element, tag: str, default: str = "") -> str:
    el = parent.find(tag, NS)
    return (el.text or default) if el is not None else default


def _parse_date(text: str | None) -> date:
    if not text:
        return date.today()
    return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
