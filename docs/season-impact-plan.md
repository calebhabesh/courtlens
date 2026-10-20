# Weekly current-season impact numbers

Status: SI01–SI04 built and verified on 2025-26 inputs, SI05 built; first real run waits for the
start gate (about mid-November). Owner approved the weekly recompute and the provisional storage
rule below on 2026-10-20 ("Sounds good go ahead"). Builds on the
[impact metrics handoff](impact-metrics-plan.md) (IM01–IM07, sealed for 2023-24 to 2025-26) and
the daily statistics release ([source policy v3](design/source-policy-v3.md), "Daily season
statistics"). Plans are not runtime evidence.

## What exists

RAPM, BPR, on/off, six-factor and the Defense/Advanced extras come from a one-time, per-season
pipeline:

1. **IM01 archives**: Shufinskiy's `nba_data` tarballs (`nbastatsv3`, `cdnnba`, `matchups`,
   `shotdetail`), pinned by revision and hash. Updated about monthly last season (latest
   2026-07-17), so they cannot drive a weekly refresh.
2. **IM02 candidates**: per-game reconstruction, with arbitration between the `nbastatsv3` and
   `cdnnba` event streams and versioned repairs; an accepted report pins every input hash.
3. **IM03 population**: possessions, stints and stint players sealed as a `courtlens-impact`
   dataset per season and phase (about 900 MB for a regular season). Database triggers make
   these datasets append-only: they can never be deleted.
4. **IM04/IM05 fits**: ridge RAPM/BPR and extras into hashed rating artifacts.
5. **Serving**: `scripts/build_impact_serving.py` projects accepted artifacts into
   `data/derived/impact-serving-v1/<sha>.json`, pinned by `config.impact_serving_manifest`
   and `deploy/pinned.env`; team splits, WOWY, stint box and value archetypes are separate
   bundles keyed by season.

## Measured constraints (2026-10-20)

- hoopR's raw repository republishes every game's `playbyplayv3` daily
  (`nba_stats/json/playbyplayv3/<end year>/<game id>.json`). On game 0022500001 it has the same
  611 rows and the same 23 columns as the `nbastatsv3` archive (which adds `gameId`), so the
  primary event stream can be rebuilt daily the way box scores are.
- `boxscorematchupsv3` is also there per game (matchups); shot detail is not yet checked.
- `cdn.nba.com` live play-by-play answers our client with 403 (Akamai, like the rest of
  nba.com), so the second event stream is unavailable in season. The contract's
  "independent" checks are a separate parse of the same rows, so they still apply; games whose
  repair needs the CDN stream are excluded and counted, not guessed.
- One regular season's impact rows are about 900 MB. Sealing a new `courtlens-impact` dataset
  every week would add about 11 GB per season that the triggers forbid deleting.

## Storage rule (owner approved 2026-10-20)

**Provisional current-season impact datasets.** Weekly runs seal their possessions and stints
under a new namespace, `courtlens-impact-provisional`, which the append-only triggers do not
cover. The newest two are kept and older ones are retired, like daily statistics releases.
After the season ends, one final run is sealed as an ordinary `courtlens-impact` dataset and
becomes permanent. Historical impact datasets and the trigger stay exactly as they are.

Without this, the options are monthly runs (about 5 GB a season that can never be deleted) or
serving current-season impact numbers without sealed possessions (not traceable).

## Blocks

| Block | Scope | Done when |
| --- | --- | --- |
| SI01 Daily inputs | Extend `refresh-season-stats` to retain each final game's `playbyplayv3` and `boxscorematchupsv3` (pinned, rechecked for 3 days); flatten into the archive CSV columns. | Flattened rows equal the 2025-26 `nbastatsv3` and `matchups` archives on sampled games, including playoffs. |
| SI02 Single-source candidates | IM02 candidate and arbitration path with `nbastatsv3` only; games needing the CDN stream are excluded with a reason. | On 2025-26, re-running with the CDN stream withheld reports the clean/patched/excluded rates; accepted games reproduce their sealed candidates. |
| SI03 Provisional population | Namespace, retirement (`retire_dataset` analogue for impact rows) and the season-end promotion. | Postgres integration test: a provisional dataset retires; a `courtlens-impact` one still refuses. |
| SI04 Weekly fit and serving | `refresh-season-impact` (weekly timer, Monday 14:30 UTC): population, IM04/IM05 fits for the current season only, then a serving bundle that carries sealed seasons verbatim and the current season with `provisional: true`; `impact_serving_manifest` serves the newest bundle in its directory (as DARKO does). Team splits, WOWY and stint box follow. | Stats impact columns, player cards and Teams show 2026-27 values labelled provisional; sealed seasons are byte-identical to before. |
| SI05 Start gate and disclosure | First run once every team has 10 games (about mid-November); coverage, patch rate and "as of" shown wherever current-season impact appears. | Browser checks at 1440 and 390; docs and progress log updated. |

## Not in scope

The CDN event stream (blocked), shot detail if hoopR lacks it (the extras that need it stay
unavailable for 2026-27 and say so), and any change to sealed 2023-24 to 2025-26 numbers.

## Progress (2026-10-20)

Code that sealed seasons pin by hash (`impact_population.py`, `impact_repair_audit.py`, the
`domain/impact_*` and `possession_repair.py` modules, the IM04/IM05 runners) is imported, never
edited; the provisional path lives in `ingestion/season_impact.py`,
`evaluation/season_impact_fits.py` and `services/season_impact.py`.

- **SI01**: `refresh-season-stats` now also retains `playbyplayv3` and `boxscorematchupsv3` per
  final game (pinned, 3-day recheck) and writes the season's `retrieval-manifest.json`.
  `playbyplay_rows` equals the `nbastatsv3` archive on 16 games / 8,193 rows (0 differences);
  `matchup_rows` has the archive's columns, order and pairings (values differ only where the NBA
  revised matchup tracking later, 7 of 12 games).
- **SI02**: single-source candidates on 60 sampled 2025-26 games: 55 clean, 4 patched,
  1 excluded (0022501054, which the sealed run rescued with the CDN stream). In the sealed
  2025-26 run 47 of 1,227 regular-season and 2 of 82 playoff games needed the CDN stream, so
  expect about 4% exclusions. The 59 admitted games' stints and possessions equal the sealed
  ones in every value; only provenance differs (source hashes, row indexes, candidate hash, and
  the clean/patched label, since IM02-R6 records CDN disagreements).
- **SI03**: `populate_provisional` sealed the 59-game bundle on Postgres in 5.5 s (11,830
  possessions, 3,375 stints, 33,750 stint players); a repeat reused it; `retire_provisional`
  deleted every row; deleting sealed `courtlens-impact` rows still raises.
- **SI04**: `refresh-season-impact` end to end on that sample, three weekly cycles: provisional
  dataset, ratings (1Y/2Y/3Y windows, about 60 s), extras (29 of 38 columns with values; the
  nine play-type/shot-zone columns need shot detail), team splits, WOWY cohort and stint box;
  each served directory's `.current` moved and the oldest weekly bundle was pruned and aliased.
  Serving and team-split bundles rebuilt from sealed evidence are byte-identical after the
  projection moved to `evaluation/impact_serving_build.py`. Configs now name directories
  (`services/served_bundle.py`); a file still pins one, as `deploy/pinned.env` does for the VPS.
- **SI05**: start gate (every team 10 games; `--force` overrides), `provisional` in the impact
  response and a Provisional badge and note in the impact disclosure (Vitest). Browser checks
  with real 2026-27 values wait for the first run.

Weekly growth, measured on the sample: a served bundle is about 58 MB (sealed 47 MB) and three
are kept (sealed origin, previous, current); working files keep only what kept bundles cite;
reconstructions are content-addressed (about 75 MB a season). The raw per-game documents
the daily run retains are larger: about 20 KB of box score, 300 KB of play-by-play and 150 KB of
matchups per game, roughly 0.6 GB a season, kept like other raw acquisitions.
