# Site links plan

Make CourtLens read like Basketball-Reference or Wikipedia: every player, team, game and playoff
series named on a page is a link to its page, carrying the season it was shown in. It keeps every
analytical, identity, data and source contract, the control kit and the approved page layouts.
Work one block at a time, in order. Record measured evidence in the
[site links progress log](site-links-progress.md). Only the owner marks a block ✅.

**Status: SL01–SL06 built 2026-11-14; SL04 and SL05 gates decided (D7–D16, owner delegated); all blocks await the owner's ✅.**

## Decided (owner, 2026-11-14)

The owner confirmed D1–D4 as recommended ("go with your recommendation"). D5 and D6 are the
plan's technical defaults; they were not put to the owner as questions.

- **D1 Look.** Two styles, no blue (blue is `--color-identity-b`, "Subject B" on Compare and WOWY).
  - *Entity links* in tables, cards and headers: the surrounding text colour; accent colour and
    underline on hover and keyboard focus. Being consistent is the affordance: every player name
    and team code is a link, on every page.
  - *Prose links* in Methodology, Learning, Ask answers and page copy: accent colour, always
    underlined (the existing `.ui-article-section` style), first mention per block only.
- **D2 Live cards.** The card stays one target that opens the game. Each team's logo and code is
  its own link on top of it. The compact rail cards stay single-target.
- **D3 Ask.** In scope, last block, dashboard only.
- **D4 Graph.** Each hub page (player, team, game, series) gets a Related row built from data the
  page already loads. Backlinks that need new endpoints and hover previews are out of this plan.
- **D5 What a link carries.** Season always; phase when it is playoffs; `beforeDate` and
  `releaseId` only where the source page is pinned to them today (Team Compare). Table filters,
  sort and paging stay behind.
- **D6 Team id.** Links name the franchise id plus the season; the team page resolves the era
  (`franchiseOf`, `seasonTeamId` in `lib/team-era.ts`), so a 2005-06 link opens the Sonics.

## Decided at the SL04 gate (owner delegated the choice, 2026-11-14)

The owner asked the agent to pick what is best for CourtLens ("choose the optimal ones").

- **D7 Look.** The D1 hover look as built on approved pages is accepted (`docs/evidence/site-links/gate/`).
- **D8 Badges.** A logo-only badge beside a name that already links stays plain; team codes and
  names shown as text link. One target per mention keeps dense rows calm and tap targets apart.
- **D9 Phone heights.** New links follow the site's existing phone link rule (`main a`, 40 px,
  < 768 px), except inside headings and identity subtitles. Consistent tap targets beat a few
  pixels of density. Re-baseline `pc12-c-public-390.png` (first task of SL05).
- **D10 Live phase.** Live team links carry the phase when the Live data says the game is a playoff
  game; until it does, they carry the season only and SL02 opens the regular season. SL05 checks
  whether the Live read exposes a season type and passes `phase` if it does (no guessing from dates).
- **D11 Deferred files.** `player-bio-header.tsx` (header team, draft team) and
  `player-reference-sections.tsx` (team cells) are linked once the owner's player-page work in
  them is committed; until then they are untouched.
- **D12 Series links keep the bracket's cutoff.** The bracket → series link carries `beforeDate`
  and `releaseId` (the series page reads both), a D5 exception like Team Compare.
- **D13 SL03 crawl criterion** reads: the href set differs from the baseline only by team ids (D6)
  and D5 scope.

## Decided at the SL05 gate (owner delegated the choice, 2026-11-14)

The owner asked the agent to pick what is best for the site ("use your best judgment").

- **D14 Position.** The Related row stays at the end of each hub's content, like Wikipedia's "See
  also". The top of each hub already carries its main links (the player header's team and Explore
  menu, the game banner's teams, the series' Compare teams), and the hub layouts are owner-approved,
  so the row adds links without changing those layouts.
- **D15 Team page series.** The team page links the season's bracket, not each series. Series slugs
  are not in the data the page loads; building them from tricodes would be guessing ids, which the
  ids-only rule forbids. One more click through the bracket, no new read.
- **D16 Contracts on a player page** name the team a roster source lists him on today, because
  Contracts shows only today's books, where his current deal lives. A season team's books would not
  include him. Free agents and retired players get no Contracts link.

## Rules every block follows

- **Ids only.** A name becomes a link when the data row carries its id. A row without one (a Live
  player whose `canonical_id` is null, a name Ask wrote without a result behind it) renders as
  plain text. Names are never matched to ids by similarity.
- **Real anchors.** Every link is an `<a>` through `next/link`, so middle-click, new tab and copy
  link work. An entity link inside a clickable card or row sits above a stretched primary link
  (the primary link's `::after` covers the card); anchors are never nested.
- **Self links are plain.** A link to the page it sits on renders as text.
- **These stay plain:** options inside pickers, search suggestions and segmented controls, compare
  slots and tray chips, chart tooltips (hover-only, unreachable on phones; link the legend or the
  panel that opens on click), exported images, and the subject in its own page header.
- **No viewport prefetch.** Entity links pass `prefetch={false}` (precedent: `team-schedule.tsx`);
  a 30-row table must not send 30 requests to the shared VPS.
  Revised by [speed plan](speed-plan.md) SP03 (2026-11-15): entity links prefetch on intent only
  (pointer resting 80 ms, keyboard focus, touch start), never on entering the viewport.
- **Tap targets.** At least 24 px tall in tables; 44 px for the team targets on Live cards at 390.
- **Checks.** Targeted Vitest and the touched Playwright specs per block; the full Playwright suite
  once after SL04 and once before merge, because SL03 and SL04 change shared components.

| Block | What | Status |
| --- | --- | --- |
| SL01 | Builders, link components, styles, lint rule | built 2026-11-14 |
| SL02 | Entity pages accept any link | built 2026-11-14 |
| SL03 | Move the existing links onto the builders | built 2026-11-14 |
| SL04 | Link every remaining name; Live cards | built 2026-11-14; gate decided (D7–D13) |
| SL05 | Related row on player, team, game and series pages | built 2026-11-14; gate decided (D14–D16) |
| SL06 | Links in Ask answers | built 2026-11-14 |

## SL01 Builders, components, styles, lint

- `dashboard/lib/entity-links.ts`: pure `playerHref`, `teamHref`, `gameHref`, `seriesHref`, each
  taking an id and a scope (`season`, `phase`, optional `beforeDate`, `releaseId`, `tab`).
  - `teamHref` accepts a franchise id, tricode or era code and emits the franchise id (D6). A
    folded team (era with `franchise_id` null) keeps its code as its id.
  - Games have two id spaces. Live pages are keyed by ESPN's id
    (`/live/games/{source_id}?date=`); warehouse games open through
    `/live/open?date=&game=&teams=`, which redirects. `gameHref` covers both.
- `dashboard/components/entity-link.tsx`: `PlayerLink`, `TeamLink`, `GameLink`, `SeriesLink`. Each
  renders the anchor, or a plain `<span>` when the id is missing or the link is a self link, so
  call sites never branch.
- One CSS file for the entity-link style (D1), imported from `globals.css`; a "Links" section in
  [Design Language](design/design-language-v1.md) stating D1 and the rules above.
- ESLint: add a `no-restricted-syntax` rule banning string and template literals that start with
  `/players/`, `/teams/`, `/live/games/`, `/live/open` or `/playoffs/` outside
  `lib/entity-links.ts` and tests. Follow the `PENDING_NATIVE_DATE` pattern in
  `eslint.config.mjs`: list today's offenders as pending so lint stays green until SL03.

**Done when:** unit tests pass for every builder, including Thunder in 2005-06 → Sonics, a folded
team, a null id → span, and a self link → span; a lint fixture test goes red on a raw
`/players/` literal; lint, typecheck and Vitest pass.

## SL02 Entity pages accept any link

Link sites can't know which seasons a player or team has, so the destination resolves it.

- **Player page.** Today it checks played seasons only when the link has no season
  (`app/players/[id]/page.tsx`, the `played` fallback). With a season the player has no games in,
  or playoffs he missed, open the latest played season at or before the one asked for (else his
  earliest; regular season when the playoffs are missing). The URL ends up naming the season
  shown, and the page says once what was asked for and what is shown. A player with no seasons at
  all keeps today's bio-only page.
- **Team page.** Same rule for a franchise with no team that season (`franchiseActive`) and for
  playoffs it missed.
- **Unknown ids** reach the not-found page with a way back, not an error.
- `e2e/site-links-crawl.spec.ts` (real data, in the style of the `*-real` specs): from seed pages
  (Live, a game, Stats, a player, a team, Standings, Playoffs, a series, Draft, Contracts) collect
  every internal `href`, group by route pattern, open up to five per pattern, and assert a 200
  page without an empty or error state. Record the baseline in the progress log; later blocks
  re-run it.

**Done when:** on the owner's real data, a 2026-27 link for a retired player, a playoffs link for
a player who missed them, a pre-2002-03 New Orleans link, a 2005-06 Thunder link and a folded
team's link each land as specified, and the crawl passes with its counts logged.

## SL03 Move the existing links

54 non-test files hold hand-built player or team hrefs (44 with player links, 9 with team links,
plus the local `gameHref`/`seriesHref` helpers). Team links disagree on the id: `standings-view`
and `team-division-standings` use the tricode, the rest `team_id`.

- Replace each with a builder or link component. Hard-coded example links in page copy go through
  the builders too.
- The Explore menu on the player page (`workbench-player-profile.tsx`) navigates with
  `router.push`; make its items real links.
- Behaviour stays the same except: team ids are normalised (D6), viewport prefetch is off, and
  scope follows D5.

**Done when:** the pending list in `eslint.config.mjs` is empty and lint passes with no file
exempt; the crawl's href set differs from the SL02 baseline only by the normalised team ids;
touched specs pass three times; AGENTS.md gains the standing rule ("build every player, team,
game and series href with `lib/entity-links.ts`").

## SL04 Link every remaining name; Live cards

- **Shared cells first.** `GridPlayer` (`research/stats-grid.tsx`), `PlayerIdentity` and
  `TeamIdentity` (`ui/identity.tsx`) and `TeamCode` (`playoffs-series-sections.tsx`) link by
  default from the id and season they already receive; callers opt out only for the plain cases
  in the rules above.
- **Audit.** The survey found 54 files rendering a team logo or code with no team link and 16
  rendering a portrait with no player link. List every one in the progress log with a verdict:
  linked, or plain with the rule that applies. The owner's example comes first: Live.
- **Live board** (`GameCard` in `live-board.tsx` is one `<Link>` around the whole card): make the
  card a container with a stretched link to the game and a `TeamLink` on each logo and code (D2).
  The number-key shortcuts still open the game; tab order is game, away team, home team.
- **Live game page:** team names in the banner, box-score headers and injuries link to the team in
  that game's season.
- **Charts:** link legends and click panels, never tooltips.

**Done when:** the audit table has a verdict for every file; from a Live card each team opens its
team page for that season and the rest of the card opens the game, by mouse, keyboard and touch
at 390; an axe run on Live finds no nested-interactive violation; scrolling Stats in a production
build sends zero prefetch requests for entity links; Back from a player page returns Stats,
Standings and Live to the same filters and scroll position; crawl and full Playwright pass.

**Owner gate.** These pages were marked ✅ and now look different on hover and focus. Show
screenshots of Stats, a Live card and one Research table at 1440 and 390 with a link hovered, and
stop for the owner's answer before SL05.

## SL05 Related row

One component, the same position on all four hubs, built only from data the page already loads
(no new endpoints, no new Caddy entries):

- **Player:** his team that season, Compare, Similar Players, Last Games, Matchups, his draft
  class, his team's contracts.
- **Team:** Standings, schedule, Roster Shapes, Contracts, Team Compare, playoff series that
  season.
- **Game:** both teams, each team's schedule, the series when it is a playoff game.
- **Series:** both teams, the bracket, each game.

A destination the release can't serve (`routeAvailability`) is left out, not shown disabled.

**Done when:** each hub shows the row with every listed link that the scope supports, the crawl
covers the new links, and the owner has seen 1440 and 390 screenshots.

## SL06 Links in Ask answers

Dashboard only. The agent's tool declarations are frozen and pinned byte for byte by the replay
tests; result rows already carry `player_id` (and `team_id` in one tool).

- **Result tables** (`agent-answer.tsx`): a row with a `player_id` or `team_id` links its name
  cell.
- **Prose** (`InlineProse`): after the answer has finished streaming, link the first exact
  full-name mention of each player or team whose id appears in this turn's results, when that
  name maps to exactly one id. Everything else stays plain. The unverified-sentence marking keeps
  working on the same character positions.
- Scope comes from the result's own season when it has one; otherwise the link carries none and
  SL02 picks the season.

**Done when:** Vitest covers a linked row, a first mention linked once, two players sharing a
name (plain), a name with no result (plain) and an unverified sentence containing a link; one real
question on the owner's dev stack shows working links; the frozen replay tests pass unchanged.
