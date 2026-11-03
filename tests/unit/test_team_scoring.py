"""Team scoring (NBA Stats team Misc totals): admission scope and exact-games attachment.

Payloads are fictional fixtures; team ids are real NBA franchise ids only for identity.
"""

import json
from typing import Any

import pytest

from courtlens.ingestion.stats_feeds import HOOPR_SOURCE, hoopr_url, parse_feed, scope_for_url
from courtlens.services.stats_feed_ingestion import team_scoring_plan
from courtlens.services.team_scoring import attach_team_scoring

REV = "b" * 40
HEADERS = ["TEAM_ID", "TEAM_NAME", "GP", "W", "L", "MIN", "PTS_OFF_TOV", "PTS_2ND_CHANCE",
           "PTS_FB", "PTS_PAINT", "OPP_PTS_OFF_TOV", "OPP_PTS_2ND_CHANCE", "OPP_PTS_FB",
           "OPP_PTS_PAINT"]  # fmt: skip


def misc_url(label: int = 2026, phase: str = "regular-season") -> str:
    return hoopr_url(REV, "leaguedashteamstats", label, f"{phase}_misc_totals")


def misc_body(season: str = "2025-26", rows: list[list[Any]] | None = None, **params: Any) -> bytes:
    declared = {"MeasureType": "Misc", "PerMode": "Totals", "Season": season,
                "SeasonType": "Regular Season", **params}  # fmt: skip
    default = [[1610612760, "Fictional City", 82, 60, 22, 3971.0, 1806, 1120, 1152, 4040,
                1209, 1176, 983, 3408]]  # fmt: skip
    return json.dumps(
        {
            "resource": "leaguedashteamstats",
            "parameters": declared,
            "resultSets": [
                {"name": "LeagueDashTeamStats", "headers": HEADERS, "rowSet": rows or default}
            ],
        }
    ).encode()


def test_team_misc_scope_and_plan() -> None:
    scope = scope_for_url(HOOPR_SOURCE, misc_url(), "2025-26")
    assert (scope.feed, scope.capability, scope.variant) == ("team_misc", "team_scoring", "misc")
    assert scope.season_type == "regular_season"
    with pytest.raises(ValueError):
        scope_for_url(HOOPR_SOURCE, misc_url().replace("misc", "base"), "2025-26")
    plan = team_scoring_plan(REV, ["1996-97", "2025-26"])
    assert len(plan) == 4
    for source, url, season in plan:
        scope_for_url(source, url, season)


def test_team_rows_key_by_nba_team_id_and_accept_start_year_declarations() -> None:
    scope = scope_for_url(HOOPR_SOURCE, misc_url(), "2025-26")
    payload = parse_feed(misc_body(), scope).rows[0][1]
    assert payload["entity_key"] == "1610612760" and payload["team_id"] == "1610612760"
    assert payload["values"]["pts_fb"] == 1152
    # The mirror's older files declare only the start year; servers prove the season by record.
    assert parse_feed(misc_body(season="2025"), scope).rows
    with pytest.raises(ValueError, match="different season"):
        parse_feed(misc_body(season="2024-25"), scope)
    with pytest.raises(ValueError, match="different measure"):
        parse_feed(misc_body(MeasureType="Base"), scope)
    with pytest.raises(ValueError, match="NBA team id"):
        parse_feed(misc_body(rows=[[None, "No Id", 1, 1, 0, 48.0, *[1] * 8]]), scope)


def team(team_id: str, games: int, wins: int) -> dict[str, Any]:
    return {"team_id": team_id, "games_played": games, "wins": wins,
            "possessions": 8000.0, "opp_possessions": 8040.0}  # fmt: skip


def row(team_id: str, gp: int, w: int) -> dict[str, Any]:
    return {"dataset_id": "d1", "team_id": team_id, "gp": gp, "w": w, "min": 3966.0,
            "observed_at": None, "upstream_revision": REV, "pts_fb": 1100, "pts_paint": 4000,
            "pts_2nd_chance": 1000, "pts_off_tov": 1500, "opp_pts_fb": 900,
            "opp_pts_paint": 3500, "opp_pts_2nd_chance": None, "opp_pts_off_tov": 1300}  # fmt: skip


def test_attaches_only_when_games_and_wins_match() -> None:
    result = {"teams": [team("1610612760", 82, 60), team("1610612738", 82, 50)]}
    attach_team_scoring(
        result, [row("1610612760", 82, 60), row("1610612738", 82, 51)], window_days=None, venue=None
    )
    okc, bos = result["teams"]
    assert okc["scoring"]["pts_fb"] == 1100 and okc["scoring"]["opp_pts_2nd_chance"] is None
    assert okc["scoring"]["pace"] == pytest.approx(48 * 16040 / (2 * 3966))
    assert bos["scoring"] is None  # one win apart: not the same games
    assert result["scoring"]["status"] == "partial" and result["scoring"]["teams"] == 1


def test_era_codes_match_their_franchise() -> None:
    result = {"teams": [team("SEA", 82, 52)]}
    attach_team_scoring(result, [row("1610612760", 82, 52)], window_days=None, venue=None)
    assert result["teams"][0]["scoring"] is not None
    assert result["scoring"]["status"] == "complete"


@pytest.mark.parametrize(
    ("window_days", "venue", "games"), [(None, "home", 41), (30, None, 82), (None, None, 40)]
)
def test_subsets_of_the_season_stay_unknown(
    window_days: int | None, venue: str | None, games: int
) -> None:
    result = {"teams": [team("1610612760", games, 30)]}
    attach_team_scoring(result, [row("1610612760", 82, 60)], window_days=window_days, venue=venue)
    assert result["teams"][0]["scoring"] is None
    assert result["scoring"]["status"] == "unavailable" and result["scoring"]["reason"]


def test_no_admitted_rows_is_unavailable_not_zero() -> None:
    result = {"teams": [team("1610612760", 82, 60)]}
    attach_team_scoring(result, [], window_days=None, venue=None)
    assert result["teams"][0]["scoring"] is None
    assert "No team scoring" in result["scoring"]["reason"]
