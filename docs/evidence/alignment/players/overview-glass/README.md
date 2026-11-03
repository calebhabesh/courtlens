# Glass panels below the player career table

Owner instruction 55, 2026-10-15. Player Impact, Recent Form, Contract, Transactions and Career
Highs now use the headline cards' glass treatment. One shared `player-glass` rule supplies the
58% surface-0 tint, 20 px backdrop blur with 150% saturation, 10% rim, 14 px corners and soft
shadow. Each section has one container with 20 px padding on desktop and 16 px on phone.
Tables, lists and disclosures stay inside their section.

Section headings and subsection labels use title case, including Current Contract, Contract
Events, Reported Career Earnings, Salary History and Earlier Transactions. Impact's Off and Def
labels stay with their values when space narrows. The first two panels share a height on
desktop and stack on phone. Static labels use the container text tokens, and phone salary and
highs tables retain an opaque pinned first column.

## Measured verification

The [browser report](browser-verification.json) records retained local data for Kawhi Leonard
at 1440×900 and 390×844. All five panels match the headline card's actual fill, border, radius,
shadow and backdrop filter. There is no background image or nested glass, and headings have no
content filter. Page widths equal the viewport both before and after expanding salary history
and earlier transactions. Wide tables scroll inside their panel. No page errors occurred.

Computed text contrast is at least 5.88:1 across the sampled primary, secondary, accent, link,
contract-option and recent-form colors. The report models the actual tint over the saturated
blue backdrop and the fallback without backdrop filters. Every sampled pair exceeds 4.5:1.

| View | Desktop | Phone |
| --- | --- | --- |
| Player Impact and Recent Form | [Panels](impact-form-1440.png) | [Panels](impact-form-390.png) |
| Complete player page | [Page](player-1440.png) | [Page](player-390.png) |

Scoped glance passes at both widths: consistent glass across each whole panel, readable labels,
title-case headings, aligned padding, clear row separation and no sideways page scroll.
The phone tables remain scrollable, and the existing pinned-Year and awards checks pass.

[Check output](verification.txt) records dashboard lint with no warnings, typecheck, all 526
Vitest tests, the production webpack build and 15 affected Playwright checks. Existing copy
assertions were updated for title case. Python files did not change.

Runtime verification uses an isolated production dashboard at 3180 and fixture API or local-data
proxy at 4180. The proxy permits GET, HEAD and the read-only POST workbench query. The sandbox
uses `next start` with symlinked dependencies and emits Next's standalone-start advisory.
Packaging is outside this styling change. Task-owned servers and scratch are removed after
verification. Owner alignment remains pending.

Repeat the live checks against a sandbox with:

```bash
node scripts/verify_player_overview_glass.cjs
```

`PLAYWRIGHT_BASE_URL`, `PLAYER_ID` and `EVIDENCE_DIR` select the sandbox, player and output.
