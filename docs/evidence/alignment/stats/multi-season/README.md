# Stats multi-season mode — 2026-10-13

Owner instruction 43e ("Yes, add it"): Databallr's Single season / Multi-season picker.

## Behaviour

- The season control on Stats opens a popover: **Single season** (one select, newest first) or
  **Multi-season** (From, Through, quick ranges **5Y / 10Y / 15Y / 25Y**, "Show N seasons").
- URL: `season` stays the Through season (it owns the cutoff and phase coverage); a range adds
  `seasonFrom`. Old links without `seasonFrom` are unchanged.
- In range mode the stepper arrows move the whole window one season (10Y 2016-17 – 2025-26 →
  2015-16 – 2024-25).
- Rows are one line per player over the range: totals, per-game over every game, every team played
  for, and the position from the player's latest estimated season inside the range. The identity
  line reads "2016-17 – 2025-26".
- DARKO, tracking and impact fits are per season, so they stay unknown in a range (the existing
  backend guards already refused them); the DARKO credit reads "unavailable in this scope" and the
  Overview default sort falls back from DPM to points. An explicit DPM sort is dropped when a range
  is applied.
- Percentiles compare against qualified players (500+ minutes) over the same range.

## Backend

- Stats presentation accepts a season range that ends at the query season, with at most 30 distinct
  seasons (`MAX_SEASON_RANGE`); anything else is a 422.
- Cohort and percentile reference bounds raised from 2,000 to 4,000 players (every player since
  2000-01 is about 2,900).
- Speed: each game row's JSON stats are parsed once (an `OFFSET 0` fenced subquery) instead of once
  per field. SQL alone: 1 season 0.93 → 0.63 s, 5 seasons 2.2 → 1.4 s, 25 seasons 9.0 → 5.0 s. The
  percentile reference now reuses the page's cached cohort instead of re-running the aggregation.
  Cold API, 25 seasons: 35 s → 12 s (0.4 s cached); one season 3.6 → 2.1 s.
- Equivalence: six scopes (single season, playoffs, last 10, team filter, name search, 5-season
  range), with and without presentation, are byte-identical to the previous SQL; table percentiles
  are identical for four scopes (single-season scope hashes unchanged).

## Verification

Python: new unit tests (range guard, range positions) and a PostgreSQL case proving a range equals
the sum of its seasons with DARKO unknown; Postgres presentation suite 21/21; strict mypy clean.
Dashboard: lint, typecheck, Vitest 458 (new `season-range.test.ts`). Browser: Stats specs, visual
baselines and native-select specs pass on HEAD plus this change alone (built from the staged tree,
excluding the parallel control-uniformity session's uncommitted edits); only the two picker popup
snapshots changed, the Stats page baselines did not.

Screenshots (live API): `picker-single-1440.png`, `picker-multi-1440.png`, `stats-10y-1440.png`,
`stats-5y-390.png`, `picker-390.png`. They were taken on the shared working tree, so they also show
the other session's in-progress control styling.
