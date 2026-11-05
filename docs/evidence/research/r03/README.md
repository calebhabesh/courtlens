# R03 — Signal vs Noise

Measured 2026-11-05 on branch `research-r03`. Parent: [Research progress](../../../research-progress.md),
[Research handoff](../../../research-plan.md). Page: `/research/signal-noise` (Research → Methods). Catalog
row 29; the ✅ is the owner's. Built under D13: plain page, finished API, no Databallr counterpart.

Files here: [results.json](results.json) (the frozen results, byte-identical to
`evaluation/research/frozen/courtlens-signal-noise-v1.json`), [dom-checks.json](dom-checks.json) and
[browser-check.mjs](browser-check.mjs) (what the browser drew against the API),
[stats-toggle-check.json](stats-toggle-check.json) and [verify_stats_toggle.py](verify_stats_toggle.py)
(every shrunk Stats cell recomputed from the database), and screenshots at 1440 and 390 on real data.

## Registered first

`courtlens-signal-noise-v1` (content `786d0aa0…`) was committed on its own (`b905bfd`) before any
correlation, prior or validation number existed. It fixes the seasons, eligibility, 500 splits, the octile
sample-size bins, seed 3003, the bootstrap, how TS% is shrunk, what the prior may read, the validation and
the budget (one thread, 3 GiB, 30 min). It also defines **reached** so that nothing is extrapolated silently:
a level counts as reached only if some sample-size bin actually shows that reliability *and* the fitted
point lies inside the observed samples. Otherwise the fitted crossing is served only in a field named
`extrapolated` and labelled "not reached".

## What the data allows (checked before building)

- **Rate stats on the Stats table from game logs:** FG%, 2P%, 3P%, FT%, eFG%, TS%, FTr and the per-36
  rates PTS, REB, OREB, DREB, AST, STL, BLK, TOV, PF, FGA, 3PA, FTA (the Stats engine's game-log columns).
  The rest (impact, DARKO, tracking, Basketball-Reference, play types) are season totals or model outputs,
  can't be split by game, and the page lists them as not covered.
- **Game-level coverage:** regular seasons **1983-84 to 2026-27** have game logs (not just from 2000-01);
  earlier seasons are season totals. Stabilization uses the twelve complete seasons 2014-15 to 2025-26;
  the older logs feed only the priors (3P%, FT%, 2P% priors from 1984-85).
- **Rim FG%:** the Stats table served no rim FG%. Game-level rim makes and attempts exist in the retained
  NBA ShotChartDetail archives (shufinskiy, pinned commit, SHA-256 checked) for **2014-15 to 2025-26**:
  every logged game is covered, and shot-chart FGA disagree with the box score in 360 of 306,337
  player-games (0 in seven seasons). No 2026-27 shot detail exists, so 2026-27 rim values are unknown.
- **TS% identity:** points = 2·2PM + 3·3PM + FTM in every player-season (0 exceptions), so the composed
  shrunk TS% equals raw TS% when nothing is shrunk.

## Results: stabilization points

5,707 player-seasons with 10 or more games (1,387 players), 500 random game splits each, 8 bins per stat.
Sample unit in attempts, true-shooting attempts or minutes; 95% player-cluster bootstrap intervals.

| Stat | Unit | Player-seasons | Median season sample | Reliability 0.5 at | Reliability 0.7 at | Largest bin: sample, reliability |
| --- | --- | ---: | ---: | --- | --- | --- |
| FG% | FGA | 5,693 | 362 | 51 (44–59) | 118 (102–138) | 1,127, 0.880 |
| 2P% | 2PA | 5,608 | 212 | 65 (58–73) | 152 (136–171) | 796, 0.875 |
| **3P%** | 3PA | 4,870 | 150 | **not reached** (curve 419, 368–500) | **not reached** (curve 978, 858–1,166) | 480, 0.486 |
| FT% | FTA | 5,214 | 86 | 27 (24–30) | 64 (56–71) | 376, 0.943 |
| eFG% | FGA | 5,693 | 362 | 149 (128–171) | 347 (298–400) | 1,127, 0.796 |
| TS% | TSA | 5,697 | 399 | 169 (149–191) | 395 (348–445) | 1,274, 0.837 |
| FTr | FGA | 5,693 | 362 | 43 (39–47) | 99 (90–109) | 1,127, 0.947 |
| Rim FG% | rim FGA | 5,358 | 109 | 70 (64–78) | 164 (149–182) | 387, 0.843 |
| PTS/36 | minutes | 5,491 | 1,212 | 88 (79–99) | 205 (184–231) | 2,481, 0.978 |
| REB/36 | minutes | 5,491 | 1,212 | 33 (29–36) | 76 (69–84) | 2,481, 0.988 |
| OREB/36 | minutes | 5,491 | 1,212 | 48 (43–53) | 111 (100–123) | 2,481, 0.979 |
| DREB/36 | minutes | 5,491 | 1,212 | 59 (53–65) | 137 (124–152) | 2,481, 0.983 |
| AST/36 | minutes | 5,491 | 1,212 | 42 (38–47) | 98 (89–110) | 2,481, 0.988 |
| STL/36 | minutes | 5,491 | 1,212 | 284 (255–322) | 663 (594–751) | 2,481, 0.891 |
| BLK/36 | minutes | 5,491 | 1,212 | 72 (64–81) | 168 (149–189) | 2,481, 0.965 |
| TOV/36 | minutes | 5,491 | 1,212 | 163 (151–179) | 381 (351–417) | 2,481, 0.957 |
| PF/36 | minutes | 5,491 | 1,212 | 125 (113–137) | 292 (264–320) | 2,481, 0.913 |
| FGA/36 | minutes | 5,491 | 1,212 | 45 (41–50) | 106 (96–116) | 2,481, 0.986 |
| 3PA/36 | minutes | 5,491 | 1,212 | 19 (17–21) | 43 (40–48) | 2,481, 0.991 |
| FTA/36 | minutes | 5,491 | 1,212 | 103 (92–116) | 241 (216–271) | 2,481, 0.974 |

**3P% never stabilizes within the observed samples.** Its highest-volume bin (373 to 1,028 3PA, mean 480)
reaches a reliability of only 0.486 (0.401–0.549). The fitted curve would cross 0.5 at 419 3PA and 0.7 at
978. Those are a model's numbers, not observed ones, and the page and API label them that way. Every other
stat reaches both levels. Shooting volume (3PA/36, FTr) settles fastest; steals per 36 and the shooting
percentages that mix makes with shot selection (eFG%, TS%) are the slowest of those that settle.

Reliability is population-relative: each bin measures how well the stat separates the players in that bin.
Game-level splits keep each game's shots together, which understates reliability slightly against
shot-level splits.

## Results: shrinkage

Beta-binomial priors by maximum likelihood on up to three earlier regular seasons, for 3P%, FT%, 2P% and
rim FG% (TS% composed). 2026-27 priors, read from 2023-24 to 2025-26:

| Stat | Prior mean | Strength α+β | Stabilization M |
| --- | ---: | ---: | ---: |
| 3P% | 35.65% | 302.7 | 419 (not reached) |
| FT% | 76.43% | 26.9 | 27 |
| 2P% | 54.21% | 76.8 | 65 |
| Rim FG% | 65.66% | 77.3 | 70 |

The prior strength and the stabilization point are two estimates of the same quantity, from different
methods (likelihood on season totals against split-half correlation by game), and they agree closely.

**Does shrinking predict next season better?** Registered check, no gate. Target seasons 2015-16 to
2024-25 predicting the next season. Mean squared error ×10,000, weighted by next season's attempts:

| Stat | Player pairs | Raw | Prior mean | Shrunk | Raw minus shrunk, 95% | Error cut |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| 3P% | 3,986 | 38.8 | 21.9 | 18.4 | 20.4 (17.3 to 23.6) | 53% |
| FT% | 4,074 | 53.5 | 94.5 | 36.6 | 16.9 (12.0 to 22.4) | 32% |
| 2P% | 4,232 | 33.0 | 44.3 | 21.7 | 11.4 (8.2 to 15.6) | 34% |
| TS% | 4,255 | 24.6 | 25.1 | 14.8 | 9.8 (7.7 to 12.7) | 40% |
| Rim FG% | 4,160 | 51.8 | 58.0 | 32.5 | 19.3 (15.3 to 24.2) | 37% |

Shrunk beats raw for all five stats and in every attempt band (under 50, 50–199, 200 or more), with every
interval above zero. It also beats the prior mean alone. The gain is large for small samples and small
above 200 attempts (3P%: 3.3 ×10⁻⁴ there), as expected.

**Worked example (rule-picked, not a judgement):** the 2025-26 player with 25–100 3PA whose 3P% moves
most is Hansen Yang (POR): 5 of 42 (11.9%) shrinks to 32.8% (28.0–37.8%). He is a centre, so this also
shows the main limitation. The prior is league-wide, so his few threes are pulled toward the league's
shooters, not toward other centres.

## Reproducibility and a bug found on the way

- Two runs with the final code give the same results hash `22a227b2…` and byte-identical files
  (`72a8bf92…`), about 42 s and 1.6 GiB peak each under the 3 GiB, one-thread cap.
- **The first run (`acd9275b…`) is not the published one.** Its prior fit used L-BFGS-B on the summed
  log-likelihood, which stopped unconverged for 3P%, FT% and rim FG%. It ran off to a strength of about
  200,000, which collapses every player to the league mean. The runner recorded `converged: false`. The fit was
  rewritten (profile likelihood: grid then Brent over log strength, the mean optimised inside; an
  unconverged fit now raises) and tested on simulated data with known priors (27 recovered as 26.8, 400
  as 381). The registration's method, maximum likelihood, is unchanged, and nothing else was altered. All
  141 priors now converge and none sits on a bound.

## What was built

- **Analysis:** `domain/signal_noise.py` (splits, Spearman–Brown fit, reached rule, beta-binomial, TS%
  composition) and `evaluation/signal_noise_runner.py`. The frozen output is
  `evaluation/research/frozen/courtlens-signal-noise-v1.json`.
- **API (GET only, no Caddy change):** `/api/signal-noise` (results), `/api/signal-noise/shrinkage`
  (a season's priors and rim totals, with unknown reasons), `/api/signal-noise/player` (worked example
  with 95% credible intervals; TS% interval from 4,000 seeded joint draws).
- **Page:** plain build (shared PageHeader, StatTile, Section, Table, ChartFrame, control kit): league
  table, stabilization curve with bin table, priors by season, worked example with its season path,
  validation, coverage, method and credit. Menu item under Methods, `waveform` icon.
- **Stats "Shrunk %" toggle:** off by default; when off it sends no request and changes no column, query,
  hash, saved view or URL. When on (table view only), it adds unsortable columns *3P%-Shrunk*, *FT%-Shrunk*,
  *TS%-Shrunk*, *Rim FG%* and *Rim FG%-Shrunk* beside the raw ones and a line saying which seasons the
  prior read. It computes them in the browser from each row's own makes and attempts in the scope shown;
  a Vitest fixture generated by the Python module holds the two equal. The flag is `shrunk=1`, written
  with `history.replaceState`, so the Stats query never re-runs. Unknown: multi-season scopes, playoffs,
  seasons without a prior, and rim outside a whole regular season with no team or date filter.
- No hash-pinned module, frozen model or scoring was touched.

## Checks against the data

| Check | Result |
| --- | --- |
| Page vs API, 1440 and 390 | 122 values compared each (league table, 3P% bins, priors, validation, example), **0 mismatches**, 0 console errors, 0 px page overflow |
| Stats toggle, 4 scopes (2025-26 season, 2026-27 default, 2025-26 BOS, 2024-25 playoffs) | **855 shrunk cells recomputed from the database, 0 mismatches**; raw cells changed when on: 0; requests on toggle: only `GET /api/signal-noise/shrinkage`; Stats query re-run: never; table after toggling off identical to before |
| Temporal | `test_prior_for_a_season_reads_only_earlier_seasons`: replacing every season from t on leaves t's prior identical; changing t−1 changes it |
| Served results | registration hash, results hash, refit of M from served bins (rel 1e-4), every level's status rule, prior seasons, shot-detail coverage |

## Checks

| Check | Result |
| --- | --- |
| Ruff, format | clean (984 files) |
| Strict mypy | clean (332 source files) |
| Python tests | **2,493 passed, 1 skipped, 8 failed**: the same 8 `test_agent_providers.py[anthropic]` SDK failures as R01 and R02. 18 new tests pass |
| Vitest | 715 passed |
| Dashboard lint, typecheck | clean |
| Playwright, targeted | `r03-signal-noise.spec.ts` (4 tests, 3 clean runs) plus the route-consolidation, header and nine Stats specs: **53 passed** against a production build and the mock API on private ports |
| Full Playwright | **not run**: 9.1–9.4 GiB available against the ~12 GiB the run needs (owner's rule: stop rather than start it) |

## Not verified

- **Full Playwright suite**, for the memory reason above.
- **Hosted demo:** not deployed.
- The sticky header paints mid-page in the full-page captures; the viewport shots at scroll 0 show it correctly.
