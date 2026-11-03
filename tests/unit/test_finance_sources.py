"""PC06 fictional finance fixtures; no source availability claim from tests."""

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from finance_source_fixtures import (
    BREF,
    CAP,
    FA,
    THRESHOLDS,
    bref_body,
    finance_capture,
    roster_capture,
    spotrac_body,
)
from sqlalchemy import func, select

from courtlens.domain.finance_context import ThresholdInput
from courtlens.finance_context_models import FinanceRefresh
from courtlens.finance_models import FinanceRelease
from courtlens.ingestion.finance_sources import money, parse_bref, parse_spotrac, source_url
from courtlens.services.finance_import import release_rows
from courtlens.services.finance_refresh import (
    FinanceFetcher,
    admit_refresh,
    import_thresholds,
    last_checked,
    refresh_contracts,
    refresh_info,
    threshold_info,
    verify_refresh,
)
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchIdentityCrosswalk


@pytest.fixture(autouse=True)
def avoid_network_delay(monkeypatch):
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)


@pytest.mark.parametrize(
    "label,expected", [("$1,234.56", "1234.56"), ("$0", "0"), ("", None), ("—", None)]
)
def test_exact_cents_unknown_and_zero(label, expected):
    assert money(label) == expected


@pytest.mark.parametrize("label", ["$1.001", "$-2", "$1M", "$1,23", "=SUM(A1)", "NaN"])
def test_money_drift_rejects(label):
    with pytest.raises(ValueError):
        money(label)


def test_bref_comment_options_and_blank_schedule():
    rows = parse_bref(b"<!--" + bref_body() + b"-->", "2026-27", BREF)
    amounts = [r for r in rows if r["kind"] == "amount"]
    assert [r["value"] for r in amounts] == ["100.01", None, "123.45"]
    option = next(r for r in rows if r["kind"] == "option")
    assert option["option"] == "player" and option["option_state"] is None
    assert amounts[-1]["amount_kind"] == "guaranteed_value" and amounts[-1]["season"] is None


@pytest.mark.parametrize(
    "mutation",
    [
        lambda b: b.replace(b"2026-27", b"2025-26"),
        lambda b: b.replace(b"salary-pl", b"salary-pl salary-tm"),
        lambda b: b.replace(b"/players/f/fixture01.html", b"/unrecognized"),
        lambda b: b.replace(b'data-stat="y2"', b'data-stat="unknown"'),
    ],
)
def test_bref_layout_and_season_drift_rejects(mutation):
    with pytest.raises(ValueError):
        parse_bref(mutation(bref_body()), "2026-27", BREF)


def test_spotrac_independent_amounts_and_dated_fa():
    rows = parse_spotrac(spotrac_body(), "2026-27", CAP, free_agents=False)
    assert [(r["amount_kind"], r["value"]) for r in rows] == [
        ("base_salary", "999"),
        ("cap_hit", "102.02"),
        ("cash", None),
    ]
    rows = parse_spotrac(spotrac_body(True), "2026-27", FA, free_agents=True)
    assert rows[0]["free_agent_type"] == "UFA" and rows[0]["status"] == "signed"
    assert rows[0]["average_value"] is None and rows[0]["total_value"] == "999.99"
    assert rows[0]["previous_team_id"] == "1610612761" and rows[0]["new_team_id"] is None


@pytest.mark.parametrize(
    "source,url",
    [
        ("spotrac_cap", CAP.replace("2026", "2025")),
        ("bref_contracts", BREF + "?proxy=1"),
        ("bref_contracts", BREF.replace("TOR", "XXX")),
        ("spotrac_free_agents", FA + "/available"),
        ("spotrac_cap", "http://www.spotrac.com/nba/toronto-raptors/cap/_/year/2026"),
    ],
)
def test_url_drift_rejects_before_network(source, url):
    with pytest.raises(ValueError):
        source_url(source, url, "2026-27")


def test_thresholds_exact_immutable_actual_observation(session, tmp_path):
    path = tmp_path / "thresholds.json"
    path.write_text(json.dumps(THRESHOLDS))
    before = datetime.now(UTC)
    record = import_thresholds(session, path)
    session.commit()
    info = threshold_info(record)
    assert info.observed_at >= before and info.cap_cents == "16496100000"
    assert import_thresholds(session, path).id == record.id
    record.payload_json = {}
    with pytest.raises(ValueError, match="append-only"):
        session.flush()
    session.rollback()


@pytest.mark.parametrize(
    "changes",
    [
        {"cap_cents": 16496100000},
        {"tax_cents": "100"},
        {"season": "2026-28"},
        {"source_url": "https://example.com/thresholds"},
        {"observed_at": "2026-07-01"},
    ],
)
def test_threshold_wrong_source_or_invented_known_at_rejects(changes):
    with pytest.raises(ValueError):
        ThresholdInput.model_validate({**THRESHOLDS, **changes})


def test_refresh_reconciles_unknowns_precedence_and_read_only_api(session, tmp_path, api_client):
    roster = roster_capture(session, tmp_path)
    captures = [
        finance_capture(session, tmp_path),
        finance_capture(session, tmp_path, "spotrac_cap", spotrac_body()),
        finance_capture(session, tmp_path, "spotrac_free_agents", spotrac_body(True)),
    ]
    refresh = admit_refresh(session, [r.id for r in captures], roster.id, None, tmp_path, tmp_path)
    session.commit()
    info = refresh_info(session, refresh.id)
    assert info.expected_players == 2 and info.salary_observed_players == info.unknown_players == 1
    assert info.coverage[0].salary_cents == "10001" and info.coverage[0].effective_date is None
    assert info.coverage[1].salary_cents is None and info.coverage[1].unknown_reason
    assert info.coverage[0].option == "player" and info.coverage[0].option_state is None
    rows = release_rows(session, refresh.book_id)
    assert (
        sum(
            r.cents
            for _, r in rows
            if r.amount_kind == "base_salary" and r.financial_season == "2026-27"
        )
        == 10001
    )
    assert next(r for _, r in rows if r.amount_kind == "cap_hit").cents == 10202
    assert info.free_agents[0].player_id == "99001" and info.free_agents[0].effective_date is None
    assert verify_refresh(session, refresh.id, tmp_path)["status"] == "verified"
    before = session.scalar(select(func.count()).select_from(FinanceRelease))
    response = api_client.get(f"/api/workbench/operations/finance/refreshes/{refresh.id}")
    assert response.status_code == 200, response.text
    assert response.json()["coverage"][1]["salary_cents"] is None
    assert "source_bytes" not in response.text and "storage_path" not in response.text
    assert session.scalar(select(func.count()).select_from(FinanceRelease)) == before
    early = (refresh.observed_at - timedelta(seconds=1)).isoformat()
    assert (
        api_client.get(
            f"/api/workbench/operations/finance/refreshes/{refresh.id}", params={"knownAt": early}
        ).status_code
        == 422
    )
    assert (
        api_client.get(
            "/api/workbench/operations/finance/refreshes", params={"knownAt": early}
        ).json()
        == []
    )
    assert (
        api_client.get(
            "/api/workbench/operations/finance/thresholds", params={"knownAt": "2026-10-11"}
        ).status_code
        == 422
    )


def test_unknown_source_salary_is_not_zero_and_runs_append(session, tmp_path):
    roster = roster_capture(session, tmp_path)
    receipt = finance_capture(session, tmp_path, code=403)
    first = admit_refresh(session, [receipt.id], roster.id, None, tmp_path, tmp_path)
    session.commit()
    assert first.book_id is None
    info = refresh_info(session, first.id)
    assert all(
        r.salary_cents is None and r.unknown_reason == "team_salary_source_unavailable"
        for r in info.coverage
    )
    assert admit_refresh(session, [receipt.id], roster.id, None, tmp_path, tmp_path).id == first.id
    successful = finance_capture(session, tmp_path, body=bref_body("0"))
    second = admit_refresh(session, [successful.id], roster.id, None, tmp_path, tmp_path)
    session.commit()
    assert (
        second.id != first.id and refresh_info(session, second.id).coverage[0].salary_cents == "0"
    )
    assert refresh_info(session, first.id).salary_observed_players == 0
    assert session.scalar(select(func.count()).select_from(FinanceRefresh)) == 2


def test_name_does_not_map_and_later_verified_mapping_cannot_change_old_refresh(session, tmp_path):
    roster = roster_capture(session, tmp_path)
    receipt = finance_capture(session, tmp_path, body=bref_body(nba_id=False))
    first = admit_refresh(session, [receipt.id], roster.id, None, tmp_path, tmp_path)
    session.commit()
    original = refresh_info(session, first.id).model_dump()
    assert first.book_id is None
    session.add(
        WorkbenchIdentityCrosswalk(
            source_namespace="bref",
            source_id="fixture01",
            target_namespace="nba",
            target_id="99001",
            kind="player",
            confidence="verified",
            mapping_method="fictional reviewed evidence",
            evidence_json={"fixture": True},
        )
    )
    session.commit()
    assert refresh_info(session, first.id).model_dump() == original
    assert admit_refresh(session, [receipt.id], roster.id, None, tmp_path, tmp_path).id == first.id
    later = finance_capture(session, tmp_path, body=bref_body(nba_id=False))
    second = admit_refresh(session, [later.id], roster.id, None, tmp_path, tmp_path)
    session.commit()
    assert refresh_info(session, second.id).salary_observed_players == 1


def test_corrupt_raw_and_duplicate_scope_reject(session, tmp_path):
    roster = roster_capture(session, tmp_path)
    receipt = finance_capture(session, tmp_path)
    with pytest.raises(ValueError, match="unique"):
        admit_refresh(session, [receipt.id, receipt.id], roster.id, None, tmp_path, tmp_path)
    path = tmp_path / receipt.content_sha256[:2] / receipt.content_sha256
    path.write_bytes(b"corrupted")
    with pytest.raises(ValueError, match="checksum"):
        admit_refresh(session, [receipt.id], roster.id, None, tmp_path, tmp_path)


def test_finance_host_stops_all_source_kinds_on_robots_denial(session, tmp_path):
    requests = []

    def respond(request):
        requests.append(str(request.url))
        return httpx.Response(403, text="fictional denial")

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        fetcher = FinanceFetcher(session, tmp_path, client)
        first = fetcher.fetch("spotrac_cap", CAP, "2026-27")
        session.commit()
        second = fetcher.fetch("spotrac_free_agents", FA, "2026-27")
        session.commit()
    assert requests == ["https://www.spotrac.com/robots.txt"]
    assert first.status == second.status == "failed"
    assert "stopped" in second.error_summary


def test_local_observation_without_robots_does_not_claim_a_policy_change(session, tmp_path):
    session.add(
        WorkbenchAcquisition(
            source_name="bref_contracts",
            resource="finance",
            source_url=BREF,
            status="success",
            finished_at=datetime.now(UTC),
            metadata_json={"mode": "fictional local import", "season": "2026-27"},
        )
    )
    session.commit()
    assert finance_capture(session, tmp_path).status == "success"


def test_scheduled_contracts_refresh_admits_only_when_contracts_change(session, tmp_path):
    roster_capture(session, tmp_path)
    pages = {"salary": "100.01", "refuse": None}

    def respond(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        if request.url.path == pages["refuse"]:
            return httpx.Response(429)
        salary = pages["salary"] if request.url.path.endswith("/TOR.html") else "100.01"
        return httpx.Response(200, content=bref_body(salary))

    raw, staging, state = tmp_path / "raw", tmp_path / "staging", tmp_path / "state"

    def run():
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            return refresh_contracts(session, raw, client, "2026-27", staging, state)

    first = run()
    assert first["changed"] and first["pages"] == 30
    # The book's bytes live in the database; the staged copy is gone.
    assert not any((staging / "finance-refresh").iterdir())
    again = run()
    assert not again["changed"] and again["refresh_id"] == first["refresh_id"]
    assert last_checked(state, first["refresh_id"]) is not None
    unretained = session.scalars(
        select(WorkbenchAcquisition).where(
            WorkbenchAcquisition.source_name == "bref_contracts",
            WorkbenchAcquisition.artifact_id.is_(None),
        )
    ).all()
    assert len(unretained) == 30
    pages["salary"] = "200.02"
    moved = run()
    assert moved["changed"] and moved["refresh_id"] != first["refresh_id"]
    assert last_checked(state, first["refresh_id"]) is None
    salaries = {
        r.player_id: r.salary_cents for r in refresh_info(session, moved["refresh_id"]).coverage
    }
    assert salaries["99001"] == "20002"
    # One refused page ends the run: nothing admitted, the newest refresh still served.
    pages |= {"salary": "300.03", "refuse": "/contracts/MIA.html"}
    with pytest.raises(ValueError, match="no refresh admitted"):
        run()
    assert session.scalar(select(func.count()).select_from(FinanceRefresh)) == 2
