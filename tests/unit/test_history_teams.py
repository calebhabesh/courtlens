"""Team seasons served as season totals (FH05): unknowns stay unknown, full boxes use the method."""

from __future__ import annotations

from datetime import date
from typing import Any

from courtlens.domain.team_season_records import team_season_record
from courtlens.domain.teams import team_identity
from courtlens.services.history_teams import (
    SeasonTeam,
    box_complete,
    find_team,
    history_four_factors,
    history_six_factors,
)
from courtlens.services.workbench_analytics import ResolvedContext


def _context(season: str) -> ResolvedContext:
    return ResolvedContext(
        release_id="r",
        snapshot_id="r",
        dataset_id="d",
        dataset_type="workbench",
        semantic_signature="s",
        mode="workbench_recent",
        source="test",
        season=season,
        phase="regular_season",
        before_date=date(int(season[:4]) + 1, 7, 1),
        cutoff_utc="",
        window="season",
        coverage_start=date(1946, 10, 1),
        coverage_end=date(2026, 6, 30),
        default_before_date=date(int(season[:4]) + 1, 7, 1),
        supported_dates=[],
        published_at=None,
        warnings=[],
        totals_sha="sha",
        totals_seasons=(season,),
    )


def _box(points: float, *, full: bool) -> dict[str, float]:
    """A season box with fixed attempts, so more points is better shooting."""
    box = {
        "points": points,
        "field_goals_made": (points - 1800) / 2,
        "field_goals_attempted": 7600.0,
        "free_throws_made": 1800.0,
        "free_throws_attempted": 2400.0,
        "three_pointers_made": 0.0,
        "three_pointers_attempted": 0.0,
    }
    if full:
        box |= {"rebounds_offensive": 1200.0, "rebounds_defensive": 2600.0, "turnovers": 1500.0}
    return box


def _team(
    code: str, season: str, wins: int | None, own: float, opp: float, *, full: bool
) -> SeasonTeam:
    record: dict[str, Any] = {"wins": wins, "losses": None if wins is None else 82 - wins}
    if not full:
        record |= {"ortg": 100.0 + (own - opp) / 100, "drtg": 100.0, "pace": 110.0}
    return SeasonTeam(
        code=code,
        identity=team_identity(code, season),
        games=82,
        wins=wins,
        losses=record["losses"],
        own=_box(own, full=full),
        opp=_box(opp, full=full),
        record=record,
    )


def test_records_match_known_standings() -> None:
    assert team_season_record("BOS", "1965-66") is not None
    celtics = team_season_record("BOS", "1965-66") or {}
    assert (celtics["wins"], celtics["losses"]) == (54, 26)
    # The 1954-55 Baltimore Bullets folded mid-season: no standings record, never 0-0.
    bullets = team_season_record("BLB", "1954-55") or {}
    assert bullets.get("wins") is None


def test_complete_boxes_use_the_six_factor_method() -> None:
    season = "1979-80"
    teams = [
        _team("BOS", season, 61, 9000, 8400, full=True),
        _team("DET", season, 16, 8400, 9000, full=True),
    ]
    assert box_complete(teams)
    result = history_six_factors(
        _context(season), teams, window_days=None, offense_luck=0.0, defense_luck=0.0, venue=None
    )
    boston = next(t for t in result["teams"] if t["tricode"] == "BOS")
    assert boston["o_ts"] is not None and boston["net"] is not None and boston["net"] > 0
    # Games-based context stays unknown: no last ten, streak, close games, trend or SOS.
    assert boston["standings"]["last10_wins"] is None and boston["standings"]["streak"] is None
    assert boston["close_wins"] is None and boston["trend"] == [] and boston["sos"] is None
    assert boston["expected_wins"] is not None


def test_incomplete_boxes_show_source_ratings_and_unknown_factors() -> None:
    season = "1965-66"
    teams = [
        _team("BOS", season, 54, 9014, 8623, full=False),
        _team("NYK", season, 30, 8600, 9000, full=False),
    ]
    assert not box_complete(teams)
    result = history_six_factors(
        _context(season), teams, window_days=30, offense_luck=0.0, defense_luck=0.0, venue=None
    )
    boston = next(t for t in result["teams"] if t["tricode"] == "BOS")
    assert boston["ortg"] == teams[0].record["ortg"] and boston["o_ts"] is None
    assert boston["rates"]["tov_per_100"] is None and boston["rates"]["ts_pct"] is not None
    assert any("not kept before 1973-74" in w for w in result["warnings"])
    assert any("whole season" in w for w in result["warnings"])
    factors = history_four_factors(teams)["BOS"]
    assert factors["tov_pct"] is None and factors["oreb_pct"] is None
    assert factors["off_rating"] == teams[0].record["ortg"] and factors["ftr"] is not None


def test_unknown_records_and_venues_are_left_out_not_zero() -> None:
    season = "1954-55"
    teams = [
        _team("BOS", season, 36, 7300, 7300, full=False),
        _team("BLB", season, None, 1200, 1300, full=False),
    ]
    result = history_six_factors(
        _context(season), teams, window_days=None, offense_luck=0.0, defense_luck=0.0, venue=None
    )
    assert [t["tricode"] for t in result["teams"]] == ["BOS"]
    assert any("no record" in w for w in result["warnings"])
    home = history_six_factors(
        _context(season), teams, window_days=None, offense_luck=0.0, defense_luck=0.0, venue="home"
    )
    assert home["teams"] == []


def test_find_team_by_franchise_era_or_code() -> None:
    season = "1965-66"
    teams = [_team("BOS", season, 54, 9014, 8623, full=False)]
    assert find_team(teams, "1610612738", season) is teams[0]
    assert find_team(teams, "BOS", season) is teams[0]
    assert find_team(teams, "1610612747", season) is None
