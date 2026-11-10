"""Frozen 2026-27 projections and their weekly game-level score (`courtlens-projected-impact-v1`).

The API reads hashed files only. `weekly` scores 2026-27 games from retained boxes, one row per
game, appended once. A game counts as prospective only if its scheduled tip was after the freeze;
earlier games are labelled hindsight. The projections never change: a refit needs a new version.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from courtlens.config import get_settings
from courtlens.domain.projected_impact import (
    TIP_OFF_LABEL_HINDSIGHT,
    TIP_OFF_LABEL_PROSPECTIVE,
    predicted_margin,
    prospective_label,
    strength_difference,
)

MANIFEST_PATH = Path("evaluation/research/frozen/courtlens-projected-impact-v1.json")
CARD_PATH = Path("evaluation/research/frozen/courtlens-projected-impact-v1-card.json")
SEASON_END_YEAR = 2027
MINIMUM_GAMES_FOR_INTERVAL = 20
RATINGS = ("lightgbm", "ridge", "age_curve", "time_decay", "carry_forward")
WEEKLY_DAYS = 7
_cache: dict[str, Any] = {}


def serving_root() -> Path:
    return get_settings().projected_impact_serving_dir


def load_manifest() -> dict[str, Any]:
    manifest: dict[str, Any] = json.loads(MANIFEST_PATH.read_text())
    body = {k: v for k, v in manifest.items() if k != "manifest_sha256"}
    if hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest() != manifest.get(
        "manifest_sha256"
    ):
        raise ValueError("the projected-impact manifest changed")
    return manifest


def load_projections() -> dict[str, Any]:
    """The frozen file, refused unless its bytes match the committed hash."""
    manifest = load_manifest()
    digest = manifest["projections_sha256"]
    if _cache.get("digest") == digest:
        return dict(_cache["body"])
    path = get_settings().projected_impact_models_dir / f"{digest}.json"
    payload = path.read_bytes()
    if hashlib.sha256(payload).hexdigest() != digest:
        raise ValueError("the frozen projections do not match their recorded hash")
    body: dict[str, Any] = json.loads(payload)
    _cache.update(digest=digest, body=body)
    return dict(body)


def ratings_table(projections: dict[str, Any]) -> dict[str, dict[str, float]]:
    return {
        name: {row["player_id"]: row["ratings"][name] for row in projections["players"]}
        for name in RATINGS
    }


def score_game(
    game: dict[str, Any],
    tables: dict[str, dict[str, float]],
    manifest: dict[str, Any],
    tip_utc: str | None,
) -> dict[str, Any]:
    predictions = {}
    unprojected = total = 0.0
    for name, table in tables.items():
        strength = strength_difference(game["players"], table, manifest["fallback_rating"])
        mapping = manifest["game_mapping"][name]
        predictions[name] = predicted_margin(strength.difference, mapping["a"], mapping["b"])
        unprojected, total = strength.unprojected_seconds, strength.total_seconds
    return {
        "game_id": game["game_id"],
        "date": game["date"],
        "tip_utc": tip_utc,
        "label": prospective_label(tip_utc, manifest["frozen_at"]),
        "home": game["home"],
        "away": game["away"],
        "margin": game["margin"],
        "predicted": predictions,
        "unprojected_seconds": unprojected,
        "total_seconds": total,
        "projections_sha256": manifest["projections_sha256"],
    }


def _games_path() -> Path:
    return serving_root() / "games.jsonl"


def read_rows() -> list[dict[str, Any]]:
    path = _games_path()
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def summarize(rows: list[dict[str, Any]], manifest: dict[str, Any]) -> dict[str, Any]:
    """Margin error per rating for one label's games, with paired game-bootstrap gaps."""
    import numpy as np

    from courtlens.evaluation.projected_impact_models import paired_gap

    def group(chosen: list[dict[str, Any]]) -> dict[str, Any]:
        out: dict[str, Any] = {"games": len(chosen)}
        if not chosen:
            return out
        margin = np.array([r["margin"] for r in chosen])
        predicted = {name: np.array([r["predicted"][name] for r in chosen]) for name in RATINGS}
        decided = margin != 0
        out["ratings"] = {
            name: {
                "rmse": float(np.sqrt(np.mean((margin - p) ** 2))),
                "winner_accuracy": float(np.mean(np.sign(p[decided]) == np.sign(margin[decided])))
                if decided.any()
                else None,
            }
            for name, p in predicted.items()
        }
        seconds = sum(r["total_seconds"] for r in chosen)
        out["unprojected_minutes_share"] = (
            sum(r["unprojected_seconds"] for r in chosen) / seconds if seconds else 0.0
        )
        if len(chosen) >= MINIMUM_GAMES_FOR_INTERVAL:
            units = np.array([r["game_id"] for r in chosen])
            weight = np.ones(len(chosen))
            seed = 2701
            selected = manifest["selected"]
            out["gaps"] = {
                f"{name}_over_{base}": paired_gap(
                    units, margin, predicted[base], predicted[name], weight, seed, 2000
                )
                for base in ("carry_forward", "time_decay")
                for name in sorted({selected, "ridge"} - {base})
            }
        return out

    prospective = [r for r in rows if r["label"] == TIP_OFF_LABEL_PROSPECTIVE]
    hindsight = [r for r in rows if r["label"] == TIP_OFF_LABEL_HINDSIGHT]
    weekly = []
    if prospective:
        ordered = sorted(prospective, key=lambda r: r["date"])
        first = datetime.fromisoformat(ordered[0]["date"]).date()
        week = 0
        while True:
            end = first + timedelta(days=7 * (week + 1))
            cumulative = [r for r in ordered if r["date"] < end.isoformat()]
            weekly.append({"through": (end - timedelta(days=1)).isoformat(), **group(cumulative)})
            if len(cumulative) == len(ordered):
                break
            week += 1
    return {
        "version": manifest["version"],
        "projections_sha256": manifest["projections_sha256"],
        "frozen_at": manifest["frozen_at"],
        "scored_through": max((r["date"] for r in rows), default=None),
        "written_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "prospective": group(prospective),
        "hindsight": group(hindsight),
        "prospective_by_week": weekly,
    }


def write_summary(rows: list[dict[str, Any]], manifest: dict[str, Any]) -> dict[str, Any]:
    summary = summarize(rows, manifest)
    path = serving_root() / "summary.json"
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(summary, indent=1, sort_keys=True))
    os.replace(temporary, path)
    return summary


def read_summary() -> dict[str, Any] | None:
    path = serving_root() / "summary.json"
    if not path.exists():
        return None
    body: dict[str, Any] = json.loads(path.read_text())
    return body


def weekly(force: bool = False, now: datetime | None = None) -> dict[str, Any]:
    """Score new 2026-27 games. Once a week unless forced; the daily job calls this every day."""
    from courtlens.evaluation.projected_impact_data import game_rows, tip_times

    now = now or datetime.now(UTC)
    previous = read_summary()
    if previous and not force:
        written = datetime.fromisoformat(previous["written_at"])
        if now - written < timedelta(days=WEEKLY_DAYS):
            return {"skipped": True, "last_written": previous["written_at"]}
    manifest = load_manifest()
    tables = ratings_table(load_projections())
    rows = read_rows()
    done = {r["game_id"] for r in rows}
    tips = tip_times(SEASON_END_YEAR)
    serving_root().mkdir(parents=True, exist_ok=True)
    added = 0
    with _games_path().open("a") as stream:
        for game in game_rows(SEASON_END_YEAR):
            if game["game_id"] in done:
                continue
            row = score_game(game, tables, manifest, tips.get(game["game_id"]))
            stream.write(json.dumps(row, sort_keys=True) + "\n")
            rows.append(row)
            added += 1
    summary = write_summary(rows, manifest)
    return {
        "skipped": False,
        "added": added,
        "prospective_games": summary["prospective"]["games"],
        "hindsight_games": summary["hindsight"]["games"],
        "scored_through": summary["scored_through"],
    }
