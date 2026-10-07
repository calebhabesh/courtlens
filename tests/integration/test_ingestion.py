from __future__ import annotations

import json
from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtlens.demo import fixture_documents
from courtlens.ingestion.client import FetchedPage
from courtlens.ingestion.errors import ProviderSchemaError
from courtlens.ingestion.loader import IngestionService
from courtlens.ingestion.raw_store import RawStore
from courtlens.models import Game, IngestionRun, PlayerGame, RawObject


def test_fixture_load_is_idempotent_and_keeps_raw_lineage(session: Session, tmp_path) -> None:  # type: ignore[no-untyped-def]
    paths = []
    for index, document in enumerate(fixture_documents()):
        path = tmp_path / f"{index}.json"
        path.write_text(json.dumps(document), encoding="utf-8")
        paths.append(path)
    service = IngestionService(session, RawStore(tmp_path / "raw"))

    first = service.load_fixture_pages(paths)
    raw_count = session.scalar(select(func.count()).select_from(RawObject))
    second = service.load_fixture_pages(paths)

    assert first.inserted_count > 0
    assert second.inserted_count == 0
    assert second.updated_count == 0
    assert second.unchanged_count == second.received_count
    assert session.scalar(select(func.count()).select_from(RawObject)) == raw_count
    assert session.scalar(select(func.count()).select_from(Game)) == 14
    assert session.scalar(select(func.count()).select_from(PlayerGame)) == 24


def test_legitimate_game_correction_creates_raw_version_without_duplicate(
    session: Session, tmp_path
) -> None:  # type: ignore[no-untyped-def]
    documents = fixture_documents()
    initial_paths = []
    for index, document in enumerate(documents):
        path = tmp_path / f"initial-{index}.json"
        path.write_text(json.dumps(document), encoding="utf-8")
        initial_paths.append(path)
    service = IngestionService(session, RawStore(tmp_path / "raw"))
    service.load_fixture_pages(initial_paths)
    raw_before = session.scalar(select(func.count()).select_from(RawObject))

    games_document = next(document for document in documents if document["resource"] == "games")
    corrected = json.loads(json.dumps(games_document))
    corrected_game = next(game for game in corrected["data"] if game["id"] == 8001)
    corrected_game["home_team_score"] = 112
    correction_path = tmp_path / "corrected-games.json"
    correction_path.write_text(json.dumps(corrected), encoding="utf-8")

    correction_run = service.load_fixture_pages([correction_path])

    assert correction_run.updated_count == 1
    assert session.scalar(select(func.count()).select_from(Game)) == 14
    assert session.scalar(select(func.count()).select_from(RawObject)) == raw_before + 1
    game = session.get(Game, 8001)
    assert game is not None
    assert game.home_score == 112


def test_reported_zero_minutes_is_distinct_from_an_absent_stat_row(
    session: Session, tmp_path
) -> None:  # type: ignore[no-untyped-def]
    documents = json.loads(json.dumps(fixture_documents()))
    stats_document = next(document for document in documents if document["resource"] == "stats")
    omitted_stat_id = 8001 * 100 + 1
    zero_minute_stat_id = 8001 * 100 + 2
    stats_document["data"] = [row for row in stats_document["data"] if row["id"] != omitted_stat_id]
    zero_minute_row = next(
        row for row in stats_document["data"] if row["id"] == zero_minute_stat_id
    )
    zero_minute_row["min"] = "0"
    paths = []
    for index, document in enumerate(documents):
        path = tmp_path / f"edge-{index}.json"
        path.write_text(json.dumps(document), encoding="utf-8")
        paths.append(path)

    IngestionService(session, RawStore(tmp_path / "raw")).load_fixture_pages(paths)

    assert session.get(PlayerGame, omitted_stat_id) is None
    zero_minutes = session.get(PlayerGame, zero_minute_stat_id)
    assert zero_minutes is not None
    assert zero_minutes.minutes == 0
    assert zero_minutes.appearance_status == "reported_zero_minutes"


def test_failed_stats_page_keeps_committed_schedule_and_marks_run_failed(
    session: Session, tmp_path
) -> None:  # type: ignore[no-untyped-def]
    documents = {document["resource"]: document for document in fixture_documents()}

    class InvalidStatsClient:
        def teams(self):  # type: ignore[no-untyped-def]
            yield FetchedPage(
                "teams", {"data": documents["teams"]["data"], "meta": {}}, 200, "fixture://teams"
            )

        def games(self, *, start: date, end: date):  # type: ignore[no-untyped-def]
            del start, end
            yield FetchedPage(
                "games", {"data": documents["games"]["data"], "meta": {}}, 200, "fixture://games"
            )

        def stats_for_games(self, game_ids):  # type: ignore[no-untyped-def]
            del game_ids
            yield FetchedPage(
                "stats", {"data": [{"id": "invalid"}], "meta": {}}, 200, "fixture://stats"
            )

    service = IngestionService(session, RawStore(tmp_path / "raw"))
    with pytest.raises(ProviderSchemaError, match="invalid stats rows"):
        service.ingest(
            InvalidStatsClient(),  # type: ignore[arg-type]
            start=date(2025, 1, 1),
            end=date(2025, 2, 10),
            include_stats=True,
        )

    failed_run = session.scalar(
        select(IngestionRun).order_by(IngestionRun.started_at.desc()).limit(1)
    )
    assert failed_run is not None
    assert failed_run.status == "failed"
    assert "ProviderSchemaError" in (failed_run.error_summary or "")
    assert session.scalar(select(func.count()).select_from(Game)) == 14
