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
| R07 Projected Impact | ⬜ pending | |
| R08 Metric Backtest | ⬜ pending | |
| R09 Draft Classes | ⬜ pending | |
| R10 Wingspan, ORtg Calculator, Shot Aftermath restyle | ⬜ pending | |
| R11 Learning, Glossary, Patch Notes | ⬜ pending | |
| R12 Research landing, menu, README | ⬜ pending | |
| R14 Lineup model with learned embeddings | ⬜ pending | |
| R15a Win Probability: model and final-test report | ⬜ pending (runs second, after R01) | |
| R15b Win Probability: production, scorecard, pages | ⬜ pending | |
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
