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

## 2026-11-11 — F04 accounts, demo account and favourite players (built, awaiting the owner)

The owner approved the plan as proposed ("Go with your recommendations"): favourites always belong to an account, the Favorite Players list is a header star (desktop) and a drawer section (phones), each favourite shows its latest season's photo and team, and the Planner's local bearer sign-in is left as it is. Branch `feat/f04-accounts`, cut from PR #86's head (#86 was still open) so it merges cleanly after it.

**Backend.**
- Migration `3c4d9e1f0a21` (additive): `users` gains `display_name`, `account_enabled`, `is_demo` and `session_version`; new table `user_favorite_players` (user, player, added at; cascade on user delete).
- The two fantasy-league seed users already in the database (`demo@courtlens.dev`, `demo@courtload.dev`, public fixture passwords) come out disabled. `courtlens set-password` enables one deliberately.
- `POST /api/auth/register` is gone. `/api/auth/token` and `/me` stay for the local Planner and return 404 in production.
- New endpoints: `/api/auth/session`, `/api/auth/demo-session`, `/api/me`, and `/api/me/favorites` (GET, plus POST and DELETE per player). In production they require `COURTLENS_ACCOUNT_PROXY_TOKEN` and a hashed client address.
- Sessions are stateless JWTs with their own audience and the account's `session_version`.
- Limits: 5 failed sign-ins per client and 10 per email in 15 minutes; 20 demo sign-ins per client an hour; 120 favourite writes an hour; at most 100 favourites per account.
- CLI: `create-user`, `set-password`, `disable-user`, `revoke-sessions`, `list-users`, `seed-demo-account`, `reset-demo-favorites`, `import-workspace-favorites`.

**Dashboard.**
- `/api/account/*` proxy: same-origin writes; the session lives in an HttpOnly, Secure, SameSite=Lax cookie and is forwarded as a bearer token; the response body never carries it.
- `AccountProvider` holds the account and its favourites. `useWorkspace()`'s favourites now read it, so the existing hearts (player page, Stats preview rail and detail drawer) and the scatter plot follow the account. Views, boards and the compare tray stay install-wide.
- Header: star popover with the Favorite Players list (season photo, logo beside the code, season; remove buttons) and an account control ("Sign in", or the account's name with Sign out). Below 1600 px the account control shows its icon, so the search pill stays readable. On phones both move into the drawer.
- Sign-in dialog: email and password, "Use the demo account", the limit's wait in words, "Accounts are by invitation only".
- Stats: the existing star filter reads the account's favourites on the server from the cookie. Signed out, it opens sign-in; a `favorites=1` link shows a sign-in note, never every player.

**Hosted demo** (not deployed).
- Caddy allows `POST /api/account/(session|demo|sign-out)` and `POST`/`DELETE /api/account/favorites/<digits>`. `/api/auth/*` and `/api/me/*` writes are refused, so only the proxy reaches them.
- New secret `COURTLENS_ACCOUNT_PROXY_TOKEN` in `secrets.env` (Compose refuses to start without it). `deploy-vps.sh` seeds the demo account.
- A `demo-reset` Compose service resets the shared list at 08:00 UTC and stores nothing that grows. Documented in the [deployment guide](deployment.md#accounts-and-favourites-finish-plan-f04-2026-11-11).

**Checks.**
- pytest: 26 account API tests (invite-only, sessions and revocation, the proxy token, sign-in limits per client and per email, per-user isolation, the 100 cap, demo sharing and reset, bounded limiter memory) and 3 PostgreSQL migration tests. Full suite: 2,742 passed, 8 failed. The 8 are the Anthropic provider tests, which fail the same way on unmodified main: the local venv has `httpx2`, and the SDK expects `httpx.Client`.
- mypy (388 files), ruff and ruff format: clean. Dashboard lint, typecheck: clean. Vitest: 918 passed (10 proxy and 8 account component tests new). Correction: the first PR push failed one of these in CI. The password stayed in the closing dialog's frozen exit copy, and a local rerun showing `1 failed` was missed. The field is now cleared on submit, and the 918 were re-measured after that fix.
- Playwright, `f04-accounts` (8 tests) with the touched specs (visual baselines, header and palette, Stats preview, player profile, table interactions, Stats entrance, accessibility): 126/126 on each of three runs.
- Full Playwright on the sandbox build (mock API 4180, dashboard 3180): 649 passed, 17 skipped, 0 failed.
  - Earlier runs found two real problems, both fixed. The Planner's own "Sign in" button now shares a name with the header's, so its specs scope to the page. The mock's `/api/me` prefix also caught `/api/metric-backtest`.
  - Two runs made while pytest was also running had timing flakes (Last X Games, Saved Operations, WOWY). Each passes three times in isolation.
- Caddy: `scripts/check_caddy_allowlist.sh` with the pinned image, 26/26 ([`caddy-allowlist.txt`](evidence/finish/f04/caddy-allowlist.txt)). `docker compose config` refuses a `secrets.env` without the new token. The reset loop's schedule was checked in the API image (GNU date; next run 08:00 UTC).
- Real data (read-only, owner's database): all eight seeded demo players resolve with names, season 2026-27 and current teams.
- Screenshots viewed at 1440 and 390. The first pass found the search pill squeezed to "Se…" at 1440, so the account control shows its icon below 1600 px. It also found two logos per favourite (photo badge and code), so the photo badge was dropped.

**For the owner, locally:** `alembic upgrade head`, then `courtlens create-user --email … --name …` and `courtlens import-workspace-favorites --email …` (copies the old install-wide list; local favourites are empty until you sign in). On the VPS, add `COURTLENS_ACCOUNT_PROXY_TOKEN` to `secrets.env` before the deploy.

Evidence: [`f04`](evidence/finish/f04/README.md). 👀 for the owner's look.
