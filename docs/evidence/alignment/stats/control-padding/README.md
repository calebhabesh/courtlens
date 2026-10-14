# Stats 71: control padding (2026-10-14)

Owner instruction: center text in buttons, containers and dropdowns; dropdowns had more padding on
the right than the left, and this repeats across the site. Owner chose "even, mirror sides": left =
right and top = bottom, with control sizes otherwise unchanged.

## Method

Each control's visible content (text, icons, chevrons) was located in a 4x screenshot and compared
with the control's exact fractional box. An earlier pass that clipped screenshots to whole pixels
misread up to ~1 px on the right edge; all numbers below use the exact box. Vertical centering was
also checked from layout (cap height vs box): every control is within 0.3 px.

## Causes and fixes

- Selects (`.ui-select`): the chevron icon box sat 12 px from the right edge, but the Lucide chevron
  leaves 5 of its 24 units empty, so the visible chevron sat ~15 px in versus ~12.5 px of text inset
  on the left. The chevron now moves 4 units outward and the end padding shrinks by the same amount
  (`foundation.css`), so the text-to-chevron gap is unchanged.
- Other controls ending in a chevron (season picker, menu triggers such as Export/Explore/More, nav
  menus): the chevron moves 3 units outward, matching a leading icon or letter. `Icon` now emits a
  size class (`ui-icon-14/16/20`) so the offset follows the icon size.
- Team chip remove buttons (`.entity-chip button`, Team Compare): the 40 px hit area pinned its ×
  to the left edge (0 px left, 24 px right); it is now centered.

## Measurements (visible gap, css px, left / right)

| Control | Before | After |
| --- | --- | --- |
| Compare: Filter by season select | 12.75 / 15.17 | 12.75 / 12.50 |
| Compare: competition phase select | 12.81 / 15.45 | 12.98 / 12.11 |
| Compare: Analysis window select | 12.53 / 15.11 | 12.38 / 12.09 |
| Stats: Season 2025-26 picker | 13.00 / 14.83 | 13.00 / 13.08 |
| Recent Games: Export menu | not measured | 13.19 / 12.75 |
| Team Compare: remove team × | 0 / 24 (icon box) | centered |

Survey after the change (13 pages: Stats, Players, Compare, Teams, Team Compare, Recent Games, a
player profile, RAPM, WOWY, Similar Players, Matchups, Showcase, Data Status): no select or chevron
trigger is off by 1 px or more. Remaining 1.0 to 1.5 px cases come from glyph shapes, not padding:
Data details and Through date (leading database/calendar icons), Swap Teams (arrow icon), Similar
Players minimum selects (digit side bearings), Teams "Why?". Text-only buttons are laid out exactly
symmetric (12/12 or 8/8).

## Verification

- Dashboard lint (ESLint + Stylelint), typecheck, Vitest 463/463.
- Full Playwright suite on an isolated build: 446 passed. Rebuilt without this change, the same
  failing specs were rerun: all failures except the Stats desktop visual baseline already failed
  before it (PC12 D example boards, Compare Export, Teams strict-mode, home heading, guide modes,
  phone pill strip, Stats phone baseline, select-popup screenshots). The Stats desktop baseline
  differs by sub-pixel position shifts from the narrower selects and nav chevrons; regenerate it
  with the other stale Stats baselines when Stats is committed.

Screenshots: `stats-1440.png`, `stats-390.png` (live local data).
