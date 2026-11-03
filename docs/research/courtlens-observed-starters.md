# Observed starting-lineup evidence for the prototype

The earlier prototype incorrectly selected the highest DARKO five and called them Estimated Starters. That did not implement Databallr's positional optimizer and did not identify real starts. It caused Josh Minott to appear in Boston's first five.

Databallr's published client instead optimizes a position-balanced model-rated five. Its `bench` is everyone unselected, ordered by minutes. It does not consume observed starts. See [the primary-code investigation](databallr-starters-method.md).

CourtLens already retains source evidence: NBA box-score `position` values, mirrored in admitted sportsdataverse CSVs. The existing production `services/starting_positions.py` uses G/F/C as starter evidence. The normalized team endpoint does not expose start counts, but that is a serving gap rather than missing source data.

## Prototype method

`build-starter-evidence.py` reads the pinned release catalog, opens PostgreSQL with `SET TRANSACTION READ ONLY`, verifies the raw content hash against the immutable dataset, and joins source positions to admitted player-game and team-game facts. It writes only a content-addressed artifact inside this sandbox. There are no new downloads, source writes, migrations or publication changes.

A team's game supplies verified evidence only if every appeared player has a raw row, all position fields are empty or G/F/C, and exactly five have a nonempty G/F/C starting position. Other games stay unknown. Counts never convert absent evidence to zero. The five-player unit is the most frequently observed actual starting unit for that team, season and phase before its cutoff. Ties choose the most recently observed tied unit, then a deterministic ID order. Other participants include both bench players and alternate starters, and are ordered by team minutes. Model values do not choose the five.

GS shows confirmed starts among verified games. `+` indicates additional appearances whose start status is unknown. G/F/C center roles come from the source unit; five-position labels beside player names remain the pre-existing estimates.

## Measured default scope

Pinned release `23be18f9-f989-4af1-9298-3742f1de82d1`, dataset `95ae85f8-e9e9-4a01-9752-4b6414f1e95f`, regular season 2025–26, games before April 13, 2026:

- Boston: 80 of 82 games have verified complete starter evidence. Its most-used actual unit started 15 times: Derrick White, Payton Pritchard, Jaylen Brown, Jordan Walsh, Neemias Queta.
- Oklahoma City: 81 of 82 games verified. Its most-used actual unit started 15 times: Shai Gilgeous-Alexander, Cason Wallace, Luguentz Dort, Chet Holmgren, Isaiah Hartenstein.
- Josh Minott has 10 confirmed Boston starts and 22 confirmed bench appearances, plus one appearance with unknown start status. Jayson Tatum has 16 confirmed starts. Neither belongs to Boston's most-used five for this full-season scope. This is a historical unit definition, not a current depth chart or injury-adjusted forecast.

The export contains 1,192 team-phase scopes across the retained 26 seasons. Its bytes are sealed in `starter-evidence.bf09e1d964030a116b25996df57e53b051f5f45500e0343781a9d7784bc3d563.json`. The loader requires matching release, dataset, team, season, phase, cutoff and all five players in the displayed cohort. A mismatch supplies no starter claim.

## Verification

`reproduce-starters.cjs` was red on the prior live preview: the first-five proxy included Josh Minott. `verify-observed-starters.cjs` checks exact membership against the sealed evidence, stability under metric/depth changes, separate playoff context, coverage/GS labels and the desktop/phone browser. Export and build logs and screenshots are retained in the sandbox. Production checkout remains untouched.

## Live read (2026-10-21)

The sealed file pinned one release, so the 2026-10-20 publication switched `By Position` off.
`services/starter_evidence.py` now applies the same method live (`GET
/api/workbench/teams/{id}/starters`). It reproduces all 1,192 sealed scopes exactly; the unit's
G/F/C labels are each player's most common label across the unit's starts. The sealed file moved
to `docs/evidence/alignment/team-compare/` as the reference it was checked against.

