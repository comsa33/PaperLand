"use client";

import type {
  Cell,
  ClusterLabel,
  Manifest,
  MapData,
  PaperPoint,
  WhitespaceCandidate,
} from "./types";

/**
 * 카테고리 → 데이터 디렉토리 매핑.
 *  - cs.CL: 기존 호환을 위해 /data (root)
 *  - 그 외: /data/{slug} (예: /data/cs-lg)
 */
function dataBase(category: string): string {
  if (category === "cs.CL") return "/data";
  const slug = category.toLowerCase().replace(/\./g, "-");
  return `/data/${slug}`;
}

async function fetchJson<T>(base: string, file: string): Promise<T> {
  const res = await fetch(`${base}/${file}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${file} (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function loadMapData(category = "cs.CL"): Promise<MapData> {
  const base = dataBase(category);
  const [manifest, cells, papers, clusters, whitespace] = await Promise.all([
    fetchJson<Manifest>(base, "manifest.json"),
    fetchJson<Cell[]>(base, "cells.json"),
    fetchJson<PaperPoint[]>(base, "papers_index.json"),
    fetchJson<Record<string, ClusterLabel>>(base, "cluster_labels.json"),
    fetchJson<WhitespaceCandidate[]>(base, "whitespace_top10.json"),
  ]);
  return { manifest, cells, papers, clusters, whitespace };
}

/** 헤더에 표시할 카테고리 후보 + 라벨. 데이터셋이 빌드되어 있으면 활성, 없으면 비활성. */
export const KNOWN_CATEGORIES = [
  { value: "cs.CL", label: "cs.CL — Computational Linguistics" },
  { value: "cs.LG", label: "cs.LG — Machine Learning" },
  { value: "cs.AI", label: "cs.AI — Artificial Intelligence" },
  { value: "cs.CV", label: "cs.CV — Computer Vision" },
  { value: "stat.ML", label: "stat.ML — Statistical ML" },
] as const;

export type KnownCategory = (typeof KNOWN_CATEGORIES)[number]["value"];

/** manifest.json 존재 여부로 데이터셋이 빌드돼 있는지 빠르게 확인. */
export async function probeCategory(category: string): Promise<boolean> {
  try {
    const res = await fetch(`${dataBase(category)}/manifest.json`, {
      cache: "no-store",
      method: "HEAD",
    });
    return res.ok;
  } catch {
    return false;
  }
}
