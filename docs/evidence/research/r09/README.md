# R09 — Draft Classes

Measured 2026-11-06 on branch `research-r09`. Parent: [Research progress](../../../research-progress.md), [Research handoff](../../../research-plan.md). Registration: [`courtlens-draft-value-v1`](../../../../evaluation/research/registrations/courtlens-draft-value-v1.json), content hash `475cf772d4efcbe4…`. Results: [`courtlens-draft-value-v1.json`](../../../../evaluation/research/frozen/courtlens-draft-value-v1.json), `7b7bd3b8f9a87409…`. Page: `/draft`, Research → Tools → Draft Classes (catalog row 28). Built under D13: a plain page and a finished API. Only the owner marks it ✅.

## Status

| Part | State |
| --- | --- |
| Draft lists | Every class 1966–2026, pick numbers 1..N with no gap; 6,581 picks |
| Data check | [`data-check.json`](data-check.json), committed with the code (`fb5d421`) before the registration |
| Registration | Commit `207a9b5`, 2026-11-06 06:37 UTC, after the code commit (which cannot run without it) |
| Results | One `test` read right after the registration commit, as a separate command. Two `reproduce` runs give the same hash. The runner refuses a second `test` |
| Rookie tracker | Served live by the API with the registered rule; checked on the published 2026-27 games through 2026-11-04 |
| Page | `/draft`, plain D13 build, verified on real data |

## Owner input

The build-phase rule asks for Databallr's screenshots first. The owner supplied three saved Draftballr pages (dashboard, 2026 lottery result, resources) and said: Draftballr is its own site with a different design language, so don't replicate it; use CourtLens's and Databallr's design language and add relevant data. Draftballr is a prospect site: big board, scouting film, college stats, lottery odds, a redraft view. Prospect boards and college stats stay out (D4, R13 parked). The redraft view maps to the class retrospectives, and the 2026 class table serves as the draft board.

## Data coverage by year

[`data-check.json`](data-check.json) has every class. Summary:

| Classes | Pick list source | Classes | Picks | Picks at 1–60 | Picks with a player identity | How identified |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1966–1995 | Wikipedia "<year> NBA draft" articles (CC BY-SA 4.0), rendered pages at 5 s, revision IDs kept | 30 | 4,748 | 1,762 | 1,584 | NBA.com bio draft year and number (1,579, 9 of them with seasons under a Basketball-Reference ID); name rule (5) |
| 1996–1999 | Official NBA Stats `drafthistory`, hoopR mirror (pinned revision `7f2c0afa`) | 4 | 231 | 231 | 231 | NBA person ID (2 with seasons under a Basketball-Reference ID) |
| 2000–2026 | Official draft-history mart (same mirror) | 27 | 1,602 | 1,602 | 1,602 | NBA person ID (1 alias) |

- **Why Wikipedia.** The official mart starts at 2000. The mirror holds 1996–99 too. NBA Stats' own `drafthistory` timed out to curl here (25 s, 0 bytes), as it did to the browser fetcher on 2026-10-08. The Basketball-Reference draft pages were not used: the owner's rule is never to start that crawl, and a second Basketball-Reference fetch path invited confusion. Wikipedia's robots.txt disallows `/w/` and `/api/`, so the rendered articles were read, like the transactions module does.
- **Cross-check.** For all 1,778 NBA.com bio rows with a 1966–99 draft slot, the source list names the same person at that slot. 10 differ only by a later name change or nickname (Lew Alcindor, Chris Jackson, Brian Williams, Sonny Dove…).
- **Only the first table** of each article is the draft; later tables are supplemental, hardship or ABA dispersal drafts (1971, 1975, 1976). They are excluded, as are territorial picks.
- **Season totals** (full-history crawl, 1966-67 to 2025-26) have minutes and win shares on every row. Multi-team seasons use the summary row.
- **Game logs** for the rookie pool are complete from 1983-84 (943 games a season for 23 teams, then every game), so the pool is classes 1983–2025.
- **RAPM** (R01's sealed 1Y fits) covers 2014-15 to 2025-26: classes 2014–2022 have it for their whole window.
- **Combine** rows exist for 2000–2026 (1,152 drafted players); correlations use classes 2000–22.
- **Left out, and why:** ABA value (not NBA value; 1967–76 picks are undervalued and the page says so); undrafted players (no class); prospect and college data (D4).

**Identity rules, as registered.** Name rule: a pick no bio slot names takes a unique same-name player whose bio has no draft (or who has season totals only under a Basketball-Reference ID) and whose first season starts within two seasons of the draft (5 picks). The same rule moves 12 picks whose NBA ID has no season totals to seasons held only under a Basketball-Reference ID (Jo Jo White, Bobby Jones, Dwight Davis, Ömer Aşık, Ron Holland…).

## Disclosures

1. **One pick is credited to the wrong person.** NBA.com's bio gives Walker Russell (1982-83 to 1987-88) and his son Walker Russell Jr. (2011-12, undrafted) the same 1982 slot, pick 78. The build kept the son, so that pick shows 0 win shares and 0 minutes instead of −0.5 win shares and 1,255 minutes in its window. It is beyond pick 60, so value by pick is unchanged; it shifts that pick's rank in the 1982 redraft and adds one zero instead of −0.5 to the "61+" expectation bucket. A duplicate 1983 slot (two Mark Joneses) was resolved correctly. Fixing it needs a v2 registration; the frozen results stand.
2. **Seen before registering.** While building and checking the tables, a few raw season totals were seen (Kobe Bryant's minutes, the four players in the identity checks). No value-by-pick, redraft, surplus or correlation number was computed before the registration commit.
3. **Len Bias** (1986, pick 2) is listed among the misses by the registered rule. He died two days after the draft. The page says that surplus measures what a pick returned, not whether the choice was sound.

## Results

### Value by pick (first four seasons, win shares, 95% bootstrap over the players at each slot)

| Pick | All 1966–2022 | 1966–88 | 1989–2022 | Played any game (all) |
| ---: | --- | --- | --- | ---: |
| 1 | 24.8 (21.2 to 28.6) | 27.3 (21.8 to 34.3) | 23.2 (18.5 to 27.8) | 100% |
| 2 | 17.5 (14.8 to 20.3) | 21.3 (16.6 to 26.0) | 14.8 (11.9 to 18.0) | 98% |
| 3 | 20.3 (17.5 to 23.4) | 21.2 (15.9 to 26.9) | 19.6 (16.4 to 23.0) | 100% |
| 5 | 15.5 (12.7 to 18.5) | 17.0 (11.7 to 23.2) | 14.4 (11.1 to 17.8) | 100% |
| 10 | 10.8 (8.5 to 13.1) | 9.7 (6.5 to 13.1) | 11.5 (8.5 to 14.9) | 100% |
| 14 | 7.9 (6.0 to 9.9) | 8.2 (5.0 to 12.0) | 7.6 (5.3 to 10.2) | 98% |
| 20 | 6.3 (4.6 to 8.2) | 7.3 (3.9 to 11.3) | 5.6 (3.9 to 7.3) | 91% |
| 30 | 5.7 (3.7 to 7.8) | 4.0 (1.2 to 7.9) | 6.8 (4.3 to 9.6) | 88% |
| 31 | 3.9 (2.5 to 5.6) | 4.7 (2.0 to 7.9) | 3.4 (1.8 to 5.3) | 84% |
| 45 | 3.1 (1.8 to 4.7) | 3.3 (0.7 to 6.8) | 3.0 (1.8 to 4.4) | 72% |
| 60 | 1.2 (0.2 to 2.7) | 0.7 (−0.0 to 2.1) | 1.8 (0.1 to 4.7) | 40% |

57 classes at picks 1–54, then fewer (51 at 55–57, 40 at pick 60): the 1989–2004 drafts had 54 to 59 picks. Minutes, career (classes 1966–2005: pick 1 85.2, 66.3 to 106.9 win shares; pick 30 12.2, 6.6 to 18.7) and RAPM views are in the results and on the page. **RAPM by pick (classes 2014–22, 9 per slot)** separates nothing: pick 1 +0.59 (−0.54 to +1.73), pick 10 −0.94 (−2.66 to +0.67); only pick 45's interval excludes zero (−1.79, −3.18 to −0.28).

### Slot bands (registered rule: higher only when the 95% interval excludes zero)

| Ranges, win shares | All | 1966–88 | 1989–2022 |
| --- | --- | --- | --- |
| Pick 1 vs pick 2 | +7.4 (+2.9 to +12.1), higher | +6.0 (−1.7 to +14.2), **no difference** | +8.3 (+2.9 to +13.6), higher |
| Picks 1–3 vs 4–10 | +8.3 (+6.1 to +10.3), higher | +10.0 (+6.6 to +13.8), higher | +7.1 (+4.6 to +9.6), higher |
| Picks 1–10 vs 11–30 | +8.4 (+7.4 to +9.4), higher | +10.1 (+8.4 to +11.9), higher | +7.2 (+5.9 to +8.5), higher |
| Picks 21–30 vs 31–40 | +2.6 (+1.8 to +3.3), higher | +2.0 (+0.7 to +3.2), higher | +3.0 (+2.1 to +4.0), higher |
| Picks 31–45 vs 46–60 | +1.5 (+1.1 to +1.9), higher | +1.2 (+0.5 to +1.9), higher | +1.7 (+1.2 to +2.3), higher |

On minutes, pick 1 vs pick 2 is **no difference** in every era (all: +909, −151 to +1,978); every other band is higher. So the first pick returns more win shares than the second but not measurably more playing time. Pick 3 averages more than pick 2 in every era, but the intervals overlap.

### Redraft, steals and misses (complete classes 1966–2022)

- 57 classes redrafted on four-season and on career win shares. Examples: 2003 redraft puts Dwyane Wade (5) second and Chris Bosh (4) third behind LeBron James; 1984 on career win shares is Jordan, Stockton (16), Barkley, Olajuwon.
- **Biggest steals** (surplus over the slot's leave-one-class-out mean): Kareem Abdul-Jabbar 1969 #1 (+58.7), Chris Paul 2005 #4 (+41.9), Michael Jordan 1984 #3 (+33.8), Spencer Haywood 1971 #30 (+33.3), Charles Barkley 1984 #5 (+31.3).
- **Biggest misses** (first round): Larue Martin 1972 #1 (−26.4), Michael Olowokandi 1998 #1 (−23.8), Anthony Bennett 2013 #1 (−23.4), Chris Washburn 1986 #3 (−22.8), Len Bias 1986 #2 (−22.3), Adam Morrison 2006 #3 (−21.8), Markelle Fultz 2017 #1 (−20.7).
- 274 players from complete classes were still active in 2025-26; their career values are to date.
- Classes 2023–25 (3, 2 and 1 seasons) are shown to date and never redrafted or scored.

### Combine beside value (classes 2000–22, Pearson r with four-season win shares, 95%)

Weight +0.12 (+0.05 to +0.19), wingspan +0.10 (+0.03 to +0.17), standing reach +0.09 (+0.02 to +0.16), height +0.09 (+0.02 to +0.16), wingspan minus height +0.05 (−0.02 to +0.11), max vertical +0.01, lane agility −0.00, sprint −0.04. Against minutes, size is near zero or slightly negative and the sprint and lane agility times are negative (faster players play more: −0.11 and −0.09). All are weak; none is a prediction. 722 to 846 players per measurement.

## Rookie tracker (2026-27)

- The API applies the registered rule at request time. The comparison date is the newest 2026-27 regular-season game in the published logs (2026-11-04 on this run). A rookie's games are read only up to that date. DARKO is the newest current board whose ratings date is on or before it (ratings through 2026-11-02). RAPM is R15b's newest time-decay snapshot cut on or before the next day (cutoff 2026-11-01, games through 2026-10-31).
- Each rookie with g appearances is compared with every player taken at the same pick in classes 1983–2025, over that player's first min(g, G) first-season appearances. A past rookie's later games are never read (tested). The page shows minutes per game, per-36 points, rebounds, assists, steals, blocks and turnovers, and true shooting, each with the rookie's percentile; green or red only outside the pool's 10th to 90th percentile (turnovers reversed). Under 100 minutes is flagged.
- On 2026-11-04: 45 of 60 picks had played; pool sizes 43 at pick 1, 40 at pick 30, 11 at pick 60. Picks with no game read "No games yet".
- DARKO and RAPM are shown, not compared: past rookies have no rating at the same point (DARKO's history is retrospective; RAPM fits are season-level).
- If the published logs have no 2026-27 game, or the pool table isn't on the host (the hosted demo), the API returns that state and the page says so.

## API (GET only)

`/api/draft` (summary: value by pick, bands, steals, misses, class index, combine correlations, sources, credits, caveats), `/api/draft/classes/{year}` (404 outside 1966–2026), `/api/draft/combine`, `/api/draft/rookies`, `/api/draft/rookies/{player_id}`. The frozen results are refused (503) if their hash or their registration's hash changed. Each player row carries a season-matched photo season and team (first NBA season and team, else the draft season).

## Page

`/draft`, five tabs in the URL: Rookies 2026-27 (default), Value by pick (value, era and measure controls; chart and table), Classes (any class 1966–2026, draft, redraft or career order), Steals & misses, Combine (correlations and a scatter by measurement). Coverage, caveats, credits and the method card are on every tab. Control kit, shared tables and `ChartFrame`, `TableCell` tone, no page CSS, no inline styles. Photos are season-matched, and team logos sit beside codes with era logos (Kansas City Kings, Buffalo Braves…).

**Browser check** ([`browser-check.mjs`](browser-check.mjs), [`dom-checks.json`](dom-checks.json)) against a private API on real data: **88,467 values at 1440 (129 page loads) and 25,551 at 390 (32), 0 mismatches, 0 console errors, 0 px horizontal overflow.** It covers every rookie value and percentile, all 45 rookies' comparison tables at 1440, all 13 value-by-pick views with chart points and bands, every class 1966–2026 at 1440 (six at 390), the steals and misses, and all eight combine measurements with every scatter point.

**Source check** ([`verify_against_sources.py`](verify_against_sources.py), [`source-check.json`](source-check.json)): separate SQL reproduces four-season and career win shares and minutes for all 6,335 complete-class picks, with 0 mismatches (11 Basketball-Reference-ID picks skipped). All 27 official classes equal the mart pick for pick. Of 1,581 bio slots, 2 differ: the duplicate slots in disclosure 1.

Screenshots (real data): [`draft-rookies-1440.png`](draft-rookies-1440.png), [`draft-rookies-390.png`](draft-rookies-390.png), [`draft-value-1440.png`](draft-value-1440.png), [`draft-value-390.png`](draft-value-390.png), [`draft-classes-1440.png`](draft-classes-1440.png) (1984 redraft), [`draft-classes-390.png`](draft-classes-390.png), [`draft-steals-1440.png`](draft-steals-1440.png), [`draft-combine-1440.png`](draft-combine-1440.png), plus full pages and 390 versions.

## Checks

- Ruff, format and strict mypy (359 files) clean.
- Python (`scripts/test_python.py`): 2,625 passed, 1 skipped, 8 failed, all the known `test_agent_providers[anthropic]` SDK failures.
- New tests: `tests/unit/test_draft_value.py` (parsers, URL pins, team eras, zero-versus-unknown, RAPM weighting, redraft order, leave-one-class-out expectation, rookie alignment and no later games, end-to-end determinism, refusal of a second read). `tests/unit/test_draft_classes_api.py` (payloads, 404, 503, and checks against the committed data: contiguous picks, censoring, expectations and slot means recomputed from the rows, steals and misses by rule, tracker unknown states).
- Dashboard lint and typecheck clean; Vitest 731 passed (3 new).
- Playwright: the new `e2e/r09-draft-classes.spec.ts` has 7 tests (all pass). The full suite ran once from a production build in a sandbox (mock API, two workers, 8 GiB cap): **558 passed, 17 skipped, 0 failed**; `git status` shows no committed evidence changed.
- Runtime: acquisition 34 requests (about 2.5 min); tables 12 s at 2.4 GiB peak (the first-season game-log read), three builds byte-identical; runner 1.8 s at 186 MiB.

## Commands

```bash
# Reproduce (from a directory with data/ from the main checkout and evaluation/ from this branch)
courtlens acquire-draft-history --seal-only                    # same bundle cfa65a48…
python -m courtlens.evaluation.draft_value_data build          # same five table hashes
python -m courtlens.evaluation.draft_value_runner reproduce    # same results hash
```

## Limitations

- Win shares and minutes measure playing time and box-score production, not impact. RAPM is only for classes 2014–22, nine per slot.
- NBA value only; the ABA era is undervalued.
- The expectation is a historical average, not what a team could have known; trades of picks, league size (10 to 30 teams) and draft rules changed over the period.
- 1966–95 lists come from Wikipedia; identities follow NBA.com's bio draft fields, which have at least one duplicate slot error (disclosure 1).
- Rookie comparisons are early-season samples.
