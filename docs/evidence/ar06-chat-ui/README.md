# AR06 chat UI

Measured 2026-10-06 on top of `fe90869` (AR05). This is a dashboard-only block: no backend,
schema or assistant-contract changes, so the Python suites were not rerun. Gemini quota was still
exhausted, so every browser run uses mocked or recorded responses. No live answer appears in the
screenshots. The AR02 v2 holdout remains sealed. AR07 and AR08 are not implemented here.

## What changed

- **Layout** (`components/threaded-assistant.tsx`). `/research/ask` is now a full-height chat. The
  page does not scroll; the transcript does, and the composer stays in view. It has:
  - A collapsible conversation sidebar grouped Today / Previous 7 days / Older. The collapsed
    state is a per-browser preference. Below 900 px, and always in the header drawer, the sidebar
    is an overlay that closes after a thread is chosen.
  - A top bar with the thread title, New chat and Delete chat.
  - A centered column (at most 760 px) with the ball-lens avatar beside the assistant prose.
  - A sticky rounded composer. Enter sends, and Shift+Enter or IME composition keeps editing. The
    composer also holds the next-question scope chip (the scope editor opens above it) and a round
    gold Send/Stop button.
  - User messages are right-aligned bubbles. Assistant prose has no bubble.
  - The empty state shows four example prompts that send on click. One is a forecast prompt from
    the dev split (`ar02-146`), never the holdout.
  - `/ask` redirects to `/research/ask` and keeps the query string.
  - The manual research experience (`?experience=manual`) is unchanged.
  - All turn, stream, fallback, polling, stop and sync logic is unchanged. Only rendering moved.
- **Answer** (`components/hybrid-answer.tsx`, `lib/assistant-chat.ts`). Blocks render in order:
  - Prose comes first: the checked narrative, or the template text for old turns without one.
  - Result blocks become a **compact table**: name columns lead, IDs, hashes and JSON are hidden,
    and the table shows at most 6 columns and 10 rows with the true row total. A single-row result
    becomes a fact grid. Forecasts lead with the player, point estimate, interval bounds, target
    date, issuance time and policy ID, with no verdict. Values are only formatted: zero stays `0`,
    an absent value is `Unknown`, up to four decimals.
  - Then a chip row: the answer's resolved **scope chip** plus action, review-and-save and retry
    chips.
  - Then a collapsed **"How I got this"**: scope, as-of date and assumptions, the full
    `ConversationResult` with every row, definitions and evidence cells, the save note and the
    raw evidence JSON.
  - The general-knowledge label is shown as a badge inside the same paragraph as its prose.
    The text is unchanged.
- **Settings.** Clear-all-history (with confirmation) and the privacy notice moved to
  `/settings` → "Assistant history and privacy". Clearing there announces the change so open chat
  pages and drawers in other tabs empty themselves. Delete chat (the current thread) stays in the
  chat. The sync constants now live in `lib/assistant-history.ts`.
- **Header drawer.** It renders the same component with `variant="panel"`. AR07 replaces it with
  the page-context side panel.

## Evidence

- [Vitest: 204 passed](dashboard-tests.log) (AR05: 196). This includes 8 new
  `lib/assistant-chat.test.ts` tests:
  - Enter, Shift+Enter and IME handling.
  - The scope chip label.
  - Day grouping of threads.
  - The general label split.
  - A forecast prompt is featured.
  - Compact table columns, row cap and total, with zero/unknown preserved.
  - Forecast fact order with the estimate, interval, cutoff identity and policy.
  - The distribution summary row is skipped, and empty results return nothing.
- [Lint](dashboard-lint.log) and [types](dashboard-types.log) are clean.
- [Threaded browser suite: 36/36](browser-threaded.log), and
  [108/108 under `--repeat-each=3 --workers=2`](browser-threaded-repeat3.log). Every pre-existing
  case was updated to the new layout. The new or rewritten cases cover:
  - The chat flow at 2560, **1440**, **375** and 1440@2× zoom: empty state, a knowledge answer,
    then a data answer. Each checks there is no horizontal scroll, the page itself does not
    scroll, the composer is in the viewport and the column is at most 760 px. Then the header
    drawer opens and Escape returns focus.
  - Enter sends, Shift+Enter adds a line, and an example prompt sends directly.
  - The bubble is right-aligned and the prose has a transparent background. The chips, scope
    chip, collapsed "How I got this" and "Top 10 of 12 rows" are present.
  - An old thread whose turn has template text and no narrative renders in the new layout, under
    the "Older" group.
  - On mobile, the conversations drawer toggles `aria-expanded` and closes after a thread is
    picked.
  - On desktop, the sidebar collapse persists across reload.
  - Clearing history in Settings empties a chat open in another tab.
  - `/ask` redirects with the query string.
- Screenshots at 1440 × 900 and 375 × 812:
  - Desktop: [empty](ask-desktop-empty.png), [answer](ask-desktop-answer.png),
    [header drawer](ask-desktop-panel.png).
  - Mobile: [empty](ask-mobile-empty.png), [answer](ask-mobile-answer.png),
    [conversations drawer](ask-mobile-drawer.png), [header drawer](ask-mobile-panel.png).
  - Also captured: wide (2560) and zoom-equivalent variants.
- [Full browser suite](browser-full-suite.log): 142 passed, 1 skipped and 2 failed. The failures
  were `entity-selection.spec.ts:70` and `shared-floor.spec.ts:55`. With the HEAD versions of
  every AR06 file swapped back in, the same two cases failed 4 of 6 runs, so they are
  pre-existing and unrelated.

Browser runs used a hard-linked scratch copy of the dashboard on ports 3200/4100, because the
developer's `next dev` held port 3100.

## Cleanup: streaming staging and picker readiness

The earlier diagnosis described the hidden streamed segment as an orphan caused by the
WorkspaceProvider update. Follow-up measurement does **not** support a permanent orphan:
React stages streamed server HTML in a hidden `S:*` div outside `<main>` and schedules its
reveal. The installed Next.js React server implementation (`$RC` / `$RV` in
`next/dist/compiled/react-dom/cjs/react-dom-server.browser.development.js`) explicitly schedules
this reveal and removes the staged div. Shell hydration and the workspace response can finish
before that reveal. Strict text/label locators see the staged HTML as well as the active page.

- [Pre-cleanup full-suite reproduction](browser-cleanup-baseline.log): 142 passed, 1 skipped,
  2 failed. This time the duplicate was on Settings (`route-polish`), while `shared-floor`
  timed out in the same two-to-five-player replacement flow.
- A temporary **100 ms server-render delay** in the scratch Settings page reproduced duplicate
  configuration panels in 10/10 runs. A whole-document probe saw two copies initially and one
  copy with no hidden staged panel **one second later in all 10 runs**. The delay, probe,
  transition/deferred-value experiments and scratch code are excluded from the implementation.
- `entity-selection` and `route-polish` now await **one match** before strict interaction with
  Season or the configuration disclosure. These are retrying assertions, with no fixed sleeps.
  The shared `waitForStreamedPage` helper also waits for hidden body-level `S:*` staging divs to
  disappear after workbench navigation and Ask navigation/reload. This catches a retained
  staged segment instead of masking it,
  and prevents the same race in other text/label controls. The chat spec keeps interactions
  scoped to the active page and now also asserts that a
  reload settles to exactly one Messages element across the **whole document**.
- [First cleanup full run](browser-cleanup-first-pass.log): 143 passed, 1 skipped, 1 failed
  on a Before date locator seeing the same temporary duplicate. This led to the shared
  navigation readiness check above.
- [Second cleanup full run](browser-cleanup-second-pass.log): 143 passed, 1 skipped, 1 failed
  on an Ask scope locator that used direct navigation. Ask navigation and reload now await the
  same shared staging-readiness assertion.
- [Delayed Settings check after cleanup](browser-cleanup-delayed-settings.log): **10/10** pass
  with that same temporary delay and unchanged workspace/hydration code.
- The `shared-floor` failure was a separate test-readiness race. Publication resolves a new
  lookup scope, temporarily clearing the displayed chips while canonical identities resolve.
  Its replacement helper counted zero chips during that gap and skipped removing the retained
  players. It now awaits the field's existing resolving status disappearing before clearing.
  The original application code passes without modification.
- [Focused repeat](browser-cleanup-repeat3.log): **18/18** at two workers (six cases × three):
  scope race, two-to-five-player replacement, Settings disclosure, durable chat reload, and
  general-knowledge reload at 1440 and 375 px.
- [Final threaded repeat](browser-cleanup-threaded-repeat3.log): **108/108** at two workers
  after applying shared staging readiness to every Ask navigation and reload.
- [Final full browser suite](browser-cleanup-full-suite.log): **144 passed, 1 skipped, 0 failed**
  at two workers. The skipped workspace persistence test requires an enabled real
  FastAPI/PostgreSQL service; this run uses the mock API.
- Fresh cleanup checks: [204 Vitest tests](dashboard-cleanup-tests.log),
  [lint](dashboard-cleanup-lint.log) and [types](dashboard-cleanup-types.log) pass.

## Not claimed

- No live answers: the provider quota is exhausted. The AR04 fallback rate is still unmeasured.
- AR07 page context, the context chip and referent resolution are not implemented. The header
  drawer only reuses the new layout.
- Full browser acceptance (AR08).
