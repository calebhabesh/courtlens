# Search: focus outline, verified nicknames, ranking and recents

Owner instructions 12–16 (app shell), 2026-10-15.

- **Focus (12).** Every lookup search uses the Stats table search's single solid gold outline
  (border plus a flush 1 px ring). The ⌘K palette's flat input row stays ringless.
- **Nicknames (13, 16).** Basketball-Reference parser `bbref-player-v3` reads each page's labelled
  "What are X's nicknames?" answer. The bio block's bare parenthesised paragraph is not used: it
  also carries notes such as Giannis's "(last name previously spelled Adetokunbo)". On all 2,312
  retained pages the parsed lists equal the FAQ text exactly; 945 players have nicknames. The
  pages were reparsed offline (no fetching). Results list every nickname, the matched one first
  ("aka Vic, Wemby, The Extraterrestrial, Alien"); generated aliases (accent folding, first
  names, suffixes) still match but are never captioned. A leading "The" is optional.
- **Ranking (14).** Matches are tiered (exact full name; a name or nickname word or prefix;
  substrings and later nickname words; typos). Within a tier, players in the scope's season
  (else the newest indexed season) come first, then the most observed games.
- **Edge bar (15).** Active dropdown and palette rows use the shading alone.
- **Recents (16).** The palette's Recent heading has "Clear all"; each recent row has a remove
  button (on hover, on the arrowed-to row, always on touch), and Delete removes the arrowed-to
  recent.

Local API results (2026-10-15, players only):

| Query | Top results |
| --- | --- |
| vic | Victor Wembanyama (aka Vic), Victor Oladipo, Victor Claver, Victor Alexander, Vic Law |
| kd | Kevin Durant (aka KD) |
| kat | Karl-Anthony Towns (aka KAT) |
| greek freak | Giannis Antetokounmpo (aka The Greek Freak), Kostas Antetokounmpo (aka Greek Freak 2.0) |
| jordan | DeAndre Jordan, Jordan Clarkson, Jordan Poole, Jordan McLaughlin |
| curry | Stephen Curry, Seth Curry, Eddy Curry, Michael Curry, Dell Curry |

Checks: full Python suite (2,117 passed); ruff; mypy has only the two existing `gemini.py`
errors; dashboard lint, typecheck and Vitest; the lookup catalog version is now `pf04-v2`.
