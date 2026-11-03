# Stats enters once on opening and refresh

Owner follow-up 72, October 17, 2026. Ready for owner review.

The table now waits for hydration, the initial URL defaults and saved workspace preferences.
Its body fades in once over `--dur-base`. The animation class clears when the fade finishes.
Later sorts, filters and view changes retain the existing body settle animations. Reduced motion
uses the short opacity fade without translation.

This replaces the unfinished 20-row cascade and module-global two-second replay guard. The
existing client URL canonicalization and stable table key remain. No analytical query or player
page behavior changed. Browsers reporting `scripting: none` bypass the pending opacity rule.

## Reproduction and browser evidence

The inherited recording showed rows entering, disappearing and entering again. Repeated baseline
probes did not consistently reproduce that full sequence. Delaying JavaScript established that
the old row entrance could finish before hydration and URL synchronization. The regression test
failed against that build because it observed `enterRise` while hydration scripts remained blocked.

`dashboard/e2e/stats-entrance.spec.ts` covers opening and refresh with standard and saved compact
density, blocked hydration scripts, reduced motion and delayed saved-view restoration. It counts
animation starts and verifies that completed table and row animations are removed. These five
checks pass in the production sandbox. The existing Stats interaction checks also pass.

The final live captures use the production dashboard on 3180 and a read-only API proxy on 4180.
The proxy permits GET, HEAD, OPTIONS and only `POST /api/workbench/query`. The owner's servers
remain running.

| Width | Opening | Refresh | Settled body and row animations | Page overflow |
| --- | --- | --- | --- | --- |
| 1440 | One `enterFade` | One `enterFade` | `none` | None |
| 390 | One `enterFade` | One `enterFade` | `none` | None |

Measurements are in [live-verification.json](live-verification.json). The captures are
[desktop](stats-1440.png) and [phone](stats-390.png).

## Verification

- Production webpack build, dashboard lint and TypeScript checks pass.
- The six Stats specs pass, 31 tests total: `stats-entrance`, `stats-followups`,
  `stats-readability-search`, `stats-preview`, `stats-darko` and `stats-glossary`.
- Vitest passes all 568 tests but exits with four unhandled animation-cancellation
  errors in `components/ui/header.test.tsx`. Running that file alone reproduces the errors.
  Neither the header nor its tests changed in this work. See [unit.log](unit.log) and
  [header-unit.log](header-unit.log).

To run the browser checks against a prepared fixture sandbox:

```sh
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://localhost:3180 \
  npm --prefix dashboard run test:browser -- \
  e2e/stats-entrance.spec.ts e2e/stats-followups.spec.ts \
  e2e/stats-readability-search.spec.ts e2e/stats-preview.spec.ts \
  e2e/stats-darko.spec.ts e2e/stats-glossary.spec.ts --workers=2
```

## Scoped glance check

The settled page retains the existing Stats layout. Desktop and phone captures pass the scoped
checks for the owner-approved heading, filters, first result, alignment, player identity,
missing-data presentation, icons, states, phone overflow and dates. The desktop table starts
within 400 px. No new controls, copy or geometry were introduced.
