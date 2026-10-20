"""Dated DARKO snapshots: opening ratings, phase boundaries and retained identity."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
from fastapi import HTTPException

from courtlens.config import Settings
from courtlens.domain.query_spec import QuerySpec, WindowSpec
from courtlens.domain.query_url import (
    deserialize_params_to_query,
    query_spec_to_research_query,
    research_query_to_query_spec,
    serialize_query_to_params,
)
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.ingestion.darko import parse_leaderboard
from courtlens.services import darko
from courtlens.workbench_models import WorkbenchArtifact

FIXTURE = Path(__file__).parents[1] / "fixtures/darko/asof-2025-05-18.json"


def test_dated_leaderboard_matches_last_game_player_history() -> None:
    # Three real rows retained from the public dated leaderboard, 2026-10-12.
    # DARKO's player/203999 season history links 2024-25 to this date and displays +6.59.
    board = parse_leaderboard(FIXTURE.read_bytes())
    assert board["season"] == "2024-25"
    assert board["as_of"] == "2025-05-18"
    assert board["data_date"] == "2025-05-18"
    jokic = board["players"]["203999"]
    assert jokic["dpm"] == 6.58564
    assert jokic["o_dpm"] + jokic["d_dpm"] == pytest.approx(jokic["dpm"], abs=1e-5)
    assert round(jokic["dpm"], 2) == 6.59


def test_season_opening_leaderboard_is_rejected() -> None:
    body = json.loads(FIXTURE.read_bytes())
    # The season-only response has no dated snapshot and must never be used by refresh.
    body["nodes"][0]["data"][0].pop("asOf")
    with pytest.raises(ValueError, match="dated"):
        parse_leaderboard(json.dumps(body).encode())


def test_store_rejects_tampering_and_retains_old_pinned_version(tmp_path: Path) -> None:
    body = {"version": darko.VERSION, "entries": []}
    old, _ = write_artifact(tmp_path, body)
    new, _ = write_artifact(tmp_path, {**body, "observed_at": "later"})
    with patch("courtlens.services.darko.get_settings", return_value=Settings(darko_manifest=new)):
        assert darko.load_darko_store(old.stem) == body
        assert darko.darko_disclosure(QuerySpec(), date(2026, 6, 14))["manifest_sha256"] == new.stem
        old.write_text("{}")
        with pytest.raises(HTTPException, match="503"):
            darko.load_darko_store(old.stem)


def test_unknown_is_not_zero_and_nonfinite_is_rejected() -> None:
    body = json.loads(FIXTURE.read_bytes())
    values = body["nodes"][0]["data"]
    index = values.index(6.58564)
    values[index] = None
    assert parse_leaderboard(json.dumps(body).encode())["players"]["203999"]["dpm"] is None
    values[index] = float("nan")
    with pytest.raises(ValueError, match="finite"):
        parse_leaderboard(json.dumps(body).encode())


def test_scope_never_borrows_playoff_or_future_ratings() -> None:
    regular = {"season": "2024-25", "phase": "regular_season", "as_of": "2025-04-13"}
    playoff = {**regular, "phase": "playoffs", "as_of": "2025-06-22"}
    query = QuerySpec(season="2024-25")
    with patch(
        "courtlens.services.darko.load_darko_store", return_value={"entries": [regular, playoff]}
    ):
        assert darko.darko_scope(query, date(2025, 4, 13)) is None
        assert darko.darko_scope(query, date(2025, 4, 14)) == regular
        assert darko.darko_scope(query, date(2025, 6, 23)) == regular
        assert (
            darko.darko_scope(query.model_copy(update={"phase": "playoffs"}), date(2025, 4, 14))
            is None
        )
        assert (
            darko.darko_scope(
                query.model_copy(update={"window": WindowSpec(kind="last_10")}), date(2025, 6, 23)
            )
            is None
        )


def test_pinned_bundle_survives_url_and_saved_query_roundtrips() -> None:
    query = QuerySpec(
        season="2024-25",
        darko_manifest_sha256="a" * 64,
        sort=[{"field": "dpm"}],
        metric_selectors=[{"key": "o_dpm"}],
    )
    restored = deserialize_params_to_query(serialize_query_to_params(query))
    assert restored.darko_manifest_sha256 == query.darko_manifest_sha256
    legacy = query_spec_to_research_query(query)
    assert legacy.to_dict()["darko_manifest_sha256"] == "a" * 64
    assert research_query_to_query_spec(legacy).darko_manifest_sha256 == "a" * 64


def test_dated_urls_support_the_bubble_but_reject_opening_urls_and_wrong_years() -> None:
    assert (
        darko.validate_darko_url(
            "darko", "https://www.darko.app/__data.json?asof=2020-10-11", "2019-20"
        )
        == 5
    )
    with pytest.raises(ValueError, match="dated"):
        darko.validate_darko_url(
            "darko", "https://www.darko.app/__data.json?season=2025", "2024-25"
        )
    with pytest.raises(ValueError, match="outside"):
        darko.validate_darko_url(
            "darko", "https://www.darko.app/__data.json?asof=2026-06-13", "2023-24"
        )


@pytest.mark.parametrize("status", [403, 429])
def test_source_refusal_stops_host_and_retains_raw_receipt(
    session, tmp_path, monkeypatch, status
) -> None:
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /\nCrawl-delay: 8\n")
        return httpx.Response(status, text="fixture refusal")

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        fetcher = darko.DarkoFetcher(session, tmp_path, client)
        first = fetcher.fetch(
            "darko", "https://www.darko.app/__data.json?asof=2025-04-13", "2024-25"
        )
        session.commit()
        second = fetcher.fetch(
            "darko", "https://www.darko.app/__data.json?asof=2025-06-22", "2024-25"
        )
    assert first.status == second.status == "failed"
    assert first.http_status == status
    assert first.metadata_json["robots_disallowed"] is True
    assert len(requests) == 2
    artifact = session.get(WorkbenchArtifact, first.artifact_id)
    assert (tmp_path / artifact.storage_path).read_bytes() == b"fixture refusal"


def test_acquisition_keeps_robots_disallow_as_metadata_and_obeys_delay(
    session, tmp_path, monkeypatch
) -> None:
    waits = []
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", waits.append)

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /\nCrawl-delay: 8\n")
        return httpx.Response(200, content=FIXTURE.read_bytes())

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        receipt = darko.DarkoFetcher(session, tmp_path, client).fetch(
            "darko", "https://www.darko.app/__data.json?asof=2025-05-18", "2024-25"
        )
    assert receipt.status == "success"
    assert receipt.metadata_json["robots_disallowed"] is True
    assert receipt.metadata_json["interval_seconds"] == 8
    assert max(waits) > 7


def test_history_refresh_carries_sealed_seasons_verbatim(tmp_path: Path) -> None:
    sealed = {"season": "2025-26", "phase": "regular_season", "as_of": "2026-04-13", "dpm": 1}
    replaced = {"season": "2000-01", "phase": "playoffs", "as_of": "2001-06-01", "dpm": 0}
    base, _ = write_artifact(tmp_path, {"version": darko.VERSION, "entries": [sealed, replaced]})
    fresh = {"season": "2000-01", "phase": "playoffs", "as_of": "2001-06-15", "dpm": 2}
    assert darko.merge_carried([fresh], base) == [fresh, sealed]
    base.write_text("{}")
    with pytest.raises(ValueError, match="changed"):
        darko.merge_carried([fresh], base)


def test_dated_leaderboard_keeps_expected_minutes() -> None:
    assert parse_leaderboard(FIXTURE.read_bytes())["players"]["203999"]["x_minutes"] == 40.9576


def test_current_refresh_replaces_only_the_seasons_current_entry(
    session, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)
    monkeypatch.setattr(
        darko, "resolve_workbench_context", lambda _session: type("C", (), {"dataset_id": "d"})()
    )
    sealed = {"season": "2024-25", "phase": "regular_season", "as_of": "2025-04-13"}
    stale = {"season": "2024-25", "phase": "current", "as_of": "2025-05-01"}
    base, _ = write_artifact(
        tmp_path / "base", {"version": darko.VERSION, "entries": [sealed, stale]}
    )

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200, content=FIXTURE.read_bytes())

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        path, result = darko.refresh_current(
            session, tmp_path / "raw", client, "2024-25", date(2025, 5, 18), tmp_path / "out", base
        )
    assert result["phase"] == "current" and result["with_minutes"] == 3
    entries = json.loads(path.read_bytes())["entries"]
    assert [(e["phase"], e["as_of"]) for e in entries] == [
        ("current", "2025-05-18"),
        ("regular_season", "2025-04-13"),
    ]
    # Stats scopes never list the projection-only entry.
    assert darko.PHASES == ("regular_season", "playoffs")


def _darko_client(requests: list[str]) -> httpx.Client:
    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.path)
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200, content=FIXTURE.read_bytes())

    return httpx.Client(transport=httpx.MockTransport(respond))


def _bundle(directory: Path, sealed_at: str, current: dict | None = None) -> Path:
    dated = {
        "season": "2024-25",
        "phase": "regular_season",
        "as_of": "2025-04-13",
        "raw_sha256": "a" * 64,
    }
    entries = [dated, *([current] if current else [])]
    path, _ = write_artifact(
        directory, {"version": darko.VERSION, "sealed_at": sealed_at, "entries": entries}
    )
    return path


def test_daily_refresh_seals_only_changed_ratings_and_serves_the_newest(
    session, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)
    monkeypatch.setattr(
        darko, "resolve_workbench_context", lambda _session: type("C", (), {"dataset_id": "d"})()
    )
    out, raw = tmp_path / "out", tmp_path / "raw"
    stale = {"season": "2024-25", "phase": "current", "as_of": "2025-05-01", "data_date": "x"}
    stale |= {"players": {}, "raw_sha256": "b" * 64}
    base = _bundle(out, "2025-05-01T00:00:00+00:00", stale)
    requests: list[str] = []
    with _darko_client(requests) as client:
        path, first = darko.refresh_daily(session, raw, client, out, date(2025, 5, 18))
        again, second = darko.refresh_daily(session, raw, client, out, date(2025, 5, 18))
    assert first["changed"] is True and path != base
    assert second["changed"] is False and again == path
    # The unchanged run kept no bytes: one retained response, from the changed run.
    assert len([f for f in raw.rglob("*") if f.is_file() and "robots" not in str(f)]) <= 2
    beat = json.loads((out / ".checked").read_text())
    assert beat["manifest_sha256"] == path.stem and beat["as_of"] == "2025-05-18"
    assert darko.last_checked(path) == beat["checked_at"]
    with patch("courtlens.services.darko.get_settings", return_value=Settings(darko_manifest=out)):
        # A directory serves its newest bundle. The base, sealed long before the window and
        # superseded, was pruned: its pin resolves to the bundle carrying its dated entries.
        assert darko.darko_path() == path
        assert not base.exists() and darko.darko_path(base.stem) == path
        current = next(e for e in darko.load_darko_store()["entries"] if e["phase"] == "current")
        assert current["as_of"] == "2025-05-18"


def test_prune_drops_only_superseded_bundles_and_aliases_their_pins(tmp_path: Path) -> None:
    from datetime import UTC, datetime

    out, raw = tmp_path / "out", tmp_path / "raw"
    old_current = {"season": "2024-25", "phase": "current", "as_of": "2025-01-01"}
    old_current |= {"data_date": "x", "players": {}, "raw_sha256": "c" * 64}
    (raw / "cc").mkdir(parents=True)
    (raw / "cc" / ("c" * 64)).write_bytes(b"old current")
    superseded = _bundle(out, "2025-01-01T00:00:00+00:00", old_current)
    history = {
        "version": darko.VERSION,
        "sealed_at": "2025-01-02T00:00:00+00:00",
        "entries": [
            {"season": "2001-02", "phase": "playoffs", "as_of": "2002-06-01", "raw_sha256": "d"}
        ],
    }
    distinct, _ = write_artifact(out, history)
    newest = _bundle(out, "2025-05-18T00:00:00+00:00")
    pruned = darko.prune(out, raw, 30, datetime(2025, 5, 18, tzinfo=UTC))
    assert pruned == {"bundles": 1, "raw": 1}
    assert not superseded.exists() and distinct.exists() and newest.exists()
    assert not (raw / "cc" / ("c" * 64)).exists()
    with patch("courtlens.services.darko.get_settings", return_value=Settings(darko_manifest=out)):
        # A saved investigation pinned to the pruned bundle reads the same dated entries.
        assert darko.darko_path(superseded.stem) == newest
        assert darko.load_darko_store(superseded.stem)["entries"][0]["as_of"] == "2025-04-13"
