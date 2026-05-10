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
