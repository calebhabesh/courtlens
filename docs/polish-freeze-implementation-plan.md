# CourtLoad usability and correctness freeze

Prepared 2026-10-05. **Owner confirmed starting PF00 on 2026-10-05; feature implementation pending.** This phase makes existing workflows coherent, readable and dependable before further product expansion. Inspection is not runtime acceptance.

## Start here

1. Read root/dashboard AGENTS.md, the [replica handoff](databallr-replica-implementation-plan.md), and this plan. Preserve the [workbench contracts](workbench-implementation-plan.md) for temporal discipline, publication, retained results and experiments.
2. Start at PF00. Read the contract for your block: [UI contract](design/polish-ui-contract.md) or [assistant contract](design/polish-assistant-contract.md). Inspect/reuse implementation before replacing it.
3. Execute one bounded block or named sub-block; record measured evidence in the [freeze progress log](polish-freeze-implementation-progress.md). Stop at its verified boundary.
4. Keep the original B00–B37 coverage ledger and unresolved gates intact. Freeze acceptance does not certify full replica completion.

After owner confirmation, this handoff supersedes the older contracts only for the explicitly revised UI and assistant behavior below. It preserves the analytical, immutable-evidence, local-deployment and zero-paid-dependency rules. Link it from AGENTS.md and the replica handoff at that point; preserve their other instructions.

## Agreed direction and scope

| Decision | Required behavior |
| --- | --- |
| Freeze | Polish and verify available workflows; repair correctness and usability defects. Keep existing source/model/finance/Live completion gates in their own backlog. |
| Primary experience | Perform common basketball tasks quickly; reveal advanced controls, provenance and operational details on demand. Scope and limitations that change an answer remain visible. |
| Main display | Owner uses a desktop Dell 1440p monitor. Optimize wide-desktop use; retain usable smaller desktops, 375px, keyboard and 200% zoom paths. Physical monitor resolution is not the browser CSS viewport. |
| Appearance | Neutral near-black/charcoal, restrained warm accent, flat surface contrast, consistent spacing and Lucide interface icons. Preserve CourtLoad mark and existing approved local fonts. |
| Layout | Larger application/navigation/context rows; left-aligned pages use available horizontal space. Readable prose may have a bounded line length within that layout. |
| Entity entry | Immediate player/team suggestions and committed named selections everywhere an entity is required; multi-select uses removable named chips. Ordinary text filtering remains distinct. |
| Team identity | Actual team logos beside player portraits and in team/player search where applicable. Analytical badges represent the selected period/team scope, including multiple teams after trades. |
| Tables | Taller readable rows; plain linked player names; compact metric widths, pinned identity and recurring group guides controlled by Photos/Logos/Initials/None. |
| Ask | Hybrid site analytics, site/NBA knowledge and basketball discussion. Every question receives a useful response, clarification or honest inability statement. |
| External answers | Permit bounded retrieval from verified free public sources, with citations and dates. External claims remain distinct from CourtLoad analytical evidence. |
| Defaults | Infer ordinary language using documented defaults. “Last season” means the most recently completed NBA season relative to today unless the question explicitly establishes a historical frame. |
| Leaders/opinions | Apply verified NBA qualification rules to league-leader questions. Allow reasoned opinions with stated criteria; distinguish judgment from measured rankings. |
| Conversations | Durable local threads until deleted; New chat and Clear history. Saving reproducible analytical evidence remains an explicit separate action. |
| Availability | Keep working tools prominent and unavailable capabilities in a secondary group; preserve direct routes/search discovery and useful alternatives. |

The owner's response to the position-filter question established a response policy, rather than a requirement to finish position-source admission in this phase: attempt a supported/sourced answer, otherwise explain the gap. Local PG/SG classification remains unavailable until dated, release-bound evidence exists. A generic G label or a player name cannot establish PG. The assistant's answer routing must handle that gap without a raw unsupported-operation dump.

Included additions are bounded means of fulfilling this polish: shared controls, team-branding assets, corrected query semantics, curated knowledge/retrieval, durable chat history and a concise answer layer. Further metrics, models, bulk history/rich-source admission, new paid providers, public hosting and a framework/component-library migration remain separate work. Retain Python/FastAPI/PostgreSQL and installed Next.js/React/TypeScript with vanilla CSS.

Owner clarification on 2026-10-06: the owner's installation uses Gemini's Free tier and its
provider-enforced project/model quotas, with no separate evaluation call-budget approval.
Other users may choose their own paid accounts; paid Gemini keys use the existing adapter,
while additional vendor adapters remain separate implementation work. No paid dependency,
billing activation or automatic paid fallback is introduced. Per-turn execution bounds remain.
The [assistant contract](design/polish-assistant-contract.md#failure-behavior-and-runtime-configuration)
records account-tier verification, quota/error behavior and the revised evaluation policy.

## Inspection findings to reproduce in PF00

These findings come from code and the owner's screenshots; classify them with current runtime evidence before claiming fixes.

| Finding | Existing seam | Required outcome |
| --- | --- | --- |
| Default sort uses total points while the column displays PPG; native selector has no matching option | dashboard/lib/query-url.ts, stats-presets.ts, workbench-player-explorer.tsx | Visible values, sort key, selector and caption agree in every counting mode. Preserve legacy total-points API semantics. |
| Percentiles use loaded rows; Favorites filters only loaded rows | workbench-player-explorer.tsx | Full eligible cohort percentiles and dataset-wide favorites, independent of presentation/paging. |
| Comparison submission drops research scope | compare-selector.tsx | Release, season, phase, cutoff and window survive selection/navigation. |
| Eligible player count is labelled games | app/stats/page.tsx, context-bar.tsx | Correct noun and actual sample/cohort counts. |
| Global lookup can accept obsolete responses after a cache hit; option IDs collide across instances | global-lookup.tsx | Every request/cache path invalidates obsolete work; independent accessible instances. |
| Entity fields expose raw IDs or submit-only text | Research views, shared-floor-view.tsx, compare-selector.tsx, shooting-view.tsx | Shared committed single/multiple entity selection; useful loading/empty/error states. |
| Identity modes affect only the name cell; Logos displays a tricode | workbench-player-explorer.tsx | Recurring group guides and real team-branding assets. |
| Content is centered/clamped; native select arrow has no reserved inset | app/globals.css | Full-width left alignment and consistently padded selectors. |
| Generic panels combine borders, padding and default heading margins | globals.css, app/settings/page.tsx | Deliberate surface hierarchy and shared section spacing. |
| Name/Ask buttons inherit native gray styling; subtitle is hardcoded | workbench-player-explorer.tsx, replica-nav.tsx | Plain linked names, shared Ask action, CourtLoad mark/name only. |
| Header sorts are click-only; row/global shortcuts can conflict | workbench-player-explorer.tsx | Keyboard sorting and shortcuts confined to their intended focused context. |
| Menus do not consume runtime availability; lock labels cite milestone IDs | replica-nav.tsx, stats-presets.ts | Useful, context-sensitive capability presentation. |
| Chat produces “Executed query …”; many failure causes share an AI-unavailable label | assistant/conversations.py, lib/conversation.ts | Direct answers and truthful, actionable failure distinctions. |
| Chat page hardcodes season/date; scope changes force restart; history is process-local | app/research/ask/page.tsx, assistant/conversations.py | Resolved defaults, per-turn scope changes and durable bounded history. |

## Blocks and ownership

**Sol** means GPT-6.1 Sol. **Flash** means Gemini 3.8 Flash at High reasoning. These are implementation agents, separate from the chatbot runtime model. Record any unavailable-agent substitution explicitly. Sol owns backend schemas, migrations, computation and API contract changes. Flash owns presentation after contracts settle.

| Block | Owner / dependencies | Deliverable and owned seams | Completion criterion |
| --- | --- | --- | --- |
| PF00 Baseline and freeze inventory | Sol / none | Current revision/dirty work/checksums, route/control inventory, available dataset/capability map, test/browser baseline. Record viewport, zoom and hardware. | Every inspection finding is confirmed, disproved or explicitly untested; failures classified; retained evidence inventoried; no feature called verified from prose. |
| PF01 Query correctness | Sol / PF00 | Stats/query catalog, server cohort-percentile output, explicit entity/favorites filtering, normalization-aware sorting, context serialization, counted nouns and catalog-bound default/availability fields. Backend domain/services, query schema, generated/shared TS contracts. | Independent arithmetic and real DB traversal prove sort/filter/count/percentile behavior across pages/modes; context controls have valid catalog defaults and navigation synchronization; old result hashes and legacy semantics reproduce. |
| PF02 Shared visual foundation | Flash / PF00 | Semantic tokens, shared controls/sections, Lucide package and wrapper, button reset, select-chevron treatment, shell/nav/context sizing, mark/name and left alignment. Own globals.css, shared UI and package/lock files in this block. | Stats, Ask and Settings previews agree on spacing/theme/control behavior at wide/narrow/zoom sizes; measured contrast/focus and contained overflow; no native gray name/Ask buttons. |
| PF03 Team branding and scoped identity | Sol then Flash / PF01, PF02 | Sol: bounded asset/catalog/provenance and context-bound team associations in lookup/results after PF01's shared-contract handoff. Flash: TeamLogo/player identity rendering and source-safe fallbacks. | Actual logos in team/player lookup and rows; a traded player, team filter, historical scope and failed asset each render accurately; local assets work without runtime CDN dependency. |
| PF04 Shared entity selection | Flash / PF02, PF03 | Harden lookup engine; separate navigational lookup from reusable form fields. Single/multi pickers; migrate every entity-entry route in inventory. Preserve canonical IDs/URLs. | Actual rendered inputs support aliases, ambiguity, selection/edit/clear/chips, keyboard/IME/touch, stale responses and API errors; no primary task requires typing an ID or exact full name. |
| PF05 Table structure and interactions | Flash / PF01–PF04 | Stats grouping/column widths, recurring guides, row density, plain names, keyboard sort, paging, Favorites, compare tray and detail behavior. Reuse table primitives across other applicable tables. | Real API values match every visible mode/sort/filter; guide modes work across presets; percentiles survive paging; pinned scrolling and all interaction paths work. |
| PF06 Route-wide workflow and copy polish | Flash / PF02–PF05 | Inventoried routes: controls, sections, concise language, humane enums, settings hierarchy, catalog-bound runtime availability, charts and exports. Ask receives a checklist/shared primitives here; PF08 implements its route/components. Preserve available analytical tools. | Route checklist has no unreviewed primary entity inputs, inert controls or inconsistent panel spacing; context controls synchronize with navigation; desktop/mobile availability agrees; meaningful task/empty/error/partial states work; labels retain answer-changing limitations. |
| PF07 Hybrid assistant backend | Sol / PF00, PF01; sub-blocks below | Typed v2 answer routing, defaults/qualifications, knowledge registry, free external retrieval, durable local threads, truthful failures and version-compatible evidence. | Each sub-block passes its independent checks; old saved conversations reproduce; every tested request reaches a useful terminal response with correct provenance. |
| PF08 Threaded assistant UI | Flash / PF02–PF04, PF07 | Shared drawer/full-page thread UI, history/new/clear, concise answers, editable scope chips, compact sources/results, retry/stop and optional evidence panels. Own ask-courtload, ask-drawer, conversation-result and client code. | Common questions read as a conversation; reload/restart retains threads; new scope does not rewrite old turns; provider/source/backend failures preserve question/history and show useful next actions. |
| PF09 Freeze acceptance | Sol / all claimed-complete blocks | Production/real-service workflows, full applicable checks, fresh DB migration/restore, retained hashes, timing/resource measurements and actual screenshots. | [Acceptance below](#freeze-acceptance) passes with measured records; separate source gates remain accurately reported. |

Split PF07 into PF07a (router/defaults/knowledge/answer contracts), PF07b (durable history), PF07c (bounded retrieval) and PF07d (integration/language evaluation). Preserve each prerequisite and report partial completion honestly. PF08 may prototype against the frozen v2 fixtures after PF07a; real completion needs PF07b–d.

## Execution order and parallel work

1. PF00 first. Capture pre-existing edits before touching shared files.
2. Sol works on PF01 while Flash builds PF02. Freeze response schemas before Flash consumes them.
3. Finish PF01's shared-contract handoff before PF03's scoped catalog/API changes, then render assets. Bounded logo-asset investigation can precede that handoff. PF04 and PF05 follow; PF06 audits the entire route inventory afterward.
4. Sol can work on PF07 alongside PF03–PF06 once the shared contracts have one owner. PF08 follows the frozen assistant contract.
5. PF09 closes this phase. Do not expand a failed source gate into an unbounded ingestion project.

One writer at a time for global CSS, layout/navigation, TS types/API clients, package lockfiles and migrations. Use named handoffs or isolated checkouts if necessary; integration is sequential. Flash does not recreate server arithmetic or invent response fields. Sol does not simultaneously restyle files Flash owns. Existing dirty stats/assistant/Live work is retained and inspected before editing.

Preview the shared visual foundation on Stats, Ask and Settings before propagating it. The owner's agreed near-black/full-width direction supplies the design decision; implementers choose routine measurements within the UI contract and provide screenshots. Escalate a real scope/cost conflict with a concrete reviewable proposal, rather than asking about every control.

## Freeze acceptance

All items are measured gates, not current claims:

1. **Complete route coverage:** every canonical page/control appears in the route inventory, with a task result and relevant empty/error/partial state. Entity-required paths use shared pickers; free-text filtering remains responsive.
2. **Table correctness:** full-cohort percentiles are invariant to name search/page size/page changes/presentation-only Favorites; sort matches displayed normalization; favorites filter the full eligible dataset; paging/row ranks/count nouns are correct. Cohort-changing filters declare their actual population.
3. **Context and identity:** release/season/phase/cutoff/window survive navigation, compare, reload, Back/Forward, saved views and export. Controls use actual catalog values and synchronize after equivalent-link/external scope changes; unsupported selections stay explicit rather than displaying a false default. Team badges agree with selected facts; future changes cannot alter prior analytical hashes.
4. **Presentation:** real production screenshots at 2560×1440, a smaller desktop viewport, 375px and 200% zoom; readable larger rows/faces, repeating guides, left alignment, consistent controls, minimal decorative borders, Lucide and correct select insets. Record CSS viewport/device scale rather than inferring them from monitor resolution.
5. **Task paths:** find a player with a partial/diacritic name; compare two players; select a team and multiple WOWY players; investigate Scottie Barnes; use a traded player; change counting mode/sort/page/Favorites; open definitions; inspect settings; save/reopen/export an available finding. WOWY selection can pass while its actual data query remains honestly unavailable.
6. **Chat:** the point-guard/last-season question is handled directly with the correct interpreted season; answers, necessary clarifications, external citations, opinions and honest inability states are distinguished. Follow-ups and explicit scope changes work in one thread. Current claims cannot be answered from stale model memory. No empty technical result dump substitutes for a response.
7. **Persistence and integrity:** active-memory expiry does not delete durable threads; deletion does not remove separately saved findings; request replay/cancellation/concurrent turns do not duplicate or overwrite messages. Fresh restore preserves analytical, personal and new history relationships.
8. **Real evidence:** tests exercise rendered components and deployed service routes, rather than reimplementing component logic. Critical DB tests execute with zero skips. Fixture tests and real-provider language evaluation are reported separately.
9. **Verification:** run appropriate backend/dashboard checks, production build and affected real-service browser workflows. Baseline failures remain visible; every freeze-owned required path must pass. Follow zero-warning AGENTS.md requirements and inspect actual package/Make scripts. Recheck retained historical and saved-conversation hashes.
10. **Operational cost:** lookup typing never calls a model/aggregates stats; photo/logo/retrieval work is bounded; no paid provider/grounding fallback. Current query/lookup/assistant/Live resource budgets remain in effect unless an evidenced change is explicitly agreed.

PF09 records commands, environment/prerequisites, pass/fail/skip/warning counts, raw measurements, screenshots, retained identities, limits and next independent source work. A green helper-only test suite or a useful failure message does not establish accurate NBA question answering.

## Agent handoff

Implement PFxx only from this plan and its named contract. Read prerequisite evidence; inspect/reuse existing code and preserve dirty work. State owned files and shared-contract writer before edits. Record tests, real evidence, screenshots, limits and next dependency in the freeze progress log. Stop at a verified boundary; preserve the original replica coverage ledger and retained evidence.
