"""Basketball-Reference player pages: biography, honours and season awards (source policy v3).

Pure parsing and matching; fetching and storage live in services/bbref_bio.py. Values are read
from the page's own markup and never inferred: a field the page does not show stays null, and a
player who cannot be matched to an NBA ID with certainty is left unmatched.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from courtlens.ingestion.finance_sources import Node, document

PARSER_VERSION = "bbref-player-v1"
HOST = "www.basketball-reference.com"
INDEX_PATH = re.compile(r"^/players/([a-z])/$")
PLAYER_PATH = re.compile(r"^/players/([a-z])/([a-z.'-]{1,9}\d{2})\.html$")
SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


@dataclass(frozen=True)
class IndexEntry:
    bbref_id: str
    name: str
    year_min: int | None
    year_max: int | None
    birth_date: date | None


@dataclass(frozen=True)
class NbaPlayer:
    player_id: str
    name: str
    birth_date: date | None
    from_year: int | None
    to_year: int | None


def index_url(letter: str) -> str:
    return f"https://{HOST}/players/{letter}/"


def player_url(bbref_id: str) -> str:
    return f"https://{HOST}/players/{bbref_id[0]}/{bbref_id}.html"


def normalize_name(name: str) -> str:
    """Accents, punctuation and generational suffixes removed: "Nikola Jokić" -> "nikola jokic"."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    words = re.sub(r"[^a-z ]+", " ", ascii_name.lower().replace(".", "").replace("'", "")).split()
    return " ".join(word for word in words if word not in SUFFIXES)


def _cells(row: Node) -> dict[str, Node]:
    return {
        child.attrs["data-stat"]: child
        for child in row.children
        if isinstance(child, Node) and child.tag in {"th", "td"} and "data-stat" in child.attrs
    }


def _int(value: str) -> int | None:
    return int(value) if value.strip().isdigit() else None


def parse_index(raw: bytes) -> list[IndexEntry]:
    """One A-Z index page: every player's ID, name, first/last season and birth date."""
    tables = [t for t in document(raw).walk("table") if t.attrs.get("id") == "players"]
    if not tables:
        # A letter can have no players (X), but never lose its table: that is a layout change.
        raise ValueError("index page has no players table")
    entries: list[IndexEntry] = []
    for row in tables[0].walk("tr"):
        cells = _cells(row)
        player = cells.get("player")
        bbref_id = player.attrs.get("data-append-csv", "") if player else ""
        if not player or not re.fullmatch(r"[a-z.'-]{1,9}\d{2}", bbref_id):
            continue
        birth = cells.get("birth_date")
        csk = birth.attrs.get("csk", "") if birth else ""
        entries.append(
            IndexEntry(
                bbref_id=bbref_id,
                name=player.text(),
                year_min=_int(cells["year_min"].text()) if "year_min" in cells else None,
                year_max=_int(cells["year_max"].text()) if "year_max" in cells else None,
                birth_date=datetime.strptime(csk, "%Y%m%d").date()
                if re.fullmatch(r"\d{8}", csk)
                else None,
            )
        )
    return entries


def match_players(entries: list[IndexEntry], players: list[NbaPlayer]) -> dict[str, str]:
    """NBA player ID -> Basketball-Reference ID, only where the match is unambiguous.

    A normalized name plus an equal birth date is a match. Without a birth date on our side, a
    name that only one Basketball-Reference player has, with overlapping seasons, is a match.
    Anything else (no candidate, or two players sharing the evidence) stays unmatched.
    """
    by_name: dict[str, list[IndexEntry]] = {}
    for entry in entries:
        by_name.setdefault(normalize_name(entry.name), []).append(entry)
    matched: dict[str, str] = {}
    for player in players:
        candidates = by_name.get(normalize_name(player.name), [])
        if player.birth_date is not None:
            found = [c for c in candidates if c.birth_date == player.birth_date]
        else:
            found = [
                c
                for c in candidates
                if c.year_min is not None
                and c.year_max is not None
                and player.from_year is not None
                and player.to_year is not None
                # Basketball-Reference labels a season by its ending year, the NBA by its start.
                and c.year_min <= player.to_year + 1
                and player.from_year + 1 <= c.year_max
            ]
            if len(candidates) != 1:
                found = []
        if len(found) == 1:
            matched[player.player_id] = found[0].bbref_id
    # One page can only describe one NBA player.
    counts: dict[str, int] = {}
    for bbref_id in matched.values():
        counts[bbref_id] = counts.get(bbref_id, 0) + 1
    return {pid: bid for pid, bid in matched.items() if counts[bid] == 1}


def _strong_value(meta: Node, label: str) -> Node | None:
    """The paragraph whose bold label is ``label`` (for example "High School:")."""
    for paragraph in meta.walk("p"):
        for strong in paragraph.walk("strong"):
            if strong.text().rstrip(": ").lower() == label.lower():
                return paragraph
    return None


def _visible_text(node: Node) -> str:
    """Text without the flag icons' hidden country codes (``<span class="f-i f-us">us</span>``)."""
    if "f-i" in node.attrs.get("class", "").split():
        return ""
    return " ".join(
        " ".join(_visible_text(c) if isinstance(c, Node) else c for c in node.children).split()
    )


def _after_label(paragraph: Node, label: str) -> str:
    text = _visible_text(paragraph)
    found = re.search(re.escape(label) + r"\s*:?\s*(.*)", text, re.I)
    return found.group(1).strip() if found else ""


def _season_awards(root: Node) -> dict[str, list[str]]:
    """Per-season award codes from the regular-season per-game table (MVP-2, AS, NBA1, ...)."""
    awards: dict[str, list[str]] = {}
    for table in root.walk("table"):
        if table.attrs.get("id") != "per_game_stats":
            continue
        for row in table.walk("tr"):
            cells = _cells(row)
            season = cells["year_id"].text() if "year_id" in cells else ""
            if not re.fullmatch(r"\d{4}-\d{2}", season) or "awards" not in cells:
                continue
            for code in (part.strip() for part in cells["awards"].text().split(",")):
                if code and code not in awards.setdefault(season, []):
                    awards[season].append(code)
    return {season: codes for season, codes in awards.items() if codes}


def parse_player_page(raw: bytes, bbref_id: str) -> dict[str, Any]:
    root = document(raw)
    meta = next((node for node in root.walk("div") if node.attrs.get("id") == "meta"), None)
    if meta is None:
        raise ValueError("player page has no biography block")
    heading = next(iter(meta.walk("h1")), None)
    name = heading.text() if heading else ""
    if not name:
        raise ValueError("player page has no name")

    born = _strong_value(meta, "Born")
    birthplace = None
    if born is not None:
        place = re.search(r"\bin\s+(.+?)\s*$", _visible_text(born))
        birthplace = re.sub(r"\s+,", ",", place.group(1)).strip(" ,") if place else None
    birth_span = next(
        (node for node in meta.walk("span") if node.attrs.get("id") == "necro-birth"), None
    )
    birth_date = birth_span.attrs.get("data-birth") if birth_span else None

    school = _strong_value(meta, "High School")
    high_school = re.sub(r"\s+,", ",", _after_label(school, "High School")) if school else None
    shoots = None
    for paragraph in meta.walk("p"):
        found = re.search(r"Shoots:\s*(Right|Left)", paragraph.text())
        if found:
            shoots = found.group(1)
    debut = _strong_value(meta, "NBA Debut")
    debut_date = None
    if debut is not None:
        try:
            debut_date = (
                datetime.strptime(_after_label(debut, "NBA Debut"), "%B %d, %Y").date().isoformat()
            )
        except ValueError:
            debut_date = None

    bling = next((node for node in root.walk("ul") if node.attrs.get("id") == "bling"), None)
    honours = [item.text() for item in bling.walk("li")] if bling else []

    awards = _season_awards(root)
    return {
        "parser": PARSER_VERSION,
        "bbref_id": bbref_id,
        "name": name,
        "birth_date": birth_date
        if birth_date and re.fullmatch(r"\d{4}-\d{2}-\d{2}", birth_date)
        else None,
        "birthplace": birthplace or None,
        "high_school": high_school or None,
        "shoots": shoots,
        "debut_date": debut_date,
        "honours": [honour for honour in honours if honour],
        "awards": awards,
        "all_star_seasons": sorted(season for season, codes in awards.items() if "AS" in codes),
    }
