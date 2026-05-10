"use client";

import { useEffect, useRef, useState } from "react";
import { Map } from "@/components/Map";
import { Onboarding } from "@/components/Onboarding";
import { SidePanel } from "@/components/SidePanel";
import { WhitespacePanel } from "@/components/WhitespacePanel";
import { loadMapData } from "@/lib/data";
import { useUIStore } from "@/lib/store";
import type { MapData } from "@/lib/types";

export default function HomePage() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectCandidate = useUIStore((s) => s.selectCandidate);
  const initialSelectedRef = useRef(false);

  useEffect(() => {
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
          <h1 className="text-xl font-bold">데이터 로드 실패</h1>
          <p className="text-base text-[hsl(var(--foreground))]/70">{error}</p>
          <p className="text-sm text-[hsl(var(--foreground))]/60 leading-relaxed">
            먼저 파이프라인을 실행해 픽스처를 생성하세요:
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
        <p className="text-base text-[hsl(var(--foreground))]/65">지도 로드 중…</p>
      </main>
    );
  }

  const isFixture = data.manifest.embedding_model.startsWith("synthetic-fixture");

  return (
    <main className="h-screen flex flex-col">
      <header className="px-5 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-base font-bold tracking-tight">PaperLand</h1>
          <p className="text-sm text-[hsl(var(--foreground))]/65 truncate hidden md:block">
            연구 지형도 + 공백 후보 탐지기
          </p>
        </div>
        {isFixture && (
          <div className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 whitespace-nowrap">
            ⚠️ 샘플 데모 — 실제 arXiv 지형 아님
          </div>
        )}
        <div className="text-xs text-[hsl(var(--foreground))]/55 font-mono whitespace-nowrap hidden lg:block">
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
            clusters={data.clusters}
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
