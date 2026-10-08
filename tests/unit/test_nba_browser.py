"""IM08 immutable source diagnostics, independent of live NBA availability or model keys."""

from __future__ import annotations

import csv
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from test_impact_archive import schedule_bytes, schedule_rows

from courtlens.ingestion import nba_browser as nba
from courtlens.ingestion.workbench_normalization import canonical_hash


def scope() -> dict[str, Any]:
    return {
        "season": "2025-26",
        "phase": "regular_season",
        "game_prefix": "00225",
        "player_ids": ["1641705", "203999"],
        "game_ids": ["0022500001", "0022500002"],
        "references": {},
    }


def target(key: str = "hustle") -> dict[str, Any]:
    return next(
        t for t in nba.targets("2025-26", "regular_season", "0022500001") if t["key"] == key
    )


def table(key: str = "hustle", **changes: Any) -> bytes:
    definition = target(key)
    item: dict[str, Any] = {
        definition["identity"]: 1641705,
        "TEAM_ID": 1610612759,
        **dict.fromkeys(definition["counts"], 12),
    }
    if key.startswith("playtype"):
        item.update(PLAY_TYPE="Isolation", TYPE_GROUPING="offensive", SEASON_ID="2025-26")
    item.update(changes)
    return json.dumps(
        {
            "resultSets": [
                {
                    "name": definition["dataset"],
                    "headers": list(item),
                    "rowSet": [list(item.values())],
                }
            ]
        }
    ).encode()


def test_fixed_matrix_has_all_wave_two_families_and_offensive_categories() -> None:
    inventory = nba.targets("2025-26", "regular_season", "0022500001")
    assert len(inventory) == 18
    assert len({t["url"] for t in inventory}) == len(inventory)
    assert [t["play_type"] for t in inventory if t.get("play_type")] == list(nba.PLAY_TYPES)
    for definition in inventory:
        assert urlsplit(definition["url"]).hostname in (
            "www.nba.com",
            "stats.nba.com",
            "cdn.nba.com",
        )
        if definition["kind"] != "table":
            continue
        parameters = parse_qs(urlsplit(definition["url"]).query)
        assert parameters["PerMode"] == ["Totals"]
        assert parameters["SeasonType"] == ["Regular Season"]
        assert parameters.get("Season", parameters.get("SeasonYear")) == ["2025-26"]
    playoffs = nba.targets("2024-25", "playoffs", "0042400101")
    assert all("SeasonType=Playoffs" in t["url"] for t in playoffs if t["kind"] == "table")


@pytest.mark.parametrize(
    "season,phase,gid",
    [
        ("2025-27", "regular_season", None),
        ("2025/26", "playoffs", None),
        ("2025-26", "preseason", None),
        ("2025-26", "regular_season", "0042500101"),
        ("2025-26", "regular_season", "0022400001"),
        ("2025-26", "regular_season", "../../secrets"),
    ],
)
def test_invalid_seasons_phases_and_games_cannot_be_fetched(
    season: str, phase: str, gid: str | None
) -> None:
    with pytest.raises(ValueError):
        nba.targets(season, phase, gid)


def test_presence_coverage_retains_missing_players_and_null_counts() -> None:
    coverage = nba.inspect_payload(table(DEFLECTIONS=None, CHARGES_DRAWN=0), target(), scope())
    assert coverage["rows"] == 1
    assert coverage["expected_players"] == 2
    assert coverage["missing_players"] == ["203999"]
    assert coverage["unexpected_players"] == []
    assert coverage["null_counts"]["DEFLECTIONS"] == 1
    assert coverage["null_counts"]["CHARGES_DRAWN"] == 0
    assert coverage["game_coverage"] is None
    future_scope = {**scope(), "player_ids": None, "game_ids": None}
    assert nba.inspect_payload(table(), target(), future_scope)["expected_players"] is None
    unknown = nba.inspect_payload(table(PLAYER_ID=99), target(), scope())
    assert unknown["unexpected_players"] == ["99"]


@pytest.mark.parametrize("value", [-1, "1", True, float("inf"), float("nan"), 10**1000])
def test_invalid_counts_never_become_zero(value: Any) -> None:
    with pytest.raises(ValueError):
        nba.inspect_payload(table(DEFLECTIONS=value), target(), scope())


@pytest.mark.parametrize(
    "mutation",
    [
        "duplicate_headers",
        "missing_field",
        "duplicate_row",
        "ragged",
        "wrong_dataset",
        "bad_identity",
        "row_budget",
    ],
)
def test_malformed_tables_and_grains_are_rejected(mutation: str) -> None:
    body = json.loads(table())
    dataset = body["resultSets"][0]
    if mutation == "duplicate_headers":
        dataset["headers"][1] = dataset["headers"][0]
    elif mutation == "missing_field":
        dataset["headers"][-1] = "UNRELATED"
    elif mutation == "duplicate_row":
        dataset["rowSet"] *= 2
    elif mutation == "ragged":
        dataset["rowSet"][0].pop()
    elif mutation == "wrong_dataset":
        dataset["name"] = "Unknown"
    elif mutation == "bad_identity":
        dataset["rowSet"][0][0] = 0
    else:
        dataset["rowSet"] *= nba.MAX_ROWS + 1
    with pytest.raises(ValueError):
        nba.inspect_payload(json.dumps(body).encode(), target(), scope())


def test_distinct_team_rows_are_allowed_but_not_merged() -> None:
    body = json.loads(table())
    dataset = body["resultSets"][0]
    dataset["rowSet"].append([*dataset["rowSet"][0]])
    dataset["rowSet"][1][1] = 1610612743
    coverage = nba.inspect_payload(json.dumps(body).encode(), target(), scope())
    assert coverage["rows"] == 2
    assert coverage["observed_players"] == ["1641705"]


@pytest.mark.parametrize(
    "changes",
    [
        {"D_FGM": 4, "D_FGA": 3},
        {"D_FGA": -1},
        {"CLOSE_DEF_PERSON_ID": True},
    ],
)
def test_defense_schema_is_distinct_and_validated(changes: dict[str, Any]) -> None:
    with pytest.raises(ValueError):
        nba.inspect_payload(table("defense", **changes), target("defense"), scope())
    assert nba.inspect_payload(table("rim_defense"), target("rim_defense"), scope())["rows"] == 1


@pytest.mark.parametrize(
    "changes",
    [
        {"SEASON_ID": "2024-25"},
        {"TYPE_GROUPING": "defensive"},
        {"PLAY_TYPE": "Create"},
        {"FGM": 13, "FGA": 12},
    ],
)
def test_play_types_cannot_mix_seasons_groups_or_pbp_analogues(changes: dict[str, Any]) -> None:
    with pytest.raises(ValueError):
        nba.inspect_payload(
            table("playtype_Isolation", **changes), target("playtype_Isolation"), scope()
        )


def test_scoreboard_retains_preseason_and_does_not_certify_freshness() -> None:
    body = {
        "scoreboard": {
            "gameDate": "2026-10-08",
            "games": [
                {"gameId": "0012600001", "gameStatus": 1},
                {"gameId": "0022500001", "gameStatus": 3},
            ],
        }
    }
    coverage = nba.inspect_payload(json.dumps(body).encode(), target("scoreboard"), scope())
    assert coverage["games"][0] == {"game_id": "0012600001", "status": 1, "requested_scope": False}
    assert coverage["games"][1]["requested_scope"]
    assert coverage["slate_date"] == "2026-10-08"
    body["scoreboard"]["games"][0]["gameStatus"] = 0
    with pytest.raises(ValueError, match="status"):
        nba.inspect_payload(json.dumps(body).encode(), target("scoreboard"), scope())


def test_pbp_identity_actions_and_independent_schedule_are_not_completeness() -> None:
    body = {
        "game": {
            "gameId": "0022500001",
            "actions": [
                {"actionNumber": 2, "period": 1, "clock": "PT12M00.00S", "actionType": "jumpball"}
            ],
        }
    }
    coverage = nba.inspect_payload(json.dumps(body).encode(), target("play_by_play"), scope())
    assert coverage["independently_scheduled"] and coverage["observed_games"] == 1
    assert coverage["expected_games"] == 2
    body["game"]["actions"] *= 2
    with pytest.raises(ValueError, match="duplicate"):
        nba.inspect_payload(json.dumps(body).encode(), target("play_by_play"), scope())
    body["game"]["gameId"] = "0022500002"
    with pytest.raises(ValueError, match="mismatch"):
        nba.inspect_payload(json.dumps(body).encode(), target("play_by_play"), scope())


def test_exact_bytes_versions_and_observations_are_append_only(tmp_path: Path) -> None:
    now = datetime.now(UTC).isoformat()
    raw = b'{ "original": "spacing", "value": 1 }\n'
    first = nba.retain_bytes(tmp_path, target(), raw, now)
    second = nba.retain_bytes(tmp_path, target(), raw, now)
    third = nba.retain_bytes(tmp_path, target(), raw + b" ", now)
    assert first["content_version_id"] == second["content_version_id"]
    assert first["observation_id"] != second["observation_id"]
    assert first["content_version_id"] != third["content_version_id"]
    assert (tmp_path / first["object"]).read_bytes() == raw
    assert len(list((tmp_path / "asset-observations").glob("*.json"))) == 3
    (tmp_path / first["object"]).write_bytes(b"corrupt")
    with pytest.raises(ValueError, match="corrupt"):
        nba.retain_bytes(tmp_path, target(), raw, now)
    assert (tmp_path / first["object"]).read_bytes() == b"corrupt"


def captured(
    tmp_path: Path, status: int = 200, raw: bytes | None = None, error: str | None = None
) -> tuple[dict[str, Any], Path]:
    scratch = tmp_path / "scratch"
    scratch.mkdir()
    expected = [target()]
    if raw is not None:
        (scratch / "hustle.body").write_bytes(raw)
    capture = {
        "chromium_version": "test",
        "responses": [
            {
                "key": "hustle",
                "url": target()["url"],
                "completed_at": datetime.now(UTC).isoformat(),
                "http_status": status,
                "error": error,
                "body_file": "hustle.body" if raw is not None else None,
            }
        ],
    }
    policy = tmp_path / "policy.md"
    policy.write_text("local diagnostic only")
    report = nba.process_capture(tmp_path / "raw", capture, scratch, expected, scope(), policy)
    return report, policy


@pytest.mark.parametrize(
    "status,raw,error,technical",
    [
        (403, b"denied", None, "http_403"),
        (429, b"quota", None, "http_429"),
        (200, b"<html>challenge</html>", None, "invalid_payload"),
        (200, None, "timeout", "timeout"),
        (200, b"{}", None, "invalid_payload"),
        (200, None, "body_too_large", "body_too_large"),
        (200, table(), None, "validated_payload"),
    ],
)
def test_every_observed_outcome_stays_source_blocked(
    tmp_path: Path, status: int, raw: bytes | None, error: str | None, technical: str
) -> None:
    report, policy = captured(tmp_path, status, raw, error)
    item = report["results"][0]
    assert item["status"] == "source_blocked"
    assert item["admission_reason"] == nba.ADMISSION_REASON
    assert item["technical_status"] == technical
    path = tmp_path / "raw/observations" / f"{report['observation_id']}.json"
    assert nba.verify_receipt(tmp_path / "raw", path, policy) == report
    if technical != "validated_payload":
        assert item["coverage"] is None


def test_empty_table_and_missing_counts_are_not_ready(tmp_path: Path) -> None:
    body = json.loads(table())
    body["resultSets"][0]["rowSet"] = []
    report, _ = captured(tmp_path, raw=json.dumps(body).encode())
    assert report["results"][0]["technical_status"] == "empty_sample"
    assert report["results"][0]["coverage"]["missing_players"] == scope()["player_ids"]
    assert report["results"][0]["status"] == "source_blocked"


@pytest.mark.parametrize(
    "mutation", ["hash", "policy", "object", "coverage", "ready", "path", "url", "uuid"]
)
def test_tampered_receipts_and_objects_fail_readback(tmp_path: Path, mutation: str) -> None:
    report, policy = captured(tmp_path, raw=table())
    path = tmp_path / "raw/observations" / f"{report['observation_id']}.json"
    if mutation == "policy":
        policy.write_text("changed")
    elif mutation == "object":
        (tmp_path / "raw" / report["results"][0]["asset"]["object"]).write_bytes(b"changed")
    else:
        report.pop("content_sha256")
        if mutation == "coverage":
            report["results"][0]["coverage"]["rows"] = 99
        elif mutation == "ready":
            report["results"][0]["status"] = "ready"
        elif mutation == "path":
            report["results"][0]["asset"]["object"] = "../../secret"
        elif mutation == "url":
            report["results"][0]["url"] = "https://databallr.com/"
        elif mutation == "uuid":
            report["results"][0]["asset"]["observation_id"] = "../../secret"
        report["content_sha256"] = "bad" if mutation == "hash" else canonical_hash(report)
        path.write_text(json.dumps(report))
    with pytest.raises(ValueError):
        nba.verify_receipt(tmp_path / "raw", path, policy)


def test_independent_scope_uses_retained_schedule_and_appeared_box_bytes(tmp_path: Path) -> None:
    raw_schedule = schedule_bytes(schedule_rows(2025))
    digest = hashlib.sha256(raw_schedule).hexdigest()
    archive = tmp_path / "archive"
    path = archive / "objects" / digest[:2] / digest
    path.parent.mkdir(parents=True)
    path.write_bytes(raw_schedule)
    observation = tmp_path / "observation.json"
    observation.write_text(
        json.dumps(
            {
                "assets": [
                    {
                        "name": "nba_schedule_2026.csv.gz",
                        "sha256": digest,
                        "bytes": len(raw_schedule),
                    }
                ]
            }
        )
    )
    box_root = tmp_path / "boxes"
    directory = box_root / "sportsdataverse_2026"
    directory.mkdir(parents=True)
    box_path = directory / "players.csv"
    with box_path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["game_id", "season", "minutes", "person_id"])
        writer.writeheader()
        writer.writerows(
            [
                {"game_id": "0022500001", "season": 2026, "minutes": "12:34", "person_id": 1641705},
                {"game_id": "0022500001", "season": 2026, "minutes": "0:00", "person_id": 203999},
                {"game_id": "0042500101", "season": 2026, "minutes": "12:34", "person_id": 99},
            ]
        )
    box = box_path.read_bytes()
    (directory / "retrieval-manifest.json").write_text(
        json.dumps(
            {
                "files": {
                    "player_boxscores": {
                        "sha256": hashlib.sha256(box).hexdigest(),
                        "bytes": len(box),
                        "path": str(box_path),
                    }
                }
            }
        )
    )
    result = nba.reference_scope("2025-26", "regular_season", archive, observation, box_root)
    assert len(result["game_ids"]) == 1230
    assert result["player_ids"] == ["1641705"]
    assert result["references"]["box_sha256"] == hashlib.sha256(box).hexdigest()
    unknown = nba.reference_scope("2026-27", "regular_season", archive, observation, box_root)
    assert unknown["player_ids"] is None and unknown["game_ids"] is None
    box_path.write_bytes(b"changed")
    with pytest.raises(ValueError, match="box hash"):
        nba.reference_scope("2025-26", "regular_season", archive, observation, box_root)
