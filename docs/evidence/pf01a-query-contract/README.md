# PF01a — server cohort and presentation query contract

2026-10-05. **PF01a complete; PF01 remains in progress.** This is the bounded backend prerequisite for catalog/context and dashboard correctness, not a claim that the visible Stats defects are fixed. Revision `daedc03c66e7142c5a23ef918193e86e1b86af1a` with preserved pre-existing dirty work. Read root/dashboard instructions, workbench/replica/freeze handoffs and the polish UI and replica analytical contracts. The available Codex session implemented this backend slice; no delegation or Flash-owned presentation work occurred.

## Contract handoff

`POST /api/workbench/query` accepts an optional, separately versioned `presentation` object. Omit it to retain existing query behavior and saved analytical output. Supply `{}` to select the new cohort contract, or `{"version":"pf01a-v1","player_ids":["1629029"]}` to filter displayed entities. IDs are canonicalized/deduplicated; maximum 2,000. Omitted/null IDs select all; `[]` deliberately selects none. Favorites clients supply their entire saved ID set, rather than filtering a loaded page.

- Analytical season/phase/exclusive cutoff/window/team-participation/sample/predicate filters define eligibility. Name search and presentation IDs apply **after** SQL cohort windows; page size/cursor and visual preferences do not change the cohort.
- `total_eligible_players` is the full analytical population; `total_output_players` is the complete presentation-filtered population before paging. `items.length` is the current page count. Empty output still returns cohort identity/count.
- Every row includes `percentiles` and `cohort_sample_sizes` for implemented numeric catalog keys. Null metrics are excluded independently; fewer than two valid values yields null. Midrank: `100 * (less + 0.5 * equal) / n`, rounded half-up and clamped to 1–99, preserving the established display formula. Percentiles are numeric-value ranks; `cohort.good_directions` supplies high/low/null interpretation rather than silently reversing ranks.
- `cohort.scope_hash` identifies declared release/dataset/semantic/query scope under this version. It is **not a result-content hash**. Existing saved result hashes retain their separate meaning. Presentation/name/sort/paging/visual preferences do not change cohort scope identity.
- New cursors bind all query dimensions and entity filtering, rather than just primary sort and a few filters. Changing analytical predicates, secondary sorts or entity sets rejects the cursor. Changing page size is allowed. Legacy tokens cannot enter the opt-in path; negative offsets are rejected.
- Opt-in per-36 metrics pair numerator and positive recorded exposure on the same observations and multiply before a single division. Independent real arithmetic exposed an existing double-division rounding defect (18.75 → 18.7); this path returns 18.8. Non-opt-in arithmetic remains preserved for retained reproduction. Legacy `pts` still means total points.
- This bounded contract supports single-season players and Season/Last 5/Last 10 appearance windows. Unsupported entity/multi-season/current-roster/possession/metric-selector/window modes return 422. Unimplemented sort/predicate columns also return 422. Expanding these capabilities is separate work.

Owned implementation: `src/courtload/domain/stats_presentation.py`, additive Stats engine changes, workbench query request/response schemas and route, shared TS types/API client, two read-only verification scripts and the PostgreSQL regression test. Existing ResearchQuery/QuerySpec saved serialization is unchanged. TS fields remain optional for legacy fixtures/responses; the Stats page has not yet migrated.

## Measured verification

| Check | Result |
| --- | --- |
| PostgreSQL synthetic arithmetic/API/cursor/temporal/source-gap tests plus existing SQL compilation tests | **21 passed**, zero failures/skips/warnings, 0.52 s |
| Ruff / format / strict mypy | Pass, zero diagnostics |
| Dashboard lint / types | Pass, zero warnings |
| Dashboard unit suite | **26 files, 164 tests passed** |
| Real DB traversal and independent arithmetic | Nine scopes: Season/Last 10/Last 5 × total/per-game/per-36 points ordering; independent raw-fact points arithmetic and full-row percentile arithmetic; complete paged values/counts/order equal full results |
| Real PostgreSQL HTTP | Ten in-process FastAPI requests, 50 rows each, 591 eligible/output players; 200 responses; p95 **357.6 ms** (nearest rank, ten samples) |
| PF00 legacy sample/cursor | All 25 baseline analytical rows, count 591 and cursor reproduce exactly |
| Retained investigations | **185/185 reproduction outcomes identical to checksum-verified PF00 engine**; 137 saved hashes match, 48 existing hashes mismatch |
| Preserved evidence/artifacts | Zero changes across 1,029 retained evidence files and 316 artifact files; no unexpected pre-existing application changes outside owned paths |
| `git diff --check` | Pass |

[Real database report](real-database.json) records cohort identities/counts, metric coverage, traversal pages, result hashes and aggregate verifier times. Aggregate times include independent Python arithmetic, full export, all pages and an entity-filter request; they are not single-request latency. [Retained comparison](retained-comparison.json) records every saved/recomputed hash and actual HTTP timings. All 48 mismatches already occur under the [reconstructed PF00 engine](pf00-stats-engine.py.txt), whose SHA-256 exactly matches PF00's starting checksum `edc36357e48c4b76d59a1b4d8feebf1c149b3e2cfb6df6433afe5163b2dd68bd`. They remain unresolved; this slice did not rewrite retained artifacts.

The [initial real-data probe](real-database-probe.log) retains the per-36 rounding discrepancy that prompted the versioned correction. Subsequent verification passes. [Preservation](preservation.json) distinguishes the freeze-plan confirmation already made by PF00 from PF01a-owned changes.

Commands:

```bash
COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@127.0.0.1:5432/courtload_pf00_baseline \
COURTLOAD_REQUIRE_POSTGRES_TESTS=1 .venv/bin/pytest \
  tests/integration/test_stats_presentation_postgres.py \
  tests/unit/test_stats_engine.py::TestSQLGenerationAndCompilation -ra
.venv/bin/python scripts/verify_pf01a_stats.py --output docs/evidence/pf01a-query-contract/real-database.json
.venv/bin/python scripts/verify_pf01a_retained.py
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
npm --prefix dashboard test
git diff --check
```

Same PF00 local Linux/Python/PostgreSQL environment. Synthetic facts live only in transaction-local temporary relations in the retained disposable test database; rollback removes them. Application verification uses an enforced read-only transaction against retained real data. No publication, migration, acquisition, model/provider call or Live demand occurred. No permanent database row or retained file was rewritten.

## Limits and next boundary

No dashboard rendering change, screenshot/zoom task, production build or browser acceptance belongs to this backend slice. HTTP measurements use the actual FastAPI route and real PostgreSQL through an in-process transport, not a separately deployed network service. Ten local requests are a bounded measurement, not broad performance acceptance. Real independent source arithmetic covers points totals/per-game/per-36; other metrics receive percentile reconciliation against their returned full-cohort values, not fresh source-formula certification.

PF00's full-suite Python/browser failures remain open; the targeted passes do not establish a green full baseline. Preserve the replica source/model/finance/Live gates.

Next **PF01b**: catalog-bound observed season/phase/default/availability fields; normalization-aware default/sort resolution; lossless context serialization and navigation synchronization; true count nouns; and dashboard adoption of this cohort/entity contract. PF01 only completes after those behavior and real/browser checks pass. PF02+ and assistant features remain pending.
