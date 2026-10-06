# PF02 — shared visual foundation

2026-10-05. **Complete at the shared-foundation boundary.** Parent: [freeze handoff](../../polish-freeze-implementation-plan.md), [UI contract](../../design/polish-ui-contract.md). Read PF00 and PF01a/PF01b evidence and the workbench/replica contracts before implementation. Starting revision remains `daedc03c66e7142c5a23ef918193e86e1b86af1a`; [starting status and SHA-256 inventory](starting-state.json) capture the existing dirty work.

Gemini 3.8 Flash is unavailable in this Codex session. Codex implemented the Flash-owned slice as an explicitly recorded substitution, without delegation. No concurrent shared-file writer. The UI/UX skill supplied focused keyboard-focus guidance; existing fonts, controls and route components were reused.

## Changed behavior and ownership

- Semantic near-black/charcoal surfaces, readable muted text, separate interactive boundaries and decorative separators, shared spacing/control/shell tokens and legacy aliases. Desktop application/navigation/context rows use 56/46/64px minimums. Controls use 40px, increasing to 44px on narrow touch paths.
- Full-width, left-aligned content replaces the global 1600px centered clamp. Articles and conversations can retain a readable width. Removed page-level horizontal-overflow masking; overflow is handled at tables and individual content seams. Settings' long source URL now wraps within its metadata cell.
- Common button reset, hover/focus/disabled conventions and native-select chevron/insets. Player-name and Ask controls have no native gray background. Existing player-name drawer behavior is preserved; PF05 owns the subsequent linked identity/table interactions.
- Shared Button, IconButton, Section and Toolbar primitives; field, status and empty-state CSS conventions extend existing class-based controls. The header Ask action and Settings worker section demonstrate consumption. Existing `.button`/`.panel` routes inherit the same foundation without a component-library migration.
- Pinned `lucide-react` 1.52.0 and a bounded decorative-icon wrapper with 16px/2px stroke convention. Shell Ask/search/menu/chevrons/settings use SVG icons. CourtLoad's basketball mark and local Public Sans/JetBrains Mono fonts remain; the shell subtitle is removed. Later blocks own remaining route/table icon migration.
- Navigation supports Arrow Up/Down, Home/End, Escape with focus return, and a 44px mobile trigger. At 375px the search occupies its own row; header/context remain in normal document flow. Native selects retain semantics, reserve 36px right inset, and use native arrows in forced-colors mode. Reduced-motion styling removes decorative movement.

Owned application files: `dashboard/app/globals.css`, `app/layout.tsx`, `app/settings/page.tsx`, `components/replica-nav.tsx`, `components/global-lookup.tsx` (search icon only), new `components/ui/icon.tsx` and `controls.tsx`, package/lock files. Verification owns bounded hydration waits in `e2e/workbench.spec.ts`, `scripts/verify_pf02_browser.cjs`, `scripts/verify_pf02_proxy.py`, this evidence and freeze progress. Query schemas, arithmetic, lookup engine, branding, assistant behavior and persistence are unchanged.

## Measured checks

| Check | Result |
| --- | --- |
| Dashboard unit tests | **27 files / 176 tests pass** |
| Fixture browser workflows | **21 pass**, zero failures/skips; Workbench and Conversation suites |
| Dashboard ESLint / TypeScript | Pass, zero diagnostics/warnings |
| Ruff / format / strict mypy | Pass; 385 formatted files, 149 typed source files; zero diagnostics |
| Isolated production webpack build | Pass, no build warnings; 52 application page routes retained |
| Real-service production browser | **12 previews**, keyboard/Ask/mobile/disabled/reset checks pass; zero page exceptions |
| Text contrast | Minimum **7.14:1** for text/muted/accent on all three semantic surfaces; control boundary contrast exceeds 3:1 on raised surface |
| Layout/controls | No page horizontal overflow on Stats/Ask/Settings; full-width left alignment; selects at least 40px with 36px right inset; visible 2px accent focus ring |
| Retained investigations | **185 unchanged outcomes**, 137 matching saved hashes and the same 48 existing mismatches |
| Preservation | **1,801** outside-scope starting files, **1,124** prior evidence files, **316** artifacts unchanged |
| `git diff --check` | Pass |

[Production measurements](browser.json), [browser log](browser.log), [fixture browser log](fixture-browser-final.log), [unit log](dashboard-unit.log), [build log](build-webpack.log), [retained reproduction](retained-comparison.json), [checksum preservation](preservation.json). No backend implementation changed; retained reproduction ran through the actual analytical service in read-only PostgreSQL transactions. PF00's broader Python-suite failures remain open; no new full Python-suite/DB migration/restore acceptance is claimed.

Ordinary screenshots use Chromium CSS viewports **2560×1440**, **1440×900**, **375×812**, DPR 1. [Stats wide](stats-wide.png), [Stats desktop](stats-desktop.png), [Stats mobile](stats-mobile.png); [Ask wide](ask-wide.png), [Ask desktop](ask-desktop.png), [Ask mobile](ask-mobile.png); [Settings wide](settings-wide.png), [Settings desktop](settings-desktop.png), [Settings mobile](settings-mobile.png). The fixture [conversation mobile screenshot](fixture-conversation-mobile.png) covers rendered results and reduced-motion/narrow layout separately from real source previews.

Actual browser zoom uses headed Chromium, forced X11 under a 2560×1440 Xvfb screen, OS keyboard input through `xdotool`, and measured DPR changing from 1 to 2 with CSS width approximately halved. Exact final viewport/window dimensions are recorded in `browser.json`; do not infer them from monitor resolution. [Stats at 200%](stats-zoom.png), [Ask at 200%](ask-zoom.png), [Settings at 200%](settings-zoom.png) capture the actual browser window, including browser chrome, through ImageMagick `import`. These are viewport captures; ordinary screenshots are full-page. Playwright's zoom screenshot path cropped the image at the CSS/physical-pixel boundary, so it is not the final zoom evidence.

Real previews use the existing FastAPI/PostgreSQL service through a local **read-only passthrough** on 8154. There are no response substitutions. The proxy permits GET and the read-only Stats query POST, rejects other mutations, and declares CORS only for the two isolated preview origins. The original service's CORS allowlist excludes the temporary ports, so directly compiling its URL left Ask configuration reads in an error/loading state. This is a verification-environment distinction; product CORS settings were not changed. The final build compiles the proxy URL and the real server uses it internally. Fixture execution uses the repository mock service on 4154 plus existing browser request fixtures, including assistant failure/empty/retry states; it is not real-provider language evaluation.

The initial broader fixture run and a subsequent run hit duplicate streamed DOM controls/headings before hydration. Raw [initial failure](fixture-browser.log) and [streaming failure](fixture-browser-streaming.log) remain. Home/Teams tests now wait for route network completion before interaction; selectors/assertions were not relaxed. Final suites pass. Early measurements also corrected inherited 32px context selects, insufficient boundary contrast and a 5px Settings metadata overflow.

Package install/audit reports **seven pre-existing dependency findings** (six high, one critical), separately from zero-warning checks. [Raw audit](npm-audit.json) and [prior/current affected package versions](npm-audit-baseline.json) show no affected version changed; Lucide is not among the findings. No broad dependency upgrade or automatic audit fix was performed.

## Reproduction and limits

```bash
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
npm --prefix dashboard test
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
.venv/bin/python scripts/verify_pf02_proxy.py
```

Build an isolated dashboard copy with shared installed dependencies (the [temporary path](build-directory.txt) is session-specific): `NEXT_PUBLIC_COURTLOAD_API_URL=http://127.0.0.1:8154 npm run build -- --webpack`. Copy `public` and `.next/static` into corresponding standalone paths, following the installed Next.js output guide. Start the standalone server with `PORT=3154 HOSTNAME=127.0.0.1 COURTLOAD_API_INTERNAL_URL=http://127.0.0.1:8154 node .next/standalone/server.js`. From the repository root:

```bash
xvfb-run -a -s '-screen 0 2560x1440x24' node scripts/verify_pf02_browser.cjs
```

For fixtures, bind a copy of `dashboard/e2e/mock-api.mjs` to 4154 and start the same standalone build on 3155 with its internal API pointing to 4154. Run:

```bash
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3155 \
  npm --prefix dashboard run test:browser -- workbench.spec.ts conversation.spec.ts --workers=1
```

Source facts/evidence are real in the production preview; no inference, acquisition, publication, migration, persistent workspace change or Live demand occurred. Reads of assistant configuration/definitions do not invoke a provider. [Raw output resource measurements](resources.json) record 1,632,185 bytes of emitted JavaScript and 55,852 bytes of CSS; these are not compressed transfer or memory measurements. No new API/lookup latency benchmark is claimed. Timing/resource budgets for analytics and lookup are unchanged, and this slice adds no query/model work per keystroke. Broader route coverage, team branding, recurring guides, shared pickers, assistant copy/defaults/history, and source gates remain their later blocks. PF09 is still pending. Next dependency: **PF03**.

Reference: [official Lucide React documentation](https://lucide.dev/guide/react) describes named SVG imports and tree shaking; no runtime icon CDN is used.
