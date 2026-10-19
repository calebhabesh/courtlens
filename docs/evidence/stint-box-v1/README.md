# Stint box v1: measured evidence

Built 2026-10-19 for alignment row 13 (Stat Line Shift), instruction 4. Contract:
[stint box v1](../../design/stint-box-v1.md). Consumer: [shared-floor v2](../../design/shared-floor-v2.md).

## Build

`python -m courtlens.evaluation.stint_box_runner --receipt docs/evidence/stint-box-v1/receipt.json`
([log](build.log), [receipt](receipt.json), receipt content hash
`ce33a46795a5fe6ba4932b36a9d0ee78c2862825544d85f958fb73263de9ea46`), 202.5 s, over the six
accepted IM03 bundles and the verified IM01 archive observation. Artifacts are content-addressed
under `data/derived/stint-box-v1/` (30 MB); the serving manifest is
`manifest/1badc23c325051d543d9c730ca068b84038777fea2b2432a83c1a304cb79523e.json`, pinned as
`stint_box_manifest` in `src/courtlens/config.py`.

## Replay proof

All **3,901** games: every one of the 202,063 sealed stints' replayed player points equals its
sealed `player_stats_json` points exactly (the build fails otherwise). An earlier 25-game trial per
bundle (150 games) passed the same proof.

## Conservation

Known team-games per field (a field is known for a team in a game only when every player's stint
totals equal the independent box score). Points and all shooting fields are known in every
team-game.

| Season | Phase | Games | Team-games | AST | OREB | DREB | TOV | Unresolved assists |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 2023-24 | Regular season | 1,216 | 2,432 | 2,426 | 2,428 | 2,430 | 2,427 | 5 |
| 2024-25 | Regular season | 1,212 | 2,424 | 2,415 | 2,423 | 2,421 | 2,421 | 5 |
| 2025-26 | Regular season | 1,227 | 2,454 | 2,447 | 2,454 | 2,449 | 2,452 | 5 |
| 2023-24 | Playoffs | 81 | 162 | 162 | 162 | 162 | 162 | 0 |
| 2024-25 | Playoffs | 83 | 166 | 166 | 166 | 166 | 165 | 0 |
| 2025-26 | Playoffs | 82 | 164 | 164 | 164 | 164 | 164 | 0 |

Every field is known in at least 99.6% of team-games. The misses are source disagreements between
play-by-play and the box score (for example one assist credited to a different teammate), kept in
each artifact's `mismatches` and read as unknown for that team and game.

## Database admission

The six IM03 bundles were admitted to the owner database on 2026-10-19 with the shared population
orchestrator (`python -m courtlens.ingestion.impact_population --populate --bundle …`), each in one
transaction, all `ready`, none reused: 2023-24 RS `d8818faf-…`, then `d70e9294-…`, `94f2d551-…`,
`32c11e18-…`, `6c00e7ff-…`, `ded57101-…`. Every bundle's code and contract hashes matched before
writing. No publication pointer changed.
