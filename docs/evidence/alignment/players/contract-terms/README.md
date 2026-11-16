# Contract terms: coverage beyond Basketball-Reference

Owner instruction 72, 2026-11-14: "What should we do for these start not reported? … Did we
determine there is no other way to get reliable contract data for our table?", then "You can build
all three. We're trying to make sure we have good coverage here, and the contract data is as
coherent as possible."

## Why the table had gaps

Basketball-Reference's transaction lines often leave out a contract's length ("Signed as a free
agent", "Signed extension", a first-round pick's "Signed a multi-year contract"), and its list misses
some signings (Kevin Durant's July 2017 re-signing). `services/contract_spans.py` refuses to guess,
so one missing length left the contract and every extension after it unbracketed.

## Sources checked (2026-11-14, one request each, `CourtLens/2` user agent)

| Source | Result |
| --- | --- |
| Spotrac player page | 403, as on 2026-10-11. Policy v3: a refusal stops the host. Not used. |
| HoopsHype salary page | 200 after one redirect. Its page data groups seasons into contracts but gives no signing dates or lengths, and Durant's grouping is wrong in two places (2025-26 with the 2025 extension, 2010-11 with the 2011 deal). Not used (also owner decision D2). |
| Salary arithmetic | Only 44 of 115 Basketball-Reference contracts with a stated length of three or more years have equal yearly raises. Not used. |
| Wikipedia player articles | Durant's article states every missing length and the 2017 re-signing. Adopted. |

## What was built

1. **`courtlens acquire-wikipedia-contracts`** (`services/wikipedia_contracts.py`,
   `ingestion/wikipedia_contracts.py`). One Wikidata query ties each Basketball-Reference ID (P2685)
   to its English article (7,232 IDs; every one of the 3,297 players with a salary had one), so
   articles are matched by ID, never by name. Each rendered `/wiki/` article is read serially at 5 s
   and its prose parsed into dated contract statements (verb, contract noun, term; hedges,
   endorsements and clubs abroad left out). Raw pages are retained when their revision is new;
   bundles are content-addressed, sealed every 100 players, newest three kept; `--reparse` reapplies
   the parser offline.
2. **Coherent placement** (`services/contract_spans.py`). Basketball-Reference stays primary.
   - The CBA fixes lengths the source does not state: a first-round pick's first signing in his
     draft season (since 1999) is a four-season rookie scale deal; a 10-day or Exhibit 10 contract
     is one season.
   - A Wikipedia statement within three weeks of a source signing (or, undated, in its season or
     calendar year), naming that season's paying team when it names one, supplies a missing
     length, or replaces a stated one only when the stated one would put the yearly average above
     the CBA maximum (35% of the cap; Jaren Jackson Jr.'s "1-yr/$105M" is four years).
   - A dated Wikipedia statement adds a signing the source does not list only when the team it
     names paid him that season and the source lists no signing with that team that season. A
     first-round pick's first such signing in his draft season is his rookie scale deal (articles
     often state only its guaranteed years).
   - Where counting forward overruns the reported current contract (an extension that replaced
     an option year), the trailing extensions are counted back from its last season. Where
     counting forward is merely blocked, nothing is counted back: that would assume no unlisted
     signing.
3. **Notes say what is known.** An unbracketed signing reads "Length not reported", "Length and
   first season not reported", "first season not reported" (length already in its label) or
   "seasons not grouped". Wikipedia's terms link to the article; a signing only Wikipedia lists
   carries "from Wikipedia"; the section credits the article (CC BY-SA 4.0) under the
   Basketball-Reference credit.

## Measured coverage

Local copy of the database (profiles as retained, crawl of 2026-10-15) with Wikipedia articles read
2026-11-14: the 128 players whose table showed a signing it could not bracket (`--scope gaps`), then
150 players with the most recent contracts (`--scope all --limit 150`). 278 articles, 0 failed
fetches, 488 statements. "Visible notes" are unbracketed signings in a season with a salary row.

| 128 gap players | Before | + CBA lengths | + Wikipedia |
| --- | --- | --- | --- |
| Visible "not reported" notes | 276 | 220 | **104** |
| Players with any note | 128 | 109 | **65** |
| Salary seasons inside a bracket (of 1,597) | 457 | 661 | **1,074** |

| 150 recent-contract players | Before | + CBA lengths | + Wikipedia |
| --- | --- | --- | --- |
| Visible notes | 6 | 0 | 0 |
| Salary seasons inside a bracket (of 965) | 936 | 962 | 962 |

Across all 3,340 players with a salary, the CBA lengths alone (no new data) take visible notes from
313 to 229 and players with a note from 146 to 113; without Wikipedia or a draft the new code
places exactly what the old code placed (0 players differ). Wikipedia covers the rest once
`--scope all` has run on the VPS (one article for every salaried player).

**Agreement.** Of 93 Basketball-Reference signings with a stated length that a statement matched,
92 agree. The one that does not is Jaren Jackson Jr.'s "1-yr/$105M" extension ($105M in one year
is above the maximum salary); the article's four years now bracket 2022-23 to 2025-26.

**Added signings (10), each checked against the player's contract history:** Durant's 2017
re-signing (2-yr/$51.25M), LeBron James's 2010 Heat deal (6-yr/$110M), Rudy Gay 2010 (5-yr/$82M),
Kyle Lowry 2014 (4-yr/$48M), Draymond Green 2012 (3-yr, second round), Myles Turner's 2018
extension (4-yr/$72M, 2019-20 to 2022-23), Anthony Davis's and Paul George's rookie scale deals
(articles state only the guaranteed years; the CBA's four seasons apply), and Jaylen Clark's and
Jordan Miller's 2025 standard contracts.

**Found and fixed while measuring:** a heading year overriding a sentence's own ("in the 2024
offseason", Tyrese Maxey), an option year read as the signing year ("player option for
2027-2028", Durant), a restructured term read as the original ("later restructured to a
four-year", Cam Spencer), and counting back when counting forward was only blocked (it would
assume no unlisted signing; now only an overrun counts back).

**Still unbracketed (104 notes on 65 players)** are mostly extensions whose article gives no length
or date, and contracts before an extension neither source places (LeBron James's December 2020
extension is undated in both, so his August 2022 extension reads "first season not reported").

## Verification

Screenshots from the owner's running dev servers (read-only GETs; they hot-reload this working
tree), viewport 1440 × 1800 and 390 × 1800, no page errors, page width equal to the viewport:

| Player | Shows | Desktop | Phone |
| --- | --- | --- | --- |
| Kevin Durant | every contract bracketed; 2017 "from Wikipedia"; 2021 extension counted back over 2022-23 to 2025-26 | [1440](durant-1440.png) | [390](durant-390.png) |
| Jaren Jackson Jr. | rookie scale 2018-19 to 2021-22; the impossible 1-yr replaced by the article's 4-yr | [1440](jackson-1440.png) | |
| De'Aaron Fox | rookie scale from the draft, then his stated 5-yr extension and current contract | [1440](fox-1440.png) | |
| LeBron James | a note that names what is missing: "first season not reported" | [1440](james-1440.png) | |

Checks: 29 unit tests for the parser, bundle service and spans; dashboard lint and the full Vitest run
(141 files, 1,004 tests; the typecheck's one error is in the other session's uncommitted
`lib/link-scope.test.ts`); the player-reference, player-profile and contracts Playwright specs
(10) against the fixture API in a sandbox build at 3180/4180, with the player-reference spec
brought up to the bracket design (it still expected the removed "Current Contract" rows); Ruff,
format and strict mypy clean. Full pytest (`make test`): 2,924 passed, 4 skipped; the 8 failures are the Anthropic provider tests already known red.

## On the VPS

Nothing is deployed. After the next deploy (it creates `data/derived/wikipedia-contracts-v1`, which
the API mounts read-only), run once in the `jobs` container:
`courtlens acquire-wikipedia-contracts --scope all` (about 4.7 hours at 5 s an article; resumable).
See [deployment](../../../../deployment.md#player-contract-terms-wikipedia).
