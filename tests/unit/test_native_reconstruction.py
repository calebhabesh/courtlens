"""Independent native responses exercise reconstruction and quarantine boundaries."""

from __future__ import annotations

import copy
import importlib.util
import json
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx
import pytest

from courtload.ingestion.native_reconstruction import (
    clock_seconds,
    content_hash,
    minute_seconds,
    period_start,
    reconstruct_native_game,
)

GID = "0022500001"
SPEC = importlib.util.spec_from_file_location(
    "b19_native_spike", Path(__file__).parents[2] / "scripts/reconstruct_b19_native.py"
)
assert SPEC and SPEC.loader
spike = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(spike)


def fixtures() -> list[Any]:
    box: dict[str, Any] = {"gameId": GID, "homeTeamId": 10, "awayTeamId": 20}
    rotation = {"parameters": {"GameID": GID}, "resultSets": []}
    for side, team, pids in (("home", 10, range(1, 7)), ("away", 20, range(11, 16))):
        players = []
        ranges = []
        for pid in pids:
            seconds = 360 if pid == 1 else 2520 if pid == 6 else 2880
            name = {1: "One", 6: "Six"}.get(pid, f"Name{pid}")
            players.append(
                {
                    "personId": pid,
                    "firstName": f"First{pid}",
                    "familyName": name,
                    "nameI": f"F. {name}",
                    "position": "G" if pid != 6 else "",
                    "comment": "",
                    "statistics": {
                        "minutes": f"{seconds // 60}:{seconds % 60:02d}",
                        "points": 0,
                        "fieldGoalsMade": 0,
                        "fieldGoalsAttempted": 0,
                        "threePointersMade": 0,
                        "threePointersAttempted": 0,
                        "freeThrowsMade": 0,
                        "freeThrowsAttempted": 0,
                    },
                }
            )
            ranges.append([GID, team, pid, 3600 if pid == 6 else 0, 3600 if pid == 1 else 28800])
        box[f"{side}Team"] = {"players": players, "statistics": {"points": 0}}
        rotation["resultSets"].append(
            {
                "headers": ["GAME_ID", "TEAM_ID", "PERSON_ID", "IN_TIME_REAL", "OUT_TIME_REAL"],
                "rowSet": ranges,
            }
        )
    openings = {}
    for period in range(1, 5):
        opening = copy.deepcopy(box)
        for side in ("home", "away"):
            for player in opening[f"{side}Team"]["players"]:
                player["statistics"]["minutes"] = "0:00" if player["personId"] == 1 else "0:01"
        openings[str(period)] = {"boxScoreTraditional": opening}
    actions = []
    for period in range(1, 5):
        for clock in ("PT12M00.00S", "PT00M00.00S"):
            if period == 1 and clock == "PT00M00.00S":
                actions.append(
                    {
                        "actionId": len(actions) + 1,
                        "actionNumber": 42,
                        "period": 1,
                        "clock": "PT06M00.00S",
                        "teamId": 10,
                        "personId": 1,
                        "playerName": "One",
                        "playerNameI": "F. One",
                        "actionType": "Substitution",
                        "subType": "",
                        "description": "SUB: Six FOR One",
                        "isFieldGoal": 0,
                    }
                )
            actions.append(
                {
                    "actionId": len(actions) + 1,
                    "actionNumber": 42,
                    "period": period,
                    "clock": clock,
                    "teamId": 0,
                    "personId": 0,
                    "actionType": "period",
                    "subType": "start" if "12M" in clock else "end",
                    "isFieldGoal": 0,
                }
            )
    return [
        {"game": {"gameId": GID, "actions": actions}},
        rotation,
        {"boxScoreTraditional": box},
        openings,
        {"pbp": "a" * 64},
    ]


def reasons(result: dict[str, Any]) -> set[str]:
    return {e["reason"] for e in result["errors"]}


def test_repeated_action_numbers_preserve_every_native_identity_and_replay() -> None:
    inputs = fixtures()
    result = reconstruct_native_game(*inputs)
    assert result["reconstruction_passed"]
    assert len(result["events"]) == 9
    assert len({e["action_id"] for e in result["events"]}) == 9
    assert result == reconstruct_native_game(*copy.deepcopy(inputs))
    assert not result["database_admission"] and not result["possession_policy_admitted"]
    assert result["player_seconds"]["1"]["seconds"] == "360.00"
    assert result["player_seconds"]["6"]["seconds"] == "2520.00"
    assert sum(Decimal(s["duration"]) for s in result["stints"]) == 2880


def test_same_clock_scoring_uses_event_order_and_actual_lineup() -> None:
    inputs = fixtures()
    actions = inputs[0]["game"]["actions"]
    shot = {
        "actionNumber": 42,
        "period": 1,
        "clock": "PT06M00.00S",
        "teamId": 10,
        "personId": 1,
        "actionType": "Free Throw",
        "description": "One Free Throw Technical (1 PTS)",
        "isFieldGoal": 0,
    }
    actions.insert(1, shot)
    for index, action in enumerate(actions):
        action["actionId"] = index + 1
    player = inputs[2]["boxScoreTraditional"]["homeTeam"]["players"][0]
    player["statistics"].update(points=1, freeThrowsMade=1, freeThrowsAttempted=1)
    inputs[2]["boxScoreTraditional"]["homeTeam"]["statistics"]["points"] = 1
    result = reconstruct_native_game(*inputs)
    assert result["reconstruction_passed"]
    assert "1" in result["events"][1]["lineups_before"]["10"]
    assert "1" not in result["events"][2]["lineups_after"]["10"]
    assert result["events"][1]["stats"]["points"] == 1


@pytest.mark.parametrize(
    "case",
    [
        "duplicate_id",
        "time_inversion",
        "rotation_overlap",
        "rotation_team",
        "game_identity",
        "unknown_incoming",
    ],
)
def test_unresolved_native_identity_or_clock_refuses_reconstruction(case: str) -> None:
    inputs = fixtures()
    if case == "duplicate_id":
        inputs[0]["game"]["actions"][1]["actionId"] = 1
    elif case == "time_inversion":
        inputs[0]["game"]["actions"][2]["clock"] = "PT07M00.00S"
    elif case == "rotation_overlap":
        inputs[1]["resultSets"][0]["rowSet"].append([GID, 10, 1, 0, 100])
    elif case == "rotation_team":
        inputs[1]["resultSets"][0]["rowSet"][0][1] = 20
    elif case == "game_identity":
        inputs[2]["boxScoreTraditional"]["gameId"] = "0022500002"
    else:
        inputs[0]["game"]["actions"][1]["description"] = "SUB: Unknown FOR One"
    with pytest.raises(ValueError):
        reconstruct_native_game(*inputs)


def test_wrong_opening_boxes_quarantine_without_rewriting_observations() -> None:
    inputs = fixtures()
    opening = inputs[3]["2"]["boxScoreTraditional"]["homeTeam"]["players"]
    opening[0]["statistics"]["minutes"] = "0:01"
    opening[-1]["statistics"]["minutes"] = "0:00"
    before = copy.deepcopy(inputs)
    result = reconstruct_native_game(*inputs)
    assert reasons(result) == {"starter_evidence_disagreement"}
    assert not result["reconstruction_passed"]
    assert inputs == before


@pytest.mark.parametrize("raw", ["05:60", "", "garbage"])
def test_invalid_independent_minutes_stay_unknown(raw: str) -> None:
    inputs = fixtures()
    inputs[2]["boxScoreTraditional"]["homeTeam"]["players"][0]["statistics"]["minutes"] = raw
    result = reconstruct_native_game(*inputs)
    assert "independent_minutes_unknown" in reasons(result)
    assert "box_seconds" not in result["player_seconds"]["1"]


def test_silent_rotation_boundary_cannot_hide_inside_event_interval() -> None:
    inputs = fixtures()
    inputs[1]["resultSets"][0]["rowSet"][0][4] = 3500
    inputs[1]["resultSets"][0]["rowSet"][-1][3] = 3500
    result = reconstruct_native_game(*inputs)
    assert "rotation_lineup_disagreement" in reasons(result)


def test_changed_source_payload_changes_event_and_result_hash() -> None:
    inputs = fixtures()
    first = reconstruct_native_game(*inputs)
    inputs[0]["game"]["actions"][0]["description"] = "corrected administrative event"
    second = reconstruct_native_game(*inputs)
    assert first["events"][0]["payload_sha256"] != second["events"][0]["payload_sha256"]
    assert first["content_sha256"] != second["content_sha256"]


def test_unknown_box_count_is_not_a_zero() -> None:
    inputs = fixtures()
    inputs[2]["boxScoreTraditional"]["homeTeam"]["players"][0]["statistics"]["points"] = None
    assert "player_event_total_mismatch" in reasons(reconstruct_native_game(*inputs))


def test_scoreboard_correction_is_preserved_and_quarantines() -> None:
    inputs = fixtures()
    actions = inputs[0]["game"]["actions"]
    actions[0]["scoreHome"] = "2"
    actions[1]["scoreHome"] = "0"
    result = reconstruct_native_game(*inputs)
    assert {"scoreboard_event_disagreement", "scoreboard_decrease"} <= reasons(result)
    assert result["events"][0]["scoreboard_observations"]["10"] == 2
    assert result["events"][1]["scoreboard_observations"]["10"] == 0


def test_missing_period_endpoint_is_not_filled_from_rotation() -> None:
    inputs = fixtures()
    inputs[0]["game"]["actions"].pop()
    with pytest.raises(ValueError, match="missing native period endpoints"):
        reconstruct_native_game(*inputs)


def test_shooter_after_departure_is_not_reassigned_to_a_present_player() -> None:
    inputs = fixtures()
    action = inputs[0]["game"]["actions"][2]
    action.update(
        teamId=10, personId=1, actionType="Free Throw", description="One Free Throw 1 of 1 (1 PTS)"
    )
    result = reconstruct_native_game(*inputs)
    assert {"shooter_absent", "team_points_mismatch"} <= reasons(result)


def test_same_name_incoming_collision_is_rejected() -> None:
    inputs = fixtures()
    inputs[2]["boxScoreTraditional"]["homeTeam"]["players"][1]["familyName"] = "Six"
    with pytest.raises(ValueError, match="ambiguous substitution identity"):
        reconstruct_native_game(*inputs)


def test_exact_clocks_overtime_and_malformed_minutes() -> None:
    assert clock_seconds("PT00M42.50S") == Decimal("42.50")
    assert period_start(5) == 2880 and period_start(6) == 3180
    with pytest.raises(ValueError):
        minute_seconds("30:60")
    with pytest.raises(ValueError):
        clock_seconds("PT00M60S")


def test_replay_rejects_raw_tampering_before_writing_output(tmp_path: Path) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "data.blob").write_bytes(b"tampered")
    spike.write_json(
        raw / "manifest.json",
        {"observations": [{"path": "data.blob", "sha256": content_hash("original"), "bytes": 8}]},
    )
    output = tmp_path / "output"
    with pytest.raises(ValueError, match="checksum mismatch"):
        spike.replay(raw, output)
    assert not output.exists()


def test_acquisition_refuses_overwrite_and_preserves_failed_http_bytes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    real_client = httpx.Client
    transport = httpx.MockTransport(lambda request: httpx.Response(404, content=b"not found"))
    monkeypatch.setattr(spike.httpx, "Client", lambda **kwargs: real_client(transport=transport))
    root = tmp_path / "raw"
    spike.acquire(root, [GID])
    manifest = json.loads((root / "manifest.json").read_text())
    assert all(o["http_status"] == 404 for o in manifest["observations"])
    assert len(list(root.glob("*.blob"))) == 1
    output = tmp_path / "report"
    spike.replay(root, output)
    report = json.loads((output / "report.json").read_text())
    assert report["games"][GID]["status"] == "missing_native_inputs"
    with pytest.raises(FileExistsError):
        spike.acquire(root, [GID])
    with pytest.raises(FileExistsError):
        spike.replay(root, output)
