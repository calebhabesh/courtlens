# CourtLoad Databallr Replica & Analytics Platform: Comprehensive Release Demo Walkthrough (B37)

Status: **Block B37 Release Walkthrough and Demonstration Guide Complete**, 2026-10-04.  
Authoritative demonstration guide covering all 46 system capabilities, core workflows, advanced analytical surfaces, finance, live monitoring, conversational research, and disaster recovery.

---

## 1. Overview and Core Invariants

CourtLoad is an advanced NBA analytics platform emphasizing backend data engineering rigor, temporal discipline, reproducible offline machine learning, and domain guardrails under uncertainty:

1. **Temporal Discipline:** Every query strictly excludes observations on or after the target replay date ($game\_date < replay\_date$). Modifying future games never alters historical profile hashes.
2. **Zero Inferred Claims:** Missing box scores are recorded as unobserved, never fabricated into zero points or an assumed injury. Overlapping prediction intervals represent empirical calibrated dispersion, not subjective win probabilities.
3. **Data Immutability & Audit Lineage:** Raw acquisitions, normalized versions, and serving releases are append-only and identified by cryptographic content hashes (SHA-256).
4. **Offline Capability & Server-Owned Evidence:** All core analytics, forecasting, salary replay, and saved investigations operate 100% locally with zero external API dependencies. AI conversational research is constrained to structured planning, and every numerical claim is verified against server-owned database cells.

---

## 2. Quickstart and Environment Verification

```bash
# 1. Environment and dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
npm --prefix dashboard install

# 2. Database startup & migrations
docker compose up -d db
courtload migrate

# 3. Data acquisition, import, and dbt warehouse build
courtload acquire-workbench
courtload bootstrap-workbench
dbt build --project-dir warehouse --profiles-dir warehouse --select tag:workbench

# 4. Prospective points forecasting evaluation & scoring
courtload evaluate-points
courtload issue-forecasts
courtload score-forecasts

# 5. Start services
courtload serve --port 8000 &
npm --prefix dashboard run start -- -p 3100 &
```

The system is now live at:
- **API Swagger / OpenAPI:** `http://localhost:8000/api/docs`
- **Dashboard Web UI:** `http://localhost:3100`

---

## 3. End-to-End Walkthrough of Flagship Workflows

### Workflow 1: Multi-Metric Player Research & Canonical QuerySpec (`/players` or `/stats`)

1. **Desktop-Density Metric Grid:**
   - Navigate to `/players`.
   - The table renders canonical per-game, shooting, and rate statistics across 35 standard definitions (PTS, REB, AST, STL, BLK, FG%, 3P%, FT%, eFG%, TS%, USG%, etc.).
2. **Dynamic Filtering and Sorting:**
   - Filter by season (`2023-24`), minimum games (`min_games >= 20`), and position.
   - Sort descending by points per game.
   - Notice the canonical QuerySpec URL serialization in the browser navigation bar (`?season=2023-24&minGames=20&sort=pts_per_game:desc`), allowing instantaneous bookmarking and exact team sharing.
3. **Paging and Cursor Navigation:**
   - Pagination operates with limit clamping (1–100) and cursor tokens (`next_cursor`), ensuring deep pagination without skipping rows.

### Workflow 2: Player Profile, Game Log & Stint Tracking (`/players/[id]`)

1. **Player Deep Dive:**
   - Open Scottie Barnes (`/players/1630567?season=2023-24`).
   - The header displays biographical information, position, physical draft measurements (6'7" height, 7'2" wingspan), and headshot loaded from the local rebuildable cache.
2. **Window Slicing:**
   - Switch between **Season Total**, **Last 5 Games**, **Last 10 Games**, and **Last 20 Games**.
   - Notice how rolling means update deterministically with strict sample counts ($n$).
3. **Multi-Team Trade Stint Separation (Siakam Case Study):**
   - Open Pascal Siakam (`/players/1627783?season=2023-24`).
   - Observe the distinct stint tables: Stint 1 (Toronto Raptors: 39 games, 22.23 PPG) and Stint 2 (Indiana Pacers: 41 games, 21.27 PPG), reconciling arithmetically to the season total of 80 games and 21.74 PPG without cross-wiring.

### Workflow 3: Side-by-Side Player Comparison (`/compare`)

1. **Two-Player Comparison:**
   - Navigate to `/compare?playerA=1630567&playerB=1629628&season=2023-24` (Scottie Barnes vs. RJ Barrett).
   - The interface renders side-by-side radar and statistical comparisons.
2. **Context-Matched Deltas:**
   - Statistical differences are displayed alongside sample sizes and minutes played.
   - Unpaired or unobserved metrics remain blank or labeled, preventing false zero differences.

### Workflow 4: Advanced Research Surfaces (Distributions, Splits, WOWY, & Shots)

1. **Contextual Distributions & Quantiles (`/research/distributions`):**
   - Inspect Type-7 quantiles (P10, P25, P50, P75, P90) across scoring and usage distributions.
   - Sample threshold gating ($n \ge 5$) prevents skew from tiny sample outliers.
2. **Workload Trends (`/research/trends`):**
   - Track usage rate vs. true shooting percentage shifts across rolling 10-game windows.
3. **Shared Floor WOWY Stints (`/wowy`):**
   - Query lineup combinations (e.g. Scottie Barnes On vs. Off).
   - When play-by-play lineup stint data is unadmitted or source-blocked, CourtLoad displays explicit source-blocked disclosures rather than fabricating synthetic impact ratings.
4. **Shooting Profiles (`/research/adjusted-shooting`):**
   - Inspect shot location distribution across the 8 standard spatial zones (Restricted Area, Paint Non-RA, Mid-Range, Left Corner 3, Right Corner 3, Above Break 3, Backcourt, Unknown).

### Workflow 5: Immutable Financial Books & Salary Cap Sheets (`/contracts`)

1. **Admitted Contract Books:**
   - Navigate to `/contracts`.
   - The view binds to immutable financial books (`FinanceBook`), presenting verified contracts with exact-cents integer arithmetic.
2. **Temporal Replay:**
   - Select book `96b89635-82b4-47c7-b4f6-52ab85c0f0bc` and observe the Brandon Ingram extension announcement.
   - Querying effective date `2025-02-12` renders the signed contract; querying prior to effective date (`2024-10-01`) excludes it, demonstrating temporal replay.
   - Unstated dollar amounts remain strictly `null` (missing) rather than guessed.

### Workflow 6: Shared Live Monitoring Service (`/live`)

1. **Shared Polling & Lease Coalescing:**
   - Open `/live`. The frontend acquires a bounded view lease (`/api/workbench/live/lease`).
   - Multiple browser tabs coalesce into a single background poller, preventing upstream rate-limit exhaustion.
2. **Missingness & Finality:**
   - Games in progress display live period, clock, and scores.
   - Post-game states transition to finality without altering analytical historical releases.

### Workflow 7: Conversational Analytical Assistant (`/research/ask`)

1. **Structured Planning vs. Execution:**
   - Ask: *"Compare Scottie Barnes and RJ Barrett in 2023-24"*.
   - The assistant produces a validated `AnalysisPlan` with `status="execute"` and operation `compare`.
   - The backend executes the operation against PostgreSQL and binds every table cell to an exact `EvidenceCell`.
2. **Domain Guardrails in Action:**
   - Ask: *"Who is the best defender on the Raptors?"*
   - The assistant refuses to declare an inferred composite rating, presenting factual box event counts (steals, blocks, rebounds) with an explicit disclosure notice.
   - Ask: *"Will Toronto win the championship?"*
   - Returns typed `model_not_available`, declining speculative playoff forecasting.
3. **Deterministic Saved Investigation Reproduction:**
   - Click **Save Investigation**.
   - Navigate to `/investigations/saved`.
   - Click **Reproduce**: the backend re-executes the saved analysis with **0 provider calls** and verifies cryptographic hash equality (`match: true`).

---

## 4. Disaster Recovery & Backup Verification

CourtLoad features an automated, zero-downtime backup and restore verification pipeline:

```bash
# 1. Create complete coordinated backup bundle
./scripts/backup.sh
# Produced: data/backups/courtload-backup-20261004T...tar.gz (747.92 MB)

# 2. Run full-cycle disposable database restore test
COURTLOAD_TEST_POSTGRES_URL="postgresql+psycopg://courtload:courtload@localhost:5432/courtload" \
  .venv/bin/pytest tests/integration/test_restore_postgres.py
```

**Verification Results:**
- 5 integration tests pass in 157.50s.
- Dumps database to `.sql.gz`, copies all evaluation configs and artifacts.
- Spawns fresh disposable PostgreSQL database, restores schema and data.
- Reproduces all 33 saved conversation analyses with byte-for-byte exact equality.
- Automatically cleans up disposable database.
