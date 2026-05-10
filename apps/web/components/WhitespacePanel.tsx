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
    <aside className="w-[26rem] border-r border-[hsl(var(--border))] bg-[hsl(var(--muted))] flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-2 mb-2">
          <Compass className="w-5 h-5 text-orange-500" />
          <h2 className="text-base font-bold">
            검출된 공백 후보 {candidates.length}개
          </h2>
        </div>
        <p className="text-sm text-[hsl(var(--foreground))]/70 leading-relaxed">
          <b>주변은 활발한데 자기 셀만 비어있는 영역</b>입니다.
          이미 점유된 영토 사이의 빈틈이 가장 발견 가치 높은 후보입니다.
        </p>
        <label
          className={`flex items-center gap-2 mt-3 text-sm cursor-pointer rounded-md px-3 py-2 transition ${
            whitespaceMode
              ? "bg-orange-500/15 border border-orange-500/40"
              : "bg-[hsl(var(--background))] border border-[hsl(var(--border))]"
          }`}
        >
          <input
            type="checkbox"
            checked={whitespaceMode}
            onChange={(e) => setWhitespaceMode(e.target.checked)}
            className="w-4 h-4 accent-orange-500"
          />
          <span className="font-semibold">공백 후보 모드 — 지도에서 강조</span>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {candidates.length === 0 && (
          <div className="p-5 text-sm text-[hsl(var(--foreground))]/55">
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
                  className={`w-full text-left px-5 py-4 transition hover:bg-[hsl(var(--background))]/60 ${
                    active ? "bg-[hsl(var(--background))]" : ""
                  }`}
                  onClick={() => selectCandidate(c)}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-mono font-semibold ${
                        active
                          ? "bg-orange-500 text-white"
                          : "bg-[hsl(var(--background))] text-[hsl(var(--foreground))]/55 border border-[hsl(var(--border))]"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold leading-snug">
                        {c.summary || "주변 분야 대비 직접 연구가 적은 영역"}
                      </p>
                      {c.nearest_papers.length > 0 && (
                        <p className="mt-1.5 text-sm text-[hsl(var(--foreground))]/65 line-clamp-1">
                          예: {c.nearest_papers[0].title}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-xs text-[hsl(var(--foreground))]/50">
                        <span title="공백 후보 점수 (근거 강도)">
                          근거 {c.score.toFixed(1)}
                        </span>
                        <span>·</span>
                        <span>
                          이웃 ~{c.neighbor_density.toFixed(0)}편 vs 자기{" "}
                          {c.own_count}편
                        </span>
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
