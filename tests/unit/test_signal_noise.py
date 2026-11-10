"""courtlens-signal-noise-v1 (Research R03): method, temporal discipline and served results."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

import numpy as np
import pytest

from courtlens.domain import signal_noise as sn
from courtlens.domain.research_registry import load_registration
from courtlens.evaluation import signal_noise_runner as runner
from courtlens.services import signal_noise as service

ROOT = Path(__file__).resolve().parents[2]
FROZEN = ROOT / "evaluation/research/frozen/courtlens-signal-noise-v1.json"
EVIDENCE = ROOT / "docs/evidence/research/r03/results.json"
FIXTURE = ROOT / "dashboard/lib/signal-noise.fixture.json"


@pytest.fixture(scope="module")
def results() -> dict:
    return json.loads(FROZEN.read_text())


# ---- Method -------------------------------------------------------------------------------------


def test_split_masks_put_floor_half_in_a_and_are_seeded() -> None:
    first = sn.split_masks(np.random.default_rng(sn.SEED), 13, splits=50)
    again = sn.split_masks(np.random.default_rng(sn.SEED), 13, splits=50)
    assert (first.sum(axis=1) == 6).all()
    assert np.array_equal(first, again)
    assert len({tuple(row) for row in first}) > 40


def test_fit_m_recovers_the_spearman_brown_constant() -> None:
    h = np.array([10.0, 25, 50, 100, 200, 400])
    r = h / (h + 80.0)
    m, on_bound = sn.fit_m(r, h, np.ones_like(h))
    assert m == pytest.approx(80.0, rel=1e-6)
    assert not on_bound
    assert sn.spearman_brown_full(r[2]) == pytest.approx(100 / 180)


def test_level_status_never_serves_an_extrapolation_as_reached() -> None:
    reached = sn.level_status(0.5, 50.0, False, [0.3, 0.6], [40, 120], [0.2, 0.4])
    assert reached["status"] == "reached" and reached["n"] == 50 and reached["extrapolated"] is None
    missing = sn.level_status(0.7, 400.0, False, [0.3, 0.45], [100, 480], [0.2, 0.3])
    assert missing["status"] == "not_reached"
    assert missing["n"] is None and missing["extrapolated"] == pytest.approx(400 * 7 / 3)
    flat = sn.level_status(0.5, 10.0, False, [-0.1, -0.05], [10, 20], [-0.05, -0.02])
    assert flat["status"] == "no_signal" and flat["n"] is None and flat["extrapolated"] is None
    odd = sn.level_status(0.5, 900.0, False, [0.6], [100], [0.45])
    assert odd["status"] == "inconsistent"


def test_split_half_correlation_on_simulated_players_matches_theory() -> None:
    """Binomial shooters with known talent spread: the fitted M is near p(1-p)/var(p)."""
    rng = np.random.default_rng(7)
    players, games, per_game = 3000, 60, 4
    talent = np.clip(rng.normal(0.75, 0.08, players), 0.05, 0.98)
    makes = rng.binomial(per_game, talent[:, None], (players, games)).astype(float)
    attempts = np.full((players, games), float(per_game))
    masks = np.stack([sn.split_masks(rng, games, splits=20) for _ in range(players)])
    half_num = np.einsum("psg,pg->ps", masks, makes)
    half_den = np.einsum("psg,pg->ps", masks, attempts)
    terms = sn.split_half_sums(
        half_num, half_den, makes.sum(1), attempts.sum(1), np.ones((players, 1))
    )
    r = float(sn.fisher_mean(sn.correlations(terms), axis=0)[0])
    h = float(terms["h"].sum() / terms["n"].sum())
    m = h * (1 - r) / r
    expected = float(np.mean(talent * (1 - talent)) / np.var(talent))
    assert m == pytest.approx(expected, rel=0.15)


def test_beta_binomial_fit_recovers_a_known_prior() -> None:
    rng = np.random.default_rng(11)
    attempts = rng.integers(1, 400, 4000).astype(float)
    p = rng.beta(0.78 * 27, 0.22 * 27, 4000)
    makes = rng.binomial(attempts.astype(int), p).astype(float)
    fit = sn.fit_beta_binomial(makes, attempts)
    assert fit["converged"] and not fit["on_bound"]
    assert fit["mean"] == pytest.approx(0.78, abs=0.01)
    assert fit["strength"] == pytest.approx(27, rel=0.1)


def test_pure_binomial_data_lands_on_the_bound_and_says_so() -> None:
    rng = np.random.default_rng(12)
    attempts = rng.integers(1, 400, 4000).astype(float)
    makes = rng.binomial(attempts.astype(int), 0.4).astype(float)
    assert sn.fit_beta_binomial(makes, attempts)["on_bound"]


def test_posterior_and_composed_ts() -> None:
    post = sn.posterior(5, 42, 108.0, 194.7)
    assert post["value"] == pytest.approx(113 / (42 + 302.7))
    assert post["low"] < post["value"] < post["high"]
    assert sn.posterior(0, 0, 1, 1)["value"] is None
    # With each component at its raw rate, composed TS% equals PTS / (2 TSA).
    fg2m, fg2a, fg3m, fg3a, ftm, fta = 300, 600, 150, 400, 200, 250
    pts = 2 * fg2m + 3 * fg3m + ftm
    composed = sn.composed_ts(fg2a, fg3a, fta, fg2m / fg2a, fg3m / fg3a, ftm / fta)
    assert composed == pytest.approx(pts / (2 * (fg2a + fg3a + 0.44 * fta)))
    assert sn.composed_ts(10, 0, 0, None, None, None) is None
    assert sn.composed_ts(10, 0, 0, 0.5, None, None) == pytest.approx(10 / 20)


def test_composed_ts_interval_is_seeded() -> None:
    totals = {"fg2m": 26, "fg2a": 58, "fg3m": 5, "fg3a": 42, "ftm": 28, "fta": 34}
    priors = {
        "fg2_pct": {"alpha": 41.6, "beta": 35.2},
        "fg3_pct": {"alpha": 108.0, "beta": 194.7},
        "ft_pct": {"alpha": 20.6, "beta": 6.3},
    }
    first = sn.composed_ts_interval(totals, priors)
    assert first == sn.composed_ts_interval(totals, priors)
    assert first["low"] < first["value"] < first["high"]


# ---- Temporal discipline ------------------------------------------------------------------------


def _synthetic_totals(seed: int) -> dict[str, dict[str, dict[str, float]]]:
    rng = np.random.default_rng(seed)
    totals: dict[str, dict[str, dict[str, float]]] = {}
    for year in range(2010, 2020):
        season = runner.season_label(year)
        totals[season] = {}
        for player in range(150):
            row: dict[str, float] = {}
            for stat, (made, attempts) in sn.BINOMIAL.items():
                n = float(rng.integers(0, 300))
                row[attempts] = n
                row[made] = float(rng.binomial(int(n), 0.3 + 0.1 * (stat == "ft_pct")))
                row[f"{attempts}__valid"] = 1.0
            totals[season][str(player)] = row
    return totals


def test_prior_for_a_season_reads_only_earlier_seasons() -> None:
    target = "2016-17"
    base = _synthetic_totals(1)
    before = runner.fit_priors(base)
    changed = copy.deepcopy(base)
    future = _synthetic_totals(99)
    for season in changed:
        if season >= target:
            changed[season] = future[season]
    after = runner.fit_priors(changed)
    for stat in sn.BINOMIAL:
        assert after[stat][target] == before[stat][target]
        assert before[stat][target]["seasons"] == ["2013-14", "2014-15", "2015-16"]
    # Sanity: changing a season inside the window does change the prior.
    inside = copy.deepcopy(base)
    inside["2015-16"] = future["2015-16"]
    assert runner.fit_priors(inside)["fg3_pct"][target] != before["fg3_pct"][target]


def test_prior_window_never_includes_the_target_or_later() -> None:
    available = [runner.season_label(y) for y in range(1983, 2027)]
    assert sn.prior_window("1984-85", available) == ["1983-84"]
    assert sn.prior_window("2026-27", available) == ["2023-24", "2024-25", "2025-26"]
    assert sn.prior_window("1983-84", available) == []


# ---- Served results (against the data) ----------------------------------------------------------


def test_results_match_registration_and_hash(results: dict) -> None:
    registration = load_registration(sn.REGISTRATION, ROOT / "evaluation/research/registrations")
    assert results["registration"]["content_sha256"] == registration.content_hash()
    body = {k: v for k, v in results.items() if k != "results_sha256"}
    assert hashlib.sha256(runner.canonical(body)).hexdigest() == results["results_sha256"]
    assert EVIDENCE.read_bytes() == FROZEN.read_bytes()


def test_every_stat_has_a_status_and_no_silent_extrapolation(results: dict) -> None:
    stats = {s["key"]: s for s in results["stabilization"]["stats"]}
    assert set(stats) == set(sn.STAT_KEYS) and len(stats) == 20
    for stat in stats.values():
        assert stat["status"] == "measured"
        shown = [b for b in stat["bins"] if b["reported"]]
        for key, level in stat["levels"].items():
            assert level["status"] in {"reached", "not_reached", "inconsistent", "no_signal"}
            if level["status"] == "reached":
                assert level["n"] is not None and level["extrapolated"] is None
                assert level["n"] <= level["largest_n"]
            if level["status"] == "not_reached":
                assert level["n"] is None and level["extrapolated"] is not None
                assert all(b["rho"] < float(key) for b in shown)


def test_served_m_refits_from_served_bins(results: dict) -> None:
    for stat in results["stabilization"]["stats"]:
        shown = [b for b in stat["bins"] if b["reported"]]
        m, _ = sn.fit_m(
            np.array([b["r"] for b in shown]),
            np.array([b["half_sample"] for b in shown]),
            np.array([b["players_per_split"] for b in shown]),
        )
        assert m == pytest.approx(stat["m"]["value"], rel=1e-4), stat["key"]
        for b in shown:
            assert b["rho"] == pytest.approx(2 * b["r"] / (1 + b["r"]), abs=2e-6)
            assert b["n"] == pytest.approx(2 * b["half_sample"], abs=2e-6)


def test_priors_cover_the_registered_seasons(results: dict) -> None:
    expected = {runner.season_label(y) for y in range(1984, 2027)}
    for stat in ("fg3_pct", "ft_pct", "fg2_pct"):
        assert set(results["priors"][stat]) == expected
    assert set(results["priors"]["rim_fg_pct"]) == {
        runner.season_label(y) for y in range(2015, 2027)
    }
    for by_season in results["priors"].values():
        for season, fit in by_season.items():
            assert fit["converged"] and not fit["on_bound"]
            assert all(s < season for s in fit["seasons"]) and 1 <= len(fit["seasons"]) <= 3


def test_shot_detail_covers_every_logged_game(results: dict) -> None:
    for season, row in results["coverage"]["rim"].items():
        assert row["games_with_shot_detail"] == row["games_in_logs"], season
    assert results["coverage"]["ts_identity_failures"] == 0


def test_validation_is_published_for_every_shrunk_stat(results: dict) -> None:
    for stat in ("fg3_pct", "ft_pct", "fg2_pct", "ts_pct", "rim_fg_pct"):
        pooled = results["validation"][stat]["pooled"]
        assert pooled["pairs"] > 1000
        assert set(pooled["mse"]) == {"raw", "prior", "shrunk"}


# ---- Service ------------------------------------------------------------------------------------


def test_shrinkage_unknown_states(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "RESULTS_PATH", FROZEN)
    service.load_results.cache_clear()
    playoffs = service.shrinkage("2025-26", "playoffs")
    assert playoffs is not None
    assert all(p["status"] == "unknown" for p in playoffs["priors"].values())
    assert playoffs["rim"]["status"] == "unknown"
    early = service.shrinkage("1983-84", "regular_season")
    assert early is not None and early["priors"]["fg3_pct"]["status"] == "unknown"
    current = service.shrinkage("2026-27", "regular_season")
    assert current is not None and current["priors"]["fg3_pct"]["status"] == "available"
    assert current["rim"]["status"] == "unknown"
    full = service.shrinkage("2025-26", "regular_season")
    assert full is not None and full["rim"]["status"] == "available"
    for row in full["rim"]["players"].values():
        assert (
            row["raw"] is None
            or row["shrunk"]["low"] <= row["shrunk"]["value"] <= row["shrunk"]["high"]
        )


def test_dashboard_fixture_matches_python() -> None:
    """The Stats toggle shrinks in the browser; its fixture must equal this module's numbers."""
    fixture = json.loads(FIXTURE.read_text())
    for case in fixture["cases"]:
        p = case["priors"]
        rates = {
            stat: sn.shrunk_rate(case[made], case[attempts], p[stat]["alpha"], p[stat]["beta"])
            for stat, (made, attempts) in (
                ("fg2_pct", ("fg2m", "fg2a")),
                ("fg3_pct", ("fg3m", "fg3a")),
                ("ft_pct", ("ftm", "fta")),
            )
        }
        ts = sn.composed_ts(
            case["fg2a"],
            case["fg3a"],
            case["fta"],
            rates["fg2_pct"],
            rates["fg3_pct"],
            rates["ft_pct"],
        )
        assert case["expected"] == {
            "fg3_pct": rates["fg3_pct"],
            "ft_pct": rates["ft_pct"],
            "ts_pct": ts,
        }
