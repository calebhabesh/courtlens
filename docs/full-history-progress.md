# CourtLens full NBA history progress

Parent: [full history handoff](full-history-plan.md). Plans are not runtime evidence.

Allowed states: `planned`, `in_progress`, `implemented_unverified`, `verified`, `source_blocked`.

## Block status

| Block | Status | Measured evidence |
| --- | --- | --- |
| FH01 | implemented_unverified | Crawler, CLI and launcher built; 8 unit tests pass against a mock source. Not run against the source yet (owner runs it). |
| FH01b | implemented_unverified | `--history` profile crawl with legal-name confirmation and headshot targets for players without game rows; 3 new unit tests; headshot query run read-only on Postgres. Not run against the source yet. |
| FH02 | planned | |
| FH03 | planned | |
| FH04 | planned | |
| FH05 | planned | |
| FH06 | planned | |

## FH01 — 2026-10-21

- Checked before building: robots.txt (`Disallow: */gamelog/`, `Crawl-delay: 3`), one sample game
  log (Michael Jordan 1984-85, HTTP 200, 403,731 bytes, tables `player_game_log_reg` and
  `player_game_log_post`), and the 1984-85 NBA and 1946-47 BAA totals pages (HTTP 200; 320/185 and
  161/61 regular-season/playoff player IDs read with the shared HTML parser). These four requests
  were made with curl and left no receipts.
- Added `ingestion/bbref_history.py`, `services/bbref_history.py`, `courtlens
  acquire-bbref-history` and `scripts/crawl-bbref-history.sh`. `tests/unit/test_bbref_history.py`:
  8 passed. Ruff, format and strict mypy are clean.
- Next: the owner runs `scripts/crawl-bbref-history.sh --detach`, then records receipt counts here.

## FH01b — 2026-10-21

- The owner asked for older players to get everything current players have, except what can't
  exist for their era. The inventory is in the plan (H6).
- Offline matching measurement against the retained index pages: 2,485 of 2,854 index players
  without roster seasons match with the existing rules; the new provisional rule proposes 228
  more, each kept only after the page's legal name confirms it.
- Added `match_by_seasons`, `legal_name` and `confirms_legal_name` (`ingestion/bbref_players.py`),
  `acquire-bbref-bios --history`, and a left join in the headshot targets. Added
  `scripts/crawl-bbref-old-players.sh`. In a scratch copy with a stub CLI, it waited for the
  history crawl's pid, ran both steps in order, and a group kill left no processes behind.
- `portrait_targets` was run read-only against the owner's Postgres: 0 targets before and after
  the change (no older-player profiles exist yet). 32 Basketball-Reference unit tests pass. Ruff,
  format and strict mypy are clean.
