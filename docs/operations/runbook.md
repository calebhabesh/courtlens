# Operations runbook

Status: **M8 operations and reproduction guide**, 2026-09-23.  
Describes verified local and container operations for CourtLoad on pinned historical NBA archives.

---

## 1. Quick Start & Verification

### Prerequisites
- Docker with Compose v2
- Python 3.12+ (local venv optional if using Docker)
- Node.js 24 (for dashboard development)

```bash
# Clone and setup environment
cp .env.example .env

# Start database and application services
docker compose up --build -d db migrate api dashboard

# Verify health
curl --fail http://localhost:8000/api/health
curl --fail http://localhost:8000/api/analytics/catalog
./scripts/smoke.sh
```

By default:
- Dashboard: <http://localhost:3000> (or set `COURTLOAD_DASHBOARD_PORT=3100` if port 3000 is occupied)
- API: <http://localhost:8000>
- API Documentation: <http://localhost:8000/api/docs>

---

## 2. Historical Data Lifecycle

CourtLoad runs on an independently verified historical NBA dataset spanning the 2021–22, 2022–23, and 2023–24 regular seasons. Rebuilding is completely offline after initial archive acquisition.

### Step 1: Acquire Pinned Archive
Downloads or copies the four pinned CSV files, verifying exact byte lengths and SHA-256 digests:
```bash
courtload acquire-archive --destination data/raw/nocturnebear-a5f108b5
```

### Step 2: Import Archive Facts
Parses CSV streams, applies strict time and score reconciliation, isolates malformed rows in quarantine, and commits immutable facts:
```bash
COURTLOAD_DATABASE_URL=postgresql+psycopg://courtload:courtload@localhost:5432/courtload \
  courtload import-archive --root data/raw/nocturnebear-a5f108b5
```

### Step 3: Warehouse Build and Atomic Publication
Executes dbt in a candidate build schema, verifies two-sided reconciliation, grain invariants, and temporal discipline, copies serving facts, and atomically updates the publication pointer:
```bash
COURTLOAD_DATABASE_URL=postgresql+psycopg://courtload:courtload@localhost:5432/courtload \
  courtload publish-archive --code-version "$(git rev-parse HEAD)"
```

### Rollback (if needed)
Atomically points the publication channel back to a retained ready snapshot without deleting rows:
```bash
COURTLOAD_DATABASE_URL=postgresql+psycopg://courtload:courtload@localhost:5432/courtload \
  courtload rollback-publication <SNAPSHOT_ID>
```

---

## 3. Offline Evaluation & Replay Calibration

Offline evaluation is deterministic, thread-pinned, and leakage-safe:

```bash
# Rebuild M5 rolling baselines (last-10, EWMA-20) and empirical intervals
courtload evaluate \
  --config evaluation/config/baseline-v1.yaml \
  --dataset evaluation/manifests/accepted-archive-v1.json

# Evaluate frozen challenger and open S3 holdout
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
  courtload evaluate-final \
  --baseline-run 3cf4ae8eb331ac02d3b3 \
  --open-final-test
```

All evaluation runs write immutable artifacts with cryptographic checksums into `data/artifacts/evaluation/<run_id>/`.

---

## 4. Backup, Restore, and Disaster Recovery

### Create a Complete Backup Bundle
`scripts/backup.sh` bundles:
1. Complete PostgreSQL database dump (`database.sql.gz`)
2. Raw historical CSV files and retrieval manifest (`data/raw/`)
3. Evaluation manifests (`evaluation/manifests/`)
4. Model evaluation artifacts (`data/artifacts/evaluation/`)
5. Backup metadata manifest (`backup-manifest.json`) with snapshot pointer and checksums

```bash
./scripts/backup.sh
# Created ./data/backups/courtload-backup-<TIMESTAMP>.tar.gz
```

### Restore to a Target Database
`scripts/restore.sh` extracts the bundle, restores relations into PostgreSQL, restores artifact files, and runs automated end-to-end reconciliation:

```bash
./scripts/restore.sh ./data/backups/courtload-backup-<TIMESTAMP>.tar.gz
```

### Verification
`courtload verify-restore` validates:
- Published pointer points to an accepted dataset and ready snapshot
- Evaluation report, calibration, and replay artifacts match registered SHA-256 hashes
- Reconstructs a live two-player comparison (LeBron James vs. Stephen Curry) and verifies exact mathematical match

```bash
courtload verify-restore
```

---

## 5. Performance Benchmarking

Run the repeatable latency benchmark across all primary endpoints:
```bash
python scripts/benchmark_api.py
```
Outputs min, p50, p95, p99, max, mean, sample counts, and error counts. See `docs/evidence/performance.md` for target workstation results.

---

## 6. Operational Failure Triage

| Symptom | Root Cause | Remediation |
| :--- | :--- | :--- |
| HTTP 503 `no_published_data` | No active snapshot on `public` channel | Run `courtload publish-archive` or restore from backup |
| HTTP 410 `snapshot_retired` | Requested snapshot ID is no longer in `ready` state | Navigate without `snapshotId` parameter to resolve current pointer |
| HTTP 422 on replay date | Replay date outside supported regular seasons | Select a date within 2021-10-19 to 2024-04-14 |
| Port 3000 occupied | Another local service using port 3000 | Set `COURTLOAD_DASHBOARD_PORT=3100` in `.env` |
| Evaluation artifact missing | Volume mount missing in container | Mount `./data/artifacts/evaluation:/app/data/artifacts/evaluation:ro` |
| Advisory lock conflict | Concurrent publication or build in progress | Wait for active build to finish; advisory lock automatically releases on disconnect |
