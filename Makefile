.PHONY: install install-dashboard dev up down migrate seed evaluate evaluate-final test test-python lint typecheck dbt-build build refresh clean acquire import publish backup restore verify-restore benchmark

install:
	python3 -m venv .venv
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install -e '.[dev,warehouse]'

install-locked:
	python3 -m venv .venv
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install -r requirements-lock.txt
	.venv/bin/pip install -e . --no-deps

install-dashboard:
	npm --prefix dashboard install

dev:
	uvicorn courtload.api.app:create_app --factory --reload

up:
	docker compose up --build -d db migrate api dashboard

down:
	docker compose down

migrate:
	alembic upgrade head

seed:
	courtload seed-demo --reset

acquire:
	courtload acquire-archive

import:
	courtload import-archive

publish:
	courtload publish-archive

backup:
	./scripts/backup.sh

restore:
	./scripts/restore.sh

verify-restore:
	courtload verify-restore

benchmark:
	python scripts/benchmark_api.py

evaluate:
	courtload evaluate --config evaluation/config/baseline-v1.yaml --dataset evaluation/manifests/accepted-archive-v1.json

evaluate-final:
	OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 courtload evaluate-final --baseline-run 3cf4ae8eb331ac02d3b3 --open-final-test

test: test-python
	npm --prefix dashboard run test
	PW_CHROMIUM_PATH=$$(command -v chromium) npm --prefix dashboard run test:browser

test-python:
	pytest --cov=courtload --cov-report=term-missing

lint:
	ruff check .
	ruff format --check .
	npm --prefix dashboard run lint

typecheck:
	mypy src/courtload
	npm --prefix dashboard run typecheck

dbt-build:
	docker compose --profile tools run --rm dbt build --profiles-dir .

build:
	npm --prefix dashboard run build
	docker compose build api dashboard

refresh:
	./scripts/refresh.sh

clean:
	rm -rf .pytest_cache .ruff_cache .mypy_cache htmlcov warehouse/target warehouse/logs dashboard/.next
