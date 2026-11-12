# W1 evidence: market-informed Win Probability (`courtlens-win-probability-v4`), do-no-harm check

Measured 2026-11-11 on branch `feat/win-probability-v4`. Registration:
[`courtlens-win-probability-v4`](../../../evaluation/research/registrations/courtlens-win-probability-v4.json)
(content hash `654b26bab5ee1499…`), committed (d868ebca) and pushed before any fit. The reference
is the frozen served model `courtlens-win-probability-v2` (the page's Original model), frozen
2026-11-04. It was not changed. Nothing was frozen or served; stage F is W3.

## Result

**All three stage C gates pass, so the work continues under the registration (W2 next).**

- **D1** (stop if the log-loss gain over the Original is entirely below zero): +0.0090, 95% interval +0.0056 to +0.0126. Passes.
- **D2** (stop if mu4's squared-error gain over the own forecast is entirely below zero): +12.39 points², 95% interval +9.28 to +15.41. Passes.
- **A2** (calibration error 0.02 or less): 0.0086. Passes.

These seasons are spent (a third read), so this stage could stop v4 but cannot promote it. The
only fresh test is the 2026-27 head-to-head after the freeze.

| Model (2024-25 and 2025-26 pooled, 2,439 games) | Log loss | Brier | Calibration error |
| --- | --- | --- | --- |
| Original (frozen v2, its saved probabilities) | 0.4028 | 0.1341 | 0.0083 |
| v4, K1 with w = 0.906 | 0.3938 | 0.1306 | 0.0086 |

| v4 against the Original | Games | Log-loss gain, 95% interval | Brier gain, 95% interval |
| --- | --- | --- | --- |
| Pooled | 2,439 | +0.0090 (+0.0056 to +0.0126) | +0.0035 (+0.0021 to +0.0049) |
| 2024-25 | 1,212 | +0.0072 (+0.0026 to +0.0118) | +0.0029 (+0.0011 to +0.0046) |
| 2025-26 | 1,227 | +0.0107 (+0.0058 to +0.0157) | +0.0040 (+0.0020 to +0.0061) |

By phase, pooled:

| Phase | Games | Log-loss gain, 95% interval | v4 calibration error |
| --- | --- | --- | --- |
| First half | 2,439 | +0.0153 (+0.0103 to +0.0207) | 0.0149 |
| Third quarter | 2,439 | +0.0065 (+0.0028 to +0.0102) | 0.0119 |
| Fourth quarter, before last two minutes | 2,439 | +0.0024 (−0.0001 to +0.0051) | 0.0096 |
| Last two minutes | 2,439 | +0.0002 (−0.0010 to +0.0014) | 0.0069 |
| Overtime | 114 | −0.0045 (−0.0147 to +0.0056) | 0.0472 |

Pregame forecast on the same games (every game had a line):

| Forecast | 2024-25 RMSE | 2025-26 RMSE | Pooled RMSE | Pooled winners called |
| --- | --- | --- | --- | --- |
| Own forecast (Original) | 13.887 | 14.430 | 14.163 | 68.4% |
| mu4 | 13.526 | 13.906 | 13.719 | 69.5% |
| Closing line | 13.520 | 13.892 | 13.708 | 69.5% |

mu4 against the own forecast, squared error per game: pooled +12.39 (+9.28 to +15.41); 2024-25
+9.90 (+5.71 to +14.22); 2025-26 +14.85 (+10.54 to +19.44). Winner accuracy uses R15a's rule
(a forecast of exactly 0 picks the away team), so the 68.4% and 69.5% match R15a's numbers.

**Reading.**
- The gain is the line's: w is 0.906, so mu4 is almost the line (13.719 against 13.708 RMSE), and the Original's frozen boosters turn that better start into better in-game probabilities.
- The gain is largest early (first half +0.015) and fades as the score takes over; it is not distinguishable from zero in the last two minutes or in overtime (114 games, the one phase that leans negative, with wide intervals).
- Calibration stays where the Original's was (0.0086 against 0.0083).

## The weight w

`w = sum((line − own)(margin − own)) / sum((line − own)²)`, clipped to 0..1, on games with a line.
The unconstrained regression of the final margin on an intercept, the own forecast and the line is
reported beside it as a check and not used.

| Fit | Seasons | Games | w (unclipped) | Regression check: intercept, own, line (RMSE) |
| --- | --- | --- | --- | --- |
| Stage S | 2022-23 | 1,228 | 0.720 (0.720) | +0.40, 0.194, 0.740 (12.46) |
| Stage C | 2022-23, 2023-24 | 2,444 | 0.906 (0.906) | +0.11, 0.102, 0.905 (13.01) |

Neither fit was clipped. The regression puts nearly the same weight on the line as w does, and the
own forecast's coefficient is small in both, so w's restriction (own and line weights summing to
one, no intercept) costs little. The weight moved from 0.72 to 0.91 when 2023-24 was added; stage
F will refit it on four seasons.

## Selection (stage S, 2023-24 only; 90% intervals)

| Candidate | What | 2023-24 log loss | Against the Original on 2023-24 |
| --- | --- | --- | --- |
| Original (frozen v2) | Its saved probabilities | 0.4036 | |
| K1 | The Original's boosters, baseline and end-game specialist reading mu4 | 0.3971 | +0.0065 (+0.0035 to +0.0096) |
| K2 | v2's recipe refitted with mu4 (train 2014-15 to 2022-23, early stopping on 2023-24: 164 mean, 125 variance, 223 specialist rounds) | 0.3969 | +0.0067 (+0.0035 to +0.0099) |

**K2 against K1: +0.0002 (−0.0006 to +0.0009). The interval includes zero, so K1, the simpler
model, is kept.** K2 was not refitted for stage C.

Check on K1's machinery: run with the own forecast in place of mu4, it reproduces the Original's
saved 2023-24 probabilities to 5.6e-8 (they are stored as float32). On 2023-24 the pregame RMSE was
13.887 for the own forecast, 13.555 for mu4 and 13.513 for the line.

[`selection-log.json`](selection-log.json) was committed and pushed (0a1ec88d) before stage C.
Stage C runs only when that log exists, its evidence copy is byte-identical to the stage S output,
and the copy is committed. It refuses a second run: it writes its claim before reading any test
season.

## Inputs and checks

- **Pre-fit checks** ([`prefit-checks.json`](prefit-checks.json)), before any fit: v2's stored own forecast equals `mu_from_entry` with the freeze manifest's coefficients and its 120-day form (max difference 3.6e-15 over 13,088 rated games; 2014-15 has no rating snapshot). On 2024-25 and 2025-26 it recomputes RMSE 14.163 for the own forecast and 13.708 for the line, and the Original's log loss 0.4028 on the stage C states. All match the plan.
- **v2's files.** The game table, state files, pregame table, model files and saved test probabilities under `data/derived/win-probability-v1` were read, not rebuilt (their content hashes are checked on load). K1's model digests, baseline, overtime slope and feature lists were checked against the freeze manifest (`manifest_sha256` b2b0db82…).
- **Lines to games.** The closing-line parquet (sha256 b58911bf…, pinned in `win_probability_report.py`) is keyed by ESPN event id. For 2024-25 and 2025-26 the join uses v2's ESPN extracts, as R15a did. v2 had no ESPN ids for earlier seasons, so W1 read ESPN's public scoreboard for each of the 629 game dates in 2020-21 to 2023-24 (owner's choice, 2026-11-11; raw files under `data/raw/espn-wp/scoreboard`, receipts keyed `v4-<date>`) and matched each game by date, home and away team, keeping a match only when ESPN's final score equals the game table's. Every game matched; no score differed.

| Line season | Regular-season games | Without a line |
| --- | --- | --- |
| 2020-21 | 1,074 | 10 |
| 2021-22 | 1,228 | 1 |
| 2022-23 | 1,229 | 1 |
| 2023-24 | 1,216 | 0 |
| 2024-25 | 1,212 | 0 |
| 2025-26 | 1,227 | 0 |

Of the parquet's 7,942 rows, 768 match no game in the table (playoffs, play-in and the 2020 bubble,
which is in 2019-20 and not a line season). Games without a line keep mu4 = own.

## Runs

Each stage ran under the registered caps through `scripts/run_win_probability_v4.sh` (systemd: 2
CPUs, 3,072 MiB with no swap, 1,800 s).

| Stage | Runtime | Memory peak |
| --- | --- | --- |
| Pre-fit checks | 3.4 s | 589 MB |
| Stage S (K1, and the K2 fit) | 1 min 52 s | 2.4 GB |
| Stage C (K1, once) | 19.0 s | 633 MB |
| Publish | 0.9 s | 139 MB |

The scoreboard acquisition (`events`) is not a fit and ran outside the cap: 629 requests at the
5-second pacing, 52 min. Before stage C, its code was run end to end on 2023-24 in a scratch
directory (no test season read, output deleted) so that a bug could not spend the single read.

## W3 offline part (2026-11-11): stage F and the freeze checks, before any freeze

| Step | Result | Runtime | Peak |
| --- | --- | --- | --- |
| Stage F (K1): w on 2022-23 to 2025-26, 4,883 games | **w = 1.0** (unclipped 1.0115, clipped to the registered bound); regression check: line 1.002, own 0.025 | 2.5 s | 317 MB |
| ESPN-state parity, stage C's w 0.906, 2,439 games | Log loss +0.00053 (95% +0.00035 to +0.00073) at the same times, +0.00016 (+0.00010 to +0.00024) on ESPN's own sample; limit 0.002: **passes** | 1 min 57 s | 501 MB |
| The serving path reproduces stage C | Max difference 3.0e-8 (stage C's predictions are stored as float32; v2's R15b showed the same) | (same run) | |
| p95 latency, w 1.0, 200 games, one thread | 21 ms (p50 13 ms, max 30 ms); limit 100 ms: **passes** | 6.8 s | 320 MB |
| Platform reference, w 1.0 | 1,902 states from 8 games of 2025-26, scored on x86 | 3.1 s | 312 MB |

The weight rose from 0.720 (stage S) to 0.906 (stage C) to 1.0 (stage F). With a line, the
candidate's pregame forecast is the line itself; with no line, the own forecast. The plan's risk
table expected this case and says to publish it as measured.

ESPN-state parity was read with stage C's w, as registered ("v4's stage C log loss"). Running it with
stage C's w is also what lets the archive states be checked against stage C's saved predictions.

Still to do: the arm64 check on the VPS (`scripts/win_probability_v4_platform_check.sh`, after
the deploy that contains `win_probability_v4_checks`), then the owner's freeze decision. No
manifest, model file, pin test, serving file, v4 scoring, API or dashboard change was made.

## Not done, by the plan

- The arm64 check and the freeze (W3). No page, API or dashboard change.

## Files

| File | What |
| --- | --- |
| [`check-report.json`](check-report.json) | Stage C: every metric, overall and by phase, pooled and per season, the gates, the weight and the pregame table |
| [`selection-log.json`](selection-log.json) | Stage S: the weight, K1 and K2 with model hashes and rounds, the decision, committed before stage C |
| [`prefit-checks.json`](prefit-checks.json) | The pre-fit checks and the line coverage |
| [`final-fit.json`](final-fit.json) | Stage F: the final weight, its games and the weights by stage |
| [`freeze-parity.json`](freeze-parity.json) | ESPN-state parity for v4, with the R15b detail |
| [`freeze-latency.json`](freeze-latency.json) | Whole-game scoring time on one thread |
| [`platform-reference.json`](platform-reference.json) | The states and x86 probabilities the arm64 check compares |
| [`../../../evaluation/research/derived/courtlens-win-probability-v4-check.json`](../../../evaluation/research/derived/courtlens-win-probability-v4-check.json) | The summary a later block shows on the page |
