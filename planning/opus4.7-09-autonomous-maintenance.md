# 자율 유지보수 (Autonomous Maintenance)

> **목표**: 새 논문이 매일 수백~수천 편씩 추가되는 환경에서, **인간 관리자 개입을 최소화**하고 지도·공백 후보·라벨이 스스로 갱신되는 시스템.

## 자율성 등급 (Autonomy Levels)
| Level | 설명 | 인간 개입 |
|-------|------|----------|
| L0 | 수동 | 매번 사람이 실행 |
| L1 | 스케줄링 | 사람이 cron 등록, 실행은 자동 |
| L2 | **자가 점검** | 메트릭 이상 시 자동 롤백·재시도 |
| L3 | **자가 적응** | 데이터 드리프트 감지 시 파이프라인 자동 재구성 |
| L4 | 완전 자율 | 사람 개입 사실상 0 (이론적 목표) |

→ **현실 목표는 L2~L3.** L4는 학술 도메인 특성상 부적절(편향·라벨 오류 점검 필요).

> **핵심 분리 원칙 (운영 vs 학술 판단)**
> - ✅ **운영은 자동화 가능**: 수집·임베딩·매핑·통계·후보 계산·아티팩트 빌드·롤백
> - ❌ **학술 판단은 자동화 금지**: 모델 교체, 라벨 의미 검증, 분야별 후보 유효성, 메타포 자체의 적절성
> - PaperLand는 "공백 후보를 무인 운영으로 계산하는 시스템"이 될 수 있어도, "좋은 연구 주제를 무인으로 보증하는 시스템"이 되어서는 안 된다.

---

## 운영 아키텍처: Stable Map + Delta Layer

매일 새 논문이 들어와도 **사용자가 보는 지도 좌표는 흔들리지 않아야 한다.** 이를 위해 두 레이어로 분리.

### Stable Map (분기/주간 epoch 단위)
- 기존 논문 좌표, 클러스터 라벨, hex density, 공백 후보 Top-K, **map epoch ID** 포함
- 갱신 주기: V1 수동·주간 → V2 자동 shadow rebuild 후 승격 → V3 월간 major epoch
- 사용자 기본 화면이 보는 지도

### Delta Layer (일 단위)
- 최근 추가/수정 논문만 표시하는 얇은 레이어
- 기존 UMAP 모델의 `transform()`만 사용 (재학습 X) → 좌표 안정
- 가장 가까운 클러스터 centroid에 임시 할당 (확정은 다음 stable rebuild에서)
- UI: "최근 추가 논문" 토글, "마지막 갱신 시각", "신규 논문은 임시 좌표이며 다음 재빌드 시 안정화" 고지

### Top-K 안정화: stable_top10 vs daily_candidates
- 사용자 기본 화면 = `stable_top10` (주간 단위 변동)
- "최근 변화" 탭에서만 `daily_candidates` 노출
- → 후보 흔들림으로 인한 신뢰도 하락 방지

---

## 데이터 소스 전략

| 소스 | 역할 | 갱신 |
|------|------|------|
| **arXiv OAI-PMH** | 기본 수집 (incremental harvest) | 일 단위 `from=last_successful_harvest` |
| arXiv API/RSS | 운영 sanity check, 미리보기 | 보조 |
| OpenAlex / Semantic Scholar | citation/DOI/venue 비동기 enrichment | 주/월 단위 |

OAI-PMH 사용 이유:
- arXiv가 메타데이터 동기화 용도로 제공하는 공식 경로
- datestamp 기반 incremental harvesting
- subject set(카테고리) 단위 수집

주의:
- datestamp는 "레코드 수정 시간"이지 제출일이 아님. 과거 bulk update가 특정 날짜에 몰릴 수 있음.
- resumption token은 당일 만료될 수 있음 → 같은 harvest window 재실행 가능해야 함 (idempotent).
- 사용자 카피는 "실시간"이 아닌 "자동 갱신" / "최근 발표 반영"으로 표기.
- enrichment 실패는 메인 갱신을 막지 않음 (있으면 좋음 데이터로 취급).

---

## 임베딩 캐시: Content Hash 기반

```
embedding_cache_key = model_name + model_version + sha256(normalized_title + "\n" + normalized_abstract)
```

- title/abstract 변경된 논문만 재임베딩
- 모델 버전이 바뀌면 **map epoch이 바뀐 것으로 간주** → 다른 모델 임베딩을 같은 UMAP 공간에 섞지 않음
- 캐시 적중률은 운영 메트릭에 포함

---

## Manifest 기반 안전 배포

프론트는 백엔드 없이 정적 파일만 읽음. 배포 안전성은 manifest로 보장.

```
serving/
  manifest.json                       ← 마지막에 교체 (deploy switch)
  map_epoch_2026-W20/
    cells.json
    papers_index.json
    cluster_labels.json
    whitespace_stable_top10.json
  deltas/
    2026-05-10/
      delta_papers.json
      delta_cells.json
      whitespace_daily_candidates.json
```

`manifest.json` 예:
```json
{
  "schema_version": "1.0",
  "map_epoch": "2026-W20",
  "latest_delta_date": "2026-05-10",
  "embedding_model": "specter2@v0.1",
  "categories": ["cs.CL"],
  "paper_count": 48231,
  "last_successful_harvest_at": "2026-05-10T23:45:00+09:00",
  "artifact_checksums": { "cells_json": "sha256:...", ... }
}
```

배포 원칙:
1. 모든 artifact는 versioned 경로에 먼저 업로드
2. 모든 품질 게이트 통과 후 manifest만 마지막에 교체
3. **Last Good Snapshot**: 새 artifact가 게이트를 통과 못 하면 manifest 교체 안 함 → 사용자는 이전 정상 지도 계속 사용
4. 운영자에게는 "갱신 실패, 사용자 영향 없음" 알림만

---

## Shadow Rebuild (전체 재학습 안전 승격)

UMAP/HDBSCAN 전체 재학습은 production에 **즉시 반영하지 않는다.**

흐름:
1. 새 전체 지도 후보를 shadow 환경에 빌드
2. 기존 지도와 **Procrustes 정렬** (회전·반사 보정)
3. drift metric 계산:
   - 좌표 평균 이동량
   - 공백 후보 Top-K overlap
   - 클러스터 라벨 안정성
4. 기준 통과 시 자동 승격 / 경계값이면 운영자 승인 대기 / 미통과 시 폐기
5. 승격 = manifest의 `map_epoch` 교체

---

## Quarantine 패턴

다음 레코드는 production으로 직행하지 않고 격리:
- XML/JSON parsing 실패
- 필수 메타데이터 누락
- 비정상적으로 긴 title/abstract
- 카테고리 불명확
- 중복 의심이 높지만 canonical ID가 다른 레코드

원칙:
- Quarantine은 서비스 갱신을 **막지 않음** (메인 파이프라인 진행)
- 운영자에게는 일/주 단위 요약만 제공
- 격리 사유별 카운트 시계열로 anomaly 탐지

---

## 핵심 챌린지 5가지

### C1. 좌표 안정성 (UMAP Drift)
새 논문 추가 시 UMAP을 재학습하면 좌표가 회전·반전 → 사용자 멘탈모델 붕괴.

**자동화 전략**:
- **증분 모드**: 신규 논문은 `umap.transform()`만 사용 (재학습 X). 기존 좌표 불변.
- **드리프트 모니터링**: 매주 표본 1000편을 transform → 원래 좌표와 거리 측정. **임계값 초과 시 재학습 큐에 등록**.
- **재학습 시 Procrustes 정렬**: 이전 결과의 anchor 논문 좌표에 맞춰 회전·반사 보정. 사용자에게는 좌표 변동 거의 안 보임.
- **재학습 주기**: 분기 1회 또는 드리프트 임계값 초과 시.

### C2. 클러스터 라벨 부패 (Topic Drift)
시간이 지나면 클러스터에 새 키워드가 들어와 기존 라벨이 부적절해짐.

**자동화 전략**:
- **라벨 신선도 스코어**: 클러스터의 최근 N편 c-TF-IDF vs 기존 라벨 단어의 유사도. 하락 시 알림.
- **Candidate Label 생성**: 임계값 미만이면 c-TF-IDF로 후보 라벨 생성. 자동 교체 X.
  - **V2**: confidence 무관, 모두 운영자 제안(Admin UI에서 1-클릭 승인/거부)으로만 적용
  - **V3**: confidence 매우 높음(임계값 + 안정성 검증 통과)에 한해 조건부 자동 적용 + 변경 로그 + 사용자 알림
  - 학술 판단 영역이므로 자동 적용은 V2까지 금지, V3에서도 보수적 임계값 유지
- **라벨 변경 이력 보존**: 사용자가 "이 분야 라벨이 갑자기 바뀜" 혼란 방지를 위해 변경 로그 노출.

### C3. 공백 후보의 자동 만료 (Whitespace Decay)
어제는 공백이었는데 오늘 누군가 논문을 올림 → 어제의 "공백"이 거짓이 됨.

**자동화 전략**:
- **매일 재계산**: AdjacentGapDetector를 일 1회 실행 → `daily_candidates` 갱신 (사용자 기본 화면의 `stable_top10`은 흔들지 않음)
- **승격 평가**: 주간 사이클에서 안정적으로 유지된 daily 후보를 stable_top10으로 승격
- **사라진 후보 추적**: 이전 stable 후보 중 점수 하락한 항목 → "최근 채워진 영역" 별도 패널로 노출 (가치 있는 정보)
- **사용자 북마크 보호**: 사용자가 북마크한 후보가 사라지면 알림 + 어떤 논문이 채웠는지 표시

### C4. 데이터 품질 드리프트
arXiv 메타데이터 포맷 변경, 분류 체계 개편, 스팸 논문 증가 등.

**자동화 전략**:
- **스키마 검증**: 수집 단계에서 Pydantic/Pandera 스키마 통과율 모니터링. 통과율 < 99% 시 알림.
- **이상치 탐지**: 일별 수집량/논문 길이/메타 결측률을 시계열 모니터링 (3σ 룰).
- **품질 게이트**: 통과 못 하면 다음 단계 진행 차단 + 인간 개입 요청.

### C5. 인프라 장애 회복
임베딩 GPU OOM, API 레이트리밋, 디스크 가득참 등.

**자동화 전략**:
- **재시도 + 지수 백오프**: 모든 외부 호출에 적용 (최대 N회).
- **체크포인트**: 임베딩 등 긴 작업은 배치 단위 체크포인트 → 실패 시 마지막 성공 지점부터 재개.
- **자가 정리**: 7일 지난 임시 파일·로그 자동 삭제 (디스크 절약).

---

## 자동화 파이프라인 설계

### 일일 사이클 (Daily Cycle) — Delta Layer 갱신만
스케줄은 고정 시각이 아닌 **harvest checkpoint 기반**. 각 단계는 idempotent하게 재실행 가능.

```
[trigger] arXiv OAI-PMH harvest (from = last_successful_harvest − overlap_window)
       ↓
          스키마 검증 + 중복 제거 + Quarantine 분리
       ↓
          증분 임베딩 (content hash 캐시 적중분 제외) + 체크포인트
       ↓
          UMAP transform (재학습 X) + 좌표 추가 (delta only)
       ↓
          기존 클러스터에 할당 (HDBSCAN approximate_predict, 임시 라벨) + 매칭 실패분은 `new cluster candidate 큐`에 적재 (다음 shadow rebuild에서 평가)
       ↓
          영향 받은 hex cell + 이웃 cell만 통계 갱신
       ↓
          AdjacentGap → daily_candidates 산출 + 본질 공백 필터
       ↓
          delta artifact 빌드 → 게이트 통과 시 manifest의 latest_delta_date 갱신
       ↓
          품질 메트릭 리포트 → 알림 (이상 시만)
```

`overlap_window`는 OAI-PMH datestamp 늦은 갱신을 잡기 위한 안전 윈도우 (예: 24–72h). 같은 레코드가 중복 수집돼도 dedupe 단계에서 처리.

### 주간 사이클 (Weekly) — Stable Map 승격
- UMAP 드리프트 모니터링 (transform vs 원좌표 거리)
- 클러스터 라벨 신선도 스코어 → candidate label 제안 (자동 교체 X)
- 사용자 피드백 집계 (`유효한 후보 같음` / `관련 연구가 이미 있음`)
- **stable_top10 승격**: 지난 주 daily_candidates 중 안정적으로 유지된 후보를 stable_top10으로 승격
- shadow rebuild 후보 평가 (조건 충족 시)

### 분기 사이클 (Quarterly)
- UMAP 재학습 + Procrustes 정렬
- HDBSCAN 재실행 (새 클러스터 출현 가능)
- 모델 업데이트 검토 (SPECTER2 → 최신 임베딩 모델)

---

## 자율 의사결정 트리거

각 트리거에 대해 **자동 실행** vs **인간 승인 요청**을 명확히:

| 이벤트 | 임계값 | 자동? | 행동 |
|--------|--------|------|------|
| 신규 논문 수집 실패 | 3회 연속 | ❌→ 알림 | 인간 점검 (API 변경 가능성) |
| 임베딩 GPU OOM | 1회 | ✅ | 배치 크기 1/2 축소 후 재시도 |
| UMAP 드리프트 < 임계값 | — | ✅ | transform만 계속 |
| UMAP 드리프트 ≥ 임계값 | — | ⚠️ | 재학습 큐 등록, 분기 사이클에서 처리 |
| 클러스터 라벨 신선도 하락 | < 0.7 | ⚠️ | candidate label 생성 → V2는 운영자 승인 필수, V3에서만 보수적 임계값 통과 시 조건부 자동 적용 |
| 공백 후보 Top 10 변동 | — | ✅ | `daily_candidates`만 매일 갱신, `stable_top10`은 주간 승격 |
| 스키마 통과율 < 99% | — | ❌→ 알림 | 차단 후 인간 점검 |
| 이상 논문 급증 (3σ↑) | — | ❌→ 알림 | 스팸/대량 업로드 의심 |
| 디스크 사용률 > 85% | — | ✅ | 임시 파일 자동 정리 |
| 사용자 피드백: 후보 부정확 | 누적 N회 | ⚠️ | 해당 후보 점수 페널티 |

---

## 모니터링 & 알림

### 핵심 메트릭 (자동 수집)
- **데이터**: 일별 신규 논문 수, 스키마 통과율, 결측률
- **파이프라인**: 단계별 소요 시간, 실패율, 체크포인트 위치
- **품질**: UMAP 드리프트, 라벨 신선도, 공백 후보 안정도
- **인프라**: GPU 메모리, 디스크, 네트워크 처리량
- **사용자**: 후보 클릭률, 피드백 부정확률

### 알림 채널
- **즉시 알림 (텔레그램/이메일)**: 파이프라인 차단, 데이터 이상치
- **일일 리포트**: 메트릭 요약 + 신규 공백 후보 Top 5
- **주간 리포트**: 드리프트·라벨 부패·사용자 피드백 트렌드

### 대시보드 (옵션)
- Grafana + Prometheus 또는 간단한 Streamlit 대시보드
- 인간 관리자가 주 1회 5분 훑어보면 끝

---

## "인간이 꼭 개입해야 하는" 7가지

자율성을 높이되, 다음은 **인간 판단이 필수**:

1. arXiv API 또는 메타데이터 포맷 변경 대응
2. 임베딩 모델 업그레이드 결정 (SPECTER2 → 차세대)
3. UMAP 재학습 후 좌표 정렬 결과 검수
4. 클러스터 라벨 자동 제안/적용이 의미를 왜곡한 경우
5. 사용자 피드백 누적으로 알고리즘 가중치 조정
6. 라이선스·저작권 변경 (Semantic Scholar 약관 등)
7. 윤리·편향 이슈 (특정 분야 부당하게 "공백"으로 표시)

→ 이 7가지를 위한 **관리자 콘솔(Admin UI)**: 주요 메트릭 + 승인 버튼 + 롤백 버튼만 있는 최소 화면.

---

## 기술 스택 (Phase별 점진 도입)

자동화 도구를 한 번에 다 깔면 V1에 과합. 운영 부담이 늘 때마다 더한다.

### V1: 최소 운영 (혼자도 무리 없음)
| 역할 | 도구 |
|------|------|
| 스케줄링 | **GitHub Actions cron** 또는 단순 cron + bash |
| 파이프라인 | Python 스크립트 + Makefile (`make refresh-cs-cl`) |
| 검증 | validation script (스키마/카운트/임베딩 게이트) |
| 배포 | versioned static files + manifest publish (object storage / Vercel) |
| 알림 | Email 또는 Telegram Bot 1개 (실패만) |
| 체크포인트 | Parquet + 별도 메타 JSON |

### V1.5 추가: 일 단위 증분 갱신
| 역할 | 도구 |
|------|------|
| 증분 수집 | OAI-PMH client + `last_successful_harvest` 상태 파일 |
| 임베딩 캐시 | local/object storage keyed by content hash |
| 일일 리포트 | weekly digest 스크립트 (마크다운 → 이메일/Slack) |

### V2 추가: Shadow Rebuild + Admin
| 역할 | 도구 |
|------|------|
| 오케스트레이션 | **Prefect 2** (의존성 그래프, 재시도, UI) — cron이 한계 도달 시 |
| 메트릭 | Prometheus + **Grafana** (운영 가시성 본격화) |
| Admin UI | Next.js admin route (승인/롤백/메트릭 5분 훑기) |
| 작업 큐 | Redis + RQ (비동기 임베딩 backlog 발생 시) |

### V3 추가: 거의 무인 운영
| 역할 | 도구 |
|------|------|
| 이상 탐지 | 시계열 anomaly detection (PyOD 등) |
| 자동 이슈 | GitHub Issue API 자동 생성 |
| 비용/SLA | budget alert |

---

## 단계적 자동화 도입

V0(MVP) 단계는 자동화 0%여도 됨. 그러나 V1 이후 **운영 부담이 빠르게 증가**하므로 단계 도입:

| Phase | 자동화 수준 | 신규 도입 |
|-------|------------|----------|
| V0 | L0 (수동) | 노트북에서 수동 실행, 자동 갱신 없음 |
| V1 | L1 (스케줄) | manual/scheduled full refresh (`make refresh`) + validation + manifest publish + 실패 알림 |
| V1.5 | L2 (자가 점검) | OAI-PMH 일 단위 incremental harvest + delta layer + 메트릭 모니터링 + 자동 롤백 + 체크포인트 |
| V2 | L2~L3 | 라벨 후보 제안/승인 워크플로 + 드리프트 자동 대응 + Admin UI |

---

## 자율 유지보수의 핵심 원칙
1. **롤백 가능성 > 자동화 범위**: 자동 결정은 항상 되돌릴 수 있어야 함
2. **결정 로그**: 자동 시스템이 내린 모든 결정은 로그로 남겨 인간이 사후 검증 가능
3. **신뢰는 점진적**: L1 → L2 → L3 단계별로, 각 단계에서 N주 무사고 운영 후 다음 단계
4. **사용자에게 투명하게**: 지도·라벨·후보가 바뀌면 사용자에게 알림 (혼란 방지)
5. **kill switch**: 모든 자동화에 단일 비활성화 토글 (긴급 시 정지)

---

## V1 운영 시간 추정 (관리자 입장)
- 일일: 알림 확인 1–3분
- 주간: 메트릭 리포트 5–10분
- 분기: UMAP 재학습 검수 30분~1시간
- **연 총 인력**: 약 30–50시간 → **혼자 사이드프로젝트로도 운영 가능**
