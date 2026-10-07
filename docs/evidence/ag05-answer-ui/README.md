# AG05 answer UI

Measured 2026-10-07, starting at `a719959`. The owner's unrelated `TODO.md` edit is
preserved and excluded. These are synthetic/replay UI measurements, not live-provider quality
or confirmation of the numerical claims shown in the screenshots.

## Implementation

- One `AgentAnswer` renders v3 turns in the retained AR06 page and AR07 drawer. V2 continues
  through the unchanged `HybridAnswer`. Live drafts and final replacement retain AG04's transport.
- Prose leads, using the bounded Markdown dialect in `lib/markdown.ts`, plus escaped bold/code
  and source markers. Raw HTML and executable links are never interpreted. Position maps use
  Python-compatible code-point offsets, including emoji, CRLF, headings, lists and blank code
  lines, so unsupported sentences retain their visible unverified marker and explanatory tooltip.
  Assumptions render immediately below the prose, including their source/unverified annotations.
- Source chips show domains without favicons, CourtLens, or the dated Databallr label. Hover uses
  the browser title tooltip; tap/keyboard expands title/date and a safe source or result link.
  Escape restores chip focus and can subsequently reach the drawer's close behavior. Warehouse
  links bind the executed operation hash to the result within that retained turn.
- Only returned warehouse results produce result views. Tables start with ten returned rows and
  expose Show all/Show fewer. Team arrays display joined codes; absent/null cells remain Unknown,
  and zero remains zero. Rank is labelled, headers carry recorded units (or explicitly say unit
  not supplied), and tables scroll within their region on small screens. Compact facts and full
  returned fields/evidence remain available. Open equivalent analysis uses the retained URL;
  Review and save uses each result's own release/season/cutoff rather than current selections.
  A result without those required retained scope fields does not invent a save destination.
- Follow-up chips submit a new user message in the same thread. Sources and How I got this stay
  collapsed. Trace shows tool arguments/status/rows/hits, provider/model/prompt identity, input and
  output tokens, estimated cost or Cost unknown, elapsed time, limit stops and reported overshoot.
- Limited-mode and provider-failure messages include retry timing and a linked retry attempt.
  Web-only prose has no saved-analysis action. Settings reads the existing assistant status API
  and shows provider, model, agent limits and limited mode without any key. Empty-state prompts
  include RAPM, defense, MVP, forecast and comparison questions.

## Measured verification

| Check | Result |
| --- | --- |
| Vitest | [223 passed](verification/dashboard.txt), including ten new server-rendered component tests for chips, assumption, provenance/code-point positions, safe content/URLs, row bounds/units/unknowns, follow-ups, trace/cost, limited/retry states, result-pinned review links and Settings fallback. |
| Dashboard checks | [TypeScript](verification/dashboard-types.txt) and [ESLint](verification/dashboard-lint.txt) pass with zero warnings. |
| Focused browser | [Seven passed](verification/browser-focused.txt): six AG05 cases plus the calculator regression. AG05 covers page chat at 1440/375 px, shared-panel failures at both widths, Settings, and keyboard source details at 812×375 with reduced motion. |
| Full browser | [169 passed, 3 skipped](verification/browser-full.txt) across all 172 collected cases, including all 51 threaded cases. The skips are the two AR07 real-Postgres/FastAPI panel cases and the real workspace persistence case, which require external integration fixtures. |
| Python regression | [1089 passed, 2 skipped](verification/unit.txt). The existing two DB-dependent legacy skips and third-party google.genai Python 3.14 deprecation warning remain. No Python product code changed. |
| Python checks | [Ruff](verification/ruff.txt), [format](verification/format.txt), [strict mypy](verification/mypy.txt), and [generated contracts](verification/contracts.txt) pass. |
| Preserved evidence | [AG04's retained-contract hashes match](verification/retained-contract-hashes.json); [v2 rendering/contracts, sealed AR/PF evidence and eval corpora have no diff](verification/sealed-diff.txt). |

Browser checks assert source metadata/links, sentence-level markers, ten/all rows, zero/null/team
cells, scope-pinned review URLs, follow-up request identity, history reload, trace/accounting,
retry lineage, no web-only save, keyboard focus visibility and no document horizontal overflow.
Screenshots: [desktop answer](screenshots/ag05-answer-1440.png),
[mobile answer](screenshots/ag05-answer-375.png),
[desktop limited panel](screenshots/ag05-panel-limited-1440.png),
[mobile limited panel](screenshots/ag05-panel-limited-375.png),
[landscape source details](screenshots/ag05-landscape-source-details.png),
[Settings](screenshots/ag05-settings.png). The RAPM, blocks and unsupported 99.9 values in these
fixtures are synthetic. Source links are asserted, not fetched; no Databallr access occurs.

## Infrastructure and flake accounting

The scratch dashboard runs on 3200 with the fixture API on 4100; the owner's server on 3100
is untouched. Its isolated parent links the repository's evidence directory for read-only test
fixtures. No application database, production data or owner environment was changed.

- [Initial full-suite collection](verification/browser-full-initial.txt) lacked the shared
  B21/B23/B29 evidence fixtures outside the standalone dashboard copy. Adding the parent fixture
  link fixed collection without a product change.
- [The first collected full run](verification/browser-before-settings-updates.txt) passed 166
  and skipped three, with two assertions still expecting the old Settings labels. The tests
  `settings distinguishes configured key from provider health and hides operator details` and
  `Ask drawer offers manual research and links to optional configuration` now check the v3 card
  and retain the configuration/availability distinction and manual-research guarantees.
- [The next full run](verification/browser-staging-flake.txt) passed 167 and skipped three,
  failing `calculator rejects invalid scenarios and shows checked finite differences on mobile`:
  its whole-document label briefly matched both active and hidden streamed HTML. This is the
  documented React streamed-segment staging family from AR06. The calculator test now uses the
  existing `openWorkbench` helper before interacting; its analytical assertions are unchanged.
- The prior threaded `retains history and retry creates a linked attempt` strict-locator family
  passed serially. Passing serial runs does not establish that all timing flakes are eliminated.

Commands from the repository root:

```bash
npm --prefix dashboard test
npm --prefix dashboard run typecheck
npm --prefix dashboard run lint
env -u COURTLOAD_TEST_POSTGRES_URL .venv/bin/pytest tests/unit -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
.venv/bin/python scripts/generate_hybrid_contract.py --check
# From the isolated dashboard, with its Playwright port changed to 3200:
npm run test:browser -- e2e/threaded-assistant.spec.ts e2e/advanced-research.spec.ts \
  --grep 'AG05|calculator rejects' --workers=1
npm run test:browser -- --workers=1
```

## Boundary

**AG05 is verified at its mocked UI boundary.** This block measures answer rendering and
interaction using mocked v3 responses, plus the existing v2/AG04 browser regressions. It does not
claim live search/provider success, a quality baseline, a holdout result or broader database
acceptance. AG01's provider/acceptance gaps remain; AG06 owns the v3 evaluation revision. AD01
permission remains unresolved, and AD02–AD04 stay source-blocked. The previous sealed evidence
and holdouts are unchanged.
