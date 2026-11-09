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
  A database page whose Databallr counterpart is wider takes that width instead (RD01 Wingspan: 1352 px, a table
  beside a side column); explainer pages keep 992 px.
- **Tables (owner, RD01 round 3):** one look for the site, the Stats page's NBA Player Statistics table. Research tables use
  `StatsGrid` (`components/research/stats-grid.tsx`), which renders the Stats classes; small static tables use its
  `density="compact"` scaled version. Player rows use its Stats player card (logo, season photo, name, subtitle).
- **Sign colours (owner, RD01):** where Databallr colours a value by its sign and no interval is served (a
  measurement, a player's D-DPM), use the identity tones, gold above zero and blue below (`data-identity` on
  `ResearchTable` cells), never green/red.
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
- **Settled in RD02 (owner, ORtg Calculator, 2026-11-07):** where Databallr has a layout, copy it (RD02 used Databallr's own
  hero bar through `PageHeader` instead of the centred hero); one level of nesting inside a panel (panel → card or well,
  never panel → well → card); small control cards split into balanced, centred halves; text on Research pages uses the
  blue-tinted `--color-on-bg-secondary` / `--color-on-bg-tertiary`, never the neutral `--color-text-secondary` greys; no
  hairline dividers around an intro line or above a collapsed section.
- **Settled in RD03 (owner, zTS, 2026-11-07):** never a dropdown of player names: change a player through a search field with
  suggestions (`LookupInput` candidates / `EntityField`), opening in place under that player's photo; player photos are the
  site's `PlayerAvatar` (team-colour fill, ring and logo badge, the season's photo), never a page-made circle; a per-player
  season picker lists only the seasons that player has data for; leave a little space between a title chip and the text after it.
- **Settled in RD04 (owner, Shot Quality, 2026-11-07):** every table is `StatsGrid` in the Wingspan/Stats look, even where the
  Databallr reference draws its own table (bars and all); `ResearchTable` stays only on RD00's own tables. A table's search is
  `GridSearch` (the NBA Player Statistics table's own markup), with equal space above it (from the PLAYER label) and below it.
  A team filter is the site's Select Team logo grid (`TeamPicker` in `components/research/team-picker.tsx`), never a dropdown.
  Labels whose lowercase prefix carries meaning (oTS, dContest, xPPS) keep their case (`keepCase`). Green/red goes on a value
  (`GridValue tone`) only where its served interval excludes zero. Centre a `PageHeader` icon tile with flex alignment: the
  unlayered `display: inline-flex` defeats grid centring.
- **Settled in RD05 (owner, Defensive Shot Quality, 2026-11-08):** player cards after Databallr's take a subdued team-colour tint
  (identity, not good/bad) with no team logo watermark behind them; the logo badge on the photo and the logo beside the code stay.
  Where the frozen results serve only part of a list (five key matchups), link to the CourtLens page that serves all of it (Player
  Matchups: everyone guarded, and each head-to-head) rather than building a search over data the page doesn't have, and say the
  source difference beside the link, in the glossary and in Caveats & Methodology.
- **Settled in RD06 (owner, Learning, 2026-11-08):** an explainer with many topics copies Databallr's Learning layout: a sticky
  224 px index column (numbered tiers and topics, the one being read marked) beside the topic cards, collapsed into a "Topics"
  disclosure above them on a phone. A search filtering that index heads its column at the column's width and stays pinned with it,
  24 px clear of the list; on a phone it is full width above the disclosure. Categories that are labels, not ranks (tiers) take
  `--color-category-*` tints in fixed order. A measure over seasons is one line on one axis with a switch between measures, never
  Databallr's two y-axes, beside its `StatsGrid`. A myth is shown only where a frozen CourtLens result answers it, and that result
  is its reality (the number appears once). A route under a tabbed page may draw its own centred hero (`OWN_HEADER_TABS`) without
  moving its URL. Judge CSS from the sandbox build: when the owner's :3100 shows something the build doesn't, check the CSS chunk
  :3100 serves and toggle the import line in `app/globals.css`.
- **Settled in RD07 (owner, Patch Notes, 2026-11-08):** pages for visitors carry no repository detail: no commit hashes, progress-log
  links, branch, merge or PR lines and no process notes ("approved after n rounds"); copy is plain language about what a visitor can
  do. Where the data needs those references to stay checkable, they live in the source file and its check script, not on the page.
  A changelog copies Databallr's: a 160 px release column (month, version, name, dates) beside plain entry rows (title, badge,
  Explore, one sentence), the column a subdued gold-tinted tile with the version in gold, sticky while its release is read; entries
  condensed, with no cards. No accent rail or edge highlight on a card or tile edge (it reads as vibe-coded). After a CSS change
  the owner will view on :3100, check the served chunk and refresh it (remove the import, request the page for about 12 s, re-add,
  request again) before reporting.
- **Settled in RD08 (owner, Draft Classes, 2026-11-09):** a table of a season's players is built like the Stats table (a title saying
  what it is, Per Game by default, the Stats groups and photo strip); say the unit in a heading when a table isn't per game. A search in
  a table header has equal space above and below. Rows with a year sort by year unless the user sorts otherwise. Draft position is
  written `R1 #2`, the Players bio's form. Dates use the Stats format (Nov 8, 2026). A column that would repeat one answer on every row
  becomes one sentence. A table beside a card ends level with it. Heights and lengths on a chart are marked in feet and inches; a
  difference between two lengths stays in inches.
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
