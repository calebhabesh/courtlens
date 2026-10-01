# SportsDataverse NBA Stats source admission spike report

**Date:** 2026-10-01. **Execution time:** 4.73 seconds. **Status:** Admitted.

## Summary of source admission

This report records the verification and quality admission checks for SportsDataverse NBA Stats bulk releases and raw NBA schedules under Milestone P1. All raw downloads are locally content-addressed, SHA-256 verified, and append-only stored in `data/raw/`.

## Admitted seasons and assets

| Season | Ending year | Player boxscores | Team boxscores | Schedule | Total games | Distinct players | Reconciled points |
| --- | ---: | --- | --- | --- | ---: | ---: | ---: |
| 2021-22 | 2022 | 33,784 | 2,646 | 1393 games | 1,323 | 620 | 59 errors |
| 2022-23 | 2023 | 33,959 | 2,640 | 1394 games | 1,320 | 548 | 58 errors |
| 2023-24 | 2024 | 34,771 | 2,638 | 1396 games | 1,319 | 586 | 57 errors |
| 2024-25 | 2025 | 35,057 | 2,642 | 1400 games | 1,321 | 577 | 49 errors |
| 2025-26 | 2026 | 34,705 | 2,644 | 1400 games | 1,322 | 591 | 74 errors |
| 2026-27 | 2027 | N/A (empty before opener) | N/A | 1274 games | 1,274 (scheduled) | 0 (unobserved) | Pending season opener |

## Capability evaluation

1. **Recent completed regular seasons (2024-25 and 2025-26):**
   - Downloaded and verified byte streams without API keys or authentication.
2. **Quarantine and point reconciliation:**
   - 100% of team outcomes have matching opposing sides (1322 games in 2025-26, 1321 in 2024-25).
   - Across all seasons, the only quarantined player rows are upstream unnormalized `XX:60` seconds formatting (e.g., `30:60`, `0:60`, 81 rows in 2025-26), quarantined by CourtLoad's strict seconds 0-59 parser.
   - When quarantined rows are excluded, the remaining player point sums in those 74 games fall short of team points by exactly the quarantined player's points. In all other 1,248 games, player points reconcile 100% to team points.
   - Team outcomes remain valid for team research because team and player quality contracts are separate.

2. **Current season schedule (2026-27):**
   - Sourced from raw NBA Stats schedule mirror `scheduleleaguev2/2027.json`.
   - Contains 1,274 scheduled entries: 67 preseason, 1,206 regular, 1 cup final.
   - All games have `gameStatus == 1` (scheduled). All scores are placeholder zeros.
   - Current outcomes are empty prior to the season opener (Oct 20, 2026).

3. **Preseason capability:**
   - Preseason schedules are available and verified.
   - SportsDataverse player boxscore releases currently lack preseason player boxes.
   - Preseason is marked `schedule_only` in this release.

4. **Rosters and player identity:**
   - NBA `person_id` matches official NBA Stats IDs across all seasons.
   - Current active association derived from latest observed participation.

## File inventory and hashes

```text
Season 2022 (2021-22):
  player_boxscores: 5948782 bytes, SHA-256: 8d2960d33fd0a9c787f00da915ccb74419d5d46e2d7dddf05a9d93ed9f9f6b40
  team_boxscores: 357011 bytes, SHA-256: af46dd3d3e6c73c29b3747c4a1fdbf3d911296118036365153a8dfedd4891c17
  schedule: 22779 bytes, SHA-256: fab3ed1ce98f0407651add307607280520da770cc98c2931009d6449fa12c2f0
Season 2023 (2022-23):
  player_boxscores: 5984106 bytes, SHA-256: 33bd3f9813429d2f3a57e4453196e734b5ddcc99c7e1be09c4a616cfd1ea628d
  team_boxscores: 356373 bytes, SHA-256: 526d1eb44860eb6612383588dc3018b5bebe5b5afc8246b28f0d0ec56d1c2348
  schedule: 22828 bytes, SHA-256: ef6fb13bfd82ddaac2b2898b967fefa4e0448b5a3c7f5c1c16e3d1414a194b8a
Season 2024 (2023-24):
  player_boxscores: 6146662 bytes, SHA-256: 7a2a57f37309a067d77fd3acd72b70aeb71366006b41e8c9a3544c4f7ea03e27
  team_boxscores: 356488 bytes, SHA-256: d48c29dabcfecb4d746c663ab2ccdb925c60242bac1a0381a4fbe49fc1020ff2
  schedule: 22876 bytes, SHA-256: 2b0a6eea3292c224771c702ba26813294cfd6dab7996f1d6f5d3d2b0b630c250
Season 2025 (2024-25):
  player_boxscores: 6191431 bytes, SHA-256: 71645d3569e0c0a94e51d136c6454f20d59d70f4b518c62c6bbbdb9e905cb7c0
  team_boxscores: 357762 bytes, SHA-256: 5c426deb97a203492070e03bd40040a6b1180c243986a6ed26abfc78bb942268
  schedule: 22929 bytes, SHA-256: 639e8145a750b80a4394d2e7044545019bcc0e39a979618c7ff9edbfcac02c9b
Season 2026 (2025-26):
  player_boxscores: 6131057 bytes, SHA-256: decaee33440ec8bd26d21152d61b4b69970bed45c3d07ede42f2700b7bd364e7
  team_boxscores: 358439 bytes, SHA-256: b5133e5602d1ab9c4a4b4240aced7af3b6587e124f7ab7335b5de961c897ade8
  schedule: 23071 bytes, SHA-256: c1ff3711ef8b8ec4310c60159d1225a400facc7ce1e29bc64f09ae4130496509
Season 2027 (2026-27):
  raw_schedule_json: 2904298 bytes, SHA-256: 018786b1b1d33cb705ee14b7d7c354755ddfc17c9664ee3a1fe017d814327d96
```

## Conclusion

SportsDataverse NBA Stats releases satisfy all data quality and temporal criteria. The datasets are accepted for Milestone P1 and ready for database staging in P2.

