"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pickBridgeText, pickCandidateText, ui } from "@/lib/i18n";
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
  const locale = useUIStore((s) => s.locale);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const candidate = selectedCandidate; // fallback 제거 — 임의 후보 노출 차단

  if (!candidate) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[hsl(var(--foreground))]/65 p-8 text-center">
        <p className="text-base">
          {locale === "ko"
            ? "선택된 공백 후보가 없습니다. 후보 카드에서 하나를 선택하면 흐름이 열립니다."
            : "No candidate is selected. Pick one from the candidate cards to open the flow."}
        </p>
        <button
          type="button"
          onClick={() => setViewMode("map")}
          className="px-3 py-1.5 rounded text-sm font-semibold border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] transition"
        >
          {locale === "ko" ? "← 지도로 돌아가기" : "← Back to the map"}
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[hsl(var(--background))]">
      <div className="max-w-6xl mx-auto px-6 py-5 space-y-4">
        <button
          type="button"
          onClick={() => setViewMode("map")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-semibold border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] transition"
        >
          {locale === "ko" ? "← 지도로 돌아가기" : "← Back to the map"}
        </button>
        <Header candidate={candidate} locale={locale} />
        <CandidateTabs
          candidates={candidates}
          selectedId={candidate.cell_id}
          onPick={selectCandidate}
          locale={locale}
        />
        <EvidenceSummary candidate={candidate} locale={locale} />
        <details className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-bold text-[hsl(var(--foreground))]/80 hover:bg-[hsl(var(--background))]/50 rounded-lg">
            {ui.detailsToggle[locale]}
          </summary>
          <div className="px-4 pb-4 pt-2">
            <FlowGraph candidate={candidate} locale={locale} />
          </div>
        </details>
      </div>
    </div>
  );
}

function EvidenceSummary({
  candidate,
  locale,
}: {
  candidate: WhitespaceCandidate;
  locale: "ko" | "en";
}) {
  const labels = pickFlowLabels(candidate);
  const flowA = labels[0] ?? (locale === "ko" ? "흐름 A" : "Flow A");
  const flowB = labels[1] ?? (locale === "ko" ? "흐름 B" : "Flow B");
  const bridge = labels[2] ?? "";
  const ratio =
    candidate.neighbor_density > 0
      ? candidate.own_count / candidate.neighbor_density
      : null;
  return (
    <section className="rounded-lg border border-orange-300/40 bg-orange-50/30 dark:bg-orange-950/15 p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <FlowChip label={ui.flowAGroup[locale]} text={flowA} tone="blue" />
        <FlowChip
          label={ui.crossingAxis[locale]}
          text={bridge || (locale === "ko" ? "(직접 결합)" : "(direct bridge)")}
          tone="orange"
        />
        <FlowChip label={ui.flowBGroup[locale]} text={flowB} tone="green" />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-[hsl(var(--foreground))]/70 border-t border-orange-300/30 pt-3">
        <span>
          {locale === "ko" ? "이 셀" : "self"}{" "}
          <b className="font-bold text-[hsl(var(--foreground))]">
            {candidate.own_count}
          </b>
        </span>
        <span>
          {locale === "ko" ? "이웃 평균" : "neighbor avg"}{" "}
          <b className="font-bold text-[hsl(var(--foreground))]">
            {candidate.neighbor_density.toFixed(1)}
          </b>
        </span>
        {ratio !== null && (
          <span>
            {locale === "ko" ? "비율" : "ratio"}{" "}
            <b className="font-bold text-orange-700 dark:text-orange-300">
              {ratio.toFixed(2)}
            </b>
          </span>
        )}
        <span>
          {locale === "ko" ? "인접 논문" : "adjacent papers"}{" "}
          <b className="font-bold text-[hsl(var(--foreground))]">
            {candidate.nearest_papers.length}
          </b>
        </span>
      </div>
    </section>
  );
}

function FlowChip({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "blue" | "green" | "orange";
}) {
  const ring =
    tone === "blue"
      ? "border-blue-400/50 bg-blue-50/40 dark:bg-blue-950/20"
      : tone === "green"
        ? "border-green-400/50 bg-green-50/40 dark:bg-green-950/20"
        : "border-orange-400 bg-orange-100/60 dark:bg-orange-950/30";
  const accent =
    tone === "blue"
      ? "text-blue-700 dark:text-blue-300"
      : tone === "green"
        ? "text-green-700 dark:text-green-300"
        : "text-orange-700 dark:text-orange-300";
  return (
    <div className={`rounded-md border p-3 ${ring}`}>
      <p className={`text-[11px] uppercase tracking-wider font-bold ${accent}`}>
        {label}
      </p>
      <p className="mt-1 text-sm font-bold leading-snug text-[hsl(var(--foreground))]/90">
        {text}
      </p>
    </div>
  );
}

function Header({
  candidate,
  locale,
}: {
  candidate: WhitespaceCandidate;
  locale: "ko" | "en";
}) {
  const flowLabels = useMemo(() => pickFlowLabels(candidate), [candidate]);
  const sentence = buildOneLineSentence(flowLabels, locale);
  const rationale = pickCandidateText(candidate, locale, "rationale");
  return (
    <header className="space-y-2">
      <p className="text-xs uppercase tracking-wider font-bold text-orange-500">
        {ui.whyGapTitle[locale]}
      </p>
      <h2 className="text-xl font-bold leading-snug">{sentence}</h2>
      <p className="text-sm text-[hsl(var(--foreground))]/65 leading-relaxed">
        {rationale}
      </p>
      <p className="text-xs text-[hsl(var(--foreground))]/55 italic">
        {locale === "ko"
          ? "※ 연결선은 citation 영향 관계가 아니라, 임베딩 영역의 semantic adjacency 입니다."
          : "* Edges are not citation-based influence; they reflect semantic adjacency in embedding space."}
      </p>
    </header>
  );
}

function CandidateTabs({
  candidates,
  selectedId,
  onPick,
  locale,
}: {
  candidates: WhitespaceCandidate[];
  selectedId: string;
  onPick: (c: WhitespaceCandidate) => void;
  locale: "ko" | "en";
}) {
  if (candidates.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[hsl(var(--foreground))]/55">
        {locale === "ko" ? "다른 후보로 보기 ·" : "Other candidates ·"}
      </span>
      {candidates.map((c, i) => {
        const active = c.cell_id === selectedId;
        const labels =
          pickFlowLabels(c).slice(0, 2).join(" × ") ||
          (locale === "ko" ? "후보" : "Candidate");
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

function FlowGraph({
  candidate,
  locale,
}: {
  candidate: WhitespaceCandidate;
  locale: "ko" | "en";
}) {
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
          {locale === "ko"
            ? "이 후보는 연도 정보가 충분하지 않아 흐름을 그릴 수 없습니다."
            : "This candidate has insufficient year info to render a flow."}
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
            summary={pickCandidateText(candidate, locale, "summary")}
            locale={locale}
          />
        </div>
      )}

      {/* 범례 */}
      <Legend flows={flows} locale={locale} />

      {/* 왜 빈틈인가 — 해석 블록 */}
      {flows.length >= 2 && (
        <Interpretation candidate={candidate} flows={flows} locale={locale} />
      )}
    </div>
  );
}

function Interpretation({
  candidate,
  flows,
  locale,
}: {
  candidate: WhitespaceCandidate;
  flows: Flow[];
  locale: "ko" | "en";
}) {
  const flowA = flows[0]?.label ?? (locale === "ko" ? "흐름 A" : "Flow A");
  const flowB = flows[1]?.label ?? (locale === "ko" ? "흐름 B" : "Flow B");
  const yearsA = flows[0]?.nodes.map((n) => n.year) ?? [];
  const yearsB = flows[1]?.nodes.map((n) => n.year) ?? [];
  const spanA = yearsA.length
    ? `${Math.min(...yearsA)}–${Math.max(...yearsA)}`
    : "—";
  const spanB = yearsB.length
    ? `${Math.min(...yearsB)}–${Math.max(...yearsB)}`
    : "—";
  const bridge = pickBridgeText(candidate.lineage, locale);
  return (
    <div className="mt-4 p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
      <p className="text-xs font-bold text-[hsl(var(--foreground))]/70 uppercase tracking-wider mb-2">
        {locale === "ko" ? "왜 이 흐름 사이가 빈틈인가" : "Why this is a gap"}
      </p>
      <ul className="text-sm leading-relaxed text-[hsl(var(--foreground))]/85 space-y-1.5">
        {bridge && <li>· {bridge}</li>}
        <li>
          {locale === "ko" ? (
            <>
              · &quot;{flowA}&quot; 흐름은 {spanA}에 {yearsA.length}편, &quot;
              {flowB}&quot; 흐름은 {spanB}에 {yearsB.length}편이 인접 영역에서
              관찰됩니다.
            </>
          ) : (
            <>
              · The &quot;{flowA}&quot; flow has {yearsA.length} adjacent papers
              spanning {spanA}; the &quot;{flowB}&quot; flow has {yearsB.length}{" "}
              spanning {spanB}.
            </>
          )}
        </li>
        <li>
          {locale === "ko" ? (
            <>
              · 같은 시기를 지나면서도 두 흐름을 직접 묶은 논문은 이 셀 기준{" "}
              {candidate.own_count}편 (이웃 평균은{" "}
              {candidate.neighbor_density.toFixed(1)}편).
            </>
          ) : (
            <>
              · Despite the overlapping period, only {candidate.own_count}{" "}
              paper(s) in this cell directly combine the two flows (neighbor avg{" "}
              {candidate.neighbor_density.toFixed(1)}).
            </>
          )}
        </li>
        <li>
          {locale === "ko"
            ? "· 위 흐름 노드 중 어느 페어를 직접 연결하는 시도를 한다면, 현재 데이터 기준 직접 결합 사례가 적어 novelty 방어가 상대적으로 수월할 가능성이 있습니다 (※ 실제 검증은 Scholar 검색 필요)."
            : "· Bridging any pair of the above flow nodes directly would face few prior combinations in the collected data, so novelty arguments may hold up better (* always verify on Scholar)."}
        </li>
      </ul>
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
  return (
    <div
      title={`${year} · ${title}`}
      className="absolute rounded-md border bg-[hsl(var(--background))] shadow-sm hover:shadow-md hover:z-30 transition cursor-help overflow-hidden"
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
        className="px-2 py-1.5 text-[12px] leading-snug font-medium overflow-hidden"
        style={{ background: bg, height: height - 16 }}
      >
        <span className="line-clamp-3">{title}</span>
      </div>
    </div>
  );
}

function BridgeNode({
  cx,
  cy,
  summary,
  locale,
}: {
  cx: number;
  cy: number;
  summary: string;
  locale: "ko" | "en";
}) {
  const w = 320;
  const h = 110;
  return (
    <div
      title={summary}
      className="absolute flex flex-col items-center justify-center text-center px-4 rounded-xl border-2 border-dashed border-orange-500 bg-orange-50/95 dark:bg-orange-950/40 shadow-lg z-20"
      style={{
        left: cx - w / 2,
        top: cy - h / 2,
        width: w,
        height: h,
      }}
    >
      <p className="text-[11px] font-bold text-orange-600 dark:text-orange-300 uppercase tracking-wider">
        {locale === "ko" ? "덜 탐색된 결합" : "Underexplored bridge"}
      </p>
      <p className="mt-1.5 text-[13px] leading-snug font-semibold text-orange-900 dark:text-orange-200">
        {summary}
      </p>
    </div>
  );
}

function Legend({ flows, locale }: { flows: Flow[]; locale: "ko" | "en" }) {
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
        {locale === "ko" ? "덜 탐색된 결합" : "Underexplored bridge"}
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

function buildOneLineSentence(labels: string[], locale: "ko" | "en"): string {
  if (locale === "en") {
    if (labels.length >= 3) {
      return `Few papers directly combine "${labels[0]}" × "${labels[1]}" × "${labels[2]}" in this area.`;
    }
    if (labels.length === 2) {
      return `Few papers directly bridge the "${labels[0]}" flow and the "${labels[1]}" flow in this area.`;
    }
    if (labels.length === 1) {
      return `Few papers directly study around "${labels[0]}" in this area.`;
    }
    return "Few papers directly bridge the surrounding flows in this area.";
  }
  if (labels.length >= 3) {
    return `"${labels[0]}" × "${labels[1]}" × "${labels[2]}" 결합이 주변 대비 적은 영역입니다.`;
  }
  if (labels.length === 2) {
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
  const cardW = 180;
  const cardH = 86;
  const padLeft = 180; // 흐름 라벨 영역 확보
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
  const flowRowHeight = 130; // 카드(86) + 여백
  const bridgeHeight = 130;
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
