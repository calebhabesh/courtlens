import numpy as np

from courtlens.domain.win_probability_state import (
    period_at,
    replay,
    segment_end,
    segment_end_margins,
    state_rows,
)
from courtlens.evaluation.win_probability_data import STATE_COLUMNS, game_states

HOME, AWAY = "1", "2"


def row(period, clock, kind, team="", text="", sub="", person="9", home="", away=""):
    return {
        "period": str(period),
        "clock": clock,
        "actionType": kind,
        "subType": sub,
        "description": text,
        "teamId": team,
        "personId": person,
        "scoreHome": home,
        "scoreAway": away,
    }


def test_possession_score_and_free_throws():
    game = replay(
        [
            row(1, "PT12M00.00S", "period", text="Start"),
            row(1, "PT11M40.00S", "Made Shot", HOME, "A 3PT Jump Shot (3 PTS)", home="3", away="0"),
            row(1, "PT11M20.00S", "Missed Shot", AWAY, "MISS B Jump Shot"),
            row(1, "PT11M18.00S", "Rebound", AWAY, "B REBOUND"),
            row(1, "PT11M10.00S", "Foul", HOME, "A S.FOUL (P1.T1)", "Shooting"),
            row(
                1,
                "PT11M10.00S",
                "Free Throw",
                AWAY,
                "B Free Throw 1 of 2 (1 PTS)",
                "Free Throw 1 of 2",
                home="3",
                away="1",
            ),
            row(
                1,
                "PT11M10.00S",
                "Free Throw",
                AWAY,
                "B Free Throw 2 of 2 (2 PTS)",
                "Free Throw 2 of 2",
                home="3",
                away="2",
            ),
        ],
        HOME,
        AWAY,
    )
    assert game.column("possession").tolist() == [0, -1, 0, -1, -1, -1, 1]
    assert game.column("ft_pending_away").tolist() == [0, 0, 0, 0, 2, 1, 0]
    assert game.column("home_score")[-1] == 3
    assert game.column("away_score")[-1] == 2
    assert game.column("three_made_home")[-1] == 1
    assert game.column("ft_att_away")[-1] == 2
    assert game.column("fouls_home")[-1] == 1
    assert game.fouls == [(50.0, "home", "9", 1)]


def test_and_one_pends_one_and_team_rows_use_person_id():
    game = replay(
        [
            row(1, "PT10M00.00S", "Made Shot", HOME, "A Layup (2 PTS)", home="2", away="0"),
            row(1, "PT10M00.00S", "Foul", AWAY, "B S.FOUL (P1.T1)", "Shooting"),
            row(1, "PT09M00.00S", "Timeout", "", "Team Timeout", "Regular", person=AWAY),
            row(1, "PT08M00.00S", "Timeout", "", "Timeout: Official", "Official", person="0"),
            row(1, "PT07M00.00S", "Turnover", "", "Team Turnover", person=AWAY),
        ],
        HOME,
        AWAY,
    )
    assert game.column("ft_pending_home")[1] == 1
    assert game.column("timeouts_away")[-1] == 1
    assert game.column("possession")[-1] == 1


def test_a_later_row_never_changes_an_earlier_state():
    rows = [
        row(1, "PT11M00.00S", "Made Shot", HOME, "A Layup", home="2", away="0"),
        row(1, "PT10M00.00S", "Made Shot", AWAY, "B Layup", home="2", away="2"),
    ]
    short = replay(rows[:1], HOME, AWAY).state
    full = replay(rows, HOME, AWAY).state
    assert np.array_equal(short[0], full[0])


def test_bonus_counts_period_fouls_and_late_fouls():
    rows = [
        row(4, f"PT11M{59 - i:02d}.00S", "Foul", AWAY, f"B P.FOUL (P1.T{i + 1})", "Personal")
        for i in range(5)
    ]
    assert replay(rows, HOME, AWAY).column("bonus_home")[-1] == 1
    late = [
        row(4, "PT01M50.00S", "Foul", AWAY, "B P.FOUL (P1.T1)", "Personal"),
        row(4, "PT01M40.00S", "Foul", AWAY, "B P.FOUL (P2.T2)", "Personal"),
    ]
    bonus = replay(late, HOME, AWAY).column("bonus_home")
    assert bonus.tolist() == [0, 1]


def test_states_cover_grid_and_late_events_and_segment_targets():
    rows = [
        row(1, "PT12M00.00S", "period"),
        row(4, "PT05M00.00S", "Made Shot", HOME, "A", home="50", away="50"),
        row(4, "PT00M30.00S", "Made Shot", AWAY, "B", home="50", away="52"),
        row(4, "PT00M00.00S", "Made Shot", HOME, "A", home="52", away="52"),
        row(5, "PT04M00.00S", "Made Shot", HOME, "A", home="54", away="52"),
        row(5, "PT00M00.00S", "period"),
    ]
    game = replay(rows, HOME, AWAY)
    times, indices = state_rows(game)
    assert times[0] == 0
    assert np.all(np.diff(times) >= 0)
    assert 2880 - 30 in times  # the late event
    assert (period_at(times)[times == 2880] == 5).all()  # the overtime tip, not the buzzer row
    assert (indices[times == 2880] == 3).sum() == 1
    assert times.max() < 2880 + 300
    assert segment_end(4) == 2880 and segment_end(5) == 3180
    targets = segment_end_margins(game, np.array([100.0, 3000.0]))
    assert targets.tolist() == [0.0, 2.0]


def test_zero_scores_on_non_scoring_rows_do_not_reset_the_game():
    game = replay(
        [
            row(1, "PT11M00.00S", "Made Shot", HOME, "A Layup", home="2", away="0"),
            row(1, "PT10M00.00S", "Missed Shot", AWAY, "MISS B", home="0", away="0"),
            row(1, "PT09M00.00S", "Made Shot", AWAY, "B Layup", home="2", away="2"),
        ],
        HOME,
        AWAY,
    )
    assert game.column("home_score").tolist() == [2, 2, 2]
    assert game.column("away_score").tolist() == [0, 0, 2]


def test_full_state_features_ignore_later_rows():
    entry = {
        "home_pts": 4,
        "away_pts": 2,
        "three_pct_home": 0.36,
        "three_pct_away": 0.36,
        "ft_pct_home": 0.78,
        "ft_pct_away": 0.78,
        "roster": {
            "home": [["a", 240.0, 1.0]],
            "away": [["b", 240.0, -1.0]],
        },
    }
    rows = [
        row(1, "PT12M00.00S", "period"),
        row(1, "PT11M00.00S", "Made Shot", HOME, "A Layup", person="a", home="2", away="0"),
        row(1, "PT10M00.00S", "Foul", AWAY, "B P.FOUL (P1.T1)", "Personal", person="b"),
        row(1, "PT09M00.00S", "Made Shot", AWAY, "B Layup", person="b", home="2", away="2"),
        row(4, "PT01M00.00S", "Made Shot", HOME, "A Layup", person="a", home="4", away="2"),
        row(4, "PT00M00.00S", "period"),
    ]
    stints = [
        {
            "period": 1,
            "end_seconds_remaining": 0.0,
            "duration_seconds": 720.0,
            "home_lineup_json": ["a", "c", "d", "e", "f"],
            "away_lineup_json": ["b", "g", "h", "i", "j"],
        }
    ]
    full = game_states(0, replay(rows, HOME, AWAY), entry, stints)
    short = game_states(0, replay(rows[:3], HOME, AWAY), entry, stints)
    targets = {STATE_COLUMNS.index("target_home"), STATE_COLUMNS.index("win_home")}
    features = [i for i in range(len(STATE_COLUMNS)) if i not in targets]
    cutoff = 120.0  # the last kept row is at 120 seconds; the short game has nothing later
    left = full[full[:, 1] <= cutoff][:, features]
    right = short[short[:, 1] <= cutoff][:, features]
    assert left.shape == right.shape
    assert np.array_equal(left, right, equal_nan=True)
