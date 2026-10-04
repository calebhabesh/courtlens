"""Independent reconciliation and temporal controls for finance-query-v1."""

from datetime import date, timedelta
from uuid import uuid4

import pytest
from test_finance_import import NOW, bundle, identity, row

from courtload.domain.finance_query import FinanceQuery
from courtload.services.finance_import import admit_bundle, release_rows
from courtload.services.finance_query import finance_query


def query(book, **changes):
    return FinanceQuery.model_validate(
        dict(
            book_id=book.id,
            financial_season="2025-26",
            known_at=NOW,
            effective_on=date(2026, 10, 3),
            **changes,
        )
    )


def family(kind, **changes):
    defaults = dict(
        row_id=kind,
        kind=kind,
        amount_kind=None,
        currency=None,
        value=None,
        effective_date=date(2025, 7, 1),
    )
    defaults.update(changes)
    return row(**defaults)


def book(session, tmp_path, rows):
    identity(session)
    release = admit_bundle(session, bundle(tmp_path / "book", rows))
    session.commit()
    return release


def test_cents_kinds_unknown_zero_and_group_reconciliation(session, tmp_path):
    rows = []
    for index, value in enumerate(["12000000.01", "0", None]):
        contract = f"c{index}"
        rows += [
            row(
                contract_id=contract, row_id=contract, value=value, effective_date=date(2025, 7, 1)
            ),
            row(
                contract_id=contract,
                row_id=contract + "cash",
                amount_kind="cash",
                value="999999999999.99",
                effective_date=date(2025, 7, 1),
            ),
            family(
                "status",
                contract_id=contract,
                row_id=contract + "status",
                status=["signed", "unsigned", "two_way"][index],
            ),
        ]
    result = finance_query(session, query(book(session, tmp_path, rows)))
    assert result.subtotal.known_subtotal_cents == "1200000001"
    assert (result.subtotal.known_contracts, result.subtotal.unknown_contracts) == (2, 1)
    assert [c.size_group for c in result.contracts] == ["big", "small", "unknown"]
    assert sum(result.status_groups_filtered.values()) == 3
    assert result.subtotal.position_allocations_cents == {"unclassified": "1200000001"}
    assert result.subtotal.threshold_status == "threshold_status_pending"
    cash = finance_query(session, result.context.model_copy(update={"amount_kind": "cash"}))
    assert cash.subtotal.known_subtotal_cents == "299999999999997"
    filtered = finance_query(session, result.context.model_copy(update={"statuses": ("unsigned",)}))
    assert filtered.unfiltered_contract_count == 3
    assert filtered.filtered_contract_count == 1
    assert filtered.subtotal.known_subtotal_cents == "0"
    assert sum(filtered.status_groups_unfiltered.values()) == 3
    assert sum(filtered.status_groups_filtered.values()) == 1
    assert finance_query(session, result.context).result_sha256 == result.result_sha256


def test_unknown_missing_dates_and_no_annual_allocation(session, tmp_path):
    release = book(
        session,
        tmp_path,
        [
            row(amount_kind="total_value", financial_season=None, value="100.01"),
            family("contract", years=3, financial_season=None),
            family("guarantee", guarantee="partial"),
        ],
    )
    result = finance_query(session, query(release))
    assert result.contracts[0].derived_aav_usd == "33.33666666666666666666666666666666666667"
    assert result.contracts[0].known_amount_cents is None
    assert result.subtotal.known_subtotal_cents is None
    assert result.contracts[0].status == "unknown_review"
    assert result.contracts[0].amount_status == "missing"
    assert result.external_value_status == "source_blocked"


@pytest.mark.parametrize(
    "state,status",
    [
        ("unexercised", "conditional"),
        (None, "conditional"),
        ("declined", "declined"),
        ("exercised", "known"),
    ],
)
def test_options_are_not_realized_outcomes(session, tmp_path, state, status):
    release = book(
        session,
        tmp_path,
        [
            row(effective_date=date(2025, 7, 1)),
            family("option", option="player", option_state=state),
        ],
    )
    result = finance_query(session, query(release))
    assert result.contracts[0].amount_status == status
    scenario = finance_query(session, query(release, scenario="include-unexercised-options-v1"))
    assert scenario.subtotal.scenario_subtotal_cents == (None if state == "declined" else "10001")
    assert scenario.subtotal.known_subtotal_cents == result.subtotal.known_subtotal_cents
    assert scenario.result_sha256 != result.result_sha256


def test_known_at_correction_replays_original_and_inherited_source(session, tmp_path):
    first = book(
        session,
        tmp_path,
        [row(value="5", effective_date=date(2025, 7, 1)), family("guarantee", guarantee="full")],
    )
    original = next(o for o, r in release_rows(session, first.id) if r.kind == "amount")
    second = admit_bundle(
        session,
        bundle(
            tmp_path / "correction",
            [
                row(
                    value="9",
                    observed_at=NOW + timedelta(days=1),
                    effective_date=date(2025, 7, 1),
                    supersedes_id=original.id,
                    correction_reason="synthetic corrected amount",
                )
            ],
            parent_release_id=first.id,
        ),
    )
    session.commit()
    before = finance_query(session, query(second))
    assert before.subtotal.known_subtotal_cents == "500"
    original_result = finance_query(session, query(first))
    assert before.analytical_content_sha256 == original_result.analytical_content_sha256
    assert before.result_sha256 != original_result.result_sha256
    assert {o.origin_book_id for o in before.contracts[0].observations} == {first.id}
    after = finance_query(
        session, query(second).model_copy(update={"known_at": NOW + timedelta(days=2)})
    )
    assert after.subtotal.known_subtotal_cents == "900"
    assert finance_query(session, query(first)).subtotal.known_subtotal_cents == "500"
    early = finance_query(
        session, query(second).model_copy(update={"known_at": NOW - timedelta(seconds=1)})
    )
    assert early.contracts == ()
    assert early.excluded_observations["not_known_at"] == 2


def test_future_timeline_season_and_unknown_effective_gates(session, tmp_path):
    release = book(
        session,
        tmp_path,
        [
            row(),
            family("status", status="signed"),
            row(
                row_id="future",
                financial_season="2026-27",
                value="999",
                effective_date=date(2027, 7, 1),
            ),
        ],
    )
    result = finance_query(session, query(release))
    assert result.contracts[0].amount_status == "unknown_date"
    assert result.subtotal.known_subtotal_cents is None
    assert len(result.timeline) == 3
    assert any(o.temporal_label == "future_effective" for o in result.timeline)
    excluded = finance_query(session, query(release, unknown_dates="exclude"))
    assert excluded.subtotal.known_subtotal_cents is None
    assert excluded.contracts[0].amount_status == "missing"
    historical = finance_query(
        session, query(release).model_copy(update={"effective_on": date(2025, 1, 1)})
    )
    assert historical.historical_reconstruction
    assert historical.excluded_observations["future_effective"] == 1


def test_explicit_team_never_from_participation(session, tmp_path):
    release = book(
        session,
        tmp_path,
        [row(effective_date=date(2025, 7, 1)), family("association", team_id="1610612761")],
    )
    result = finance_query(session, query(release, team_id="1610612761"))
    assert result.contracts[0].team_status == "explicit"
    assert finance_query(session, query(release, team_id="1610612738")).contracts == ()


def test_conflicting_association_and_status_remain_review(session, tmp_path):
    release = book(
        session,
        tmp_path,
        [
            family("association", team_id="1610612761"),
            family("association", team_id="1610612738", financial_season=None, row_id="other"),
            family("status", status="signed"),
            family("status", status="unsigned", financial_season=None, row_id="status2"),
        ],
    )
    contract = finance_query(session, query(release)).contracts[0]
    assert contract.team_status == "conflicting"
    assert contract.team_id is None
    assert contract.status == "unknown_review"


def test_http_schema_missing_book_and_read_only(api_client, session, tmp_path):
    release = book(session, tmp_path, [row(effective_date=date(2025, 7, 1))])
    payload = query(release).model_dump(mode="json")
    url = "/api/workbench/operations/finance"
    response = api_client.post(url, json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["subtotal"]["known_subtotal_cents"] == "10001"
    assert api_client.post(url, json={**payload, "book_id": str(uuid4())}).status_code == 404
    for invalid in [
        {"known_at": "2026-10-03"},
        {"financial_season": "2025-27"},
        {"amount_kind": "total_value"},
        {"scenario": "invent-value"},
        {"team_id": "TOR"},
        {"model_value": 100},
        {"known_at": None},
    ]:
        assert api_client.post(url, json={**payload, **invalid}).status_code == 422
    assert not session.new and not session.dirty and not session.deleted
