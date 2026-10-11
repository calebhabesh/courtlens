# CourtLens source policy v2

Adopted 2026-10-11 for [PC01](../presentation-clarity-plan.md#pc01-source-policy-v2). The owner
made this decision for CourtLens as a **non-commercial résumé/portfolio demo** with zero recurring
cost. It supersedes [v1](nba-direct-admission-v1.md) and the replica handoff's finance and
free-agency source gates **for new acquisitions**. v1 stays frozen: IM08's sealed receipts were
bound to its hash and keep verifying against it.

This is an owner policy decision, not a grant of rights from any publisher. v1's terms review
still stands as a reading of NBA.com's terms. v2 accepts the remaining risk for a low-traffic,
non-commercial demo under the limits below, and removes a source when its publisher asks.

## Admitted sources

The machine-readable registry is `src/courtlens/domain/source_policy.py`. This table must match it.

| Source | Host | Feeds capabilities | Minimum interval | Notes |
| --- | --- | --- | --- | --- |
| NBA CDN static JSON (`playerIndex.json`, scoreboard, box score, play-by-play) | `cdn.nba.com` | player index, rosters, on/off, shots | 3 s | Already used through the archive paths. Bulk play-by-play comes from mirrors where available. |
| NBA official injury report PDFs (`/referee/injury/`) | `ak-static.cms.nba.com` | injuries | 3 s | Dated status observations only. |
| hoopR NBA Stats raw (raw stats.nba.com JSON) | `github.com/sportsdataverse/hoopR-nba-stats-raw` | player index, rosters, play types, tracking, defensive tracking, matchups, hustle, lineups, combine, draft | 1 s | Primary route to stats.nba.com data; fallback player index. Pin the revision or release tag. GitHub API and raw.githubusercontent.com are transport hosts for this repository only. |
| nba_data archive (Apache-2.0) | `github.com/shufinskiy/nba_data` | play types, matchups, shots, on/off | 1 s | Fallback mirror. Already admitted for IM01 by [research source admission v2](research-source-admission-v2.md). |
| pbpstats API (`get-totals`, lineups, `get-wowy-stats`; no key) | `api.pbpstats.com` | on/off, lineups | 5 s | Secondary cross-check for possessions and on/off. |
| Basketball-Reference (`/contracts/{TEAM}.html`, draft pages) | `www.basketball-reference.com` | contracts, draft | 3 s (robots.txt `Crawl-delay`) | Weekly, about 30 pages. |
| Spotrac (team cap pages, `/nba/free-agents/`, `/nba/cba/`) | `www.spotrac.com` | contracts, free agency, cap thresholds | 5 s (robots.txt `Crawl-delay`) | Weekly, about 32 pages. |
| HoopsHype salary pages (embedded JSON) | `hoopshype.com` | contracts | 5 s | Fallback only. |
| ESPN injuries JSON | `site.api.espn.com` | injuries | 5 s | Secondary source. Always labeled as ESPN. |
| Official league cap release | `nba.com` | cap thresholds | not fetched | Entered by hand, one row per season. |
| Official NBA transaction evidence | `nba.com` | transactions | not fetched | Versioned operator imports with NBA IDs, effective dates and per-row official URLs; never inferred from roster differences. |

**Not admitted:**

- `stats.nba.com` called directly. It times out from the development machine and blocks cloud
  IPs, and the IM08 browser fetcher stays a frozen diagnostic.
- Databallr data of any kind. It is a design reference only.
- Paid APIs (for example BallDontLie GOAT).
- RealGM, which returns 403.
- External model outputs (DARKO and others) stay under B25.

## Fetching rules

- Fetch over unauthenticated HTTPS GET, with no browser automation, no stealth, no proxies and no
  CAPTCHA solving. Send an identifying `CourtLens/<version>` user agent with a contact URL. Use the
  browser user agent only where a source rejects anything else, and record that in its receipt.
- Fetch serially per host, waiting at least the registry's interval between request starts. Obey
  the larger of that interval and the host's current robots.txt `Crawl-delay`. Never fetch paths
  that robots.txt disallows.
- Fetch on schedule, not on demand ([C22](../presentation-clarity-plan.md)). Nightly in season:
  play-by-play, box scores, the hoopR cache, pbpstats and injuries. Weekly: Basketball-Reference
  and Spotrac. Monthly: the player index. Off-season: weekly for everything. Visitor requests never
  trigger a fetch.
- On a 403, a 429 or a robots.txt change, stop that host for the run and report it. Never retry in
  a loop.

## Retention and serving

- Raw bytes are append-only and SHA-256 addressed, with observation receipts. They never change
  after capture, as in v1 and research admission v2. Raw bytes stay on the server and are never
  served or exported.
- The public site serves **derived views only**: aggregates, rates, charts and per-player rows
  that CourtLens computes or normalizes. It never serves file downloads that mirror a source.
- Every view credits its sources in the chart footer and on the Data Sources page.
- Analytical contracts are unchanged. Unknown is never zero. A missing salary is unknown, not $0.
  An injury status is a dated observation, not an inference. Temporal cutoffs apply as before.

## Capability status

The policy no longer causes a `source_blocked` status. A capability whose admitted source is not
yet ingested reports `not_yet_observed`, and its limitation names the source. Once ingested, it
reports `available` or `partial` from actual coverage. `source_blocked` now means only a measured
technical failure or a data gap, such as zero reconciled stints in a release, never this policy.
