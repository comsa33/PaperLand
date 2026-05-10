# 빈 땅(Whitespace) 탐지 로직

## 핵심 명제
> "빈 땅"은 단순히 논문이 없는 영역이 아니라, **있을 법한데 없는 영역**이어야 한다.

빈 사막보다 "주변은 도시인데 가운데만 비어있는 곳"이 가치 있다.

## 빈 영역의 유형

### 1. **인접 공백 (Adjacent Gap)**
- 주변 셀은 활발한데 자기 셀만 비어있음
- 임베딩 공간에서 KNN 이웃은 밀집, 자기 영역만 sparse
- → **"가장 발견 가치 높은" 빈 땅**

### 2. **교차 공백 (Cross-domain Gap)**
- 두 활발한 분야의 교집합 영역이 비어있음
- 예: NLP × 의료영상, RL × 재료과학
- → **융합 연구 기회**

### 3. **쇠퇴 공백 (Faded Region)**
- 과거에는 활발했으나 최근 5년간 논문이 끊김
- → 재발견 기회 또는 dead-end (해석 주의 필요)

### 4. **신생 공백 (Emerging Sparse)**
- 최근에 첫 논문이 1~2개 등장한 영역
- 아직 비어있지만 곧 폭발할 수 있음
- → **얼리어답터 기회**

### 5. **본질 공백 (Inherent Gap)**
- 임베딩 공간상 의미적으로 비어있을 수밖에 없는 곳
- (가짜 빈 땅) → **필터링 필요**

### 6. **방법–도메인 불균형 (Method–Domain Imbalance)**
- 특정 방법론은 활발하지만 그 방법이 적용 안 된 도메인이 있음
- 예: self-corrective RAG는 일반 QA·의료에는 많지만 법률 도메인 적용 거의 없음
- → **방법론 이전성(transferability) 연구 후보**

### 7. **고립 고영향 논문 (Isolated High-Impact)**
- 인용 많은 논문은 있으나 후속 연구가 끊긴 영역
- → **재현·확장 실험 후보**

## 탐지 아키텍처: 유형별 Detector 분리

단일 score 공식이 아니라 **유형별 Detector**가 각각 후보를 생성하고, 마지막에 통합·중복 제거한다.

```
papers + cells
   │
   ├─→ AdjacentGapDetector       ─┐
   ├─→ CrossDomainGapDetector     │
   ├─→ FadedRegionDetector        ├─→ 후보 풀 → 본질공백 필터 → Top-K 랭킹
   ├─→ EmergingSparseDetector     │
   ├─→ MethodDomainImbalance      │
   └─→ IsolatedHighImpactDetector ─┘
```

### Step 1: 격자/셀 단위 통계 산출 (공통 입력)
각 셀(또는 hex bin)에 대해:
- `paper_count`, `recent_count` (최근 N년)
- `neighbor_density`: KNN 이웃 셀의 평균 밀도
- `growth_rate`: 시간축 변화율
- `dominant_category`, `top_keywords`
- `citation_stats`: 인접 영역 인용수 분포

### Step 2: 유형별 Detector

| Detector | 핵심 신호 | 점수 공식 (개념) |
|----------|----------|-----------------|
| **AdjacentGap** | 주변 밀집·자기 sparse | `neighbor_density × (1 − own_density/max)` |
| **CrossDomainGap** | 인접 셀의 카테고리 다양성 + 자기 저밀도 | `category_entropy(neighbors) × (1 − own_density)` |
| **FadedRegion** | 과거 논문 다수 + 최근 5년 급감 | `historical_density × (1 − recency_ratio)` |
| **EmergingSparse** | 최근 첫 논문 등장 + 인접 성장률 | `recent_first_paper_flag × neighbor_growth_rate` |
| **MethodDomainImbalance** | 방법 키워드 활발 + 도메인 키워드 매칭 부재 | `method_keyword_density × (1 − method×domain joint freq)` |
| **IsolatedHighImpact** | 고인용 논문 존재 + 후속 논문 적음 | `max_citation × (1 − follow_up_count/expected)` |
| **InherentGap (필터)** | 임베딩 도달성 검사 (제외용) | convex hull / k-NN reachability |

각 Detector는 자기 유형의 후보 리스트를 점수와 함께 반환. **MVP(V0)는 AdjacentGap 단일 Detector만 구현.**

### Step 3: 본질 공백(Inherent Gap) 필터링
- 임베딩 공간에서 해당 좌표가 의미적으로 도달 가능한지 확인
- 방법(택1):
  - convex hull 안쪽 + KNN 거리 임계값 (MVP, 가벼움)
  - 인근 논문 abstract 기반 합성 텍스트 임베딩 매핑 검증 (V1+, LLM 의존)

### Step 4: 통합·랭킹·라벨링
- 모든 detector 결과를 합쳐 중복 제거 (셀 단위)
- 유형별 가중치 적용 후 Top-K
- 각 후보에 "왜 후보인지" 자동 설명 생성
  - **MVP**: 템플릿 기반 (예: "ML+양자컴퓨팅 교차 영역, 최근 5년 논문 3편, 주변 분야는 연 200편 이상")
  - **V1+**: LLM 기반 자연어 설명 (옵션·동의 시)

## UI 표현

- **공백 후보 모드 토글**: 활성화 시 일반 셀은 회색, 공백 후보만 채도/테두리 강조
- **랭킹 패널**: "공백 후보 Top 10" (※ 내부 문서는 `빈 땅`, 사용자-facing 카피는 항상 `공백 후보` 사용)
- **상세 카드**: 후보 클릭 → 유형, 점수, 인접 분야, 추천 키워드, "이 영역으로 가는 길" (가장 가까운 기존 논문 3-5편)

## UX 원칙: 단정 대신 근거 (CRITICAL)

학술 도구로서의 신뢰성을 좌우하는 표현 원칙. **모든 빈 땅 관련 텍스트에 적용한다.**

❌ 나쁜 표현:
- "이 주제는 아무도 연구하지 않았습니다"
- "여기가 미개척지입니다"
- "이 분야는 비어있습니다"

✅ 좋은 표현:
- "현재 수집된 데이터 기준으로 직접 연결 논문이 적습니다"
- "인접 분야 대비 저밀도 영역입니다"
- "추가 문헌 검토가 필요한 공백 후보입니다"

원칙: **단정 → 후보 제시**, **절대 → 데이터 출처 명시**, **"미개척" → "저밀도/공백 후보"**

## 다음 행동(Next Action)까지 연결

빈 영역은 단순 표시로 끝나지 않는다. 클릭 시 사용자의 다음 행동을 적극 제안:

1. **관련 논문 읽기 목록**: 인접 클러스터의 대표 논문 5–10편
2. **추가 검색 쿼리**: 외부 검색엔진(Google Scholar 등)으로 보낼 쿼리 제안
3. **가능한 연구 질문 후보**:
   - **MVP**: 템플릿/규칙 기반 (예: "{인접_키워드_A}를 {도메인_B}에 적용한 연구가 가능할까?")
   - **V1+**: LLM 기반 자연어 생성 (옵션·사용자 동의 후)
4. **필요한 검증 방법**: "이 빈 땅이 진짜인지 확인하려면 X 키워드를 검색해보세요"
5. **주의해야 할 기존 연구**: 비슷한 영역에서 이미 진행된 핵심 연구

예시 문구:
> 이 영역은 "RAG evaluation", "legal QA", "self-correction" 클러스터 사이에 위치하지만 직접적으로 세 키워드를 모두 연결하는 논문 밀도는 낮습니다. 인접 논문들은 주로 일반 QA나 의료 도메인에 집중되어 있어, 법률 도메인에서의 self-corrective RAG 평가가 탐색 후보일 수 있습니다.

## 검증 방법
- **역사적 검증**: 5년 전 데이터로 빈 땅 탐지 → 현재 그 영역에 실제로 논문이 채워졌는지 확인
- **전문가 정성 평가**: 각 분야 박사들에게 "이 빈 땅 그럴듯한가?" 평가
- **사용자 피드백**: 후보 카드에 `유효한 후보 같음` / `관련 연구가 이미 있음` 버튼 (단정 카피 금지)

## 주의점
- 빈 땅을 너무 많이 표시하면 노이즈가 됨 → 점수 임계값 + Top-K 제한
- "빈 땅이 곧 좋은 연구 주제"는 아님 → 빈 데는 "이유"가 있을 수 있음을 UI에서 경고
- 임베딩 모델 편향 주의 (영어 논문 위주, 특정 분야 표현력 차이)
