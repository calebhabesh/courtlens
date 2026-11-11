# Finish plan

The owner's last list before calling CourtLens finished (2026-11-10). It keeps every analytical,
identity, data and source contract, the Research pages pattern
([alignment plan](databallr-alignment-plan.md), "Settled in …") and the control kit. Work one block
at a time, in order. Record measured evidence in the [finish progress log](finish-progress.md).
Only the owner marks a block ✅.

Owner decisions, 2026-11-10:

- Win Probability gets a uniform design pass first, so it looks like the other Research pages, and
  then a model upgrade. The owner plans the model work separately.
- Ask evaluation (RD19) is cut. Public Ask on the hosted demo replaces it.
- Stats follow-up 84 is approved.
- RD18 suggestions 3 and 6, simple accounts with a demo account, and Ask's direct answers to history
  questions are in scope ("not optional").
- The stale rows 18–29 of the alignment catalog are tidied (docs only, done 2026-11-10).

| Block | What | Status |
| --- | --- | --- |
| F00 | Public Ask live on the hosted demo, checked with a real question | 🛠 deploying |
| F01 | Ask answers history questions directly | ⬜ |
| F02 | Shot Aftermath: position grid and after-make vs after-rebound chart (RD18 suggestions 3, 6) | ⬜ |
| F03 | Win Probability: uniform design pass (RD14) | ⬜ |
| F04 | Simple accounts and a demo account; favourites saved per user | ⬜ |
| F05 | Win Probability model upgrade | ⬜ owner-led |

## F00 Public Ask live

PR #81 (public Ask, stats-tool repair) and PR #82 (https origin behind TLS, Caddy restart on config
change) merged. Deploy main, then ask one real question through the public site and confirm:

- the counter drops from 3 to 2;
- the asker sees their own thread and a stranger sees none;
- deletes and other writes stay refused.

## F01 Ask answers history questions directly

Measured 2026-11-10 on the hosted configuration (no web search): "Who won the 2016 NBA Finals,
and what made it historic?" was answered correctly. But it spent 6 provider calls and stopped at
the token limit, after three failed tool calls: the awards registry lacks 2015-16, a team name went
to `lookup_entity`, and an invalid team query followed.

- **Cause first.** Read the prompt (`agent/prompt.py`), the awards registry's coverage and the tool
  errors. Decide whether the model needs to be told what the tools don't cover, or the tools need to
  return a "not covered, answer from general knowledge" error it can act on.
- **Contracts.** Facts outside the warehouse stay labelled general knowledge with no invented
  numbers (assistant agent handoff). Don't change the frozen tool declarations: the replay tests pin
  them byte for byte, so route through error payloads and the prompt.
- **Evidence.** Collect a small set of history questions: champions, MVPs and Finals before the
  registry's coverage, records, rule changes, eras. Count provider calls and correctness before and
  after, within one day's free quota. Pre-registration isn't needed: this is a product fix, not a
  Research result.

## F02 Shot Aftermath extras (RD18 suggestions 3 and 6)

From the RD18 open list. Both read the frozen R17 aggregate only; no new analysis.

- **(3) Positions by zone.** A compact grid of guards, forwards and bigs by zone, showing net and
  rebound cost with 95% intervals. Use the page's colour rules: green or red only where the interval
  excludes zero, thin cells dimmed, positions labelled as estimates.
- **(6) After a make against after a rebound.** On the After a defensive rebound view, opponent
  points per possession after a make and after a rebound, side by side against the league line.

Follow the usual design-round process: the owner's instructions recorded in the
[Research design catalog](research-design-catalog.md) RD18 section, a real-data check, touched specs
×3, full Playwright for shared code.

## F03 Win Probability uniform design pass (RD14)

The owner's instruction: make it look like the other Research pages. Model, frozen results,
prospective ledger and API stay unchanged. The page follows the Research pages pattern: centred
hero, 992 px column, answer first, `StatsGrid` tables, whiskers and intervals, pass and fail in
words, collapsed About with the identifiers.

Start with a before-read and a content check: what the page shows, what the R15b freeze serves, and
the prospective record since 2026-11-05. Then propose a layout to the owner, record their answer
in the catalog, and build in rounds until the owner gives ✅.

## F04 Simple accounts and a demo account

Owner, 2026-10-20 and 2026-11-10: simple accounts so preferences such as favourite players belong
to a user, plus a demo account.

**What exists:** a `users` table, JWT helpers and an `/auth` router from the early fantasy-league
work (`api/routers/auth.py`, `api/dependencies.py`, `security.py`), and install-wide workspace
favourites that no page reads (`api/routers/workbench.py`).

**Scope:**
- sign in and out, with the session in an HttpOnly cookie through the dashboard's server proxy;
- favourite players per user (add or remove from player pages and Stats);
- a Favorite Players list in the app shell (alignment row 0);
- a Stats Favorites filter;
- a demo account that anyone can enter with one click.

**Decide with the owner before building:**
- open sign-up or invite-only;
- whether the demo account's favourites are shared and reset nightly;
- which other workspace features (saved views, boards) move to accounts now.

**Hosted demo:** add the new writes to the Caddy allowlist ([deployment guide](deployment.md)).
Keep the operator token off the dashboard, as with the Ask token. Rate-limit sign-in.

## F05 Win Probability model upgrade (owner-led)

Planned by the owner separately. Constraints the plan inherits:

- **v1 stays as it is.** It was frozen 2026-11-04 (R15b) and has been scored prospectively on
  2026-27 games since 2026-11-05. Don't change it in place.
- **The upgrade is a new registration.** Register it before fitting, with out-of-time splits and
  gates fixed in advance, and compare it with v1 on the same games.
- **Report it honestly.** Show calibration and intervals; no picks or certainty language; publish a
  negative result if v2 doesn't beat v1.
- The page from F03 shows both versions if v2 is accepted.
