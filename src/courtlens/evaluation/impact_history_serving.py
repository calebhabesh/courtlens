"""Serve the R01 history seasons beside the sealed ones (Stats, WOWY, on/off, team splits).

Each served directory gets one new content-addressed bundle: the bundle it serves now, with
every existing entry carried verbatim, plus the history entries; `.current` moves to it (an
atomic pointer swap) and nothing is pruned, so rollback is moving `.current` back. History
entries are not `provisional`, so the weekly and daily current-season jobs carry them forward
the way they carry sealed entries.

- impact serving: 1Y/2Y/3Y IM04-method ratings and IM05 extras for 2014-15 to 2022-23, plus the
  windows the sealed run could not form, and a top-level `intervals` map (rating entry hash ->
  player -> metric -> 10th/90th percentile) for every 1Y regular-season rating entry;
- team splits: per-team extras for traded players;
- WOWY: pair splits per history season;
- stint box: per-game focal counts for each history IM03 bundle.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from courtlens.config import get_settings
from courtlens.domain.impact_extras import aggregate, aggregate_by_team
from courtlens.domain.wowy import cohort_splits, team_stints
from courtlens.evaluation.impact_history_fits import (
    OUTPUT,
    PHASE,
    Cohorts,
    fitted_history,
    history_receipts,
)
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.evaluation.impact_serving_build import (
    project_extras,
    project_rating,
    project_team_split,
)
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.services import served_bundle

INTERVAL_METRICS = {
    "rapm:offense": "orapm",
    "rapm:defense": "drapm",
    "rapm:total": "rapm",
    "ts:offense": "o_ts",
    "ts:defense": "d_ts",
    "tov:offense": "o_tov",
    "tov:defense": "d_tov",
    "reb:offense": "o_reb",
    "reb:defense": "d_reb",
}


def receipts(output: Path, kind: str) -> list[dict[str, Any]]:
    result = []
    for path in sorted((output / f"{kind}-receipts").glob("*.json")):
        body = json.loads(path.read_bytes())
        if content_hash(body) != path.stem:
            raise ValueError(f"changed receipt {path}")
        result.append(body)
    seasons = [r["season"] for r in result]
    if len(seasons) != len(set(seasons)):
        raise ValueError(f"two {kind} receipts for one season")
    return sorted(result, key=lambda r: r["season"])


def artifact(path: str, digest: str) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(Path(path).read_bytes())
    if content_hash(body) != digest:
        raise ValueError(f"changed artifact {path}")
    return body


def provenance(output: Path) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for receipt in history_receipts(output):
        merged.update(receipt["provenance"])
    return merged


def install(directory: Path, update: Any) -> Path:
    current = served_bundle.resolve(directory)
    if current is None or not current.exists():
        raise ValueError(f"no bundle served from {directory}")
    base = json.loads(current.read_bytes())
    path, digest = write_artifact(directory, update(base))
    served_bundle.install(directory, path)
    print(json.dumps({"directory": str(directory), "from": current.stem, "to": digest}))
    return path


def serving_additions(output: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    cohorts = provenance(output)
    entries = [
        project_rating(body, digest, cohorts) for digest, body in fitted_history(output).values()
    ]
    for receipt in receipts(output, "extras"):
        body = artifact(receipt["path"], receipt["sha256"])
        entries.append(
            project_extras(body, receipt["sha256"], cohorts[f"{body['season']}:{PHASE}"])
        )
    intervals: dict[str, Any] = {}
    for path in sorted((output / "intervals").glob("*.json")):
        body = artifact(str(path), path.stem)
        if body["fit"]["kind"] != "one_year":
            continue
        rows: dict[str, dict[str, Any]] = {}
        for player, bands in body["players"].items():
            for key, metric in INTERVAL_METRICS.items():
                band = bands.get(key.replace(":", "_"))
                if band is not None:
                    rows.setdefault(player, {})[metric] = {
                        "p10": band["p10"],
                        "p90": band["p90"],
                        "sd": band["sd"],
                        "replicates": band["replicates"],
                    }
        intervals[body["fit"]["artifact_sha256"]] = {
            "season": body["fit"]["season"],
            "interval_sha256": path.stem,
            "registration": body["registration"],
            "players": rows,
        }
    return entries, intervals


def install_serving(output: Path) -> Path:
    entries, intervals = serving_additions(output)

    def update(base: dict[str, Any]) -> dict[str, Any]:
        keep = [e for e in base["entries"] if e["sha256"] not in {n["sha256"] for n in entries}]
        served = {e["sha256"] for e in keep + entries if e["kind"] == "ratings"}
        missing = set(intervals) - served
        if missing:
            raise ValueError(f"intervals for unserved rating entries: {sorted(missing)[:3]}")
        return {
            **base,
            "entries": keep + entries,
            "intervals": {**base.get("intervals", {}), **intervals},
            "history": {
                "registration": "courtlens-impact-history-v2",
                "seasons": sorted({e["scope"]["season"] for e in entries}),
            },
        }

    return install(_directory(get_settings().impact_serving_manifest), update)


def install_team_splits(output: Path) -> Path:
    additions = {}
    for receipt in receipts(output, "extras"):
        body = artifact(receipt["path"], receipt["sha256"])
        facts = artifact(receipt["fact_path"], receipt["fact_sha256"])
        cutoff = body["cutoff"]
        season = aggregate(facts, cutoff)
        if season["players"] != body["players"] or season["league"] != body["league"]:
            raise ValueError(f"facts do not reproduce extras {receipt['sha256']}")
        split = aggregate_by_team(facts, cutoff)
        additions[receipt["sha256"]] = {
            "season": body["season"],
            "phase": body["phase"],
            "cutoff": cutoff,
            "fact_sha256": receipt["fact_sha256"],
            "players": {
                pid: {
                    team: project_team_split(row, receipt["sha256"], cutoff, team)
                    for team, row in teams.items()
                }
                for pid, teams in sorted(split["players"].items())
            },
        }
    return install(
        _directory(get_settings().impact_team_splits_manifest),
        lambda base: {**base, "entries": {**base["entries"], **additions}},
    )


def install_wowy(output: Path) -> Path:
    cohorts = Cohorts(keep=1)
    seasons = {r["season"] for r in receipts(output, "extras")}
    additions = {}
    datasets = {}
    for key in cohorts:
        season = key.split(":")[0]
        if season not in seasons:
            continue
        cohort, source = cohorts.load(season)
        datasets[key] = source["dataset"]["content_sha256"]
        additions[key] = {
            "season": season,
            "phase": PHASE,
            "games": len(cohort["games"]),
            "last_game_date": max(g["day"] for g in cohort["games"].values()),
            "teams": cohort_splits(team_stints(cohort["stints"])),
        }
        print("wowy", key, flush=True)
    return install(
        _directory(get_settings().wowy_manifest),
        lambda base: {
            **base,
            "inputs": {
                **base["inputs"],
                "datasets": {**base["inputs"]["datasets"], **datasets},
                "history_registration": "courtlens-impact-history-v2",
            },
            "cohorts": {**base["cohorts"], **additions},
        },
    )


def install_stint_boxes(output: Path) -> Path:
    manifest_dir = _directory(get_settings().stint_box_manifest)
    additions = {}
    for receipt in receipts(output, "stint-box"):
        body = artifact(receipt["path"], receipt["sha256"])
        # Served artifacts live beside the manifest directory, as the sealed ones do.
        path, digest = write_artifact(manifest_dir.parent, body)
        additions[receipt["bundle_content_sha256"]] = {
            "sha256": digest,
            "path": path.name,
            "season": receipt["season"],
            "phase": receipt["phase"],
        }
    return install(
        manifest_dir, lambda base: {**base, "artifacts": {**base["artifacts"], **additions}}
    )


def _directory(configured: Path | None) -> Path:
    if configured is None:
        raise ValueError("serving directory not configured")
    return configured if configured.is_dir() else configured.parent


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument(
        "target", choices=("serving", "team-splits", "wowy", "stint-box"), nargs="+"
    )
    args = parser.parse_args()
    for target in args.target:
        {
            "serving": install_serving,
            "team-splits": install_team_splits,
            "wowy": install_wowy,
            "stint-box": install_stint_boxes,
        }[target](args.output)


if __name__ == "__main__":
    main()
