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
  label?: string;
  centroid_x?: number;
  centroid_y?: number;
  paper_count?: number;
}

export interface NearestPaper {
  id: string;
  title: string;
  neighbor_cell: string;
  year?: number | null;
}

export interface LineagePaper {
  id: string;
  title: string;
  year?: number | null;
}

export interface Lineage {
  foundations: LineagePaper[];
  active: LineagePaper[];
  bridge_text: string;
  bridge_text_ko?: string;
  bridge_text_en?: string;
}

export interface WhitespaceCandidate {
  cell_id: string;
  summary: string;
  summary_ko?: string;
  summary_en?: string;
  rationale: string;
  rationale_ko?: string;
  rationale_en?: string;
  score: number;
  detector: string;
  neighbor_keywords: string[];
  neighbor_categories: string[];
  nearest_papers: NearestPaper[];
  lineage?: Lineage;
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
