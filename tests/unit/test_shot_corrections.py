"""Correction tests use synthetic official-page observations, never invented production evidence."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from courtload.domain.rich_sources import compute_payload_hash
from courtload.domain.shotchart import parse_shot
from courtload.evaluation.shot_corrections import apply_reviewed_corrections, load_ledger
from courtload.ingestion.sportsdataverse import hash_file


def original(event: int, *, made: str = "1") -> dict[str, str]:
    return {
        "GAME_ID": "22500001",
        "GAME_EVENT_ID": str(event),
        "PLAYER_ID": "10",
        "TEAM_ID": "100",
        "PERIOD": "1",
        "MINUTES_REMAINING": "11",
        "SECONDS_REMAINING": "59",
        "EVENT_TYPE": "Made Shot" if made == "1" else "Missed Shot",
        "SHOT_TYPE": "2PT Field Goal",
        "SHOT_DISTANCE": "0",
        "LOC_X": "0",
        "LOC_Y": "0",
        "SHOT_ATTEMPTED_FLAG": "1",
        "SHOT_MADE_FLAG": made,
        "GAME_DATE": "20251021",
        "HTM": "ABC",
        "VTM": "DEF",
    }


def fixture(tmp_path: Path) -> tuple[Path, list]:
    shots = [
        parse_shot(original(1), starting_year=2025, source_line=2),
        parse_shot(original(403, made="0"), starting_year=2025, source_line=3),
    ]
    actions = [{"isFieldGoal": 0, "actionNumber": 1} for _ in range(100)]
    actions.append(
        {
            "isFieldGoal": 1,
            "actionNumber": 1,
            "actionId": 403,
            "shotResult": "Made",
            "shotValue": 2,
            "clock": "PT11M59.00S",
            "period": 1,
            "personId": 10,
            "teamId": 100,
        }
    )
    page = {
        "props": {
            "pageProps": {
                "game": {"gameId": "0022500001", "gameStatus": 3, "gameCode": "20251021/DEFABC"},
                "playByPlay": {"gameId": "0022500001", "actions": actions},
            }
        }
    }
    evidence = tmp_path / "official.html"
    evidence.write_text(
        '<script id="__NEXT_DATA__" type="application/json">' + json.dumps(page) + "</script>"
    )
    now = datetime.now(UTC)
    payload = {
        "schema_version": "courtload-shot-correction-ledger-v1",
        "archive_sha256": "a" * 64,
        "quality_contract_sha256": "b" * 64,
        "correction_contract_sha256": hash_file(Path("docs/design/shot-correction-ledger-v1.md"))[
            0
        ],
        "reviewer": "synthetic test reviewer",
        "reviewed_at": now.isoformat(),
        "entries": [
            {
                "game_id": "0022500001",
                "event_id": 403,
                "raw_fields_sha256": shots[1].raw_fields_sha256,
                "operation": "exclude_not_official_attempt",
                "review_locator": "full game",
                "reason": "synthetic missing attempt",
                "evidence": {
                    "name": evidence.name,
                    "url": "https://www.nba.com/game/def-vs-abc-0022500001/play-by-play",
                    "sha256": hash_file(evidence)[0],
                    "bytes": evidence.stat().st_size,
                    "observed_at": (now - timedelta(seconds=1)).isoformat(),
                },
            }
        ],
    }
    path = tmp_path / "ledger.json"
    path.write_text(json.dumps(payload))
    return path, shots


def test_reviewed_exclusion_uses_action_number_and_exact_full_game(tmp_path: Path) -> None:
    path, shots = fixture(tmp_path)
    ledger, official = load_ledger(path, archive_sha256="a" * 64, contract_sha256="b" * 64)
    retained, removed = apply_reviewed_corrections(shots, ledger, official["0022500001"])
    assert retained == [shots[0]] and removed == [shots[1]]
    assert shots[1].event_id == 403  # Original immutable observation remains present.
    with pytest.raises(ValueError, match="exactly one"):
        apply_reviewed_corrections([shots[0]], ledger, official["0022500001"])
    with pytest.raises(ValueError, match="exactly one"):
        apply_reviewed_corrections([*shots, shots[1]], ledger, official["0022500001"])
    changed = parse_shot(original(403, made="1"), starting_year=2025, source_line=3)
    with pytest.raises(ValueError, match="row hash"):
        apply_reviewed_corrections([shots[0], changed], ledger, official["0022500001"])
    with pytest.raises(ValueError, match="membership"):
        apply_reviewed_corrections(
            [*shots, parse_shot(original(2), starting_year=2025, source_line=4)],
            ledger,
            official["0022500001"],
        )
    official["0022500001"][1]["made"] = False
    with pytest.raises(ValueError, match="outcome/clock"):
        apply_reviewed_corrections(shots, ledger, official["0022500001"])


@pytest.mark.parametrize(
    "mutation", ["bytes", "source", "policy", "contract", "unreviewed", "duplicate", "url"]
)
def test_correction_provenance_fails_closed(tmp_path: Path, mutation: str) -> None:
    path, _ = fixture(tmp_path)
    payload = json.loads(path.read_text())
    if mutation == "bytes":
        (tmp_path / "official.html").write_text("corrupt")
    elif mutation == "source":
        payload["archive_sha256"] = "c" * 64
    elif mutation == "policy":
        payload["quality_contract_sha256"] = "c" * 64
    elif mutation == "contract":
        payload["correction_contract_sha256"] = "c" * 64
    elif mutation == "unreviewed":
        payload["reviewed_at"] = "2025-01-01T00:00:00Z"
    elif mutation == "duplicate":
        payload["entries"].append(payload["entries"][0])
    elif mutation == "url":
        payload["entries"][0]["evidence"]["url"] = (
            "https://www.nba.com/game/def-vs-abc-0022500002/play-by-play"
        )
    path.write_text(json.dumps(payload))
    with pytest.raises(ValueError):
        load_ledger(path, archive_sha256="a" * 64, contract_sha256="b" * 64)


def test_v3_supplements_exact_observations_without_model_geometry(tmp_path: Path) -> None:
    path, shots = fixture(tmp_path)
    evidence = tmp_path / "official.html"
    text = evidence.read_text()
    page = json.loads(text.split(">", 1)[1].rsplit("</script>", 1)[0])
    actions = page["props"]["pageProps"]["playByPlay"]["actions"]
    actions[-1]["clock"] = "PT11M58.00S"
    new_action = {
        **actions[-1],
        "actionNumber": 715,
        "actionId": 2,
        "shotResult": "Missed",
        "clock": "PT11M40.00S",
    }
    actions.append(new_action)
    evidence.write_text('<script id="__NEXT_DATA__">' + json.dumps(page) + "</script>")
    payload = json.loads(path.read_text())
    payload["schema_version"] = "courtload-shot-correction-ledger-v3"
    payload["correction_contract_sha256"] = hash_file(
        Path("docs/design/shot-correction-ledger-v3.md")
    )[0]
    ev = payload["entries"][0]["evidence"]
    ev["sha256"] = hash_file(evidence)[0]
    ev["bytes"] = evidence.stat().st_size
    shared = {
        "game_id": "0022500001",
        "evidence": ev,
        "review_locator": "synthetic exact action",
        "reason": "synthetic direct observation",
    }
    payload["entries"].extend(
        [
            {
                **shared,
                "event_id": 1,
                "operation": "replace_observed_clock",
                "raw_fields_sha256": shots[0].raw_fields_sha256,
                "replacement_seconds_remaining": 718,
            },
            {
                **shared,
                "event_id": 715,
                "operation": "append_official_attempt",
                "original_game_membership_sha256": compute_payload_hash(
                    [s.payload() for s in shots]
                ),
                "official_raw_action": new_action,
            },
        ]
    )
    path.write_text(json.dumps(payload))
    ledger, official = load_ledger(path, archive_sha256="a" * 64, contract_sha256="b" * 64)
    retained, originals = apply_reviewed_corrections(shots, ledger, official["0022500001"])
    assert len(originals) == 2 and len(retained) == 2
    assert retained[0].seconds_remaining == 718 and shots[0].seconds_remaining == 719
    assert retained[1].event_id == 715 and not retained[1].made
    assert retained[1].x_feet is retained[1].y_feet is retained[1].distance_feet is None
    assert retained[1].geometry_exclusions == ("official_pbp_geometry_unadmitted",)
    payload["entries"][-1]["official_raw_action"]["shotResult"] = "Made"
    path.write_text(json.dumps(payload))
    with pytest.raises(ValueError, match="exact retained official action"):
        load_ledger(path, archive_sha256="a" * 64, contract_sha256="b" * 64)
