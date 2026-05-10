/**
 * cs.CL 분야 핵심 용어의 한/영 병기 사전.
 *
 * 원칙:
 * - 영어 기술어는 검색성을 위해 그대로 유지
 * - 한국어는 보조 라벨(괄호)로 표시
 * - 사전에 없는 키워드는 영어 그대로 표시
 */
const KEYWORD_KOREAN: Record<string, string> = {
  transformer: "트랜스포머",
  attention: "어텐션",
  "self attention": "셀프 어텐션",
  "language model": "언어모델",
  pretraining: "사전학습",
  "language model pretraining": "언어모델 사전학습",
  "vision language pretraining": "비전·언어 사전학습",
  tokenization: "토큰화",
  "subword tokenization": "서브워드 토큰화",
  "positional encoding": "위치 인코딩",

  retrieval: "검색·리트리벌",
  "retrieval augmented generation": "검색 보강 생성(RAG)",
  rag: "RAG",
  "dense passage retrieval": "DPR",
  grounding: "그라운딩",
  "knowledge grounding": "지식 그라운딩",
  "vector index": "벡터 인덱스",
  "external memory": "외부 메모리",

  hallucination: "환각",
  "hallucination detection": "환각 탐지",
  factuality: "사실성",
  "factual consistency": "사실 일관성",
  verification: "검증",
  "claim verification": "주장 검증",
  "self verification": "자기 검증",
  "uncertainty estimation": "불확실도 추정",
  "self consistency": "자기 일관성",

  dialogue: "대화",
  "dialogue policy": "대화 정책",
  agent: "에이전트",
  "task oriented agent": "태스크 지향 에이전트",
  "tool augmented llm": "도구 결합 LLM",
  "agent planning": "에이전트 계획",
  "react prompting": "ReAct 프롬프팅",

  alignment: "정렬",
  "rlhf alignment": "RLHF 정렬",
  rlhf: "RLHF",
  "preference learning": "선호 학습",
  "reward modeling": "보상 모델링",
  "safety guardrail": "안전 가드레일",
  "constitutional ai": "Constitutional AI",

  multimodal: "멀티모달",
  "image captioning": "이미지 캡셔닝",
  "video understanding": "비디오 이해",
  "visual question answering": "VQA",
  "multimodal grounding": "멀티모달 그라운딩",

  quantization: "양자화",
  "model quantization": "모델 양자화",
  distillation: "지식 증류",
  "knowledge distillation": "지식 증류",
  "structured pruning": "구조적 프루닝",
  "speculative decoding": "스펙큘러티브 디코딩",
  "kv cache compression": "KV 캐시 압축",

  reasoning: "추론",
  "chain of thought reasoning": "Chain-of-Thought 추론",
  "math word problem": "수학 문장제",
  "symbolic reasoning": "기호적 추론",
  "program of thought": "Program-of-Thought",

  benchmark: "벤치마크",
  "benchmark construction": "벤치마크 구축",
  "human evaluation": "인간 평가",
  "leaderboard contamination": "리더보드 오염",
  "robustness probing": "강건성 프로빙",
  "adversarial nli": "적대적 NLI",

  "instruction tuning": "인스트럭션 튜닝",
  "low rank adapter": "LoRA 어댑터",
  "qlora finetuning": "QLoRA 파인튜닝",
  "parameter efficient transfer": "파라미터 효율 전이",
  "prompt tuning": "프롬프트 튜닝",
};

export function translateKeyword(en: string): string | null {
  const key = en.toLowerCase().trim();
  return KEYWORD_KOREAN[key] ?? null;
}

export function bilingual(en: string): string {
  const ko = translateKeyword(en);
  return ko ? `${en} / ${ko}` : en;
}

/* 후보 텍스트 locale 선택 — ko/en 필드가 있으면 우선, 없으면 기본 필드. */
export function pickCandidateText(
  c: {
    summary?: string;
    summary_ko?: string;
    summary_en?: string;
    rationale?: string;
    rationale_ko?: string;
    rationale_en?: string;
  },
  locale: "ko" | "en",
  field: "summary" | "rationale"
): string {
  if (locale === "en") {
    if (field === "summary") return c.summary_en || c.summary_ko || c.summary || "";
    return c.rationale_en || c.rationale_ko || c.rationale || "";
  }
  if (field === "summary") return c.summary_ko || c.summary || "";
  return c.rationale_ko || c.rationale || "";
}

export function pickBridgeText(
  lineage:
    | { bridge_text?: string; bridge_text_ko?: string; bridge_text_en?: string }
    | undefined,
  locale: "ko" | "en"
): string {
  if (!lineage) return "";
  if (locale === "en") {
    return lineage.bridge_text_en || lineage.bridge_text_ko || lineage.bridge_text || "";
  }
  return lineage.bridge_text_ko || lineage.bridge_text || "";
}

/* ───────────────────────────────────────────────────────────
 * UI 문구 리소스 — KO / EN 전환용
 * 키워드(영문 기술어)는 검색성을 위해 번역하지 않는다.
 * ─────────────────────────────────────────────────────────── */

export type Locale = "ko" | "en";

const STRINGS = {
  appTitle: { ko: "PaperLand", en: "PaperLand" },
  appSubtitle: {
    ko: "arXiv cs.CL 연구 지형도 — 공백 후보 탐지기",
    en: "arXiv cs.CL research landscape — Whitespace detector",
  },
  fixtureBadge: {
    ko: "⚠️ 샘플 데모 — 실제 arXiv 지형 아님",
    en: "⚠️ Synthetic demo — not real arXiv landscape",
  },
  loading: { ko: "지도 로드 중…", en: "Loading map…" },
  loadFail: { ko: "데이터 로드 실패", en: "Failed to load data" },
  loadHint: {
    ko: "먼저 파이프라인을 실행해 픽스처를 생성하세요:",
    en: "Run the pipeline first to generate fixtures:",
  },
  candidatesHeading: {
    ko: (n: number) => `검출된 공백 후보 ${n}개`,
    en: (n: number) => `${n} whitespace candidate${n === 1 ? "" : "s"} detected`,
  },
  candidatesIntro: {
    ko: "주변은 활발한데 자기 셀만 비어있는 영역입니다. 이미 점유된 영토 사이의 빈틈이 가장 발견 가치 높은 후보입니다.",
    en: "Cells that are sparse themselves but surrounded by active neighbors. Gaps between occupied territories are the highest-value leads.",
  },
  todaysReview: {
    ko: "오늘 검토할 연구 후보",
    en: "Research candidates to review today",
  },
  reviewIntro: {
    ko: "각 카드는 \"주변은 활발한데 직접 결합 연구가 적은\" 영역에서 합성된 연구 질문입니다. 카드를 클릭해 인접 흐름과 검증 링크를 확인하세요.",
    en: 'Each card is a research question synthesised from areas where neighbors are active but direct combinations are scarce. Click a card to inspect adjacent flow and verification links.',
  },
  openDetail: { ko: "후보 자세히 보기", en: "Open detail" },
  backToList: { ko: "← 후보 목록으로", en: "← Back to list" },
  detailMapTab: { ko: "지도에서 위치 보기", en: "Show on map" },
  detailFlowTab: { ko: "연도별 흐름 보기", en: "Year-by-year flow" },
  detailSidebarHint: {
    ko: "오른쪽 패널에 인접 논문 5편과 Scholar 검색 쿼리가 있습니다.",
    en: "Right panel shows 5 nearest papers and Scholar verification queries.",
  },
  topicLabel: {
    ko: "내 관심 주제",
    en: "My topic",
  },
  topicPlaceholder: {
    ko: "예: RAG evaluation, knowledge graph QA, korean nlp …",
    en: "e.g., RAG evaluation, knowledge graph QA, agent planning …",
  },
  topicHint: {
    ko: "키워드를 쉼표·공백으로 구분해 입력하면, 위 후보가 관련도 순으로 재정렬되고 매칭 키워드가 강조됩니다. (현재는 키워드 일치 — 의미 검색은 다음 라운드)",
    en: "Type keywords (comma or space separated). Candidates are re-ranked by overlap and matching keywords get highlighted. (Lexical match for now — semantic search is the next round.)",
  },
  topicMatchBadge: {
    ko: (n: number) => `매칭 ${n}개`,
    en: (n: number) => `${n} match${n === 1 ? "" : "es"}`,
  },
  topicReset: { ko: "초기화", en: "Reset" },
  topicNoMatch: {
    ko: "정확히 일치하는 후보가 없어 원래 순서로 보여드립니다. 다른 키워드를 시도하거나 카드의 인접 키워드를 클릭해보세요.",
    en: "No exact matches — showing original order. Try other keywords or click an adjacent keyword chip on a card.",
  },
  modeToggle: {
    ko: "공백 후보 모드 — 지도에서 강조",
    en: "Whitespace mode — highlight candidates",
  },
  noCandidates: { ko: "후보 없음", en: "No candidates" },
  scoreLabel: { ko: "근거", en: "score" },
  neighborVsSelf: {
    ko: (n: string, o: number) => `이웃 ~${n}편 vs 자기 ${o}편`,
    en: (n: string, o: number) => `neighbors ~${n} vs self ${o}`,
  },
  examplePrefix: { ko: "예: ", en: "e.g. " },
  whatToDoTitle: {
    ko: "그래서 뭘 하면 되나 — 5분 검증 플로우",
    en: "What to do next — 5-minute validation flow",
  },
  whatToDoBody: {
    ko: "아래 인접 영역의 대표 논문 5편을 먼저 살펴보고, 같은 키워드 조합이 실제로 비어있는지 Scholar 검색 쿼리로 확인하세요. 진짜 공백이라면 연구 주제 후보로 검토할 가치가 있습니다.",
    en: "Skim the 5 representative neighbor papers below, then verify with the Scholar queries to confirm the gap is real. If it is, this is a candidate worth investigating as a research topic.",
  },
  whatToDoSteps: {
    ko: [
      ["아래 ", "인접 대표 논문 5편", "의 제목을 훑어 이 영역이 어떤 분야 사이에 위치하는지 빠르게 파악"],
      ["", "Scholar 검색 쿼리", " 1–2개를 클릭해 외부 검색에서 같은 조합의 논문이 실제로 있는지 1차 확인"],
      ["결과가 충분히 적다면 ", "연구 주제 후보", "로 메모. 위 인접 논문들이 관련 연구(Related Work) 후보로 그대로 활용 가능"],
    ],
    en: [
      ["Skim the titles of the ", "5 representative neighbor papers", " below to grasp which subfields this area sits between."],
      ["Click 1–2 ", "Scholar search queries", " to verify externally whether papers with the same combination already exist."],
      ["If results are sparse enough, save it as a ", "research topic candidate", ". The neighbor papers can serve as Related Work directly."],
    ],
  },
  flowSwitchHint: {
    ko: "헤더의 「연도별 흐름 보기」 탭으로 전환하면 이 후보 주변의 연도별 흐름을 볼 수 있습니다.",
    en: 'Switch to the "Year-by-year flow" tab in the header to see how the surrounding research evolves over years.',
  },
  candidateHeader: { ko: "공백 후보 #", en: "Whitespace candidate #" },
  selectedCellHeader: { ko: "선택 영역", en: "Selected cell" },
  papersInCell: {
    ko: "이 셀의 논문",
    en: "Papers in this cell",
  },
  representativeKw: {
    ko: "대표 키워드",
    en: "Representative keywords",
  },
  neighborKw: {
    ko: "주변 키워드 (영문 / 한글 병기)",
    en: "Neighbor keywords (EN only)",
  },
  neighborPapers: {
    ko: "인접 영역의 대표 논문",
    en: "Representative neighbor papers",
  },
  scholarFind: { ko: "Scholar에서 찾기", en: "Find on Scholar" },
  searchQueries: {
    ko: "이 공백을 직접 확인하는 검색 쿼리",
    en: "Search queries to verify this gap",
  },
  evidenceStrength: { ko: "근거 강도", en: "Evidence strength" },
  candidateDisclaimer: {
    ko: "※ 수집 데이터 기준 저밀도 후보. 실제 연구 가치는 위 검색 링크로 직접 확인이 필요합니다.",
    en: "* A low-density candidate based on collected data. Verify actual research value via the search links above.",
  },
  lineageTitle: {
    ko: "연도별 인접 연구 흐름",
    en: "Adjacent research flow by year",
  },
  foundationsLabel: { ko: "기반 연구", en: "Foundations" },
  activeLabel: {
    ko: "최근 활발한 인접 연구",
    en: "Recent active neighbors",
  },
  lineageDisclaimer: {
    ko: "※ citation 기반 영향 관계가 아니라, 같은 임베딩 영역의 연도·인접도로 정렬한 흐름입니다.",
    en: "* Not a citation-based influence graph; an ordering by year + embedding adjacency.",
  },
  emptyHeading: { ko: "상세 패널", en: "Detail panel" },
  emptyBody: {
    ko: "지도의 셀을 클릭하거나, 좌측 공백 후보를 선택하면 여기에 정보가 표시됩니다.",
    en: "Click a cell on the map or pick a whitespace candidate to see details here.",
  },
  emptyBullets: {
    ko: [
      "셀에 속한 대표 논문 5편",
      "인접 영역의 키워드",
      "공백 후보일 경우: 근거 + 인접 대표 논문 + Scholar 검색 링크",
    ],
    en: [
      "Up to 5 representative papers in the cell",
      "Keywords from neighboring areas",
      "For whitespace candidates: rationale + neighbor papers + Scholar links",
    ],
  },
  guideTitle: { ko: "시작 가이드", en: "Quick guide" },
  guide: {
    map: {
      ko: ["중앙: 연구 지형도", "진한 파랑일수록 논문 많음. 영역 라벨로 어떤 분야인지 확인."],
      en: [
        "Center: research landscape",
        "Darker blue = more papers. Region labels show topical areas.",
      ],
    },
    candidates: {
      ko: [
        "좌측: 공백 후보 Top 10",
        "주변 활발 + 자기 비어있는 영역. 모드 토글로 지도에서 강조.",
      ],
      en: [
        "Left: whitespace Top 10",
        "Active neighbors + sparse self. Toggle mode to highlight them on the map.",
      ],
    },
    detail: {
      ko: ["우측: 상세 + 다음 행동", "셀/후보 클릭 → 인접 대표 논문 + Scholar 검색 링크."],
      en: [
        "Right: details + next action",
        "Click a cell/candidate → neighbor papers + Scholar links.",
      ],
    },
  },
  legend: {
    occupied: { ko: "점유 영역 (진할수록 논문 많음)", en: "Occupied area (denser = more papers)" },
    whitespaceOn: { ko: "공백 후보 (강조 중)", en: "Whitespace candidate (highlighted)" },
    whitespaceOff: { ko: "공백 후보 (모드 OFF)", en: "Whitespace (mode OFF)" },
    paperDot: { ko: "개별 논문 점", en: "Individual paper" },
    summary: (cells: number, papers: number) => ({
      ko: `셀 ${cells} · 논문 ${papers}편 · 클릭으로 상세`,
      en: `${cells} cells · ${papers} papers · click to inspect`,
    }),
  },
  localeToggle: { ko: "EN", en: "한국어" },
} as const;

export function t(locale: Locale, key: keyof typeof STRINGS): string {
  const v = STRINGS[key] as { ko: string; en: string };
  return v[locale];
}

export const ui = STRINGS;
