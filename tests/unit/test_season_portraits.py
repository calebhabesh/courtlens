import struct
from datetime import date
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.services import portrait_derivatives
from courtlens.services.season_portraits import (
    SEASON_PORTRAIT_SOURCE,
    SeasonPortraitTarget,
    acquire_season_portraits,
    fetch_season_portrait,
    find_season_portrait,
    season_portrait_targets,
)
from courtlens.workbench_models import PlayerPortrait, PlayerSeasonPortrait, WorkbenchPlayerGame

LAL, CLE = "1610612747", "1610612739"


def _png(seed: int) -> bytes:
    """A minimal PNG header with the CDN's 1040x760 dimensions; ``seed`` varies the hash."""
    header = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR"
    return header + struct.pack(">II", 1040, 760) + bytes([seed]) * 9


def _game(player: str, team: str, season: str, game: str) -> WorkbenchPlayerGame:
    return WorkbenchPlayerGame(
        dataset_id="d", game_id=game, player_id=player, team_id=team, opponent_id="BOS",
        game_date=date(int(season[:4]), 11, 1), season=season, phase="regular_season",
        appearance="played", minutes_original="30:00", stats_json={},
        source_version_id="v", source_observation_id="o",
    )  # fmt: skip


def _cdn(photos: dict[str, bytes], requests: list[str]) -> httpx.Client:
    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.path)
        if request.url.path in photos:
            return httpx.Response(
                200, content=photos[request.url.path], headers={"content-type": "image/png"}
            )
        # The CDN's miss: a small XML Access Denied document.
        return httpx.Response(403, content=b"<Error>AccessDenied</Error>")

    return httpx.Client(transport=httpx.MockTransport(handle))


def test_targets_are_observed_stints_from_2015_16_resolved_to_nba_team_ids(
    session: Session,
) -> None:
    session.add_all([
        _game("2544", "CLE", "2017-18", "1"), _game("2544", "CLE", "2017-18", "2"),
        _game("2544", "LAL", "2018-19", "3"), _game("2544", "MIA", "2013-14", "4"),
        _game("test_1", "LAL", "2018-19", "5"),
    ])  # fmt: skip
    session.commit()
    targets = season_portrait_targets(session)
    assert [(t.player_id, t.team_tricode, t.season) for t in targets] == [
        ("2544", "CLE", "2017-18"),
        ("2544", "LAL", "2018-19"),
    ]
    assert targets[0].url == f"https://cdn.nba.com/headshots/nba/{CLE}/2017/1040x760/2544.png"


def test_fetch_tells_photos_misses_and_transient_failures_apart(tmp_path: Path) -> None:
    target = SeasonPortraitTarget("2544", LAL, "LAL", "2018-19")
    with _cdn({f"/headshots/nba/{LAL}/2018/1040x760/2544.png": _png(1)}, []) as client:
        result = fetch_season_portrait(client, target, tmp_path)
        assert isinstance(result, tuple) and result[1].read_bytes() == _png(1)
        missing = SeasonPortraitTarget("2544", LAL, "LAL", "2016-17")
        assert fetch_season_portrait(client, missing, tmp_path) is None

    def busy(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    with httpx.Client(transport=httpx.MockTransport(busy)) as client:
        assert isinstance(fetch_season_portrait(client, target, tmp_path), Exception)


def test_acquisition_records_photos_and_misses_once_and_resumes(
    test_engine: Engine, tmp_path: Path
) -> None:
    with Session(test_engine) as session:
        session.add_all([
            _game("2544", "CLE", "2017-18", "1"), _game("2544", "LAL", "2018-19", "2"),
        ])  # fmt: skip
        session.commit()
    requests: list[str] = []
    photos = {f"/headshots/nba/{LAL}/2018/1040x760/2544.png": _png(2)}
    with _cdn(photos, requests) as client:
        summary = acquire_season_portraits(test_engine, tmp_path, client=client, delay_seconds=0)
        assert (summary.targets, summary.acquired, summary.missing) == (2, 1, 1)
        again = acquire_season_portraits(test_engine, tmp_path, client=client, delay_seconds=0)
    assert again.targets == 0 and len(requests) == 2
    with Session(test_engine) as session:
        rows = session.scalars(select(PlayerSeasonPortrait).order_by(PlayerSeasonPortrait.season))
        assert [(row.team_tricode, row.status, row.source_name) for row in rows] == [
            ("CLE", "missing", SEASON_PORTRAIT_SOURCE),
            ("LAL", "active", SEASON_PORTRAIT_SOURCE),
        ]


def _season_row(path: Path, team: str, tricode: str, season: str) -> PlayerSeasonPortrait:
    return PlayerSeasonPortrait(
        player_id="201142", team_id=team, team_tricode=tricode, season=season,
        source_name=SEASON_PORTRAIT_SOURCE, source_url="https://cdn.nba.com/x.png", status="active",
        content_sha256=f"{tricode}{season}".ljust(64, "0"), storage_path=str(path),
        mime_type="image/png", width=1040, height=760, bytes=1, attribution="NBA CDN",
    )  # fmt: skip


def test_traded_season_prefers_the_named_team(session: Session, tmp_path: Path) -> None:
    session.add_all([
        _season_row(tmp_path / "bkn.png", "1610612751", "BKN", "2022-23"),
        _season_row(tmp_path / "phx.png", "1610612756", "PHX", "2022-23"),
    ])  # fmt: skip
    session.commit()
    named = find_season_portrait(session, "201142", "2022-23", "BKN")
    by_id = find_season_portrait(session, "201142", "2022-23", "1610612756")
    assert named is not None and named.team_tricode == "BKN"
    assert by_id is not None and by_id.team_tricode == "PHX"
    assert find_season_portrait(session, "201142", "2014-15") is None


def test_endpoint_serves_the_season_headshot_and_falls_back_to_current(
    api_client: TestClient, session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "portraits_cache_path", tmp_path)
    portrait_derivatives._memory.clear()
    current, seasonal = tmp_path / "now.png", tmp_path / "okc.png"
    Image.new("RGBA", (1040, 760), (0, 0, 0, 0)).save(current)
    Image.new("RGBA", (1040, 760), (10, 20, 30, 255)).save(seasonal)
    session.add(
        PlayerPortrait(
            player_id="201142", source_name="nba_cdn_1040x760", content_sha256="e" * 64,
            storage_path=str(current), mime_type="image/png", bytes=1, status="active",
            attribution="NBA CDN",
        )
    )  # fmt: skip
    session.add(_season_row(seasonal, "1610612760", "OKC", "2015-16"))
    session.commit()

    served = api_client.get(
        "/api/workbench/players/201142/portrait", params={"season": "2015-16", "size": 64}
    )
    assert served.status_code == 200 and served.headers["x-portrait-season"] == "2015-16"
    fallback = api_client.get(
        "/api/workbench/players/201142/portrait", params={"season": "2010-11", "team": "OKC"}
    )
    assert fallback.status_code == 200 and "x-portrait-season" not in fallback.headers
    assert fallback.content == current.read_bytes()
    bad = api_client.get("/api/workbench/players/201142/portrait", params={"season": "2015"})
    assert bad.status_code == 422
