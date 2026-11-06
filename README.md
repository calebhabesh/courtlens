# <img src="dashboard/public/icon.svg" width="34" height="34" align="absmiddle" alt="" /> CourtLens

[![CI](https://github.com/calebhabesh/courtlens/actions/workflows/ci.yml/badge.svg)](https://github.com/calebhabesh/courtlens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

CourtLens is a self-hosted NBA analytics site. It's a versioned PostgreSQL and
dbt warehouse, player impact ratings computed from public play-by-play,
out-of-time forecast evaluation, and a Next.js dashboard modeled on
[Databallr](https://databallr.com). A tool-calling assistant answers questions
from the warehouse, and its numbers are checked against real query results.

<p align="center">
  <img src="docs/assets/stats.png" alt="CourtLens Stats page: a player table with impact, counting and percentile columns" width="900">
</p>

## Status

This is a working portfolio project, not a hosted product. The warehouse,
impact metrics, forecasting and dashboard all run locally. Page-by-page
alignment with Databallr is in progress ([catalog](docs/databallr-alignment-catalog.md)).
The assistant's held-out evaluation (Research R16) is in progress on the free
provider tier, so no holdout accuracy is claimed yet.

Design rules:

- **No future data:** features only use games before the replay date, so
  changing a later game can't change an earlier result.
- **Missing isn't zero:** an absent box score is unknown, not a 0-point game or an injury.
- **Releases are immutable:** raw inputs are content-hashed. Releases go live by
  an atomic pointer swap, so a failed rebuild never replaces the last good one.

## How It Fits Together

```mermaid
flowchart LR
    A[Free public sources<br/>SportsDataverse · NBA.com · pbpstats · BBRef · DARKO] --> B[(PostgreSQL 17<br/>raw + normalized)]
    B --> C[dbt marts]
    B --> D[Stint reconstruction<br/>RAPM · on/off · six factors]
    C --> E[Published release<br/>atomic pointer swap]
    D --> E
    E --> F[FastAPI]
    F --> G[Next.js dashboard]
    F --> H[Assistant<br/>read-only tools]
```

## Results

Research results, each registered before fitting and tested on seasons the
model never saw ([Research progress](docs/research-progress.md)):

- **Win probability (R15):** log loss 0.4028 against 0.4157 for the baseline on
  2,439 test games in 2024-25 and 2025-26, calibration error 0.0083
  ([evidence](docs/evidence/research/r15a/README.md)). Frozen and scored nightly
  on 2026-27.
- **Metric backtest (R08):** with ratings fixed before each of 11,979 games
  (2016-17 to 2025-26), monthly time-decay RAPM predicts the margin +0.80 points
  better in RMSE (+0.72 to +0.88) than team net rating, the only metric ranked
  above every other ([evidence](docs/evidence/research/r08/README.md)).
- **Projected Impact (R07):** CourtLens's own player rating beats carrying last
  season forward by +4.38 (+3.25 to +5.50) in minutes-weighted squared error on
  2024-25 and 2025-26 ([evidence](docs/evidence/research/r07/README.md)).
- **Shot Quality v2 (R05):** the expected-points shot model's Brier score is
  2.56% better (2.44% to 2.67%) than league zone and distance rates on 2024-25
  and 2025-26 ([evidence](docs/evidence/research/r05/README.md)).
- **Ask evaluation (R16):** evaluation in progress; no number yet.

Earlier results:

- **Forecasting:** across 10 chronological folds, the prior-season blend scored
  MAE 4.88 points against a rolling baseline's 5.09. 81.2% of outcomes landed
  inside the 80% interval ([case studies](docs/evidence/release-case-studies.md)).
- **Assistant:** on a pinned snapshot, the first Gemini development baseline got
  70.3% of 360 runs exactly right, checked against independently written SQL
  ([evaluation](docs/evidence/ar02-evaluation/README.md)).
- **API:** median under 55 ms for core views, with 0 errors in 450 concurrent
  requests ([performance](docs/evidence/performance.md)).

## Explore the Project

| Area | Contents |
| --- | --- |
| [`src/courtlens/`](src/courtlens/) | FastAPI app, CLI, ingestion, impact metrics, assistant |
| [`warehouse/`](warehouse/) | dbt staging, fact and serving models |
| [`dashboard/`](dashboard/) | Next.js App Router dashboard |
| [`evaluation/`](evaluation/) | Forecast evaluation configs and manifests |
| [`docs/architecture.md`](docs/architecture.md) | System design |
| [`docs/source-contract.md`](docs/source-contract.md) | Data sources and their rules |
| [`docs/operations/runbook.md`](docs/operations/runbook.md) | Setup, refresh, backup and restore |

## Run Locally

You need Docker, Python 3.12+ and Node.js 20+.

```bash
make install && make install-dashboard
cp .env.example .env
docker compose up -d db && make migrate
courtlens bootstrap        # acquire data, build dbt models, publish a release
make dev                   # API on :8000
npm --prefix dashboard run dev
```

The assistant works without an API key in a limited rule-based mode. To use a
model, set a Gemini, Anthropic or OpenAI key in `.env`. Keys stay on the
server. `make test`, `make lint` and `make typecheck` run the checks. The
[runbook](docs/operations/runbook.md) covers everything else.

## License

[MIT](LICENSE). Bundled fonts keep their own licenses, listed in
[`dashboard/public/fonts`](dashboard/public/fonts/manifest.json). The Switzer interface font is
not in the repository (its license excludes redistribution); install, dev and build fetch the
hash-pinned original from Fontshare. CourtLens is
unofficial and not affiliated with the NBA.
