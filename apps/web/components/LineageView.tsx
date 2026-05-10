"use client";

import { useMemo } from "react";
import { useUIStore } from "@/lib/store";
import type { WhitespaceCandidate } from "@/lib/types";

interface Props {
  candidates: WhitespaceCandidate[];
}

interface FlowNode {
  id: string;
  title: string;
  year: number;
  flowIdx: number;
  cluster: string;
}

interface Flow {
  id: string;
  label: string;
  color: string;
  nodes: FlowNode[];
}

const FLOW_COLORS = ["#3b82f6", "#10b981", "#a855f7"];

export function LineageView({ candidates }: Props) {
  const selectedCandidate = useUIStore((s) => s.selectedCandidate);
  const selectCandidate = useUIStore((s) => s.selectCandidate);
  const candidate =
    selectedCandidate ?? (candidates.length > 0 ? candidates[0] : null);

  if (!candidate) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-[hsl(var(--foreground))]/60">
        <p className="text-sm">좌측에서 공백 후보를 선택하면 흐름이 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-auto bg-[hsl(var(--background))]">
      <LineageGraph candidate={candidate} />
      <div className="px-6 pb-6 pt-2 max-w-4xl mx-auto">
        <CandidatePicker
          candidates={candidates}
          selectedId={candidate.cell_id}
          onPick={selectCandidate}
        />
      </div>
    </div>
  );
}

function LineageGraph({ candidate }: { candidate: WhitespaceCandidate }) {
  const { flows, years, height, width } = useMemo(
    () => buildLayout(candidate),
    [candidate]
  );

  const xForYear = (y: number) => {
    if (years.length === 0) return width / 2;
    if (years.length === 1) return width / 2;
    const minY = years[0];
    const maxY = years[years.length - 1];
    if (minY === maxY) return width / 2;
    const t = (y - minY) / (maxY - minY);
    return 80 + t * (width - 160);
  };
  const centerX = width / 2;
  const centerY = height / 2;

  return (
    <div className="px-6 pt-4 pb-2 max-w-5xl mx-auto">
      <header className="mb-3">
        <p className="text-xs uppercase tracking-wider font-semibold text-orange-500">
          계보 모드 — 선택 후보의 인접 흐름
        </p>
        <h2 className="text-lg font-bold leading-snug mt-1">
          {candidate.summary}
        </h2>
        <p className="text-xs text-[hsl(var(--foreground))]/55 italic mt-1">
          ※ 연결선은 citation 영향 관계가 아니라 임베딩 영역의 semantic adjacency 입니다.
        </p>
      </header>

      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="border border-[hsl(var(--border))] rounded-md bg-[hsl(var(--muted))]"
      >
        {/* 연도 축 */}
        {years.map((y) => (
          <g key={y}>
            <line
              x1={xForYear(y)}
              y1={50}
              x2={xForYear(y)}
              y2={height - 30}
              stroke="hsl(var(--border))"
              strokeDasharray="2 4"
              strokeWidth={1}
            />
            <text
              x={xForYear(y)}
              y={30}
              textAnchor="middle"
              className="fill-current text-[hsl(var(--foreground))]/60 font-mono"
              fontSize={12}
              fontWeight={600}
            >
              {y}
            </text>
          </g>
        ))}

        {/* 각 flow의 노드 + 연결선 */}
        {flows.map((flow, fi) => {
          const flowY = laneY(fi, flows.length, height);
          const sortedNodes = [...flow.nodes].sort((a, b) => a.year - b.year);
          return (
            <g key={flow.id}>
              <text
                x={20}
                y={flowY + 5}
                className="fill-current"
                fontSize={11}
                fontWeight={600}
                fill={flow.color}
              >
                {flow.label}
              </text>
              {/* 흐름 내 lateral edge */}
              {sortedNodes.length > 1 &&
                sortedNodes
                  .slice(0, -1)
                  .map((n, idx) => {
                    const next = sortedNodes[idx + 1];
                    return (
                      <line
                        key={`${n.id}-${next.id}`}
                        x1={xForYear(n.year)}
                        y1={flowY}
                        x2={xForYear(next.year)}
                        y2={flowY}
                        stroke={flow.color}
                        strokeOpacity={0.5}
                        strokeWidth={2}
                      />
                    );
                  })}
              {/* 가장 가까운 노드들 → 가운데 후보로 가는 점선 */}
              {sortedNodes.slice(-1).map((n) => (
                <line
                  key={`bridge-${n.id}`}
                  x1={xForYear(n.year)}
                  y1={flowY}
                  x2={centerX}
                  y2={centerY}
                  stroke="#f59e0b"
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              ))}
              {sortedNodes.map((n) => (
                <PaperDot
                  key={n.id}
                  x={xForYear(n.year)}
                  y={flowY}
                  color={flow.color}
                  title={n.title}
                  year={n.year}
                />
              ))}
            </g>
          );
        })}

        {/* 가운데: 공백 후보 노드 */}
        <BridgeNode cx={centerX} cy={centerY} candidate={candidate} />
      </svg>

      <Legend flows={flows} />
    </div>
  );
}

function PaperDot({
  x,
  y,
  color,
  title,
  year,
}: {
  x: number;
  y: number;
  color: string;
  title: string;
  year: number;
}) {
  return (
    <g>
      <title>
        {year} · {title}
      </title>
      <circle cx={x} cy={y} r={8} fill={color} fillOpacity={0.85} />
      <circle cx={x} cy={y} r={8} fill="none" stroke="white" strokeWidth={1.5} />
    </g>
  );
}

function BridgeNode({
  cx,
  cy,
  candidate,
}: {
  cx: number;
  cy: number;
  candidate: WhitespaceCandidate;
}) {
  return (
    <g>
      <title>{candidate.summary}</title>
      <circle
        cx={cx}
        cy={cy}
        r={42}
        fill="#fff7ed"
        fillOpacity={0.95}
        stroke="#f59e0b"
        strokeWidth={2.5}
        strokeDasharray="6 5"
      />
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill="#9a3412"
      >
        비어 있는
      </text>
      <text
        x={cx}
        y={cy + 11}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill="#9a3412"
      >
        결합 후보
      </text>
    </g>
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
          className="inline-block w-3 h-3 rounded-full border-2 border-orange-500"
          style={{ borderStyle: "dashed", background: "#fff7ed" }}
        />
        비어 있는 결합 후보
      </span>
    </div>
  );
}

function CandidatePicker({
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
    <div className="mt-2">
      <p className="text-xs font-semibold text-[hsl(var(--foreground))]/65 mb-2">
        다른 후보로 흐름 보기
      </p>
      <div className="flex flex-wrap gap-2">
        {candidates.map((c, i) => {
          const active = c.cell_id === selectedId;
          return (
            <button
              key={c.cell_id}
              type="button"
              onClick={() => onPick(c)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                active
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-[hsl(var(--muted))] border-[hsl(var(--border))] hover:border-orange-400"
              }`}
            >
              #{i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────── 레이아웃 헬퍼 ─────────────────── */

function buildLayout(candidate: WhitespaceCandidate) {
  // nearest_papers 를 neighbor_cell 별로 그룹 → 최대 2~3 flows
  const byCell: Record<string, FlowNode[]> = {};
  for (const p of candidate.nearest_papers) {
    if (p.year == null) continue;
    const flowKey = p.neighbor_cell || "—";
    byCell[flowKey] = byCell[flowKey] ?? [];
    byCell[flowKey].push({
      id: p.id,
      title: p.title,
      year: p.year,
      flowIdx: 0,
      cluster: flowKey,
    });
  }
  const cellEntries = Object.entries(byCell).slice(0, 3);
  const flows: Flow[] = cellEntries.map(([cellId, nodes], i) => ({
    id: cellId,
    label: candidate.neighbor_keywords[i] ?? `흐름 ${i + 1}`,
    color: FLOW_COLORS[i % FLOW_COLORS.length],
    nodes,
  }));

  // 연도 축 — 모든 flow 공통
  const yearSet = new Set<number>();
  for (const f of flows) for (const n of f.nodes) yearSet.add(n.year);
  const years = Array.from(yearSet).sort((a, b) => a - b);

  const width = 880;
  const height = Math.max(360, 200 + flows.length * 90);
  return { flows, years, width, height };
}

function laneY(idx: number, total: number, height: number): number {
  // 가운데 후보 노드를 피해서 위/아래로 분포
  const top = 90;
  const bottom = height - 60;
  if (total === 1) return (top + bottom) / 2;
  const span = bottom - top;
  return top + (span / (total - 1)) * idx;
}
