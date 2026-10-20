"""Daily season statistics: hoopR box scores as release-asset rows, acquisition and retirement."""

from __future__ import annotations

import csv
import json
from datetime import date
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select

from courtlens.archive_models import ArchiveDataset
from courtlens.ingestion.hoopr_boxscores import (
    final_games,
    flatten_game,
    matchup_rows,
    playbyplay_rows,
)
from courtlens.models import new_uuid, utc_now
from courtlens.services import season_refresh
from courtlens.warehouse_models import PublishedSnapshot, ServingSnapshot, WarehouseBuild
from courtlens.workbench_models import WorkbenchDataset, WorkbenchReleaseBinding

FIXTURES = Path(__file__).parents[1] / "fixtures/hoopr"
# Real 2025-26 opener (OKC vs HOU): hoopR's document and the release assets' rows for it.
GAME = (FIXTURES / "boxscoretraditionalv3-0022500001.json").read_bytes()
REVISION = "a" * 40


def _rows(name: str) -> list[dict[str, str]]:
    return list(csv.DictReader((FIXTURES / name).open(encoding="utf-8-sig")))


def test_flattened_game_equals_the_release_assets() -> None:
    players, teams = flatten_game(GAME, "0022500001", 2026)
    assert players == _rows("player_boxscores-0022500001.csv")
    assert teams == _rows("team_boxscores-0022500001.csv")
    with pytest.raises(ValueError, match="names game"):
        flatten_game(GAME, "0022500002", 2026)
    with pytest.raises(ValueError, match="not a regular-season"):
        flatten_game(GAME, "0012500001", 2026)


def test_playbyplay_and_matchups_rebuild_the_impact_archive_rows() -> None:
    pbp = (FIXTURES / "playbyplayv3-0022500001.json").read_bytes()
    assert playbyplay_rows(pbp, "0022500001") == _rows("nbastatsv3-0022500001.csv")
    got = matchup_rows((FIXTURES / "boxscorematchupsv3-0022500001.json").read_bytes(), "0022500001")
    expected = _rows("matchups-0022500001.csv")
    # Same columns, order and pairings; the NBA revised some tracking values after the archive.
    identity = ("game_id", "team_id", "person_id", "matchups_person_id")
    assert [list(r) for r in got] == [list(r) for r in expected]
    assert [[r[k] for k in identity] for r in got] == [[r[k] for k in identity] for r in expected]
    with pytest.raises(ValueError, match="another game"):
        playbyplay_rows(pbp, "0022500002")


def _schedule(games: list[tuple[str, int, str]]) -> bytes:
    return json.dumps(
        {
            "leagueSchedule": {
                "seasonYear": "2025-26",
                "gameDates": [
                    {"games": [{"gameId": g, "gameStatus": s, "gameDateEst": f"{d}T00:00:00Z"}]}
                    for g, s, d in games
                ],
            }
        }
    ).encode()


def test_final_games_skip_preseason_unfinished_and_other_seasons() -> None:
    schedule = _schedule(
        [
            ("0012500001", 3, "2025-10-03"),
            ("0022500001", 3, "2025-10-21"),
            ("0022500002", 2, "2025-10-21"),
            ("0042500101", 3, "2026-04-18"),
        ]
    )
    assert final_games(schedule, 2026) == ["0022500001", "0042500101"]
    with pytest.raises(ValueError, match="another season"):
        final_games(schedule, 2027)


def test_acquisition_rebuilds_csvs_and_refetches_only_recent_games(
    session, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)
    schedule = _schedule([("0022500001", 3, "2025-10-21"), ("0022500002", 3, "2025-10-21")])
    requests: list[str] = []
    documents = {
        "boxscoretraditionalv3": GAME,
        "playbyplayv3": (FIXTURES / "playbyplayv3-0022500001.json").read_bytes(),
        "boxscorematchupsv3": (FIXTURES / "boxscorematchupsv3-0022500001.json").read_bytes(),
    }

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            return httpx.Response(200, json=[{"sha": REVISION}])
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        parts = request.url.path.split("/")
        requests.append("/".join(parts[-3:]))
        if request.url.path.endswith("/2026.json"):
            return httpx.Response(200, content=schedule)
        if parts[-1] == "0022500001.json":
            return httpx.Response(200, content=documents[parts[-3]])
        return httpx.Response(404)  # hoopR has not published this game yet

    raw, store = tmp_path / "raw", tmp_path / "store"

    def run(today: date) -> dict:
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            return season_refresh.acquire_season(session, raw, store, client, 2026, today)

    first = run(date(2025, 10, 22))
    assert first["changed"] and first["impact_changed"]
    assert first["games"] == dict.fromkeys(documents, 1)
    assert first["not_yet_published"] == {family: ["0022500002"] for family in documents}
    season_dir = raw / "sportsdataverse_2026"
    players = list(csv.DictReader((season_dir / "player_boxscores_2026.csv").open()))
    assert players == _rows("player_boxscores-0022500001.csv")
    # The receipt binds the box files the impact pipeline reads.
    manifest = json.loads((season_dir / "retrieval-manifest.json").read_text())
    assert set(manifest["files"]) == {"raw_schedule_json", "player_boxscores", "team_boxscores"}
    pbp = season_refresh.season_documents(store, 2026, "playbyplayv3")
    assert pbp == {"0022500001": documents["playbyplayv3"]}
    # Inside the recheck window the game is read again; identical bytes change nothing.
    requests.clear()
    again = run(date(2025, 10, 23))
    assert "boxscoretraditionalv3/2026/0022500001.json" in requests
    assert not again["changed"] and not again["impact_changed"]
    # A stat correction within the window rewrites the season's rows.
    doc = json.loads(GAME)
    doc["boxScoreTraditional"]["homeTeam"]["statistics"]["points"] = 126
    documents["boxscoretraditionalv3"] = json.dumps(doc).encode()
    corrected = run(date(2025, 10, 24))
    assert corrected["new_or_corrected"]["boxscoretraditionalv3"] == 1
    assert corrected["rewrote"] == ["team_boxscores"]
    # Past the window a retained game is not fetched again.
    requests.clear()
    run(date(2025, 11, 30))
    assert not any(r.endswith("0022500001.json") for r in requests)


def _release(session, archive: ArchiveDataset, name: str, builder: str | None) -> WorkbenchDataset:
    dataset = WorkbenchDataset(
        content_sha256=name * 64,
        membership_sha256=name * 64,
        semantic_signature=name * 64,
        source_namespace="sportsdataverse",
        parser_version="v",
        quality_version="v",
        seasons_json=[],
        phases_json=[],
        manifest_json={"builder": builder} if builder else {},
        coverage_json={},
        exclusions_json={},
    )
    session.add(dataset)
    build = WarehouseBuild(
        dataset_id=archive.id,
        candidate_schema=f"s_{name}",
        code_version="c",
        metric_version="m",
        feature_version="f",
        scoring_version="s",
    )
    session.add(build)
    session.flush()
    snapshot = ServingSnapshot(
        id=new_uuid(),
        build_id=build.id,
        dataset_id=archive.id,
        status="ready",
        mode="workbench_recent",
        source="sportsdataverse",
        coverage_start=date(2025, 10, 21),
        coverage_end=date(2025, 10, 21),
        default_replay_date=date(2025, 10, 21),
        supported_replay_dates_json=[],
        code_version="c",
        metric_version="m",
        feature_version="f",
        scoring_version="s",
        quality_report_json={},
    )
    session.add(snapshot)
    session.flush()
    session.add(
        WorkbenchReleaseBinding(
            snapshot_id=snapshot.id, semantic_signature=name * 64, dataset_id=dataset.id
        )
    )
    session.commit()
    return dataset


def test_retirement_keeps_published_newest_and_hand_built_releases(session) -> None:
    archive = ArchiveDataset(
        content_sha256="z" * 64,
        observation_sha256="z" * 64,
        source_namespace="sportsdataverse",
        parser_version="v",
        manifest_json={},
        status="accepted",
    )
    session.add(archive)
    session.flush()
    hand = _release(session, archive, "h", None)
    oldest = _release(session, archive, "1", season_refresh.BUILDER)
    retired = _release(session, archive, "2", season_refresh.BUILDER)
    newer = [_release(session, archive, n, season_refresh.BUILDER) for n in ("3", "4")]
    # The public pointer was rolled back to the oldest daily release: it is kept.
    published = session.scalar(
        select(WorkbenchReleaseBinding.snapshot_id).where(
            WorkbenchReleaseBinding.dataset_id == oldest.id
        )
    )
    session.add(PublishedSnapshot(channel="public", snapshot_id=published, published_at=utc_now()))
    session.commit()
    assert season_refresh.retire_releases(session, keep=2) == [retired.id]
    left = set(session.scalars(select(WorkbenchDataset.id)))
    assert left == {hand.id, oldest.id, *(d.id for d in newer)}
    assert (
        session.scalar(
            select(WorkbenchReleaseBinding).where(WorkbenchReleaseBinding.dataset_id == retired.id)
        )
        is None
    )


def test_retiring_one_release_refuses_published_and_impact(session) -> None:
    archive = ArchiveDataset(
        content_sha256="y" * 64,
        observation_sha256="y" * 64,
        source_namespace="sportsdataverse",
        parser_version="v",
        manifest_json={},
        status="accepted",
    )
    session.add(archive)
    session.flush()
    old, live = _release(session, archive, "o", None), _release(session, archive, "l", None)
    snapshot = session.scalar(
        select(WorkbenchReleaseBinding.snapshot_id).where(
            WorkbenchReleaseBinding.dataset_id == live.id
        )
    )
    session.add(PublishedSnapshot(channel="public", snapshot_id=snapshot, published_at=utc_now()))
    session.commit()
    with pytest.raises(ValueError, match="published"):
        season_refresh.retire_dataset(session, live.id)
    season_refresh.retire_dataset(session, old.id)
    assert session.get(WorkbenchDataset, old.id) is None
