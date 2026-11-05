"""R08 Metric Backtest: rules, leakage and the whole runner on synthetic data."""

from __future__ import annotations

import copy
from typing import Any

import numpy as np
import pytest

from courtlens.evaluation import metric_backtest_data as data
from courtlens.evaluation import metric_backtest_runner as runner

TEAMS = [f"T{i}" for i in range(6)]


def _player_table(ratings: dict[str, float], before: str) -> dict[str, Any]:
    return {
        "ratings": ratings,
        "replacement": -2.0,
        "rated": len(ratings),
        "inputs_before": before,
    }


def synthetic_tables(seed: int = 1, games: int = 60) -> dict[str, dict[str, Any]]:
    """Eleven seasons. Margins follow true strengths; `rapm_1y` sees them, `on_off` is noise."""
    rng = np.random.default_rng(seed)
    players = {t: [f"{t}p{j}" for j in range(8)] for t in TEAMS}
    tables = {}
    for season in data.TABLE_SEASONS:
        year = int(season[:4])
        opener = f"{year}-10-25"
        truth = {p: float(rng.normal(0, 3)) for t in TEAMS for p in players[t]}
        rows = []
        for i in range(games):
            home, away = rng.choice(TEAMS, size=2, replace=False)
            box = []
            for side, team in (("home", home), ("away", away)):
                for j, p in enumerate(players[str(team)]):
                    box.append([p, side, 2880.0 * (0.9 if j < 5 else 0.1) * 5 / 5.4])
            d = sum(s / 2880 * truth[p] * (1 if side == "home" else -1) for p, side, s in box)
            margin = round(3 + 1.0 * d + rng.normal(0, 8))
            margin = margin if margin != 0 else 1
            day = f"{year}-11-{1 + i % 28:02d}" if i < 30 else f"{year + 1}-01-{1 + i % 28:02d}"
            rows.append(
                {
                    "game_id": f"{year}{i:04d}",
                    "date": day,
                    "home": str(home),
                    "away": str(away),
                    "margin": float(margin),
                    "neutral": False,
                    "players": sorted(box),
                }
            )
        seen = {p: v + float(rng.normal(0, 0.5)) for p, v in truth.items()}
        noise = {p: float(rng.normal(0, 3)) for p in truth}
        team_truth = {
            t: sum(truth[p] for p in players[t][:5]) + float(rng.normal(0, 2)) for t in TEAMS
        }
        candidates: dict[str, Any] = {
            data.BASELINE: {"teams": team_truth, "inputs_before": opener},
            "plus_minus": _player_table(noise, opener),
            "on_off": _player_table(noise, opener),
            "rapm_1y": _player_table(seen, opener),
            "rapm_3y": _player_table(seen, opener),
            "box_prior_rapm": _player_table(seen, opener),
            "time_decay": {
                "snapshots": {
                    opener: _player_table(seen, opener),
                    f"{year + 1}-01-01": _player_table(seen, f"{year + 1}-01-01"),
                }
            },
            "time_decay_opener": _player_table(seen, opener),
            "projected_impact": _player_table(seen, opener),
        }
        if season in ("2015-16", "2016-17"):
            candidates["rapm_3y"] = {"unavailable": "no complete 3-season fit"}
        if season in ("2015-16", "2024-25"):
            candidates["box_prior_rapm"] = {"unavailable": "no box prior"}
        if season not in data.PROJECTED_IMPACT_SEASONS:
            candidates["projected_impact"] = {"unavailable": "outside R07"}
        tables[season] = {
            "version": data.REGISTRATION,
            "season": season,
            "games": rows,
            "candidates": candidates,
            "_sha256": f"synthetic-{season}",
        }
    return tables


RECEIPT = {"identity": data.REGISTRATION, "content_sha256": "synthetic"}


@pytest.fixture(scope="module")
def synthetic_run() -> dict[str, Any]:
    return runner.run(synthetic_tables(), RECEIPT)


# Rules.


def test_weighted_quantile() -> None:
    assert data.weighted_quantile([3, 1, 2], [1, 1, 1], 0.2) == 1
    assert data.weighted_quantile([3, 1, 2], [1, 1, 8], 0.2) == 2
    assert data.weighted_quantile([5, -1], [0, 2], 0.9) == -1
    with pytest.raises(ValueError):
        data.weighted_quantile([], [], 0.2)


def test_snapshot_for_never_reads_a_later_cutoff() -> None:
    cutoffs = ["2020-12-22", "2021-01-01", "2021-02-01"]
    assert data.snapshot_for("2020-12-22", cutoffs) == "2020-12-22"
    assert data.snapshot_for("2021-01-31", cutoffs) == "2021-01-01"
    assert data.snapshot_for("2020-12-21", cutoffs) is None
    # A later snapshot never changes an earlier game's pick.
    assert data.snapshot_for("2021-01-31", [*cutoffs, "2021-03-01"]) == "2021-01-01"


def test_neutral_sites_are_the_bubble_only() -> None:
    assert data.neutral("2020-07-30") and data.neutral("2020-08-14")
    assert not data.neutral("2020-03-11") and not data.neutral("2020-12-22")


def test_pooled_on_court_across_teams() -> None:
    entry = {
        "on": {"points": 110, "allowed": 100, "off_controls": 100.0, "def_controls": 100.0},
        "off": {"off_controls": 50.0, "def_controls": 50.0},
        "difference": {"net": 4.0},
    }
    other = copy.deepcopy(entry)
    other["on"] = {"points": 90, "allowed": 100, "off_controls": 100.0, "def_controls": 100.0}
    other["difference"] = {"net": -8.0}
    out = data.pooled_on_court([entry, other])
    assert out["on_net"] == pytest.approx(0.0)
    assert out["on_off"] == pytest.approx(-2.0)
    assert out["on_off_controls"] == 200.0 and out["off_controls"] == 100.0


def test_strength_counts_replaced_minutes() -> None:
    game = {
        "game_id": "g",
        "date": "2021-01-05",
        "home": "A",
        "away": "B",
        "players": [["a", "home", 2880.0], ["b", "away", 1440.0], ["c", "away", 1440.0]],
    }
    table = {"ratings": {"a": 2.0, "b": 4.0}, "replacement": -1.0, "inputs_before": "2021-01-01"}
    out = data.strength(game, "rapm_1y", table)
    assert out["d"] == pytest.approx(2.0 - (0.5 * 4.0 + 0.5 * -1.0))
    assert out["replaced"] == 1440.0 and out["total"] == 5760.0
    dated = {"snapshots": {"2021-01-01": table, "2021-02-01": {**table, "replacement": 99}}}
    assert data.strength(game, "time_decay", dated)["d"] == pytest.approx(out["d"])


def test_season_sources_ignore_later_fits(monkeypatch: pytest.MonkeyPatch) -> None:
    """Adding or changing a later season's fit never changes an earlier season's ratings."""
    monkeypatch.setattr(data, "team_net", lambda season: ({"T0": 1.0}, "2020-08-15"))

    def fit(total: float, last_day: str) -> dict[str, Any]:
        on = {"points": 500, "allowed": 480, "off_controls": 400.0, "def_controls": 400.0}
        return {
            "_sha256": "f" * 64,
            "input": {"games": {"g": {"day": last_day}}},
            "rapm": {"players": {"p": {"total": total, "seconds": 9000.0}}},
            "bpr": {"players": {"p": {"total": total, "seconds": 9000.0}}},
            "on_off": {
                "p:T0": {
                    "on": on,
                    "off": {"off_controls": 300.0, "def_controls": 300.0},
                    "difference": {"net": 3.0},
                }
            },
        }

    fits = {(1, "2019-20"): fit(1.5, "2020-08-14")}
    opener = {"2020-21": "2020-12-22", "2021-22": "2021-10-19"}
    snap = {
        "sha256": "s",
        "cutoff": "2020-12-22",
        "latest_game_date": "2020-08-14",
        "players": {"p": (0.7, 100.0)},
    }
    later_snap = {**snap, "cutoff": "2021-10-19", "players": {"p": (9.0, 1.0)}}
    before = data.season_sources("2020-21", fits, {"2020-12-22": snap}, opener, {})
    fits_later = {**fits, (1, "2020-21"): fit(99.0, "2021-05-16"), (3, "2020-21"): fit(5, "x")}
    after = data.season_sources(
        "2020-21", fits_later, {"2020-12-22": snap, "2021-10-19": later_snap}, opener, {}
    )
    assert before == after
    assert before["rapm_1y"]["ratings"] == {"p": 1.5}
    assert before["rapm_1y"]["inputs_before"] == "2020-08-15"
    assert before["time_decay"]["snapshots"].keys() == {"2020-12-22"}


def test_leakage_audit_refuses_a_source_dated_after_a_game() -> None:
    tables = synthetic_tables(games=4)
    table = tables["2019-20"]
    assert data.leakage_audit(table)["violations"] == 0
    table["candidates"]["rapm_1y"]["inputs_before"] = "2019-11-02"
    with pytest.raises(ValueError, match="rapm_1y reads on or after"):
        data.leakage_audit(table)


def test_calibrate_recovers_a_known_line() -> None:
    rng = np.random.default_rng(3)
    d = rng.normal(0, 4, 5000)
    h = np.ones(5000)
    h[:500] = 0
    margin = 2.5 * h + 0.8 * d + rng.normal(0, 10, 5000)
    c = runner.calibrate(d, h, margin)
    assert c["a"] == pytest.approx(2.5, abs=0.5)
    assert c["b"] == pytest.approx(0.8, abs=0.05)
    assert c["sigma"] == pytest.approx(10, abs=0.3)
    with pytest.raises(ValueError, match="calibration fit failed"):
        runner.calibrate(np.zeros(10), np.ones(10), np.arange(10.0))


def test_pair_verdict_rule() -> None:
    assert runner.pair_verdict({"low": 0.1, "high": 0.3}, [1, 1, -1]) == "candidate_better"
    assert runner.pair_verdict({"low": 0.1, "high": 0.3}, [1, -1]) == "no_ranking"
    assert runner.pair_verdict({"low": -0.1, "high": 0.3}, [1, 1, 1]) == "no_ranking"
    assert runner.pair_verdict({"low": -0.3, "high": -0.1}, [-1, -1, 1]) == "reference_better"


def test_registration_check_fails_on_a_changed_constant() -> None:
    good = {**runner.registered_constants(), "table_sha256": {}}
    runner.check_registration(good, runner.SEED)
    with pytest.raises(SystemExit, match="replacement_quantile"):
        runner.check_registration({**good, "replacement_quantile": 0.1}, runner.SEED)
    with pytest.raises(SystemExit, match="seed"):
        runner.check_registration(good, runner.SEED + 1)


# The whole runner, end to end.


def test_runner_end_to_end(synthetic_run: dict[str, Any]) -> None:
    c = synthetic_run["candidates"]
    assert c["rapm_3y"]["test_seasons"] == list(data.TEST_SEASONS[2:])
    bpr = c["box_prior_rapm"]
    assert bpr["test_seasons"] == [s for s in data.TEST_SEASONS[1:] if s != "2024-25"]
    assert bpr["seasons"]["2025-26"]["calibration"]["fitted_on"] == "2023-24"
    assert c["projected_impact"]["test_seasons"] == ["2024-25", "2025-26"]
    for name, body in c.items():
        for season, row in body["seasons"].items():
            assert row["calibration"]["fitted_on"] < season, name
            assert (
                row["intervals"]["rmse"]["low"] <= row["rmse"] <= row["intervals"]["rmse"]["high"]
            )
    pair = next(
        p
        for p in synthetic_run["pairs"]
        if p["candidate"] == "rapm_1y" and p["reference"] == "on_off"
    )
    assert pair["verdict"] == "candidate_better"
    assert synthetic_run["verdict"]["against_baseline"]["on_off"] == "reference_better"
    assert sum(b["games"] for b in c["rapm_1y"]["calibration_curve"]["bins"]) == 600
    assert all(v["violations"] == 0 for v in synthetic_run["leakage"].values())


def test_runner_is_deterministic(synthetic_run: dict[str, Any]) -> None:
    again = runner.run(synthetic_tables(), RECEIPT)
    assert again["results_sha256"] == synthetic_run["results_sha256"]


def test_later_outcomes_never_change_earlier_scores(synthetic_run: dict[str, Any]) -> None:
    tables = synthetic_tables()
    for game in tables["2025-26"]["games"]:
        game["margin"] = -game["margin"]
    changed = runner.run(tables, RECEIPT)
    for name, body in synthetic_run["candidates"].items():
        for season, row in body["seasons"].items():
            if season == "2025-26":
                continue
            other = changed["candidates"][name]["seasons"][season]
            assert other["rmse"] == row["rmse"] and other["calibration"] == row["calibration"]


def test_test_command_refuses_a_second_read(tmp_path: Any) -> None:
    path = tmp_path / "results.json"
    path.write_text("{}")
    with pytest.raises(SystemExit, match="has been read"):
        runner.command_test(tmp_path, path)


# The 2026-27 scorer and the served files.


def _manifest() -> dict[str, Any]:
    from courtlens.ingestion.native_reconstruction import content_hash

    body: dict[str, Any] = {
        "version": "v",
        "frozen_at": "2026-11-05T22:52:08+00:00",
        "calibration": {n: {"a": 2.0, "b": 1.0, "sigma": 12.0} for n in data.CANDIDATES},
        "minimum_games_for_interval": 20,
        "season": "2026-27",
    }
    body["manifest_sha256"] = content_hash(body)
    return body


def test_score_game_reads_the_newest_snapshot_and_labels_by_tip() -> None:
    from courtlens.services import metric_backtest as service

    table = synthetic_tables(games=2)["2025-26"]
    game = {**table["games"][0], "date": "2026-11-10"}
    snap = {"sha256": "s1", "cutoff": "2026-11-01", "players": {"x": (1.0, 9.0)}}
    snapshots = {"2026-10-20": {**snap, "sha256": "s0", "cutoff": "2026-10-20"}, "2026-11-01": snap}
    manifest = _manifest()
    before = service.score_game(game, table, snapshots, manifest, "2026-11-05T20:00:00Z")
    after = service.score_game(game, table, snapshots, manifest, "2026-11-10T00:30:00Z")
    assert before is not None and after is not None
    assert before["label"] == "hindsight" and after["label"] == "prospective"
    assert after["time_decay_snapshot"] == {"cutoff": "2026-11-01", "sha256": "s1"}
    # The snapshot rates nobody who played, so every minute takes its replacement value.
    assert after["replaced_seconds"]["time_decay"] == after["total_seconds"]
    assert 0 < after["probability"]["team_net"] < 1
    early = {**game, "date": "2026-10-19"}
    assert service.score_game(early, table, snapshots, manifest, None) is None


def test_prospective_summary_needs_twenty_games_for_intervals() -> None:
    from courtlens.services import metric_backtest as service

    table = synthetic_tables(games=30)["2025-26"]
    snapshots = {
        "2025-10-01": {"sha256": "s", "cutoff": "2025-10-01", "players": {"x": (1.0, 9.0)}}
    }
    manifest = _manifest()
    rows = [
        service.score_game(g, table, snapshots, manifest, "2026-12-01T00:00:00Z")
        for g in table["games"]
    ]
    scored = [r for r in rows if r is not None]
    few = service.summarize_group(scored[:19], 20)
    assert few["games"] == 19 and "pairs" not in few
    many = service.summarize_group(scored, 20)
    assert len(many["pairs"]) == 36
    assert all(p["rmse"]["low"] <= p["rmse"]["gain"] <= p["rmse"]["high"] for p in many["pairs"])


def test_served_results_refuse_a_changed_file(
    tmp_path: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    import json

    from courtlens.ingestion.native_reconstruction import content_hash
    from courtlens.services import metric_backtest as service

    body: dict[str, Any] = {"version": "v", "candidates": {}}
    body["results_sha256"] = content_hash(body)
    path = tmp_path / "results.json"
    path.write_text(json.dumps(body))
    monkeypatch.setattr(service, "RESULTS_PATH", path)
    service._cache.clear()
    assert service.load_results()["version"] == "v"
    path.write_text(json.dumps({**body, "version": "edited"}))
    service._cache.clear()
    with pytest.raises(ValueError, match="changed after it was frozen"):
        service.load_results()


def test_committed_results_match_their_hash_and_verdict_rule() -> None:
    """The frozen file is intact and its verdict follows the registered rule mechanically."""
    from courtlens.services import metric_backtest as service

    service._cache.clear()
    results = service.load_results()
    service.load_manifest()
    for pair in results["pairs"]:
        gains = [pair["per_season"][s]["rmse"]["gain"] for s in pair["seasons"]]
        assert runner.pair_verdict(pair["pooled"]["rmse"], gains) == pair["verdict"]
    assert set(results["candidates"]) == set(data.CANDIDATES)
    assert results["candidates"]["projected_impact"]["test_seasons"] == ["2024-25", "2025-26"]
