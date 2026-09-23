# CourtLoad implementation progress

Starting commit: `dd7cfb1207e26b1a6cd6e0df1d163d895c874242` (2026-09-20).

## M0 — baseline and preservation

The working tree was already dirty before implementation. Modified paths: `.env.example`, `README.md`, `dashboard/app/layout.tsx`, `dashboard/app/page.tsx`, `dashboard/app/players/page.tsx`, `dashboard/next-env.d.ts`, `docs/decisions/0001-planner-before-ml.md`, `docs/evidence/README.md`, `docs/evidence/fixture-verification.md`, `docs/source-contract.md`, `pyproject.toml`, `src/courtload/cli.py`, `src/courtload/config.py`, `src/courtload/services/planner.py`, `tests/integration/test_planner.py`, `tests/unit/test_config.py`. Untracked paths: `TODO.md`, `docs/course-correction.md`, `docs/decisions/0003-zero-cost-historical-baseline.md`, `docs/design/`, `docs/evidence/model-evaluation.md`, `docs/evidence/real-player-analytics.md`, `docs/implementation-plan.md`, `docs/portfolio-scope.md`, `docs/product-alignment.md`, `docs/research/`, `scripts/dev-live-backend.sh`, `scripts/dev-live-frontend.sh`, `tests/unit/test_cli.py`. These are preserved as pre-existing work.

Baseline checks: Ruff lint and format, mypy, pytest (40 passed, one Starlette deprecation warning), dashboard lint, typecheck, Vitest (2 passed), production build, and `docker compose config --quiet` passed. These are genuine local results, not historical README counts. PostgreSQL/dbt and container smoke were not run at M0; they require a database/container runtime and remain gates for later milestones.

Migration decision: add archive-specific immutable dataset, observation, identity and fact tables in a new Alembic revision. Preserve existing integer keys and foreign keys. Audit existing fixture/provider identities before any mapping backfill. Keep the historical dataset in a separately configured database until that audit is complete. No destructive migration is authorized.

The existing API and planner read mutable legacy tables. The archive path will be separate, then `/api/analytics` will read published snapshots. The legacy provider parser currently turns null counts into zero and invents midnight UTC for date-only games; archive normalization must avoid both behaviors.

## M1 — free source validation

**Complete with a documented coverage limitation.** See the [real-data source spike](evidence/historical-source-spike.md). Added `src/courtload/ingestion/archive.py` for pinned, bounded, atomic acquisition; `scripts/historical_source_spike.py` for streaming normalization and full selected-season validation; and `tests/unit/test_archive_spike.py` for partial acquisition, null/zero/DNP parsing, malformed minutes and conflicting-row quarantine. The four real CSV files remain ignored local artifacts.

The candidate supplies all 1,230 team games and 82 games per team in each of 2021-22, 2022-23 and 2023-24, matching independent NBA schedule counts. All 7,380 raw team-point totals reconcile to raw player points. Strict minute parsing quarantines 184 `:60` player rows and 179 affected games; 3,511 admitted games reconcile on both sides. The resulting 95.1% complete player-game coverage is sufficient for the core historical comparison and experiment with visible exclusions. It does not establish pregame source history, full upstream provenance, or redistribution rights.

Verification: two full parses produced byte-identical normalized reports. `ruff check .`, `ruff format --check .`, `mypy src/courtload`, and `pytest -q` passed after M1 changes (43 tests; one pre-existing Starlette deprecation warning). The fixture tests are not counted as real-data reconciliation. PostgreSQL import idempotency, immutable observations, and publication are **not yet tested**; they are M2/M3 work. No database rows were imported and no public page was changed in M1.

## M2 — immutable archive datasets and safe migration

**Complete.** Added Alembic revision `8ffd4c5912e2`, additive archive models, shared
normalization, and `courtload import-archive`. The archive has its own namespaced string
identities and does not reuse the legacy integer dimension keys. Immutable artifacts,
content versions, observations, datasets, membership, normalized player/team facts, and
quarantine locators are linked by foreign keys. Facts retain the source game date with
`date_only` precision and a null tipoff, original and normalized minutes, nullable count
values, three-point attempts, parser/content hashes, source file and row. Import acceptance
and facts commit together; a failed attempt is retained with a sanitized error.

The accepted real dataset ID in the disposable M2 PostgreSQL run was
`4556b91f-f1de-4b86-ac1e-1fe20d0a9da8`. Its content hash is
`be2dae2706f9c90d37fef4c70e523e5925c247a2f091d6b885a65255d0b92c4a`; its observation
manifest hash is `8e9528b5a8fb153934e6b4c7b4ed6034e60ed8bd329b5c9294d422670272e2ee`.
It contains 3,511 games, 7,022 team-game facts, 90,609 player-game facts, and 97,631
dataset members. The quarantine contains the 184 malformed source rows with their exact
artifact/row locators plus 4,813 otherwise parseable rows from the 179 games excluded as
atomic units. Counts by season, team, reason, and resource are stored in the dataset/import
manifest. Raw artifacts carry the retrieval timestamp and pinned source URL. Team facts retain
the full nullable count set, including three-point attempts; the verified source serialization
of integer-valued team counts sometimes uses an exact `.0`, such as `TOV=16.0`.

PostgreSQL evidence: a fresh database migrated from empty to head. A separate database
migrated to `0001`, loaded the existing fixture pages, then migrated to head; sampled player
and game keys remained `(9101, 8001)` before and after. Two complete real imports produced
different import attempts and 204,888 observations but reused one dataset ID and one set of
facts. A truncated-file attempt remained `failed`; dataset and player-fact counts stayed
unchanged at 1 and 90,609. Fixture A→B→A tests retain all observations and both canonical
versions, and the final A reuses the original immutable dataset. A separate fixture verifies
that an accepted dataset retains a malformed row's file and line locator.

Legacy identity audit: `dim_players`, `dim_teams`, and `fct_games` contain bare numeric IDs;
the fixture loader and BALLDONTLIE loader can both write those relations, so rows cannot be
classified reliably from the numeric ID alone. M2 therefore performs no guessed legacy
identity backfill. The migration preserves every legacy table and key, while all archive
identities carry the pinned GitHub revision namespace.

Verification: `ruff check .`, `ruff format --check .`, `mypy src/courtload`, and `pytest -q`
passed (45 tests; one pre-existing Starlette deprecation warning). Dashboard lint, typecheck,
Vitest (2 tests), production build, `docker compose config --quiet`, and `alembic check` passed.
Fresh and legacy-seeded PostgreSQL migration checks, two full archive imports, failed-import
isolation, row-count and lineage queries passed against PostgreSQL 17. These PostgreSQL checks
used disposable local databases and are recorded here rather than added to the SQLite routine
suite. The extended source normalization was parsed twice with byte-identical reports; its
updated hashes are in the source-spike evidence.

## M3 — dataset-bound warehouse and atomic publication

**Complete.** Added Alembic revision `4b19f0a2c7de`, publication/build models,
archive-tagged dbt facts and marts, and `courtload publish-archive` plus
`courtload rollback-publication`. Every dbt build receives an explicit immutable dataset ID and
uses build-specific schemas. Candidate validation reconciles source/fact counts, two-sided games,
dataset identity, profile/context grain, prior-day history and sparse opponent context before any
serving row is installed. The reference-points formula is serialized and hashed independently of
the legacy fantasy formula.

One dedicated PostgreSQL connection now owns the session advisory lock for the whole dbt,
validation and publication lifecycle. This detail is required: an earlier implementation held the
lock through the work session, but a commit returned that connection to the pool and allowed a
second session to re-enter the lock on the same physical connection. The PostgreSQL concurrency
test caught the defect. Serving player games, dated profiles and opponent contexts are append-only
by snapshot ID, and copied player games retain foreign keys to source versions and observations.
Snapshot creation, serving-row installation, ready state and the channel-pointer swap share one
short transaction; rollback only moves the pointer to another retained ready snapshot. Repeating
publication for the same dataset and code/metric/feature/scoring identities reuses the ready
snapshot without invoking dbt or duplicating serving rows.

The disposable real-data build used dataset
`2e99f37c-231a-4748-9f48-5b9ffa99f228`, which has the same M2 content and observation-manifest
hashes. dbt produced 90,609 player/game facts, 7,022 team/game facts, 220,942 dated player
profiles across 485 replay dates, and 14,447 dated opponent contexts. All 25 selected archive
models/tests passed. The initial full build took 162.68 seconds, almost entirely in the profile
mart; this is a measured baseline for later incremental optimization, not an API latency claim.
Snapshot `4ea4a228-b8bc-4a4c-b4c1-93e809a8a32d` was published with coverage
2021-10-19 through 2024-04-14 and an algorithmic midpoint default replay date of 2023-01-09.

PostgreSQL failure tests rejected a simultaneous builder, retained the prior pointer after a model
failure, rolled back all snapshot/serving inserts after a simulated crash immediately before the
pointer commit, published a second complete snapshot, and atomically rolled back to the retained
first snapshot. Repeating publication and rollback to the active snapshot were idempotent. The
routine suite now contains optional tests gated by `COURTLOAD_TEST_POSTGRES_URL`; both passed
against PostgreSQL 17.

Independent real-player reconciliation used LeBron James (`2544`) at the 2023-01-09 replay
cutoff. A separate Python calculation over normalized source rows exactly matched the mart's
last-5, last-10 and 30-game season values within JSON numeric serialization tolerance, including
summed shooting denominators and reference points per minute. Exact values and the ten source
game IDs are recorded in [real-player analytics](evidence/real-player-analytics.md). The latest
history row was 2023-01-07; no same-date outcome entered the profile.

Verification: Ruff lint and formatting, strict mypy, 49 routine tests (plus two expected
PostgreSQL skips), both PostgreSQL publication tests, Alembic upgrade/check, the 25-test real dbt
build, real candidate installation, crash rollback, pointer rollback, and Docker Compose
validation passed. Dashboard lint, typecheck, two Vitest tests and the production build also
passed. The pre-existing Starlette deprecation warning remains. The API still reads legacy
relations; exposing the pinned serving snapshot begins in M4.

## M4 — first useful historical player page

**Complete.** Added typed `/api/analytics` catalog, dataset-scoped player search, dated player
profile, cursor-bound prior game log and source-lineage endpoints. Every request resolves an
omitted publication pointer once and returns the immutable snapshot ID; supplied snapshot IDs and
replay dates remain pinned in shareable URLs. Unsupported dates return `422` with nearby supported
dates, missing snapshots/players return `404`, unavailable retained snapshots return `410`, and
an empty publication returns `503 no_published_data`. Legacy planner/player endpoints remain
unchanged.

The public player explorer now searches the published archive by season and links to
`/players/[id]?date=…&snapshotId=…`. The server-rendered detail page presents last-5, last-10 and
season-to-date production/minutes/sample counts, weighted shooting, per-minute output, three
small prior-game trend charts, reconstructed next matchup/rest/opponent allowances, an explicit
“Evaluation pending” estimate state, a scroll-contained game log and source traces. Historical
mode, replay date, coverage assumptions and the last-observed-team limitation remain visible.
Primary navigation now reflects Players, Compare and Evaluation; the latter two routes are honest
staged placeholders until M5–M7 rather than dead links. The profile mart gained authoritative
minutes-per-game aggregates so React does not duplicate basketball window formulas.

The amended archive models were rebuilt against the accepted real dataset. All 25 selected dbt
models/tests passed; the profile mart again produced 220,942 rows and the opponent mart 14,447.
Snapshot `5b14b7ed-353b-499d-a37a-6887b5f6c715` was atomically published with the same immutable
dataset and default replay date. Real API reconciliation for LeBron James (`2544`) at
`2023-01-09` returned last-five reference output `51.34`, minutes `34.96`, reconstructed LAL at
DEN, ten opponent-context games and ten prior log rows. Desktop and 375 px captures are linked in
[real-player analytics](evidence/real-player-analytics.md).

Verification: Ruff lint/format, strict mypy, 53 routine Python tests, two PostgreSQL publication
tests, frontend lint/typecheck, two Vitest tests, two Playwright browser tests and a production
build passed. Browser tests cover search, snapshot-pinned navigation, date change, empty history
and unsupported-date recovery. The mobile page has no document-level horizontal scrolling; the
wide game log retains its own keyboard-focusable scroller. The temporary real-data verification
servers and database are stopped after capture.

## M5 — frozen experiment and evaluated baselines

**Complete.** Added the strict `baseline-v1` config and accepted-archive manifest, plus
`courtload evaluate`. The offline runner binds the published snapshot, queries only S1/S2 through
the calibration boundary, exports separate point-in-time features and labels, applies target-date
blocks and cutoff purging, produces last-10/EWMA/fallback predictions, counts unavailable and
unscored cases, reports prescribed slices, calibrates empirical intervals, and writes immutable
hashed artifacts. S3 is excluded at the query boundary and recorded as unopened.

Real run `3cf4ae8eb331ac02d3b3` used 25,615 identical scored V1/V2 rows. EWMA-20 with half-life
five won both folds and pooled validation: MAE 7.7095 versus 7.8264 for last-10. Its paired
seven-day moving-block interval versus last-10 was `[-0.1446, -0.0885]`. Calibration has 14,920
rows on 51 dates; both registered baselines satisfy the availability minimum. Candidate
regeneration found zero mart mismatches. Full accounting and limitations are in
[baseline evaluation](evidence/baseline-evaluation.md).

An immediate complete rerun reproduced the run ID and membership, feature-set, prediction, label
and evaluation hashes, then reused byte-identical artifacts. New tests cover baseline
weights/minimum history, same-day
future mutation, legitimate prior-history mutation, season-scoped input, split purging, DST
cutoffs and immutable writes. Final verification passed Ruff/formatting, strict mypy, 57 routine
Python tests, both PostgreSQL publication tests, frontend lint/typecheck, two Vitest and two
Playwright tests, the Next.js production build, dependency checks and Compose validation.

## M6 — challenger, final test and no-promotion decision

Completed 2026-09-21: the frozen player-only/context grid selected context by pooled
validation, registered the choice before S3, and then opened S3 once. Context MAE was 7.9604
versus EWMA's 7.8187 on 39,988 identical core rows. Three of four frozen gates failed, so no
challenger was promoted; see the [M6 model card](evidence/model-evaluation.md). An immediate
rerun reused the completed immutable artifacts without querying S3 again.

## M7 — comparison, replay estimates and evaluation views

**Complete.** Added a snapshot-bound `/api/analytics/compare` response that resolves the mutable
publication pointer once, rejects identical players, and assembles both profiles with one replay
date, metric and estimator policy. The responsive comparison keeps both values adjacent, supports
URL-pinned player/date/snapshot state and swapping, and presents last-5/10/season production,
minutes, reconstructed targets, rest, opponent coverage, EWMA estimates, empirical intervals and
the arithmetic estimate gap without a winner probability.

Historical estimates read the immutable M6 replay and calibration artifacts only after verifying
their registered hashes. Core estimates are available for S3 cutoffs with ten valid prior
same-season appearances; five-to-nine histories receive the specified limited-history mean, and
other cutoffs return explicit unavailable reasons. Player pages now use the same estimate payload.

The evaluation API binds the accepted dataset and scoring hashes to run
`6f7af9e63f27aada910d`, verifies the registered report hash, and exposes validation/final metrics,
promotion gates, limitations, publication/build status and relation counts. Evaluation and
methodology pages explain the no-promotion result, conditional target, historical reconstruction,
data health and S3 no-candidate coverage gap. See
[M7 comparison and evaluation evidence](evidence/comparison-evaluation.md).

Real verification compared LeBron James and Stephen Curry at 2023-11-15 on snapshot
`5b14b7ed-353b-499d-a37a-6887b5f6c715`; their targets fell on different dates and both registered
EWMA intervals rendered. Verification passed Ruff/formatting, strict mypy, 63 routine Python
tests, two PostgreSQL tests, frontend lint/typecheck, two Vitest and six Playwright tests, the
production build, dependency checks and Compose validation. Keyboard-only selection and a 375 px
viewport with no document-level overflow were checked; desktop/mobile captures are linked from
the evidence note.

## M8 — reproducibility, failure recovery, and evidence

**Complete.** Added reproducible commands for pinned archive acquisition (`courtload acquire-archive`),
full backup bundle generation (`scripts/backup.sh`), database and artifact restoration
(`scripts/restore.sh`), automated restored-state verification (`courtload verify-restore`),
locked Python experiment dependencies (`requirements-lock.txt`), repeatable API latency benchmarking
(`scripts/benchmark_api.py`), two real-player historical case studies, and a short video
demonstration recording.

Implemented details:
- **CLI and Tooling:**
  - Added `courtload acquire-archive` with local copy and remote download support, size bounds, and
    SHA-256 verification.
  - Pinned all 85 Python experiment and warehouse dependencies in `requirements-lock.txt`, allowing
    exact reproducible offline installation.
  - Implemented `courtload backup-manifest` and `courtload verify-restore` in
    `src/courtload/services/backup_restore.py`, checking database pointer state, dataset hashes,
    evaluation artifact hashes, and reconciling a live two-player comparison (LeBron James vs.
    Stephen Curry).
  - Implemented `scripts/backup.sh` bundling the PostgreSQL database dump, raw CSV archives,
    evaluation manifests, model artifacts, and published pointer manifest into a compressed bundle
    (320 MB).
  - Implemented `scripts/restore.sh` cleanly restoring relations into PostgreSQL, extracting
    artifacts, and running automated verification.
- **Contract Tests:**
  - Added `tests/integration/test_restore_postgres.py` verifying backup manifest creation, restore
    validation against PostgreSQL, and failure on tampered artifacts.
- **Real-Player Historical Case Studies (`docs/evidence/case-studies.md`):**
  - Case Study 1 (Role/form change): Thomas Bryant (`1628418`) at the 2023-01-09 cutoff, documenting
    his surge from 21.30 MPG / 24.17 reference points to 29.48 MPG / 38.04 reference points following
    Anthony Davis's injury, while noting the limitation that CourtLoad lacks an injury report feed.
  - Case Study 2 (Comparison under uncertainty): Chris Paul (`101108`) vs. Scottie Barnes (`1630567`)
    at the 2023-01-09 cutoff. Both share identical season baselines (33.77 vs. 33.79 points/game),
    but Barnes holds superior 5-game form (37.98 vs. 31.50) and a more generous defensive matchup
    (Charlotte allowing 120.1 PPG vs. Denver allowing 110.5 PPG). Contextualizes how empirical
    dispersion ($\sigma \approx 12\text{--}13$) dwarfs small form gaps, refuting artificial winner
    claims.
- **Performance Benchmarks (`docs/evidence/performance.md`):**
  - Documented full hardware description (AMD Ryzen 7 9700X, 64 GB DDR5, NVMe, PostgreSQL 17.11).
  - Pipeline timings: archive acquisition (0.8s), archive import (12.5s for 90,609 player facts),
    dbt warehouse build (162.7s), M5 baseline evaluation (21.4s), M6 challenger evaluation (48.2s),
    full backup (26.3s), full restore (21.8s).
  - Storage footprint: 73.9 MB raw files, 243 MB database, 429 MB evaluation artifacts, 320 MB total
    backup bundle.
  - API latency benchmarks across 8 endpoints (100 samples each, concurrency $C = 5$): health check
    (8.34 ms p50), catalog (52.63 ms p50), player search (63.11 ms p50), player profile (50.35 ms
    p50), two-player comparison (79.66 ms p50, 97.95 ms p95), evaluation report (43.00 ms p50), with
    0.0% error rate across 800 benchmarked requests.
- **Interactive Video Demonstration (`docs/assets/demo.webm`):**
  - Captured a 25.7-second screen recording in 1280x720 25fps VP8 WebM using Playwright against live
    local services, illustrating Search $\rightarrow$ Profile Context $\rightarrow$ Two-Player
    Comparison $\rightarrow$ Evaluation & Methodology.
- **Documentation & Runbook Realignment:**
  - Completely rewrote `README.md` and `docs/operations/runbook.md` around the implemented, verified
    system.
  - Indexed all evidence files in `docs/evidence/README.md`.
  - Created root `AGENTS.md` and checked off `TODO.md`.

Verification passed:
- Ruff lint and formatting
- Strict mypy (48 source files)
- 68 Python tests (including 4 PostgreSQL tests against PostgreSQL 17)
- Frontend lint and typecheck
- 2 Vitest unit tests
- 6 Playwright browser tests
- Full backup and restore execution with automated verification

