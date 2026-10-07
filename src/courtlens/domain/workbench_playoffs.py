"""Playoff bracket identity, series parsing, seed evidence, and aggregation domain models.

Implements Block B17:
- Sub-block B17a: Canonical playoff game ID decomposition (004{YY}{round}{matchup}{game_num}),
  series slug generation and alias matching, explicit reconstructed regular-season seed evidence
  with tiebreaker notes.
- Sub-block B17b: Phase-safe box-score aggregations (team Four Factors, ratings, margins,
  and player series statistics over strictly played games) and placeholder treatment for unplayed
  or scheduled games.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from courtlens.domain.team_analytics import (
    compute_defensive_rating,
    compute_efg_pct,
    compute_estimated_possessions,
    compute_ftr,
    compute_net_rating,
    compute_offensive_rating,
    compute_oreb_pct,
    compute_team_pace,
    compute_tov_pct,
)
from courtlens.domain.teams import get_team_info, resolve_team_tricode

PLAYOFF_GAME_ID_PREFIX = "004"

ROUND_NAMES: dict[int, str] = {
    1: "First Round",
    2: "Conference Semifinals",
    3: "Conference Finals",
    4: "NBA Finals",
}

PLAYOFF_CAPABILITIES: dict[str, str] = {
    "box_scores": "admitted",
    "series_facts": "admitted",
    "seed_evidence": "reconstructed_regular_season",
    "play_by_play": "gated_b19",
    "wowy_on_off": "gated_b21",
    "defensive_matchups": "gated_b23",
    "playoff_forecasts": "not_admitted_inferred_claims_forbidden",
}

PLAYOFF_DISCLAIMERS: list[str] = [
    (
        "Scheduled or unplayed games retain placeholder status and are strictly excluded from "
        "statistical outcomes, ratings, and player denominators."
    ),
    (
        "Seeds are reconstructed from regular-season records strictly prior to playoff tipoff. "
        "Record ties do not establish official conference placement without tiebreaker evidence."
    ),
    (
        "CourtLens provides descriptive completed-game facts only. Subjective win probabilities "
        "and automated playoff forecast models are prohibited by domain guardrails."
    ),
    (
        "Advanced play-by-play, rotation/lineup tracking, and defensive matchup matrix "
        "capabilities are gated to Blocks B19-B25."
    ),
]


@dataclass(frozen=True)
class PlayoffGameIdInfo:
    """Decomposed elements of a canonical NBA playoff game ID.

    Format: 004{YY}00{round}{matchup}{game_num}.
    """

    game_id: str
    series_id: str
    season_start_yy: str
    season_ending_year: int
    canonical_season: str
    round_number: int
    round_name: str
    matchup_index: int
    conference: str | None
    game_number: int


def parse_season_param(season: int | str) -> tuple[str, int, str]:
    """Parse season input into (canonical_season, ending_year, 2-digit start yy).

    Examples:
        2024 -> ('2023-24', 2024, '23')
        '2023-24' -> ('2023-24', 2024, '23')
        2025 -> ('2024-25', 2025, '24')
    """
    if isinstance(season, int):
        ending_year = season
        start_year = ending_year - 1
        start_yy = f"{start_year % 100:02d}"
        canonical_season = f"{start_year}-{ending_year % 100:02d}"
        return canonical_season, ending_year, start_yy

    s = str(season).strip()
    if "-" in s:
        parts = s.split("-")
        start_year = int(parts[0])
        ending_year = start_year + 1
        start_yy = f"{start_year % 100:02d}"
        canonical_season = f"{start_year}-{ending_year % 100:02d}"
        return canonical_season, ending_year, start_yy

    ending_year = int(s)
    start_year = ending_year - 1
    start_yy = f"{start_year % 100:02d}"
    canonical_season = f"{start_year}-{ending_year % 100:02d}"
    return canonical_season, ending_year, start_yy


def canonical_conference(round_number: int, matchup_index: int) -> str | None:
    """Determine conference ('Eastern' | 'Western' | None) from round and matchup index."""
    if round_number == 1:
        return "Eastern" if matchup_index in {0, 1, 2, 3} else "Western"
    if round_number == 2:
        return "Eastern" if matchup_index in {0, 1} else "Western"
    if round_number == 3:
        return "Eastern" if matchup_index == 0 else "Western"
    return None  # Round 4 is NBA Finals


def parse_playoff_game_id(game_id: str) -> PlayoffGameIdInfo:
    """Decompose canonical 10-digit NBA playoff game ID into structured metadata.

    Format: 004{YY}00{round}{matchup}{game_num} (10 characters).
    """
    gid = str(game_id).strip()
    if not (len(gid) == 10 and gid.startswith(PLAYOFF_GAME_ID_PREFIX)):
        raise ValueError(
            f"Invalid playoff game ID '{gid}'. Expected 10-character ID starting with "
            f"'{PLAYOFF_GAME_ID_PREFIX}'."
        )

    start_yy = gid[3:5]
    start_year = 2000 + int(start_yy) if int(start_yy) < 70 else 1900 + int(start_yy)
    ending_year = start_year + 1
    canonical_season = f"{start_year}-{ending_year % 100:02d}"

    round_number = int(gid[7])
    if round_number not in ROUND_NAMES:
        raise ValueError(f"Invalid round number '{round_number}' in game ID '{gid}'.")

    matchup_index = int(gid[8])
    game_number = int(gid[9])
    if not (1 <= game_number <= 7):
        raise ValueError(f"Invalid game number '{game_number}' in game ID '{gid}'.")

    series_id = gid[:9]
    conf = canonical_conference(round_number, matchup_index)

    return PlayoffGameIdInfo(
        game_id=gid,
        series_id=series_id,
        season_start_yy=start_yy,
        season_ending_year=ending_year,
        canonical_season=canonical_season,
        round_number=round_number,
        round_name=ROUND_NAMES[round_number],
        matchup_index=matchup_index,
        conference=conf,
        game_number=game_number,
    )


def build_series_id(season_ending_year: int, round_number: int, matchup_index: int) -> str:
    """Construct 9-character series ID (e.g. 004230040)."""
    start_year = season_ending_year - 1
    start_yy = f"{start_year % 100:02d}"
    return f"{PLAYOFF_GAME_ID_PREFIX}{start_yy}00{round_number}{matchup_index}"


def build_series_slug(
    season_ending_year: int,
    round_number: int,
    team1_tricode: str,
    team2_tricode: str,
    matchup_index: int = 0,
) -> str:
    """Generate canonical human-readable series slug identifier.

    Examples:
        2024, 1, 'BOS', 'MIA' -> '2024-r1-bos-mia'
        2024, 2, 'BOS', 'CLE' -> '2024-r2-bos-cle'
        2024, 3, 'BOS', 'IND', matchup=0 -> '2024-ecf-bos-ind'
        2024, 3, 'MIN', 'DAL', matchup=1 -> '2024-wcf-min-dal'
        2024, 4, 'BOS', 'DAL' -> '2024-finals-bos-dal'
    """
    t1 = team1_tricode.lower()
    t2 = team2_tricode.lower()

    if round_number == 1:
        return f"{season_ending_year}-r1-{t1}-{t2}"
    if round_number == 2:
        return f"{season_ending_year}-r2-{t1}-{t2}"
    if round_number == 3:
        prefix = "ecf" if matchup_index == 0 else "wcf"
        return f"{season_ending_year}-{prefix}-{t1}-{t2}"
    if round_number == 4:
        return f"{season_ending_year}-finals-{t1}-{t2}"

    return f"{season_ending_year}-r{round_number}-{t1}-{t2}"


def get_series_slug_aliases(
    season_ending_year: int,
    round_number: int,
    team1_tricode: str,
    team2_tricode: str,
    matchup_index: int = 0,
) -> list[str]:
    """Return all acceptable slug and alias variations for resolving a series."""
    canonical = build_series_slug(
        season_ending_year, round_number, team1_tricode, team2_tricode, matchup_index
    )
    t1 = team1_tricode.lower()
    t2 = team2_tricode.lower()

    aliases = [canonical]

    # Inverted team order
    if round_number == 1:
        aliases.append(f"{season_ending_year}-r1-{t2}-{t1}")
    elif round_number == 2:
        aliases.append(f"{season_ending_year}-r2-{t2}-{t1}")
        aliases.append(f"{season_ending_year}-semis-{t1}-{t2}")
        aliases.append(f"{season_ending_year}-semis-{t2}-{t1}")
    elif round_number == 3:
        prefix = "ecf" if matchup_index == 0 else "wcf"
        aliases.append(f"{season_ending_year}-{prefix}-{t2}-{t1}")
        aliases.append(f"{season_ending_year}-r3-{t1}-{t2}")
        aliases.append(f"{season_ending_year}-r3-{t2}-{t1}")
        aliases.append(f"{season_ending_year}-{prefix}")
        aliases.append(prefix)
    elif round_number == 4:
        aliases.append(f"{season_ending_year}-finals-{t2}-{t1}")
        aliases.append(f"{season_ending_year}-finals")
        aliases.append(f"{season_ending_year}-r4-{t1}-{t2}")
        aliases.append(f"{season_ending_year}-r4-{t2}-{t1}")
        aliases.append("finals")

    # Add raw series code as alias
    aliases.append(build_series_id(season_ending_year, round_number, matchup_index))

    return list(dict.fromkeys(aliases))


@dataclass
class RawPlayoffGameRecord:
    """Raw game record parsed from workbench schedules and team/player box scores."""

    game_id: str
    season: str
    game_date: date
    home_team_id: str
    away_team_id: str
    game_status: int
    is_final: bool
    home_points: int | None
    away_points: int | None
    annotations: dict[str, Any] = field(default_factory=dict)


def compute_2_2_1_1_1_hosts(team1_id: str, team2_id: str) -> dict[int, tuple[str, str]]:
    """Return standard NBA playoff (home_team, away_team) by game number (1..7).

    Team 1 holds home-court advantage (games 1, 2, 5, 7 at home).
    Team 2 hosts games 3, 4, 6 at home.
    """
    return {
        1: (team1_id, team2_id),
        2: (team1_id, team2_id),
        3: (team2_id, team1_id),
        4: (team2_id, team1_id),
        5: (team1_id, team2_id),
        6: (team2_id, team1_id),
        7: (team1_id, team2_id),
    }


def aggregate_team_series_factors(
    team_id: str,
    completed_games: list[dict[str, Any]],
) -> dict[str, Any]:
    """Aggregate Dean Oliver Four Factors and ratings across strictly completed series games."""
    team_games = [g for g in completed_games if g["team_id"] == team_id]
    opp_games = [g for g in completed_games if g["team_id"] != team_id]

    gp = len(team_games)
    if gp == 0:
        return {
            "games_played": 0,
            "wins": 0,
            "losses": 0,
            "points_per_game": None,
            "opponent_points_per_game": None,
            "average_margin": None,
            "pace": None,
            "off_rating": None,
            "def_rating": None,
            "net_rating": None,
            "efg_pct": None,
            "tov_pct": None,
            "oreb_pct": None,
            "ftr": None,
            "totals": {},
        }

    wins = sum(1 for g in team_games if g["points"] > g["opponent_points"])
    losses = sum(1 for g in team_games if g["points"] < g["opponent_points"])

    pts = sum(g["points"] for g in team_games)
    opp_pts = sum(g["points"] for g in opp_games)

    fgm = sum(g["stats"].get("field_goals_made", 0) for g in team_games)
    fga = sum(g["stats"].get("field_goals_attempted", 0) for g in team_games)
    fg3m = sum(g["stats"].get("three_pointers_made", 0) for g in team_games)
    fg3a = sum(g["stats"].get("three_pointers_attempted", 0) for g in team_games)
    ftm = sum(g["stats"].get("free_throws_made", 0) for g in team_games)
    fta = sum(g["stats"].get("free_throws_attempted", 0) for g in team_games)
    oreb = sum(g["stats"].get("rebounds_offensive", 0) for g in team_games)
    dreb = sum(g["stats"].get("rebounds_defensive", 0) for g in team_games)
    reb = sum(g["stats"].get("rebounds_total", 0) for g in team_games)
    ast = sum(g["stats"].get("assists", 0) for g in team_games)
    stl = sum(g["stats"].get("steals", 0) for g in team_games)
    blk = sum(g["stats"].get("blocks", 0) for g in team_games)
    tov = sum(g["stats"].get("turnovers", 0) for g in team_games)
    pf = sum(g["stats"].get("fouls_personal", 0) for g in team_games)

    opp_fga = sum(g["stats"].get("field_goals_attempted", 0) for g in opp_games)
    opp_fta = sum(g["stats"].get("free_throws_attempted", 0) for g in opp_games)
    opp_oreb = sum(g["stats"].get("rebounds_offensive", 0) for g in opp_games)
    opp_dreb = sum(g["stats"].get("rebounds_defensive", 0) for g in opp_games)
    opp_tov = sum(g["stats"].get("turnovers", 0) for g in opp_games)

    possessions = compute_estimated_possessions(fga, fta, oreb, tov)
    opp_possessions = compute_estimated_possessions(opp_fga, opp_fta, opp_oreb, opp_tov)

    pace = compute_team_pace(possessions, gp)
    off_rtg = compute_offensive_rating(pts, possessions)
    def_rtg = compute_defensive_rating(opp_pts, opp_possessions)
    net_rtg = compute_net_rating(off_rtg, def_rtg)

    efg = compute_efg_pct(fgm, fg3m, fga)
    tov_pct = compute_tov_pct(tov, fga, fta)
    oreb_pct = compute_oreb_pct(oreb, opp_dreb)
    ft_rate = compute_ftr(fta, fga)

    ppg = round(pts / gp, 1)
    opp_ppg = round(opp_pts / gp, 1)
    avg_margin = round((pts - opp_pts) / gp, 2)

    totals = {
        "points": pts,
        "opponent_points": opp_pts,
        "field_goals_made": fgm,
        "field_goals_attempted": fga,
        "three_pointers_made": fg3m,
        "three_pointers_attempted": fg3a,
        "free_throws_made": ftm,
        "free_throws_attempted": fta,
        "rebounds_offensive": oreb,
        "rebounds_defensive": dreb,
        "rebounds_total": reb,
        "assists": ast,
        "steals": stl,
        "blocks": blk,
        "turnovers": tov,
        "fouls_personal": pf,
    }

    return {
        "games_played": gp,
        "wins": wins,
        "losses": losses,
        "points_per_game": ppg,
        "opponent_points_per_game": opp_ppg,
        "average_margin": avg_margin,
        "pace": pace,
        "off_rating": off_rtg,
        "def_rating": def_rtg,
        "net_rating": net_rtg,
        "efg_pct": efg,
        "tov_pct": tov_pct,
        "oreb_pct": oreb_pct,
        "ftr": ft_rate,
        "totals": totals,
    }


def aggregate_player_series_stats(
    player_games: list[dict[str, Any]],
    identities: dict[str, str],
) -> list[dict[str, Any]]:
    """Aggregate per-player series box scores strictly over games where the player appeared."""
    players_data: dict[str, dict[str, Any]] = {}

    for row in player_games:
        mins_sec = row.get("minutes_seconds") or 0
        if row.get("appearance") != "appeared" and mins_sec <= 0:
            continue

        pid = row["player_id"]
        if pid not in players_data:
            players_data[pid] = {
                "player_id": pid,
                "player_name": identities.get(pid, pid),
                "team_id": row["team_id"],
                "team_tricode": resolve_team_tricode(row["team_id"]),
                "games_played": 0,
                "games_started": None,
                "minutes_total_seconds": 0,
                "points_total": 0,
                "rebounds_total": 0,
                "offensive_rebounds": 0,
                "defensive_rebounds": 0,
                "assists_total": 0,
                "steals_total": 0,
                "blocks_total": 0,
                "turnovers_total": 0,
                "fouls_total": 0,
                "fgm": 0,
                "fga": 0,
                "fg3m": 0,
                "fg3a": 0,
                "ftm": 0,
                "fta": 0,
            }

        p = players_data[pid]
        p["games_played"] += 1
        p["minutes_total_seconds"] += row.get("minutes_seconds") or 0
        p["points_total"] += row.get("points") or 0

        stats = row.get("stats") or {}
        p["offensive_rebounds"] += stats.get("rebounds_offensive") or 0
        p["defensive_rebounds"] += stats.get("rebounds_defensive") or 0
        p["rebounds_total"] += stats.get("rebounds_total") or 0
        p["assists_total"] += stats.get("assists") or 0
        p["steals_total"] += stats.get("steals") or 0
        p["blocks_total"] += stats.get("blocks") or 0
        p["turnovers_total"] += stats.get("turnovers") or 0
        p["fouls_total"] += stats.get("fouls_personal") or 0
        p["fgm"] += stats.get("field_goals_made") or 0
        p["fga"] += stats.get("field_goals_attempted") or 0
        p["fg3m"] += stats.get("three_pointers_made") or 0
        p["fg3a"] += stats.get("three_pointers_attempted") or 0
        p["ftm"] += stats.get("free_throws_made") or 0
        p["fta"] += stats.get("free_throws_attempted") or 0

    results: list[dict[str, Any]] = []
    for p in players_data.values():
        gp = p["games_played"]
        if gp <= 0:
            continue

        mins_pg = round((p["minutes_total_seconds"] / 60.0) / gp, 1)
        pts_pg = round(p["points_total"] / gp, 1)
        reb_pg = round(p["rebounds_total"] / gp, 1)
        ast_pg = round(p["assists_total"] / gp, 1)
        stl_pg = round(p["steals_total"] / gp, 1)
        blk_pg = round(p["blocks_total"] / gp, 1)
        tov_pg = round(p["turnovers_total"] / gp, 1)
        pf_pg = round(p["fouls_total"] / gp, 1)

        fga = p["fga"]
        fgm = p["fgm"]
        fg3a = p["fg3a"]
        fg3m = p["fg3m"]
        fta = p["fta"]
        ftm = p["ftm"]

        fg_pct = round(fgm / fga, 4) if fga > 0 else None
        fg3_pct = round(fg3m / fg3a, 4) if fg3a > 0 else None
        ft_pct = round(ftm / fta, 4) if fta > 0 else None
        efg_pct = round((fgm + 0.5 * fg3m) / fga, 4) if fga > 0 else None

        ts_denom = 2.0 * (fga + 0.44 * fta)
        ts_pct = round(p["points_total"] / ts_denom, 4) if ts_denom > 0 else None

        p.update(
            {
                "minutes_per_game": mins_pg,
                "points_per_game": pts_pg,
                "rebounds_per_game": reb_pg,
                "assists_per_game": ast_pg,
                "steals_per_game": stl_pg,
                "blocks_per_game": blk_pg,
                "turnovers_per_game": tov_pg,
                "fouls_per_game": pf_pg,
                "fg_pct": fg_pct,
                "fg3_pct": fg3_pct,
                "ft_pct": ft_pct,
                "efg_pct": efg_pct,
                "ts_pct": ts_pct,
            }
        )
        results.append(p)

    results.sort(key=lambda x: (x["points_total"], x["minutes_total_seconds"]), reverse=True)
    return results


def reconstruct_regular_season_seeds(
    team_records: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Compute reconstructed regular-season seedings by conference strictly prior to playoff tipoff.

    Includes explicit tie notes to respect the zero-inferred-claims rule:
    ties in record ordering do not establish official conference placement
    without tiebreaker evidence.
    """
    by_conf: dict[str, list[dict[str, Any]]] = {"Eastern": [], "Western": []}

    for row in team_records:
        team_id = row["team_id"]
        info = get_team_info(team_id)
        conf = info.conference if info else "Eastern"
        if conf not in by_conf:
            by_conf[conf] = []

        gp = row.get("gp", 0)
        wins = row.get("wins", 0)
        losses = row.get("losses", 0)
        win_pct = round(wins / gp, 4) if gp > 0 else 0.0

        by_conf[conf].append(
            {
                "team_id": team_id,
                "tricode": info.tricode if info else team_id,
                "team_name": info.name if info else team_id,
                "conference": conf,
                "wins": wins,
                "losses": losses,
                "win_pct": win_pct,
                "gp": gp,
            }
        )

    for _conf, teams in by_conf.items():
        # Sort by win_pct desc, wins desc, then alphabetical team_id
        teams.sort(key=lambda t: (t["win_pct"], t["wins"], t["team_id"]), reverse=True)

        # Detect ties
        record_groups: dict[tuple[int, int], list[dict[str, Any]]] = {}
        for t in teams:
            rec = (t["wins"], t["losses"])
            record_groups.setdefault(rec, []).append(t)

        for rank, t in enumerate(teams, start=1):
            t["seed"] = rank
            rec = (t["wins"], t["losses"])
            group = record_groups[rec]
            if len(group) > 1:
                t["is_tied"] = True
                tied_with = [
                    other["tricode"] for other in group if other["team_id"] != t["team_id"]
                ]
                tied_names = ", ".join(tied_with)
                t["tie_note"] = (
                    f"Record tied with {tied_names} ({rec[0]}-{rec[1]}). "
                    "Regular-season record ties do not establish official conference placement "
                    "without tiebreaker evidence."
                )
            else:
                t["is_tied"] = False
                t["tie_note"] = None

            t["source_label"] = "reconstructed_regular_season_standings"

    return by_conf
