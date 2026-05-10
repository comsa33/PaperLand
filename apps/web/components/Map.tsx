"use client";

import { OrthographicView } from "@deck.gl/core";
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

const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: 0,
  zoom: 6,
  pitch: 0,
  bearing: 0,
};

export function Map({ cells, papers, whitespace }: MapProps) {
  const whitespaceMode = useUIStore((s) => s.whitespaceMode);
  const selectedCellId = useUIStore((s) => s.selectedCellId);
  const selectCell = useUIStore((s) => s.selectCell);

  const whitespaceCellIds = useMemo(
    () => new Set(whitespace.map((w) => w.cell_id)),
    [whitespace]
  );

  const layers = useMemo(() => {
    const maxCount = Math.max(1, ...cells.map((c) => c.paper_count));

    const cellLayer = new H3HexagonLayer<Cell>({
      id: "cells",
      data: cells,
      getHexagon: (d) => d.cell_id,
      pickable: true,
      filled: true,
      extruded: false,
      getFillColor: (d) => {
        const isWS = whitespaceCellIds.has(d.cell_id);
        const isSelected = selectedCellId === d.cell_id;
        if (whitespaceMode) {
          if (isWS) {
            return isSelected ? [255, 180, 50, 230] : [255, 140, 0, 200];
          }
          return [60, 60, 70, 60];
        }
        const intensity = Math.min(1, d.paper_count / maxCount);
        const blue = Math.floor(60 + intensity * 195);
        return isSelected ? [255, 220, 100, 230] : [40, 80, blue, 180];
      },
      getLineColor: (d) =>
        whitespaceMode && whitespaceCellIds.has(d.cell_id)
          ? [255, 180, 50, 255]
          : [200, 200, 220, 80],
      lineWidthMinPixels: 1,
      stroked: true,
      onClick: (info) => {
        const cell = info.object as Cell | undefined;
        selectCell(cell?.cell_id ?? null);
      },
      updateTriggers: {
        getFillColor: [whitespaceMode, selectedCellId, whitespaceCellIds],
        getLineColor: [whitespaceMode, whitespaceCellIds],
      },
    });

    const pointsLayer = new ScatterplotLayer<PaperPoint>({
      id: "papers",
      data: papers,
      getPosition: (d) => [d.x, d.y],
      getRadius: 30,
      radiusMinPixels: 1,
      radiusMaxPixels: 4,
      getFillColor: [255, 255, 255, whitespaceMode ? 60 : 140],
      pickable: false,
    });

    return [cellLayer, pointsLayer];
  }, [cells, papers, whitespaceMode, selectedCellId, whitespaceCellIds, selectCell]);

  return (
    <div className="absolute inset-0">
      <DeckGL
        views={new OrthographicView({ id: "ortho", controller: true })}
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        getTooltip={({ object }) => {
          if (!object) return null;
          const cell = object as Cell;
          if (cell.cell_id) {
            const kw = (cell.top_keywords ?? []).slice(0, 3).join(", ");
            return {
              text: `셀: ${cell.cell_id.slice(0, 10)}…\n논문 수: ${cell.paper_count}\n키워드: ${kw || "—"}`,
              style: {
                background: "rgba(15,15,20,0.95)",
                color: "#fff",
                padding: "8px 12px",
                borderRadius: "6px",
                fontSize: "12px",
              },
            };
          }
          return null;
        }}
      />
    </div>
  );
}
