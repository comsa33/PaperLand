# paperland-pipeline

PaperLand의 데이터 파이프라인 (Python).

## 모듈
| 모듈 | 역할 |
|------|------|
| `ingestion` | arXiv 수집 / Parquet·JSONL 로드 / 스키마 검증 |
| `embedding` | SPECTER2 기반 임베딩 (sentence-transformers) |
| `projection` | UMAP 2D 차원축소 + reducer 저장/로드 |
| `clustering` | HDBSCAN + sklearn c-TF-IDF 키워드 추출 |
| `gridding` | h3 hex bin 격자화 + 셀 집계 |
| `detectors.AdjacentGapDetector` | V0 단일 detector — 인접 공백 탐지 |
| `build` | V0 정적 JSON artifact 빌드 (manifest + cells + papers_index + cluster_labels + whitespace_top10) |
| `fixtures` | 합성 픽스처 생성 (GPU 불필요, 프론트 검증용) |
| `cli` | Typer CLI (`paperland fixtures`, `paperland build`) |

## 설치
```bash
cd packages/pipeline
uv venv
uv pip install -e .
```

## 빠른 실행 (픽스처)
```bash
paperland fixtures --out ../../apps/web/public/data --n 300 --clusters 8
```

→ `apps/web/public/data/` 에 5개 JSON artifact가 생성되어 프론트가 즉시 렌더 가능.
