"""PC08 Contracts views over fictional PC06 fixtures: unknown never becomes zero, reads only."""

import json

import pytest
from finance_source_fixtures import THRESHOLDS, finance_capture, roster_capture
from sqlalchemy import func, select

from courtlens.finance_models import FinanceRelease
from courtlens.services.finance_refresh import admit_refresh, import_thresholds
from courtlens.services.finance_views import _group


@pytest.fixture(autouse=True)
def avoid_network_delay(monkeypatch):
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)


def admitted(session, tmp_path):
    roster = roster_capture(session, tmp_path)
    path = tmp_path / "thresholds.json"
    path.write_text(json.dumps(THRESHOLDS))
    threshold = import_thresholds(session, path)
    session.commit()
    receipt = finance_capture(session, tmp_path)
    refresh = admit_refresh(session, [receipt.id], roster.id, threshold.id, tmp_path, tmp_path)
    session.commit()
    return refresh


def test_team_view_keeps_unknown_salary_options_and_thresholds(session, tmp_path, api_client):
    refresh = admitted(session, tmp_path)
    before = session.scalar(select(func.count()).select_from(FinanceRelease))
    url = f"/api/workbench/operations/finance/refreshes/{refresh.id}/teams/TOR"
    response = api_client.get(url)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["context"]["thresholds"]["cap_cents"] == "16496100000"
    assert body["roster_players"] == 2 and body["roster_known_players"] == 1
    assert body["roster_known_cents"] == body["source_page_known_cents"] == "10001"
    known, unknown = body["players"]
    assert known["player_id"] == "99001" and known["position_group"] == "F"
    assert known["remaining_guaranteed_cents"] == "12345"
    assert known["seasons"] == [
        {"season": "2026-27", "salary_cents": "10001", "option": "player"},
        {"season": "2027-28", "salary_cents": None, "option": None},
    ]
    # An index player missing from the source page stays unknown, never $0.
    assert unknown["player_id"] == "99002" and unknown["current_salary_cents"] is None
    assert unknown["unknown_reason"] and unknown["seasons"] == []
    assert "source_bytes" not in response.text
    assert session.scalar(select(func.count()).select_from(FinanceRelease)) == before


def test_league_view_counts_known_only_and_rejects_unknown_team(session, tmp_path, api_client):
    refresh = admitted(session, tmp_path)
    base = f"/api/workbench/operations/finance/refreshes/{refresh.id}/teams"
    body = api_client.get(base).json()
    assert len(body["teams"]) == 30
    tor = next(t for t in body["teams"] if t["team_tricode"] == "TOR")
    assert tor["source_page_known_cents"] == "10001" and tor["roster_known_players"] == 1
    assert tor["top_player_name"] == "Fictional Player"
    empty = next(t for t in body["teams"] if t["team_tricode"] == "BOS")
    assert empty["roster_players"] == 0 and empty["top_salary_cents"] is None
    assert api_client.get(f"{base}/XYZ").status_code == 422


@pytest.mark.parametrize(
    ("position", "group"),
    [("G-F", "G"), ("F-C", "F"), ("C", "C"), (None, "unlisted"), ("", "unlisted")],
)
def test_position_group_uses_first_listed_position(position, group):
    assert _group(position) == group
