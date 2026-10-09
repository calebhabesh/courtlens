# Assistant offline verification completion — 2026-10-08

This follow-up closes the offline gaps left by AG07/AG08's no-live closure.
It preserves the owner's waiver of provider-consuming development/holdout runs.
No provider request, credential change, quota probe or direct NBA request occurred.
The earlier AG07/AG08 reports and their failure logs remain unchanged.

## Reproduced defects and fixes

| Failure group | Measured cause | Change and verification |
| --- | --- | --- |
| Next-question scope and browser-history scope | The refresh removed the scope editor and its retained-scope helper, while per-turn editing remained in the contract and tests. | Restore the shared catalog controls and V2/V3 retained-scope selection. Existing tests prove old answers stay pinned and only the next request changes. |
| Mobile panel send and landscape keyboard flow | Centering an oversized empty chat placed the Send button behind `.ask-topbar`. A DOM hit test identified the header at the button's center; a real pointer trial failed. | Use automatic vertical margins, which center only when space is available, and keep header/dock rows from shrinking. Existing mobile, landscape, reduced-motion, focus and page-context tests now pass. |
| Intermittent first-message, retry, streaming and drawer failures | The textarea accepted input while history initialization moved the composer between its loading and empty-state locations. | Disable the textarea until initialization completes. A new delayed-history browser regression fails before the fix and passes afterward; typing the next draft during an active turn remains supported. |
| Real-backend panel skip | The opt-in fixture still injected the retired V2 pipeline; its dataset also contained no team-game facts. | Exercise the real V3 loop with a scripted tool provider and explicit fixture team observations, preserving strict foreign keys. Verify server pronoun resolution, result identities, retained scope and streaming through Next/FastAPI/PostgreSQL. |
| Workspace integration skip | The fixture browser run previously lacked the disposable backend setup. | Run its existing persistence/conflict/export/import/origin checks through the same isolated backend. No owner workspace is used. |

The restored scope UI uses the existing `CatalogScopeFields` and tokenized vanilla CSS.
No planner/agent policy, analytical calculation, saved result or provider configuration changes.
The Python test runner forwards only the three explicit browser-fixture options in addition
to its existing isolated environment. It continues to remove provider keys and owner dotenv.

## Evidence

- [Original two-case reproduction](verification/repro.log): both fail.
- [Minimal mobile hit-target reproduction](verification/geometry-red.log): real click trial
  fails; the header is the hit-tested element at the Send button center.
- [Delayed-history regression before the fix](verification/readiness-red.log): fails.
- [Targeted chat suite plus geometry probe](verification/threaded.log): **53 passed**.
- [Broad browser regression](verification/browser-full.log): **191 passed, zero failed,
  15 skipped**. Includes six synthetic owner-example captures; these are fixture UI
  demonstrations, not measured basketball claims or live model quality.
- [Real-backend browser run](verification/real-accepted.log): **3 passed** — desktop panel,
  mobile panel and workspace persistence. These cover three of the broad suite's skips.
- The other 12 browser skips require the sealed IM06 real-data bundle and keep their
  existing evidence. DL screenshot recapture specs and IM07 recapture specs were excluded
  as requested; their sealed evidence and milestones are not repeated.
- [Dashboard unit tests](verification/vitest.log): **286 passed / 39 files**.
- [Lint](verification/lint-accepted.log), [TypeScript](verification/types-accepted.log),
  [Ruff](verification/ruff.log), [format](verification/format.log),
  [mypy](verification/mypy.log) and [production build](verification/build.log): pass.
- [Full Python suite](verification/python-full.log): **1,845 passed**, 0 failed, one skip
  (the browser-harness test, which needs an isolated Next server and passes in the
  real-backend run above), 19 published-data deselections, one inherited google-genai
  deprecation warning. Disposable PostgreSQL; no provider keys or owner data.
- [Preservation](preservation.json): all **2,990 pre-existing evidence files** unchanged.
  This includes the previous closure reports, diagnostic logs and screenshots. Frozen
  schema/corpus/identifier controls remain in the full Python regression.

## Independent rerun (dev server, default Playwright config)

A second run used a fresh isolated copy with the default `next dev` config on ports
3500/4500, including the DL/IM evidence-capture specs that the broad production run
excluded (writes went only to the copy).

- [Threaded assistant + AG08 owner examples](verification/threaded-dev-rerun.log):
  **52 passed**, including all nine former AG07 failures.
- [Whole suite](verification/browser-dev-full.log): 230 passed / 15 skipped / 2 failed.
  [Rerun of the two failures](verification/browser-dev-rerun.log): `route-polish` release
  availability passes (cold-compile timeout). `advanced-research` "each unavailable model"
  and "measurements" fail only under `next dev`: two `.advanced-research` subtrees exist
  during client navigation, which violates Playwright's strict locator. Both pass in
  both production-mode runs. This is outside assistant scope and is not fixed here.

## Reproduction and boundaries

Dashboard verification uses a physical scratch copy, copied historical evidence, and
ports 3300/4300 (mock regression) and 3400/4208 (real fixture). The developer's running
services are untouched. Its Playwright config changes only ports, production serving
and exclusions for old evidence-capture suites. The real browser harness runs with:

```sh
COURTLENS_AR07_BROWSER_BASE_URL=http://localhost:3400 \
COURTLENS_AR07_DASHBOARD_DIR=/path/to/isolated/dashboard \
.venv/bin/python scripts/test_python.py -q -s tests/integration/test_assistant_panel_browser.py
```

The isolated Next server must set `COURTLENS_API_INTERNAL_URL=http://localhost:4208`.
The Python runner creates and removes disposable PostgreSQL, and the test owns its
fixture FastAPI server. The provider is scripted; model language quality is not tested.
The fixture adds synthetic team boxes only inside its disposable schema.

Live AG01 smoke, AG06 development accuracy and AG08 holdout remain unmeasured under
the explicit waiver. Direct NBA remains `source_blocked` pending admission/consent.
The 19 historical published-data Python checks require a restored release and are
outside this ordinary offline suite; no owner database is mutated to satisfy them.
