"""PC09 value metric and derived archetypes; offline, descriptive, never forecast inputs."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

import numpy as np
from sklearn.mixture import GaussianMixture  # type: ignore[import-untyped]
from sklearn.preprocessing import StandardScaler  # type: ignore[import-untyped]

VALUE_VERSION = "courtlens-value-v1"
ARCHETYPE_VERSION = "courtlens-archetypes-v1"
EVALUATION_VERSION = "courtlens-value-evaluation-v1"
QUALIFYING_SECONDS = 500 * 60
COMPONENTS = (6, 7, 8)
SEED = 2509
N_INIT = 10
FEATURES = (
    "usg_pct",
    "ast_pct",
    "three_rate",
    "rim_rate",
    "oreb_pct",
    "dreb_pct",
    "blk_pct",
    "stl_pct",
    "ft_rate",
)
BOX_FIELDS = (
    "field_goals_made",
    "field_goals_attempted",
    "three_pointers_attempted",
    "free_throws_attempted",
    "turnovers",
    "assists",
    "rebounds_offensive",
    "rebounds_defensive",
    "steals",
    "blocks",
)


@dataclass(frozen=True)
class PlayerGame:
    season: str
    game: str
    team: str
    player: str
    seconds: float
    box: Mapping[str, float]


@dataclass(frozen=True)
class TeamGame:
    season: str
    game: str
    team: str
    opponent: str
    box: Mapping[str, float]


def possessions(team: Mapping[str, float], opponent: Mapping[str, float]) -> float:
    """Basic possession estimate; used only as a steal-rate denominator."""
    return (
        team["field_goals_attempted"]
        + 0.44 * team["free_throws_attempted"]
        - team["rebounds_offensive"]
        + team["turnovers"]
    )


def season_features(
    player_games: Iterable[PlayerGame],
    team_games: Iterable[TeamGame],
    shots: Mapping[tuple[str, str], tuple[int, int]],
) -> tuple[dict[str, dict[str, Any]], dict[str, int]]:
    """Sum player numerators and per-game team-share denominators for each player-season.

    Shares follow the Basketball-Reference definitions applied game by game, so traded
    players use each game's own team context. Team-games with any unknown minutes are
    excluded entirely; undefined rates (zero denominators) stay null, never zero.
    ``shots`` maps (season, player) to (restricted-area FGA, zone-known FGA).
    """
    teams = {(t.game, t.team): t for t in team_games}
    by_team_game: dict[tuple[str, str], list[PlayerGame]] = defaultdict(list)
    for row in player_games:
        by_team_game[row.game, row.team].append(row)
    totals: dict[tuple[str, str], defaultdict[str, float]] = {}
    games: dict[tuple[str, str], set[str]] = defaultdict(set)
    omitted = {"team_games_unknown_minutes": 0, "team_games_missing_box": 0}
    for key, rows in sorted(by_team_game.items()):
        team = teams.get(key)
        opponent = teams.get((key[0], team.opponent)) if team else None
        if team is None or opponent is None:
            omitted["team_games_missing_box"] += 1
            continue
        if any(not np.isfinite(r.seconds) or r.seconds < 0 for r in rows):
            omitted["team_games_unknown_minutes"] += 1
            continue
        team_seconds = sum(r.seconds for r in rows)
        if team_seconds <= 0:
            omitted["team_games_unknown_minutes"] += 1
            continue
        t, o = team.box, opponent.box
        for r in rows:
            if r.seconds <= 0:
                continue
            share = r.seconds / (team_seconds / 5)
            sums = totals.setdefault((r.season, r.player), defaultdict(float))
            games[r.season, r.player].add(r.game)
            sums["seconds"] += r.seconds
            for f in BOX_FIELDS:
                sums[f] += r.box[f]
            sums["usg_den"] += share * (
                t["field_goals_attempted"] + 0.44 * t["free_throws_attempted"] + t["turnovers"]
            )
            sums["ast_den"] += share * t["field_goals_made"] - r.box["field_goals_made"]
            sums["oreb_den"] += share * (t["rebounds_offensive"] + o["rebounds_defensive"])
            sums["dreb_den"] += share * (t["rebounds_defensive"] + o["rebounds_offensive"])
            sums["blk_den"] += share * (o["field_goals_attempted"] - o["three_pointers_attempted"])
            sums["stl_den"] += share * possessions(o, t)
    result = {}
    for (season, player), s in sorted(totals.items()):
        rim, known = shots.get((season, player), (0, 0))

        def ratio(numerator: float, denominator: float, scale: float = 1.0) -> float | None:
            return scale * numerator / denominator if denominator > 0 else None

        values = {
            "usg_pct": ratio(
                s["field_goals_attempted"] + 0.44 * s["free_throws_attempted"] + s["turnovers"],
                s["usg_den"],
                100,
            ),
            "ast_pct": ratio(s["assists"], s["ast_den"], 100),
            "three_rate": ratio(s["three_pointers_attempted"], s["field_goals_attempted"]),
            "rim_rate": ratio(rim, known),
            "oreb_pct": ratio(s["rebounds_offensive"], s["oreb_den"], 100),
            "dreb_pct": ratio(s["rebounds_defensive"], s["dreb_den"], 100),
            "blk_pct": ratio(s["blocks"], s["blk_den"], 100),
            "stl_pct": ratio(s["steals"], s["stl_den"], 100),
            "ft_rate": ratio(s["free_throws_attempted"], s["field_goals_attempted"]),
        }
        result[f"{season}:{player}"] = {
            "season": season,
            "player_id": player,
            "seconds": s["seconds"],
            "games": len(games[season, player]),
            "qualified": s["seconds"] >= QUALIFYING_SECONDS,
            "features": values,
            "complete": all(v is not None and np.isfinite(v) for v in values.values()),
        }
    return result, omitted


def fit_archetypes(rows: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    """Fit a full-covariance GMM on qualified complete samples; K is the BIC minimum."""
    train = sorted(k for k, r in rows.items() if r["qualified"] and r["complete"])
    if len(train) < 10 * max(COMPONENTS):
        raise ValueError("too few qualified complete player-seasons for archetypes")
    x = np.array([[rows[k]["features"][f] for f in FEATURES] for k in train])
    scaler = StandardScaler().fit(x)
    z = scaler.transform(x)
    candidates = {}
    for k in COMPONENTS:
        model = GaussianMixture(
            n_components=k, covariance_type="full", n_init=N_INIT, random_state=SEED
        ).fit(z)
        if not model.converged_:
            raise ValueError("archetype mixture did not converge")
        candidates[k] = (float(model.bic(z)), model)
    chosen = min(COMPONENTS, key=lambda k: (candidates[k][0], k))
    model = candidates[chosen][1]
    # Canonical cluster order (largest share first) so labels never depend on EM init order.
    order = np.argsort(-model.weights_, kind="stable")
    rank = {int(old): new for new, old in enumerate(order)}
    means = scaler.inverse_transform(model.means_)[order]
    members = {}
    for key, r in sorted(rows.items()):
        if not r["complete"]:
            continue
        p = model.predict_proba(scaler.transform(np.array([[r["features"][f] for f in FEATURES]])))[
            0
        ]
        probabilities = [0.0] * chosen
        for old, value in enumerate(p):
            probabilities[rank[old]] = round(float(value), 6)
        members[key] = {
            "membership": probabilities,
            "primary": int(np.argmax(probabilities)),
            "training": key in set(train),
        }
    return {
        "components": chosen,
        "bic": {str(k): v[0] for k, v in candidates.items()},
        "seed": SEED,
        "n_init": N_INIT,
        "covariance_type": "full",
        "features": list(FEATURES),
        "training_samples": train,
        "standardizer_mean": scaler.mean_.tolist(),
        "standardizer_scale": scaler.scale_.tolist(),
        "weights": model.weights_[order].tolist(),
        "means": means.tolist(),
        "covariances": model.covariances_[order].tolist(),
        "members": members,
    }


def _players(artifact: Mapping[str, Any], key: str) -> dict[str, Any]:
    block = artifact.get(key)
    return dict(block["players"]) if block else {}


def select_value_artifact(artifacts: Iterable[Mapping[str, Any]]) -> Mapping[str, Any]:
    """Fixed rule: latest completed regular season, longest window with an available BPR."""
    eligible = [
        a for a in artifacts if a["input"]["phase"] == "regular_season" and a.get("bpr") is not None
    ]
    if not eligible:
        raise ValueError("no regular-season BPR artifact")
    return max(eligible, key=lambda a: (a["input"]["seasons"][-1], len(a["input"]["seasons"])))


def value_rows(artifact: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    rows = {}
    for player, r in sorted(_players(artifact, "bpr").items()):
        rows[player] = {
            "value": r["total"],
            "offense": r["offense"],
            "defense": r["defense"],
            "value_percentile": r["total_percentile"],
            "seconds": r["seconds"],
            "games": r["games"],
            "qualified": r["qualified"],
            "prior_available": r["prior_available"],
        }
    return rows


def _weighted_pearson(x: Any, y: Any, w: Any) -> float | None:
    if len(x) < 3:
        return None
    mx, my = np.average(x, weights=w), np.average(y, weights=w)
    sx = np.average((x - mx) ** 2, weights=w)
    sy = np.average((y - my) ** 2, weights=w)
    if sx <= 0 or sy <= 0:
        return None
    return float(np.average((x - mx) * (y - my), weights=w) / np.sqrt(sx * sy))


def score_predictors(
    target: Mapping[str, Mapping[str, Any]], predictors: Mapping[str, Mapping[str, float]]
) -> dict[str, Any]:
    """Score every predictor on the shared qualified cohort; no missing value becomes zero."""
    qualified = sorted(p for p, r in target.items() if r["qualified"])
    shared = [p for p in qualified if all(p in values for values in predictors.values())]
    y = np.array([target[p]["total"] for p in shared])
    w = np.array([target[p]["seconds"] for p in shared])
    scores = {}
    for name, values in {"zero": dict.fromkeys(shared, 0.0), **predictors}.items():
        x = np.array([values[p] for p in shared])
        scores[name] = {
            "weighted_rmse": float(np.sqrt(np.average((y - x) ** 2, weights=w)))
            if len(shared)
            else None,
            "weighted_pearson": _weighted_pearson(x, y, w) if name != "zero" else None,
            "coverage": sum(p in values for p in qualified) if name != "zero" else len(qualified),
        }
    return {
        "qualified_target_players": len(qualified),
        "shared_players": len(shared),
        "excluded_missing_predictor": len(qualified) - len(shared),
        "scores": scores,
    }


def prior_totals(artifact: Mapping[str, Any]) -> dict[str, float]:
    """Box-prior totals in favorable sign: offense - raw defense coefficient."""
    priors = artifact["bpr_prior"].get("player_priors") or {}
    return {p: float(o - d) for p, (o, d) in priors.items()}


def evaluation(artifacts: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    """Out-of-time folds: predict a season's 1Y RAPM using only earlier-season artifacts."""
    regular = [a for a in artifacts if a["input"]["phase"] == "regular_season"]
    one_year = {a["input"]["seasons"][0]: a for a in regular if len(a["input"]["seasons"]) == 1}
    folds = []
    for season in sorted(one_year)[1:]:
        target = _players(one_year[season], "rapm")
        earlier = [a for a in regular if a["input"]["seasons"][-1] < season]
        predictors: dict[str, dict[str, float]] = {}
        sources = {}
        for a in sorted(earlier, key=lambda a: (len(a["input"]["seasons"]), a["input"]["seasons"])):
            label = f"{len(a['input']['seasons'])}Y ending {a['input']['seasons'][-1]}"
            if a["input"]["seasons"][-1] != max(e["input"]["seasons"][-1] for e in earlier):
                continue
            predictors[f"rapm {label}"] = {p: r["total"] for p, r in _players(a, "rapm").items()}
            if a.get("bpr"):
                predictors[f"bpr {label}"] = {p: r["total"] for p, r in _players(a, "bpr").items()}
        # The target season's own box prior is fitted on earlier targets and earlier box only.
        if one_year[season]["bpr_prior"]["status"] == "available":
            predictors["box prior (earlier seasons)"] = prior_totals(one_year[season])
            sources["box prior (earlier seasons)"] = one_year[season]["bpr_prior"][
                "target_artifacts"
            ]
        if not predictors:
            continue
        folds.append(
            {
                "target_season": season,
                "target": "1Y regular-season RAPM, qualified players",
                "predictors": sorted(predictors),
                "prior_sources": sources,
                **score_predictors(target, predictors),
            }
        )
    return {
        "version": EVALUATION_VERSION,
        "claim": "out-of-time descriptive diagnostic; not a promotion gate or forecast",
        "folds": folds,
    }
