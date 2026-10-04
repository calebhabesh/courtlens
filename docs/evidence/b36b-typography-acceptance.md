# B36b selected typography and production acceptance

2026-10-04. **Owner-selected Public Sans + JetBrains Mono; B36 verified.**
The owner agreed with the B36a recommendation and authorized the next packaging
block. This closes the selection boundary in the feature contract. Current Codex
session; no delegated agents or model override. Existing dirty work and sealed
analytical artifacts are preserved.

[Production measurements](b36b-production-accepted/verification.json),
[font identities and notices](../../dashboard/public/fonts/manifest.json), and
[B36b verification](b36b-verification.json).

## Packaging

The two official upright variable WOFF2 files are bundled unchanged: Public Sans
2.001, weights 100–900, **41,944 bytes**, and JetBrains Mono 2.251, weights 100–800,
**91,484 bytes**. Their SHA-256 hashes match the owner-reviewed B36a files. The
bundled notices match embedded copyright/license metadata and include the complete
upstream licenses: [Public Sans](https://raw.githubusercontent.com/uswds/public-sans/master/LICENSE.md)
and [JetBrains Mono](https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/OFL.txt).
License notices and the source manifest are included in the standalone/Docker public
asset copy and served under `/fonts/`.

`next/font/local` retains the existing sans/mono semantic roles, preloads both faces
and uses `display: swap`. Public Sans uses Next's adjusted Arial fallback; data text
uses a monospace fallback without an Arial metric adjustment. Tables explicitly
request tabular figures; data/code classes disable programming ligatures. No
Google/Fontshare import or font acquisition remains in application code. Builds
consume repository files; normal operation needs no font service.

The fresh Next.js **16.3.5** standalone build runs on port **3137**, with a separate
FastAPI process on **8036**, real retained PostgreSQL and Gemini explicitly disabled.
The active development build and prior B35/B36a servers are preserved. All B36-owned
dashboard files match the staging source. Static/public assets are copied using the
existing Docker packaging pattern; a Docker image rebuild is not claimed.

## Measured rendering and loading

- **Four cold production navigations**, fresh browser contexts with disabled cache:
  real Stats, scatter, Toronto finance and retained conversational distribution.
  **Eight delivered font requests** have the expected source hashes, HTTP 200 and
  same-origin URLs; both preload links exist on each page. Delivered license hashes
  match. **Zero external requests, zero page errors** in the font acceptance run.
- Cold-load CLS maximum session-window values: Stats **0**, scatter **0**, finance
  **0.052138**, conversation **0**. These include initial navigation/data hydration
  through ready content, settled fonts and another 1.2 seconds; they are bounded
  Chromium lab observations, not field measurements or font-only attribution.
- Stats with fonts delayed **1.5 seconds**: CLS **0.001080**. With both font URLs
  blocked: CLS **0**, 50 rows and readable fallback text remain. Chromium retries
  failures (four requests for two unique font URLs); the harness records that behavior.
- Digits have equal advances at 400/500/600 in interface tabular and data roles.
  Data width remains **8.406px** at 14px. Bounded names/signs/operator samples pass
  the browser fallback-width heuristic; the exact bundled font cmaps independently
  contain `Jokić Dončić Porziņģis Şengün +−%– 1Il0O`. Specimens render at 12/14/18px.
  These checks do not establish coverage for every name/script.
- Stats retains 50 rows, the release ID, regular season, 2023–24 and exclusive
  2024-04-15 cutoff. Row height stays **45.6875px**, table width **1400.421875px**,
  agreeing with the approved candidate's density.
- **19 new screenshots**: four surfaces at desktop, 375px, landscape and CSS 200%
  zoom, plus glyphs and delayed/blocked Stats. Reduced motion is enabled; Tab reaches
  the skip link. All measured workspace widths fit their main area, with horizontal
  data tables inside their scroll regions. Full keyboard acceptance remains supported
  by the existing dashboard workflows rather than inferred from skip-link checks.

Screenshot review caught finance clipping that body-overflow checks missed: a grid's
implicit minimum track expanded despite `overflow-x: hidden` on the body. A bounded
single grid track, shrinkable children and a wrapping heading fix this. The harness
now checks workspace and finance-heading widths as well as body overflow. No finance
queries, formulas or records change.

## Checks and retained evidence

Fresh production build, zero-warning ESLint, strict TypeScript, **164 Vitest tests /
26 files**, complete Playwright fixture suite **82 passed / 1 opt-in real-workspace
skip** with four workers, and **8 final finance browser checks** pass. Browser setup
now waits for the root redirect and settled fonts; two selectors target rendered
`main` content instead of Next's transient streamed duplicates. Failed initial
probes are retained and superseded by accepted checks. The initial build staging
symlink was rejected by Turbopack; a local dependency copy resolved that packaging
setup issue without application changes.

The final retained-operation check and manifest record reproduction/export status.
Font acceptance independently verifies saved inventory equality before/after and
allows only GETs plus read-only finance query POSTs. No provider, Live lease, source
acquisition, publication, training or new analytical save is needed. Python and
warehouse behavior are unchanged; their prior evidence is not represented as rerun.

B36 is complete. **B32 actual changing-game/finality/correction observations, the
unmet Gemini language gate, and deeper source/model gates remain open.** This block
does not establish full replica completion.
