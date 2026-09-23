# CourtLoad data and serving contracts

Status: implementation specification, 2026-09-20. Parent: [implementation handover](../implementation-plan.md). Names below describe required responsibilities and grains; equivalent internal names are acceptable if all invariants remain testable.

## 1. Source acquisition and identity

Use the archive revision/files recorded in [source research](../research/zero-cost-data-sources.md). Source selection is approved; dataset acceptance is still pending. Keep one primary source per dataset. An archive adapter must translate directly into a source-neutral normalized contract, rather than manufacturing BALLDONTLIE payloads or IDs.

Acquisition and import are separate operations. Acquisition writes to a temporary file, enforces configured timeout/maximum size, records length/hash, then atomically installs completed bytes. Parse CSV as a stream; retain file/row locators. A failed download cannot be treated as a smaller valid file. Downloaded archive files stay out of Git. Support local paths with the same hash checks. Parse every player part before selecting seasons.

External identities are `(source_namespace, entity_kind, external_id_string)`. Preserve NBA game IDs as ten-character strings after validated zero-padding for this adapter; reject malformed IDs rather than coercing arbitrary values. Names, abbreviations, dates and positions are not identifiers. Resolve player/team names from the selected dataset, not a contemporary external profile.

Retain existing internal integer keys where already referenced. Add an external-identity mapping with a uniqueness constraint. If existing tables are reused for a new source, allocate new internal keys from sequences initialized above existing keys and add distinct external IDs; never reuse a numerically coincident BALLDONTLIE key. Audit legacy fixture/source classification before backfilling mappings. New source data may use separate version tables with these internal keys; planner tables need not become the new public read model.

## 2. Field semantics and normalization

| Field/condition | Required behavior |
| --- | --- |
| Missing/null count | Preserve as unknown. Required scoring inputs missing → target unavailable, not zero. Optional metrics carry their valid sample count. |
| Explicit numeric zero | Preserve zero; distinguish it from missing. |
| Minutes | Parse `m:ss` with seconds in 0–59; retain original representation and normalized seconds. Numeric formats are source-specific and must be verified. Negative/malformed minutes are quarantined. |
| Appearance | `appeared` when positive minutes or an explicit source participation flag supports it; `reported_nonappearance` only with supporting source status; otherwise `unknown`. Zero-minute rows without status are not automatic DNPs. |
| Full game | Admit only documented full-game regular-season rows. Preserve excluded period/postseason/Cup-final rows in raw storage and exclusion counts. |
| Duplicate player/game | Identical normalized rows deduplicate with all locators retained. Conflicting rows in one unversioned archive are quarantined; file order is not a revision timestamp. |
| Date precision | Store source game date separately from nullable tipoff UTC and a `date_only`/`timestamp` precision flag. Never invent midnight UTC as tipoff. |
| Season | Use a verified season mapping; do not derive season solely from calendar year. Preserve the external label and normalized season start year. |
| Team/opponent | Pair the two team-game rows, validate home/away matchup semantics and player membership in one side. Quarantine ambiguous joins. |
| Missing source row | Unknown. An absent row cannot demonstrate injury, roster absence, or a zero outcome. |

Count constraints include nonnegative counts, made ≤ attempted, three-point made/attempted ≤ total field-goal made/attempted, and `PTS = 2*(FGM-FG3M) + 3*FG3M + FTM` when fields are present. Source rounding can affect minutes; it does not explain mismatched integer point totals. Carry `FG3A` through storage. Preserve provenance and reasons for quarantined rows.

A dataset manifest records admitted and excluded counts by reason, season, team and resource. It cannot claim complete coverage merely because all available rows parsed.

## 3. Immutable records and logical schema

Use UTC for observation/build timestamps. Separate content identity, observation identity, dataset identity and publication identity. A source correction is not the same thing as a new fetch of unchanged content.

| Logical relation | Grain and important fields |
| --- | --- |
| Raw artifact | SHA-256 of exact file/response bytes; storage URI, byte count, acquisition provenance. Existing raw storage can be extended. |
| Import run | Unique attempt; source, start/end, status, parser version, request/file counts, sanitized failure reason. |
| Source observation | Run + resource + source identity + observation sequence; normalized content hash, raw artifact/row locator, actual observed time. Record unchanged observations too. |
| Normalized source version | Source identity + content hash + parser/schema version; immutable typed payload. Retain explicit tombstones only when a source actually reports deletion. |
| Dataset | Immutable instance ID, reproducible content hash, observation-manifest hash, source namespace, file hashes, season scope, parser/normalization versions, exclusions, created time. |
| Dataset member | Dataset + entity kind + source identity → exactly one selected normalized version and its observation. Membership is explicit, not “all latest rows.” |
| Player-game fact | Dataset + player + game; actual game team, opponent, full-game stats, appearance, quality flags, source references. |
| Team-game fact | Dataset + team + game; side/opponent/date, source team totals, reconciled player coverage and per-metric validity. Exactly two admitted team rows per admitted game. |
| Feature row | Dataset + player + target game + cutoff + feature version; prior-only values, history counts, lead days, observed-team basis, source-context flags. |
| Estimate | Above identity + estimator/scoring/calibration versions + evaluation mode; immutable values/interval/status/artifact hash. |
| Serving snapshot | Immutable snapshot ID; dataset, build/code/metric versions, supported replay dates, estimator policy, evaluation artifacts, creation time and quality report. |
| Published pointer | One configured channel → one ready snapshot, plus publication time. Mutable only in a short publication transaction. |

Correction example: observing A at t1, B at t2, A at t3 yields three observations and two content versions. A cutoff between t2 and t3 selects B. A dataset created at t3 can select A while the earlier dataset and original forecasts remain unchanged. Reimporting identical files may create another attempt/observation, but must not duplicate canonical facts or change the accepted dataset content hash solely because the job ran again.

The content hash includes selected source/version identities, raw hashes, parser/normalization versions, scope and exclusions; it excludes attempt timestamps and observation IDs. The observation manifest separately identifies the actual observations used. Dataset instances with identical content can therefore have different observation histories, including a reversion to A. Reuse an existing accepted instance on an unchanged import when appropriate, or create a new immutable instance if observation history must differ; never mutate old membership. Canonical uniqueness is within a dataset instance. Feature/estimate references use the instance ID, and reproducibility checks compare both content and provenance manifests as appropriate.

For files first downloaded now, actual observation time is now. It is not the historical game date. Revised historical reconstruction uses game dates within a frozen manifest; it does not pretend those source versions were observed years earlier.

## 4. Replay time and target generation

Baseline replay is **start of a selected NBA game date**, interpreted in `America/New_York`. Toronto currently follows the same regional day boundaries, but one explicit domain zone avoids user-device variation. Compute midnight with a timezone-aware library; never subtract a fixed UTC offset. Feature history requires `source_game_date < replay_date` and eligible completed-game status. Every outcome on the selected date is excluded, including games played earlier that day. Date-only data never supports an intraday claim.

Expose the source observation time, replay date, and historical coverage end separately. A recent download of old games is not fresh current-season coverage.

For each replay date D:

1. Identify players with a confirmed prior appearance in the selected season. Derive each player's last observed team using only dates before D. A same-day target box score cannot supply their presumed team.
2. Require that observation to be within 30 calendar days of D for an automatic target. This is a conservative product heuristic, not proof of current roster membership. Older/ambiguous association gives `team_context_unknown` and no automatic estimate.
3. From the reconstructed played schedule, choose that team's first game in `[D, D+6]`. Keep `lead_days` and a `reconstructed_schedule` label. Never choose a target by finding the player's next future box-score row.
4. If no game exists in this horizon, show `no_target_in_horizon`; do not jump across an offseason. At the archive boundary say `coverage_ends`, rather than claiming the team had no games.
5. Build one feature/estimate row for that player/target/cutoff. For evaluation, later join the matching player/game/team outcome. A nonappearance or unmatched trade is unscored; keep its count. Do not transfer an estimate to a later game the player actually appeared in.

This defines “next-appearance estimate” precisely in the UI: **estimated production in the selected next team game, conditional on appearing**. The baseline does not estimate availability or guaranteed next actual appearance. A player who changed teams can have unknown/wrong inferred team context until another appearance is observed; disclose and measure that limitation. Historical names/teams come from the dataset, with last-observed dates shown.

Reconstructed game dates/opponents are hindsight schedule information; this is an explicit historical-data limitation. Target opponent/side/date can come from the reconstructed schedule, but target scores, participation, minutes and outcomes are labels only. No current roster, injury status or target-game player team assignment enters candidate construction.

Forward mode, if later enabled, additionally requires that source versions, scheduled game state, feature computation and forecast creation all precede the stored pregame cutoff. An estimate generated today for a past game always remains `historical_reconstruction`, even if its features exclude the target. Immutable storage and tests for forward observations are baseline infrastructure; real forward samples are optional evidence.

## 5. Basketball calculations

Public last-5/last-10 and season summaries use confirmed appearances in the selected season strictly before the cutoff. A window shorter than its requested size retains its true `n`. Do not silently carry last-season appearances into a current-season last-10. Game logs can separately display other seasons and nonappearance/unknown rows.

- Arithmetic per-game means use valid values and expose per-metric valid `n`; incomplete scoring rows do not contribute to reference-point averages.
- A forecast baseline's “last 10 valid appearances” can span more games than a descriptive last-10 window when source rows are incomplete. Expose its actual date span and valid history count; do not present that estimate as the descriptive window's mean. Both compared players use this same rule.
- Reference points v1: `PTS + 1.2*REB + 1.5*AST + 3*STL + 3*BLK - TOV`. Use one serialized formula/version/hash across dbt, evaluation and API. Preserve full precision; round for presentation only.
- Per-minute output is `sum(valid output)/sum(minutes for the same valid positive-minute rows)`. A zero denominator produces null. Show the included row count/minutes.
- FG%, 3P%, FT% are ratios of summed makes to summed attempts over matched nonmissing pairs. Zero attempts → null, displayed as unavailable, not 0%.
- Variation is sample standard deviation of valid per-game values (`n >= 2`), alongside `n`. It is distinct from an empirical prediction interval.
- Recent-versus-season differences are descriptive. Label that the season average includes the recent window. “More minutes accompanied higher production” is valid; “the opponent caused the increase” is not established.
- Rest features distinguish days since last observed player appearance from the team's schedule rest. Team rest is date gap minus one, floored at zero; flag back-to-back using prior calendar day. Cap model rest features as specified in the evaluation config while retaining raw values for explanation.

Opponent allowance for team T uses production recorded by opponents against T in completed prior games: last 10 eligible team games in the same season. This is per-game allowance, not defensive efficiency or player-position defense. Require at least 5 valid games to show a rolling allowance; otherwise show insufficient coverage. League comparison uses the same cutoff, window and metric validity and includes its team/sample count.

Use available source team totals preferentially for team-level counts; validate player reconciliation independently. Equality of player points and team score is evidence for point coverage, not proof that all other statistics are complete. Rebounds can include team rebounds absent from player sums; keep separate definitions and source reconciliation rules per metric. Never silently substitute partial player aggregates for authoritative team totals. Incomplete required totals remove a game from the relevant allowance window and reduce coverage.

## 6. dbt and publication protocol

Pass explicit dataset ID, cutoff range, metric/feature versions and candidate build ID into dbt. Public marts must not depend on `current_timestamp`, current mutable player teams, or unrestricted latest canonical records. Current time is appropriate only for operational status calculations.

Recommended mart responsibilities:

- `fct_player_game`, `fct_team_game`: immutable dataset-bound canonical facts.
- `mart_player_profile`: snapshot/player/replay-date/window summaries and sample counts.
- `mart_opponent_context`: snapshot/team/replay-date/window prior allowance and coverage.
- `mart_player_target_features`: dataset/player/target/cutoff/feature-version inputs.
- `serving_player_games`, `serving_estimates`, `serving_evaluations`: snapshot-bound read models.

Build daily replay rows only for accepted season dates with possible targets/history. Roughly hundreds of dates × hundreds of players is sufficient here. Measure before optimizing; avoid copying the complete game log into each profile JSON. Index dataset/player/date, snapshot/player/replay-date and snapshot/team/replay-date. Keep serving output separate from dbt scratch schemas.

State machine: `created → importing → normalized → built → validated → ready`; any stage may fail with a retained report. A published pointer references only `ready`. A pipeline wrapper holds one PostgreSQL session advisory lock across the complete import/build/publish run using a dedicated connection. Child dbt processes do not own that lock. All publication attempts must hold the lock and verify the current run/build identity; losing the lock aborts publication. PostgreSQL documents session advisory locks and their release behavior in [Explicit Locking](https://www.postgresql.org/docs/17/explicit-locking.html).

Build privately, validate, install immutable output, then atomically update the pointer in a short transaction. A process killed before commit leaves the old pointer; a process killed after commit leaves a complete new snapshot. Publication is idempotent. Reverting the pointer to a retained good snapshot is rollback; it does not edit history. Snapshot construction failures may leave cleanup candidates but never partially served data.

At request start, resolve the pointer once and pin its snapshot ID for every query in that response. Multi-request UI navigation propagates the ID rather than resolving “latest” independently. Explicit IDs prevent a page from mixing player A's old snapshot with player B's new one. Queries use bound parameters and allowlisted schema identifiers. Candidate schemas are not public query inputs.

Retain the active snapshot, previous good snapshot, and anything referenced by an evaluation/case study. Garbage collection is an explicit maintenance command with a dry-run report and reference checks. Retain immutable raw/manifests needed to rebuild accepted evidence. Before a build, check disk headroom; fail cleanly rather than deleting evidence to fit. Measure final retention limits in M8.

## 7. Public API contract

Use typed response schemas, bounded requests and documented null/status enums. Existing legacy endpoints may remain for compatibility. New endpoints belong under `/api/analytics` so old planner clients are not silently given changed shapes.

| Method/path | Behavior |
| --- | --- |
| `GET /api/analytics/catalog` | Published snapshot, source/mode/coverage, supported seasons/replay dates, default replay date, scoring and estimator identity. |
| `GET /api/analytics/players?query=&season=&snapshotId=` | Search within that dataset; max 50 results, stable identity ordering. No inference of present-day NBA activity. |
| `GET /api/analytics/players/{id}?date=&snapshotId=` | Profile windows, role context, target, estimate or reason, lineage link. |
| `GET /api/analytics/players/{id}/games?date=&snapshotId=&cursor=&limit=` | Paginated historical log, prior rows by default; max 100. Cursor binds snapshot/player/cutoff. |
| `GET /api/analytics/compare?playerA=&playerB=&date=&snapshotId=` | Both profiles and comparison metadata assembled with one cutoff/snapshot. Reject identical players. |
| `GET /api/analytics/evaluations?runId=&snapshotId=` | Validated public report, candidates, splits, metrics, exclusions, promotion decision and limitations. No arbitrary local artifact path. |
| `GET /api/analytics/lineage?playerId=&gameId=&snapshotId=` | Source attribution/hash/locator and transform identity; no raw payload or local storage path. |
| `GET /api/data-status` | Preserve legacy shape if needed; add published snapshot health distinct from latest attempted import/quality failure. |

Resolve omitted `snapshotId` once; the response always returns it. Date omission uses a stored default from the accepted manifest, not today's date for a historical dataset. Pick a useful validation-era date algorithmically from coverage, before examining final-test performance. Unsupported dates/snapshot combinations return `422` with the supported range; unknown entities return `404`; known retired snapshots return `410`; no ready snapshot returns `503` with `no_published_data`. Invalid input is not silently clamped.

Each analytics response includes `snapshot_id`, `dataset_id`, `replay_date`, `cutoff_utc`, `mode`, `source`, `coverage_end`, `metric_version`, `scoring_version`, and warnings. Estimate payloads additionally include target game/date, lead days, estimator/calibration versions, history count, point estimate, nullable interval, and evaluation link. An unavailable estimate returns a reason enum, not numeric zero or an HTTP failure.

Example shape (placeholder values, not real measurements):

```json
{
  "snapshot_id": "snapshot-example",
  "dataset_id": "dataset-example",
  "mode": "historical_reconstruction",
  "replay_date": "2023-02-01",
  "cutoff_utc": "2023-02-01T05:00:00Z",
  "scoring_version": "reference-v1",
  "player": {"id": 123, "name": "Example Player"},
  "estimate": {"status": "insufficient_history", "history_n": 3,
    "point": null, "interval": null},
  "warnings": ["Schedule reconstructed from completed historical games"]
}
```

This fragment illustrates shape, not the entire schema. Define the final OpenAPI types before building the frontend. Generate client types from OpenAPI or maintain a tested schema contract; do not duplicate basketball formulas in TypeScript.

Historical mode reports `historical_archive`, with coverage and last successful build. It is not automatically an operational outage because its games are old. A failed newer build still produces a visible refresh warning while the last good historical snapshot remains usable. Current-data freshness thresholds apply only to an enabled live source. The baseline can run with scheduled refresh disabled.

## 8. Contract tests that must exist

| Test | Failure it prevents |
| --- | --- |
| Import exact files twice | Duplicate facts, unstable dataset manifests. |
| ID collision across fixture/archive/BDL | Cross-source joins and overwritten legacy records. |
| A→B→A observation sequence | Content deduplication erasing correction history. |
| Null count vs explicit zero; zero/malformed minutes | Fabricated scoring, divided-by-zero output. |
| Conflicting duplicate, wrong team, missing team row | Invalid canonical grain or false complete opponent totals. |
| Date-only game near UTC midnight and DST changes | Game on the wrong replay date. |
| Change same-day/future outcomes | Prior feature/profile hashes must remain unchanged. |
| Change target participation/team | Target candidate generation cannot change retrospectively. |
| New trade only known in future row | Past player must not move teams early. |
| Fail dbt, kill builder, simultaneous publishers | Prior pointer remains usable; exactly one authorized build publishes. |
| Publish during compare and subsequent log fetch | Both responses retain the requested snapshot. |
| Correction after stored estimate | Original estimate/feature references stay immutable. |
| Restore to new database and artifact directory | Published comparison remains reproducible with matching hashes. |

SQLite unit tests are useful but cannot establish PostgreSQL locking, migration, schema, or transaction behavior. Exercise those tests against PostgreSQL in CI. Use small fictional datasets with deliberately distinct outcomes so leakage or incorrect windows produces an obvious assertion failure.
