# PC02 first-load glance review

Captured 2026-10-11 from a production build at commit 978d804 against the real local database, with no URL parameters. Items 1–10 are the overhaul glance test; N1–N4 are the presentation-clarity additions. P pass, ~ partial, F fail, - n/a, ? not measured (alignment, icons and loading states need geometry probes and injected states).

| Route | First load | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | N1 | N2 | N3 | N4 | Owner block |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/stats` | real | P | P | P | ? | P | P | ? | ? | P | P | P | ~ | F | ~ | PC03 + PC12 |
| `/` | real | P | P | P | ? | P | P | ? | ? | P | P | P | ~ | F | ~ | PC12 |
| `/players` | real | ~ | P | P | ? | P | P | ? | ? | P | P | P | ~ | F | ~ | PC12 |
| `/teams` | real | P | P | P | ? | P | P | ? | ? | P | P | P | F | F | ~ | PC12 |
| `/teams/1610612760` | real | ~ | P | P | ? | P | P | ? | ? | P | P | P | F | ~ | ~ | PC12 |
| `/compare` | prompt | P | P | F | ? | - | - | ? | ? | P | P | F | F | - | F | PC04 |
| `/team-compare` | real | P | P | ~ | ? | P | P | ? | ? | ~ | P | P | ~ | ~ | ~ | PC03 + PC12 |
| `/last-games` | real | P | P | P | ? | P | P | ? | ? | P | P | P | P | F | ~ | PC04 |
| `/showcase` | real | P | P | P | ? | P | P | ? | ? | P | P | P | P | ~ | ~ | PC03 |
| `/similar-players` | real | P | P | P | ? | P | P | ? | ? | P | P | P | ~ | F | ~ | PC04 + PC03 |
| `/similar-players/shot-profile` | prompt | P | ~ | F | ? | - | - | ? | ? | P | P | F | F | - | F | PC04 |
| `/roster-shapes` | prompt | P | P | ~ | ? | P | P | ? | ? | P | ~ | F | F | - | F | PC10 |
| `/playoffs` | real | F | P | P | ? | P | P | ? | ? | P | P | P | ~ | ~ | ~ | PC12 |
| `/playoffs/2026-r1-det-orl` | real | P | P | P | ? | P | P | ? | ? | P | P | P | ~ | ~ | ~ | PC12 |
| `/live` | gate | P | P | F | ? | - | ~ | ? | ? | P | P | F | F | - | F | PC04 |
| `/live/2026-10-11` | gate | P | P | F | ? | - | ~ | ? | ? | P | P | F | F | - | F | PC04 |
| `/live/games/[id]` | broken | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | F | ? | ? | F | PC04 |
| `/wowy` | prompt | P | ~ | F | ? | P | - | ? | ? | P | P | F | F | - | F | PC07 + PC11 |
| `/stat-line-shift` | prompt | P | P | F | ? | - | - | ? | ? | P | P | F | F | - | F | PC07 + PC04 |
| `/matchups` | prompt | P | ~ | F | ? | - | - | ? | ? | P | P | F | F | - | F | PC07 + PC04 |
| `/wingspan` | fake | P | P | P | ? | - | F | ? | ? | P | P | P | ~ | F | ~ | PC07 (purge now) |
| `/contracts` | prompt | P | ~ | F | ? | - | ~ | ? | ? | P | P | F | F | - | F | PC06 + PC08 |
| `/contracts/[team]` | broken | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | F | ? | ? | F | PC08 |
| `/free-agency` | prompt | P | ~ | F | ? | - | ~ | ? | ? | P | P | F | F | - | F | PC06 + PC08 |
| `/rankings` | personal | P | P | F | ? | - | ~ | ? | ? | P | P | F | - | - | F | PC12 |
| `/tierlist` | personal | P | P | ~ | ? | - | ~ | ? | ? | P | P | F | - | F | - | PC12 |
| `/calculator` | real | P | P | P | ? | - | P | ? | ? | P | P | P | P | ~ | - | PC03 |
| `/planner` | fake | P | P | P | ? | - | F | ? | ? | P | P | P | ~ | F | - | PC11 |
| `/forecasts` | real | P | P | P | ? | P | P | ? | ? | P | P | P | ~ | ~ | P | PC12 |
| `/evaluation` | broken | P | - | F | ? | - | ~ | ? | ? | P | P | F | F | - | F | PC12 |
| `/investigations` | real | P | P | P | ? | - | P | ? | ? | P | P | P | F | - | P | PC12 / PC13 |
| `/investigations/saved/3bcb…` | real | ~ | P | P | ? | - | P | ? | ? | P | P | P | ~ | ~ | P | PC12 |
| `/methodology` | text | P | - | P | ? | - | P | ? | ? | P | P | P | - | - | P | — |
| `/methodology/learning` | text | P | - | P | ? | - | P | ? | ? | P | P | P | - | - | P | — |
| `/whats-new` | text | P | - | P | ? | - | P | ? | ? | P | P | P | - | - | P | PC13 |
| `/whats-new/blog` | text | P | - | P | ? | - | P | ? | ? | P | P | P | - | - | P | — |
| `/data-status` | real | P | P | P | ? | - | P | ? | ? | P | P | P | F | - | ~ | PC13 |
| `/settings` | text | P | - | P | ? | - | P | ? | ? | P | P | P | - | - | P | PC13 |
| `/design` | text | ~ | ~ | F | ? | P | P | ? | ? | P | P | P | - | - | P | PC13 |
| `/research/ask` | real | P | - | P | ? | - | P | ? | ? | P | P | P | - | - | P | PC13 |
| `/research/case-studies` | real | P | P | P | ? | P | P | ? | ? | P | P | P | ~ | ~ | P | — |
| `/research/defensive-matchups` | gate | P | - | F | ? | - | F | ? | ? | P | P | F | F | - | F | PC07 + PC11 |
| `/research/epv` | gate | P | - | F | ? | - | F | ? | ? | P | P | F | F | - | F | PC11 |
| `/research/operation` | broken | P | - | F | ? | - | F | ? | ? | P | P | F | F | - | F | PC04 |
| `/research/rapm` | real | P | P | P | ? | ~ | P | ? | ? | P | P | P | F | ~ | ~ | PC12 |
| `/research/rapm/six-factor` | gate | P | - | F | ? | - | F | ? | ? | P | P | F | F | - | F | PC11 |
| `/research/shooting` | real | P | ~ | P | ? | - | P | ? | ? | P | P | P | F | - | P | PC12 |
| `/research/shooting/adjusted` | gate | P | - | F | ? | - | F | ? | ? | P | P | F | F | - | F | PC07 + PC11 |
| `/research/shooting/aftermath` | prompt | P | ~ | F | ? | - | - | ? | ? | P | P | F | F | - | F | PC04 |
| `/research/distributions` | real | P | P | P | ? | P | P | ? | ? | P | P | P | P | ~ | ~ | PC04 |
| `/research/trends` | real | P | P | P | ? | P | P | ? | ? | P | P | P | ~ | F | ~ | PC03 + PC12 |
| `/players/1629029` | real | P | P | P | ? | P | P | ? | ? | P | P | P | P | ~ | ~ | PC12 |
