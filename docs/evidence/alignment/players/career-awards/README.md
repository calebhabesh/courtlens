# Career awards column and readable badges

Owner instructions 52–53, 2026-10-14. Awards now has its own visible group header and an
Accolades subheader, matching the career table's other sections.

The fixed-layout table previously gave the awards cell about 73 px while its badges occupied
one unbroken line. Badges overflowed the cell, past its divider and hover background. The
column now has an explicit 240 px width. It uses the same body and hover backgrounds as
metric cells, and its static `Badge` components wrap inside the cell.

Labels distinguish team selections, voting finishes and winners. Examples are `All-NBA 1st`,
`All-Def 2nd`, `MVP 2nd`, `Clutch 10th` and `DPOY Winner`. Gold marks a won major award.
Full names are available as pointer titles and screen-reader text. All-Star stays beside the
year. Unrecognized codes remain visible without an inferred meaning.

## Browser evidence

The [before measurements](before/browser-verification.json) show overflowing badges and
different awards and metric hover colors at both widths. The two new browser cases
[fail on the previous implementation](before/regression.txt).

The production sandbox reads retained local data for Kawhi Leonard through a GET-only proxy.
All 14 career rows fit the column at both widths. Rows with several awards use two lines.
Row heights remain 52 px on desktop and 49 px on phone. The awards cell ends at the table's
right edge, its hover color matches the last metric, and neither page scrolls horizontally.
The [live measurements](browser-verification.json) record every row and the browser errors list
is empty.

| View | Desktop, 1440 px | Phone, 390 px |
| --- | --- | --- |
| Before, synthetic awards fixture | [Table](before/career-1440.png) | [Table](before/career-390.png) |
| After, retained Kawhi data | [Table](career-1440.png) | [Table](career-390.png) |
| Complete player page | [Page](player-1440.png) | [Page](player-390.png) |

Scoped glance test passes at both widths: visible group and subcategory, readable team names
and voting places, two compact badge lines, continuous row background and dividers, aligned
Accolades label and badges, and no page overflow. The pinned Year regression also passes.

## Verification

[Check output](verification.txt) records dashboard lint with no warnings, typecheck, all 526
Vitest tests, the production webpack build, and 15 affected Playwright checks. The browser
checks cover career rows, wrapping, hover colors, view changes, pinned Year cells, navigation,
profile sections and reference data. Python files did not change.

The isolated dashboard runs at 3180, with fixtures or the read-only local-data proxy at 4180.
Production checks use `next start` against the webpack build, with sandbox dependencies
symlinked from the checkout. Next emits its existing standalone-start advisory. Packaging and
the owner's servers are outside this fix. Task-owned servers and scratch are removed after
verification. Owner alignment remains pending.

Repeat the live layout check against a sandbox with:

```bash
node scripts/verify_player_career_awards.cjs
```

`PLAYWRIGHT_BASE_URL`, `PLAYER_ID` and `EVIDENCE_DIR` select the sandbox, player and output.
`VERIFY_BEFORE=1` captures measurements without the fixed-layout assertions.

## Centered subheader follow-up, 2026-10-15

Instruction 54 centers Accolades under Awards and matches its bottom padding to the other
stat headers. Only the awards header gets the alignment and padding override. Body badges
retain their left alignment.

Production fixture measurements at 1440 and 390 show identical text centers for both headings.
Accolades and every metric header have 4 px bottom padding. The first badge retains its 13 px
inset, and the page has no horizontal overflow. Scoped glance passes at both widths.

[Desktop](centered-heading/career-1440.png), [phone](centered-heading/career-390.png) and
[measurements](centered-heading/measurements.json). Dashboard lint/typecheck, 526 Vitest tests,
production build and all seven career-table browser checks pass. Owner alignment remains pending.
