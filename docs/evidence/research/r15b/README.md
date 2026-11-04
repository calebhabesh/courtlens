# R15b — win probability: production, scorecard, pages

Measured 2026-11-04 on branch `research`. Parent: [Research progress](../../../research-progress.md), [Research handoff](../../../research-plan.md). R15a: [evidence](../r15a/README.md).

## Status

| Part | State |
| --- | --- |
| Frozen version | **Live.** Frozen 2026-11-04 22:08:55 UTC, manifest `b2b0db82311fd6c5…` |
| Tonight's 14 games | Inputs sealed 22:09 UTC, before the 00:00 UTC first tip. **First prospective games.** |
| Nightly scoring and drift flag on real 2026-27 games | **Verified on 107 pre-freeze games**, labelled hindsight replay |
| Prospective scoring | **Unverified.** No prospective game had finished at handoff; the 13:30 UTC timer on 2026-11-05 is the first run |
| Tip-off availability against hindsight | **Unverified.** First measured when those games have published boxes |
| arm64 predictions and arm64 latency | **Unverified.** This machine cannot run arm64 images; command below |
| Hosted demo, sync timer | Built, **not deployed or enabled** |
| Pages | Built; only the owner marks them ✅ |

## Pre-freeze checks

### 1. Live and training inputs: pass

[`parity.json`](parity.json). Every test-season game (2,439 games, 533,770 states) was built from the training archive and from ESPN's plays, through Live's parser and a new adapter (`domain/win_probability_live.py`) into the unchanged training replay. Limits were written into the module before the first full run.

| Measure | Result | Limit |
| --- | --- | --- |
| Log loss, archive | 0.40278 | |
| Log loss, ESPN state at the same times | 0.40331, change +0.0005 (+0.0004 to +0.0007) | 0.002 |
| Log loss, ESPN's own state sample (what Live scores) | 0.40294, change +0.0002 (+0.0001 to +0.0002) | 0.002 |
| Calibration error, archive / same times / own sample | 0.0083 / 0.0083 / 0.0083 | 0.02 |
| Mean absolute probability gap | 0.0017 (median 0, p95 0.0003, p99 0.057) | 0.01 |

The serving code reproduces the saved test predictions to 3e-8. Exact agreement by feature: margin 99.0%, possession 98.2%, free throws pending 99.96%, timeouts 99.6–99.7%, team fouls 96.8–96.9% (98.0–98.2% within one), bonus 99.0%, possession age 94.7% (99.2% within 5 s).

The largest single-state gap, 0.81, comes from a tied final second where the two feeds place the same basket a tenth apart. It is not an adapter fault. The replay's habits had to be copied: an offensive foul is not a team foul, and a technical writes `(P0.T0)`, which resets team fouls and flips possession in the training features. Three ESPN replays end on a different final score from the box.

### 2. Pregame inputs at tip-off: stated on the model card

[`pregame-inputs.json`](pregame-inputs.json). The live code with the training rules rebuilds the saved inputs exactly (largest input difference 0.0, mu0 4e-15, probabilities 3e-8).

| Input | Known before tip-off in 2026-27 |
| --- | --- |
| Team form, rest, back-to-backs, games in 7 days, travel, altitude | Yes, from hoopR boxes on earlier dates. A capture at 13:30 UTC holds the previous night; the capture at handoff held boxes through 2026-11-02 (no games on 11-03) |
| Expected minutes | Yes, the same rule |
| Ratings | Yes, the monthly rule (check 3) |
| **Availability** | **No.** Training read DND and NWT from the game's own box, published after the game. Live uses the newest ESPN roster minus players ESPN's injury report lists as Out, sealed at capture. Late scratches are unknown |

**The test numbers assume a known inactive list.** The size of that assumption is bounded on the test seasons: no injury news at all costs +0.0034 log loss (+0.0016 to +0.0052), calibration error 0.0078. Live has the Out list, so it falls between that and zero, but where is unknown: ESPN's summaries list injuries as of when they were fetched (a 2024-25 game shows 2025 rookies), so there is no historical injury report to backtest. From tonight, `scorecard/availability.jsonl` records tip-off mu0 against the hindsight box rule per prospective game.

### 3. Pinned inputs: one change from the plan's wording

**Pinning a single rating snapshot for the season was measured and rejected:** it costs +0.0039 log loss (+0.0018 to +0.0058), material under the limit, and more than the whole test gain from adding player inputs (S2 over S1, +0.0033). The frozen model keeps the training rule instead: time-decay RAPM, newest snapshot on or before the game date, refitted at the opener and each month's 1st. Player ratings update; the model files do not.

- `evaluation/win_probability_ratings.py` builds them from the provisional `season-impact` bundle, only once it holds every date before the cutoff, so a monthly refit can wait up to a week for the Monday impact run. Built: 2026-10-20 (`b3de6e4a…`), 2026-11-01 (`794bbf97…`).
- Pins: the manifest holds the hash of `impact_history_ratings.py` and of both replay modules, and names time-decay RAPM. `test_committed_manifest_is_intact_and_pins_what_the_model_reads` fails if any changes. Moving to Projected Impact needs a new version.
- Each capture records the snapshot cutoff it used. **Owner's call:** this keeps your "no refit" decision for the model but does refit player ratings monthly. If you read that decision more strictly, say so; pinning is cheap to switch to before many prospective games accumulate, at the cost above.

### 4. Platform

- **libgomp is needed:** `python:3.12-slim` has none and LightGBM links it. Added `libgomp1` to the Dockerfile.
- **x86 image:** real `Dockerfile` build, Python 3.12, 1,902 committed reference states: largest difference 0.0 against the 3.14 reference. [`platform-x86.json`](platform-x86.json).
- **arm64: unverified.** No QEMU here, and registering it changes a host kernel setting, so I did not. Tolerance is 1e-6; the check exits non-zero on failure.
- **Model files:** rsynced with the other serving files (`SERVING_DIRS`, read-only volume). CI images are built on GitHub, where git-ignored files do not exist, and 8.4 MB of serving data does not belong in a public repo's history. The API checks every hash at load and shows ESPN alone if they are missing.

### 5. Drift interval: computed

`test-report.json` holds only a point calibration error, and that error rises sharply as samples shrink (median 0.075 at 25 games against 0.008 on all 2,439). So the flag compares against a game bootstrap of the saved test predictions at the same window size (4,000 resamples, no refit, `run_test` untouched), stored in the manifest. 95% interval: 25 games 0.039–0.150; 100 games 0.021–0.074; 200 games 0.015–0.055; 300 games 0.013–0.044. Real 30-day test-season windows of 150 games or more ranged 0.011–0.060. Windows under 25 games read "insufficient".

### 6. Known field error

The card takes RMSE from `pairs.json` and `benchmarks.json`, never `pregame.*.rmse`.

## Frozen model

`evaluation/research/frozen/courtlens-win-probability-v2.json`; artifacts registered in `workbench_artifacts`.

| Role | SHA-256 | Registry id |
| --- | --- | --- |
| mean | `2b5c29aa57ac1405121087b6db006b8c9cd5c376475dce88cb724ae2f723a744` | `e0ff446f-50df-47ad-85f8-2151db8fcb7e` |
| variance | `c6a7d9908db9f55b25730ec8c65dd01fe725403de6a4935c15f386d620b23fd2` | `e14dbc9a-89e0-48ac-92c1-b758f3c77b73` |
| end_game | `26bbd8a955d42ac8dc937f2fe0d5b72dc9de3db65badfcd7a646314a3c1719dd` | `6144b88b-7cfd-4a79-84b4-4c29ba56f52c` |

The freeze tool refuses a second run. No new model, fit or registration.

**Live lineup tracker: skipped.** S4 was rejected on selection and no better on test (-0.0009, -0.0021 to +0.0004), and the frozen model does not read lineups. The plan's "freeze S3 first" fallback no longer applies because S3 was rejected too.

## Serving

[`latency.json`](latency.json). One thread, x86, 200 test games through Live's path, 482 events per game on average: **p50 15 ms, p95 23 ms, max 33 ms**. Model load 0.24 s; process peak 347 MiB with the evaluation imports, against the demo API's 1,536 MiB cap. On the owner's running API a real final game took 0.19 s cold and 0.008 s cached. The VPS is arm64 and has not been timed.

## Nightly job

`courtlens refresh-win-probability`, the last step of `refresh-daily`: scores finished games from the last 7 days, builds due rating snapshots, seals today's inputs, records availability checks, rewrites summaries. ESPN at 5 s pacing, raw payloads kept hashed. Regular season only. `capture-win-probability-inputs` seals another capture nearer tip-off; scoring uses the newest sealed before tip.

A game is prospective only if it tipped after the freeze **and** its inputs were sealed before tip-off. A later game that was missed stays off the prospective count.

Run on 107 real games, 2026-10-20 to 2026-11-02 (14 days; 107 of 107 scored, ESPN compared on all; matched states 97.4%). [`scorecard-summary.json`](scorecard-summary.json).

| Same states | CourtLens | ESPN |
| --- | --- | --- |
| Log loss | 0.4269 | 0.4202 |
| Brier | 0.1450 | 0.1405 |
| Calibration error | 0.0452 | 0.0496 |

Gap -0.0068 (-0.0338 to +0.0187), no clear difference. **These are not prospective:** the games came before the freeze and availability reads the finished box. Drift flag: 0.0434 on 107 games, interval 0.0206–0.0723, **within**. The "above" state has been exercised only by unit tests; no real window has breached.

## Pages

- **Live:** CourtLens beside ESPN with a Both / CourtLens / ESPN toggle, biggest swings numbered on the win-probability and game-flow charts and listed, model version and hash on every game. No sealed inputs: ESPN alone, with the reason. Pre-freeze games say they use hindsight.
- **Research → Win Probability** (`/research/win-probability`, new Models menu group): scorecard, drift, calibration, final test by phase, what did not work, WPA, model card.
- **WPA:** each play's swing to its first listed player, labelled credit assignment, not causal value. 2024-25 and 2025-26 (out-of-sample, from archived ESPN plays) and 2026-27 so far. NBA ids matched for all but one player per season. Clutch: last 5 minutes of Q4 or overtime, margin 5 or less.

Screenshots: [`research-1440.png`](research-1440.png), [`research-390.png`](research-390.png), [`live-panel-1440.png`](live-panel-1440.png), [`live-panel-390.png`](live-panel-390.png), from the sandbox with real fixtures; portraits are absent there because the mock API serves none.

## Limitations

- Availability as above; the first real measure arrives with prospective boxes.
- 2026-27 snapshots read provisional play-by-play that can be corrected later.
- The ESPN comparison reads ESPN's probabilities the morning after each game, which may differ from what was shown live.
- One capture a day by default: injury news after 13:30 UTC is missed. Tonight's capture was at 22:09 UTC, so tonight's games had fresher news than a normal night.

## Verification

`make lint`, `make typecheck` (321 source files) clean. `make test` Python: 2,440 passed, 1 skipped, 8 failed, all the known Anthropic provider tests (`tests/unit/test_agent_providers.py`, the installed SDK's `httpx2` client check). Vitest: 699 passed. Playwright, full suite in a sandbox: 519 passed, 17 skipped, none failed.

## Commands

```bash
# Backfills, already run; none is prospective.
.venv/bin/python -m courtlens.evaluation.win_probability_parity --out docs/evidence/research/r15b/parity.json
.venv/bin/python -m courtlens.evaluation.win_probability_inputs_check --out docs/evidence/research/r15b/pregame-inputs.json
.venv/bin/python -m courtlens.evaluation.win_probability_backfill replay --until 2026-11-04
.venv/bin/python -m courtlens.evaluation.win_probability_backfill wpa
# Nightly, in refresh-daily; by hand:
courtlens refresh-win-probability
```
