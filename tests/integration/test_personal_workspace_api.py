"""Protected workspace mutations, import integrity, and reload behavior."""

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtload.config import get_settings
from courtload.domain.personal_state import calculate_bundle_checksum
from courtload.workbench_models import (
    SavedInvestigation,
    WorkbenchIdentity,
    WorkbenchPersonalWorkspace,
)


def headers() -> dict[str, str]:
    return {"X-Operator-Token": get_settings().operator_token.get_secret_value()}


def seed_players(session: Session) -> None:
    session.add_all(
        [
            WorkbenchIdentity(
                namespace="fixture", kind="player", external_id=str(i), display_name=f"Player {i}"
            )
            for i in range(1, 10)
        ]
    )
    session.commit()


def test_read_is_side_effect_free_and_writes_are_protected(
    api_client: TestClient, session: Session
) -> None:
    state = api_client.get("/api/workbench/workspace").json()
    assert state["version"] == 1
    assert session.scalar(select(func.count()).select_from(WorkbenchPersonalWorkspace)) == 0
    assert (
        api_client.put("/api/workbench/workspace?expectedVersion=1", json=state).status_code == 401
    )
    assert (
        api_client.put(
            "/api/workbench/workspace?expectedVersion=1",
            json=state,
            headers={"X-Operator-Token": "wrong"},
        ).status_code
        == 403
    )
    assert (
        api_client.put("/api/workbench/workspace", json=state, headers=headers()).status_code == 422
    )
    response = api_client.put(
        "/api/workbench/workspace?expectedVersion=1", json=state, headers=headers()
    )
    assert response.status_code == 200
    assert response.json()["version"] == 2
    assert (
        api_client.put(
            "/api/workbench/workspace?expectedVersion=1", json=state, headers=headers()
        ).status_code
        == 409
    )


def test_custom_views_defaults_reorder_and_capacity(api_client: TestClient) -> None:
    root = "/api/workbench/workspace"
    version = 1
    ids = []
    for i in range(10):
        response = api_client.post(
            f"{root}/views?expectedVersion={version}",
            headers=headers(),
            json={"name": f"View {i}", "columns": ["pts"], "is_default": i == 0},
        )
        assert response.status_code == 201, response.text
        state = response.json()
        version = state["version"]
        ids.append(state["views"][-1]["id"])
    assert state["preferences"]["default_view_id"] == ids[0]
    assert (
        api_client.post(
            f"{root}/views?expectedVersion={version}", headers=headers(), json={"name": "Eleventh"}
        ).status_code
        == 422
    )
    assert (
        api_client.post(
            f"{root}/views/reorder?expectedVersion={version}",
            headers=headers(),
            json={"ordered_view_ids": ["missing"]},
        ).status_code
        == 422
    )
    response = api_client.post(
        f"{root}/views/reorder?expectedVersion={version}",
        headers=headers(),
        json={"ordered_view_ids": ids[::-1]},
    )
    assert response.status_code == 200, response.text
    assert [v["id"] for v in response.json()["views"]] == ids[::-1]
    version = response.json()["version"]
    response = api_client.delete(
        f"{root}/views/{ids[0]}?expectedVersion={version}", headers=headers()
    )
    assert response.status_code == 200
    state = response.json()
    assert state["preferences"]["default_view_id"] == ids[-1]
    assert api_client.get(root).json() == state


def test_references_bounds_boards_and_portable_roundtrip(
    api_client: TestClient, session: Session
) -> None:
    seed_players(session)
    evidence = SavedInvestigation(
        id="retained",
        manifest_sha256="a" * 64,
        title="Retained evidence",
        query_json={"metric": "pts"},
        context_json={"release_id": "retained"},
        metric_version="v1",
        result_sha256="b" * 64,
        result_artifact_path="fixture-only.json",
    )
    session.add(evidence)
    session.commit()
    root = "/api/workbench/workspace"
    response = api_client.post(f"{root}/favorites/missing?expectedVersion=1", headers=headers())
    assert response.status_code == 422
    response = api_client.post(f"{root}/favorites/1?expectedVersion=1", headers=headers())
    assert response.status_code == 200
    state = response.json()
    version = state["version"]
    assert (
        api_client.post(f"{root}/favorites/1?expectedVersion=1", headers=headers()).status_code
        == 409
    )
    response = api_client.put(
        f"{root}/compare-tray?expectedVersion={version}",
        headers=headers(),
        json={"compare_tray": [str(i) for i in range(1, 10)]},
    )
    assert response.status_code == 422
    board = api_client.post(
        f"{root}/ranking-boards?expectedVersion={version}",
        headers=headers(),
        json={"title": "Personal", "entries": [{"rank": 1, "player_id": "1"}]},
    )
    assert board.status_code == 201
    version = board.json()["version"]
    tier = api_client.post(
        f"{root}/tier-lists?expectedVersion={version}",
        headers=headers(),
        json={"title": "Tiers", "tiers": [{"tier_id": "a", "label": "A", "player_ids": ["2"]}]},
    )
    assert tier.status_code == 201
    bundle = api_client.get(f"{root}/export").json()
    assert bundle["checksum_sha256"] == calculate_bundle_checksum(bundle)
    imported = api_client.post(
        f"{root}/import?workspaceId=restored&expectedVersion=1",
        headers=headers(),
        json={"bundle": bundle},
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["favorites"] == ["1"]
    assert imported.json()["ranking_boards"] == bundle["ranking_boards"]
    assert imported.json()["tier_lists"] == bundle["tier_lists"]
    assert api_client.get(f"{root}?workspaceId=restored").json() == imported.json()
    bundle["name"] = "Tampered"
    assert (
        api_client.post(
            f"{root}/import?expectedVersion={tier.json()['version']}",
            headers=headers(),
            json={"bundle": bundle},
        ).status_code
        == 422
    )
    assert api_client.get(root).json()["name"] != "Tampered"
    session.refresh(evidence)
    assert evidence.manifest_sha256 == "a" * 64
    assert evidence.result_sha256 == "b" * 64
    assert evidence.metric_version == "v1"
    assert evidence.query_json == {"metric": "pts"}


def test_merge_overflow_is_rejected_without_truncation(
    api_client: TestClient, session: Session
) -> None:
    seed_players(session)
    root = "/api/workbench/workspace"
    state = api_client.get(root).json()
    state["compare_tray"] = [str(i) for i in range(1, 9)]
    response = api_client.put(f"{root}?expectedVersion=1", json=state, headers=headers())
    assert response.status_code == 200
    bundle = api_client.get(f"{root}/export").json()
    bundle["compare_tray"] = ["9"]
    bundle["checksum_sha256"] = calculate_bundle_checksum(bundle)
    response = api_client.post(
        f"{root}/import?expectedVersion=2",
        headers=headers(),
        json={"bundle": bundle, "mode": "merge"},
    )
    assert response.status_code == 422
    assert api_client.get(root).json()["compare_tray"] == state["compare_tray"]


def test_reset_recovers_builtins_and_unknown_schema_fails(api_client: TestClient) -> None:
    root = "/api/workbench/workspace"
    presets = api_client.get(f"{root}/presets").json()
    assert len(presets) == 10
    assert {p["id"] for p in presets} >= {"overview", "impact", "onoff", "sixfactor"}
    response = api_client.post(
        f"{root}/views?expectedVersion=1",
        headers=headers(),
        json={
            "name": "Unavailable",
            "columns": ["future_impact"],
            "unavailable_columns": ["future_impact"],
        },
    )
    assert response.status_code == 201
    bundle = api_client.get(f"{root}/export").json()
    response = api_client.post(
        f"{root}/import?workspaceId=restored&expectedVersion=1",
        headers=headers(),
        json={"bundle": bundle},
    )
    assert response.status_code == 200
    assert response.json()["views"][0]["unavailable_columns"] == ["future_impact"]
    reset = api_client.post(f"{root}/reset?expectedVersion=2", headers=headers())
    assert reset.status_code == 200
    assert reset.json()["views"] == []
    assert reset.json()["preferences"]["default_view_id"] == "overview"
    assert (
        api_client.post(
            f"{root}/views?expectedVersion=3",
            headers=headers(),
            json={"name": "Invalid", "columns": ["pts"], "sql": "SELECT 1"},
        ).status_code
        == 422
    )
