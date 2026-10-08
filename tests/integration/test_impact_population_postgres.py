"""Transaction-sealed IM03 warehouse admission and legacy/cutoff separation."""

from __future__ import annotations

import os
from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from courtlens.domain.impact_possessions import METHOD_VERSION, METHOD_VERSION_V2, build_impact_game
from courtlens.domain.impact_verification import GATE_VERSION, verify_event_game
from courtlens.domain.possession_repair import normalize_events, order_same_clock
from courtlens.ingestion.impact_population import read_json
from courtlens.ingestion.impact_repair_audit import retain_candidate
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.models import new_uuid
from courtlens.services.possession_warehouse import (
    build_possession_warehouse_for_season,
    get_cutoff_safe_lineup_exposure,
    get_cutoff_safe_player_exposure,
    reconstruct_game_stints_for_game,
)
from courtlens.workbench_models import (
    WorkbenchDataset,
    WorkbenchDatasetMember,
    WorkbenchLineupStint,
)

pytestmark = pytest.mark.postgres


@pytest.fixture
def database():
    url = os.getenv("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        if os.getenv("COURTLENS_REQUIRE_POSTGRES_TESTS"):
            pytest.fail("PostgreSQL is required")
        pytest.skip("No disposable PostgreSQL configured")
    engine = create_engine(url)
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.fixture
def bundle(tmp_path):
    # Actual archived game and accepted IM02 candidate, curated for offline CI.
    fixture = read_json(
        Path(__file__).resolve().parents[1] / "fixtures/impact_repair/im03-game.json.gz"
    )
    candidate = fixture["candidate"]
    game = fixture["game"]
    candidate_path = tmp_path / "candidate.json.gz"
    game_path = tmp_path / "game.json.gz"
    retain_candidate(candidate_path, candidate)
    retain_candidate(game_path, game)
    member = {
        "content_sha256": game["content_sha256"],
        "path": str(game_path),
        "candidate_sha256": candidate["content_sha256"],
        "candidate_path": str(candidate_path),
        "schedule": fixture["schedule"],
    }
    members = {game["game_id"]: member}
    result = {
        "season": "2025-26",
        "phase": "regular_season",
        "method_version": METHOD_VERSION,
        "accepted_im02_sha256": fixture["accepted_im02_sha256"],
        "archive_observed_at": "2026-10-07T22:13:25+00:00",
        "members": members,
        "membership_sha256": content_hash({game["game_id"]: game["content_sha256"]}),
        "code_sha256": {
            p: hash_file(Path(p))[0]
            for p in (
                "src/courtlens/domain/impact_possessions.py",
                "src/courtlens/ingestion/impact_population.py",
                "src/courtlens/services/possession_warehouse.py",
            )
        },
        "counts": {"stints": len(game["stints"]), "possessions": len(game["possessions"])},
        "verification_gate": {
            "points_and_shooting_conserved": True,
            "accepted_player_seconds_preserved": True,
            "all_possession_estimates_within_two": False,
        },
        "im02_summary": {"excluded_games": {}, "scheduled_games": 1},
    }
    # Different test bundles have independent identities; actual per-game bytes remain fixed.
    result["test_nonce"] = uuid4().hex
    result["content_sha256"] = content_hash(result)
    path = tmp_path / "bundle.json.gz"
    retain_candidate(path, result)
    return path


def test_real_archive_round_trip_idempotence_and_exclusive_cutoff(database, bundle):
    dataset_id = new_uuid()
    with database.begin():
        result = build_possession_warehouse_for_season(
            database, dataset_id=dataset_id, season="2025-26", impact_bundle=bundle
        )
    assert result["reused"] is False
    assert database.get(WorkbenchDataset, dataset_id).status == "candidate"
    b = read_json(bundle)
    member = next(iter(b["members"].values()))
    game = read_json(Path(member["path"]))
    assert (
        database.scalar(
            select(func.count())
            .select_from(WorkbenchDatasetMember)
            .where(WorkbenchDatasetMember.dataset_id == dataset_id)
        )
        == 1
    )
    stints = database.scalars(
        select(WorkbenchLineupStint)
        .where(WorkbenchLineupStint.dataset_id == dataset_id)
        .order_by(WorkbenchLineupStint.stint_index)
    ).all()
    assert sum(s.home_points for s in stints) == sum(s["home_points"] for s in game["stints"])
    assert [s.source_hash for s in stints] == [s["source_hash"] for s in game["stints"]]
    player = stints[0].home_lineup_json[0]
    cutoff = date.fromisoformat(member["schedule"]["game_date"])
    assert (
        get_cutoff_safe_player_exposure(
            database, dataset_id=dataset_id, player_id=player, cutoff_date=cutoff
        )["games_count"]
        == 0
    )
    assert (
        get_cutoff_safe_lineup_exposure(
            database,
            dataset_id=dataset_id,
            lineup_players=stints[0].home_lineup_json,
            cutoff_date=cutoff,
        )["games_count"]
        == 0
    )
    assert (
        get_cutoff_safe_player_exposure(
            database,
            dataset_id=dataset_id,
            player_id=player,
            cutoff_date=cutoff + timedelta(days=1),
        )["games_count"]
        == 1
    )
    assert (
        get_cutoff_safe_lineup_exposure(
            database,
            dataset_id=dataset_id,
            lineup_players=stints[0].home_lineup_json,
            cutoff_date=cutoff + timedelta(days=1),
        )["games_count"]
        == 1
    )
    database.rollback()
    with database.begin():
        replay = build_possession_warehouse_for_season(
            database, dataset_id=new_uuid(), season="2025-26", impact_bundle=bundle
        )
    assert replay["reused"] is True and replay["dataset_id"] == dataset_id
    with pytest.raises(ValueError, match="delete/rebuild"):
        build_possession_warehouse_for_season(database, dataset_id=dataset_id, season="2025-26")
    with pytest.raises(ValueError, match="delete/rebuild"):
        reconstruct_game_stints_for_game(database, dataset_id=dataset_id, game_id=game["game_id"])


def test_sealed_membership_rejects_insert_update_and_admin_bypass(database, bundle):
    dataset_id = new_uuid()
    with database.begin():
        build_possession_warehouse_for_season(
            database, dataset_id=dataset_id, season="2025-26", impact_bundle=bundle
        )
    for statement in (
        "UPDATE workbench_lineup_stints SET duration_seconds=0 WHERE dataset_id=:id",
        "DELETE FROM workbench_possessions WHERE dataset_id=:id",
        (
            "INSERT INTO workbench_dataset_members "
            "SELECT :newid,dataset_id,identity_id,version_id,observation_id "
            "FROM workbench_dataset_members WHERE dataset_id=:id"
        ),
        "TRUNCATE workbench_possessions CASCADE",
        "UPDATE workbench_datasets SET status='active' WHERE id=:id",
    ):
        with pytest.raises(DBAPIError, match="impact"), database.begin():
            database.execute(text("SET LOCAL courtlens.allow_admin_mutation='true'"))
            database.execute(text(statement), {"id": dataset_id, "newid": new_uuid()})


def test_atomic_rollback_and_tamper_before_writes(database, bundle):
    dataset_id = new_uuid()
    with pytest.raises(RuntimeError), database.begin():
        build_possession_warehouse_for_season(
            database, dataset_id=dataset_id, season="2025-26", impact_bundle=bundle
        )
        raise RuntimeError("interrupted")
    assert database.get(WorkbenchDataset, dataset_id) is None
    database.rollback()
    b = read_json(bundle)
    member = next(iter(b["members"].values()))
    game_path = Path(member["path"])
    game = read_json(game_path)
    game["stints"][0]["home_points"] += 1
    game_path.unlink()
    retain_candidate(game_path, game)
    with pytest.raises(ValueError, match="member"), database.begin():
        build_possession_warehouse_for_season(
            database, dataset_id=dataset_id, season="2025-26", impact_bundle=bundle
        )
    assert database.get(WorkbenchDataset, dataset_id) is None


@pytest.fixture
def event_bundle(bundle, tmp_path):
    fixture = read_json(
        Path(__file__).resolve().parents[1] / "fixtures/impact_repair/im03-game.json.gz"
    )
    c = fixture["candidate"]
    source = c["arbitration"]["selected"]
    events, _ = order_same_clock(
        normalize_events(
            fixture["rows"],
            source=source,
            source_sha256=c["input_sha256"][source],
            boxes=fixture["boxes"],
        ),
        c["game_id"],
    )
    rows = {int(r["_row_index"]): r for r in fixture["rows"]}
    game = build_impact_game(
        candidate=c,
        events=events,
        raw_rows=rows,
        home_team=fixture["schedule"]["home_team_id"],
        away_team=fixture["schedule"]["away_team_id"],
        team_boxes=fixture["team_boxes"],
        method_version=METHOD_VERSION_V2,
    )
    proof = {
        "source": source,
        "source_sha256": c["input_sha256"][source],
        "rows": fixture["rows"],
        "player_boxes": fixture["boxes"],
        "team_boxes": fixture["team_boxes"],
        "other_rows": [],
        "method_repairs": [],
        "public_reviews": {},
        "result": verify_event_game(
            candidate=c, events=events, raw_rows=rows, game=game, team_boxes=fixture["team_boxes"]
        ),
    }
    proof["content_sha256"] = content_hash(proof)
    proof_path = tmp_path / "event-proof.json.gz"
    retain_candidate(proof_path, proof)
    game_path = tmp_path / "v2-game.json.gz"
    retain_candidate(game_path, game)
    value = read_json(bundle)
    member = value["members"][game["game_id"]]
    member["public_possession_crosscheck"] = {"status": "unavailable"}
    member.update(
        path=str(game_path),
        content_sha256=game["content_sha256"],
        event_verification={"path": str(proof_path), "content_sha256": proof["content_sha256"]},
    )
    value["membership_sha256"] = content_hash({game["game_id"]: game["content_sha256"]})
    value["method_version"] = METHOD_VERSION_V2
    value["gate_version"] = GATE_VERSION
    value["method_contract_sha256"] = hash_file(Path("docs/design/impact-possession-method-v2.md"))[
        0
    ]
    value["gate_contract_sha256"] = hash_file(Path("docs/design/impact-event-verification-v1.md"))[
        0
    ]
    for p in (
        "src/courtlens/domain/impact_verification.py",
        "src/courtlens/domain/impact_event_repairs.py",
        "src/courtlens/domain/impact_public_verification.py",
    ):
        value["code_sha256"][p] = hash_file(Path(p))[0]
    value["verification_gate"] = {
        "points_and_shooting_conserved": True,
        "accepted_player_seconds_preserved": True,
        "all_event_boundaries_and_factors_verified": True,
        "all_available_public_sequences_reviewed": True,
    }
    value["content_sha256"] = content_hash(
        {k: v for k, v in value.items() if k != "content_sha256"}
    )
    path = tmp_path / "event-bundle.json.gz"
    retain_candidate(path, value)
    return path


def test_event_verified_real_game_admits_new_ready_version_and_replays(database, event_bundle):
    dataset_id = new_uuid()
    with database.begin():
        result = build_possession_warehouse_for_season(
            database, dataset_id=dataset_id, season="2025-26", impact_bundle=event_bundle
        )
    assert not result["reused"]
    dataset = database.get(WorkbenchDataset, dataset_id)
    assert dataset.status == "ready"
    assert dataset.manifest_json["gate_version"] == GATE_VERSION
    database.rollback()
    with database.begin():
        replay = build_possession_warehouse_for_season(
            database, dataset_id=new_uuid(), season="2025-26", impact_bundle=event_bundle
        )
    assert replay["reused"] and replay["dataset_id"] == dataset_id


def test_rehashed_false_pass_receipt_is_rejected_before_writes(database, event_bundle):
    value = read_json(event_bundle)
    member = next(iter(value["members"].values()))
    proof_path = Path(member["event_verification"]["path"])
    proof = read_json(proof_path)
    proof["result"]["expected_records"] -= 1
    proof["result"]["content_sha256"] = content_hash(
        {k: v for k, v in proof["result"].items() if k != "content_sha256"}
    )
    proof["content_sha256"] = content_hash(
        {k: v for k, v in proof.items() if k != "content_sha256"}
    )
    proof_path.unlink()
    retain_candidate(proof_path, proof)
    member["event_verification"]["content_sha256"] = proof["content_sha256"]
    value["content_sha256"] = content_hash(
        {k: v for k, v in value.items() if k != "content_sha256"}
    )
    event_bundle.unlink()
    retain_candidate(event_bundle, value)
    dataset_id = new_uuid()
    with pytest.raises(ValueError, match="does not reproduce"), database.begin():
        build_possession_warehouse_for_season(
            database, dataset_id=dataset_id, season="2025-26", impact_bundle=event_bundle
        )
    assert database.get(WorkbenchDataset, dataset_id) is None


def test_public_evidence_cannot_be_added_to_unavailable_source_before_writes(
    database, event_bundle
):
    value = read_json(event_bundle)
    member = next(iter(value["members"].values()))
    proof_path = Path(member["event_verification"]["path"])
    proof = read_json(proof_path)
    proof["public_reviews"] = {"invented": {"result": {"passed": True}}}
    proof["content_sha256"] = content_hash(
        {k: v for k, v in proof.items() if k != "content_sha256"}
    )
    proof_path.unlink()
    retain_candidate(proof_path, proof)
    member["event_verification"]["content_sha256"] = proof["content_sha256"]
    value["content_sha256"] = content_hash(
        {k: v for k, v in value.items() if k != "content_sha256"}
    )
    event_bundle.unlink()
    retain_candidate(event_bundle, value)
    dataset_id = new_uuid()
    with pytest.raises(ValueError, match="unavailable public source"), database.begin():
        build_possession_warehouse_for_season(
            database, dataset_id=dataset_id, season="2025-26", impact_bundle=event_bundle
        )
    assert database.get(WorkbenchDataset, dataset_id) is None


def test_rating_reader_verifies_ready_stints_read_only(database, event_bundle):
    from copy import deepcopy

    from courtlens.evaluation.impact_rating_inputs import verify_database

    dataset_id = new_uuid()
    with database.begin():
        build_possession_warehouse_for_season(
            database, dataset_id=dataset_id, season="2025-26", impact_bundle=event_bundle
        )
    dataset = database.get(WorkbenchDataset, dataset_id)
    identity = {
        "id": dataset.id,
        "content_sha256": dataset.content_sha256,
        "membership_sha256": dataset.membership_sha256,
        "status": dataset.status,
        "admission_transaction": dataset.admission_transaction,
    }
    bundle_body = read_json(event_bundle)
    member = next(iter(bundle_body["members"].values()))
    game = read_json(Path(member["path"]))
    bodies = [(game["game_id"], s) for s in game["stints"]]
    engine = database.get_bind()
    before = database.scalar(select(func.count()).select_from(WorkbenchLineupStint))
    database.rollback()
    verify_database(engine, identity, bodies)
    with pytest.raises(ValueError, match="identity"):
        verify_database(engine, {**identity, "status": "candidate"}, bodies)
    changed = deepcopy(bodies)
    changed[0][1]["home_points"] += 1
    with pytest.raises(ValueError, match="stint differs"):
        verify_database(engine, identity, changed)
    with pytest.raises(ValueError, match="stint differs"):
        verify_database(engine, identity, bodies[1:])
    assert database.scalar(select(func.count()).select_from(WorkbenchLineupStint)) == before
