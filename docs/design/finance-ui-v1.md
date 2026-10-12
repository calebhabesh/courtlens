# B30 financial interface v1

> **PC08 (2026-10-12):** `/contracts` and `/contracts/[team]` now serve the presentation-clarity
> Contracts views over a pinned finance refresh ([finance refresh v1](finance-refresh-v1.md#pc08-contracts-views)).
> This B30 workspace is unchanged in behavior and moved to `/contracts/books` ("Retained source
> books"). `/free-agency` was removed under owner decision D3 and redirects to `/contracts`.

The contracts workspace at `/contracts` and `/contracts/[NBA ID or tricode]`, and the book-scoped tracker at `/free-agency`, consume B29 `finance-query-v1`. Implementation choice: this bounded UI and its additive discovery endpoints were implemented in the current Codex session, without delegated agents or a model override, instead of the handoff's Flash assignment.

## Selection and context

`GET /api/workbench/operations/finance/books` returns at most 100 book summaries; overflow is explicit, with manual UUID entry remaining available. No newest branch is selected automatically. `GET /api/workbench/operations/finance/books/{UUID}` provides financial seasons, latest selected observation, provenance/parent and canonical identity display labels. Discovery excludes retained CSV/source bytes and bounds selected membership before loading terms. Names are display labels, not dated finance evidence or current team/position assertions.

Financial URL parameters are prefixed `finance_`. Book, financial season, timezone-aware known-at, inclusive effective date, amount kind, unknown-date handling, status/player/team filters, threshold and scenario round-trip independently of basketball `season`, `releaseId`, `phase`, `beforeDate` and `window`. Navigation retains financial context. Text/term-family/size/sort preferences survive refresh in the URL. A team route overrides the financial team filter; it never changes the basketball cohort.

Queries require explicit dates and book. A complete pinned URL reads on entry; an unpinned entry requires selection and submit. Query changes clear output immediately, cancel in-flight finance reads and discard stale responses. Failed reads retain controls and offer retry. Changing a view filter changes visible rows only; query-wide status and amount denominators remain labelled above the table.

## Money, statuses and terms

Cents remain integer strings until `BigInt` formatting/summing. Null is Unknown; a documented zero displays $0.00. AAV uses the returned decimal string and the labelled reported-total/year denominator; it never enters salary sums. Small vs Big groups use the selected reported amount kind and adjustable exact-cent threshold. Empty groups have unknown subtotals. Conditional option amounts remain in a separate named hypothetical scenario layer; reported totals and group classification remain factual.

Both pages share the six B29 status categories and filtered/pre-status-filter counts per contract. Team/name/source-note, observed term-family, size and sort filters operate on the bounded returned contracts. UFA/RFA and market movement are explicit unavailable fields because B28/B29 have not admitted them. Status reports, option reports, financial terms and current-market coverage are independent.

Known coverage uses represented book contracts, with the external roster denominator Unknown. Cap/tax/apron status stays pending. No legal room, complete payroll, modeled dollar value, surplus or ROI is claimed. Dated position inputs remain unavailable, so the allocation table retains unclassified known cents instead of inventing a position chart. The multi-year source timeline discloses future/unresolved dates, distinct term/amount families and correction reasons/origin/source identities. Each term has a source link. Native modal dialogs provide focus containment, Escape dismissal and focus restoration; labelled scroll regions contain wide tables on narrow screens.

Embedded player Stats uses separately editable basketball season/phase/exclusive cutoff/release and the existing player API. It displays the returned basketball release and observed game denominator. It handles optional context warning/sample fields as actually returned by the API, and clears stale statistics when basketball inputs change. Basketball participation does not establish a financial association.

## Operator boundary

`POST /api/finance-import` is a same-origin server proxy accepting exactly one staged 64-character SHA-256 bundle hash. It attaches the existing server operator credential only to the fixed allowlisted `finance_import` job endpoint. It accepts no client file path, arbitrary job or operator token. The returned job ID/status is prompt; `GET /api/jobs/{id}` and Check import job expose queued/succeeded/failed states, stage, output references and sanitized errors. Successful checks reload discovery, requiring explicit selection of the resulting book.

The UI documents `finance-template`, `finance-preview`, `finance-import` and append-only parent/observation/source-backed corrections. The CLI stages beneath the configured artifacts root's `finance-import/<hash>` and already enqueues a job. Refresh staged import reuses that allowlist; Refresh selected book read only reruns the immutable query. Automated daily acquisition remains source-blocked. No browser control claims a new source fetch or current feed.

B35 retains ownership of generic saved-operation/export integration. B30 verification distinguishes fixture-driven scenarios/job states from actual network-browser reads of retained PostgreSQL books. Source/value/full release/restore gates are independent of this bounded interface.
