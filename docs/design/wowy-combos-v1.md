# WOWY combos v1

`courtlens-wowy-combos-v1`, alignment row 5 (owner, 2026-10-25). Serves `/wowy`.

## Endpoint

`GET /api/workbench/operations/wowy-combos`. Read-only, so it needs no entry in the hosted
demo's Caddy allowlist. Every parameter is a query field of `WowyCombosRequest`
(`src/courtlens/domain/wowy_combos.py`). Lists repeat the key (`combo=1&combo=2`).

- With no team, it returns only the admitted stint scopes.
- With no season, it uses the latest season with admitted stints.

## Inputs

The input is a team's accepted IM03 stints for one season and phase, read with
`load_floor_rows(..., detail=True)` (shared-floor v2 acceptance). One stint is one team side.

- **Combo** players (up to 5) split the filtered stints into every on/off mix, 2^n cells in truth-table
  order: all on first, then counting down with the last combo player toggling fastest (for two:
  both, first only, second only, neither), whatever the minutes. Players keep their order from
  the request, so each has a fixed photo column. **On** and **Off** players hold for every cell. A player has one role.
- **Dates** are inclusive and inside the season.
- **Game clock**: full game; 1st half (Q1–Q2); 2nd half + OT (period ≥ 3); Q1–Q4; OT (period ≥ 5);
  last 5 of Q4 + OT; or custom (periods, plus a window in minutes remaining). Stints never cross
  periods, so period filters are exact. Inside a period, a stint counts when its midpoint
  lies in the window. Nothing is prorated.
- **Garbage time** (exclude toggle): a fourth-quarter stint that starts with a margin of 25+
  points with 12:00–9:00 left, 20+ with 9:00–6:00, or 10+ under 6:00. Overtime never counts.
- **Common games**: games in which every selected player (combo, On, Off) logged a stint.
- **Opponents**: picked teams, or a tier (top 10, mid 10 or bottom 10) by ORtg, DRtg (low is
  best) or net, from the scope's six-factor team ratings. Ranks are league-wide, and the team
  itself is left out of its own list.
- **Player vs player**: an opponent team and player, either on the floor, off it, or *split*.
  Split adds the player as one more on/off dimension and takes one of the five combo slots.

## Outputs

Each cell has these fields:

- Minutes, games, stints and possessions at each end.
- ORtg / DRtg / Net per 100 possessions, with a 95% game-cluster interval on net.
- Four factors at both ends, plus 3P% and 3PA rate.
- A sample status under the shared-floor gates (100 possessions each way, 5 games).

Rates sum numerators and denominators over the stints where every field the rate needs is
recorded. A field unrecorded in a game is left out, never counted as 0. Turnover rates use player
turnovers; team turnovers are not attributed to stints.

Each combo player gets an On − Off shift computed inside the same filters. Its differences show
only when both sides pass the gates. `league_rating` is the scope's pooled league ORtg (equal to
DRtg) from the six-factor ratings; the page reads each cell's ratings against it, as Databallr does.
`league_factors` holds the pooled league TS%, turnovers per 100 possessions, ORB% and 3P% for the
composition dialog, read against each cell's `ts_pct` / `opp_ts_pct`, `tov_100` / `opp_tov_100`,
`oreb_pct` / 100 − `dreb_pct` and `fg3_pct` / `opp_fg3_pct`.

Each cell also lists its `teammates`: every player other than the combo players, with their
minutes and share of the cell's minutes. `teammate_help` is the minutes-weighted average DARKO
(DPM, ODPM, DDPM) of those teammates, from the sealed DARKO rating for the scope's season and phase
(`darko_as_of`). Unrated teammates are left out, and `coverage` gives the rated share of teammate
minutes. It is context, not an adjustment of the cell's ratings.

`input_hash` covers the filtered stint facts; `evidence_hash` covers the request, input hash, cells
and shifts. Everything is descriptive, not causal impact or RAPM.
