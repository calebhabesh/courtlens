"""Speed plan SP04: memos of immutable facts, and the API's warm start."""

from __future__ import annotations

import threading
from datetime import date
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from courtlens.api import warm_start
from courtlens.services import player_contracts
from courtlens.services.workbench_analytics import dataset_fingerprint
from courtlens.workbench_models import WorkbenchPlayerGame

# --- finance book memo -------------------------------------------------------------------------


@pytest.fixture
def fake_books(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """release_rows replaced by a fake that records each release it parses."""
    parsed: list[str] = []

    def release_rows(_session: Any, release_id: str) -> list[tuple[Any, Any]]:
        parsed.append(release_id)
        return [
            (None, SimpleNamespace(nba_player_id="2544", row_id=f"{release_id}-a")),
            (None, SimpleNamespace(nba_player_id="203999", row_id=f"{release_id}-b")),
            (None, SimpleNamespace(nba_player_id="2544", row_id=f"{release_id}-c")),
        ]

    monkeypatch.setattr(player_contracts, "release_rows", release_rows)
    return parsed


def ids(rows: tuple[Any, ...]) -> list[str]:
    return [row.row_id for row in rows]


def test_a_book_is_parsed_once_per_release_id(fake_books: list[str]) -> None:
    first = player_contracts.book_rows(None, "book-1")  # type: ignore[arg-type]
    second = player_contracts.book_rows(None, "book-1")  # type: ignore[arg-type]
    assert fake_books == ["book-1"]
    assert second is first
    # Grouped by player, in the release's own order.
    assert ids(first["2544"]) == ["book-1-a", "book-1-c"]
    assert ids(first["203999"]) == ["book-1-b"]


def test_releases_never_share_rows(fake_books: list[str]) -> None:
    one = player_contracts.book_rows(None, "book-1")  # type: ignore[arg-type]
    two = player_contracts.book_rows(None, "book-2")  # type: ignore[arg-type]
    assert fake_books == ["book-1", "book-2"]
    assert ids(one["2544"]) == ["book-1-a", "book-1-c"]
    assert ids(two["2544"]) == ["book-2-a", "book-2-c"]


def test_the_memo_is_bounded_least_recent_first(fake_books: list[str]) -> None:
    size = player_contracts.BOOK_MEMO_SIZE
    for index in range(size):
        player_contracts.book_rows(None, f"book-{index}")  # type: ignore[arg-type]
    player_contracts.book_rows(None, "book-0")  # type: ignore[arg-type]  # now most recent
    player_contracts.book_rows(None, "book-new")  # type: ignore[arg-type]  # evicts book-1
    assert len(player_contracts._books) == size
    assert "book-1" not in player_contracts._books and "book-0" in player_contracts._books
    fake_books.clear()
    player_contracts.book_rows(None, "book-0")  # type: ignore[arg-type]
    player_contracts.book_rows(None, "book-1")  # type: ignore[arg-type]
    assert fake_books == ["book-1"]


# --- dataset fingerprint, per transaction ------------------------------------------------------


@pytest.fixture
def counted(test_engine: Engine) -> list[str]:
    statements: list[str] = []

    def record(*args: Any) -> None:
        statements.append(args[2])

    event.listen(test_engine, "before_cursor_execute", record)
    yield statements
    event.remove(test_engine, "before_cursor_execute", record)


def fingerprint_queries(statements: list[str]) -> int:
    return sum("count(*)" in s.lower() and "workbench_player_games" in s for s in statements)


def appended_row(session: Session, dataset_id: str) -> WorkbenchPlayerGame:
    template = session.scalars(
        select(WorkbenchPlayerGame).where(WorkbenchPlayerGame.dataset_id == dataset_id).limit(1)
    ).one()
    columns = {
        attribute.key: getattr(template, attribute.key)
        for attribute in inspect(WorkbenchPlayerGame).column_attrs
        if attribute.key != "id"
    }
    columns.update(game_id="0099999999", game_date=date(2030, 1, 1))
    return WorkbenchPlayerGame(**columns)


def test_fingerprint_is_counted_once_per_read_only_transaction(
    session: Session, counted: list[str]
) -> None:
    from fixture_data import add_workbench_dataset

    dataset_id = add_workbench_dataset(session)
    session.commit()
    counted.clear()
    first = dataset_fingerprint(session, dataset_id)
    assert dataset_fingerprint(session, dataset_id) == first
    assert fingerprint_queries(counted) == 1
    # Another dataset is its own entry.
    dataset_fingerprint(session, "no-such-dataset")
    assert fingerprint_queries(counted) == 2
    # A new transaction counts again.
    session.commit()
    assert dataset_fingerprint(session, dataset_id) == first
    assert fingerprint_queries(counted) == 3


def test_a_write_in_the_transaction_drops_the_fingerprint(
    session: Session, counted: list[str]
) -> None:
    from fixture_data import add_workbench_dataset

    dataset_id = add_workbench_dataset(session)
    session.commit()
    rows, _ = dataset_fingerprint(session, dataset_id)
    session.add(appended_row(session, dataset_id))
    session.flush()  # an INSERT in the same transaction
    assert dataset_fingerprint(session, dataset_id) == (rows + 1, date(2030, 1, 1))
    # Raw SQL writes count too.
    counted.clear()
    session.execute(text("UPDATE workbench_datasets SET status = status"))
    dataset_fingerprint(session, dataset_id)
    assert fingerprint_queries(counted) == 1
    session.rollback()


# --- warm start --------------------------------------------------------------------------------


class FakeSession:
    def __enter__(self) -> FakeSession:
        return self

    def __exit__(self, *_: Any) -> None:
        return None


def test_warm_runs_every_step_and_records_a_failed_one() -> None:
    ran: list[str] = []

    def ok(_session: Any) -> None:
        ran.append("ok")

    def broken(_session: Any) -> None:
        ran.append("broken")
        raise RuntimeError("bundle missing")

    report = warm_start.warm(
        FakeSession,  # type: ignore[arg-type]
        steps=(("first", ok), ("second", broken), ("third", ok)),
    )
    assert ran == ["ok", "broken", "ok"]
    assert report["state"] == "done"
    assert report["steps"]["second"]["error"] == "RuntimeError"
    assert "error" not in report["steps"]["first"] and "error" not in report["steps"]["third"]


def test_the_default_steps_load_the_catalog_facts_finance_book_and_search_index() -> None:
    assert [name for name, _ in warm_start.STEPS] == [
        "catalog",
        "source_facts",
        "finance_book",
        "lookup_index",
    ]


def test_start_warms_in_the_background_and_reports_it(monkeypatch: pytest.MonkeyPatch) -> None:
    release = threading.Event()

    def slow_warm(_factory: Any) -> dict[str, Any]:
        release.wait(5)
        return {"state": "done", "steps": {}, "seconds": 0.0}

    monkeypatch.setattr(warm_start, "warm", slow_warm)
    state = SimpleNamespace()
    thread = warm_start.start(state, FakeSession)  # type: ignore[arg-type]
    # The API does not wait for it.
    assert state.warm_start["state"] == "running" and thread.daemon
    release.set()
    thread.join(5)
    assert state.warm_start["state"] == "done"


@pytest.mark.parametrize("enabled", [False, True])
def test_the_api_warms_at_start_only_when_configured(
    monkeypatch: pytest.MonkeyPatch, enabled: bool
) -> None:
    from courtlens.api.app import create_app
    from courtlens.config import get_settings

    monkeypatch.setenv("COURTLENS_WARM_START", "true" if enabled else "false")
    get_settings.cache_clear()
    started: list[Any] = []

    def fake_start(state: Any, _factory: Any) -> None:
        started.append(state)
        state.warm_start = {"state": "done", "steps": {}}

    monkeypatch.setattr(warm_start, "start", fake_start)
    try:
        with TestClient(create_app()) as client:
            status = client.get("/api/cache/status").json()
    finally:
        get_settings.cache_clear()
    assert len(started) == (1 if enabled else 0)
    assert ("warm_start" in status) is enabled
