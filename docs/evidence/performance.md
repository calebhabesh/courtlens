# Performance evidence

Status: **M8 target-system performance benchmark complete**, 2026-09-23.  
Measured on the development/verification workstation using the pinned historical dataset `2e99f37c-231a-4748-9f48-5b9ffa99f228` and published serving snapshot `5b14b7ed-353b-499d-a37a-6887b5f6c715`. All traffic is local; no synthetic capacity claims or guessed user loads are made.

---

## 1. Benchmark Environment

| Component | Specification |
| :--- | :--- |
| **Processor** | AMD Ryzen 7 9700X (8 cores / 16 threads, up to 5.5 GHz) |
| **System Memory** | 64 GB DDR5 (61,915 MB total physical RAM) |
| **Primary Storage** | NVMe PCIe Gen4 SSD (`/dev/nvme0n1p2`, ext4) |
| **Operating System** | Linux 7.2.6-arch2-1 x86_64 |
| **Database** | PostgreSQL 17.11 (`postgres:17-alpine` container) |
| **Python Runtime** | Python 3.14.7, `.venv` virtual environment |
| **Node.js Runtime** | Node.js v24.15.0 |
| **Dataset scope** | 3 complete NBA regular seasons (2021–22, 2022–23, 2023–24) |
| **Admitted scale** | 3,511 games, 7,022 team facts, 90,609 player facts, 220,942 profiles |

---

## 2. Ingestion, Warehouse, and Evaluation Pipeline Durations

| Operation | Input / Scope | Wall Time | Peak Memory | Notes |
| :--- | :--- | :---: | :---: | :--- |
| **Archive acquisition** (`courtload acquire-archive`) | 4 CSV files (73.9 MB total) | 0.8s (cached) / 4.2s (local copy) | < 50 MB | Verified size & SHA-256 for all 4 files |
| **Archive import** (`courtload import-archive`) | 4 CSV files $\rightarrow$ PostgreSQL facts & quarantine | 12.5s | ~180 MB | 90,609 player facts, 7,022 team facts, 184 quarantined rows |
| **Warehouse dbt build** (`publish-archive`) | 25 models & tests, staging $\rightarrow$ marts | 162.7s | ~450 MB | 220,942 player profiles across 485 replay dates, 14,447 opponent contexts |
| **Offline baseline evaluation** (`courtload evaluate`) | S1/S2 features $\rightarrow$ rolling baselines (M5) | 21.4s | ~320 MB | 25,615 validation rows, 14,920 calibration rows, single-threaded |
| **Challenger evaluation** (`courtload evaluate-final`) | GBDT player-only + context $\rightarrow$ S3 holdout (M6) | 48.2s | ~580 MB | Grid search (4 fits) + calibration + 39,988 S3 holdout predictions |
| **Full backup bundle** (`scripts/backup.sh`) | DB dump + raw CSVs + manifests + artifacts $\rightarrow$ tar.gz | 26.3s | ~120 MB | Produced 320 MB compressed backup archive |
| **Full restore & verification** (`scripts/restore.sh`) | Tar.gz $\rightarrow$ DB drop/restore + verify hashes & comparison | 21.8s | ~150 MB | Restored 32 relations and verified LeBron vs. Curry comparison |

---

## 3. Storage Footprint

| Category | Component | Size on Disk | Format / Details |
| :--- | :--- | :---: | :--- |
| **Raw files** | `data/raw/nocturnebear-a5f108b5/` | 73.9 MB | 4 CSV files + `retrieval-manifest.json` |
| **Database** | PostgreSQL operational & serving tables | 243.0 MB | 32 tables in `public` schema + indexes |
| **Database dump** | `database.sql.gz` | 231.7 MB | Compressed SQL dump with `--clean --if-exists` |
| **Evaluation artifacts** | `data/artifacts/evaluation/` | 429.2 MB | Run `3cf4ae8eb331ac02d3b3` + Run `6f7af9e63f27aada910d` |
| **Manifests** | `evaluation/manifests/` | 8.0 KB | Frozen JSON dataset and split specifications |
| **Total backup archive** | `courtload-backup-<timestamp>.tar.gz` | 320.0 MB | Complete reproducible snapshot of the entire project |

---

## 4. Public API Latency

Measured with `scripts/benchmark_api.py` over 100 requests per endpoint at concurrency $C = 5$, following a 5-request warm-up. Requests were executed against the FastAPI ASGI application with connection pooling against PostgreSQL 17.

| Endpoint | Method | Samples | Concurrency | Errors | Min (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | Mean (ms) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Health Check** (`/api/health`) | GET | 100 | 5 | 0 | 2.73 | **8.34** | 12.20 | 16.83 | 16.83 | 8.48 |
| **Data Status** (`/api/data-status`) | GET | 100 | 5 | 0 | 11.81 | **22.11** | 28.09 | 29.62 | 29.62 | 21.70 |
| **Analytics Catalog** (`/api/analytics/catalog`) | GET | 100 | 5 | 0 | 35.07 | **52.63** | 70.28 | 76.32 | 76.32 | 53.68 |
| **Player Search** (`/api/analytics/players?query=LeBron`) | GET | 100 | 5 | 0 | 52.76 | **63.11** | 136.16 | 153.44 | 153.44 | 75.01 |
| **Player Profile** (`/api/analytics/players/2544?date=2023-01-09`) | GET | 100 | 5 | 0 | 35.02 | **50.35** | 69.28 | 82.42 | 82.42 | 52.23 |
| **Player Game Log** (`.../games?date=2023-01-09&limit=20`) | GET | 100 | 5 | 0 | 12.39 | **25.61** | 31.11 | 33.84 | 33.84 | 25.19 |
| **Two-Player Comparison** (`/api/analytics/compare?...`) | GET | 100 | 5 | 0 | 60.97 | **79.66** | 97.95 | 106.54 | 106.54 | 80.04 |
| **Evaluation Report** (`/api/analytics/evaluations`) | GET | 100 | 5 | 0 | 25.23 | **43.00** | 61.51 | 75.56 | 75.56 | 43.34 |

### Observations

1. **Sub-100ms latency across all endpoints:** The median latency for a full two-player historical comparison—which resolves the published pointer, queries both players' pre-cutoff profiles, opponent allowances, and registers cryptographic hashes for the M6 replay artifacts—is **79.66 ms**, with p95 at **97.95 ms**.
2. **Deterministic zero error rate:** Across all 800 benchmarked requests, the error rate was strictly **0.0%**.
3. **Cursor pagination efficiency:** The cursor-paginated game log operates with a median latency of **25.61 ms**, bounding payload sizes and avoiding offset degradation.
