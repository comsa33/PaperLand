"use client";

import { ArrowRight, Compass, Map as MapIcon, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { pickCandidateText, translateKeyword, ui } from "@/lib/i18n";
import { useUIStore } from "@/lib/store";
import type { PaperPoint, WhitespaceCandidate } from "@/lib/types";

interface Props {
  candidates: WhitespaceCandidate[];
  papers: PaperPoint[];
}

interface Scored {
  candidate: WhitespaceCandidate;
  matched: Set<string>;
  matchCount: number;
}

/* 약어/별칭 사전 — 사용자가 'kg', 'qa', 'llm'으로 검색해도 매칭되도록.
   한 토큰을 다중어 phrase로 확장하거나, 다중어 → 짧은 약어로 모두 커버.
*/
const ALIAS: Record<string, string[]> = {
  qa: ["question answering"],
  kg: ["knowledge graph"],
  kgs: ["knowledge graphs"],
  llm: ["large language model", "large language"],
  llms: ["large language models", "language llms", "large language"],
  rag: ["retrieval augmented generation", "retrieval"],
  cot: ["chain of thought"],
  rl: ["reinforcement learning"],
  rlhf: ["rlhf", "reinforcement learning from human feedback"],
  ner: ["named entity recognition"],
  mt: ["machine translation"],
  nlp: ["natural language processing"],
  asr: ["speech recognition"],
  nlu: ["natural language understanding"],
  nlg: ["natural language generation"],
  vqa: ["visual question answering"],
  vlm: ["vision language model"],
  ie: ["information extraction"],
  qg: ["question generation"],
};

export function CandidateGrid({ candidates, papers }: Props) {
  const locale = useUIStore((s) => s.locale);
  const selectCandidate = useUIStore((s) => s.selectCandidate);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const [topic, setTopic] = useState("");

  const query = useMemo(() => parseQuery(topic), [topic]);

  const ranked = useMemo<Scored[]>(() => {
    const base = candidates.map((c) => ({
      candidate: c,
      matched: new Set<string>(),
      matchCount: 0,
    }));
    if (query.segments.length === 0) return base;
    const scored = candidates.map((c) => {
      const haystack = normalize(
        [
          ...c.neighbor_keywords,
          c.summary_ko ?? "",
          c.summary_en ?? "",
          c.summary ?? "",
        ].join(" · ")
      );
      const matched = new Set<string>();
      let count = 0;
      for (const seg of query.segments) {
        if (seg.variants.some((v) => fuzzyContains(haystack, v))) {
          matched.add(seg.original);
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
  }, [candidates, query]);

  const noMatch =
    query.segments.length > 0 && ranked.every((r) => r.matchCount === 0);

  const nearbyPapers = useMemo(() => {
    if (query.segments.length === 0 || query.allVariants.length === 0) return [];
    const variants = query.allVariants;
    const scored = papers
      .map((p) => {
        const title = normalize(p.title);
        let hits = 0;
        for (const v of variants) {
          if (fuzzyContains(title, v)) hits += 1;
        }
        return { p, hits };
      })
      .filter((s) => s.hits > 0);
    scored.sort((a, b) => {
      if (b.hits !== a.hits) return b.hits - a.hits;
      return (b.p.year ?? 0) - (a.p.year ?? 0);
    });
    return scored.slice(0, 30).map((s) => s.p);
  }, [papers, query]);

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

        {nearbyPapers.length > 0 && (
          <NearbyPapers papers={nearbyPapers} locale={locale} />
        )}

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
                  variants={query.allVariants}
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

function NearbyPapers({
  papers,
  locale,
}: {
  papers: PaperPoint[];
  locale: "ko" | "en";
}) {
  return (
    <section className="rounded-xl border border-blue-300/40 bg-blue-50/30 dark:bg-blue-950/20 p-4 space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
          {(ui.nearbyPapersTitle[locale] as (n: number) => string)(papers.length)}
        </p>
        <p className="text-xs text-[hsl(var(--foreground))]/55 leading-relaxed">
          {ui.nearbyPapersHint[locale]}
        </p>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
        {papers.slice(0, 12).map((p) => (
          <li
            key={p.id}
            className="text-sm leading-snug p-2.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
          >
            <a
              href={`https://scholar.google.com/scholar?q=${encodeURIComponent(p.title)}`}
              target="_blank"
              rel="noreferrer"
              className="block hover:text-blue-600 dark:hover:text-blue-300 transition"
            >
              <p className="line-clamp-2 font-medium">{p.title}</p>
              <p className="mt-1 text-xs text-[hsl(var(--foreground))]/55 font-mono">
                {p.id}
                {p.year ? ` · ${p.year}` : ""}
              </p>
            </a>
          </li>
        ))}
      </ul>
      {papers.length > 12 && (
        <p className="text-xs text-[hsl(var(--foreground))]/55">
          {locale === "ko"
            ? `… 외 ${papers.length - 12}편`
            : `… and ${papers.length - 12} more`}
        </p>
      )}
    </section>
  );
}

function Card({
  index,
  candidate,
  matched,
  variants,
  locale,
  onOpen,
}: {
  index: number;
  candidate: WhitespaceCandidate;
  matched: Set<string>;
  variants: string[];
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
            const hit = isKeywordMatched(k, variants);
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

interface SegMatch {
  /** 사용자가 입력한 그대로 (lowercase, 정규화) — 매칭 표시용 키 */
  original: string;
  /** 검색 시 시도할 phrase 목록 — 원문 + alias 확장 + 부분 토큰 */
  variants: string[];
}

interface ParsedQuery {
  segments: SegMatch[];
  /** 칩 하이라이트용 — 모든 segment의 variants 합집합 */
  allVariants: string[];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyContains(haystack: string, needle: string): boolean {
  if (needle.length < 2) return false;
  if (haystack.includes(needle)) return true;
  // 단복수 — 마지막 단어의 's' 토글
  const words = needle.split(" ");
  const last = words[words.length - 1];
  if (last.length < 3) return false;
  const altLast = last.endsWith("s") ? last.slice(0, -1) : last + "s";
  const alt = [...words.slice(0, -1), altLast].join(" ");
  return haystack.includes(alt);
}

function parseQuery(input: string): ParsedQuery {
  const segments: SegMatch[] = [];
  const allVariants = new Set<string>();
  const parts = input
    .split(/[,;\n]+/)
    .map((s) => normalize(s))
    .filter((s) => s.length >= 2);
  for (const seg of parts) {
    const tokens = seg.split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length === 0) continue;
    const variants = new Set<string>();
    // 원문 phrase
    variants.add(seg);
    // 토큰별 alias 확장
    for (const tok of tokens) {
      variants.add(tok);
      const aliases = ALIAS[tok];
      if (aliases) for (const a of aliases) variants.add(a);
    }
    // 다중어 segment를 alias 치환한 버전 (예: "kg qa" → "knowledge graph question answering")
    if (tokens.length > 1) {
      const subs = tokens.map((t) => (ALIAS[t] ? ALIAS[t][0] : t));
      variants.add(subs.join(" "));
    }
    const variantList = Array.from(variants);
    segments.push({ original: seg, variants: variantList });
    for (const v of variantList) allVariants.add(v);
  }
  return { segments, allVariants: Array.from(allVariants) };
}

function isKeywordMatched(kw: string, variants: string[]): boolean {
  const norm = normalize(kw);
  for (const v of variants) {
    if (fuzzyContains(norm, v) || fuzzyContains(v, norm)) return true;
  }
  return false;
}
