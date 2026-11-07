# Databallr page alignment handoff

Started 2026-10-12 on branch `databallr-alignment`. The owner closed the
[presentation clarity handoff](presentation-clarity-plan.md) (PC12 D partial, PC13 parked) because
earlier whole-app passes did not faithfully reproduce Databallr. This effort goes one page at a time,
driven by the owner's own pointed instructions.

The work queue and status of every page is the [alignment catalog](databallr-alignment-catalog.md).

## Scope and precedence

- **Supersedes** the frontend overhaul, refresh, freeze and presentation-clarity handoffs for the
  layout, structure, styling and presentation of **catalogued pages and the app shell**.
- **Keeps** every analytical, temporal, identity, data, source-policy (v3) and zero-cost contract,
  the frozen pre-rename `…-vN` hash identifiers, and Design Language v1's lint-enforced mechanics (no inline
  styles, tokens, reduced motion). Where an owner instruction conflicts with a Design Language
  token or rule, follow the instruction and update the token/rule in the same block.
- **Metrics follow the owner's instructions.** Under [source policy v3](design/source-policy-v3.md)
  any free source may feed a metric (for example DARKO's DPM family); cost is the only exclusion.
  Metrics no free source provides are noted as *data-blocked* on the catalog row; derivable ones go
  to the [impact metrics plan](impact-metrics-plan.md).

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

## Patterns from the approved pages

Rows 0–2 (app shell, Stats, player page) were approved as a first revision on 2026-10-15. Apply
these patterns to later pages by default. Owner instructions still win.

**Tables.** Data tables use the Stats/career table look: table-lift frame, table-well cells,
uppercase group labels over column labels, a pinned leftmost column, and gold uppercase total rows.
- Header rows are 28 px (group labels) over 40 px (column labels). Column labels sit at the
  bottom of their row, so every label in that row, the leftmost included, shares one bottom edge.
- Each group label must sit centered over its columns. Use `table-layout: fixed` with a
  `<colgroup>` and equal data columns, then measure the centers. Center headers and values.
- The group-label row has no vertical rules; body rows keep a rule at each group start.
- The leftmost header is a group label like the others, and the label above the first section
  shares the column-label row. In the player page that's Season, then Current Contract.
- Pick group names from the career table's vocabulary (Profile, Impact, Counting, Scoring,
  Other).
- `player-ref-grid` in `dashboard/components/ref-grid.css` (shared since row 4) implements the
  smaller reference tables (Contract, Career Highs, the team profile's Six Factors and Game Log).

**Views and modes.** Don't add a view that repeats a counting mode. Rates (Per 36) was removed
because Per 36 covers it.

**Sections.** Panels below a main table use the `player-glass` panel. Each has a 20 px title-case
heading with a 20 px Lucide icon (through `components/ui/icon`, in the text color) and no
hairline under it. Inline disclosures use `ButtonSummary variant="text"`: flush with the content
and no hover fill.

**Copy.** Translate source wording: Basketball-Reference's "Def. POY" becomes DPOY. Linked values
keep their source link and tooltip, but read as figures in the text color, not as blue links.
Totals read plainly, as in "Total = 14 Seasons" with team logos and counts.

**Photos.** A player photo shows the player in the season the page analyses: pass `era={{ season,
team }}` (Design Language, Identity). Row 13 introduced it (owner: "an important macro rule for all
pages"); apply it to every page that analyses a season, and fall back to the current photo only
where the NBA has none for that team-season.

**Logos and faces beside codes.** Owner, 2026-10-30 (row 8, 14): "TOR" and "CLE" are hard to
scan for. Wherever a page names a team by its code (table headers, game cards, comparison
headers, segmented options), put the team logo beside it; wherever it names a player, prefer the
photo. Segmented options take a logo too (their `label` accepts a node). This joins the photos rule
above, so season-correct logos and photos still apply.

**Less is more.** The owner removes dividers, double outlines and extra fills on sight. A focus
state is one solid outline. When the owner asks "should we…?", give a recommendation, make the
change and say why.

**Cascade.** Overrides of foundation controls (the lookup focus ring, for example) belong in
`app/styles/foundation.css`. The `foundation` layer outranks `pages` whatever the specificity.

**Research pages (row 18, design phase).** Six-Factor RAPM (RD00, ✅ 2026-11-07) set the pattern for every Research page
redesigned from the owner's Databallr screenshots (Research handoff D13). Owner instructions still win.
- **Header:** a centred `TabbedPage` header (`hero: { icon }` in `lib/route-consolidation.ts`: the
  `pvp-header research-hero` classes, accent icon, one subtitle line), route tabs centred under it, then
  the sticky `FilterBar` for scope, then `ResearchIntro` (centred tagline and text links).
- **Column (owner, RD00, 2026-11-06):** the filter bar and every section sit in `.rs-column`, a centred
  992 px reading column (Databallr's), not the full page width. Each Research page adopts it in its own
  design turn.
- **Shaded, like Databallr (owner, RD00 round 4; supersedes round 2's open blocks):** light panels
  (`--rs-panel`, 4% white, with a soft inset rim `--rs-rim`) for cards, glossary entries, method blocks and
  the table toolbar; darker inner wells (`--rs-well`) for feature lists, callouts, formulas and steps.
  Offense/Defense cards take a 7% gold/blue tint, the tab panel an accent ring. Tokens live on
  `.rs-section, .rs-column` in `research-page.css`.
- **Photos (owner, RD00 round 4):** season photos in team colour (pass `team` to `PlayerIdentity`), never
  clipped: 64 px in ranked lists (48 px on a phone), 44 px in headline charts, 40 px in tables. A feed without
  teams borrows them server-side from a feed that has them.
- **Captions (owner, RD00 round 5):** cut any caption that is non-essential or pulls from the key point. Rules,
  counts and coverage move into the collapsed Caveats & Methodology; honesty statements (unknowns,
  confounding, overlap, no interval) and sources stay.
- **Pickers (owner, RD00 round 6):** a first-load default is fine, but a picker's clear button must clear it,
  leaving the picker and an empty state with a way back to the default (`player=none` in the URL).
- **Sticky layers (owner, RD00 round 7):** `ResearchTable`'s scroll frame is its own stacking context, so pinned
  columns scroll under the sticky filter bar. Anything new with sticky or z-indexed parts needs the same.
- **Sections:** `ResearchSection` from `components/research/research-page.tsx`, on the page background
  with a hairline rule between sections and a 24 px heading with a 20 px accent Lucide icon (Databallr's
  explainer look; panels with text-colour icons stay the pattern for non-Research pages).
- **Building blocks** (same file): `ResearchProse`, `ResearchCards`/`ResearchCard` (identity tones `a`
  gold, `b` blue for Offense/Defense, never good/bad), `FormulaLine`, `ResearchTabPanel` (full-width
  `Segmented` over an accent-ringed panel), `FeatureList`, `RankedList`, `ResearchCallout`,
  `ReadingGuide`, `ToneLegend`, `Glossary`, `MethodSteps`/`MethodBlock` and `ResearchDisclosure`
  (a collapsed section whose body stays in the DOM, for Caveats & Methodology).
- **Ratings table:** `ResearchTable` from `components/research/research-table.tsx`, after Databallr's
  ShotQuality table: toolbar (search, minimum, team, page actions, CSV, count), views as a `Segmented`
  group, sticky logo and player columns, a bar beside each signed value, the interval on a second line,
  unknowns "—" and last in both directions. Columns declare `signedValue` and `interval`. Column widths
  follow content (128 px with an interval, 96 px without, 64 px for counts) so a five-value view fits the
  column unscrolled; long names wrap inside the pinned player column. `team` is optional: without it there
  is no logo column or team filter.
- **Colour:** `SignalValue` and the table colour a value green or red only when its 80% interval
  excludes zero (`lib/research-values.ts` `intervalTone`); values without an interval stay neutral.
- **Verification:** a real-data script compares every drawn value with the API at 1440 and 390 for
  several scopes (`docs/evidence/research/design-RD00/real-check.mjs`, `real-check-ratings.mjs`).

**Verification.** For every instruction:
- Build a production sandbox at 3180, never on the owner's ports 3100/8000.
- For live data, run a read-only proxy at 4180 to the owner's API. Allow GET, HEAD, OPTIONS and
  only `POST /api/workbench/query`. Rewrite `Origin` to `http://localhost:3100` and echo the
  sandbox origin back, or CORS blocks trend and query calls.
- Use `e2e/mock-api.mjs` on 4180 for Playwright, and copy `docs/` into the sandbox.
- Take 1440 and 390 screenshots. Measure alignment numerically (text centers via `Range`, bottom
  edges) instead of eyeballing.
- Remove the sandbox and stop its servers afterwards.
