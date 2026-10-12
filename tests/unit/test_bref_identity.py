"""Owner-approved BRef name-and-team crosswalk rule; fictional fixtures, no source claim."""

import json

import pytest
from finance_source_fixtures import bref_body, finance_capture, roster_capture
from sqlalchemy import func, select

from courtlens.services.bref_identity import (
    CONFIDENCE,
    normalize_name,
    propose_mappings,
    record_mappings,
    register_index_identities,
)
from courtlens.services.finance_refresh import admit_refresh, refresh_info
from courtlens.services.player_context_ingestion import (
    PLAYER_INDEX_URL,
    admit_context,
    capture_local,
)
from courtlens.workbench_models import WorkbenchIdentity, WorkbenchIdentityCrosswalk


@pytest.fixture(autouse=True)
def avoid_network_delay(monkeypatch):
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)


def duplicate_name_roster(session, root):
    """Two fictional TOR players share one name: the rule must refuse to choose."""
    headers = [
        "PERSON_ID",
        "PLAYER_FIRST_NAME",
        "PLAYER_LAST_NAME",
        "TEAM_ID",
        "TEAM_ABBREVIATION",
        "POSITION",
        "HEIGHT",
        "WEIGHT",
        "ROSTER_STATUS",
    ]
    rows = [
        [99001, "Fictional", "Player", 1610612761, "TOR", "F", None, None, 1],
        [99003, "Fictional", "Player", 1610612761, "TOR", "G", None, None, 1],
    ]
    path = root / "dup-index.json"
    path.write_text(
        json.dumps(
            {
                "parameters": {"Season": "2026-27"},
                "resultSets": [{"name": "PlayerIndex", "headers": headers, "rowSet": rows}],
            }
        )
    )
    receipt = capture_local(session, root, path, "nba_player_index", PLAYER_INDEX_URL, "2026-27")
    session.commit()
    return admit_context(session, receipt.id, root)


@pytest.mark.parametrize(
    ("left", "right"),
    [
        ("A.J. Green", "AJ Green"),
        ("Nikola Jokić", "Nikola Jokic"),
        ("Bobby Portis", "Bobby Portis Jr."),
        ("Ernest Udeh Jr.", "Ernest Udeh, Jr."),
        ("D\u2019Angelo Russell", "D'Angelo Russell"),
        ("Tristan Da Silva", "Tristan da Silva"),
    ],
)
def test_spelling_variants_normalize_together(left, right):
    assert normalize_name(left) == normalize_name(right)


@pytest.mark.parametrize(
    ("left", "right"), [("Ron Holland", "Ronald Holland II"), ("Jalen Green", "Jalen Williams")]
)
def test_nicknames_and_different_names_do_not_match(left, right):
    assert normalize_name(left) != normalize_name(right)


def test_unique_name_and_team_maps_and_applies_only_to_later_acquisitions(session, tmp_path):
    roster = roster_capture(session, tmp_path)
    receipt = finance_capture(session, tmp_path, body=bref_body(nba_id=False))
    proposal = propose_mappings(session, [receipt.id], roster.id, tmp_path)
    assert [(m["bref_id"], m["nba_id"]) for m in proposal["mappings"]] == [("fixture01", "99001")]
    evidence = proposal["mappings"][0]["evidence"]
    assert evidence["team_id"] == "1610612761" and evidence["roster_dataset_id"] == roster.id
    assert record_mappings(session, proposal) == {"created": 1, "kept": 0, "conflicts": 0}
    assert record_mappings(session, proposal) == {"created": 0, "kept": 1, "conflicts": 0}
    row = session.scalar(select(WorkbenchIdentityCrosswalk))
    assert row.confidence == CONFIDENCE != "verified"
    session.commit()
    # The page acquired before the mapping existed is never relabeled.
    first = admit_refresh(session, [receipt.id], roster.id, None, tmp_path, tmp_path)
    session.commit()
    assert refresh_info(session, first.id).salary_observed_players == 0
    later = finance_capture(session, tmp_path, body=bref_body(nba_id=False))
    second = admit_refresh(session, [later.id], roster.id, None, tmp_path, tmp_path)
    session.commit()
    info = refresh_info(session, second.id)
    assert info.salary_observed_players == 1
    known = next(c for c in info.coverage if c.player_id == "99001")
    assert known.salary_cents == "10001"


def test_ambiguous_names_stay_unresolved(session, tmp_path):
    roster_capture(session, tmp_path)
    roster = duplicate_name_roster(session, tmp_path)
    receipt = finance_capture(session, tmp_path, body=bref_body(nba_id=False))
    proposal = propose_mappings(session, [receipt.id], roster.id, tmp_path)
    assert proposal["mappings"] == []
    assert "Several NBA index players" in proposal["unresolved"][0]["reason"]


def test_existing_conflicting_mapping_is_reported_not_overwritten(session, tmp_path):
    roster = roster_capture(session, tmp_path)
    receipt = finance_capture(session, tmp_path, body=bref_body(nba_id=False))
    session.add(
        WorkbenchIdentityCrosswalk(
            source_namespace="bref",
            source_id="fixture01",
            target_namespace="nba",
            target_id="99002",
            kind="player",
            confidence="verified",
            mapping_method="fictional reviewed evidence",
            evidence_json={"fixture": True},
        )
    )
    session.commit()
    proposal = propose_mappings(session, [receipt.id], roster.id, tmp_path)
    assert record_mappings(session, proposal) == {"created": 0, "kept": 0, "conflicts": 1}
    targets = session.scalars(select(WorkbenchIdentityCrosswalk.target_id)).all()
    assert targets == ["99002"]


def test_index_players_missing_from_registry_are_registered_with_provenance(session, tmp_path):
    roster = roster_capture(session, tmp_path)
    assert register_index_identities(session, roster.id) == {
        "active_index_players": 2,
        "registered": 1,
    }
    added = session.scalar(
        select(WorkbenchIdentity).where(WorkbenchIdentity.external_id == "99002")
    )
    assert added.metadata_json["registered_from"]["player_context_dataset_id"] == roster.id
    assert register_index_identities(session, roster.id)["registered"] == 0
    count = select(func.count()).select_from(WorkbenchIdentity)
    assert session.scalar(count) == 2
