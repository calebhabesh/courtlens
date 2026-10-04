# B31 Live candidate admission, 2026-10-03

Decision: **conditional opt-in ESPN candidate for a bounded local service**. Genuine
in-game freshness and real final reconciliation are `not_yet_observed`. Sustained
consumer integration/reuse permission and a supported SLA have not been established.
The worker is disabled by default. No credentials, subscriptions or paid fallback are
needed for the bounded ordinary GETs that succeeded here.

Read the [prior free-source checks](replica-free-source-feasibility.md). They found NBA
CDN denial and ESPN scheduled data only. B31 did not retry/bypass the denied NBA candidate
or turn the legacy credential-dependent [Live spike](../evidence/live-source-spike.md)
into successful fixture evidence.

The provider-hosted primary resources tested were [ESPN's scoreboard](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261003)
and [event summary](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401902644).
The [bounded probe](../evidence/b31-source-probe.json) recorded HTTP 200 for both: 9,933
and 90,280 bytes respectively, response hashes and HTTP times. Event 401902644 was
scheduled for 2026-10-03T23:00Z, with ESPN team IDs 28 and 14 and no player sections.
Its zero scores are placeholders. HTTP dates/cache directives are not source update
guarantees. Source metadata time was absent; it remains null rather than being replaced
by HTTP/poll time. Only aggregate metadata was committed; raw observations from the
subsequent worker smoke are retained in the local database.

[Two real local-service probes](../evidence/b31-real-service.json) and the
[second bounded measurement](../evidence/b31-real-service-final.json) each made only two
scoreboard calls in 65 seconds despite twelve clients. All actual observations remained
scheduled and contained unchanged bytes; content deduplicated and acquisition times
remained separate. Requests selected the slate explicitly rather than trusting the
provider's default date. There was no real active clock, changing score, player row,
final transition or correction to reconcile. The source is a consumer JSON candidate;
HTTP success and maintained third-party integration examples do not confer official
API entitlement or permitted redistribution.

Do not label the full Live gate complete from these results. Record actual changing
in-game observations, identity coverage, final/correction history, populated box resource
costs and reconciliation through ordinary batch admission when the opportunity and
source conditions permit it. Provider denial disables polling; no workaround is attempted.
The tested fallback for an unavailable feed is last-good cached data with age/status,
not fictional game updates. B32 can build against the shared backend contract and
synthetic lifecycle tests while keeping this source gate visible.
