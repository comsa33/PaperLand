"use client";

import { useEffect, useState } from "react";
import { Map } from "@/components/Map";
import { Onboarding } from "@/components/Onboarding";
import { SidePanel } from "@/components/SidePanel";
import { WhitespacePanel } from "@/components/WhitespacePanel";
import { loadMapData } from "@/lib/data";
import type { MapData } from "@/lib/types";

export default function HomePage() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMapData()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-semibold">데이터 로드 실패</h1>
          <p className="text-sm text-[hsl(var(--foreground))]/70">{error}</p>
          <p className="text-xs text-[hsl(var(--foreground))]/60 leading-relaxed">
            먼저 파이프라인을 실행해 픽스처를 생성하세요:
          </p>
          <pre className="text-xs bg-[hsl(var(--muted))] p-3 rounded text-left overflow-x-auto">
{`cd packages/pipeline
uv pip install -e .
paperland fixtures --out ../../apps/web/public/data`}
          </pre>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-[hsl(var(--foreground))]/60">지도 로드 중...</p>
      </main>
    );
  }

  const isFixture = data.manifest.embedding_model.startsWith("synthetic-fixture");

  return (
    <main className="h-screen flex flex-col">
      <header className="px-4 py-2 border-b border-[hsl(var(--border))] flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-sm font-bold tracking-tight">PaperLand</h1>
          <p className="text-[11px] text-[hsl(var(--foreground))]/60 truncate">
            연구 지형도 + 공백 후보 탐지기
          </p>
        </div>
        {isFixture && (
          <div className="px-2.5 py-1 rounded-md text-[10px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 whitespace-nowrap">
            ⚠️ 샘플 데모 데이터 — 실제 arXiv 지형 아님
          </div>
        )}
        <div className="text-[11px] text-[hsl(var(--foreground))]/50 font-mono whitespace-nowrap">
          epoch {data.manifest.map_epoch} · {data.manifest.paper_count}편
          {" · "}
          {data.manifest.categories.join(",")}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <WhitespacePanel candidates={data.whitespace} />
        <div className="flex-1 relative bg-[hsl(var(--background))]">
          <Map
            cells={data.cells}
            papers={data.papers}
            whitespace={data.whitespace}
          />
          <Onboarding />
        </div>
        <SidePanel
          cells={data.cells}
          papers={data.papers}
          whitespace={data.whitespace}
        />
      </div>
    </main>
  );
}
