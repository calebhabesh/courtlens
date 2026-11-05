# CourtLens Research progress log

Evidence log for the [Research handoff](research-plan.md). Record measured results, commands,
coverage and screenshots per block. Plan text is not evidence.

## Block status

| Block | Status | Evidence |
| --- | --- | --- |
| R01 Impact history backfill, time decay, intervals, rating snapshots | ✅ measured (page work is R02) | [R01 evidence](evidence/research/r01/README.md): twelve regular seasons sealed and served (97.5–99.9% of games admitted); 200-replicate intervals; time decay; six-factor R² 0.955–0.966; 91 dated snapshots |
| R02 Six-Factor RAPM + Impact Tree | ⬜ pending | |
| R03 Signal vs Noise | ⬜ pending | |
| R04 zTS + validation | ⬜ pending | |
| R05 Shot Quality v2 model | ⬜ pending | |
| R06 ShotQuality decomposition + Defensive Shot Quality | ⬜ pending | |
| R07 Projected Impact | 🟡 frozen and scoring; prospective score unverified; page awaits owner | [R07 evidence](evidence/research/r07/README.md): frozen 2026-11-05 04:53:33 UTC, `6eaef389…`; beats carry-forward on 2024-25 and 2025-26 for players (+4.38, 3.25 to 5.50) and game margins (+13.42, 9.55 to 17.14) and time-decay RAPM more narrowly; intervals over-cover (84.3%), F1 failed and owner waived it; ridge beat the selected LightGBM on test |
| R08 Metric Backtest | ⬜ pending | |
| R09 Draft Classes | ⬜ pending | |
| R10 Wingspan, ORtg Calculator, Shot Aftermath restyle | ⬜ pending | |
| R11 Learning, Glossary, Patch Notes | ⬜ pending | |
| R12 Research landing, menu, README | 🟡 menu done; landing, README and demo pending | [Menu entry](#2026-11-05--research-menu-trimmed-dropped-pages-removed-owner-request-part-of-r12) |
| R14 Lineup model with learned embeddings | ⬜ pending | |
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
