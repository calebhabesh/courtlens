# Stint box v1

Identity `courtlens-stint-box-v1`. Implemented 2026-10-19 for alignment row 13 (Stat Line Shift),
instruction 4. Parents: [IM03 event acceptance](../evidence/im03-event-gate/README.md),
[impact possession method v2](impact-possession-method-v2.md),
[shared-floor v2](shared-floor-v2.md).

The accepted IM03 stints carry per-player **points only**; shots, free throws, rebounds and
turnovers are stored per team per stint. This derivation adds a per-player box to every accepted
stint without changing any sealed dataset, bundle or method file.

## Method

For each accepted game, `src/courtlens/domain/stint_box.py`:

1. Normalizes the selected source's rows with the same `normalize_events` IM02/IM03 used and
   aligns them, in order, to IM02's ordered event lineups (`candidate.event_lineups`). Any change
   in an event's source locator fails the game.
2. Assigns every event to its sealed stint: starting from the previous event's stint, the first
   stint in the same period whose lineups equal the event's lineups and whose clock range contains
   the event. This is the IM03 builder's own rule read forward.
3. **Replay proof.** The replayed player points of every stint must equal the sealed stint's
   `player_stats_json` points exactly, or the build fails.
4. Credits each event's actor in that stint:
   - shots: `fga`, `fgm`, `fg3a`, `fg3m`, `points`; free throws: `fta`, `ftm`, `points`;
   - assists: IM05's `assist_actor` (explicit CDN `assistPersonId`, a unique matching CDN row, or
     the v3 description's single same-team name); an unresolvable made-shot assist marks the
     team's `ast` unknown for the game;
   - rebounds: individual rebounds only (team rebounds have no player). Offensive or defensive
     comes from the CDN `subType`, else the v3 description's cumulative `(Off:x Def:y)` counters,
     else the team of the preceding missed shot or free throw in the period; none of these marks
     the team's rebounds unknown for the game;
   - turnovers: individual turnovers only (team turnovers have no player).
5. **Conservation.** For each team and field, the field is *known* for that game only if every
   one of the team's box-score players' stint totals equals the independent SportsDataverse box
   (`points`, `field_goals_*`, `three_pointers_*`, `free_throws_*`, `rebounds_offensive`,
   `rebounds_defensive`, `assists`, `turnovers`). Otherwise the field is unknown for that team in
   that game; mismatches are retained in the artifact.

Steals, blocks and fouls are not derived; they stay absent and read as unknown.

## Reading it

A known field for an on-floor player with no events in that stint is a known zero, because the
game's totals conserve. An unknown field is absent, never zero. The shared-floor operation reads
the artifact matching the stint dataset's bundle (`bundle_content_sha256`) and drops a stint from
a metric when any field that metric needs is unknown (usage needs all five players' `fga`, `fta`
and `tov`).

## Artifacts

`python -m courtlens.evaluation.stint_box_runner --receipt <path>` writes one content-addressed
artifact per bundle to `data/derived/stint-box-v1/<sha256>.json`, binding the bundle hash, this
contract's hash, the code hashes and the IM01 archive observation. The receipt records known
team-games per field, unresolved events and box mismatches. Receipt and measured counts:
[evidence](../evidence/stint-box-v1/README.md).
