"""Full NBA draft lists before 2000 (R09): official 1996-99 files and Wikipedia for 1966-95.

The official draft-history mart (hoopR mirror of NBA Stats `drafthistory`) starts at the 2000
draft. The same mirror holds 1996-99 (files labelled by season end, 1997-2000). NBA Stats itself
times out to every client CourtLens has tried, so drafts 1966-95 come from each year's Wikipedia
article ("<year> NBA draft", CC BY-SA 4.0), read as the rendered page (robots.txt disallows `/w/`
and `/api/`). The parsers only read what a table states and fail loudly when a column is missing.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any
from urllib.parse import unquote

HOOPR_SOURCE = "hoopr_nba_stats_raw"
WIKI_SOURCE = "wikipedia_drafts"
HOOPR_REVISION = "7f2c0afa616977bc4a747fa982c1429c2ce3e78a"
HOOPR_BASE = "https://raw.githubusercontent.com/sportsdataverse/hoopR-nba-stats-raw"
WIKI_BASE = "https://en.wikipedia.org/wiki/"
OFFICIAL_YEARS = range(1996, 2000)
WIKI_YEARS = range(1966, 1996)
WIKI_PATTERN = re.compile(r"^https://en\.wikipedia\.org/wiki/(\d{4})_NBA_draft$")
HOOPR_PATTERN = re.compile(
    re.escape(HOOPR_BASE) + r"/([0-9a-f]{40})/nba_stats/json/drafthistory/(\d{4})\.json$"
)


def hoopr_url(year: int) -> str:
    """hoopR labels draft files by season END year: 1997.json holds the 1996 draft."""
    if year not in OFFICIAL_YEARS:
        raise ValueError("official pre-2000 draft files cover 1996-99 only")
    return f"{HOOPR_BASE}/{HOOPR_REVISION}/nba_stats/json/drafthistory/{year + 1}.json"


def wiki_url(year: int) -> str:
    if year not in WIKI_YEARS:
        raise ValueError("Wikipedia draft articles are read for 1966-95 only")
    return f"{WIKI_BASE}{year}_NBA_draft"


def year_for_url(url: str) -> tuple[str, int]:
    if match := HOOPR_PATTERN.fullmatch(url):
        if match.group(1) != HOOPR_REVISION:
            raise ValueError("hoopR revision is not the pinned one")
        year = int(match.group(2)) - 1
        if year not in OFFICIAL_YEARS:
            raise ValueError("hoopR draft file outside 1996-99")
        return HOOPR_SOURCE, year
    if match := WIKI_PATTERN.fullmatch(url):
        year = int(match.group(1))
        if year not in WIKI_YEARS:
            raise ValueError("Wikipedia draft article outside 1966-95")
        return WIKI_SOURCE, year
    raise ValueError("not an admitted draft-history URL")


def parse_official(raw: bytes, year: int) -> list[dict[str, Any]]:
    """hoopR's NBA Stats `drafthistory` JSON: one row per pick, NBA person IDs included."""
    body = json.loads(raw)
    sets = body.get("resultSets") or body.get("resultSet")
    table = sets[0] if isinstance(sets, list) else sets
    headers = [h.lower() for h in table["headers"]]
    need = {"person_id", "player_name", "season", "overall_pick", "round_number", "draft_type"}
    if not need <= set(headers):
        raise ValueError(f"drafthistory {year}: missing columns {sorted(need - set(headers))}")
    picks = []
    for values in table["rowSet"]:
        row = dict(zip(headers, values, strict=True))
        if str(row["season"]) != str(year):
            raise ValueError(f"drafthistory {year}: row from draft {row['season']}")
        if row["draft_type"] != "Draft" or not row["overall_pick"]:
            continue
        picks.append(
            {
                "draft_year": year,
                "overall_pick": int(row["overall_pick"]),
                "round_number": int(row["round_number"]),
                "player_name": str(row["player_name"]).strip(),
                "player_id": str(row["person_id"]) if row["person_id"] else None,
                "team": row.get("team_abbreviation") or None,
                "team_id": str(row["team_id"]) if row.get("team_id") else None,
                "organization": row.get("organization") or None,
                "wiki_title": None,
            }
        )
    return sorted(picks, key=lambda p: p["overall_pick"])


@dataclass
class _Cell:
    text: str = ""
    links: list[str] = field(default_factory=list)
    header: bool = False
    rowspan: int = 1
    colspan: int = 1


class _Tables(HTMLParser):
    """Every `wikitable` as rows of cells; footnote markers and hidden sort keys are dropped."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[_Cell]]] = []
        self.depth = 0  # nesting of wikitables
        self.cell: _Cell | None = None
        self.skip = 0  # inside <sup>, <style> or a hidden sort key

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {k: v or "" for k, v in attrs}
        if tag == "table":
            if self.depth or "wikitable" in values.get("class", "").split():
                self.depth += 1
                if self.depth == 1:
                    self.tables.append([])
            return
        if self.depth != 1:
            return
        if self.skip:
            if tag in ("sup", "style", "span"):
                self.skip += 1
            return
        if tag in ("sup", "style") or (
            tag == "span" and "display:none" in values.get("style", "").replace(" ", "")
        ):
            self.skip = 1
            return
        if tag == "tr":
            self.tables[-1].append([])
        elif tag in ("td", "th") and self.tables[-1]:

            def span(name: str) -> int:
                digits = re.match(r"\d+", values.get(name, "1"))
                return int(digits.group()) if digits else 1

            self.cell = _Cell(header=tag == "th", rowspan=span("rowspan"), colspan=span("colspan"))
            self.tables[-1][-1].append(self.cell)
        elif tag == "a" and self.cell is not None:
            href = values.get("href", "")
            if href.startswith("/wiki/") and ":" not in href[6:]:
                self.cell.links.append(unquote(href[6:]))
        elif tag == "br" and self.cell is not None:
            self.cell.text += " "

    def handle_endtag(self, tag: str) -> None:
        if tag == "table" and self.depth:
            self.depth -= 1
            return
        if self.depth != 1:
            return
        if self.skip:
            if tag in ("sup", "style", "span"):
                self.skip -= 1
            return
        if tag in ("td", "th"):
            self.cell = None

    def handle_data(self, data: str) -> None:
        if self.depth == 1 and self.cell is not None and not self.skip:
            self.cell.text += data


def _grid(rows: list[list[_Cell]]) -> list[list[_Cell]]:
    """Expand rowspan and colspan so each row has one cell per column."""
    pending: dict[int, tuple[_Cell, int]] = {}
    grid: list[list[_Cell]] = []
    for row in rows:
        out: list[_Cell] = []
        cells = iter(row)
        column = 0
        while True:
            if column in pending:
                cell, left = pending[column]
                out.append(cell)
                if left <= 1:
                    del pending[column]
                else:
                    pending[column] = (cell, left - 1)
                column += 1
                continue
            nxt = next(cells, None)
            if nxt is None:
                break
            for _ in range(nxt.colspan):
                out.append(nxt)
                if nxt.rowspan > 1:
                    pending[column] = (nxt, nxt.rowspan - 1)
                column += 1
        grid.append(out)
    return grid


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def _player_name(text: str) -> str:
    # Legend symbols (^ * + # x ~ etc.) follow the name; parenthesised notes are dropped.
    name = re.sub(r"\(.*?\)", "", _clean(text))
    return re.sub(r"[\^*+#~†‡§]+$", "", name.strip()).strip(" ,")


def revision_id(raw: bytes) -> int | None:
    match = re.search(rb'"wgRevisionId":\s*(\d+)', raw)
    return int(match.group(1)) if match else None


def parse_wikipedia(raw: bytes, year: int) -> list[dict[str, Any]]:
    """The article's draft table(s): one row per numbered pick with round, player and team."""
    parser = _Tables()
    parser.feed(raw.decode("utf-8"))
    picks: dict[int, dict[str, Any]] = {}
    for table in parser.tables:
        grid = _grid(table)
        if not grid:
            continue
        head = [_clean(c.text).lower() for c in grid[0]]
        columns = {}
        for index, label in enumerate(head):
            key = label.split()[0] if label else ""
            if key in ("round", "rnd.", "rnd") and "round" not in columns:
                columns["round"] = index
            elif key == "pick" and "pick" not in columns:
                columns["pick"] = index
            elif key == "player" and "player" not in columns:
                columns["player"] = index
            elif (key == "team" or label.startswith("nba team")) and "team" not in columns:
                columns["team"] = index
            elif key.startswith("school") and "school" not in columns:
                columns["school"] = index
        if not {"pick", "player", "team"} <= set(columns):
            continue
        if picks:
            # The first draft table is the draft; later ones are supplemental, hardship or ABA
            # dispersal drafts with their own pick numbers.
            break
        for row in grid[1:]:
            if len(row) <= max(columns.values()):
                continue
            pick_text = _clean(row[columns["pick"]].text)
            if not re.fullmatch(r"\d{1,3}", pick_text):
                continue
            pick = int(pick_text)
            player = row[columns["player"]]
            round_text = _clean(row[columns["round"]].text) if "round" in columns else ""
            round_match = re.match(r"\d+", round_text)
            team_cell = row[columns["team"]]
            entry = {
                "draft_year": year,
                "overall_pick": pick,
                "round_number": int(round_match.group()) if round_match else None,
                "player_name": _player_name(player.text),
                "player_id": None,
                "team": re.sub(r"\(.*?\)", "", _clean(team_cell.text)).strip() or None,
                "team_id": None,
                "organization": (
                    re.sub(r"\(.*?\)", "", _clean(row[columns["school"]].text)).strip() or None
                    if "school" in columns
                    else None
                ),
                "wiki_title": player.links[0] if player.links else None,
            }
            if not entry["player_name"]:
                raise ValueError(f"{year} draft pick {pick}: empty player cell")
            if pick in picks and picks[pick]["player_name"] != entry["player_name"]:
                raise ValueError(f"{year} draft pick {pick} listed twice with different players")
            picks[pick] = entry
    if not picks:
        raise ValueError(f"{year} NBA draft article: no draft table found")
    if sorted(picks) != list(range(1, max(picks) + 1)):
        raise ValueError(f"{year} NBA draft article: pick numbers are not 1..{max(picks)}")
    return [picks[k] for k in sorted(picks)]
