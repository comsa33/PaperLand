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
          <Compass className="w-4 h-4 text-[hsl(var(--accent))]" />
          <h2 className="text-sm font-semibold">공백 후보 Top 10</h2>
        </div>
        <p className="text-[11px] text-[hsl(var(--foreground))]/60 leading-relaxed">
          수집 데이터 기준 저밀도 영역. 단정이 아닌 후보 제시이며,
          실제 연구 가치는 별도 검토가 필요합니다.
        </p>
        <label className="flex items-center gap-2 mt-3 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={whitespaceMode}
            onChange={(e) => setWhitespaceMode(e.target.checked)}
            className="accent-orange-400"
          />
          <span>공백 후보 모드</span>
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
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-mono text-[hsl(var(--foreground))]/60">
                      #{i + 1}
                    </span>
                    <span className="text-[11px] text-[hsl(var(--accent))]">
                      score {c.score.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed line-clamp-2">
                    {c.neighbor_keywords.slice(0, 3).join(" · ") || "키워드 정보 없음"}
                  </p>
                  <p className="mt-1 text-[11px] text-[hsl(var(--foreground))]/50">
                    이웃 평균 {c.neighbor_density.toFixed(1)}편 · 자기 셀 {c.own_count}편
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
