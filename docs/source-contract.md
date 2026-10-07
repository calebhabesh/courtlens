# BALLDONTLIE source contract

> **Optional legacy adapter (2026-09-20):** This document describes BALLDONTLIE, not the baseline's selected acquisition path. The approved baseline uses a pinned free archive subject to validation. See [source research](research/zero-cost-data-sources.md), [data contracts](design/data-serving-contracts.md), and the [implementation plan](implementation-plan.md). Paid credentials are not a baseline prerequisite; the historical check below is not a current pricing guarantee.

Last checked: **2026-08-23**

CourtLens uses only the provider's documented NBA API and records this contract in every operational
ingestion run.

| Need | Endpoint | Tier observed | CourtLens use |
| --- | --- | --- | --- |
| Team identities | `GET /v1/teams` | Free | Team dimension and schedule labels |
| Player identities | `GET /v1/players` | Free | Roster/watchlist search and current team |
| Schedule/results | `GET /v1/games` | Free | Upcoming games, lifecycle, reschedules, scores |
| Full-game player stats | `GET /v1/stats?period=0` | NBA ALL-STAR+ | Recent form and configurable fantasy scoring |

The [NBA documentation](https://docs.balldontlie.io/) currently lists Free at 5 requests/minute,
ALL-STAR at USD $9.99/month for one sport and 60 requests/minute, and GOAT at USD $39.99/month and
600 requests/minute. Pricing and entitlements can change, so they are configuration—not code
assumptions. The implementation defaults to the free-tier request rate until explicitly changed.

Authoritative references:

- [NBA documentation](https://docs.balldontlie.io/)
- [NBA OpenAPI 3.1 contract](https://www.balldontlie.io/openapi/nba.yml)
- [Provider terms](https://www.balldontlie.io/terms.html)

## Use and release decision

The current terms explicitly list analytics and fantasy sports among permitted uses and allow
lawfully retrieved data to be cached, stored, analyzed, displayed, and used in derivative products.
The full terms also prohibit credential sharing, access-control/rate-limit bypass, false official
status, competing services, and resale of unmodified raw data. CourtLens therefore exposes derived
player analytics and planning workflows—not a raw-data proxy—and identifies itself as unofficial.

There is a wording tension between the page's plain-language summary and the detailed competing/raw
resale restriction. The detailed restriction is treated as controlling and the implementation uses
the more conservative interpretation.

Provider data is best effort and not an official league-authorized feed. The application surfaces
source, classification, freshness, failed runs, and quality checks. It never silently replaces a
failed or expired paid feed with generated NBA records.

## Validation state

Contract/schema parsing, bounded retries, rate-limit handling, idempotency, corrections, and
entitlement failures are covered by deterministic tests. The live 25-game viability spike is
credential-dependent and remains an owner action because no provider key is present in this
workspace. Run:

```bash
courtlens ingest --start YYYY-MM-DD --end YYYY-MM-DD --include-stats --include-players
courtlens ingest --start YYYY-MM-DD --end YYYY-MM-DD --include-stats --include-players
```

The second run should report zero inserts/updates and only unchanged records unless the provider
published a legitimate correction. Record the tier, cost, request counts, coverage, one correction
or reschedule, one reported zero-minute row, and any unknown/absent-row limitation in
`docs/evidence/live-source-spike.md` before calling the hosted data operational.

## Data classifications

- **Operational:** lawfully fetched from the configured documented provider.
- **Fixture:** fictional deterministic records used for correctness and UI demonstrations.
- **Synthetic load:** generated only for performance/capacity evidence; none is shipped in v1.

The `/api/data-status` response and every planner snapshot publish the active classification.
