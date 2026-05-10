# PaperLand

> 논문 검색기가 아닌 **연구 지형도 + 공백 후보 탐지기**.

연구 분야의 점유 영토와 탐색 가치 높은 빈 영역을 함께 보여주는 웹앱.

## 정체성
- ❌ 또 하나의 논문 검색기가 아님
- ✅ "어디까지 연구됐고, 어디가 아직 덜 탐색됐나?"에 답하는 도구
- ✅ 단정이 아닌 **근거 기반 후보 제시**

## 현재 상태
**V0 구현 단계** — `cs.CL` 5년치 arXiv 데이터로 정적 웹앱 구축.

전체 기획은 [`planning/opus4.7-README.md`](./planning/opus4.7-README.md) 참조.
구현 우선 참조 문서:
- [`planning/opus4.7-08-v0-scope.md`](./planning/opus4.7-08-v0-scope.md) — V0 단일 진실 공급원
- [`planning/opus4.7-10-stack-decisions.md`](./planning/opus4.7-10-stack-decisions.md) — 확정 스택

## 디렉토리 구조 (예정)
```
PaperLand/
├── apps/
│   └── web/              # Next.js 15 프론트엔드 (deck.gl)
├── packages/
│   └── pipeline/         # Python 데이터 파이프라인 (수집·임베딩·UMAP·격자화)
├── data/
│   └── fixtures/         # 샘플 데이터 (커밋 대상)
├── planning/             # 기획 문서
└── notebooks/            # 탐색용 Jupyter 노트북
```

## V0 핵심 가설
**임베딩 기반 2D 지형도 + Adjacent Gap 강조**가 연구자에게 "검토할 가치 있는 후보"를 5–15분 내에 제공할 수 있는가?
