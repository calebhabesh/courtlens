# Performance, Storage, and Latency Evidence (B37 Release)

Status: **Block B37 real-service benchmarks, process accounting, and storage measurements complete**, 2026-10-04.  
Measured on the development/verification workstation using the active workbench dataset `17251a08-a4eb-4f46-b356-999fcf37c65d` and public serving release `5bbb6035-6794-4bb0-b894-7208f52ef7ad`. All measurements reflect real HTTP requests against the live running FastAPI service (`http://127.0.0.1:8000`) and PostgreSQL 17 database cluster.

---

## 1. Benchmark Environment and Hardware

| Component | Specification |
| :--- | :--- |
| **Processor** | AMD Ryzen 7 9700X 8-Core Processor (16 logical threads, up to 5.5 GHz) |
| **System Memory** | 64 GB DDR5 (63,401,180 KB / 60.46 GB total physical RAM) |
| **Primary Storage** | NVMe PCIe Gen4 SSD (`/dev/nvme0n1p2`, ext4) |
| **Operating System** | Linux 7.2.8-arch1-2 x86_64 |
| **Database** | PostgreSQL 17.11 (`courtload-db-1`, `postgres:17-alpine` Docker container) |
| **Python Runtime** | Python 3.14.7, local `.venv` virtual environment |
| **Node.js Runtime** | Node.js v24.15.0 |
| **Dataset Scope** | 6 complete NBA regular seasons (2019–20 through 2024–25) + 2025–26 prospective schedules + 2026–27 schedule |
| **Database Cardinality** | 78 relations, 662,826 serving player profiles, 657,388 research shot members, 271,827 serving player games, 104,533 workbench player games, 7,924 workbench team games, 5,470 schedules, 489 prospective forecasts, 33 saved conversation analyses |

---

## 2. Process Resource Utilization

Measured during live service operation under benchmark load:

| Service / Process | PID / Container ID | Memory (RSS) | Memory Limit / Host % | Threads / PIDs | CPU % | Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **FastAPI Backend (Uvicorn)** | PID 1209455 | **251.98 MB** | ~0.41% host | 7 threads | < 1.0% | Asynchronous ASGI server with SQLAlchemy pooled connections |
| **PostgreSQL Database** | `courtload-db-1` | **306.5 MiB** | 60.46 GiB limit (0.50%) | 8 worker PIDs | 0.00% (idle) | Shared buffers and connection worker processes |
| **Next.js Dashboard** | `linewatch-staging` / standalone | **350.5 MB** | ~0.55% host | Node runtime | < 0.5% | App router server with Turbopack production compilation |

---

## 3. Storage Footprint

### On-Disk Filesystem Storage

Total on-disk project data footprint: **4,521.46 MB** (~4.52 GB).

| Category | Component / Path | Size on Disk | Format / Details |
| :--- | :--- | :---: | :--- |
| **Raw files** | `data/raw/` | 120.31 MB | SportsDataverse parquet files + nocturnebear raw archives + manifests |
| **Evaluation & analysis artifacts** | `data/artifacts/` | 3,640.96 MB | Sealed research runs, evaluation models, and saved investigations |
| ↳ *Research shot charts* | `data/artifacts/research-shots/` | 2,612.44 MB | Three-season shot chart event databases and member maps |
| ↳ *Offline evaluation* | `data/artifacts/evaluation/` | 956.91 MB | M5 baseline, M6 GBDT holdout run, and points-v1 model artifacts |
| ↳ *Research packages* | `data/artifacts/research-run-packages/` | 23.11 MB | Verified reproducible research packages |
| ↳ *Research runs* | `data/artifacts/research-runs/` | 16.42 MB | Registered research protocol runs |
| ↳ *Saved analyses* | `data/artifacts/analyses/` | 1.62 MB | Persisted research queries and deterministic result digests |
| **Rebuildable cache** | `data/cache/` | 14.15 MB | Rebuildable player portrait image cache (CDN re-acquirable) |
| **Backup archives** | `data/backups/` | 747.92 MB | Compressed `.tar.gz` full recovery bundle |
| **Next.js production build** | `dashboard/.next/` | 1,108.33 MB | Compiled serverless chunks, static pages, and asset manifests |

### PostgreSQL Database Footprint

Total PostgreSQL database cluster size: **3,867.79 MB** (~3.87 GB) including relation tables, indexes, system catalogs, and transaction logs.  
Total size across all 78 base relations: **2,045.35 MB**.

| Table Name | Rows | Total Size | Table Data | Index Data | Category / Purpose |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `serving_player_profiles` | 662,826 | 971.21 MB | 838.56 MB | 132.38 MB | Serving player profile rollups across replay dates |
| `research_shot_members` | 657,388 | 407.49 MB | 358.78 MB | 48.58 MB | Registered research shot membership mappings |
| `serving_player_games` | 271,827 | 218.56 MB | 163.56 MB | 54.92 MB | Serving historical box-score facts |
| `archive_versions` | 102,444 | 100.61 MB | 80.06 MB | 20.49 MB | Archive raw dataset versions |
| `workbench_player_games` | 104,533 | 93.81 MB | 62.82 MB | 30.95 MB | Normalized workbench box-score player-game facts |
| `archive_player_games` | 90,609 | 69.96 MB | 51.56 MB | 18.35 MB | Normalized archive player game records |
| `archive_observations` | 102,444 | 45.84 MB | 23.06 MB | 22.74 MB | Raw source observation metadata |
| `archive_identities` | 107,001 | 39.20 MB | 18.69 MB | 20.48 MB | Resolved archive identity mappings |
| `archive_members` | 97,631 | 36.01 MB | 20.62 MB | 15.35 MB | Archive dataset entity memberships |
| `serving_opponent_contexts` | 43,341 | 35.02 MB | 26.06 MB | 8.91 MB | Reconstructed historical opponent allowance |
| `workbench_team_games` | 7,924 | 7.13 MB | 4.77 MB | 2.33 MB | Normalized workbench team game facts |
| `archive_team_games` | 7,022 | 5.64 MB | 4.06 MB | 1.54 MB | Normalized archive team game facts |
| `workbench_schedules` | 5,470 | 3.13 MB | 1.48 MB | 1.62 MB | League schedules across regular and playoff phases |
| `saved_conversation_analyses` | 33 | 2.03 MB | 0.02 MB | 0.05 MB | Persisted conversation analysis manifests & evidence |
| `archive_quarantine` | 4,997 | 1.86 MB | 0.88 MB | 0.95 MB | Quarantined malformed archive rows |
| `research_games` | 3,690 | 1.14 MB | 0.85 MB | 0.26 MB | Registered research games catalog |
| `forecast_issuances` | 489 | 1.11 MB | 0.96 MB | 0.12 MB | Immutable prospective forecast issuance ledger |
| `workbench_identities` | 913 | 0.48 MB | 0.23 MB | 0.21 MB | Resolved workbench canonical identities |
| `player_portraits` | 816 | 0.42 MB | 0.24 MB | 0.15 MB | Cached player portrait metadata |
| `saved_investigations` | 151 | 0.32 MB | 0.23 MB | 0.05 MB | Persisted research queries and digests |
| `workbench_player_measurements`| 268 | 0.22 MB | 0.09 MB | 0.10 MB | Physical draft and combine measurements |
| `forecast_scores` | 489 | 0.18 MB | 0.10 MB | 0.05 MB | Forecast scoring observations with DNP flags |
| `published_snapshots` | 148 | 0.05 MB | 0.02 MB | 0.02 MB | Atomic snapshot publication pointers |
| *Other 55 relations* | Variable | 72.88 MB | Variable | Variable | Lineups, stints, finance, live leases, and catalogs |

---

## 4. Real-Service API Latency Benchmarks

Measured with `scripts/benchmark_release.py` executing 30 samples per endpoint at concurrency $C = 4$, following 3 warm-up requests. All requests were issued directly over HTTP against the running FastAPI application on `http://127.0.0.1:8000`.

Raw measurement evidence is preserved at [`docs/evidence/b37-release-benchmarks.json`](file:///home/ethioking/dev/nba-analytics/docs/evidence/b37-release-benchmarks.json).

| Category | Endpoint | Method | Path | Samples | Errors | Min (ms) | p50 (ms) | p95 (ms) | Mean (ms) |
| :--- | :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **System** | Health Check | GET | `/api/health` | 30 | 0 | 1.94 | **2.58** | 7.64 | 2.97 |
| **System** | Workbench Status | GET | `/api/workbench/status` | 30 | 0 | 17.51 | **19.05** | 22.96 | 18.81 |
| **System** | Catalog Definition | GET | `/api/workbench/catalog` | 30 | 0 | 43.14 | **44.96** | 46.72 | 44.60 |
| **System** | Metric Catalog (35 metrics) | GET | `/api/workbench/metrics` | 30 | 0 | 2.45 | **2.76** | 3.42 | 2.74 |
| **Explorer** | Player Explorer (`min_games=10`) | GET | `/api/workbench/players?min_games=10&page_size=50` | 30 | 0 | 260.67 | **305.34** | 391.89 | 314.28 |
| **Explorer** | Player Search (`'Barnes'`) | GET | `/api/workbench/players?search=Barnes` | 30 | 0 | 275.12 | **321.13** | 409.32 | 335.57 |
| **Explorer** | Entity Lookup (`'Barnes'`) | GET | `/api/workbench/lookup?q=Barnes` | 30 | 0 | 50.84 | **53.28** | 55.88 | 52.74 |
| **Explorer** | Canonical QuerySpec (Scoring) | POST | `/api/workbench/query` | 30 | 0 | 258.91 | **301.81** | 385.07 | 311.52 |
| **Profiles** | Player Profile (Scottie Barnes) | GET | `/api/workbench/players/1630567?season=2023-24` | 30 | 0 | 59.88 | **62.37** | 65.01 | 61.84 |
| **Profiles** | Player Game Log (Scottie Barnes) | GET | `/api/workbench/players/1630567/games?season=2023-24&limit=25` | 30 | 0 | 53.79 | **56.37** | 60.18 | 56.49 |
| **Profiles** | Comparison (Barnes vs Barrett) | GET | `/api/workbench/compare?playerA=1630567&playerB=1629628&season=2023-24` | 30 | 0 | 66.83 | **69.67** | 74.25 | 69.71 |
| **Teams** | Team Research (All Teams) | GET | `/api/workbench/teams?season=2023-24` | 30 | 0 | 239.81 | **309.47** | 371.39 | 295.93 |
| **Teams** | Team Detail (Toronto Raptors) | GET | `/api/workbench/teams/1610612761?season=2023-24` | 30 | 0 | 79.44 | **120.81** | 210.82 | 130.52 |
| **Research** | Distribution (Barnes PTS) | GET | `/api/workbench/operations/distribution?playerId=1630567&season=2023-24&metric=pts` | 30 | 0 | 100.82 | **121.95** | 219.16 | 145.97 |
| **Research** | Contextual Splits (Barnes) | GET | `/api/workbench/operations/splits?playerId=1630567&season=2023-24` | 30 | 0 | 114.73 | **139.96** | 242.79 | 159.64 |
| **Research** | Opponent Defensive Allowance | GET | `/api/workbench/operations/opponent-context?teamId=1610612761&season=2023-24` | 30 | 0 | 118.91 | **164.27** | 280.33 | 177.94 |
| **Research** | Statistical Peer Similarity | GET | `/api/workbench/operations/similarity?playerId=1630567&season=2023-24` | 30 | 0 | 214.33 | **239.93** | 285.10 | 243.53 |
| **Research** | Rank Operation (PTS Leaders) | GET | `/api/workbench/operations/rank?season=2023-24&metric=pts` | 30 | 0 | 15721.40 | **16068.32** | 16234.51 | 15961.85 |
| **Research** | Physical Measurements ('Barnes') | GET | `/api/workbench/measurements?query=Barnes` | 30 | 0 | 6.81 | **7.80** | 9.94 | 7.85 |
| **Research** | Identity Crosswalk (ESPN -> NBA)| GET | `/api/workbench/crosswalk?sourceNamespace=espn&sourceId=4433134` | 30 | 0 | 4.67 | **5.22** | 5.98 | 5.01 |
| **Research** | Backfill Status | GET | `/api/workbench/backfill/status` | 30 | 0 | 6.12 | **6.86** | 7.97 | 6.71 |
| **Advanced** | Shared Floor WOWY (Barnes) | POST | `/api/workbench/operations/wowy` | 30 | 0 | 59.82 | **61.96** | 63.94 | 61.52 |
| **Advanced** | Shooting Profile (Barnes) | POST | `/api/workbench/operations/shot-profile` | 30 | 0 | 58.65 | **60.42** | 63.94 | 60.04 |
| **Finance** | Finance Salary Books | GET | `/api/workbench/operations/finance/books` | 30 | 0 | 3.84 | **4.30** | 5.38 | 4.38 |
| **Finance** | Finance Replay Query | POST | `/api/workbench/operations/finance` | 30 | 0 | 8.35 | **9.41** | 12.11 | 9.49 |
| **Live** | Live Games Status | GET | `/api/live?slate_date=2024-04-14` | 30 | 0 | 5.12 | **5.88** | 7.12 | 5.85 |
| **Forecast** | Prospective Forecasts Ledger | GET | `/api/workbench/forecasts?limit=25` | 30 | 0 | 60.14 | **65.95** | 70.84 | 63.64 |
| **Forecast** | Saved Investigations Hub | GET | `/api/workbench/analyses` | 30 | 0 | 12.14 | **13.93** | 18.61 | 13.75 |
| **Assistant**| Assistant Operations Catalog | GET | `/api/workbench/assistant/operations` | 30 | 0 | 20.89 | **23.34** | 26.96 | 22.38 |
| **Assistant**| Assistant Saved Investigations | GET | `/api/workbench/assistant/investigations` | 30 | 0 | 344.20 | **403.54** | 494.62 | 411.03 |
| **Assistant**| Assistant Query (Deterministic) | POST | `/api/workbench/assistant/query` | 30 | 0 | 53.64 | **56.31** | 59.19 | 55.71 |

### Latency Summary

- **Total Requests Executed:** 930 requests across 31 endpoints.
- **Total Request Errors:** **0 (0.00% error rate)**.
- **Ultra-Fast Endpoints ($< 10\text{ ms}$ P50):** Health Check (2.58 ms), Metric Catalog (2.76 ms), Finance Books (4.30 ms), Identity Crosswalk (5.22 ms), Live Games Status (5.88 ms), Backfill Status (6.86 ms), Physical Measurements (7.80 ms), Finance Replay Query (9.41 ms).
- **Core Research & Operational Queries ($< 70\text{ ms}$ P50):** Saved Investigations (13.93 ms), Workbench Status (19.05 ms), Assistant Operations (23.34 ms), Catalog Definition (44.96 ms), Entity Lookup (53.28 ms), Assistant Offline Query (56.31 ms), Player Game Log (56.37 ms), Shooting Profile (60.42 ms), Shared Floor WOWY (61.96 ms), Player Profile (62.37 ms), Prospective Forecasts (65.95 ms), Player Comparison (69.67 ms).
- **Complex Aggregations ($120 - 410\text{ ms}$ P50):** Team Detail (120.81 ms), Distribution Quantiles (121.95 ms), Contextual Splits (139.96 ms), Opponent Defensive Allowance (164.27 ms), Statistical Peer Similarity (239.93 ms), Canonical QuerySpec (301.81 ms), Player Explorer (305.34 ms), Team Research (309.47 ms), Player Search (321.13 ms), Assistant Saved Investigations (403.54 ms).
- **Dynamic Full-League Ranking:** `GET /api/workbench/operations/rank` measures ~16.0s P50 due to scanning and computing per-game metrics across all 104,533 player-game rows for every player in the league without an indexed materialization.

---

## 5. Ingestion, Evaluation, and Restore Verification Timings

| Operation | Input / Scope | Wall Time | Peak Memory | Notes |
| :--- | :--- | :---: | :---: | :--- |
| **Workbench acquisition** (`courtload acquire-workbench`) | 6 seasons SportsDataverse parquet files | 18.2s (cached: 0.9s) | < 80 MB | Verified SHA-256 for all 18 parquet artifacts |
| **Workbench bootstrap / import** (`courtload bootstrap-workbench`) | Parquet $\rightarrow$ PostgreSQL raw & normalized relations | 34.8s | ~240 MB | 104,533 player-game rows, 7,924 team-game rows, 5,470 schedules |
| **Warehouse dbt build** (`dbt build --select tag:workbench`) | 39 models & tests, staging $\rightarrow$ marts | 1.79s | ~180 MB | Full analytical transform of player facts, team facts, and opponent contexts |
| **Offline baseline evaluation** (`courtload evaluate`) | S1/S2 features $\rightarrow$ rolling baselines (M5) | 21.4s | ~320 MB | 25,615 validation rows, 14,920 calibration rows |
| **Offline challenger evaluation** (`courtload evaluate-final`) | GBDT player-only + context $\rightarrow$ S3 holdout (M6) | 48.2s | ~580 MB | Retained sealed historical run `6f7af9e63f27aada910d` (39,988 holdout predictions) |
| **Points-v1 prospective evaluation** (`courtload evaluate-points`) | 10 chronological folds across 2021–24 seasons | 14.8s | ~350 MB | 10,488 holdout rows; baseline MAE 5.09 vs. prior blend MAE 4.88 |
| **Prospective forecast issuance & scoring** (`courtload issue-forecasts`) | Active policy `points-v1-prior_blend` | 3.2s | ~110 MB | 489 immutable issuances, 489 verified scores with DNP separation |
| **Full backup bundle** (`courtload backup-archive`) | Coordinated mutation lock + DB dump + manifests + artifacts $\rightarrow$ `.tar.gz` | 38.6s | ~150 MB | Produced 747.92 MB compressed `.tar.gz` archive |
| **Disposable DB restore & verification** (`test_restore_postgres.py`) | Tar.gz $\rightarrow$ fresh disposable DB restore + hash verify + 33 saved analysis reproductions | **157.50s** | ~280 MB | **5 passed in 157.50s**; 33/33 saved conversation analyses reproduced with byte-for-byte exact equality |

---

## 6. Assistant Resource Budgets and Domain Guardrails

| Budget Dimension | Limit | Enforcement Mechanism |
| :--- | :--- | :--- |
| **Max Question Length** | 2,000 characters | Server-side validation; 400 Bad Request if exceeded |
| **Max Tool Rounds** | 4 multi-turn rounds | Loop counter terminates execution if exceeded |
| **Max Tool Calls** | 8 total tool calls | Ledger tracks calls across rounds; halts on budget exhaustion |
| **Max Rows per Tool Call** | 100 rows | Clamped by tool schemas; prevents memory/token blowout |
| **Wall Clock Deadline** | 45.0 seconds | Async timeout terminates provider execution |
| **Tool Set** | Strictly 8 allowlisted tools | Rejects unallowlisted functions, raw SQL, and system calls |
| **Evidence Binding** | Numerical claims $\pm 0.05$ | Numbers in narrative are verified against `EvidenceLedger` |
| **Zero-Cost Offline Core** | Fully usable without API key | Returns typed `status="disabled"` or executes deterministic plans |
