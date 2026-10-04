# B35 integration acceptance review

2026-10-04. B35c closes the outstanding local Linux Chromium installation,
production packaging and cross-feature integration acceptance slice. It consumes
B35a/B35b retained-operation contracts and B37 recovery evidence. It does not close
the full replica's independent source, model, language or Live gates.

## Measured installation and deployment

[Installation evidence](b35c-install-accepted/verification.json) uses Chromium
153.0.8010.52 with a real headed Xvfb display, isolated persistent profile and isolated
XDG desktop directories. The localhost origin is a browser-recognized secure context.
The browser reports no manifest installability errors. CDP `PWA.install` creates a
real installed app and Linux `.desktop` launcher, including the manifest's saved
investigations and manual research shortcuts. CDP's user display preference is set
to standalone because its install path defaults to browser display.

The installed app launches through `PWA.launch`, reports the actual standalone
media query and shows Settings' standalone status. After closing Chromium, a new
Chromium process reuses the profile with the generated desktop launcher's `--app-id`;
it opens `/stats` with standalone display still true. No install events are dispatched
and no media features are emulated. Launcher and screenshots are retained. The
isolated app is then uninstalled and the launcher disappears. The temporary profile
is removed; the owner's browser/profile/desktop are unaffected. This verifies Linux
browser/OS registration and launch, not a human install-dialog interaction or other
operating systems. [Protocol reference](https://chromedevtools.github.io/devtools-protocol/tot/PWA/).

A fresh Next.js 16.3.5 build is made from the current dashboard in a separate temporary
staging directory, preserving the active development server and its `.next` output.
It runs the generated `.next/standalone/server.js` with copied `public` and
`.next/static`, traced original Markdown and runtime internal API URL. The compiled
public API URL is `http://127.0.0.1:8000`; the site is `http://127.0.0.1:3135`.
FastAPI runs against real retained PostgreSQL data with Gemini keys explicitly empty
and the acceptance origin admitted by CORS. Neither server starts a worker.

## Integration boundaries

| Connection | Fresh evidence and boundary |
| --- | --- |
| Retained operations → exact evidence → reproduction/export → manual view | [All 12 operation types](b35c-retained-corrected/verification.json) reproduce with match, download JSON/CSV and open exact backend destinations with HTTP 200. Retained JSON hashes agree. Existing explicit saved record reused; inventory stays 33. Zero page errors. |
| Methodology/learning/blog/patch notes/settings/library | [Six content pages](b35c-integration-corrected/verification.json) hydrate without page errors. Learning points to a pinned real distribution; originals render from the packaged Markdown. All observed local links resolve. |
| Navigation → feature views | All six dropdowns exercise 38 links retaining release, season, phase and cutoff. Across content and menus, 66 local destinations return HTTP 200; Stats/player destinations also check their actual analytical API responses. Gated feature routes remain availability surfaces; HTTP 200 does not certify their data or models. |
| Production static assets and icons | 22 observed assets return HTTP 200 with hashes/byte sizes retained. Three manifest PNG dimensions match metadata. Ordinary immutable static caching carries no analytical freshness claim. |
| Personal workspace → persistence/conflict/export/import | [One real browser check](b35c-workspace.log) passes, including stale-version 409 and cross-origin 403. Only two uniquely named personal test workspaces are created. |
| Optional AI → manual core | API reports AI unconfigured. Retention/reproduction and navigation do not require inference. No new provider evaluation is claimed. |
| Installed shell → local data | Actual launch observes zero service workers and Cache Storage entries. Local API/database are required for analytical operations, Live and exports; no offline writes or source-currentness promise. |
| Live → historical/research | Menu destinations resolve; this audit does not hydrate the Live view or create upstream polling demand. Actual changing-game/finality/correction observations remain B32's gate. |
| Read-only acceptance → immutable data | [Integrity comparison](b35c-integrity.json) keeps published pointers and finance release identities unchanged. Saved inventory/hashes are verified separately above. No acquisition, publication, training, finance import or new analytical save occurs. |

Browser navigation cancels speculative RSC requests (`net::ERR_ABORTED` with `_rsc`).
They are recorded separately in the link audit; no other failed request or page error
passes the gate. The initial probe treated those cancellations as failures; its log
is retained. The installation probe initially assumed an app-ID hash formula; the
accepted harness instead reads Chromium's generated launcher. The first retained
browser probe used an older build compiled for port 8037; a fresh staging build
resolved that harness/deployment mismatch.

## Historical Stats correction

The API log review found a failure hidden by Next's HTTP-200 unavailable page:
archive Stats SQL assumed `archive_identities.display_name` and
`archive_player_games.phase`, neither of which exists in the archive schema.
A direct pinned historical query returned HTTP 500. A new execution regression
also failed on the missing identity column before the fix. The query now joins
`archive_versions` through each game's retained `source_version_id` for its name
and filters phase only for workbench rows; resolved archive context already admits
regular season exclusively. This matches the established archive reader, preserves
versioned source identity/cutoffs, and does not change metric formulas or data.

All 12 focused Stats checks pass, including the new real PostgreSQL name-search
and independent points reconciliation regression. The original pinned API query
now returns HTTP 200. The strengthened integration audit requires the analytical
API to return HTTP 200 for Stats/player destinations rather than trusting only the
page status. All 12 retained operation types reproduce again after the fix; the
accepted API log has no exceptions. Earlier page-only evidence is superseded by
`b35c-integration-corrected` and `b35c-retained-corrected`.

## Reproduction

Build with the intended public API URL; that URL is compiled into browser assets.
Set the internal API URL when launching the standalone server. Copy public/static
assets as required by the bundled Next `output` documentation and existing Dockerfile.
Run a local FastAPI process with Gemini disabled and CORS admitting the site origin.
With those services running:

```bash
node scripts/verify_b35_install.cjs NEW_INSTALL_EVIDENCE_DIRECTORY
node scripts/verify_b35_integration.cjs NEW_LINK_EVIDENCE_DIRECTORY
B35B_API_URL=http://127.0.0.1:8000 B35B_SITE_URL=http://127.0.0.1:3135 \
  node scripts/verify_b35b_browser.cjs NEW_RETAINED_EVIDENCE_DIRECTORY --reuse-saved
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3135 COURTLOAD_REAL_WORKSPACE_TEST=1 \
  npm --prefix dashboard run test:browser:real -- e2e/workspace-persistence.spec.ts
```

The install/link harnesses accept `B35_SITE_URL`; the link harness also accepts
`B35_API_URL`. Installation requires Linux Chromium and Xvfb. Use fresh output
paths. The retained-operation harness expects this installation's 12 retained
operation types and existing explicit B35b scoring-distribution record.

Fresh build, ESLint (zero warnings), TypeScript and 164 Vitest tests pass. The archive Stats integration correction passes all 12 Stats tests against real
PostgreSQL, including a regression reconciling versioned names and cutoff-bound metrics.
Strict Ruff check/format (339 files) and mypy (144 source files) pass. The broader
full PostgreSQL suite and restore results remain dated B37 evidence, not newly rerun checks. Repository-wide
diff checking finds two pre-existing trailing-whitespace lines in
`docs/evidence/performance.md`; B35-owned additions have no whitespace errors.
B36 remains preference-deferred; B32 and the measured unmet Gemini language gate,
along with deeper source/model gates, remain independent of this completed slice.
