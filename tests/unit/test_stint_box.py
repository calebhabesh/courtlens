"""Stint box: event-to-stint replay, rebound sides and known zeros (docs/design/stint-box-v1.md)."""

from decimal import Decimal

import pytest

from courtlens.domain.possession_repair import RepairEvent
from courtlens.domain.stint_box import _rebound_side, event_stints, stint_player_stats

H1, H2 = ["1", "2", "3", "4", "5"], ["1", "2", "3", "4", "6"]
A = ["11", "12", "13", "14", "15"]


def event(
    i: int, seconds: str, kind: str = "shot", team: str = "H", player: str = "1"
) -> RepairEvent:
    return RepairEvent(
        source="v3",
        source_sha256="s",
        row_index=i,
        action_id=str(i),
        action_number=i,
        period=1,
        seconds=Decimal(seconds),
        kind=kind,
        team_id=team,
        player_id=player,
    )


def stint(index: int, start: float, end: float, home: list[str]) -> dict:
    return {
        "stint_index": index,
        "period": 1,
        "start_seconds_remaining": start,
        "end_seconds_remaining": end,
        "home_team_id": "H",
        "away_team_id": "A",
        "home_lineup_json": home,
        "away_lineup_json": A,
    }


def lineups(*homes: list[str]) -> dict[str, list[dict]]:
    return {"H": [{"lineup": h} for h in homes], "A": [{"lineup": A} for _ in homes]}


def test_events_follow_the_sealed_stints_in_order() -> None:
    stints = [stint(0, 720, 600, H1), stint(1, 600, 600, H2), stint(2, 600, 500, H1)]
    events = [event(0, "650"), event(1, "600"), event(2, "600"), event(3, "550")]
    # The second event at 600 belongs to the instant H2 lineup; the third returns to H1.
    found = event_stints(events, stints, lineups(H1, H2, H1, H1))
    assert found == [0, 1, 2, 2]


def test_an_event_without_a_matching_stint_fails() -> None:
    with pytest.raises(ValueError, match="no sealed stint"):
        event_stints([event(0, "650")], [stint(0, 720, 600, H1)], lineups(H2))


def test_rebound_side_prefers_source_labels_then_counters_then_the_miss() -> None:
    seen: dict[str, tuple[int, int]] = {}
    rebound = event(0, "600", "rebound")
    assert _rebound_side(rebound, {"subType": "offensive"}, seen, None) == "oreb"
    assert _rebound_side(rebound, {"description": "REBOUND (Off:0 Def:1)"}, seen, "H") == "dreb"
    assert _rebound_side(rebound, {"description": "REBOUND (Off:1 Def:1)"}, seen, None) == "oreb"
    assert _rebound_side(rebound, {"description": "REBOUND"}, seen, "H") == "oreb"
    assert _rebound_side(rebound, {"description": "REBOUND"}, seen, None) is None


def test_known_fields_fill_zero_and_unknown_fields_stay_absent() -> None:
    game = {"known_fields": {"H": ["ast", "points"]}, "stints": {"0": {"1": {"points": 2}}}}
    stats = stint_player_stats(game, 0, ["1", "2"], "H")
    assert stats == {"1": {"ast": 0, "points": 2}, "2": {"ast": 0, "points": 0}}
    assert "tov" not in stats["2"]
    assert stint_player_stats(game, 0, ["11"], "A") == {"11": {}}
