"""Explicit offline PC09 run: value metric, out-of-time evaluation and archetypes."""

from __future__ import annotations

import argparse
import json
import platform
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import scipy  # type: ignore[import-untyped]
import sklearn  # type: ignore[import-untyped]
from sqlalchemy import Engine, create_engine, text
from threadpoolctl import threadpool_limits  # type: ignore[import-untyped]

from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.evaluation.value_archetypes import (
    ARCHETYPE_VERSION,
    BOX_FIELDS,
    VALUE_VERSION,
    PlayerGame,
    TeamGame,
    evaluation,
    fit_archetypes,
    season_features,
    select_value_artifact,
    value_rows,
)
from courtlens.ingestion.impact_population import read_json
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file

SERVING_VERSION = "courtlens-value-archetypes-serving-v1"
CONTRACT = "docs/design/value-archetypes-v1.md"
NAMES = Path("docs/design/archetype-names-v1.json")
PHASE = "regular_season"
ShotCounts = dict[tuple[str, str], tuple[int, int]]


def sealed_ratings(root: Path) -> list[dict[str, Any]]:
    artifacts = []
    for path in sorted(root.glob("*.json.gz")):
        obj = read_json(path)
        if content_hash(obj) != path.name.removesuffix(".json.gz"):
            raise ValueError(f"changed sealed rating artifact: {path}")
        artifacts.append(obj)
    if len(artifacts) != 12:
        raise ValueError("expected the 12 sealed IM04 rating artifacts")
    return artifacts


def read_feature_inputs(
    engine: Engine,
) -> tuple[list[PlayerGame], list[TeamGame], ShotCounts, dict[str, Any]]:
    """One read-only transaction over the served workbench dataset and admitted shots."""
    box = ", ".join(BOX_FIELDS)
    with engine.connect() as c:
        c.execute(text("SET TRANSACTION READ ONLY"))
        datasets = c.execute(
            text(
                "SELECT DISTINCT m.dataset_id::text, d.content_sha256 "
                "FROM analytics_marts.mart_workbench_player_season_stats m "
                "JOIN workbench_datasets d ON d.id = m.dataset_id"
            )
        ).all()
        if len(datasets) != 1:
            raise ValueError("expected one served workbench dataset")
        dataset, dataset_sha = datasets[0]
        player_games = [
            PlayerGame(
                season=r.season,
                game=r.game_id,
                team=r.team_id,
                player=r.player_id,
                # Unknown appearance minutes poison the whole team-game (NaN), never zero.
                seconds=float("nan")
                if r.appearance == "unknown" or r.minutes_seconds is None
                else float(r.minutes_seconds),
                box={f: float(getattr(r, f) or 0) for f in BOX_FIELDS},
            )
            for r in c.execute(
                text(
                    "SELECT season, game_id, team_id, player_id, appearance, minutes_seconds, "
                    f"{box} FROM analytics_intermediate.fct_workbench_player_game "
                    "WHERE dataset_id = :d AND phase = :p "
                    "AND appearance <> 'reported_nonappearance'"
                ),
                {"d": dataset, "p": PHASE},
            )
        ]
        team_games = [
            TeamGame(
                season=r.season,
                game=r.game_id,
                team=r.team_id,
                opponent=r.opponent_id,
                box={f: float(getattr(r, f)) for f in (*BOX_FIELDS,)},
            )
            for r in c.execute(
                text(
                    f"SELECT season, game_id, team_id, opponent_id, {box} "
                    "FROM analytics_intermediate.fct_workbench_team_game "
                    "WHERE dataset_id = :d AND phase = :p"
                ),
                {"d": dataset, "p": PHASE},
            )
        ]
        shot_rows = c.execute(
            text(
                "SELECT g.season, m.payload_json->>'player_id' AS player, "
                "count(*) FILTER (WHERE m.payload_json->>'zone' = 'Restricted Area') AS rim, "
                "count(*) AS known, d.content_sha256 "
                "FROM research_shot_members m "
                "JOIN research_games g USING (dataset_id, game_id) "
                "JOIN research_datasets d ON d.id = m.dataset_id "
                "WHERE m.eligible AND m.payload_json->>'zone' <> 'Unknown' "
                "GROUP BY 1, 2, 5"
            )
        ).all()
    shot_datasets = sorted({r.content_sha256 for r in shot_rows})
    if len(shot_datasets) != 1:
        raise ValueError("expected one admitted research shot dataset")
    shots = {(r.season, r.player): (int(r.rim), int(r.known)) for r in shot_rows}
    provenance = {
        "workbench_dataset_sha256": dataset_sha,
        "research_shot_dataset_sha256": shot_datasets[0],
        "phase": PHASE,
        "player_game_rows": len(player_games),
        "team_game_rows": len(team_games),
        "shot_player_seasons": len(shots),
    }
    return player_games, team_games, shots, provenance


def run(*, ratings: Path, output: Path, database_url: str) -> dict[str, Any]:
    started = time.monotonic()
    if sklearn.__version__ != "1.6.1":
        raise ValueError("PC09 requires pinned scikit-learn 1.6.1")
    implementation = {
        name: hash_file(Path(name))[0]
        for name in (
            "src/courtlens/evaluation/value_archetypes.py",
            "src/courtlens/evaluation/value_archetype_runner.py",
            CONTRACT,
        )
    }
    dependencies = {
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "sklearn": sklearn.__version__,
    }
    rated = sealed_ratings(ratings)
    chosen = select_value_artifact(rated)
    value = {
        "version": VALUE_VERSION,
        "claim": "descriptive model estimate under lineup confounding",
        "label": "Box-prior RAPM (BPR)",
        "rule": "latest completed regular season; longest window with an available BPR",
        "source_artifact": content_hash(chosen),
        "scope": {
            "phase": chosen["input"]["phase"],
            "seasons": chosen["input"]["seasons"],
            "cutoff": chosen["input"]["cutoff"],
        },
        "unit": "points per 100 possessions, relative to a minutes-weighted average player",
        "implementation": implementation,
        "players": value_rows(chosen),
    }
    report = {
        **evaluation(rated),
        "source_artifacts": sorted(content_hash(a) for a in rated),
        "implementation": implementation,
    }
    engine = create_engine(database_url)
    try:
        player_games, team_games, shots, provenance = read_feature_inputs(engine)
    finally:
        engine.dispose()
    features, omitted = season_features(player_games, team_games, shots)
    with threadpool_limits(limits=1):
        mixture = fit_archetypes(features)
    archetypes = {
        "version": ARCHETYPE_VERSION,
        "claim": "derived archetype: statistical style cluster, not a position or a role claim",
        "input": {
            **provenance,
            "feature_rows_sha256": content_hash(features),
            "omitted": omitted,
            "qualifying_minutes": 500,
        },
        "implementation": implementation,
        "dependencies": dependencies,
        "samples": features,
        **mixture,
    }
    outputs = {}
    for kind, obj in (("value", value), ("evaluation", report), ("archetypes", archetypes)):
        path, digest = write_artifact(output / kind, obj)
        outputs[kind] = {"sha256": digest, "path": str(path)}
        print(f"saved {kind} {digest}", flush=True)
    summary = {
        "version": SERVING_VERSION,
        "outputs": outputs,
        "dependencies": dependencies,
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "observed_at": datetime.now(UTC).isoformat(),
    }
    path, digest = write_artifact(output / "runs", summary)
    print(json.dumps({"receipt": str(path), "sha256": digest}), flush=True)
    return summary


def serving_manifest(
    output: Path, value_sha: str, archetypes_sha: str, evaluation_sha: str
) -> Path:
    """Bounded serving projection: latest-season rows only, plus owner-reviewed names."""
    value = json.loads((output / "value" / f"{value_sha}.json").read_bytes())
    archetypes = json.loads((output / "archetypes" / f"{archetypes_sha}.json").read_bytes())
    report = json.loads((output / "evaluation" / f"{evaluation_sha}.json").read_bytes())
    for obj, digest in ((value, value_sha), (archetypes, archetypes_sha), (report, evaluation_sha)):
        if content_hash(obj) != digest:
            raise ValueError("changed PC09 artifact")
    names = json.loads(NAMES.read_text())
    if (
        names["archetypes_sha256"] != archetypes_sha
        or len(names["clusters"]) != archetypes["components"]
    ):
        raise ValueError("archetype names do not match the fitted artifact")
    latest: dict[str, dict[str, Any]] = {}
    for key, sample in sorted(archetypes["samples"].items()):
        member = archetypes["members"].get(key)
        if member is None:
            continue
        # Latest regular season with complete features; seasons sort lexically.
        player = sample["player_id"]
        if player not in latest or sample["season"] > latest[player]["season"]:
            latest[player] = {
                "season": sample["season"],
                "minutes": round(sample["seconds"] / 60, 1),
                "games": sample["games"],
                "qualified": sample["qualified"],
                "features": sample["features"],
                "membership": member["membership"],
                "primary": member["primary"],
            }
    manifest = {
        "version": SERVING_VERSION,
        "value": {k: v for k, v in value.items() if k != "implementation"} | {"sha256": value_sha},
        "evaluation": {"sha256": evaluation_sha, "folds": report["folds"]},
        "archetypes": {
            "sha256": archetypes_sha,
            "version": archetypes["version"],
            "claim": archetypes["claim"],
            "components": archetypes["components"],
            "features": archetypes["features"],
            "weights": archetypes["weights"],
            "means": archetypes["means"],
            "training_samples": len(archetypes["training_samples"]),
            "seasons": sorted({s["season"] for s in archetypes["samples"].values()}),
            "names": names,
            "players": latest,
        },
    }
    path, _ = write_artifact(output / "serving", manifest)
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ratings", type=Path, default=Path("docs/evidence/im04/artifacts"))
    parser.add_argument("--output", type=Path, default=Path("data/derived/value-archetypes-v1"))
    parser.add_argument("--database-url", help="Read-only PostgreSQL URL for feature inputs")
    parser.add_argument(
        "--serve",
        nargs=3,
        metavar=("VALUE_SHA", "ARCHETYPES_SHA", "EVALUATION_SHA"),
        help="Write the serving manifest from existing artifacts and the names file",
    )
    args = parser.parse_args()
    if args.serve:
        print(serving_manifest(args.output, *args.serve))
        return
    if not args.database_url:
        parser.error("--database-url is required to fit")
    run(ratings=args.ratings, output=args.output, database_url=args.database_url)


if __name__ == "__main__":
    main()
