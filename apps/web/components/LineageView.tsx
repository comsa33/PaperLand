"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUIStore } from "@/lib/store";
import type { WhitespaceCandidate } from "@/lib/types";

interface Props {
  candidates: WhitespaceCandidate[];
}

interface FlowNode {
  id: string;
  title: string;
  year: number;
  cellKey: string;
}

interface Flow {
  id: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  nodes: FlowNode[];
}

const FLOW_COLORS = [
  { color: "#2563eb", bg: "rgba(37,99,235,0.08)", border: "rgba(37,99,235,0.45)" },
  { color: "#16a34a", bg: "rgba(22,163,74,0.08)", border: "rgba(22,163,74,0.45)" },
  { color: "#9333ea", bg: "rgba(147,51,234,0.08)", border: "rgba(147,51,234,0.45)" },
];

// 너무 일반적이라 흐름 라벨로 부적합한 키워드
const WEAK_KEYWORDS = new Set([
  "state art",
  "state of",
  "real world",
  "large scale",
  "open source",
  "low rank",
  "case study",
]);

export function LineageView({ candidates }: Props) {
  const selectedCandidate = useUIStore((s) => s.selectedCandidate);
  const selectCandidate = useUIStore((s) => s.selectCandidate);
  const candidate =
    selectedCandidate ?? (candidates.length > 0 ? candidates[0] : null);

  if (!candidate) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-[hsl(var(--foreground))]/65">
        <p className="text-base">
          좌측 지도 모드에서 공백 후보를 선택한 뒤 다시 들어와 보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[hsl(var(--background))]">
      <div className="max-w-6xl mx-auto px-6 py-5 space-y-4">
        <Header candidate={candidate} />
        <CandidateTabs
          candidates={candidates}
          selectedId={candidate.cell_id}
          onPick={selectCandidate}
        />
        <FlowGraph candidate={candidate} />
      </div>
    </div>
  );
}

function Header({ candidate }: { candidate: WhitespaceCandidate }) {
  const flowLabels = useMemo(() => pickFlowLabels(candidate), [candidate]);
  const sentence = buildOneLineSentence(flowLabels);
  return (
    <header className="space-y-2">
      <p className="text-xs uppercase tracking-wider font-bold text-orange-500">
        연구 흐름 보기
      </p>
      <h2 className="text-xl font-bold leading-snug">
        {sentence}
      </h2>
      <p className="text-sm text-[hsl(var(--foreground))]/65 leading-relaxed">
        {candidate.rationale}
      </p>
      <p className="text-xs text-[hsl(var(--foreground))]/55 italic">
        ※ 연결선은 citation 영향 관계가 아니라, 임베딩 영역의 semantic adjacency 입니다.
      </p>
    </header>
  );
}

function CandidateTabs({
  candidates,
  selectedId,
  onPick,
}: {
  candidates: WhitespaceCandidate[];
  selectedId: string;
  onPick: (c: WhitespaceCandidate) => void;
}) {
  if (candidates.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[hsl(var(--foreground))]/55">다른 후보로 보기 ·</span>
      {candidates.map((c, i) => {
        const active = c.cell_id === selectedId;
        const labels = pickFlowLabels(c).slice(0, 2).join(" × ") || "후보";
        return (
          <button
            key={c.cell_id}
            type="button"
            onClick={() => onPick(c)}
            className={`px-3 py-1 rounded-full border transition ${
              active
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-[hsl(var(--muted))] border-[hsl(var(--border))] hover:border-orange-400"
            }`}
          >
            #{i + 1} {labels}
          </button>
        );
      })}
    </div>
  );
}

function FlowGraph({ candidate }: { candidate: WhitespaceCandidate }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(w);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const flows = useMemo(() => buildFlows(candidate), [candidate]);
  const years = useMemo(() => collectYears(flows), [flows]);

  const layout = useMemo(
    () => computeLayout({ width, years, flows }),
    [width, years, flows]
  );

  return (
    <div ref={wrapRef} className="w-full">
      {flows.length === 0 || years.length === 0 ? (
        <div className="text-sm text-[hsl(var(--foreground))]/65 p-8 text-center border border-dashed border-[hsl(var(--border))] rounded-lg">
          이 후보는 연도 정보가 충분하지 않아 흐름을 그릴 수 없습니다.
        </div>
      ) : (
        <div
          className="relative w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
          style={{ height: layout.height }}
        >
          {/* 연도 축 (상단) */}
          {years.map((y) => (
            <div
              key={y}
              className="absolute top-0 text-xs font-mono font-semibold text-[hsl(var(--foreground))]/60"
              style={{ left: layout.xForYear(y) - 18, width: 36, textAlign: "center" }}
            >
              {y}
            </div>
          ))}

          {/* 연도 점선 가이드 */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={layout.width}
            height={layout.height}
          >
            {years.map((y) => (
              <line
                key={y}
                x1={layout.xForYear(y)}
                y1={28}
                x2={layout.xForYear(y)}
                y2={layout.height - 16}
                stroke="hsl(var(--border))"
                strokeDasharray="2 4"
                strokeWidth={1}
              />
            ))}
            {/* 각 flow의 연결선 + bridge dashed */}
            {flows.map((flow, fi) => {
              const lane = layout.laneY(fi, flows.length);
              const sorted = [...flow.nodes].sort((a, b) => a.year - b.year);
              const last = sorted[sorted.length - 1];
              return (
                <g key={flow.id}>
                  {/* lateral edges */}
                  {sorted.slice(0, -1).map((n, idx) => {
                    const next = sorted[idx + 1];
                    return (
                      <line
                        key={`${n.id}-${next.id}`}
                        x1={layout.xForYear(n.year)}
                        y1={lane}
                        x2={layout.xForYear(next.year)}
                        y2={lane}
                        stroke={flow.color}
                        strokeOpacity={0.4}
                        strokeWidth={2}
                      />
                    );
                  })}
                  {/* bridge dashed */}
                  {last && (
                    <line
                      x1={layout.xForYear(last.year)}
                      y1={lane}
                      x2={layout.bridgeX}
                      y2={layout.bridgeY}
                      stroke="#f59e0b"
                      strokeOpacity={0.6}
                      strokeWidth={1.6}
                      strokeDasharray="6 4"
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* flow 라벨 (왼쪽) */}
          {flows.map((flow, fi) => {
            const lane = layout.laneY(fi, flows.length);
            return (
              <div
                key={`label-${flow.id}`}
                className="absolute text-xs font-bold pointer-events-none"
                style={{
                  left: 12,
                  top: lane - 22,
                  color: flow.color,
                  maxWidth: 140,
                }}
              >
                {flow.label}
              </div>
            );
          })}

          {/* 논문 카드 노드 */}
          {flows.flatMap((flow, fi) => {
            const lane = layout.laneY(fi, flows.length);
            return flow.nodes.map((n) => (
              <PaperCard
                key={`${flow.id}-${n.id}`}
                left={layout.xForYear(n.year) - layout.cardW / 2}
                top={lane - layout.cardH / 2}
                width={layout.cardW}
                height={layout.cardH}
                color={flow.color}
                bg={flow.bg}
                border={flow.border}
                title={n.title}
                year={n.year}
              />
            ));
          })}

          {/* 가운데: 비어 있는 결합 후보 */}
          <BridgeNode
            cx={layout.bridgeX}
            cy={layout.bridgeY}
            summary={candidate.summary}
          />
        </div>
      )}

      {/* 범례 */}
      <Legend flows={flows} />
    </div>
  );
}

function PaperCard({
  left,
  top,
  width,
  height,
  color,
  bg,
  border,
  title,
  year,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  bg: string;
  border: string;
  title: string;
  year: number;
}) {
  const short = title.length > 60 ? title.slice(0, 57) + "…" : title;
  return (
    <div
      title={`${year} · ${title}`}
      className="absolute rounded-md border bg-[hsl(var(--background))] shadow-sm hover:shadow-md transition cursor-help overflow-hidden"
      style={{
        left,
        top,
        width,
        height,
        borderColor: border,
      }}
    >
      <div
        className="px-2 py-0.5 text-[10px] font-mono font-bold text-white"
        style={{ background: color }}
      >
        {year}
      </div>
      <div
        className="px-2 py-1.5 text-[12px] leading-snug font-medium"
        style={{ background: bg, height: height - 16 }}
      >
        {short}
      </div>
    </div>
  );
}

function BridgeNode({
  cx,
  cy,
  summary,
}: {
  cx: number;
  cy: number;
  summary: string;
}) {
  const w = 220;
  const h = 90;
  return (
    <div
      title={summary}
      className="absolute flex flex-col items-center justify-center text-center px-3 rounded-xl border-2 border-dashed border-orange-500 bg-orange-50/95 dark:bg-orange-950/40 shadow-md"
      style={{
        left: cx - w / 2,
        top: cy - h / 2,
        width: w,
        height: h,
      }}
    >
      <p className="text-[11px] font-bold text-orange-600 dark:text-orange-300 uppercase tracking-wider">
        비어 있는 결합 후보
      </p>
      <p className="mt-1 text-[12px] leading-snug font-semibold text-orange-900 dark:text-orange-200 line-clamp-3">
        {summary}
      </p>
    </div>
  );
}

function Legend({ flows }: { flows: Flow[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[hsl(var(--foreground))]/75">
      {flows.map((f) => (
        <span key={f.id} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: f.color }}
          />
          {f.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block w-3 h-3 rounded-full border-2"
          style={{ borderStyle: "dashed", borderColor: "#f59e0b", background: "#fff7ed" }}
        />
        비어 있는 결합 후보
      </span>
    </div>
  );
}

/* ──────────────────── 유틸 ──────────────────── */

function pickFlowLabels(candidate: WhitespaceCandidate): string[] {
  const labels: string[] = [];
  for (const k of candidate.neighbor_keywords) {
    const norm = k.toLowerCase();
    if (WEAK_KEYWORDS.has(norm)) continue;
    if (labels.includes(k)) continue;
    labels.push(k);
    if (labels.length >= 3) break;
  }
  if (labels.length === 0) {
    return candidate.neighbor_keywords.slice(0, 3);
  }
  return labels;
}

function buildOneLineSentence(labels: string[]): string {
  if (labels.length >= 2) {
    return `이 후보는 "${labels[0]}" 흐름과 "${labels[1]}" 흐름 사이에 아직 직접 연결 논문이 적은 영역입니다.`;
  }
  if (labels.length === 1) {
    return `이 후보는 "${labels[0]}" 주변에 직접 연결 논문이 적은 영역입니다.`;
  }
  return "이 후보는 주변 흐름들 사이에 직접 연결 논문이 적은 영역입니다.";
}

function buildFlows(candidate: WhitespaceCandidate): Flow[] {
  // 인접 셀 단위로 그룹 → 가장 풍부한 셀 3개를 flow로
  const byCell: Record<string, FlowNode[]> = {};
  for (const p of candidate.nearest_papers) {
    if (p.year == null) continue;
    const key = p.neighbor_cell || "—";
    if (!byCell[key]) byCell[key] = [];
    byCell[key].push({
      id: p.id,
      title: p.title,
      year: p.year,
      cellKey: key,
    });
  }
  const sortedEntries = Object.entries(byCell)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3);

  const labels = pickFlowLabels(candidate);
  return sortedEntries.map(([key, nodes], i) => {
    const palette = FLOW_COLORS[i % FLOW_COLORS.length];
    return {
      id: key,
      label: labels[i] ?? `흐름 ${i + 1}`,
      color: palette.color,
      bg: palette.bg,
      border: palette.border,
      nodes,
    };
  });
}

function collectYears(flows: Flow[]): number[] {
  const set = new Set<number>();
  for (const f of flows) for (const n of f.nodes) set.add(n.year);
  return Array.from(set).sort((a, b) => a - b);
}

interface Layout {
  width: number;
  height: number;
  cardW: number;
  cardH: number;
  bridgeX: number;
  bridgeY: number;
  xForYear: (y: number) => number;
  laneY: (idx: number, total: number) => number;
}

function computeLayout(args: {
  width: number;
  years: number[];
  flows: Flow[];
}): Layout {
  const containerWidth = Math.max(args.width, 320);
  const cardW = 150;
  const cardH = 56;
  const padLeft = 170; // 흐름 라벨 영역 확보
  const padRight = 24;
  const minX = padLeft + cardW / 2;
  const maxX = containerWidth - padRight - cardW / 2;
  const xForYear = (y: number) => {
    if (args.years.length <= 1) return (minX + maxX) / 2;
    const minY = args.years[0];
    const maxY = args.years[args.years.length - 1];
    if (minY === maxY) return (minX + maxX) / 2;
    const t = (y - minY) / (maxY - minY);
    return minX + t * (maxX - minX);
  };

  // 흐름 lane 배치: 가운데 bridge node 위/아래로 분산
  const totalRows = args.flows.length;
  const flowRowHeight = 100; // 카드 + 여백
  const bridgeHeight = 110;
  const baseTop = 40;
  const stackTop = baseTop;
  const stackBottom = baseTop + totalRows * flowRowHeight + bridgeHeight;
  const height = Math.max(360, stackBottom + 40);
  const bridgeY = baseTop + totalRows * flowRowHeight + bridgeHeight / 2;
  const laneY = (idx: number) =>
    baseTop + idx * flowRowHeight + flowRowHeight / 2;

  return {
    width: containerWidth,
    height,
    cardW,
    cardH,
    bridgeX: containerWidth / 2,
    bridgeY,
    xForYear,
    laneY,
  };
}
