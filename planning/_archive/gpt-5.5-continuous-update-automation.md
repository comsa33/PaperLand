# PaperLand 지속 업데이트 자동화 기획

## 한 줄 결론

PaperLand의 논문 업데이트는 **인간 관리자의 상시 개입 없이 대부분 자동화 가능**하다. 다만 "완전 실시간"보다는 **일 단위 자동 갱신 + 신규 논문 델타 레이어 + 주기적 지도 재정렬**이 현실적이고 안전하다.

핵심 원칙:

- 새 논문은 빠르게 반영한다.
- 기존 지도 좌표계는 자주 흔들지 않는다.
- 자동화가 실패해도 마지막 정상 지도가 계속 보이게 한다.
- 사람이 보는 것은 원자료가 아니라 이상 징후, 품질 지표, 주간 요약뿐이어야 한다.

## 전제

V0는 정적 스냅샷으로 유지한다. 자동 업데이트는 V0 dogfooding 이후, 사용자가 실제로 "검토할 가치 있는 공백 후보"를 얻는다는 신호가 있을 때 V1 이후 기능으로 도입한다.

자동 업데이트가 너무 빨리 들어오면 다음 문제가 생긴다.

- UMAP 좌표가 자주 바뀌어 사용자의 멘탈 모델이 깨진다.
- 매일 새 논문 몇 편 때문에 전체 임베딩/클러스터링을 재계산하게 된다.
- 공백 후보 Top 10이 매번 흔들려 제품 신뢰도가 떨어진다.
- 데이터 소스/API 변경이나 일시 장애가 곧바로 사용자 경험을 망친다.

따라서 PaperLand는 **stable map + daily delta** 구조로 가는 것이 좋다.

## 데이터 소스별 역할

### 1. arXiv OAI-PMH: 기본 수집원

arXiv 메타데이터 동기화의 기본 경로는 OAI-PMH가 적합하다.

역할:

- 초기 전체 수집
- 이후 `from=last_successful_harvest` 기반 증분 수집
- 카테고리 단위 선택 수집
- 최신 버전 메타데이터 동기화
- withdrawn/replacement/admin metadata 변경 반영

장점:

- arXiv가 메타데이터 수집과 동기화 용도로 제공하는 공식 경로다.
- datestamp 기반으로 incremental harvesting이 가능하다.
- 특정 subject set만 선택할 수 있다.

주의:

- datestamp는 제출일이 아니라 레코드 수정 시간이다.
- 과거 bulk update가 있으면 특정 날짜에 변경 레코드가 몰릴 수 있다.
- 신규 논문은 발표 이후 메타데이터가 반영된다. 제품에서는 "실시간"보다 "자동 갱신" 또는 "최근 발표 반영"이라고 표현하는 편이 안전하다.

### 2. arXiv API/RSS: 빠른 미리보기용

arXiv API나 RSS는 대량 동기화보다 작은 범위의 최신 논문 확인에 쓴다.

역할:

- "오늘 새로 들어온 cs.CL 논문" 미리보기
- 운영 대시보드에서 OAI-PMH 결과와 비교하는 sanity check
- 특정 검색어 기반 임시 탐색

주의:

- 대량 수집에는 OAI-PMH가 더 적합하다.
- API 호출은 정중한 지연, 작은 slice, retry/backoff가 필요하다.

### 3. OpenAlex/Semantic Scholar: 비동기 보강원

OpenAlex와 Semantic Scholar는 메인 수집을 막지 않는 비동기 enrichment 단계로 둔다.

역할:

- citation count
- DOI
- venue/publisher/source 정보
- reference/citation graph
- author/institution 보강

원칙:

- arXiv 신규 논문 반영은 enrichment 실패와 독립적으로 진행한다.
- enrichment는 "있으면 좋음" 데이터로 취급한다.
- citation 관련 정보는 매일 갱신할 필요가 없다. 주간 또는 월간 갱신으로 충분하다.

## 추천 아키텍처

```text
                    scheduled jobs
                         |
                         v
               +-------------------+
               | harvest scheduler |
               +-------------------+
                         |
                         v
+---------+     +-------------------+     +----------------+
| arXiv   | --> | staging records   | --> | normalize/dedupe |
| OAI-PMH |     +-------------------+     +----------------+
+---------+                                      |
                                                v
                                      +--------------------+
                                      | changed paper set  |
                                      +--------------------+
                                                |
              +---------------------------------+---------------------------------+
              |                                 |                                 |
              v                                 v                                 v
   +--------------------+            +--------------------+            +--------------------+
   | embedding cache    |            | metadata store     |            | enrichment queue   |
   | by content hash    |            | parquet/duckdb     |            | citations/doi/etc  |
   +--------------------+            +--------------------+            +--------------------+
              |
              v
   +--------------------+
   | map transform      |  new papers only
   +--------------------+
              |
              v
   +--------------------+
   | cell stats update  |
   +--------------------+
              |
              v
   +--------------------+
   | whitespace refresh |
   +--------------------+
              |
              v
   +--------------------+
   | artifact publish   |
   | manifest + json    |
   +--------------------+
```

## Stable Map + Delta Layer

### Stable map

Stable map은 사용자가 보는 기본 연구 지형이다.

포함:

- 기존 논문 좌표
- 클러스터 라벨
- hex density
- 공백 후보 Top-K
- 지도 epoch 정보

업데이트 주기:

- V1: 수동 또는 주간
- V2: 주간 shadow rebuild 후 자동 승격
- V3: 월간 major epoch + 일간 delta

### Delta layer

Delta layer는 최근 추가/수정된 논문만 표시하는 얇은 레이어다.

포함:

- 오늘/이번 주 신규 논문
- 기존 UMAP 모델의 `transform()`으로 매핑한 좌표
- 기존 클러스터 centroid에 가까운 자동 cluster assignment
- 아직 확정되지 않은 "new cluster candidate"

장점:

- 최신 논문을 빠르게 보여줄 수 있다.
- 전체 지도 재학습 없이 반영 가능하다.
- 사용자는 지도 구조가 흔들리지 않은 상태에서 새 점만 볼 수 있다.

UI 표현:

- "최근 추가 논문" 토글
- "마지막 갱신: YYYY-MM-DD HH:mm KST"
- "지도 기준 epoch: 2026-W20"
- "신규 논문은 임시 좌표이며 다음 지도 재빌드 때 안정화됩니다"

## 자동 갱신 단계

### 1. Harvest

목표:

- 새 논문과 수정된 논문을 빠짐없이 가져온다.

방식:

- OAI-PMH `from` 값을 마지막 성공 응답 기준으로 저장한다.
- 카테고리별 set을 사용한다.
- resumption token은 당일 만료될 수 있으므로 중간 실패 시 같은 harvest window를 다시 시작할 수 있어야 한다.
- 수집 결과는 바로 production에 쓰지 않고 staging에 저장한다.

필수 저장값:

- `source`
- `source_record_id`
- `arxiv_id`
- `datestamp`
- `harvest_started_at`
- `harvest_completed_at`
- `raw_payload_hash`
- `harvest_window_from`
- `harvest_window_until`

### 2. Normalize and Dedupe

목표:

- 같은 논문을 여러 버전/소스에서 가져와도 하나의 canonical record로 합친다.

규칙:

- 기본 키는 canonical arXiv ID다.
- DOI가 있으면 보조 식별자로 저장한다.
- title hash와 author signature는 중복 의심 탐지에만 사용한다.
- version이 바뀌면 기존 레코드를 덮어쓰기보다 version history를 보존한다.
- withdrawn/replaced 상태는 삭제하지 말고 상태로 표시한다.

출력:

- `papers_current.parquet`
- `paper_versions.parquet`
- `paper_source_records.parquet`
- `quarantine_records.parquet`

### 3. Incremental Embedding

목표:

- 새로 바뀐 논문만 임베딩한다.

방식:

- `embedding_input = normalized_title + "\n" + normalized_abstract`
- content hash를 계산한다.
- hash가 기존 cache에 있으면 재사용한다.
- title/abstract가 바뀐 논문만 재임베딩한다.
- 모델 버전을 manifest에 저장한다.

캐시 키:

```text
embedding_cache_key = model_name + model_version + embedding_input_hash
```

주의:

- 임베딩 모델을 바꾸면 전체 지도 epoch이 바뀐 것으로 취급한다.
- 다른 모델의 임베딩을 같은 UMAP 공간에 섞지 않는다.

### 4. Coordinate Assignment

목표:

- 새 논문을 기존 지도 위에 빠르게 올린다.

방식:

- 기존 UMAP reducer를 저장해두고 신규 임베딩에 `transform()`을 적용한다.
- 좌표가 기존 분포에서 너무 멀면 outlier로 표시하고 공백 후보 계산에는 일단 제외한다.
- 가까운 클러스터 centroid를 기준으로 임시 클러스터를 부여한다.
- nearest papers 5-10개를 함께 저장해 설명 가능성을 확보한다.

출력:

- `paper_coords_delta.parquet`
- `delta_cluster_assignments.parquet`
- `delta_outliers.parquet`

### 5. Cell Stats and Whitespace Refresh

목표:

- 전체 재계산 없이 영향 받은 셀과 주변 셀만 갱신한다.

방식:

- 신규/수정 논문이 들어간 hex cell을 찾는다.
- 해당 cell과 radius N 이웃 cell만 recompute한다.
- `paper_count`, `recent_count`, `neighbor_density`, `growth_rate`를 갱신한다.
- AdjacentGapDetector는 갱신된 neighborhood에서만 다시 실행한다.
- Top-K는 기존 후보와 신규 후보를 merge한 뒤 재정렬한다.

주의:

- 후보가 너무 자주 바뀌면 제품 신뢰가 떨어진다.
- `daily_top10`과 `stable_top10`을 분리한다.
- 사용자 기본 화면은 stable 후보를 보여주고, "최근 변화" 탭에서 daily 후보를 보여준다.

### 6. Artifact Build and Publish

목표:

- 프론트엔드가 백엔드 없이도 최신 데이터를 안전하게 읽게 한다.

산출물:

```text
serving/
  manifest.json
  map_epoch_2026-W20/
    cells.json
    papers_index.parquet
    cluster_labels.json
    whitespace_stable_top10.json
  deltas/
    2026-05-10/
      delta_papers.json
      delta_cells.json
      whitespace_daily_candidates.json
```

`manifest.json` 예시:

```json
{
  "schema_version": "1.0",
  "map_epoch": "2026-W20",
  "latest_delta_date": "2026-05-10",
  "source": "arxiv-oai-pmh",
  "categories": ["cs.CL"],
  "paper_count": 48231,
  "delta_paper_count": 143,
  "last_successful_harvest_at": "2026-05-10T23:45:00+09:00",
  "embedding_model": "specter2@version",
  "artifact_checksums": {
    "cells_json": "sha256:...",
    "whitespace_top10": "sha256:..."
  }
}
```

Publish 원칙:

- 모든 artifact는 versioned path에 먼저 업로드한다.
- validation 통과 후 manifest만 마지막에 교체한다.
- manifest 교체가 사실상 deploy switch 역할을 한다.
- 새 artifact가 깨지면 이전 manifest를 계속 유지한다.

## 자동 품질 게이트

자동화가 신뢰를 얻으려면 매번 다음 검사를 통과해야 한다.

### Schema Gate

- 필수 필드 존재 여부
- date/category/arXiv ID 형식
- abstract/title empty 비율
- 중복 ID 비율

### Count Gate

- 하루 신규 논문 수가 최근 30일 평균 대비 너무 크거나 작지 않은지
- 특정 카테고리만 0건이 아닌지
- withdrawn/replaced 비율이 이상하게 높지 않은지

### Embedding Gate

- embedding coverage 99% 이상
- zero vector 또는 NaN 없음
- 평균 norm/분산이 이전 batch와 크게 다르지 않음

### Coordinate Gate

- UMAP transform 실패율
- outlier 비율
- 신규 논문 좌표 분포가 기존 지도에서 지나치게 벗어나지 않는지

### Whitespace Gate

- Top-K 후보가 하루에 과도하게 바뀌지 않는지
- 모든 후보가 최소 근거 논문 수를 충족하는지
- 모든 사용자-facing 설명에 "수집 데이터 기준" 또는 동등한 제한 문구가 포함되는지

## Self-Healing 전략

### Retry and Backoff

- 수집/API 호출 실패는 exponential backoff로 재시도한다.
- source별 rate limit과 timeout을 별도 설정한다.
- 같은 harvest window는 idempotent하게 재실행할 수 있어야 한다.

### Quarantine

아래 레코드는 production으로 바로 보내지 않는다.

- XML/JSON parsing 실패
- 필수 메타데이터 누락
- 비정상적으로 긴 title/abstract
- 카테고리 불명확
- 중복 의심이 높지만 canonical ID가 다른 레코드

Quarantine은 운영자에게 매일/매주 요약만 보낸다. 서비스는 quarantine이 있어도 계속 갱신된다.

### Last Good Snapshot

- 새 artifact validation 실패 시 publish하지 않는다.
- 프론트는 항상 마지막 정상 `manifest.json`을 읽는다.
- 운영자에게는 "갱신 실패, 사용자 영향 없음" 알림만 보낸다.

### Shadow Rebuild

전체 UMAP/클러스터 재학습은 production에 바로 반영하지 않는다.

흐름:

1. 새 전체 지도 후보를 shadow로 생성한다.
2. 기존 지도와 Procrustes 정렬한다.
3. drift metric을 계산한다.
4. 공백 후보 overlap, cluster label 안정성, 좌표 이동량을 검사한다.
5. 기준 통과 시 자동 승격하거나, 기준 경계값이면 운영자 승인 대기한다.

## 운영자 개입을 최소화하는 대시보드

관리자가 매일 원자료를 보지 않게 만드는 것이 목표다. 대시보드는 "해야 할 일이 있을 때만" 보여줘야 한다.

### Daily Status

- 마지막 성공 harvest 시각
- 신규/수정/withdrawn 논문 수
- embedding 성공률
- artifact publish 여부
- 사용자에게 노출 중인 map epoch
- freshness SLA 상태

### Weekly Digest

- 이번 주 신규 논문 수
- 새로 생긴 high-growth cell
- 공백 후보 Top-K 변동
- 안정적으로 유지되는 후보
- 새로 quarantine된 레코드 요약
- 운영자 확인이 필요한 anomaly

### Alert 기준

즉시 알림:

- 24시간 이상 harvest 실패
- artifact publish 실패가 2회 연속
- schema 변경 의심
- 신규 논문 수가 최근 평균 대비 극단적으로 다름
- embedding job이 backlog를 따라잡지 못함

주간 알림:

- cluster drift 증가
- 후보 Top-K 변동성 증가
- source enrichment 실패율 증가
- API 약관/스키마 변경 확인 필요

## 자동화 수준별 로드맵

### V0: 정적 스냅샷

- 자동 갱신 없음.
- 목표는 제품 가설 검증.
- 데이터 freshness는 중요하지 않다.

### V1: 수동 실행 가능한 배치

- `make refresh-cs-cl` 같은 단일 명령으로 전체 refresh.
- artifact validation과 manifest publish는 자동.
- 운영자가 원할 때만 실행.

### V1.5: 일 단위 자동 갱신

- OAI-PMH incremental harvest 자동화.
- 신규 논문 임베딩 cache 자동화.
- delta layer 자동 publish.
- 실패 시 last good snapshot 유지.
- 운영자에게 daily/weekly summary 전송.

### V2: 자동 shadow rebuild

- 주간 또는 월간 전체 지도 재빌드.
- drift gate 통과 시 자동 승격.
- 애매하면 운영자 승인.
- citation enrichment 주간/월간 자동화.

### V3: 거의 무인 운영

- source별 health monitoring.
- schema change detection.
- data quality anomaly detection.
- 자동 GitHub issue 생성.
- 비용/latency/backlog budget alert.
- 운영자는 주간 digest와 예외 케이스만 확인.

## 완전자동화가 가능한 것과 어려운 것

### 자동화 가능

- 새 arXiv 메타데이터 수집
- 중복 제거와 버전 업데이트
- 신규/변경 논문 임베딩
- 기존 지도 좌표로 신규 논문 매핑
- hex cell 통계 갱신
- 공백 후보 daily refresh
- artifact build/publish/rollback
- 품질 게이트와 알림
- 주간 요약 리포트

### 완전 자동화가 어려운 것

- API 약관/라이선스 해석 변경
- 임베딩 모델 교체 결정
- 지도 메타포 자체가 실패했는지 판단
- 잘못 라벨링된 클러스터의 의미 수정
- 특정 분야에서 공백 후보가 학술적으로 유효한지 최종 판정
- 사용자가 실제로 연구 가치를 느끼는지 판단

정리하면, **운영은 자동화할 수 있지만 학술적 판단은 자동화하면 안 된다.** PaperLand는 "공백 후보를 유지보수 없이 계산하는 시스템"이 될 수는 있어도, "좋은 연구 주제를 무인으로 보증하는 시스템"이 되어서는 안 된다.

## 추천 구현 선택

초기 운영 자동화는 다음 조합이 가장 현실적이다.

| 영역 | 추천 |
|------|------|
| 스케줄러 | GitHub Actions, cron, 또는 Prefect |
| 원천 수집 | arXiv OAI-PMH |
| 저장 | Parquet + DuckDB |
| 임베딩 캐시 | local/object storage keyed by content hash |
| 좌표 갱신 | UMAP `transform()` |
| artifact 배포 | versioned static files + manifest switch |
| 관측성 | run manifest + validation report + weekly digest |
| 알림 | email/Slack/GitHub issue 중 하나 |

Vercel 정적 프론트와 잘 맞는 방식은 **object storage/CDN에 artifact를 올리고 manifest만 교체하는 구조**다. 백엔드 서버를 상시 운영하지 않아도 최신 지도를 제공할 수 있다.

## PaperLand에 맞는 최종 방향

V0 이후에는 다음 순서가 가장 좋다.

1. V0에서 정적 지도와 Adjacent Gap의 사용 가치를 검증한다.
2. V1에서 수동 refresh 명령을 만든다.
3. V1.5에서 arXiv OAI-PMH 기반 일 단위 delta update를 자동화한다.
4. V2에서 weekly shadow rebuild와 자동 승격 gate를 붙인다.
5. V3에서 운영자에게 주간 digest와 anomaly만 전달한다.

이렇게 가면 논문이 계속 추가되는 현실을 따라가면서도, 지도 안정성과 제품 신뢰도를 잃지 않을 수 있다.

## 참고한 공식 문서

- arXiv API User's Manual: https://info.arxiv.org/help/api/user-manual.html
- arXiv OAI-PMH documentation: https://info.arxiv.org/help/oa/index.html
- OpenAlex API overview: https://developers.openalex.org/api-reference/introduction
- OpenAlex paging guide: https://developers.openalex.org/how-to-use-the-api/get-lists-of-entities/paging
- Semantic Scholar API overview: https://www.semanticscholar.org/product/api
