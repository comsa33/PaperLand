"use client";

import { create } from "zustand";
import type { WhitespaceCandidate } from "./types";

interface UIState {
  whitespaceMode: boolean;
  selectedCellId: string | null;
  selectedCandidate: WhitespaceCandidate | null;
  setWhitespaceMode: (on: boolean) => void;
  selectCell: (id: string | null) => void;
  selectCandidate: (c: WhitespaceCandidate | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  whitespaceMode: false,
  selectedCellId: null,
  selectedCandidate: null,
  setWhitespaceMode: (on) => set({ whitespaceMode: on }),
  selectCell: (id) => set({ selectedCellId: id, selectedCandidate: null }),
  selectCandidate: (c) =>
    set({ selectedCandidate: c, selectedCellId: c?.cell_id ?? null }),
}));
