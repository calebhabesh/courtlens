"""Domain models, text normalization, and deterministic matching for entity lookup."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import quote

LOOKUP_CATALOG_VERSION = "pf04-v2"
LOOKUP_NORMALIZATION_VERSION = "v1"

# Suffixes commonly present in player names
SUFFIX_RE = re.compile(r"\b(jr\.?|sr\.?|ii|iii|iv|v)\b", re.IGNORECASE)

# Punctuation characters to strip/replace
PUNCT_RE = re.compile(r"[\x27\`\.\,\-\_\/\(\)]")

# Special non-ASCII characters not decomposed into ASCII by NFKD
SPECIAL_CHAR_MAP: dict[str, str] = {
    "ø": "o",
    "Ø": "o",
    "æ": "ae",
    "Æ": "ae",
    "œ": "oe",
    "Œ": "oe",
    "ß": "ss",
    "đ": "d",
    "Đ": "d",
    "ð": "d",
    "Ð": "d",
    "ł": "l",
    "Ł": "l",
    "ı": "i",  # noqa: RUF001
}


def normalize_lookup_text(text: str) -> str:
    """Normalize input text by folding case, removing diacritics, and stripping punctuation.

    Versioned via LOOKUP_NORMALIZATION_VERSION.
    """
    if not text:
        return ""
    # NFKD decomposition
    decomposed = unicodedata.normalize("NFKD", text)
    # Strip combining marks (accents, diacritics)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    # Replace known special letters
    for k, v in SPECIAL_CHAR_MAP.items():
        stripped = stripped.replace(k, v)
    lowered = stripped.casefold()
    cleaned = PUNCT_RE.sub(" ", lowered)
    return " ".join(cleaned.split())


def tokenize_lookup_text(text: str) -> list[str]:
    """Tokenize normalized text into distinct whitespace-delimited tokens."""
    norm = normalize_lookup_text(text)
    return [t for t in norm.split() if t]


def damerau_levenshtein_distance(s1: str, s2: str, max_dist: int = 2) -> int:
    """Fast bounded Levenshtein distance with early exit when difference exceeds max_dist."""
    len1, len2 = len(s1), len(s2)
    if abs(len1 - len2) > max_dist:
        return max_dist + 1
    if s1 == s2:
        return 0

    prev = list(range(len2 + 1))
    curr = [0] * (len2 + 1)
    for i in range(1, len1 + 1):
        curr[0] = i
        min_in_row = i
        c1 = s1[i - 1]
        for j in range(1, len2 + 1):
            cost = 0 if c1 == s2[j - 1] else 1
            curr[j] = min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
            min_in_row = min(min_in_row, curr[j])
        if min_in_row > max_dist:
            return max_dist + 1
        prev, curr = curr, prev
    return prev[len2]


def generate_player_aliases(
    display_name: str, external_aliases: list[str] | None = None
) -> list[str]:
    """Generate search aliases for a player name (accents, suffix stripped, compact, tokens)."""
    aliases: list[str] = []

    # 1. Base normalized with spaces replacing punctuation
    base_norm = normalize_lookup_text(display_name)
    if base_norm:
        aliases.append(base_norm)

    # 2. Compact version without spaces for apostrophes/hyphens/dots (e.g. "deaaron fox")
    decomposed = unicodedata.normalize("NFKD", display_name)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    for k, v in SPECIAL_CHAR_MAP.items():
        stripped = stripped.replace(k, v)
    lowered = stripped.casefold()
    compact_spaced = " ".join(re.sub(r"[\x27\`\.\-]", "", lowered).split())
    if compact_spaced and compact_spaced not in aliases:
        aliases.append(compact_spaced)
    compact = re.sub(r"[\x27\`\.\-\s]", "", lowered)
    if compact and compact not in aliases and len(compact) >= 3:
        aliases.append(compact)

    # 3. Suffix-stripped version (e.g. "Gary Trent Jr." -> "gary trent")
    without_suffix = " ".join(SUFFIX_RE.sub("", base_norm).split())
    if without_suffix and without_suffix not in aliases:
        aliases.append(without_suffix)

    # 4. Individual name tokens (e.g. surname "jokic", first name "luka")
    tokens = base_norm.split()
    for tok in tokens:
        if len(tok) >= 2 and tok not in aliases and not SUFFIX_RE.match(tok):
            aliases.append(tok)

    # 5. External aliases provided from metadata or data sources
    if external_aliases:
        for ext in external_aliases:
            ext_norm = normalize_lookup_text(ext)
            if ext_norm and ext_norm not in aliases:
                aliases.append(ext_norm)

    return aliases


def get_portrait_fallback(
    display_name: str, kind: str, fallback_override: str | None = None
) -> str:
    """Generate 2-3 character initials or abbreviation for entity portrait fallback."""
    if fallback_override:
        return fallback_override
    if kind == "player":
        words = [
            w
            for w in re.sub(r"[^a-zA-Z]", " ", display_name).split()
            if w and not SUFFIX_RE.match(w.lower())
        ]
        if len(words) >= 2:
            return f"{words[0][0].upper()}{words[-1][0].upper()}"
        elif words:
            return words[0][:2].upper()
        return "PL"
    elif kind == "team":
        return display_name[:3].upper()
    return "NAV"


def build_destination_url(
    base_destination: str,
    release_id: str | None = None,
    season: str | None = None,
    phase: str | None = None,
    before_date: str | None = None,
) -> str:
    """Build canonical destination URL preserving release and observed scope."""
    params: list[str] = []
    if season:
        params.append(f"season={quote(season)}")
    if release_id:
        params.append(f"release_id={quote(release_id)}")
    if phase:
        params.append(f"phase={quote(phase)}")
    if before_date:
        params.append(f"before_date={quote(before_date)}")
    if params:
        delimiter = "&" if "?" in base_destination else "?"
        return f"{base_destination}{delimiter}{'&'.join(params)}"
    return base_destination


@dataclass(frozen=True)
class IndexedEntity:
    """Pre-indexed searchable entity representing a player, team, or navigation page."""

    id: str
    kind: Literal["player", "team", "page"]
    canonical_id: str
    display_name: str
    display_name_norm: str
    aliases_norm: tuple[str, ...]
    tokens: tuple[str, ...]
    subtitle: str | None
    portrait_url: str | None
    portrait_fallback: str | None
    base_destination: str
    seasons: tuple[str, ...] = ()
    latest_team_id: str | None = None
    latest_tricode: str | None = None
    conference: str | None = None
    division: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    # Basketball-Reference nicknames, normalized form to the page's spelling. Only these are
    # shown as "aka"; generated aliases (accents, tokens, suffixes) match silently.
    nicknames: dict[str, str] = field(default_factory=dict)
    # Observed games in the indexed dataset: the tie-break for equally good matches.
    games: int = 0


MatchBasis = Literal["exact", "prefix", "token_prefix", "substring", "typo", "suggestion"]


def score_entity_match(
    entity: IndexedEntity,
    norm_query: str,
    query_tokens: list[str],
    *,
    max_typo_distance: int | None = None,
) -> tuple[MatchBasis, float, str | None] | None:
    """Evaluate deterministic match basis and score for an entity against a normalized query.

    Ranking precedence:
    1. Exact canonical name or verified alias (score: 1.0)
    2. Exact token match (e.g. surname "jokic", "curry") (score: 0.92)
    3. Prefix of full name or alias (score: 0.85)
    4. Token prefix (any token in name/alias starts with query) (score: 0.70)
    5. Substring match (query is substring of name/alias) (score: 0.50)
    6. Bounded typo similarity (score: 0.35 * similarity) - only when query length >= 4
    """
    if not norm_query:
        return None

    # Resolve retained canonical URL selections without statistical queries.
    if norm_query in {entity.id.lower(), entity.canonical_id.lower()}:
        return ("exact", 1.0, None)

    q_len = len(norm_query)

    # 1. Exact match on canonical display name or full alias
    if norm_query == entity.display_name_norm:
        return ("exact", 1.0, entity.display_name)
    for alias in entity.aliases_norm:
        if norm_query == alias:
            return ("exact", 1.0, alias)

    # 2. Exact token match (e.g. "jokic", "doncic", "curry", "raptors")
    for tok in entity.tokens:
        if norm_query == tok:
            return ("exact", 0.92, tok)

    # 3. Full prefix match on display name or alias
    if entity.display_name_norm.startswith(norm_query):
        return ("prefix", 0.85, entity.display_name)
    for alias in entity.aliases_norm:
        if alias.startswith(norm_query):
            return ("prefix", 0.85, alias)

    # 4. Token prefix match
    for tok in entity.tokens:
        if tok.startswith(norm_query):
            return ("token_prefix", 0.70, tok)
    for alias in entity.aliases_norm:
        for a_tok in alias.split():
            if a_tok.startswith(norm_query):
                return ("token_prefix", 0.70, alias)

    # 5. Substring match (only allowed for query length >= 2)
    if q_len >= 2:
        if norm_query in entity.display_name_norm:
            return ("substring", 0.50, entity.display_name)
        for alias in entity.aliases_norm:
            if norm_query in alias:
                return ("substring", 0.50, alias)

    # 6. Typo similarity (only allowed for query length >= 4)
    if q_len >= 4:
        max_dist = max_typo_distance if max_typo_distance is not None else (1 if q_len <= 5 else 2)
        best_dist = max_dist + 1
        best_term: str | None = None

        candidate_terms = list(entity.tokens) + list(entity.aliases_norm)
        for term in candidate_terms:
            if abs(len(term) - q_len) <= max_dist:
                dist = damerau_levenshtein_distance(norm_query, term, max_dist=max_dist)
                if dist < best_dist:
                    best_dist = dist
                    best_term = term

        if best_dist <= max_dist and best_term is not None:
            max_len = max(q_len, len(best_term))
            sim = 1.0 - (best_dist / max_len)
            return ("typo", round(0.35 * sim, 4), best_term)

    return None


STATIC_NAVIGATION_PAGES: list[dict[str, Any]] = [
    {
        "id": "page_stats",
        "canonical_id": "stats",
        "display_name": "Stats Explorer",
        "subtitle": "Navigation · Dense stats, presets, and rankings",
        "base_destination": "/stats",
        "portrait_fallback": "STA",
        "aliases": ["stats", "explorer", "player stats", "table", "box scores", "rankings"],
    },
    {
        "id": "page_live",
        "canonical_id": "live",
        "display_name": "Live Scores & Games",
        "subtitle": "Navigation · In-progress scoreboard and game logs",
        "base_destination": "/live",
        "portrait_fallback": "LIV",
        "aliases": ["live", "scores", "games", "today", "scoreboard"],
    },
    {
        "id": "page_last_games",
        "canonical_id": "last-games",
        "display_name": "Recent Games",
        "subtitle": "Navigation · Last appearances and recent form",
        "base_destination": "/last-games",
        "portrait_fallback": "REC",
        "aliases": ["recent games", "last games", "game logs", "recent form", "last 10"],
    },
    {
        "id": "page_showcase",
        "canonical_id": "showcase",
        "display_name": "Player Showcase",
        "subtitle": "Navigation · Player cards and highlights slideshow",
        "base_destination": "/showcase",
        "portrait_fallback": "SHO",
        "aliases": ["showcase", "player cards", "slideshow", "cards"],
    },
    {
        "id": "page_wowy",
        "canonical_id": "wowy",
        "display_name": "WOWY / Lineups",
        "subtitle": "Navigation · With or without you lineup impact",
        "base_destination": "/wowy",
        "portrait_fallback": "WOW",
        "aliases": ["wowy", "on off", "lineups", "with or without you", "stints"],
    },
    {
        "id": "page_teams",
        "canonical_id": "teams",
        "display_name": "Teams Explorer",
        "subtitle": "Navigation · Standings, four factors, and team stats",
        "base_destination": "/teams",
        "portrait_fallback": "TEA",
        "aliases": ["teams", "team stats", "standings", "team factors", "four factors"],
    },
    {
        "id": "page_compare",
        "canonical_id": "compare",
        "display_name": "Player Compare",
        "subtitle": "Navigation · Head-to-head player comparison",
        "base_destination": "/compare",
        "portrait_fallback": "CMP",
        "aliases": ["compare", "player compare", "pvp", "head to head", "matchup"],
    },
    {
        "id": "page_team_compare",
        "canonical_id": "team-compare",
        "display_name": "Team Compare",
        "subtitle": "Navigation · Two-team production and factor comparison",
        "base_destination": "/team-compare",
        "portrait_fallback": "TCMP",
        "aliases": ["team compare", "teams compare", "two team comparison"],
    },
    {
        "id": "page_rankings",
        "canonical_id": "rankings",
        "display_name": "Ranking Boards",
        "subtitle": "Navigation · Personal rankings and tier lists",
        "base_destination": "/rankings",
        "portrait_fallback": "RNK",
        "aliases": ["rankings", "tier list", "tierlist", "boards", "personal boards"],
    },
    {
        "id": "page_contracts",
        "canonical_id": "contracts",
        "display_name": "Contracts & Payroll",
        "subtitle": "Navigation · Team salary timelines and contract details",
        "base_destination": "/contracts",
        "portrait_fallback": "CON",
        "aliases": ["contracts", "salaries", "payroll", "finance", "cap", "salary timeline"],
    },
    {
        "id": "page_playoffs",
        "canonical_id": "playoffs",
        "display_name": "Playoffs & Series",
        "subtitle": "Navigation · Playoff bracket, series stats, and outcomes",
        "base_destination": "/playoffs",
        "portrait_fallback": "PLY",
        "aliases": ["playoffs", "bracket", "series", "postseason"],
    },
    {
        "id": "page_similarity",
        "canonical_id": "similar-players",
        "display_name": "Similar Players",
        "subtitle": "Navigation · Statistical similarity and player twins",
        "base_destination": "/similar-players",
        "portrait_fallback": "SIM",
        "aliases": ["similarity", "peers", "statistical peers", "similar players", "twins"],
    },
    {
        "id": "page_shot_twins",
        "canonical_id": "similar-players/shot-profile",
        "display_name": "Shot Profile Twins",
        "subtitle": "Navigation · Similar Players · Shot location similarity",
        "base_destination": "/similar-players/shot-profile",
        "portrait_fallback": "SHT",
        "aliases": ["shot twins", "shot profile twin", "shooting peers", "shot similarity"],
    },
    {
        "id": "page_rapm",
        "canonical_id": "research/rapm",
        "display_name": "RAPM Research",
        "subtitle": "Navigation · Served impact ratings and the six-factor experiment",
        "base_destination": "/research/rapm",
        "portrait_fallback": "RAP",
        "aliases": ["rapm", "impact", "plus minus", "adjusted plus minus", "six factor"],
    },
    {
        "id": "page_shooting",
        "canonical_id": "research/shooting",
        "display_name": "Shooting",
        "subtitle": "Navigation · Expected shots, adjusted shooting and shot aftermath",
        "base_destination": "/research/shooting",
        "portrait_fallback": "SHG",
        "aliases": [
            "shooting",
            "expected shots",
            "shot quality",
            "adjusted shooting",
            "shot aftermath",
        ],
    },
    {
        "id": "page_roster_shapes",
        "canonical_id": "roster-shapes",
        "display_name": "Roster Shapes",
        "subtitle": "Navigation · Minutes, impact, and salary allocation diagrams",
        "base_destination": "/roster-shapes",
        "portrait_fallback": "ROS",
        "aliases": ["roster shapes", "allocation", "depth chart", "roster"],
    },
    {
        "id": "page_stat_line_shift",
        "canonical_id": "stat-line-shift",
        "display_name": "Teammate Stat Shift",
        "subtitle": "Navigation · Production shifts with and without teammates",
        "base_destination": "/stat-line-shift",
        "portrait_fallback": "SHF",
        "aliases": ["stat line shift", "teammate shift", "with without", "stat shift"],
    },
    {
        "id": "page_matchups",
        "canonical_id": "matchups",
        "display_name": "Defensive Matchups",
        "subtitle": "Navigation · Head-to-head matchup matrix and assignments",
        "base_destination": "/matchups",
        "portrait_fallback": "MAT",
        "aliases": ["matchups", "defensive matchups", "assignments", "head to head"],
    },
    {
        "id": "page_ask",
        "canonical_id": "research/ask",
        "display_name": "Ask CourtLens",
        "subtitle": "Navigation · Natural language conversational analysis",
        "base_destination": "/research/ask",
        "portrait_fallback": "ASK",
        "aliases": ["ask", "chatbot", "ai", "search", "conversational", "assistant"],
    },
    {
        "id": "page_investigations",
        "canonical_id": "investigations",
        "display_name": "Investigations & Saved Queries",
        "subtitle": "Navigation · Reproducible evidence and saved analytical manifests",
        "base_destination": "/investigations",
        "portrait_fallback": "INV",
        "aliases": ["investigations", "saved queries", "evidence", "saved results", "reproduce"],
    },
    {
        "id": "page_data_status",
        "canonical_id": "data-status",
        "display_name": "Data Status & Pipeline",
        "subtitle": "Navigation · Source ingestion, dataset health, and publication pointer",
        "base_destination": "/data-status",
        "portrait_fallback": "DAT",
        "aliases": ["data status", "pipeline", "datasets", "sources", "freshness"],
    },
    {
        "id": "page_forecasts",
        "canonical_id": "forecasts",
        "display_name": "Points Forecasts",
        "subtitle": "Navigation · Prospective forecasts and model issuance",
        "base_destination": "/forecasts",
        "portrait_fallback": "FOR",
        "aliases": ["forecasts", "points forecast", "predictions", "model issuance"],
    },
    {
        "id": "page_evaluation",
        "canonical_id": "evaluation",
        "display_name": "Model Evaluation",
        "subtitle": "Navigation · Out-of-time model benchmark cards and splits",
        "base_destination": "/evaluation",
        "portrait_fallback": "EVL",
        "aliases": ["evaluation", "model evaluation", "experiments", "benchmarks"],
    },
    {
        "id": "page_learning",
        "canonical_id": "learning",
        "display_name": "Learning & Guides",
        "subtitle": "Navigation · Methodology · Tutorials and worked queries",
        "base_destination": "/methodology/learning",
        "portrait_fallback": "LRN",
        "aliases": ["learning", "tutorials", "guide", "worked queries"],
    },
    {
        "id": "page_methodology",
        "canonical_id": "methodology",
        "display_name": "Methodology & Glossary",
        "subtitle": "Navigation · Metric definitions, formulas, and worked lessons",
        "base_destination": "/methodology",
        "portrait_fallback": "MET",
        "aliases": ["methodology", "definitions", "glossary", "formulas"],
    },
    {
        "id": "page_whats_new",
        "canonical_id": "whats-new",
        "display_name": "What's New",
        "subtitle": "Navigation · Patch notes and engineering blog",
        "base_destination": "/whats-new",
        "portrait_fallback": "NEW",
        "aliases": ["whats new", "patch notes", "changelog", "updates", "blog"],
    },
    {
        "id": "page_settings",
        "canonical_id": "settings",
        "display_name": "Settings & Preferences",
        "subtitle": "Navigation · Local workspace configuration and AI status",
        "base_destination": "/settings",
        "portrait_fallback": "SET",
        "aliases": ["settings", "configuration", "preferences"],
    },
]

NBA_TEAM_EXTRA_ALIASES: dict[str, list[str]] = {
    "1610612737": ["hawks", "atl"],
    "1610612738": ["celtics", "boston", "bos"],
    "1610612739": ["cavaliers", "cavs", "cleveland", "cle"],
    "1610612740": ["pelicans", "pels", "new orleans", "nop"],
    "1610612741": ["bulls", "chicago", "chi"],
    "1610612742": ["mavericks", "mavs", "dallas", "dal"],
    "1610612743": ["nuggets", "denver", "den"],
    "1610612744": ["warriors", "dubs", "golden state", "gsw", "bay area"],
    "1610612745": ["rockets", "houston", "hou"],
    "1610612746": ["clippers", "la clippers", "lac"],
    "1610612747": ["lakers", "la lakers", "lal"],
    "1610612748": ["heat", "miami", "mia"],
    "1610612749": ["bucks", "milwaukee", "mil"],
    "1610612750": ["timberwolves", "wolves", "t-wolves", "minnesota", "min"],
    "1610612751": ["nets", "brooklyn", "bkn"],
    "1610612752": ["knicks", "new york", "nyk"],
    "1610612753": ["magic", "orlando", "orl"],
    "1610612754": ["pacers", "indiana", "ind"],
    "1610612755": ["76ers", "sixers", "philadelphia", "philly", "phi"],
    "1610612756": ["suns", "phoenix", "phx"],
    "1610612757": ["trail blazers", "blazers", "portland", "por"],
    "1610612758": ["kings", "sacramento", "sac"],
    "1610612759": ["spurs", "san antonio", "sas"],
    "1610612760": ["thunder", "okc", "oklahoma city"],
    "1610612761": ["raptors", "toronto", "tor"],
    "1610612762": ["jazz", "utah", "uta"],
    "1610612763": ["grizzlies", "grizz", "memphis", "mem"],
    "1610612764": ["wizards", "washington", "was"],
    "1610612765": ["pistons", "detroit", "det"],
    "1610612766": ["hornets", "charlotte", "cha"],
}
