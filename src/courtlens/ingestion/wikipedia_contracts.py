"""Contract terms a player's Wikipedia article states in its prose, read as dated statements.

Basketball-Reference's transaction lines often leave out a contract's length ("Signed as a free
agent", "Signed extension"), and its list misses some signings (an opt-out and re-signing). The
player's article usually says it outright: "On July 7, 2019, Durant signed a four-year,
$164.3 million contract with the Nets". The parser reads only what a sentence states:

- A statement is one sentence with a signing verb (signed, re-signed, agreed, extended), a
  contract noun (contract, deal, extension, agreement, offer sheet) and a term after the verb: a
  length ("four-year", "3-year"), a two-way, 10-day, Exhibit 10 or rest-of-season contract. A
  term the sentence revises ("later restructured to a four-year") is read as revised.
- A verb after a hedge ("declined to sign", "was offered", "would have signed") is not a signing.
  Endorsement and media deals, and sentences that name only a club abroad, are left out.
- The date is the sentence's own. A date without a year takes it from an earlier dated sentence
  in the same paragraph (the narrative runs forward), else from a section heading naming one
  season ("2019-20 season", "Houston Rockets (2025-2026)"). A wider heading range is kept as a
  range. A sentence with no month keeps only a season ("before the 2010-11 season", "during the
  2015 offseason") or a year (its own, the paragraph's, or the section's narrative). Ranges,
  seasons and years are for matching a listed signing only, never for adding one.
- NBA teams named in the sentence are recorded as Basketball-Reference codes across eras
  ("Nets" is NJN or BRK), so a statement is checked against the team that paid that season.

Nothing is inferred here: which signing a statement describes is decided at serving time
(services/contract_spans.py), where Basketball-Reference's own wording stays primary.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import date
from html.parser import HTMLParser
from typing import Any

PARSER_VERSION = "wikipedia-contracts-v1"

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
_MONTH = "(" + "|".join(MONTHS) + ")"
_MDY = re.compile(_MONTH + r"\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b")
_DMY = re.compile(r"\b(\d{1,2})\s+" + _MONTH + r"(?:,?\s+(\d{4}))?\b")
_MONTH_YEAR = re.compile(r"\b" + _MONTH + r",?\s+(\d{4})\b")
_YEAR = re.compile(r"\b(19[4-9]\d|20[0-4]\d)\b")
_SEASON = re.compile(r"\b(19[4-9]\d|20[0-4]\d)[\u2013-](\d{2})\b(?!\d)")
_RANGE = re.compile(r"\b(19[4-9]\d|20[0-4]\d)\s*[\u2013-]\s*(19[4-9]\d|20[0-4]\d|present)\b")

NUMBERS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}
_VERB = re.compile(r"\b(re-?signed|signed|signing|agreed|inked|extended|re-upped)\b", re.IGNORECASE)
_NOUN = re.compile(r"\b(contract|deal|extension|agreement|offer sheet|pact)\b", re.IGNORECASE)
_LENGTH = re.compile(
    r"\b(\d{1,2}|" + "|".join(NUMBERS) + r")[- ](?:year|yr)s?\b(?![- ]old)", re.IGNORECASE
)
_TWO_WAY = re.compile(r"\btwo-way\b", re.IGNORECASE)
_TEN_DAY = re.compile(r"\b(?:10|ten)-day\b", re.IGNORECASE)
_EXHIBIT_10 = re.compile(r"\bexhibit[- ]10\b", re.IGNORECASE)
_REST_OF_SEASON = re.compile(
    r"\b(?:rest|remainder)[- ]of[- ](?:the[- ])?(?:\d{4}[\u2013-]\d{2,4}[- ])?season\b",
    re.IGNORECASE,
)
# Undated sentences that still place a signing: "Before the 2010-11 season", "during the 2015
# offseason", "following the 2018-19 season" (the summer after it).
_SEASON_PHRASE = re.compile(
    r"\b(?:before|prior to|ahead of|during|in)(?: the start of)? the "
    r"(19[4-9]\d|20[0-4]\d)[\u2013-](\d{2}) (?:season|campaign)\b",
    re.IGNORECASE,
)
_OFFSEASON = re.compile(
    r"\b(?:during|in) the (19[4-9]\d|20[0-4]\d) (?:offseason|off-season|free agency|summer)\b",
    re.IGNORECASE,
)
_AFTER_SEASON = re.compile(
    r"\b(?:after|following) the (19[4-9]\d|20[0-4]\d)(?:[\u2013-](\d{2}))? (?:season|campaign)\b",
    re.IGNORECASE,
)
# A year after one of these is when a contract ends, not when it was signed.
_UNTIL = re.compile(
    r"\b(?:through|thru|until|till|to|expir\w*|end\w*|runs?|option for|options? for)\s+"
    r"(?:the\s+)?$",
    re.IGNORECASE,
)
_REVISED = re.compile(
    r"\b(?:restructur\w*|convert\w*|amend\w*|renegotiat\w*|chang\w*|upgrad\w*)\b",
    re.IGNORECASE,
)
_EXTENSION = re.compile(r"\bextension\b|\bextended\b|\bextend\b", re.IGNORECASE)
_VALUE = re.compile(r"\$\s?(\d[\d,]*(?:\.\d+)?)\s*-?\s*(million|billion)?\b", re.IGNORECASE)
# A verb after one of these is not a signing that happened.
_HEDGE = re.compile(
    r"\b(not|never|declin\w*|refus\w*|fail\w*|offer\w*|would|could|might|hop\w*|expect\w*|"
    r"attempt\w*|reject\w*|rumou?r\w*|talks?|negotiat\w*|sought|seek\w*|wanted|planned|"
    r"report(?:s|ed)? (?:that|of)|turn(?:ed)? down|instead of)\W+(?:\w+\W+){0,4}$",
    re.IGNORECASE,
)
_NOT_PLAYING = re.compile(
    r"\b(endorsement|sponsorship|shoe|sneaker|apparel|nike|adidas|puma|jordan brand|anta|li-ning|"
    r"under armour|media|broadcast\w*|podcast|book|publish\w*|record label|production|esports|"
    r"coach\w*|assistant|front office|general manager|scout\w*|television|network|endorse\w*)\b",
    re.IGNORECASE,
)
_ABROAD = re.compile(
    r"\b(euroleague|eurocup|liga|lega|basket|baskets|bc|kk|bk|cska|real madrid|barcelona|"
    r"olympiacos|"
    r"panathinaikos|fenerbah\w*|anadolu|maccabi|hapoel|partizan|crvena|zalgiris|baskonia|"
    r"valencia|unicaja|virtus|olimpia|chinese basketball|cba|nbl|kbl|b\.league|pba|turkish|"
    r"greek|italian|spanish|israeli|ukrainian|russian|australian|japanese|korean|chinese|"
    r"filipino|philippine|puerto ric\w*|french|german|lithuanian|serbian|venezuelan|argentin\w*|"
    r"mexican|lnb|acb|bsl|vtb|big3|harlem globetrotters)\b",
    re.IGNORECASE,
)

# NBA teams by nickname and by place, as Basketball-Reference codes across every era.
_NICKNAMES: dict[str, tuple[str, ...]] = {
    "Hawks": ("ATL", "STL", "MLH", "TRI"),
    "Celtics": ("BOS",),
    "Nets": ("NJN", "BRK", "NYN", "NJA"),
    "Hornets": ("CHH", "CHO", "NOH", "NOK"),
    "Bobcats": ("CHA",),
    "Bulls": ("CHI",),
    "Cavaliers": ("CLE",),
    "Cavs": ("CLE",),
    "Mavericks": ("DAL",),
    "Mavs": ("DAL",),
    "Nuggets": ("DEN",),
    "Pistons": ("DET", "FTW"),
    "Warriors": ("GSW", "SFW", "PHW"),
    "Rockets": ("HOU", "SDR"),
    "Pacers": ("IND",),
    "Kings": ("SAC", "KCK", "KCO", "CIN", "ROC"),
    "Clippers": ("LAC", "SDC", "BUF"),
    "Lakers": ("LAL", "MNL"),
    "Grizzlies": ("MEM", "VAN"),
    "Heat": ("MIA",),
    "Bucks": ("MIL",),
    "Timberwolves": ("MIN",),
    "Wolves": ("MIN",),
    "Pelicans": ("NOP",),
    "Knicks": ("NYK",),
    "Thunder": ("OKC",),
    "Magic": ("ORL",),
    "76ers": ("PHI",),
    "Sixers": ("PHI",),
    "Suns": ("PHO",),
    "Trail Blazers": ("POR",),
    "Blazers": ("POR",),
    "Spurs": ("SAS",),
    "SuperSonics": ("SEA",),
    "Sonics": ("SEA",),
    "Raptors": ("TOR",),
    "Jazz": ("UTA", "NOJ"),
    "Wizards": ("WAS",),
    "Bullets": ("WSB", "CAP", "BAL"),
}
_PLACES: dict[str, tuple[str, ...]] = {
    "Atlanta": ("ATL",),
    "Boston": ("BOS",),
    "Brooklyn": ("BRK",),
    "New Jersey": ("NJN",),
    "Charlotte": ("CHH", "CHA", "CHO"),
    "Chicago": ("CHI",),
    "Cleveland": ("CLE",),
    "Dallas": ("DAL",),
    "Denver": ("DEN",),
    "Detroit": ("DET",),
    "Golden State": ("GSW",),
    "Houston": ("HOU",),
    "Indiana": ("IND",),
    "Sacramento": ("SAC",),
    "Kansas City": ("KCK",),
    "Memphis": ("MEM",),
    "Vancouver": ("VAN",),
    "Miami": ("MIA",),
    "Milwaukee": ("MIL",),
    "Minnesota": ("MIN",),
    "New Orleans": ("NOH", "NOK", "NOP"),
    "New York": ("NYK",),
    "Oklahoma City": ("OKC",),
    "Orlando": ("ORL",),
    "Philadelphia": ("PHI",),
    "Phoenix": ("PHO",),
    "Portland": ("POR",),
    "San Antonio": ("SAS",),
    "Seattle": ("SEA",),
    "Toronto": ("TOR",),
    "Utah": ("UTA",),
    "Washington": ("WAS", "WSB"),
    "Los Angeles": ("LAL", "LAC"),
}
_TEAM = re.compile(
    r"\b("
    + "|".join(sorted((re.escape(k) for k in {**_NICKNAMES, **_PLACES}), key=len, reverse=True))
    + r")\b"
)


@dataclass
class Statement:
    text: str
    section: str | None
    kind: str  # signing | extension
    term: str  # standard | two_way | ten_day | exhibit_10 | rest_of_season
    years: int | None
    value: str | None  # "$164.3M"
    teams: list[str] = field(default_factory=list)
    teams_basis: str = "none"  # sentence | heading | none
    date: str | None = None  # ISO, when the year is known
    month: int | None = None
    day: int | None = None
    year_basis: str = "none"  # sentence | narrative | heading | range | none
    year_range: list[int] | None = None
    season: int | None = None  # start year, from "before the 2010-11 season" when undated
    year: int | None = None  # calendar year only, when a sentence has no month (matching only)


_VOID = frozenset(
    ("area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "wbr")
)


class _Prose(HTMLParser):
    """The article body's paragraphs with the heading above each; references and tables skipped."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.paragraphs: list[tuple[str | None, str]] = []
        self.text: str | None = None
        self.heading: str | None = None
        self.heading_text: str | None = None
        # Open elements inside a skipped one (references, styles, edit links); 0 when reading.
        self.skip = 0
        self.tables = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _VOID:
            if tag == "br" and self.text is not None and not self.skip:
                self.text += " "
            return
        if self.skip:
            self.skip += 1
            return
        classes = dict(attrs).get("class") or ""
        if tag in ("sup", "style", "script") or (tag == "span" and "mw-editsection" in classes):
            self.skip = 1
        elif tag == "table":
            self.tables += 1
        elif tag == "p" and not self.tables:
            self.text = ""
        elif tag in ("h2", "h3", "h4"):
            self.heading_text = ""

    def handle_endtag(self, tag: str) -> None:
        if tag in _VOID:
            return
        if self.skip:
            self.skip -= 1
            return
        if tag == "table":
            self.tables = max(0, self.tables - 1)
        elif tag == "p" and self.text is not None:
            text = re.sub(r"\s+", " ", self.text).strip()
            if text:
                self.paragraphs.append((self.heading, text))
            self.text = None
        elif tag in ("h2", "h3", "h4") and self.heading_text is not None:
            self.heading = re.sub(r"\s+", " ", self.heading_text).strip() or None
            self.heading_text = None

    def handle_data(self, data: str) -> None:
        if self.skip:
            return
        if self.text is not None:
            self.text += data
        if self.heading_text is not None:
            self.heading_text += data


def _sentences(paragraph: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\"“(])", paragraph) if s]


def _first_date(sentence: str) -> tuple[int, int | None, int | None] | None:
    """(month, day, year) of the sentence's first date; day None for 'In February 2013'."""
    found: list[tuple[int, tuple[int, int | None, int | None]]] = []
    for match in _MDY.finditer(sentence):
        day = int(match[2])
        if 1 <= day <= 31:
            year = int(match[3]) if match[3] else None
            found.append((match.start(), (MONTHS[match[1]], day, year)))
    for match in _DMY.finditer(sentence):
        day = int(match[1])
        if 1 <= day <= 31:
            year = int(match[3]) if match[3] else None
            found.append((match.start(), (MONTHS[match[2]], day, year)))
    for match in _MONTH_YEAR.finditer(sentence):
        if not any(start <= match.start() <= start + 2 for start, _ in found):
            found.append((match.start(), (MONTHS[match[1]], None, int(match[2]))))
    return min(found)[1] if found else None


def _season_of_month(start: int, month: int) -> int:
    """The calendar year a month falls in during the season starting `start` (July to June)."""
    return start if month >= 7 else start + 1


def _heading_season(heading: str | None) -> tuple[int, int] | None:
    """A heading's span of season start years: one season, or a wider range."""
    if not heading:
        return None
    season = _SEASON.search(heading)
    if season:
        start = int(season[1])
        if (start + 1) % 100 == int(season[2]):
            return start, start
    span = _RANGE.search(heading)
    if span:
        first = int(span[1])
        last = date.today().year if span[2] == "present" else int(span[2])
        # "Nets (2019-2020)" is the 2019-20 season; a single year is the season it opens or ends.
        return first, max(first, last - 1)
    year = _YEAR.search(heading)
    if year:
        value = int(year[1])
        return value - 1, value
    return None


def _value(window: str) -> str | None:
    match = _VALUE.search(window)
    if not match:
        return None
    amount = match[1].replace(",", "")
    unit = (match[2] or "").lower()
    if unit == "million":
        return f"${amount}M"
    if unit == "billion":
        return f"${amount}B"
    number = float(amount)
    if number >= 1_000_000:
        return f"${number / 1_000_000:.3g}M"
    return f"${amount}"


def _teams(sentence: str) -> list[str]:
    """Teams named, as codes; a place followed by a nickname ("Los Angeles Clippers") is that
    nickname's team only."""
    codes: set[str] = set()
    matches = list(_TEAM.finditer(sentence))
    for i, match in enumerate(matches):
        name = match[1]
        following = matches[i + 1] if i + 1 < len(matches) else None
        if (
            name in _PLACES
            and following is not None
            and following[1] in _NICKNAMES
            and not sentence[match.end() : following.start()].strip()
        ):
            continue
        codes.update(_NICKNAMES.get(name) or _PLACES[name])
    return sorted(codes)


def _statement(sentence: str, section: str | None) -> Statement | None:
    for verb in _VERB.finditer(sentence):
        before = sentence[max(0, verb.start() - 60) : verb.start()]
        if _HEDGE.search(before):
            continue
        window = sentence[verb.start() : verb.start() + 220]
        if not _NOUN.search(window) or _NOT_PLAYING.search(window):
            continue
        length = _LENGTH.search(window)
        terms_text = window
        # "a two-year contract; the deal was later restructured to a four-year": the revised term.
        revised = _REVISED.search(window, length.end()) if length else None
        if revised and (later := _LENGTH.search(window, revised.end())):
            length, terms_text = later, window[revised.end() :]
        term = (
            "two_way"
            if _TWO_WAY.search(window)
            else "ten_day"
            if _TEN_DAY.search(window)
            else "exhibit_10"
            if _EXHIBIT_10.search(window)
            else "rest_of_season"
            if _REST_OF_SEASON.search(window)
            else "standard"
        )
        if length is None and term == "standard":
            continue
        teams = _teams(sentence)
        if not teams and (_ABROAD.search(sentence) or _ABROAD.search(section or "")):
            return None
        # "...signed a two-year extension." under "Houston Rockets (2025-present)".
        teams_basis = "sentence" if teams else "heading"
        if not teams:
            teams = _teams(section or "")
        if not teams:
            teams_basis = "none"
        years = None
        if length:
            word = length[1].lower()
            years = NUMBERS.get(word) or int(word)
            if not 1 <= years <= 10:
                continue
        elif term in ("exhibit_10", "rest_of_season"):
            years = 1
        return Statement(
            text=sentence[:400],
            section=section,
            kind="extension" if _EXTENSION.search(window) else "signing",
            term=term,
            years=years,
            value=_value(terms_text),
            teams=teams,
            teams_basis=teams_basis,
        )
    return None


def _bare_year(sentence: str) -> int | None:
    """A year the sentence names on its own (not a season, not when a contract ends)."""
    text = _RANGE.sub(" ", _SEASON.sub(" ", sentence))
    for match in _YEAR.finditer(text):
        if not _UNTIL.search(text[max(0, match.start() - 20) : match.start()]):
            return int(match[1])
    return None


def _undated(
    statement: Statement,
    previous: tuple[int, int] | None,
    section_year: int | None,
    heading: tuple[int, int] | None,
) -> None:
    """A sentence with no month: a season or a year, kept for matching only."""
    text = statement.text
    phrase = _SEASON_PHRASE.search(text)
    after = _AFTER_SEASON.search(text)
    offseason = _OFFSEASON.search(text)
    if phrase and (int(phrase[1]) + 1) % 100 == int(phrase[2]):
        statement.season, statement.year_basis = int(phrase[1]), "season"
    elif offseason:
        statement.season, statement.year_basis = int(offseason[1]), "season"
    elif after and (after[2] is None or (int(after[1]) + 1) % 100 == int(after[2])):
        # The summer after the 2018-19 season (or "the 2019 season") opens 2019-20.
        start = int(after[1]) + 1 if after[2] else int(after[1])
        statement.season, statement.year_basis = start, "season"
    elif (year := _bare_year(text)) is not None:
        statement.year, statement.year_basis = year, "sentence_year"
    elif previous is not None:
        statement.year, statement.year_basis = previous[0], "narrative_year"
    elif section_year is not None:
        statement.year, statement.year_basis = section_year, "section_year"
    elif heading is not None and heading[0] == heading[1]:
        statement.season, statement.year_basis = heading[0], "season"


def _date_statement(
    statement: Statement,
    when: tuple[int, int | None, int | None] | None,
    previous: tuple[int, int] | None,
    heading: tuple[int, int] | None,
    section_year: int | None = None,
) -> None:
    if when is None:
        _undated(statement, previous, section_year, heading)
        return
    month, day, year = when
    statement.month, statement.day = month, day
    if year is None:
        # "On July 7, Maxey signed ... in the 2024 offseason": the sentence names its year.
        offseason = _OFFSEASON.search(statement.text)
        year = int(offseason[1]) if offseason else None
    if year is None and previous is None:
        # A bare year of its own outranks a heading, never an earlier dated sentence.
        year = _bare_year(statement.text)
    if year is not None:
        statement.year_basis = "sentence"
    elif previous is not None:
        # The narrative runs forward: a later month keeps the year, an earlier one rolls over.
        prev_year, prev_month = previous
        year = prev_year if month >= prev_month else prev_year + 1
        statement.year_basis = "narrative"
    elif heading is not None and heading[0] == heading[1]:
        year = _season_of_month(heading[0], month)
        statement.year_basis = "heading"
    elif heading is not None:
        statement.year_basis = "range"
        statement.year_range = [heading[0], heading[1] + 1]
        return
    else:
        return
    if day is not None:
        try:
            statement.date = date(year, month, day).isoformat()
        except ValueError:
            statement.year_basis = "none"
    else:
        statement.date = f"{year:04d}-{month:02d}"


def parse_article(html: str | bytes) -> dict[str, Any]:
    """Every contract statement in the article's prose, in reading order."""
    text = html.decode("utf-8", errors="replace") if isinstance(html, bytes) else html
    revision = re.search(r'"wgRevisionId":\s*(\d+)', text)
    title = re.search(r'"wgPageName":\s*"([^"]+)"', text)
    prose = _Prose()
    prose.feed(text)
    statements: list[dict[str, Any]] = []
    section: str | None = None
    section_year: int | None = None
    for heading, paragraph in prose.paragraphs:
        if heading != section:
            section, section_year = heading, None
        season = _heading_season(heading)
        previous: tuple[int, int] | None = None
        for sentence in _sentences(paragraph):
            when = _first_date(sentence)
            found = _statement(sentence, heading)
            if found is not None:
                _date_statement(found, when, previous, season, section_year)
                statements.append(asdict(found))
            if when is not None and when[2] is not None:
                previous = (when[2], when[0])
            elif when is not None and previous is not None:
                prev_year, prev_month = previous
                previous = (prev_year if when[0] >= prev_month else prev_year + 1, when[0])
            elif (
                previous is None
                and (year := _YEAR.search(sentence))
                and not _SEASON.search(sentence)
            ):
                # A bare year ("In 2004, ...") opens the narrative at its first month.
                previous = (int(year[1]), 1)
            if previous is not None:
                # The section's narrative carries into its next paragraph, for matching only.
                section_year = previous[0]
    return {
        "parser": PARSER_VERSION,
        "revision_id": int(revision[1]) if revision else None,
        "title": title[1].replace("_", " ") if title else None,
        "paragraphs": len(prose.paragraphs),
        "statements": statements,
    }
