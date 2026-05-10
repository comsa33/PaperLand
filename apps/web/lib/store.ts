"use client";

import { create } from "zustand";
import type { WhitespaceCandidate } from "./types";

export type Locale = "ko" | "en";
export type ViewMode = "list" | "map" | "lineage";

const LOCALE_KEY = "paperland.locale";
const CATEGORY_KEY = "paperland.category";
const DEFAULT_CATEGORY = "cs.CL";

function loadLocale(): Locale {
  if (typeof window === "undefined") return "ko";
  const stored = window.localStorage.getItem(LOCALE_KEY);
  return stored === "en" ? "en" : "ko";
}

function loadCategory(): string {
  if (typeof window === "undefined") return DEFAULT_CATEGORY;
  return window.localStorage.getItem(CATEGORY_KEY) || DEFAULT_CATEGORY;
}

interface UIState {
  selectedCellId: string | null;
  selectedCandidate: WhitespaceCandidate | null;
  locale: Locale;
  viewMode: ViewMode;
  category: string;
  selectCell: (id: string | null) => void;
  selectCandidate: (c: WhitespaceCandidate | null) => void;
  setLocale: (l: Locale) => void;
  setViewMode: (m: ViewMode) => void;
  setCategory: (c: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedCellId: null,
  selectedCandidate: null,
  locale: "ko",
  viewMode: "list",
  category: DEFAULT_CATEGORY,
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
  setCategory: (c) =>
    set((s) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CATEGORY_KEY, c);
      }
      // 카테고리 바뀌면 선택은 초기화. viewMode는 유지하되, lineage 모드는 후보가
      // 새로 받아져 임의 후보가 swap되는 회귀를 막기 위해 map으로 강제 이동.
      const nextViewMode = s.viewMode === "lineage" ? "map" : s.viewMode;
      return {
        category: c,
        selectedCandidate: null,
        selectedCellId: null,
        viewMode: nextViewMode,
      };
    }),
}));

export function hydrateLocale() {
  useUIStore.setState({ locale: loadLocale(), category: loadCategory() });
}
