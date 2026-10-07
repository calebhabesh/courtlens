from courtlens.domain.scoring import fantasy_points, scoring_breakdown, scoring_rules_hash


def test_scoring_golden_example_is_deterministic() -> None:
    rules = {"points": 1, "rebounds": 1.2, "assists": 1.5, "turnovers": -1}
    stats = {"points": 20, "rebounds": 10, "assists": 8, "turnovers": 3}

    assert fantasy_points(stats, rules) == 41.0
    assert scoring_breakdown(stats, rules)["turnovers"] == {
        "value": 3.0,
        "weight": -1.0,
        "points": -3.0,
    }
    assert scoring_rules_hash(rules) == scoring_rules_hash(dict(reversed(list(rules.items()))))


def test_unknown_scoring_stat_fails_closed() -> None:
    try:
        fantasy_points({"points": 10}, {"made_up_metric": 2})
    except ValueError as error:
        assert "unsupported" in str(error)
    else:
        raise AssertionError("unknown scoring fields must be rejected")


def test_non_finite_scoring_weight_fails_closed() -> None:
    try:
        fantasy_points({"points": 10}, {"points": float("nan")})
    except ValueError as error:
        assert "finite" in str(error)
    else:
        raise AssertionError("non-finite scoring weights must be rejected")
