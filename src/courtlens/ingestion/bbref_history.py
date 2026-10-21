"""Basketball-Reference league seasons and player game logs before 2000-01 (source policy v3).

Pure URL building and player enumeration; fetching and storage live in
services/bbref_history.py. Seasons are named by their end year, as the source names them
(1985 is 1984-85). The BAA seasons (1947-1949) live under a ``BAA_`` prefix.
"""

from __future__ import annotations

import re

from courtlens.ingestion.bbref_players import HOST
from courtlens.ingestion.finance_sources import Node, document

FIRST_SEASON = 1947
LAST_BAA_SEASON = 1949
# Per-100-possession tables start when the source has team turnovers.
FIRST_PER_POSS_SEASON = 1974
# Complete player box scores start in 1983-84.
FIRST_GAMELOG_SEASON = 1984

LEAGUE_PATH = re.compile(
    r"^/leagues/(NBA|BAA)_(\d{4})(|_totals|_per_game|_advanced|_per_poss)\.html$"
)
GAMELOG_PATH = re.compile(r"^/players/([a-z])/([a-z.'-]{1,9}\d{2})/gamelog/(\d{4})$")
BBREF_ID = re.compile(r"^[a-z.'-]{1,9}\d{2}$")
PLAYER_TABLES = ("totals_stats", "totals_stats_post")


def season_label(end_year: int) -> str:
    return f"{end_year - 1}-{end_year % 100:02d}"


def league_prefix(end_year: int) -> str:
    return "BAA" if end_year <= LAST_BAA_SEASON else "NBA"


def league_urls(end_year: int) -> list[str]:
    """The season summary (team stats, standings) and the player tables for one season."""
    suffixes = ["", "_totals", "_per_game", "_advanced"]
    if end_year >= FIRST_PER_POSS_SEASON:
        suffixes.append("_per_poss")
    prefix = league_prefix(end_year)
    return [f"https://{HOST}/leagues/{prefix}_{end_year}{suffix}.html" for suffix in suffixes]


def totals_url(end_year: int) -> str:
    return f"https://{HOST}/leagues/{league_prefix(end_year)}_{end_year}_totals.html"


def gamelog_url(bbref_id: str, end_year: int) -> str:
    return f"https://{HOST}/players/{bbref_id[0]}/{bbref_id}/gamelog/{end_year}"


def season_players(raw: bytes) -> list[str]:
    """Every player ID in a season's regular-season and playoff totals tables, sorted."""
    tables = [t for t in document(raw).walk("table") if t.attrs.get("id") in PLAYER_TABLES]
    if not any(t.attrs.get("id") == "totals_stats" for t in tables):
        raise ValueError("totals page has no totals_stats table")
    ids: set[str] = set()
    for table in tables:
        for cell in table.walk("td"):
            bbref_id = _player_id(cell)
            if bbref_id is not None:
                ids.add(bbref_id)
    if not ids:
        raise ValueError("totals page lists no players")
    return sorted(ids)


def _player_id(cell: Node) -> str | None:
    # The League Average row has a name cell without an ID.
    if cell.attrs.get("data-stat") != "name_display" or "data-append-csv" not in cell.attrs:
        return None
    bbref_id = cell.attrs["data-append-csv"]
    if not BBREF_ID.fullmatch(bbref_id):
        raise ValueError(f"unexpected player ID in totals table: {bbref_id[:40]!r}")
    return bbref_id
