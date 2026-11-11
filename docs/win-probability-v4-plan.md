# Win Probability v4 plan

The last block of CourtLens: a market-informed win-probability model
(`courtlens-win-probability-v4`), a prediction on every Live card, a per-game "why", and a
Win Probability page a layman can read. Planned with the owner on 2026-11-11. Status: **approved
by the owner 2026-11-11; the registration is committed (d868ebca); nothing is fitted or built.**

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
| W-D8 | **Sealing and scoring move to the VPS.** Box scores, rosters and rating snapshots still come from the owner's PC when it is on; each seal records how old they are. Moving the whole data refresh is not part of this plan. |
| W-D9 | **Live owns predictions; the Research page explains and grades.** |
| W-D10 | **Model first, design second.** Registration, fit, VPS sealing and freeze come before any design round, because every day before the freeze costs about 8 prospective games. |
| W-D11 | **Training.** The two spent test seasons are read a third time as a do-no-harm check that can stop the work, then join the final fit. |
| W-D12 | **Verdict.** Pregame margin error at 300 games (about 40 days after the freeze). Whole-game log loss is reported at 300 and read a final time at season end. The nightly job writes the result; Live returns to the Original automatically if v4 is measurably worse. |
| W-D13 | **One seal feeds both models** from v4's freeze, so the comparison isolates the model. The Original's record gets a dated note that its seal moved closer to tip-off. |

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
- **Work in a git worktree** of `feat/win-probability-v4`, not the main checkout: the owner's
  daily timers run code from the main checkout, and W2 changes the step they run.
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

## Blocks

| Block | What | Owner gate |
| --- | --- | --- |
| W0 | Registration committed and pushed | Approves this plan and the registration text |
| W1 | Fit stages S and C; the do-no-harm check | Reads the result before W2 |
| W2 | Seal with the line and player rows; sealing and scoring on the VPS | Approves the cutover deploy |
| W3 | Final fit, freeze checks, freeze, both models served and scored | Says "freeze" |
| W4 | Live cards and the Pre-Game "why" | Design rounds, ✅ |
| W5 | Win Probability page | Design rounds, ✅ |
| W6 | Close-out | ✅ |

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

**Cutover, in order:** push the PC's current serving bundle once; deploy; confirm the service
seals tonight's slate and scores last night's; disable local sealing; add the dated note to the
Original's scorecard. A missed night is lost prospective games, so do it on a day the owner is
present and check the next morning's run.

Evidence: a seal produced on the VPS, its age at each tip-off, a scored night, memory and disk
measured, and the deploy guide updated.

### W3 Final fit and freeze

Stage F, then the freeze checks (ESPN-state parity, p95 latency, arm64 parity on the VPS with the
existing platform check extended to v4). Freeze as R15b did: manifest
`evaluation/research/frozen/courtlens-win-probability-v4.json`, hashed model files under
`data/artifacts/`, a pin test, and the new directory added to the deploy script and Compose mounts.

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

The freeze needs the owner's word, because it starts the test. Record the freeze time and the
first head-to-head slate.

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
─ CourtLens's own read ─────────────────────── BOS by 3.5
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
- A one-page operations note for the owner: what runs where, how to tell it is healthy, and what
  happens at game 300 and at season end without them.

## Not in scope

- Moving the whole data refresh (box scores, impact refit, rosters) to the VPS. Optional later.
- Playoffs, new in-game inputs, a live "why", Questionable or Doubtful rules, new player ratings.
- Totals, moneylines or any betting output beyond the line chips Live already shows.
- Any change to the Original model's files or its past scorecard rows.

## Risks to watch

| Risk | What to do |
| --- | --- |
| The fitted weight comes out near 1 and v4 is "the market" | Publish it as measured. W-D2 already accepts this. |
| K2 loses to K1 because lines cover only six seasons | That is what stage S decides; K1 is the default. |
| ESPN lists no line, or changes the field | Fall back to the own forecast, count those games, and alert in the job's log. |
| The PC is off for days | Seals continue on older box scores and say so. The scorecard is unaffected. |
| A deploy deletes VPS-made seals | W2 removes the directory from the mirror; verify with a deploy before the freeze. |
| V2 is "not distinguishable" at 300 games | Expected and registered; the season-end read is the stronger one. |
