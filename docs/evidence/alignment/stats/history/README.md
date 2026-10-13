# Stats history back to 2000-01 — 2026-10-13

Owner instruction 43 ("Databallr is able to have this data, so should we") and the photo follow-up.

## What changed

| Piece | Before | After |
|---|---|---|
| Box-score seasons | 2023-24 – 2025-26 | **2000-01 – 2025-26** (26 seasons; 2026-27 schedule only) |
| Published dataset | `17251a08…` (104,533 player rows) | `95ae85f8…` (882,849 player rows, 66,900 team rows) |
| Release | `5bbb6035…` | `23be18f9…` (earlier releases retained for rollback) |
| DARKO dated boards | 6 (3 seasons × 2 phases) | **52** (26 × 2), bundle `0c9163ac…` |
| Estimated positions | 3 seasons | **26 seasons**, artifact `1f8c19f2…` |
| Player photos | 1,475 | **1,835 of 2,733 players** (the other 898 only have the CDN silhouette: initials) |

Source: the same free SportsDataverse release files the current seasons use (box scores, team box
scores, schedules; about 6 MB per season). DARKO: darko.app dated `asof` leaderboards at each
phase's last admitted game date. Photos: NBA CDN headshots.

## Guarantees checked

- **Current seasons unchanged.** 2023-24 – 2025-26 player rows in the new dataset are identical to
  the old one (`EXCEPT` both ways: 0 / 0 rows). Stats API answers for three current scopes differ only in
  release metadata; the default page still opens on Jokić, Wembanyama, Leonard with DARKO through
  Apr 12, 2026.
- **DARKO sealed seasons verbatim.** New `refresh-darko --carry-forward` (default) copies the
  configured bundle's other seasons byte for byte; the 6 sealed entries are identical in the new
  bundle. All 46 new boards succeeded and match each phase's last game date (for example 2000-01
  regular season Apr 18, 2001; playoffs Jun 15, 2001).
- **Positions sealed verbatim.** New `--extend-from` applies the sealed run's frozen scaler and
  coefficients (no refit) and first re-scores all 1,723 sealed player-seasons: every label must
  reproduce or nothing is written. Retraining instead would have relabelled 57–77 current players per
  season, so it was rejected. 11,096 historical player-seasons added.
- **Game counts match the league.** 1,189 games (29-team seasons), 1,230 (30 teams), 990 (2011-12
  lockout), 1,059 (2019-20), 1,080 (2020-21), 1,229 (2012-13; the Celtics–Pacers game cancelled
  after the Boston Marathon bombing).
- **Spot checks:** Iverson 2001-02 60 GP 31.4 PPG, Kobe 2005-06 80 / 35.4, LeBron 2012-13 76 / 26.8,
  Stackhouse 2000-01 80 / 29.8. DARKO: Shaq 2000-01 +7.6, LeBron 2008-09 +8.7, Curry 2015-16 +8.0.

## Parser fixes found by the backfill (workbench parser v3, now part of dataset identity)

- `person_id` 0 placeholder rows (10, 2000-01 to 2002-03) are quarantined instead of becoming a
  "player 0".
- One 2003-04 game (`0020300778`, NOH–WAS) records whole minutes ("26"); they now parse as 26:00, so
  2003-04 has all 1,189 games.
- The parser version is now folded into dataset membership, so a parser fix yields a new dataset;
  a re-parse of identical raw files reuses the retained artifact.
- Photos: the CDN answers 200 with a grey silhouette for players it has no photo of (and for ids
  that do not exist). Those are rejected; 17 cached silhouettes were set to `placeholder`.

## Known limits

- The existing impossible-clock rule ("41:60") still quarantines about 60–90 player rows per season,
  old and new alike (for example one Shaq game in 2000-01: 73 GP shown, 74 in the source). Those games
  are unknown, not zero. Loosening it would change current seasons and is not part of this block.
- Team codes are the season's own (SEA, NJN, VAN, CHH, NOH, NOK); the Select Team grid lists the 30
  current teams.
- Not yet done (catalog 43e–g): multi-season mode, PBP-derived impact (RAPM, on/off, six factor) for
  added seasons, draft classes before 2000, and tracking-era columns before 2013-14, which stay
  unknown.

Screenshots (live API via the running dev server): `stats-2000-01-1440.png`, `stats-2000-01-390.png`,
`stats-2015-16-playoffs-1440.png`, `stats-2025-26-1440.png`.

Verification: full Python suite 2,058 passed (1 skipped), then the affected unit tests (67) after
the final parser and position edits; strict mypy (241 files) and Ruff clean; dbt build 93/93 on the
published dataset; no page errors at 1440 or 390.
