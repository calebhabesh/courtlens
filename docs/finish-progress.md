# Finish progress

Measured evidence for the [finish plan](finish-plan.md). Newest last.

## 2026-11-10 — Plan written; docs-only items done

The owner cut RD19 ("Yes cut it"), approved Stats follow-up 84 ("Approve this."), and put RD18 suggestions 3 and 6, simple accounts with a demo account, and Ask's direct history answers in scope. Alignment catalog rows 18–29 now point to their Research design rows (RD00–RD18, all owner ✅) instead of their stale build-phase notes. Row 29 stays ⬜ for Win Probability (RD14), the one Research page left.

## 2026-11-11 — F00 first live check

Deployed 9a651112 (PR #81 public Ask, PR #82 https origin behind TLS and Caddy restart on config change). Through the public site: the question was accepted, the counter went 3 → 2, the asker lists their own thread, a stranger lists none, a cross-site write gets 403, deletes are refused. The answer itself timed out: production used the agent's default `gemini-3.8-flash` (Google returned a 504 on its second call), and the first stats query took 15.5 s on a cold VPS cache. The 60 s turn limit also outlasted the proxy's 55 s, so the browser got an empty error rather than the partial answer. Fix: pin `gemini-3.5-flash-lite` and a 45 s turn limit in the production compose.

## 2026-11-11 — F01 Ask answers history questions directly

**Cause.** Prompt v2 allowed model knowledge only "without numeric claims" and required every number to come from a tool or a cited web source. With web search off on the demo, the model searched the awards registry, which doesn't cover these seasons, and the stats tools before answering.

**Change.** New prompt `courtlens-agent-prompt-v3`:
- settled history (champions, awards, series, famous games, records, eras) is answered directly from model knowledge, without markers, and is never refused;
- statistics still need a tool or a cited source;
- the server tells the model whether web search exists.

v2 is unchanged, so the frozen replays keep passing.

**Measured.** Six history questions on the demo's configuration: both prompt versions answered all six correctly. Provider calls 22 → 12, time 128 s → 67 s, failed tool calls 9 → 0. Assistant integration tests: 90 passed. Evidence: [`f01`](evidence/finish/f01/README.md).

## 2026-11-11 — F02 Shot Aftermath extras (RD18 suggestions 3 and 6)

Both read the frozen R17 aggregate only (`/api/shot-aftermath/scope` per estimated position); no new analysis.

- **By estimated position.** Guards, forwards and bigs by zone, switchable between net per attempt and rebound cost. Each value has its 95% interval underneath. Green or red appear only where the interval clears zero; thin cells are dimmed and never coloured. On a phone the zones split into two column groups.
- **After a make or after a rebound.** On the After a defensive rebound view: two neutral bars per zone with whiskers, against the league line. The make value is upper, the rebound value lower.

**Reading.** Across the league, opponents score more after a rebounded miss than after a make in every zone, and the gap is widest at the rim (1.126 against 1.202 points per possession). That is consistent with the page's headline rim-rebound effect.

**Checks.**
- Real data: guards and forwards scopes captured from the owner's API; the existing bigs fixtures still equal the live responses. The spec checks every displayed net, rebound cost and pair value against the served fixture.
- `shot-aftermath`, `route-consolidation` and `route-polish` specs: 72/72 over three runs.
- Screenshots viewed: `f02-dreb-view-1440`, `f02-positions-net-1440`, `f02-positions-cost-1440`, `f02-pair-chart-390`, `f02-positions-390`.

Evidence: [`f02`](evidence/finish/f02/).

## 2026-11-11 — F00 deploy queue finished; public Ask checked live

**Deploys.**
- b98f790b (PR #83: the finish plan, and the demo's pin to `gemini-3.5-flash-lite` with a 45 s turn limit). Main CI failed three times on the same URL-timing flakes (two Wingspan specs, then also a zTS Defense URL check; 630 passed). Images had passed. The owner chose "Deploy anyway", as for 3c2f1b03.
- Then #84 (F01, prompt v3) and #85 (F02) were merged in that order.
- 301e2a2a: main CI and Images both green. Deployed in about 2 minutes; 171 Stats cohorts already stored; 158 GB free.

**One real question** through `https://courtlens.calebhabesh.com/api/assistant-v2/turn` (browser User-Agent, the site's Origin, a cookie jar): "Who won the 2016 NBA Finals, and what made it historic?"
- Answered correctly in 12.7 s: 2 provider calls on `gemini-3.5-flash-lite`, prompt v3, no tool errors.
- `GET /api/assistant-v2/limits` went from 3 to 2.
- The asker's thread list shows the question; a stranger's list is empty.
- Deleting the thread gets 403, and a cross-site turn gets 403.

## 2026-11-11 — F03 Win Probability design pass, round 1 (RD14)

The owner approved the seven-point layout as written. It is built in the Research pages pattern:

- a centred hero and meta line;
- the answer first: CourtLens 0.0075 worse than ESPN on 47 prospective games, 95% −0.0336 to +0.0167, "can't be told apart", drawn to scale from zero;
- the scorecard as a compact grid, with drift in one line, the live calibration chart, and the replayed games and the 60-game ledger each behind a toggle;
- the final test as a phase switch over one grid with intervals and its chart, with the two rules in words;
- "What didn't help" as a grid of every step, each against its own reference, results in words;
- one sortable WPA grid with season photos, sorted not ranked;
- How to read, a glossary, and a collapsed About holding the model card and hashes.

Presentation only: no model, result, ledger or API change.

**Checks.**
- Real data: 4,076 values, 0 mismatches.
- `win-probability` spec ×3: 9/9 each run.
- Vitest: 900.
- Full Playwright: 641 passed, 17 skipped, 0 failed.

**Found:** the old page called every step's gain "over S2"; the served selection gains are 90% intervals against other references, and S0g was a diagnostic.

Evidence: [`f03`](evidence/finish/f03/README.md). 👀 for the owner's look.

## 2026-11-11 — F03 approved

The owner approved the page ("Okay. I approve this page.") after one build round. Its rules are in the alignment plan ("Settled in RD14"); RD14 and alignment row 29 are ✅. The F03 evidence script was formatted for ruff, which PR #86's backend job had failed on. Next is F04 (simple accounts), handed to a new session.
