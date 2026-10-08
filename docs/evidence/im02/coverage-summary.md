# IM02 measured reconstruction coverage

Source: [final audit](audit-accepted-first.json.gz). Fractions use every independent
scheduled game, including exclusions. Minute and plus-minus agreement in the table
uses nonexcluded games only. Complete diagnostics for excluded candidates remain in
the machine report; incomplete reconstructions have null comparisons.

| Season | Phase | Scheduled | Clean | Patched | Excluded | Minute checks ≤1 s | Max minute error | Box +/- exact | +/- p95 absolute error |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2023-24 | playoffs | 82 | 0 (0.00%) | 81 (98.78%) | 1 (1.22%) | 1661/1663 | 6.2 s | 56.24% | 2 pts |
| 2023-24 | regular season | 1230 | 0 (0.00%) | 1216 (98.86%) | 14 (1.14%) | 26081/26087 | 23.2 s | 52.14% | 2 pts |
| 2024-25 | playoffs | 84 | 0 (0.00%) | 83 (98.81%) | 1 (1.19%) | 1779/1779 | 0.5 s | 54.26% | 3 pts |
| 2024-25 | regular season | 1230 | 0 (0.00%) | 1212 (98.54%) | 18 (1.46%) | 25924/25924 | 0.5 s | 53.18% | 2 pts |
| 2025-26 | playoffs | 85 | 21 (24.71%) | 61 (71.76%) | 3 (3.53%) | 1850/1850 | 0.5 s | 50.73% | 3 pts |
| 2025-26 | regular season | 1230 | 0 (0.00%) | 1227 (99.76%) | 3 (0.24%) | 26588/26588 | 0.5 s | 48.71% | 3 pts |

There are 3,941 scheduled games: 21 clean, 3,880 patched, 40 excluded.
`patched` includes documented source arbitration even when its preferred source
conserves box totals without a lineup change; it does not mean every game needed
a missing substitution. Full-period minute boxes are unavailable for this archive
audit. Whole-game player boxes check reconstructed minutes, and the four native
B19d replay games additionally check retained opening-box starter observations.

The 25 unavailable CDN playoff games in 2025–26 are disclosed individually by
the IM01 acquisition report and counted as unavailable cross-checks, never agreement.
Box plus-minus discrepancies remain measured diagnostics, with no matching threshold
or tuning of lineups against plus-minus. The largest nonexcluded discrepancy is
9 points. This is a limitation to retain with IM03 and later descriptive ratings.

## Rule counters

| Season / phase | R1 | R2 | R3 | R4 | R5 | R6 | R7 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2023-24:playoffs | 0 | 4 | 0 | 1 | 7 | 11478 | 1 |
| 2023-24:regular_season | 0 | 14 | 0 | 3 | 65 | 184694 | 14 |
| 2024-25:playoffs | 0 | 0 | 0 | 0 | 7 | 19500 | 1 |
| 2024-25:regular_season | 0 | 14 | 0 | 0 | 50 | 156475 | 18 |
| 2025-26:playoffs | 0 | 0 | 0 | 0 | 3 | 4542 | 3 |
| 2025-26:regular_season | 0 | 2 | 0 | 0 | 77 | 95740 | 3 |

The separate native replay records all 23 R1 overrides and one R5 carry.
R3 has zero eligible event moves in the final archive audit: real same-clock
regressions verify preservation of free throws, timeouts and separate substitution
runs; adversarial tests verify the incoming-shooter movement when required.

## Every excluded game

### 2023-24:playoffs

- `0042300225`: missing-substitution cycle; team 1610612742 lineup reconstruction incomplete.

### 2023-24:regular_season

- `0022300066`: neither source conserves independent box totals; team 1610612745 lineup reconstruction incomplete; team 1610612753 lineup reconstruction incomplete.
- `0022300130`: neither source conserves independent box totals; team 1610612753 lineup reconstruction incomplete; team 1610612762 lineup reconstruction incomplete.
- `0022300155`: neither source conserves independent box totals; team 1610612737 lineup reconstruction incomplete; team 1610612760 lineup reconstruction incomplete.
- `0022300163`: neither source conserves independent box totals; team 1610612745 lineup reconstruction incomplete; team 1610612747 lineup reconstruction incomplete.
- `0022300282`: neither source conserves independent box totals; team 1610612751 lineup reconstruction incomplete; team 1610612753 lineup reconstruction incomplete.
- `0022300300`: missing-substitution cycle; team 1610612741 lineup reconstruction incomplete.
- `0022300324`: incoming player already on floor; team 1610612760 lineup reconstruction incomplete.
- `0022300379`: neither source conserves independent box totals; team 1610612746 lineup reconstruction incomplete; team 1610612760 lineup reconstruction incomplete.
- `0022300535`: duplicate substitution identities; team 1610612753 lineup reconstruction incomplete.
- `0022300709`: missing-substitution cycle; team 1610612750 lineup reconstruction incomplete.
- `0022300833`: neither source conserves independent box totals; team 1610612751 lineup reconstruction incomplete; team 1610612753 lineup reconstruction incomplete.
- `0022300839`: incoming player already on floor; team 1610612741 lineup reconstruction incomplete.
- `0022301004`: neither source conserves independent box totals; team 1610612740 lineup reconstruction incomplete; team 1610612753 lineup reconstruction incomplete.
- `0022301084`: neither source conserves independent box totals; team 1610612741 lineup reconstruction incomplete; team 1610612750 lineup reconstruction incomplete.

### 2024-25:playoffs

- `0042400227`: neither source conserves independent box totals; team 1610612743 lineup reconstruction incomplete; team 1610612760 lineup reconstruction incomplete.

### 2024-25:regular_season

- `0022400024`: neither source conserves independent box totals; team 1610612740 lineup reconstruction incomplete; team 1610612742 lineup reconstruction incomplete.
- `0022400059`: player minutes exceed 30-second tolerance: 77.80.
- `0022400065`: neither source conserves independent box totals; team 1610612748 lineup reconstruction incomplete; team 1610612753 lineup reconstruction incomplete.
- `0022400177`: player minutes exceed 30-second tolerance: 74.00.
- `0022400217`: neither source conserves independent box totals; team 1610612753 lineup reconstruction incomplete; team 1610612754 lineup reconstruction incomplete.
- `0022400252`: neither source conserves independent box totals; team 1610612739 lineup reconstruction incomplete; team 1610612740 lineup reconstruction incomplete.
- `0022400377`: neither source conserves independent box totals; team 1610612748 lineup reconstruction incomplete; team 1610612753 lineup reconstruction incomplete.
- `0022400458`: neither source conserves independent box totals; team 1610612752 lineup reconstruction incomplete; team 1610612762 lineup reconstruction incomplete.
- `0022400551`: neither source conserves independent box totals; team 1610612745 lineup reconstruction incomplete; team 1610612763 lineup reconstruction incomplete.
- `0022400720`: player minutes exceed 30-second tolerance: 105.40.
- `0022400831`: player minutes exceed 30-second tolerance: 213.70.
- `0022400920`: player minutes exceed 30-second tolerance: 73.10.
- `0022400928`: player minutes exceed 30-second tolerance: 77.40.
- `0022400933`: player minutes exceed 30-second tolerance: 99.00.
- `0022400979`: incoming player already on floor; team 1610612753 lineup reconstruction incomplete.
- `0022401112`: missing-substitution cycle; team 1610612764 lineup reconstruction incomplete.
- `0022401194`: neither source conserves independent box totals; team 1610612742 lineup reconstruction incomplete; team 1610612763 lineup reconstruction incomplete.
- `0022401230`: neither source conserves independent box totals; team 1610612745 lineup reconstruction incomplete; team 1610612760 lineup reconstruction incomplete.

### 2025-26:playoffs

- `0042500311`: incomplete game periods; neither source conserves independent box totals.
- `0042500312`: incomplete game periods; neither source conserves independent box totals.
- `0042500316`: incomplete game periods; neither source conserves independent box totals.

### 2025-26:regular_season

- `0022500149`: neither source conserves independent box totals; team 1610612751 lineup reconstruction incomplete; team 1610612755 lineup reconstruction incomplete.
- `0022500193`: neither source conserves independent box totals; team 1610612738 lineup reconstruction incomplete; team 1610612753 lineup reconstruction incomplete.
- `0022500788`: neither source conserves independent box totals; team 1610612744 lineup reconstruction incomplete; team 1610612759 lineup reconstruction incomplete.

