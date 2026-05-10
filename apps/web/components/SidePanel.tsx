"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, GitBranch, Lightbulb, Search } from "lucide-react";
import { pickBridgeText, pickCandidateText, translateKeyword, ui } from "@/lib/i18n";
import { useUIStore } from "@/lib/store";
import type {
  Cell,
  Lineage,
  PaperPoint,
  WhitespaceCandidate,
} from "@/lib/types";

interface Props {
  cells: Cell[];
  papers: PaperPoint[];
  whitespace: WhitespaceCandidate[];
}

export function SidePanel({ cells, papers, whitespace }: Props) {
  const selectedCellId = useUIStore((s) => s.selectedCellId);
  const selectedCandidate = useUIStore((s) => s.selectedCandidate);
  const locale = useUIStore((s) => s.locale);

  const cell = useMemo(
    () => cells.find((c) => c.cell_id === selectedCellId) ?? null,
    [cells, selectedCellId]
  );
  const cellPapers = useMemo(
    () => papers.filter((p) => p.cell_id === selectedCellId),
    [papers, selectedCellId]
  );
  const [papersExpanded, setPapersExpanded] = useState(false);
  useEffect(() => setPapersExpanded(false), [selectedCellId]);
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
        <EmptyState locale={locale} />
      ) : (
        <div className="p-5 space-y-5">
          <header>
            <p className="text-xs uppercase tracking-wider font-semibold text-orange-500">
              {candidate
                ? locale === "ko"
                  ? "공백 후보 #"
                  : "Whitespace candidate #"
                : locale === "ko"
                  ? "선택 영역"
                  : "Selected area"}
              {candidate && getCandidateRank(candidate, whitespace)}
            </p>
            <h3 className="text-lg font-bold leading-snug mt-1.5">
              {(candidate && pickCandidateText(candidate, locale, "summary")) ||
                cell?.top_keywords.slice(0, 2).join(" · ") ||
                (locale === "ko" ? "선택된 영역" : "Selected area")}
            </h3>
            {cell && (
              <p className="mt-2 text-sm text-[hsl(var(--foreground))]/70">
                {locale === "ko"
                  ? `논문 ${cell.paper_count}편 (최근 ${cell.recent_count}편)`
                  : `${cell.paper_count} papers (${cell.recent_count} recent)`}
                {cell.dominant_category && ` · ${cell.dominant_category}`}
              </p>
            )}
          </header>

          {candidate && <CandidateBlock candidate={candidate} locale={locale} />}

          {cell && cell.top_keywords.length > 0 && !candidate && (
            <section>
              <h4 className="text-sm font-semibold mb-2">
                {ui.representativeKw[locale]}
              </h4>
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

          {/* 후보 선택 시에는 cell의 잡음성 논문을 숨김 — 후보 요약과 주제 충돌 회피 */}
          {cellPapers.length > 0 && !candidate && (
            <section>
              <div className="flex items-baseline justify-between mb-2 gap-3">
                <h4 className="text-sm font-semibold">
                  {ui.papersInCell[locale]}
                </h4>
                <span className="text-xs text-[hsl(var(--foreground))]/55">
                  {locale === "ko"
                    ? papersExpanded
                      ? `전체 ${cellPapers.length}편`
                      : `대표 5편 · 전체 ${cellPapers.length}편`
                    : papersExpanded
                      ? `all ${cellPapers.length}`
                      : `top 5 of ${cellPapers.length}`}
                </span>
              </div>
              <ul className="space-y-2">
                {(papersExpanded ? cellPapers : cellPapers.slice(0, 5)).map(
                  (p) => (
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
                  )
                )}
              </ul>
              {cellPapers.length > 5 && (
                <button
                  type="button"
                  onClick={() => setPapersExpanded((v) => !v)}
                  className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-300 hover:underline"
                >
                  {papersExpanded
                    ? locale === "ko"
                      ? "접기"
                      : "Collapse"
                    : locale === "ko"
                      ? `더 보기 (+${cellPapers.length - 5})`
                      : `Show more (+${cellPapers.length - 5})`}
                </button>
              )}
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

function EmptyState({ locale }: { locale: "ko" | "en" }) {
  const bullets = ui.emptyBullets[locale];
  return (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-base font-bold mb-2">{ui.emptyHeading[locale]}</h3>
        <p className="text-sm text-[hsl(var(--foreground))]/70 leading-relaxed">
          {ui.emptyBody[locale]}
        </p>
      </div>
      <ul className="text-sm text-[hsl(var(--foreground))]/65 space-y-2.5 leading-relaxed">
        {bullets.map((b, i) => (
          <li key={b} className="flex gap-2">
            <span
              className={
                i === 2
                  ? "text-orange-500 font-bold"
                  : "text-blue-500 font-bold"
              }
            >
              ·
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CandidateBlock({
  candidate,
  locale,
}: {
  candidate: WhitespaceCandidate;
  locale: "ko" | "en";
}) {
  const rationale = pickCandidateText(candidate, locale, "rationale");
  return (
    <section className="rounded-lg border border-orange-300/50 bg-orange-50/50 dark:bg-orange-950/25 p-4 space-y-4">
      <div className="flex gap-2.5 items-start">
        <Lightbulb className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
        <div className="space-y-2 min-w-0 flex-1">
          <p className="text-sm font-semibold text-orange-600 dark:text-orange-300">
            {ui.whatToDoTitle[locale]}
          </p>
          <ol className="text-sm leading-relaxed text-[hsl(var(--foreground))]/85 space-y-1.5 list-decimal pl-4">
            {ui.whatToDoSteps[locale].map((parts, i) => (
              <li key={i}>
                {parts[0]}
                <b>{parts[1]}</b>
                {parts[2]}
              </li>
            ))}
          </ol>
          <p className="text-xs text-[hsl(var(--foreground))]/55 italic">
            {ui.flowSwitchHint[locale]}
          </p>
        </div>
      </div>

      <div className="border-t border-orange-300/30 pt-4">
        <p className="text-sm leading-relaxed text-[hsl(var(--foreground))]/85">
          {rationale}
        </p>
      </div>

      {candidate.neighbor_keywords.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]/75 mb-2">
            {ui.neighborKw[locale]}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidate.neighbor_keywords.map((k) => {
              const ko = translateKeyword(k);
              return (
                <span
                  key={k}
                  className="text-sm px-2.5 py-1 rounded-full border border-orange-300/40 bg-[hsl(var(--background))]"
                >
                  <span className="font-medium">{k}</span>
                  {ko && (
                    <span className="ml-1.5 text-[hsl(var(--foreground))]/55">
                      / {ko}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {candidate.lineage && <LineageBlock lineage={candidate.lineage} locale={locale} />}

      {candidate.nearest_papers.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]/75 mb-2">
            {ui.neighborPapers[locale]}
          </p>
          <ul className="space-y-2">
            {candidate.nearest_papers.slice(0, 5).map((p) => (
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
                  {ui.scholarFind[locale]}
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
            {ui.searchQueries[locale]}
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
        <span>
          {ui.evidenceStrength[locale]} {candidate.score.toFixed(1)}
        </span>
        <span>{candidate.detector}</span>
      </div>

      <p className="text-xs text-[hsl(var(--foreground))]/55 italic leading-snug">
        {ui.candidateDisclaimer[locale]}
      </p>
    </section>
  );
}

function LineageBlock({
  lineage,
  locale,
}: {
  lineage: Lineage;
  locale: "ko" | "en";
}) {
  const hasFoundations = lineage.foundations?.length > 0;
  const hasActive = lineage.active?.length > 0;
  if (!hasFoundations && !hasActive) return null;
  const bridge = pickBridgeText(lineage, locale);
  return (
    <div className="rounded-md border border-blue-300/30 bg-blue-50/40 dark:bg-blue-950/25 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-blue-500" />
        <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
          {locale === "ko" ? "연도별 인접 연구 흐름" : "Adjacent research flow by year"}
        </p>
      </div>
      {hasFoundations && (
        <div>
          <p className="text-xs font-semibold text-[hsl(var(--foreground))]/65 mb-1">
            {locale === "ko" ? "기반 연구" : "Foundations"}
          </p>
          <ul className="space-y-1">
            {lineage.foundations.map((p) => (
              <li
                key={p.id}
                className="text-sm leading-snug flex gap-2 items-baseline"
              >
                <span className="font-mono text-xs text-blue-500/80 shrink-0">
                  {p.year ?? "—"}
                </span>
                <span>{p.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {bridge && (
        <div className="px-3 py-2 rounded bg-orange-100/50 dark:bg-orange-950/30 text-sm text-orange-700 dark:text-orange-200 leading-relaxed">
          ↓ {bridge} ↓
        </div>
      )}
      {hasActive && (
        <div>
          <p className="text-xs font-semibold text-[hsl(var(--foreground))]/65 mb-1">
            {locale === "ko" ? "최근 활발한 인접 연구" : "Recent active neighbors"}
          </p>
          <ul className="space-y-1">
            {lineage.active.map((p) => (
              <li
                key={p.id}
                className="text-sm leading-snug flex gap-2 items-baseline"
              >
                <span className="font-mono text-xs text-blue-500/80 shrink-0">
                  {p.year ?? "—"}
                </span>
                <span>{p.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-[hsl(var(--foreground))]/55 italic">
        {locale === "ko"
          ? "※ citation 기반 영향 관계가 아니라, 같은 임베딩 영역의 연도·인접도로 정렬한 흐름입니다."
          : "* Not a citation-based influence graph; an ordering by year + embedding adjacency."}
      </p>
    </div>
  );
}
