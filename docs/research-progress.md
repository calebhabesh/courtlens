# CourtLens Research progress log

Evidence log for the [Research handoff](research-plan.md). Record measured results, commands,
coverage and screenshots per block. Plan text is not evidence.

## Block status

| Block | Status | Evidence |
| --- | --- | --- |
| R01 Impact history backfill, time decay, intervals, rating snapshots | ⬜ pending | |
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
