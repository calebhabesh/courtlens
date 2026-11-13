# Win Probability v4 plan

The last block of CourtLens: a market-informed win-probability model
(`courtlens-win-probability-v4`), a prediction on every Live card, a per-game "why", and a
Win Probability page a layman can read. Planned with the owner on 2026-11-11 and approved the same
day. On 2026-11-11 the owner also added W7: every scheduled data job moves to the VPS, so CourtLens
runs there on its own. The measured state of each block is in the progress log, not here.

It keeps every analytical, identity, data and source contract, the Research pages pattern
([alignment plan](databallr-alignment-plan.md), "Settled in …"), the control kit and
[Design Language v1](design/design-language-v1.md). It supersedes the finish plan's F05 for the
model upgrade and revises one of its rules for this feature only (W-D4 below). Work one block at a
time, in order. Record measured evidence in the [progress log](win-probability-v4-progress.md).
Only the owner marks a block ✅.

Scope guard: this is the final piece of a portfolio project. Anything not listed in a block is out.
If a block grows, stop and ask rather than widen it.

## Names

| Name on the page | Registration | State |
| --- | --- | --- |
| Original model | `courtlens-win-probability-v2` (the page used to call it v1) | Frozen 2026-11-04, served, scored nightly. Never changed. |
| (not adopted) | `courtlens-win-probability-v3` | Tested 2026-11-11, gate A1 failed. Result stays published. |
| Market-informed model | `courtlens-win-probability-v4` | This plan. |

## Owner decisions, 2026-11-11

| # | Decision |
| --- | --- |
| W-D1 | **The own forecast stays visible.** v4's pregame forecast is the Original model's own forecast (players available, form, home court, rest and travel) moved toward the betting line. The market enters as one labelled item, "market adjustment". |
| W-D2 | **The line's weight is fitted and published**, never fixed ("trusts the market 85%, itself 15%"). With no line at the seal, v4 uses the own forecast alone and says so. |
| W-D3 | **No new own-forecast inputs.** No Questionable or Doubtful rules: there is no history to test them on. The gain comes from the line and from sealing closer to tip-off. |
| W-D4 | **Wording.** Name the favoured team, always with its probability: "CourtLens favors IND, 62%". Between 45% and 55% the card says "Toss-up" and still shows the number. One "not betting advice" line. Never an "edge" against the market. This revises the finish plan's "no picks" rule for win probability only. |
| W-D5 | **The "why" is pregame only**: a points breakdown, the players behind it, and what each absence costs. Exact input values sit behind a disclosure. No explanation of the in-game number. |
| W-D6 | **A record of calls is shown** ("called 38 of 53"), beside the Original's and the line's on the same games, with calibration directly under it. Every game counts, toss-ups included. |
| W-D7 | **Never empty.** Surfaces lead with the latest sealed slate, not strictly tonight, plus one fixed worked example. Regular season only, and the page says so. |
| W-D8 | **Sealing and scoring move to the VPS.** Until W7, box scores, rosters and rating snapshots still come from the owner's PC when it is on; each seal records how old they are. W7 moves those too (W-D15). |
| W-D9 | **Live owns predictions; the Research page explains and grades.** |
| W-D10 | **Model first, design second.** Registration, fit, VPS sealing and freeze come before any design round, because every day before the freeze costs about 8 prospective games. |
| W-D11 | **Training.** The two spent test seasons are read a third time as a do-no-harm check that can stop the work, then join the final fit. |
| W-D12 | **Verdict.** Pregame margin error at 300 games (about 40 days after the freeze). Whole-game log loss is reported at 300 and read a final time at season end. The nightly job writes the result; Live returns to the Original automatically if v4 is measurably worse. |
| W-D13 | **One seal feeds both models** from v4's freeze, so the comparison isolates the model. The Original's record gets a dated note that its seal moved closer to tip-off. |
| W-D14 | **W2 and W3 are each split** (added 2026-11-11, after W1). W2: part A builds and proves locally; part B is the cutover, on the owner's word. W3: W3a is the final fit, the freeze checks and the freeze; W3b builds the scoring of both models afterwards and scores every seal captured since the freeze. The dated note on the Original's record is a committed, append-only file. |
| W-D15 | **CourtLens runs entirely on the VPS** (added 2026-11-11), like the owner's other projects: every scheduled job, the live database and the data directory. The PC is for development only. Block W7. |
| W-D16 | **The own read leads** (added 2026-11-12, after the fit gave the line a weight of 1.0). Live cards, the Pre-Game panel, the Live chart and the Win Probability page lead with the Original model's number: CourtLens' own read. The Market-informed model's number is a labelled second figure ("with the betting line") and a second line on the chart. This revises W-D1's "moved toward the betting line" for what is shown first, and overrides the registered serving rule ("v4 is the model shown on Live"). Nothing about either frozen model, the seals, the scoring or the reads changes: both models are still scored from the same seal, and the 300-game and final reads are still written. The registration is not edited; a dated protocol note records the deviation. Reason: with a weight of 1.0 the served pregame number was the market's, and the "why" explained a number that was not the one shown. |
| W-D17 | **The own read's linear form was tested, once** (added 2026-11-12). The owner asked whether a linear regression is too simple for the own read and left the choice of testing it to the assistant. One diagnostic, `courtlens-pregame-nonlinear-v1`: gradient-boosted trees on the same 11 inputs and training seasons, alone and as a correction to the linear fit, scored on 2022-23 to 2025-26 against the frozen forecast. It cannot change either frozen model and serves nothing; the result is published under "What didn't help". A better own read would need a new owner decision and a new version. |

## What exists (read before building)

| Thing | Where |
| --- | --- |
| Own forecast: inputs, coefficients, `mu_from_entry` | `src/courtlens/services/win_probability_pregame.py`; coefficients in `evaluation/research/frozen/courtlens-win-probability-v2.json` |
| Sealing, scoring, scorecard, Live chart payload | `src/courtlens/services/win_probability_production.py` (`capture_slate`, `inputs_for`, `score_date`, `nightly`, `game_probability`) |
| Frozen model loading and features | `src/courtlens/services/win_probability_serving.py` |
| v3's pipeline, to reuse stage by stage | `src/courtlens/evaluation/win_probability_v3.py`, `scripts/run_win_probability_v3.sh`, [F05 evidence](evidence/finish/f05/README.md) |
| Closing lines, 2020-21 to 2025-26, about 5 minutes before tip | `data/raw/market-lines/closing_lines_odds_api.parquet`; matched to games in `evaluation/win_probability_report.py` (market home margin = `-home_point`) |
| ESPN's line on a scheduled game | `domain/live.py` `_odds`; the dashboard's `lineFavourite` |
| Live cards, Pre-Game tab, chart | `dashboard/components/live-board.tsx`, `live-game.tsx` (`PreGameTab`), `live-game-extras.tsx` |
| Win Probability page | `dashboard/components/win-probability-research.tsx`, `api/routers/win_probability.py` |
| Deploy, mounts, the sync script | `scripts/deploy-vps.sh`, `deploy/compose.prod.yml`, `scripts/sync-win-probability.sh`, [deployment guide](deployment.md) |

Facts measured while planning (2026-11-11):

- Original model on 2024-25 and 2025-26: pregame RMSE 14.16 points and 68.4% of winners; the
  closing line 13.71 and 69.5%. Whole-game log loss 0.4028.
- Today there is one seal a day, at about 13:45 UTC on the owner's PC, roughly 10 hours before
  tip-off. Missing late news costs 0.88 points on average, and more than 2.66 in 1 game in 20 (53 games).
- The Original's prospective record: 53 games, 2026-11-04 to 2026-11-10.
- The season runs at about 7.6 games a day.
- `deploy-vps.sh` mirrors `derived/win-probability-serving` with `rsync --delete`, and the API
  mounts it read-only. Both must change before the VPS can own that directory (W2).
- The seal record stores no per-player rows and no line, and `form` includes the home-court term.
  The "why" needs all three stored separately (W2).

**Do not edit** `domain/win_probability_live.py`, `domain/win_probability_state.py` or
`evaluation/impact_history_ratings.py`: the Original's pin test hashes them. v4 reads them as they
are.

## How to work through this plan

- **One block per session.** Start by reading this plan, the registration and the progress log.
  End by writing the block's measured entry in the progress log, so the next session starts from
  it.
- **Work in the git worktree** `~/dev/courtlens-wp4`, not the main checkout: the owner's daily
  timers run code from the main checkout (`~/dev/courtlens`, on `main`). The worktree's `data/` is
  a symlink to the main checkout's real data; do not recreate either. Python is
  `~/dev/courtlens/.venv/bin/python` with `PYTHONPATH=~/dev/courtlens-wp4/src`. Use absolute paths
  or `git -C`; never chain git after a `cd`. After a block's pull request is merged, continue on a
  new branch from `main` in the same worktree.
- **Never write to the live record while testing.** The real
  `data/derived/win-probability-serving` holds the prospective test. Trial runs set
  `COURTLENS_WIN_PROBABILITY_SERVING_DIR` to a copy under `$TMPDIR`.
- **Known test failures.** Nine Python tests fail on `main` too (eight `test_agent_providers`
  Anthropic cases and `test_no_unexplained_legacy_brand_references`). Leave them, and report any
  other failure.
- **Stop and ask the owner** before: any change to the registration; anything that would touch
  the Original's pinned files or past scorecard rows; the VPS cutover deploy; the freeze; and
  whenever a block needs something this plan does not list.
- **Every block ends green:** pytest, strict mypy, Ruff, and for dashboard changes lint,
  typecheck, Vitest and the touched Playwright specs (full Playwright for shared code and before
  a ✅). A block is not done on prose alone; the progress entry carries the numbers.
- **Where owner design instructions are recorded:** Live cards and the Pre-Game tab in the
  [alignment catalog](databallr-alignment-catalog.md), row 7 (Live). The Win Probability page in
  the [Research design catalog](research-design-catalog.md), RD14.

## The model in one paragraph

`mu4 = own + w × (line − own)`. `own` is the Original's expected home margin, with its frozen
coefficients. `line` is the market's expected home margin. `w` is one least-squares number between
0 and 1, fitted on seasons where `own` is out of sample (2022-23 onward). The in-game layer is
either the Original's boosters reading `mu4` (K1) or the same recipe refitted (K2); 2023-24 picks,
and K1 wins ties because it is simpler. Everything else is in the
[registration](../evaluation/research/registrations/courtlens-win-probability-v4.json), which is
the contract. If this plan and the registration disagree, the registration wins.

Measured on 2026-11-11: K1 was kept, and `w` came out 0.720 (stage S), 0.906 (stage C) and 1.0
(stage F, clipped from 1.0115). So with a line, v4's pregame forecast is the line; with none, it
is the own forecast. Since W-D16 the surfaces lead with the own read (the Original's number) and
show v4's number beside it as "with the betting line".

## Blocks

| Block | What | Owner gate |
| --- | --- | --- |
| W0 | Registration committed and pushed | Approves this plan and the registration text |
| W1 | Fit stages S and C; the do-no-harm check | Reads the result before W2 |
| W2 part A | Seal with the line and player rows; the seal job and VPS service, proved locally | Reads the result |
| W2 part B | The cutover: sealing and scoring on the VPS | Says "cut over", present at the PC |
| W3a | Final fit, freeze checks, arm64 check on the VPS, freeze | Says "freeze" |
| W3b | Both models scored from every seal since the freeze; head-to-head; Live serves the result | Reads the first head-to-head |
| W7a | Every job surveyed and every source tried from the VPS; nothing live changes | Decides any refused source; approves the runbook |
| W7b | Data directory and database move; rosters and the daily refresh run on the VPS | Says "move", present at the PC |
| W7c | Remaining jobs, backups, job health, the PC's timers removed | ✅ |
| W4 | Live cards and the Pre-Game "why" | Design rounds, ✅ |
| W5 | Win Probability page | Design rounds, ✅ |
| W6 | Close-out | ✅ |

The table is in working order. W7 comes before W4 so the seals stop depending on the PC early in
the 40-day test and the design blocks deploy on the final setup. W7 and W4/W5 do not depend on
each other; the owner may swap them.

### W0 Registration

Set `registered_on` to the commit date. Commit and push
`evaluation/research/registrations/courtlens-win-probability-v4.json` on a branch before any fit,
and record the commit and content hash in the progress log. No other change in that commit.

### W1 Fit and the do-no-harm check

New module `src/courtlens/evaluation/win_probability_v4.py` and `scripts/run_win_probability_v4.sh`
(the v3 runner with the v4 module: 2 CPUs, 3,072 MiB with no swap, 1,800 s). Reuse v3's loaders,
fit, predict, bootstrap and report code by import; do not copy it. Read the Original's game table
and state files, do not rebuild them, and confirm their content hashes.

- **Stage S.** Fit `w` on 2022-23. Score K1 and K2 on 2023-24. Write and commit the selection log
  before stage C; stage C refuses to run without it and refuses to run twice (as v3's test did).
- **Stage C.** Fit `w` on 2022-23 and 2023-24. Read 2024-25 and 2025-26 once. Gates D1, D2 and A2.
- **Checks to run first.** The own forecast for every training game comes from the Original's
  stored pregame table; confirm it equals `mu_from_entry` with the manifest's coefficients, and
  that its RMSE on 2024-25 and 2025-26 recomputes to 14.163 and the closing line's to 13.708. The
  Original's log loss recomputed on the stage C states must equal 0.4028, as it did in F05. A
  mismatch means the wrong inputs are being read: stop and find out why before any fit.
- **Lines to games.** Join the parquet to the game table the way
  `evaluation/win_probability_report.py` does, and report how many regular-season games in each
  line season have no line.

Evidence in `docs/evidence/win-probability-v4/`: a README in the F05 README's form, the stage
reports, every `w` with its games, runtimes and peaks.

**If D1, D2 or A2 fails:** stop the model work, publish the result as F05 did, and continue with
W2, W4 and W5 for the Original model alone (the cards and the "why" work without a market item).
Tell the owner before continuing.

### W2 One seal, on the VPS

**Seal schema v2** (`courtlens-win-probability-pregame-v2`; v1 files stay readable). Per game, add:

- the line: home margin, book, and the raw `details` text; null when ESPN lists none. Derive the
  favourite the way `lineFavourite` does, and unit-test the sign against kept raw scoreboards and
  against the parquet's `home_point`;
- per team, the player rows behind `strength`: player id, name, expected minutes, rating, and
  whether the rating is the default;
- per team, each player listed Out with the minutes and rating they would have had, and the change
  in the own forecast from adding them back (the absence cost). A player with no appearance in the
  last 365 days has no expected minutes and shows no cost;
- `form` split into team form and the home-court term;
- how old the inputs are: last box-score date, roster time, rating snapshot cutoff;
- after W3: `mu4`, `w`, and each model's tip-off probability for the home team (the full model at
  the opening state, so the card needs no inference).

**Seal job.** A new CLI command that, in one run: seals today's scheduled regular-season games,
scores finished games not yet on the scorecard, and rewrites the summaries. It writes a seal file
only when a game's inputs or line changed. The rule for which seal a game uses is unchanged: the
newest one captured before ESPN's scheduled tip-off.

**On the VPS.** A Compose service in the `demo-reset` pattern (API image, small caps, sleeps
between runs) runs the job every 30 minutes from noon US Eastern until the day's last tip, plus
one morning run for the previous night's scores.

- It mounts `data/derived/win-probability-serving` and `data/raw/espn-wp` read-write. The API keeps
  its read-only mounts.
- `deploy-vps.sh` stops mirroring `derived/win-probability-serving` (the VPS owns it now), and
  the deploy must not delete `raw/espn-wp`.
- The job must not refit ratings on the VPS: rating snapshots arrive from the PC. Today's
  `nightly` calls `ensure_snapshots`, which needs the season-impact bundle the VPS does not have;
  the VPS job skips that call. `write_availability_checks` and `write_wpa_summary` read the
  retained box files, which the PC pushes. Confirm both on the VPS, and measure the service's peak
  memory before setting its cap.
- The directories are settings (`win_probability_serving_dir`, `win_probability_models_dir`,
  `win_probability_snapshots_dir`); use them, do not hard-code paths.
- No new HTTP writes, so the Caddy allowlist is unchanged.

**On the PC.** The local `refresh-daily` win-probability step stops sealing and scoring. It
ensures rating snapshots, then one script pushes the three small inputs (the current season's
`raw/sportsdataverse_*`, `derived/win-probability-ratings`, `derived/espn-rosters-v1`) and the
Projected Impact score, and pulls the serving bundle back for local development. Replace
`scripts/sync-win-probability.sh` and its installer with this; never `--delete` on either side.

**Part A, as built (2026-11-11).** `services/win_probability_seal.py`; the command
`courtlens seal-win-probability`; the setting `win_probability_local_sealing` (default true, so a
merge changes nothing on the PC); `scripts/win-probability-push.sh` and
`scripts/install_win_probability_push.sh`; the Compose service `win-probability-seal` (768 MB, one
CPU, runs as uid 1001). Numbers are in the progress log.

**Part B, the cutover.** Only on the owner's word, with the owner at the PC, after the PC's 8:34
Eastern run and before noon Eastern. In order:

1. The owner merges the pull request; wait for CI and Images on `main`.
2. Push the PC's current serving bundle to the VPS once.
3. Deploy with `scripts/deploy-vps.sh`.
4. Confirm the service is running, sealed today's slate into the VPS directory, and gives the PC's
   rows for last night's games (a one-off `docker compose run --rm` on a temporary copy, never the
   live directory).
5. Only then: pull `main` in `~/dev/courtlens`, set `COURTLENS_WIN_PROBABILITY_LOCAL_SEALING=false`
   in its `.env`, and install the push and pull schedule. Show the owner each command first.
6. Commit the dated note: an append-only protocol-notes file beside the other derived research
   files, saying when the Original's seal moved and the first game it affects. Past rows are never
   changed. The API field that returns it is built in W3b; the page shows it in W5.

If step 4 fails, leave local sealing on and tell the owner. A missed night is lost test games.
Check the next morning's run before W2 is called done.

Evidence: a seal produced on the VPS, its age at each tip-off, a scored night, memory and disk
measured, and the deploy guide updated.

### W3a Final fit and freeze

Stage F, then the freeze checks (ESPN-state parity, p95 latency, arm64 parity on the VPS). The
offline part was done on 2026-11-11 so it ships in the cutover deploy: stage F, parity and latency
pass, and `services/win_probability_market.py` is the predict path (the Original's model reading
`mu4`). Still to do, after W2 part B is confirmed:

1. Run `scripts/win_probability_v4_platform_check.sh` (the arm64 check in the VPS API container)
   and report the result against the registered 1e-9.
2. On the owner's "freeze": freeze as R15b did. Manifest
   `evaluation/research/frozen/courtlens-win-probability-v4.json`, hashed files, a pin test.
   Commit and push; the pushed commit time is the freeze time. Record it and the first slate that
   counts.

Nothing else is needed to start the test: v4's score for a game depends only on the seal, the
frozen manifest and ESPN's play-by-play, so W3b can score those games when it lands.

### W3b Both models scored and served

Built after the freeze. It scores every seal captured since the freeze time, including the ones
made before this code was deployed.

- Both models are scored from every seal captured after the freeze. Keep the Original's scorecard
  rows in their current schema; put v4's rows beside them, keyed by the same game.
- The nightly job computes V1, V2, the record of calls, the three-way result text, and a
  `serving_model` field that Live reads. The 300-game and season-end reads flip it by the
  registered rule with no person involved. Unit-test both flips.
- `/api/win-probability` gains the head-to-head; the existing fields keep their shape.
- **Win probability added stays on the Original** for the whole 2026-27 season, so the season
  table never mixes two models. The page says which model it uses.
- **Drift.** The Original's drift status continues unchanged. v4 gets the same monitor, with its
  interval taken from its stage C predictions.
- **The Live chart** shows the serving model's line beside ESPN's. A game sealed before v4's
  freeze shows the Original's line, and its "why" has no market row.
- **Revised by W-D16 (2026-11-12).** The surfaces lead with the Original. `serving_model` now
  reports the Original as the model Live leads with, and keeps what the registered rule gives
  under `registered_rule`. The Live chart draws the Original's line and, for a game sealed after
  the freeze with a line, v4's as a dashed second line. The "why" ends at the own read and shows
  v4's margin and chance as a comparison row.

- `/api/win-probability` also returns the protocol notes written in W2 part B.
- Seals made from here on carry `mu4`, `w` and each model's tip-off probability. Seals made
  between the freeze and this deploy have them null; scoring computes them from the seal's line.

### W7 Everything runs on the VPS

**Goal.** After W7 the PC is needed for development only. Every scheduled job runs on the VPS, the
VPS database is the live one, and the VPS data directory is the copy the site depends on. No new
features, sources or schedules: the same jobs, on another machine.

**Where things stand** (measured on the PC, 2026-11-11):

| Job | Command | When | Wall time | Peak memory |
| --- | --- | --- | --- | --- |
| Daily refresh | `courtlens refresh-daily` | 8:34 Eastern | 11 min | 2.9 GB |
| Rosters | `courtlens refresh-espn-rosters` | every 6 hours | 2.6 min | 265 MB |
| Lineups | `courtlens refresh-season-lineups` | 9:05 Eastern | 40 to 58 min (25 s of CPU) | 1.0 GB |
| Metric Backtest | `courtlens refresh-metric-backtest` | 10:00 Eastern | seconds on a no-score day | 180 MB |
| Season impact | `courtlens refresh-season-impact` | Mondays | not yet measured: no real run this season | unknown |

- The daily refresh includes the season's box scores, a new statistics release in Postgres when
  games were played (about 920 MB each, older ones retired, dbt run and tests), the player index,
  contracts, DARKO, Wikipedia's transactions, the win-probability rating snapshots and the
  Projected Impact weekly score. `scripts/install_data_refresh.sh` lists every timer.
- The PC's data is 6.7 GB raw (5.0 GB of it Basketball-Reference history), 5.4 GB derived, 4.6 GB
  artifacts. The VPS database is about 21 GB and is a copy restored from a PC dump; it is not
  updated daily. The VPS has 159 GB of disk and about 20 GB of memory free.
- The API image already installs the warehouse (dbt) extras and copies `warehouse/`.
- Each deploy mirrors about 30 data directories from the PC and deletes anything else in them.
- `stats.nba.com` refuses cloud hosts (source policy v2); the project reads hoopR's mirror on
  GitHub instead. No other source has been tried from the VPS address.

**Rules for all of W7**

- The win-probability test comes first. Never stop or restart `win-probability-seal` between noon
  Eastern and the day's last tip. Do cutovers between 9:00 and noon Eastern with the owner present.
- Move one job at a time. A job is moved when the VPS run's output matches the PC's run of the same
  day; only then is the PC's timer for it removed. If it does not match, the PC keeps the job and
  the owner is told.
- No paid service, proxy or data plan (zero recurring cost).
- Never run the Basketball-Reference history crawl. It is not a scheduled job and stays out.
- The Original's pinned files and every frozen model's files stay untouched.

#### W7a Survey; nothing live changes

1. **Jobs.** For each command above and each `refresh-daily` step, list from the code: the hosts
   it fetches, the directories it reads and writes, the tables it writes, and any setting or key
   it needs. Include anything the timers do not cover but the pages need to stay current.
2. **Sources from the VPS.** For each host, fetch one real document with the project's own client
   in a one-off API-image container on the VPS, at that source's registered pace, writing to a
   scratch directory. One request per host is enough. Record reachable or refused.
3. **A refused source.** Stop and give the owner the choices, in this order: another source that
   policy v3 admits; freeze that feed and label the pages that use it "as of" its last date; cut
   the feature. The owner decides each one.
4. **The season impact job.** Measure its real time and memory on the PC on its first full run of
   the season. If it has not had one by then, measure it in W7c on the VPS before setting a cap.
5. **Runbook.** Write the exact W7b and W7c steps and commands, including how to go back, in
   `docs/evidence/win-probability-v4/w7-runbook.md`. The owner approves it before W7b.

#### W7b Data, database, and the jobs the seals depend on

On the owner's "move", in the 9:00 to noon Eastern window, after the PC's morning runs:

1. **Stop the PC's push** (`install_win_probability_push.sh --remove`), so the two machines stop
   writing the same files.
2. **Copy the data directory** to the VPS once: `raw`, `derived`, `artifacts` and the portrait
   cache. Never `--delete`, and never touch `derived/win-probability-serving` or `raw/espn-wp`,
   which the VPS has owned since W2.
3. **Replace the database** with a fresh dump from the PC, by the deployment guide's existing
   procedure (restore beside the live one, swap, keep the old one until the owner says to drop
   it). From this swap on, the VPS database is the live one and is never replaced from the PC.
4. **`deploy-vps.sh` stops copying data.** It ships code and configuration and runs migrations.
   It keeps the Stats cohort warm-up. Verify with a deploy that nothing under `data/` changes.
5. **A `jobs` Compose service** in the `win-probability-seal` pattern: the API image, read-write
   mounts on `data/`, one job at a time on the PC's schedule, a failed job reported and the loop
   continuing. The API's mounts stay read-only. Set its memory cap from a measured run.
6. **Move rosters, then the daily refresh.** For each: run it on the VPS, compare with the PC's
   run of the same day, then remove the PC's timer. Content-addressed outputs must have the same
   hashes. The published statistics release must have the same row counts and season totals.
7. **Rating snapshots.** `ensure_snapshots` now runs on the VPS, where the files it fits from
   exist. Refit the newest existing snapshot there and compare with the PC's file: report the
   largest rating difference and the largest change in any sealed game's own forecast. Above 0.01
   points, stop and ask. Add a dated protocol note that the seal's inputs now come from the VPS.
8. **Measure** the daily run's time and memory on the VPS, the API's response time while it runs,
   and disk after it.

Going back: re-enable the PC's timers and its push, and point the API at the kept database.

#### W7c The rest, and making it safe to leave alone

1. **Move the remaining jobs** the same way: lineups, Metric Backtest, the Projected Impact
   weekly score, season impact.
2. **Frozen models scored on a new machine.** For Metric Backtest and Projected Impact, score the
   same finished games on both machines once. Rows must agree to 1e-9. Add a dated protocol note
   to each record.
3. **Backups.** The VPS now holds the only live copy. A weekly database dump on the VPS disk, two
   kept. The small records that cannot be recomputed (seals, scorecards, weekly scores) are also
   copied off the VPS every night. Recommended target: a private GitHub repository, which is free
   and versioned. The owner picks the target at this block's gate. Prove a restore from each once.
4. **Job health without the PC.** Each job records its last success and last failure. One GET
   endpoint returns them, and the operations note says what a stale job looks like. If the
   owner's other VPS projects already have an alert channel, ask before reusing it; do not add a
   new service.
5. **The PC.** Remove the remaining timers (`install_data_refresh.sh --remove`); the scratch
   cleanup stays. Add `scripts/pull-from-vps.sh`, which copies the data directory and, on request,
   a database dump to the PC for development. It never pushes.
6. **Docs.** Rewrite the deployment guide around the VPS as the system of record, and update
   AGENTS.md's hosted-demo paragraph and any source-policy note for a frozen feed.

Evidence: the source table, each job's VPS run beside the PC's, time and memory per job, disk
after a week of runs, one restore from each backup, and a day on which the PC was off and every
page's data still advanced.

### W4 Live cards and the Pre-Game "why"

Follow the usual design-round process: the owner's instructions recorded in the
[Research design catalog](research-design-catalog.md) first, a real-data check, touched specs ×3,
full Playwright for shared code. The proposals below are the starting point for round 1, not a
fixed design.

**Card, one new row above the line chips.** The chips stay as they are and stay labelled as the
book's.

```
Scheduled                       Toss-up
┌──────────────────────────┐    ┌──────────────────────────┐
│ 7:00 PM ET           1 › │    │ 7:30 PM ET           2 › │
│ ▣ BOS 8-2   Away·1 OUT   │    │ ▣ DEN 6-4   Away         │
│ ▣ IND 5-5   Home·2 OUT   │    │ ▣ LAL 6-4   Home         │
│ CourtLens favors ▣BOS 64%│    │ Toss-up · ▣LAL 52%       │
│ [BOS by 4.5] [O/U 228.5] │    │ [LAL by 1] [O/U 224]     │
└──────────────────────────┘    └──────────────────────────┘

In progress: "Pregame call: ▣BOS 64%"      Final: "Called ▣BOS 64% ✓" (or ✗)
No seal:     "No prediction was sealed for this game"
```

- Team logo beside the code. ✓ and ✗ use the green and red convention; the favoured team is not
  coloured as good or bad.
- The number is the sealed tip-off probability. It does not move during the game; the live number
  stays on the game page's chart.
- The card names the model only in its title text. During the trial the game page says
  "Market-informed model, on trial against the Original".

**Pre-Game tab, a new first panel, "CourtLens prediction".**

```
CourtLens favors ▣BOS · 64% to win · predicted margin BOS by 3.9

                         toward IND │ toward BOS
Players available                   │████████  BOS +3.1   ▸
Recent form                         │███       BOS +1.4
Home court                        █ │          IND +0.6
Rest and travel                  ██ │          IND +0.4   ▸
─ CourtLens' own read ─────────────────────── BOS by 3.5
Market adjustment                   │█         BOS +0.4
   The line is BOS by 4.5. The model moves 85% of the way to it.
─ Prediction ───────────────────────────────── BOS by 3.9 → 64%

Who's out            IND  T. Haliburton   costs IND 1.8 points
                     BOS  nobody listed Out
Sealed 6:55 PM ET · box scores through Nov 10 · ratings as of Nov 1
Model: Market-informed (on trial) · Not betting advice.
▸ Exact inputs
```

- The rows add up exactly: the own forecast is linear, so each row is coefficient × input. The
  market adjustment is `w × (line − own)`. State in the panel that the win chance comes from the
  full model, so it is not a straight conversion of the margin.
- Grouping: *Players available* is the strength term. *Home court* is the home coefficient, the
  home-court part of form, and altitude. *Rest and travel* is rest, back-to-backs, games in seven
  days and travel.
- *Players available* opens to each team's top players by expected minutes with their rating.
  *Exact inputs* is a `StatsGrid` of every input, its value, coefficient and contribution, with the
  model identity and seal hash.
- Absence cost is in the own forecast's points and is labelled an estimate. Players are those ESPN
  lists as Out, said so. The panel notes that Questionable players count as playing.
- After the game the panel adds the result and whether the call was right. With no line, the market
  row reads "No line when this was sealed; own read only". With the Original serving, the market
  row is absent.
- API: one GET for the breakdown, built from the seal alone, so it works for past games. The slate
  payload gains the card's fields.

### W5 Win Probability page

Same design-round process. Proposed order, top to bottom:

1. **Hero.** What it is in one sentence: CourtLens picks a favourite for every game, shows its
   reasoning, and is graded every night.
2. **Latest slate.** Tonight's cards, or the most recent slate with results, linking to Live.
3. **Track record.** Calls right out of total for the Market-informed model, the Original and the
   line on the same games; the calibration chart directly under it with one sentence on why
   calibration is the fairer measure.
4. **How the model thinks.** Three steps: its own read, the market adjustment (with the fitted
   weight), updating during the game. Then the worked example: the "why" panel for one fixed past
   game. Pick it by rule, not by taste: the first head-to-head game in which a player listed Out
   cost at least 1.0 point, whether or not the call was right. Store its seal in the repo.
5. **The trial.** Original against Market-informed: the result sentence the nightly job wrote, V1
   and V2 with intervals, games so far out of 300, and "too early to call" until then. Say plainly
   that the model uses the betting line and that the line was expected to help the pregame number.
6. **Evidence.** The existing sections, lower: against ESPN, the final test, what didn't help (now
   including v3 and the do-no-harm check), win probability added, how to read, terms, About with
   every identifier.

Sections 2 and 3 must read correctly on a day with no games and in the offseason.

### W6 Close-out

- Deploy guide: the seal service, the owned directory, the push and pull script, disk and memory.
- AGENTS.md pointer and finish plan F05 updated to the measured state.
- Full Playwright, lint, typecheck, mypy, Ruff, pytest green; evidence screenshots at 1440 and 390.
- A one-page operations note for the owner: what runs on the VPS and when, how to tell it is
  healthy, how to restore a backup, and what happens at game 300 and at season end without them.

## Not in scope

- In W7: new data sources, new schedules, new features, or the Basketball-Reference history crawl.
- Playoffs, new in-game inputs, a live "why", Questionable or Doubtful rules, new player ratings.
- Totals, moneylines or any betting output beyond the line chips Live already shows.
- Any change to the Original model's files or its past scorecard rows.

## Risks to watch

| Risk | What to do |
| --- | --- |
| The fitted weight comes out near 1 and v4 is "the market" | Publish it as measured (W-D2). It happened (w = 1.0), and W-D16 answers it: the own read leads and v4's number is shown beside it. |
| K2 loses to K1 because lines cover only six seasons | That is what stage S decides; K1 is the default. |
| ESPN lists no line, or changes the field | Fall back to the own forecast, count those games, and alert in the job's log. |
| The PC is off for days, before W7 | Seals continue on older box scores and say so. The scorecard is unaffected. W7 removes the dependence. |
| A source refuses the VPS's address | W7a finds it before anything moves. The owner picks: another free source, a frozen feed with an "as of" label, or cutting the feature. |
| A job gives different numbers on arm64 | Compare before removing the PC's timer; the PC keeps the job until it matches or the owner accepts the difference. |
| The VPS disk fails | From W7c: a weekly database dump and a nightly off-VPS copy of the records that cannot be recomputed. |
| A W7 cutover disturbs the win-probability test | Cutovers only between 9:00 and noon Eastern; the seal service is never restarted during a slate. |
| A deploy deletes VPS-made seals | W2 removes the directory from the mirror; verify with a deploy before the freeze. |
| V2 is "not distinguishable" at 300 games | Expected and registered; the season-end read is the stronger one. |
