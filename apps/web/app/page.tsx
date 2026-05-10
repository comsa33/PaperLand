"use client";

import { ArrowLeft, GitBranch, Languages, Map as MapIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { CandidateGrid } from "@/components/CandidateGrid";
import { LineageView } from "@/components/LineageView";
import { Map } from "@/components/Map";
import { Onboarding } from "@/components/Onboarding";
import { SidePanel } from "@/components/SidePanel";
import { KNOWN_CATEGORIES, loadMapData, probeCategory } from "@/lib/data";
import { ui, type Locale } from "@/lib/i18n";
import { hydrateLocale, useUIStore } from "@/lib/store";
import type { MapData } from "@/lib/types";

export default function HomePage() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableCats, setAvailableCats] = useState<Set<string>>(
    new Set(["cs.CL"])
  );
  const locale = useUIStore((s) => s.locale);
  const setLocale = useUIStore((s) => s.setLocale);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const selectCandidate = useUIStore((s) => s.selectCandidate);
  const category = useUIStore((s) => s.category);
  const setCategory = useUIStore((s) => s.setCategory);

  useEffect(() => {
    hydrateLocale();
  }, []);

  // 카테고리 바뀔 때 데이터 reload
  useEffect(() => {
    setData(null);
    setError(null);
    loadMapData(category)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [category]);

  // 빌드 가능한 카테고리 목록 한 번 prob (HEAD)
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      KNOWN_CATEGORIES.map(async (c) => [c.value, await probeCategory(c.value)] as const)
    ).then((results) => {
      if (cancelled) return;
      const ok = new Set<string>();
      for (const [v, present] of results) if (present) ok.add(v);
      ok.add("cs.CL");
      setAvailableCats(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-bold">{ui.loadFail[locale]}</h1>
          <p className="text-base text-[hsl(var(--foreground))]/70">{error}</p>
          <p className="text-sm text-[hsl(var(--foreground))]/60 leading-relaxed">
            {ui.loadHint[locale]}
          </p>
          <pre className="text-sm bg-[hsl(var(--muted))] p-4 rounded text-left overflow-x-auto">
            {`make install
make fixtures
make web`}
          </pre>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-base text-[hsl(var(--foreground))]/65">
          {ui.loading[locale]}
        </p>
      </main>
    );
  }

  const isFixture = data.manifest.embedding_model.startsWith("synthetic-fixture");
  const isList = viewMode === "list";
  const inDetail = !isList;

  const backToList = () => {
    selectCandidate(null);
    setViewMode("list");
  };

  return (
    <main className="h-screen flex flex-col">
      <header className="px-5 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-base font-bold tracking-tight">{ui.appTitle[locale]}</h1>
          <p className="text-sm text-[hsl(var(--foreground))]/65 truncate hidden md:block">
            {ui.appSubtitle[locale]}
          </p>
        </div>

        {inDetail ? (
          <nav className="flex items-center gap-1">
            <button
              type="button"
              onClick={backToList}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-semibold border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] transition whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              {ui.backToList[locale]}
            </button>
            <div className="ml-2 flex items-center gap-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("map")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-semibold transition ${
                  viewMode === "map"
                    ? "bg-[hsl(var(--background))] shadow-sm"
                    : "text-[hsl(var(--foreground))]/65 hover:text-[hsl(var(--foreground))]/95"
                }`}
                aria-pressed={viewMode === "map"}
              >
                <MapIcon className="w-4 h-4" />
                {ui.detailMapTab[locale]}
              </button>
              <button
                type="button"
                onClick={() => setViewMode("lineage")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-semibold transition ${
                  viewMode === "lineage"
                    ? "bg-[hsl(var(--background))] shadow-sm"
                    : "text-[hsl(var(--foreground))]/65 hover:text-[hsl(var(--foreground))]/95"
                }`}
                aria-pressed={viewMode === "lineage"}
              >
                <GitBranch className="w-4 h-4" />
                {ui.detailFlowTab[locale]}
              </button>
            </div>
          </nav>
        ) : (
          <span className="text-xs text-[hsl(var(--foreground))]/55 font-mono whitespace-nowrap hidden md:block">
            {data.whitespace.length} candidates · {data.manifest.paper_count}{" "}
            papers
          </span>
        )}

        {isFixture && (
          <div className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 whitespace-nowrap">
            {ui.fixtureBadge[locale]}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 whitespace-nowrap text-xs">
            <span className="font-mono text-[hsl(var(--foreground))]/55">
              epoch {data.manifest.map_epoch} · {data.manifest.paper_count}{" "}
              {locale === "ko" ? "편" : "papers"}
            </span>
            <label
              className="flex items-center gap-1.5 font-semibold"
              title={ui.datasetSwitchHint[locale]}
            >
              <span className="text-[hsl(var(--foreground))]/65">
                {ui.datasetLabel[locale]}:
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-2 py-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-400/40"
              >
                {KNOWN_CATEGORIES.map((c) => {
                  const ok = availableCats.has(c.value);
                  return (
                    <option key={c.value} value={c.value} disabled={!ok}>
                      {c.value}
                      {ok ? "" : locale === "ko" ? " (빌드 필요)" : " (build needed)"}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() =>
              setLocale((locale === "ko" ? "en" : "ko") as Locale)
            }
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] transition whitespace-nowrap shrink-0"
            aria-label="Toggle language"
          >
            <Languages className="w-3.5 h-3.5" />
            {ui.localeToggle[locale]}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {isList ? (
          <CandidateGrid candidates={data.whitespace} papers={data.papers} />
        ) : viewMode === "map" ? (
          <>
            <div className="flex-1 relative bg-[hsl(var(--background))]">
              <Map
                cells={data.cells}
                papers={data.papers}
                whitespace={data.whitespace}
                clusters={data.clusters}
              />
              <Onboarding />
            </div>
            <SidePanel
              cells={data.cells}
              papers={data.papers}
              whitespace={data.whitespace}
            />
          </>
        ) : (
          <div className="flex-1 relative bg-[hsl(var(--background))] overflow-hidden">
            <LineageView candidates={data.whitespace} />
          </div>
        )}
      </div>
    </main>
  );
}
