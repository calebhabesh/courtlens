"""Strict adapters for season-level NBA Stats feeds (hoopR raw mirror, pbpstats).

Every admitted file declares its own scope. The URL, the requested season and the
payload's declared parameters must agree, or the candidate is rejected. Values are
kept as the source reported them: null stays null, and an empty result set is an
observed empty feed, never a zero.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qs, urlsplit

from courtlens.domain.teams import NBA_TEAMS

PARSER_VERSION = "courtlens-stats-feeds-v1"
HOOPR_SOURCE = "hoopr_nba_stats_raw"
PBPSTATS_SOURCE = "pbpstats"
SOURCES = (HOOPR_SOURCE, PBPSTATS_SOURCE)
HOOPR_BASE = "https://raw.githubusercontent.com/sportsdataverse/hoopR-nba-stats-raw"
PBPSTATS_BASE = "https://api.pbpstats.com/get-totals/nba"
PHASES = {"regular-season": "Regular Season", "playoffs": "Playoffs"}
# pbpstats expects the literal value "Regular+Season" (sent as %2B), as tested.
PBP_PHASES = {"Regular+Season": "regular-season", "Playoffs": "playoffs"}
# stats.nba.com returns at most 2,000 lineup rows; pbpstats returns at most 500 rows.
# A result at the cap is a truncated observation, not the whole population.
ROW_CAPS = {"lineups": 2000, "pbpstats_player": 500, "pbpstats_lineup": 500}

PLAY_TYPES = {
    "cut": "Cut",
    "handoff": "Handoff",
    "isolation": "Isolation",
    "misc": "Misc",
    "offrebound": "OffRebound",
    "offscreen": "OffScreen",
    "postup": "Postup",
    "prballhandler": "PRBallHandler",
    "prrollman": "PRRollman",
    "spotup": "Spotup",
    "transition": "Transition",
}
TRACKING = {
    "catchshoot": "CatchShoot",
    "defense": "Defense",
    "drives": "Drives",
    "efficiency": "Efficiency",
    "elbowtouch": "ElbowTouch",
    "painttouch": "PaintTouch",
    "passing": "Passing",
    "possessions": "Possessions",
    "posttouch": "PostTouch",
    "pullupshot": "PullUpShot",
    "rebounding": "Rebounding",
    "speeddistance": "SpeedDistance",
}
DEFENSE = {
    "overall": "Overall",
    "3-pointers": "3 Pointers",
    "2-pointers": "2 Pointers",
    "less-than-6ft": "Less Than 6Ft",
    "less-than-10ft": "Less Than 10Ft",
    "greater-than-15ft": "Greater Than 15Ft",
}
LINEUP_MEASURES = {"base": "Base", "advanced": "Advanced", "four-factors": "Four Factors"}


@dataclass(frozen=True)
class FeedSpec:
    endpoint: str
    feed: str
    capability: str
    result_set: str
    variants: dict[str, str] | None  # file variant -> declared parameter value
    variant_param: str | None
    draft_scope: bool = False
    # Player biography listings: the season's roster per team, or the all-time player index.
    bio_scope: bool = False


SPECS = {
    "synergyplaytypes": FeedSpec(
        "synergyplaytypes", "play_types", "play_types", "SynergyPlayType", PLAY_TYPES, "PlayType"
    ),
    "leaguedashptstats": FeedSpec(
        "leaguedashptstats", "tracking", "tracking", "LeagueDashPtStats", TRACKING, "PtMeasureType"
    ),
    "leaguedashptdefend": FeedSpec(
        "leaguedashptdefend",
        "defensive_tracking",
        "defensive_tracking",
        "LeagueDashPTDefend",
        DEFENSE,
        "DefenseCategory",
    ),
    "leaguehustlestatsplayer": FeedSpec(
        "leaguehustlestatsplayer", "hustle", "hustle", "HustleStatsPlayer", None, None
    ),
    "leagueseasonmatchups": FeedSpec(
        "leagueseasonmatchups", "matchups", "matchups", "SeasonMatchups", None, None
    ),
    "leaguedashlineups": FeedSpec(
        "leaguedashlineups", "lineups", "lineups", "Lineups", LINEUP_MEASURES, "MeasureType"
    ),
    "draftcombineplayeranthro": FeedSpec(
        "draftcombineplayeranthro", "combine_anthro", "combine", "Results", None, None, True
    ),
    "draftcombinestats": FeedSpec(
        "draftcombinestats", "combine_stats", "combine", "DraftCombineStats", None, None, True
    ),
    "drafthistory": FeedSpec(
        "drafthistory", "draft_history", "draft_metadata", "DraftHistory", None, None, True
    ),
    "playerindex": FeedSpec(
        "playerindex", "player_index", "player_bio", "PlayerIndex", None, None, bio_scope=True
    ),
    "commonteamroster": FeedSpec(
        "commonteamroster",
        "team_roster",
        "player_bio",
        "CommonTeamRoster",
        None,
        None,
        bio_scope=True,
    ),
}
PBP_FEEDS = {
    "Player": ("pbpstats_player", "on_off"),
    "Team": ("pbpstats_team", "on_off"),
    "Lineup": ("pbpstats_lineup", "lineups"),
}
CAPABILITIES = tuple(
    sorted({s.capability for s in SPECS.values()} | {c for _, c in PBP_FEEDS.values()})
)


@dataclass(frozen=True)
class FeedScope:
    source: str
    feed: str
    capability: str
    season: str  # Canonical "2025-26"; draft feeds use the draft year, e.g. "2025".
    season_type: str  # regular_season | playoffs | draft | bio
    variant: str  # "" when the endpoint has a single variant
    revision: str | None  # Pinned upstream commit for mirror files


@dataclass
class ParsedFeed:
    scope: FeedScope
    rows: list[tuple[str, dict[str, Any]]]
    coverage: dict[str, Any] = field(default_factory=dict)


def valid_season(season: str) -> str:
    if (
        not re.fullmatch(r"(19|20)\d{2}-\d{2}", season)
        or int(season[-2:]) != (int(season[:4]) + 1) % 100
    ):
        raise ValueError("invalid canonical season")
    return season


def valid_scope_season(season: str) -> str:
    """Season feeds use "2025-26"; draft and combine feeds use the event year "2025"."""
    if re.fullmatch(r"(19|20)\d{2}", season):
        return season
    return valid_season(season)


def hoopr_url(revision: str, endpoint: str, label: int, file: str | None) -> str:
    tail = f"{label}.json" if file is None else f"{label}/{file}.json"
    return f"{HOOPR_BASE}/{revision}/nba_stats/json/{endpoint}/{tail}"


def hoopr_bio_url(revision: str, endpoint: str, season: str, team_id: str | None = None) -> str:
    """hoopR labels the player index by season END year and team rosters by START year."""
    start = int(valid_season(season)[:4])
    if endpoint == "playerindex":
        return f"{HOOPR_BASE}/{revision}/nba_stats/json/playerindex/{start + 1}.json"
    return f"{HOOPR_BASE}/{revision}/nba_stats/json/commonteamroster/{start}/{team_id}.json"


def _bio_scope(url: str, season: str) -> FeedScope | None:
    match = re.fullmatch(
        re.escape(HOOPR_BASE) + r"/([0-9a-f]{40})/nba_stats/json/"
        r"(playerindex|commonteamroster)/(\d{4})(?:/(\d+))?\.json",
        url,
    )
    if match is None:
        return None
    revision, endpoint, label, team = match.groups()
    valid_season(season)
    start = int(season[:4])
    spec = SPECS[endpoint]
    if endpoint == "playerindex":
        if team is not None or int(label) != start + 1:
            raise ValueError("player index URL and requested season disagree")
        return FeedScope(HOOPR_SOURCE, spec.feed, spec.capability, season, "bio", "", revision)
    if team not in NBA_TEAMS or int(label) != start:
        raise ValueError("team roster URL and requested season disagree")
    return FeedScope(HOOPR_SOURCE, spec.feed, spec.capability, season, "bio", team, revision)


def scope_for_url(source: str, url: str, season: str) -> FeedScope:
    """Exact allowlist. The scope is derived from the URL; the season must agree."""
    valid_scope_season(season)
    if source == HOOPR_SOURCE:
        bio = _bio_scope(url, season)
        if bio is not None:
            return bio
        match = re.fullmatch(
            re.escape(HOOPR_BASE) + r"/([0-9a-f]{40})/nba_stats/json/([a-z]+)/"
            r"(\d{4})(?:/([a-z-]+?)(?:_([a-z0-9-]+?))?(?:_(offensive|defensive))?_totals)?\.json",
            url,
        )
        if match is None:
            raise ValueError("source URL is not admitted for stats feeds")
        revision, endpoint, label, phase, variant, side = match.groups()
        spec = SPECS.get(endpoint)
        if spec is None or spec.bio_scope:
            raise ValueError("endpoint is not admitted for stats feeds")
        label_year = int(label)
        if spec.draft_scope:
            # hoopR labels by season END year; the 2026 file holds the 2025 draft/combine.
            if phase is not None or season != str(label_year - 1):
                raise ValueError("draft feed URL and requested draft year disagree")
            return FeedScope(source, spec.feed, spec.capability, season, "draft", "", revision)
        valid_season(season)
        if phase not in PHASES or int(season[:4]) + 1 != label_year:
            raise ValueError("season feed URL and requested season disagree")
        if spec.endpoint == "synergyplaytypes":
            if variant not in PLAY_TYPES or side is None:
                raise ValueError("unknown play type file")
            variant = f"{variant}_{side}"
        elif side is not None:
            raise ValueError("unexpected offensive/defensive suffix")
        elif spec.variants is None:
            if variant is not None:
                raise ValueError("unexpected variant for single-variant endpoint")
            variant = ""
        elif variant not in spec.variants:
            raise ValueError("unknown endpoint variant")
        return FeedScope(
            source,
            spec.feed,
            spec.capability,
            season,
            phase.replace("-", "_"),
            variant,
            revision,
        )
    if source == PBPSTATS_SOURCE:
        parts = urlsplit(url)
        if f"{parts.scheme}://{parts.netloc}{parts.path}" != PBPSTATS_BASE:
            raise ValueError("source URL is not admitted for stats feeds")
        query = parse_qs(parts.query, keep_blank_values=True, strict_parsing=True)
        if any(len(v) != 1 for v in query.values()):
            raise ValueError("repeated pbpstats parameter")
        flat = {k: v[0] for k, v in query.items()}
        kind = flat.get("Type", "")
        expected = {"Season", "SeasonType", "Type"} | ({"TeamId"} if kind == "Lineup" else set())
        if set(flat) != expected or kind not in PBP_FEEDS:
            raise ValueError("pbpstats parameters are not admitted")
        if flat["Season"] != valid_season(season) or flat["SeasonType"] not in PBP_PHASES:
            raise ValueError("pbpstats season disagrees")
        variant = ""
        if kind == "Lineup":
            if flat["TeamId"] not in NBA_TEAMS:
                raise ValueError("unknown NBA team")
            variant = flat["TeamId"]
        feed, capability = PBP_FEEDS[kind]
        return FeedScope(
            source,
            feed,
            capability,
            season,
            PBP_PHASES[flat["SeasonType"]].replace("-", "_"),
            variant,
            None,
        )
    raise ValueError("unknown stats feed source")


def pbpstats_url(season: str, season_type: str, kind: str, team_id: str | None = None) -> str:
    phase = {"regular_season": "Regular%2BSeason", "playoffs": "Playoffs"}[season_type]
    url = f"{PBPSTATS_BASE}?Season={season}&SeasonType={phase}&Type={kind}"
    return url + (f"&TeamId={team_id}" if team_id else "")


def snake(header: str) -> str:
    """NBA Stats headers are upper snake; pbpstats headers are camel case with spaces."""
    text = re.sub(r"[^0-9A-Za-z]+", "_", header.strip())
    text = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", text)
    return text.strip("_").lower()


def nba_id(raw: Any) -> str | None:
    """NBA person/team identities are positive integers; anything else stays unknown."""
    if raw is None or isinstance(raw, bool):
        return None
    if isinstance(raw, float) and raw.is_integer():
        raw = int(raw)
    text = str(raw).strip()
    return text if re.fullmatch(r"[1-9]\d*", text) else None


def _declared(params: dict[str, Any], *names: str) -> Any:
    for name in names:
        if params.get(name) is not None:
            return params[name]
    return None


def _check_declared(scope: FeedScope, spec: FeedSpec, params: dict[str, Any]) -> bool:
    """The payload's own parameters must match the scope its URL claims.

    Returns True when the declared season is only a start year (as in the 2025-26
    regular-season matchup file, "2025"); the caller must then prove the season from
    every row's NBA SEASON_ID instead.
    """
    if spec.bio_scope:
        # The index declares "2026-27" (older files the start year); rosters the start year.
        declared = str(params.get("Season") or "")
        allowed = {scope.season[:4]} | ({scope.season} if spec.endpoint == "playerindex" else set())
        if declared not in allowed:
            raise ValueError("payload declares a different season")
        if spec.endpoint == "commonteamroster" and str(params.get("TeamID")) != scope.variant:
            raise ValueError("payload declares a different team")
        return False
    if spec.draft_scope:
        declared = str(_declared(params, "SeasonYear", "Season") or "")
        if declared[:4] != scope.season:
            raise ValueError("payload declares a different draft year")
        return False
    season = _declared(params, "Season", "SeasonYear")
    rows_must_prove = season == scope.season[:4] and spec.endpoint == "leagueseasonmatchups"
    if season != scope.season and not rows_must_prove:
        raise ValueError("payload declares a different season")
    if params.get("SeasonType") != PHASES[scope.season_type.replace("_", "-")]:
        raise ValueError("payload declares a different season type")
    if params.get("PerMode") != "Totals":
        raise ValueError("only Totals payloads are admitted")
    if spec.endpoint == "synergyplaytypes":
        play, side = scope.variant.rsplit("_", 1)
        if (
            params.get("PlayType") != PLAY_TYPES[play]
            or str(params.get("TypeGrouping", "")).lower() != side
            or params.get("PlayerOrTeam") != "P"
        ):
            raise ValueError("payload declares a different play type")
    elif spec.variants is not None and spec.variant_param is not None:
        if params.get(spec.variant_param) != spec.variants[scope.variant]:
            raise ValueError("payload declares a different measure type")
    return rows_must_prove


def _entity_key(feed: str, row: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Stable key and canonical NBA identities. Names never establish identity."""
    if feed == "matchups":
        off, defender = nba_id(row.get("off_player_id")), nba_id(row.get("def_player_id"))
        if off is None or defender is None:
            raise ValueError("matchup row without both NBA person ids")
        return f"{off}:{defender}", {"off_player_id": off, "def_player_id": defender}
    if feed == "lineups":
        group, team = str(row.get("group_id") or ""), nba_id(row.get("team_id"))
        players = [p for p in group.strip("-").split("-") if p]
        if team is None or len(players) != 5 or any(nba_id(p) is None for p in players):
            raise ValueError("lineup row without five NBA person ids and a team")
        return f"{team}:{group}", {"team_id": team, "player_ids": sorted(players)}
    if feed == "pbpstats_lineup":
        group = str(row.get("entity_id") or "")
        players = group.split("-")
        if len(players) != 5 or any(nba_id(p) is None for p in players):
            raise ValueError("pbpstats lineup without five NBA person ids")
        team = nba_id(row.get("team_id"))
        return f"{team}:{group}", {"team_id": team, "player_ids": sorted(players)}
    if feed == "pbpstats_team":
        team = nba_id(row.get("entity_id"))
        if team is None:
            raise ValueError("pbpstats team row without an NBA team id")
        return team, {"team_id": team}
    if feed == "pbpstats_player":
        player = nba_id(row.get("entity_id"))
        if player is None:
            raise ValueError("pbpstats player row without an NBA person id")
        return player, {"player_id": player, "team_id": nba_id(row.get("team_id"))}
    if feed == "player_index":
        player = nba_id(row.get("person_id"))
        if player is None:
            raise ValueError("player index row without an NBA person id")
        return player, {"player_id": player}
    if feed == "team_roster":
        player, team = nba_id(row.get("player_id")), nba_id(row.get("team_id"))
        if player is None or team is None:
            raise ValueError("roster row without an NBA person and team id")
        return player, {"player_id": player, "team_id": team}
    if feed == "draft_history":
        player = nba_id(row.get("person_id"))
        pick = row.get("overall_pick")
        key = player if player is not None else f"pick:{pick}"
        return key, {"player_id": player}
    if feed in ("combine_anthro", "combine_stats"):
        player = nba_id(row.get("player_id"))
        temp = row.get("temp_player_id")
        temp_id = nba_id(temp)
        if player is not None:
            return player, {"player_id": player}
        if temp_id is not None:
            return f"temp:{temp_id}", {"player_id": None}
        # NBA Stats lists some early participants with PLAYER_ID -1. The row stays, with an
        # unknown identity; _finish keys it by row position, never by name.
        return "", {"player_id": None}
    raw_player = row.get("close_def_person_id", row.get("player_id"))
    raw_team = row.get("player_last_team_id", row.get("team_id"))
    player, team = nba_id(raw_player), nba_id(raw_team)
    if player is None:
        raise ValueError("player row without an NBA person id")
    return f"{player}:{team}", {"player_id": player, "team_id": team}


def _result_set(data: dict[str, Any], name: str) -> dict[str, Any]:
    sets = data.get("resultSets", data.get("resultSet"))
    if isinstance(sets, dict):
        sets = [sets]
    if not isinstance(sets, list):
        raise ValueError("payload has no result sets")
    matches = [s for s in sets if isinstance(s, dict) and s.get("name") == name]
    if len(matches) != 1:
        raise ValueError(f"payload must contain exactly one {name} result set")
    return matches[0]


def _finish(
    scope: FeedScope, records: list[dict[str, Any]], declared: dict[str, Any]
) -> ParsedFeed:
    rows: list[tuple[str, dict[str, Any]]] = []
    seen: set[str] = set()
    unidentified = 0
    for index, record in enumerate(records):
        key, identity = _entity_key(scope.feed, record)
        if not key:
            key = f"unidentified:row:{index}"
            unidentified += 1
        if key in seen:
            raise ValueError(f"duplicate {scope.feed} entity {key}")
        seen.add(key)
        rows.append((f"row:{index}", {"entity_key": key, **identity, "values": record}))
    cap = ROW_CAPS.get(scope.feed)
    truncated = cap is not None and len(rows) >= cap
    limitations = []
    if not rows:
        limitations.append("The source returned zero rows; absence is not a zero outcome.")
    if unidentified:
        limitations.append(
            f"{unidentified} row(s) carry no NBA person id; their identity stays unknown."
        )
    if truncated:
        limitations.append(f"The source returned its {cap}-row cap; rows beyond it are unobserved.")
    if scope.season_type == "bio":
        limitations.append(
            "Listings as mirrored from NBA Stats when fetched; listed sizes are team-reported."
        )
    elif scope.source == HOOPR_SOURCE:
        limitations.append("Season totals as mirrored from NBA Stats; no game-level dates.")
    players = {p for _, r in rows for p in [r.get("player_id")] if p}
    # Keys appear only when they apply, so output for inputs the first release
    # accepted is unchanged and previously admitted datasets still verify.
    extra = {"unidentified_rows": unidentified} if unidentified else {}
    return ParsedFeed(
        scope,
        rows,
        {
            "rows": len(rows),
            "empty": not rows,
            "truncated": truncated,
            "row_cap": cap,
            "distinct_players": len(players),
            "declared_parameters": declared,
            "identity_namespace": "nba",
            "limitations": limitations,
            **extra,
        },
    )


def parse_feed(body: bytes, scope: FeedScope) -> ParsedFeed:
    data = json.loads(body)
    if not isinstance(data, dict):
        raise ValueError("payload is not a JSON object")
    if scope.source == PBPSTATS_SOURCE:
        records = data.get("multi_row_table_data")
        if not isinstance(records, list):
            raise ValueError("pbpstats payload has no row table")
        normalized = []
        for raw in records:
            if not isinstance(raw, dict):
                raise ValueError("pbpstats row is not an object")
            normalized.append({snake(k): v for k, v in raw.items()})
        return _finish(scope, normalized, {})
    spec = next(s for s in SPECS.values() if s.feed == scope.feed)
    params = data.get("parameters")
    if not isinstance(params, dict):
        raise ValueError("payload has no declared parameters")
    rows_must_prove = _check_declared(scope, spec, params)
    result = _result_set(data, spec.result_set)
    headers = [snake(h) for h in result.get("headers", [])]
    if not headers or len(set(headers)) != len(headers):
        raise ValueError("result set headers are missing or duplicated")
    records = []
    for raw in result.get("rowSet", []):
        if not isinstance(raw, list) or len(raw) != len(headers):
            raise ValueError("result row width differs from headers")
        records.append(dict(zip(headers, raw, strict=True)))
    if rows_must_prove:
        # NBA SEASON_ID: 2YYYY regular season, 4YYYY playoffs, YYYY the start year.
        prefix = "2" if scope.season_type == "regular_season" else "4"
        expected = prefix + scope.season[:4]
        if not records or any(str(r.get("season_id")) != expected for r in records):
            raise ValueError("payload declares a different season")
    declared = {
        k: params[k]
        for k in (
            "Season",
            "SeasonYear",
            "SeasonType",
            "PerMode",
            "PlayType",
            "TypeGrouping",
            "PtMeasureType",
            "MeasureType",
            "DefenseCategory",
        )
        if params.get(k) is not None
    }
    if rows_must_prove:
        declared["season_established_by"] = "row SEASON_ID"
    if spec.bio_scope and params.get("TeamID"):
        declared["TeamID"] = params["TeamID"]
    return _finish(scope, records, declared)
