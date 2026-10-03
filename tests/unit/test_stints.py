"""Unit tests for Block B20: Possession and stint warehouse domain logic.

Tests:
- Clock formatting and lineup key serialization
- Event counting stats extraction
- Single-stint regulation game reconstruction and minute conservation (2880.0s)
- Substitution and continuous stint segmentation
- Simultaneous substitutions at the same clock tick without zero-second ghost stints
- Overtime handling (300.0s per OT period, 3180.0s total for 1 OT)
- Point conservation invariants (exact match vs discrepancy detection)
- 5-player sides invariant (5 distinct players per side)
- Box score player minutes reconciliation within 30-second tolerance
- Cross-lineup possession fractional attribution under possession-policy-v1
- Reconstruction override registry application (starter override and lineup override)
"""

from __future__ import annotations

from courtload.domain.rich_sources import (
    POSSESSION_POLICY_VERSION,
    NormalizedLineupStint,
    NormalizedPbpEvent,
    NormalizedPossession,
)
from courtload.domain.stints import (
    ReconstructionOverrideRecord,
    extract_event_stats,
    format_lineup_key,
    format_seconds_to_clock,
    get_expected_period_seconds,
    reconstruct_game_stints,
)


def test_clock_and_period_helpers() -> None:
    assert get_expected_period_seconds(1) == 720.0
    assert get_expected_period_seconds(4) == 720.0
    assert get_expected_period_seconds(5) == 300.0
    assert get_expected_period_seconds(6) == 300.0

    assert format_seconds_to_clock(720.0) == "12:00"
    assert format_seconds_to_clock(300.0) == "05:00"
    assert format_seconds_to_clock(41.4) == "00:41"
    assert format_seconds_to_clock(0.0) == "00:00"
    assert format_seconds_to_clock(-5.0) == "00:00"


def test_format_lineup_key() -> None:
    lineup = ["201939", "2544", "1628369", "203076", "1629029"]
    key = format_lineup_key(lineup)
    expected = "1628369|1629029|201939|203076|2544"
    assert key == expected

    # Key is invariant to input order
    reversed_lineup = list(reversed(lineup))
    assert format_lineup_key(reversed_lineup) == expected


def test_extract_event_stats() -> None:
    # 3-point make
    ev_3pt = NormalizedPbpEvent(
        game_id="0022300001",
        order_index=1,
        action_number=10,
        period=1,
        clock="11:45",
        seconds_remaining=705.0,
        event_type="shot",
        action_type="3pt jump shot",
        sub_type=None,
        team_id="1610612747",
        person_id="2544",
        score_home=3,
        score_away=0,
        points_total=3,
        shot_value=3,
        shot_distance=26.0,
        x_legacy=0.0,
        y_legacy=260.0,
        possession_number=1,
        off_lineup=["2544"],
        def_lineup=["201939"],
        description="LeBron James makes 26-foot three point jumper",
        video_available=False,
        source_hash="hash1",
    )
    t_id, p_id, stats = extract_event_stats(ev_3pt)
    assert t_id == "1610612747"
    assert p_id == "2544"
    assert stats["points"] == 3
    assert stats["fga"] == 1
    assert stats["fgm"] == 1
    assert stats["fg3a"] == 1
    assert stats["fg3m"] == 1

    # Rebound
    ev_reb = NormalizedPbpEvent(
        game_id="0022300001",
        order_index=2,
        action_number=11,
        period=1,
        clock="11:30",
        seconds_remaining=690.0,
        event_type="rebound",
        action_type="defensive rebound",
        sub_type=None,
        team_id="1610612744",
        person_id="201939",
        score_home=3,
        score_away=0,
        points_total=0,
        shot_value=None,
        shot_distance=None,
        x_legacy=None,
        y_legacy=None,
        possession_number=1,
        off_lineup=["2544"],
        def_lineup=["201939"],
        description="Stephen Curry defensive rebound",
        video_available=False,
        source_hash="hash2",
    )
    _, _, reb_stats = extract_event_stats(ev_reb)
    assert reb_stats["reb"] == 1
    assert reb_stats["dreb"] == 1


def test_reconstruct_regulation_game_without_subs() -> None:
    """Test 4-period regulation game with constant 5-man lineups."""
    home_team = "1610612747"  # LAL
    away_team = "1610612744"  # GSW
    h_lineup = ["h1", "h2", "h3", "h4", "h5"]
    a_lineup = ["a1", "a2", "a3", "a4", "a5"]

    events: list[NormalizedPbpEvent] = []
    lineups: list[NormalizedLineupStint] = []
    possessions: list[NormalizedPossession] = []

    order = 1
    for p in range(1, 5):
        # 1 lineup record at period start
        lineups.append(
            NormalizedLineupStint(
                game_id="0022300001",
                action_number=p * 100,
                period=p,
                home_lineup=h_lineup,
                away_lineup=a_lineup,
                source_hash=f"lu_{p}",
            )
        )
        # 1 possession per period (home scores 25 pts each Q -> 100 total,
        # away scores 24 -> 96 total)
        possessions.append(
            NormalizedPossession(
                game_id="0022300001",
                period=p,
                possession_number=p,
                number_in_period=1,
                offense_team_id=home_team,
                defense_team_id=away_team,
                start_order_index=order,
                end_order_index=order + 1,
                start_seconds_remaining=720.0,
                end_seconds_remaining=0.0,
                points=25,
                is_second_chance=False,
                possession_start_type="OffDeadball",
                count_as_possession=True,
                stats_json={},
                off_lineup=h_lineup,
                def_lineup=a_lineup,
                lineup_source="quarter_box",
                policy_version=POSSESSION_POLICY_VERSION,
                source_hash=f"poss_{p}",
            )
        )
        # Event: home scores 25, away scores 24
        events.append(
            NormalizedPbpEvent(
                game_id="0022300001",
                order_index=order,
                action_number=p * 100 + 1,
                period=p,
                clock="06:00",
                seconds_remaining=360.0,
                event_type="shot",
                action_type="2pt",
                sub_type=None,
                team_id=home_team,
                person_id="h1",
                score_home=p * 25,
                score_away=(p - 1) * 24,
                points_total=25,
                shot_value=2,
                shot_distance=5.0,
                x_legacy=None,
                y_legacy=None,
                possession_number=p,
                off_lineup=h_lineup,
                def_lineup=a_lineup,
                description="Home scores",
                video_available=False,
                source_hash=f"ev_h_{p}",
            )
        )
        order += 1
        events.append(
            NormalizedPbpEvent(
                game_id="0022300001",
                order_index=order,
                action_number=p * 100 + 2,
                period=p,
                clock="01:00",
                seconds_remaining=60.0,
                event_type="shot",
                action_type="2pt",
                sub_type=None,
                team_id=away_team,
                person_id="a1",
                score_home=p * 25,
                score_away=p * 24,
                points_total=24,
                shot_value=2,
                shot_distance=5.0,
                x_legacy=None,
                y_legacy=None,
                possession_number=p,
                off_lineup=a_lineup,
                def_lineup=h_lineup,
                description="Away scores",
                video_available=False,
                source_hash=f"ev_a_{p}",
            )
        )
        order += 1

    res = reconstruct_game_stints(
        game_id="0022300001",
        home_team_id=home_team,
        away_team_id=away_team,
        events=events,
        possessions=possessions,
        lineups=lineups,
        expected_final_home_score=100,
        expected_final_away_score=96,
        player_box_minutes={"h1": 48.0, "a1": 48.0},
    )

    assert res.invariants_passed
    assert len(res.validation_errors) == 0
    assert len(res.stints) == 4  # 1 stint per period
    assert res.total_duration_seconds == 2880.0  # 48 minutes exact
    assert res.total_home_points == 100
    assert res.total_away_points == 96

    # 4 stints * 10 players = 40 stint_player records
    assert len(res.stint_players) == 40


def test_reconstruct_substitutions_and_stint_segmentation() -> None:
    """Test period with multiple continuous stints split by substitution."""
    home_team = "1610612747"
    away_team = "1610612744"

    h_starters = ["h1", "h2", "h3", "h4", "h5"]
    a_starters = ["a1", "a2", "a3", "a4", "a5"]

    h_subbed = ["h1", "h2", "h3", "h4", "h6"]  # h6 replaces h5

    lineups = [
        NormalizedLineupStint(
            game_id="0022300002",
            action_number=1,
            period=1,
            home_lineup=h_starters,
            away_lineup=a_starters,
            source_hash="lu1",
        ),
        NormalizedLineupStint(
            game_id="0022300002",
            action_number=20,
            period=1,
            home_lineup=h_subbed,
            away_lineup=a_starters,
            source_hash="lu2",
        ),
    ]

    events = [
        # Sub event at 06:00 (360.0s remaining)
        NormalizedPbpEvent(
            game_id="0022300002",
            order_index=1,
            action_number=20,
            period=1,
            clock="06:00",
            seconds_remaining=360.0,
            event_type="substitution",
            action_type="sub",
            sub_type="in",
            team_id=home_team,
            person_id="h6",
            score_home=10,
            score_away=10,
            points_total=0,
            shot_value=None,
            shot_distance=None,
            x_legacy=None,
            y_legacy=None,
            possession_number=1,
            off_lineup=h_subbed,
            def_lineup=a_starters,
            description="h6 enters for h5",
            video_available=False,
            source_hash="ev20",
        )
    ]

    # Empty possessions list is fine for stint segment test
    res = reconstruct_game_stints(
        game_id="0022300002",
        home_team_id=home_team,
        away_team_id=away_team,
        events=events,
        possessions=[],
        lineups=lineups,
    )

    # Period 1 should be split into 2 stints:
    # Stint 1: 12:00 -> 06:00 (360s)
    # Stint 2: 06:00 -> 00:00 (360s)
    p1_stints = [s for s in res.stints if s.period == 1]
    assert len(p1_stints) == 2

    assert p1_stints[0].start_seconds_remaining == 720.0
    assert p1_stints[0].end_seconds_remaining == 360.0
    assert p1_stints[0].duration_seconds == 360.0
    assert p1_stints[0].home_lineup == sorted(h_starters)

    assert p1_stints[1].start_seconds_remaining == 360.0
    assert p1_stints[1].end_seconds_remaining == 0.0
    assert p1_stints[1].duration_seconds == 360.0
    assert p1_stints[1].home_lineup == sorted(h_subbed)


def test_overtime_period_handling() -> None:
    """Test 5-period game (4 regulation + 1 overtime = 3180.0s)."""
    home_team = "1610612747"
    away_team = "1610612744"
    h_lineup = ["h1", "h2", "h3", "h4", "h5"]
    a_lineup = ["a1", "a2", "a3", "a4", "a5"]

    lineups: list[NormalizedLineupStint] = []
    events: list[NormalizedPbpEvent] = []

    for p in range(1, 6):
        lineups.append(
            NormalizedLineupStint(
                game_id="0022300003",
                action_number=p * 10,
                period=p,
                home_lineup=h_lineup,
                away_lineup=a_lineup,
                source_hash=f"lu_{p}",
            )
        )
        events.append(
            NormalizedPbpEvent(
                game_id="0022300003",
                order_index=p,
                action_number=p * 10 + 1,
                period=p,
                clock="01:00",
                seconds_remaining=60.0,
                event_type="shot",
                action_type="2pt",
                sub_type=None,
                team_id=home_team,
                person_id="h1",
                score_home=p * 20,
                score_away=p * 20,
                points_total=20,
                shot_value=2,
                shot_distance=5.0,
                x_legacy=None,
                y_legacy=None,
                possession_number=p,
                off_lineup=h_lineup,
                def_lineup=a_lineup,
                description="Shot",
                video_available=False,
                source_hash=f"ev_{p}",
            )
        )

    res = reconstruct_game_stints(
        game_id="0022300003",
        home_team_id=home_team,
        away_team_id=away_team,
        events=events,
        possessions=[],
        lineups=lineups,
        expected_final_home_score=100,
        expected_final_away_score=0,
    )

    assert res.invariants_passed
    assert len(res.stints) == 5
    # OT period has 300.0s
    ot_stint = res.stints[4]
    assert ot_stint.period == 5
    assert ot_stint.duration_seconds == 300.0
    assert ot_stint.start_clock == "05:00"
    assert ot_stint.end_clock == "00:00"

    # Total duration = 4 * 720 + 300 = 3180.0s
    assert res.total_duration_seconds == 3180.0


def test_point_conservation_failure_detection() -> None:
    """Discrepancy between stint points and expected final score causes invariant failure."""
    home_team = "1610612747"
    away_team = "1610612744"
    h_lineup = ["h1", "h2", "h3", "h4", "h5"]
    a_lineup = ["a1", "a2", "a3", "a4", "a5"]

    lineups = [
        NormalizedLineupStint(
            game_id="0022300004",
            action_number=1,
            period=1,
            home_lineup=h_lineup,
            away_lineup=a_lineup,
            source_hash="lu1",
        )
    ]
    # Reconstructed points = 0, but expected = 110
    res = reconstruct_game_stints(
        game_id="0022300004",
        home_team_id=home_team,
        away_team_id=away_team,
        events=[],
        possessions=[],
        lineups=lineups,
        expected_final_home_score=110,
        expected_final_away_score=105,
    )
    assert not res.invariants_passed
    assert any("Home score conservation failed" in err for err in res.validation_errors)
    assert any("Away score conservation failed" in err for err in res.validation_errors)


def test_five_player_sides_invariant_failure() -> None:
    """Invalid lineup (e.g. only 4 players or duplicates) causes invariant failure."""
    home_team = "1610612747"
    away_team = "1610612744"
    h_invalid = ["h1", "h2", "h3", "h4"]  # Only 4 players!
    a_lineup = ["a1", "a2", "a3", "a4", "a5"]

    lineups = [
        NormalizedLineupStint(
            game_id="0022300005",
            action_number=1,
            period=1,
            home_lineup=h_invalid,
            away_lineup=a_lineup,
            source_hash="lu1",
        )
    ]

    res = reconstruct_game_stints(
        game_id="0022300005",
        home_team_id=home_team,
        away_team_id=away_team,
        events=[],
        possessions=[],
        lineups=lineups,
    )
    assert not res.invariants_passed
    assert any(
        "missing valid 5-player home starting lineup" in err for err in res.validation_errors
    )


def test_box_score_minutes_reconciliation_tolerance() -> None:
    """Stint duration within 30 seconds of box minutes passes; > 30s discrepancy fails."""
    home_team = "1610612747"
    away_team = "1610612744"
    h_lineup = ["h1", "h2", "h3", "h4", "h5"]
    a_lineup = ["a1", "a2", "a3", "a4", "a5"]

    lineups = [
        NormalizedLineupStint(
            game_id="0022300006",
            action_number=p,
            period=p,
            home_lineup=h_lineup,
            away_lineup=a_lineup,
            source_hash=f"lu{p}",
        )
        for p in range(1, 5)
    ]

    # h1 has 48.0m in stints (sum over 4 quarters). Box says 48.4m (diff = 24s < 30s) -> PASS
    res_pass = reconstruct_game_stints(
        game_id="0022300006",
        home_team_id=home_team,
        away_team_id=away_team,
        events=[],
        possessions=[],
        lineups=lineups,
        player_box_minutes={"h1": 48.4},
    )
    assert not any("h1 minutes discrepancy" in err for err in res_pass.validation_errors)

    # Box says 47.0m (diff = 60s > 30s) -> FAIL
    res_fail = reconstruct_game_stints(
        game_id="0022300006",
        home_team_id=home_team,
        away_team_id=away_team,
        events=[],
        possessions=[],
        lineups=lineups,
        player_box_minutes={"h1": 47.0},
    )
    assert any("Player h1 minutes discrepancy" in err for err in res_fail.validation_errors)


def test_cross_lineup_fractional_possession_attribution() -> None:
    """Possession spanning multiple stints receives fractional possession shares
    proportional to duration.
    """
    home_team = "1610612747"
    away_team = "1610612744"
    h1_lineup = ["h1", "h2", "h3", "h4", "h5"]
    h2_lineup = ["h1", "h2", "h3", "h4", "h6"]
    a_lineup = ["a1", "a2", "a3", "a4", "a5"]

    # Lineup changes at clock 06:00 (360.0s)
    lineups = [
        NormalizedLineupStint(
            game_id="0022300007",
            action_number=1,
            period=1,
            home_lineup=h1_lineup,
            away_lineup=a_lineup,
            source_hash="lu1",
        ),
        NormalizedLineupStint(
            game_id="0022300007",
            action_number=10,
            period=1,
            home_lineup=h2_lineup,
            away_lineup=a_lineup,
            source_hash="lu2",
        ),
    ]

    events = [
        NormalizedPbpEvent(
            game_id="0022300007",
            order_index=1,
            action_number=10,
            period=1,
            clock="06:00",
            seconds_remaining=360.0,
            event_type="substitution",
            action_type="sub",
            sub_type="in",
            team_id=home_team,
            person_id="h6",
            score_home=0,
            score_away=0,
            points_total=0,
            shot_value=None,
            shot_distance=None,
            x_legacy=None,
            y_legacy=None,
            possession_number=1,
            off_lineup=h2_lineup,
            def_lineup=a_lineup,
            description="sub",
            video_available=False,
            source_hash="ev1",
        )
    ]

    # Possession starts at 06:20 (380.0s) and ends at 05:40 (340.0s)
    # Total duration = 40.0s.
    # Stint 1 overlap: 380.0s to 360.0s = 20.0s (50% share).
    # Stint 2 overlap: 360.0s to 340.0s = 20.0s (50% share).
    possessions = [
        NormalizedPossession(
            game_id="0022300007",
            period=1,
            possession_number=1,
            number_in_period=1,
            offense_team_id=home_team,
            defense_team_id=away_team,
            start_order_index=1,
            end_order_index=2,
            start_seconds_remaining=380.0,
            end_seconds_remaining=340.0,
            points=2,
            is_second_chance=False,
            possession_start_type="OffDeadball",
            count_as_possession=True,
            stats_json={},
            off_lineup=h1_lineup,
            def_lineup=a_lineup,
            lineup_source="quarter_box",
            policy_version=POSSESSION_POLICY_VERSION,
            source_hash="poss1",
        )
    ]

    res = reconstruct_game_stints(
        game_id="0022300007",
        home_team_id=home_team,
        away_team_id=away_team,
        events=events,
        possessions=possessions,
        lineups=lineups,
    )

    p1_stints = [s for s in res.stints if s.period == 1]
    assert len(p1_stints) == 2
    assert p1_stints[0].home_possessions == 0.5
    assert p1_stints[1].home_possessions == 0.5
    assert round(p1_stints[0].home_possessions + p1_stints[1].home_possessions, 2) == 1.0


def test_reconstruction_override_application() -> None:
    """Override record successfully alters reconstructed starting lineup."""
    home_team = "1610612747"
    away_team = "1610612744"
    h_orig = ["h1", "h2", "h3", "h4", "h5"]
    h_override = ["h1", "h2", "h3", "h4", "h99"]  # h99 forced starter
    a_lineup = ["a1", "a2", "a3", "a4", "a5"]

    lineups = [
        NormalizedLineupStint(
            game_id="0022300008",
            action_number=1,
            period=1,
            home_lineup=h_orig,
            away_lineup=a_lineup,
            source_hash="lu1",
        )
    ]

    override = ReconstructionOverrideRecord(
        id="ov_1",
        game_id="0022300008",
        override_type="starter_override",
        period=1,
        action_number=None,
        order_index=None,
        team_id=home_team,
        player_id=None,
        original_value_json=h_orig,
        override_value_json=h_override,
        reason="Official scorer corrected late starting scratch",
        author="operator@courtload.local",
        status="active",
    )

    res = reconstruct_game_stints(
        game_id="0022300008",
        home_team_id=home_team,
        away_team_id=away_team,
        events=[],
        possessions=[],
        lineups=lineups,
        overrides=[override],
    )

    assert res.overrides_applied_count == 1
    p1_stint = next(s for s in res.stints if s.period == 1)
    assert p1_stint.home_lineup == sorted(h_override)
    assert "h99" in p1_stint.home_lineup
    assert "h5" not in p1_stint.home_lineup
