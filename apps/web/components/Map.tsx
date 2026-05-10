"use client";

import { ScatterplotLayer } from "@deck.gl/layers";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import DeckGL from "@deck.gl/react";
import { useMemo } from "react";

import { useUIStore } from "@/lib/store";
import type { Cell, PaperPoint, WhitespaceCandidate } from "@/lib/types";

interface MapProps {
  cells: Cell[];
  papers: PaperPoint[];
  whitespace: WhitespaceCandidate[];
}

export function Map({ cells, papers, whitespace }: MapProps) {
  const whitespaceMode = useUIStore((s) => s.whitespaceMode);
  const selectedCellId = useUIStore((s) => s.selectedCellId);
  const selectCell = useUIStore((s) => s.selectCell);

  const whitespaceCellIds = useMemo(
    () => new Set(whitespace.map((w) => w.cell_id)),
    [whitespace]
  );

  // 셀 중심값 평균을 초기 뷰의 중심으로
  const initialViewState = useMemo(() => {
    if (cells.length === 0) {
      return { longitude: 0, latitude: 0, zoom: 4, pitch: 0, bearing: 0 };
    }
    const avgLng =
      cells.reduce((s, c) => s + c.centroid_x, 0) / cells.length;
    const avgLat =
      cells.reduce((s, c) => s + c.centroid_y, 0) / cells.length;
    return {
      longitude: avgLng,
      latitude: avgLat,
      zoom: 4.5,
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
            return isSelected ? [255, 180, 50, 230] : [255, 140, 0, 200];
          }
          return [60, 60, 70, 50];
        }
        const intensity = Math.min(1, d.paper_count / maxCount);
        // 진한 파랑 → 옅은 파랑 (밀도 시각화)
        const r = Math.floor(40 + (1 - intensity) * 80);
        const g = Math.floor(80 + (1 - intensity) * 60);
        const b = Math.floor(255 - intensity * 30);
        return isSelected ? [255, 220, 100, 230] : [r, g, b, 180];
      },
      getLineColor: (d) =>
        whitespaceCellIds.has(d.cell_id)
          ? [255, 180, 50, 220]
          : [180, 200, 230, 60],
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
      updateTriggers: {
        getFillColor: [whitespaceMode],
      },
    });

    return [cellLayer, pointsLayer];
  }, [cells, papers, whitespaceMode, selectedCellId, whitespaceCellIds, selectCell]);

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
              text: [
                isWS ? "🟧 공백 후보" : "📍 점유 영역",
                `논문 ${cell.paper_count}편 (최근 ${cell.recent_count}편)`,
                kw ? `키워드: ${kw}` : "키워드: —",
                "클릭 → 상세 보기",
              ].join("\n"),
              style: {
                background: "rgba(15,15,20,0.95)",
                color: "#fff",
                padding: "8px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                lineHeight: "1.5",
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
      />
    </div>
  );
}

function MapLegend({
  whitespaceMode,
  cellCount,
  paperCount,
}: {
  whitespaceMode: boolean;
  cellCount: number;
  paperCount: number;
}) {
  return (
    <div className="absolute bottom-4 left-4 z-10 bg-slate-900/85 backdrop-blur border border-white/10 rounded-md px-3 py-2.5 text-[11px] text-white/85 space-y-1.5 shadow-lg pointer-events-none">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-sm bg-blue-500" />
        <span>점유 영역 (진할수록 논문 많음)</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-sm bg-orange-500" />
        <span>공백 후보 ({whitespaceMode ? "강조 중" : "모드 OFF"})</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-white" />
        <span>개별 논문 점</span>
      </div>
      <div className="pt-1 mt-1 border-t border-white/10 text-[10px] text-white/55">
        셀 {cellCount} · 논문 {paperCount}편 · 클릭으로 상세
      </div>
    </div>
  );
}
