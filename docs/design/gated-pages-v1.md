# Gated pages v1 (PC11)

Contract for [PC11](../presentation-clarity-plan.md#pc11-populate-or-remove-gated-pages): every
former gate page is populated from data CourtLens already holds, or removed (C14). Code:
`src/courtlens/services/stats_feed_views.py`, `src/courtlens/domain/wowy.py`,
`src/courtlens/evaluation/wowy_runner.py`, `src/courtlens/services/wowy_serving.py`; dashboard
`components/{defensive-matchups,season-matchups,play-type-shooting,six-factor,combine,wowy,tracking-stats}-view.tsx`,
`components/player-feed-panels.tsx`, `components/charts/ranked-bars.tsx`, `lib/stats-feeds.ts`.

## Verdicts

| Page | Route | Verdict | Data |
| --- | --- | --- | --- |
| Defensive Matchups | `/research/defensive-matchups` | Populated | `mart_stats_player_defense`, `mart_stats_player_hustle`, `mart_stats_season_matchups` |
| Player Matchups | `/matchups` | Populated (was `source_blocked`) | `mart_stats_season_matchups` |
| Playtype-adjusted shooting | `/research/shooting/adjusted` | Populated | `mart_stats_player_play_types` |
| Six-Factor RAPM | `/research/rapm/six-factor` | Populated | sealed IM04 factor coefficients (impact serving bundle) |
| Combine & Wingspan | `/wingspan` | Populated (hand-entered seed rows retired) | `mart_stats_draft_combine`, `mart_stats_draft_history` |
| WOWY | `/wowy` | Populated (D4) | WOWY artifact derived from sealed IM03 stints |
| Tracking | `/stats/tracking`, player profile Tracking tab | Populated | `mart_stats_player_tracking` |
| Spatial EPV | `/research/epv` | **Removed**, redirects to `/research/rapm` | needs non-public frame-level tracking |
| Planner | `/planner` | **Removed from the hosted demo** | empty without a signed-in league |

## Shared rules

- **Read-only.** Every endpoint reads marts, sealed artifacts or the impact bundle. No GET writes;
  the legacy measurement reads no longer seed `workbench_player_measurements`.
- **Season totals stay apart.** NBA Stats feeds have no per-game dates, so they are served on their
  own pages and are never joined into date-windowed Stats queries or forecasting features.
- **Unknown is not zero.** A missing row, drill or value is null and renders as an em dash or a
  labeled unknown state. Observed-empty feeds (2025-26 playoff matchups) say so.
- **First load (C3).** Each page opens on real content with no URL parameters. A default subject
  is chosen by a fixed rule and labeled "Example: … · rule". Explicit URL parameters are kept.
- **Percentiles (C10).** Computed server-side and already oriented (100 = best) among qualified
  players in the same season and phase. Ties share the midpoint rank. Unqualified players get no
  rank ("Small sample"). Columns that describe style or volume (for example drive turnovers per game,
  rim makes allowed, pass rate) have `higher_is_better = null` and are not shaded.
- **Sample rules** (`QUALIFY`): regular season 20 games, 100 defended shots, 250 play-type
  possessions, 500 tracking minutes; playoffs 4 games, 20 shots, 40 possessions, 100 minutes.
- **Traded players.** Play-type rows are per team and are summed per player; tracking, defense and
  hustle rows are already one per player.

## Endpoints and definitions

All under `/api/workbench`. Season defaults to the latest observed; phase to regular season. An
unobserved scope is `404`; an unknown category or side is `422`.

- `GET /defense?season&phase&category&playerId`: per defender, defended FGA/FGM and FG%, the
  shooters' expected FG%, difference, **makes below expected = expected FG% × FGA − FGM**, contests
  and deflections per hustle game, charges, and season matchup exposure (minutes, partial
  possessions, points allowed per 100 partial possessions). Focus default: most makes below
  expected among qualified defenders. Categories: all shots, threes, twos, under 6 ft, under 10 ft,
  over 15 ft.
- `GET /season-matchups?season&phase&playerId&side=offense|defense`: who guarded a player, or whom
  they guarded, ordered by partial possessions (top 15). Default: most matchup possessions.
- `GET /play-types?season&phase&side=offensive|defensive&playerId`: league points per possession
  per play type from every listed row; per player, **expected = Σ possessionsᵢ × league PPPᵢ** and
  **adjusted per 100 = 100 × (points − expected) / possessions**. Defense ranks lower allowed first.
  Only the focus player carries the per-play-type breakdown. Default focus: most play-type
  possessions (a volume rule, not a result).
- `GET /tracking?season&phase&group`, `GET /players/{id}/tracking?season&phase`: eight curated
  groups (drives, catch & shoot, pull-ups, touches, passing, rebounding, speed & distance, rim
  defense). `total` stats are divided by games played; `rate` and `pct` are as reported.
- `GET /combine?draftYear&playerId`: official combine measurements, span over height (wingspan −
  barefoot height), draft pick from draft history. Percentiles compare every measured participant
  since 2000. A searched player is shown within their class (`selected_player_id`); a player
  without a record returns the latest class and `selected_player_id = null`. Rows without an NBA
  person id keep `player_id = null` and are never name-matched or selected.
- `GET /impact?…&sortMetric`: the existing impact endpoint gains `sortMetric` (any served rating
  coefficient, else `422`) so Six-Factor ranks one factor at a time. Factor percentiles come from
  the bundle's `offense_percentile` (o_*) and `defense_percentile` (d_*).
- `GET /wowy?season&phase&teamId&a&b`: see below.

## WOWY

Owner decision D4: derived from lineup data, not ingested from pbpstats.

- **Inputs.** The six event-accepted IM03 cohorts (2023-24 to 2025-26, regular season and
  playoffs), read through the hash-checked IM04 binding (`read_accepted_inputs`): acceptance
  receipt, bundle hashes, per-game content hashes and per-stint source hashes are all verified.
- **Method.** Each stint contributes one side per team: lineup, seconds, points for/against,
  possessions for/against. Per team-season-phase, the ten players with the most on-court seconds
  are kept, and every pair gets four disjoint splits: both on, A without B, B without A, neither.
  The four always sum exactly to the team total. Ratings are per 100 possessions at each end.
- **Sample rule.** A split under 200 possessions at either end is a small sample; the
  together-minus-neither difference is shown only when both splits meet the rule.
- **Default (C3).** The team of the player with the most on-court seconds in the scope, and that
  team's duo with the most shared minutes.
- **Artifact.** `courtlens-wowy-v1`, written content-addressed by
  `.venv/bin/python -m courtlens.evaluation.wowy_runner` to `data/derived/wowy-v1/<sha256>.json`
  (`wowy_manifest` setting). It records the acceptance hash, cohort dataset hashes, parameters and
  code hashes. Serving re-hashes the file on every read and returns `503` if it changed; the catalog
  declares capability `wowy` from the artifact's seasons and phases.
- **Retired.** The previous `/wowy` operation form (2–5 player units, on/off leaders, evidence
  export) read the published release's play-by-play reconstruction, which is `source_blocked` for
  every scope. Teammate Stat Shift still uses that operation.

## Removals

- EPV: page and baselines deleted; `/research/epv` redirects to `/research/rapm` (query kept);
  removed from navigation, route availability and the replica route inventory.
- Planner: `NEXT_PUBLIC_COURTLENS_HOSTED_DEMO=1` at build time hides the More-menu link
  (`moreLinks()`) and redirects `/planner` to `/` (`HOSTED_DEMO_REDIRECTS`). Local builds keep it.
- Gate notices: `CapabilityNotice`, the old Matchups view and the seeded Combine explorer have no
  remaining users and are deleted.
