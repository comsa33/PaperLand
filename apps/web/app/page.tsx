"use client";

import { GitBranch, Languages, Map as MapIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LineageView } from "@/components/LineageView";
import { Map } from "@/components/Map";
import { Onboarding } from "@/components/Onboarding";
import { SidePanel } from "@/components/SidePanel";
import { WhitespacePanel } from "@/components/WhitespacePanel";
import { loadMapData } from "@/lib/data";
import { ui, type Locale } from "@/lib/i18n";
import { hydrateLocale, useUIStore } from "@/lib/store";
import type { MapData } from "@/lib/types";

export default function HomePage() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectCandidate = useUIStore((s) => s.selectCandidate);
  const locale = useUIStore((s) => s.locale);
  const setLocale = useUIStore((s) => s.setLocale);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const initialSelectedRef = useRef(false);

  useEffect(() => {
    hydrateLocale();
    loadMapData()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  // 첫 진입 시 #1 후보를 자동 선택 — 빈 상세 패널로 시작하지 않게.
  useEffect(() => {
    if (!data || initialSelectedRef.current) return;
    if (data.whitespace.length > 0) {
      selectCandidate(data.whitespace[0]);
      initialSelectedRef.current = true;
    }
  }, [data, selectCandidate]);

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

  return (
    <main className="h-screen flex flex-col">
      <header className="px-5 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-base font-bold tracking-tight">{ui.appTitle[locale]}</h1>
          <p className="text-sm text-[hsl(var(--foreground))]/65 truncate hidden md:block">
            {ui.appSubtitle[locale]}
          </p>
        </div>

        <nav className="flex items-center gap-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-0.5">
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
            {locale === "ko" ? "지도 모드" : "Map"}
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
            {locale === "ko" ? "연구 흐름 보기" : "Research flow"}
          </button>
        </nav>
        {isFixture && (
          <div className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 whitespace-nowrap">
            {ui.fixtureBadge[locale]}
          </div>
        )}
        <div className="flex items-center gap-3">
          <div
            className="text-xs text-[hsl(var(--foreground))]/55 font-mono whitespace-nowrap hidden lg:block max-w-[20rem] truncate"
            title={data.manifest.categories.join(", ")}
          >
            epoch {data.manifest.map_epoch} · {data.manifest.paper_count}편 ·{" "}
            {data.manifest.categories.length === 1
              ? data.manifest.categories[0]
              : `cs.CL primary · ${data.manifest.categories.length} cats`}
          </div>
          <button
            type="button"
            onClick={() =>
              setLocale((locale === "ko" ? "en" : "ko") as Locale)
            }
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] transition"
            aria-label="Toggle language"
          >
            <Languages className="w-3.5 h-3.5" />
            {ui.localeToggle[locale]}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {viewMode === "map" ? (
          <>
            <WhitespacePanel candidates={data.whitespace} />
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
          // 흐름 보기: 양쪽 패널을 숨겨 가운데 풀폭으로 사용
          <div className="flex-1 relative bg-[hsl(var(--background))] overflow-hidden">
            <LineageView candidates={data.whitespace} />
          </div>
        )}
      </div>
    </main>
  );
}
