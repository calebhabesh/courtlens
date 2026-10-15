# Contract table header and the Earlier Transactions disclosure

Owner instructions 64–65, 2026-10-15.

- **Earlier Transactions (64).** The hover highlight reached past the content edge, so it is now
  removed. Control kit v1 gains a `text` variant: transparent, no inline padding, and the text
  brightens on hover with no fill. The keyboard focus ring is kept. The disclosure uses this
  variant, and the margin workaround from instruction 63 is deleted. The label starts at the
  dates' edge (45 px at 1440, 29 px at 390), and the hovered background measures transparent.
- **Contract header (64).** Every header and cell is centered. Salary, Terms and Events sit over
  the middle of their columns. Contract Events is centered on its own column, with each
  season's events forming one centered block that reads left to right. Season is a group label
  like the others and spans both header rows. The header row has no vertical rules; the body
  keeps its column-group rules.
- **Header spacing (65).** The contract header matches the career table's header exactly: 28 px
  group labels over 40 px column labels, 68 px in all. Padding, sizes and weights match too.
  The leftmost headers are centered. That covers the career table's Year label and the
  contract's section labels, now "Current Contract" and "Salary History" inside the Season
  column (the history count moves to the label's tooltip so it no longer wraps).

- **Column distribution (66).** "Current Contract" now sits in the column-label row, under Season,
  so it shares a bottom edge with Team, Salary, % of Cap, Option, Guaranteed and Contract Events.
  Salary History stays as a section row. The table uses a fixed layout with equal data columns
  (147 px each at 1440, 114 px at 390), and Events takes 32% (200 px on phones). Measured centers
  at 1440: the Salary group label and the Salary column label are both at 449 px, Terms is at
  816 px (between Option at 743 and Guaranteed at 890), and Events and Contract Events are both
  at 1179 px. All seven column labels end at the same y.

Production sandbox build, Kawhi Leonard (202695), read-only proxy to retained local data:

| View | Desktop | Phone |
| --- | --- | --- |
| Contract table | [1440](contract-1440.png) | [390](contract-390.png) |
| Career header (centered Year) | [1440](career-header-1440.png) | [390](career-header-390.png) |
| Earlier Transactions hovered | [1440](earlier-transactions-hover-1440.png) | [390](earlier-transactions-hover-390.png) |

Dashboard lint and typecheck pass, along with all 527 Vitest tests and 31 Playwright checks
(player-reference, player-career, fo14-accessibility, players-fo09); after instruction 66, 25 checks
(player-reference, player-career, fo14-accessibility) and the full Vitest suite pass again. Owner alignment is still
pending.
