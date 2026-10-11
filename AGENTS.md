# Agent and Developer Instructions for CourtLens

CourtLens is an NBA analytics and player comparison system emphasizing backend/data engineering rigor, temporal discipline, reproducible offline machine learning evaluation, and clear presentation under uncertainty.

For the local research-workbench realignment, read [the implementation handoff](docs/workbench-implementation-plan.md) before changing data sources, analytics, forecasting, dashboard, or operations. Follow its ordered milestones and linked contracts; it supersedes earlier product-scope plans while preserving the guardrails below. Workbench milestones are pending, not completion evidence.

For the subsequent Databallr replica, UI/capability expansion, search/chatbot, finance, or Live work, read [the replica handoff](docs/databallr-replica-implementation-plan.md) and its block-specific contracts before implementing. It supersedes the workbench handoff's narrower product/layout scope; retain the workbench contracts for preserved behavior and sealed evidence. Execute the replica blocks by dependency and record measured completion in [the replica progress log](docs/databallr-replica-implementation-progress.md). Plans and prior completion prose are not runtime verification.

For polish/freeze UI, query-correctness or hybrid-assistant work, read the [confirmed freeze handoff](docs/polish-freeze-implementation-plan.md) and its block contracts first. Execute one bounded block by dependency and record measured evidence in the [freeze progress log](docs/polish-freeze-implementation-progress.md). Its explicitly revised UI/assistant behavior supersedes older scope; preserve analytical contracts and unresolved replica source gates.

For Ask/assistant work (chat UI, planner reliability, general-knowledge answers, narrative, streaming, assistant panel or assistant eval), read the [assistant revamp handoff](docs/assistant-revamp-plan.md) first. It supersedes the freeze handoff for the Ask experience only and keeps its analytical contracts. Record evidence in the [revamp progress log](docs/assistant-revamp-progress.md).

For the Ask agent rework (tool-calling agent loop, multi-provider keys, web search, answer-first prose, Databallr metrics, v3 eval), read the [assistant agent handoff](docs/assistant-agent-plan.md) first. It supersedes the revamp handoff for how Ask plans, routes and answers, and keeps the revamp's layout, side panel, threads, saved findings and streaming transport. Record evidence in the [agent progress log](docs/assistant-agent-progress.md). Databallr is an approved design reference and may be replicated visually; data must come from CourtLens' own pipelines, never from Databallr.

For RAPM, on/off, six-factor, defensive and other impact metrics computed from public play-by-play (stints, possessions, ratings, Stats preset ungating), read the [impact metrics handoff](docs/impact-metrics-plan.md) first and record evidence in the [impact metrics progress log](docs/impact-metrics-progress.md).

For the CourtLoad → CourtLens rename (package, CLI, env vars, database) or any dashboard styling, layout, header or animation work, read the [refresh handoff](docs/courtlens-refresh-plan.md) and the [design language contract](docs/design/design-language-v1.md) first. Record evidence in the [refresh progress log](docs/courtlens-refresh-progress.md). Never rename frozen `courtload-…-vN` hash identifiers.

For any page layout, page structure, filter bar, header/search/drawer, copy density, imagery or icon work, read the [frontend overhaul handoff](docs/frontend-overhaul-plan.md) first. It supersedes the refresh and freeze handoffs for page layout and structure, and keeps all analytical, identity and data contracts. Execute its blocks in order, stop at its owner review gates, and record evidence (including the glance test) in the [overhaul progress log](docs/frontend-overhaul-progress.md).

For chart/graphic presentation, color semantics, first-load default states, new free data sources (contracts, rosters, injuries, tracking, play types), Roster Shapes, Contracts/Free Agency, gated-page removal, or hosting the demo, read the [presentation clarity handoff](docs/presentation-clarity-plan.md) first. It supersedes the overhaul for data presentation, D21 and page existence, and supersedes earlier source gates through its [source policy v2](docs/design/nba-direct-admission-v2.md); it keeps every analytical contract. CourtLens is a non-commercial portfolio demo: zero recurring costs, and pages without free data are removed, not gated. Record evidence in the [presentation clarity progress log](docs/presentation-clarity-progress.md).

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
   - Strict mypy (`.venv/bin/mypy src/courtlens`) and Ruff (`.venv/bin/ruff check . && .venv/bin/ruff format --check .`) must pass with zero warnings.
   - Dashboard tests include Vitest component/unit tests (`npm --prefix dashboard test`) and Playwright browser tests (`npm --prefix dashboard run test:browser`).

5. **Design System & Presentation Rigor:**
   - All dashboard presentation must adhere strictly to [Design Language v1](docs/design/design-language-v1.md).
   - Zero raw inline styles (`style={{ ... }}`) are permitted across dashboard code; dynamic geometry and visualization variables must pass type-safe CSS custom properties (`--*`).
   - Strict 4px spatial rhythm (`--space-*`), fixed type scale (`--text-*`), and tonal elevation surfaces (`--color-surface-*`, `--shadow-*`) without bright container borders (hairlines only at 6–10% white).
   - ESLint (`no-restricted-syntax`, `no-restricted-imports`) and Stylelint rules enforce Design Language v1 contracts at `error` level and must pass with 0 errors and 0 warnings (`npm --prefix dashboard run lint`).
   - Motion and physics springs (`lib/motion.ts`) must respect reduced motion (`prefers-reduced-motion` token duration collapse to 1ms).

## Common Commands

```bash
# Environment setup
make install
make install-dashboard
cp .env.example .env

# Data acquisition & publication
courtlens acquire-archive
courtlens import-archive
courtlens publish-archive

# Offline evaluation
make evaluate
make evaluate-final

# Backup and restore
./scripts/backup.sh
./scripts/restore.sh <path-to-backup.tar.gz>

# Verification
courtlens verify-restore
make lint
make typecheck
make test
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
npm --prefix dashboard test
npm --prefix dashboard run test:browser
```
