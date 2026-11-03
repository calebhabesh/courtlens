# B31 shared provisional Live service v1

> **Superseded 2026-10-27** by [Live service v2](shared-live-v2.md) (alignment row 7): the API now
> reads ESPN on demand; leases, heartbeats, the opt-in worker and the seven-day window are gone.
> Kept as history.

Bounded backend handoff to B32. [B32a](../evidence/b32-active-acceptance.md) records actual
changing preseason scores/clocks and populated two-box measurements. Independent final
reconciliation and actual correction acceptance remain `not_yet_observed`.
Consumer access is an opt-in candidate, not
an official supported API or SLA. See [source assessment](../research/b31-live-admission.md).

## API and client demand

- `GET /api/live?slate_date=YYYY-MM-DD` reads the cached ESPN slate.
- `GET /api/live/games/{espn_game_id}?slate_date=YYYY-MM-DD` reads a selected summary.
- `POST /api/live/subscriptions` accepts `{slate_date, game_id?: string|null}`.
- `POST /api/live/subscriptions/{uuid}/heartbeat` accepts the same strict body.
- `DELETE /api/live/subscriptions/{uuid}` is idempotent and returns 204.

`LiveCache`, `LiveLeaseResult` and `LiveSubscription` are the OpenAPI contracts in
`domain/live.py`. GETs have `Cache-Control: no-store`; they never activate demand or
call a provider. Responses contain observation/content identity, actual acquisition
time, distinct source metadata time and HTTP date, age/stale state, last successful
fetch, last poll, next allowed poll, global active demand and request/byte counters.
`data=null` with `awaiting_first_observation` is valid. Disabling acquisition reports
`not_configured` while keeping last cached evidence. The capability field describes
the real in-game acceptance gate, not whether a scheduled response was accessible.

Mutations require server operator credentials even on loopback and reject untrusted
Origin headers. B32 must implement a fixed same-origin Next server proxy using the
existing credential boundary; never put that token in browser code. Leases are opaque
UUID capabilities for this local operator workspace, not accounts or a public tenancy
system. Capacity is 64 globally, with 150-second expiry. Demand supports dates within
seven days of activation; historical boxes use finalized research rather than recurring
historical acquisition. Heartbeats can change selected date/game. A missing/expired
heartbeat returns 404; capacity returns 429; invalid bodies/dates return 422.

Visible clients read initially and then at most every 60 seconds, and heartbeat every
60 seconds. Pause, visibility loss and unmount stop both timers and release the lease;
TTL recovers abrupt disconnects. Reactivate on becoming visible and handle 404/429.
GET's `paused` and demand counts are feed-global; local pause remains a client choice.
A selected summary reports its actual stored slate/event date, including reschedules;
it must not be relabelled with a client's requested date or the Stats release.

## Ownership, budgets and failure behavior

`COURTLENS_LIVE_ENABLED=false` by default. With explicit opt-in, `courtlens worker`
runs a cooperative Live thread with its own sessions alongside pipeline processing.
`worker --once` retains its existing job-draining semantics. The Live thread checks
demand every five seconds using Event.wait; it does no upstream work while idle.
A dedicated PostgreSQL session advisory lock prevents simultaneous feed owners.
Lease admission uses READ COMMITTED and a separate transaction advisory lock, including
when the ordinary research engine defaults to REPEATABLE READ.

A cycle fetches one date's scoreboard and at most three selected in-progress/final
summaries, sequentially (one concurrent fetch, below the two-call ceiling). Slate and
selected-game rotation are bounded and fair for a stable active cohort, including
multiple slates. More than one requested slate shares the same global budget; each
slate refreshes less frequently and can become stale. A scoreboard never causes all
listed boxes to be downloaded. Unknown/scheduled/postponed/cancelled selections do
not trigger box calls. Repeated unchanged finals do not fetch again. A changed final
game observation allows one bounded correction fetch, even if unrelated games change.

A first lease permits a prompt tick if the durable rate reservation permits it. Cycles
coalesce behind the owner lock; success schedules the next cycle at least 60 seconds
after completion. Before I/O, the worker persists a 100-second cycle reservation and
request attempts, extending the reservation for individual attempts. Crash recovery
cannot erase the request count or immediately start a new burst. No immediate retries;
failure stops the cycle. Transient failures back off 120/240/600 seconds and respect
Retry-After. Access denial sets `access_denied` and stops that candidate until explicit
operator intervention; restart alone does not reset it. Error responses keep last-good
observations with their age. Source/parser errors have bounded reasons, without raw
credential or provider body exposure.

Provider transport has a five-second connect timeout and a ten-second total asynchronous
deadline, no redirects, no retries, and identity encoding to avoid decompression expansion.
Caps are 512 KiB for scoreboards and 2 MiB for selected summaries. Oversized/encoded,
malformed, duplicate-ID or event/slate-mismatched payloads fail explicitly.

## Facts and evidence

Normalize scheduled/in_progress/final/postponed/cancelled/unknown, source game and team
IDs, Eastern slate versus UTC event time, optional period and source clock. Scheduled
scores/boxes are placeholders and become null. Missing sections remain unknown. Player
rows preserve source statistic keys and display values; an observed `"0"` is provisional,
not a finalized analytical label. Explicit reported nonappearance suppresses placeholder
stat values; absent rows never imply nonappearance. Raw source-labelled box sections
remain available alongside normalized `players`. No injury or appearance inference.

Only unique verified ESPN→NBA crosswalks bind games/teams/players. Missing and ambiguous
mappings stay explicit; no names, tricodes or guessed game IDs fabricate a crosswalk.
The source bytes, parser version and resolved facts determine a content hash. Identical
content deduplicates; each successful acquisition appends a separate observation with
its own times. PostgreSQL rejects update/delete/truncate on content, observations and
reconciliation records. Mutable leases/feed counters are separate cache control state.

A conservative preflight and exact insertion check bound raw plus normalized JSON to
128 MiB, and observations to 100,000. At capacity acquisition stops with `storage_limit`;
there is no automatic deletion or retention sweep. Physical PostgreSQL table/index/TOAST
usage is additional to the logical payload bound; backup capacity must include it. Source
and final observations remain retained. No protected raw/forecast/analytical evidence is
removed. Measured scheduled growth and the full-payload upper bound are distinct: an
unchanged scheduled slate stored 9,932 bytes once across four acquisitions; at maximum
payload sizes one cycle transfers up to 6.5 MiB. High-entropy active boxes can exhaust
the conservative capacity quickly, rather than silently growing without limit. Broader
active-source growth, physical disk and retention policy remain release work.

`courtlens reconcile-live-final OBSERVATION_UUID DATASET_UUID` explicitly compares a
retained final game summary with independently admitted finalized schedule/team facts.
It requires the retained verified game/team mapping, the same game date and home/away
identities, two valid final rows, and matching points/opponent points. It appends a
reconciliation with matched/score_mismatch/identity_mismatch/awaiting_crosswalk or
awaiting_batch_admission status. Scope is **team scores only**, with player boxes explicitly
not reconciled. It never copies Live rows into finalized facts, fits a model, issues a
forecast, runs dbt or changes a publication pointer. Player/stat admission retains the
normal batch source/quality path. Live never acquires a publication lock during I/O.

## Measured boundary

[Real network smoke](../evidence/b31-real-service-final.json): twelve leases coalesced
to two scoreboard requests over 65 seconds, 19,864 transferred bytes; 200 cached HTTP
reads p95 2.66 ms; warmed poller process CPU 0.082% of one core and no increase in its
prior peak RSS. This small scheduled payload does not establish active three-box RSS,
physical disk growth, official consumer-use permission, currentness, or an update SLA.
All leases were released, idle acquisition was zero, publication pointers and financial
books were unchanged. Simulated/Pg tests cover active/final corrections, missingness,
fair coalescing, backoff, abrupt expiry, worker interruption, blocking jobs, concurrency,
and independently admitted final-score reconciliation. B32 owns browser lifecycle/UI;
real changing-game and later final evidence remain open gates.

The scheduled-only measurements above remain dated B31 evidence. B32a's later real
changing-game observation closes that bounded opportunity: four tabs share four cycles
and two selected boxes, with CPU/RSS/logical/physical growth recorded separately. It
does not close maximum three-box load, independent final reconciliation, actual
corrections, player-stat final admission, retention or source-rights/reliability gates.
New acquisitions use `espn-live-v2`, which accepts empty/omitted statistics only for
explicit `didNotPlay: true` rows and preserves all columns as null. Existing v1 content
remains unchanged. Generic API capability still describes aggregate acceptance and
stays `not_yet_observed` while final/correction gates remain open.
