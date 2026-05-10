"use client";

import { useMemo } from "react";
import { ExternalLink, Search } from "lucide-react";
import { useUIStore } from "@/lib/store";
import type { Cell, PaperPoint, WhitespaceCandidate } from "@/lib/types";

interface Props {
  cells: Cell[];
  papers: PaperPoint[];
  whitespace: WhitespaceCandidate[];
}

export function SidePanel({ cells, papers, whitespace }: Props) {
  const selectedCellId = useUIStore((s) => s.selectedCellId);
  const selectedCandidate = useUIStore((s) => s.selectedCandidate);

  const cell = useMemo(
    () => cells.find((c) => c.cell_id === selectedCellId) ?? null,
    [cells, selectedCellId]
  );
  const cellPapers = useMemo(
    () =>
      papers
        .filter((p) => p.cell_id === selectedCellId)
        .slice(0, 5),
    [papers, selectedCellId]
  );
  const candidate = useMemo(
    () =>
      selectedCandidate ??
      whitespace.find((w) => w.cell_id === selectedCellId) ??
      null,
    [selectedCandidate, whitespace, selectedCellId]
  );

  return (
    <aside className="w-96 border-l border-[hsl(var(--border))] bg-[hsl(var(--muted))] overflow-y-auto h-full">
      {!selectedCellId ? (
        <EmptyState />
      ) : (
        <div className="p-4 space-y-4">
          <header>
            <p className="text-[11px] uppercase tracking-wide text-[hsl(var(--foreground))]/50">
              선택 영역
            </p>
            <h3 className="text-sm font-mono mt-1 break-all">{selectedCellId}</h3>
            {cell && (
              <p className="mt-2 text-xs text-[hsl(var(--foreground))]/70">
                논문 {cell.paper_count}편 (최근 {cell.recent_count}편)
                {cell.dominant_category && ` · ${cell.dominant_category}`}
              </p>
            )}
          </header>

          {candidate && <CandidateBlock candidate={candidate} />}

          {cell && cell.top_keywords.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold mb-2">대표 키워드</h4>
              <div className="flex flex-wrap gap-1.5">
                {cell.top_keywords.map((k) => (
                  <span
                    key={k}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </section>
          )}

          {cellPapers.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold mb-2">대표 논문</h4>
              <ul className="space-y-2">
                {cellPapers.map((p) => (
                  <li
                    key={p.id}
                    className="text-xs leading-relaxed p-2 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
                  >
                    <p className="font-medium">{p.title}</p>
                    <p className="mt-0.5 text-[10px] text-[hsl(var(--foreground))]/60 font-mono">
                      {p.id}
                      {p.year && ` · ${p.year}`}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">상세 패널</h3>
        <p className="text-xs text-[hsl(var(--foreground))]/65 leading-relaxed">
          지도의 셀을 클릭하거나, 좌측 공백 후보를 선택하면 여기에 정보가 표시됩니다.
        </p>
      </div>
      <ul className="text-[11px] text-[hsl(var(--foreground))]/60 space-y-2 leading-relaxed">
        <li className="flex gap-2">
          <span className="text-[hsl(var(--accent))]">•</span>
          <span>셀에 속한 대표 논문 5편</span>
        </li>
        <li className="flex gap-2">
          <span className="text-[hsl(var(--accent))]">•</span>
          <span>인접 영역의 키워드</span>
        </li>
        <li className="flex gap-2">
          <span className="text-orange-500">•</span>
          <span>공백 후보일 경우: 수치 근거 + Google Scholar 검색 링크</span>
        </li>
      </ul>
    </div>
  );
}

function CandidateBlock({ candidate }: { candidate: WhitespaceCandidate }) {
  return (
    <section className="rounded border border-orange-300/40 bg-orange-50/30 dark:bg-orange-950/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">공백 후보 근거</h4>
        <span className="text-[11px] text-orange-500 font-mono">
          score {candidate.score.toFixed(2)}
        </span>
      </div>

      <p className="text-[12px] leading-relaxed text-[hsl(var(--foreground))]/85">
        {candidate.rationale}
      </p>

      {candidate.neighbor_keywords.length > 0 && (
        <div>
          <p className="text-[11px] text-[hsl(var(--foreground))]/60 mb-1">
            인접 키워드
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidate.neighbor_keywords.map((k) => (
              <span
                key={k}
                className="text-[11px] px-2 py-0.5 rounded-full border border-orange-300/40 bg-[hsl(var(--background))]"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {candidate.suggested_queries.length > 0 && (
        <div>
          <p className="text-[11px] text-[hsl(var(--foreground))]/60 mb-1">
            추가 검색 쿼리
          </p>
          <ul className="space-y-1">
            {candidate.suggested_queries.map((q) => (
              <li key={q}>
                <a
                  href={`https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] text-[hsl(var(--accent))] hover:underline"
                >
                  <Search className="w-3 h-3" />
                  {q}
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-[hsl(var(--foreground))]/45 italic leading-snug">
        ※ 이 영역은 수집 데이터 기준 저밀도 후보입니다. 실제 연구 가치는 외부
        검색·문헌 검토로 확인이 필요합니다.
      </p>
    </section>
  );
}
