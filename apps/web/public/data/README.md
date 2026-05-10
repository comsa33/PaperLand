# `apps/web/public/data/`

V0 정적 JSON artifact 5종이 위치하는 디렉토리. 프론트가 `/data/manifest.json`부터 fetch.

## 현재 상태 (V0)
**합성 픽스처가 커밋되어 있습니다.** Vercel/CDN 배포 시 별도 데이터 파이프라인 없이도 앱이 정상 동작.

## 갱신 방법
```bash
# 루트에서
make fixtures
```

→ `paperland fixtures` CLI가 합성 데이터를 생성하여 이 디렉토리를 덮어씁니다.

## 실데이터로 교체 (V1+)
실제 arXiv cs.CL 데이터로 빌드하려면:
```bash
cd packages/pipeline
paperland build --papers <path-to-papers.parquet> --out ../../apps/web/public/data
```
(현재 `paperland build`는 stub. 실데이터 통합은 Phase 2 스토리에서 처리)

## 파일 목록
| 파일 | 내용 |
|------|------|
| `manifest.json` | 빌드 메타 + 체크섬 (deploy switch) |
| `cells.json` | hex 셀 통계 (paper_count / centroid / keywords / dominant_category) |
| `papers_index.json` | 논문 슬림 인덱스 (id / title / x / y / cell_id / year) |
| `cluster_labels.json` | 클러스터 ID → 키워드 |
| `whitespace_top10.json` | 공백 후보 Top 10 (점수 / 근거 / 인접 키워드 / 검색 쿼리) |
