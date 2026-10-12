"""Independent arithmetic for the PC12 table reference, including missing values."""

import pytest

from courtlens.services.table_percentiles import annotate_teams, percentile, team_values


@pytest.mark.parametrize(
    "value,cohort,direction,expected",
    [
        (20, [20, 20, 30], "high", 33),
        (30, [20, 20, 30], "high", 83),
        (2, [1, 2, 2, 4], "low", 50),
        (1, [1, 2, 2, 4], "low", 88),
        (1, [1, 2, 3, 4], "high", 13),
        (0, [0, 10], None, 25),
        (100, [10, 20], "high", 99),
        (None, [10, 20], "high", None),
        (float("nan"), [10, 20], "high", None),
        (10, [10], "high", None),
        (10, [], "high", None),
    ],
)
def test_midrank(value, cohort, direction, expected) -> None:
    assert percentile(value, cohort, direction) == expected


def test_team_reference_orients_allowance_and_retains_unknown_and_zero() -> None:
    teams = [
        {
            "win_pct": 0.7,
            "production": {"pts_per_game": 120},
            "allowance": {"pts_allowed_per_game": 110},
        },
        {
            "win_pct": 0.5,
            "production": {"pts_per_game": 110},
            "allowance": {"pts_allowed_per_game": 120},
        },
        {"win_pct": 0, "production": {"pts_per_game": None}, "allowance": {}},
    ]
    annotate_teams(teams)
    assert teams[0]["table_percentiles"]["opp_ppg"] == 75
    assert teams[1]["table_percentiles"]["opp_ppg"] == 25
    assert teams[2]["table_percentiles"]["win_pct"] == 17
    assert teams[2]["table_percentiles"]["net_margin"] is None
    assert teams[0]["table_cohort_sample_sizes"]["ppg"] == 2
    assert team_values(teams[2])["ppg"] is None
