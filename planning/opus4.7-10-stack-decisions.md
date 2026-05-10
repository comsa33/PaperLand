# 기술 스택 결정 (Decisions of Record)

> **본 문서는 PaperLand의 확정 스택을 못박는다.** 04-tech-stack은 탐색·옵션 비교용 문서이고, 이 문서가 우선한다.
> 변경은 결정 로그에 사유와 함께 남긴다.

## 결정 원칙
1. **V0는 가장 작게**: 백엔드 0, 정적 자산만, 도구 최소화
2. **확장성은 마이그레이션 비용으로 검증**: V0에서 V1/V2로 갈 때 큰 재작업 없는 도구 우선
3. **혼자 운영 가능**: 관리형/오픈소스 + 무료/저비용 티어 우선
4. **lock-in 회피**: 데이터는 표준 포맷(Parquet/JSON), 컴퓨트만 교체 가능

---

## 확정 스택 (V0)

### 프론트엔드
| 레이어 | 결정 | 버전 | 사유 |
|--------|------|------|------|
| 프레임워크 | **Next.js (App Router)** | 15.x | SSR/SSG 자유, Vercel 친화, TS 일급 |
| 언어 | **TypeScript** | 5.x | 타입 안전, 협업 친화 |
| 시각화 (메인) | **deck.gl** | 9.x | WebGL hex/scatter, 수만~수십만 점 60fps |
| 시각화 (보조) | **D3.js** | 7.x | 범례·미니차트·축 |
| UI | **Tailwind CSS** + **shadcn/ui** | latest | 빠른 UI, 디자인 일관성 |
| 상태 | **Zustand** | 5.x | 가벼움, Provider 지옥 회피 |
| 데이터 fetch | **TanStack Query** | 5.x | 정적 JSON에도 캐시·refetch 유용 |
| 폰트 아이콘 | lucide-react | latest | shadcn 기본 |

### 데이터 저장 (V0는 정적)
| 용도 | 결정 | 사유 |
|------|------|------|
| 프론트 서빙 데이터 | **JSON** (`cells.json`, `whitespace_top10.json`, `papers_index.json`, `cluster_labels.json`, `manifest.json`) | 백엔드 없이 fetch, gzip로 충분 |
| 파이프라인 중간 산출물 | **Parquet** | 컬럼 효율, polars/duckdb 호환 |
| 임베딩 매트릭스 | **numpy memmap (.npy)** | 빠른 mmap 로드 |

### 데이터 처리 / ML 파이프라인
| 레이어 | 결정 | 버전 | 사유 |
|--------|------|------|------|
| 언어 | **Python** | 3.11 | 데이터·ML 표준 |
| 의존성 관리 | **uv** | latest | 빠르고 단순 |
| 데이터프레임 | **Polars** (+ pyarrow) | latest | 메모리 효율 |
| 쿼리 | **DuckDB** | latest | Parquet 직쿼리 |
| 임베딩 모델 | **SPECTER2** (`allenai/specter2_base`) | — | 논문 특화, 무료 |
| 임베딩 런타임 | **sentence-transformers** | latest | 추론 단순, 캐시 hook 용이 |
| 차원축소 | **umap-learn** | latest | transform() 증분 가능 |
| 클러스터링 | **HDBSCAN** + sklearn 기반 c-TF-IDF (직접 구현) | latest | approximate_predict 지원, 의존성 최소 (BERTopic은 V1+ 옵션) |
| 격자화 | **h3-py** | latest | hex 표준, 프론트 deck.gl과 직접 호환 |

### 빌드·배포 (V0)
| 영역 | 결정 |
|------|------|
| 프론트 호스팅 | **Vercel** (Hobby 무료) |
| 정적 데이터 호스팅 | **Vercel public 경로** 또는 **Cloudflare R2** (용량 커지면) |
| 파이프라인 실행 | **로컬** (수동 `make refresh`) |
| 코드 저장 | **GitHub** (private) |

### V0에서 의도적으로 제외
- ❌ 백엔드 서버 (FastAPI/Express) — 정적으로 충분
- ❌ 데이터베이스 (Postgres/Mongo) — 정적 JSON
- ❌ 인증 (NextAuth/Clerk)
- ❌ 분석 (PostHog/GA)
- ❌ 검색 엔진 (Meilisearch/Typesense)
- ❌ 벡터 DB (Qdrant/Pinecone/FAISS server)
- ❌ Redis / 작업 큐
- ❌ Docker (V0는 로컬 실행만)

---

## 확장 스택 (V1 → V3)

### V1: 수동 refresh 자동화
**추가**:
- **Make** + **bash** 스크립트 (`make refresh-cs-cl`)
- **GitHub Actions** (수동 트리거 또는 cron)
- **validation script**: pydantic / pandera 스키마 + 카운트 게이트
- **알림**: Telegram Bot API 1개 (실패만)

**유지**: V0 스택 그대로

### V1.5: 일 단위 증분 갱신
**추가**:
- **OAI-PMH client**: `sickle` 또는 직접 구현 (verb=ListRecords, set=cs.CL)
- **상태 파일**: `state/last_successful_harvest.json`
- **임베딩 캐시**: SHA-256 keyed, 로컬 디스크 또는 Cloudflare R2
- **delta artifact**: 별도 경로 + manifest의 `latest_delta_date` 갱신

### V2: Shadow Rebuild + Admin
**추가 시점**: cron이 한계 (의존성 그래프 복잡, 재시도 필요) 또는 운영자 승인 워크플로 필요할 때

| 도구 | 용도 |
|------|------|
| **Prefect 2** | 오케스트레이션 (의존성, 재시도, UI) |
| **Prometheus** + **Grafana** | 메트릭 시각화 |
| **Next.js admin route** | candidate label 승인, 메트릭 5분 훑기 |
| **Procrustes 정렬** | scipy.linalg + 커스텀 (shadow→production drift gate) |

### V3: 거의 무인 운영
**추가**:
- **PyOD** (시계열 anomaly detection)
- **GitHub Issue API** (자동 이슈 생성)
- **시계열 budget alert** (R2 비용, 임베딩 GPU 시간)

---

## 인프라 비용 시나리오 (월 단위, 추정)

| 단계 | 항목 | 비용 |
|------|------|------|
| V0 | Vercel Hobby + GitHub Free | $0 |
| V0 | 로컬 GPU 또는 단발성 Lambda Labs ($0.50/h × 수 시간) | $5 이하 (1회성) |
| V1.5 | Cloudflare R2 (수십 GB) | $1–3 |
| V1.5 | GitHub Actions (free 한도 내) | $0 |
| V2 | Prometheus + Grafana 셀프호스팅 (Fly.io) | $5–10 |
| V2 | Vercel Pro (필요 시) | $20 |
| V3 | 동일 + 모니터링 확장 | $30–50 |

→ **V0~V1.5는 월 $5 이하**, V2부터 운영 비용 본격화. 사이드프로젝트로 충분히 감당.

---

## 마이그레이션 트리거 (단계 승격 조건)

| 현재 → 다음 | 승격 조건 |
|-------------|----------|
| V0 → V1 | 본인 dogfooding로 가설 검증 + 후보 1건 발굴 성공 |
| V1 → V1.5 | 수동 refresh가 주 1회 이상 필요해질 때 |
| V1.5 → V2 | cron 의존성 그래프가 100줄 넘거나 candidate label 승인 큐 발생 |
| V2 → V3 | 주 5시간 이상 운영 시간 발생 시 |

---

## 결정 로그
- **2026-05-10**:
  - 임베딩 모델 = **SPECTER2** 선택 (대안: bge-large, OpenAI)
    - 이유: 논문 특화 학습, 무료, 로컬 실행 가능, 인용 데이터 없이도 작동
  - 격자 = **h3-py hex grid** (대안: square grid, 보로노이)
    - 이유: deck.gl `H3HexagonLayer` 직접 호환, 표준화된 셀 ID
  - 차원축소 = **UMAP** (대안: t-SNE, PCA)
    - 이유: `transform()`으로 증분 매핑 가능 (t-SNE는 어려움), 전역+지역 균형
  - 호스팅 = **Vercel** (대안: Cloudflare Pages, Netlify)
    - 이유: Next.js 1급 지원, Hobby 무료, 정적 자산 CDN
  - V0 백엔드 = **없음** (대안: FastAPI 1개 엔드포인트)
    - 이유: 시나리오 2(abstract 입력)는 R8 정보 유출 리스크로 V1+ 보류, V0는 동적 필요 없음

---

## 미결정 (V1+ 결정 사항)
- [ ] 알림 채널: Telegram vs Slack vs Email (Telegram 우세)
- [ ] 오브젝트 스토리지: Cloudflare R2 vs AWS S3 vs Vercel Blob (R2 비용 우세)
- [ ] 오케스트레이션: Prefect vs Dagster vs Airflow (V2 진입 시 PoC 후 결정)
- [ ] LLM 통합 시 모델: Claude vs GPT vs 로컬 Llama (V1+, 비용·정확도 함께 평가)

---

## 한 줄 요약
**Next.js + deck.gl + 정적 JSON, Python + SPECTER2 + UMAP + HDBSCAN + h3, Vercel 호스팅. 백엔드·DB·인증·검색엔진은 모두 V0에 포함하지 않는다.**
