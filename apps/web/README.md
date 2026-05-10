# paperland-web

PaperLand의 정적 웹 프론트엔드 (Next.js 15 + deck.gl).

## 시작

```bash
# 1) 픽스처 데이터 생성 (한 번만)
cd ../../packages/pipeline
uv pip install -e .
paperland fixtures --out ../../apps/web/public/data

# 2) 프론트 실행
cd ../../apps/web
npm install
npm run dev
```

→ `http://localhost:3000`

## 주요 컴포넌트
- `app/page.tsx` — 3분할 레이아웃 (좌: 공백 후보 패널 / 중: 지도 / 우: 상세 패널)
- `components/Map.tsx` — deck.gl `H3HexagonLayer` 기반 hex 히트맵 + `OrthographicView`
- `components/WhitespacePanel.tsx` — 공백 후보 Top 10 + 모드 토글
- `components/SidePanel.tsx` — 셀/후보 상세, 인접 키워드, Google Scholar 검색 링크
- `lib/data.ts` — 5종 JSON artifact 병렬 로드 (정적, 백엔드 없음)
- `lib/store.ts` — Zustand UI 상태 (선택 셀, 후보, 모드)

## 디자인 원칙 (UX)
- 공백 카피는 **단정 금지**: "미개척" → "공백 후보", "수집 데이터 기준" 표기
- 외부 검색 쿼리는 사용자가 직접 검증할 수 있도록 클릭 가능 링크 제공
