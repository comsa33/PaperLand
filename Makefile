.PHONY: help install fixtures fetch real-build web dev test lint clean

help:
	@echo "PaperLand 개발 명령"
	@echo "  make install      - Python + Node 의존성 설치"
	@echo "  make fixtures     - 합성 픽스처 생성 (apps/web/public/data)"
	@echo "  make fetch        - arXiv API에서 cs.CL 실데이터 2k편 수집"
	@echo "  make real-build   - 실데이터 → V0 artifact (임베딩+UMAP, GPU 권장)"
	@echo "  make web          - 프론트 dev 서버 (localhost:3000)"
	@echo "  make dev          - fixtures + web 한 번에"
	@echo "  make test         - 파이프라인 테스트"
	@echo "  make lint         - ruff + eslint"
	@echo "  make clean        - 빌드 산출물 제거"

install:
	cd packages/pipeline && uv venv && uv pip install -e ".[dev]"
	npm install

fixtures:
	cd packages/pipeline && uv run paperland fixtures --out ../../apps/web/public/data

fetch:
	cd packages/pipeline && uv run paperland fetch \
		--out ../../data/raw/arxiv-cs-cl.parquet \
		--category cs.CL --n 2000 --days 730

real-build:
	cd packages/pipeline && uv run paperland build \
		--papers ../../data/raw/arxiv-cs-cl.parquet \
		--out ../../apps/web/public/data

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
