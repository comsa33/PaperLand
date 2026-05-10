# 기술 스택 제안 (탐색)

> ⚠️ **이 문서는 옵션 비교·탐색용**이다. **확정된 V0 스택은 [10-stack-decisions](./opus4.7-10-stack-decisions.md)이 단일 진실 공급원이며, 이 문서보다 우선한다.** 본 문서의 백엔드/DB/검색엔진 제안은 V1+에서 평가 대상이지 V0에 포함되지 않는다.

## 프론트엔드
| 레이어 | 선택 | 이유 |
|--------|------|------|
| 프레임워크 | **Next.js 15 (App Router)** | SSR, 정적 자산 서빙, 배포 편의 |
| 언어 | TypeScript | 타입 안전 |
| 시각화 | **deck.gl** + react-map-gl 스타일 | 수십만 점 WebGL 렌더링, hex layer 내장 |
| 보조 시각화 | D3.js (범례·미니차트), visx | 디테일 |
| 상태 관리 | Zustand 또는 Jotai | 가벼움 |
| 스타일 | Tailwind CSS + shadcn/ui | 빠른 UI |
| 데이터 fetch | TanStack Query | 캐시 |

## 백엔드
| 레이어 | 선택 | 이유 |
|--------|------|------|
| API | **FastAPI** (Python) | 데이터 사이언스 스택과 자연스럽게 연결 |
| 쿼리 엔진 | **DuckDB** | Parquet 직접 쿼리, 임베디드, 빠름 |
| 메타데이터 DB | Postgres (선택) | 사용자·북마크 등 트랜잭션 데이터 |
| 검색 | **Meilisearch** 또는 Typesense | 논문 제목/키워드 빠른 검색 |
| 벡터 검색 | **FAISS** 또는 Qdrant | "내 abstract와 가까운 영역" 기능 |

## ML/데이터 처리
- Python 3.11+
- `sentence-transformers` (SPECTER2, bge)
- `umap-learn`, `hdbscan`, `bertopic`
- `polars` 또는 `pandas` + `pyarrow`
- 작업 오케스트레이션: **Prefect** 또는 단순 cron + 스크립트 (초기엔 cron으로 충분)

## 인프라
- 개발: 로컬 + Docker Compose
- 배포 (MVP):
  - 프론트: **Vercel**
  - API: **Fly.io** 또는 Railway (FastAPI 컨테이너)
  - 정적 데이터: S3 + CloudFront (또는 Cloudflare R2)
- GPU 필요 시: 임베딩 배치만 → Lambda Labs 단발성 또는 로컬 GPU

## 모노레포 구조 (제안)
```
PaperLand/
├── apps/
│   ├── web/               # Next.js 프론트
│   └── api/               # FastAPI
├── packages/
│   ├── pipeline/          # 수집·임베딩·UMAP·격자화
│   ├── shared-types/      # 프론트·백 공유 타입 (TS)
│   └── analysis/          # whitespace 알고리즘
├── data/                  # gitignore (큰 파일)
├── planning/              # 본 기획 문서
└── infra/                 # 도커, 배포 스크립트
```

## 외부 데이터 연동
- 사용자의 기존 `arxiv-paper-scraping` 모듈을 `packages/pipeline/ingestion/` 으로 통합 또는 submodule

## MVP에서 뺄 것 (Out of Scope)
- 사용자 인증 (초기엔 익명)
- 실시간 협업
- 모바일 최적화 (데스크톱 우선)
- 다국어 (한/영만)
