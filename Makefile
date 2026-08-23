.PHONY: install install-dashboard dev up down migrate seed test test-python lint typecheck dbt-build build refresh clean

install:
	python3 -m venv .venv
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install -e '.[dev,warehouse]'

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

test: test-python
	npm --prefix dashboard run test

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
