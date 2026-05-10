"use client";

import { ArrowRight, Compass, Map as MapIcon } from "lucide-react";
import { pickCandidateText, translateKeyword, ui } from "@/lib/i18n";
import { useUIStore } from "@/lib/store";
import type { WhitespaceCandidate } from "@/lib/types";

interface Props {
  candidates: WhitespaceCandidate[];
}

export function CandidateGrid({ candidates }: Props) {
  const locale = useUIStore((s) => s.locale);
  const selectCandidate = useUIStore((s) => s.selectCandidate);
  const setViewMode = useUIStore((s) => s.setViewMode);

  const open = (c: WhitespaceCandidate) => {
    selectCandidate(c);
    setViewMode("map");
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[hsl(var(--background))]">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-orange-500" />
            <p className="text-xs uppercase tracking-wider font-bold text-orange-500">
              {ui.todaysReview[locale]}
            </p>
          </div>
          <h2 className="text-2xl font-bold leading-tight">
            {(ui.candidatesHeading[locale] as (n: number) => string)(candidates.length)}
          </h2>
          <p className="text-sm text-[hsl(var(--foreground))]/70 leading-relaxed max-w-3xl">
            {ui.reviewIntro[locale]}
          </p>
        </header>

        {candidates.length === 0 ? (
          <div className="p-12 text-center text-sm text-[hsl(var(--foreground))]/60 border border-dashed border-[hsl(var(--border))] rounded-lg">
            {ui.noCandidates[locale]}
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {candidates.map((c, i) => (
              <li key={c.cell_id}>
                <Card index={i} candidate={c} locale={locale} onOpen={() => open(c)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Card({
  index,
  candidate,
  locale,
  onOpen,
}: {
  index: number;
  candidate: WhitespaceCandidate;
  locale: "ko" | "en";
  onOpen: () => void;
}) {
  const summary = pickCandidateText(candidate, locale, "summary");
  const rationale = pickCandidateText(candidate, locale, "rationale");
  const kws = candidate.neighbor_keywords.slice(0, 4);
  const sample = candidate.nearest_papers[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full text-left rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:border-orange-400 hover:shadow-md transition p-5 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-300 font-mono text-sm font-bold">
          #{index + 1}
        </span>
        <span className="text-xs text-[hsl(var(--foreground))]/55 font-mono">
          {ui.scoreLabel[locale]} {candidate.score.toFixed(1)}
        </span>
      </div>

      <h3 className="text-base font-bold leading-snug text-[hsl(var(--foreground))]">
        {summary}
      </h3>

      <p className="text-sm leading-relaxed text-[hsl(var(--foreground))]/75 line-clamp-3">
        {rationale}
      </p>

      {kws.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {kws.map((k) => {
            const ko = locale === "ko" ? translateKeyword(k) : null;
            return (
              <span
                key={k}
                className="text-xs px-2 py-0.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
              >
                <span className="font-medium">{k}</span>
                {ko && <span className="ml-1 text-[hsl(var(--foreground))]/55">/ {ko}</span>}
              </span>
            );
          })}
        </div>
      )}

      {sample && (
        <p className="text-xs text-[hsl(var(--foreground))]/55 leading-snug line-clamp-1">
          {ui.examplePrefix[locale]}
          {sample.title}
        </p>
      )}

      <div className="flex items-center justify-between pt-1 text-xs">
        <span className="text-[hsl(var(--foreground))]/55">
          {(ui.neighborVsSelf[locale] as (n: string, o: number) => string)(
            candidate.neighbor_density.toFixed(0),
            candidate.own_count
          )}
        </span>
        <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-300 font-semibold group-hover:gap-1.5 transition-all">
          <MapIcon className="w-3.5 h-3.5" />
          {ui.openDetail[locale]}
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </button>
  );
}
