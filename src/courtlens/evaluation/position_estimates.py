"""Explicit offline run: estimated five-position labels (PG, SG, SF, PF, C) per player-season.

Contract: docs/design/position-estimates-v1.md. Free sources list only G, F and C (NBA roster
index); NBA Draft Combine rows carry a five-position label, but only for combine attendees. A
multinomial logistic regression learns the combine labels from the listed position, listed body
size and that season's own box-score rates, is evaluated out of sample by player, and then labels
every player-season. The result is a descriptive estimate, never a listing or a forecast feature.

Run: python -m courtlens.evaluation.position_estimates --database-url postgresql+psycopg://...
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import sklearn  # type: ignore[import-untyped]
from sklearn.linear_model import LogisticRegression  # type: ignore[import-untyped]
from sklearn.model_selection import GroupKFold  # type: ignore[import-untyped]
from sklearn.preprocessing import StandardScaler  # type: ignore[import-untyped]
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session
from threadpoolctl import threadpool_limits  # type: ignore[import-untyped]

from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file

VERSION = "courtlens-position-estimates-v1"
CONTRACT = "docs/design/position-estimates-v1.md"
POSITIONS = ("PG", "SG", "SF", "PF", "C")
# Box rates per 36 minutes, shrunk toward the listed-position mean with this many minutes.
RATE_FIELDS = ("ast", "oreb", "dreb", "blk", "stl", "fg3a", "fta", "pts")
PRIOR_MINUTES = 300.0
# Shares separate lead guards from scorers and bigs beyond raw volume.
RATIO_FEATURES = ("ast_share", "three_per_point", "reb_per_ast", "log_ast", "log_blk", "log_oreb")
FEATURES = (
    "height_inches",
    "weight_pounds",
    "listed_g",
    "listed_f",
    "listed_c",
    *RATE_FIELDS,
    *RATIO_FEATURES,
)
SEED = 20261012


@dataclass(frozen=True)
class Sample:
    season: str
    player_id: str
    minutes: float
    listed: str | None
    height: float | None
    weight: float | None
    totals: dict[str, float]


def listed_flags(listed: str | None) -> tuple[float, float, float]:
    parts = set((listed or "").split("-"))
    return float("G" in parts), float("F" in parts), float("C" in parts)


def listed_group(listed: str | None) -> str:
    """Bucket for priors: the first listed letter, or unknown."""
    return (listed or "?").split("-")[0] or "?"


def feature_matrix(samples: list[Sample], reference: list[Sample] | None = None) -> np.ndarray:
    """Rates shrink toward the listed group's league rate; missing size takes the group median.

    Group priors come from `reference` (default: the samples themselves), so a frozen model can
    score new seasons against the population it was trained on.
    """
    pooled: dict[str, Counter[str]] = defaultdict(Counter)
    minutes: dict[str, float] = defaultdict(float)
    sizes: dict[str, dict[str, list[float]]] = defaultdict(lambda: {"h": [], "w": []})
    population = samples if reference is None else reference
    for s in population:
        group = listed_group(s.listed)
        minutes[group] += s.minutes
        for field in RATE_FIELDS:
            pooled[group][field] += int(s.totals[field])
        if s.height is not None:
            sizes[group]["h"].append(s.height)
        if s.weight is not None:
            sizes[group]["w"].append(s.weight)
    all_heights = [s.height for s in population if s.height is not None]
    all_weights = [s.weight for s in population if s.weight is not None]
    # A listing group absent from the reference (only possible when scoring new seasons) shrinks
    # toward the whole league instead of toward nothing.
    league: Counter[str] = sum(pooled.values(), Counter())
    league_minutes = sum(minutes.values())
    rows = []
    for s in samples:
        group = listed_group(s.listed)
        heights = sizes[group]["h"] or all_heights
        weights = sizes[group]["w"] or all_weights
        prior, prior_minutes = (
            (pooled[group], minutes[group]) if minutes.get(group) else (league, league_minutes)
        )
        rates = [
            36.0
            * (s.totals[field] + PRIOR_MINUTES * prior[field] / max(prior_minutes, 1.0))
            / (s.minutes + PRIOR_MINUTES)
            for field in RATE_FIELDS
        ]
        rate = dict(zip(RATE_FIELDS, rates, strict=True))
        ratios = [
            rate["ast"] / (rate["ast"] + rate["pts"]),
            rate["fg3a"] / rate["pts"],
            (rate["oreb"] + rate["dreb"]) / (rate["ast"] + 1.0),
            float(np.log(rate["ast"] + 0.5)),
            float(np.log(rate["blk"] + 0.2)),
            float(np.log(rate["oreb"] + 0.2)),
        ]
        rows.append(
            [
                s.height if s.height is not None else float(np.median(heights)),
                s.weight if s.weight is not None else float(np.median(weights)),
                *listed_flags(s.listed),
                *rates,
                *ratios,
            ]
        )
    return np.asarray(rows, dtype=float)


def _model() -> tuple[StandardScaler, LogisticRegression]:
    return StandardScaler(), LogisticRegression(C=3.0, max_iter=5000, random_state=SEED)


def fit(x: np.ndarray, y: np.ndarray) -> tuple[StandardScaler, LogisticRegression]:
    scaler, model = _model()
    model.fit(scaler.fit_transform(x), y)
    return scaler, model


# The NBA listing bounds the estimate: G is a guard spot, F a forward spot, C a center; a
# hybrid listing (G-F, F-C, ...) allows both families. An unlisted player is unbounded.
LISTED_POSITIONS = {"G": ("PG", "SG"), "F": ("SF", "PF"), "C": ("C",)}


def allowed_mask(listed: list[str | None]) -> np.ndarray:
    mask = np.ones((len(listed), len(POSITIONS)), dtype=bool)
    for row, value in enumerate(listed):
        allowed = {p for part in (value or "").split("-") for p in LISTED_POSITIONS.get(part, ())}
        if allowed:
            mask[row] = [p in allowed for p in POSITIONS]
    return mask


def bounded(probabilities: np.ndarray, mask: np.ndarray) -> np.ndarray:
    kept = probabilities * mask
    return np.asarray(kept / kept.sum(axis=1, keepdims=True))


def evaluate(
    x: np.ndarray, y: np.ndarray, groups: np.ndarray, columns: list[int], mask: np.ndarray
) -> dict[str, Any]:
    """Five folds grouped by player, so no player is scored by a model that saw them."""
    predicted = np.empty_like(y)
    for train, test in GroupKFold(n_splits=5).split(x, y, groups):
        scaler, model = fit(x[train][:, columns], y[train])
        probabilities = model.predict_proba(scaler.transform(x[test][:, columns]))
        predicted[test] = np.argmax(bounded(probabilities, mask[test]), axis=1)
    distance = np.abs(predicted - y)
    confusion = [[int(np.sum((y == a) & (predicted == b))) for b in range(5)] for a in range(5)]
    return {
        "samples": len(y),
        "players": len(set(groups.tolist())),
        "accuracy": round(float(np.mean(distance == 0)), 4),
        "within_one": round(float(np.mean(distance <= 1)), 4),
        "confusion": {"rows_true_cols_predicted": list(POSITIONS), "counts": confusion},
    }


def estimate(samples: list[Sample], labels: dict[str, str]) -> dict[str, Any]:
    x = feature_matrix(samples)
    labelled = [i for i, s in enumerate(samples) if s.player_id in labels and s.minutes >= 100]
    y = np.asarray([POSITIONS.index(labels[samples[i].player_id]) for i in labelled])
    groups = np.asarray([samples[i].player_id for i in labelled])
    xl = x[labelled]
    mask = allowed_mask([s.listed for s in samples])
    unbounded = np.ones_like(mask[labelled])
    all_columns = list(range(len(FEATURES)))
    size_only = [FEATURES.index(f) for f in ("height_inches", "weight_pounds")] + [2, 3, 4]
    evaluation = {
        "model": evaluate(xl, y, groups, all_columns, mask[labelled]),
        "model_without_listing_bound": evaluate(xl, y, groups, all_columns, unbounded),
        "baseline_listed_size_only": evaluate(xl, y, groups, size_only, mask[labelled]),
    }
    scaler, model = fit(xl, y)
    probabilities = bounded(model.predict_proba(scaler.transform(x)), mask)
    seasons: dict[str, dict[str, Any]] = defaultdict(dict)
    for sample, probs in zip(samples, probabilities, strict=True):
        best = int(np.argmax(probs))
        seasons[sample.season][sample.player_id] = {
            "position": POSITIONS[best],
            "probability": round(float(probs[best]), 3),
            "probabilities": [round(float(p), 3) for p in probs],
            "minutes": round(sample.minutes, 1),
            "listed": sample.listed,
        }
    return {
        "features": list(FEATURES),
        "prior_minutes": PRIOR_MINUTES,
        "training": {
            "label_source": "NBA Draft Combine position, first listed (e.g. SG-PG -> SG)",
            "minimum_minutes": 100,
            "class_counts": {p: int(np.sum(y == i)) for i, p in enumerate(POSITIONS)},
        },
        "coefficients": {
            "scaler_mean": [round(float(v), 6) for v in scaler.mean_],
            "scaler_scale": [round(float(v), 6) for v in scaler.scale_],
            "intercept": [round(float(v), 6) for v in model.intercept_],
            "weights": [[round(float(v), 6) for v in row] for row in model.coef_],
        },
        "evaluation": evaluation,
        "seasons": {season: dict(sorted(rows.items())) for season, rows in sorted(seasons.items())},
    }


def frozen_probabilities(
    samples: list[Sample], reference: list[Sample], coefficients: dict[str, Any]
) -> np.ndarray:
    """Apply a sealed run's scaler and multinomial coefficients without refitting."""
    x = feature_matrix(samples, reference)
    z = (x - np.asarray(coefficients["scaler_mean"])) / np.asarray(coefficients["scaler_scale"])
    logits = z @ np.asarray(coefficients["weights"]).T + np.asarray(coefficients["intercept"])
    exp = np.exp(logits - logits.max(axis=1, keepdims=True))
    return bounded(exp / exp.sum(axis=1, keepdims=True), allowed_mask([s.listed for s in samples]))


def extend(samples: list[Sample], sealed: dict[str, Any]) -> dict[str, Any]:
    """Label seasons a sealed run never saw with its frozen model; sealed seasons stay verbatim.

    Re-scoring the sealed seasons must reproduce every sealed label first, proving the inputs and
    priors match the original run; otherwise nothing is written.
    """
    sealed_seasons = sealed["seasons"]
    reference = [s for s in samples if s.season in sealed_seasons]
    check = frozen_probabilities(reference, reference, sealed["coefficients"])
    mismatched = [
        (s.season, s.player_id)
        for s, probs in zip(reference, check, strict=True)
        if sealed_seasons.get(s.season, {}).get(s.player_id, {}).get("position")
        != POSITIONS[int(np.argmax(probs))]
    ]
    if mismatched or sum(map(len, sealed_seasons.values())) != len(reference):
        raise ValueError(f"frozen model does not reproduce the sealed run: {mismatched[:5]}")
    added = [s for s in samples if s.season not in sealed_seasons]
    seasons: dict[str, dict[str, Any]] = defaultdict(dict)
    probabilities = frozen_probabilities(added, reference, sealed["coefficients"])
    for sample, probs in zip(added, probabilities, strict=True):
        best = int(np.argmax(probs))
        seasons[sample.season][sample.player_id] = {
            "position": POSITIONS[best],
            "probability": round(float(probs[best]), 3),
            "probabilities": [round(float(p), 3) for p in probs],
            "minutes": round(sample.minutes, 1),
            "listed": sample.listed,
        }
    return {
        **{key: sealed[key] for key in ("features", "prior_minutes", "training", "coefficients")},
        "evaluation": sealed["evaluation"],
        "seasons": {
            season: dict(sorted(rows.items()))
            for season, rows in sorted({**sealed_seasons, **seasons}.items())
        },
        "extension": {
            "frozen_from_sha256": hashlib.sha256(
                json.dumps(sealed, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest(),
            "sealed_seasons_reproduced": len(reference),
            "added_seasons": sorted(seasons),
            "added_player_seasons": len(added),
        },
    }


def read_inputs(database_url: str) -> tuple[list[Sample], dict[str, str], dict[str, Any]]:
    """One read-only pass over the served season marts, roster index and combine mart."""
    from courtlens.player_context_models import PlayerContextDataset
    from courtlens.services.player_context import dataset_rows

    engine = create_engine(database_url)
    try:
        with Session(engine) as session:
            session.execute(text("SET TRANSACTION READ ONLY"))
            index = session.scalars(
                select(PlayerContextDataset)
                .where(PlayerContextDataset.kind == "player_index")
                .order_by(
                    PlayerContextDataset.observed_at.desc(),
                    PlayerContextDataset.observation_order.desc(),
                )
                .limit(1)
            ).first()
            if index is None:
                raise ValueError("no player index dataset has been admitted")
            roster = {str(r["player_id"]): r for r in dataset_rows(session, index)}
            box = session.execute(
                text(
                    "SELECT m.season, m.player_id, d.content_sha256, "
                    "sum(m.total_minutes) AS minutes, sum(m.assists_total) AS ast, "
                    "sum(m.rebounds_offensive_total) AS oreb, "
                    "sum(m.rebounds_defensive_total) AS dreb, sum(m.blocks_total) AS blk, "
                    "sum(m.steals_total) AS stl, sum(m.three_pointers_attempted) AS fg3a, "
                    "sum(m.free_throws_attempted) AS fta, sum(m.points_total) AS pts, "
                    "bool_or(m.phase = 'regular_season') AS regular "
                    "FROM analytics_marts.mart_workbench_player_season_stats m "
                    "JOIN workbench_datasets d ON d.id = m.dataset_id "
                    "GROUP BY m.season, m.player_id, d.content_sha256, "
                    "(m.phase = 'regular_season') "
                    "HAVING sum(m.total_minutes) > 0"
                )
            ).all()
            combine = session.execute(
                text(
                    "SELECT player_id, draft_year, combine_position, stats_dataset_id "
                    "FROM analytics_marts.mart_stats_draft_combine "
                    "WHERE player_id IS NOT NULL AND player_id NOT IN ('', '-1') "
                    "AND combine_position <> ''"
                )
            ).all()
    finally:
        engine.dispose()
    datasets = sorted({r.content_sha256 for r in box})
    if len(datasets) != 1:
        raise ValueError("expected one served workbench dataset")
    # Regular-season rates when the player has them, otherwise every phase that season.
    chosen: dict[tuple[str, str], Any] = {}
    for r in box:
        key = (r.season, str(r.player_id))
        if key not in chosen or (r.regular and not chosen[key].regular):
            chosen[key] = r
    samples = []
    for (season, pid), r in sorted(chosen.items()):
        listing = roster.get(pid, {})
        samples.append(
            Sample(
                season=season,
                player_id=pid,
                minutes=float(r.minutes),
                listed=listing.get("listed_position"),
                height=float(listing["height_inches"]) if listing.get("height_inches") else None,
                weight=float(listing["weight_pounds"]) if listing.get("weight_pounds") else None,
                totals={f: float(getattr(r, f) or 0) for f in RATE_FIELDS},
            )
        )
    # A player's latest combine label (some attended twice).
    labels: dict[str, str] = {}
    for row in sorted(combine, key=lambda r: (str(r.player_id), int(r.draft_year))):
        labels[str(row.player_id)] = str(row.combine_position).split("-")[0]
    provenance = {
        "workbench_dataset_sha256": datasets[0],
        "player_index_dataset_id": str(index.id),
        "player_index_observed_at": index.observed_at.isoformat(),
        "combine_datasets": sorted({str(r.stats_dataset_id) for r in combine}),
        "player_seasons": len(samples),
        "labelled_players": len(labels),
    }
    return samples, labels, provenance


def run(database_url: str, output: Path, extend_from: Path | None = None) -> Path:
    if sklearn.__version__ != "1.6.1":
        raise ValueError("position estimates require pinned scikit-learn 1.6.1")
    samples, labels, provenance = read_inputs(database_url)
    with threadpool_limits(limits=1):
        result = (
            extend(samples, json.loads(extend_from.read_bytes()))
            if extend_from is not None
            else estimate(samples, labels)
        )
    artifact = {
        "version": VERSION,
        "claim": "estimated position from listed position, size and box rates; not a listing",
        "input": {**provenance, "samples_sha256": content_hash([s.__dict__ for s in samples])},
        "implementation": {
            name: hash_file(Path(name))[0]
            for name in ("src/courtlens/evaluation/position_estimates.py", CONTRACT)
        },
        "dependencies": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "sklearn": sklearn.__version__,
        },
        **result,
    }
    path, digest = write_artifact(output, artifact)
    print(
        json.dumps(
            {
                "artifact": str(path),
                "sha256": digest,
                "evaluation": result["evaluation"],
                "observed_at": datetime.now(UTC).isoformat(),
            },
            indent=2,
        ),
        flush=True,
    )
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", required=True, help="Read-only PostgreSQL URL")
    parser.add_argument("--output", type=Path, default=Path("data/derived/position-estimates-v1"))
    parser.add_argument(
        "--extend-from",
        type=Path,
        help="Sealed artifact whose frozen model labels only seasons it has not seen",
    )
    args = parser.parse_args()
    run(args.database_url, args.output, args.extend_from)


if __name__ == "__main__":
    main()
