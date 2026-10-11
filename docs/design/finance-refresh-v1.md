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

Source names are labels, never a crosswalk. Only an explicit provider NBA ID or an unambiguous
`verified` registry crosswalk available at acquisition can map a row to an existing canonical NBA
identity. The selected mapping evidence is frozen into the book; later registry edits cannot
relabel it. Unresolved rows remain retained in private source bytes and are counted explicitly.

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

## Completion evidence

See [PC06 measured evidence](../evidence/pc06/README.md). An implementation/fixture pass is not
real source coverage. PC06 stays `verification_blocked` while Spotrac and the broad canonical
salary crosswalk remain unresolved; finance defaults and the PC08 UI are not promoted by it.
