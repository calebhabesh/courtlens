"""Independent B23 arithmetic, missingness and branch-policy examples."""

from copy import deepcopy

import pytest
from pydantic import ValidationError

from courtlens.domain.shooting import ShootingRequest, ShotFact, profile, shot_zone
from courtlens.services.shooting import aftermath


def shot(**changes: object) -> ShotFact:
    return ShotFact.model_validate(
        dict(
            game_id="g",
            game_date="2024-01-10",
            player_id="a",
            team_id="T",
            period=1,
            seconds_remaining=600,
            shot_value=2,
            made=False,
            points=0,
            x_feet=0,
            y_feet=0,
            distance_feet=0,
            zone="Restricted Area",
            **changes,
        )
    )


def sequence() -> tuple[list[dict], list[dict]]:
    events = [
        dict(
            game_id="g",
            period=1,
            person_id="a",
            team_id="T",
            seconds_remaining=600,
            shot_value=2,
            order_index=1,
            event_type="Missed Shot",
            sub_type=None,
        ),
        dict(
            game_id="g",
            period=1,
            person_id="b",
            team_id="T",
            seconds_remaining=599,
            shot_value=None,
            order_index=2,
            event_type="rebound",
            sub_type="Offensive",
        ),
    ]
    possessions = [
        dict(
            game_id="g",
            period=1,
            offense_team_id="T",
            defense_team_id="O",
            possession_number=1,
            count_as_possession=True,
            start_order_index=1,
            end_order_index=3,
            points=3,
            end_seconds_remaining=590,
        ),
        dict(
            game_id="g",
            period=1,
            offense_team_id="O",
            defense_team_id="T",
            possession_number=2,
            count_as_possession=True,
            start_order_index=4,
            end_order_index=5,
            points=0,
            end_seconds_remaining=580,
        ),
    ]
    return events, possessions


def test_profile_partition_totals_and_unknown() -> None:
    rows = [
        shot(),
        shot().model_copy(update={"made": True, "points": 2}),
        shot().model_copy(update={"zone": "Unknown", "x_feet": None, "y_feet": None}),
    ]
    p = profile("a", rows, ShootingRequest(player_id="a", min_attempts=2, min_games=1))
    assert (p.attempts, p.makes, p.points, p.located_attempts, p.unknown_attempts) == (
        3,
        1,
        2,
        2,
        1,
    )
    assert p.sample_status == "available"
    assert p.zones[0].fg_pct == 0.5 and p.zones[0].attempt_share == 2 / 3
    assert sum(z.attempts for z in p.zones) == 3
    assert p.zones[1].fg_pct is None
    assert profile("missing", rows, ShootingRequest(player_id="missing")).sample_status == "empty"


@pytest.mark.parametrize(
    "x,y,d,v,expected",
    [
        (None, None, 0, 2, "Unknown"),
        (0, 0, 0, 2, "Restricted Area"),
        (-22, 10, 24, 3, "Left Corner 3"),
        (22, 10, 24, 3, "Right Corner 3"),
        (0, 25, 25, 3, "Above the Break 3"),
        (12, 15, 20, 2, "Mid-Range"),
    ],
)
def test_adapter_zone_policy(
    x: float | None, y: float | None, d: float, v: int, expected: str
) -> None:
    assert shot_zone(x, y, d, v) == expected


def test_recovery_scoring_includes_free_throws_and_observed_opponent_zero() -> None:
    events, possessions = sequence()
    a = aftermath([shot()], events, possessions)[0]
    assert a.branch == "missed_recovery"
    assert a.first_chance_points == 0 and a.continued_points == 3
    assert a.next_status == "observed" and a.next_opponent_points == 0


@pytest.mark.parametrize("change", ["missing", "ambiguous", "overlap", "wrong_team"])
def test_unknown_mapping(change: str) -> None:
    events, possessions = sequence()
    if change == "missing":
        events = []
    elif change == "ambiguous":
        events.append(deepcopy(events[0]))
    elif change == "overlap":
        possessions.append(deepcopy(possessions[0]))
    else:
        possessions[0]["offense_team_id"] = "wrong"
    a = aftermath([shot()], events, possessions)[0]
    assert a.branch == "unknown" and a.continued_points is None
    assert a.first_chance_points is None and a.shot_points == 0


def test_first_chance_only_and_no_cross_period_or_skipping() -> None:
    events, possessions = sequence()
    later = shot().model_copy(update={"seconds_remaining": 598})
    events.append(dict(events[0], order_index=3, seconds_remaining=598))
    assert len(aftermath([shot(), later], events, possessions)) == 1
    possessions[1]["period"] = 2
    a = aftermath([shot()], events, possessions)[0]
    assert a.next_status == "missing" and a.next_opponent_points is None
    possessions[0]["end_seconds_remaining"] = 0
    assert aftermath([shot()], events, possessions)[0].next_status == "censored"
    possessions[0]["end_seconds_remaining"] = 590
    possessions[1]["possession_number"] = 3
    assert aftermath([shot()], events, possessions)[0].next_status == "missing"


def test_made_and_no_recovery_branches() -> None:
    events, possessions = sequence()
    assert aftermath([shot()], events[:1], possessions)[0].branch == "missed_no_observed_recovery"
    made = shot().model_copy(update={"made": True, "points": 2})
    a = aftermath([made], events[:1], possessions)[0]
    assert a.branch == "made" and a.continued_points == 1


@pytest.mark.parametrize(
    "changes",
    [
        {"min_attempts": 0},
        {"limit": 26},
        {"player_id": " "},
        {"before_date": "2024-01-10", "lower_date": "2024-01-10"},
        {"nearest_defender": True},
    ],
)
def test_strict_request(changes: dict) -> None:
    with pytest.raises(ValidationError):
        ShootingRequest.model_validate(
            dict(player_id="a", **changes) if "player_id" not in changes else changes
        )
