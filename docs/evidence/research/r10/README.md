# R10 — Wingspan beside D-DPM and the ORtg calculator's inputs (data part)

Measured 2026-11-06 on branch `research-r10`. Parent: [Research progress](../../../research-progress.md), [Research handoff](../../../research-plan.md). Catalog rows 19 (Wingspan), 20 (Offensive Calculator) and 27 (Shot Aftermath). Built under D13: new data, a finished GET API and plain page sections. Layout, restyling and Databallr alignment belong to the design phase. Only the owner marks a page ✅.

| Part | Registration | Results |
| --- | --- | --- |
| Wingspan beside DARKO D-DPM | [`courtlens-wingspan-ddpm-v1`](../../../../evaluation/research/registrations/courtlens-wingspan-ddpm-v1.json), `28ec598bd611b5b6…`, commit `e7e4fac` | [`61984cb09d874167…`](../../../../evaluation/research/frozen/courtlens-wingspan-ddpm-v1.json), commit `c438861` |
| Four-factor inputs (v1, defective) | [`courtlens-four-factors-inputs-v1`](../../../../evaluation/research/registrations/courtlens-four-factors-inputs-v1.json), `50cc845ba87c456a…`, commit `e7e4fac` | [`d841d5647f28fcb8…`](../../../../evaluation/research/frozen/courtlens-four-factors-inputs-v1.json), commit `d9f9550`, kept as read |
| Four-factor inputs (v2, served) | [`courtlens-four-factors-inputs-v2`](../../../../evaluation/research/registrations/courtlens-four-factors-inputs-v2.json), `4a4b1d00af516d2b…`, commit `57bd6a6` | [`283e6554ecfd3b01…`](../../../../evaluation/research/frozen/courtlens-four-factors-inputs-v2.json), commit `ee3b6bc` |

Order: code and [`data-check.json`](data-check.json) (`d4afbf4`) → both registrations (`e7e4fac`) → one `test` read each, as separate commands → results commits; then v2 code and [`four-factors-check-v2.json`](four-factors-check-v2.json) (`3d9d3dc`) → v2 registration (`57bd6a6`) → one `test` read → results (`ee3b6bc`). Each `reproduce` was run twice and gave the frozen hash every time.

## Content reference

The owner supplied saved Databallr pages for all three (Wingspan Database, Offensive Rating Calculator / ORTG Lab, Shot Aftermath); [`data-check.json`](data-check.json) lists what each shows. No databallr.com fetch.

| Page | Databallr shows | New data in R10 | Left for the design phase |
| --- | --- | --- | --- |
| Wingspan (row 19) | Filters (active, position), barefoot / with shoes, units, CSV; table with percentiles and D-DPM; average H/W/diff; positional averages; overlay; "find similar profiles"; scatter with two selectable axes and R | Career D-DPM per player (registered), current D-DPM from DARKO's newest board, percentiles, positional averages with counts and intervals, Pearson r with intervals (overall, within position, partial), scatter data, nearest builds | Databallr layout, with-shoes toggle (+1.25 in), units toggle, CSV download, the overlay graphic, row actions |
| Calculator (row 20) | ORTG = 100 × xSHOT × xEFF × xPOSS, league-average defaults, marginal value board, split 2P / 3P / FT offensive rebounds, credits Poropudas & Halme | Every season's (2014-15 to 2025-26) observed league and team inputs, mu, rebound rates by miss kind, Eq. (11) rating and marginals | The interactive lab (sliders, master dials, decomposition cards); the existing hypothetical calculator is untouched |
| Shot Aftermath (row 27) | League / team / position view by shot zone, two seasons | None (see below) | Everything, once the owner decides on the data |

**Shot Aftermath is not restyle-only.** Databallr's page aggregates first-chance attempts by zone (rim, short mid, long mid, three) for the league, each team and each position group, with second-chance points and opponent cost. CourtLens's page is per player and reads `workbench_pbp_events`, `workbench_possessions` and `workbench_shots`, which in the published database hold two test games, so it cannot show Databallr's content. Serving it needs a frozen aggregate from the play-by-play archives (new data). Left out of R10 and raised with the owner.

## Calculator: the paper, from the primary source

Read from the arXiv PDF (`2305.13032v2`, SHA-256 `a89c98df…`): J. Poropudas (SportIQ) and T. Halme (Aalto University), *Decomposing Basketball Team Efficiency Using the Four Factors and Shapley Values*, v2 13 October 2026; v1 (22 May 2023) was titled *Dean Oliver's Four Factors Revisited*, the name Databallr cites. Proposition 1, Eq. (11): ORTG = (1 − TOV%)(FTr + 2 eFG%) / (1 − ORB%(1 − FG%) + μ FTr / FT%), with TOV% from Eq. (10) and ORB% ≈ ORB / (FGA − FGM) (Eq. 9); μ is the share of possession-ending free throws (Appendix A: 0.425 for 2024-25; Kubatko et al. 0.44 for 2003-06). It is exactly Eq. (3), PTS / (FGA + TOV − ORB + μ FTA). The paper's main model has one ORB%; Remark 2 discusses separate free-throw rebounding, and Databallr's lab splits 2P / 3P / FT rebounding as its own adaptation.

**What /calculator already had:** a user-assumption "hypothetical" repeated-chance model with no observed data and not the paper's formula. So the formula needed new data: season inputs, μ and the rebound splits. Nothing about the formula itself needs the server; the lab's arithmetic is the design phase's.

## Data checks and match rates

**Wingspan** ([`data-check.json`](data-check.json)). IDs: combine rows, game logs and DARKO boards all key by NBA person ID; no name matching.

| Step | Players |
| --- | ---: |
| Combine rows 2000–2026 | 1,873 rows |
| Excluded: no NBA person ID (Jason Gardner, Chris Massie, Drago Pasalic, Carl Krauser, Blake Schilb) | 5 rows |
| Players with an ID (62 attended two combines, 1 three; the latest with both measurements is used) | 1,804 |
| Excluded: no barefoot height and wingspan at any combine (Markelle Fultz, Zion Williamson, RJ Barrett…) | 53 |
| **Measured** | **1,751** |
| Excluded: no regular-season minutes 2000-01 to 2025-26 (includes the 2026 class) | 566 |
| Excluded: no season with 500+ minutes | 361 |
| Excluded: no DARKO rating in any 500-minute season | 2 |
| **In the correlations (analysis population)** | **822** (47% of measured) |
| Position unassigned (blank combine label): kept overall, out of positional figures | 1 |

DARKO boards: 26 season-end regular-season boards, 2000-01 (380 players) to 2025-26 (547). 82 player-seasons are on a board with no logged minutes (not counted as 0 minutes); 407 player-seasons have minutes but no board row, 35 of them with 500+ minutes (players no longer rostered on the board's date), which are not used.

**Four factors** ([`four-factors-check-v2.json`](four-factors-check-v2.json)): every regular season 2014-15 to 2025-26 complete (1,230 games; 1,059 in 2019-20, 1,080 in 2020-21), no unknown free-throw text, 30 teams each. Four turnover rows (two in 2020-21, one each in 2021-22 and 2022-23) have no team at all: reported and left out. Counted points equal the final score in 14,200 of 14,229 games; 22 differ by 1 to 3 points and 7 by more (likely bad final-score rows or truncated play-by-play); all are kept and listed.

## Temporal honesty

DARKO's season-end boards are its pregame forecast at each season's last regular-season game date, recomputed retrospectively with its current model and including that season's games (why R08 left DARKO out as hindsight). Wingspan against career D-DPM is therefore a **descriptive association** between a pre-draft measurement and a later rating, never a forecast or a cause. The API, the page's section text and its caveats say so. The current D-DPM is DARKO's newest daily board, dated on the page.

## Results

### Wingspan beside career D-DPM (95% bootstrap over players, 2,000 replicates, seed 1010)

| Pair | Population | n | r | 95% interval | Verdict |
| --- | --- | ---: | ---: | --- | --- |
| **Wingspan − height · D-DPM (primary)** | analysis | 822 | **+0.213** | +0.152 to +0.272 | positive |
| Wingspan · D-DPM | analysis | 822 | +0.467 | +0.415 to +0.516 | positive |
| Height · D-DPM | analysis | 822 | +0.419 | +0.364 to +0.474 | positive |
| Wingspan · D-DPM, height held fixed (partial) | analysis | 822 | +0.235 | +0.173 to +0.294 | positive |
| Height · wingspan | measured | 1,751 | +0.834 | +0.821 to +0.847 | positive |
| Height · wingspan − height | measured | 1,751 | −0.016 | −0.064 to +0.032 | not distinguishable from zero |
| Wingspan · wingspan − height | measured | 1,751 | +0.538 | +0.504 to +0.571 | positive |

Within position, wingspan − height against D-DPM: PG +0.07 (−0.06 to +0.19, n 180, not distinguishable from zero), SG +0.23 (+0.12 to +0.34, n 192), SF +0.21 (+0.06 to +0.35, n 182), PF +0.14 (+0.02 to +0.26, n 190), C +0.27 (+0.06 to +0.46, n 77). Height alone is not distinguishable from zero within SF, PF and C; wingspan is positive within every position. Plainly: longer arms for one's height go with better DARKO defense, modestly (r ≈ 0.2, about 4–5% of the variance), except among point guards. Databallr's R = 0.83 is height against wingspan; CourtLens gets 0.834 on 1,751 measured players.

### Positional averages (first listed combine position)

| Position | Measured | Height (in) | Wingspan (in) | Diff (in) | Rated | Career D-DPM |
| --- | ---: | --- | --- | --- | ---: | --- |
| All | 1,751 | 77.67 (77.51–77.83) | 82.37 (82.17–82.56) | 4.69 (4.59–4.80) | 822 | −0.15 (−0.21 to −0.09) |
| PG | 363 | 73.24 | 77.49 | 4.25 | 180 | −0.55 (−0.66 to −0.44) |
| SG | 392 | 75.95 | 80.61 | 4.67 | 192 | −0.47 (−0.58 to −0.37) |
| SF | 335 | 78.40 | 82.89 | 4.49 | 182 | −0.13 (−0.25 to −0.01) |
| PF | 442 | 80.04 | 85.09 | 5.05 | 190 | +0.18 (+0.06 to +0.30) |
| C | 218 | 82.22 | 87.30 | 5.09 | 77 | +0.71 (+0.52 to +0.92) |

Intervals for every cell are in the results and on the page. Nearest builds: barefoot height and wingspan standardized by their mean and SD over the 1,751 measured players (77.67 ± 3.37 in, 82.37 ± 3.99 in), Euclidean distance, 5 nearest, ties by player ID; computed by the API from the frozen rows.

### Four-factor inputs (v2), league

| Season | μ | eFG% | TOV% | ORB% | ORTG (Eq. 11) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2014-15 | 0.4366 | 49.6 | 15.3 | 31.0 | 106.82 |
| 2019-20 | 0.4234 | 52.9 | 14.6 | 28.2 | 112.23 |
| 2024-25 | 0.4287 | 54.3 | 14.6 | 30.8 | 115.93 |
| 2025-26 | 0.4284 | 54.6 | 14.7 | 31.5 | 116.99 |

Eq. (11) equals Eq. (3) for every league and team season (difference 0 at six decimals). Against the paper's 2024-25 values: μ 0.429 vs 0.425, make rate of final free throws 0.804 vs 0.795, OREB% after a missed final free throw 0.137 vs 0.131; close, not equal, reported as is. 2024-25 marginal value per point: eFG% +1.43, TOV% +1.36, ORB% +0.66, FT rate +0.23, FT% +0.16 (Databallr's board, unknown date and adaptation: +1.50, +1.37, +0.66, +0.24, +0.22). Offensive rebound rates 2025-26: after a missed two 33.8%, three 27.8%, final free throw 14.2%, and-one 10.9%.

## Disclosures

1. **Four-factors v1 is defective.** The registered rule read threes only from `shotValue`, which the 2014-15 to 2023-24 archives lack, so those seasons counted no threes (eFG 44.9% in 2014-15, ORTG about 98). Found when reading the results. v1 stays frozen as read; v2 (threes from "3PT" in the description where `shotValue` is absent, plus the points check) was registered before its read and is the one served.
2. **Coverage differs from Databallr.** Of the 27 players in the saved Databallr table, the 19 CourtLens measured match Databallr's height and wingspan exactly; 8 (Wembanyama, Holmgren, Lively, Duren, Ayton, Porzingis, Robert Williams, Wiseman) skipped the combine measurements or are not in the combine feed, and Databallr fills them from other sources (it credits Nick Kalinowski and CraftedNBA). CourtLens leaves them unknown. Top picks who skip the combine are therefore under-represented.
3. **Seen before registering:** only coverage counts and a few combine values while probing IDs (Jaron Blossomgame, Josh Hart, Nigel Hayes double combines). No r, average, μ or rating was computed before the registration commit; the play-by-play `check` reports games and unknown text only.

## Hosting

Both APIs read only committed frozen results (shipped in the image's `evaluation/`), so `/api/wingspan`, `/api/wingspan/nearest/{id}` and `/api/four-factors[...]` work on the hosted demo without git-ignored files. The current D-DPM uses the DARKO bundle the demo's daily refresh already keeps; without it the column and the Active filter are unknown and the rest works. The input tables in `data/derived/wingspan-v1/tables/` are git-ignored and needed only to `reproduce`. All endpoints are GET: no Caddy allowlist change.

## Verification

| Check | Result |
| --- | --- |
| Ruff, format, strict mypy (376 files) | clean |
| Python (`scripts/test_python.py`) | 2,665 passed, 3 skipped; the 8 known `test_agent_providers[anthropic]` failures |
| R10 tests | `tests/unit/test_r10_wingspan_four_factors.py` (synthetic dry run of both runners, every expected key, unknowns, minimum minutes, Eq. 11 = Eq. 3, three-point fallback) and `tests/unit/test_r10_api.py` (against the frozen results) |
| Dashboard lint, typecheck, Vitest | clean; 735 passed |
| Page Playwright (`e2e/r10-wingspan-calculator.spec.ts`, real-API fixtures) | 5 tests, 15/15 over three repeats |
| Full Playwright, production build sandbox, mock API, 2 workers, 8 GiB | 570 passed, 17 skipped, 0 failed; `git status` clean of evidence changes |
| Real data through a private API (4180) and sandbox (3180) | Every value in the correlation, within-position, positional-average, nearest-build, player (first 50 rows: values, percentiles, current D-DPM, team), scatter-point count, league, marginal, rebound, μ and 30-team tables equals the API at 1440 and 390; 0 console errors, 0 overflow, 0 broken images |
| Source check ([`source-check.json`](source-check.json)) | r and positional averages recomputed from the database and DARKO bundle with separate code: max difference 4.8e-7 (rounding), same counts; 5 player-season D-DPM values traced to DARKO's retained raw responses, all equal; 27-row hand sample against Databallr's saved table as above |
| Screenshots | [`wingspan-1440.png`](wingspan-1440.png), [`wingspan-390.png`](wingspan-390.png), [`calculator-1440.png`](calculator-1440.png), [`calculator-390.png`](calculator-390.png); viewed; extremes (+3.76 / −2.52 axis labels, 243,095 possessions, 0.4284) legible |

R16 constraints observed: no Ask or provider calls, the main `.venv` unchanged, the shared Postgres only read (release `a584c88b` untouched, no migration or publication), `~/dev/courtlens-r16` untouched.

## Credits

Design reference: Databallr's Wingspan, ORTG Lab and Shot Aftermath pages. D-DPM: DARKO by Kostya Medvedovsky. Measurements: NBA Draft Combine via hoopR (sportsdataverse). Method: Poropudas and Halme (arXiv:2305.13032); four factors: Dean Oliver. Play-by-play: NBA PlayByPlayV3 via shufinskiy/nba_data.
