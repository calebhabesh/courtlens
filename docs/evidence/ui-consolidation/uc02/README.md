# UC02 control kit evidence

Captured 2026-10-14 from the production dashboard in an isolated disk-backed sandbox, using
Chromium, dark theme, 1440×900 desktop and 390×844 phone (touch enabled). The owner's API on
8000 and dashboard on 3100 stayed running. The sandbox used dashboard 3180 and fixture API
4180; its dashboard, dependencies and evidence fixtures were copies, so builds, screenshots
and test outputs could not modify the running checkout or historical evidence.

## Verification

- `npm --prefix dashboard run lint`: ESLint and Stylelint pass with zero errors/warnings.
  The existing Stylelint rules accept the Tailwind directives without relaxing a contract.
- `npm --prefix dashboard run typecheck`: pass.
- `npm --prefix dashboard test`: 75 files, 480 tests pass; 17 new component tests cover actions,
  refs, loading/disabled/toggle semantics, links/disclosures, native selection, removal, custom
  overlay triggers, keyboard focus, roving radios and deferred updates/cancellation.
- Full `npm run test:browser -- --workers=4 --reporter=line` in the sandbox: 459 pass,
  27 opt-in real-service tests skip, zero failures. This includes four new kit tests, 92 tests
  in `visual-baselines.spec.ts`, and 22 in the other PC12 screenshot specs (some widths test
  layout without taking a screenshot). Existing baseline files and thresholds are unchanged.
- `.venv/bin/pytest tests/unit/test_frozen_identifiers.py -q`: 6 pass.
- `git diff --check`: pass.

The new browser tests measure the rendered controls at both widths: button/icon heights
28/32/36/40 on desktop and 40 on phone, square icon targets, zero block padding, 8/12 px inline
padding, 12/13 px type, 14/16 px glyphs, 8 px button gap, native select sizes and selection, and
segmented group/item heights with 4 px padding. They exercise selected hover, keyboard-only
focus, reduced-motion 1 ms durations, press scale, select hover, overlay keyboard dismissal and
compositor indicator behavior under reduced motion.

The initial browser pass caught inherited 40 px minimum heights on smaller selects and the
existing global 140 ms reduced-motion fade token. The kit now resets its minimum height and
uses the instant token under reduced motion without changing legacy behavior. A new press
assertion now polls the computed CSS so it waits for the 1 ms transition to settle. The chart
showcase test now uses the existing streamed-page navigation helper; otherwise a transient
hidden server-rendered copy can cause duplicate-ID locator failures. An initial sandbox run
also lacked copied evidence fixtures; the final run has a complete, isolated copy.

## Captures and measurements

[`capture-kit.mjs`](capture-kit.mjs) captures seven panels plus the C13 comparison at both
widths and writes [`measurements.json`](measurements.json). Each viewport samples 387 control
or group nodes. Both have zero page errors and zero horizontal overflow. Captures use reduced
motion to stabilize state geometry; they are new evidence, not replacements for baseline files.

To repeat against a running dashboard from the repository root:

```sh
UC02_BASE_URL=http://localhost:3100 node docs/evidence/ui-consolidation/uc02/capture-kit.mjs
```

| Panel | Desktop | Phone |
| --- | --- | --- |
| Button and icon size × variant × state matrix | [1440](panel-1-1440.png) | [390](panel-1-390.png) |
| Links, disclosures and tones | [1440](panel-2-1440.png) | [390](panel-2-390.png) |
| Native selects | [1440](panel-3-1440.png) | [390](panel-3-390.png) |
| Menu and popover triggers | [1440](panel-4-1440.png) | [390](panel-4-390.png) |
| Segmented groups | [1440](panel-5-1440.png) | [390](panel-5-390.png) |
| Toggle and removable chips | [1440](panel-6-1440.png) | [390](panel-6-390.png) |
| C13 proposal with existing reference | [1440](panel-7-1440.png) | [390](panel-7-390.png) |

Hover/press/focus cells in the matrix are live interaction targets: hover, hold the pointer, or
Tab to them to inspect that state. Selected, disabled and loading are rendered simultaneously.

## C13 owner review

The [desktop comparison](c13-1440.png) shows the current filter-bar segmented control above the
proposed kit group: individual desktop items change 36 → 32 px, with 4 px group padding on
each side. The [phone comparison](c13-390.png) keeps the 40 px item target and makes the group
48 px. The comparison is on `/design#control-kit`; no existing page adopts this change in UC02.

**Pending owner approval before the UC04 filter-bar migration.** No baseline is regenerated.

## Implementation boundary

New components live in `dashboard/components/ui/kit/`; the legacy components and callers stay
in place for UC04. Tailwind 4.3.3 is pinned, has no preflight, scans only the kit, and prefixes all
utilities with `kit:`. Token values stay in `tokens.css`; the inline reference theme emits only
utilities. Restricting source scanning alone would still collide with legacy class names such
as `text-sm`, so the prefix is required. The final utilities layer owns kit geometry and states.
The UC03 control/CSS ratchets have not started.
