# Databallr page alignment handoff

Started 2026-10-12 on branch `databallr-alignment`. The owner closed the
[presentation clarity handoff](presentation-clarity-plan.md) (PC12 D partial, PC13 parked) because
earlier whole-app passes did not faithfully reproduce Databallr. This effort goes one page at a time,
driven by the owner's own pointed instructions.

The work queue and status of every page is the [alignment catalog](databallr-alignment-catalog.md).

## Scope and precedence

- **Supersedes** the frontend overhaul, refresh, freeze and presentation-clarity handoffs for the
  layout, structure, styling and presentation of **catalogued pages and the app shell**.
- **Keeps** every analytical, temporal, identity, data, source-policy (v2) and zero-cost contract,
  the frozen pre-rename `…-vN` hash identifiers, and Design Language v1's lint-enforced mechanics (no inline
  styles, tokens, reduced motion). Where an owner instruction conflicts with a Design Language
  token or rule, follow the instruction and update the token/rule in the same block.
- **Layout and visuals only.** Databallr metrics we cannot compute from our own pipelines (DPM,
  rTS, cTOV, ShotQuality, …) are not chased here. Note them as *data-blocked* on the catalog row;
  derivable ones go to the [impact metrics plan](impact-metrics-plan.md). Data never comes from
  Databallr.

## How a page is worked

1. The owner picks the page and gives numbered instructions.
2. Record them verbatim (lightly tidied) as that row's instruction list in the catalog, and set the
   status to *in progress*. Instructions given in chat but not in the catalog are lost to the
   next session; write them down first.
3. Implement only those instructions, on that page and the shared components it needs. Do not
   "improve" neighbouring pages or add unrequested Databallr features. If a shared component
   change visibly affects another *approved* page, stop and ask.
4. Verify: dashboard lint, typecheck, Vitest, the page's Playwright specs, plus desktop (1440) and
   phone (390) CourtLens screenshots in `docs/evidence/alignment/<page>/`. No Databallr captures
   are needed; the owner reviews by eye.
5. Mark each instruction done with a short note, set the row to *ready for review*, and commit one
   page per commit (`feat(align): <page> …`).
6. **Only the owner sets ✅ aligned.** Agents never tick it. Follow-up instructions reopen the row.
7. When a page is approved, its CourtLens screenshots become Playwright visual baselines, so later
   pages cannot silently regress it.

## Coordination

- One executor per page. While a row is *in progress*, no other agent edits that page.
- The app shell (catalog row 0) is worked as the opening part of the Stats pass, limited to what
  the owner calls out there, and approved separately.
- CourtLens-only pages get one restyle sweep after the overlap pages are done.
