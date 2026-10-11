# FO14: responsive, accessibility and final sweep

Implementation evidence for the final [frontend-overhaul block](../../frontend-overhaul-plan.md#fo14-responsive-accessibility-and-final-sweep),
following FO13 commit `73dffc8`. Captured on October 10–11, 2026 using an isolated production dashboard,
the retained local API and the fixture API. Status: **implemented_unverified**. Owner visual
acceptance remains pending; this report does not grant accessibility certification.

## Changes

- Stats values, percentiles, rank cells and numeric sort headers align right with tabular digits.
  Its stylesheet now participates in the `pages` cascade layer, allowing the shared foundation
  to enforce control sizes. Preset and segmented labels stop shrinking into one another.
- Phone buttons, disclosures, form controls, tabs and menu items have a 40px minimum hit area.
  Standalone navigation and table links receive the same target. Stats' player link contains the name and
  subtitle together, retaining its 52px standard row. Finance record links also have a full target.
  Inline prose links retain their text geometry.
- The skip link focuses `main`; keyboard focus is visible on lookup inputs, scrollable table
  regions, tab panels and the Ask composer. Profile, team-compare and shared-floor tables are
  keyboard-scrollable named regions. Header anchoring respects the fixed header.
- Named generic elements now have appropriate group, region, image or status semantics. Portrait
  fallbacks, team stacks, percentile badges, summaries and loading states retain their accessible
  names. Unknown StatTiles provide screen-reader text beside a decorative em dash. The style
  guide's sample selects are named. New lint enforcement prevents unsupported generic labels.
- Article loading contents use the same horizontal phone/tablet pill strip as the finished
  Article layout. All six template skeletons are captured. Similar Players receives a query
  skeleton, Retry recovery and the shared 16px post-filter gutter. Skeletons retain a solid
  token fill when reduced motion removes the shimmer image; they previously became transparent.
- Distribution values appear in a spaced legend, so nearby percentiles cannot overlap on phones.
  The plotted points, percentile formulas and chart geometry are unchanged. Profile trend
  headings wrap with a token gap instead of overlapping their average labels.
- The last raw page title is removed: the 404 page uses `PageHeader` with a Return home action.
  Both page-pattern exception lists are now empty. The reduced-motion style-guide status uses
  CSS to avoid a server/client text mismatch.
- Floating lookup geometry uses typed CSS custom properties. The inline-style lint selector now
  inspects conditional objects and type assertions. Skeleton's style prop accepts custom
  properties only. The [source audit](verification/source-styles.json) resolves all **49** authored
  style attributes, including helper calls and typed spreads: **0 raw properties, 0 unresolved**.
- Ask's scope chip uses the shared Through-date formatter, preserving the exclusive cutoff.
  Numeric result columns align right; ID columns keep their identity treatment. Layout, threads,
  transport, provider routing and analytical contracts remain preserved.

No Python, acquisition, publication, metric formula, frozen identifier or sealed analytical
artifact is changed. Unresolved replica/impact/finance source gates are retained. No Databallr
requests, provider questions, external messages or data writes were performed by the capture tools.

## Verification

| Check | Final result | Evidence |
| --- | --- | --- |
| ESLint + Stylelint | 0 errors, 0 warnings | [log](verification/lint.log) |
| TypeScript | Pass | [log](verification/typecheck.log) |
| Production webpack build | Pass | [log](verification/build.log) |
| Vitest | 357 passed, 54 files | [log](verification/unit.log) |
| Focused FO14 + Stats browser cases | 24 passed | [log](verification/browser-targeted-final.log) |
| Full browser suite | 355 passed, 15 skipped, 0 failed | [log](verification/browser-final.log) |
| Visual baselines | 66 match; 4 new, 32 refreshed, 30 unchanged | [integrity](verification/baseline-integrity.json) |
| Ruff / formatting / mypy | Clean; 654 formatted files, 208 typed files | [Ruff](verification/ruff.log), [format](verification/ruff-format.log), [mypy](verification/mypy.log) |
| Style audit and lint ratchet probes | 49 custom-property-only attributes; prohibited examples rejected | [audit](verification/source-styles.json), [probes](verification/lint-ratchet-probes.json) |

Verification uses `~/.cache/courtlens-fo14/dashboard`, fixture API `:4102`, production fixture
dashboard `:3102`, and retained-API dashboard `:3103`. The [tested-tree manifest](verification/tested-tree.json)
compares 514 dashboard files. Application and test contents match; only the fixture listen port
and generated Next type import differ. Installed dependencies are shared by symlink, so the
production build uses webpack, as in preceding blocks. No dependency or project build configuration
was changed. Python tests were not rerun for this frontend-only block; the pre-existing unrelated
Python edit is excluded from this commit.

Reproduce fixture checks from the isolated dashboard directory with
`PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://localhost:3102 npx playwright test --workers=2`.
Running from that directory keeps older screenshot-evidence tests from rewriting source evidence.
Baselines are refreshed with the same command restricted to `e2e/visual-baselines.spec.ts` and
`--update-snapshots=all`. The commit names the reasons: numeric alignment, phone targets and final
accessible presentation.

## Route, keyboard and accessibility evidence

[Before/after index](index.md), [measurements](measurements.json), [summary](summary.json),
[per-route glance matrix](glance.md) and [machine-readable glance record](glance.json).
The scripts discover all **52 current page files**, add the 404/manual-Ask states, and preserve
all FO00 URLs and redirects: **72 route states × 4 views = 288 captures**.

| View | Geometry |
| --- | --- |
| Desktop | 1440 × 900 CSS px |
| Tablet | 768 × 900 CSS px |
| Phone | 390 × 844 CSS px |
| 200% desktop reflow | 720 × 450 CSS px, device scale factor 2 |

The fourth view reproduces the layout viewport of a 1440 × 900 desktop at 200% zoom. It is a
reflow check, not a claim that browser chrome zoom was exercised. The dedicated keyboard case
opens the filter sheet, checks its focus trap, escapes and verifies focus return at that size.

Final measured exceptions: **0 page/image errors, 0 page overflow, 0 short phone/reflow targets,
0 clipped control labels, 0 misaligned numeric cells, 0 skip-link failures, 0 invisible sampled
focus indicators, 0 exposed UUIDs/hashes/cutoff rules/ISO dates, and 0 post-filter gaps below 16px**.
Desktop leading results/findings start within 400px. This measures the leading result surface,
not every table's first data row. The 404 page has no analytical result.

Every capture runs axe WCAG 2 A/AA, 2.1 AA and 2.2 AA tags and samples up to twelve tab stops
after Skip to content. The full browser suite also covers dialogs, drawer/search navigation,
focus return, profile tabs, board controls, reduced motion, states and preserved analytical behavior.
Automated violations: **0**. 86 incomplete rule/route/view results remain, for
partly obscured/clipped contrast checks and empty-table header associations. Unsupported generic
ARIA labels were corrected, rather than counted as passing. The [before review](verification/accessibility-review-before-label-fixes.json)
and [final accessible trees/review samples](verification/accessibility-review-samples.json) preserve
the findings. They are not a physical screen-reader session.

[Token contrast measurements](verification/token-contrast.md): primary text is at least 14.20:1,
secondary text at least 7.15:1 across the four documented surfaces. Shortcut text moved from
tertiary to secondary on surface 3 (4.13:1 → 7.15:1). Tertiary-on-surface-3 is not approved for
normal essential text. Contrast incompletes remain explicit in the raw evidence, including
offscreen sticky table headers; automated output is not a blanket conformance claim.

## Glance test and state review

The [72-row matrix](glance.md) records all ten handoff items per state. Desktop and phone
screenshots were reviewed in contact sheets; tablet and reflow captures provide additional layout
and measured accessibility evidence. Numeric table cells use tabular/right alignment; table
scroll stays within its region; primary-subject images retain their fallbacks and associations.
Required uncertainty and unavailable-source wording stays in its existing disclosures.

Explicit partial items remain on two preserved experiences:

- `/design` deliberately demonstrates multiple page headers and filter bars. It is the internal
  style guide, not a product result page.
- Manual Ask retains its form and provider disclosure under the assistant handoff. Its filter,
  first-screen/copy-density and state items are partial against the general page template.
  FO14 corrects shared tokens, targets, labels, dates and focus without redesigning that experience.

Article prose is its approved reading content. Fixed scopes retain an inline context bar on
phones instead of presenting an empty Filters sheet. Threaded Ask preserves its revamp layout;
its visually hidden page title and intentionally ellipsized history names retain full accessible
names. These are recorded contracts, not new owner approvals.

[State measurements](states/measurements.json) cover **29 state records / 31 screenshots**:
header/search at five widths, two drawer widths, six templates at three widths, plus Similar
Players loading/error at three widths. Article skeleton contents are horizontal at 768/390;
Similar Players exposes its loading status and a 40px Retry action on phones. Search modals stay
centered; the retained header-pill offsets at 1280/1440 are the previously recorded fit constraint,
with zero offset at 1920 and tablet and the pill hidden on phones. No new centering acceptance
is inferred from those values.

Authored inline styles are custom-property-only. Captures also record Motion-generated
transform/opacity and Next's route-announcer styles; these are runtime output, not newly authored
raw style assignments. Motion's existing allowlist and reduced-motion policy remain enforced.

## Diagnostic and preservation notes

Earlier checks found an obsolete Stats portrait-centering assertion after numeric values moved
right. It now measures the actual gutter between column edges, retaining the 1px tolerance and
row/portrait dimensions. A 404 test now accepts the preserved scope query on the home redirect.
The unknown StatTile test now checks the screen-reader text and decorative dash semantics.
Diagnostic logs/measurements under `verification/` precede the final fixes; use the final paths
linked above for completion evidence. Command logs normalize line endings and trailing whitespace only.

An early browser run was accidentally launched from the source dashboard and regenerated 103
older screenshot artifacts. Their exact HEAD bytes were restored; the [integrity record](verification/historical-evidence-integrity.json)
documents that correction. All subsequent broad runs used the isolated directory. No older sealed
evidence remains modified. An early capture was also interrupted while cleaning up owned browser
resources; final captures use bounded concurrency and completed without errors.

The unrelated `scripts/test_python.py` edit, the subsequently present `TODO.md` edit, and both
pre-FO10 stashes remain outside this commit. Work used the active Codex runtime; the handoff's
specified Opus 5.5 runtime is unavailable. Owned verification servers are stopped after completion;
the owner's API `:8001` and development dashboard `:3100` are retained.

FO14 is the final planned implementation block; no FO15+ is defined. Final owner visual acceptance
remains pending in the [overhaul progress log](../../frontend-overhaul-progress.md).
