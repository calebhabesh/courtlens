import hashlib
import struct
from contextlib import nullcontext
from pathlib import Path

import httpx
import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from courtlens.services import workbench_jobs
from courtlens.workbench_models import PlayerPortrait, WorkbenchIdentity


def test_portrait_batch_reaches_players_after_cached_prefix(
    test_engine: Engine, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    with Session(test_engine) as session:
        for player_id in ("100", "101", "102"):
            session.add(
                WorkbenchIdentity(
                    namespace="nba",
                    kind="player",
                    external_id=player_id,
                    display_name=f"Player {player_id}",
                )
            )
        for player_id in ("100", "101"):
            session.add(
                PlayerPortrait(
                    player_id=player_id,
                    source_name="nba_cdn_1040x760",
                    content_sha256="a" * 64,
                    storage_path=str(tmp_path / f"{player_id}.png"),
                    mime_type="image/png",
                    bytes=1,
                    status="active",
                    attribution="NBA CDN",
                )
            )
        session.commit()
        job_id = workbench_jobs.enqueue_job(session, "portraits", {"limit": 2}).id

    attempted: list[str] = []

    def fetch_portrait(client: object, player_id: str, cache_path: Path) -> None:
        attempted.append(player_id)

    # This test exercises batch selection, independently of PostgreSQL locking and CDN access.
    monkeypatch.setattr(workbench_jobs, "publication_lock", lambda engine: nullcontext())
    monkeypatch.setattr(workbench_jobs, "_fetch_player_portrait", fetch_portrait)
    job = workbench_jobs.execute_job(test_engine, job_id)
    assert job.status == "succeeded"
    assert attempted == ["102"]
    assert job.output_refs_json == {"portraits_acquired": 0, "portraits_failed": 1}


def test_portrait_upgrade_retains_small_cache_and_respects_explicit_targets(
    test_engine: Engine, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    with Session(test_engine) as session:
        for player_id in ("100", "101"):
            session.add(
                WorkbenchIdentity(
                    namespace="nba", kind="player", external_id=player_id, display_name=player_id
                )
            )
        old = PlayerPortrait(
            player_id="100",
            source_name="nba_cdn",
            content_sha256="a" * 64,
            storage_path="retained.png",
            mime_type="image/png",
            bytes=1,
            attribution="NBA CDN",
            status="active",
        )
        session.add(old)
        session.commit()
        old_id = old.id
        job_id = workbench_jobs.enqueue_job(
            session, "portraits", {"limit": 2, "player_ids": ["100"]}
        ).id
    monkeypatch.setattr(workbench_jobs, "publication_lock", lambda engine: nullcontext())
    attempted: list[str] = []

    def fetch(client: object, player_id: str, cache_path: Path) -> tuple[str, Path, int]:
        attempted.append(player_id)
        return "b" * 64, tmp_path / "upgrade.png", 100

    monkeypatch.setattr(workbench_jobs, "_fetch_player_portrait", fetch)
    job = workbench_jobs.execute_job(test_engine, job_id)
    assert job.output_refs_json == {"portraits_acquired": 1, "portraits_failed": 0}
    assert attempted == ["100"]
    with Session(test_engine) as session:
        retained = session.get(PlayerPortrait, old_id)
        assert retained is not None and retained.content_sha256 == "a" * 64
        upgraded = (
            session.query(PlayerPortrait)
            .filter_by(source_name=workbench_jobs.PORTRAIT_SOURCE)
            .one()
        )
        assert (upgraded.width, upgraded.height) == (1040, 760)


@pytest.mark.parametrize("valid", [True, False])
def test_portrait_fetch_validates_official_high_resolution_png(tmp_path: Path, valid: bool) -> None:
    content = (
        b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + struct.pack(">II", 1040, 760) + b"\x00" * 9
        if valid
        else b"<html>not an image</html>"
    )
    requests: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        return httpx.Response(200, content=content, headers={"content-type": "image/png"})

    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        result = workbench_jobs._fetch_player_portrait(client, "100", tmp_path)
        assert workbench_jobs._fetch_player_portrait(client, "../escape", tmp_path) is None
    assert requests == ["https://cdn.nba.com/headshots/nba/latest/1040x760/100.png"]
    if valid:
        assert result is not None and result[1].read_bytes() == content
    else:
        assert result is None and list(tmp_path.iterdir()) == []


def test_portrait_fetch_rejects_cdn_silhouette(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    content = (
        b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + struct.pack(">II", 1040, 760) + b"\x01" * 9
    )
    monkeypatch.setattr(
        workbench_jobs,
        "PLACEHOLDER_PORTRAIT_SHA256",
        frozenset({hashlib.sha256(content).hexdigest()}),
    )

    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=content, headers={"content-type": "image/png"})

    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        assert workbench_jobs._fetch_player_portrait(client, "711", tmp_path) is None
    assert list(tmp_path.iterdir()) == []
