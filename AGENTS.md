# Agent and Developer Instructions for CourtLens

CourtLens is an NBA analytics and player comparison system emphasizing backend/data engineering rigor, temporal discipline, reproducible offline machine learning evaluation, and clear presentation under uncertainty.

For the local research-workbench realignment, read [the implementation handoff](docs/workbench-implementation-plan.md) before changing data sources, analytics, forecasting, dashboard, or operations. Follow its ordered milestones and linked contracts; it supersedes earlier product-scope plans while preserving the guardrails below. Workbench milestones are pending, not completion evidence.

For the subsequent Databallr replica, UI/capability expansion, search/chatbot, finance, or Live work, read [the replica handoff](docs/databallr-replica-implementation-plan.md) and its block-specific contracts before implementing. It supersedes the workbench handoff's narrower product/layout scope; retain the workbench contracts for preserved behavior and sealed evidence. Execute the replica blocks by dependency and record measured completion in [the replica progress log](docs/databallr-replica-implementation-progress.md). Plans and prior completion prose are not runtime verification.

For polish/freeze UI, query-correctness or hybrid-assistant work, read the [confirmed freeze handoff](docs/polish-freeze-implementation-plan.md) and its block contracts first. Execute one bounded block by dependency and record measured evidence in the [freeze progress log](docs/polish-freeze-implementation-progress.md). Its explicitly revised UI/assistant behavior supersedes older scope; preserve analytical contracts and unresolved replica source gates.

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
   - CourtLens never invents a "winner probability" or automated start/sit decision from overlapping prediction intervals.
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
