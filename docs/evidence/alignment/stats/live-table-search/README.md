# Stats live table search — 2026-10-13

Owner instruction 70 replaces the table header's site-search lookup (suggestion dropdown over the
whole catalog, filtering only on pick or Enter) with Databallr's behavior: typing filters the
table's own rows.

- The field keeps its size, centering and bottom alignment; it is now `type="search"` with no
  listbox. A name is pushed to the URL 250 ms after the last keystroke (Enter pushes at once,
  Escape clears, the clear button clears and keeps focus). Searches use history replace.
- Filtering stays server-side, so matches come from the whole filtered cohort, not just the
  loaded page. While a search loads, the current rows dim (`stats-table-body-searching`) rather
  than swapping to skeleton rows.
- Pushed names that have not landed yet are tracked, so a URL echo never overwrites newer typing;
  any other URL change (Reset, back, header site search) replaces the draft.
- `StatsWorkspace` no longer keys the explorer on `name`, which remounted the table and dropped
  focus on every result (the browser test caught typed characters landing at the caret start).
- Server name matching folds case and accents in SQL (`translate`) and in the cached cohort
  (`fold_name`), so "jokic" finds Nikola Jokić.
- An unmatched name reads "No players match “…” under the current filters."

Real local FastAPI/PostgreSQL captures (2025-26 regular season, dev server):
[1440 desktop](stats-leb-1440.png) and [390 phone](stats-leb-390.png), both after typing `leb`.
[Measurements](measurements.json): `leb` → LeBron James, Caleb Houstan, Maxi Kleber, Caleb Martin,
Caleb Love; `lebr` → LeBron James; `jokic` → Nikola Jokić; first filtered rows ~1.1 s after the
first keystroke; field stays focused with its value; zero lookup requests, zero listboxes, zero
page overflow at both widths.

Verification: dashboard lint and typecheck pass, Vitest 463/463. Python ruff, format, strict mypy
pass; `test_stats_presentation_postgres.py`, `test_stats_engine.py` and `test_workbench_api.py`
60/60 including the new accent/case test. Browser specs `stats-readability-search`,
`stats-followups`, `stats-preview`, `table-interactions`: 26/27. The one failure
(`recurring guide modes…`) clicks the already-selected Photos divider; the uncommitted
`StatsChoicePills` ignores re-selecting the shown option, so no URL change follows. It is
unrelated to search. Ready for owner review; only the owner marks the page aligned.
