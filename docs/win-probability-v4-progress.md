# Win Probability v4 progress

Measured evidence for the [Win Probability v4 plan](win-probability-v4-plan.md). Newest last.

## 2026-11-11 — Plan and draft registration written; nothing fitted or built

Planned with the owner in one session (decisions W-D1 to W-D13 in the plan). The draft
registration `courtlens-win-probability-v4` loads through `load_registration` and is **not yet
committed**: W0 commits and pushes it, with the commit date as `registered_on`, before any fit.

Facts measured for the plan, on the owner's PC:

- Closing lines cover 2020-21 to 2025-26 (7,942 rows including playoffs, median 5 minutes before
  tip-off, all with a home point).
- The Original's prospective record stood at 53 games (2026-11-04 to 2026-11-10); seals were taken
  once a day at about 13:45 UTC.
- `scripts/deploy-vps.sh` mirrors `derived/win-probability-serving` with `--delete`, and the API
  mounts it read-only.

## 2026-11-11 — W0: registration committed, not yet pushed

The owner approved the plan and the registration text ("approved, commit the plan and registration
on a branch"). `courtlens-win-probability-v4` was committed alone, before any fit, on branch
`feat/win-probability-v4`: commit `d868ebcaf1b4eba10b5ee66f480c990b7280199f`, content hash
`654b26bab5ee149999f69934e7cdcf288dafd31985cb2d375a32754972225085`, `registered_on` 2026-11-11.

Still owed for W0: push the branch before W1 starts, so the registration is dated publicly before
any fit.

## 2026-11-11 — W1: stages S and C measured; all gates pass, work continues

Setup: the registration branch was pushed before any fit; work ran in the worktree
`~/dev/courtlens-wp4` (its tracked `data/` replaced by a symlink to the main checkout's data, the
four `.gitkeep` files set skip-worktree). New files only: `evaluation/win_probability_v4.py`,
`scripts/run_win_probability_v4.sh`, `tests/unit/test_win_probability_v4.py`. Evidence:
[docs/evidence/win-probability-v4](evidence/win-probability-v4/README.md).

- **Pre-fit checks** (no fit): own forecast = `mu_from_entry` with the manifest's coefficients
  (max diff 3.6e-15, 13,088 games); RMSE 14.163 own and 13.708 line on 2024-25 and 2025-26; the
  Original's log loss 0.4028 on the stage C states. All match.
- **Lines to games.** The parquet is keyed by ESPN event id and v2 had ESPN ids only for 2024-25
  and 2025-26. With the owner's approval, ESPN scoreboards for the 629 game dates of 2020-21 to
  2023-24 were read (52 min, 5 s pacing) and matched by date, teams and final score: every game
  matched. Games without a line: 10, 1, 1, 0, 0, 0 (2020-21 to 2025-26).
- **Stage S** (2023-24): w = 0.720 on 2022-23 (1,228 games; regression check line 0.740, own
  0.194). K1 0.3971, K2 0.3969, Original 0.4036. K2 against K1 +0.0002 (90% −0.0006 to +0.0009):
  **K1 kept.** Selection log committed and pushed (0a1ec88d) before stage C. 1 min 52 s, 2.4 GB.
- **Stage C** (2024-25 and 2025-26, read once; 19 s, 633 MB): w = 0.906 on 2022-23 and 2023-24
  (2,444 games; regression check line 0.905, own 0.102). Log loss 0.3938 against the Original's
  0.4028. **D1 passes**: +0.0090 (95% +0.0056 to +0.0126). **D2 passes**: squared error +12.39
  (+9.28 to +15.41); RMSE mu4 13.719, own 14.163, line 13.708; winners 69.5%, 68.4%, 69.5%.
  **A2 passes**: calibration error 0.0086. By phase the gain is +0.015 in the first half, fading
  to +0.0002 in the last two minutes; overtime −0.0045 (−0.0147 to +0.0056, 114 games).
- **Green:** 13 new unit tests pass; strict mypy (390 files) and Ruff clean. The full Python
  suite: 2,762 passed and 9 failed, and all 9 fail on `main` too — 8 `test_agent_providers`
  Anthropic cases (the main venv's `anthropic` SDK rejects `httpx2.Client`) and
  `test_no_unexplained_legacy_brand_references` (`docs/finish-progress.md:89`, from F05). Not
  touched here.

Under the registration the work continues: W2 next, after the owner reads this result.

## 2026-11-11 — W2 part A: seal v2, the seal job and the VPS service built and proved locally

Built in the worktree on `feat/win-probability-v4`; the cutover (part B) has not run. Nothing
on the VPS, the main checkout, its `.env` or any systemd unit was changed. Every trial ran against
a copy of the serving directory under `~/.cache/courtlens-tmp`, in a scratch tree laid out like the
VPS (only `artifacts/win-probability`, `derived/win-probability-ratings`, `derived/espn-rosters-v1`,
`raw/sportsdataverse_2025` to `2027`, an empty `raw/espn-wp`; no `derived/impact-history-v2`).

New: `services/win_probability_seal.py` (seal v2, `seal_slate`, the job `run`, `next_run`), the CLI
command `seal-win-probability [--next-wake]`, the setting `win_probability_local_sealing` (default
true), `scripts/win-probability-push.sh` and `scripts/install_win_probability_push.sh` (replacing
`sync-win-probability.sh` and its installer), the Compose service `win-probability-seal`,
`tests/unit/test_win_probability_seal.py` with line fixtures in
`tests/fixtures/win-probability-lines/`. Changed: `refresh-daily`'s win-probability step reads the
setting; `deploy-vps.sh` no longer mirrors `derived/win-probability-serving` and only creates it and
`raw/espn-wp`; the deployment guide. No existing function in `win_probability_production.py` or
`win_probability_pregame.py` changed; the pinned files are untouched.

- **Seal v2** (`courtlens-win-probability-pregame-v2`). Each game keeps every v1 field and adds
  `line` (home margin, spread, book, details, favourite), `players` (id, name, expected minutes,
  rating, default flag), `out` (each Out roster player with minutes, rating and absence cost),
  `form_split` (team form and home court), `ages` (box scores through, roster observed and
  checked, rating cutoff, injury report time), and null `mu4`, `w` and `tip_off_home` for W3.
  Absence cost and the form split come from extra targets in the same `build_entries` pass (the
  player added back; a neutral-site copy), so the real target is computed exactly as in v1.
- **Parity, real slate** (2026-11-11, 10 games, the same fetched bytes): every v1 field identical
  in all 10 v2 records, `inputs` included; the frozen model's probabilities on a fixed state grid
  differ by 0.0. Unit test on a synthetic slate: identical inputs and identical `score_game` rows.
- **Line sign.** ESPN's `spread` is the home spread, like the parquet's `home_point`; market home
  margin = −spread. Kept scoreboards: 77 of 77 lines name the favourite the sign gives. ESPN game
  summaries' `pickcenter` for 2024-25 and 2025-26 against the parquet: 977 games, sign agrees on
  973, median difference 0.0, p95 0.5. The four that disagree are lines crossing zero or a moved
  line (401810569: ESPN MIN −7.5, parquet −5.0). Fixtures from both are unit-tested.
- **Seal only on change.** Run 1 sealed one game, whose line moved from NO −3.5 to −2.5 in the
  minute after the parity seal; run 2, 22 s later, wrote nothing (`seal_changed: []`).
- **Scoring parity.** 2026-11-10's 6 games removed from a copy and rescored by the job: the
  scorecard rows, availability rows and 141 win-probability-added rows equal the real files'
  rows; the summary differs only in `updated_at`. Three nights (2026-11-08 to 10, 21 games,
  474 credit rows): all identical.
- **Memory and time** (PC, cgroup peak): nothing to score 22 s, 338 MB; 21 games scored 127 s,
  338 MB (the peak is loading three seasons of boxes). Compose cap 768 MB, one CPU.
- **Disk.** A v2 seal is about 5 KB per game (53 KB for 10). Raw ESPN files: scoreboard 12 KB,
  injury report 51 KB, summary 41 KB each, about 2 MB a day at most. Under 1 GB a year together.
- **VPS, read only** (2026-11-11): uid 1001 `ubuntu` owns the data; the API image runs as uid 999,
  so the service runs as `1001:1001`. Box files 2025 to 2027, ratings and the roster bundle are
  present; a dry-run push shows them current (only the roster heartbeat differed). No
  `raw/espn-wp` yet (the deploy creates it). 159 GB free of 193 GB; 20 GB of 24 GB memory
  available; release 8ef78660.
- **Schedule.** One run at container start, 09:00 Eastern, then every 30 minutes from noon while a
  run lands before the day's last scheduled tip (tested across the March clock change).
- **Resilience.** A scoring failure (an odd ESPN summary, say) is reported as `score_error` and the
  run still seals; a failed run retries in 30 minutes.
- **Green:** 29 new unit tests; the Original's serving and pin tests pass untouched. Full suite
  2,790 passed, 9 failed, the same 9 that fail on `main` (8 `test_agent_providers` Anthropic cases,
  `test_no_unexplained_legacy_brand_references`). Strict mypy (391 files), Ruff check and format
  clean.

Next: part B, the cutover, on the owner's word. Until then nothing changes on merge: local
sealing stays on, and the first deploy after the merge is the cutover deploy.

## 2026-11-11 — W3 offline part: stage F, ESPN-state parity and latency pass; nothing frozen

The owner approved starting W3's offline part on the same branch before the cutover ("start W3's
offline part today… so it is in tomorrow's deploy"), limited to stage F, the offline freeze
checks, the v4 predict path and an arm64 check command. Written only under
`data/derived/win-probability-v4` and `docs/evidence/win-probability-v4`; no manifest, model
file, pin test, serving file, v4 scoring, API or dashboard change. Evidence:
[README, W3 offline part](evidence/win-probability-v4/README.md).

- **Stage F** (K1): w = **1.0** on 2022-23 to 2025-26 (4,883 games; unclipped 1.0115, clipped to
  the registered bound; regression check line 1.002, own 0.025). The weight rose 0.720, 0.906,
  1.0 across stages S, C and F. With a line, v4's pregame forecast is the line; with none, the
  own forecast. The plan's risk table covers this: publish as measured.
- **ESPN-state parity** (stage C's w, 2,439 games): log loss +0.00053 at the same times and
  +0.00016 on ESPN's own sample, limit 0.002. **Passes.** The archive states reproduce stage C's
  saved predictions through the serving path to 3.0e-8 (float32 storage).
- **p95 latency** (w 1.0, 200 games, one thread): 21 ms, limit 100 ms. **Passes.**
- **Platform reference** (w 1.0): 1,902 states; the stdin check passes on x86 (0.0).
- **Code.** `services/win_probability_market.py` (the predict path: the Original's model with
  mu4); `evaluation/win_probability_v4_checks.py` (`parity`, `latency`, `platform-write`,
  `platform-check --reference -`); stage `final` in `win_probability_v4.py`; optional `mu_for` and
  `reference` hooks in `win_probability_parity.run` and the platform check (defaults unchanged: v2's
  platform check still gives 0.0 on its committed reference, and its sampled states are identical);
  `scripts/win_probability_v4_platform_check.sh` runs the arm64 check in the VPS API container with
  the reference on stdin.
- **Green:** 8 new unit tests. Full suite 2,799 passed, 9 failed (the same 9 that fail on `main`). Strict mypy (393 files), Ruff check and format clean.

Next: tomorrow, after the cutover is confirmed, run `scripts/win_probability_v4_platform_check.sh`
and report. The owner decides on the freeze.

## 2026-11-11 — Plan revised: W2 and W3 splits recorded, W7 added; nothing built

Plan text only (Fable 5.2, with the owner). No code, data, VPS or timer was changed.

- **W-D14.** The plan now records what was agreed after W1: W2 in two parts (A built, B the
  cutover), W3 as W3a (final fit, checks, freeze) and W3b (both models scored afterwards from every
  seal since the freeze), and the dated protocol note as a committed file whose API field ships in
  W3b.
- **W-D15, block W7.** The owner wants CourtLens to run entirely on the VPS, like their other
  projects ("self sustaining"). W7a surveys every job and tries every source from the VPS; W7b
  moves the data directory, the database, rosters and the daily refresh; W7c moves the rest and
  adds backups and job health. It runs after W3b and before W4.
- **Measured for W7 on the PC today:** daily refresh 11 min and 2.9 GB peak; rosters 2.6 min and
  265 MB; lineups 40 to 58 min and 1.0 GB; Metric Backtest seconds and 180 MB; the season impact
  job has had no real run this season. Data: 6.7 GB raw, 5.4 GB derived, 4.6 GB artifacts.
- **Not known yet:** whether any source refuses the VPS's address, and how each job behaves on
  arm64. W7a answers both before anything moves.
- "How to work through this plan" now carries the worktree, Python, trial-run and known-failure
  notes, so a new session needs only the plan, the registration and this log.

Next is unchanged: W2 part B on the owner's "cut over", then the arm64 check and the freeze (W3a).

## 2026-11-12 — W2 part B: the cutover; the Original's seal now runs on the VPS

Run by a scheduled session on the owner's advance authorization (handoff
`~/dev/courtlens-cutover-handoff.md`; the full command log is in `~/dev/courtlens-cutover-log.md`).
Nothing frozen, nothing marked ✅.

- **Gate 0.** The PC's `refresh-daily` ran 08:35–08:46 ET and succeeded; it sealed today locally
  (v1, 13:46:34Z) as before.
- **Merge.** #92 merged at 13:52Z as `8afa373d`. CI's first run failed in the dashboard job as well
  (2 Playwright tests in the R10 Wingspan calculator spec; the same job failed on `ac57a8db` and
  passed on the runs either side), so Images was skipped and the session stopped. With the owner
  present: the failed jobs were re-run (dashboard passed; backend again only
  `test_no_unexplained_legacy_brand_references`), and Images was dispatched by hand (run
  43244641923, success), as for 8ef78660.
- **Push and deploy.** The PC's serving bundle was pushed once (no `--delete`), then
  `scripts/deploy-vps.sh` from the worktree at `origin/main` deployed release `8afa373d` (10:25 ET).
- **The VPS seal.** The service's first run (15:25:07Z) sealed all 4 of today's games (v2, every
  game with a line): `pregame/2026-11-12.4fada14d….json`. Next run noon ET.
- **Scoring check.** A one-off `docker compose run --rm` re-scored 2026-11-11's 10 games on copies
  of the serving and `raw/espn-wp` directories inside the container. Same game ids as the PC's
  scorecard; 2 rows byte-identical, 8 differing only in score floats, max 1.1e-16, nothing else.
  The live scorecard's hash was unchanged before and after.
- **Resources.** Seal service idle at 5 MiB of 768 MiB; API 170 MiB; host 2.6 GB of 24 GB used;
  disk 36 GB used, 158 GB free. `/api/health` ok, `/api/win-probability` 200.
- **PC switch.** `main` pulled; `.env` now sets `COURTLENS_WIN_PROBABILITY_LOCAL_SEALING=false`;
  `courtlens-win-probability-push` installed (after `refresh-daily` and `refresh-espn-rosters`).
  Its first run pushed the four inputs and pulled the VPS's seal back (15:29:01Z). No old sync unit
  remains.
- **Protocol note.** `evaluation/research/derived/courtlens-win-probability-v2-protocol-notes.json`:
  cutover 2026-11-12T15:25:07Z; first games affected 401909976 (TOR @ PHI) and 401909977
  (DET @ WAS), both tip 2026-11-13T00:00Z.
- **arm64 parity (W3a step 1).** `scripts/win_probability_v4_platform_check.sh`: 1,902 states,
  max_abs_difference **2.22e-16**, limit 1e-9, **passes** (aarch64, Python 3.12.16, against the
  x86 reference). Evidence written to `docs/evidence/win-probability-v4/platform-arm64.json` in
  the worktree, not committed.

Still to do: check the VPS's runs through tonight and tomorrow's 09:00 ET scoring run before W2 is
called done; update the deploy guide's evidence; the owner's decision on the freeze.

## 2026-11-12 — W3a: v4 frozen; seals moved to 5 minutes before tip

On the owner's "freeze" (with the owner present). Nothing serves v4 yet; W3b scores both models
from the seals. Not marked ✅: only the owner does that.

- **Freeze.** `evaluation/research/frozen/courtlens-win-probability-v4.json` (manifest sha
  `ac2c4701`), written by `evaluation/win_probability_v4_freeze.py` with the pin test
  `tests/unit/test_win_probability_v4_freeze.py` (PR #96). `frozen_at` 2026-11-12T17:00:42Z;
  commit `90d022d5` pushed **2026-11-12T17:14:57Z**, the plan's freeze time. K1 at w = 1.0
  (unclipped 1.0115) on the Original's manifest `b2b0db82` and its three model files, unchanged.
  The manifest records the three freeze checks (ESPN-state parity, p95 21 ms, arm64 2.2e-16 over
  1,902 states, limit 1e-9) and the hashes of the five evidence files. The freeze refuses a failed
  check, an arm64 check at another w, and a second run (all tested). 69 win-probability tests
  pass; strict mypy (394 files) and Ruff clean.
- **First slate that counts.** By the registration, 2026-27 regular-season games tipping after the
  freeze that have a seal: first 401909976 (TOR @ PHI) and 401909977 (DET @ WAS), tip
  2026-11-13T00:00Z. The VPS's noon run (17:00:03Z) was clean: 4 games sealed, each with a line.
- **Seal times (owner's decision, PR #95, release `3988ffc4`).** Runs moved from :00/:30 to
  :25/:55 Eastern. Tips are on the hour or half hour, so the run at a tip's own time had landed
  after it and each game's last seal was 30 minutes old, before most game-time decisions (the
  league's injury report updates every 15 minutes to tip-off). Now it is 5 minutes old. The rule
  for which seal a game uses, the seal's contents and both models are unchanged; second protocol
  note added. First run in the new release 17:45:32Z, next 17:55:00Z.
- **CI.** #94 made the backend job green (the legacy-brand test). The dashboard job still fails on
  the same 2 R10 Wingspan Playwright tests (failed on 2 of the 3 runs today, all retries), so
  Images was started by hand again (43272196653). That spec needs its own look.

Still to do: check tonight's seals (taken at 18:55, 19:55 and 20:55 ET) and tomorrow's 09:00 ET
scoring run on the VPS before W2 is called done. Next block: W3b.

## 2026-11-12 — W3b: both models scored from the same seals; reads and the serving rule built

Built the same day as the freeze, on branch `feat/wp4-w3b`. Nothing marked ✅; the owner's gate
is reading the first head-to-head.

- **Code.** `services/win_probability_head_to_head.py`: the frozen v4 manifest (hash-checked and
  tied to the Original's), K1 as `MarketModel` (the Original's model reading mu4), one row per
  game tipping after the freeze with both models on the same sampled states, V1/V2 with the
  registered game bootstrap (identical to stage C's `bootstrap_interval`, tested), the three-way
  result, the 300-game and final reads written once to `scorecard/head-to-head-reads.jsonl`, and
  `serving_model` (v4 unless a read finds V1 or V2 "worse"). The final read triggers the first time
  ESPN's scoreboard leaves the regular season in April to June. The seal job scores head-to-head
  after the Original and reports `head_to_head_error` without costing seals; seals after the freeze
  carry `mu4`, `w` and both tip-off probabilities. `/api/win-probability` gains `head_to_head` and
  `protocol_notes`; Live serves `live_probability` (the Original's line, unchanged, for games
  sealed before the freeze or while the Original serves). Win probability added stays on the
  Original.
- **v4 drift.** `evaluation/research/derived/courtlens-win-probability-v4-drift.json` from v4's
  stage C predictions with the Original's method (`win_probability_freeze.drift_interval`, now
  taking its prediction source; with its defaults it reproduces the Original's frozen manifest
  exactly). All test games' calibration error 0.0086; 292 30-day windows.
- **Dry run on real data** (a copy of the serving directory, the freeze moved to 2026-11-10 so
  real games count): 16 games scored; the Original's column equals its own scorecard rows exactly
  (largest difference 0.0). Those seals are v1 with no line, so mu4 = own, as registered. On
  today's v2 seal, w = 1 gives mu4 = the line (PHI −8.5 → 8.5; tip-off 0.577 → 0.747); the opening
  state's probability equals a real game's first state exactly, for both models.
- **Found by a test:** the opening state's `period` column is 1, not 0.
- **Green:** 27 new unit tests; win-probability tests 154 passed; full suite 2,837 passed, 8 failed
  (the 8 known Anthropic provider cases). Strict mypy (396 files) and Ruff clean.

Note: tonight's counted games were last sealed at 15:25Z, before the freeze, so Live shows the
Original's line for them unless a later seal is written (a line or Out change). They still count in
the head-to-head, from the same seal, as the registration defines.
## 2026-11-12 — W7a: jobs surveyed, every source reached from the VPS, runbook written

Nothing live changed. Runbook: [w7-runbook.md](evidence/win-probability-v4/w7-runbook.md), for
the owner's approval before W7b.

- **Jobs.** Five timers plus the push; the daily refresh's eight steps. Six hosts are fetched:
  `api.github.com`, `raw.githubusercontent.com` (hoopR), `www.basketball-reference.com`,
  `www.darko.app`, `en.wikipedia.org`, `site.api.espn.com`. Lineups, season impact, Metric
  Backtest, Projected Impact and the rating snapshots fetch nothing.
- **Sources from the VPS.** One document per host from a one-off API-image container (aarch64,
  policy User-Agent, no redirects, robots.txt first, 10 s between a host's requests, no database):
  **all six returned 200** with real documents. No source is refused; step 3 needs no decision.
- **Found:** since F04 the VPS database holds visitor rows the PC's does not (3 users, 8
  favourites, 10 Ask threads with 15 turns, 5 personal workspaces). Replacing the database as
  planned would erase them; the runbook carries them across (B4).
- **Season impact** has had no real run this season; it is measured on its first run (W7c C1).

Next: the owner approves the runbook; W7b on "move", 09:00 to noon Eastern, owner present.

## 2026-11-12 — W7b B2–B5: the VPS database is the PC's, with the visitors' rows

- **B2 data copy:** 18.9 GB to the VPS, nothing deleted (no `--delete`), file counts identical in
  raw, derived, artifacts and cache.
- **B3 restore:** `pg_restore -j 2` of the PC dump (alembic `3c4d9e1f0a21`) into `courtlens_next`
  while the live database served. Exact row counts of all 127 tables equal the PC's
  (`workbench_player_games` 2,688,980; `workbench_possessions` 2,935,327). Both dump copies and
  the PC's scratch dump deleted.
- **B4 visitor rows** (19:44Z, with `api`, `dashboard`, `demo-reset` stopped; the seal service
  kept running): the Ask tables, `user_favorite_players` and `workbench_personal_workspaces`
  truncated and restored from live; `users` upserted from live and the PC-only dev user deleted,
  **not** truncated, because `fantasy_leagues` references `users` and a cascade would have erased
  the fantasy tables. Every carried table's contents md5-identical to live (users 3, favourites 8,
  threads 10, turns 15, turn inputs 6, transcripts 6, workspaces 5). No sequences (UUID keys).
  Found while checking: only `fantasy_leagues` has a user FK beyond the runbook's list; it and the
  saved investigations already matched.
- **B5 swap:** `courtlens` → `courtlens_prev`, `courtlens_next` → `courtlens`; services started.
  `/api/health` ok, demo sign-in and its 8 favourites ok, Stats cohorts warmed (1 built, 170
  existing; first `/stats` 8.1 s cold, 0.7 s warm). `courtlens_prev` kept until the owner drops it.

## 2026-11-12 — W-D16: the own read leads; the Market-informed number is shown beside it

Owner's decision, recorded in the plan (W-D16) and as the fourth protocol note
(`registered_serving_rule_deviation`) before any code changed. Built on `feat/wp4-design-r3` in
the main checkout; **not committed, not deployed**. Nothing marked ✅.

- **Why.** With w = 1.0 the served pregame number was the line, and the "why" explained a number
  that was not the one shown. Stage F's check regression gave the line 1.002 and the own read 0.025.
- **Unchanged.** Both frozen models and their manifests, the seals, which seal a game uses, the
  Original's scorecard, the head-to-head rows, V1, V2, the record of calls and both reads. The
  registration is not edited.
- **Backend.** `head_to_head.LEAD = ORIGINAL`. `serving_model` reports the Original with the
  registered rule's answer under `registered_rule` (`registered_serving_model`, both flips still
  tested). `live_probability` returns the Original's line and swings, plus `market_informed`
  (model, market, points) for a game sealed after the freeze with a line. The breakdown's
  `prediction` is the own read (margin and the Original's tip-off chance); `market_informed`
  carries v4's margin and chance, or null. The card's call is the Original's, with
  `market_informed_home_win` beside it. `record_of_calls` adds `toss_ups_by_model`. The market
  row no longer depends on the serving model; status `original_serving` became `unavailable`
  (manifest unreadable).
- **Dashboard.** Described in the [Research design catalog](research-design-catalog.md) (W4/W5,
  2026-11-12). Fixtures rebuilt from the real 19:10:34Z seal, which carries both chances:
  PHI 56% (71% with the line), DET 88% (84%), MIN 71% (70%), PHX 57% (71%).
- **Screenshots.** `docs/evidence/win-probability-v4/own-read-leads/` (cards 1440 and 390,
  Pre-Game 1440, the page 1440 and 390), from the fixture build.
- **Green.** Win-probability unit tests 171 passed (5 new, others rewritten, for the lead rule, the
  Live payload, the breakdown and the card). Full unit suite 2,241 passed, 10 failed: the 8 known
  Anthropic provider cases, plus `test_production_rejects_wildcard_cors` (the local `.env` dev
  account flag) and `test_admitted_seasons_mapping_compatibility`; both fail the same way without
  this change. Strict mypy (400 files) and Ruff clean. Dashboard lint and typecheck clean; Vitest
  937 passed. Playwright in a sandbox build (fixture API): the 11 specs that touch Live or Win
  Probability, 90 passed, 1 skipped (the evidence spec). `live.spec.ts`'s three "phone … has no
  page overflow" tests failed once under load and passed on the next run; they fail the same way
  on the unchanged branch. The full Playwright suite was not run.
- **Fixed on the way.** `win-probability.spec.ts` still expected the hero to say "N games since
  the freeze"; it had failed since W5 round 2 changed the hero. It now checks the new hero.

- **Real data, API only** (the owner's local API, 2026-11-13 about 01:30Z, on the local copy of
  the 21:55:03Z seal). TOR at PHI in progress: the breakdown gives the own read PHI by 2.14 and
  56.3%, with `market_informed` PHI by 7.5 and 71.3%; the Live line is the Original's (228
  points, 56.3% at tip-off) with v4's beside it (228 points, 71.3% at tip-off, 68.8% against
  56.3% at 60–60). All four cards carry both chances. `/api/win-probability` serves four
  protocol notes and, through `page_summary`, `serving_model` worked out at read time (the
  Original, registered rule Market-informed), so a summary stored before this change cannot name
  the wrong lead.

Still to do: the owner's review on :3100 (the second line on a real game was checked through the
API, not in a browser); commit and deploy on the owner's word (the protocol note takes effect
with that release).

## 2026-11-12 — W-D17: a non-linear own read, tested once; it did not help

The owner asked whether a linear regression is too simple for the own read and left the choice
of testing it to the assistant. Run as one diagnostic; **not committed, not deployed**.

- **Registration.** `courtlens-pregame-nonlinear-v1` (content hash `7aa5302c…`, file sha256
  `1a38e023…`), written before any fit. It was **not committed or pushed before the fit**, which
  the Research plan asks for; the registration says so and the result records its hash. Code
  `evaluation/pregame_nonlinear.py`, runner `scripts/run_pregame_nonlinear.sh` (1 CPU, 1,024 MiB,
  600 s). The code was tested on made-up games only before the one real run.
- **Reference check.** Least squares on the 8,204 training games (2015-16 to 2021-22) reproduces
  the frozen coefficients exactly (largest difference 0.0; forecasts to 3.6e-15).
- **Settings, from the training seasons only** (forward validation, 4,562 games of 2018-19 to
  2021-22; the linear fit 13.462 points): trees alone 13.511 (stumps, 565 rounds); linear plus
  trees 13.458 (4 leaves, 54 rounds).
- **Result, 4,884 games of 2022-23 to 2025-26** (95% paired game bootstrap; above zero the
  candidate is better):

  | Forecast | RMSE | Winners | Squared-error gain | Result |
  | --- | --- | --- | --- | --- |
  | Linear (frozen, as served) | 13.727 | 67.7% | | |
  | Trees alone | 13.785 | 67.5% | −1.60 (−2.37 to −0.84) | worse |
  | Linear plus a tree correction | 13.726 | 67.6% | +0.03 (−0.23 to +0.27) | not distinguishable |

  The correction averaged 0.28 points and never exceeded 0.80. By season the correction is not
  distinguishable in all four; trees alone are worse in 2024-25 and 2025-26.
- **Reading.** The linear form is not what limits the own read: the interval's upper end, 0.27
  squared points, is about 0.01 points of RMSE. Two tree models do not cover every non-linear
  model. The seasons are not fresh (read before as selection, calibration and test seasons).
- **Published.** `evaluation/research/derived/courtlens-pregame-nonlinear-v1.json`;
  `/api/win-probability` gains `pregame_nonlinear`; the page has one finding under "What didn't
  help" and a "Why linear" line on the flow's Own read tab. Screenshot in
  `docs/evidence/win-probability-v4/pregame-nonlinear/`.
- **Run.** 17.6 s, peak 421.7 MB, LightGBM 4.7.0, x86_64.
- **Green.** 10 new unit tests; strict mypy (401 files) and Ruff clean; dashboard lint and
  typecheck clean, Vitest 938 passed; Playwright in a sandbox build: `win-probability`,
  `win-probability-v4` and `live-prediction` specs, 20 passed, 1 skipped.

## 2026-11-13 — W-D16 and W-D17 committed on the owner's word; checked before the commit

The owner said to commit and deploy (about 00:10 ET). Committed on `feat/wp4-design-r3` and pushed
to pull request #104. **Not merged, not deployed.** Nothing marked ✅.

- **Committed.** W-D16 (the own read leads), W-D17 (the non-linear test) and the possessive
  sweep ("CourtLens'" for "CourtLens's" in copy, docs and docstrings; 43 files change in nothing
  else). Registrations and the zTS runner's stored result text keep the old wording; the
  registrations are hashed.
- **Track record wording.** The owner read "first grades at 9:00 ET" as 9 PM. Both phrases on the
  page now say "9:00 AM ET".
- **Two tests fixed.** `win-probability-v4.spec.ts` checked that the date strip marked the 12th
  and so failed from 2026-11-13 on; it now fixes the clock to the fixture's day.
  `live.spec.ts`'s three "phone … has no page overflow" tests matched `.live-page` twice while
  React swaps the streamed page in (the known failure on `main`'s CI); they now wait for the
  visible one. Each passed three runs in a row.
- **The first grades, checked on the VPS (read only, 05:10Z).** The seal service's last run
  (01:55:03Z) reports no error and its next run at 14:00:00Z, 09:00 Eastern. All four of
  2026-11-12's games have seals written after the freeze (20:25Z to 21:55Z). The VPS still runs
  release `14139203` (W3b); it has no `jobs` service, and the PC's timers and its push still run.
- **Green.** Full Python suite 2,874 passed, 8 failed (the 8 known Anthropic provider cases);
  strict mypy (401 files) and Ruff clean. Dashboard lint and typecheck clean; Vitest 938 passed.
  Full Playwright in a sandbox build (fixture API, 4 workers): 648 passed, 5 failed, 17 skipped,
  7 did not run. The 5: the four tests fixed above, and `f04-accounts.spec.ts`'s first test,
  which reached for the fixture API on port 4100 because the run did not pass the sandbox's port;
  run again with it, all 8 accounts tests passed (the 7 that did not run are its serial
  followers).

Still to do: the owner merges #104. The deploy of `main` is also W7b's B6 and B7: it stops
copying data and starts the `jobs` service on the VPS while the PC's timers and push still run,
so it belongs in the runbook's window (after the 09:00 ET seal run, before noon, owner present),
followed by B8 to B11.

## 2026-11-13 — W7b B1, B6–B11 on the VPS; grading moved to right after each game

With the owner at the PC from about 11:15 ET. Releases `5d608d81` (#104) and `61de4107` (#105)
deployed. Nothing marked ✅.

- **First grades (09:00 ET run, 14:00:03Z).** 2026-11-12's 4 games scored for both models, no
  error: the own read, the Market-informed model and the line each called 4 of 4.
- **B6, deploys stop copying data.** Before and after each deploy, nothing under `data/` changed
  except the seal service's and the jobs' own files (`find data -newer <marker>`).
- **B7, the `jobs` service** started with `5d608d81`. Each job recorded a first-seen baseline and
  waits for its next scheduled time; `GET /api/job-health` serves them.
- **B1.** The PC's push unit removed at 16:19Z.
- **B8, rosters.** The VPS (157 s) and the PC (154 s, 211 MB) ran at the same minute. Same 522
  players, all equal field for field; the bundle hashes differ only because the roster digest
  includes the player-index dataset id, which each database assigns itself. PC roster timer
  removed.
- **B9, the daily refresh.** First VPS run: 234 s, 408 MB, exit 0, but the statistics release
  did not advance: the PC's push had already copied the morning's box scores, so the step saw
  nothing new and skipped the publish. Forced (`refresh-season-stats --force`), it then failed in
  dbt: the image installs the package into site-packages, so the dbt project path pointed at
  `/usr/local/lib/python3.12/warehouse`. Fixed in #105 (`warehouse_dir()`, plus
  `DBT_TARGET_PATH`/`DBT_LOG_PATH`, since uid 1001 can't write the image's `/app/warehouse`).
  The failed attempt had imported a dataset that was never published; the next publish retired
  it. With `61de4107`: 828 s, 1.1 GB peak, dbt 93 of 93, 171 Stats cohorts built. **Equal to the
  PC's release:** 32,925 mart rows; 2026-27 regular season 531 rows, 39,416 points, 15,227
  rebounds, 9,100 assists, 83,898.8 minutes; 2,689,351 player games. Box-score CSVs identical by
  hash. DARKO: 528 players, ratings identical (only ids and timestamps differ). Wikipedia bundle
  identical by hash. PC daily timer removed.
- **B10, rating snapshots.** The refit failed on the VPS too: it checks sealed contracts and
  evidence under `docs/` (IM03 acceptance, IM04 artifacts, `docs/design`) that the image didn't
  ship; the weekly season impact reads the same files. Added to the image in #105 (about 4 MB).
  With them mounted into the then-current image, the 2026-11-01 snapshot refit on the VPS (325 s,
  1.3 GB) equals the PC's file to **5.8e-11** over 1,076 players (limit 0.01); the intercept and
  home terms differ in the 14th digit, so no sealed game's own forecast moves. The newest
  snapshot was not replaced. No snapshot is due until 2026-12-01.
- **B11.** During the daily run the public `/api/health`, `/api/win-probability` and
  `/api/live` stayed under 0.11 s p95 (20 samples each). `/stats` took 8 s for about 15 minutes
  after the publish, until Postgres auto-analyzed `workbench_player_games` (18:36:41Z); then
  0.79 s. Disk: 124 GB free of 193 GB, `data/` 18 GB.
- **Grading right after each game** (the owner's decision, #105). The seal job scores today's date
  and keeps running at :25 and :55 Eastern after the last tip while a game that tipped within six
  hours is ungraded; 09:00 stays as a catch-up. Fifth protocol note `grading_time_moved`. The
  first run in `61de4107` (18:19:50Z) saw today's 9 games as not final and reported
  `awaiting_grade: []`.

Still on the PC: the lineups, Metric Backtest and season impact timers (W7c C1) and the scratch
cleanup. Next: tonight's grading runs (check the log after the last game), then W7c.

## 2026-11-13 — W7c and W6 done; the owner marks the project finished

The owner asked for the rest to be finished and the whole project marked finished. Their answers
the same evening: cut R16; mark W7c ✅ now and log the checks that need calendar time as
follow-ups; drop `courtlens_prev` after the restore test.

- **C1, jobs moved.** Lineups first failed on the VPS: `deploy/pinned.env` pinned the impact
  serving and team-splits manifests to files, and the job needs the directories. Both now name
  the directories, which serve the same bundles today (each `.current` pointed at the pinned file;
  checked in the API container). Only `api` and `jobs` were recreated (`--no-deps`); the seal
  service kept running through tonight's slate. The rerun then took over an hour and hit the job's
  1-hour timeout: retiring yesterday's provisional dataset cascades to `workbench_stint_players`
  by `stint_id`, which no index led with, so each of about 10,000 stints scanned 7.5 million rows
  (the PC's runs took 45 minutes for the same reason). The orphaned delete was cancelled (rolled
  back), the index built concurrently by hand on the VPS (60 s, 95 MB) and added as migration
  `4d5e6f7a8b92` (if-not-exists, so the next deploy skips it; up, down and up again on a
  throwaway Postgres 17). Rerun: **52 s, 412 MiB peak**, output identical to the PC's run of
  09:06 Eastern: quality 147 clean, 7 patched, 20 excluded; dataset `b87509d6…`; stint box
  `f5a43284…`; the same dataset retired; 447 working files pruned. Metric Backtest's job is a
  no-op until 2026-11-16 (weekly). Season impact waits until every team has 10 games (8 on
  2026-11-09); its first fit runs on the VPS on Monday 2026-11-16. The Projected Impact weekly
  score already runs inside the VPS's daily refresh.
- **C2, frozen models on a new machine.** Both machines rescored the same 174 finished 2026-27
  games (through 2026-11-12) from the same frozen files: Metric Backtest 3,132 values, largest
  difference 1.1e-16; Projected Impact 870 values, identical. The VPS rescore also equals the
  PC's 146 stored rows of each exactly. A dated note `scored_on_a_new_machine` starts each
  model's protocol-notes file
  (`evaluation/research/derived/courtlens-{metric-backtest,projected-impact}-v1-protocol-notes.json`).
- **C3, backups.** `scripts/vps-backup.sh install` put both lines in the `ubuntu` crontab
  (Sundays 07:20 UTC dump, 15:10 UTC records). Records: pushed under a cron-like environment
  (commit `8ab1e76` in `calebhabesh/courtlens-records`); a fresh clone on the PC matched all 60
  live record files on the VPS by SHA-256. Database: the weekly dump run by hand, 1.6 GB in
  228 s. Its first restore into a scratch database failed at one foreign key: one Ask turn input
  (turn `d203c734…`, step `agent_1`, 2026-11-10) pointed at dataset `5a6182e7…`, a sportsdataverse
  dataset the PC had already retired when its database replaced the VPS's. B4 copied the visitor
  rows without foreign-key checks, so the dead pointer got in. A check of all 135 foreign keys
  found no other. The pointer was set to null (the turn and its answer kept; the dataset no
  longer exists anywhere but in `courtlens_prev`). A fresh dump (1.6 GB, 228 s) then restored with exit 0 in 1,406 s
  (single stream: `pg_restore -j` cannot read a pipe, so the operations note's command was
  corrected): all 127 tables' exact row counts equal to live, 245 indexes and 313 constraints on
  both. The scratch database and `courtlens_prev` were then dropped on the owner's word; the VPS
  disk went from 124 GB to 139 GB free.
- **C4, job health.** Already built in W7b: each job's record, `GET /api/job-health` with
  `stale`, and now the operations note. No alert channel was added.
- **C5, the PC.** `scripts/install_data_refresh.sh --remove` removed the roster, daily, lineups,
  impact and Metric Backtest units; only `courtlens-scratch-clean` remains. `scripts/pull-from-vps.sh`
  exists (W7b) and never pushes.
- **C6 and W6, docs.** The deployment guide rewritten around the VPS as the system of record
  (scheduled jobs table with measured times, backups, grading, deploys copy nothing under
  `data/`); AGENTS.md's hosted-demo paragraph; a one-page
  [operations note](operations/hosted-operations.md) (what runs when, health, restores, game 300
  and season end); README status; finish plan F05 set to the measured state. No source was
  refused, so no source-policy note was needed.
- **W6 checks** on `feat/w7c-close`: pytest 2,885 passed, 8 failed (the same Anthropic-provider
  tests that fail only on this PC's SDK; CI passes them); mypy 402 files and Ruff clean; dashboard
  lint and typecheck clean; Vitest 938 passed; full Playwright in a sandbox 660 passed, 17 skipped,
  0 failed. Evidence screenshots of the live Win Probability page and Live at 1440 and 390 px,
  no horizontal overflow: [`w6`](evidence/win-probability-v4/w6/).
- **Marked by the owner's instruction:** every v4 block, the finish plan's F00–F05, Research
  R02–R12, R14 and R15b ✅; R16 ✂️ cut (dev 117 of 573, holdout never opened, no number); R13 ✂️
  closed unbuilt; alignment rows 18 and 21 point to their ✅ Research design rows.

**Follow-ups that need calendar time** (logged, not done at close): Monday 2026-11-16's first
season-impact fit on the VPS (time, memory, the API's memory with the bigger bundle); a full day
with no PC job and every page advancing (2026-11-14 is the first); disk after a week of runs
(baseline 139 GB free after `courtlens_prev` was dropped, `data/` 18 GB, two dumps of 1.6 GB).
