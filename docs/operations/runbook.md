# Operations Runbook

Status: **Milestone P9 operations and reproduction guide**, 2026-10-01.  
Describes verified local and container operations for CourtLoad on both the local NBA research workbench (2019–20 through 2024–25 + 2025–26 prospective schedules) and legacy pinned historical archives.

---

## 1. Quick Start & Verification

### Prerequisites
- Docker with Compose v2
- Python 3.12+ (Python 3.14 recommended locally)
- Node.js 20+ (Node.js 24 recommended for dashboard development)

```bash
# Clone and setup environment
cp .env.example .env

# Start database and application services
docker compose up -d db

# Run database migrations
courtload migrate

# Verify health
curl --fail http://localhost:8000/api/health
curl --fail http://localhost:8000/api/workbench/status
```

By default:
- Dashboard: <http://localhost:3000> (or set `COURTLOAD_DASHBOARD_PORT=3100` if port 3000 is occupied)
- API: <http://localhost:8000>
- API Documentation: <http://localhost:8000/api/docs>

---

## 2. Workbench Data Lifecycle

The CourtLoad workbench operates on 6 complete NBA regular seasons (2019–20 through 2024–25) plus prospective 2025–26 schedules, totaling 104,533 player-game facts, 7,924 team-game facts, and 5,470 schedules.

### Step 1: Acquire Workbench Data
Acquires raw SportsDataverse parquet files and validates exact SHA-256 content hashes:
```bash
courtload acquire-workbench
```

### Step 2: Bootstrap & Normalize to PostgreSQL
Normalizes raw observation files into typed PostgreSQL staging and relational facts tables (`workbench_player_games`, `workbench_team_games`, `workbench_schedules`, `workbench_identities`):
```bash
courtload bootstrap-workbench
```

### Step 3: Warehouse dbt Build
Executes dbt transformations to build staging, intermediate, and serving marts:
```bash
dbt build --project-dir warehouse --profiles-dir warehouse --select tag:workbench
```

### Step 4: Evaluate Prospective Forecasting Policy
Evaluates candidate forecasting policies across 10 chronological splits:
```bash
courtload evaluate-points
```
Registers the active policy `points-v1-prior_blend` (MAE 4.88 vs. baseline MAE 5.09).

### Step 5: Issue and Score Prospective Forecasts
Issues genuine prospective points forecasts and scores them against observed outcomes with explicit DNP conditionality:
```bash
courtload issue-forecasts
courtload score-forecasts
```

### Rollback (if needed)
Atomically points the publication channel back to a retained ready snapshot without deleting rows:
```bash
courtload rollback-publication <SNAPSHOT_ID>
```

---

## 3. Daily Worker and Catch-Up Operations

The workbench includes background worker jobs for incremental data ingestion and score updates:

```bash
# Execute catch-up ingestion for newly available upstream game dates
courtload refresh-workbench

# Verify current data status and active release pointer
curl -s http://localhost:8000/api/workbench/status | jq .
```

---

## 4. Backup, Restore, and Disaster Recovery

### Create a Complete Backup Bundle under Mutation Lock
`scripts/backup.sh` (or `courtload backup-archive`) bundles:
1. Complete PostgreSQL database dump (`database.sql.gz`)
2. Raw historical parquet and CSV files (`data/raw/`)
3. Evaluation configurations and manifests (`evaluation/config/`, `evaluation/manifests/`)
4. Model evaluation artifacts and saved investigation results (`data/artifacts/evaluation/`, `data/artifacts/analyses/`)
5. Manifest-referenced metadata (`backup-manifest.json`) with table row counts and SHA-256 bundle checksums (`bundle-checksums.sha256`)
6. Media policy document (`MEDIA_POLICY.md`), recording player portrait cache as `rebuildable_cache_excluded`.

```bash
./scripts/backup.sh
# Acquires publication advisory lock and creates ./data/backups/courtload-backup-<TIMESTAMP>.tar.gz
```

### Restore to a Target Database
`scripts/restore.sh` (or `courtload restore-archive`) extracts the bundle, restores relations into PostgreSQL (via Docker or local `psql`), restores all asset directories, and runs automated end-to-end reconciliation:

```bash
./scripts/restore.sh ./data/backups/courtload-backup-<TIMESTAMP>.tar.gz
```

### Automated Verification
`courtload verify-restore` validates:
- Published pointer points to an accepted dataset and ready snapshot
- Evaluation report, calibration, and replay artifacts match registered SHA-256 hashes
- Executes live queries for Scottie Barnes (`1630567`) and Pascal Siakam (`1627783`), verifying multi-team stint counts and season averages
- Reconciles forecast issuance and score counts

```bash
courtload verify-restore
```

---

## 5. Performance Benchmarking

Run the repeatable latency benchmark across all 15 workbench endpoints:
```bash
.venv/bin/python scripts/benchmark_workbench.py
```
Outputs min, p50, p95, p99, max, mean, sample counts, and error counts. See [`docs/evidence/performance.md`](../evidence/performance.md) for target workstation results.

---

## 6. Operational Failure Triage

| Symptom | Root Cause | Remediation |
| :--- | :--- | :--- |
| HTTP 503 `no_published_data` | No active snapshot on `public` channel | Run `courtload bootstrap-workbench` or restore from backup |
| HTTP 410 `snapshot_retired` | Requested snapshot ID is no longer in `ready` state | Navigate without `snapshotId` parameter to resolve current pointer |
| HTTP 422 on replay date | Replay date outside supported range | Select a date within 2019-10-22 to 2025-04-13 |
| Port 3000 occupied | Another local service using port 3000 | Set `COURTLOAD_DASHBOARD_PORT=3100` in `.env` |
| Evaluation artifact missing | Volume mount missing in container | Mount `./data/artifacts/evaluation:/app/data/artifacts/evaluation:ro` |
| Advisory lock conflict | Concurrent publication or backup in progress | Wait for active job to finish; advisory lock automatically releases on disconnect |
| Assistant returns `status="disabled"` | `COURTLOAD_GEMINI_API_KEY` is not set | Normal zero-cost behavior; core workbench analytics operate 100% offline. Set `COURTLOAD_GEMINI_API_KEY` for live LLM queries |
| Assistant returns `model_not_available` | Query requested out-of-scope prediction (e.g. conference winner) | Normal domain guardrail behavior; conference placement forecasting is deferred |
| DNP player shows no forecast score | Player did not play in target game (rest / injury) | Expected behavior; absent box scores are never scored as 0 points |
