"""Projected Impact (R07): the rules that protect the prospective test."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from courtlens.domain.projected_impact import (
    NO_PRIOR_BUCKET,
    PRIOR,
    RETURNER,
    ROOKIE,
    BoxPlayer,
    conformal_quantile,
    minutes_bucket,
    prospective_label,
    strength_difference,
)
from courtlens.evaluation.projected_impact_data import (
    BOX_COLUMNS,
    SHOT_COLUMNS,
    BoxRow,
    Fit,
    Snapshot,
    Sources,
    causality_check,
    corrupt_from,
    feature_block,
    feature_names,
    population,
    prospective_check,
    season_features,
    strip_from,
    window_check,
)
from courtlens.evaluation.projected_impact_models import (
    FROZEN_VERSION,
    over_coverage_only,
)
from courtlens.services import projected_impact as service

DEFENSIVE = ("isolation", "spotup")


def _fit(games: set[str], players: dict[str, float]) -> Fit:
    return Fit(
        "sha",
        frozenset(games),
        {
            p: {
                "total": v,
                "offense": v / 2,
                "defense": v / 2,
                "seconds": 60000.0,
                "ts_off": 0.1,
                "ts_def": 0.1,
                "tov_off": 0.1,
                "tov_def": 0.1,
                "reb_off": 0.1,
                "reb_def": 0.1,
            }
            for p, v in players.items()
        },
    )


def _box(game: str, day: str, player: str, seconds: float = 1800.0) -> BoxRow:
    return BoxRow(game, day, player, seconds, dict.fromkeys(BOX_COLUMNS, 5.0))


def _sources() -> Sources:
    return Sources(
        openers={
            "2023-24": "2023-10-24",
            "2024-25": "2024-10-22",
            "2025-26": "2025-10-21",
            "2026-27": "2026-10-20",
        },
        fits={
            "2023-24": _fit({"g23"}, {"veteran": 1.0, "returner": 4.0}),
            "2024-25": _fit({"g24"}, {"veteran": 2.0}),
            "2025-26": _fit({"g25"}, {"veteran": 3.0, "rookie": 0.5, "returner": 1.0}),
        },
        snapshots={
            "2025-26": Snapshot(
                "snap",
                "2025-10-21",
                "2025-04-13",
                {"veteran": {"rapm": 2.5, "orapm": 1, "drapm": 1.5, "decayed_seconds": 9000.0}},
            ),
            "2026-27": Snapshot(
                "snap2",
                "2026-10-20",
                "2026-04-12",
                {"veteran": {"rapm": 2.9, "orapm": 1, "drapm": 1.9, "decayed_seconds": 9000.0}},
            ),
        },
        boxes={
            "2023-24": [
                _box("g23", "2023-11-01", "veteran"),
                _box("g23", "2023-11-01", "returner"),
            ],
            "2024-25": [_box("g24", "2024-11-01", "veteran")],
            "2025-26": [_box("g25", "2025-11-01", "veteran"), _box("g25", "2025-11-01", "rookie")],
            "2026-27": [_box("g26", "2026-10-21", "veteran")],
        },
        play_types={
            "2024-25": {"veteran": {"off:spotup": 30.0, "off:cut": 10.0, "def:isolation": 4.0}}
        },
        defensive_types=DEFENSIVE,
        shots={"2024-25": {"veteran": dict.fromkeys(SHOT_COLUMNS, 10.0)}},
        birth={"veteran": "1995-10-21", "rookie": "2006-01-01"},
        debut={"veteran": 2015, "rookie": 2025, "returner": 2018},
    )


def test_features_read_only_the_prior_seasons() -> None:
    built = season_features("2025-26", ["veteran"], _sources())
    row = built["features"]["veteran"]
    assert row["rapm_total_1"] == 2.0  # 2024-25, not 2025-26's 3.0
    assert row["rapm_total_2"] == 1.0
    assert row["td_rapm"] == 2.5
    assert row["age"] == pytest.approx(30.0, abs=0.01)
    assert row["years_in_league"] == 10.0
    assert row["pt_off_spotup_1"] == pytest.approx(0.75)
    assert set(built["feature_games"]) == {"g23", "g24"}


def test_changing_or_removing_later_games_changes_no_feature_hash() -> None:
    sources = _sources()
    players = ["veteran", "rookie", "returner"]
    base = season_features("2025-26", players, sources)["feature_sha256"]
    assert (
        season_features("2025-26", players, strip_from(sources, "2025-26"))["feature_sha256"]
        == base
    )
    assert (
        season_features("2025-26", players, corrupt_from(sources, "2025-26"))["feature_sha256"]
        == base
    )
    assert causality_check(sources, ("2025-26",))["passed"]


def test_a_game_before_the_cutoff_does_change_the_hash() -> None:
    """The check above would pass vacuously if the hash ignored the data."""
    sources = _sources()
    base = season_features("2025-26", ["veteran"], sources)["feature_sha256"]
    extra = dict(sources.boxes)
    extra["2024-25"] = [*extra["2024-25"], _box("g24b", "2024-12-01", "veteran")]
    from dataclasses import replace

    assert (
        season_features("2025-26", ["veteran"], replace(sources, boxes=extra))["feature_sha256"]
        != base
    )


def test_target_and_feature_windows_share_no_games() -> None:
    assert window_check(_sources(), ("2025-26",))["seasons"]["2025-26"]["shared_games"] == 0


def test_window_check_catches_an_overlap() -> None:
    from dataclasses import replace

    sources = _sources()
    fits = dict(sources.fits)
    fits["2024-25"] = _fit({"g24", "g25"}, {"veteran": 2.0})
    assert not window_check(replace(sources, fits=fits), ("2025-26",))["passed"]


def test_a_snapshot_reaching_the_target_season_is_refused() -> None:
    from dataclasses import replace

    sources = _sources()
    leaking = Snapshot("x", "2025-10-21", "2025-11-01", {})
    with pytest.raises(ValueError, match="does not end before"):
        season_features("2025-26", ["veteran"], replace(sources, snapshots={"2025-26": leaking}))


def test_2026_27_build_holds_no_2026_27_game() -> None:
    check = prospective_check(_sources())
    assert check["passed"]
    assert check["games_2026_27_in_boxes"] == 1
    assert check["games_2026_27_in_features"] == 0


def test_groups_rookie_returner_prior() -> None:
    built = season_features("2025-26", ["veteran", "rookie", "returner", "unseen"], _sources())
    assert built["groups"] == {
        "veteran": PRIOR,
        "rookie": ROOKIE,  # debut 2025
        "returner": RETURNER,  # played 2023-24, not 2024-25
        "unseen": ROOKIE,  # no earlier box appearance
    }


def test_missing_values_stay_missing_not_zero() -> None:
    row = season_features("2025-26", ["unseen"], _sources())["features"]["unseen"]
    assert row["age"] is None
    assert row["years_in_league"] is None
    assert row["rapm_total_1"] is None
    assert row["pt_off_spotup_1"] is None
    assert all(value is None for value in row.values())


def test_absent_play_type_for_a_player_with_other_rows_is_missing() -> None:
    row = season_features("2025-26", ["veteran"], _sources())["features"]["veteran"]
    assert row["pt_off_postup_1"] is None


def test_population_keeps_box_only_players() -> None:
    assert population("2025-26", _sources()) == ["returner", "rookie", "veteran"]


def test_every_feature_has_a_display_block() -> None:
    blocks = {feature_block(name) for name in feature_names(DEFENSIVE)}
    assert blocks == {
        "prior_rapm",
        "older_rapm",
        "time_decay_rapm",
        "play_type_offense",
        "play_type_defense",
        "shot_profile",
        "minutes",
        "age_experience",
        "box_rates",
    }


def test_conformal_rank_is_finite_sample_corrected() -> None:
    assert conformal_quantile(range(1, 10)) == 8  # ceil(10 x 0.8) = 8th of 9
    assert conformal_quantile([-3.0, 1.0, 2.0]) == 3.0
    with pytest.raises(ValueError):
        conformal_quantile([])


@pytest.mark.parametrize(
    ("minutes", "group", "bucket"),
    [
        (None, ROOKIE, NO_PRIOR_BUCKET),
        (2000.0, RETURNER, NO_PRIOR_BUCKET),
        (100.0, PRIOR, "under_500"),
        (500.0, PRIOR, "500_to_1499"),
        (1500.0, PRIOR, "1500_plus"),
    ],
)
def test_minutes_bucket(minutes: float | None, group: str, bucket: str) -> None:
    assert minutes_bucket(minutes, group) == bucket


def test_strength_difference_uses_box_minutes_and_a_fallback() -> None:
    players = [
        BoxPlayer("a", "home", 48 * 60.0),
        BoxPlayer("b", "away", 24 * 60.0),
        BoxPlayer("c", "away", 0.0),
    ]
    strength = strength_difference(players, {"a": 2.0}, fallback=-1.0)
    assert strength.difference == pytest.approx(2.0 + 0.5)
    assert strength.unprojected_seconds == 24 * 60.0
    assert strength.total_seconds == 72 * 60.0


def test_a_game_is_prospective_only_after_the_freeze() -> None:
    frozen = "2026-11-05T04:53:33+00:00"
    assert prospective_label("2026-11-06T02:00:00Z", frozen) == "prospective"
    assert prospective_label("2026-11-05T00:00:00Z", frozen) == "hindsight"
    assert prospective_label("2026-11-05T04:53:33Z", frozen) == "hindsight"
    assert prospective_label(None, frozen) == "hindsight"


def test_waiver_covers_over_coverage_only() -> None:
    wide = {"overall": {"coverage": 0.84}, "by_prior_minutes": {"a": {"coverage": 0.89}}}
    narrow = {"overall": {"coverage": 0.84}, "by_prior_minutes": {"a": {"coverage": 0.70}}}
    assert over_coverage_only(wide)
    assert not over_coverage_only(narrow)


def test_committed_manifest_is_intact() -> None:
    manifest = service.load_manifest()
    assert manifest["version"] == FROZEN_VERSION
    assert manifest["checks"]["F2_causality"] and manifest["checks"]["F3_windows"]
    assert manifest["f1_waiver"]
    assert (
        manifest["registration_sha256"]
        == hashlib.sha256(
            json.dumps(
                json.loads(
                    Path(
                        "evaluation/research/registrations/courtlens-projected-impact-v1.json"
                    ).read_text()
                ),
                sort_keys=True,
                separators=(",", ":"),
            ).encode()
        ).hexdigest()
    )


def _isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, payload: bytes) -> str:
    digest = hashlib.sha256(payload).hexdigest()
    manifest = {
        "projections_sha256": digest,
        "frozen_at": "2026-11-05T00:00:00+00:00",
        "version": FROZEN_VERSION,
        "selected": "lightgbm",
        "fallback_rating": -1.0,
        "game_mapping": {n: {"a": 2.0, "b": 1.0} for n in service.RATINGS},
    }
    manifest["manifest_sha256"] = hashlib.sha256(
        json.dumps(manifest, sort_keys=True).encode()
    ).hexdigest()
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest))
    monkeypatch.setattr(service, "MANIFEST_PATH", manifest_path)
    service._cache.clear()

    class Settings:
        projected_impact_models_dir = tmp_path
        projected_impact_serving_dir = tmp_path / "serving"

    monkeypatch.setattr(service, "get_settings", lambda: Settings)
    return digest


def test_load_refuses_a_changed_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    payload = b'{"players": []}'
    digest = _isolated(tmp_path, monkeypatch, payload)
    (tmp_path / f"{digest}.json").write_bytes(payload)
    assert service.load_projections() == {"players": []}
    service._cache.clear()
    (tmp_path / f"{digest}.json").write_bytes(b'{"players": [1]}')
    with pytest.raises(ValueError, match="recorded hash"):
        service.load_projections()


def test_load_refuses_a_changed_manifest(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _isolated(tmp_path, monkeypatch, b"{}")
    body = json.loads(service.MANIFEST_PATH.read_text())
    body["frozen_at"] = "2020-01-01T00:00:00+00:00"
    service.MANIFEST_PATH.write_text(json.dumps(body))
    with pytest.raises(ValueError, match="manifest changed"):
        service.load_manifest()


def test_scoring_labels_rows_and_weekly_guard_skips(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _isolated(tmp_path, monkeypatch, b"{}")
    manifest = service.load_manifest()
    game = {
        "game_id": "1",
        "date": "2026-11-05",
        "home": "H",
        "away": "A",
        "margin": 5.0,
        "players": [BoxPlayer("a", "home", 48 * 60.0), BoxPlayer("z", "away", 48 * 60.0)],
    }
    tables = {name: {"a": 3.0} for name in service.RATINGS}
    row = service.score_game(game, tables, manifest, "2026-11-06T02:00:00Z")
    assert row["label"] == "prospective"
    assert row["predicted"]["lightgbm"] == pytest.approx(2.0 + 3.0 + 1.0)
    assert row["unprojected_seconds"] == 48 * 60.0
    early = service.score_game(game, tables, manifest, "2026-11-04T02:00:00Z")
    assert early["label"] == "hindsight"
    service.serving_root().mkdir()
    summary = service.write_summary([row, early], manifest)
    assert summary["prospective"]["games"] == 1
    assert summary["hindsight"]["games"] == 1
    assert "gaps" not in summary["prospective"]  # no interval under 20 games
    assert service.weekly(now=datetime.now(UTC))["skipped"] is True
