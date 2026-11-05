"""R04 zTS: method rules, and the served results checked against the data they came from."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pytest

from courtlens.domain import zts
from courtlens.domain.research_registry import load_registration
from courtlens.evaluation import zts_runner as runner
from courtlens.services import zts as service

ROOT = Path(__file__).resolve().parents[2]
FROZEN = ROOT / "evaluation/research/frozen/courtlens-zts-validation-v1.json"
EVIDENCE = ROOT / "docs/evidence/research/r04/validation.json"


@pytest.fixture(scope="module")
def results() -> dict:
    return json.loads(FROZEN.read_text())


@pytest.fixture
def served(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "RESULTS_PATH", FROZEN)
    service.load_results.cache_clear()


def row(kind: str, poss: float, freq: float, pts: float = 0.0, tov: float = 0.0) -> zts.TypeRow:
    return zts.TypeRow(kind, poss, freq, pts, tov)


# ---- Method -------------------------------------------------------------------------------------


def test_scoring_possessions_remove_turnovers() -> None:
    assert row("cut", 100, 0.1, 120, 0.1).scoring_possessions == pytest.approx(90.0)


def test_team_mix_flags_a_dropped_row_but_not_the_source_floor() -> None:
    # Ten listed types; the eleventh (absent) can hold at most 9 possessions.
    listed = [row(k, 30, 0.1) for k in zts.PLAY_TYPES[:10]]
    full = zts.team_mix(listed)  # frequency sums to 1: nothing missing
    assert full["missing_possessions"] == pytest.approx(0.0) and not full["dropped_row"]
    small = zts.team_mix([row(k, 30, 30 / 309) for k in zts.PLAY_TYPES[:10]])
    assert small["missing_possessions"] == pytest.approx(9.0) and not small["dropped_row"]
    dropped = zts.team_mix([row(k, 30, 30 / 400) for k in zts.PLAY_TYPES[:10]])
    assert dropped["missing_possessions"] == pytest.approx(100.0) and dropped["dropped_row"]


def test_team_mix_rejects_bad_rows() -> None:
    with pytest.raises(ValueError):
        zts.team_mix([])
    with pytest.raises(ValueError):
        zts.team_mix([row("cut", 10, 0.5), row("cut", 10, 0.5)])
    with pytest.raises(ValueError):
        zts.team_mix([row("dunk", 10, 1.0)])


def test_combine_pools_teams() -> None:
    a = zts.team_mix([row("cut", 90, 0.9, 100, 0.0)])
    b = zts.team_mix([row("cut", 10, 0.5, 10, 0.0), row("spotup", 10, 0.5, 12, 0.0)])
    mix = zts.combine([a, b])
    assert mix["implied_possessions"] == pytest.approx(120.0)
    assert mix["coverage"] == pytest.approx(110 / 120)
    assert mix["types"]["cut"]["possessions"] == pytest.approx(100.0)


def test_league_mix_has_zero_difficulty_and_shares_sum_to_one() -> None:
    rng = np.random.default_rng(1)
    rows = [
        row(k, float(rng.integers(10, 400)), 0.1, float(rng.integers(5, 500)), rng.uniform(0, 0.2))
        for _ in range(40)
        for k in zts.PLAY_TYPES
    ]
    refs = zts.league_references(rows)
    league_shares = {k: v["share"] for k, v in refs["types"].items()}
    assert sum(league_shares.values()) == pytest.approx(1.0, abs=1e-12)
    assert zts.expected_ts(league_shares, refs) == pytest.approx(refs["ts"], abs=1e-12)


def _refs() -> dict:
    return zts.league_references(
        [row(k, 100, 0.1, 110 if k == "cut" else 100, 0.0) for k in zts.PLAY_TYPES]
    )


def _mix(coverage: float = 1.0, dropped: bool = False) -> dict:
    team = zts.team_mix([row("cut", 50, 0.5 * coverage, 60), row("isolation", 50, 0.5 * coverage)])
    mix = zts.combine([team])
    return {**mix, "dropped_row": dropped}


def test_player_value_statuses_follow_the_registered_order() -> None:
    refs = _refs()
    assert zts.player_value(None, None, _mix(), refs)["status"] == zts.NO_RTS
    assert zts.player_value(0.01, 150, _mix(dropped=True), refs)["status"] == zts.SMALL_SAMPLE
    assert zts.player_value(0.01, 250, None, refs)["status"] == zts.NO_PLAY_TYPES
    assert (
        zts.player_value(0.01, 250, _mix(0.5, dropped=True), refs)["status"]
        == zts.SOURCE_ROWS_MISSING
    )
    assert zts.player_value(0.01, 250, _mix(0.85), refs)["status"] == zts.LOW_COVERAGE
    unknown = zts.player_value(0.01, 250, _mix(0.85), refs)
    assert unknown["zts"] is None and unknown["difficulty"] is None
    assert unknown["synergy_ts"] is not None  # the mix is still described


def test_player_value_difficulty_and_zts() -> None:
    refs = _refs()
    value = zts.player_value(0.02, 300, _mix(), refs)
    assert value["status"] == zts.KNOWN
    expected = 0.5 * refs["types"]["cut"]["ts"] + 0.5 * refs["types"]["isolation"]["ts"]
    assert value["expected_ts"] == pytest.approx(expected)
    assert value["difficulty"] == pytest.approx(refs["ts"] - expected)
    assert value["zts"] == pytest.approx(0.02 + refs["ts"] - expected)


def test_weighted_pearson_and_mse() -> None:
    rng = np.random.default_rng(2)
    x, y = rng.normal(size=200), rng.normal(size=200)
    w = np.ones(200)
    assert zts.weighted_pearson(x, y, w) == pytest.approx(np.corrcoef(x, y)[0, 1])
    assert zts.weighted_mse(x, y, w) == pytest.approx(np.mean((x - y) ** 2))
    # Integer weights equal repeating rows.
    w2 = np.where(np.arange(200) < 100, 2.0, 1.0)
    rep = np.concatenate([np.arange(200), np.arange(100)])
    assert zts.weighted_pearson(x, y, w2) == pytest.approx(np.corrcoef(x[rep], y[rep])[0, 1])
    with pytest.raises(ValueError):
        zts.weighted_pearson(np.ones(5), y[:5], w[:5])


def test_bootstrap_is_seeded_and_paired() -> None:
    rng = np.random.default_rng(3)
    n = 300
    players = np.repeat(np.arange(100), 3).astype(str)
    target = rng.normal(size=n)
    rts = target + rng.normal(scale=0.5, size=n)
    zts_values = target + rng.normal(scale=1.5, size=n)
    w = rng.uniform(1, 2, size=n)

    def run() -> dict:
        return zts.paired_bootstrap(
            players,
            rts,
            zts_values,
            target,
            w,
            with_mse=True,
            replicates=200,
            rng=np.random.default_rng(4004),
        )

    first, second = run(), run()
    assert first == second
    assert zts.verdict(first["delta_r"]) == "rts_better"
    assert first["delta_r"]["low"] <= first["delta_r"]["value"] <= first["delta_r"]["high"]


def test_verdict_rule() -> None:
    assert zts.verdict({"value": 0.1, "low": 0.01, "high": 0.2}) == "zts_better"
    assert zts.verdict({"value": -0.1, "low": -0.2, "high": -0.01}) == "rts_better"
    assert zts.verdict({"value": 0.0, "low": -0.1, "high": 0.1}) == "no_clear_difference"


def test_module_constants_are_the_registered_ones() -> None:
    params = load_registration(zts.REGISTRATION, ROOT / "evaluation/research/registrations")
    assert params.parameters["play_types"] == list(zts.PLAY_TYPES)
    assert params.parameters["min_tsa"] == zts.MIN_TSA
    assert params.parameters["min_coverage"] == zts.MIN_COVERAGE
    assert params.parameters["source_min_possessions"] == zts.SOURCE_MIN_POSSESSIONS
    assert params.seed == 4004


# ---- Served results (against the data) ----------------------------------------------------------


def test_results_match_registration_hash_and_evidence(results: dict) -> None:
    registration = load_registration(zts.REGISTRATION, ROOT / "evaluation/research/registrations")
    assert results["registration"]["content_sha256"] == registration.content_hash()
    body = {k: v for k, v in results.items() if k != "results_sha256"}
    assert hashlib.sha256(runner.canonical(body)).hexdigest() == results["results_sha256"]
    assert json.loads(EVIDENCE.read_text()) == runner.evidence_extract(results)


def test_every_player_season_has_a_status_and_known_values_obey_the_rules(results: dict) -> None:
    statuses = {
        zts.KNOWN,
        zts.NO_RTS,
        zts.SMALL_SAMPLE,
        zts.NO_PLAY_TYPES,
        zts.SOURCE_ROWS_MISSING,
        zts.LOW_COVERAGE,
    }
    assert sorted(results["players"]) == list(
        load_registration(zts.REGISTRATION, ROOT / "evaluation/research/registrations").parameters[
            "zts_seasons"
        ]
    )
    known = 0
    for season, players in results["players"].items():
        refs = results["references"][season]
        for value in players.values():
            assert value["status"] in statuses
            if value["status"] != zts.KNOWN:
                assert value["zts"] is None and value["difficulty"] is None
                continue
            known += 1
            assert value["tsa"] >= zts.MIN_TSA and value["coverage"] >= zts.MIN_COVERAGE
            assert not value["dropped_row"]
            assert value["zts"] - value["rts"] == pytest.approx(value["difficulty"], abs=1e-8)
            # Recompute Expected TS from the served mix and the served league references.
            types = {
                k: {"possessions": p, "scoring_possessions": sp, "points": pts}
                for k, (p, sp, pts) in value["types"].items()
            }
            expected = zts.expected_ts(zts.shares(types), refs)
            assert expected == pytest.approx(value["expected_ts"], abs=1e-8)
            assert refs["ts"] - expected == pytest.approx(value["difficulty"], abs=1e-8)
    assert known > 3000


def test_league_references_have_zero_league_difficulty(results: dict) -> None:
    for refs in results["references"].values():
        shares = {k: v["share"] for k, v in refs["types"].items()}
        assert zts.expected_ts(shares, refs) == pytest.approx(refs["ts"], abs=1e-8)


def test_predictive_point_metrics_recompute_from_served_values(results: dict) -> None:
    """Pooled test-season r and MSE from the served player values alone."""
    params = load_registration(
        zts.REGISTRATION, ROOT / "evaluation/research/registrations"
    ).parameters
    rows = []
    for season in params["test_seasons"]["predictive_t"]:
        nxt = f"{int(season[:4]) + 1}-{(int(season[:4]) + 2) % 100:02d}"
        for pid, v in results["players"][season].items():
            following = results["players"][nxt].get(pid)
            if v["status"] != zts.KNOWN or following is None:
                continue
            if following["rts"] is None or (following["tsa"] or 0) < zts.MIN_TSA:
                continue
            weight = 2 * v["tsa"] * following["tsa"] / (v["tsa"] + following["tsa"])
            rows.append((v["rts"], v["zts"], following["rts"], weight))
    a = np.array(rows)
    point = zts.compare(a[:, 0], a[:, 1], a[:, 2], a[:, 3], with_mse=True)
    served = results["validation"]["predictive"]["test"]["pooled"]
    assert served["rows"] == len(rows)
    for key, value in point.items():
        assert served["metrics"][key]["value"] == pytest.approx(value, abs=1e-6)


def test_validation_verdicts_follow_their_intervals(results: dict) -> None:
    for target, splits in results["validation"].items():
        for split in splits.values():
            for block in [split["pooled"], *split["by_season"].values()]:
                metrics = block["metrics"]
                for metric in metrics.values():
                    assert metric["low"] <= metric["value"] <= metric["high"]
                assert block["verdict_r"] == zts.verdict(metrics["delta_r"])
                if target == "predictive":
                    assert block["verdict_mse"] == zts.verdict(metrics["delta_mse"])


def test_fta_is_not_derivable(results: dict) -> None:
    check = results["fta_check"]
    assert check["derivable"] is False and check["exact_matches"] < check["player_seasons"]
    assert check["player_seasons"] > 1000


# ---- Service ------------------------------------------------------------------------------------


@pytest.mark.usefixtures("served")
def test_leaderboard_ranks_known_and_lists_unknown_with_reasons() -> None:
    board = service.leaderboard("2024-25", limit=50)
    assert board is not None and board["status"] == "available"
    values = [r["zts"] for r in board["rows"]]
    assert values == sorted(values, reverse=True) and len(values) == 50
    assert [r["rank"] for r in board["rows"]] == list(range(1, 51))
    assert board["unknown"] and all(r["reason"] and r["zts"] is None for r in board["unknown"])
    assert all(t["tricode"] for r in board["rows"] for t in r["teams"])
    missing = service.leaderboard("2014-15")
    assert missing is not None and missing["status"] == "unknown"


@pytest.mark.usefixtures("served")
def test_player_play_types_add_up_to_expected_ts() -> None:
    board = service.leaderboard(service.LATEST_SEASON, limit=1)
    assert board is not None
    pid = board["rows"][0]["player_id"]
    result = service.player(pid, service.LATEST_SEASON)
    assert result is not None and result["status"] == "available"
    assert sum(t["share"] for t in result["play_types"]) == pytest.approx(1.0)
    assert sum(t["contribution"] for t in result["play_types"]) == pytest.approx(
        result["expected_ts"], abs=1e-8
    )
    assert result["history"] and all(h["season"] for h in result["history"])
    nobody = service.player("no-such-player", "2024-25")
    assert nobody is not None and nobody["status"] == "unknown"


@pytest.mark.usefixtures("served")
def test_default_player_is_the_highest_latest_zts_add(monkeypatch: pytest.MonkeyPatch) -> None:
    players = service.load_results()["players"][service.LATEST_SEASON]  # type: ignore[index]
    usage = {pid: {"scoring_usage": 10.0 + i % 7} for i, pid in enumerate(sorted(players))}
    monkeypatch.setattr(service, "volume", lambda season: usage)
    expected = max(
        (2 * usage[pid]["scoring_usage"] * v["zts"], pid)
        for pid, v in players.items()
        if v["status"] == zts.KNOWN
    )[1]
    assert service.default_player() == expected
    monkeypatch.setattr(service, "volume", lambda season: {})
    assert service.default_player() is None


@pytest.mark.usefixtures("served")
def test_summary_carries_credit_definitions_and_validation() -> None:
    body = service.summary()
    assert body is not None
    assert (
        "Databallr" in body["credit"] and "not Databallr's" in body["definitions"]["play_type_ts"]
    )
    assert set(body["validation"]) == {"predictive", "tracking"}
    assert body["seasons"][0] == "2015-16" and body["seasons"][-1] == "2025-26"


def test_season_volume_reads_minutes_usage_and_ts_add_from_the_bundle() -> None:
    store = {
        "entries": [
            {
                "kind": "extras",
                "scope": {"season": "2025-26", "phase": "regular_season", "years": 1},
                "players": {
                    "1": {
                        "support": {
                            "impact_rts": {"denominator": 500.0},
                            "impact_tsadd_per100": {"denominator": 2000.0, "value": 2.5},
                        }
                    }
                },
            },
            {
                "kind": "ratings",
                "scope": {"season": "2025-26", "phase": "regular_season", "years": 1},
                "players": {"1": {"support": {"rapm": {"seconds": 6000.0}}}, "2": {"support": {}}},
            },
            {
                "kind": "ratings",
                "scope": {"season": "2025-26", "phase": "regular_season", "years": 2},
                "players": {"1": {"support": {"rapm": {"seconds": 1.0}}}},
            },
        ]
    }
    got = service.season_volume(store, "2025-26")
    assert got["1"] == {
        "minutes": 100.0,
        "off_possessions": 2000.0,
        "scoring_usage": 25.0,
        "ts_add": 2.5,
    }
    assert got["2"]["minutes"] is None and got["2"]["scoring_usage"] is None
    assert service.season_volume(None, "2025-26") == {}


def test_zts_add_is_two_times_usage_times_zts() -> None:
    value = {
        "teams": [],
        "status": zts.KNOWN,
        "rts": 0.02,
        "tsa": 500.0,
        "expected_ts": 0.55,
        "difficulty": 0.01,
        "zts": 0.03,
        "synergy_ts": 0.57,
        "coverage": 0.95,
        "listed_possessions": 400.0,
        "implied_possessions": 420.0,
    }
    row = service._row("1", value, {"scoring_usage": 25.0, "minutes": 100.0})
    assert row["zts_add"] == pytest.approx(1.5)
    assert service._row("1", {**value, "zts": None})["zts_add"] is None


@pytest.mark.usefixtures("served")
def test_all_season_board_ranks_across_seasons() -> None:
    board = service.leaderboard(service.ALL_SEASONS, limit=20, sort="zts")
    assert board is not None and board["status"] == "available"
    assert len({r["season"] for r in board["rows"]}) > 1 or board["known"] > 3000
    values = [r["zts"] for r in board["rows"]]
    assert values == sorted(values, reverse=True)
    with pytest.raises(ValueError):
        service.leaderboard("2024-25", sort="pts")
