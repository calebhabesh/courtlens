# Transaction News

Owner instruction 63, 2026-10-15. The player page's Transactions section is now **Transaction
News** (heading and region name). The Earlier Transactions disclosure no longer looks indented.
Its `<details>` wrapper takes back the ghost button's 12 px inline padding, so the label starts
at the same edge as the dates. The revealed list moves back to that edge. The control itself
is unchanged (control kit v1).

A production sandbox build read Kawhi Leonard (202695) through a read-only proxy. The label's
left edge equals the first date's: 45 px at 1440 and 29 px at 390. After the disclosure opens,
all 11 dates share one left edge. There were no page errors, and the page width equals the
viewport.

| View | Desktop | Phone |
| --- | --- | --- |
| Closed | [1440](tx-1440.png) | [390](tx-390.png) |
| Earlier Transactions open | [1440](tx-open-1440.png) | [390](tx-open-390.png) |

Dashboard lint, all 527 Vitest tests and 9 player-reference/player-career Playwright checks pass.
Owner alignment is still pending.
