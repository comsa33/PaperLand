.PHONY: help install fixtures fetch real-build web dev test lint clean

# 다른 분야로 바꾸려면: make fetch CATEGORY=cs.LG  (cs.AI, cs.CV, stat.ML 등)
# 같은 변수로 real-build 의 parquet 경로 + 출력 디렉토리도 자동 매핑됩니다.
CATEGORY ?= cs.CL
SLUG = $(shell echo $(CATEGORY) | tr 'A-Z.' 'a-z-')
PARQUET = data/raw/arxiv-$(SLUG).parquet
# 모든 카테고리를 동일하게 슬러그 디렉토리로 출력 (cs.CL → cs-cl).
# data/catalog.json + 각 카테고리의 latest.json 포인터 + epoch별 immutable.
OUTDIR = apps/web/public/data/$(SLUG)

help:
	@echo "PaperLand 개발 명령"
	@echo "  make install      - Python + Node 의존성 설치"
	@echo "  make fixtures     - 합성 픽스처 생성 (apps/web/public/data)"
	@echo "  make fetch        - arXiv API에서 \$(CATEGORY) 실데이터 수집 (default: cs.CL)"
	@echo "                      ex) make fetch CATEGORY=cs.LG"
	@echo "  make real-build   - 실데이터 → V0 artifact (CATEGORY 변수 동일하게 사용)"
	@echo "  make web          - 프론트 dev 서버 (localhost:3000)"
	@echo "  make dev          - fixtures + web 한 번에"
	@echo "  make test         - 파이프라인 테스트"
	@echo "  make lint         - ruff + eslint"
	@echo "  make clean        - 빌드 산출물 제거"

install:
	cd packages/pipeline && uv venv && uv pip install -e ".[dev]"
	npm install

fixtures:
	cd packages/pipeline && uv run paperland fixtures --out ../../apps/web/public/data/cs-cl

fetch:
	cd packages/pipeline && uv run paperland fetch \
		--out ../../$(PARQUET) \
		--category $(CATEGORY) --per-year 400 --years 5

real-build:
	cd packages/pipeline && uv run paperland build \
		--papers ../../$(PARQUET) \
		--out ../../$(OUTDIR) \
		--primary $(CATEGORY)

web:
	cd apps/web && npm run dev

dev: fixtures web

test:
	cd packages/pipeline && uv run pytest

lint:
	cd packages/pipeline && uv run ruff check paperland tests
	cd apps/web && npm run lint

clean:
	rm -rf apps/web/.next apps/web/node_modules
	rm -rf packages/pipeline/.venv packages/pipeline/*.egg-info
	find . -type d -name __pycache__ -exec rm -rf {} +
