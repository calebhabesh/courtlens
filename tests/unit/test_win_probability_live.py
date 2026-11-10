"""The ESPN adapter must drive the training replay the way nbastatsv3 rows do (R15b)."""

from courtlens.domain.win_probability_live import AWAY_ID, HOME_ID, clock_seconds, replay_rows
from courtlens.domain.win_probability_state import replay


def play(period=1, clock="11:00", kind="Jump Shot", side="home", **extra):
    base = {
        "id": str(extra.pop("id", "1")),
        "period": period,
        "clock": clock,
        "type": kind,
        "text": extra.pop("text", kind),
        "side": side,
        "shot": None,
        "scoring": False,
        "points_attempted": None,
        "player_source_id": "9",
        "home_score": 0,
        "away_score": 0,
    }
    return {**base, **extra}


def game(*plays):
    return replay(replay_rows(list(plays)), HOME_ID, AWAY_ID)


def test_clock_formats():
    assert clock_seconds("11:15") == 675
    assert clock_seconds("45.2") == 45.2
    assert clock_seconds(None) is None
    assert clock_seconds("nope") is None


def test_made_shot_gives_the_ball_to_the_other_team():
    built = game(
        play(kind="Jump Shot", shot="field_goal", scoring=True, points_attempted=3, home_score=3)
    )
    assert built.column("home_score")[-1] == 3
    assert built.column("possession")[-1] == -1
    assert built.column("three_made_home")[-1] == 1


def test_missed_shot_then_rebound_settles_possession():
    built = game(
        play(kind="Jump Shot", shot="field_goal", clock="11:00"),
        play(kind="Defensive Rebound", side="away", clock="10:58"),
    )
    assert list(built.column("possession")[-2:]) == [0, -1]


def test_turnovers_change_possession_but_violations_do_not():
    built = game(
        play(kind="Defensive Rebound", side="home", clock="11:00"),
        play(kind="Kicked Ball", side="away", clock="10:50"),
        play(kind="Traveling", side="home", clock="10:40"),
    )
    assert list(built.column("possession")[-3:]) == [1, 1, -1]


def test_team_fouls_count_with_the_nba_marker_rules():
    fouls = [play(kind="Personal Foul", clock=f"{10 - i}:00") for i in range(5)]
    built = game(*fouls)
    assert list(built.column("fouls_home")[-5:]) == [1, 2, 3, 4, 5]
    # The fifth foul puts the other team in the bonus.
    assert built.column("bonus_away")[-1] == 1
    assert built.column("bonus_away")[-2] == 0


def test_offensive_fouls_do_not_count_as_team_fouls():
    built = game(play(kind="Offensive Foul"), play(kind="Offensive Charge", clock="10:00"))
    assert built.column("fouls_home")[-1] == 0


def test_technical_reset_copies_the_training_marker():
    built = game(
        play(kind="Personal Foul", clock="11:00"),
        play(kind="Technical Foul", clock="10:00"),
    )
    assert built.column("fouls_home")[-1] == 0


def test_second_foul_in_the_last_two_minutes_is_the_bonus():
    built = game(
        play(kind="Personal Foul", clock="1:50"),
        play(kind="Personal Foul", clock="1:40"),
    )
    assert built.column("bonus_away")[-2] == 0
    assert built.column("bonus_away")[-1] == 1


def test_shooting_foul_sets_pending_free_throws_and_they_count_down():
    built = game(
        play(kind="Shooting Foul", side="away", clock="9:00"),
        play(
            kind="Free Throw - 1 of 2",
            shot="free_throw",
            clock="9:00",
            text="X makes free throw 1 of 2",
            home_score=1,
            scoring=True,
        ),
    )
    assert built.column("ft_pending_home")[-2] == 2
    assert built.column("ft_pending_home")[-1] == 1
    assert built.column("ft_made_home")[-1] == 1


def test_a_missed_final_free_throw_leaves_possession_unknown():
    built = game(
        play(
            kind="Free Throw - 1 of 1",
            shot="free_throw",
            text="X misses free throw 1 of 1",
        ),
    )
    assert built.column("ft_made_home")[-1] == 0
    assert built.column("possession")[-1] == 0


def test_flagrant_free_throws_keep_the_ball():
    built = game(
        play(kind="Defensive Rebound", clock="9:30"),
        play(
            kind="Free Throw - Flagrant 1 of 1",
            shot="free_throw",
            clock="9:00",
            text="X makes free throw flagrant 1 of 1",
            home_score=1,
            scoring=True,
        ),
    )
    assert built.column("possession")[-1] == 1


def test_timeouts_and_challenges_count_but_a_new_period_resets_fouls():
    built = game(
        play(kind="Full Timeout", clock="9:00"),
        play(kind="Challenge", clock="8:00"),
        play(kind="Personal Foul", clock="7:00"),
        play(kind="End Period", side=None, clock="0.0"),
        play(period=2, kind="Jumpball", clock="11:50"),
    )
    assert built.column("timeouts_home")[-1] == 2
    assert built.column("fouls_home")[-1] == 0
    assert built.column("period")[-1] == 2


def test_plays_without_a_clock_are_dropped():
    assert replay_rows([play(clock=None), play(period=None)]) == []
