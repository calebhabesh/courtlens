.PHONY: install install-dashboard dev up down migrate seed evaluate evaluate-final eval-assistant test test-python test-published lint typecheck dbt-build build refresh clean acquire import publish backup restore verify-restore benchmark clean-scratch install-scratch-cleanup test-kernel-limits preview

# Scratch goes to disk, not RAM-backed /tmp (tmpfs); see scripts/clean_scratch.sh.
export TMPDIR ?= $(HOME)/.cache/courtlens-tmp
$(shell mkdir -p $(TMPDIR))

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
	uvicorn courtlens.api.app:create_app --factory --reload

# Production-mode build on ports 3300 (dashboard) and 8001 (API) beside the dev servers.
preview:
	scripts/preview.sh

up:
	docker compose up --build -d db migrate api dashboard

down:
	docker compose down

migrate:
	alembic upgrade head

seed:
	courtlens seed-demo --reset

acquire:
	courtlens acquire-archive

import:
	courtlens import-archive

publish:
	courtlens publish-archive

backup:
	./scripts/backup.sh

restore:
	./scripts/restore.sh

verify-restore:
	courtlens verify-restore

benchmark:
	python scripts/benchmark_api.py

evaluate:
	courtlens evaluate --config evaluation/config/baseline-v1.yaml --dataset evaluation/manifests/accepted-archive-v1.json

evaluate-final:
	OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 courtlens evaluate-final --baseline-run 3cf4ae8eb331ac02d3b3 --open-final-test

ASSISTANT_EVAL_ARGS ?=
PROVIDER ?=
MODEL ?=
eval-assistant:
	.venv/bin/python scripts/evaluate_agent.py $(if $(PROVIDER),--provider $(PROVIDER)) $(if $(MODEL),--model $(MODEL)) $(ASSISTANT_EVAL_ARGS)

test: test-python
	npm --prefix dashboard run test
	PW_CHROMIUM_PATH=$$(command -v chromium) npm --prefix dashboard run test:browser

PYTHON ?= .venv/bin/python
PYTEST_ARGS ?=
test-python:
	$(PYTHON) scripts/test_python.py --cov=courtlens --cov-report=term-missing $(PYTEST_ARGS)

# Deliberately OOM-kills tiny capped systemd units; KDE/GNOME show "low memory" notices.
test-kernel-limits:
	.venv/bin/pytest -m kernel_limits tests/integration/test_research_limits.py

test-published:
	$(PYTHON) scripts/test_python.py --published $(PYTEST_ARGS)

lint:
	ruff check .
	ruff format --check .
	npm --prefix dashboard run lint

typecheck:
	mypy src/courtlens
	npm --prefix dashboard run typecheck

dbt-build:
	docker compose --profile tools run --rm dbt build --profiles-dir .

build:
	npm --prefix dashboard run build
	docker compose build api dashboard

refresh:
	./scripts/refresh.sh

clean-scratch:
	scripts/clean_scratch.sh

install-scratch-cleanup:
	scripts/install_scratch_cleanup.sh

clean:
	rm -rf .pytest_cache .ruff_cache .mypy_cache htmlcov warehouse/target warehouse/logs dashboard/.next
