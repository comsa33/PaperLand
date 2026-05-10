# 데이터 파이프라인

> ⚠️ **이 문서는 탐색·전체 그림용**이다. **V0 구현 시에는 [08-v0-scope](./opus4.7-08-v0-scope.md)와 [10-stack-decisions](./opus4.7-10-stack-decisions.md)가 우선한다.** 본 문서의 FastAPI/DB 등은 V1+ 옵션이며 V0에는 포함되지 않는다.

## 입력 소스
- **1차**: arXiv (사용자가 이미 보유한 `arxiv-paper-scraping` 활용)
- **2차 확장**: Semantic Scholar API, OpenAlex, DBLP
- **메타데이터**: 인용수, 저자, 기관, 발행연도, 카테고리

## 파이프라인 단계

```
[arXiv 수집] → [전처리/정제] → [임베딩] → [차원축소] → [클러스터링] → [격자화] → [통계산출] → [API 서빙]
     ↓             ↓              ↓           ↓             ↓             ↓           ↓
   raw.jsonl   clean.parquet   emb.npy   coords.parquet  clusters.json  cells.json  stats.json
```

### 1. 수집 (Ingestion)
- 일/주 단위 증분 수집
- arXiv ID, title, abstract, authors, categories, date, version
- 저장: Parquet (분석 효율) + DuckDB / Postgres (쿼리)

### 2. 전처리
- LaTeX 토큰 정제, 수식 처리
- 중복 제거 (다중 버전 → 최신 버전)
- 언어 필터 (영어 외 제외 또는 별도 처리)

### 3. 임베딩 (Embedding)
- 후보 모델:
  - `SPECTER2` (논문 특화, 추천)
  - `SciNCL`
  - `OpenAI text-embedding-3-small` (간편하지만 비용)
  - `bge-large-en-v1.5` (오픈소스, 무료)
- 입력: title + abstract (concat)
- 차원: 768 또는 1024
- 저장: numpy memmap 또는 FAISS index

### 4. 차원축소 (Dimensionality Reduction)
- **UMAP** 추천 (전역 구조 + 지역 구조 균형)
- 대안: t-SNE (지역 강조), PCA (빠름·전역만)
- 2D 좌표 → 시각화용
- 점진적 업데이트가 어려우므로 **주기 재계산** + 신규 논문은 `transform`으로 매핑

### 5. 클러스터링
- **HDBSCAN** (밀도 기반, 군집 수 자동)
- 또는 **BERTopic** (토픽 라벨링까지 한 번에)
- 클러스터별 대표 키워드 자동 추출 (c-TF-IDF)

### 6. 격자화 (Hex/Grid Binning)
- 2D 좌표를 hex bin으로 집계
- 각 셀:
  - paper_count, recent_count
  - top_keywords, top_authors
  - dominant_category
  - whitespace_score

### 7. 통계 산출
- 시간축 슬라이스별 셀 통계 (연도별)
- 인접 셀 밀도, growth_rate
- whitespace 후보 ranking

### 8. API 서빙
- 정적 파일 + API 하이브리드:
  - 격자 단위 집계 → 정적 JSON/Parquet (CDN)
  - 개별 논문 검색·필터 → API (FastAPI + DuckDB)

## 갱신 주기
- arXiv 수집: 매일
- 임베딩: 신규 논문만 매일 (배치)
- UMAP 재계산: 주 1회 (좌표가 흔들리면 UX 나쁨 → 안정화 전략 필요)
- 격자 통계: 매일

## 좌표 안정성 전략
UMAP을 매번 새로 돌리면 좌표가 회전·반전됨 → 사용자 혼란
- **앵커 기반 정렬**: 이전 결과의 anchor 논문 좌표에 맞춰 회전·반사 정렬 (Procrustes)
- **신규 논문은 `transform()`만** 사용 (재학습 X)
- 재학습은 분기/반기 단위로만, 그때 UI에 "지도 업데이트" 안내

## 저장 구조 (예시)
```
data/
  raw/
    arxiv_2026-05-10.jsonl
  processed/
    papers.parquet           # 정제된 논문 메타
    embeddings.npy           # (N, 768)
    coords_2d.parquet        # paper_id, x, y
    clusters.parquet         # paper_id, cluster_id
  serving/
    cells.json               # 격자 셀별 집계
    cells_yearly/            # 연도별 셀
    whitespace_top.json      # Top-K 빈 영역
    cluster_labels.json
```

## 비용·성능 대략 추산 (50만 논문 기준)
- 임베딩(SPECTER2 로컬 GPU): 수 시간
- UMAP: 30분~2시간
- HDBSCAN: 1시간 내외
- 저장: 임베딩 ~1.5GB, 좌표·메타 ~수백MB
- 프론트 전송: 격자 집계만 보내면 수 MB
