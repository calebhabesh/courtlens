# IM03 coverage and conservation

Status: **verification_blocked** on the unchanged ±2 box-estimate gate. All rows are sealed candidates in a disposable PostgreSQL instance; no owner publication changes.

| Season / phase | Games / schedule | Stints | Possession records | Team-games within ±2 | Mean delta | p95 absolute | Maximum absolute |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2025-26 / regular_season | 1227 / 1230 | 68,925 | 245,712 | 1,106 / 2,454 | -2.379 | 5.92 | 10.40 |
| 2025-26 / playoffs | 82 / 85 | 4,913 | 15,793 | 64 / 164 | -2.628 | 6.68 | 8.52 |
| 2023-24 / regular_season | 1216 / 1230 | 58,652 | 241,648 | 1,172 / 2,432 | -2.175 | 5.56 | 11.28 |
| 2023-24 / playoffs | 81 / 82 | 3,905 | 15,133 | 87 / 162 | -1.840 | 5.00 | 7.56 |
| 2024-25 / regular_season | 1212 / 1230 | 61,514 | 241,610 | 1,243 / 2,424 | -2.066 | 5.52 | 9.60 |
| 2024-25 / playoffs | 83 / 84 | 4,154 | 16,020 | 64 / 166 | -2.250 | 5.40 | 9.28 |

The denominator remains 3,941 independently scheduled games, with IM02’s 40 explicit exclusions. All 21 clean and 3,880 patched games are present. Team points, FGA/FGM and FTA/FTM conserve; reconstructed player seconds match IM02. Clean-game known minutes stay within one second. Four 2023–24 tolerated games retain their original minute differences (maximum 23.2 seconds). No tuning to box plus-minus occurred; IM02’s 48.71–56.24% exact agreement and maximum nine-point discrepancies remain attached.

The fixed estimate is `FGA + 0.44 * FTA - player ORB + box TOV`. **3,736 / 7,802 team-games (47.885%)** are within ±2. The maximum absolute difference is **11.28**. No possessions were added, source rows edited, or extra games excluded to make this check pass.

Public pbpstats groups are a separate diagnostic: 2023–24 regular-season counts compare 2,428 team-games (1,231 exact, 2,418 within two, maximum three); 2024–25 compares 2,424 (1,202 exact, 2,408 within two, maximum four). Its repeated event rows are deduplicated by opponent/period/start/end/full EVENTS text. Two admitted 2023–24 games lack this cross-check. Playoff and 2025–26 comparisons are unavailable, never agreement.

Player ORB differs from the independent box in nine team-games (eight -1, one +1). Explicit PBP turnovers include uncredited team events: 4,127 team-games differ from box turnovers, with deltas from -1 to +7. These are retained diagnostics, not claimed box agreement. Detailed per-game differences, candidate hashes, all unavailable comparisons and exclusions are in [the machine report](coverage-and-conservation.json.gz).

The hard ±2 acceptance gate therefore stays open. All six datasets are `candidate`; IM04 remains planned.
