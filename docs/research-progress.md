# CourtLens Research progress log

Evidence log for the [Research handoff](research-plan.md). Record measured results, commands,
coverage and screenshots per block. Plan text is not evidence.

## Block status

| Block | Status | Evidence |
| --- | --- | --- |
| R01 Impact history backfill, time decay, intervals, rating snapshots | ✅ measured (page work is R02) | [R01 evidence](evidence/research/r01/README.md): twelve regular seasons sealed and served (97.5–99.9% of games admitted); 200-replicate intervals; time decay; six-factor R² 0.955–0.966; 91 dated snapshots |
| R02 Six-Factor RAPM + Impact Tree | 🟡 built and verified on real data; redesigned from Databallr (design 18, 2026-11-06); page awaits owner | [R02 evidence](evidence/research/r02/README.md): all 12 regular-season fits have intervals on all nine nodes, so no new protocol; six factors reconstruct RAPM at R² 0.955–0.966 (0.950–0.964 held out); tree equals the bundle on 64,098 nodes; playoff intervals unknown |
| R03 Signal vs Noise | 🟡 built and verified on real data; full Playwright not run (memory); page awaits owner | [R03 evidence](evidence/research/r03/README.md): 19 of 20 rate stats stabilize; **3P% never reaches 0.5** in observed samples (largest bin 0.486 at 480 3PA; fitted curve 419); FT% 27 FTA, TS% 169 TSA; shrinkage cuts next-season error for 3P%, FT%, 2P%, TS%, rim FG% by 32–53%, all intervals above zero |
| R04 zTS + validation | 🟡 built and verified on real data; full Playwright not run (memory); page awaits owner | [R04 evidence](evidence/research/r04/README.md): FTA not derivable, so play-type TS is CourtLens's own; split verdict on test seasons: zTS tracks oTS RAPM better (+0.135 in r, +0.104 to +0.164), predicts next-season rTS worse (−0.134, −0.160 to −0.107); 3,329 player-seasons served, every other with a named reason |
| R05 Shot Quality v2 model | 🟡 built and verified on real data; full Playwright not run (memory); page awaits owner | [R05 evidence](evidence/research/r05/README.md): **accepted**; LightGBM with shot type and pre-shot context beats league zone × distance rates by 3.44% Brier on 2022-23 and 2.56% (2.44 to 2.67) on 2024-25 and 2025-26, ECE 0.0102; slightly worse on 3-pointers (−0.28%); shot-making persists r = 0.625 (0.542 to 0.696), no more than raw PPS |
| R06 ShotQuality decomposition + Defensive Shot Quality | 🟡 built and verified on real data; full Playwright passed (`82bd01a`); pages await owner | [R06 evidence](evidence/research/r06/README.md): committed `1c3627a` and `7cc6cf7`; decomposition TS = SQ + Make + FT with residual 0; **persistence check: no clear difference** between oSQ (r 0.451) and oMake (r 0.349), +0.102 (−0.021 to +0.211); D-SQ next-season r 0.417 (0.354 to 0.474); 429 of 2,818 defender-seasons (15.2%) exclude zero against 5% by chance |
| R07 Projected Impact | 🟡 frozen and scoring; prospective score unverified; page awaits owner | [R07 evidence](evidence/research/r07/README.md): frozen 2026-11-05 04:53:33 UTC, `6eaef389…`; beats carry-forward on 2024-25 and 2025-26 for players (+4.38, 3.25 to 5.50) and game margins (+13.42, 9.55 to 17.14) and time-decay RAPM more narrowly; intervals over-cover (84.3%), F1 failed and owner waived it; ridge beat the selected LightGBM on test |
| R08 Metric Backtest | 🟡 measured and frozen; prospective score unverified; page awaits owner | [R08 evidence](evidence/research/r08/README.md): 9 metrics on 11,979 games (2016-17 to 2025-26), ratings fixed before each game, actual minutes; **monthly time-decay RAPM is the only metric ranked above every other** (RMSE 13.52 against the team baseline's 14.32, +0.80, 0.72 to 0.88); every player metric beats the baseline; Projected Impact unranked against RAPM 3Y and the opener snapshot, behind monthly time decay; DARKO omitted (hindsight only) |
| R09 Draft Classes | 🟡 built and verified on real data; page awaits owner | [R09 evidence](evidence/research/r09/README.md): full pick lists 1966–2026 (6,581 picks; Wikipedia 1966–95, official 1996–2026); first-four-season win shares fall from 24.8 (21.2 to 28.6) at pick 1 to 5.7 (3.7 to 7.8) at pick 30 and 1.2 at pick 60; every registered slot band differs except pick 1 vs 2 in 1966–88 and on minutes; 57 classes redrafted; combine measurements correlate weakly (|r| ≤ 0.12); 2026-27 rookie tracker live; one 1982 pick misattributed (disclosed) |
| R10 Wingspan, ORtg Calculator, Shot Aftermath restyle | 🟡 data part built and verified on real data; design phase pending; pages await owner | [R10 evidence](evidence/research/r10/README.md): wingspan − height against career DARKO D-DPM **r +0.21 (+0.15 to +0.27)**, 822 combine players, descriptive only; wingspan with height held fixed +0.23; positive within every position but PG; calculator gets every season's (2014-15 to 2025-26) observed inputs to Poropudas and Halme's Eq. (11), μ 0.422–0.437; four-factors v1 defective (no threes before 2024-25), v2 served; Shot Aftermath found not restyle-only (needs new data, owner's call) |
| R11 Learning, Glossary, Patch Notes | 🟡 built and verified on real data; page awaits owner | [R11 evidence](evidence/research/r11/README.md): Learning has 22 topics in 5 tiers, 14 quoting a measured result; all 39 quoted numbers equal their frozen files; league table from `/api/four-factors` (2014-15 to 2025-26 only); Glossary generated from the catalog; Patch Notes from real merges and commits (83 references checked against git at R11; 85 with the R11 entry added in R12); Blog gone |
| R12 Research landing, menu, README | 🟡 built and verified on real data; demo not refreshed; page awaits owner | [R12 evidence](evidence/research/r12/README.md): `/research` cards for R15 (log loss 0.4028), R08 (+0.80), R07 (+4.38), R05 (2.56%), R16 "evaluation in progress" with no number; menu matches D8 plus the landing; README Results with the four numbers, checked by Vitest; demo steps prepared, deploy-config gap found (owner's call) |
| R14 Lineup model with learned embeddings | 🟡 built and verified on real data; page awaits owner | [R14 evidence](evidence/research/r14/README.md): **registered verdict ridge better**, by 0.000011 per 100 (0.000008 to 0.000014) on 97,427 held-out stints 2023-24 to 2025-26, so no practical difference: selection chose the strongest interaction penalty and the learned interaction is about zero (SD 0.003 to 0.007 per 100); in R08's game backtest the lineup model ranks above team net, plus-minus and on/off, unranked against RAPM and Projected Impact, below both time-decay variants; the UMAP map is seed-unstable (1.9% neighbour agreement, chance 1.8%) and says so; lineup tool served with intervals |
| R15a Win Probability: model and final-test report | ✅ measured (production and pages are R15b) | [R15a evidence](evidence/research/r15a/README.md): both gates pass on 2,439 test games; log loss 0.4028 against 0.4157 baseline, calibration error 0.0083; level with ESPN overall, better after halftime; behind the closing spread pregame; lineup step S4 failed |
| R15b Win Probability: production, scorecard, pages | 🟡 frozen and running; prospective scoring and arm64 unverified; pages await owner | [R15b evidence](evidence/research/r15b/README.md): frozen 2026-11-04 22:08:55 UTC; ESPN-built states change log loss +0.0002; p95 23 ms per game; nightly job and drift flag run on 107 real pre-freeze games; 14 games sealed as the first prospective |
| R16 Ask held-out evaluation | ⬜ pending | |
| R13 Prospect projection | ⏸ parked | |

## 2026-11-04 — Plan recorded

The owner delegated all Research scope decisions. Databallr's public pages were read for the view
list (sitemap, home, `/beta`, `/decomp`, Draftballr model explanation); no data was copied.
Findings beyond the owner's screenshots: `/decomp` is a mock-up with fake data; `/beta` holds a hex
shot map, a distance analysis and a time-decay RAPM watch grid; nbarapm.com offers rolling-peak and
per-decade RAPM boards. Repo facts at planning: RAPM served for 2023-24 to 2025-26 only; Synergy
play types 2015-16 onward with no FTA column; expected-shot v1 sealed as a registered negative
result.

## 2026-11-04 — ML blocks added

The owner chose a live win-probability model as the ML centrepiece (R15) and approved the lineup
model (R14) and the Ask holdout evaluation (R16). Run order is now R01 → R15 → R07 freeze → the
rest, so the prospective 2026-27 tests start as early as possible. ESPN's per-play win probability
is already parsed in `src/courtlens/domain/live.py`, so the play-by-play comparison needs no new
live source.

## 2026-11-04 — Win-probability inputs and compute

Owner asked for a more comprehensive win-probability model (player and team inputs) and offered
Google Colab through their Google AI Pro plan. R15 now adds features in registered groups (game
state, team strength, team context, players available and on the floor, in-game box stats), each
measured as an ablation. D12: local CPU by default; Colab optional for neural models, with hashed
dataset exports and CPU-reproducible results.

## 2026-11-04 — Win-probability structure revised

The owner asked for an expert design rather than their own feature list. R15 now has a pregame
layer (player-based strength, context, volatility; betting market as benchmark only) feeding an
in-game layer that predicts the remaining-margin distribution: a Stern Brownian-motion baseline,
distributional gradient boosting for corrections, and a discrete end-game specialist. Ablations
S0–S5 replace groups A–E. Reason: about 14,000 game outcomes against 13 million rows, so
structure goes where basketball knowledge is reliable.

## 2026-11-04 — R01 measured

[Evidence](evidence/research/r01/README.md), [coverage](evidence/research/r01/coverage.json),
[results](evidence/research/r01/results.json). Registrations frozen before fitting:
`courtlens-impact-history-v1` (kept; its pilot tripped the stop rule), `-v2` (adds rule R01-H5),
`courtlens-rapm-time-decay-v1`, `courtlens-impact-intervals-v1`,
`courtlens-six-factor-reconstruction-v1`, `courtlens-rating-snapshots-v1`.

- **Backfill.** Regular seasons 2014-15 to 2022-23 from the IM01-pinned archive. The pinned index
  has no `cdnnba` before 2020-21, so 2014-15 to 2019-20 are single-source. The v1 pilot excluded
  52 / 27 / 3 of 100 games (2014-15 / 2017-18 / 2020-21): substitution text keeps players' old names
  (Kanter, "Ennis", "Bullock") while boxes were renamed later. Rule R01-H5 resolves them only from
  the same game's rows and records every rewrite; the owner approved sealing with it. Admitted:
  98.2, 99.1, 98.0, 98.9, 99.8, 97.5, 99.4, 99.8, 99.9% of scheduled games; 23 more games excluded
  by the event gate (pbpstats sequence review only). Two IM02 runs reproduce `a3db5faf…`. Nine
  `courtlens-impact` datasets sealed (ready; counts match; re-seal reuses). Database 16 → 22 GB.
- **IM04-method fits.** 27 new windows; all chose alpha 1000 (the pinned grid's top, as in the
  sealed fits). 2020-21's box prior skips 2019-20 under the pinned 1 July rule (bubble cutoff).
- **Intervals.** 200 game-bootstrap replicates per 1Y fit and per time-decay season-end fit;
  median 80% width for 1Y RAPM 5.4–6.1 points per 100; 29–42% of qualified players exclude zero.
- **Time decay.** Held-out stint margin RMSE lower than the 1Y fit in 10 of 11 seasons, by 0.12 on
  average: small and unconfirmed (no registered interval on the difference).
- **Six-factor R².** 0.955–0.966 in-sample, 0.950–0.964 10-fold CV, 0.951–0.963 cross-season;
  not the commonly quoted 0.985.
- **Snapshots.** 91 time-decay snapshots, 2015-10-27 to 2026-05-01, each fitted only on earlier
  games (index check passes for all).
- **Serving.** Impact serving, team splits, WOWY and stint box bundles now include the history
  seasons (sealed entries byte-identical; `.current` moved, nothing pruned). Hosted demo unchanged.
- **Checks.** Ruff/format/strict mypy clean; full suite 2,378 passed, 8 failed, all Anthropic
  provider tests failing on the installed SDK's `httpx2` client check (environment, unrelated).
- **Runtime and memory.** Downloads 69 s; IM02 4.9–5.8 min per run; IM03 15.0 min; sealing
  24.4 min; IM05 extras 8.3 min; history fits 27.0 min; 1Y intervals 5.6 min (12 seasons); time
  decay with its intervals and diagnostics 14.2 min; snapshots 24.6 min. Peak 1.8 GiB (IM03), inside
  the 3 GiB caps.

## 2026-11-04 — R15a measured

[Evidence](evidence/research/r15a/README.md). `courtlens-win-probability-v1` was superseded before any test read, because its monotone constraint blocked mean reversion; `-v2` is the registration of record and every artifact was rebuilt under it.

- **Gates.** Both pass on 2024-25 and 2025-26 (2,439 games). A1: log-loss gain on the baseline +0.0130 (+0.0089 to +0.0169). A2: calibration error 0.0083 (limit 0.02).
- **Selected model.** S2 plus the end-game specialist, not recalibrated. S1 and S2 accepted; S3, S4 and S5 rejected on 2022-23 and no better on test. S4, the expected differentiator, is a negative result (-0.0009 (-0.0021 to +0.0004)). So the first frozen R15b model does not need the live lineup tracker.
- **ESPN.** All states +0.0034 (-0.0011 to +0.0080) (includes zero). ESPN leads at tip-off, they tie in the first half, and CourtLens is better after halftime (phase intervals unadjusted).
- **Market.** The closing spread wins pregame: RMSE 13.71 against 14.16.
- **Data.** 14,296 games, 3,150,447 states, none excluded. A score-reset bug in older rows was found by audit and fixed before fitting; replay then disagrees with 0 of 11,090 stint-end scores. Causality audit: 0 of 124,948 states change when later rows are removed.
- **Sources.** ESPN summaries at 5-second pacing (2,766 requests, no failures, 3 h 50 min); hoopR-nba-data closing lines (CC BY 4.0, pinned commit). New dependencies: LightGBM 4.7.0, pyarrow (dev).
- **Runtime and memory.** Whole pipeline under 15 minutes, peak 2.2 GiB, inside the 3 GiB cap.
- **For R15b.** The Docker image may need `libgomp` for LightGBM. Owner decisions, 2026-11-04: (1) **freeze the tested model as is**, with no refit on newer seasons; any refit needs its own version and report and is an offseason job. (2) **The scorecard reaches the hosted demo by a scheduled sync of the scorecard bundle**; the VPS stays read-only and does not run the nightly job.

## 2026-11-04 — R15b measured

[Evidence](evidence/research/r15b/README.md). Model frozen as tested, manifest `b2b0db82311fd6c5…`, files in the artifact registry.

- **Parity passes.** On 2,439 test games, states built from ESPN change log loss by +0.0002 (+0.0001 to +0.0002) on Live's sample and +0.0005 at the same times; calibration error stays 0.0083; mean probability gap 0.0017. Limits were set before the full run.
- **Pregame.** The test numbers assume a known inactive list, which Live does not have before tip-off. It uses ESPN's roster minus reported Out. No injury news at all costs +0.0034 (+0.0016 to +0.0052); Live's real cost is unmeasured until prospective boxes arrive.
- **Ratings keep the monthly rule.** Holding one snapshot all season costs +0.0039 (+0.0018 to +0.0058), so the method is pinned, not one file. Moving to Projected Impact needs a new version. The owner confirmed this reading of the no-refit decision on 2026-11-04: the model files stay frozen and ratings keep refitting monthly.
- **Live lineup tracker skipped.** S4 was rejected and the frozen model does not read lineups; the S3 fallback no longer applies because S3 was rejected too.
- **Platform.** `libgomp1` added. x86 image matches the reference exactly. arm64 unverified: no emulation here.
- **Drift interval** computed by game bootstrap from saved predictions, without refitting: 0.021–0.074 at 100 games.
- **Serving.** p95 23 ms per full game on one x86 thread.
- **Scorecard.** 107 pre-freeze games scored (hindsight, not prospective): CourtLens 0.4269, ESPN 0.4202, gap -0.0068 (-0.0338 to +0.0187); drift within. 14 games of 2026-11-04 sealed before tip-off.

## 2026-11-05 — R07 measured

[Evidence](evidence/research/r07/README.md). `courtlens-projected-impact-v1` committed before any fit; 2026-27 projections frozen 2026-11-05 04:53:33 UTC, `6eaef38960af783b…`. First games that can count tip 2026-11-06 02:00 UTC.

- **Gates.** A1 players +4.38 (+3.25 to +5.50), player RMSE 2.82 against 3.51. A2 games +13.42 (+9.55 to +17.14), margin RMSE 14.66 against 15.11. Both pass on 2024-25 and 2025-26 (911 player seasons, 2,460 games).
- **Time-decay RAPM is the harder comparison.** LightGBM beats it by +1.30 (+0.65 to +2.00) and +2.85 (+0.46 to +5.33). Reported, not a gate. By season, 2 of the 4 intervals exclude zero (table in the evidence).
- **F1 failed: intervals too wide.** 84.3% against a nominal 80% (limit 77–83%); under-500 and no-prior buckets 89%. A freeze-stopping check; the owner waived it for over-coverage only on 2026-11-05. Not tuned on test.
- **Negative results.** Ridge beat the selected LightGBM on test (margin RMSE 14.51, player RMSE 2.76); selection on 2023-24 stands. The age curve adds almost nothing and is worse on games (-1.92). No clear gain for rookies or returners.
- **Weekly score.** Step in `refresh-daily`, 7-day guard, append-only. 107 real games scored, all labelled hindsight; 0 prospective so far.
- **Hosted demo.** Built, not deployed.

## 2026-11-05 — Research menu trimmed, dropped pages removed (owner request, part of R12)

Screenshots: [1440](evidence/research/menu/research-menu-1440.png), [390](evidence/research/menu/research-menu-390.png).

- **Menu.** Five D8 groups and eight items, all existing pages, each with an icon and one-line description in two columns like Databallr's menu. Later blocks add their own items.
- **Removed.** Workload Trends and Distributions & Splits (D8) now redirect to Last X Games, and the Blog (D3) to What's New. Player page, Stats drawer, Case Studies and Learning links updated; backend operations kept for Ask and saved investigations.
- **Off the menu, pages kept.** Case Studies, Saved Investigations and Evaluation Archive, linked from Methodology; Evaluation Archive also from Points Forecasts.
- **Verified.** On `localhost:3100`, at 1280, 1366, 1440 and 1920 the panel fits the viewport with an icon on all eight rows; at 390 the drawer lists them without page overflow. Vitest 703 passed; lint and typecheck clean.
- **Not verified: Playwright.** The one full run is invalid: a stale server held the sandbox port, so tests hit an old build, and the system then stopped the run for low memory. Rerun before merging.
- **R12 remainder.** `/research` landing, README results and the demo refresh remain pending.

## 2026-11-05 — R15b first prospective run

The 13:30 UTC `refresh-daily` run succeeded and scored the 14 games of 2026-11-04, the first prospective games. Too few to judge: drift status is `insufficient` (minimum 25 games) and no interval exists yet.

- **Log loss on matched states.** CourtLens 0.4433, ESPN 0.4213, one night only. The pre-freeze replay was 0.4269 and 0.4202.
- **Live's injury-information cost.** Across 13 games, tip-off and hindsight expected margins differ by a mean of 0.62 points in absolute value (95th percentile 1.97).
- **Weekly R07 step.** Under the timer it skipped as designed (`last_written` 2026-11-05 04:54:49 UTC).

## 2026-11-05 — R02 measured, Playwright debt settled

[Evidence](evidence/research/r02/README.md). `/research/rapm/six-factor` is the new explainer, table and Impact Tree. Nothing was fitted.

- **Intervals.** All 12 one-year regular-season fits have them for RAPM, ORAPM, DRAPM and all six factors; 0 values lack one. No new registration. Playoff fits have none (166 values), and neither they nor the composites get an invented one: shown as unknown.
- **Reconstruction.** R² 0.955–0.966 in-sample, 0.950–0.964 held out, from R01's registration. Not 0.985.
- **Tree.** 64,098 nodes across 15 scopes equal the bundle exactly. In the browser, 14 views at 1440 and 390 match the API with no console errors, including partial data, factors without RAPM, a rated rookie and a rookie with no row.
- **Composites.** Net Efficiency and Possession Control are CourtLens's own weighted sums, with no interval. They add to the reconstructed RAPM.
- **Menu.** RAPM Research is now Six-Factor RAPM, on the same icon and description. The old page stays as the RAPM Ratings tab.
- **Playwright debt from e50b564.** First valid run: 509 passed, 17 skipped, 5 failed, all stale tests or baselines. Also traced a 52 px phone flash on Player Twins that predates R02 (16 of 120 loaded runs on e50b564, settled by 1.2 s); the test now waits for the settled page, the flash remains.
- **Checks.** Full Playwright 523 passed, 17 skipped, 0 failed. Vitest 713 passed; lint, typecheck, Ruff, format and strict mypy clean. Python 2,475 passed, 1 skipped, 8 failed: the same Anthropic SDK environment failures as R01.

## 2026-11-05 — Build first, design after (D13)

The owner judged the Research pages' styling well below the aligned core pages and chose to build each page's function first, then redesign every Research page in final design blocks, as on the core pages. Recorded as [D13](research-plan.md#owner-decisions-2026-11-04-delegated). R03 is the next build block. Correction to the R02 entry: that page was built from the plan's list of sections, with no Databallr screenshot, so it is a first draft of the layout; its data checks stand.

## 2026-11-05 — R03 measured

[Evidence](evidence/research/r03/README.md). `courtlens-signal-noise-v1` committed on its own before any fit. Results `22a227b2…`, reproduced by two runs with the final code (byte-identical file).

- **Coverage.** Game logs exist for regular seasons 1983-84 to 2026-27, not only from 2000-01. Stabilization uses 2014-15 to 2025-26: 5,707 player-seasons, 500 random game splits each. Rim FG% was not on the Stats table; game-level rim attempts come from the retained NBA shot detail, 2014-15 to 2025-26 (every logged game covered; FGA disagree with the box in 360 of 306,337 player-games). 2026-27 rim is unknown.
- **Stabilization (reliability 0.5, then 0.7).** 3P% **not reached**: largest bin 0.486 (0.401–0.549) at 480 3PA; the fitted curve would cross at 419 and 978, served only as labelled extrapolation. FT% 27 and 64 FTA; 2P% 65 and 152; rim FG% 70 and 164; TS% 169 and 395 TSA; eFG% 149 and 347 FGA. Per-36 rates from 19 (3PA) to 284 minutes (STL).
- **Shrinkage.** Beta-binomial priors from up to three earlier seasons. Their strengths match the stabilization points (FT% 26.9 against 27; rim 77 against 70). Next-season error, raw minus shrunk ×10⁻⁴: 3P% 20.4 (17.3 to 23.6), FT% 16.9 (12.0 to 22.4), 2P% 11.4 (8.2 to 15.6), TS% 9.8 (7.7 to 12.7), rim 19.3 (15.3 to 24.2); shrunk wins in every attempt band.
- **Bug found and fixed before publication.** The first run's prior optimiser stopped unconverged for 3P%, FT% and rim FG%, collapsing everyone to the league mean. It was replaced by a profile-likelihood fit that raises on non-convergence and recovers known priors in tests; the registration is unchanged.
- **Stats toggle.** "Shrunk %" is off by default and inert when off. On, it adds labelled shrunk columns. In the browser, 855 shrunk cells across four scopes match values recomputed from the database; raw cells and the Stats query never change.
- **Checks.** Page vs API: 122 values at each width, 0 mismatches, 0 console errors. Ruff, format, strict mypy, lint, typecheck clean; Vitest 715 passed; Python 2,493 passed, 1 skipped, 8 failed (the known Anthropic SDK tests). Targeted Playwright 53 passed. **Full Playwright not run**: 9.1–9.4 GiB available against the ~12 GiB it needs.

## 2026-11-05 — R04 measured

[Evidence](evidence/research/r04/README.md). `courtlens-zts-validation-v1` committed on its own (`6be3fe2`) before any zTS existed. Results `ecc5ae9f…`, reproduced by four runs (byte-identical files).

- **FTA.** Not derivable: Synergy rows count free-throw trips and and-ones, not attempts, and carry no 3PM. The best proxy is 0.956 of box FTA at the median (0.827 to 1.010) on 2,013 player-seasons. Play-type TS is CourtLens's PTS / (2 × possessions × (1 − turnover share)), never presented as Databallr's.
- **Choices.** rTS is the Stats table's `impact_rts`. League play-type TS is pooled over the same season's rows, weighted by scoring possessions. zTS needs 200 TSA, 90% coverage and no dropped source row.
- **Source gaps.** The source omits play types under 10 possessions and, from 2023-24, drops whole rows. Dropped rows are detected exactly (more missing than the absent types could hold) and served as unknown: 145, 40 and 39 player-seasons in 2023-24 to 2025-26. 3,329 of 5,970 player-seasons are served; every other has one named reason.
- **Test (pooled test seasons, 95% paired player-cluster bootstrap).** Same-season oTS RAPM: zTS better, r 0.543 against 0.408, +0.135 (+0.104 to +0.164). Next-season rTS: rTS better, r 0.640 against 0.506, −0.134 (−0.160 to −0.107), MSE likewise. Same direction in every test season and in the choice seasons.
- **Design reference.** The owner's saved Databallr page (About and Top 200; the Player tab was not in it, so that tab has no reference). Spot check: Role for Harden 2018-19, Curry 2015-16 and SGA 2025-26 matches Databallr's to 0.1.
- **After the test was read**, serving and presentation only (frozen hash unchanged): minutes, usage and TS add from the bundle; default player changed to highest zTS add; absent play types shown as not listed.
- **Checks.** Page vs API 3,346 values at 1440 and 390, 0 mismatches, 0 console errors; bundle fields 19,974 values, 0 mismatches. Ruff, format, strict mypy, lint, typecheck clean; Vitest 719 passed; Python 2,517 passed, 1 skipped, 8 failed (the known Anthropic SDK tests); targeted Playwright 28 passed. **Full Playwright not run** (8.3–9.6 GiB available against ~12 GiB), so R03's debt is still open.

## 2026-11-05 — R05 measured

- **Reference.** The owner's saved Databallr page is the ShotQuality RAPM decomposition (R06's content). The Players tab follows its filters, ranked table and how-to-read; the Model and Player tabs have no reference, and the page says so.
- **Data check.** 2,524,964 regular-season field-goal attempts 2014-15 to 2025-26 joined to PlayByPlayV3 at 99.92% (2017-18) to 100% per season; unjoined shots keep their location with unknown context. Possession context known for 99.56–99.72%. Assisted is excluded (recorded only on makes: 0 of 1,355,809 misses). The target is field-goal points only, because fouled misses are absent from the shot chart.
- **Registered first.** `courtlens-expected-shot-v2` (`1c1a2037…`, commit `88fd291`) pins the twelve shot tables, three candidates, v1's 1% selection gate, Platt calibration on 2023-24 and three test gates. Choice pass read before the test pass; nothing changed after either.
- **Result: accepted.** Selection 2022-23: LightGBM 31 leaves +3.44% Brier (3.27 to 3.62). Test 2024-25 + 2025-26: Brier +2.56% (2.44 to 2.67), log loss +2.31%, ECE 0.0102. The shot-type table alone gives +1.42%. Gains at the rim (+8.3%), on putbacks (+7.7%) and in transition (+4.7%); 3-pointers −0.28% (−0.36 to −0.19). v1's location-only candidate managed +0.08%.
- **Players.** Shot-making per 100 shots against the expected value, net of each season's league term, 300+ FGA, 2022-23 to 2025-26, with player-game bootstrap intervals. Season-to-season r = 0.625 (0.542 to 0.696), about the same as raw PPS (0.623); xPPS 0.845.
- **Checks.** Three runs byte-identical (`dd859539…`); page vs API 9,970 values, 0 mismatches, at 1440 and 390. Ruff, format, strict mypy, lint, typecheck clean; Vitest 722; Python 2,528 passed, 8 known Anthropic SDK failures; targeted Playwright 33 passed. **Full Playwright not run** (5.9–8.0 GiB available against ~12 GiB), so R03's and R04's debt is still open.

## 2026-11-05 — R06 measured

[Evidence](evidence/research/r06/README.md). Two registrations, each in its own commit: `courtlens-shot-decomposition-v1` (`2fbcd3b`, results `1e437b5e…`) and `courtlens-defensive-shot-quality-v1` (`e6305ae`, results `5c2c9cb5…`); two runs of each are byte-identical. **Disclosure:** a shell mistake ran one Part A fit before its registration commit; its output was deleted unread, and the reruns give the same hash. The Part B registration wrongly says free data has no closest-defender feed; the evidence corrects it and no number depends on it.

- **Reference.** The owner's saved Databallr ShotQuality RAPM and D-ShotQuality pages. The decomposition is a new tab on Shot Quality (owner's choice). Not reproduced: 2nd Defender (help columns are zero in every row), a Closest Defender split, Data Source.
- **Part A data.** Accepted R05 model, 2022-23 to 2025-26 only. Shots join possessions at 98.54% to 99.91%, every gap but a few strays being R01's excluded games. Every FT trip classifies from PlayByPlayV3: 0 unknown. Expected FT value reads nothing at or after the trip. TS = SQ + Make + FT on every attempt: residual 0.
- **Part A results.** Alpha 3000, one-season fits. Coefficient gap under 1e-9; second-stage coefficients 1.000, R² 1.0000, which follows from ridge being linear in the target and confirms arithmetic only. Median 80% widths: oTS 2.3, oSQ 0.66, oMake 2.2, oFT 0.44.
- **Registered persistence check: no clear difference.** oSQ r = 0.451 (0.359 to 0.533), oMake r = 0.349 (0.267 to 0.427), difference +0.102 (−0.021 to +0.211). On defence, reported only: dSQ 0.430, dContest 0.134, difference +0.295 (0.192 to 0.397).
- **Part B.** Matchup archives 2017-18 to 2025-26; `person_id` measured as the shooter. Expected rate from the shooter's attempts on everyone else, R03's prior, whole season (hindsight, stated). 429 of 2,818 defender-seasons (15.2%) have a 95% interval excluding zero against 5% by chance. D-SQ next season r = 0.417 (0.354 to 0.474); against dContest r = 0.495 (0.445 to 0.544), dSQ r = 0.231 (0.167 to 0.295). Interval widths of 17 to 19 points per 100 separate only the extremes.
- **Checks.** Page vs API 92,022 values at 1440 and 390, 0 mismatches, 0 console errors, 0 overflow; recompute from tables and raw archives within rounding (5.0e-10). Ruff, format, strict mypy, lint, typecheck clean; Vitest 723; Python 2,583 passed, 8 known Anthropic SDK failures; targeted Playwright 37 passed. **Full Playwright not run** (about 10 GiB available against ~12 GiB), so R03, R04, R05 and now R06 are unchecked by it.

## 2026-11-05 — Full Playwright for R03 to R06

Run on `research` at `1c3627a` by request, from a production build and the mock API on private ports, two workers, inside an 8 GiB capped unit (about 10 GiB was available). First run: 543 passed, 17 skipped, 2 failed. Both failures were strict `getByText` lookups (Projected Impact's negative-result line, the Methodology catalog heading) matching twice: React's streamed Suspense chunk briefly keeps a hidden copy of a section outside `#content`, which the lookup caught under load. Neither page changed in R03 to R06. Fixed in the specs with the repo's existing `.filter({ visible: true })` pattern (`e2e` commit after `1c3627a`). The two specs then passed 240 of 240 across ten repeats at four workers, and the full suite passed: **545 passed, 17 skipped, 0 failed** (3.9 min). The R03 to R06 debt is settled.

## 2026-11-05 — R08 measured

[Evidence](evidence/research/r08/README.md). `courtlens-metric-backtest-v1` committed on its own (`7f6f0f6`) after the code (`4f8a128`, which cannot score without it) and before any score. Results `0d45de08…`, reproduced twice. 2026-27 rules frozen 22:52:08 UTC (`4b5f3fc`). **Disclosure:** the first chained `commit && run` stopped before the runner started (`/usr/bin/time` is not installed); nothing was computed.

- **Design.** For every regular-season game, each metric predicts the home margin from ratings fixed before the game, weighted by actual box minutes (hindsight on purpose: it tests ratings, not forecasts). Margin = a × home + b × strength, with a, b and the residual SD fitted on the latest earlier season. Paired game bootstrap, 2,000 replicates, seed 8008.
- **Data check.** Season-end fits (1Y, 3Y, box-prior, plus-minus, on/off) are used only for the next season. Time decay reads R01's dated snapshots, both monthly and opener-only. Projected Impact comes from R07's frozen model via R07's own path, only on 2024-25 and 2025-26. DARKO is omitted (retrospective ratings only). 11,979 box-score games. Team net equals the Teams API on 360 values. Recomputed Projected Impact reproduces R07's published RMSE exactly. Leakage audit: 103,912 game ratings, 0 violations. Rookies take the source's 20th percentile (0.5–14.3% of minutes by metric). Nothing was chosen from outcomes.
- **Result.** Monthly time decay is the only metric ranked above all others under the registered rule (interval excludes zero and lower RMSE in most shared seasons), including over the same method frozen at the opener (+0.20, 0.15 to 0.24). Every player metric beats team net. RAPM 3Y beats RAPM 1Y (+0.15). Projected Impact beats RAPM 1Y (+0.33) but is unranked against RAPM 3Y and the opener snapshot, and it trails monthly time decay (−0.31). 2 of 36 pairs are unranked.
- **2026-27.** `courtlens refresh-metric-backtest` is built and scored 120 real games, all before the freeze (hindsight). No timer is installed: suggested weekly, after the R15b snapshot job.
- **Checks.** Page against API: 3,036 values at each of 1440 and 390, 0 mismatches, 0 console errors, 0 overflow. Ruff, format, strict mypy, lint and typecheck clean. Vitest 728. Python 2,603 passed with the 8 known Anthropic SDK failures. Full Playwright: 551 passed, 17 skipped, 0 failed, after fixing one strict Roster Shapes lookup (hidden Suspense copy). The Roster Shapes drag test failed 2 of 10 times under a 4-worker stress run only; noted, not fixed.

## 2026-11-06 — R09 measured

[Evidence](evidence/research/r09/README.md). `courtlens-draft-value-v1` committed on its own (`207a9b5`, hash `475cf772…`) after the code (`fb5d421`) and before any outcome summary. Results `7b7bd3b8…`, reproduced twice. Descriptive: no prospect model (D4).

- **Owner input.** The owner supplied saved Draftballr pages and chose not to replicate Draftballr (its own site and design language): match CourtLens and Databallr, add relevant data. Prospect boards stay out; Draftballr's redraft maps to the class retrospectives.
- **Data.** `courtlens acquire-draft-history` sealed 1966–99 pick lists (`courtlens-draft-history-v1`, `cfa65a48…`): the official 1996–99 files from the pinned hoopR mirror and Wikipedia's draft articles for 1966–95 (NBA Stats timed out; the Basketball-Reference crawl was not touched). Every class 1966–2026 has picks 1..N with no gap. All 1,778 NBA.com bio slots for 1966–99 name the same person. Wikipedia is admitted in source policy v3 as its own row.
- **Rules.** Value is win shares and minutes over the first four seasons (complete for classes to 2022), career to date (classes 1966–2005 for value by pick), RAPM for 2014–22. A pick absent from the complete league totals counts as zero. Classes 2023–25 are labelled and never redrafted or scored. 2,000-replicate bootstrap over players within each slot.
- **Results.** Pick 1 24.8 win shares (21.2 to 28.6), pick 2 17.5, pick 3 20.3, pick 10 10.8, pick 30 5.7, pick 31 3.9, pick 60 1.2. Every registered band differs on win shares except pick 1 vs 2 in 1966–88; on minutes pick 1 vs 2 never differs. RAPM by pick (nine classes) separates nothing. Steals: Kareem, Chris Paul, Jordan, Haywood, Barkley; misses: Larue Martin, Olowokandi, Bennett, Washburn, Bias. Combine: weight +0.12, wingspan +0.10, vertical and agility near zero.
- **Rookie tracker.** Served live: 45 of 60 2026 picks played through 2026-11-04, each compared with all past picks at his slot (1983–2025) over the same number of first-season games; DARKO and time-decay RAPM shown with their dates, not compared.
- **Disclosure.** NBA.com's bio gives Walker Russell and his son the same 1982 slot (pick 78); the build credited the son, so that pick shows 0 instead of −0.5 win shares. Beyond pick 60; value by pick unaffected; a fix needs v2.
- **Checks.** Page against API: 88,467 values at 1440 and 25,551 at 390, 0 mismatches, 0 console errors, 0 overflow. Separate SQL reproduces 6,335 complete-class pick values exactly. Ruff, format, strict mypy, lint and typecheck clean. Vitest 731. Python 2,625 passed with the 8 known Anthropic SDK failures. Full Playwright 558 passed, 17 skipped, 0 failed.

## 2026-11-06 — R14 measured

[Evidence](evidence/research/r14/README.md). Code and data check `98dd02f`; `courtlens-lineup-model-v1` (`07c4aed`, `32140ebb…`) and `courtlens-lineup-backtest-v1` (`5b9ca79`, `d1512c10…`) each committed on its own before any fit; selection committed (`be58992`) before the one test read (`148cfd6`); backtest read once (`c0934b3`). All fits on the local CPU (torch 2.15.0+cpu, new optional `research-ml` extra), each run under `systemd-run` at 4 GiB and 2 CPUs.

- **Data.** R01 stints 2014-15 to 2025-26: 14,296 games, 719,529 stints, 377,225 usable (98.2–98.5% of possessions). Rolling three-season windows. Cold start at 1,000 window possessions: 395–399 own-vector players per test season cover 84–88% of possessions; box fallback 3.9–5.2%, newcomers 8.6–10.9%.
- **Selection** (2021-22, 2022-23 only): ridge penalty 10,000; lineup model 8 dimensions with the strongest interaction penalty (0.01), level with ridge.
- **Test.** Ridge 94.0810, lineup 94.0810, home court only 94.2697 per 100 (pooled WRMSE). Ridge minus lineup −0.000011 (−0.000014 to −0.000008), ridge lower in 3 of 3: **ridge better** under the registered rule, with no practical difference. Interaction SD 0.003–0.007 per 100 against 8.8–10.9 for the additive part.
- **Game backtest** (3,655 games, 35 without stints left out): lineup model RMSE 14.70; better than team net (+0.68), plus-minus and on/off; no ranking against RAPM 1Y, RAPM 3Y, box-prior and Projected Impact; worse than monthly time decay (−0.44) and the opener snapshot (−0.14). Monthly time decay is still the only metric ranked above every other.
- **Map.** UMAP of the 546 own-player vectors; seeds agree on 1.9% of nearest neighbours against 1.8% by chance, so the map shows no stable structure. The page says so above the map.
- **Disclosure.** The pinned runner overwrote the results' per-model score block with the weight-hash map; `lineup_model_scores.py` restores it from the saved weights and wrote it only because every frozen gain was reproduced exactly.
- **Checks.** Page against API: 1,468 values at 1440 and 1,468 at 390, 0 mismatches, 0 console errors, 0 overflow. Source check outside the pipeline: counts from R01's game files, ridge by a separate solver, the lineup model by a rewritten PyTorch pass, the gain interval by loop, the backtest RMSE and the tool all equal. `reproduce` gives the same selection, test, serving and backtest hashes; a fresh build gives the same dataset hashes. Ruff, format, strict mypy, lint and typecheck clean. Vitest 735. Python 2,652 passed with the 8 known Anthropic SDK failures. Full Playwright 565 passed, 17 skipped, 0 failed.

## 2026-11-06 — R10 data part measured

[Evidence](evidence/research/r10/README.md). Content from the owner's saved Databallr pages (Wingspan, ORTG Lab, Shot Aftermath). Code and data check `d4afbf4`; `courtlens-wingspan-ddpm-v1` and `courtlens-four-factors-inputs-v1` registered together (`e7e4fac`) before anything was summarized; one read each (`c438861`, `d9f9550`). v1 four-factors counted no threes before 2024-25 (the archives lack `shotValue`); v2 code `3d9d3dc`, registration `57bd6a6`, read `ee3b6bc`. Each `reproduce` twice, same hashes.

- **Wingspan.** 1,804 combine players with an NBA ID, 1,751 measured, 822 with a 500-minute season and a DARKO rating; every exclusion named. Career D-DPM (minutes-weighted season-end D-DPM) against wingspan − height r +0.213 (+0.152 to +0.272), wingspan +0.467, height +0.419, wingspan with height held fixed +0.235 (+0.173 to +0.294). Within position the primary r is positive for SG, SF, PF and C and not distinguishable from zero for PG. Height · wingspan +0.834 (Databallr shows R = 0.83). Positional averages with counts and intervals; nearest builds on standardized height and wingspan. Descriptive association, not a prediction or a cause (DARKO's boards are retrospective).
- **Calculator.** The existing page is a hypothetical model; the paper's Eq. (11) needed observed inputs. From play-by-play 2014-15 to 2025-26: league and team eFG%, FTr, FG%, FT%, TOV%, ORB%, μ (0.4366 in 2014-15 to 0.4284 in 2025-26; 0.4287 in 2024-25 against the paper's 0.425), rebound rates by miss kind, ORTG (Eq. 11 = Eq. 3 exactly) and marginals. Paper and formula read from the arXiv PDF.
- **Shot Aftermath.** Not restyle-only: Databallr's league/team/position view by zone needs a play-by-play aggregate CourtLens doesn't serve (the current page is per player and its tables hold two test games in the published database). Not built; owner's decision.
- **Checks.** Page against API at 1440 and 390: every value in every new table equal, 0 console errors, 0 overflow. Independent recomputation of r and positional averages equal to 4.8e-7; 5 D-DPM values traced to raw DARKO responses; 19 of 19 measured players in Databallr's saved table match exactly, 8 others not measured at a combine (Databallr uses other sources). Ruff, format, strict mypy, lint, typecheck clean; Vitest 735; Python 2,665 passed with the 8 known Anthropic SDK failures; R10 Playwright 15/15 over three repeats; full Playwright 570 passed, 17 skipped, 0 failed.
- **Not done.** The design phase (Databallr layout, with-shoes and units toggles, CSV, overlay graphic, the interactive ORTG Lab) and the owner's ✅.

## 2026-11-06 — Design 18: Six-Factor RAPM redesigned (design phase, page 1)

[Evidence](evidence/research/design-18/README.md). From the owner's saved Databallr `six-factor-rapm` and `shotquality`
pages and seven screenshots. Design only: no Python, API, fit, interval or unknown state changed.

- **Layout.** Databallr's explainer order: centred header and links, The Framework (3 × 2 grid selects the factor),
  How It Works, The Six Factors (tabs over a panel), Two Ways to Slice the Grid (R02's scatter kept below, owner's
  choice), Player Archetypes, then the ratings table on Databallr's ShotQuality pattern (search, Min MIN, team, CSV,
  Combined / Offense / Defense, bars, intervals kept), How to Read the Numbers, Column Glossary, the Impact Tree and a
  collapsed Caveats & Methodology.
- **Gaps.** One-season fits, not Databallr's six-year time-decay pool; CourtLens's measured R² instead of 0.985;
  per-player notes replaced by CourtLens factor copy and data lines (owner's choice); minutes instead of possessions;
  "residual < 0.6" not served.
- **Pattern.** Shared `components/research/` (sections, cards, tab panel, ranked lists, glossary, disclosure and the
  `ResearchTable`) and `lib/research-values.ts`; recorded in the alignment plan's Patterns. Green/red only where an
  80% interval excludes zero.
- **Checks.** Page against the API on real data: 87,138 values over three scopes at 1440 and 390, 0 mismatches, 0
  console errors, 0 overflow, 0 broken images. Lint, typecheck clean; Vitest 742. Page spec 33/33 over three repeats.
  Full Playwright: 571 passed, 17 skipped, 0 failed after regenerating the RAPM tab's two stale `pc12-b-rapm` baselines (the shared header changed by design).
- **Not done.** The owner's review and ✅.

## 2026-11-06 — D14 recorded; R11 built

[Evidence](evidence/research/r11/README.md). D14 (owner): finish every unblocked block before the page redesigns, so R11 → R12 → design phase. Content from the owner's saved Databallr `Learning` and `patch-notes` pages. Build block: shared Research components, no page CSS, no Python or API change.

- **Learning** (`/methodology/learning`). 22 topics across 5 tiers after Databallr's four, plus CourtLens's own Testing Models tier. Each topic links its CourtLens page; 14 quote the Research result that tests the idea (R02–R10, R14, R15a). The 39 quoted numbers live in `lib/research-facts.ts` with their frozen file and field, and a Vitest test fails if one drifts. The league-trend topic reads `/api/four-factors`, so it covers 2014-15 to 2025-26, not Databallr's 2001–2026. No illustrative numbers.
- **Glossary.** `/stats/glossary` is generated from the metric catalog. Metrics without written copy (the seven Basketball-Reference ones) now read their catalog formula, unit and direction instead of their name.
- **Patch Notes** (`/whats-new`, now titled Patch Notes). Releases are real merges (PRs #17, #24, #25, #42, presentation-clarity) or the unmerged research branch; CourtLens has no version numbers. `dashboard/scripts/check-patch-notes.mjs` checks all 83 commit, date and log references against git. Visible copy holds no hash or ISO date.
- **Menu.** Learning under Methods, Patch Notes under Tools; What's New left the ⋯ menu. The Blog stays removed (redirects only).
- **Checks.** Lint, typecheck clean; Vitest 785. R11 spec 15/15 over three repeats. Full Playwright 576 passed, 17 skipped, 0 failed, after regenerating the two What's New baselines (page changed by design). Real data at 1440 and 390: 0 mismatches, 0 console errors, 0 overflow, 0 broken images.
- **Not done.** The owner's ✅ and the Databallr styling (design phase).

## 2026-11-06 — R12 built

[Evidence](evidence/research/r12/README.md). Build block: shared Research components; no Python or API change; nothing deployed.

- **Landing** (`/research`). One card each for R15, R08, R07, R05 and R16: one number, one sentence, test seasons, page and evidence. Numbers are the R11 facts (checked against the frozen results); the real-data check rebuilt each one from the APIs (0 mismatches). R16 shows "Evaluation in progress" and no number; its holdout and runner were not touched.
- **Menu.** Matches D8 and the cuts; the only gap, a landing entry, is now "Research Overview". The calculator keeps its "Hypothetical Calculator" label until the design phase's ORTG Lab.
- **README.** Results section with the R15, R08, R07 and R05 numbers and evidence links, R16 pending. A Vitest test ties each number to its checked fact.
- **Demo.** Steps prepared. Found: several Research pages read served directories that the deploy script doesn't sync or mount (draft value tables, lineup model weights, backtest 2026-27 score, dated ratings), and the demo still pins the 3-season impact bundle; the 12-season one is 170 MB against a 1.5 GiB API cap. Left for the owner.
- **Checks.** Lint, typecheck clean; Vitest 804. Page specs 60/60 over three repeats. Full Playwright 579 passed, 17 skipped, 0 failed. Real data at 1440 and 390: 0 mismatches, 0 console errors, 0 overflow, 0 broken images.


## 2026-11-06 — Research menu without gaps (owner request)

[Screenshot](evidence/research/menu/research-menu-columns-1440.png). The two-column dropdown placed groups in shared rows, so a short group left a gap beside a long one. Each column now stacks its groups; `balanceColumns` in `lib/nav-model.ts` picks the most even split while keeping menu order inside each column. Measured on `localhost:3100` at 1440: no gaps between groups; columns end 36 px apart; the panel is 750 px tall instead of 871. Lint clean; Vitest 805; full Playwright 579 passed, 17 skipped, 0 failed.

## 2026-11-06 — RD00: Six-Factor RAPM in a centred column, open layout (design round 2)

[Evidence](evidence/research/design-RD00/README.md). The owner's two instructions: a centred column like Databallr's
instead of full width, and no boxes around everything; both for the Research pages generally. Design only.

- **Column.** Shared `.rs-column` (992 px, centred) holds the filter bar and sections; the pattern records it so each
  Research page adopts it in its own turn.
- **Open layout.** Shared cards, glossary, method blocks, steps, factor panel, feature lists, callouts and table
  toolbar lose their fills and frames (top rules, hairlines, a left accent rule). The ratings table, framework grid and
  tree nodes stay framed. Learning, Patch Notes and the landing share the open cards; still full width.
- **Table.** Column widths by content (128 / 96 / 64 px, 184 px player, 24 px bars) so every view fits the column
  unscrolled; long names wrap inside the pinned column (they ran under the values at 390).
- **Checks.** Real data through a read-only proxy to the owner's API: 87,138 values over three scopes at 1440 and
  390, 0 mismatches, 0 console errors, 0 overflow, 0 broken images, table unscrolled at 1440 in all views. Lint 0/0,
  typecheck clean, Vitest 805. Page spec 33/33 over three repeats plus two new tests 6/6. Full Playwright 577 passed,
  17 skipped, 4 failed (Six-Factor and Patch Notes baselines, changed by design, viewed and regenerated; visual spec
  84/84): net 581 passed, 0 failed.
- **Not done.** The owner's review and ✅.

## 2026-11-06 — RD00 round 3: the RAPM Ratings tab in the Research pattern

[Evidence](evidence/research/design-RD00/README.md#round-3--the-rapm-ratings-tab-owner-2026-11-06). Owner: the RAPM
Ratings tab was still full width with the old table and boxes. Design only; the tab's queue row (RD15) is folded
into RD00.

- **Tab.** Centred column; the leaders chart open but still the PC12 first-load headline; four open facts; the
  shared `ResearchTable` (search, minimum, CSV, sort, Impact Tree links), uncoloured because no interval is served;
  the B26 experiment block opened up. `ResearchTable.team` is now optional; `ResearchCards` gains 4 across.
- **Checks.** Real data 990 values over three scopes at 1440 and 390, 0 mismatches; Six-Factor rerun 87,138, 0
  mismatches. Lint, typecheck, Vitest 805; page and PC12 specs 60/60 over three repeats; full Playwright 582 passed, 17 skipped, 0 failed (one earlier Projected Impact streaming flake, untouched page, passed on rerun).
- **Incident.** A CSS import added before its file existed broke the owner's :3100 compile for a few minutes;
  cleared by toggling the import (known Turbopack cache).
- **Not done.** The owner's review and ✅.

## 2026-11-06 — RD00 round 4: Databallr shading and larger team-coloured photos

[Evidence](evidence/research/design-RD00/README.md#round-4--shading-and-photos-owner-2026-11-06). Owner: shade the
page like Databallr instead of thin lines; much larger photos in the Six Factors; larger, team-coloured, unclipped
photos in Leaders and All Ratings. Design only.

- **Shading.** Shared `--rs-panel` / `--rs-well` light panels and wells, tinted identity cards, accent-ringed factor
  panel; applied to cards, glossary, method blocks, toolbar, framework grid, tree nodes and experiment tiles.
- **Photos.** 64 px in the Six Factors estimates, 44 px in Leaders, 40 px in both tables, all in team colour. The
  RAPM Ratings tab reads teams from the season's six-factor fit (same served GET) for colour and logos.
- **Checks.** Real data: ratings 1,170 values (teams and photo sizes included) and Six-Factor 87,138, 0 mismatches.
  Lint 0/0, typecheck, Vitest 805; specs 60/60 over three repeats; full Playwright 582 passed, 0 failed; four
  baselines regenerated after viewing.
- **Not done.** The owner's review and ✅.

## 2026-11-06 — RD00 round 5: less caption text

[Evidence](evidence/research/design-RD00/README.md#round-5--caption-text-owner-2026-11-06). Owner: remove caption text
that is non-essential or takes away from the point (archetype "Rule:" lines as the example). Design only.

- **Cut or shortened.** Archetype rule and interval lines, the archetype intro, How It Works counts, the framework's
  Databallr aside, the Six Factors overlap note, the scatter note, the table and tree footnotes, the tree's scope aside,
  the ratings chart note, fact filler lines and the ratings footnote.
- **Moved, not lost.** Rules to a new "How the Archetypes Are Picked" methodology block; coverage and player counts to
  the Stints step.
- **Kept.** Confounding, unknown, overlap and no-interval statements, units, examples, caveats, sources and credits.
- **Checks.** Real data Six-Factor 87,162 and ratings 1,170 values, 0 mismatches. Lint 0/0, typecheck, Vitest 805;
  page spec 14/14; full Playwright 582 passed, 0 failed; three baselines regenerated after viewing.
- **Not done.** The owner's review and ✅.

## 2026-11-06 — RD00 round 6: the Impact Tree player can be removed

[Evidence](evidence/research/design-RD00/README.md#round-6--clearable-impact-tree-owner-2026-11-06). Owner: the X on
the Impact Tree's player doesn't work; does there always need to be a player? Design only.

- **Cause.** Clearing deleted `player` from the URL, which means "default to the top RAPM player", so he came back.
- **Change.** First load still shows the top RAPM player. Clearing stores `player=none`; the section keeps its picker
  and shows "No player selected" with a "Show {leader}" button. Survives reload and shared links.
- **Checks.** Lint 0/0, typecheck, Vitest 805; page spec 15/15 ×3; full Playwright 583 passed, 0 failed; live check on
  :3100 at 1440 and 390 (clear, reload, restore, search), 0 errors, 0 overflow.
- **Not done.** The owner's review and ✅.

## 2026-11-06 — RD00 round 7: the table no longer paints over the filter bar

[Evidence](evidence/research/design-RD00/README.md#round-7--table-over-the-filter-bar-owner-2026-11-06). Owner: the
table overlaps the top drop-downs. Design only.

- **Cause.** The sticky filter bar and the table's pinned column shared `--z-sticky`; the later table won the tie.
- **Change.** `.rt-scroll` is its own stacking context (`isolation: isolate`), so pinned cells stack only inside it.
- **Checks.** Live :3100, both tabs at 1440/1053/390: 15–18 overlapping points before, 0 after; negative control 30
  vs 0. Lint 0/0, typecheck, Vitest 805; page spec 21/21 ×3; full Playwright 586 passed, 3 new tests failed on a short
  fixture page and were fixed (spec rerun 63/63).
- **Not done.** The owner's review and ✅.

## 2026-11-07 — RD00 approved

The owner approved Six-Factor RAPM (RD00, both tabs) after seven rounds and asked for the next page. The catalog
row is ✅. The alignment plan's "Research pages" pattern now records what RD00 settled (shading, photo sizes,
caption economy, clearable pickers, sticky layers) in place of round 2's open-block rule. Next in the queue: RD01
Combine & Wingspan.


## 2026-11-07 — RD01 round 1: Combine & Wingspan as one Databallr-style page

[Evidence](evidence/research/design-RD01/README.md). Owner, from the saved Databallr Wingspan Database and the gap list:
fold everything into one Databallr-style page with R10's correlations below; judgement on with-shoes and on combine
skippers; match Databallr, colour included. Design only.

- **Change.** `components/wingspan-research.tsx` replaces `combine-view.tsx` and `wingspan-ddpm.tsx`: hero, a shaded
  filter panel (status, position, shoes, units, class), `ResearchTable` beside Positional Averages and a new overlay
  drawing, one position-coloured scatter with its r, Similar Profiles (clearable), class drills, Wingspan and Defense,
  collapsed Caveats & Methodology. Column 1352 px (Databallr's for this page). With Shoes is the measured shoe height
  ("—" where not measured); skippers stay unknown; Diff and D-DPM take gold/blue sign tones. `ResearchTable` gains
  optional per-column format, sub-line, identity tone and width, and per-row logo seasons.
- **Checks.** Lint 0/0, typecheck, Vitest 808; page specs 42/42 ×3; full Playwright 589 passed, 17 skipped, 2 failed
  (the `pc11-combine` baselines, changed by design; regenerated, viewed, then passed); real data 76,686 values at 1440
  and 390 in three scenes: 0 mismatches, 0 console errors, 0 overflow, 0 broken images.
- **Not done.** The owner's review and ✅.
