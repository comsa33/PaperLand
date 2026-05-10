.PHONY: help install fixtures web dev test lint clean

help:
	@echo "PaperLand 개발 명령"
	@echo "  make install   - Python + Node 의존성 설치"
	@echo "  make fixtures  - 합성 픽스처 생성 (apps/web/public/data)"
	@echo "  make web       - 프론트 dev 서버 (localhost:3000)"
	@echo "  make dev       - fixtures + web 한 번에"
	@echo "  make test      - 파이프라인 테스트"
	@echo "  make lint      - ruff + next lint"
	@echo "  make clean     - 빌드 산출물 제거"

install:
	cd packages/pipeline && uv venv && uv pip install -e ".[dev]"
	cd apps/web && npm install

fixtures:
	cd packages/pipeline && uv run paperland fixtures --out ../../apps/web/public/data

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
