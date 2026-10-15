# Contract table, career season totals and the Per 36 view

Owner instructions 56–58, 2026-10-15.

- **Contract (56).** The Contract panel is one table styled like the career table: a pinned Season
  column, Salary (Team, Salary, % of Cap), Terms (Option, Guaranteed) and Events group headers,
  Current Contract and Salary History section rows, and gold Remaining Guaranteed and Career
  Earnings rows pinned to the foot of the scroll area on desktop. Each dated contract event sits on
  the row for its NBA season (July to June). The table lists events that fall outside those
  seasons, or have no date, under Other Contract Events. Salary history no longer sits behind a
  disclosure.
- **Career totals (57).** Below the career table: "Total = N Seasons", then each team's logo
  with its season count in first-team order. The counts come from each season row's teams, so a
  split season counts for each team, and the footnote says so when that happens.
- **Rates (Per 36) (58).** Removed from Stats, the player career table and the recoverable
  canonical presets. Each of its columns duplicates the Per 36 counting mode in Overview,
  Shooting or Defense, including the 3PA, FTA and PF rates. `advanced` stays a reserved
  built-in view ID so existing saved bundles still validate.

## Verification

Captured from a production sandbox build at 3180. It read retained local data for Kawhi Leonard
(202695) through a read-only GET proxy at 4180. There were no page errors, and the page width
equals the viewport at 1440 and 390. Kawhi's footer reads Total = 14 Seasons: SAS 7, TOR 1,
LAC 6.

| View | Desktop | Phone |
| --- | --- | --- |
| Contract table | [1440](contract-1440.png) | [390](contract-390.png), [scrolled to events](contract-390-right.png) |
| Career table footer | [1440](career-1440.png) | [390](career-390.png) |
| Career view tabs without Rates (Per 36) | [1440](views-1440.png) | |

Checks: dashboard lint (0 warnings) and typecheck pass, along with 527 Vitest tests and 47
Playwright checks across player-reference, player-career, player-profile, players-fo09, workbench,
fo14-accessibility and stats-readability-search, run against the fixture API. The targeted
personal-state and workspace pytest files pass (21 passed, 6 Postgres-only skipped), and so do
ruff and mypy on the changed module. Task-owned servers and scratch were removed. Owner
alignment is still pending.
