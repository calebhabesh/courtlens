# PF01b — catalog, context and dashboard integration

2026-10-05. **PF01b complete; PF01 complete at its query-correctness boundary.** Starting revision `daedc03c66e7142c5a23ef918193e86e1b86af1a`, with the prior dirty work retained. Read root/dashboard instructions, workbench/replica/freeze handoffs, the polish UI and analytical contracts, and PF00/PF01a evidence. Available Codex session; no delegation, model/provider invocation or Flash-owned visual restyling. Applied UI/UX guidance and installed Next.js documentation.

## Changed behavior and shared-contract handoff

- `/api/workbench/catalog` adds `stats_scopes`, `stats_windows`, `stats_normalizations` and `stats_sort_fields`. Each observed season/phase pair declares recorded coverage and an exclusive default cutoff one day after its latest appearance. Scheduled/unknown appearance rows cannot create Stats availability. The default selects the latest observed season, preferring its regular season. Archive scopes retain their regular-season identity. Legacy engine defaults and retained analytical serialization remain unchanged.
- The actual release exposes **three seasons and four phases**, rather than the old catalog's lone default season. The core Stats capability lists observed seasons/phases; an empty observed population is source-blocked. `stats_scopes` supplies pair-specific availability rather than implying that every season/phase combination exists. Other capability/source gates are preserved, not newly certified.
- Stats and the regular Players explorer share one server workspace and adopt `POST /api/workbench/query` with the `pf01a-v1` presentation contract. Catalog defaults and effective counting mode become explicit URL parameters. Named historical selections remain visible with an availability error. Name/entity filtering cannot redefine the percentile population.
- Counting-mode changes resolve counting-family sorts to the displayed normalization and reset cursors, preserving direction. Column values, labels, formatting, header sorts and selector options use the same metric definition. Minutes totals/MPG and percentages retain their declared units; attempts switch to their supported per-36 variants. Unsupported possession modes are disabled. Unsupported columns cannot trigger a sort.
- Percentiles come exclusively from the server; null/absent percentile fields have no invented page-local fallback. The tooltip names the valid metric cohort and eligible population. Color interpretation uses the server's high/low direction, without changing numeric percentile ranks.
- Favorites supplies the complete saved entity set to the server. Its URL state survives reload/navigation; toggling and removing a favorite refresh the bound query and invalidate paging when necessary. Empty Favorites/name output still reports the eligible population. `output_offset` is additive on opt-in responses and supplies continuous displayed row ranks; legacy responses return null.
- Context options use the retained catalog. Cutoff drafts remount when resolved context changes, fixing Back/Forward and external-scope synchronization. Season/phase changes select the matching catalog cutoff. Context navigation preserves release, season, phase, cutoff and complete window parameters, canonicalizing aliases and respecting target overrides. Comparison forms retain these parameters through GET submission; comparison loading recognizes release/cutoff aliases.
- Counts distinguish loaded rows, matching players and eligible players. Other affected context labels now say teams/series/eligible players as appropriate; team detail uses its actual recorded game count rather than substituting a player-cohort count.
- Existing saving remains a **legacy scope recalculation**, now explicitly labelled. Favorites and percentile output are excluded; unsupported advanced filters/multiple sorts cannot be silently saved through the legacy endpoint. New presentation result-artifact persistence is not claimed. Explicit browser-fixture historical player search remains available; a missing Stats catalog is an honest availability state.

Owned seams: new `stats_catalog.py`; additive workbench catalog/query schemas and route; shared TS fields, query helpers and tests; shared `stats-workspace.tsx`, Stats/Players pages, explorer/context/comparison controls and count-label callers; browser fixtures/readiness checks; verification scripts and freeze evidence/progress. PF01b does not change Stats arithmetic, publication, source admission, migrations, global CSS, navigation availability grouping, branding assets, lookup or assistant behavior.

## Measured verification

| Check | Result |
| --- | --- |
| Disposable PostgreSQL/API/SQL tests, including observed catalog defaults and output offsets | **22 passed**, zero failures/skips/warnings |
| Dashboard unit suite | **27 files, 176 tests passed** |
| Ruff / format / strict mypy; dashboard lint / types | Pass, zero diagnostics/warnings |
| Production webpack build | Pass in isolated dashboard copy; original running dashboard undisturbed |
| Real catalog defaults through FastAPI + read-only PostgreSQL | **12/12 observed season/phase scopes**, positive eligible populations and matching eligible/output counts; nearest-rank p95 **289.9 ms** for these 25-row in-process queries |
| Production Chromium real-service workflow | **19 recorded checks**, zero page errors; rendered rows/order/value/percentile/ranks reconcile with actual HTTP query responses |
| Affected fixture Playwright workflows | **4 passed**, zero failures/skips/warnings after hydration readiness correction |
| Independent real arithmetic/traversal | Nine Season/Last 10/Last 5 × totals/per-game/per-36 scopes pass the PF01a verifier; 25 legacy rows/count/cursor reproduce exactly |
| Retained investigations | **185/185 reproduction outcomes unchanged**; 137 saved hashes match, 48 pre-existing mismatches remain |
| Preserved evidence/artifacts | Zero changes across **1,029 retained evidence files and 316 artifact files**; unrelated pre-existing dirty application paths preserved |
| `git diff --check` | Pass |

[Browser report](browser.json): catalog defaults bound into URLs; Stats and Players consume the same contract; 25/100-row presentation, next-page ranks, three counting modes, name filtering, off-page Favorite selection/toggling/empty output, date Back/Forward, season/phase cutoff changes, Settings navigation, explicit unavailable selections and comparison submission. [Catalog scopes](catalog-scopes.json) records all 12 actual populations and request timings. [Independent verification](real-database.json), [retained comparison](retained-comparison.json) and [preservation](preservation.json) retain the numerical and checksum evidence.

The real browser uses the actual FastAPI/PostgreSQL analytical service behind a local read-only proxy. Its **only data substitution** is a workspace favorite at source row 61: Scottie Barnes (`1630567`), outside the initial 25-row page. The actual stored workspace has no favorites; no personal state was mutated. Expected rows/values/percentiles come from real source queries, not fixture arithmetic. The proxy allows POST only to the read-only query endpoint. Source and fixture workflow evidence are separate.

Screenshots: [1440×900](stats-desktop.png), [2560×1440](stats-wide.png), [375×812](stats-mobile.png), and [Favorite result](stats-favorites.png), Chromium DPR 1, ordinary zoom. These capture PF01 correctness; PF02/PF05 visual acceptance and actual 200% zoom remain pending. All source/Live/assistant gates and PF00's full-suite baseline failures remain open.

Initial isolated Turbopack build failed because its shared `node_modules` symlink points outside the declared root; [raw log](build.log). Webpack produced the final production build. The first fixture browser probe encountered duplicate streamed DOM nodes before hydration; [initial log](fixture-browser-initial.log). Affected tests now wait for the existing workspace hydration signal and pass without relaxed selectors. Earlier real browser probes exposed label normalization and a cutoff draft surviving Back navigation; implementation corrections are covered by the passing final workflow. Production runs the generated standalone server, with no `next start` standalone warning. No ordinary full browser-suite or full Python-suite green claim is made.

## Reproduction

```bash
COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@127.0.0.1:5432/courtload_pf00_baseline \
COURTLOAD_REQUIRE_POSTGRES_TESTS=1 .venv/bin/pytest \
  tests/integration/test_stats_presentation_postgres.py \
  tests/unit/test_stats_engine.py::TestSQLGenerationAndCompilation -ra
.venv/bin/python scripts/verify_pf01b_catalog.py
.venv/bin/python scripts/verify_pf01a_stats.py --output docs/evidence/pf01b-dashboard/real-database.json
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
npm --prefix dashboard test
```

Build an isolated copy of the current dashboard with installed dependencies, using `npm run build -- --webpack`. Copy `public` and `.next/static` into `.next/standalone` at their corresponding paths. [Build log](build-webpack.log) and [temporary directory](build-directory.txt) record this session's copy.

For the real Favorite workflow, start `scripts/verify_pf01b_workspace_proxy.py` with the virtualenv Python on port 8152. Start the standalone server with `PORT=3152 HOSTNAME=127.0.0.1 COURTLOAD_API_INTERNAL_URL=http://127.0.0.1:8152 node .next/standalone/server.js`. Run `PF01B_API_URL=http://127.0.0.1:8152 node scripts/verify_pf01b_browser.cjs` from the repository root. The build's public browser API URL is `http://127.0.0.1:8000`. All temporary verification services are stopped after evidence capture.

Fixture browser command: `PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3153 npm --prefix dashboard run test:browser -- workbench.spec.ts --grep 'home opens|player explorer allows|comparison view displays|375px mobile' --workers=1`. The standalone server's internal API points to a copy of the repository fixture server bound to port 4152; its precompiled public API URL still points at 8000. These four tests do not require fixture incremental lookup/search requests; those workflows are not claimed here.

No acquisition, publication, migration, persistent workspace write, provider inference or Live demand occurred. Synthetic facts exist only in transaction-local temporary relations in the disposable PF00 test DB. Retained reproduction, independent arithmetic and catalog verification enforce read-only application transactions.

PF01's shared query/catalog contract is ready for PF03 consumption. PF02 visual foundation and subsequent PF03–PF06 work remain pending; broader route defaults, navigation capability grouping, keyboard table structure, source gates, new presentation artifact persistence and PF09 acceptance remain separate.
