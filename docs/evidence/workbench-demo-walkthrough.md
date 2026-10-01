# CourtLoad Research Workbench: Comprehensive Demo and Walkthrough

Status: **Milestone P9 verified demonstration guide**, 2026-10-01.  
This guide documents the end-to-end user journey across CourtLoad's local NBA research workbench, showcasing real-data evidence, temporal discipline, offline machine learning, tool-backed analytical assistance, and disaster recovery.

---

## 1. Overview and Core Philosophy

CourtLoad is an engineer's basketball research workbench built on rigorous data engineering and statistical discipline:

1. **Strict Temporal Discipline:** Every feature, profile summary, and comparison query operates strictly on historical data prior to the requested cutoff date ($game\_date < replay\_date$). Future observations cannot alter historical profiles.
2. **Zero Inferred Claims:** An absent box-score row (DNP, rest, or injury) is recorded as unobserved, never fabricated into zero points or an injury diagnosis. CourtLoad rejects synthetic composite "defensive impact" ratings and refuses to invent winner probabilities between overlapping empirical prediction distributions.
3. **Data Immutability & Audit Lineage:** Raw acquisitions, normalized versions, and serving releases are append-only and identified by SHA-256 content hashes. Every metric links directly back to its source parquet observation.
4. **Zero-Cost Local Architecture:** Operates 100% offline using local PostgreSQL 17, dbt, and scikit-learn without external paid APIs. The optional tool-backed assistant provides deterministic local fixtures when no API key is supplied.

---

## 2. Quickstart and Environment Verification

```bash
# 1. Environment setup and dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
npm --prefix dashboard install

# 2. Database startup & local migrations
docker compose up -d db
courtload migrate

# 3. Data bootstrap & warehouse build (104,533 player-games across 6 seasons)
courtload acquire-workbench
courtload bootstrap-workbench
dbt build --project-dir warehouse --profiles-dir warehouse --select tag:workbench

# 4. Prospective points forecasting evaluation & scoring
courtload evaluate-points
courtload issue-forecasts
courtload score-forecasts

# 5. Launch local application
courtload serve --port 8000 &
npm --prefix dashboard run dev -- -p 3000
```

Open `http://localhost:3000` in any modern desktop or mobile browser.

---

## 3. Interactive Walkthrough: Step-by-Step User Journey

### Step 1: Research Workbench Overview & Context Controls

- **Global Context Bar:** Located at the top of the interface, the context bar pins `release_id`, `season` (2019–20 through 2024–25, or 2025–26 prospective), `phase` (`regular_season`, `playoffs`), `beforeDate` (target replay cutoff), and `window` (`season`, `last_5`, `last_10`, `last_20`).
- **Data Freshness Badge:** Displays active release snapshot (`5bbb6035-6794-4bb0-b894-7208f52ef7ad`), total row counts (104,533 player games, 7,924 team games, 5,470 schedules), and distinguishes local ingestion timestamps from upstream source updates.
- **Quick Search Toolbar:** Instant debounced fuzzy search across 896 canonical NBA player identities with team tricode badges.
- **Ask CourtLoad Panel:** Prominently mounted on the homepage with suggested analytical prompt pills ("Raptors Defense", "Scottie Barnes Forecast", "Conference Winner?", "Compare Barnes & Barrett").

### Step 2: Player Explorer & Research Query Hub (`/players`)

- **Multi-Season Cohort Filtering:** Navigate to `/players`. Select season `2023-24`, minimum games `10`, and filter by position or team.
- **Canonical Metric Sorting:** Sort the cohort by any of the 35 standardized metrics (e.g., `pts`, `reb`, `ast`, `ts_pct`, `efg_pct`, `pie`).
  - *Example:* Sorting by `pts` shows Luka Dončić (33.9 PPG in 70 games) and Giannis Antetokounmpo (30.4 PPG in 73 games).
- **Single-Formula Integrity:** Traded players (e.g., Pascal Siakam, OG Anunoby) appear as unified season totals in the global explorer, avoiding double-counting or split rows.
- **One-Click Manifest Persistence:** Click **"Save Investigation"** to persist the current query parameters and deterministic result hash into the PostgreSQL `saved_investigations` table with an immutable UUID.

### Step 3: Player Profile & Multi-Stint Lineage (`/players/[id]`)

- **Pascal Siakam Mid-Season Stint Tracking (`/players/1627783?season=2023-24`):**
  - Traded on January 17, 2024 from the Toronto Raptors to the Indiana Pacers.
  - **Single-Season Summary:** 80 games played, 21.7 PPG, 7.1 RPG, 4.3 APG, 54.9% FG, 34.6% 3P.
  - **Stint Breakdown Table:**
    1. `TOR` (Toronto Raptors): 39 games, 22.2 PPG, 6.3 RPG, 4.9 APG, 52.2% FG.
    2. `IND` (Indiana Pacers): 41 games, 21.3 PPG, 7.8 RPG, 3.7 APG, 57.5% FG.
  - **Mathematical Verification:** $(39 \times 22.22 + 41 \times 21.27) / 80 = 21.73$ PPG. Exact arithmetic reconciliation without team identity cross-wiring.
- **Prior-Only Game Log with Cursor Pagination:**
  - Displays chronological game rows strictly preceding the target cutoff date.
  - Features cursor-based pagination (`cursor` token) bounding payload sizes and preventing offset degradation.
- **Upstream Source Lineage Modal:**
  - Click any individual game row (e.g., Siakam's game on 2024-01-25 vs. Philadelphia: 26 PTS, 13 REB, 10 AST).
  - Inspect the full provenance path: `SportsDataverse parquet raw observation` $\rightarrow$ `stg_player_box_scores` $\rightarrow$ `fct_player_game` $\rightarrow$ `mart_player_game_profile`.

### Step 4: Two-Player Head-to-Head Comparison (`/compare`)

- **Scottie Barnes vs. RJ Barrett (`/compare?playerA=1630567&playerB=1629628&season=2023-24`):**
  - Resolves both players under a single unified query context.
  - Displays side-by-side metric comparison across 8 statistical categories: Scoring, Efficiency, Playmaking, Rebounding, Defense, Minutes, Usage, and Net Impact.
  - **Empirical Deltas:**
    - Barnes: 19.9 PPG, 8.2 RPG, 6.1 APG, 1.3 STL, 1.5 BLK, 53.6% TS, 34.9 MPG.
    - Barrett: 20.2 PPG, 5.4 RPG, 3.3 APG, 0.5 STL, 0.4 BLK, 55.4% TS, 31.7 MPG.
  - **Anti-Hallucination Guardrail:** Explicit system callout: *"CourtLoad displays aligned metrics and empirical dispersion intervals. It does not compute a composite winner probability or declare a forced winner."*

### Step 5: Team Research & Opponent Context (`/teams`)

- **League Overview (`/teams?season=2023-24`):**
  - Overview table of all 30 NBA teams with standings, net ratings, offensive/defensive ratings, pace, and win percentages.
  - Boston Celtics lead the league with a +11.3 net rating (64–18 record).
- **Toronto Raptors Detail (`/teams/1610612761?season=2023-24`):**
  - Record: 25–57 (30.5% win rate), Offensive Rating: 111.8, Defensive Rating: 118.1, Pace: 99.8.
  - Full active roster with games played, points, rebounds, assists, and minutes averages.
  - Complete prior-only team schedule and game log with box-score outcomes.

### Step 6: Prospective Points Forecasting & DNP Conditionality (`/forecasts`)

- **Forecasting Ledger:**
  - Navigate to `/forecasts` to view 489 genuine prospective points forecast issuances under active policy `points-v1-prior_blend`.
  - Displays player, target game date, opponent, issuance timestamp, point estimate, and calibrated 80% empirical prediction interval.
- **Scottie Barnes Prospective Case (`/forecasts/1630567`):**
  - Issuance for 2025-10-23 vs. Cleveland Cavaliers.
  - Point estimate: 19.4 PTS; Calibrated 80% interval: [12.0, 26.8] PTS.
  - Observed actual score: 22 PTS (Absolute error: 2.6 PTS, well inside the empirical 80% interval).
- **DNP Conditionality Guarantee:**
  - Games where a player was inactive due to injury or rest are recorded as `points_scored = None` with flag `is_dnp = True`.
  - The system never scores a DNP as 0 points, preserving the integrity of scoring models and evaluation metrics.

### Step 7: Tool-Backed Assistant & Verified Citations (`/assistant`)

- **Interactive Query Execution:**
  1. *Inquiry:* "Who are the best defenders on the Raptors?"
     - *Dispatch:* Executes `get_team_summary(team_id="1610612761")` and `search_players(team_id="1610612761")`.
     - *Verified Evidence:* Barnes (79 STL, 75 BLK), Poeltl (84 BLK), Trent Jr. (77 STL).
     - *Honest Limitation Callout:* *"CourtLoad reports named box-score event totals (steals, blocks, rebounds). It does not provide an inferred composite 'best defender' rating."*
  2. *Inquiry:* "What is the forecast for Scottie Barnes?"
     - *Dispatch:* Executes `get_forecast(player_id="1630567")`.
     - *Verified Evidence:* Point estimate 19.4 PTS, interval [12.0, 26.8] PTS.
     - *Required Limitation:* *"Prospective points forecasts are strictly conditional on appearing in the target game. Absent box-score rows (DNP) are never scored as 0 PTS."*
  3. *Inquiry:* "Who will win the Eastern Conference?"
     - *Dispatch:* Identifies out-of-scope prediction.
     - *Domain Guardrail Response:* Returns typed `status="model_not_available"` with an explicit message that conference placement forecasting is deferred, presenting factual team standings (e.g., Boston Celtics 64–18, Toronto Raptors 25–57) as an alternative.
- **Verified Claim Badges:** Every quantitative claim is marked with a citation badge linking directly to the corresponding `EvidenceCellRef` in the underlying data ledger.
- **Explorer Deep-Linking:** Click **"Open in Workbench Explorer"** to transfer query filters into the interactive explorer view.

### Step 8: Saved Investigations Hub (`/analyses`)

- **Reproducible Research Hub:**
  - View all 30 pre-registered canonical research investigations.
  - Displays title, creation timestamp, query filters, and SHA-256 result checksum.
- **Deterministic Re-Execution:** Click **"Reproduce"** on any investigation to re-run the exact query against the current dataset and verify that the output hash matches the registered manifest.
- **Raw Export:** Download the full investigation specification and results as a structured JSON artifact.

### Step 9: Backup, Restore, and Disaster Recovery

- **Atomic Backup Creation:**
  ```bash
  ./scripts/backup.sh
  ```
  - Acquires `publication_lock(session)` to guarantee consistent database state.
  - Dumps PostgreSQL database to `database.sql.gz`.
  - Packages raw parquet inputs, evaluation configs, points-v1 artifacts, saved investigations, and forecast records into a compressed archive (`data/backups/courtload-backup-<timestamp>.tar.gz`).
  - Generates `bundle-checksums.sha256` and `MEDIA_POLICY.md` (player portraits treated as `rebuildable_cache_excluded`).
- **Disposable Fresh Database Restore:**
  ```bash
  ./scripts/restore.sh data/backups/courtload-backup-<timestamp>.tar.gz
  ```
  - Verifies bundle SHA-256 integrity.
  - Drops and restores PostgreSQL relations via Docker or local `psql`.
  - Restores all physical evaluation and analysis artifact files.
  - Executes `courtload verify-restore` against the newly populated database, verifying snapshot pointers, evaluation model cards, and executing live player profile queries for Scottie Barnes and Pascal Siakam.

---

## 4. Verification and Quality Gates Summary

| Verification Suite | Target | Status | Result |
| :--- | :--- | :---: | :--- |
| **Python Code Quality** | `ruff check .` | Passed | 0 errors |
| **Python Formatting** | `ruff format --check .` | Passed | 0 formatting discrepancies |
| **Static Type Safety** | `mypy src/courtload` | Passed | 0 type errors |
| **Python Integration Suite** | `pytest` | Passed | 141 tests passed (0 skipped, 0 failed) |
| **Dispensable DB Restore** | `test_disposable_fresh_database_restore` | Passed | 100% data and relation integrity |
| **Frontend Linting** | `npm --prefix dashboard run lint` | Passed | 0 warnings (`--max-warnings=0`) |
| **Frontend Type Safety** | `npm --prefix dashboard run typecheck` | Passed | 0 type errors |
| **Frontend Unit Tests** | `npm --prefix dashboard test` | Passed | 2 passed |
| **Browser E2E Tests** | `npm --prefix dashboard run test:browser` | Passed | 14 passed (desktop & 375px mobile) |
| **Warehouse dbt Models** | `dbt build --select tag:workbench` | Passed | 39 models & tests passed |
| **Sealed Evidence Checksums**| `sha256sum -c retained-evidence-checksums.sha256` | Passed | 26 of 26 files `OK` |
