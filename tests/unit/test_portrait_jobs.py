from contextlib import nullcontext
from pathlib import Path

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from courtload.services import workbench_jobs
from courtload.workbench_models import PlayerPortrait, WorkbenchIdentity


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
                    source_name="nba_cdn",
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
