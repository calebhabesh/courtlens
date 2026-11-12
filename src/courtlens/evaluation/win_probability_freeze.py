"""Freeze the selected win-probability model (R15b).

Writes the committed manifest and model card under `evaluation/research/frozen/`, copies the three
model files into the artifact store, and records them in the artifact registry. It fits nothing
and does not read `run_test`: the drift interval comes from the saved test-season predictions.

The freeze refuses to run twice: a frozen model does not change. Any refit needs a new version.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain.win_probability_scorecard import ECE_BINS, calibration_error
from courtlens.evaluation.win_probability_data import OUTPUT, REGISTRATION
from courtlens.evaluation.win_probability_models import read_prediction, read_season
from courtlens.evaluation.win_probability_parity import manifest_from_ladder
from courtlens.services.win_probability_production import (
    CARD_PATH,
    MANIFEST_PATH,
    MODEL_DIRECTORY,
)
from courtlens.services.win_probability_serving import MANIFEST_SCHEMA, manifest_hash

EVIDENCE = Path("docs/evidence/research/r15a")
ADAPTER_SOURCES = (
    Path("src/courtlens/domain/win_probability_state.py"),
    Path("src/courtlens/domain/win_probability_live.py"),
)
TEST_SEASONS = ("2024-25", "2025-26")
WINDOW_SIZES = (25, 50, 75, 100, 150, 200, 250, 300, 400, 600, 800)
REPLICATES = 4000
SEED = 2501
RATING_CODE = Path("src/courtlens/evaluation/impact_history_ratings.py")
FROZEN_VERSION = "courtlens-win-probability-v2-frozen-2026-27"


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _selected(season: str) -> np.ndarray:
    return read_prediction(OUTPUT, "selected", season)


def per_game_bins(
    load: Callable[[str], np.ndarray] = _selected,
) -> tuple[np.ndarray, list[str]]:
    """Calibration bins per test game from saved predictions, as the scorecard stores them.

    `load` gives a season's saved predictions on v2's state rows (v4's drift reuses this)."""
    from courtlens.evaluation.win_probability_data import read_games

    dates = {g: e["date"] for g, e in read_games(OUTPUT)["games"].items()}
    blocks: list[np.ndarray] = []
    order: list[str] = []
    edges = np.linspace(0, 1, ECE_BINS + 1)
    for season in TEST_SEASONS:
        columns, games = read_season(season)
        p = load(season)
        win = columns["win_home"].astype(np.float64)
        index = columns["game_index"].astype(np.int64)
        counts = np.bincount(index, minlength=len(games))
        weight = 1.0 / counts[index]
        bins = np.clip(np.digitize(p, edges) - 1, 0, ECE_BINS - 1)
        out = np.zeros((len(games), ECE_BINS, 3))
        np.add.at(out[:, :, 0], (index, bins), weight)
        np.add.at(out[:, :, 1], (index, bins), weight * p)
        np.add.at(out[:, :, 2], (index, bins), weight * win)
        blocks.append(out)
        order.extend(dates[g] for g in games)
    return np.concatenate(blocks), order


def drift_interval(
    load: Callable[[str], np.ndarray] = _selected,
    source: str = "the saved selected-model predictions",
) -> dict[str, Any]:
    """How much calibration error varies by chance, for windows of each size, on the test seasons.

    Calibration error depends strongly on sample size, so the flag compares a window against
    windows of the same size. Each entry resamples whole games from the two test seasons.
    """
    bins, dates = per_game_bins(load)
    rng = np.random.default_rng(SEED)
    table = []
    for size in WINDOW_SIZES:
        picks = rng.integers(0, len(bins), size=(REPLICATES, size))
        pooled = bins[picks].sum(axis=1)
        mass = pooled[..., 0].sum(axis=1)
        errors = np.abs(pooled[..., 1] - pooled[..., 2]).sum(axis=1) / mass
        table.append(
            {
                "games": size,
                "low": float(np.quantile(errors, 0.025)),
                "high": float(np.quantile(errors, 0.975)),
                "median": float(np.median(errors)),
            }
        )
    order = np.argsort(dates, kind="stable")
    ordered_dates = np.array(dates)[order]
    ordered = bins[order]
    windows = []
    days = np.array([np.datetime64(d) for d in ordered_dates])
    for start in np.unique(days):
        chosen = (days >= start) & (days < start + np.timedelta64(30, "D"))
        if chosen.sum() >= 150:
            windows.append(calibration_error(ordered[chosen].sum(axis=0)))
    return {
        "method": (
            f"Game bootstrap of {source} for 2024-25 and 2025-26, "
            f"{REPLICATES} resamples per window size, 2.5th and 97.5th percentiles. No refit; "
            "run_test was not re-run."
        ),
        "all_test_games_calibration_error": calibration_error(bins.sum(axis=(0))),
        "by_window_games": table,
        "actual_30_day_windows": {
            "count": len(windows),
            "minimum": float(min(windows)),
            "maximum": float(max(windows)),
        },
    }


def model_card() -> dict[str, Any]:
    """Page content from the R15a evidence. RMSE comes from `pairs.json`: the report's is MSE."""
    report = json.loads((EVIDENCE / "test-report.json").read_text())
    benchmarks = json.loads((EVIDENCE / "benchmarks.json").read_text())
    pairs = json.loads((EVIDENCE / "pairs.json").read_text())
    ladder = json.loads((EVIDENCE / "ladder.json").read_text())
    pooled = report["results"]["pooled"]

    def block(name: str) -> dict[str, Any]:
        overall = pooled[name]["overall"]
        return {
            "log_loss": overall["log_loss"],
            "brier": overall["brier"],
            "calibration_error": overall["calibration"]["ece"],
            "gain_on_baseline": overall.get("log_loss_improvement"),
        }

    return {
        "version": REGISTRATION,
        "test_seasons": list(TEST_SEASONS),
        "test_games": sum(report["games"].values()),
        "gates": report["gates"],
        "models": {
            name: block(name)
            for name in (
                "selected",
                "S0",
                "S0g",
                "S1",
                "S2",
                "S3",
                "S4",
                "S5",
                "logistic",
                "classifier",
            )
        },
        "phases": {
            name: {
                "log_loss": pooled["selected"][name]["log_loss"],
                "brier": pooled["selected"][name]["brier"],
                "calibration_error": pooled["selected"][name]["calibration"]["ece"],
                "gain_on_baseline": pooled["selected"][name]["log_loss_improvement"],
                "curve": pooled["selected"][name]["calibration"]["curve"],
            }
            for name in (
                "overall",
                "first_half",
                "third_quarter",
                "fourth_early",
                "last_two",
                "overtime",
            )
        },
        "baseline_curve": pooled["S0"]["overall"]["calibration"]["curve"],
        "espn": benchmarks["espn"],
        "market": {
            "source": benchmarks["market"]["source"],
            "games": benchmarks["market"]["games"],
            "courtlens_rmse": benchmarks["market"]["courtlens_rmse"],
            "market_rmse": benchmarks["market"]["market_rmse"],
            "squared_error_gap": benchmarks["market"]["squared_error_gap"],
            "courtlens_winner_accuracy": benchmarks["market"]["courtlens_winner_accuracy"],
            "market_winner_accuracy": benchmarks["market"]["market_winner_accuracy"],
        },
        "pregame": {
            name: {"rmse": entry.get("rmse"), "winner_accuracy": entry.get("winner_accuracy")}
            for name, entry in pairs["pregame"].items()
        },
        "steps": {
            name: {
                "accepted": step.get("accepted"),
                "selection_gain": step.get("improvement_90"),
            }
            for name, step in ladder["steps"].items()
            if name != "S0"
        },
        "pairs": pairs["pairs"],
    }


def freeze() -> dict[str, Any]:
    if MANIFEST_PATH.exists():
        raise ValueError(f"{MANIFEST_PATH} exists: a frozen model does not change")
    now = datetime.now(UTC).isoformat(timespec="seconds")
    pregame = json.loads((OUTPUT / "pregame.json").read_text())
    body: dict[str, Any] = {
        "schema": MANIFEST_SCHEMA,
        "version": FROZEN_VERSION,
        "registration": REGISTRATION,
        "registration_sha256": json.loads((EVIDENCE / "test-report.json").read_text())[
            "registration"
        ]["content_sha256"],
        "frozen_at": now,
        "selected": "S2 plus the end-game specialist, not recalibrated",
        "trained_through": "2021-22",
        **manifest_from_ladder(),
        "pregame": {
            "coefficients": pregame["coefficients"],
            "form_half_life_days": pregame["form_half_life_days"],
            "rating_source": "courtlens-rating-snapshots-v1",
            "rating_rule": "newest snapshot with a cutoff on or before the game date",
            "rating_code_sha256": file_sha256(RATING_CODE),
            "player_rating": "time-decay RAPM; moving to Projected Impact needs a new version",
            "availability": (
                "newest ESPN roster minus players ESPN's injury report lists as Out, read when the "
                "slate is captured; late scratches are not known"
            ),
        },
        "espn_state_adapter": {str(path): file_sha256(path) for path in ADAPTER_SOURCES},
        "drift": drift_interval(),
    }
    body["manifest_sha256"] = manifest_hash(body)
    MODEL_DIRECTORY.mkdir(parents=True, exist_ok=True)
    for digest in body["models"].values():
        target = MODEL_DIRECTORY / f"{digest}.txt"
        if not target.exists():
            shutil.copyfile(OUTPUT / "models" / f"{digest}.txt", target)
        if file_sha256(target) != digest:
            raise ValueError("model file changed while copying")
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")
    CARD_PATH.write_text(json.dumps(model_card(), indent=1, sort_keys=True) + "\n")
    return body


def register_artifacts() -> list[dict[str, str]]:
    """Record the three files in the artifact registry; a repeat run reuses the rows."""
    from sqlalchemy import select

    from courtlens.database import SessionLocal
    from courtlens.workbench_models import WorkbenchArtifact

    manifest = json.loads(MANIFEST_PATH.read_text())
    out = []
    with SessionLocal() as session:
        for role, digest in manifest["models"].items():
            path = MODEL_DIRECTORY / f"{digest}.txt"
            resource = f"{manifest['version']}:{role}"[:100]
            existing = session.scalar(
                select(WorkbenchArtifact).where(
                    WorkbenchArtifact.sha256 == digest, WorkbenchArtifact.resource == resource
                )
            )
            if existing is None:
                existing = WorkbenchArtifact(
                    sha256=digest,
                    resource=resource,
                    bytes=path.stat().st_size,
                    storage_path=str(path),
                    mime_type="text/plain",
                    source_attribution=(
                        f"CourtLens {manifest['registration']}, trained through "
                        f"{manifest['trained_through']}; frozen {manifest['frozen_at']}"
                    ),
                )
                session.add(existing)
                session.flush()
            out.append({"role": role, "sha256": digest, "artifact_id": existing.id})
        session.commit()
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    body = freeze()
    print(json.dumps({k: body[k] for k in ("version", "frozen_at", "manifest_sha256", "models")}))
    print(json.dumps(register_artifacts()))


if __name__ == "__main__":
    main()
