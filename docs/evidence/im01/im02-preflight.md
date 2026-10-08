# IM02 dependency preflight — 2026-10-07

This is read-only preparation for the next block, not IM02 implementation or acceptance.
QA01 is still `planned` in the refresh progress log. Do not begin the repair policy or
warehouse population until its measured completion and IM01's shared verification gate clear.

## Existing boundaries to extend

- `services/possession_warehouse.py::record_reconstruction_override` is the required existing
  persistence path. It writes `WorkbenchReconstructionOverride` with original/replacement JSON,
  reason, author and optional period, event-order, team and player locators. There is no dedicated
  rule-ID column; a new versioned repair envelope can preserve that ID in the existing JSON
  rather than silently reinterpreting historical rows. It currently commits each override.
  Transaction semantics need review before bulk admission can bind overrides and memberships.
- `domain/stints.py` and `domain/rich_sources.py` retain `possession-policy-v1` behavior.
  The existing stint implementation applies starter overrides by `(period, team)` and lineup
  overrides by `action_number`. Archive event identity must retain source-row/order identity:
  historical B19 work already established that `action_number` can repeat.
- The existing `build_possession_warehouse_for_season` is the required IM03 orchestrator.
  It currently consumes previously persisted possessions/PBP and rebuilds successful stints
  using administrative deletion of old rows. IM03 needs an append-only versioned path, an
  explicit season/phase membership, quality flags and policy-specific outcomes; it must not
  re-run that replacement behavior against a sealed historical dataset.
- The older exposure helpers currently compare `game_date <= cutoff_date`. IM03/serving must
  establish exclusive-cutoff behavior for new IM contexts and test it without silently changing
  retained versioned results. Forecast feature construction remains independent of IM outputs.

## Retained real failures and independent inputs

The original B19d native evidence and raw observations are available under
`docs/evidence/b19d-native-baseline-probe/` and `data/raw/b19d-native-accepted-20261005/`.
The four candidate games are `0022500007`, `0022500013`, `0022500025` and `0022501045`.
Their baseline artifacts record the 23 period-starter disagreements required by IM02; the
`25:60` minute is recorded for player `1629130` in `0022500007`. Keep the old artifacts intact.
The first native probe reported unresolved substitution identity in `0022501045`; the later
baseline probe retains that game's resolved native reconstruction and starter discrepancies.
Use the actual source and method hashes for each example rather than conflating the probes.

The new impact archives have different column conventions:

| Input | Game ID field | Relevant source fields |
| --- | --- | --- |
| NBA Stats v3 | `gameId` | `actionId`, `actionNumber`, `period`, `clock`, `personId`, `teamId`, `description` |
| NBA CDN | `gameId` | `actionNumber`, `orderNumber`, `period`, `clock`, actor and assist/steal/block/drawn-foul IDs |
| Matchups | `game_id` | `person_id`, `matchups_person_id`, fractional possessions, exact/display minutes |
| Shot detail | `GAME_ID` | `GAME_EVENT_ID`, shooter/team, period/clock, shot result and coordinates |
| pbpstats | `GAMEID` | Possession clocks, period, FGA/FGM, turnovers, offensive rebounds, start type |

Independent SportsDataverse schedule and player/team box files already exist for ending years
2024–2026. The IM01 schedule receipts were newly fetched, separately hashed and phase-validated.
IM02 must explicitly bind the actual box observations used for minutes, plus-minus and source
arbitration; IM01 game availability alone does not certify those quantities.

The v3/CDN availability intersection covers every regular game. For 2025–26 playoffs it covers
only 60 of 85 games, while v3 covers all 85. IM02 must record unavailable cross-checks rather
than treating missing CDN rows as agreement. Matchup/pbpstats missing IDs are retained in the
IM01 acquisition report; they must not silently remove otherwise reconstructable games.

## Required measured next boundary

After QA01 clears, write `design/possession-policy-v2.md` before implementing the seven
deterministic rule families. Preserve both conflicting source values, actual source locators,
rule IDs and counters. Test real examples and adversarial cases per rule. Report per season
clean/patched/excluded games, every exclusion, and minutes/plus-minus agreement before IM03
can populate sealed possessions and stints. Do not infer success from this preflight.
