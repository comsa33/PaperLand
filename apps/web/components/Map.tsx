"use client";

import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import DeckGL from "@deck.gl/react";
import { useMemo } from "react";

import { useUIStore } from "@/lib/store";
import type {
  Cell,
  ClusterLabel,
  PaperPoint,
  WhitespaceCandidate,
} from "@/lib/types";

interface MapProps {
  cells: Cell[];
  papers: PaperPoint[];
  whitespace: WhitespaceCandidate[];
  clusters: Record<string, ClusterLabel>;
}

interface RegionLabel {
  id: string;
  label: string;
  x: number;
  y: number;
  count: number;
}

export function Map({ cells, papers, whitespace, clusters }: MapProps) {
  const selectedCellId = useUIStore((s) => s.selectedCellId);
  const selectCell = useUIStore((s) => s.selectCell);
  const selectCandidate = useUIStore((s) => s.selectCandidate);
  const locale = useUIStore((s) => s.locale);

  const whitespaceCellIds = useMemo(
    () => new Set(whitespace.map((w) => w.cell_id)),
    [whitespace]
  );

  const regionLabels = useMemo<RegionLabel[]>(() => {
    const all: RegionLabel[] = [];
    for (const [cid, c] of Object.entries(clusters)) {
      if (
        c.label &&
        typeof c.centroid_x === "number" &&
        typeof c.centroid_y === "number"
      ) {
        all.push({
          id: cid,
          label: c.label,
          x: c.centroid_x,
          y: c.centroid_y,
          count: c.paper_count ?? 0,
        });
      }
    }
    if (all.length === 0) return all;
    // Greedy collision avoidance — 큰 클러스터부터 배치, 너무 가까우면 작은 쪽 라벨 숨김.
    // 임계값은 데이터 범위의 일정 비율 (zoom 무관 단순 휴리스틱).
    const xs = all.map((r) => r.x);
    const ys = all.map((r) => r.y);
    const range = Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      1
    );
    const minDist = range * 0.07;
    const sorted = [...all].sort((a, b) => b.count - a.count);
    const placed: RegionLabel[] = [];
    for (const cand of sorted) {
      const tooClose = placed.some((p) => {
        const dx = p.x - cand.x;
        const dy = p.y - cand.y;
        return Math.sqrt(dx * dx + dy * dy) < minDist;
      });
      if (!tooClose) placed.push(cand);
    }
    return placed;
  }, [clusters]);

  const initialViewState = useMemo(() => {
    if (cells.length === 0) {
      return { longitude: 0, latitude: 0, zoom: 5, pitch: 0, bearing: 0 };
    }
    const avgLng = cells.reduce((s, c) => s + c.centroid_x, 0) / cells.length;
    const avgLat = cells.reduce((s, c) => s + c.centroid_y, 0) / cells.length;
    return {
      longitude: avgLng,
      latitude: avgLat,
      zoom: 5.5,
      pitch: 0,
      bearing: 0,
    };
  }, [cells]);

  const layers = useMemo(() => {
    const maxCount = Math.max(1, ...cells.map((c) => c.paper_count));

    const cellLayer = new H3HexagonLayer<Cell>({
      id: "cells",
      data: cells,
      getHexagon: (d) => d.cell_id,
      pickable: true,
      filled: true,
      extruded: false,
      stroked: true,
      lineWidthMinPixels: 1,
      getFillColor: (d) => {
        const isWS = whitespaceCellIds.has(d.cell_id);
        const isSelected = selectedCellId === d.cell_id;
        const dim = selectedCellId && !isSelected ? 0.5 : 1.0;
        if (isWS) {
          return [255, 140, 0, Math.round(210 * dim)];
        }
        const intensity = Math.min(1, d.paper_count / maxCount);
        const r = Math.floor(40 + (1 - intensity) * 80);
        const g = Math.floor(80 + (1 - intensity) * 60);
        const b = Math.floor(255 - intensity * 30);
        return [r, g, b, Math.round(180 * dim)];
      },
      getLineColor: (d) =>
        whitespaceCellIds.has(d.cell_id)
          ? [255, 180, 50, 230]
          : [180, 200, 230, 70],
      onClick: (info) => {
        const cell = info.object as Cell | undefined;
        if (!cell?.cell_id) {
          selectCell(null);
          return;
        }
        // 공백 후보 셀이면 selectedCandidate까지 함께 설정 — 흐름 탭이 자동 활성.
        const cand = whitespace.find((w) => w.cell_id === cell.cell_id);
        if (cand) selectCandidate(cand);
        else selectCell(cell.cell_id);
      },
      updateTriggers: {
        getFillColor: [selectedCellId, whitespaceCellIds],
        getLineColor: [whitespaceCellIds],
      },
    });

    const pointsLayer = new ScatterplotLayer<PaperPoint>({
      id: "papers",
      data: papers,
      getPosition: (d) => [d.x, d.y],
      getRadius: 3000,
      radiusMinPixels: 1,
      radiusMaxPixels: 3,
      getFillColor: [255, 255, 255, 160],
      pickable: false,
    });

    const labelLayer = new TextLayer<RegionLabel>({
      id: "region-labels",
      data: regionLabels,
      pickable: false,
      getPosition: (d) => [d.x, d.y],
      getText: (d) => d.label,
      getSize: 18,
      sizeUnits: "pixels",
      getColor: [255, 255, 255, 235],
      outlineColor: [0, 0, 0, 220],
      outlineWidth: 4,
      fontSettings: { sdf: true },
      fontFamily:
        '"Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif',
      fontWeight: 700,
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      background: true,
      backgroundPadding: [10, 6],
      getBackgroundColor: [10, 14, 24, 200],
      getBorderColor: [255, 255, 255, 60],
      getBorderWidth: 1,
    });

    // 선택 셀 시각화 — fill을 건드리지 않고 별도 레이어로 cyan ring + 중심 점.
    const selectedCell = selectedCellId
      ? cells.find((c) => c.cell_id === selectedCellId)
      : undefined;

    // 선택 셀 위에 로컬 키워드 라벨을 띄움 — 지도 큰 라벨(클러스터)와 구분되는
    // cyan 톤의 작은 라벨로 그 셀의 로컬 주제를 즉시 보여 준다.
    interface SelectedCellLabel {
      label: string;
      x: number;
      y: number;
    }
    const selectedCellLabel: SelectedCellLabel[] =
      selectedCell && (selectedCell.top_keywords?.length ?? 0) > 0
        ? [
            {
              label:
                (locale === "ko" ? "선택 영역: " : "Selected: ") +
                selectedCell.top_keywords.slice(0, 2).join(" · "),
              x: selectedCell.centroid_x,
              y: selectedCell.centroid_y,
            },
          ]
        : [];

    const selectedCellLabelLayer = new TextLayer<SelectedCellLabel>({
      id: "selected-cell-label",
      data: selectedCellLabel,
      pickable: false,
      getPosition: (d) => [d.x, d.y],
      getText: (d) => d.label,
      getSize: 13,
      sizeUnits: "pixels",
      getColor: [255, 255, 255, 245],
      outlineColor: [14, 78, 105, 220],
      outlineWidth: 3,
      fontSettings: { sdf: true },
      fontFamily:
        '"Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif',
      fontWeight: 600,
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      background: true,
      backgroundPadding: [8, 4],
      getBackgroundColor: [14, 165, 233, 220],
      getBorderColor: [255, 255, 255, 200],
      getBorderWidth: 1,
      getPixelOffset: [0, -22],
    });

    // 흰 halo (외부) + cyan 두꺼운 ring (그 안쪽) — 두 겹으로 어떤 배경에서도 또렷.
    const selectedHaloLayer = new H3HexagonLayer<{ cell_id: string }>({
      id: "selected-halo",
      data: selectedCell ? [{ cell_id: selectedCell.cell_id }] : [],
      getHexagon: (d) => d.cell_id,
      filled: false,
      stroked: true,
      getLineColor: [255, 255, 255, 255],
      lineWidthMinPixels: 16,
      pickable: false,
    });

    const selectedRingLayer = new H3HexagonLayer<{ cell_id: string }>({
      id: "selected-ring",
      data: selectedCell ? [{ cell_id: selectedCell.cell_id }] : [],
      getHexagon: (d) => d.cell_id,
      filled: false,
      stroked: true,
      getLineColor: [14, 165, 233, 255], // sky-500
      lineWidthMinPixels: 9,
      pickable: false,
    });

    return [
      cellLayer,
      pointsLayer,
      selectedHaloLayer,
      selectedRingLayer,
      labelLayer,
      selectedCellLabelLayer,
    ];
  }, [
    cells,
    papers,
    regionLabels,
    selectedCellId,
    whitespaceCellIds,
    whitespace,
    selectCell,
    selectCandidate,
    locale,
  ]);

  return (
    <div className="absolute inset-0 bg-slate-900">
      <DeckGL
        initialViewState={initialViewState}
        controller={true}
        layers={layers}
        getTooltip={({ object }) => {
          if (!object) return null;
          const cell = object as Cell;
          if (cell.cell_id) {
            const kw = (cell.top_keywords ?? []).slice(0, 3).join(", ");
            const isWS = whitespaceCellIds.has(cell.cell_id);
            return {
              text: (locale === "ko"
                ? [
                    isWS ? "🟧 공백 후보" : "📍 점유 영역",
                    `논문 ${cell.paper_count}편 (최근 ${cell.recent_count}편)`,
                    kw ? `로컬 주제: ${kw}` : "로컬 주제: —",
                    "클릭 → 상세 보기",
                  ]
                : [
                    isWS ? "🟧 Whitespace candidate" : "📍 Occupied area",
                    `${cell.paper_count} papers (${cell.recent_count} recent)`,
                    kw ? `Local topic: ${kw}` : "Local topic: —",
                    "Click → details",
                  ]
              ).join("\n"),
              style: {
                background: "rgba(15,15,20,0.95)",
                color: "#fff",
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                lineHeight: "1.55",
              },
            };
          }
          return null;
        }}
      />
      <VisualFormula locale={locale} />
      <MapStats
        cellCount={cells.length}
        paperCount={papers.length}
        locale={locale}
      />
    </div>
  );
}

/**
 * 지도 상단 시각 공식 — 한 줄로 의미를 즉시 읽히게 한다.
 * 카피("점 = 논문, 가까움 = 의미 유사 …")보다 시각 칩이 먼저 들어오는 구조.
 */
function VisualFormula({ locale }: { locale: "ko" | "en" }) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-slate-900/85 backdrop-blur border border-white/10 rounded-full px-3 py-1.5 shadow-lg flex items-center gap-2 text-[12px] text-white/85 whitespace-nowrap pointer-events-none">
      <Chip
        glyph={
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/95" />
        }
        label={locale === "ko" ? "점 = 논문" : "dot = paper"}
      />
      <Sep />
      <Chip
        glyph={
          <span className="inline-flex items-center text-white/95">↔</span>
        }
        label={locale === "ko" ? "가까움 = 의미 유사" : "near = similar"}
      />
      <Sep />
      <Chip
        glyph={<HexChip color="#1e40af" />}
        label={locale === "ko" ? "진함 = 많음" : "darker = denser"}
      />
      <Sep />
      <Chip
        glyph={<HexChip color="#f97316" outline />}
        label={locale === "ko" ? "주황 = 공백 후보" : "orange = whitespace"}
      />
      <Sep />
      <Chip
        glyph={<HexChip color="transparent" cyanOutline />}
        label={locale === "ko" ? "cyan = 선택 영역" : "cyan = selected"}
      />
    </div>
  );
}

function Chip({ glyph, label }: { glyph: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      {glyph}
      <span>{label}</span>
    </span>
  );
}

function Sep() {
  return <span className="text-white/30">·</span>;
}

function HexChip({
  color,
  outline,
  cyanOutline,
}: {
  color: string;
  outline?: boolean;
  cyanOutline?: boolean;
}) {
  const stroke = cyanOutline
    ? "rgba(14,165,233,1)"
    : outline
      ? "rgba(249,115,22,1)"
      : "rgba(255,255,255,0.3)";
  const strokeWidth = cyanOutline ? 1.8 : outline ? 1.4 : 0.6;
  return (
    <svg width="14" height="13" viewBox="0 0 14 13" className="shrink-0">
      <polygon
        points="3.5,0.7 10.5,0.7 13.3,6.5 10.5,12.3 3.5,12.3 0.7,6.5"
        fill={color === "transparent" ? "none" : color}
        opacity={cyanOutline ? 1 : 0.9}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

function MapStats({
  cellCount,
  paperCount,
  locale,
}: {
  cellCount: number;
  paperCount: number;
  locale: "ko" | "en";
}) {
  const text =
    locale === "ko"
      ? `셀 ${cellCount} · 논문 ${paperCount}편 · 클릭으로 상세 · SPECTER2 → UMAP`
      : `${cellCount} cells · ${paperCount} papers · click to inspect · SPECTER2 → UMAP`;
  return (
    <div className="absolute bottom-4 left-4 z-10 bg-slate-900/70 backdrop-blur border border-white/10 rounded-md px-3 py-1.5 text-[11px] text-white/55 font-mono pointer-events-none">
      {text}
    </div>
  );
}
