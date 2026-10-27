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
| Basketball-Reference | `www.basketball-reference.com` | contracts, draft, player bios and honours (`courtlens acquire-bbref-bios`, 4 s) | 3 s |
| Spotrac | `www.spotrac.com` | contracts, free agency, cap | 5 s |
| NBA.com free-agent tracker | `www.nba.com` | free agency (`courtlens refresh-free-agency` / `import-free-agency`) | 3 s |
| HoopsHype salaries | `hoopshype.com` | contracts | 5 s |
| ESPN injuries | `site.api.espn.com` | injuries | 5 s |
| ESPN team rosters | `site.api.espn.com` | current rosters for the free-agency roster check (`courtlens refresh-espn-rosters`, every 6 h) | 5 s |
| Wikipedia NBA season transactions | `en.wikipedia.org` | dated signings, two-way deals, waivers, camp cuts, signings abroad and retirements for Free Agency's current status (`courtlens refresh-wikipedia-transactions`, daily); CC BY-SA 4.0, attributed | 5 s |
| Official league cap release | `nba.com` | cap thresholds | entered by hand |
| DARKO (darko.app) | `www.darko.app` | DPM, ODPM, DDPM (Kostya Medvedovsky's model) | 5 s |

Adding a source is a registry row plus an ingestion path; no admission review is required.

## Basketball-Reference player bios

`courtlens acquire-bbref-bios` reads the 26 A–Z player index pages, matches CourtLens players to
Basketball-Reference IDs (normalized name plus birth date; without our birth date, a unique name with
overlapping seasons; anything ambiguous stays unmatched), then fetches each matched player page
serially at 4 s (above the 3 s Crawl-delay and the source's 20 requests a minute). robots.txt is read
once per run and recorded on every receipt; a 403/429 ends the run. Pages are retained as
content-addressed artifacts; parsed profiles (birthplace, high school, shooting hand, debut, honours,
season awards, salaries, contract options and notes, transactions, game highs) are appended to `bbref_player_profiles` and the newest per player serves the player
page. Reruns resume: profiles newer than `--max-age-days` (300) are skipped.

`courtlens reparse-bbref` applies `bbref-player-v2` to previously matched retained pages with no
network access. It verifies the raw file's byte count, SHA-256 and acquisition lineage, then appends
one profile per content hash, parser and NBA player ID. Reruns skip existing outputs. The original
acquisition time remains `observed_at`; parsing today cannot make old evidence fresh. Serving orders
by observation time, then parse creation time for an unchanged observation. Crawl freshness is
independent of parser version, so an upgrade does not trigger another fetch. A crawl can continue
while reparsing; rerun afterwards to include pages retained after the reparse input snapshot.

Salary history and current contract seasons are separate. Options describe reported terms, not
exercise decisions. The source's career salary total may be incomplete and is not verified cash
earned. Transactions preserve the source's dated descriptions and explicit from/to team markings.
Regular-season and playoff highs remain separate, with season and career scopes and box-score links
where supplied. Missing sections and values remain unknown. These retrospective career references
are independent of the page's historical basketball cutoff and never feed forecasts or sealed
statistics.

Refresh once a year after the awards season (late June, when MVP, All-NBA and Finals MVP are final):
`--active-only` takes about 45 minutes. A full rerun picks up newly debuted players. Mid-season,
All-Star selections (February) are the only change worth an extra active-only run.

## NBA.com free-agent tracker

`courtlens refresh-free-agency --year 2026` reads `www.nba.com/players/free-agent-tracker/<year>`,
whose page data lists every tracked player (NBA ids, old and new team, UFA/RFA, option and two-way
flags, availability, prior-season per-game figures, age, experience and an article link). It
retains the page and seals a content-addressed `courtlens-free-agency-v1` bundle; install it as
`config.free_agency_manifest` (or `COURTLENS_FREE_AGENCY_MANIFEST`). On 2026-10-19 NBA.com answered
CourtLens' identifying user agent with HTTP 403, which ends the run. The operator then saves the page
in a browser and runs `courtlens import-free-agency <file> --observed-at <ISO time>`, which retains
those bytes and seals the same bundle marked `operator_import`. Status is NBA.com's as observed
(`returned` = same team before and after); deal terms are not on the source and stay unknown.
The bundle also feeds no forecast or sealed statistic.

## ESPN team rosters

`courtlens refresh-espn-rosters` reads ESPN's 30 team roster documents
(`site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/<1–30>/roster`) serially at 5 s,
retains each response and seals a content-addressed `courtlens-espn-rosters-v1` bundle only when
all 30 succeed; a 403/429 ends the run and seals nothing. The newest intact bundle in
`config.espn_rosters_dir` (`data/derived/espn-rosters-v1`) is served, so scheduled runs need no
config change. ESPN ids become NBA ids through a verified crosswalk, else a normalized name unique
in the NBA player index, else unique on the same team; ambiguous and unmatched athletes are listed,
never guessed. `scripts/install_data_refresh.sh` installs its systemd user timer (00/06/12/18 h).
The API host answers robots.txt with an edge 403 for every client, ours and a bare curl alike
(checked 2026-10-19), so it serves no robots file to read: the fetcher records
`robots_unavailable` for this host only and continues, consistent with robots no longer refusing
under v3.

Storage is bounded for the shared VPS. A run whose rosters (team, ESPN id, name, NBA id and
the player index used) match the newest bundle retains no bytes and seals nothing: it records its
31 receipts (SHA-256 and size of each response) and rewrites the `.checked` heartbeat, which the
page reads as "Rosters as of". Only a changed run retains its 30 responses (about 2.7 MB) and seals
a bundle (about 116 KB). `--keep-days` (30) prunes bundles observed before the window and their
raw responses, never the newest, and the receipts of unchanged runs older than the window (a
changed run's receipts stay, naming what a bundle was sealed from). Measured 2026-10-19: an
unchanged run adds under 4 KB on disk and about 23 KB of receipts, so steady state is bounded at
roughly 3 MB of receipts plus about 2.8 MB per roster change within the window. This is a deliberate
exception to indefinite raw retention for this operational source only: the bundles feed no
sealed statistic, forecast or evaluation.

## Wikipedia NBA season transactions

`courtlens refresh-wikipedia-transactions` (the fourth `refresh-daily` step) reads the rendered
article `en.wikipedia.org/wiki/List_of_<season>_NBA_season_transactions` once a day at 5 s (robots.txt
allows `/wiki/` and disallows `/w/` and `/api/`, so the parse API is not used). The parser reads
its Free agents, Two-way contracts, Going abroad, Waived, Training camp cuts and Retirement tables
as dated moves keyed by the linked article, and fails when a required table or column disappears.
A run whose parsed moves match the newest bundle keeps only its receipt (the page is edited for
other sections too) and rewrites the `.checked` heartbeat; a changed run retains the page (about
2 MB) and seals a `courtlens-wikipedia-transactions-v1` bundle (about 76 KB). Bundles, their raw
pages and unchanged runs' receipts are pruned after 30 days, never the newest bundle.

Free Agency keeps NBA.com's tracker for the class, UFA/RFA, options, age and per-game figures,
then applies each player's latest Wikipedia move, then the roster: ESPN decides who is on a team
unless Wikipedia's move is dated the roster's own day or the day before (ESPN can trail a claim).
Training-camp cuts carry no date on the page and are placed after the player's last signing with
that team. A name matching two Wikipedia entries keeps NBA.com's status and is listed. Wikipedia is
edited by hand and every row cites a source; it is preferred over evading NBA.com's bot filter
(Akamai answers every non-browser client, ours and a bare curl, with 403).

## Daily season statistics (hoopR box scores)

`courtlens refresh-season-stats` (the second `refresh-daily` step) keeps the in-progress season's
statistics current. GitHub's commits API names hoopR's newest commit on `main`; the season's
`scheduleleaguev2` file and each final game's `boxscoretraditionalv3` document are then read
from `raw.githubusercontent.com`, pinned to that commit, at 1 s (the host serves no robots.txt).
A game is fetched once and again while it is within 3 days of today, since the NBA corrects box
scores; a new or corrected document is retained (content-addressed, about 25 KB) and an
unchanged recheck keeps only its receipt, pruned after 30 days. Retained games are flattened into
SportsDataverse's release-asset columns (`ingestion/hoopr_boxscores.py`; identical to the
2025-26 assets on 30 sampled games, 856 rows) and written as the season's
`player_boxscores_<year>.csv` / `team_boxscores_<year>.csv`, which the existing importer reads.

When the season's files change, the run seals a new dataset over every season (marked
`builder: season-refresh` in its manifest), publishes it with the usual pointer swap and warms its
Stats cohorts. Daily-built datasets other than the published one and the newest two are retired:
their rows, release binding, snapshot and build are deleted as an admin mutation. This is a
deliberate, bounded exception to append-only datasets for daily builds only: hand-built and
impact datasets are never touched, and a dataset an assistant answer, saved analysis, forecast or
live reconciliation cites is kept. A saved link that names a retired release no longer resolves;
links without a release follow the published one. Impact numbers are keyed by season and are not
recomputed by this step.

The same run retains each final game's `playbyplayv3` and `boxscorematchupsv3` (the documents
behind the `nbastatsv3` and `matchups` archives) for the weekly impact run. `courtlens
refresh-season-impact` (timer `courtlens-impact-refresh`, Mondays 14:30 UTC) rebuilds the IM02
to IM05 chain for the current season from them, with one event stream (cdn.nba.com refuses
non-browser clients), and seals the result as `courtlens-impact-provisional`, which the
append-only triggers do not cover: the newest two are kept, older ones retired. Pages label the
values provisional ([plan](../season-impact-plan.md)). The weekly run waits until every team has
played 10 games. `courtlens refresh-season-lineups` (timer `courtlens-lineups-refresh`, daily
14:05 UTC) doesn't wait: from the first game it rebuilds IM02 candidates, IM03 stints and the
stint box under the same namespace, with no fits, for WOWY, Stat Line Shift and on/off.

## Daily refresh: player index, contracts and DARKO

`courtlens refresh-daily` (systemd user timer `courtlens-daily-refresh`, 13:30 UTC, installed by
`scripts/install_data_refresh.sh`) keeps the other operational inputs current. Its three steps
run in order and independently: a failed step admits nothing, its page keeps serving the last
good data, and the run exits non-zero so the journal records it.

1. **Player index** (`refresh-player-index`, hoopR): asks GitHub's commits API for the newest
   hoopR commit touching `playerindex/<end year>.json` (hoopR republishes about 12:10 UTC) and
   fetches the file pinned to that commit. The same commit as the newest dataset downloads
   nothing. A new commit whose admitted rows (identity, team, roster status, listed position and
   measurements; never stats) hash to the newest dataset's content address keeps only its
   receipt; otherwise the response is retained and admitted as a new sealed dataset.
2. **Contracts** (`refresh-contracts`, Basketball-Reference): fetches the 30 team contract pages
   serially without keeping their bytes and digests the parsed rows with the newest player
   index, the season's threshold release and the crosswalk revision. A digest equal to the one
   recorded for the newest refresh (`data/derived/contracts-checks/.checked`) only updates "Last
   checked" in Contracts' Data Details. Otherwise the pages are retained (content-addressed, so
   unchanged teams cost nothing) and admitted through `admit_refresh`, pinned to that index; the
   staged copy is deleted once the book is in the database. One failed page ends the run.
3. **DARKO** (`refresh-darko-daily`): fetches the dated board for today. DARKO repeats its last
   ratings until it publishes new ones, so a board whose season, data date and players match the
   newest bundle's `current` entry only rewrites the heartbeat; a changed board is retained and
   sealed as `current`, carrying every other entry verbatim. `config.darko_manifest` now names
   the directory and serves its newest bundle; a pinned hash still resolves.

Retention: unchanged runs' receipts are pruned after 30 days for all three. Player-context
datasets, finance refreshes and finance books are sealed by database triggers and never pruned,
so they grow only when the data changes (measured below). DARKO bundles past the window are
pruned only when the newest bundle carries their dated entries verbatim; each is aliased to the
newest in `.aliases.json`, so a saved investigation pinned to it reads the same ratings. A
bundle holding dated history the newest lacks is never pruned.

DARKO's `current` board also keeps `sal_market_fixed` (its market value in dollars) since
2026-10-19; Contracts' Small vs Big reads it.

## DARKO operator import

`courtlens refresh-darko` acquires the dated public leaderboard (`?asof=YYYY-MM-DD`) at each
requested season/phase's last admitted game date, retaining acquisition and robots receipts.
It seals a v2 bundle only after all requested scopes succeed; a failure leaves the installed
bundle untouched. The newest bundle in `data/derived/darko-dpm-v2` is served; set
`COURTLENS_DARKO_MANIFEST` to a file only to pin one. Refresh is an operator or scheduled
command (the daily `current` board above), never a visitor-triggered download.

Season-only URLs contain opening projections and are rejected. Regular-season and playoff
snapshots remain separate. The source's actual `dataDate` is retained and displayed; it can lag
the requested date. Ratings are latest retrospective pregame forecasts, not season averages or
original publication-time model versions. Missing players/ratings remain unknown. Short windows,
multi-season aggregates and cutoffs before a snapshot do not borrow later ratings. Saved queries
pin the retained bundle hash. Existing v1 acquisitions remain retained but are not served.
