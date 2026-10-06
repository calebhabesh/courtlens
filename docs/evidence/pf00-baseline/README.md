# PF00 — baseline and freeze inventory

2026-10-05. Baseline recorded; **feature implementation and freeze acceptance remain pending**. Starting revision `daedc03c66e7142c5a23ef918193e86e1b86af1a`. The owner's “Let's begin the first slice/block” authorizes PF00. No PF01+ implementation is included.

## Ownership and environment

Owned changes: this evidence directory, freeze progress, confirmation wording in the freeze handoff, and handoff pointers in root AGENTS.md and the replica plan. Existing dirty B19/B32/analytics files remain preserved. This session runs as the available Codex agent; no Gemini implementation agent or model substitution was needed for PF00. No delegation or provider inference occurred.

Read root/dashboard instructions, workbench and replica handoffs, freeze handoff and both polish contracts. Applied writing-for-agents to the instruction pointer. No analytical, migration, dashboard component or styling code was changed. Next's build-generated `next-env.d.ts` was restored to its initial clean contents.

Linux 7.2.8 Arch x86_64, 16 logical CPUs, 63,401,180 KiB RAM; Python 3.14.7. Installed package versions govern execution. PostgreSQL 17 Compose database was already running. Application read-only API: a session-owned FastAPI on 8150 using existing configured database; Live disabled. Production Next: session-owned port 3150. Existing services on 8000/3100 were left running. The production browser client retains build-time configuration; read-only API snapshots/traversal explicitly use 8150.

[Starting state](starting-state.json) includes full status, 213 pre-existing dirty files and their checksums, hardware, and 1,029 retained evidence/evaluation file hashes. [Artifact inventory](artifact-checksums.json) additionally records 316 local artifact files, including the retained evaluation outputs. See [preservation](preservation.json) for comparisons. Byte preservation establishes unchanged files, not successful reproduction of historical results; executable historical/saved-conversation reproduction remains required in later blocks.

## Route/control inventory

[Route inventory](route-controls.json) lists all **52 App Router page paths**, their referenced component files, and **568 route-associated control declarations** (shared controls repeat across routes). Counts describe static declarations, not unique rendered controls or functional acceptance. Dynamic player/team/series/saved-result routes retain their canonical IDs. Next configuration also retains `/pvp`, `/StatLineShift`, `/zts`, `/shotquality`, `/d-shotquality`, `/kawhifiles` and `/dashboard` compatibility redirects; root resolves to Stats.

Each route has an explicit runtime status. Stats, Ask and Settings have production screenshots and rendered control records. The other 49 page paths are **runtime untested in PF00**; PF04/PF06 must exercise all entity entry and task/empty/error/partial paths. The inventory follows component imports but does not expand every conditional branch or library-generated element. [Browser records](browser.json) supplement it with actual rendered controls.

Entity-entry seams include GlobalLookup, CompareSelector, SharedFloorView, ShootingView and research operation views. Preserve free-text Stats name filtering as distinct from committed entity selection. PF04 owns a complete rendered migration audit; a static inventory alone cannot certify every entity-required path.

## Data and capability map

Captured [catalog](catalog.json), [status](workbench-status.json), [database table counts](database-inventory.json), and two real [default](players-default.json)/[catalog-scope](players-catalog.json) player responses. Public release `5bbb6035-6794-4bb0-b894-7208f52ef7ad`, dataset `17251a08-a4eb-4f46-b356-999fcf37c65d`, semantic signature `67c5a695749aa4303c1fafefa1f4d43c5ff39539dd78af0466592cd8f6040666`.

The catalog advertises only 2023–24 regular-season core/schedules and defaults to before 2024-06-18, while status reports admitted seasons 2023–24 through 2026–27. Actual 2025–26 regular-season queries return 591 eligible players; 2023–24 returns 586. Thus catalog coverage/defaults differ from executable query coverage. Status reports a points policy and 816 cached portraits; these are runtime declarations, not fresh forecast/portrait acceptance. Catalog measurements, draft metadata and identity crosswalk are available declarations; hypothetical is not implemented.

[Traversal](dataset-traversal.json) reads the entire 2025–26 eligible cohort in six pages (100/100/100/100/100/91): 591 rows, 591 unique player IDs, approximately 1.25 seconds aggregate client wall time. This establishes traversal uniqueness for this one query, not all-mode arithmetic or resource-budget acceptance. Retained database counts include 185 saved investigations and 33 saved conversation analyses; history durability is still pending.

Preserve the original [replica progress](../../databallr-replica-implementation-progress.md) and coverage ledger, including B14/B19/B20/B25/B26/B32/B37 gates. Table counts, plans, old completion prose and fixture passes do not close any gate.

## Inspection findings classified

“Static-supported; runtime untested” below is an explicit untested classification, not a verified defect or fix. All fourteen handoff findings are covered.

| Finding | Classification and evidence | Next owner |
| --- | --- | --- |
| Default total-points sort vs per-game display/selector | **Runtime confirmed.** Stats caption PTS DESC, first row 33.5 per-game, selector falls back to GP; `pts` has no matching option. Query default is `pts`, overview column is `pts_per_game`. Browser records and default API response retained. | PF01/PF05 |
| Percentiles and Favorites use loaded rows | **Percentiles runtime confirmed:** Luka's MIN percentile changes 38 → 43 → 66 at 25/50/100 rows. [Probes](probes.json). Favorites static-supported by `rawItems.filter`; dataset-wide behavior runtime untested. | PF01/PF05 |
| Compare drops research scope | **Static-supported; submission runtime untested.** CompareSelector form retains snapshotId/playerA/playerB/date, omits release/season/phase/cutoff/window. | PF01/PF04 |
| Eligible-player count labelled games | **Runtime confirmed:** “Sample: 591 games” vs 591 eligible players in real response. | PF01 |
| Lookup obsolete cache responses and colliding IDs | **Static-supported; race/multiple-instance runtime untested.** Cache return precedes request invalidation; IDs use `lookup-option-${item.id}` rather than instance prefix. | PF04 |
| Raw IDs / submit-only entity fields | **Compare static confirmed** (explicit Search button); other inventoried operation input branches runtime untested. | PF04 |
| Identity modes only name cell; Logos tricode | **Runtime confirmed:** Logos first row contains LAL and zero images. No recurring group guides in observed Stats. | PF03/PF05 |
| Centered/clamped content; select inset | **Wide layout runtime confirmed:** screenshot has centered content; source/probe gives 1600px max width. Main shell itself remains full width. Select-arrow collision runtime untested; generic padding has no dedicated chevron inset. | PF02 |
| Generic panels/borders/heading spacing | **Settings runtime appearance captured**, source supports generic panel patterns. Specific spacing defect assessment remains untested against PF02 targets. | PF02/PF06 |
| Native gray name/Ask; subtitle | **Runtime name confirmed:** computed background rgb(107,107,107), appearance auto. Wide screenshot shows gray Ask. Static nav subtitle “Replica Workbench”. | PF02/PF05 |
| Click-only sorting; shortcut conflicts | **Header keyboard focus runtime confirmed absent:** sortable th tabIndex -1, no role; onClick handlers in source. Conflicting shortcut sequences runtime untested. | PF05 |
| Menus lack runtime availability; milestone labels | **Runtime milestone labels confirmed** B25–B26/B20–B21; static nav arrays do not consume availability catalog. Runtime availability-change behavior untested. | PF01/PF06 |
| Executed-query chat; generic failure labels | **Static-supported; provider-answer runtime untested.** Server interpretation begins “Executed”; client provider_error maps to “AI temporarily unavailable”. | PF07/PF08 |
| Ask hardcodes dates/scope restart/process-local history | **Static-supported; restart runtime untested.** Ask default 2025–26/before 2026-06-30; server requires new conversation for explicit context change, `_turns` process memory/TTL. Browser captures current ready state only. | PF07/PF08 |

No reported finding was disproved; supported findings retain the runtime limits stated here.

## Checks and failure classification

| Command/check | Result |
| --- | --- |
| `.venv/bin/ruff check .` | Pass, zero diagnostics |
| `.venv/bin/ruff format --check .` | Pass |
| `.venv/bin/mypy src/courtload` | Pass |
| `npm --prefix dashboard run lint` | Pass, zero warnings enforced |
| `npm --prefix dashboard run typecheck` | Pass |
| `npm --prefix dashboard test` | 26 files / 164 tests pass |
| `docker compose config --quiet` | Pass |
| `npm --prefix dashboard run build` | Pass; no warning matches in captured log |
| PostgreSQL-configured `.venv/bin/pytest -ra` | **797 passed, 9 failed, 19 errors, zero skips**, 241.50 seconds; no pytest warnings summary |
| Standard `npm --prefix dashboard run test:browser` | Infrastructure stop before tests: port 3100 occupied |
| Isolated browser retry | **77 passed, 5 failed, 1 skipped**; approximately 1 minute. Nine Fast Refresh warnings in dev server log. |
| Production browser capture/probes | 12 screenshot captures plus row-size/logo probes; no pageerror events in three-route captures |

[Check commands/timings](checks.json), raw per-command logs, [Python log](pytest.log), [browser log](playwright-isolated-retry.log) and [browser failure artifacts](browser-failures/) are retained. Python ran with `COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@127.0.0.1:5432/courtload_pf00_baseline` and `COURTLOAD_REQUIRE_POSTGRES_TESTS=1`. This newly created disposable database was retained for inspection; the application database was never supplied as the test database.

Python classification: 17 setup errors require admitted baseline source metadata missing from the empty disposable DB (B21/B23/possession/readiness); two setup errors use unsupported `WorkbenchVersion(source_namespace=...)`. Four restore failures depend on absent legacy/public pointer inputs and relationships. Remaining failures: possession point-conservation admission expectation, interrupted-job recovery state, missing mutation-sealing exception, and two archive-stats test cases with versioned identities. These are pre-feature-change baseline failures; underlying cause fixes and fresh migration/restore acceptance remain open. Zero skips does not establish that all relational tests passed.

The browser retry copies dashboard sources to `/tmp/courtload-pf00-root/dashboard`, shares installed node_modules and read-only evidence links, changes ports to 3151/4151 and uses Next `--webpack` to support the external node_modules link. It remains a **mock API** suite. An initial isolated attempt failed on relative evidence paths and Turbopack's symlink-root restriction; [that failed log](playwright-isolated.log) is retained. No app source was changed to accommodate this harness.

Five browser failures: replay-date URL remains old; saved-operation and shared-floor click timeouts; player explorer click timeout; team detail selector missing after navigation. Treat these as observed failures in the isolated dev harness, not proven production defects without reproduction. One skip and nine dev warnings remain explicit. The ordinary repository command has not passed in this occupied-port environment.

## Viewports, zoom and limits

Production screenshots: 2560×1440 (CSS viewport, DPR 1), 1440×900, 375×812, and 1280×720 for each of Stats/Ask/Settings. Browser document scrollWidth equals viewport width in these captures; that alone cannot exclude clipped inner content. Owner's Dell physical 1440p display was not attached/measured by this headless run.

Files labelled `zoom` are **unzoomed fallback captures**: attempted Ctrl+plus did not change DPR/CSS viewport. Actual 200% browser zoom is explicitly **untested** and must be verified in PF02/PF09. No screenshot here establishes contrast/focus/task acceptance. No provider/model inference, free-source discovery, dataset acquisition, publication, paid fallback or Live polling was performed. dbt build, fresh application migrations/restore, all-route task paths and historical result reproduction remain untested in PF00.

PF00's verified boundary is the inventory and measured failure baseline. **Next: PF01 query correctness**, using these real release/query identities and preserving legacy total-points semantics. PF02 may follow PF00 under its named Flash ownership; it must preview Stats/Ask/Settings before propagation. Keep the baseline failures visible while assigning fixes to their owning block or existing source backlog.

Final documentation links/newlines and `git diff --check` pass. [Completion record](completion.json) records cleanup. Session-owned 8150/3150 servers stopped; existing services remain untouched. Preservation comparisons report zero changes across all 1,029 retained evidence files, 316 artifact files and pre-existing dirty application files outside owned documents.
