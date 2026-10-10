# Patch notes: retained analytical operations

2026-10-04 · CourtLens local workbench · Original project change record

## B35a verified backend boundary

Explicit saving retains immutable plans, contexts, input identities, results and evidence. Stats saving includes the complete eligible cohort within its declared bound. JSON and CSV exports and reproduction operate without AI. Recorded forecast issuances are pinned.

The B35a evidence reports 616 backend checks passed with 124 skipped, 215 focused PostgreSQL checks plus forecast pinning, all twelve operation types reproduced after API restart, and 32 saved investigations reproduced after a fresh restore. These are dated backend measurements, not a claim about every source or the subsequent interface.

## B35b interface changes

The interface adds a separate question opt-in, combined browsing of retained operations and legacy investigations, exact evidence inspection, canonical reopening, export and per-step reproduction status. Original learning material, definitions and engineering notes connect these workflows. Installation metadata describes a local standalone shell; analytical views require the local API and database.

Use [saved investigations](/investigations), [learning](/methodology/learning), [methodology](/methodology) and [settings](/settings). Interface verification is recorded separately in the implementation progress and evidence files; this change record is not runtime evidence.

## Open gates

- B35 remains subject to integration acceptance; the full replica is incomplete.
- Real Gemini language evaluation remains open.
- Actual in-game/finality/correction observations and deeper source/model capabilities retain their existing gates.
- The existing Starlette/httpx warning and release-wide zero-warning requirement remain open.

[Data status](/data-status), [evaluation](/evaluation) and [forecast ledger](/forecasts) expose the relevant local evidence.
