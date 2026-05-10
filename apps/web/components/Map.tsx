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
  const whitespaceMode = useUIStore((s) => s.whitespaceMode);
  const selectedCellId = useUIStore((s) => s.selectedCellId);
  const selectCell = useUIStore((s) => s.selectCell);
  const locale = useUIStore((s) => s.locale);

  const whitespaceCellIds = useMemo(
    () => new Set(whitespace.map((w) => w.cell_id)),
    [whitespace]
  );

  const regionLabels = useMemo<RegionLabel[]>(() => {
    const out: RegionLabel[] = [];
    for (const [cid, c] of Object.entries(clusters)) {
      if (
        c.label &&
        typeof c.centroid_x === "number" &&
        typeof c.centroid_y === "number"
      ) {
        out.push({
          id: cid,
          label: c.label,
          x: c.centroid_x,
          y: c.centroid_y,
          count: c.paper_count ?? 0,
        });
      }
    }
    return out;
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
        if (whitespaceMode) {
          if (isWS) {
            return isSelected ? [255, 180, 50, 240] : [255, 140, 0, 210];
          }
          return [60, 60, 70, 50];
        }
        const intensity = Math.min(1, d.paper_count / maxCount);
        const r = Math.floor(40 + (1 - intensity) * 80);
        const g = Math.floor(80 + (1 - intensity) * 60);
        const b = Math.floor(255 - intensity * 30);
        return isSelected ? [255, 220, 100, 230] : [r, g, b, 180];
      },
      getLineColor: (d) =>
        whitespaceCellIds.has(d.cell_id)
          ? [255, 180, 50, 230]
          : [180, 200, 230, 70],
      onClick: (info) => {
        const cell = info.object as Cell | undefined;
        selectCell(cell?.cell_id ?? null);
      },
      updateTriggers: {
        getFillColor: [whitespaceMode, selectedCellId, whitespaceCellIds],
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
      getFillColor: [255, 255, 255, whitespaceMode ? 80 : 160],
      pickable: false,
      updateTriggers: { getFillColor: [whitespaceMode] },
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

    return [cellLayer, pointsLayer, labelLayer];
  }, [
    cells,
    papers,
    regionLabels,
    whitespaceMode,
    selectedCellId,
    whitespaceCellIds,
    selectCell,
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
                    kw ? `키워드: ${kw}` : "키워드: —",
                    "클릭 → 상세 보기",
                  ]
                : [
                    isWS ? "🟧 Whitespace candidate" : "📍 Occupied area",
                    `${cell.paper_count} papers (${cell.recent_count} recent)`,
                    kw ? `Keywords: ${kw}` : "Keywords: —",
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
      <MapLegend
        whitespaceMode={whitespaceMode}
        cellCount={cells.length}
        paperCount={papers.length}
        locale={locale}
      />
    </div>
  );
}

function MapLegend({
  whitespaceMode,
  cellCount,
  paperCount,
  locale,
}: {
  whitespaceMode: boolean;
  cellCount: number;
  paperCount: number;
  locale: "ko" | "en";
}) {
  const occupied =
    locale === "ko" ? "점유 영역 (진할수록 논문 많음)" : "Occupied area (denser = more papers)";
  const whitespaceLabel =
    locale === "ko"
      ? `공백 후보 (${whitespaceMode ? "강조 중" : "모드 OFF"})`
      : `Whitespace (${whitespaceMode ? "highlighted" : "mode off"})`;
  const dot = locale === "ko" ? "개별 논문 점" : "Individual paper";
  const summary =
    locale === "ko"
      ? `셀 ${cellCount} · 논문 ${paperCount}편 · 클릭으로 상세`
      : `${cellCount} cells · ${paperCount} papers · click to inspect`;
  return (
    <div className="absolute bottom-5 left-5 z-10 bg-slate-900/90 backdrop-blur border border-white/10 rounded-md px-4 py-3 text-sm text-white/85 space-y-2 shadow-lg pointer-events-none">
      <div className="flex items-center gap-2.5">
        <div className="w-4 h-4 rounded-sm bg-blue-500" />
        <span>{occupied}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="w-4 h-4 rounded-sm bg-orange-500" />
        <span>{whitespaceLabel}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="w-2.5 h-2.5 rounded-full bg-white" />
        <span>{dot}</span>
      </div>
      <div className="pt-1.5 mt-1.5 border-t border-white/15 text-xs text-white/60">
        {summary}
      </div>
    </div>
  );
}
