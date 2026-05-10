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
 * 데이터 서빙 base URL — 정적 호스팅 외 object storage(R2/S3/Vercel Blob) 마이그레이션
 * 대비. 환경변수가 비어있으면 동일 origin의 /data 사용.
 */
const BASE = (process.env.NEXT_PUBLIC_DATA_BASE_URL ?? "/data").replace(
  /\/$/,
  ""
);

export interface CatalogEntry {
  primary: string;        // 예: "cs.CL"
  slug: string;           // 예: "cs-cl"
  label?: string;
  epoch: string;
  paper_count: number;
  embedding_model: string;
  categories: string[];
  built_at: string;
}

export interface Catalog {
  datasets: CatalogEntry[];
  updated_at?: string;
}

interface LatestPointer {
  epoch: string;
  manifest?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} (${res.status})`);
  return (await res.json()) as T;
}

export async function loadCatalog(): Promise<Catalog> {
  return fetchJson<Catalog>(`${BASE}/catalog.json`);
}

export async function loadMapData(slug: string): Promise<MapData> {
  const datasetBase = `${BASE}/${slug}`;
  const latest = await fetchJson<LatestPointer>(`${datasetBase}/latest.json`);
  // latest.manifest 가 있으면 그것을 신뢰 (장기 마이그레이션 대비 — manifest 경로가
  // 늘 epoch/manifest.json일 거란 가정을 latest.json 단계로 끌어올림).
  // 없으면 epoch 디렉토리에서 조립.
  const manifestUrl = latest.manifest
    ? `${datasetBase}/${latest.manifest}`
    : `${datasetBase}/${latest.epoch}/manifest.json`;
  const epochBase = manifestUrl.replace(/\/manifest\.json$/, "");
  const [manifest, cells, papers, clusters, whitespace] = await Promise.all([
    fetchJson<Manifest>(manifestUrl),
    fetchJson<Cell[]>(`${epochBase}/cells.json`),
    fetchJson<PaperPoint[]>(`${epochBase}/papers_index.json`),
    fetchJson<Record<string, ClusterLabel>>(`${epochBase}/cluster_labels.json`),
    fetchJson<WhitespaceCandidate[]>(`${epochBase}/whitespace_top10.json`),
  ]);
  return { manifest, cells, papers, clusters, whitespace };
}
