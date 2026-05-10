# PaperLand 기획 문서 인덱스

논문 분야 지형도 + 빈 땅 탐지 웹앱 기획.

## 목차
1. [개요](./opus4.7-00-overview.md) — 정체성, 문제 정의, 핵심 메타포
2. [시각화 설계](./opus4.7-01-visualization.md) — 메타포, 인코딩, 인터랙션
3. [빈 땅 탐지](./opus4.7-02-whitespace-detection.md) — 알고리즘 + UX 원칙 + 다음 행동 연결
4. [데이터 파이프라인](./opus4.7-03-data-pipeline.md) — 수집·임베딩·격자화
5. [기술 스택](./opus4.7-04-tech-stack.md) — 프론트·백엔드·인프라
6. [로드맵](./opus4.7-05-roadmap.md) — Phase 0 → V2
7. [리스크 & 미해결 질문](./opus4.7-06-risks-and-questions.md) — 결정 필요 항목
8. [사용자 시나리오](./opus4.7-07-scenarios.md) — Dogfooding 검증 시나리오 3개
9. [**V0 스코프 (확정)**](./opus4.7-08-v0-scope.md) — 가장 작은 검증 단위 못박기
10. [자율 유지보수](./opus4.7-09-autonomous-maintenance.md) — 신규 논문 자동 갱신, 좌표 안정성, 자가 점검·자가 적응 시스템
11. [**기술 스택 결정**](./opus4.7-10-stack-decisions.md) — 확정 스택 (Decisions of Record), V0→V3 점진 도입, 결정 로그

## 디렉토리 구조
- `opus4.7-*.md`: 최종 기획 문서 (이 디렉토리에 둠)
- `_archive/`: 머지 입력으로 사용된 GPT-5.5 별도 기획서 (참조용 보존)

## GPT-5.5 기획서 머지 내역
GPT-5.5의 두 별도 기획서(`gpt-5.5-product-ideation.md`, `gpt-5.5-continuous-update-automation.md`)의 강점을 본 기획에 통합:

**제품 기획 (gpt-5.5-product-ideation.md)**:
- **00 개요**: 정체성 한 줄("검색기가 아닌 지형도+공백 탐지기"), 핵심 메타포 표
- **02 빈 땅**: "단정 대신 근거" UX 원칙 (CRITICAL), 다음 행동 연결, 방법-도메인 불균형/고립 고영향 유형 추가
- **07 시나리오** (신규): 3개 시나리오 + 기능 우선순위 매트릭스
- **08 V0 스코프** (신규): 단일 진실 공급원

**자동화 기획 (gpt-5.5-continuous-update-automation.md)**:
- **09 자율 유지보수**: Stable Map + Delta Layer 구조, OAI-PMH 기반 incremental harvest, Manifest 기반 안전 배포 + Last Good Snapshot, Shadow Rebuild + Procrustes 정렬, Embedding cache by content hash, Quarantine 패턴, "운영 vs 학술 판단" 분리 원칙

## 검토 시 우선 확인 포인트
- **V0 스코프** (08-v0-scope) — 가장 작은 검증 단위 확정
- **메타포 방향성** (01-visualization §메타포 선택) — 임베딩+격자 하이브리드 OK?
- **빈 땅의 정의** (02-whitespace §유형) — 7가지 중 V0는 Adjacent Gap 단일

## 한 줄 결론
> 임베딩 기반 2D 지형도에 격자 오버레이를 얹고, "있을 법한데 없는" 빈 영역을 적극적으로 강조하는 것이 차별화의 핵심.
