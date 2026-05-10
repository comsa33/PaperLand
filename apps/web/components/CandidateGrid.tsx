"use client";

import { ArrowRight, Compass, Map as MapIcon, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { pickCandidateText, translateKeyword, ui } from "@/lib/i18n";
import { useUIStore } from "@/lib/store";
import type { WhitespaceCandidate } from "@/lib/types";

interface Props {
  candidates: WhitespaceCandidate[];
}

interface Scored {
  candidate: WhitespaceCandidate;
  matched: Set<string>;
  matchCount: number;
}

export function CandidateGrid({ candidates }: Props) {
  const locale = useUIStore((s) => s.locale);
  const selectCandidate = useUIStore((s) => s.selectCandidate);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const [topic, setTopic] = useState("");

  const tokens = useMemo(() => parseTokens(topic), [topic]);

  const ranked = useMemo<Scored[]>(() => {
    const base = candidates.map((c) => ({
      candidate: c,
      matched: new Set<string>(),
      matchCount: 0,
    }));
    if (tokens.length === 0) return base;
    const scored = candidates.map((c) => {
      const haystack = [
        ...c.neighbor_keywords,
        ...(c.summary ? [c.summary] : []),
        ...(c.summary_en ? [c.summary_en] : []),
      ]
        .join(" · ")
        .toLowerCase();
      const matched = new Set<string>();
      let count = 0;
      for (const tok of tokens) {
        if (!tok) continue;
        if (haystack.includes(tok)) {
          matched.add(tok);
          count += 1;
        }
      }
      return { candidate: c, matched, matchCount: count };
    });
    const anyMatch = scored.some((s) => s.matchCount > 0);
    if (!anyMatch) return base;
    return [...scored].sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      return b.candidate.score - a.candidate.score;
    });
  }, [candidates, tokens]);

  const noMatch = tokens.length > 0 && ranked.every((r) => r.matchCount === 0);

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

        <TopicInput
          value={topic}
          onChange={setTopic}
          locale={locale}
          showNoMatchHint={noMatch}
        />

        {candidates.length === 0 ? (
          <div className="p-12 text-center text-sm text-[hsl(var(--foreground))]/60 border border-dashed border-[hsl(var(--border))] rounded-lg">
            {ui.noCandidates[locale]}
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ranked.map((r, i) => (
              <li key={r.candidate.cell_id}>
                <Card
                  index={i}
                  candidate={r.candidate}
                  matched={r.matched}
                  locale={locale}
                  onOpen={() => open(r.candidate)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TopicInput({
  value,
  onChange,
  locale,
  showNoMatchHint,
}: {
  value: string;
  onChange: (s: string) => void;
  locale: "ko" | "en";
  showNoMatchHint: boolean;
}) {
  return (
    <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 space-y-2">
      <label className="flex items-center gap-2 text-sm font-bold text-[hsl(var(--foreground))]/85">
        <Search className="w-4 h-4 text-orange-500" />
        {ui.topicLabel[locale]}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={ui.topicPlaceholder[locale]}
          className="flex-1 px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--background))] transition"
          >
            <X className="w-3.5 h-3.5" />
            {ui.topicReset[locale]}
          </button>
        )}
      </div>
      <p className="text-xs text-[hsl(var(--foreground))]/55 leading-relaxed">
        {ui.topicHint[locale]}
      </p>
      {showNoMatchHint && (
        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          {ui.topicNoMatch[locale]}
        </p>
      )}
    </section>
  );
}

function Card({
  index,
  candidate,
  matched,
  locale,
  onOpen,
}: {
  index: number;
  candidate: WhitespaceCandidate;
  matched: Set<string>;
  locale: "ko" | "en";
  onOpen: () => void;
}) {
  const summary = pickCandidateText(candidate, locale, "summary");
  const rationale = pickCandidateText(candidate, locale, "rationale");
  const kws = candidate.neighbor_keywords.slice(0, 4);
  const sample = candidate.nearest_papers[0];
  const matchCount = matched.size;
  const isMatched = matchCount > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group w-full text-left rounded-xl border bg-[hsl(var(--background))] hover:shadow-md transition p-5 space-y-3 ${
        isMatched
          ? "border-orange-400 ring-2 ring-orange-300/40"
          : "border-[hsl(var(--border))] hover:border-orange-400"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-mono text-sm font-bold ${
            isMatched
              ? "bg-orange-500 text-white"
              : "bg-orange-500/15 text-orange-600 dark:text-orange-300"
          }`}
        >
          #{index + 1}
        </span>
        <span className="flex items-center gap-2 text-xs font-mono text-[hsl(var(--foreground))]/55">
          {isMatched && (
            <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-700 dark:text-orange-300 font-semibold">
              {(ui.topicMatchBadge[locale] as (n: number) => string)(matchCount)}
            </span>
          )}
          <span>
            {ui.scoreLabel[locale]} {candidate.score.toFixed(1)}
          </span>
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
            const hit = isKeywordMatched(k, matched);
            return (
              <span
                key={k}
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  hit
                    ? "bg-orange-500 text-white border-orange-500"
                    : "border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
                }`}
              >
                <span className="font-medium">{k}</span>
                {ko && (
                  <span
                    className={`ml-1 ${hit ? "text-white/85" : "text-[hsl(var(--foreground))]/55"}`}
                  >
                    / {ko}
                  </span>
                )}
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

function parseTokens(input: string): string[] {
  const cleaned = input
    .toLowerCase()
    .split(/[,;\n]+/)
    .flatMap((s) => s.split(/\s{2,}/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  return Array.from(new Set(cleaned));
}

function isKeywordMatched(kw: string, matched: Set<string>): boolean {
  const norm = kw.toLowerCase();
  for (const tok of matched) {
    if (norm.includes(tok) || tok.includes(norm)) return true;
  }
  return false;
}
