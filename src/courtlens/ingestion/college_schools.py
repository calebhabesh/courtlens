"""College schools for the player header: where each player's college is, and its logo.

Pure parsing and matching; fetching and storage live in services/college_schools.py.

- The player's college is the last one his retained Basketball-Reference page lists ("College:"
  or "Colleges:", oldest first), by Basketball-Reference's own slug and name.
- The school's location is Sports-Reference's college basketball schools index
  (``/cbb/schools/``): one row per school with its name ("North Carolina Tar Heels") and
  "City, State". Basketball-Reference's college slugs are its own ("unc"), so a college joins a
  school by the same slug, then by its name, then by ``ALIASES``; anything else stays unknown.
- The logo is ESPN's dark-background team logo, joined on the full school name Sports-Reference
  and ESPN both use ("North Carolina Tar Heels"), then by ``ESPN_ALIASES``. ESPN lists Division I
  only, so older and smaller schools keep a location without a logo.

A wrong school is worse than none: every rule needs a single candidate.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass

SR_HOST = "www.sports-reference.com"
SR_SCHOOLS_URL = f"https://{SR_HOST}/cbb/schools/"
ESPN_API_HOST = "site.api.espn.com"
ESPN_TEAMS_URL = (
    f"https://{ESPN_API_HOST}/apis/site/v2/sports/basketball/mens-college-basketball/teams"
    "?limit=1000"
)
ESPN_LOGO_HOST = "a.espncdn.com"
ESPN_LOGO_PATH = re.compile(r"^/i/teamlogos/ncaa/500-dark/(\d{1,6})\.png$")

# Basketball-Reference college slug -> Sports-Reference school slug, where neither the slug nor
# the name settles it (abbreviations and renamed schools). Each target is checked to exist.
ALIASES: dict[str, str] = {
    "unc": "north-carolina",
    "bostoncoll": "boston-college",
    "usc": "southern-california",
    "uconn": "connecticut",
    "stjohns": "st-johns-ny",
    "lsu": "louisiana-state",
    "texasam": "texas-am",
    "pitt": "pittsburgh",
    "txchrist": "texas-christian",
    "unlv": "nevada-las-vegas",
    "byu": "brigham-young",
    "smethodist": "southern-methodist",
    "vcu": "virginia-commonwealth",
    "olemiss": "mississippi",
    "ulala": "louisiana-lafayette",
    "longbeach": "long-beach-state",
    "loyolachi": "loyola-il",
    "utep": "texas-el-paso",
    "miamioh": "miami-oh",
    "umass": "massachusetts",
    "winstsalst": "winston-salem-state",
    "ucirvine": "california-irvine",
    "southernu": "southern",
    "austinpeay": "austin-peay",
    "smiss": "southern-mississippi",
    "willmary": "william-mary",
    "utsa": "texas-san-antonio",
    "tntech": "tennessee-tech",
}

# Sports-Reference school slug -> ESPN display name, where the two name a school differently.
ESPN_ALIASES: dict[str, str] = {
    "miami-fl": "Miami Hurricanes",
    "appalachian-state": "App State Mountaineers",
    "loyola-md": "Loyola Maryland Greyhounds",
    "st-johns-ny": "St. John's Red Storm",
    "connecticut": "UConn Huskies",
    "louisiana-state": "LSU Tigers",
    "southern-california": "USC Trojans",
    "nevada-las-vegas": "UNLV Rebels",
    "brigham-young": "BYU Cougars",
    "long-island-university": "Long Island University Sharks",
    "loyola-il": "Loyola Chicago Ramblers",
    "southern-methodist": "SMU Mustangs",
    "virginia-commonwealth": "VCU Rams",
    "texas-christian": "TCU Horned Frogs",
    "mississippi": "Ole Miss Rebels",
    "seattle": "Seattle U Redhawks",
    "new-orleans": "LSU New Orleans Privateers",
    "louisiana-monroe": "UL Monroe Warhawks",
    "college-of-charleston": "Charleston Cougars",
    "southern-mississippi": "Southern Miss Golden Eagles",
    "grand-canyon": "Grand Canyon Lopes",
    "virginia-military-institute": "VMI Keydets",
    "central-connecticut-state": "Central Connecticut Blue Devils",
    "american": "American University Eagles",
    "queens-nc": "Queens University Royals",
    "nicholls-state": "Nicholls Colonels",
    "iupui": "IU Indianapolis Jaguars",
    "delaware": "Delaware Blue Hens",
}

_COLLEGES = re.compile(r"<strong>\s*Colleges?:\s*</strong>(.*?)</p>", re.S)
_COLLEGE_LINK = re.compile(r"""colleges\.fcgi\?college=([a-z0-9-]+)['"]\s*>([^<]+)</a>""")


@dataclass(frozen=True)
class School:
    slug: str
    name: str
    location: str | None


@dataclass(frozen=True)
class EspnTeam:
    espn_id: str
    name: str
    logo_url: str


def normalize(text: str) -> str:
    """Lower-case ASCII words: "Texas A&M" -> "texas a and m", dashes as spaces."""
    spaced = re.sub("[\u2010-\u2015]", " ", text)  # Unicode dashes separate words
    ascii_text = unicodedata.normalize("NFKD", spaced).encode("ascii", "ignore").decode()
    words = re.sub(r"[^a-z0-9]+", " ", ascii_text.lower().replace("&", " and ").replace("'", ""))
    return " ".join(words.split())


def player_college(raw: bytes) -> tuple[str, str] | None:
    """(slug, name) of the last college a Basketball-Reference player page lists, or None."""
    found = _COLLEGES.search(raw.decode("utf-8", "ignore"))
    links = _COLLEGE_LINK.findall(found.group(1)) if found else []
    if not links:
        return None
    slug, name = links[-1]
    return slug, " ".join(name.split())


def _text(cell: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", cell).replace("&amp;", "&").split())


def parse_sr_schools(raw: bytes) -> dict[str, School]:
    """Sports-Reference's schools index: slug -> school name and "City, State"."""
    page = raw.decode("utf-8", "ignore")
    schools: dict[str, School] = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        link = re.search(r'href="/cbb/schools/([a-z0-9-]+)/men/"', row)
        name = re.search(r'data-stat="school_name"[^>]*>(.*?)</t[dh]>', row, re.S)
        place = re.search(r'data-stat="location"[^>]*>(.*?)</t[dh]>', row, re.S)
        if link and name and _text(name.group(1)):
            location = _text(place.group(1)) if place else ""
            schools[link.group(1)] = School(link.group(1), _text(name.group(1)), location or None)
    if len(schools) < 100:
        # The index lists every school; a short page is a layout change, not fewer schools.
        raise ValueError(f"schools index has {len(schools)} schools")
    return schools


def parse_espn_teams(raw: bytes) -> dict[str, EspnTeam]:
    """ESPN's men's college basketball teams: normalized display name -> dark logo."""
    body = json.loads(raw)
    leagues = body["sports"][0]["leagues"][0]["teams"]
    teams: dict[str, EspnTeam] = {}
    for entry in leagues:
        team = entry["team"]
        espn_id, name = str(team.get("id", "")), team.get("displayName") or ""
        if not espn_id.isdigit() or not name:
            continue
        logo = f"https://{ESPN_LOGO_HOST}/i/teamlogos/ncaa/500-dark/{espn_id}.png"
        teams[normalize(name)] = EspnTeam(espn_id, name, logo)
    if len(teams) < 100:
        raise ValueError(f"ESPN lists {len(teams)} teams")
    return teams


def _short(name: str) -> str:
    """A school name without "University (of)" or "College": "University of Northern Iowa"
    -> "northern iowa"."""
    words = normalize(name)
    words = re.sub(r"^(the )?university of (california )?", "", words)
    words = re.sub(r" (university|college)$", "", words)
    return words.strip()


def match_school(slug: str, name: str, schools: dict[str, School]) -> str | None:
    """The Sports-Reference school a Basketball-Reference college is, or None."""
    if slug in ALIASES:
        return ALIASES[slug] if ALIASES[slug] in schools else None
    if slug in schools:
        return slug
    short = _short(name)
    if not short:
        return None
    if short.replace(" ", "-") in schools:
        return short.replace(" ", "-")
    # The school name plus its mascot: "Notre Dame" is "Notre Dame Fighting Irish".
    prefixed = [
        s for s, school in schools.items() if normalize(school.name).startswith(short + " ")
    ]
    return prefixed[0] if len(prefixed) == 1 else None


def match_espn(school: School, teams: dict[str, EspnTeam]) -> EspnTeam | None:
    return teams.get(normalize(ESPN_ALIASES.get(school.slug, school.name)))


def validate_url(url: str) -> bool:
    """Only the two index pages and ESPN's dark Division I logos are fetched."""
    if url in (SR_SCHOOLS_URL, ESPN_TEAMS_URL):
        return True
    match = re.fullmatch(rf"https://{re.escape(ESPN_LOGO_HOST)}(/[^?#]*)", url)
    return bool(match and ESPN_LOGO_PATH.fullmatch(match.group(1)))
