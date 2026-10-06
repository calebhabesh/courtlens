# PF09 — freeze acceptance

2026-10-06. **PF09 accepted at the bounded polish/freeze boundary.**
This evidence closes the bounded polish/freeze phase only. Original replica source/model/finance/
Live, current roster/injury/dated-position/official-leader and OS installation gates stay separate.
Codex executed sequentially without agents. The diagnosing-bugs and ui-ux-pro-max skills supplied
focused recovery/overflow diagnosis and table-layout guidance.

## Repairs discovered by acceptance

- Docker PostgreSQL recovery now honors the selected database, host, port and user for dump and
  restore. It forwards the password through the subprocess environment rather than command
  arguments, and resolves Compose independently of the caller's working directory. Previously
  Docker backup always dumped `courtload`; restore could ignore the URL's database. Four recovery
  regressions exercise explicit/configured targets, credentials and restore. The actual archive
  carries a clone-only marker that cannot come from the retained database.
- Legacy Planner receives the shared page gutter and scoped summary/form/table spacing. Its daily
  table has a named, keyboard-focusable internal scroll region. Actual production initially widened
  a 375px document to 749px and joined summary labels; final layouts fit wide/desktop/mobile and
  actual 200% zoom. The regression additionally caught a broad input-width rule expanding the
  picker's hidden native-validation input; the final rule excludes that input.
- Correct stale acceptance assumptions: native season selects with an explicitly admitted race
  fixture, visible streamed-route text, Planner's selected week, explicit manual Ask entry, renamed
  Settings heading/details and the lookup catalog version. Lookup context tests now use a real
  release and explicitly reject the invented release previously passed through unvalidated.
  No analytical calculation, metric schema, provider prompt/model/source registry or migration changed.

## Measured gates

| Gate | Result / evidence |
| --- | --- |
| Full Python / real PostgreSQL | **All 1,071 unique cases pass across the complete suite and final repairs**, zero unresolved failures/warnings/critical DB skips. The last complete run is **1,069 passed / 2 verification failures**, [raw log](backend-verified.log); both failing files pass the final **61-check** recovery/security rerun [log](backend-recovery-security-final.log). This is comprehensive coverage with targeted repairs, not a single all-green full-suite invocation. Lookup/recovery assertions also pass [30 checks](backend-repair-final.log). |
| Dashboard unit | **188 passed**, 29 files; [log](dashboard-unit-final.log). |
| Full production fixture browser | **132 passed**, zero failures. One intentionally separated real-workspace case skipped in fixture run; [log](browser-complete.log). |
| Production real-workspace browser | **1 passed**, zero skips; persist/conflict/export/import/forged Origin rejection; [log](browser-real-workspace.log). Fixture skip is not presented as an executed database test. |
| Static checks / production build | Ruff/format/strict mypy, dashboard zero-warning ESLint/TypeScript, generated contract and diff checks pass. [Ruff](ruff-final.log), [format](format-final.log), [mypy](mypy-final.log), [lint](dashboard-lint-final.log), [types](dashboard-types-final.log), [contract](contract.log), [build](build-production-verified.log). |
| Warehouse / Compose | **235 passed**, 30 models + 205 data tests, zero warnings/errors/skips, **233.28s**; [dbt](dbt-final.log). Compose validation passes [log](compose.log). |
| Route/control coverage | **52 production route resolutions**, zero page errors/desktop/mobile overflow; **20 additional screenshot/availability checks**. [Runtime audit](browser.json), [coverage mapping](route-coverage.json), [log](browser-route-complete.log); preserved [canonical/control inventory](../pf06-routes/route-inventory.md). |
| Stats/table | Real service values/percentiles reconcile across nine presets and three counting modes. Keyboard sorting, ranks/paging/page size/name Back, full-dataset Favorites, guides, selection/tray/context, detail focus and pinned scrolling pass. **53px desktop / 57px mobile rows**, 88px sampled metrics. [Records/screenshots](table/browser.json), [log](table-real.log). |
| Entity/context/task paths | Partial/diacritic lookup and comparison, team/together/apart selections, Scottie Barnes, ambiguity/empty-season/error distinction: **15 checks** [selection](selection/browser.json). Actual traded Luka associations, team filter/cutoff/window and local logos: **17 checks**, zero page errors [identity](identity/browser.json). Chart SVG/PNG/table, team participation/export and preserved negative result [tasks](tasks.json); catalog/navigation/postseason/alternative-link scope [context](context.json). |
| Assistant real-provider regression | Scoring-only top-five PPG and natural season follow-up both answered with exact local evidence, one actual model call each. Earlier 2025–26 scope remains unchanged after the 2024–25 turn. Point-guard/last-season resolves **2025–26** and specifically reports the dated-position/whole-cohort leader gap. Curated explanation uses zero calls. Page/drawer/tabs/drafts and pinned explicit saving reproduce [records](real-browser.json). |
| Restart / deletion vs findings | Actual stopped/restarted backend retains rendered thread and exact response [restart](restart-browser.json). Manual/V2 result hashes agree; UI Clear history leaves the saved finding reproducible with JSON/CSV exports [integrity](deletion-save-integrity.json). |
| Durable history pagination | **105 actual knowledge turns**, zero inference calls, **100 + 5**, **236,288 + 12,111 bytes**, HTTP **13.05 / 3.69ms**. Browser renders all 105, blocks sending before newer turns load and expands thread history **20→25**, **551ms** probe [HTTP](large-history.json), [browser](large-history-browser.json). |
| Fresh migration / recovery | Fresh empty DB migrates through head [log](migration-fresh.log). Actual archive restores into separately created `courtload_pf09_restored` and isolated file roots; marker + identical thread/turn/input/saved-analysis row hashes; **34/34 saved conversations reproduce** [recovery](recovery.json). **7 personal workspaces** restored; six non-default rows match byte-level JSON hashes [personal](personal-recovery.json). Default changed only after archive capture during table acceptance and is excluded from that later comparison. |
| Retained installation | **185 outcomes unchanged**, same **48 pre-existing mismatches**; **33/33 saved v1 conversations reproduce** [retained](retained.json). **316/316 artifact hashes unchanged** [hashes](artifact-preservation.json). |

The fixture suites distinguish useful answers, clarification, discussion criteria, external citations
and truthful provider/source/backend failures. PF07d's actual free-source/language regression and
fresh holdout remain [sealed prerequisite evidence](../pf07d-scoring-repair/README.md); these PF09
UI regression questions are observed cases, not new independent holdouts. Honest inability satisfies
response completeness; it does not establish factual leader accuracy. No current NBA facts are
claimed from model memory.

## Production screenshots and costs

Inspected actual production [Stats wide](table/stats-wide.png), [Stats mobile](table/stats-mobile.png),
[Settings wide](settings-wide.png), [Settings mobile](settings-mobile.png),
[Ask wide](ask-real-wide.png), [Ask 200% with browser chrome](ask-real-200-percent.png),
[Planner mobile](planner-mobile-final.png), identity and entity-selection screenshots. Each probe
records CSS viewport and DPR: **2560×1440, 1440×900, 375×812 at DPR 1**; actual Chromium zoom is
**DPR 1→2**, **1279×676 CSS**, document widths **1272–1279**. All eight sampled zoom routes fit
[record](zoom.json); this is actual headed browser zoom, separate from a resized viewport.
Shared contrast/focus/token measurements remain preserved from PF08 (8.13–16.15:1, visible 2px
focus, 40px actions). New Planner scroll focus and readable summary separation are directly checked
[presentation](planner-presentation.json). No body overflow masking substitutes for containment.

Hardware: AMD Ryzen 7 9700X, 16 logical CPUs; Linux, Python **3.14.7**, PostgreSQL **17**,
installed Next.js **16.3.5**, Chromium. [Hardware/memory](environment.json) records actual values;
physical monitor geometry is not inferred. All services are loopback standalone production builds.

Each endpoint has 20 warm samples at **1 / 2 / 4 concurrent clients**, with raw status/bytes/timings:

| Endpoint | HTTP p95 at 1 / 2 / 4 clients |
| --- | --- |
| Identity lookup | **13.20 / 23.72 / 17.74ms** |
| Catalog | **119.95 / 121.99 / 158.89ms** |
| Stats query, 50 rows | **591.81 / 587.74 / 761.01ms** |
| Thread headers, bounded page | **8.71 / 23.89 / 16.17ms** |

All **240 warm requests return 200**. Warm cached lookup service p95 is **0.02ms**, below 50ms;
20 rows and **17,402 bytes** remain within 20/25KiB bounds. A separate fresh API process's first
lookup costs **146.65ms HTTP / 51.368ms service**, 17,403 bytes, 20 rows; PostgreSQL/OS caches
remain warm [cold sample](cold-lookup.json). The 50ms target is explicitly a *warm* service target.
Browser input-event to rendered alias results p95 is **147.7ms**, including debounce/cache/network,
below 200ms [raw samples](input-budget.json). Task-selection driver timings also include Playwright
fill/locator overhead and are reported separately, not substituted for input-event measurements.
Typing performs bounded identity requests, with no provider requests; aggregate queries belong to
explicit submitted analytical tasks. Logos use local assets and portrait failures preserve identity.

[Resource samples](resources.json) include client creation overhead and co-resident backup/check
activity, not invented global latency guarantees. [RSS/HWM sampling](memory.json) distinguishes
API process memory from the full test runner's large SQL recovery buffer; it does not claim an
unsampled system/child-worker peak. Kernel HWM reaches **8,600,904KiB** for the full test
runner including SQL recovery, **361,400KiB** for API and **274,152KiB** for production Next
[production samples](production-memory.json). These are process high-water marks, not
application-wide memory ceilings. Dedicated scratch space is required for the full archive cycle. Recovery archive is **518,738,898 bytes**, backup **111.77s**,
restore **54.69s**; exact archive hash/locator and restored database size are retained. The two
analytical assistant turns cost **2,895.995 / 3,513.801ms**, five result rows, one provider and one
analytical call each; below existing per-turn bounds. All PF09 inference uses the already confirmed
Free project and `gemini-3.5-flash-lite`. No provider retry/model change/paid grounding/fallback,
billing activation, acquisition/admission/training/publication, worker schedule or hosting change.
Live lease mutations are excluded from the route audit; no new real in-game/source acceptance is
inferred from cached/history pages or fixtures.

## Isolation, failures and reproduction

Starting [revision](starting-revision.txt), [dirty tree](starting-status.txt) and [file hashes](starting-files.json)
retain prior work. Read-only `pg_dump --no-owner --no-privileges` clones the installation into
`courtload_pf09_tests` and `courtload_pf09_acceptance`; PostgreSQL errors abort loading. The full
suite's mutation fixtures target only the test clone. Production user/history/save/delete/tray
probes target only the acceptance clone. Fresh migrations use `courtload_pf09_fresh`; recovery
creates `courtload_pf09_restored`. Recovery stages source analyses/configs and restores into
`/tmp/courtload-pf09-recovery/restored`, avoiding writes into retained analytical file roots.
Native PostgreSQL tools are absent here; actual dump/restore use repaired Docker clients.

Earlier failures stay in their raw logs: initial API suite launched before clone COPY finished
(six 404s; all six pass after loading); initial standalone copy guessed a `dashboard/` subfolder;
stale full-suite/browser assertions described above; route-audit startup timeout; first assistant
probe clicked before initialization; stale identity selectors after PF05 separated badges and
pickers; retained verifier launched from stdin could not spawn its bounded worker (corrected to
a real guarded script); warehouse target compiled files were owned by earlier containers (use
an isolated target/log path), then missing required archive-dataset variable (use actual published
archive ID). First recovery ran outside Compose's cwd; the fixed explicit Compose file handles it.
Large-history generator indentation and the Planner's hidden-validation-input regression are
preserved too. The last complete Python run also exhausted the tmpfs quota during artifact
restoration and exposed an assertion matching `999` inside an opaque random UUID; the final
recovery/security rerun uses dedicated disk scratch space and checks rendered blocks with
a fixed UUID containing that substring. These failures are not attributed to analytical drift. No failed/interrupted run is counted as a pass. Final required gates pass; failed/interrupted histories remain visible.

Representative commands (disposable connection URLs only; use sufficient disk-backed TMPDIR
for the full archive cycle):

```bash
COURTLOAD_DATABASE_URL="$PF09_TEST_DATABASE_URL" \
 COURTLOAD_TEST_POSTGRES_URL="$PF09_TEST_DATABASE_URL" \
 COURTLOAD_REQUIRE_POSTGRES_TESTS=1 TMPDIR="$PF09_DISK_SCRATCH" \
 .venv/bin/pytest -W error --cov=courtload --cov-report=term-missing
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
.venv/bin/python scripts/generate_hybrid_contract.py --check
npm --prefix dashboard test
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3191 \
 npm --prefix dashboard run test:browser -- --workers=2
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3192 \
 COURTLOAD_REAL_WORKSPACE_TEST=1 npm --prefix dashboard run test:browser -- workspace-persistence.spec.ts
DBT_DATABASE=courtload_pf09_tests DBT_SCHEMA=pf09_warehouse .venv/bin/dbt build \
 --project-dir warehouse --profiles-dir warehouse --target-path /tmp/courtload-pf09-dbt-target \
 --log-path /tmp/courtload-pf09-dbt-logs --vars '{"archive_dataset_id":"2e99f37c-231a-4748-9f48-5b9ffa99f228"}'
docker compose config --quiet
```

Reused verification harnesses under `scripts/verify_pf09_*` pin the disposable service/evidence
paths. Start FastAPI on **8191**, production real Next on **3192**, mock API **4100** and fixture
production Next **3191**. Build each Next instance with its matching public/internal URL, copy
standalone/public/static **before** starting it, and keep the built instances independent.
Restart before the restart probe; run restart/zoom/large-history before the destructive disposable
Clear history probe. The recovery harness expects a fresh named target DB; its archive captures
history before pagination/deletion probes. The cold lookup uses a separate **8192** process.

The bounded freeze ends here with all required paths passing. Keep original B00–B37 ledger/source gates,
retained mismatch inventory and staged release limits intact; choose subsequent source/model/
finance/Live work through its existing contract rather than inferring a new polish block.
