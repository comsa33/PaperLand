"use client";

import { create } from "zustand";
import type { WhitespaceCandidate } from "./types";

export type Locale = "ko" | "en";
export type ViewMode = "list" | "map" | "lineage";

const LOCALE_KEY = "paperland.locale";

function loadLocale(): Locale {
  if (typeof window === "undefined") return "ko";
  const stored = window.localStorage.getItem(LOCALE_KEY);
  return stored === "en" ? "en" : "ko";
}

interface UIState {
  whitespaceMode: boolean;
  selectedCellId: string | null;
  selectedCandidate: WhitespaceCandidate | null;
  locale: Locale;
  viewMode: ViewMode;
  setWhitespaceMode: (on: boolean) => void;
  selectCell: (id: string | null) => void;
  selectCandidate: (c: WhitespaceCandidate | null) => void;
  setLocale: (l: Locale) => void;
  setViewMode: (m: ViewMode) => void;
}

export const useUIStore = create<UIState>((set) => ({
  whitespaceMode: false,
  selectedCellId: null,
  selectedCandidate: null,
  locale: "ko",
  viewMode: "list",
  setWhitespaceMode: (on) => set({ whitespaceMode: on }),
  selectCell: (id) => set({ selectedCellId: id, selectedCandidate: null }),
  selectCandidate: (c) =>
    set({ selectedCandidate: c, selectedCellId: c?.cell_id ?? null }),
  setLocale: (l) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_KEY, l);
    }
    set({ locale: l });
  },
  setViewMode: (m) => set({ viewMode: m }),
}));

export function hydrateLocale() {
  useUIStore.setState({ locale: loadLocale() });
}
