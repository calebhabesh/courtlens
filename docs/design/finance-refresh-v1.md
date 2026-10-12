# PC06 scheduled finance admission v1

Parent: [presentation clarity PC06](../presentation-clarity-plan.md#pc06-data-finance).
This extends [finance import v1](finance-import-v1.md) and preserves
[finance query v1](finance-query-v1.md). Source policy is
[NBA direct admission v2](nba-direct-admission-v2.md). A populated book does not establish
complete payroll, current roster membership, or cap compliance.

## Acquisition and release selection

`courtlens acquire-finance --source SOURCE --url URL` is an operator/scheduler command.
Repeated `--url` values share a serial per-host run. URL allowlists pin canonical team paths
and, for Spotrac, the requested financial season/class year. Robots receipts and raw responses
are content addressed; requests use the identifying policy-v2 user agent, host advisory locks,
minimum intervals, current crawl delays, and byte/time limits. A 403/429, disallowed path or
observed robots change stops that host for the run. Unknown robots history on a local import
is not evidence of a policy change. Redirects are rejected; there is no access bypass.

`import-finance-refresh` takes 1–64 explicit completed acquisition IDs, one PC05 player-index
dataset and an optional explicit threshold ID. It never chooses a newest finance branch,
derives current association from historical participation, or swaps a basketball pointer.
The caller commits receipts before admission and rolls back a rejected candidate. One run
produces one immutable refresh and, when canonical monetary/option rows exist, one independent
initial book through the unchanged B28 importer. Identical run inputs reuse that refresh.
A later fetch appends a new refresh/book even when bytes are unchanged; earlier books survive.
Use the existing manual importer for reviewed corrections, not a rewrite of either book.

PostgreSQL seals refreshes, their exact acquisition memberships and threshold records against
update/delete/truncate. Membership extension after the admitting transaction rejects. SQL
checks enforce roster kind/season, threshold season and completed finance acquisition scope.
Bound acquisition/artifact and robots provenance is protected too. ORM mutation guards cover
the new ledger. Raw bytes and the frozen mapping note used by the book also stay in existing
`finance_sources`, preserving the existing database-backup path.

## Source normalization and identity

- Basketball-Reference: one `contracts` table, explicit consecutive season headers, player-link
  provider IDs, exact base salary amounts, remaining guaranteed totals, and `salary-pl`/
  `salary-tm` option observations. Comment-contained tables work. Blank amounts stay unknown;
  a remaining guaranteed total never becomes annual guarantee amounts. Options do not establish
  exercise state. Unsupported layout, contradictory options and duplicate team/player rows reject.
- Spotrac cap: supported explicit base salary, cap hit and cash columns are independent.
  Explicit Dead Cap / Cap Holds captions retain their distinct monetary kinds. Unsupported
  heading/column/identity layout rejects. This adapter has fictional fixture verification only
  until a real page passes acquisition and parsing.
- Spotrac FA: explicit class-year heading, stable provider ID, UFA/RFA, previous/new source
  teams, reported signed/unsigned/returned/two-way labels, reported AAV and total. Missing terms
  or status remain null/unknown-review. A previous AAV is not a new contract's AAV. No seasonal
  salary is allocated from a total. These dated observations live in the refresh's immutable
  payload independently of contract calculations. This adapter also lacks real ingestion evidence.

Source names alone are labels, never a crosswalk. A row maps to a canonical NBA identity only
through an explicit provider NBA ID, or an unambiguous registry crosswalk that existed **before
the page was acquired** and has confidence `verified` or `name_team_unique`. The selected mapping
evidence is frozen into the book; later registry edits cannot relabel it. Unresolved rows remain
retained in private source bytes and are counted explicitly.

**Name-and-team rule** (owner-approved 2026-10-12, `services/bref_identity.py`,
`courtlens map-bref-identities`): a BRef player maps to an NBA person only when the normalized
name (case, accents, periods/apostrophes and trailing generational suffixes removed) **and** the
current team agree between a retained BRef contract page and the pinned NBA player index, unique
on both sides. Ties, a BRef id matching different NBA ids, or an NBA id matching several BRef ids
stay unresolved. Nicknames are not equated. Mappings are recorded with confidence
`name_team_unique` (never `verified`) and their evidence, apply only to later acquisitions, and
never overwrite an existing mapping. Books label them `name_team_crosswalk`. Active index players
missing from the identity registry are registered from the pinned index with its dataset ID and
hash as provenance.

**Refresh state:** Free Agency was cut (owner decision 2026-10-12; Spotrac 403, no admitted free
FA source), so refreshes admitted after this change are `partial` when salaries and thresholds
are observed; free-agent observations no longer gate it. Earlier refreshes keep their state.

BRef is the named primary for base salary when Spotrac reports the same mapped team/player/year
grain. Spotrac's distinct amount kinds remain independent. Same-provider overlaps reject.
Alternatives survive in captured source bytes; no averaging or provider double counting occurs.
`contract_id = reported:{NBA ID}:{source team}` identifies a report scope, not a claimed legal
contract identity. Later reviewed contract evidence uses the manual correction contract.

Source-listed team at observation is retained on terms; it is not a historical effective
association or a contract start date. Effective/announced dates remain unknown when absent from
the page. The unchanged finance-query-v1 therefore excludes this run's undated money from
effective-date subtotals, while retaining its timeline reports. Its threshold status stays
pending. PC08 must label source-report summaries accordingly instead of inventing dates.

## Thresholds and roster coverage

`import-finance-thresholds FILE` accepts a strict hand-entered `finance-thresholds-v1` document
with the official season-release URL, documented July 1 effective date, and positive ordered
minimum/cap/tax/apron cents **strings**. The importer records its actual observation time,
retains input bytes and deduplicates identical values. A correction appends another version;
the refresh pins its chosen ID. A historical publication date cannot backdate known-at evidence.
These are official chart markers, not component accounting, tax owed or legal cap room.

Every explicitly active player in the pinned dated index gets one coverage entry. A reported
current-season base salary requires both a verified NBA mapping and matching source-listed and
roster team. Known zero remains `"0"`. Otherwise salary is null with one explicit reason:
`salary_blank_in_source`, `salary_missing_or_identity_unresolved` or
`team_salary_source_unavailable`. This denominator is the pinned index, not universal roster
completeness. Known + unknown reconciles to it; salary exercise/effective state stays unknown.

Read-only GET endpoints under `/api/workbench/operations/finance` expose `/refreshes`,
`/refreshes/{id}` and `/thresholds`, with typed OpenAPI responses and optional aware `knownAt`.
Early known-at catalog reads return no observations; a pinned later refresh rejects. Reads
never acquire, admit, publish or serve raw documents. Catalogs are bounded to ten observations
and do not bind these independent inputs into an older basketball release. `verify-finance-refresh`
checks retained source/robots bytes, threshold and refresh hashes, book membership and coverage.

## PC08 Contracts views

Read-only `GET /api/workbench/operations/finance/refreshes/{id}/teams` (league payroll board) and
`/refreshes/{id}/teams/{NBA ID or tricode}` (team view; optional `statisticsReleaseId`) read only the
pinned refresh, its book, its pinned NBA index and its threshold record. They never acquire, admit
or publish. The dashboard defaults to the latest observed refresh for the season (the catalog's
first row) and pins it in the URL as `refresh`; the B30 rule of no automatic book selection still
applies to `/contracts/books`.

- Roster players are the refresh's coverage rows for the team (pinned index), with their stored
  salary or unknown reason. Seasons, options and remaining guaranteed totals come from the book's
  BRef rows for the same player and source-listed team. A later season with no salary and no option
  is "not listed", not unknown.
- Book rows for a source-listed team whose player is on another roster in the index (for example
  waived players) are returned separately. The team's `source_page_known_cents` includes their
  reported current-season amounts; roster counts and flow/donut charts do not.
- Position group is the index's first listed position (G/F/C), else `unlisted`.
- Optional references: 2025-26 regular-season box references through the existing projected-roster
  service, and the sealed impact-serving RAPM. Both are prior-season descriptions, not forecasts.
- Known totals are lower bounds of reported base salary; no cap hit, tax or apron status is derived.

## Completion evidence

See [PC06 measured evidence](../evidence/pc06/README.md), the
[PC06 unblock evidence](../evidence/pc06b/README.md) and [PC08 views evidence](../evidence/pc08/README.md). An implementation/fixture pass is not real
source coverage. Spotrac stays unused (robots 403); HoopsHype's robots.txt disallows Anthropic
agents, so it is not used for this project's development.
