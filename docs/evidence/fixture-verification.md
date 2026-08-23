# Fixture verification — 2026-08-23

Classification: **fixture**. These measurements prove deterministic software behavior and local
integration only. They are not claims about live NBA coverage, latency, or user outcomes.

## Environment and dataset

- PostgreSQL 17, Python service image built from Python 3.12, and production Next.js container.
- 4 fictional teams, 8 fictional players, 14 games, 24 reported player-game rows, and 50 immutable
  raw object versions.
- One fictional points league with three daily active slots and scoring week `2025-02-03` through
  `2025-02-09` in `America/Toronto`.

## Results

| Check | Result |
| --- | --- |
| Alembic upgrade against a clean PostgreSQL database | Passed |
| Python unit/contract/integration suite | 36 passed; 79% line coverage |
| Frontend component suite | 2 passed |
| Ruff format and lint | Passed |
| Strict mypy check | Passed |
| Next.js lint, typecheck, and production build | Passed |
| dbt build | 10 models + 62 tests; 72 passed, 0 warnings/errors |
| Operational SQL checks | 4 passed, 0 failed |
| Container API/dashboard smoke checks | Passed |

The fixture planner reconciled 24 scheduled player-games into 17 startable player-games and 7
visible lineup conflicts under the three-slot league configuration. This equality is inspectable
day by day in the planner grid. A separate regression verifies that manager-marked inactive games
remain scheduled but are neither startable nor mislabeled as slot conflicts.

## Covered failure/edge behavior

- Re-loading identical objects is idempotent.
- A corrected game creates one new raw content version, updates the existing game, and does not
  duplicate the game grain.
- A failed stats page retains previously committed teams/schedule and marks the overall run failed.
- Persistent rate limits, server retries, entitlement failures, repeated cursors, and schema drift
  fail visibly.
- A provider-reported zero-minute row is retained distinctly; an absent row remains absent/unknown.
- Postponed/cancelled/suspended games do not count toward schedule opportunities.
- Current-game mutation cannot alter that game's own prior form.
- The add/drop before/after views use the same snapshot and scoring/roster versions.
- Acquisition exhaustion returns an explained invalid state, and cross-owner reads return `404`.

## Captures

- [`fixture-home.png`](../assets/fixture-home.png), 1440 × 1000.
- [`fixture-planner.png`](../assets/fixture-planner.png), 1440 × 1200.
- [`fixture-mobile.png`](../assets/fixture-mobile.png), 390 × 844.

## Not established by this evidence

- Provider plan sufficiency or live schema/data coverage.
- Live corrections, reschedules, trades, reported DNP patterns, or season completeness.
- Real-fantasy-platform eligibility accuracy or waiver availability.
- Production throughput, p50/p95 latency, uptime, or cost.
- A real manager decision or optional model improvement.

Those items stay pending until the credentialed source spike and two-week private user workflow are
recorded in this directory.
