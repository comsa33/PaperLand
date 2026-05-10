"use client";

import { useMemo } from "react";
import { ExternalLink, Lightbulb, Search } from "lucide-react";
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
    () => papers.filter((p) => p.cell_id === selectedCellId).slice(0, 5),
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
    <aside className="w-[28rem] border-l border-[hsl(var(--border))] bg-[hsl(var(--muted))] overflow-y-auto h-full">
      {!selectedCellId ? (
        <EmptyState />
      ) : (
        <div className="p-5 space-y-5">
          <header>
            <p className="text-xs uppercase tracking-wider font-semibold text-orange-500">
              {candidate ? "공백 후보 #" : "선택 영역"}
              {candidate && getCandidateRank(candidate, whitespace)}
            </p>
            <h3 className="text-lg font-bold leading-snug mt-1.5">
              {candidate?.summary ||
                cell?.top_keywords.slice(0, 2).join(" · ") ||
                "선택된 영역"}
            </h3>
            {cell && (
              <p className="mt-2 text-sm text-[hsl(var(--foreground))]/70">
                논문 {cell.paper_count}편 (최근 {cell.recent_count}편)
                {cell.dominant_category && ` · ${cell.dominant_category}`}
              </p>
            )}
          </header>

          {candidate && <CandidateBlock candidate={candidate} />}

          {cell && cell.top_keywords.length > 0 && !candidate && (
            <section>
              <h4 className="text-sm font-semibold mb-2">대표 키워드</h4>
              <div className="flex flex-wrap gap-2">
                {cell.top_keywords.map((k) => (
                  <span
                    key={k}
                    className="text-sm px-2.5 py-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </section>
          )}

          {cellPapers.length > 0 && (
            <section>
              <h4 className="text-sm font-semibold mb-2">이 셀의 논문</h4>
              <ul className="space-y-2">
                {cellPapers.map((p) => (
                  <li
                    key={p.id}
                    className="text-sm leading-relaxed p-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
                  >
                    <p className="font-medium">{p.title}</p>
                    <p className="mt-1 text-xs text-[hsl(var(--foreground))]/55 font-mono">
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

function getCandidateRank(
  c: WhitespaceCandidate,
  ws: WhitespaceCandidate[]
): number {
  const idx = ws.findIndex((w) => w.cell_id === c.cell_id);
  return idx >= 0 ? idx + 1 : 0;
}

function EmptyState() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-base font-bold mb-2">상세 패널</h3>
        <p className="text-sm text-[hsl(var(--foreground))]/70 leading-relaxed">
          지도의 셀을 클릭하거나, 좌측 공백 후보를 선택하면 여기에 정보가 표시됩니다.
        </p>
      </div>
      <ul className="text-sm text-[hsl(var(--foreground))]/65 space-y-2.5 leading-relaxed">
        <li className="flex gap-2">
          <span className="text-blue-500 font-bold">·</span>
          <span>셀에 속한 대표 논문 5편</span>
        </li>
        <li className="flex gap-2">
          <span className="text-blue-500 font-bold">·</span>
          <span>인접 영역의 키워드</span>
        </li>
        <li className="flex gap-2">
          <span className="text-orange-500 font-bold">·</span>
          <span>공백 후보일 경우: 근거 + 인접 대표 논문 + Scholar 검색 링크</span>
        </li>
      </ul>
    </div>
  );
}

function CandidateBlock({ candidate }: { candidate: WhitespaceCandidate }) {
  return (
    <section className="rounded-lg border border-orange-300/50 bg-orange-50/50 dark:bg-orange-950/25 p-4 space-y-4">
      <div className="flex gap-2.5 items-start">
        <Lightbulb className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-orange-600 dark:text-orange-300">
            그래서 뭘 하면 되나
          </p>
          <p className="text-sm leading-relaxed text-[hsl(var(--foreground))]/85">
            아래 <b>인접 영역의 대표 논문 5편</b>을 먼저 살펴보고, 같은 키워드 조합이
            실제로 비어있는지 <b>Scholar 검색 쿼리</b>로 확인하세요. 진짜 공백이라면
            연구 주제 후보로 검토할 가치가 있습니다.
          </p>
        </div>
      </div>

      <div className="border-t border-orange-300/30 pt-4">
        <p className="text-sm leading-relaxed text-[hsl(var(--foreground))]/85">
          {candidate.rationale}
        </p>
      </div>

      {candidate.neighbor_keywords.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]/75 mb-2">
            주변 키워드
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidate.neighbor_keywords.map((k) => (
              <span
                key={k}
                className="text-sm px-2.5 py-1 rounded-full border border-orange-300/40 bg-[hsl(var(--background))]"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {candidate.nearest_papers.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]/75 mb-2">
            인접 영역의 대표 논문
          </p>
          <ul className="space-y-2">
            {candidate.nearest_papers.map((p) => (
              <li
                key={p.id}
                className="text-sm leading-snug p-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
              >
                <p className="font-medium">{p.title}</p>
                <a
                  href={`https://scholar.google.com/scholar?q=${encodeURIComponent(p.title)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-300 hover:underline"
                >
                  <Search className="w-3.5 h-3.5" />
                  Scholar에서 찾기
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {candidate.suggested_queries.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]/75 mb-2">
            이 공백을 직접 확인하는 검색 쿼리
          </p>
          <ul className="space-y-1.5">
            {candidate.suggested_queries.map((q) => (
              <li key={q}>
                <a
                  href={`https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-300 hover:underline"
                >
                  <Search className="w-4 h-4" />
                  {q}
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-[hsl(var(--foreground))]/55 pt-3 border-t border-orange-300/25">
        <span>근거 강도 {candidate.score.toFixed(1)}</span>
        <span>{candidate.detector}</span>
      </div>

      <p className="text-xs text-[hsl(var(--foreground))]/55 italic leading-snug">
        ※ 수집 데이터 기준 저밀도 후보. 실제 연구 가치는 위 검색 링크로 직접 확인이 필요합니다.
      </p>
    </section>
  );
}
