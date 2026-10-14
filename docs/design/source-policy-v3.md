# CourtLens source policy v3

Adopted 2026-10-12 by the owner. It supersedes [v2](nba-direct-admission-v2.md) for every new
acquisition; v1 and v2 stay frozen because sealed receipts were recorded under them.

## The rule

**Any free source may be used. The only exclusion is cost:** CourtLens is a non-commercial
portfolio demo with zero recurring cost, so paid APIs, subscriptions and per-request billing are
out. Nothing else blocks a source: not its kind (other sites, aggregators, published model outputs
such as DARKO, design references such as Databallr), not an allowlist, and not robots.txt.

What stays, because it is how CourtLens fetches rather than whether it may:

- **Credit.** Every view names its sources in the chart footer, column hints and the Data Sources
  page; model outputs are labelled with their author and site.
- **Pacing.** Serial fetches per host with a minimum interval (the larger of the registry value and
  any robots.txt `Crawl-delay`), an identifying `CourtLens/<version>` user agent, bounded response
  sizes, and scheduled operator runs. Visitor requests never trigger a fetch.
- **Refusals end the run.** An HTTP 403 or 429 stops that host for the run; CourtLens does not evade
  a refusal (no proxies, stealth or CAPTCHA solving). robots.txt is retained and recorded on every
  receipt (`robots_disallowed`, `robots_changed`) but no longer refuses a fetch.
- **Analytical contracts.** Raw bytes are retained append-only and content-addressed; unknown is
  never zero; date-scoped views never show values computed with later games.
- **Takedown.** A source whose publisher asks is removed.

## Registry

The machine-readable registry is `src/courtlens/domain/source_policy.py`. Sources in use:

| Source | Host | Feeds | Minimum interval |
| --- | --- | --- | --- |
| NBA CDN static JSON | `cdn.nba.com` | player index, rosters, on/off, shots | 3 s |
| NBA official injury report | `ak-static.cms.nba.com` | injuries | 3 s |
| hoopR NBA Stats raw | `github.com/sportsdataverse/hoopR-nba-stats-raw` | play types, tracking, matchups, hustle, lineups, combine, draft | 1 s |
| Official NBA transactions | `nba.com` | transactions | operator import |
| nba_data archive | `github.com/shufinskiy/nba_data` | play types, matchups, shots, on/off | 1 s |
| pbpstats API | `api.pbpstats.com` | on/off, lineups | 5 s |
| Basketball-Reference | `www.basketball-reference.com` | contracts, draft | 3 s |
| Spotrac | `www.spotrac.com` | contracts, free agency, cap | 5 s |
| HoopsHype salaries | `hoopshype.com` | contracts | 5 s |
| ESPN injuries | `site.api.espn.com` | injuries | 5 s |
| Official league cap release | `nba.com` | cap thresholds | entered by hand |
| DARKO (darko.app) | `www.darko.app` | DPM, ODPM, DDPM (Kostya Medvedovsky's model) | 5 s |

Adding a source is a registry row plus an ingestion path; no admission review is required.

## DARKO operator import

`courtlens refresh-darko` acquires the dated public leaderboard (`?asof=YYYY-MM-DD`) at each
requested season/phase's last admitted game date, retaining acquisition and robots receipts.
It seals a v2 bundle only after all requested scopes succeed; a failure leaves the installed
bundle untouched. Install the printed path with `COURTLENS_DARKO_MANIFEST`. Refresh is an explicit
operator command, never a visitor-triggered download.

Season-only URLs contain opening projections and are rejected. Regular-season and playoff
snapshots remain separate. The source's actual `dataDate` is retained and displayed; it can lag
the requested date. Ratings are latest retrospective pregame forecasts, not season averages or
original publication-time model versions. Missing players/ratings remain unknown. Short windows,
multi-season aggregates and cutoffs before a snapshot do not borrow later ratings. Saved queries
pin the retained bundle hash. Existing v1 acquisitions remain retained but are not served.
