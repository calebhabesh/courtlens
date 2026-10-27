# Live service v2: ESPN on demand

Owner decision, 2026-10-27 (alignment row 7): "the API reads ESPN on demand", like Databallr's
backend live cache. Supersedes [shared Live v1](shared-live-v1.md) (opt-in worker, leases,
heartbeats, seven-day window) and the browser-demand parts of [Live UI v1](live-ui-v1.md). The
page itself is specified by the [alignment catalog](../databallr-alignment-catalog.md), row 7.

## API

All Live endpoints are GETs, so the hosted demo's Caddy allowlist is unchanged.

- `GET /api/live?slate_date=YYYY-MM-DD`: a date's games (ESPN scoreboard), the season phase's game
  dates (`calendar`), each team's record, and before tipoff the first listed sportsbook line and
  each team's count of players ESPN's injury report lists as Out.
- `GET /api/live/games/{espn_game_id}?slate_date=YYYY-MM-DD`: one game's summary: line scores,
  player boxes (starter, position, DNP reason), team totals and team stats, every play with its
  court spot on field-goal attempts, leaders, injuries, the line, venue, attendance, officials and
  broadcasts.
- `GET /api/live/historical` is unchanged (admitted research finals; Team Compare uses it).

The response (`LiveCache` in `domain/live.py`) carries `status` (observed, source_error,
unavailable), `final`, `stale`, `age_seconds`, `acquired_at`, source and HTTP times,
`refresh_seconds`, `error`, and for retained finals `observation_id` and `content_sha256`.

## Reads and freshness

`services/live.py` reads the `live_current` row for the resource and fetches ESPN first when it is
stale. Concurrent readers share one fetch through a per-resource session advisory lock; a reader
that finds it taken serves the cached copy (or `unavailable` before the first read). Freshness:

| Resource state | Refetch after |
|---|---|
| Any game in progress | 20 s |
| A game tips within the hour | 60 s |
| Upcoming games later | 10 min |
| League injury report | 10 min |
| Every game final, postponed or cancelled; or a past empty date | never |

A newer parser version refetches a cached read, finals included. Failures keep the last good copy
and back off per resource (30, 60, 120, then 300 s). Provider transport is unchanged from v1:
no redirects or retries, identity encoding, 10 s deadline, size caps (512 KiB scoreboard, 2 MiB
summary and injury report).

Clients read again after `refresh_seconds` while visible and stop when hidden or final.

## Evidence

Final reads are appended, content-hashed (raw bytes, parser version and resolved facts), to the
append-only `live_contents` / `live_observations` tables, so `reconcile-live-final` still compares
a retained final with admitted facts. In-progress and upcoming reads only replace the mutable
`live_current` row, so a live game's refreshes don't grow storage. Retained finals are capped at
4 GiB logical (about 0.7 MB per game); past the cap a final is served without new evidence.
Migration `19b810a4f017` adds `live_current` and drops the demand-only `live_leases` and
`live_feeds` tables.

## Facts

- Status, scores, clocks and IDs keep v1's normalization and validation.
- Absent rows stay unknown; an explicit DNP never shows placeholder zeros.
- The running score on plays is the sum of scoring plays' values when that sum reaches the final
  score (ESPN's per-play score can lag); otherwise ESPN's own is kept and the page says so.
- Shooting percentages are computed from makes and attempts (ESPN rounds them).
- Identities: teams through the fixed ESPN team table (a verified crosswalk wins); players
  through a verified crosswalk, then the newest sealed ESPN roster bundle, then a name unique in
  the NBA player index (or unique on the team). Anything else stays unmapped and keeps its name.
- The line is the first book ESPN lists (DraftKings), labelled as market prices, not a
  CourtLens forecast. Databallr's per-book table has no free source.
