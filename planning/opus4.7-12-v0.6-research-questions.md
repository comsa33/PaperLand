# V0.6 — 후속 라운드 스코프 (연구자 UX 강화)

> 이번 라운드(V0.5+)에서 일부만 처리. 나머지는 V0.6으로 분리해 명확화.

## 이번 라운드(V0.5+)에서 처리한 것
- ✅ 후보 제목 키워드 조합 → 연구 질문 문장 (템플릿 기반, method/domain/task/model 분류)
- ✅ "Top 10" → "검출된 후보 N개" (실제 후보 수 반영)
- ✅ Research flow 카드 제목 가독성 + bridge 박스 확대 + "왜 빈틈인가" 해석 블록
- ✅ SidePanel "그래서 뭘 하면 되나" 5분 검증 플로우로 강화

## V0.6 분리 — 다음 라운드
대규모 변경이라 별도 라운드로 분리:

### V0.6-A. 양방향 한/영 데이터 모델
**문제**: 현재 `summary`, `rationale`이 한국어 단일 → EN 토글이 헤더만 바뀜.
**스펙**:
- `WhitespaceCandidate` schema 확장:
  ```json
  { "summary_ko": "...", "summary_en": "...", "rationale_ko": "...", "rationale_en": "..." }
  ```
- pipeline `_build_summary` / `_build_rationale`을 locale 파라미터로 분기
- 영어 템플릿 작성 (key sentence patterns 영어 버전)
- LineageView Interpretation, BridgeNode, SidePanel CandidateBlock도 locale-aware
- WhitespacePanel 카드 부제 / Onboarding / Map legend 한/영 매핑
**일정**: 0.5–1주

### V0.6-B. Topic / Abstract 입력 탐색 플로우
**문제**: 연구자는 "cs.CL 전체 지도"보다 "내 주제 주변 지도"를 원함.
**스펙**:
- 새 화면: `Explore by Topic` 입력 폼
  - 모드 1: 키워드 (예: "RAG evaluation")
  - 모드 2: 자기 abstract 붙여넣기 (R8 정보 유출 리스크 — 클라이언트 임베딩 또는 명시 동의)
- 입력 → 임베딩 → 지도 위에 핀 + 주변 N편 하이라이트
- 그 핀 주변에서 AdjacentGap 재실행 → 개인화된 후보 생산
- 가장 가까운 기존 클러스터에 자동 매핑 → 흐름 모드도 그 핀 기준으로 표시
**선행 조건**:
- 클라이언트 임베딩 또는 백엔드 임베딩 엔드포인트 (현재 정적 only)
- abstract 입력 시 R8 (정보 유출 리스크) 원칙 강화 — 클라이언트 only or 명시적 동의 모달
**일정**: 1–1.5주

### V0.6-C. citation 기반 진짜 영향 관계 (V1+ 후보)
**문제**: 현재 흐름은 임베딩 인접도. 연구자가 진짜 신뢰하려면 citation.
**스펙**:
- OpenAlex 또는 Semantic Scholar API 통합 (V0 제외 분야였음)
- 후보당 인접 논문의 citation graph 일부 추출 → 진짜 family tree
**일정**: 2–3주 (별도 백엔드 inflow 필요)
→ V1 우선순위 Phase 4로 이동 권장.

## 우선순위 결정
- **V0.6-A** (한/영 데이터 모델): 사용자 신뢰성·국제 사용성 핵심. 다음 라운드 1순위.
- **V0.6-B** (topic input): 연구자 채택률 핵심. 1–2주 후 진행.
- **V0.6-C** (citation): 인프라 부담 큼. V1 진입 시 검토.

## V0.6 종료 조건
- A 완료: EN 토글로 모든 사용자-facing 텍스트가 자연스러운 영어로 전환
- B 완료: 사용자가 자기 키워드/abstract를 입력해 개인화된 후보를 받는 dogfooding 1회 성공
