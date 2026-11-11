"""F05 models under `courtlens-win-probability-v3` (see the registration for every rule).

v2, the frozen served model, is read and never changed: its game table, state files and saved
test-season probabilities under `data/derived/win-probability-v1`. v3 writes only to
`data/derived/win-probability-v3`.

Stages, each resumable from its artifacts and run under the registered budget:
`pi` (rolling-origin Projected Impact projections, 2018-19 to 2025-26), `pregame` (B and P1 pregame
layers for selection and for the final fit), `fit B`, `fit P1`, `fit P3` (selection on 2023-24),
`final` (P4) and `test`, which alone reads 2024-25 and 2025-26 and refuses to run twice.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
from scipy.special import expit  # type: ignore[import-untyped]

from courtlens.domain.projected_impact import RETURNER, ROOKIE
from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.evaluation import win_probability_data as wpd
from courtlens.evaluation import win_probability_models as wpm
from courtlens.evaluation.win_probability_models import (
    BOOST,
    GROUPS,
    MONOTONE,
    MU_FORM,
    MU_FULL,
    REMAINDER,
    SHRINK,
    Season,
    Stack,
    fit_baseline,
    fit_overtime,
    game_means,
    improvement,
    params,
    state_losses,
    symmetric,
    win_from_normal,
)

REGISTRATION = "courtlens-win-probability-v3"
REGISTERED = load_registration(REGISTRATION)
PARAMETERS = REGISTERED.parameters
SPLITS: dict[str, list[str]] = PARAMETERS["splits"]
SEED = int(PARAMETERS["seed"])
OUTPUT = Path("data/derived/win-probability-v3")
V2 = wpd.OUTPUT
MU_PI = "mu_pi"
PI_FEATURE = "pi_strength"
FEATURES_B: tuple[str, ...] = (*GROUPS["base"], *GROUPS["S1"], *GROUPS["S2"])
SPECIALIST_FEATURES: tuple[str, ...] = (*GROUPS["base"], *GROUPS["S1"])
END_SECONDS = float(wpm.SPECIALIST_SECONDS)


def receipt() -> dict[str, Any]:
    return registration_receipt(REGISTRATION)


def write_json(path: Path, body: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body, indent=1, sort_keys=True))


def read_json(path: Path) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(path.read_text())
    return body


def v2_leaves() -> int:
    """v2's selected num_leaves, read from its frozen ladder (not chosen again)."""
    return int(read_json(V2 / "ladder.json")["leaves"])


# ---------------------------------------------------------------------------------------------
# P1 inputs: rolling-origin Projected Impact projections.


def stage_pi(output: Path = OUTPUT) -> dict[str, Any]:
    from courtlens.evaluation import projected_impact_data as pid
    from courtlens.evaluation import projected_impact_models as pim

    path = output / "pi.json"
    if path.exists():
        raise ValueError("projections already written")
    started = time.monotonic()
    sources = pid.load_sources()
    names = pid.feature_names(sources.defensive_types)
    columns = pim.lightgbm_columns(names)
    first_training = PARAMETERS["pi_first_training_target"]
    usable = [s for s in pid.TARGETS if s >= first_training]
    wanted = [s for s in pid.TARGETS if s >= PARAMETERS["pi_first_target"]]
    rows = {s: pim.rows_for(s, pid.population(s, sources), sources) for s in usable}
    targets = {s: pim.attach_target(rows[s], sources) for s in usable}
    settings = PARAMETERS["pi_lightgbm"]
    seasons: dict[str, Any] = {}
    for target in wanted:
        earlier = [s for s in usable if s < target]
        xs, ys, ws, gs = [], [], [], []
        for s in earlier:
            y, w = targets[s]
            use = (w > 0) & ~np.isnan(y)
            xs.append(rows[s].x[use])
            ys.append(y[use])
            ws.append(w[use])
            gs.append(rows[s].groups[use])
        x, y, w, g = np.vstack(xs), np.concatenate(ys), np.concatenate(ws), np.concatenate(gs)
        booster = pim.lightgbm_fit(
            x,
            y,
            w,
            names,
            pim.lightgbm_parameters(settings["num_leaves"], settings["min_data_in_leaf"], SEED),
            settings["rounds"],
        )
        means = {
            group: float(np.average(y[g == group], weights=w[g == group]))
            for group in (ROOKIE, RETURNER)
        }
        season_rows = rows[target]
        forest = np.asarray(booster.predict(season_rows.x[:, columns]))
        values = {
            player: means.get(str(group), float(value))
            for player, group, value in zip(
                season_rows.players, season_rows.groups, forest, strict=True
            )
        }
        text = booster.model_to_string()
        seasons[target] = {
            "trained_on": earlier,
            "training_rows": len(y),
            "model_sha256": hashlib.sha256(text.encode()).hexdigest(),
            "feature_sha256": season_rows.feature_sha256,
            "group_means": means,
            "players": len(values),
            "projections": values,
        }
        print(json.dumps({"season": target, "players": len(values), **means}), flush=True)
    body = {
        "version": REGISTRATION,
        "registration": receipt(),
        "seasons": seasons,
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }
    write_json(path, body)
    return body


def team_pi(roster: list[list[Any]], season: dict[str, Any]) -> float:
    """Sum of (expected-minutes share / 48) x projection over v2's stored roster."""
    rookie = float(season["group_means"][ROOKIE])
    projections = season["projections"]
    return float(sum(share / 48 * projections.get(pid, rookie) for pid, share, _ in roster))


# ---------------------------------------------------------------------------------------------
# Pregame layers.


def pregame_layer(
    table: dict[str, Any],
    pi: dict[str, Any],
    b_seasons: list[str],
    p1_seasons: list[str],
    half_life: str | None = None,
) -> dict[str, Any]:
    """B's mu0 (v2's columns) and P1's mu0 (plus PI strength x pace) for every game."""
    train = [g for g in table.values() if g["season"] in b_seasons]
    margins = np.array([g["home_pts"] - g["away_pts"] for g in train], dtype=float)
    half_lives = {
        str(h): float(
            np.sqrt(np.mean((margins - np.array([g["form"][str(h)] for g in train])) ** 2))
        )
        for h in PARAMETERS_V2["team_form"]["half_life_days"]
    }
    best = half_life or min(half_lives, key=lambda h: half_lives[h])
    rated = [g for g in train if g["strength_home"] is not None]
    design = np.array([wpm._pregame_row(g, g["form"][best]) for g in rated])
    target = np.array([g["home_pts"] - g["away_pts"] for g in rated], dtype=float)
    coefficients, *_ = np.linalg.lstsq(design, target, rcond=None)
    residual = target - design @ coefficients

    def pi_difference(g: dict[str, Any]) -> float | None:
        season = pi["seasons"].get(g["season"])
        if season is None:
            return None
        return team_pi(g["roster"]["home"], season) - team_pi(g["roster"]["away"], season)

    def p1_row(g: dict[str, Any], difference: float) -> list[float]:
        pace = (g["pace_home"] + g["pace_away"]) / 2
        return [*wpm._pregame_row(g, g["form"][best]), difference * pace / 100]

    p1_train = [
        (g, d)
        for g in table.values()
        if g["season"] in p1_seasons
        and g["strength_home"] is not None
        and (d := pi_difference(g)) is not None
    ]
    p1_design = np.array([p1_row(g, d) for g, d in p1_train])
    p1_target = np.array([g["home_pts"] - g["away_pts"] for g, _ in p1_train], dtype=float)
    p1_coefficients, *_ = np.linalg.lstsq(p1_design, p1_target, rcond=None)
    p1_residual = p1_target - p1_design @ p1_coefficients

    games: dict[str, Any] = {}
    for gid, g in table.items():
        form = g["form"][best]
        rated_game = g["strength_home"] is not None
        full = float(np.dot(wpm._pregame_row(g, form), coefficients)) if rated_game else form
        difference = pi_difference(g)
        mu_pi = (
            float(np.dot(p1_row(g, difference), p1_coefficients))
            if rated_game and difference is not None
            else full
        )
        games[gid] = {
            MU_FORM: form,
            MU_FULL: full,
            MU_PI: mu_pi,
            PI_FEATURE: difference,
            # Season reads these; v3 does not use S3's inputs.
            "log_sigma0": 0.0,
            "pace_sum": g["pace_home"] + g["pace_away"],
            "three_sum": g["three_rate_home"] + g["three_rate_away"],
        }
    return {
        "form_half_life_days": int(best),
        "form_rmse_by_half_life": half_lives,
        "b_train_seasons": b_seasons,
        "b_coefficients": dict(zip(wpm.PREGAME_COLUMNS, map(float, coefficients), strict=True)),
        "b_train_rmse": float(np.sqrt(np.mean(residual**2))),
        "p1_train_seasons": p1_seasons,
        "p1_coefficients": dict(
            zip(
                (*wpm.PREGAME_COLUMNS, "pi_strength_x_pace"),
                map(float, p1_coefficients),
                strict=True,
            )
        ),
        "p1_train_rmse": float(np.sqrt(np.mean(p1_residual**2))),
        "p1_train_games": len(p1_train),
        "games": games,
    }


PARAMETERS_V2 = wpm.PARAMETERS


def stage_pregame(output: Path = OUTPUT) -> dict[str, Any]:
    for name in ("pregame-select.json", "pregame-final.json"):
        if (output / name).exists():
            raise ValueError(f"{name} already written")
    table = wpd.read_games(V2)["games"]
    pi = read_json(output / "pi.json")
    first_pi = PARAMETERS["pi_first_target"]

    def b_seasons(group: list[str]) -> list[str]:
        return [s for s in group if s != "2014-15"]  # 2014-15 has no rating snapshot

    def p1_seasons(group: list[str]) -> list[str]:
        return [s for s in group if s >= first_pi]

    select = pregame_layer(table, pi, b_seasons(SPLITS["train"]), p1_seasons(SPLITS["train"]))
    final = pregame_layer(
        table,
        pi,
        b_seasons(SPLITS["final_fit"]),
        p1_seasons(SPLITS["final_fit"]),
        half_life=str(select["form_half_life_days"]),
    )
    for name, body in (("pregame-select.json", select), ("pregame-final.json", final)):
        write_json(output / name, {"version": REGISTRATION, "registration": receipt(), **body})
        print(
            json.dumps(
                {
                    "file": name,
                    **{k: v for k, v in body.items() if k != "games"},
                }
            ),
            flush=True,
        )
    return {"select": select, "final": final}


# ---------------------------------------------------------------------------------------------
# Seasons with P1's inputs.


class SeasonV3(Season):
    """v2's season view plus P1's mu0 and PI strength difference."""

    def __init__(self, season: str, table: dict[str, Any], pregame: dict[str, Any]) -> None:
        super().__init__(season, table, pregame)
        pre = [pregame["games"][g] for g in self.games]
        for key in (MU_PI, PI_FEATURE):
            values = np.array(
                [np.nan if p[key] is None else float(p[key]) for p in pre], dtype=np.float64
            )
            self.game[key] = values[self.index]

    def view(self, sign: np.ndarray, mu_name: str, names: tuple[str, ...]) -> np.ndarray:
        own = tuple(n for n in names if n != PI_FEATURE)
        base = super().view(sign, mu_name, own)
        if PI_FEATURE not in names:
            return base
        extra = (sign * self.game[PI_FEATURE]).astype(np.float32)
        position = names.index(PI_FEATURE)
        return np.insert(base, position, extra, axis=1)


def load(names: list[str], pregame_file: str, output: Path = OUTPUT) -> dict[str, SeasonV3]:
    table = wpd.read_games(V2)["games"]
    pregame = read_json(output / pregame_file)
    return {name: SeasonV3(name, table, pregame) for name in names}


def views(seasons: list[SeasonV3]) -> list[np.ndarray]:
    rng = np.random.default_rng(SEED)
    return [rng.choice(np.array([1.0, -1.0]), size=len(s.time)) for s in seasons]


# ---------------------------------------------------------------------------------------------
# Recipes and fits.


def recipe(name: str) -> dict[str, Any]:
    """The mu0, booster inputs and overtime rule of a candidate."""
    if name == "B":
        return {"mu": MU_FULL, "features": FEATURES_B, "overtime_specialist": False}
    if name == "P1":
        return {"mu": MU_PI, "features": (*FEATURES_B, PI_FEATURE), "overtime_specialist": False}
    raise ValueError(name)


def specialist_mask(season: SeasonV3, overtime: bool) -> np.ndarray:
    regulation_end = (season.period == 4) & (season.left <= END_SECONDS)
    every_overtime: np.ndarray = season.period >= 5
    late_overtime = every_overtime & (season.left <= END_SECONDS)
    result: np.ndarray = regulation_end | (every_overtime if overtime else late_overtime)
    return result


def specialist_weight(season: SeasonV3, overtime: bool) -> np.ndarray:
    weight: np.ndarray = np.clip(1 - season.left / END_SECONDS, 0.0, 1.0)
    if overtime:
        weight = np.where(season.period >= 5, 1.0, weight)
    return weight


def fit_main(
    train: Stack, names: tuple[str, ...], leaves: int, select: Stack | None, rounds: dict[str, int]
) -> dict[str, Any]:
    """v2's mean and log-variance boosters; early stopping on `select`, else fixed rounds."""
    if select is not None:
        model = wpm.fit_distribution(train, select, names, leaves)
        return {
            "mean": model["mean"],
            "variance": model["variance"],
            "mean_rounds": int(model["mean_rounds"]),
            "variance_rounds": int(model["variance_rounds"]),
        }
    constraints = [MONOTONE.get(n, 0) for n in names]
    config = {**params(leaves), "monotone_constraints": constraints, "metric": "l2"}

    def dataset(x: np.ndarray, y: np.ndarray, w: np.ndarray, offset: np.ndarray) -> Any:
        return lgb.Dataset(
            x, label=y, weight=w * len(w) / w.sum(), init_score=offset, feature_name=list(names)
        )

    mean = lgb.train(
        config,
        dataset(train.x, train.y, train.weight, train.offset),
        num_boost_round=rounds["mean_rounds"],
    )
    folds = (train.groups % 2).astype(bool)
    oof = np.zeros(len(train.y))
    for held in (False, True):
        keep = np.flatnonzero(folds != held)
        out = np.flatnonzero(folds == held)
        booster = lgb.train(
            config,
            dataset(train.x[keep], train.y[keep], train.weight[keep], train.offset[keep]),
            num_boost_round=rounds["mean_rounds"],
        )
        oof[out] = train.offset[out] + booster.predict(train.x[out])
    residual = (train.y - oof) ** 2
    variance_config = {**params(leaves, wpm._variance_objective), "metric": "None"}
    variance = lgb.train(
        variance_config,
        dataset(train.x, residual, train.weight, train.log_variance),
        num_boost_round=rounds["variance_rounds"],
    )
    return {"mean": mean, "variance": variance, **rounds}


def fit_specialist(
    train: list[SeasonV3],
    signs: list[np.ndarray],
    mu: str,
    overtime: bool,
    select: SeasonV3 | None,
    rounds: int | None,
) -> tuple[Any, int]:
    def rows(
        group: list[SeasonV3], sides: list[np.ndarray]
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        xs, ys, ws = [], [], []
        for s, sign in zip(group, sides, strict=True):
            mask = specialist_mask(s, overtime)
            xs.append(s.view(sign, mu, SPECIALIST_FEATURES)[mask])
            rest = (sign * (s.target - s.margin))[mask]
            ys.append(np.clip(rest, -REMAINDER, REMAINDER) + REMAINDER)
            ws.append(s.weight[mask])
        weight = np.concatenate(ws)
        return np.concatenate(xs), np.concatenate(ys), weight * len(weight) / weight.sum()

    config = {**params(15, "multiclass"), "num_class": 2 * REMAINDER + 1, "metric": "multi_logloss"}
    x, y, w = rows(train, signs)
    data = lgb.Dataset(x, label=y, weight=w, feature_name=list(SPECIALIST_FEATURES))
    if select is not None:
        rng = np.random.default_rng(SEED + 2)
        xv, yv, wv = rows([select], [rng.choice(np.array([1.0, -1.0]), size=len(select.time))])
        valid = lgb.Dataset(xv, label=yv, weight=wv, reference=data)
        model = lgb.train(
            config,
            data,
            num_boost_round=BOOST["max_rounds"],
            valid_sets=[valid],
            callbacks=[lgb.early_stopping(BOOST["early_stopping_rounds"], verbose=False)],
        )
        return model, int(model.best_iteration)
    assert rounds is not None
    return lgb.train(config, data, num_boost_round=rounds), rounds


def predict(
    season: SeasonV3,
    mu: str,
    features: tuple[str, ...],
    base: dict[str, float],
    slope: float,
    main: dict[str, Any],
    specialist: Any,
    overtime: bool,
) -> np.ndarray:
    """Symmetric P(home win): main model, blended with the specialist on its states."""

    def main_side(s: Season, sign: np.ndarray) -> np.ndarray:
        assert isinstance(s, SeasonV3)
        mean = sign * s.margin + base["beta"] * sign * s.game[mu] * s.fraction
        log_variance = 2 * math.log(base["sigma"]) + np.log(s.fraction)
        x = s.view(sign, mu, features)
        mean = SHRINK * mean + main["mean"].predict(x)
        log_variance = log_variance + main["variance"].predict(x, raw_score=True)
        tie = expit(slope * sign * s.game[mu])
        return win_from_normal(mean, np.exp(0.5 * log_variance), tie)

    p = symmetric(main_side, season)
    mask = specialist_mask(season, overtime)
    if not mask.any():
        return p
    remainder = np.arange(-REMAINDER, REMAINDER + 1)

    def special_side(sign: np.ndarray) -> np.ndarray:
        probabilities = specialist.predict(season.view(sign, mu, SPECIALIST_FEATURES)[mask])
        final = (sign * season.margin)[mask][:, None] + remainder[None, :]
        tie = expit(slope * (sign * season.game[mu])[mask])
        result: np.ndarray = (probabilities * (final > 0)).sum(axis=1) + (
            probabilities * (final == 0)
        ).sum(axis=1) * tie
        return result

    ones = np.ones(len(season.time))
    special = 0.5 * (special_side(ones) + 1 - special_side(-ones))
    weight = specialist_weight(season, overtime)[mask]
    p[mask] = (1 - weight) * p[mask] + weight * special
    return p


def write_model(output: Path, booster: Any) -> str:
    return wpm.write_model_file(output, booster)


def read_model(output: Path, digest: str) -> Any:
    return wpm.read_model(output, digest)


def ladder(output: Path) -> dict[str, Any]:
    path = output / "ladder.json"
    if path.exists():
        return read_json(path)
    return {"version": REGISTRATION, "registration": receipt(), "steps": {}}


def save(output: Path, name: str, season: str, p: np.ndarray) -> None:
    wpm.save_prediction(output, name, season, p)


def stage_fit(name: str, output: Path = OUTPUT) -> dict[str, Any]:
    """Fit B or P1 on train seasons, or P3 on the accepted model; score on 2023-24."""
    started = time.monotonic()
    state = ladder(output)
    if name in state["steps"]:
        raise ValueError(f"{name} is already fitted")
    select_name = SPLITS["select"][0]
    if name == "P3":
        if "P1" not in state["steps"]:
            raise ValueError("P3 follows P1")
        accepted = state["accepted"]
        spec = {**state["steps"][accepted]["recipe"], "overtime_specialist": True}
    else:
        if name == "P1" and "B" not in state["steps"]:
            raise ValueError("P1 follows B")
        spec = recipe(name)
    mu, features, overtime = spec["mu"], tuple(spec["features"]), bool(spec["overtime_specialist"])
    seasons = load([*SPLITS["train"], select_name], "pregame-select.json", output)
    train = [seasons[s] for s in SPLITS["train"]]
    signs = views(train)
    select = seasons[select_name]
    base = fit_baseline(list(train), signs, mu)
    slope = fit_overtime(list(train), mu)

    if name == "P3":
        source = state["steps"][state["accepted"]]
        main = {
            "mean": read_model(output, source["mean_model"]),
            "variance": read_model(output, source["variance_model"]),
            "mean_rounds": source["mean_rounds"],
            "variance_rounds": source["variance_rounds"],
        }
    else:
        stack = Stack(list(train), signs, mu, features, base)
        rng = np.random.default_rng(SEED + 1)
        select_stack = Stack(
            [select], [rng.choice(np.array([1.0, -1.0]), size=len(select.time))], mu, features, base
        )
        main = fit_main(stack, features, v2_leaves(), select_stack, {})
        del stack, select_stack
    specialist, specialist_rounds = fit_specialist(train, signs, mu, overtime, select, None)
    p = predict(select, mu, features, base, slope, main, specialist, overtime)
    save(output, name, select_name, p)
    loss, _ = game_means(state_losses(p, select.win)["log_loss"], select.index, len(select.games))
    entry: dict[str, Any] = {
        "recipe": {"mu": mu, "features": list(features), "overtime_specialist": overtime},
        "baseline": base,
        "overtime_slope": slope,
        "leaves": v2_leaves(),
        "mean_model": write_model(output, main["mean"]),
        "variance_model": write_model(output, main["variance"]),
        "mean_rounds": main["mean_rounds"],
        "variance_rounds": main["variance_rounds"],
        "specialist_model": write_model(output, specialist),
        "specialist_rounds": specialist_rounds,
        "select_log_loss": float(loss.mean()),
    }
    if name == "B":
        entry["accepted"] = True
        state["accepted"] = "B"
    else:
        reference = wpm.read_prediction(output, state["accepted"], select_name)
        mask = select.period >= 5 if name == "P3" else None
        gain = improvement(p, reference, select, PARAMETERS["selection_level"], mask)
        entry.update(
            {
                "compared_with": state["accepted"],
                "judged_on": "overtime states" if name == "P3" else "all states",
                "improvement_90": gain,
                "accepted": gain["low"] > 0,
            }
        )
        if entry["accepted"]:
            state["accepted"] = name
    # The frozen v2 model never saw 2023-24 (its calibration season): a reference, not a gate.
    if (V2 / "predictions" / "E" / f"{select_name}.npy").exists():
        entry["against_v2_E_on_2023_24"] = improvement(
            p, wpm.read_prediction(V2, "E", select_name), select, 0.90
        )
    entry["elapsed_seconds"] = round(time.monotonic() - started, 1)
    state["steps"][name] = entry
    write_json(output / "ladder.json", state)
    print(
        json.dumps({"step": name, **{k: v for k, v in entry.items() if k != "recipe"}}), flush=True
    )
    return entry


def stage_final(output: Path = OUTPUT) -> dict[str, Any]:
    """P4: the accepted recipe refitted on 2014-15 to 2023-24 with the selection rounds."""
    started = time.monotonic()
    state = ladder(output)
    if "final" in state:
        raise ValueError("the final fit is frozen")
    if "P3" not in state["steps"]:
        raise ValueError("selection is not finished")
    accepted = state["steps"][state["accepted"]]
    spec = accepted["recipe"]
    mu, features, overtime = spec["mu"], tuple(spec["features"]), bool(spec["overtime_specialist"])
    seasons = load(SPLITS["final_fit"], "pregame-final.json", output)
    train = [seasons[s] for s in SPLITS["final_fit"]]
    signs = views(train)
    base = fit_baseline(list(train), signs, mu)
    slope = fit_overtime(list(train), mu)
    stack = Stack(list(train), signs, mu, features, base)
    main = fit_main(
        stack,
        features,
        int(accepted["leaves"]),
        None,
        {
            "mean_rounds": int(accepted["mean_rounds"]),
            "variance_rounds": int(accepted["variance_rounds"]),
        },
    )
    del stack
    specialist, _ = fit_specialist(
        train, signs, mu, overtime, None, int(accepted["specialist_rounds"])
    )
    final = {
        "from": state["accepted"],
        "recipe": spec,
        "baseline": base,
        "overtime_slope": slope,
        "leaves": accepted["leaves"],
        "mean_model": write_model(output, main["mean"]),
        "variance_model": write_model(output, main["variance"]),
        "mean_rounds": main["mean_rounds"],
        "variance_rounds": main["variance_rounds"],
        "specialist_model": write_model(output, specialist),
        "specialist_rounds": accepted["specialist_rounds"],
        "seasons": SPLITS["final_fit"],
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }
    state["final"] = final
    write_json(output / "ladder.json", state)
    print(json.dumps({k: v for k, v in final.items() if k != "recipe"}), flush=True)
    return final


def model_from(entry: dict[str, Any], output: Path) -> Any:
    spec = entry["recipe"]
    mu, features, overtime = spec["mu"], tuple(spec["features"]), bool(spec["overtime_specialist"])
    main = {
        "mean": read_model(output, entry["mean_model"]),
        "variance": read_model(output, entry["variance_model"]),
    }
    specialist = read_model(output, entry["specialist_model"])

    def run(season: SeasonV3) -> np.ndarray:
        return predict(
            season,
            mu,
            features,
            entry["baseline"],
            entry["overtime_slope"],
            main,
            specialist,
            overtime,
        )

    return run


def stage_test(output: Path = OUTPUT) -> dict[str, Any]:
    """Read 2024-25 and 2025-26 once; gates against the frozen model's saved probabilities."""
    from courtlens.evaluation.win_probability_report import metric_block

    started = time.monotonic()
    path = output / "test-report.json"
    if path.exists():
        raise ValueError("the test has already been read; a re-run needs a new version")
    state = ladder(output)
    if "final" not in state:
        raise ValueError("the final fit is not frozen")
    frozen = hashlib.sha256(json.dumps(state, sort_keys=True).encode()).hexdigest()
    test = SPLITS["test"]
    final_seasons = load(test, "pregame-final.json", output)
    select_seasons = load(test, "pregame-select.json", output)
    ordered = [final_seasons[s] for s in test]
    candidates = {
        "v3": (model_from(state["final"], output), final_seasons),
        "B": (model_from(state["steps"]["B"], output), select_seasons),
        "selected_before_P4": (
            model_from(state["steps"][state["accepted"]], output),
            select_seasons,
        ),
    }
    predictions: dict[str, dict[str, np.ndarray]] = {
        name: {s: model(group[s]) for s in test} for name, (model, group) in candidates.items()
    }
    predictions["v2_frozen"] = {s: wpm.read_prediction(V2, "selected", s) for s in test}
    for name, by_season in predictions.items():
        if name != "v2_frozen":
            for season, p in by_season.items():
                save(output, name, season, p)
    for s in test:
        if len(predictions["v2_frozen"][s]) != len(final_seasons[s].time):
            raise ValueError("the frozen model's saved states differ from these states")

    def pooled(name: str, group: list[Season]) -> np.ndarray:
        return np.concatenate([predictions[name][s.season] for s in group])

    groups = {"pooled": ordered, **{s.season: [s] for s in ordered}}
    results: dict[str, Any] = {}
    for label, members in groups.items():
        group: list[Season] = list(members)
        offsets = [int(o) for o in np.cumsum([0] + [len(s.games) for s in group[:-1]])]
        results[label] = {
            name: metric_block(
                pooled(name, group),
                None if name == "v2_frozen" else pooled("v2_frozen", group),
                group,
                offsets,
            )
            for name in predictions
        }
        results[label]["v3_vs_B"] = metric_block(
            pooled("v3", group), pooled("B", group), group, offsets
        )["overall"]
    overall = results["pooled"]["v3"]["overall"]
    a1 = overall["log_loss_improvement"]
    a2 = overall["calibration"]["ece"]
    body = {
        "version": REGISTRATION,
        "registration": receipt(),
        "ladder_sha256": frozen,
        "accepted": state["accepted"],
        "games": {s.season: len(s.games) for s in ordered},
        "states": {s.season: len(s.time) for s in ordered},
        "gates": {
            "A1": {"improvement_vs_v2_frozen": a1, "passed": a1["low"] > 0},
            "A2": {"ece": a2, "limit": 0.02, "passed": a2 <= 0.02},
        },
        "pregame": pregame_errors(ordered, output),
        "results": results,
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }
    write_json(path, body)
    print(
        json.dumps(
            {k: body[k] for k in ("accepted", "games", "gates", "pregame", "elapsed_seconds")},
            indent=1,
        ),
        flush=True,
    )
    return body


def pregame_errors(seasons: list[SeasonV3], output: Path) -> dict[str, Any]:
    """mu0 RMSE and winner accuracy for v2's served mu0 and v3's, on the test games."""
    table = wpd.read_games(V2)["games"]
    v2 = read_json(V2 / "pregame.json")["games"]
    final = read_json(output / "pregame-final.json")["games"]
    accepted_mu = ladder(output)["final"]["recipe"]["mu"]
    games = [g for s in seasons for g in s.games]
    margin = np.array([table[g]["home_pts"] - table[g]["away_pts"] for g in games], dtype=float)
    out: dict[str, Any] = {"games": len(games)}
    for label, values in (
        ("v2_mu0", np.array([v2[g][MU_FULL] for g in games])),
        ("v3_mu0", np.array([final[g][accepted_mu] for g in games])),
    ):
        out[label] = {
            "rmse": float(np.sqrt(np.mean((margin - values) ** 2))),
            "winner_accuracy": float(np.mean((values > 0) == (margin > 0))),
        }
    return out


PUBLISHED = Path("evaluation/research/derived/courtlens-win-probability-v3-test.json")


def stage_publish(output: Path = OUTPUT) -> dict[str, Any]:
    """The test result in a small committed file the page reads (the API image has no data/)."""
    report_path = output / "test-report.json"
    report = read_json(report_path)
    state = ladder(output)
    pooled = report["results"]["pooled"]

    def interval(block: dict[str, Any]) -> dict[str, float]:
        return {k: float(block[k]) for k in ("mean", "low", "high")} | {"games": block["games"]}

    def scores(name: str) -> dict[str, float]:
        overall = pooled[name]["overall"]
        return {
            "log_loss": float(overall["log_loss"]["mean"]),
            "brier": float(overall["brier"]["mean"]),
            "calibration_error": float(overall["calibration"]["ece"]),
        }

    body: dict[str, Any] = {
        "version": REGISTRATION,
        "registration_sha256": receipt()["content_sha256"],
        "test_report_sha256": hashlib.sha256(report_path.read_bytes()).hexdigest(),
        "adopted": bool(report["gates"]["A1"]["passed"] and report["gates"]["A2"]["passed"]),
        "test_seasons": SPLITS["test"],
        "games": int(sum(report["games"].values())),
        "gates": report["gates"],
        "scores": {"v3": scores("v3"), "v2_frozen": scores("v2_frozen")},
        "comparisons": {
            "v3_vs_v2_frozen": interval(pooled["v3"]["overall"]["log_loss_improvement"]),
            "B_vs_v2_frozen": interval(pooled["B"]["overall"]["log_loss_improvement"]),
            "v3_vs_B": interval(pooled["v3_vs_B"]["log_loss_improvement"]),
        },
        "by_phase": {
            phase: interval(pooled["v3"][phase]["log_loss_improvement"])
            for phase in ("first_half", "third_quarter", "fourth_early", "last_two", "overtime")
        },
        "by_season": {
            season: interval(report["results"][season]["v3"]["overall"]["log_loss_improvement"])
            for season in SPLITS["test"]
        },
        "pregame": report["pregame"],
        "selection": {
            name: {
                "accepted": bool(step["accepted"]),
                **(
                    {
                        "improvement_90": interval(step["improvement_90"]),
                        "judged_on": step["judged_on"],
                    }
                    if "improvement_90" in step
                    else {}
                ),
            }
            for name, step in state["steps"].items()
        },
    }
    write_json(PUBLISHED, body)
    print(json.dumps({k: body[k] for k in ("adopted", "games", "comparisons")}), flush=True)
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("pi", "pregame", "fit", "final", "test", "publish"))
    parser.add_argument("name", nargs="?")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if args.command == "pi":
        stage_pi(args.output)
    elif args.command == "pregame":
        stage_pregame(args.output)
    elif args.command == "fit":
        stage_fit(args.name, args.output)
    elif args.command == "final":
        stage_final(args.output)
    elif args.command == "test":
        stage_test(args.output)
    else:
        stage_publish(args.output)


if __name__ == "__main__":
    main()
