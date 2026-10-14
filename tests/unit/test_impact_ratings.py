"""Independent algebra, temporal and missingness checks for IM04."""

from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest

from courtlens.evaluation.impact_rating_inputs import checked, select_window, write_artifact
from courtlens.evaluation.impact_rating_runner import build_prior, correlations
from courtlens.evaluation.impact_ratings import (
    Stint,
    choose_alpha,
    design,
    fit_target,
    margin_diagnostic,
    observations,
    on_off,
    outcome,
    ridge,
    vocabulary,
)
from courtlens.ingestion.native_reconstruction import content_hash


def sample(n=24):
    rng = np.random.default_rng(987)
    result = []
    for i in range(n):
        home = tuple(f"p{k}" for k in rng.choice(7, 5, replace=False))
        away = tuple(f"p{k + 7}" for k in rng.choice(7, 5, replace=False))
        hf = {
            "fga": 85.0 + i % 10,
            "fta": 20.0 + i % 5,
            "turnovers": 8.0 + i % 7,
            "orb": 7.0 + i % 8,
            "orb_opportunities": 30.0 + i % 15,
        }
        af = {
            "fga": 80.0 + i % 12,
            "fta": 15.0 + i % 6,
            "turnovers": 10.0 + i % 5,
            "orb": 8.0 + i % 6,
            "orb_opportunities": 25.0 + i % 12,
        }
        result.append(
            Stint(
                str(i),
                f"2024-01-{i + 1:02d}",
                "2023-24",
                "H",
                "A",
                home,
                away,
                2880.0,
                110.0 + i % 9,
                100.0 + i % 11,
                100.0,
                98.0,
                hf,
                af,
            )
        )
    return result


def test_ridge_matches_independent_weighted_normal_equations():
    rows = sample()
    x = design(rows, vocabulary(rows)).toarray()
    y, w, _ = observations(rows, "rapm")
    augmented = np.column_stack([np.ones(len(y)), x])
    penalty = np.diag([0.0] + [100.0] * x.shape[1])
    expected = np.linalg.solve(
        augmented.T @ (w[:, None] * augmented) + penalty, augmented.T @ (w * y)
    )
    coef, intercept = ridge(design(rows, vocabulary(rows)), y, w, 100)
    np.testing.assert_allclose(np.r_[intercept, coef], expected, rtol=1e-7, atol=1e-7)


def test_nonzero_prior_matches_penalized_normal_equations():
    rows = sample()
    x = design(rows, vocabulary(rows))
    y, w, _ = observations(rows, "rapm")
    prior = np.linspace(-2, 2, x.shape[1])
    coef, intercept = ridge(x, y, w, 100, prior)
    a = np.column_stack([np.ones(len(y)), x.toarray()])
    penalty = np.diag([0.0] + [100.0] * x.shape[1])
    expected = np.linalg.solve(
        a.T @ (w[:, None] * a) + penalty, a.T @ (w * y) + penalty @ np.r_[0, prior]
    )
    np.testing.assert_allclose(np.r_[intercept, coef], expected, rtol=1e-7, atol=1e-7)


@pytest.mark.parametrize("target", ["rapm", "ts", "tov", "reb"])
def test_centering_and_signs_preserve_predictions(target):
    rows = sample()
    ids = vocabulary(rows)
    x = design(rows, ids)
    y, w, _ = observations(rows, target)
    coef, intercept = ridge(x, y, w, 100)
    fit = fit_target(rows, target, 100)
    osign = -1 if target == "tov" else 1
    dsign = 1 if target == "tov" else -1
    scale = 1 if target == "rapm" else 100
    centered = [fit["players"][p]["offense"] / (scale * osign) for p in ids]
    centered += [fit["players"][p]["defense"] / (scale * dsign) for p in ids]
    centered += [fit["home_coefficient"]]
    np.testing.assert_allclose(
        x @ coef + intercept, x @ np.array(centered) + fit["intercept"], atol=1e-8
    )
    assert abs(fit["weighted_offense_mean"]) < 1e-9
    assert abs(fit["weighted_defense_mean"]) < 1e-9


def test_opportunity_formulas():
    s = sample()[0]
    assert outcome(s, 0, "ts") == (110, 2 * (85 + 0.44 * 20))
    assert outcome(s, 0, "tov") == (8, 85 + 0.44 * 20 + 8)
    assert outcome(s, 0, "reb") == (7, 30)
    with pytest.raises(ValueError, match="unknown"):
        outcome(s, 0, "made_up")


def test_zero_control_points_are_reported_and_preserved_in_on_off():
    rows = sample()
    special = replace(rows[0], game="ft-only", hp=2, ap=0, hx=0, ax=0, seconds=0)
    fit = fit_target([*rows, special], "rapm", 100)
    assert fit["zero_denominator_rows"] == 2
    assert fit["omitted_numerator"] == 200
    p = special.home[0]
    assert (
        on_off([*rows, special])[f"{p}:H"]["on"]["points"]
        == on_off(rows)[f"{p}:H"]["on"]["points"] + 2
    )


def test_zero_off_sample_is_unknown():
    s = sample()[0]
    r = on_off([s])[f"{s.home[0]}:H"]
    assert r["off"]["ortg"] is None and r["difference"]["net"] is None
    assert r["on"]["net"] == pytest.approx(110 - 100 * 100 / 98)


def test_traded_players_keep_team_references_and_all_off_games():
    s = sample()[0]
    t = replace(s, home_team="NEW", hp=50)
    r = on_off([s, t])
    assert r[f"{s.home[0]}:H"]["on"]["points"] == 110
    assert r[f"{s.home[0]}:NEW"]["on"]["points"] == 50
    missing = replace(s, home=tuple(f"new{k}" for k in range(5)), hp=99)
    assert on_off([s, missing])[f"{s.home[0]}:H"]["off"]["points"] == 99


def test_game_folds_and_hash_reproducibility():
    rows = sample()
    # Every game has several observations; duplicated stints must stay in one fold.
    a, proof = choose_alpha(rows + rows, ("rapm",))
    b, repeated = choose_alpha(rows + rows, ("rapm",))
    assert a == b and content_hash(proof) == content_hash(repeated)
    folds = [set(f) for f in proof["fold_test_games"]]
    assert set.union(*folds) == {s.game for s in rows}
    assert not folds[0] & folds[1] and not folds[0] & folds[2] and not folds[1] & folds[2]
    assert content_hash(fit_target(rows, "rapm", a)) == content_hash(fit_target(rows, "rapm", a))


def test_shared_factor_grid_retains_independent_validation_errors():
    _, cv = choose_alpha(sample(), ("ts", "tov", "reb"))
    for alpha, targets in cv["target_squared_errors"].items():
        expected = np.mean([targets[t] / cv["target_baseline_squared_errors"][t] for t in targets])
        assert cv["scores"][alpha] == pytest.approx(expected)


def test_unseen_fold_players_and_training_only_holdout():
    rows = sample()
    special = replace(rows[-1], home=tuple(f"unseen{k}" for k in range(5)))
    _, cv = choose_alpha([*rows[:-1], special], ("rapm",))
    assert max(cv["unknown_players"]) == 5
    proof = margin_diagnostic([*rows[:-1], special])
    assert proof["unknown_players"] == list(special.home)
    assert proof["holdout_start"] == "2024-01-20"
    assert all(int(g) < 19 for f in proof["training_cv"]["fold_test_games"] for g in f)


def test_exclusive_cutoff_future_mutations_do_not_change_input_or_fit():
    rows = sample()
    cohort = {
        "season": "2023-24",
        "phase": "regular_season",
        "stints": rows,
        "games": {
            s.game: {"day": s.day, "quality": "clean", "sha256": str(i)} for i, s in enumerate(rows)
        },
    }
    earlier, manifest = select_window([cohort], "2024-01-20")
    changed = {
        **cohort,
        "stints": [replace(s, hp=9999) if s.day >= "2024-01-20" else s for s in rows],
        "games": {
            gid: {**g, "sha256": "future"} if g["day"] >= "2024-01-20" else g
            for gid, g in cohort["games"].items()
        },
    }
    replay, again = select_window([changed], "2024-01-20")
    assert content_hash(manifest) == content_hash(again)
    assert content_hash(fit_target(earlier, "rapm", 100)) == content_hash(
        fit_target(replay, "rapm", 100)
    )
    assert len(earlier) == 19
    with pytest.raises(ValueError, match="consecutive"):
        select_window([cohort, {**cohort, "season": "2025-26"}], "2026-01-01")
    with pytest.raises(ValueError, match="phase"):
        select_window([cohort, {**cohort, "phase": "playoffs"}], "2026-01-01")


def test_content_addressed_replay_tamper_and_forged_claim(tmp_path):
    obj = {"coefficients": [1.2, 3.4]}
    path, digest = write_artifact(tmp_path, obj)
    assert write_artifact(tmp_path, obj) == (path, digest)
    path.write_text("changed")
    with pytest.raises(ValueError, match="artifact changed"):
        write_artifact(tmp_path, obj)
    body = {"status": "ready", "content_sha256": "forged"}
    p = tmp_path / "claim.json"
    p.write_text(__import__("json").dumps(body))
    with pytest.raises(ValueError, match="changed content"):
        checked(p)
    with pytest.raises(ValueError):
        write_artifact(tmp_path, {"coefficient": float("nan")})


def test_bpr_refuses_future_or_same_season_targets():
    artifact = {
        "input": {"phase": "regular_season", "seasons": ["2024-25"], "cutoff": "2025-07-01"}
    }
    for before in ("2023-24", "2024-25"):
        prior, proof = build_prior({}, [artifact], "regular_season", before, Path("unused"))
        assert prior is None and proof["status"] == "unavailable"


def test_bpr_only_uses_historical_box_profiles(monkeypatch):
    players = {
        f"p{i}": {"qualified": True, "seconds": 100 + i, "offense": i / 10, "defense": -i / 20}
        for i in range(25)
    }
    past = {
        "input": {"phase": "regular_season", "seasons": ["2023-24"], "cutoff": "2024-07-01"},
        "rapm": {"players": players},
    }
    future = {"input": {"phase": "regular_season", "seasons": ["2025-26"], "cutoff": "2026-07-01"}}
    seen = []

    def boxes(cohort, root):
        seen.append(cohort["season"])
        return {p: [i + k for k in range(11)] for i, p in enumerate(players)}, "historical-box-hash"

    monkeypatch.setattr("courtlens.evaluation.impact_rating_runner.box_profiles", boxes)
    prior, proof = build_prior(
        {"2023-24:regular_season": {"season": "2023-24"}},
        [past, future],
        "regular_season",
        "2024-25",
        Path("unused"),
    )
    assert seen == ["2023-24"]
    assert len(prior) == 25
    assert proof["target_artifacts"] == [content_hash(past)]
    assert all(s.startswith("2023-24:") for s in proof["samples"])


def test_qualification_filters_top_lists_and_percentiles():
    fit = fit_target(sample(), "rapm", 100)
    qualified = {p for p, r in fit["players"].items() if r["qualified"]}
    assert all(p in qualified for p in fit["top20"]["total"])
    assert all(
        r["total_percentile"] is None for p, r in fit["players"].items() if p not in qualified
    )
    small = fit_target(sample(6), "rapm", 100)
    assert small["top20"]["total"] == []


def test_correlations_are_null_for_unsupported_cohort():
    fits = [
        {
            "input": {"seasons": [s], "phase": "regular_season"},
            "rapm": {"players": {"p": {"qualified": True, "offense": 1, "defense": 1, "total": 2}}},
        }
        for s in ("2023-24", "2024-25")
    ]
    assert correlations(fits)[0]["pearson"]["total"] is None


def test_impact_ratings_cannot_enter_forecasting_features(monkeypatch):
    from datetime import date

    from courtlens.evaluation import points_features

    source = Path(points_features.__file__).read_text()
    assert "impact_rating" not in source
    from courtlens.evaluation.points_features import POINTS_FEATURE_VARIANTS

    assert not any(
        any(term in feature for term in ("rapm", "bpr", "dpm", "impact", "on_off", "six_factor"))
        for variant in POINTS_FEATURE_VARIANTS.values()
        for feature in variant
    )

    def forbidden(*args, **kwargs):
        pytest.fail("descriptive rating path reached forecasting")

    for method in ("fit_target", "choose_alpha", "on_off"):
        monkeypatch.setattr(f"courtlens.evaluation.impact_ratings.{method}", forbidden)
    monkeypatch.setattr("courtlens.evaluation.impact_rating_runner.run", forbidden)
    monkeypatch.setattr("courtlens.services.darko.load_darko_store", forbidden)
    rows = [
        points_features.PointsPlayerGame(
            "past",
            "p",
            "t",
            "o",
            date(2025, 1, 1),
            "2024-25",
            "regular_season",
            "appeared",
            1800,
            10,
            8,
            3,
        )
    ]
    features, labels, _ = points_features.compute_player_features(
        rows, None, date(2025, 1, 2), date(2025, 1, 2)
    )
    assert labels == [10.0] and features


def test_invalid_lineups_counts_and_insufficient_cv_fail():
    s = sample()[0]
    with pytest.raises(ValueError, match="five-player"):
        replace(s, home=s.home[:4])
    with pytest.raises(ValueError, match="count"):
        replace(s, hp=float("nan"))
    with pytest.raises(ValueError, match="three games"):
        choose_alpha(sample(2), ("rapm",))


def test_box_profiles_unknown_counts_and_missing_rows_are_not_zero(monkeypatch):
    from courtlens.evaluation.impact_rating_inputs import BOX_FIELDS, box_profiles

    s = sample()[0]
    good = {"person_id": s.home[0], "minutes": "", **dict.fromkeys(BOX_FIELDS, "1")}
    missing = {"person_id": s.home[1], "minutes": "48:00", **dict.fromkeys(BOX_FIELDS, "1")}
    missing["points"] = "nan"
    monkeypatch.setattr(
        "courtlens.evaluation.impact_rating_inputs.retained_boxes",
        lambda *args: ({s.game: [good, missing]}, {}, {"player_box": "sha"}),
    )
    profiles, _ = box_profiles(
        {"season": "2023-24", "stints": [s], "games": {s.game: {}}}, Path("unused")
    )
    # Actual reconstructed participation allows known counts despite unknown box minutes.
    assert profiles[s.home[0]] == [1.0] * len(BOX_FIELDS)
    assert s.home[1] not in profiles
    assert s.home[2] not in profiles
