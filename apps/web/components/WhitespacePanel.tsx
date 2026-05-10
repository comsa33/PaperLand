"use client";

import { useUIStore } from "@/lib/store";
import type { WhitespaceCandidate } from "@/lib/types";
import { Compass } from "lucide-react";

interface Props {
  candidates: WhitespaceCandidate[];
}

export function WhitespacePanel({ candidates }: Props) {
  const whitespaceMode = useUIStore((s) => s.whitespaceMode);
  const setWhitespaceMode = useUIStore((s) => s.setWhitespaceMode);
  const selectedCandidate = useUIStore((s) => s.selectedCandidate);
  const selectCandidate = useUIStore((s) => s.selectCandidate);

  return (
    <aside className="w-80 border-r border-[hsl(var(--border))] bg-[hsl(var(--muted))] flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-2 mb-2">
          <Compass className="w-4 h-4 text-orange-500" />
          <h2 className="text-sm font-semibold">공백 후보 Top 10</h2>
        </div>
        <p className="text-[11px] text-[hsl(var(--foreground))]/65 leading-relaxed">
          <b>주변은 활발한데 자기 셀만 비어있는 영역</b>입니다.
          이미 점유된 영토 사이의 빈틈이 가장 발견 가치 높은 후보입니다.
        </p>
        <label
          className={`flex items-center gap-2 mt-3 text-xs cursor-pointer rounded px-2 py-1.5 transition ${
            whitespaceMode
              ? "bg-orange-500/15 border border-orange-500/30"
              : "bg-[hsl(var(--background))] border border-[hsl(var(--border))]"
          }`}
        >
          <input
            type="checkbox"
            checked={whitespaceMode}
            onChange={(e) => setWhitespaceMode(e.target.checked)}
            className="accent-orange-500"
          />
          <span className="font-medium">공백 후보 모드 (지도에서 강조)</span>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {candidates.length === 0 && (
          <div className="p-4 text-xs text-[hsl(var(--foreground))]/50">
            후보 없음
          </div>
        )}
        <ul className="divide-y divide-[hsl(var(--border))]">
          {candidates.map((c, i) => {
            const active = selectedCandidate?.cell_id === c.cell_id;
            return (
              <li key={c.cell_id}>
                <button
                  type="button"
                  className={`w-full text-left px-4 py-3 transition hover:bg-[hsl(var(--background))]/50 ${
                    active ? "bg-[hsl(var(--background))]" : ""
                  }`}
                  onClick={() => selectCandidate(c)}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[11px] font-mono text-[hsl(var(--foreground))]/45 mt-0.5">
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold leading-snug line-clamp-2">
                        {c.summary || "주변 분야 대비 저밀도 영역"}
                      </p>
                      {c.nearest_papers.length > 0 && (
                        <p className="mt-1 text-[11px] text-[hsl(var(--foreground))]/55 line-clamp-1">
                          예: {c.nearest_papers[0].title}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[hsl(var(--foreground))]/45">
                        <span title="공백 후보 점수 (근거 강도)">
                          근거 {c.score.toFixed(1)}
                        </span>
                        <span>·</span>
                        <span>이웃 ~{c.neighbor_density.toFixed(0)}편 vs 자기 {c.own_count}편</span>
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
