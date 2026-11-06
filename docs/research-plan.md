# CourtLens Research handoff

Prepared 2026-11-04. The owner delegated every scope decision below ("use your best judgement,
and choose the best choices that result in the strongest project for my resume"), so the
decisions are recorded as the owner's. On the same day the owner chose a live win-probability
model as the project's ML centrepiece (R15) and approved the lineup model (R14) and the Ask
holdout evaluation (R16). **Blocks R01–R16 are pending until the
[progress log](research-progress.md) records measured evidence.** A plan is not runtime evidence.

## Why this phase exists

Every core page is aligned with Databallr (owner, 2026-11-03). What remains is the Research menu.
It is where CourtLens stops replicating and shows its own statistics, machine learning and
evaluation work. Most core pages reproduce well-known metrics; this phase needs **two or three
headline results with measured numbers**, each tested on seasons the model never saw.

Judge every block by one question: *does it end in a number a reviewer can check?* A page that
only restyles existing data is worth less than a page that tests a claim.

## Scope and precedence

- **Supersedes** the Research-menu parts of the [Databallr alignment handoff](databallr-alignment-plan.md)
  and its catalog rows 18–21: those pages are now worked here, block by block. The alignment
  handoff's page patterns, verification steps and "only the owner marks ✅" rule still apply to
  every page this plan touches.
- **Keeps** every analytical, temporal, identity, data and zero-cost contract,
  [source policy v3](design/source-policy-v3.md), Design Language v1, the control kit, and the frozen
  pre-rename hash identifiers. The four B26 protocols (`courtload-rapm-v1`,
  `courtload-six-factor-v1`, `courtload-expected-shot-v1`, `courtload-adjusted-shooting-v1`) and the
  expected-shot negative result stay sealed. New experiments get new `courtlens-…-v1` registrations.
- **Never edit hash-pinned impact modules** (`impact_population`, `impact_repair_audit`,
  `domain/impact_*`, `possession_repair`, the IM04/IM05 runners). Running them on new seasons is
  fine; changing them invalidates sealed seasons. New behaviour goes in new modules.

## Owner decisions (2026-11-04, delegated)

| # | Decision |
| --- | --- |
| D1 Replicate | Six Factor RAPM, zTS, Shot Aftermath, Wingspan, Offensive (ORtg) Calculator, Learning + Glossary, Patch Notes. |
| D2 Diverge | ShotQuality and D-ShotQuality need paid tracking data. Build CourtLens's own expected-points shot model from free shot and play-by-play data, then the same decomposition. |
| D3 Drop | EPV Replays, Kawhi Files, Blog (remove `/whats-new/blog` and its menu entries), Databallr's games. |
| D4 Draft | Refactor into a **Draft Classes** page: rookies now, value by pick, class retrospectives. **No prospect projection model** in this phase (parked R13). It needs a new college-stats domain, and with roughly ten testable classes the result would likely be weak. |
| D5 Novel work | Headline results: **Live Win Probability** (R15, the ML centrepiece: a model in production, scored every night), **Metric Backtest** (R08), **Projected Impact** (R07, CourtLens's own learned player rating with aging curves) and **Shot Quality v2** (R05). **Signal vs Noise** (R03) is a cheap extra. |
| D6 Uncertainty | Every impact number gets an interval (bootstrap over games). Databallr shows none; this is a visible difference. |
| D7 Prospective test | Projected Impact freezes 2026-27 predictions on its freeze date and scores them only on later games, published as the season runs. |
| D8 Menu | Research menu regrouped (below). Workload Trends and Distributions & Splits are cut: Last X Games and the player page cover them. Case Studies and Saved Investigations move to the Methodology page. |
| D9 Parked | Prospect model (R13) and the play-by-play possession value (EPV) model. The player similarity map comes from R14's embeddings instead. |
| D10 ML depth | Owner, 2026-11-04: the project should read as data science, statistics, ML **and** applied AI. R14 adds learned representations, R15 adds a model in production with monitoring, and R16 publishes the assistant's held-out evaluation. |
| D11 Run order | **R01 → R15a → R15b → R07 → then R02–R06, R08–R12, R14, R16 in number order.** Win probability and Projected Impact are scored live on 2026-27, and every week of delay loses prospective games, so they come straight after the foundation. R03 may run in parallel with anything. |
| D12 Compute | Train on the local CPU by default: logistic, GAM and LightGBM models on about 13 million event rows fit in minutes. Google Colab (bundled with the owner's Google AI Pro plan) is an **optional accelerator** for neural models (R14) and large hyperparameter sweeps. Rules: the training set is exported as a content-hashed Parquet file; the Colab notebook records the dataset hash, package lock, seed and GPU type; the returned model is verified by hash locally. Every published model must also be reproducible on CPU, so no result depends on a paid service. |
| D13 Build, then design | Owner, 2026-11-05: Research pages are built for function first and redesigned afterwards in final design blocks. This supersedes D11's order for the blocks still to run. **Build phase:** R03, R04, R05, R06, R08, R09, R14, R16 and the new data in R10. **Design phase:** every Research page, one at a time from the owner's Databallr screenshots and instructions under the [alignment handoff](databallr-alignment-plan.md)'s process, starting with Six-Factor RAPM (row 18) to set the pattern; only the owner marks ✅. **Finish:** R11 and R12. Win Probability keeps its existing page unless the owner asks otherwise. |
| D14 Finish before design | Owner, 2026-11-06: finish every block that isn't blocked before the page redesigns. This reverses D13's order for R11 and R12 only: **R11 → R12 → design phase** (rows 19 onward and every other Research page, one at a time from the owner's screenshots). Row 18 (Six-Factor RAPM) is already redesigned and awaits the owner. R11 and R12 are build blocks (plain UI from the shared Research components). R12's R16 card and README line say "evaluation in progress", with no number, until R16 finishes. |

**Design phase work queue:** [Research design catalog](research-design-catalog.md), one row per page with its
reference, current state, known gaps, the owner's instructions and status (2026-11-06).

## Target Research menu

| Group | Items |
| --- | --- |
| Models | Win Probability (with its live scorecard), Projected Impact, Lineup Model |
| Impact | Six-Factor RAPM (with Impact Tree), Metric Backtest |
| Shooting | zTS, Shot Quality, Shot Aftermath, Defensive Shot Quality (rebuilt Defensive Matchups) |
| Methods | Signal vs Noise, Points Forecasts (Evaluation Archive folded in), Learning |
| Tools | Wingspan, Draft Classes, ORtg Calculator, Patch Notes |

A **Research landing page** (`/research`) opens the menu: one card per headline result, with its
number, test seasons and a link to the evidence.

## Blocks

Run in the order set by D13; otherwise in number order unless marked independent.

**Build-phase rules (D13).** A build block ends with the analysis finished and a deliberately plain page.
- **Plain UI:** the control kit and the shared tables and charts, with no bespoke layouts or custom page CSS. Layout, polish and Databallr alignment belong to the design phase.
- **Finished API:** served data, intervals, unknown states and tests against the data, so a design block needs no new analysis.
- **Check the content first:** before building a page with a Databallr counterpart, ask the owner for its screenshots and confirm the data covers what that page shows. The agent cannot fetch databallr.com, and a list of section names is not a design reference.

Each block ends with measured evidence in the progress
log and, for pages, the alignment verification steps (lint, typecheck, Vitest, page Playwright
specs, 1440 and 390 screenshots in `docs/evidence/research/<block>/`). One block per commit.

### R01 — Impact history backfill, time decay and intervals (foundation)

RAPM now covers three regular seasons (2023-24 to 2025-26), which is too few to test anything
across seasons. This block extends it.

1. Run the IM02 → IM03 → IM04 pipeline for regular seasons **2014-15 to 2022-23** (shufinskiy
   `nbastatsv3_<year>` archives; play types start 2015-16, so 2014-15 is the prior season). Report
   per-season clean/patched/excluded counts next to the existing three.
2. Add a **time-decay RAPM** variant (exponential game weights, 550-day half-life to match
   Databallr's default; record the half-life as a parameter, not a constant).
3. Add **game-bootstrap intervals** (resample games within the fit window, refit with the selected
   alpha, 200 replicates, seeded) for RAPM, ORAPM, DRAPM and the six factors. Serve the 10th and
   90th percentiles.
4. Measure the six-factor **reconstruction R²** (second-stage regression of RAPM on the six
   factors) for every season instead of quoting Databallr's 0.985.
5. Build **dated rating snapshots**: time-decay RAPM refitted as of the first day of every month
   (and the season opener) using only games before that date. R07, R08 and R15 read player
   strength from the latest snapshot before each game; season-level fits must never feed a
   prediction inside the same season.

Acceptance: twelve seasons served; coverage table published; intervals present; R² measured;
snapshots built with their cutoff dates recorded.
Keep peak memory inside `research_limits.py` limits.

### R02 — Six-Factor RAPM page with Impact Tree (catalog row 18)

Databallr's explainer layout: framework grid, how it works, factor tabs, Net Efficiency vs
Possession Control, player archetype cards picked from our own data, caveats. Then the sortable
table with intervals. Add the **Impact Tree**: Databallr's `/decomp` is a mock-up with fake data;
CourtLens builds it for real (RAPM → ORAPM/DRAPM → six factors, each node with its interval) for
any player. Stats page six-factor presets link here.

### R03 — Signal vs Noise (independent; can run any time after R01 starts)

For each Stats-table rate stat, split each player-season's games at random into halves (500
splits), compute split-half correlation by sample size, and apply Spearman–Brown to find where
reliability reaches 0.5 and 0.7 (the stat's stabilization point). Add empirical-Bayes shrinkage for
percentage stats (beta-binomial, prior fitted on earlier seasons only) and a "Shrunk" toggle for
3P%, FT%, TS% and rim FG% on the Stats table. Page: stabilization curves, a league table of
stabilization points, and a worked player example.

### R04 — zTS (Databallr replica plus a test)

Replicate the About / Top 200 / Player tabs. Expected TS = Σ(play-type share × league TS for that
play type), Playtype Difficulty = league TS − expected TS, zTS = rTS + difficulty.

- Synergy rows carry points, FGA, possessions and shooting-foul share but **no FTA**. Before
  building, check whether FTA can be derived exactly. If not, define play-type TS as
  `PTS / (2 × scoring possessions)`, with scoring possessions = possessions × (1 − turnover share).
  Name it as CourtLens's definition; never imply it is Databallr's number.
- **The test:** register `courtlens-zts-validation-v1`. Does season-t zTS predict season-t+1 rTS,
  and track season-t oTS RAPM, better than season-t rTS does? Test on seasons not used for any
  choice. Publish the result whichever way it goes.

### R05 — Shot Quality v2: expected points per shot (headline result 3)

Register `courtlens-expected-shot-v2` before any fit. The sealed v1 attempt failed its selection
gate; read [its report](research/b26-expected-shot-result.md) first and state what v2 changes.

- Data: shufinskiy ShotChartDetail 2014-15 onward (location, distance, `ACTION_TYPE` such as
  driving, pull-up, step-back, floating), joined to play-by-play for assisted/unassisted, period,
  game clock, score margin and seconds since possession start (transition proxy).
- Candidates: league zone + distance rates (baseline), logistic regression with distance splines,
  LightGBM. Calibrate on a held-out slice.
- Chronological split: train ≤ 2021-22, select on 2022-23, calibrate on 2023-24, final test
  2024-25 and 2025-26. Metrics: log loss, Brier, calibration curve, all against the baseline, with
  game-bootstrap intervals.
- The page shows the model card, the calibration curve, and player shot-making (actual minus
  expected points per 100 shots, with intervals).

### R06 — ShotQuality decomposition and Defensive Shot Quality

Use whichever R05 model passed selection (the baseline if none did; say which on the page).

- Four parallel ridge regressions on the R01 possessions, as Databallr describes: TS, SQ, Make,
  FT, offence and defence, using its foul-type baselines. Page: oTS / oSQ / oMake / oFT table with
  intervals, methodology panel.
- Defensive Shot Quality: rebuild `/research/defensive-matchups` on the matchup data (2017-18
  onward). For each defender, compare the points opponents scored in their matchups with what those
  opponents' own season shooting predicts. Cards follow Databallr's D-ShotQuality grid, logos
  beside codes.

### R07 — Projected Impact (headline result 2)

CourtLens's own player rating, in the style of DARKO and EPM, built and tested here.

- Target: a player's next-season per-100 impact (two-year RAPM centred on the target season,
  minutes-weighted; the target definition is frozen in the registration).
- Features, prior seasons only: box-score rates, play-type mix, shot profile, prior RAPM and
  six factors, minutes, age, years in league.
- Candidates: prior-RAPM carry-forward (baseline), ridge, LightGBM, plus an age-curve baseline.
  Intervals by split-conformal prediction.
- Register `courtlens-projected-impact-v1`. Train targets ≤ 2022-23, select 2023-24, final test
  2024-25 and 2025-26.
- **Prospective test (D7):** freeze 2026-27 projections on the freeze date (hash recorded), score
  only games after it, and refresh the score weekly through the season.
- Page: leaderboard with intervals, the aging curve the model learned, and the per-player feature
  contributions behind each projection.

### R08 — Metric Backtest (headline result 1)

Which impact metric best predicts real game results? For every game in a test season, predict the
margin from each player's rating fitted **only on earlier games**, weighted by the minutes the
player actually played. Using actual minutes isolates rating quality from playing-time prediction;
the page says so.

- Candidates: team prior-season net rating (baseline), plus-minus per 100, on/off, RAPM 1Y/3Y/time
  decay, box-prior RAPM, Projected Impact (R07), and DARKO where its free history covers the test
  seasons (otherwise omitted and stated).
- Score: margin RMSE, winner accuracy, calibration. Paired game-bootstrap intervals on every
  difference.
- Test seasons 2016-17 to 2025-26, plus 2026-27 prospectively.
- Page: one chart of "error by metric by season" and a plain-language verdict. This is the
  strongest single result for the resume.

### R09 — Draft Classes

- **Rookie tracker:** current rookies' DARKO, RAPM (when available) and per-36 box score, each
  compared with past rookies taken at the same pick.
- **Value by pick:** expected career value by draft slot, 1966 onward (career minutes and win
  shares; RAPM from 2014-15), with intervals.
- **Class retrospective:** redraft each class by realized value; biggest steals and misses.
- Combine measurements (Wingspan) shown beside outcome, descriptive only.

### R10 — Wingspan, ORtg Calculator and Shot Aftermath restyle (catalog rows 19, 20, 27)

Under D13, the build phase adds only the new data (for example DARKO D-DPM beside wingspan, positional averages, Pearson r); layout and restyling move to the design phase.

Owner-driven alignment, as on the core pages. Wingspan: Databallr layout plus DARKO D-DPM, positional
averages, a scatter with Pearson r, overlay, and nearest-build comparisons. Calculator: Databallr's
ORtg Lab, crediting Poropudas & Halme's *Dean Oliver's Four Factors Revisited*. Shot Aftermath:
restyle only.

### R11 — Learning, Glossary and Patch Notes (catalog row 21)

Learning becomes tiered topics like Databallr's, each linking to the CourtLens page and result that
demonstrates it (stabilization links to R03, RAPM to R02). The glossary is generated from the
metric catalog. Patch Notes list real versions and dates from git history and the progress logs.
Remove the Blog.

### R12 — Research landing, menu and README

`/research` landing cards, the regrouped menu (D8), cuts made, the README "Results" section
updated with R15, R08, R07, R05 and R16 numbers, and the hosted demo refreshed with the new bundles. This is the block
a reviewer sees first; keep each card to one number and one sentence.

### R14 — Lineup model with learned player embeddings

A neural alternative to ridge RAPM. Each player gets a learned vector; a small attention layer over
the ten players on the floor predicts the stint's point margin per 100 possessions, so the model can
learn interactions (spacing, redundant skills, two bigs) that additive RAPM cannot.

- Data: R01 stints, 2014-15 onward. Inputs strictly before each prediction date.
- Register `courtlens-lineup-model-v1`. Baseline: ridge RAPM fitted on the same training games.
  Test on held-out later seasons (stint margin error, weighted by possessions), then enter it as a
  candidate in R08's game backtest.
- Cold start: players with few possessions fall back to a box-score embedding; state how many.
- Pages: lineup-fit tool (predicted net rating of any five, with interval) and a 2D player
  similarity map projected from the embeddings (UMAP, seeded). Never claim the embedding axes
  mean anything they were not tested for.
- Publish the result whichever way it goes. Neural models often fail to beat ridge on noisy
  sports data; a clear, registered "ridge wins" is acceptable.

### R15 — Live Win Probability in production (ML centrepiece)

CourtLens's own in-game win probability, trained on history, served on the Live page, and scored in
public every night of the 2026-27 season against ESPN's.

Run it in two commits. **R15a:** registration, training data, models, ablations and the
final-test report (everything under *Model* and *Training and evaluation*). **R15b:** the live
lineup tracker, production serving, nightly scorecard and pages. The model frozen in R15b is the
best registered variant that Live can serve; if S4 waits on the tracker, freeze the S3 model first
and give the later S4 model its own version and its own scorecard from its own freeze date.

**Why the structure matters.** The data has about 13 million play-by-play rows but only about
14,000 game outcomes (2014-15 onward), and every row in a game shares one result. The effective
sample is the number of games, not rows. A flexible model given dozens of in-game inputs will
memorise games. The design therefore puts structure where basketball knowledge is reliable and
leaves flexibility for the few inputs that can earn it.

**Model: two layers, predicting the margin, not just the winner.**

1. **Pregame layer** → expected full-game margin `μ0` and spread `σ0` for each game, from inputs
   known before tip-off only:
   - *Player-based team strength:* each available player's rating (RAPM until R07 exists, then
     Projected Impact) × expected minutes (recent minutes shares, renormalised to 240 among
     available players). Availability comes from the box score's inactive / not-playing records
     known at tip-off; check coverage first and state any fallback.
   - *Team form:* opponent-adjusted net rating from earlier games with shrinkage, as a check
     against the player-based number.
   - *Context:* home, rest days, back-to-backs, games in the last seven days, travel distance,
     altitude (Denver, Utah).
   - *Volatility:* both teams' expected pace and three-point attempt rate. Faster games and more
     threes mean more variance, which matters for comebacks.
   - Benchmark: the betting market's closing spread. Check for a free historical source (for
     example archived closing lines) covering the test seasons; if one exists, report CourtLens's
     pregame error against the market's. The market is a benchmark, not an input, so the model
     stays CourtLens's own. This layer is also the deployable form of R08 (expected minutes
     instead of actual minutes).

2. **In-game layer** → win probability as `P(final margin > 0)`, with ties sent to an overtime
   sub-model. It predicts the **distribution of the remaining margin** (mean and variance). A
   20-point win carries more information than "won", so this uses each game far better than a
   plain win/loss classifier.
   - **Structural baseline (Stern's Brownian-motion model):** remaining margin ~
     Normal(`μ0` × fraction of game left + possession value, `σ²` × time left). A handful of
     parameters fitted by maximum likelihood. Monotone in margin and well behaved at the
     extremes by construction.
   - **Main model:** distributional gradient boosting (LightGBM with a Gaussian likelihood for
     mean and log-variance, or NGBoost) that learns corrections to that baseline from:
     - *Game state:* margin, time left, period, possession, free throws pending, timeouts left,
       bonus / fouls to give, time since the possession started.
     - *Pregame layer:* `μ0`, `σ0`, pace and three-point rate.
     - *Who is left to play:* the rotation strength for the rest of the game, updated when a
       player leaves injured, is ejected or fouls out, plus foul trouble (fouls against minutes
       left, weighted by rating). Most of the remaining game is played by the rotation, not the
       five on the floor right now.
     - *Who is on the floor now:* the current ten players' strength against the rotation
       average, weighted towards the next few minutes only.
     - Monotone constraints: the mean rises with margin and with `μ0`.
   - **End-game specialist (last two minutes and overtime):** scoring is discrete (one, two and
     three-point swings, intentional fouling), so a Normal approximation breaks down. Fit a
     discrete model of the remaining margin on end-game states only (margin, possession, seconds
     left, free throws pending, timeouts, fouls to give) and blend it in by time left.
   - **Comparison candidates**, registered up front: plain logistic regression on game state and
     a direct LightGBM win/loss classifier on the same inputs. The page reports whether the
     structure helps.

**Ablations (registered; each reported with game-bootstrap intervals, overall and by phase).**

| Step | Adds | Expected |
| --- | --- | --- |
| S0 | Brownian baseline with team-form `μ0` | Most of the accuracy |
| S1 | Possession, free throws, timeouts, bonus | Late-game gains |
| S2 | Player-based `μ0` and context | Better early-game accuracy |
| S3 | Volatility (pace, three-point rate) | Better calibration of comebacks |
| S4 | Rotation strength, exits, foul trouble, current lineup | The differentiator; size unknown |
| S5 | Momentum (recent run) and in-game shooting luck | **Expected null.** Tested because fans believe in both; shipped only if they help |

**Training and evaluation details.**
- Sample game states on a fixed time grid (every 15 seconds, plus every event in the last two
  minutes), so busy stretches don't outweigh quiet ones and each game counts equally.
- Write every state from both teams' points of view so the two probabilities sum to one.
- Register `courtlens-win-probability-v1` before fitting. Splits: train ≤ 2021-22, select
  2022-23, calibrate 2023-24, final test 2024-25 and 2025-26, then 2026-27 live.
- Metrics: Brier score, log loss, and calibration curves overall and by phase (first half, third
  quarter, fourth quarter, last two minutes, overtime), with game-bootstrap intervals.
- ESPN comparison: ESPN's per-play win probability is already parsed for Live
  (`domain/live.py`). For the final-test seasons, fetch ESPN game summaries under source policy
  v3 pacing (5 s) and compare on matched events. ESPN likely uses betting lines, so expect it to
  be stronger early in games; the page says so.
- Not planned: a sequence model (transformer) over raw play-by-play. With about 14,000 outcomes it
  would overfit, and the structured model captures the known dynamics. Revisit only if S4 shows
  that lineup dynamics carry much more signal than expected.

**Live lineup tracker (needed for S4 in Live).** Starters from the ESPN box score, then every
substitution in ESPN's play-by-play. Validate on completed games against the official stints (R01)
before switching it on; if the tracker fails on a game, serve the S3 model for that game and show
it.

**Production.**
- Model artifacts are content-hashed in the existing artifact registry; the served model version
  and hash appear on every Live game.
- Inference runs inside the API on CPU (LightGBM or ONNX), so the hosted demo stays at zero cost.
  Target and measure p95 latency for scoring a full game.
- **The 2026-27 model is frozen at its freeze date** (hash recorded). No mid-season refit or
  recalibration, so the live score stays a true prospective test. Retraining is a once-a-year
  offseason job that creates a new version.
- Nightly job in `refresh-daily`: score every completed game (Brier, log loss, calibration) for
  CourtLens and ESPN on the same events, append to a scorecard, and flag drift when a rolling
  30-day calibration error leaves the test-season interval.
- **Hosted demo:** the public site is a frozen read-only snapshot. Ask the owner whether the
  scorecard reaches it by a scheduled sync of the scorecard bundle or by running the nightly job
  on the VPS (CPU only, zero cost); follow [the deployment guide](deployment.md) either way.

**Pages.**
- Live: CourtLens win-probability chart beside ESPN's, with a toggle; game flow annotated with the
  biggest swings.
- Research → Win Probability: model card, calibration curves, the live season scorecard (CourtLens
  vs ESPN, updating nightly), drift status.
- Win probability added (WPA) per player from the swing of each event they were credited with:
  season leaders and clutch splits, labelled as credit assignment, not causal value.

Acceptance: registered selection passes, or the negative result is published. Production parts
(frozen version, nightly scorecard, drift flag) verified on real 2026-27 games.

### R16 — Ask assistant held-out evaluation (applied AI)

The AG08 holdout was waived when the free provider tier ran out. Finish it: run the frozen 24-case
holdout (plus the 360-run development set for comparison) on the free provider pool, spread across
days to stay inside quotas. Publish accuracy with intervals, failure categories and per-tool
error analysis on a public evaluation page, since Ask itself stays off on the hosted demo. Add a
short recorded demo of Ask answering from the warehouse.

### R13 — Parked: prospect projection

Needs college stats (barttorvik.com is free), league-strength translation and a small number of
testable classes. Start only on a new owner decision.

## Guardrails specific to this phase

- **Register before fitting.** Every model above gets a protocol under `evaluation/research/`
  with frozen splits, candidates and acceptance gates. Negative results are published, not hidden.
- **No leakage.** Features and ratings use only games before the prediction date; the backtest
  fits ratings on earlier games only; the shrinkage prior is fitted on earlier seasons.
- **Intervals, not verdicts.** No "better player" claim from overlapping intervals.
- **Credit.** Databallr is credited as the design and method reference on each replicated page;
  every external method names its source.
