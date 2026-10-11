# PC06 — Dated finance acquisition, books, thresholds and roster coverage

State: **verification_blocked**. All 30 Basketball-Reference team pages were captured;
three verified canonical players have admitted salaries. Spotrac and broad identity mapping
remain unresolved. PC05's injury/transaction limits persist. PC07/PC08 have not started.

## Real observations

[Source checks](source-checks.json), [source measurements](source-measurements.json),
[admission](admission.json), [integrity verification](integrity.json),
[threshold input](threshold-input.json), [threshold admission](threshold-admission.json).

The identifying policy-v2 user agent obtained HTTP 200 for all 30 BRef contract pages, with
robots permission and at least three seconds between request starts. The captures contain
**618 team/player entries, representing 608 distinct provider IDs**, and 4,692 parsed reports.
They occupy 4,731,016 raw bytes in the ignored content-addressed server store. Team page URLs
map BRef's BRK/CHO/PHO codes to canonical BKN/CHA/PHX. No raw dump is served or committed.

The canonical registry has four verified BRef crosswalks; three occur in these pages. Admission
`ac1db552-60a9-43bd-a70a-177b280457ba` pins PC05 index
`027dff96-a2fd-4d54-9833-f76e2bc0248f` and book
`f2603bd7-5890-47c5-afcb-ed6cdc58e90f`. The book selects **22 observations** (21 amounts and
one option) for Pascal Siakam, Bam Adebayo and Scottie Barnes. Remaining source rows are
unresolved (4,670); names never resolve identity. The book verifies 4,731,858 retained source
and mapping-note bytes. Each future run requires new acquisitions and creates a new immutable
book; re-admitting these explicit IDs reuses the same refresh.

Coverage includes every one of the pinned index's **622 active players across 30 teams**:
three reported 2026–27 salaries and **619 explicit unknown reasons**. It does not claim the
index is a universally complete official roster. Source-listed team must match current roster
association; prior-season appearances never supply it. No unknown salary becomes $0. Reported
salary, option state, effective date and guarantee schedule remain separate.

The five hand-entered markers match the
[official 2026–27 NBA release](https://www.nba.com/news/nba-salary-cap-2026-27-season).
Threshold `bac24901-a5ba-45c3-9bd4-b99b803a9910` has content hash
`60d1d4ef37531ec047e24d8da8e60cfc9ec54f5f3cfba7b61e771e532be2bd43` and actual import time
`2026-10-11T23:17:40.309275Z`; no June known-at date was invented. Amounts are exact cents
strings. These are chart markers only, with no tax/room/compliance calculation.

Spotrac's robots.txt returned **403**. Its cap page was not requested; the same run stopped
the host and did not request the FA tracker either. The receipts distinguish denial from
the subsequent stopped-host observation. No browser/proxy/UA retry or access bypass occurred.
Spotrac cap/FA adapters are checked with explicitly fictional fixtures; no real Spotrac
ingestion or current free-agent classification is claimed.

## API and immutability evidence

[Refresh detail](refresh-detail.json), [catalog](refresh-catalog.json),
[threshold API](thresholds.json), [book detail](book-detail.json),
[preserved finance-query-v1](legacy-query.json), [API measurements](api-measurements.json),
[read-only check](read-only-check.json), [SQL sealing](sql-sealing.json).

Latest single local network timings: detail 5.0 ms / 182,434 bytes; catalog 3.5 ms;
thresholds 2.6 ms; book detail 3.5 ms. These are individual requests, not p95 measurements.
All **161** [before](pointers-before.json) / [after](pointers-after.json) publication pointers
match. Source/finance ingestion counts also match across GETs and the read-only POST operation.
Mutation attempts reject and are rolled back.

Source contract effective/announced dates are not supplied by these salary tables, so they
remain null. The preserved finance-query-v1 shows the retained timeline but excludes undated
salary from its known subtotal; official threshold markers do not ungate exact cap accounting.
The new read model labels salaries as dated source reports. PC08 must preserve that distinction.

Migration `12b810a4f010` adds only the three independent finance-context tables. PostgreSQL
seals data, post-admission memberships, bound raw provenance and robots evidence, and rejects
cross-wired seasons/source kinds. A robots-provenance regression exposed an artifact-field
reference on acquisition rows; the final table-specific branch fixes it. Its final SQL is
retained in [provenance-function.sql](verification/provenance-function.sql), and fresh migration
upgrade/downgrade checks verify it. The interrupted intermediate full run is retained separately;
it is not passing evidence. Existing PC05 acquisition/retention code now shares the same bounded
fetcher, with original null, injury, transaction and compressed-transport regressions preserved.

## Checks and reproduction

The final focused set passed **67 checks**, including disposable PostgreSQL sealing, SQL
truncate/extension rejection, source scope, frozen crosswalks, temporal reads, unchanged earlier
Stats results and frozen migration upgrade/downgrade. Ruff/format and strict mypy pass.
Final full suite: **1,932 passed**, one existing browser-prerequisite skip,
19 published-data deselections and the existing Google GenAI/Python 3.14 deprecation warning.
Results are recorded in [python.log](verification/python.log).
Dashboard checks and glance captures are not rerun for this backend-only block.

```bash
.venv/bin/alembic upgrade head
.venv/bin/courtlens import-finance-thresholds docs/evidence/pc06/threshold-input.json
.venv/bin/courtlens acquire-finance --source bref_contracts \
  --url https://www.basketball-reference.com/contracts/TOR.html
# Repeat --url for the other canonical team pages in this same serial run.
# Use actual returned acquisition / threshold IDs and an admitted PC05 index:
.venv/bin/courtlens import-finance-refresh \
  --acquisition-id ACQUISITION_ID --roster-dataset-id ROSTER_DATASET_ID \
  --threshold-id THRESHOLD_ID
.venv/bin/courtlens verify-finance-refresh REFRESH_ID
.venv/bin/python scripts/test_python.py -q \
  tests/unit/test_finance_sources.py tests/unit/test_player_context.py \
  tests/integration/test_finance_context_postgres.py
.venv/bin/python scripts/test_python.py -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtlens
```

On this installation, use the explicit IDs in `source-checks.json` and `threshold-admission.json`
to reproduce the retained admission. Elsewhere, fetch fresh inputs and retain the new receipts;
do not copy installation IDs into a different database or invent historical acquisition times.
The runtime raw store is required for `verify-finance-refresh`. With a separate local API
on `127.0.0.1:8102`, `.venv/bin/python docs/evidence/pc06/verify-real.py` reproduces the read-only
network measurements, integrity checks and SQL rejections. The owner's 3000/3100/8101 processes
were retained; the temporary PC06 API is stopped after verification.

See [finance refresh contract](../../design/finance-refresh-v1.md). Resolving source access and
canonical coverage is required before PC06 can be verified; this evidence does not promote
PC05, start finance UI work, or clear G3.
