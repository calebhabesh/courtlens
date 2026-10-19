"""Team context: schedule-adjusted net, expected wins, standings and the rolling trend."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from courtlens.domain.team_context import (
    TeamGame,
    close_record,
    expected_wins,
    rolling_net,
    schedule_adjusted,
    standings,
)
from courtlens.domain.team_six_factors import BoxTotals


def _box(pts: float) -> BoxTotals:
    return BoxTotals(pts=pts, fga=80, fta=20, oreb=10, tov=14)


def _game(day: int, own: float, opp: float, opponent: str = "B") -> TeamGame:
    return TeamGame(
        game_id=f"g{day}",
        game_date=date(2025, 1, 1) + timedelta(days=day),
        venue="home" if day % 2 else "away",
        opponent=opponent,
        own=_box(own),
        opp=_box(opp),
    )


def test_schedule_adjustment_credits_a_hard_schedule() -> None:
    # A and B only play each other; C only plays D. Equal nets mean equal strength, but a team
    # that beat a strong opponent ranks above one that beat a weak one.
    nets = {"A": 4.0, "B": -4.0, "C": 4.0, "D": -4.0, "E": 0.0}
    opponents = {"A": ["B", "E"], "B": ["A", "E"], "C": ["D"], "D": ["C"], "E": ["A", "B"]}
    adj = schedule_adjusted(nets, opponents)
    games = {t: len(o) for t, o in opponents.items()}
    assert sum(adj[t] * games[t] for t in adj) == pytest.approx(0.0, abs=1e-9)
    for team, faced in opponents.items():
        sos = sum(adj[o] for o in faced) / len(faced)
        assert adj[team] == pytest.approx(nets[team] + sos, abs=1e-9)


def test_schedule_adjustment_skips_teams_without_games() -> None:
    assert schedule_adjusted({"A": 1.0}, {"A": []}) == {}


def test_expected_wins_follow_the_point_ratio() -> None:
    assert expected_wins(100, 100, 10) == pytest.approx(5.0)
    better = expected_wins(110, 100, 82)
    assert better is not None and 60 < better < 65
    assert expected_wins(0, 100, 10) is None


def test_close_record_counts_five_point_games() -> None:
    games = [_game(1, 100, 95), _game(2, 100, 106), _game(3, 90, 94), _game(4, 120, 100)]
    assert close_record(games) == (1, 1)


def test_standings_track_last_ten_and_streak() -> None:
    results = [True] * 8 + [False] * 3 + [True] * 2
    games = [_game(i, 110 if won else 100, 100 if won else 110) for i, won in enumerate(results)]
    record = standings(list(reversed(games)))
    assert record == {"wins": 10, "losses": 3, "last10_wins": 7, "last10_losses": 3, "streak": 2}
    assert standings([_game(1, 90, 100), _game(2, 90, 100)])["streak"] == -2


def test_rolling_net_pools_the_latest_ten_games() -> None:
    games = [_game(i, 110 if i < 10 else 90, 100) for i in range(12)]
    trend = rolling_net(games)
    assert len(trend) == 3
    assert trend[0]["net"] > trend[1]["net"] > trend[2]["net"]
    assert trend[-1]["date"] == "2025-01-12"
    assert rolling_net(games[:9]) == []
