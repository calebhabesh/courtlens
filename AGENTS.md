# Agent and Developer Instructions for CourtLoad

CourtLoad is an NBA analytics and player comparison system emphasizing backend/data engineering rigor, temporal discipline, reproducible offline machine learning evaluation, and clear presentation under uncertainty.

## Architecture and Stack

- **Backend:** Python 3.12+ / FastAPI with typed Pydantic models and SQLAlchemy 2.0.
- **Database:** PostgreSQL 17 with strict foreign keys, immutable dataset memberships, and session advisory locks for publication.
- **Warehouse:** dbt-postgres with layered staging (`stg_`), intermediate (`fct_`), and serving marts (`mart_`).
- **Offline ML / Evaluation:** scikit-learn 1.6.1, rolling baselines (last-10, EWMA-20), out-of-time chronological validation and calibration, immutable hashed artifacts.
- **Frontend:** Next.js 15 (App Router), TypeScript, responsive vanilla CSS.
- **Packaging:** Docker Compose v2 for local reproducible deployment.

## Key Principles & Guardrails

1. **Temporal Discipline:**
   - Feature computations strictly exclude the target date and all subsequent outcomes (`game_date < replay_date`).
   - Changing future game records must never alter prior feature or profile hashes.
   - Schedule and opponent context are historical reconstructions; they are labeled as such in the API and UI.

2. **Zero Inferred Claims:**
   - An absent box-score row is unknown, not a zero outcome or injury confirmation.
   - CourtLoad never invents a "winner probability" or automated start/sit decision from overlapping prediction intervals.
   - Prediction intervals represent empirical calibrated dispersion, not subjective confidence scores.

3. **Data Immutability & Safe Migrations:**
   - Raw acquisitions, normalized versions, datasets, and serving snapshots are append-only and identified by cryptographic content hashes (SHA-256) and UUIDs.
   - Publication uses an atomic pointer swap on the `published_snapshots` channel (`public`).
   - Rollback is non-destructive and moves the pointer back to a retained ready snapshot.

4. **Testing and Verification:**
   - Routine test suite runs locally with pytest (`make test-python` or `.venv/bin/pytest`).
   - Strict mypy (`.venv/bin/mypy src/courtload`) and Ruff (`.venv/bin/ruff check . && .venv/bin/ruff format --check .`) must pass with zero warnings.
   - Dashboard tests include Vitest component/unit tests (`npm --prefix dashboard test`) and Playwright browser tests (`npm --prefix dashboard run test:browser`).

## Common Commands

```bash
# Environment setup
make install
make install-dashboard
cp .env.example .env

# Data acquisition & publication
courtload acquire-archive
courtload import-archive
courtload publish-archive

# Offline evaluation
make evaluate
make evaluate-final

# Backup and restore
./scripts/backup.sh
./scripts/restore.sh <path-to-backup.tar.gz>

# Verification
courtload verify-restore
make lint
make typecheck
make test
```
