export interface Manifest {
  schema_version: string;
  map_epoch: string;
  embedding_model: string;
  categories: string[];
  paper_count: number;
  built_at: string;
  artifact_checksums: Record<string, string>;
}

export interface Cell {
  cell_id: string;
  paper_count: number;
  recent_count: number;
  centroid_x: number;
  centroid_y: number;
  top_keywords: string[];
  dominant_category: string | null;
}

export interface PaperPoint {
  id: string;
  title: string;
  x: number;
  y: number;
  cell_id: string | null;
  year: number | null;
  category: string | null;
}

export interface ClusterLabel {
  keywords: string[];
}

export interface WhitespaceCandidate {
  cell_id: string;
  score: number;
  detector: string;
  rationale: string;
  neighbor_keywords: string[];
  neighbor_categories: string[];
  own_count: number;
  neighbor_density: number;
  suggested_queries: string[];
}

export interface MapData {
  manifest: Manifest;
  cells: Cell[];
  papers: PaperPoint[];
  clusters: Record<string, ClusterLabel>;
  whitespace: WhitespaceCandidate[];
}
