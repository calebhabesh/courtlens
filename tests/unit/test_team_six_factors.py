"""Team six factors: an exact box-score split of each side's rating relative to league."""

from __future__ import annotations

import pytest

from courtlens.domain.team_six_factors import (
    BoxTotals,
    box_totals,
    split_side,
    sum_totals,
    team_six_factors,
    three_point_luck,
)

STRONG = BoxTotals(
    pts=118, fgm=43, fga=88, fg3m=15, fg3a=38, ftm=17, fta=22, oreb=12, dreb=34, tov=11
)
WEAK = BoxTotals(pts=104, fgm=39, fga=90, fg3m=10, fg3a=36, ftm=16, fta=21, oreb=9, dreb=31, tov=16)
LEAGUE = STRONG + WEAK


def test_split_adds_up_to_rating_gap_exactly() -> None:
    split = split_side(STRONG, LEAGUE)
    assert split is not None
    assert STRONG.rating is not None and LEAGUE.rating is not None
    assert split.total == pytest.approx(STRONG.rating - LEAGUE.rating, abs=1e-9)


def test_rating_identity_holds_for_the_possession_estimate() -> None:
    poss = STRONG.possessions
    ts = STRONG.ts_pct
    assert ts is not None
    rebuilt = 200 * ts * (1 - STRONG.tov / poss + STRONG.oreb / poss)
    assert rebuilt == pytest.approx(STRONG.rating)


def test_terms_read_positive_is_better_on_both_ends() -> None:
    strong = team_six_factors(STRONG, WEAK, LEAGUE)
    weak = team_six_factors(WEAK, STRONG, LEAGUE)
    # The strong side shoots better, turns it over less and rebounds more.
    assert strong["o_ts"] > 0 and strong["o_tov"] > 0 and strong["o_orb"] > 0
    # Its opponent is the weak side, so its defensive terms are positive too.
    assert strong["d_ts"] > 0 and strong["d_tov"] > 0 and strong["d_drb"] > 0
    assert strong["net"] == pytest.approx(strong["off"] + strong["def"])
    assert strong["net"] == pytest.approx(strong["net_eff"] + strong["net_poss"])
    assert strong["off"] == pytest.approx(strong["ortg"] - strong["league_rating"])
    assert strong["def"] == pytest.approx(strong["league_rating"] - strong["drtg"])
    # Two-team league: one side's offense is the other's defense.
    assert weak["def"] == pytest.approx(-strong["off"])


def test_three_point_luck_regresses_toward_league_and_nets_to_zero() -> None:
    lg = LEAGUE.fg3_pct
    hot = three_point_luck(STRONG, lg, 1.0)
    cold = three_point_luck(WEAK, lg, 1.0)
    assert hot < 0 < cold
    assert hot * STRONG.possessions + cold * WEAK.possessions == pytest.approx(0.0, abs=1e-9)
    assert three_point_luck(STRONG, lg, 0.5) == pytest.approx(hot / 2)
    assert three_point_luck(STRONG, lg, 0.0) == 0.0


def test_luck_moves_only_rating_and_shooting_terms() -> None:
    base = team_six_factors(STRONG, WEAK, LEAGUE)
    lucky = team_six_factors(STRONG, WEAK, LEAGUE, offense_luck=1.0, defense_luck=1.0)
    assert lucky["ortg"] == pytest.approx(base["ortg"] + lucky["off_luck"])
    assert lucky["o_ts"] == pytest.approx(base["o_ts"] + lucky["off_luck"])
    assert lucky["d_ts"] == pytest.approx(base["d_ts"] - lucky["def_luck"])
    assert lucky["o_tov"] == base["o_tov"] and lucky["d_drb"] == base["d_drb"]
    assert lucky["net"] == pytest.approx(lucky["off"] + lucky["def"])


def test_box_totals_reads_both_key_spellings_and_prefers_row_points() -> None:
    snake = box_totals({"field_goals_attempted": 80, "rebounds_offensive": 9, "points": 99})
    camel = box_totals({"fieldGoalsAttempted": 80, "reboundsOffensive": 9, "points": 99}, 101)
    assert snake.fga == camel.fga == 80 and snake.oreb == camel.oreb == 9
    assert snake.pts == 99 and camel.pts == 101


def test_empty_side_has_unknown_values_not_zeros() -> None:
    empty = team_six_factors(BoxTotals(), BoxTotals(), LEAGUE)
    assert empty["ortg"] is None and empty["off"] is None and empty["net_eff"] is None
    assert sum_totals([]) == BoxTotals()
