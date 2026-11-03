"""Wikipedia's "List of <season> NBA season transactions" page, read as dated player moves.

The page is the rendered article (`en.wikipedia.org/wiki/...`, which robots.txt allows; `/w/` and
`/api/` are disallowed). Its tables are edited by hand, so the parser only reads what each table
states and fails loudly when an expected table or column is missing:

- Free agents: one row per signing (date, new team, former team). A row without a date lists a
  player still unsigned. A former-team note "(Waived on <date>)" is a dated waiver.
- Two-way contracts: a dated two-way signing with a team.
- Going abroad: a dated signing with a club outside the NBA.
- Waived: a dated waiver by a team.
- Training camp cuts: per-team lists with no dates (the page gives none).
- Retirement: a dated retirement.

Players are keyed by the article each row links to (stable across tables and spellings); a row
without a link falls back to its text. Dates carry no year on the page: each takes the latest of
the season's two calendar years that is not after the page revision's date.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date
from html.parser import HTMLParser
from typing import Any
from urllib.parse import unquote

from courtlens.domain.teams import NBA_TEAMS

HOST = "en.wikipedia.org"
PAGE = "List_of_{start}\u2013{end:02d}_NBA_season_transactions"
URL_PATTERN = re.compile(
    r"^https://en\.wikipedia\.org/wiki/List_of_(\d{4})%E2%80%93(\d{2})_NBA_season_transactions$"
)
TEAM_NAMES = {team.name: team.team_id for team in NBA_TEAMS.values()} | {
    "Los Angeles Clippers": NBA_TEAMS["1610612746"].team_id
}
MONTHS = {
    name: number
    for number, name in enumerate(
        (
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
        ),
        start=1,
    )
}
_DATE = re.compile(r"\b(" + "|".join(MONTHS) + r")\s+(\d{1,2})\b")
_WAIVED_NOTE = re.compile(r"\(Waived on (" + "|".join(MONTHS) + r")\s+(\d{1,2})\)")
_DISAMBIGUATION = re.compile(r"\s+\(basketball[^)]*\)$")
# Status markers the page appends to names: (RFA), asterisks, daggers.
_MARKERS = re.compile(r"\s*(\((?:RFA|UFA|TW)\)|[*†‡#^]+)\s*")


def page_url(season: str) -> str:
    start = int(season[:4])
    title = PAGE.format(start=start, end=(start + 1) % 100)
    return "https://en.wikipedia.org/wiki/" + title.replace("\u2013", "%E2%80%93")


@dataclass
class Cell:
    text: str = ""
    links: list[str] = field(default_factory=list)
    rowspan: int = 1
    colspan: int = 1


@dataclass
class Table:
    heading: str | None
    rows: list[list[Cell]] = field(default_factory=list)


class _Tables(HTMLParser):
    """Every table with the heading above it; cell text, linked article titles and spans."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[Table] = []
        self.open: list[Table] = []
        self.cell: Cell | None = None
        self.heading: str | None = None
        self.heading_text: str | None = None
        self.skip = 0  # inside <sup> (reference markers) or <style>

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        if tag in ("h2", "h3", "h4"):
            self.heading_text = ""
        elif tag in ("sup", "style"):
            self.skip += 1
        elif tag == "table":
            self.open.append(Table(self.heading))
        elif tag == "tr" and self.open:
            self.open[-1].rows.append([])
        elif tag in ("td", "th") and self.open and self.open[-1].rows:
            self.cell = Cell(
                rowspan=_span(values.get("rowspan")), colspan=_span(values.get("colspan"))
            )
        elif tag == "br" and self.cell is not None:
            self.cell.text += " | "
        elif tag == "a" and self.cell is not None and not self.skip:
            href = values.get("href", "")
            match = re.search(r"/wiki/([^#?]+)", href)
            if match and ":" not in match[1]:
                self.cell.links.append(unquote(match[1]).replace("_", " "))

    def handle_endtag(self, tag: str) -> None:
        if tag in ("h2", "h3", "h4") and self.heading_text is not None:
            self.heading = self.heading_text.strip()
            self.heading_text = None
        elif tag in ("sup", "style") and self.skip:
            self.skip -= 1
        elif tag in ("td", "th") and self.cell is not None and self.open:
            self.cell.text = re.sub(r"\s+", " ", self.cell.text).strip()
            self.open[-1].rows[-1].append(self.cell)
            self.cell = None
        elif tag == "table" and self.open:
            self.tables.append(self.open.pop())

    def handle_data(self, data: str) -> None:
        if self.heading_text is not None:
            self.heading_text += data
        if self.cell is not None and not self.skip:
            self.cell.text += data


def _span(value: str | None) -> int:
    return int(value) if value and value.isdigit() and 0 < int(value) < 100 else 1


def grid(table: Table) -> list[list[Cell]]:
    """Rows with row- and column-spanning cells repeated into every position they cover."""
    out: list[list[Cell]] = []
    pending: dict[int, tuple[Cell, int]] = {}
    for row in table.rows:
        line: list[Cell] = []
        cells = list(row)
        col = 0
        while cells or col in pending:
            if col in pending:
                cell, left = pending.pop(col)
                if left > 1:
                    pending[col] = (cell, left - 1)
                line.append(cell)
                col += 1
                continue
            cell = cells.pop(0)
            for _ in range(cell.colspan):
                line.append(cell)
                if cell.rowspan > 1:
                    pending[col] = (cell, cell.rowspan - 1)
                col += 1
        out.append(line)
    return out


def _date(text: str, season: str, revised: date) -> date | None:
    match = _DATE.search(text)
    if match is None:
        return None
    start = int(season[:4])
    month, day = MONTHS[match[1]], int(match[2])
    candidates = [date(year, month, day) for year in (start, start + 1)]
    known = [d for d in candidates if d <= revised]
    return max(known) if known else candidates[0]


def _team(cell: Cell) -> str | None:
    for title in cell.links:
        if title in TEAM_NAMES:
            return TEAM_NAMES[title]
    for name, team_id in TEAM_NAMES.items():
        if cell.text.startswith(name):
            return team_id
    return None


def _player(cell: Cell) -> tuple[str, str] | None:
    """(key, display name): the linked article title, else the cell text without markers."""
    name = _MARKERS.sub(" ", cell.text.split(" | ")[0]).strip()
    if not name or name in TEAM_NAMES:
        return None
    key = cell.links[0] if cell.links else name
    return _DISAMBIGUATION.sub("", key), _DISAMBIGUATION.sub("", name)


def _header(rows: list[list[Cell]], first: str) -> int | None:
    for index, row in enumerate(rows):
        if row and row[0].text == first:
            return index
    return None


def _columns(rows: list[list[Cell]], index: int, expected: tuple[str, ...]) -> dict[str, int]:
    names = [cell.text for cell in rows[index]]
    missing = [name for name in expected if name not in names]
    if missing:
        raise ValueError(f"Wikipedia table lost columns {missing}: {names}")
    return {name: names.index(name) for name in expected}


def parse_transactions(body: bytes, season: str, revised: date) -> dict[str, Any]:
    """Dated moves per player from the season's transactions page.

    Returns `{revision_id, season, events: [...]}`; each event is `{key, name, kind, team_id,
    date, ...}` with kind one of signed, two_way, abroad, waived, cut, retired, unsigned.
    """
    text = body.decode("utf-8")
    revision = re.search(r'"wgRevisionId":(\d+)', text)
    if revision is None:
        raise ValueError("not a rendered Wikipedia article (no revision id)")
    title = re.search(r'"wgTitle":("(?:[^"\\]|\\.)*")', text)
    start = int(season[:4])
    expected = f"List of {start}\u2013{(start + 1) % 100:02d} NBA season transactions"
    if title is None or json.loads(title[1]) != expected:
        raise ValueError("Wikipedia returned a different page")
    parser = _Tables()
    parser.feed(text)
    events: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(cell: Cell, kind: str, **values: Any) -> None:
        player = _player(cell)
        if player is not None:
            events.append({"key": player[0], "name": player[1], "kind": kind, **values})

    for table in parser.tables:
        rows = grid(table)
        heading = table.heading or ""
        if heading == "Free agents" and (at := _header(rows, "Player")) is not None:
            cols = _columns(rows, at, ("Player", "Date signed", "New team", "Former team"))
            seen.add(heading)
            for row in rows[at + 1 :]:
                if len(row) <= max(cols.values()):
                    continue
                former = row[cols["Former team"]]
                if note := _WAIVED_NOTE.search(former.text):
                    add(
                        row[cols["Player"]],
                        "waived",
                        team_id=_team(former),
                        date=_date(note[0], season, revised),
                    )
                when = _date(row[cols["Date signed"]].text, season, revised)
                if when is None:
                    add(row[cols["Player"]], "unsigned", team_id=None, date=None)
                    continue
                add(
                    row[cols["Player"]],
                    "signed",
                    team_id=_team(row[cols["New team"]]),
                    former_team_id=_team(former),
                    date=when,
                )
        elif heading == "Two-way contracts" and (at := _header(rows, "Player")) is not None:
            cols = _columns(rows, at, ("Player", "Date signed", "Team"))
            seen.add(heading)
            for row in rows[at + 1 :]:
                if len(row) <= max(cols.values()):
                    continue
                when = _date(row[cols["Date signed"]].text, season, revised)
                if when is not None:
                    add(row[cols["Player"]], "two_way", team_id=_team(row[cols["Team"]]), date=when)
        elif heading == "Going abroad" and (at := _header(rows, "Player")) is not None:
            cols = _columns(rows, at, ("Player", "Date signed", "New team", "New country"))
            seen.add(heading)
            for row in rows[at + 1 :]:
                if len(row) <= max(cols.values()):
                    continue
                add(
                    row[cols["Player"]],
                    "abroad",
                    team_id=None,
                    club=row[cols["New team"]].text.split(" | ")[0],
                    country=row[cols["New country"]].text,
                    date=_date(row[cols["Date signed"]].text, season, revised),
                )
        elif heading == "Waived" and (at := _header(rows, "Player")) is not None:
            cols = _columns(rows, at, ("Player", "Date waived", "Former team"))
            seen.add(heading)
            for row in rows[at + 1 :]:
                if len(row) <= max(cols.values()):
                    continue
                add(
                    row[cols["Player"]],
                    "waived",
                    team_id=_team(row[cols["Former team"]]),
                    date=_date(row[cols["Date waived"]].text, season, revised),
                )
        elif heading == "Training camp cuts":
            seen.add(heading)
            teams: list[str | None] = []
            for row in rows:
                # A row of team names heads the row of cut players beneath it.
                if row and all(c.text in TEAM_NAMES or not c.text for c in row):
                    teams = [TEAM_NAMES.get(c.text) for c in row]
                    continue
                for team_id, cell in zip(teams, row, strict=False):
                    for link in cell.links:
                        if link not in TEAM_NAMES:
                            add(Cell(text=link, links=[link]), "cut", team_id=team_id, date=None)
        elif heading == "Retirement" and (at := _header(rows, "Date")) is not None:
            cols = _columns(rows, at, ("Date", "Name"))
            seen.add(heading)
            for row in rows[at + 1 :]:
                if len(row) <= max(cols.values()):
                    continue
                add(
                    row[cols["Name"]],
                    "retired",
                    team_id=None,
                    date=_date(row[cols["Date"]].text, season, revised),
                )
    required = {"Free agents", "Waived", "Two-way contracts"}
    if not required <= seen:
        raise ValueError(f"Wikipedia page lost tables: {sorted(required - seen)}")
    for event in events:
        if isinstance(event.get("date"), date):
            event["date"] = event["date"].isoformat()
    return {"revision_id": int(revision[1]), "season": season, "events": events}
