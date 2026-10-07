# AR07 — contextual Ask panel

Measured 2026-10-06 in America/Toronto, starting from AR06 `a39d03e`.
AR07 only; AR08 acceptance and the sealed holdout are untouched.

## Implemented boundary

- The header opens the reused full-height chat panel on loaded player, team and player-comparison
  pages. Other header Ask entries open the full Ask page. Native modal focus, Escape and return
  focus work at desktop and mobile sizes. Explicit manual mode remains available on these pages.
- Pages register the entities and scope from their loaded results, rather than guessing defaults
  from the URL. The removable chip shows entity names, season and phase. Names are presentation
  only: requests send bounded canonical IDs, route and resolved selections as `page_context`.
  Removing the chip omits that field on the next request. The full-page link carries resolved scope.
- The additive v2 schema rejects inconsistent routes/IDs, duplicate IDs and oversized selections.
  Server scope resolution merges inherited scope, then page scope, then explicit next-question
  scope; calendar and pinned-operation rules retain authority.
- The server resolves singular player references, “this team” and “these/both players” before
  planning. Ambiguous comparison references clarify without calling the provider. A planner cannot
  change a resolved entity; player/team queries must retain the matching restriction. Rejections
  use the existing single repair budget. Resolution is recorded in scope assumptions.
- Page context is retained with the accepted request. Requests without it serialize exactly as
  before, preserving old hash inputs. No history migration or change to old result hashes.
- Compact player/team facts now put names and basketball values ahead of internal context metadata
  and URLs. Full returned data remains in “How I got this”; zero and unknown values stay intact.

## Measured checks

- [Python units](unit-tests.log): **964 passed, 2 skipped** (the two existing optional PostgreSQL
  assistant tests did not have their opt-in environment variable in this unit-only invocation).
- [PostgreSQL integration](integration-tests.log): **143 passed**, across conversation, hybrid
  assistant, durable history, saved results, retrieval and evaluation suites. New cases cover
  actual player/team execution, pair comparison, ambiguous references and wrong-entity repair.
- [Real-service browser](real-browser.log): **2 browser tests passed**, one at 1440 px and one at
  375 px, each exercising both the player and team page. The pytest harness itself passes.
  This uses real FastAPI, PostgreSQL, the Next.js proxy, SSE and durable history, with synthetic
  admitted facts and a deterministic fixture planner. The final retained plan selects Scottie Barnes for
  “Show his profile” and Toronto for “Show this team”; scope retains the disposable release.
- [Vitest](dashboard-tests.log): **205 passed**. [Dashboard lint](dashboard-lint.log),
  [TypeScript](dashboard-types.log), [Ruff](ruff.log), [mypy](mypy.log) and
  [generated-contract check](schema.log) pass.
- [Chat browser run](browser-threaded.log): **41/41**. [Three repeats](browser-threaded-repeat3.log):
  **123/123** at two workers, before the later name-label/compact-fact and manual-mode cleanup.
  [Manual/workbench browser cleanup](browser-manual.log): **21/21** after that cleanup.
- [Final full browser suite](browser-full-suite.log): **149 passed, 3 skipped, 0 failed** at two
  workers. The skips are the existing real-workspace case and the two opt-in AR07 real-service
  cases; those AR07 cases pass separately through the disposable real-service harness.

- The subsequent full run had **148 passed, 3 skipped, 1 failed** in the pre-existing finance
  Option scenario test, whose selector also matched React's temporary hidden streamed copy.
  [Second full run](browser-second-full.log). Finance navigation now uses the same readiness
  helper. [Finance repeats](browser-finance-repeat3.log): **24/24** at two workers.

## Browser findings and limits

The first full browser run had 145 passes, 3 skips and 4 failures. Three older checks assumed
that Ask/Stats could open a manual panel; they now test the preserved explicit manual mode on a
loaded player page, matching AR07's entry-point scope. One old manual-page test interacted before
React's hidden streamed copy settled; all navigation in that spec now uses the existing staging
readiness helper. The focused manual/workbench rerun passes. During development, closing the
native dialog in effect cleanup also closed it during React's development effect replay; native
modal lifecycle handling now avoids that cleanup.

No Gemini inference or live accuracy claim is made. The AR04 live narrative fallback rate remains
unmeasured. General-knowledge/current-fact rules, replica source gates, sealed PF evidence and the
holdout remain unchanged. The 3100 user server was not stopped or restarted. Browser servers ran
from isolated copies on 3207/3208, with mock/fixture APIs on 4207/4208. The user's existing
`dashboard/next-env.d.ts` diff was preserved.

## Screenshots

- [Player, 1440 px](ar07-real-player_id-1440.png) and [375 px](ar07-real-player_id-375.png).
- [Team, 1440 px](ar07-real-team_id-1440.png) and [375 px](ar07-real-team_id-375.png).

## Reproduction

Run ordinary checks from the repository. PostgreSQL checks require an explicitly configured
`COURTLOAD_TEST_POSTGRES_URL`; the fixtures create and drop uniquely named schemas.

For the real browser harness, start an isolated Next.js copy pointing to
`COURTLOAD_API_INTERNAL_URL=http://localhost:4208` and
`NEXT_PUBLIC_COURTLOAD_API_URL=http://localhost:4208` on an unused port, then run:

```sh
COURTLOAD_TEST_POSTGRES_URL='<disposable postgres URL>' \
COURTLOAD_AR07_BROWSER_BASE_URL='http://localhost:3208' \
COURTLOAD_AR07_DASHBOARD_DIR='<isolated dashboard directory>' \
.venv/bin/pytest tests/integration/test_assistant_panel_browser.py -q -s
```

The harness starts/stops FastAPI on 4208 and injects a deterministic fixture planner; it makes no provider call.
`COURTLOAD_AR07_API_PORT` can change the fixture port when the isolated Next server targets it.
The two real-service browser cases skip in the ordinary mocked suite without this fixture.
