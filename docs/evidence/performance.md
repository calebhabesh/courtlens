# Performance and Storage Evidence

Status: **Milestone P9 workbench benchmarks and capacity measurements complete**, 2026-10-01.  
Measured on the development/verification workstation using the active workbench dataset `17251a08-a4eb-4f46-b356-999fcf37c65d` and public serving release `5bbb6035-6794-4bb0-b894-7208f52ef7ad`. All traffic and operations are 100% local; no synthetic capacity claims or simulated external loads are made.

---

## 1. Benchmark Environment and Hardware

| Component | Specification |
| :--- | :--- |
| **Processor** | AMD Ryzen 7 9700X 8-Core Processor (16 logical threads, up to 5.5 GHz) |
| **System Memory** | 64 GB DDR5 (63,401,196 KB / 60.46 GB total physical RAM) |
| **Primary Storage** | NVMe PCIe Gen4 SSD (`/dev/nvme0n1p2`, ext4) |
| **Operating System** | Linux 7.2.7-arch1-1 x86_64 |
| **Database** | PostgreSQL 17.11 (`courtload-db-1`, `postgres:17-alpine` Docker container) |
| **Python Runtime** | Python 3.14.7, local `.venv` virtual environment |
| **Node.js Runtime** | Node.js v24.15.0 |
| **Dataset Scope** | 6 complete NBA regular seasons (2019–20 through 2024–25) + 2025–26 prospective schedules |
| **Admitted Scale** | 104,533 player-games, 7,924 team-games, 5,470 schedules, 489 prospective forecasts, 30 saved investigations |

---

## 2. Ingestion, Warehouse, Evaluation, and Backup Timings

| Operation | Input / Scope | Wall Time | Peak Memory | Notes |
| :--- | :--- | :---: | :---: | :--- |
| **Workbench acquisition** (`courtload acquire-workbench`) | 6 seasons SportsDataverse parquet files | 18.2s (cached: 0.9s) | < 80 MB | Verified SHA-256 for all 18 parquet artifacts |
| **Workbench bootstrap / import** (`courtload bootstrap-workbench`) | Parquet $\rightarrow$ PostgreSQL raw & normalized relations | 34.8s | ~240 MB | 104,533 player-game rows, 7,924 team-game rows, 5,470 schedules |
| **Warehouse dbt build** (`dbt build --select tag:workbench`) | 39 models & tests, staging $\rightarrow$ marts | 1.93s | ~180 MB | Full analytical transform of player facts, team facts, and opponent contexts |
| **Offline baseline evaluation** (`courtload evaluate`) | S1/S2 features $\rightarrow$ rolling baselines (M5) | 21.4s | ~320 MB | 25,615 validation rows, 14,920 calibration rows |
| **Offline challenger evaluation** (`courtload evaluate-final`) | GBDT player-only + context $\rightarrow$ S3 holdout (M6) | 48.2s | ~580 MB | Retained sealed historical run `6f7af9e63f27aada910d` (39,988 holdout predictions) |
| **Points-v1 prospective evaluation** (`courtload evaluate-points`) | 10 chronological folds across 2021–24 seasons | 14.8s | ~350 MB | 10,488 holdout rows; baseline MAE 5.09 vs. prior blend MAE 4.88 |
| **Prospective forecast issuance & scoring** (`courtload issue-forecasts` / `score-forecasts`) | Active policy `points-v1-prior_blend` | 3.2s | ~110 MB | 489 immutable issuances, 489 verified scores with DNP separation |
| **Full backup bundle** (`courtload backup-archive`) | Coordinated mutation lock + DB dump + manifests + artifacts $\rightarrow$ `.tar.gz` | 38.6s | ~150 MB | Produced 747.92 MB compressed `.tar.gz` archive |
| **Disposable DB restore & verification** (`courtload restore-archive`) | Tar.gz $\rightarrow$ fresh DB restore + hash verify + live query | 41.2s | ~180 MB | Verified on disposable DB with live Scottie Barnes & Pascal Siakam profiles |

---

## 3. Storage Footprint

### On-Disk Filesystem Storage

| Category | Component / Path | Size on Disk | Format / Details |
| :--- | :--- | :---: | :--- |
| **Raw files** | `data/raw/` | 107.00 MB | 18 SportsDataverse parquet files + legacy 4 CSV files + manifests |
| **Evaluation & analysis artifacts** | `data/artifacts/` | 956.91 MB | M5 run, M6 run, points-v1 run, 30 saved investigation manifests & results |
| **Rebuildable cache** | `data/cache/` | 3.06 MB | Rebuildable player portrait image cache (CDN re-acquirable) |
| **Backup archives** | `data/backups/` | 747.92 MB | Compressed `.tar.gz` full recovery bundle |
| **Total on-disk storage** | Project data tree | **1,814.89 MB** (~1.81 GB) | All persistent and reproducible files |

### PostgreSQL Database Footprint

Total PostgreSQL database cluster size: **3,426.71 MB** (3.43 GB) including indexes, relation storage, and transaction logs.

| Table Name | Rows | Size on Disk | Purpose |
| :--- | :---: | :---: | :--- |
| `workbench_player_games` | 104,533 | 93.81 MB | Normalized box-score player-game facts with exact metrics |
| `workbench_team_games` | 7,924 | 7.10 MB | Normalized box-score team-game facts |
| `workbench_schedules` | 5,470 | 2.46 MB | League schedules across regular season and playoff phases |
| `forecast_issuances` | 489 | 1.11 MB | Immutable prospective forecast issuance ledger with feature snapshots |
| `workbench_identities` | 896 | 0.48 MB | Resolved canonical player identities and tricode mappings |
| `forecast_scores` | 489 | 0.18 MB | Evaluated forecast scoring observations with DNP conditional flags |
| `player_portraits` | 200 | 0.15 MB | Cached player portrait metadata |
| `saved_investigations` | 30 | 0.11 MB | Persisted research queries and deterministic result digests |
| `workbench_datasets` | 30 | 0.08 MB | Dataset manifest registrations and content hashes |
| `workbench_observations` | 18 | 0.07 MB | Raw source observation metadata |
| `workbench_jobs` | 57 | 0.07 MB | Background ingestion and evaluation job runs |
| `workbench_versions` | 18 | 0.05 MB | Normalized dataset versions |
| `workbench_artifacts` | 18 | 0.05 MB | Physical artifact registry |
| `workbench_release_bindings` | 1 | 0.05 MB | Active release snapshot binding pointer |
| `workbench_dataset_members` | 1 | 0.04 MB | Immutable dataset entity membership mappings |
| `model_policy_activations` | 1 | 0.03 MB | Active forecasting model policy pointer (`points-v1-prior_blend`) |
| `workbench_acquisitions` | 18 | 0.03 MB | Upstream data acquisition log |

---

## 4. Workbench API Latency Benchmarks

Measured with `scripts/benchmark_workbench.py` over 30 samples per endpoint at concurrency $C = 4$, following 3 warm-up requests. Requests were executed against the FastAPI ASGI application with connection pooling against PostgreSQL 17.

Full raw measurement data is saved at [`docs/evidence/workbench-benchmarks.json`](file:///home/ethioking/dev/nba-analytics/docs/evidence/workbench-benchmarks.json).

| Endpoint | Method | Path | Samples | Errors | Min (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | Mean (ms) |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Health Check** | GET | `/api/health` | 30 | 0 | 1.59 | **5.25** | 56.55 | 62.12 | 62.12 | 11.23 |
| **Workbench Status** | GET | `/api/workbench/status` | 30 | 0 | 20.63 | **23.32** | 26.65 | 29.48 | 29.48 | 23.85 |
| **Catalog Definition** | GET | `/api/workbench/catalog` | 30 | 0 | 34.43 | **36.31** | 43.34 | 46.00 | 46.00 | 37.15 |
| **Metric Catalog** (35 metrics) | GET | `/api/workbench/metrics` | 30 | 0 | 1.97 | **3.65** | 4.79 | 6.24 | 6.24 | 3.72 |
| **Player Explorer** (`min_games=10`) | GET | `/api/workbench/players?min_games=10&page_size=50` | 30 | 0 | 48.77 | **53.07** | 58.97 | 62.18 | 62.18 | 52.84 |
| **Player Search** (`search=Barnes`) | GET | `/api/workbench/players?search=Barnes` | 30 | 0 | 46.24 | **49.80** | 52.96 | 53.37 | 53.37 | 49.98 |
| **Player Profile** (Scottie Barnes 2023–24) | GET | `/api/workbench/players/1630567?season=2023-24` | 30 | 0 | 37.26 | **45.37** | 47.81 | 49.38 | 49.38 | 44.52 |
| **Player Game Log** (Scottie Barnes 2023–24) | GET | `/api/workbench/players/1630567/games?season=2023-24&limit=25` | 30 | 0 | 33.65 | **42.98** | 48.59 | 49.77 | 49.77 | 42.96 |
| **Team Research** (All Teams 2023–24) | GET | `/api/workbench/teams?season=2023-24` | 30 | 0 | 74.27 | **122.48** | 201.64 | 212.45 | 212.45 | 132.60 |
| **Team Detail** (Toronto Raptors 2023–24) | GET | `/api/workbench/teams/1610612761?season=2023-24` | 30 | 0 | 47.60 | **51.78** | 56.47 | 56.53 | 56.53 | 52.09 |
| **Player Comparison** (Barnes vs. Barrett) | GET | `/api/workbench/compare?playerA=1630567&playerB=1629628&season=2023-24` | 30 | 0 | 45.56 | **54.65** | 60.91 | 62.25 | 62.25 | 54.59 |
| **Forecasts Ledger** (`limit=25`) | GET | `/api/workbench/forecasts?limit=25` | 30 | 0 | 40.68 | **72.83** | 87.40 | 90.02 | 90.02 | 71.75 |
| **Saved Investigations Hub** | GET | `/api/workbench/analyses` | 30 | 0 | 4.32 | **11.86** | 14.01 | 14.78 | 14.78 | 10.62 |
| **Assistant Status** | GET | `/api/workbench/assistant/status` | 30 | 0 | 0.97 | **2.58** | 3.85 | 4.12 | 4.12 | 2.45 |
| **Assistant Query** (Toronto Defense Offline) | POST | `/api/workbench/assistant/query` | 30 | 0 | 35.75 | **37.69** | 41.80 | 44.50 | 44.50 | 38.12 |

### Performance Observations

1. **Sub-60ms Median Across Core Research Endpoints:** The primary investigative views—including player explorer, player profile, player game log, player search, and player comparison—operate with median response times strictly between **42.98 ms and 54.65 ms**.
2. **Deterministic Zero-Error Reliability:** Across all 450 benchmarked requests, the error rate was strictly **0.0%**.
3. **Offline Assistant Efficiency:** The tool-backed analytical assistant executes tool dispatch, context resolution, and numerical claim verification in **37.69 ms (p50)** and **41.80 ms (p95)** when using the deterministic offline provider.
4. **Bounded AI Overhead:** Bounded round and row limits prevent token explosion and maintain sub-50ms offline latency while enforcing domain guardrails.

---

## 5. Tool-Backed Assistant Budgets and Guardrails

The assistant service adheres to strict resource and analytical guardrails:

| Budget Dimension | Limit | Enforcement Mechanism |
| :--- | :--- | :--- |
| **Max Question Length** | 2,000 characters | Server-side validation; 400 Bad Request if exceeded |
| **Max Tool Rounds** | 4 multi-turn rounds | Loop counter terminates execution if exceeded |
| **Max Tool Calls** | 8 total tool calls | Ledger tracks calls across rounds; halts on budget exhaustion |
| **Max Rows per Tool Call** | 100 rows | Clamped by tool schemas; prevents memory/token blowout |
| **Wall Clock Deadline** | 45.0 seconds | Async timeout terminates provider execution |
| **Tool Set** | Strictly 8 allowlisted tools | Rejects unallowlisted functions, raw SQL, and system calls |
| **Evidence Binding** | Numerical claims $\pm 0.05$ | Numbers in narrative are verified against `EvidenceLedger` |
| **Zero-Cost Offline Core** | Fully usable without API key | Returns typed `status="disabled"` explaining offline operation |
