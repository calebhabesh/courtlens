"""Execute the actual dbt model SQL over synthetic retained profiles in disposable PostgreSQL."""

from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from jinja2 import Environment, StrictUndefined
from sqlalchemy import text
from sqlalchemy.orm import Session

from courtlens.finance_context_models import FinanceThreshold
from courtlens.ingestion.bbref_players import parse_player_page
from courtlens.reference_models import BbrefPlayerProfile
from courtlens.workbench_models import WorkbenchAcquisition

pytestmark = pytest.mark.postgres
MODELS = Path("warehouse/models")


def _model(session: Session, folder: str, name: str) -> None:
    sql = (
        Environment(undefined=StrictUndefined)
        .from_string((MODELS / folder / f"{name}.sql").read_text())
        .render(
            config=lambda **kwargs: "", source=lambda schema, table: table, ref=lambda model: model
        )
    )
    session.execute(text(f"CREATE VIEW {name} AS {sql}"))


def test_reference_marts_select_newest_parse_flatten_and_keep_temporal_money_semantics(
    workbench_db: Session,
) -> None:
    session = workbench_db
    observed = datetime(2026, 10, 1, tzinfo=UTC)
    receipt = WorkbenchAcquisition(
        source_name="basketball_reference",
        resource="bbref_player_pages",
        source_url="https://www.basketball-reference.com/players/s/sample01.html",
        status="success",
    )
    session.add(receipt)
    session.flush()
    profile = parse_player_page(
        Path("tests/fixtures/bbref/player-v2.html").read_bytes(), "sample01"
    )
    profile["salary_history"].append(
        {
            "season": "2026-27",
            "team": "ABA team",
            "team_code": None,
            "league": "ABA",
            "salary": "1000000",
        }
    )
    for version, parsed, payload in [
        ("bbref-player-v1", datetime(2026, 10, 1, tzinfo=UTC), {"honours": ["Old honour"]}),
        ("bbref-player-v2", datetime(2026, 10, 2, tzinfo=UTC), profile),
    ]:
        session.add(
            BbrefPlayerProfile(
                player_id="99001",
                bbref_id="sample01",
                match_basis="fixture",
                acquisition_id=receipt.id,
                content_sha256="a" * 64,
                parser_version=version,
                profile=payload,
                observed_at=observed,
                created_at=parsed,
            )
        )
    for day, cap in [(1, "1000000000"), (2, "2000000000")]:
        session.add(
            FinanceThreshold(
                season="2026-27",
                content_sha256=str(day) * 64,
                observed_at=datetime(2026, 10, day, tzinfo=UTC),
                source_bytes=b"fixture",
                payload_json={"cap_cents": cap},
            )
        )
    session.flush()
    _model(session, "staging", "stg_bbref_player_profiles")
    for mart in ["awards", "honours", "salaries", "transactions"]:
        _model(session, "marts", f"mart_player_{mart}")
    honours = (
        session.execute(text("SELECT honour FROM mart_player_honours ORDER BY entry_number"))
        .scalars()
        .all()
    )
    assert honours == ["2x All Star", "NBA Champ"]
    awards = session.execute(
        text("SELECT season, award, vote_place, known_at FROM mart_player_awards ORDER BY award")
    ).all()
    assert [(r.season, r.award, r.vote_place) for r in awards] == [
        ("2025-26", "AS", None),
        ("2025-26", "MVP", 2),
        ("2025-26", "NBA1", None),
    ]
    assert all(r.known_at == observed for r in awards)
    salaries = (
        session.execute(text("SELECT * FROM mart_player_salaries ORDER BY record_kind, season"))
        .mappings()
        .all()
    )
    current = [r for r in salaries if r["record_kind"] == "current_contract"]
    assert current[0]["salary"] == Decimal("2000000")
    assert current[0]["share_of_cap"] == Decimal("0.1")
    assert current[0]["cap_share_known_at"] == datetime(2026, 10, 2, tzinfo=UTC)
    assert current[1]["option"] == "player" and current[1]["share_of_cap"] is None
    assert current[2]["option"] == "team" and current[2]["share_of_cap"] is None
    history = [r for r in salaries if r["record_kind"] == "salary_history"]
    assert history[0]["salary"] == Decimal("1000000") and history[0]["share_of_cap"] is None
    assert history[1]["salary"] is None
    assert history[2]["league"] == "ABA" and history[2]["share_of_cap"] is None
    events = session.execute(
        text(
            "SELECT date::text, type, from_team, to_team, known_at "
            "FROM mart_player_transactions ORDER BY entry_number"
        )
    ).all()
    assert [(r.date, r.type, r.from_team, r.to_team) for r in events] == [
        ("2026-09-14", "traded", "LAC", "TOR"),
        ("2026-09-22", "extended", None, "TOR"),
        ("2026-09-23", "recalled", None, None),
    ]
    assert all(r.known_at == observed for r in events)
