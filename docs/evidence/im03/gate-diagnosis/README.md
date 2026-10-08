# IM03 hard-gate diagnosis

Status: **verification_blocked**. IM04 remains planned. This continuation diagnoses
the preserved ±2 failure without revising the possession method, estimate,
exclusions or sealed candidates.

## Reproduced failure

The [read-only diagnostic](../../../../scripts/diagnose_im03_gate.py) drives actual
reconstruction on the signed `0022500007` fixture and requires identical retained
game content. It reproduces 104 possessions per side versus estimates 107.88 and
107.40, deltas −3.88 and −3.40, in under one second.
[Fixture proof](fixture-replay.json) retains the hashes and decomposition.

```bash
.venv/bin/python scripts/diagnose_im03_gate.py
# Exit 1: gate_passed=false. A passing gate returns 0.
.venv/bin/python scripts/diagnose_im03_gate.py --coverage
# Exit 1: 3,736 within two / 7,802; 4,066 outside two.
```

Both commands are network-free and leave datasets and evidence untouched.
`--output <new-path>` retains append-only evidence. Hash/accounting corruption
raises an error separately from the expected exit 1 for the blocked gate.

## Source-backed counterexample

[Source replay](replay_source.py) rehashes the selected archive and retained
player/team box receipts, normalizes/orders the actual rows and invokes
`build_impact_game`. It reproduces the entire sealed `0022400001` game exactly.
[Final proof](source-replay-final.json) retains hashes, box lineage and event
locators/descriptions for three continuing Atlanta possessions.

```bash
.venv/bin/python docs/evidence/im03/gate-diagnosis/replay_source.py
# Source replay exact: 0022400001, 3 continuing Atlanta possessions
```

Atlanta has 99 counted possessions, FGA 99, FTA 13, player ORB 19 and box turnovers
16. These factor totals agree with the independent box. The estimate is
`99 + 0.44 * 13 - 19 + 16 = 101.72`; the delta is −2.72. The retained public
pbpstats comparison also counts 99, as already measured in IM03.

| Period / ordered event range | Source sequence | Count | FGA | Player ORB | Contribution to delta |
| --- | --- | ---: | ---: | ---: | ---: |
| 2 / 186–193 | Mathews miss, Hawks team rebound, Daniels miss, Horford rebound | 1 | 2 | 0 | −1 |
| 2 / 195–201 | Wallace miss, Capela rebound, Capela miss, Hawks team rebound, Nance make | 1 | 3 | 1 | −1 |
| 4 / 372–377 | Johnson miss, Hawks team rebound, Johnson miss, Hauser rebound | 1 | 2 | 0 | −1 |

The team rebounds retain Atlanta's control. The agreed method counts each
sequence once and excludes team rebounds from player ORB. Non-FT possessions
contribute −3; FT-containing possessions contribute +0.28, yielding exactly −2.72.
Reclassifying these continuations as new possessions contradicts the retained
events and method. One such team-game keeps an all-team-game ±2 gate open. Other
discrepancies and boundaries are not presumed explained or correct.

## Whole-population accounting

[Accounting proof](accounting.json): all 3,901 game bodies rehashed and matched
to the signed IM03 report, candidate hashes and game IDs. Every team delta
reconciles exactly using Decimal arithmetic:

`sum(counted - FGA + player ORB - PBP TOV - 0.44 * FTA)`
`- (PBP ORB - box ORB) + (PBP TOV - box TOV)`.

| Accounting term | Sum across 7,802 team-games |
| --- | ---: |
| Counted records without FTs | −17,496.00 |
| Counted records with FTs | −3,324.36 |
| Noncount records | −2,259.84 |
| Player ORB box correction | +7.00 |
| Turnover box correction | +5,835.00 |
| Total | −17,238.20 |

These are accounting categories, not fitted corrections or causal attributions.
The non-FT category is not assumed to consist only of team rebounds. FT weighting
alone does not explain the aggregate deficit; turnover-box differences offset
part of it in aggregate.

The prior **3,736 / 7,802 (47.885%)** within-two result reproduces exactly.
Of **2,433** comparisons with exact retained public-group agreement, **1,171**
still fail ±2. Public agreement remains a diagnostic, not an official oracle or
waiver. No playoff/2025–26 agreement is inferred.

## Validation and disposition

[34 reconstruction/repair tests](targeted.log), repository [Ruff](ruff.log),
[formatting](format.log) and [strict mypy](mypy.log) pass (189 source files).
No production source, warehouse model, migration, dashboard, admission or pointer
change was made. Full PostgreSQL/dbt suites were not rerun for read-only scripts
and evidence; preceding IM03 results remain historical.

`source-replay.json` is a development receipt from before adding the optional
output argument; `source-replay-final.json` binds the final script.

No compliant reconstruction fix is demonstrated. IM03 stays
`verification_blocked`, all six datasets stay `candidate`, and IM04 stays planned.
Proceeding to fitted ratings requires new owner direction on the dependency or
conservation contract; none is inferred.
