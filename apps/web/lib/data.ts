"use client";

import type {
  Cell,
  ClusterLabel,
  Manifest,
  MapData,
  PaperPoint,
  WhitespaceCandidate,
} from "./types";

const BASE = "/data";

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`${BASE}/${file}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`데이터 로드 실패: ${file} (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function loadMapData(): Promise<MapData> {
  const [manifest, cells, papers, clusters, whitespace] = await Promise.all([
    fetchJson<Manifest>("manifest.json"),
    fetchJson<Cell[]>("cells.json"),
    fetchJson<PaperPoint[]>("papers_index.json"),
    fetchJson<Record<string, ClusterLabel>>("cluster_labels.json"),
    fetchJson<WhitespaceCandidate[]>("whitespace_top10.json"),
  ]);
  return { manifest, cells, papers, clusters, whitespace };
}
