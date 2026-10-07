"""Unit tests for Block B19: Rich-source domain policies, coordinate normalization, and invariants.

Tests:
- Clock parsing (ISO-8601 duration, MM:SS, period limits).
- Coordinate normalization and shot-zones-v1 classification:
  * Tenths of feet to feet conversion.
  * Zero-coordinate placeholder vs genuine at-rim attempt distinction.
  * Zone mapping: Restricted Area, Paint (Non-RA), Mid-Range, Corner 3s,
    Above the Break 3, Backcourt.
- PBP stream parsing and chronological / clock-inversion / 5-man lineup invariant checks.
- Possession stream parsing, lineup distinctness, and strict team point conservation.
- Lineup stint parsing and home/away 5-man verification.
- Shot event parsing, makes <= attempts, point consistency, and box-score FGA/FGM reconciliation.
- Defensive matchup pair parsing, fractional possession semantics, and active roster
  participation checks.
- Structured rejection and quarantine reporting.
"""

from __future__ import annotations

import io

from courtlens.domain.rich_sources import (
    POSSESSION_POLICY_VERSION,
    RICH_PARSER_SIGNATURE,
    SHOT_ZONES_VERSION,
    NormalizedMatchup,
    NormalizedPbpEvent,
    NormalizedPossession,
    RejectedGameRecord,
    RichAdmissionSummary,
    classify_shot_zone,
    normalize_shot_coordinates,
    parse_clock_to_seconds,
    parse_lineups_stream,
    parse_matchups_stream,
    parse_pbp_stream,
    parse_possessions_stream,
    parse_shots_stream,
    validate_game_matchups_invariants,
    validate_game_pbp_invariants,
    validate_game_possessions_invariants,
    validate_game_shots_invariants,
)


def test_clock_parsing() -> None:
    """Verify parsing ISO-8601 durations and MM:SS timestamps into seconds remaining."""
    # ISO-8601 duration
    assert parse_clock_to_seconds("PT11M41.00S") == 701.0
    assert parse_clock_to_seconds("PT05M30.50S") == 330.5
    assert parse_clock_to_seconds("PT00M00.00S") == 0.0
    assert parse_clock_to_seconds("PT12M") == 720.0
    assert parse_clock_to_seconds("PT45S") == 45.0

    # MM:SS format
    assert parse_clock_to_seconds("11:41") == 701.0
    assert parse_clock_to_seconds("05:30.5") == 330.5
    assert parse_clock_to_seconds("0:00") == 0.0

    # Raw seconds float
    assert parse_clock_to_seconds("240.5") == 240.5

    # None / empty / invalid
    assert parse_clock_to_seconds(None) == 0.0
    assert parse_clock_to_seconds("") == 0.0
    assert parse_clock_to_seconds("invalid") == 0.0


def test_coordinate_normalization_tenths_to_feet() -> None:
    """Verify tenths-of-feet to feet coordinate conversion and round precision."""
    # 120 tenths = 12.0 feet, 255 tenths = 25.5 feet
    x, y, present = normalize_shot_coordinates(120, 255, shot_distance=28.2)
    assert present is True
    assert x == 12.0
    assert y == 25.5

    # Negative coordinates (left side of court)
    x_neg, y_neg, present_neg = normalize_shot_coordinates(-220, 100, shot_distance=24.2)
    assert present_neg is True
    assert x_neg == -22.0
    assert y_neg == 10.0


def test_coordinate_normalization_zero_placeholder_vs_at_rim() -> None:
    """Verify (0, 0) placeholder detection: distant shot with (0,0) is missing coordinates."""
    # Shot taken from 26 feet recorded as (0, 0) must be flagged as missing
    x, y, present = normalize_shot_coordinates(0, 0, shot_distance=26.0)
    assert present is False
    assert x is None
    assert y is None

    # Genuine at-rim attempt (distance <= 3.0 feet) with (0, 0) is valid present coordinate
    x_rim, y_rim, present_rim = normalize_shot_coordinates(0, 0, shot_distance=1.5)
    assert present_rim is True
    assert x_rim == 0.0
    assert y_rim == 0.0

    # Missing coordinates (None or empty)
    x_none, y_none, present_none = normalize_shot_coordinates(None, None, shot_distance=10.0)
    assert present_none is False
    assert x_none is None
    assert y_none is None


def test_shot_zone_classification() -> None:
    """Verify shot-zones-v1 zone and distance category classification."""
    # Restricted Area: dist <= 4.0 ft
    zone, rng = classify_shot_zone(0.0, 2.0, shot_distance=2.0, shot_value=2)
    assert zone == "Restricted Area"
    assert rng == "Less Than 8 ft."

    # In The Paint (Non-RA): abs(x) <= 8.0, y <= 14.25, dist > 4.0 ft
    zone, rng = classify_shot_zone(4.0, 10.0, shot_distance=10.8, shot_value=2)
    assert zone == "In The Paint (Non-RA)"
    assert rng == "8-16 ft."

    # Mid-Range: 2-pt outside paint
    zone, rng = classify_shot_zone(14.0, 12.0, shot_distance=18.4, shot_value=2)
    assert zone == "Mid-Range"
    assert rng == "16-24 ft."

    # Left Corner 3: shot_value=3, y <= 14.0, x <= -21.75
    zone, rng = classify_shot_zone(-22.0, 8.0, shot_distance=23.4, shot_value=3)
    assert zone == "Left Corner 3"
    assert rng == "24+ ft."

    # Right Corner 3: shot_value=3, y <= 14.0, x >= 21.75
    zone, rng = classify_shot_zone(22.5, 6.0, shot_distance=23.3, shot_value=3)
    assert zone == "Right Corner 3"
    assert rng == "24+ ft."

    # Above the Break 3: shot_value=3, y > 14.0
    zone, rng = classify_shot_zone(15.0, 20.0, shot_distance=25.0, shot_value=3)
    assert zone == "Above the Break 3"
    assert rng == "24+ ft."

    # Backcourt: dist > 43.0 or y > 43.0
    zone, rng = classify_shot_zone(10.0, 48.0, shot_distance=49.0, shot_value=3)
    assert zone == "Backcourt"
    assert rng == "Backcourt"

    # Missing coordinates fallback
    zone, rng = classify_shot_zone(None, None, shot_distance=24.5, shot_value=3)
    assert zone == "Unknown"
    assert rng == "24+ ft."


def test_parse_pbp_stream_and_invariants() -> None:
    """Verify parsing PBP stream and clock/lineup invariant verification."""
    csv_data = (
        "game_id,order_index,action_number,period,clock,seconds_remaining,event_type,team_id,person_id,"
        "score_home,score_away,points_total,shot_value,shot_distance,x_legacy,y_legacy,possession_number,"
        "off_player_1,off_player_2,off_player_3,off_player_4,off_player_5,"
        "def_player_1,def_player_2,def_player_3,def_player_4,def_player_5,description,video_available\n"
        "0022300001,1,1,1,12:00,720.0,start_period,1610612738,,0,0,0,,,0,0,1,"
        "p1,p2,p3,p4,p5,d1,d2,d3,d4,d5,Start Period,1\n"
        "0022300001,2,2,1,11:40,700.0,shot,1610612738,p1,2,0,2,2,4.0,20,30,1,"
        "p1,p2,p3,p4,p5,d1,d2,d3,d4,d5,Made 2pt,1\n"
    )
    stream = io.StringIO(csv_data)
    games, rejected = parse_pbp_stream(stream)
    assert len(rejected) == 0
    assert "0022300001" in games
    events = games["0022300001"]
    assert len(events) == 2
    assert events[0].period == 1
    assert events[0].seconds_remaining == 720.0
    assert len(events[0].off_lineup) == 5
    assert len(events[0].def_lineup) == 5
    assert events[1].shot_value == 2
    assert events[1].points_total == 2

    # Invariant validation passes
    valid, reason = validate_game_pbp_invariants("0022300001", events)
    assert valid is True
    assert reason is None

    # Test clock inversion detection (e.g. clock jumps backwards from 700s to 715s)
    invalid_event = NormalizedPbpEvent(
        game_id="0022300001",
        order_index=3,
        action_number=3,
        period=1,
        clock="11:55",
        seconds_remaining=715.0,  # Jump backwards!
        event_type="shot",
        action_type=None,
        sub_type=None,
        team_id="1610612738",
        person_id="p1",
        score_home=2,
        score_away=0,
        points_total=2,
        shot_value=2,
        shot_distance=4.0,
        x_legacy=None,
        y_legacy=None,
        possession_number=1,
        off_lineup=["p1", "p2", "p3", "p4", "p5"],
        def_lineup=["d1", "d2", "d3", "d4", "d5"],
        description=None,
        video_available=True,
        source_hash="test",
    )
    valid_inv, reason_inv = validate_game_pbp_invariants("0022300001", [*events, invalid_event])
    assert valid_inv is False
    assert reason_inv is not None and "clock_inversion" in reason_inv

    # Test 4-player lineup detection
    invalid_lineup_event = NormalizedPbpEvent(
        game_id="0022300001",
        order_index=3,
        action_number=3,
        period=1,
        clock="11:30",
        seconds_remaining=690.0,
        event_type="foul",
        action_type=None,
        sub_type=None,
        team_id="1610612738",
        person_id="p1",
        score_home=2,
        score_away=0,
        points_total=2,
        shot_value=None,
        shot_distance=None,
        x_legacy=None,
        y_legacy=None,
        possession_number=1,
        off_lineup=["p1", "p2", "p3", "p4"],  # Only 4 players!
        def_lineup=["d1", "d2", "d3", "d4", "d5"],
        description=None,
        video_available=False,
        source_hash="test",
    )
    valid_lineup, reason_lineup = validate_game_pbp_invariants(
        "0022300001", [*events, invalid_lineup_event]
    )
    assert valid_lineup is False
    assert reason_lineup == "invalid_off_lineup_count_4"


def test_parse_possessions_and_point_conservation() -> None:
    """Verify possession parsing and strict point conservation against team box score."""
    csv_data = (
        "game_id,possession_number,period,number_in_period,offense_team_id,defense_team_id,"
        "start_order_index,end_order_index,start_seconds_remaining,end_seconds_remaining,points,"
        "is_second_chance,count_as_possession,possession_start_type,fg2a,fg2m,fg3a,fg3m,fta,ftm,oreb,dreb,tov,"
        "off_player_1,off_player_2,off_player_3,off_player_4,off_player_5,"
        "def_player_1,def_player_2,def_player_3,def_player_4,def_player_5,lineup_source\n"
        "0022300002,1,1,1,1610612738,1610612748,1,4,720.0,702.0,2,false,true,OffDeadball,1,1,0,0,0,0,0,0,0,"
        "p1,p2,p3,p4,p5,d1,d2,d3,d4,d5,quarter_box\n"
        "0022300002,2,1,1,1610612748,1610612738,5,8,702.0,685.0,3,false,true,OffLiveBall,0,0,1,1,0,0,0,0,0,"
        "d1,d2,d3,d4,d5,p1,p2,p3,p4,p5,quarter_box\n"
    )
    stream = io.StringIO(csv_data)
    games, rejected = parse_possessions_stream(stream)
    assert len(rejected) == 0
    assert "0022300002" in games
    possessions = games["0022300002"]
    assert len(possessions) == 2
    assert possessions[0].points == 2
    assert possessions[1].points == 3

    # Team point conservation passes when points match
    team_points_lookup = {"1610612738": 2, "1610612748": 3}
    valid, reason = validate_game_possessions_invariants(
        "0022300002", possessions, team_points_lookup=team_points_lookup
    )
    assert valid is True
    assert reason is None

    # Team point conservation fails when team points mismatch
    bad_points_lookup = {"1610612738": 5, "1610612748": 3}  # Expected 5, actual is 2!
    valid_bad, reason_bad = validate_game_possessions_invariants(
        "0022300002", possessions, team_points_lookup=bad_points_lookup
    )
    assert valid_bad is False
    assert reason_bad is not None and "point_conservation_mismatch" in reason_bad

    # Duplicate player in 5-man lineup fails invariant
    bad_lineup_poss = NormalizedPossession(
        game_id="0022300002",
        period=1,
        possession_number=3,
        number_in_period=2,
        offense_team_id="1610612738",
        defense_team_id="1610612748",
        start_order_index=9,
        end_order_index=12,
        start_seconds_remaining=685.0,
        end_seconds_remaining=660.0,
        points=0,
        is_second_chance=False,
        possession_start_type="OffLiveBall",
        count_as_possession=True,
        stats_json={},
        off_lineup=["p1", "p1", "p3", "p4", "p5"],  # Duplicate p1!
        def_lineup=["d1", "d2", "d3", "d4", "d5"],
        lineup_source="quarter_box",
        policy_version=POSSESSION_POLICY_VERSION,
        source_hash="test",
    )
    valid_dup, reason_dup = validate_game_possessions_invariants("0022300002", [bad_lineup_poss])
    assert valid_dup is False
    assert reason_dup == "poss_3_invalid_off_lineup_5"


def test_parse_lineups_stream() -> None:
    """Verify parsing game lineup stints."""
    csv_data = (
        "game_id,action_number,period,home_player_1,home_player_2,home_player_3,home_player_4,home_player_5,"
        "away_player_1,away_player_2,away_player_3,away_player_4,away_player_5\n"
        "0022300003,1,1,h1,h2,h3,h4,h5,a1,a2,a3,a4,a5\n"
    )
    stream = io.StringIO(csv_data)
    games, rejected = parse_lineups_stream(stream)
    assert len(rejected) == 0
    assert "0022300003" in games
    stints = games["0022300003"]
    assert len(stints) == 1
    assert stints[0].home_lineup == ["h1", "h2", "h3", "h4", "h5"]
    assert stints[0].away_lineup == ["a1", "a2", "a3", "a4", "a5"]


def test_parse_shots_and_invariants() -> None:
    """Verify shot parsing, coordinate normalization, and box-score FGA/FGM reconciliation."""
    csv_data = (
        "game_id,period,clock,team_id,person_id,player_name,action_type,sub_type,shot_result,"
        "shot_value,shot_distance,x_legacy,y_legacy,score_home,score_away,description\n"
        "0022300004,1,11:30,1610612738,p1,Tatum,Jump Shot,Pullup,Made,2,14.0,120,80,2,0,Made\n"
        "0022300004,1,10:45,1610612738,p1,Tatum,Jump Shot,3PT,Missed,3,25.0,150,200,2,0,Miss\n"
    )
    stream = io.StringIO(csv_data)
    games, rejected = parse_shots_stream(stream)
    assert len(rejected) == 0
    assert "0022300004" in games
    shots = games["0022300004"]
    assert len(shots) == 2
    assert shots[0].is_made is True
    assert shots[0].points == 2
    assert shots[0].coord_x_feet == 12.0
    assert shots[0].coord_y_feet == 8.0
    assert shots[0].zone_basic == "Mid-Range"

    assert shots[1].is_made is False
    assert shots[1].points == 0
    assert shots[1].coord_x_feet == 15.0
    assert shots[1].coord_y_feet == 20.0
    assert shots[1].zone_basic == "Above the Break 3"

    # Box-score reconciliation: p1 has 2 FGA and 1 FGM
    box_fga = {"p1": 2}
    box_fgm = {"p1": 1}
    valid, reason = validate_game_shots_invariants(
        "0022300004", shots, boxscore_fga_lookup=box_fga, boxscore_fgm_lookup=box_fgm
    )
    assert valid is True
    assert reason is None

    # Mismatch in FGA triggers invariant failure
    bad_fga = {"p1": 3}
    valid_bad, reason_bad = validate_game_shots_invariants(
        "0022300004", shots, boxscore_fga_lookup=bad_fga
    )
    assert valid_bad is False
    assert reason_bad == "player_p1_fga_mismatch_exp_3_act_2"


def test_parse_matchups_and_invariants() -> None:
    """Verify defensive matchups parsing and active roster participation."""
    csv_data = (
        "game_id,off_team_id,def_team_id,side,off_person_id,off_first_name,off_family_name,"
        "def_person_id,def_first_name,def_family_name,matchup_minutes,matchup_minutes_sort,"
        "partial_possessions,percentage_defender_total_time,percentage_offensive_total_time,"
        "percentage_total_time_both_on,switches_on,player_points,team_points,matchup_assists,"
        "matchup_potential_assists,matchup_turnovers,matchup_blocks,matchup_field_goals_made,"
        "matchup_field_goals_attempted,matchup_field_goals_percentage,matchup_three_pointers_made,"
        "matchup_three_pointers_attempted,matchup_three_pointers_percentage,help_blocks,help_field_goals_made,"
        "help_field_goals_attempted,help_field_goals_percentage,matchup_free_throws_made,"
        "matchup_free_throws_attempted,shooting_fouls\n"
        "0022300005,1610612738,1610612748,home,p1,Jayson,Tatum,d1,Jimmy,Butler,6:15,375.0,18.4,"
        "0.25,0.22,0.60,2,8,22,2,4,1,0,3,7,0.429,1,3,0.333,0,0,1,0.0,1,2,1\n"
    )
    stream = io.StringIO(csv_data)
    games, rejected = parse_matchups_stream(stream)
    assert len(rejected) == 0
    assert "0022300005" in games
    matchups = games["0022300005"]
    assert len(matchups) == 1
    m = matchups[0]
    assert m.off_person_id == "p1"
    assert m.def_person_id == "d1"
    assert m.matchup_minutes == "6:15"
    assert m.matchup_seconds == 375.0
    assert m.partial_possessions == 18.4
    assert m.matchup_fgm == 3
    assert m.matchup_fga == 7
    assert m.matchup_ftm == 1
    assert m.matchup_fta == 2

    # Participation check passes when both players are on active roster
    active_roster = {"p1", "d1"}
    valid, reason = validate_game_matchups_invariants(
        "0022300005", matchups, active_player_ids=active_roster
    )
    assert valid is True
    assert reason is None

    # Unknown player not in active roster triggers invariant rejection
    incomplete_roster = {"p1"}  # Missing d1
    valid_inc, reason_inc = validate_game_matchups_invariants(
        "0022300005", matchups, active_player_ids=incomplete_roster
    )
    assert valid_inc is False
    assert reason_inc == "def_player_d1_not_in_box_scores"

    # Same player on offense and defense is rejected
    same_player_m = NormalizedMatchup(
        game_id="0022300005",
        off_team_id="1610612738",
        def_team_id="1610612748",
        side="home",
        off_person_id="p1",
        off_player_name="p1",
        def_person_id="p1",  # Same player!
        def_player_name="p1",
        matchup_minutes="1:00",
        matchup_seconds=60.0,
        partial_possessions=2.0,
        pct_defender_total_time=None,
        pct_offensive_total_time=None,
        pct_total_time_both_on=None,
        switches_on=0,
        player_points=0,
        team_points=0,
        matchup_assists=0,
        matchup_potential_assists=0,
        matchup_turnovers=0,
        matchup_blocks=0,
        matchup_fgm=0,
        matchup_fga=0,
        matchup_fg_pct=None,
        matchup_fg3m=0,
        matchup_fg3a=0,
        matchup_fg3_pct=None,
        help_blocks=0,
        help_fgm=0,
        help_fga=0,
        help_fg_pct=None,
        matchup_ftm=0,
        matchup_fta=0,
        shooting_fouls=0,
        source_hash="test",
    )
    valid_same, reason_same = validate_game_matchups_invariants("0022300005", [same_player_m])
    assert valid_same is False
    assert reason_same == "same_offensive_and_defensive_player_p1"


def test_rich_admission_summary_structure() -> None:
    """Verify RichAdmissionSummary properties and signatures."""
    summary = RichAdmissionSummary(
        season="2023-24",
        source_family="shots",
        total_games_expected=1230,
        total_games_observed=1230,
        total_games_admitted=1228,
        total_games_rejected=2,
        rejected_games=[
            RejectedGameRecord(
                game_id="0022300999",
                source_family="shots",
                rejection_code="shot_parse_error",
                detail="Malformatted line",
            )
        ],
        reconciliation_summary={"admitted_shot_rows": 215000},
        source_sha256="abc123sha",
        source_bytes=35000000,
        parser_signature=RICH_PARSER_SIGNATURE,
        policy_version=SHOT_ZONES_VERSION,
    )
    assert summary.parser_signature == "courtload-sdv-rich-v1"
    assert summary.policy_version == "shot-zones-v1"
    assert summary.total_games_admitted == 1228
    assert summary.total_games_rejected == 2
    assert len(summary.rejected_games) == 1
    assert summary.rejected_games[0].game_id == "0022300999"
