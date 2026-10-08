# NBA direct browser source admission v1

IM08 implements an operator-only source diagnostic. It does not change IM01–IM07,
forecasting, dataset memberships, publication, catalogs, assistant tools or Live.
The impact handoff's IM08 boundary allows inaccessible endpoints to be reported
as `source_blocked`. No provider model or key is involved.

## Terms review — 2026-10-08

Review the official [NBA.com terms](https://www.nba.com/termsofuse), sections 1 and 9.
Private noncommercial statistical use and NBA.com attribution are addressed there;
comprehensive regularly updated databases require prior consent. Play-by-play
services are restricted separately. The archive publisher's license does not grant
direct NBA endpoint rights. This review does not establish the required consent.
Every endpoint therefore retains `source_blocked` with admission reason
`nba_terms_prior_consent_required`, independently of its observed technical outcome.
There is no consent toggle in this fetcher. Future admission requires a separate
review and implementation block with retained consent and analytical contracts.

## Bounded source matrix

Use the installed Playwright Chromium in `dashboard/node_modules` through the Node
transport, invoked by the Python acquisition module. Normal Chromium TLS, user
agent and CORS rules apply. No stealth modifications, authenticated profiles,
cookie imports, proxy rotation, CAPTCHA solving or alternate access hosts.
This is ordinary browser `fetch`, not Playwright's separate HTTP request client.
Public page bootstrap requests and failed network events are reported explicitly.
Unexpected requests, redirects, page scripts and third-party assets are blocked.

One process holds a raw-root advisory file lock. Each request starts at least ten
seconds after the previous request started; concurrency one, timeout 30 seconds,
no retries, at most 18 data/terms requests plus one terms-page bootstrap. The fixed
matrix is one season and one regular-season/playoff phase per observation:

| Capability | Official resource | Scope and limitations |
| --- | --- | --- |
| Hustle | `leaguehustlestatsplayer` | Total deflections, charges and contests. Missing counts stay null. |
| Defense | `leaguedashptdefend`, Overall | Tracking D_FGA/D_FGM, distinct from archive matchup counts. |
| Rim defense | `leaguedashptdefend`, Less Than 6Ft | Distance-defined dashboard; not per-shot rim attribution or points saved. |
| Passing | `leaguedashptstats`, Passing | Potential assists; no inferred assists or possession counts. |
| Play types | `synergyplaytypes` | Player/offensive totals, each of 11 explicitly requested categories. Not the IM05 PBP analogues. |
| Freshness discovery | CDN `todaysScoreboard_00.json` | Actual slate date/status/phase IDs, including out-of-scope preseason. One observation cannot prove changing in-game freshness. |
| Play-by-play | CDN `playbyplay_{gameId}.json` | At most one explicit same-season/phase game; independent schedule match where available. No bulk polling. |

NBA API source-schema references (not a promise that endpoints respond):
[hustle](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/leaguehustlestatsplayer.md),
[defense](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/leaguedashptdefend.md),
[passing](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/leaguedashptstats.md),
[play types](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/synergyplaytypes.md).
Actual payload validation, not those reference schemas, determines technical status.

## Immutable receipts and coverage

Read bounded streams inside Chromium; both declared and actual decoded response
length must be at most 8 MiB. Oversized or timed-out partial streams have no asset.
Retain complete decoded HTTP response bytes, not a reserialized JSON body or
compressed transfer encoding. Hash SHA-256, use `objects/{prefix}/{hash}`, deterministic
URL-plus-hash content UUID and independent observation UUID with actual aware UTC
observation time. Exclusive atomic installs recheck existing objects and reject
corruption. HTTP-denial/HTML bodies remain diagnostic assets, never statistical
data. Each completed observation binds policy, Chromium/Playwright versions,
network outcomes, source URLs, exact bytes and independently hashed scope inputs.

For 2023–24 through 2025–26, read the retained IM01 independent finalized schedule
and SportsDataverse appeared player box IDs, rehashing their retained receipts and
bytes. Season-total endpoints expose player presence, null counts, every missing
and unexpected identity, but no per-game membership: game completeness stays
unknown. Category omissions may reflect source eligibility, never zero events.
Other seasons report unavailable independent denominators. A downloaded prior
season remains historical; a current-season empty sample is not an outage.

Validate named datasets, duplicate-free bounded headers and grains, source IDs,
nonnegative finite counts, makes <= attempts, explicit play-type season/group,
scoreboard date/status and PBP identity/action structure. Never join by names,
fabricate absent counts, mix phases or certify analytic lineage from source shape.
Read-back verification rehashes all retained objects/receipts and recomputes
available coverage. Raw response bodies are local only and never API output.

## Verification boundary

Tests exercise raw/version immutability, corrupt/tampered receipts, nulls,
identity/phase/season mismatch, malformed counts/grains, empty and denied sources,
browser timeout/CORS/redirect/byte bounds, serial request spacing and policy gates.
A real Chromium observation accounts for every fixed endpoint and records failures
without retry. Preserve sealed evidence, frozen holdout, owner settings and public
pointer. Full Python, Ruff, formatting and strict mypy must pass. Dashboard sources
and deployment are outside this block.
