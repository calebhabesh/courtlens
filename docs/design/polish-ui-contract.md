# CourtLoad polish UI contract

2026-10-05. Parent: [freeze handoff](../polish-freeze-implementation-plan.md). **Review draft; implementation pending.** Applies to PF01–PF06 and the visual primitives consumed by PF08. The owner selected near-black, larger controls/rows, full-width left alignment and Lucide. Retain the original analytical/temporal contracts.

## Shared visual foundation

Use one semantic token layer and a small set of shared primitives with vanilla CSS. Extend existing seams; a full component-library or styling-framework rewrite is outside this phase. Keep the approved local Public Sans/JetBrains Mono typography unless actual rendering evidence requires a bounded correction.

Starting values below are implementation targets to test, not measured contrast or owner-approved individual pixels:

| Dimension | Target |
| --- | --- |
| Background / surface / raised | Approximately #0c0d10 / #15171c / #202329; neutral charcoal, distinct flat shades |
| Text / muted / accent | Approximately #f2f3f5 / #a9afb9 / existing restrained warm yellow; preserve orange basketball mark |
| Boundaries | Decorative panel outlines removed; restrained separators where structure needs them; visible interactive focus independently maintained |
| Application / navigation / context rows | Approximately 56 / 46 / 56–64px on desktop, with responsive wrapping/collapse |
| Field/button height | 38–40px desktop; touch paths have comfortable targets without shrinking labels |
| Page / section spacing | 20–24px outer desktop gutter, 12–16px narrow gutter; a common 4/8/12/16/24px scale |
| Panels | Usually 16–20px padding; explicit header/content/action gaps; heading margins reset inside shared sections |
| Table row / portrait | Standard 44–48px / 34–36px; compact preference may be smaller after readability checks |
| Table text / percentile | Approximately 13–14px / 10–11px, tabular numeric alignment; main values visually dominant |

Verify actual contrast, font glyphs, focus, selected/hover/disabled/loading states and 200% zoom. Muted text must remain readable. Color alone cannot identify good/bad values or availability. Keep chart legends/markers/table alternatives.

The main page shell has left alignment and no global 1600px centered clamp. Wide tables use the available viewport. Articles and conversation text can retain a readable line length within their left-aligned area. Fix actual overflow; masking it on the body is not an acceptance substitute.

Use shared Button/IconButton, Field/Select treatment, Section, Toolbar, Status and EmptyState conventions. Reuse an existing compatible component instead of creating parallel lookalikes. Map internal enum values to human labels everywhere (Regular season, Season to date, Last 10 appearances). Keep backend values canonical.

## Shell and controls

- Header identity contains the basketball mark and CourtLoad text; remove the Replica Workbench subtitle. Preserve app icons/manifest identity.
- Ask uses the same reset/height/hover/focus treatment as other header actions, with a Lucide icon and readable label. Remove browser-native gray button appearance.
- Use Lucide for interface/search/table/menu/status actions. Team logos and the CourtLoad mark are separate brand assets. Decorative icons are hidden from assistive technology; icon-only actions have names and visible tooltips. Keep one stroke/size convention.
- A select reserves space for its chevron and keeps consistent left/right inset. Use native semantics where sufficient; a positioned decorative chevron has pointer-events disabled. A searchable entity selector uses the picker below. Reserve custom dropdown behavior for demonstrated needs.
- Shared menus work by pointer, keyboard and touch; Escape dismisses; focus returns to their trigger. Large menus wrap into readable groups, and narrow navigation derives from the same destination/capability model as desktop.
- Show compact season/phase/cutoff/window controls and genuine scope counts. A player count says players, a game count says games. Raw UUIDs, timezone implementation names and milestone IDs belong in details; keep the exclusive-cutoff meaning discoverable.
- Resolve supported/default season/phase/window values from the retained catalog, rather than a hardcoded season list. Controlled fields synchronize after Back/Forward, equivalent-link navigation and external scope updates. Preserve an unsupported historical selection with a clear availability state rather than showing a different default.

## Entity selection everywhere

Build one identity lookup engine with separate adapters for global navigation, a single-entity field and a multiple-entity field. A picker emits canonical selections and human labels, rather than making users enter IDs. It can be embedded inside a form without nesting forms or exposing navigational submit behavior.

1. Typing shows bounded grouped matches with names, distinguishing information, player portraits and applicable team logos. Teams match city, name and tricode. Keep existing aliases/diacritic normalization and typo matching.
2. A committed selection visibly remains in the field/chip. Editing or clearing invalidates that selection; pending text cannot secretly submit an old entity. Ambiguous text presents candidates; a failed search preserves the text.
3. Multi-select presents named removable chips, prevents duplicate selections and respects that workflow's real limits. WOWY together/apart/exact-unit groups each have a clearly labelled picker; discard the comma-separated-ID workflow and extra add-target selector.
4. Empty input can show bounded local recents/suggestions. Ordinary select-all team filters remain available where appropriate; picking an analytical team uses selected-period participation rather than claiming a current roster.
5. Loading, no matches, selected-season no data and API failure are distinct useful states. An entity can be discoverable even when it has no eligible statistical row.
6. Apply debounce/cancellation/cache rules to every path, including cache hits and empty inputs. Invalidate obsolete request sequences before a fast return. Scope/catalog versions belong in cache keys.
7. Arrow/Enter/Escape/Tab, IME, pointer and touch work; multiple mounted instances have unique option IDs and correct active-descendant relationships. Announce settled results without per-keystroke noise.

Inventory all canonical pages from dashboard/app before migration. At minimum inspect comparison selectors, WOWY/stat shifts, trends/distributions/similarity, shooting/matchups/aftermath, team comparisons, recent games/showcase, rankings/tier lists, roster shapes, measurements, learning examples, finance, legacy planner/schedule and entity-aware saved views. Record each field's migration or justified non-entity role. Free-text row filtering, chat questions, notes, titles and operator source import content remain appropriate text inputs.

Prove the migrated behavior in actual rendered controls. Existing tests that copy component logic are insufficient. Test two concurrent pickers, cache-hit response reordering, Jokić/Jokic, Dončić/Doncic, TOR/Toronto/Raptors, suffixes, ambiguous names, missing current-season data and an unavailable API.

## Team logos and identity semantics

Provide a bounded local team-branding catalog/component with stable canonical team keys, source URLs, retained asset hashes and applicable attribution/reuse information. Use verified legitimate assets; fall back to team abbreviation when missing. Acquire/cache assets as an explicit setup/build step; analytical reads never download sources. Account for historical team codes without inventing mappings.

- In an analytical row, show the teams represented by its selected window. An active team filter shows that represented team. Combined traded-player results show a compact logo stack with every represented team named on hover/focus; selecting teams[0] is invalid because the set is not chronological.
- General lookup currently uses latest observed appearance association. Return context-bound association when a season/cutoff is supplied; otherwise label it last observed team. A season-availability flag alone does not make that association historical.
- Search results for teams show the real logo/name; player results show a portrait plus applicable team branding. Reuse identity rendering in cards, chips, tables and comparisons.
- Current franchise artwork can be decorative branding; exact era-specific logos are a separate scope. Retain verified observed historical names/associations; use the observed abbreviation when an era-specific identity is unavailable. The static current-franchise registry does not establish a historical name. Latest portraits never prove historical membership.
- Logo/portrait failures preserve the entity and layout. Size imagery explicitly, avoid layout shift, load visible assets lazily/boundedly and retain existing portrait fallbacks. Local deployment works without a runtime branding-CDN dependency.

## Tables and recurring group guides

Keep primary identity useful: player portrait, applicable team logo, plain linked name, team scope and required row actions. The name has no gray button container. Selection/favorite controls remain separate with clear hit targets and keyboard behavior.

Photos/Logos/Initials/None controls **recurring guides between major metric sections**. They do not merely replace the image beside the name. Label the control clearly (for example, Group guides) and preserve its preference in views/reloads:

| Mode | Repeated guide cell |
| --- | --- |
| Photos | That row's player portrait |
| Logos | Applicable represented-team logo/stack |
| Initials | That row's player initials |
| None | No repeated guide cell; primary identity remains usable |

Declare major boundaries in preset/view metadata. Overview can combine isolated PTS/REB/AST groups into Counting, alongside Profile, Defense and Efficiency; richer presets expose only supported groups. Place narrow guide cells at declared group starts, compute header spans correctly and preserve alignment under column selection/reorder. Guides are decorative and excluded from numeric sorting/export/tab order; test all modes rather than inserting ad hoc colspans.

Use intrinsic/capped metric widths and consistent padding; a single metric must not stretch into a giant mostly empty section. Allow an internal labelled horizontal scroll region rather than shrinking faces/text to fit. Pin identity/group headers correctly; drawer/compare tray must not hide essential controls. No fabricated impact columns are needed to imitate the reference.

Values, normalization, sort/caption and formatting come from the same catalog selectors. Switching Per Game/Totals/Per 36 resolves the corresponding sortable metric, invalidates paging and preserves deliberate sort direction. Percentages keep their units. Unsupported possession modes present a compact factual availability explanation rather than a milestone badge.

PF01 owns full eligible cohort computation, explicit Favorites/entity filtering and independent eligible/output counts. Apply analytical scope/sample/cohort filters before percentile computation; presentation name search, paging and Favorites do not redefine that percentile cohort. Return its identity/count. Null values are excluded per metric; n<2 has no percentile. Preserve the established formula and known good/bad direction. Rank/pagination labels reflect the full displayed ordering, not index+1 on every page.

Sortable headers contain keyboard-operable buttons and correct aria-sort. Hover details also work by focus/explicit action. Ordinary Tab remains normal; scrolling/density/row shortcuts activate in a focused table context and ignore editable controls. Prevent C/other actions from firing through both row and global handlers. Use actual browser tests for sort, selection, guides, scroll and keyboard.

## Concise workflows and availability

Use one page title and a short purpose sentence when useful. Primary panels lead with the task/result. Put definitions, method notes, lineage, filesystem paths, serving routes and operator details in named secondary panels. Preserve essential sample/phase/cutoff, partial-data and hypothetical/model distinctions near the result. Remove outdated completion/future-work prose from task flows.

Settings leads with actionable configuration and genuine service/source status. Key configured is distinct from provider healthy; idle queue is distinct from worker liveness. Show useful portrait coverage compactly, with the acquisition action and details beneath. Install guidance is a short actionable entry rather than a large static essay. Preserve deeper diagnostics under details/Data status.

Menus and presets consume runtime capability state for the selected context through one route-to-capability mapping. Sol owns any missing catalog/context fields in PF01; Flash renders them in PF06. Operational status can add service-health information but cannot replace release-bound capability evidence. Load bounded catalog/status data once per appropriate context; navigation must not probe every destination through statistical queries.

Working tools remain primary; unavailable destinations stay reachable through a secondary Availability group and search/direct routes. Use short reasons/alternatives. Source missing, query-specific insufficient sample, temporary service failure and a legitimate negative research result are different states. An ordinary empty query must not remove an otherwise working tool from navigation. Test desktop/mobile agreement, partial capability, unreachable backend and negative research results.

Audit all applicable charts, profiles, exports and auxiliary tables against the shared identity/spacing/control rules. PF06 records Ask's checklist/shared-primitives needs; PF08 owns changes to its route, components and client. Keep accessible chart values/tables, actual units and export provenance. Shared changes must preserve saved-view state, compatibility routes and old evidence reproduction.

## Evidence

Capture real production screenshots of Stats, Ask, Settings and representative entity-selection/empty/error states at the agreed widths/zoom. Test real-service task paths and fixture-driven failure states. Record route coverage and measured lookup/query budgets in the freeze progress log; a screenshot alone cannot verify sort, scope, full-cohort or persistence behavior.
