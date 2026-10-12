# PC09 value metric and derived archetypes

Status: implemented 2026-10-11. **Archetype names are `proposed` pending owner review.**
Parent: [presentation clarity progress](../../presentation-clarity-progress.md).
Contract: [value and archetypes v1](../../design/value-archetypes-v1.md);
names: [archetype-names-v1.json](../../design/archetype-names-v1.json).

PC09 fits no new ratings. It selects the sealed IM04 Box-Prior RAPM as the value metric by a
fixed rule, scores it out of time, and fits derived archetypes from admitted box and shot data.
No source was fetched (D5: the three admitted seasons were enough). The database was read in one
read-only transaction; the 161 publication pointers are unchanged.

## Artifacts

| Kind | SHA-256 | Notes |
| --- | --- | --- |
| Value | `239bab91…309d28` | BPR, regular season 2024-25 + 2025-26 (IM04 `477fb7ed…`), 687 players |
| Evaluation | `966d8181…547a15` | Two out-of-time folds |
| Archetypes | `91a5a7d3…5b00b00` | K = 6, 1,112 training player-seasons |
| Serving manifest | `765d55f1…f6da9ce` | Bounded projection with names; 799 players |

Compressed copies are in [artifacts/](artifacts/). Two independent runs
([run 1](runs/run-1.json), [run 2](runs/run-2.json)) produced identical value, evaluation and
archetype hashes. Runtime is about 4 seconds.

## Value: out-of-time evaluation

Target: 1Y regular-season RAPM of qualified players. Predictors use only earlier seasons.
Seconds-weighted, on the cohort where every predictor exists.

| Target | Predictor | Pearson | RMSE |
| --- | --- | --- | --- |
| 2025-26 (337 of 382) | zero | — | 3.217 |
| | RAPM 1Y 2024-25 | 0.397 | 3.426 |
| | RAPM 2Y 2023-25 | **0.481** | 3.200 |
| | BPR 1Y 2024-25 | 0.442 | 3.377 |
| | Box prior (earlier seasons) | 0.438 | **2.888** |
| 2024-25 (329 of 373) | zero | — | 3.071 |
| | RAPM 1Y 2023-24 | 0.336 | 3.570 |
| | Box prior (earlier seasons) | 0.313 | **2.934** |

Reading: one-year RAPM is noisy, so raw earlier RAPM has higher RMSE than predicting zero. BPR
correlates better than 1Y RAPM (0.44 vs 0.40); the box prior alone has the lowest RMSE because it
is already shrunk. 2Y RAPM has the best correlation, which supports the 2Y window the rule
selects. BPR on a 2Y window cannot be scored here (it needs a prior before 2023-24). This is a
diagnostic, not a promotion gate; the selection rule was fixed before scoring.

## Archetypes

BIC over {6, 7, 8}: 21,385.5 / 21,551.0 / 21,736.5, so K = 6, which matches the six v1.2
categorical tokens. 16 team-games with unknown minutes were excluded. 105 of 1,112 training
player-seasons have no cluster above 60% membership (true hybrids).

| # | Proposed name | Share | USG% | AST% | 3PA rate | Rim rate | OREB% | DREB% | BLK% | STL% | FT rate | 2025-26 examples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Lead creator | 27% | 22.8 | 23.1 | .43 | .24 | 2.6 | 11.5 | 1.1 | 1.7 | .23 | Brunson, Maxey, Durant |
| 2 | Spacing wing | 25% | 17.9 | 10.5 | .57 | .24 | 3.6 | 13.0 | 1.2 | 1.4 | .18 | Camara, Knueppel, M. Bridges |
| 3 | Two-way connector | 18% | 15.5 | 12.5 | .47 | .36 | 5.1 | 12.5 | 1.8 | 2.0 | .22 | D. White, D. Daniels, Anunoby |
| 4 | Stretch big | 12% | 19.4 | 10.5 | .34 | .43 | 8.7 | 20.6 | 4.2 | 1.4 | .26 | Holmgren, Mobley, Turner |
| 5 | Interior hub | 10% | 23.7 | 23.2 | .27 | .44 | 6.3 | 20.3 | 1.7 | 1.7 | .36 | Jokić, Sengun, Barnes |
| 6 | Rim runner | 8% | 14.5 | 9.6 | .01 | .77 | 13.0 | 22.5 | 4.2 | 1.3 | .41 | Gobert, J. Allen, Zubac |

## 2026-27 roster coverage

Of 622 active players in the 2026-27 player index: 501 have a value (415 qualified), 504 have an
archetype (481 from 2025-26), and 118 have neither (mostly rookies). PC10 must show those as
unknown, never as zero or an empty-value player.

## Serving

`GET /api/workbench/value-archetypes` (optional `playerId`, repeatable; `limit` ≤ 1000) returns
labels, rule, evaluation folds, cluster names and means with `--color-category-N` tokens, and
player rows. A requested player outside both artifacts gets null with reasons. The catalog
declares `value_archetypes_pc09`. Methodology: `/methodology#value-archetypes`.

## Reproduce

```bash
.venv/bin/python -m courtlens.evaluation.value_archetype_runner \
  --database-url postgresql+psycopg://courtlens:courtlens@localhost:5432/courtlens
.venv/bin/python -m courtlens.evaluation.value_archetype_runner --serve \
  239bab9141e8cea5b00cb0a0feb2cbc4481c8aac37d7d2add3fe7f10ac309d28 \
  91a5a7d3f2b5a71c9c33f4caea2833027588b9da979fbc40c19e5e4ca5b00b00 \
  966d8181ff8a645aae5062df2e23050bde7c8ad5ed63aa96c71de7c4f0547a15
```

Renaming clusters edits only the names file and produces a new serving manifest; the fitted
artifact hash does not change.

## Checks

- 9 new tests in `tests/unit/test_value_archetypes.py`: game-by-game team context for traded
  players, unknown-minutes exclusion, null (not zero) undefined rates, deterministic ordered GMM,
  value selection rule, missing predictors excluded, earlier-only folds, tamper rejection, unknown
  rows with reasons, capability status.
- [Full Python suite](verification/python.log): 1,997 passed, one existing browser-prerequisite
  skip, 19 published-data deselections, one existing Google GenAI deprecation warning. Ruff,
  format and strict mypy clean.
- Dashboard (methodology text only): lint 0/0, typecheck, Vitest 415 passed.
