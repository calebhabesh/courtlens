# B35b retained evidence, original content and local installation

2026-10-04. Consumes the frozen [B35a retention API](saved-operations-v1.md),
[conversation interface](conversational-interface-v1.md) and
[replica feature contract](replica-feature-contract.md). Parent B35 remains in progress;
this document is a contract, not runtime evidence.

## Explicit save and privacy

Only the latest executed, verifiable turn offers saving (`answered`, `no_data` or
`insufficient_sample`, with a manifest and results). The title is required and capped at
255 characters. Question retention is a separate unchecked opt-in. The browser sends only
request/turn/conversation identity, the fingerprint, title and opt-in; it does not upload
results, substitute a question or retain provider narrative.

The same request ID and payload are reused after a transport failure. Editing title or
opt-in starts a new save attempt. Pending controls prevent duplicate submissions. Expired
turns, changed inputs, oversized cohorts and unsupported versions remain explicit API
errors. Saving is never inferred from ephemeral conversation history.

Copy distinguishes the 30-minute active conversation, permanent immutable evidence,
durable title/opted-in question metadata and independent provider retention. Clearing a
conversation leaves saved investigations intact. The core works without Gemini.

## Library and evidence

`/investigations` presents new retained operations alongside existing legacy archive
investigations. New operations paginate in 50-record pages; failures are distinct from
empty results and expose retry. Legacy IDs and endpoints are preserved.

`/investigations/saved/{id}` reads the complete verified detail. It renders server-owned
results through the shared result component, preserving zero versus null, samples,
limitations, returned precision in exact evidence, retained input identities and hashes.
Each step's canonical local destination is used as returned by the backend. Unsupported
or unavailable inputs do not silently adopt a newer version.

Reproduction reports overall and per-step matches, reason and hashes, with zero provider
calls. Failure/mismatch does not hide retained evidence or exports. JSON is the complete
typed detail; CSV includes the chunked manifest and exact cells with formula escaping.
Large manifests are better read as JSON. Images remain presentation artifacts.

## Publication provenance correction

The production browser exposed a B35a integration gap: a turn resolving the public pointer
carries `published_at`, whereas explicit resolution of the identical immutable release
returns no pointer timestamp. Strict whole-context comparison rejected saving with 409.

Save/reproduction now reconstruct the retained timestamp as observed pointer provenance
before checking all context fields. They still require the same release, dataset, semantic
signature, season, phase, cutoff, coverage and metric version. No current publication
pointer is needed for replay. Existing manifests and their hashes are unchanged. A
PostgreSQL regression executes retention/reproduction and rejects an immutable signature
mismatch. The original production-browser save now passes without pinning around the bug.

## Original project content and connections

Methodology displays the active metric catalog version, count, validity and limitations,
or an explicit unavailable state. Learning includes clearly illustrative TS arithmetic,
a local-release-bound scoring-distribution editor, interpretation guidance and links to
real case studies, evaluation and the forecast ledger.

Original Markdown in `dashboard/content` supplies dated engineering notes and patch notes.
A bounded renderer supports headings, paragraphs, lists, inline code/strong/local links
and literal fenced code; it evaluates no HTML, scripts or external embeds. The content is
traced into the standalone build, with no CMS/account dependency. Dated backend results
are labelled as prior B35a measurements, not fresh interface or release evidence.

Settings links definitions, source lineage/jobs, saved evidence and dated changes. It
reports worker schedule/jobs and optional AI configuration from the API; missing health
values remain unavailable. Idle jobs and configured credentials do not prove liveness or
provider accuracy. No credentials are exposed in installation metadata or caches.

## Installation and freshness

The local manifest uses `/stats`, scope `/`, stable app identity, standalone display and
the existing CourtLoad mark. Local PNGs include 192/512 icons, a 512 maskable icon with
safe padding, and a 180 Apple icon. Theme color and manifest discovery are in app metadata.

Settings responds to the browser's install prompt and installed events, and provides
browser-menu instructions when no prompt is available. Installation eligibility depends
on a supported secure origin/browser. Synthetic events verify UI handling; they do not
establish actual OS installation.

No service worker, offline analytical cache, push account or offline write sync is added.
Analytical reads use `no-store`; static assets follow ordinary browser caching. Metadata
and icons alone do not promise offline database operation or current source coverage.
Saved detail/export, Live and analytical queries still require the local API and inputs.
Browser checks inspect manifest/icon bytes and dimensions, discovery, cache registrations,
narrow/landscape/reduced-motion and 200% zoom. Actual OS installation and release-wide
acceptance remain separately bounded.
