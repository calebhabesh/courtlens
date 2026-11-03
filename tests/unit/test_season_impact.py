"""Weekly provisional impact: served-bundle pointers, in-season schedule, gate and retirement."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.ingestion.season_impact import provisional_schedule
from courtlens.services import season_impact, served_bundle
from courtlens.workbench_models import WorkbenchDataset


def _game(gid: str, status: int, day: str, home: int, away: int) -> dict:
    return {
        "gameId": gid,
        "gameStatus": status,
        "gameDateEst": f"{day}T00:00:00Z",
        "homeTeam": {"teamId": 1610612760, "score": home},
        "awayTeam": {"teamId": 1610612745, "score": away},
    }


def _schedule(games: list[dict]) -> bytes:
    return json.dumps(
        {"leagueSchedule": {"seasonYear": "2026-27", "gameDates": [{"games": games}]}}
    ).encode()


def test_provisional_schedule_keeps_final_regular_season_and_playoff_games() -> None:
    schedule = provisional_schedule(
        _schedule(
            [
                _game("0012600001", 3, "2026-10-05", 100, 90),  # preseason
                _game("0022600001", 3, "2026-10-20", 125, 124),
                _game("0022600002", 1, "2026-10-21", 0, 0),  # not played yet
                _game("0042600101", 3, "2027-04-20", 99, 101),
            ]
        ),
        2027,
    )
    regular = schedule["regular_season"]["games"]
    assert list(regular) == ["0022600001"]
    assert regular["0022600001"] | {} == {
        "game_id": "0022600001",
        "season": "2027",
        "season_type": "regular-season",
        "game_date": "2026-10-20",
        "home_team_id": "1610612760",
        "away_team_id": "1610612745",
        "home_pts": "125",
        "away_pts": "124",
        "home_wl": "W",
        "away_wl": "L",
    }
    assert list(schedule["playoffs"]["games"]) == ["0042600101"]
    with pytest.raises(ValueError, match="another season"):
        provisional_schedule(_schedule([]), 2026)


def test_weekly_run_waits_until_every_team_has_ten_games(session, tmp_path: Path) -> None:
    season_dir = tmp_path / "raw" / "sportsdataverse_2027"
    season_dir.mkdir(parents=True)
    (season_dir / "schedule_2027.json").write_bytes(
        _schedule([_game("0022600001", 3, "2026-10-20", 125, 124)])
    )
    result = season_impact.refresh_season_impact(
        session,
        raw_root=tmp_path / "raw",
        store=tmp_path / "store",
        end_year=2027,
        today=date(2026, 10, 21),
        work_root=tmp_path / "work",
        serving_dir=tmp_path / "serving",
        splits_dir=tmp_path / "splits",
        wowy_dir=tmp_path / "wowy",
        stint_box_dir=tmp_path / "stint-box",
    )
    assert result == {"season": "2026-27", "status": "waiting", "fewest_team_games": 0}


def test_served_bundle_pointer_aliases_and_pruning(tmp_path: Path) -> None:
    sealed, _ = write_artifact(tmp_path, {"version": "v", "entries": []})
    # One bundle and no pointer: the directory serves it (today's sealed installs).
    assert served_bundle.resolve(tmp_path) == sealed
    first, _ = write_artifact(tmp_path, {"version": "v", "entries": [1], "provisional": {}})
    assert served_bundle.resolve(tmp_path) is None  # two bundles, no pointer: ambiguous
    served_bundle.install(tmp_path, first)
    assert served_bundle.resolve(tmp_path) == first
    second, _ = write_artifact(tmp_path, {"version": "v", "entries": [2], "provisional": {}})
    served_bundle.install(tmp_path, second)
    third, _ = write_artifact(tmp_path, {"version": "v", "entries": [3], "provisional": {}})
    served_bundle.install(tmp_path, third)
    removed = served_bundle.prune(tmp_path, {second.stem, sealed.stem})
    assert removed == [first.stem] and not first.exists()
    # A pin to the pruned bundle resolves to the current one; a file in config pins itself.
    assert served_bundle.resolve(tmp_path, first.stem) == third
    assert served_bundle.resolve(sealed) == sealed
    assert served_bundle.resolve(tmp_path, second.stem) == second


def _dataset(session, name: str, namespace: str, season: str = "2026-27") -> WorkbenchDataset:
    dataset = WorkbenchDataset(
        content_sha256=name * 64,
        membership_sha256=name * 64,
        semantic_signature=name * 64,
        source_namespace=namespace,
        parser_version="v",
        quality_version="v",
        seasons_json=[season],
        phases_json=["regular_season"],
        manifest_json={},
        coverage_json={},
        exclusions_json={},
        status="ready",
    )
    session.add(dataset)
    session.commit()
    return dataset


def test_retirement_keeps_newest_provisional_and_never_sealed(session) -> None:
    sealed = _dataset(session, "s", "courtlens-impact", "2025-26")
    old, middle, new = (_dataset(session, n, season_impact.NAMESPACE) for n in ("1", "2", "3"))
    assert season_impact.retire_provisional(session, keep=2) == [old.id]
    left = set(session.scalars(select(WorkbenchDataset.id)))
    assert left == {sealed.id, middle.id, new.id}


def test_daily_lineups_populate_from_the_first_game_and_fit_nothing(
    session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # No schedule on disk: the daily step never consults the 10-game gate.
    calls: list[str] = []
    bundle = tmp_path / "bundle.json.gz"
    monkeypatch.setattr(
        season_impact,
        "_prepare",
        lambda *a: ({}, {"content_sha256": "im02", "seasons": {}}, [bundle]),
    )
    monkeypatch.setattr(
        "courtlens.ingestion.impact_repair_audit.retained_boxes", lambda *a: ({}, None, None)
    )

    def populate(_session, path: Path) -> dict:
        calls.append(f"populate:{path.name}")
        return {"dataset_id": "d1"}

    monkeypatch.setattr(season_impact, "populate_provisional", populate)
    monkeypatch.setattr(
        season_impact, "_stint_box", lambda *a: calls.append("box") or {"b1": {"provisional": True}}
    )
    monkeypatch.setattr(
        season_impact,
        "_serve_stint_boxes",
        lambda _dir, boxes, meta: (
            calls.append(f"serve:{sorted(boxes)}") or tmp_path / "s.json",
            [],
        ),
    )
    monkeypatch.setattr(season_impact, "retire_provisional", lambda _s: ["old"])
    monkeypatch.setattr(season_impact, "prune_work", lambda *a: 0)
    for fit in ("fit_ratings", "build_extras"):
        monkeypatch.setattr(
            f"courtlens.evaluation.season_impact_fits.{fit}",
            lambda *a, **k: pytest.fail("the daily step must not fit"),
        )
    result = season_impact.refresh_season_lineups(
        session,
        raw_root=tmp_path / "raw",
        store=tmp_path / "store",
        end_year=2027,
        today=date(2026, 10, 27),
        work_root=tmp_path / "work",
        serving_dir=tmp_path / "serving",
        splits_dir=tmp_path / "splits",
        stint_box_dir=tmp_path / "stint-box",
    )
    assert calls == ["populate:bundle.json.gz", "box", "serve:['b1']"]
    assert result["status"] == "published" and result["retired"] == ["old"]
