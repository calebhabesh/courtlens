from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from courtload.demo import DEMO_WEEK_START
from courtload.models import FantasyPlayerStatusOverride, Player, PlayerGame
from courtload.services.planner import ScenarioChange, build_scenario_result, build_week_plan
from courtload.services.recent_form import recent_form


def test_week_plan_reconciles_visible_heavy_day(demo_league, session: Session) -> None:  # type: ignore[no-untyped-def]
    plan = build_week_plan(session, league=demo_league, week_start=DEMO_WEEK_START)

    first_day = plan["days"][0]
    assert first_day["scheduled_player_games"] == 6
    assert first_day["startable_player_games"] == 3
    assert first_day["lineup_conflicts"] == 3
    assert (
        sum(day["scheduled_player_games"] for day in plan["days"])
        == plan["summary"]["scheduled_player_games"]
    )
    assert (
        sum(day["startable_player_games"] for day in plan["days"])
        == plan["summary"]["startable_player_games"]
    )
    assert plan["data_snapshot"]["classification"] == "fixture"
    assert plan["week_state"] == {"acquisitions_used": 1, "acquisitions_remaining": 3}


def test_inactive_override_preserves_schedule_but_is_not_a_lineup_conflict(
    demo_league, session: Session
) -> None:  # type: ignore[no-untyped-def]
    session.add(
        FantasyPlayerStatusOverride(
            league_id=demo_league.id,
            player_key=9101,
            starts_on=DEMO_WEEK_START,
            ends_on=DEMO_WEEK_START + timedelta(days=1),
            status="out",
        )
    )
    session.commit()

    plan = build_week_plan(session, league=demo_league, week_start=DEMO_WEEK_START)

    first_day = plan["days"][0]
    assert first_day["scheduled_player_games"] == 6
    assert first_day["startable_player_games"] == 3
    assert first_day["lineup_conflicts"] == 2
    assert first_day["cells"]["9101"]["status"] == "user_marked_inactive"


def test_scenario_uses_same_snapshot_and_exposes_component_delta(
    demo_league, session: Session
) -> None:  # type: ignore[no-untyped-def]
    result = build_scenario_result(
        session,
        league=demo_league,
        week_start=DEMO_WEEK_START,
        change=ScenarioChange(
            effective_date=DEMO_WEEK_START,
            dropped_player_id=9102,
            added_player_id=9106,
            added_eligible_slots=("G",),
        ),
    )

    assert result["valid"] is True
    assert set(result["delta"]) == {
        "scheduled_player_games",
        "startable_player_games",
        "lineup_conflicts",
        "recent_fantasy_points_per_game",
    }
    assert (
        result["recent_form_comparison"]["dropped"]["calculated_as_of"]
        == result["recent_form_comparison"]["added"]["calculated_as_of"]
    )
    assert result["before"]["data_snapshot"] == result["after"]["data_snapshot"]


def test_current_game_stat_cannot_change_its_own_prior_form(demo_league, session: Session) -> None:  # type: ignore[no-untyped-def]
    cutoff = datetime(2025, 1, 29, 23, 30, tzinfo=UTC)
    before = recent_form(
        session,
        player_id=9101,
        as_of=cutoff,
        window=10,
        scoring_rules=demo_league.scoring_rules_json,
    )
    current = session.get(PlayerGame, 8003 * 100 + 1)
    assert current is not None
    current.points = 999
    session.flush()
    after = recent_form(
        session,
        player_id=9101,
        as_of=cutoff,
        window=10,
        scoring_rules=demo_league.scoring_rules_json,
    )

    assert before == after


def test_upcoming_week_uses_new_current_team_before_first_post_trade_box_score(
    demo_league, session: Session
) -> None:  # type: ignore[no-untyped-def]
    player = session.get(Player, 9101)
    assert player is not None
    player.current_team_key = 9003
    session.commit()

    upcoming = build_week_plan(
        session,
        league=demo_league,
        week_start=DEMO_WEEK_START,
        planning_as_of=datetime(2025, 2, 2, 12, tzinfo=UTC),
    )
    historical = build_week_plan(
        session,
        league=demo_league,
        week_start=DEMO_WEEK_START,
        planning_as_of=datetime(2025, 2, 10, 12, tzinfo=UTC),
    )

    assert upcoming["days"][0]["cells"]["9101"]["opponent"] == "CAP"
    assert historical["days"][0]["cells"]["9101"]["opponent"] == "HBR"
