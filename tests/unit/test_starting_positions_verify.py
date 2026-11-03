"""Starter and position evidence re-verifies the release against the raw store."""

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

from courtlens.services.starting_positions import PositionEvidenceUnavailable, _verify
from courtlens.services.workbench_ingestion import dataset_content_sha256, history_file
from courtlens.workbench_models import WorkbenchDataset


def _raw_store(root: Path) -> Path:
    season = root / "sportsdataverse_2026"
    season.mkdir(parents=True)
    (season / "player_boxscores_2026.csv").write_text("game_id,person_id,position\ng1,p1,G\n")
    sealed = root / "bbref_history_sealed"
    sealed.mkdir()
    (sealed / "gamelogs-v1-aaaa.jsonl.gz").write_bytes(b"gamelogs")
    (sealed / "gamelogs-current").write_text("gamelogs-v1-aaaa.jsonl.gz")
    (sealed / "seasons-v1-bbbb.jsonl.gz").write_bytes(b"seasons")
    (sealed / "seasons-v1-bbbb.manifest.json").write_text(json.dumps({"sha256": "b" * 64}))
    (sealed / "seasons-current").write_text("seasons-v1-bbbb.jsonl.gz")
    history = history_file(root)
    assert history is not None
    return history


def _dataset(name: str, sha: str, history: str | None) -> WorkbenchDataset:
    coverage: dict[str, Any] = {"history": {"file": history}} if history else {}
    return cast(
        WorkbenchDataset, SimpleNamespace(id=name, content_sha256=sha, coverage_json=coverage)
    )


def test_a_dataset_sealed_with_history_verifies(tmp_path: Path) -> None:
    history = _raw_store(tmp_path)
    sha = dataset_content_sha256([2026], tmp_path, history)[0]
    _verify(_dataset("with-history", sha, history.name), [2026], tmp_path)


def test_a_dataset_without_history_verifies_on_the_season_files(tmp_path: Path) -> None:
    _raw_store(tmp_path)
    sha = dataset_content_sha256([2026], tmp_path, None)[0]
    _verify(_dataset("seasons-only", sha, None), [2026], tmp_path)


def test_a_newer_history_seal_no_longer_verifies(tmp_path: Path) -> None:
    history = _raw_store(tmp_path)
    sha = dataset_content_sha256([2026], tmp_path, history)[0]
    sealed = tmp_path / "bbref_history_sealed"
    (sealed / "gamelogs-v1-cccc.jsonl.gz").write_bytes(b"newer")
    (sealed / "gamelogs-current").write_text("gamelogs-v1-cccc.jsonl.gz")
    with pytest.raises(PositionEvidenceUnavailable):
        _verify(_dataset("stale-history", sha, history.name), [2026], tmp_path)
