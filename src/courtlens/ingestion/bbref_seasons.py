"""Parse retained Basketball-Reference history pages: game logs and league tables (FH02, FH03).

Pure functions over raw bytes; reading the receipts and sealing the output live in
services/bbref_history_seal.py. The pages are machine-generated with one cell per ``data-stat``,
so a narrow pattern reader is enough and fast across ~2.5 GB of pages. Values are read, never
inferred: a blank cell is null (unknown), and a game the player did not play (Did Not Play, Did
Not Dress, Not With Team, Inactive, Suspended) is a reported non-appearance with no box score.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from datetime import date
from typing import Any

PARSER_VERSION = "bbref-history-v1"

# Basketball-Reference team codes that CourtLens stores under another code.
TEAM_CODES = {"PHO": "PHX", "CHO": "CHA", "BRK": "BKN", "NOK": "NOK"}

_TABLE = r'<table\b[^>]*\bid="{}"[^>]*>(.*?)</table>'
_ROW = re.compile(r"<tr\b([^>]*)>(.*?)</tr>", re.S)
_CELL = re.compile(r"<(td|th)\b([^>]*)>(.*?)</\1>", re.S)
_STAT = re.compile(r'data-stat="([a-z0-9_]+)"')
_TAG = re.compile(r"<[^>]+>")
_BOX = re.compile(r"/boxscores/(\d{8})0([A-Z]{3})\.html")
_TEAM_LINK = re.compile(r"/teams/([A-Z]{3})/(\d{4})\.html")
_RESULT = re.compile(r"^([WL]),?\s*(\d+)-(\d+)(?:\s*\((\d*)OT\))?$")
_PLAYER_ID = re.compile(r"^[a-z.'-]{1,9}\d{2}$")
_MINUTES = re.compile(r"^(\d+):(\d{2})$")

# Box-score fields, named as the workbench stores them (workbench_normalization).
BOX_FIELDS = {
    "fg": "field_goals_made",
    "fga": "field_goals_attempted",
    "fg3": "three_pointers_made",
    "fg3a": "three_pointers_attempted",
    "ft": "free_throws_made",
    "fta": "free_throws_attempted",
    "orb": "rebounds_offensive",
    "drb": "rebounds_defensive",
    "trb": "rebounds_total",
    "ast": "assists",
    "stl": "steals",
    "blk": "blocks",
    "tov": "turnovers",
    "pf": "fouls_personal",
    "pts": "points",
}
NON_APPEARANCES = {
    "Did Not Play",
    "Did Not Dress",
    "Not With Team",
    "Inactive",
    "Suspended",
    "Player Suspended",
}


def team_code(code: str) -> str:
    return TEAM_CODES.get(code, code)


def _text(fragment: str) -> str:
    return " ".join(html.unescape(_TAG.sub(" ", fragment)).split())


def _table(raw: str, table_id: str) -> str | None:
    match = re.search(_TABLE.format(re.escape(table_id)), raw, re.S)
    return match.group(1) if match else None


@dataclass(frozen=True)
class Cell:
    stat: str
    attrs: str
    inner: str

    @property
    def text(self) -> str:
        return _text(self.inner)


def _rows(table: str) -> list[tuple[str, dict[str, Cell]]]:
    rows = []
    for attrs, body in _ROW.findall(table):
        if 'class="thead"' in attrs or ("<th " in body and "<td" not in body):
            continue
        cells: dict[str, Cell] = {}
        for _, cell_attrs, inner in _CELL.findall(body):
            stat = _STAT.search(cell_attrs)
            if stat:
                cells[stat.group(1)] = Cell(stat.group(1), cell_attrs, inner)
        if cells:
            rows.append((attrs, cells))
    return rows


def count(value: str) -> int | None:
    value = value.strip()
    if value == "":
        return None
    if not re.fullmatch(r"-?\d+", value):
        raise ValueError(f"malformed count: {value[:20]!r}")
    return int(value)


def number(value: str) -> float | None:
    value = value.strip().replace(",", "")
    if value in {"", "-", "—"}:
        return None
    if value.startswith("+"):
        value = value[1:]
    if not re.fullmatch(r"-?\d*\.?\d+", value):
        raise ValueError(f"malformed number: {value[:20]!r}")
    return float(value)


def minutes_seconds(value: str) -> int | None:
    value = value.strip()
    if value == "":
        return None
    match = _MINUTES.fullmatch(value)
    if match:
        return 60 * int(match.group(1)) + int(match.group(2))
    if re.fullmatch(r"\d+", value):
        return 60 * int(value)
    raise ValueError(f"malformed minutes: {value[:20]!r}")


def parse_gamelog(raw: bytes, bbref_id: str, end_year: int) -> list[dict[str, Any]]:
    """Every row of a player's season game log, regular season and playoffs.

    Each row names its game by the source's box-score key (date + home team), which both
    teams' players share, so games can be assembled from player rows alone.
    """
    page = raw.decode("utf-8")
    out: list[dict[str, Any]] = []
    found = False
    for table_id, phase in (
        ("player_game_log_reg", "regular_season"),
        ("player_game_log_post", "playoffs"),
    ):
        table = _table(page, table_id)
        if table is None:
            continue
        found = True
        for _, cells in _rows(table):
            if "date" not in cells or "team_name_abbr" not in cells or not cells["date"].text:
                continue  # header and season-total footer rows
            box = _BOX.search(cells["date"].inner) or _BOX.search(
                cells.get("game_result", Cell("", "", "")).inner
            )
            if box is None:
                raise ValueError(f"{bbref_id} {end_year}: game row without a box-score link")
            stamp, home = box.groups()
            game_date = date(int(stamp[:4]), int(stamp[4:6]), int(stamp[6:]))
            team_link = _TEAM_LINK.search(cells["team_name_abbr"].inner)
            opp_link = _TEAM_LINK.search(cells.get("opp_name_abbr", Cell("", "", "")).inner)
            team = team_link.group(1) if team_link else cells["team_name_abbr"].text
            opp = opp_link.group(1) if opp_link else cells["opp_name_abbr"].text
            result = _RESULT.fullmatch(cells.get("game_result", Cell("", "", "")).text)
            row: dict[str, Any] = {
                "bbref_id": bbref_id,
                "season_end": end_year,
                "phase": phase,
                "box_key": f"{stamp}0{home}",
                "game_date": game_date.isoformat(),
                "team": team,
                "opponent": opp,
                "home": home,
                "team_points": int(result.group(2)) if result else None,
                "opponent_points": int(result.group(3)) if result else None,
                "overtimes": (
                    int(result.group(4) or 1) if result and result.group(4) is not None else 0
                ),
            }
            reason = next((c.text for c in cells.values() if "colspan" in c.attrs and c.text), None)
            if reason is not None:
                if reason not in NON_APPEARANCES:
                    raise ValueError(f"{bbref_id} {end_year}: unknown game-row note {reason!r}")
                row |= {
                    "appearance": "reported_nonappearance",
                    "comment": reason,
                    "started": None,
                    "minutes_original": "",
                    "minutes_seconds": None,
                    "stats": dict.fromkeys(BOX_FIELDS.values()),
                    "plus_minus": None,
                }
                out.append(row)
                continue
            seconds = minutes_seconds(cells["mp"].text) if "mp" in cells else None
            stats = {
                name: count(cells[stat].text) if stat in cells else None
                for stat, name in BOX_FIELDS.items()
            }
            starter = cells.get("is_starter")
            row |= {
                # A box-score row is an appearance even when minutes were not recorded.
                "appearance": "appeared",
                "comment": "",
                "started": None if starter is None else starter.text == "*",
                "minutes_original": cells["mp"].text if "mp" in cells else "",
                "minutes_seconds": seconds,
                "stats": stats,
                "plus_minus": (
                    count(cells["plus_minus"].text.replace("+", ""))
                    if "plus_minus" in cells
                    else None
                ),
            }
            out.append(row)
    if not found:
        raise ValueError(f"{bbref_id} {end_year}: no game-log table")
    return out


# --- League season pages ---------------------------------------------------------------------

TOTAL_FIELDS = {
    "games": "games",
    "games_started": "games_started",
    "mp": "minutes",
    **BOX_FIELDS,
}
ADVANCED_FIELDS = (
    "per",
    "ts_pct",
    "fg3a_per_fga_pct",
    "fta_per_fga_pct",
    "orb_pct",
    "drb_pct",
    "trb_pct",
    "ast_pct",
    "stl_pct",
    "blk_pct",
    "tov_pct",
    "usg_pct",
    "ows",
    "dws",
    "ws",
    "ws_per_48",
    "obpm",
    "dbpm",
    "bpm",
    "vorp",
)
# Multi-team summary rows: "TOT" on older pages, "2TM"/"3TM"... on newer ones.
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")


def _player_rows(page: str, table_id: str) -> list[dict[str, Any]]:
    table = _table(page, table_id)
    if table is None:
        return []
    rows = []
    for _, cells in _rows(table):
        name = cells.get("name_display")
        if name is None or 'data-append-csv="' not in name.attrs:
            continue  # League Average row
        bbref_id = re.search(r'data-append-csv="([^"]+)"', name.attrs).group(1)  # type: ignore[union-attr]
        if not _PLAYER_ID.fullmatch(bbref_id):
            raise ValueError(f"unexpected player ID {bbref_id[:40]!r}")
        team_cell = cells.get("team_name_abbr")
        link = _TEAM_LINK.search(team_cell.inner) if team_cell else None
        team = link.group(1) if link else (team_cell.text if team_cell else "")
        age = cells.get("age")
        rows.append(
            {
                "bbref_id": bbref_id,
                "name": name.text.rstrip("*").strip(),
                "team": team,
                "summary": bool(SUMMARY_TEAM.fullmatch(team)),
                "age": count(age.text) if age else None,
                "position": cells["pos"].text if "pos" in cells else None,
                "cells": cells,
            }
        )
    return rows


def parse_totals(raw: bytes) -> dict[str, list[dict[str, Any]]]:
    """Player season totals per team (and the multi-team summary row), by phase."""
    page = raw.decode("utf-8")
    out: dict[str, list[dict[str, Any]]] = {}
    for table_id, phase in (("totals_stats", "regular_season"), ("totals_stats_post", "playoffs")):
        rows = []
        for row in _player_rows(page, table_id):
            cells = row.pop("cells")
            row["stats"] = {
                name: count(cells[stat].text) if stat in cells else None
                for stat, name in TOTAL_FIELDS.items()
            }
            rows.append(row)
        out[phase] = rows
    if not out.get("regular_season"):
        raise ValueError("totals page has no player rows")
    return out


def parse_advanced(raw: bytes) -> dict[str, list[dict[str, Any]]]:
    page = raw.decode("utf-8")
    out: dict[str, list[dict[str, Any]]] = {}
    for table_id, phase in (("advanced", "regular_season"), ("advanced_post", "playoffs")):
        rows = []
        for row in _player_rows(page, table_id):
            cells = row.pop("cells")
            row["advanced"] = {
                field: number(cells[field].text) if field in cells else None
                for field in ADVANCED_FIELDS
            }
            rows.append(row)
        out[phase] = rows
    return out


TEAM_TOTAL_FIELDS = {"g": "games", "mp": "minutes", **BOX_FIELDS}


def parse_team_totals(raw: bytes) -> list[dict[str, Any]]:
    """Each team's regular-season totals and its opponents' totals (season summary page)."""
    page = raw.decode("utf-8")
    teams: dict[str, dict[str, Any]] = {}
    for table_id, prefix in (("totals-team", ""), ("totals-opponent", "opp_")):
        table = _table(page, table_id)
        if table is None:
            continue
        for _, cells in _rows(table):
            link = _TEAM_LINK.search(cells["team"].inner) if "team" in cells else None
            if link is None:
                continue  # League Average
            entry = teams.setdefault(
                link.group(1),
                {"team": link.group(1), "name": cells["team"].text.rstrip("*").strip()},
            )
            key = "totals" if not prefix else "opponent_totals"
            entry[key] = {
                name: count(cells[prefix + stat].text) if prefix + stat in cells else None
                for stat, name in TEAM_TOTAL_FIELDS.items()
                if stat not in {"g", "mp"} or not prefix
            }
            if prefix:
                entry[key]["games"] = count(cells["g"].text) if "g" in cells else None
    return list(teams.values())


_STANDINGS = (
    ("divs_standings_", None),  # Before 1970-71: divisions only, no conferences.
    ("divs_standings_E", "Eastern"),
    ("divs_standings_W", "Western"),
)
_DIVISION = re.compile(r"<strong>\s*([^<]+?) Division\s*</strong>")


def parse_standings(raw: bytes) -> list[dict[str, Any]]:
    """Each team's name, conference and division from a league season page's standings.

    Conferences start in 1970-71; earlier seasons list Eastern, Western (and in 1949-50 Central)
    divisions only, so their conference is None. Teams keep the source's code (``PHO``).
    """
    page = raw.decode("utf-8")
    teams: list[dict[str, Any]] = []
    for table_id, conference in _STANDINGS:
        table = _table(page, table_id)
        if table is None:
            continue
        division: str | None = None
        for _, body in _ROW.findall(table):
            heading = _DIVISION.search(body)
            if heading:
                division = heading.group(1)
                continue
            link = _TEAM_LINK.search(body)
            name = re.search(r'/teams/[A-Z]{3}/\d{4}\.html">([^<]+)</a>', body)
            if link and name:
                teams.append(
                    {
                        "team": link.group(1),
                        "name": html.unescape(name.group(1)).strip(),
                        "conference": conference,
                        "division": division,
                    }
                )
    return teams


# The advanced team table's season measures, as CourtLens names them. Ratings and pace are the
# source's own possession estimates; empty cells (pace before 1950-51) stay None.
TEAM_RECORD_FIELDS = {
    "mov": "mov",
    "sos": "sos",
    "srs": "srs",
    "off_rtg": "ortg",
    "def_rtg": "drtg",
    "pace": "pace",
}


def parse_team_records(raw: bytes) -> list[dict[str, Any]]:
    """Each team's regular-season record and ratings from a league season page.

    Wins and losses come from the standings (every season), the rest from the advanced team
    table: margin of victory, strength of schedule, SRS, offensive and defensive rating and pace
    as the source estimates them, plus the arena and its attendance. Teams keep the source's
    code (``PHO``).
    """
    page = raw.decode("utf-8")
    records: dict[str, dict[str, Any]] = {}
    for table_id, _ in _STANDINGS:
        table = _table(page, table_id)
        if table is None:
            continue
        for _, cells in _rows(table):
            link = _TEAM_LINK.search(cells["team_name"].inner) if "team_name" in cells else None
            if link is None:
                continue
            records[link.group(1)] = {
                "team": link.group(1),
                "wins": count(cells["wins"].text),
                "losses": count(cells["losses"].text),
            }
    table = _table(page, "advanced-team")
    for _, cells in _rows(table) if table is not None else []:
        link = _TEAM_LINK.search(cells["team"].inner) if "team" in cells else None
        if link is None or link.group(1) not in records:
            continue  # League Average
        entry = records[link.group(1)]
        for stat, name in TEAM_RECORD_FIELDS.items():
            entry[name] = number(cells[stat].text) if stat in cells else None
        arena = cells["arena_name"].text if "arena_name" in cells else ""
        entry["arena"] = arena or None
        entry["attendance"] = (
            count(cells["attendance"].text.replace(",", "")) if "attendance" in cells else None
        )
    return list(records.values())
