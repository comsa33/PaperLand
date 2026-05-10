# V0.5 — 계보 모드 (Lineage Mode) 미니 스펙

> 별도 모드로 추가되는 두 번째 핵심 뷰. **지도 모드와 보완**.
> 현재 V0의 우측 패널 텍스트형 흐름은 이 모드의 텍스트 요약 역할로 격하.

## 분리 이유
- 지도 = "어디가 붐비고 어디가 비었나" (공간)
- 계보 = "왜 이 빈틈이 생겼나, 어떤 흐름들이 그 옆을 지나갔나" (시간 + 인접도)

## V0.5 범위 (Out of Scope 명확)
**포함**:
- 지도 모드 / 계보 모드 **탭 전환** (헤더 또는 좌측 패널 옆)
- 계보 모드는 **선택한 공백 후보 1개** 기준 (전체 그래프 X)
- 연도별 컬럼 (예: 2022 · 2023 · 2024 · 2025 · 2026)
- 인접 대표 논문 노드 10–20개 (year × 클러스터 좌표 그리드 위에 배치)
- 가운데 **공백 후보 노드** — 주황색 dashed 원, "비어 있는 결합 후보"
- edge = **semantic adjacency** (citation 아님) 명시

**제외 (V1+)**:
- citation 기반 진짜 family tree → OpenAlex / Semantic Scholar 통합 후
- 다중 공백 후보 동시 비교
- 지도 ↔ 계보 동기화 줌

## 데이터 요구사항 (선행 조건)
- 최근 5년 연도별 균등 샘플링 (현재 fetch는 최신 단기 스냅샷)
- 후보당 nearest_papers (현재 5편) → **연도 풍부한 nearest_papers (15-20편)** 필요
  - 각 연도 buckets: pre / mid / recent
- 후보당 인접 클러스터 정보 (연결될 수 있는 두 흐름 식별)

## 시각적 구조
```
[지도 모드] [계보 모드 ◀ 활성]

       2022       2023       2024       2025       2026
┌─────────────────────────────────────────────────────────┐
│ [흐름 A]                                                │
│  ●─────●─────●─────●─────●                              │
│              ╲                                           │
│               ╲                                          │
│         🟧 비어 있는 결합 후보                          │
│         "{candidate.summary}"                           │
│               ╱                                          │
│              ╱                                           │
│  ●─────●─────●─────●                                     │
│ [흐름 B]                                                │
└─────────────────────────────────────────────────────────┘

edge = semantic adjacency (임베딩 유사도)
node 색 = 클러스터별
```

## 인터랙션
- 노드 hover: 논문 제목 + 연도 + 클러스터
- 노드 클릭: 우측 작은 패널에 해당 논문 메타 (또는 Scholar 링크)
- 가운데 후보 클릭: rationale + suggested_queries (우측 패널)
- 좌측 공백 후보 Top 10에서 다른 후보 선택 시 → 계보 모드도 새로 그림

## 구현 옵션 (FE)
- **Option A: SVG 직접 그리기** (D3 기반)
  - 장점: edge 자유롭게, 아이덴티티 다듬기 좋음
  - 단점: 노드 30개 이상 시 성능
  - V0.5 권장
- **Option B: react-flow**
  - 장점: 노드/엣지 추상화
  - 단점: 의존성 추가, 디자인 일관성 작업
- **Option C: deck.gl IconLayer + LineLayer**
  - 장점: 지도와 같은 엔진
  - 단점: 정확한 그리드 위치 제어 까다로움

→ **A 채택 (D3 + SVG)**, 노드 ≤ 25개 제한.

## 데이터 모델 (확장)
```ts
interface LineageGraph {
  candidate: WhitespaceCandidate;
  flows: Flow[];          // 2~3개 인접 흐름
  bridge: BridgeNode;     // 가운데 공백 후보
  year_axis: number[];    // [2022, 2023, ..., 2026]
}
interface Flow {
  cluster_id: string;
  cluster_label: string;
  color: string;
  nodes: PaperNode[];     // year별 1~3편
}
interface PaperNode {
  id: string;
  title: string;
  year: number;
  cluster_id: string;
}
interface BridgeNode {
  summary: string;
  rationale: string;
}
```

## 백엔드 변경
- AdjacentGapDetector 출력에 `lineage_v2` 필드 추가
  - flows: 인접 셀이 속한 클러스터별로 nearest 논문을 year-bucket에 분배
  - 최소 2개 인접 클러스터 묶기 (bridge가 비교 의미 있음)
  - 각 클러스터에서 연도별 1–2편씩 → 최대 ~12편

## 카피 (UX 원칙 준수)
- 모드 라벨: `지도 모드` / `계보 모드`
- 가운데 노드: `비어 있는 결합 후보` (단정 X)
- edge 라벨/툴팁: `semantic adjacency · citation 아님`
- 빈 상태: `좌측에서 공백 후보를 선택하면 흐름이 표시됩니다`

## 일정 (혼자 작업 기준)
| 단계 | 기간 |
|------|------|
| 데이터: 연도별 균등 샘플링 + 후보 lineage_v2 산출 | 0.5주 |
| FE: 탭 시스템 + LineageView 골격 | 0.5주 |
| FE: D3 SVG 그래프 + 노드 인터랙션 | 1주 |
| 카피·면책·테스트·dogfood 1회 | 0.5주 |
| **합계** | **약 2.5주** |

## V0.5 종료 조건
- 공백 후보 클릭 → 계보 모드에서 2개 이상 흐름 + 가운데 공백 노드 + 연도 컬럼이 보임
- 노드 hover/click 인터랙션 동작
- citation이 아니라는 면책 텍스트가 모드 안에 명시
- dogfooding: 후보 1개를 보고 "이 흐름들 사이가 정말 비어있구나" 체감

## V1+ 확장 (참조)
- OpenAlex 통합 → citation 진짜 family tree
- 같은 후보의 시간축 슬라이더 (선택 연도 이전만 표시 → "이때까지의 풍경")
- 흐름 색상에 cluster label 직접 표기
