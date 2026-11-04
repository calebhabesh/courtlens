"""R01 cohorts and IM04-method fits on the history windows (`courtlens-impact-history-v2`).

Reads the sealed 2023-24 to 2025-26 regular-season IM03 bundles (acceptance-bound, as
`impact_rating_inputs.read_accepted_inputs` binds them) and the history bundles for 2014-15 to
2022-23, and fits 1Y/2Y/3Y windows with the pinned IM04 functions (`impact_ratings`,
`impact_rating_runner.build_prior`), unchanged. Runs are chunked by ending season so each stays
inside the registered wall-time budget; the box prior reads every earlier fit, so chunks run in
season order. Kept apart from `impact_history_ratings.py` so these artifacts' recorded code hash
does not move when the later R01 stages change.
"""

from __future__ import annotations

import argparse
import gzip
import json
import platform
import time
from collections import OrderedDict
from collections.abc import Iterator, Mapping
from datetime import date, timedelta
from pathlib import Path
from typing import Any, cast

import numpy as np
import scipy  # type: ignore[import-untyped]
import sklearn  # type: ignore[import-untyped]
from threadpoolctl import threadpool_limits  # type: ignore[import-untyped]

from courtlens.domain.impact_possessions import METHOD_VERSION_V2
from courtlens.domain.impact_verification import GATE_VERSION
from courtlens.domain.research_registry import registration_receipt
from courtlens.evaluation.impact_rating_inputs import (
    ACCEPTANCE_SHA256,
    checked,
    select_window,
    write_artifact,
)
from courtlens.evaluation.impact_rating_runner import VERSION as RATINGS_VERSION
from courtlens.evaluation.impact_rating_runner import build_prior
from courtlens.evaluation.impact_ratings import (
    Stint,
    choose_alpha,
    fit_target,
    margin_diagnostic,
    on_off,
)
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file

PHASE = "regular_season"
SEALED_ACCEPTANCE = Path("docs/evidence/im03-event-gate/acceptance-v2.json.gz")
SEALED_BUNDLES = Path("data/derived/impact-event-gate/bundles")
SEALED_RATINGS = Path("docs/evidence/im04")
HISTORY_BUNDLES = Path("data/derived/impact-history-v2/bundles")
OUTPUT = Path("data/derived/impact-history-v2")
FIRST_YEAR, LAST_HISTORY_YEAR, LAST_YEAR = 2014, 2022, 2025
TARGETS = ("rapm", "ts", "tov", "reb")
HISTORY = "courtlens-impact-history-v2"


def season_label(year: int) -> str:
    return f"{year}-{str(year + 1)[-2:]}"


def dependencies() -> dict[str, str]:
    if sklearn.__version__ != "1.6.1":
        raise ValueError("ratings require pinned scikit-learn 1.6.1")
    return {
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "sklearn": sklearn.__version__,
    }


def implementation() -> dict[str, str]:
    return {
        p: hash_file(Path(p))[0]
        for p in (
            "src/courtlens/evaluation/impact_ratings.py",
            "src/courtlens/evaluation/impact_rating_inputs.py",
            "src/courtlens/evaluation/impact_rating_runner.py",
            "src/courtlens/evaluation/impact_history_fits.py",
            "docs/design/impact-ratings-v1.md",
        )
    }


# ---------------------------------------------------------------------------------------------
# Cohorts: one regular season of admitted stints, loaded on demand.


def bundle_paths() -> dict[str, tuple[Path, str]]:
    """Season -> (bundle path, source) for all twelve regular seasons."""
    acceptance = checked(SEALED_ACCEPTANCE, ACCEPTANCE_SHA256)
    admitted = {d["content_sha256"] for d in acceptance["datasets"]}
    paths: dict[str, tuple[Path, str]] = {}
    for root, source in ((SEALED_BUNDLES, "sealed-im03"), (HISTORY_BUNDLES, HISTORY)):
        for path in sorted(root.glob("*.json.gz")):
            digest = path.name.removesuffix(".json.gz")
            if source == "sealed-im03" and digest not in admitted:
                continue
            with gzip.open(path, "rt") as stream:
                head = json.load(stream)
            if head["phase"] != PHASE:
                continue
            if head["season"] in paths:
                raise ValueError(f"duplicate season bundle {head['season']}")
            paths[head["season"]] = (path, source)
    expected = {season_label(y) for y in range(FIRST_YEAR, LAST_YEAR + 1)}
    if set(paths) != expected:
        raise ValueError(f"expected twelve regular seasons, found {sorted(paths)}")
    return paths


def read_cohort(path: Path, source: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Hash-checked cohort in `read_accepted_inputs`' shape, with its provenance."""
    digest = path.name.removesuffix(".json.gz")
    bundle = checked(path, digest)
    if (
        bundle["method_version"] != METHOD_VERSION_V2
        or bundle["gate_version"] != GATE_VERSION
        or not all(bundle["verification_gate"].values())
        or content_hash({g: m["content_sha256"] for g, m in bundle["members"].items()})
        != bundle["membership_sha256"]
    ):
        raise ValueError("unverified or incomplete bundle")
    for name, expected in bundle["code_sha256"].items():
        if name != "src/courtlens/ingestion/impact_history.py" and hash_file(Path(name))[0] != (
            expected
        ):
            raise ValueError(f"IM03 implementation changed: {name}")
    season = bundle["season"]
    stints: list[Stint] = []
    games = {}
    for gid, member in sorted(bundle["members"].items()):
        game = checked(Path(member["path"]), member["content_sha256"])
        if game["game_id"] != gid or game["method_version"] != METHOD_VERSION_V2:
            raise ValueError("wrong game or method")
        day = member["schedule"]["game_date"]
        games[gid] = {"sha256": game["content_sha256"], "day": day, "quality": game["quality"]}
        for s in game["stints"]:
            if content_hash({k: v for k, v in s.items() if k != "source_hash"}) != s["source_hash"]:
                raise ValueError("changed stint")
            stints.append(
                Stint(
                    gid,
                    day,
                    season,
                    s["home_team_id"],
                    s["away_team_id"],
                    tuple(s["home_lineup_json"]),
                    tuple(s["away_lineup_json"]),
                    s["duration_seconds"],
                    s["home_points"],
                    s["away_points"],
                    s["home_possessions"],
                    s["away_possessions"],
                    s["stats_json"][s["home_team_id"]],
                    s["stats_json"][s["away_team_id"]],
                )
            )
    if len(stints) != bundle["counts"]["stints"]:
        raise ValueError("incomplete stint membership")
    cohort = {"season": season, "phase": PHASE, "stints": stints, "games": games}
    provenance = {
        "dataset": {"content_sha256": digest, "source": source},
        "im02_summary": bundle["im02_summary"],
        "box_estimate": bundle["possession_estimate_distribution"],
        "public_diagnostic": bundle["public_possession_crosscheck"],
    }
    return cohort, provenance


class Cohorts(Mapping[str, dict[str, Any]]):
    """`season:regular_season` -> cohort, loaded lazily and kept for the last few seasons only,
    so a long window or the box prior never holds twelve seasons of stint objects at once."""

    def __init__(self, keep: int = 4) -> None:
        self.paths = bundle_paths()
        self.keep = keep
        self.cache: OrderedDict[str, tuple[dict[str, Any], dict[str, Any]]] = OrderedDict()

    def load(self, season: str) -> tuple[dict[str, Any], dict[str, Any]]:
        if season not in self.cache:
            self.cache[season] = read_cohort(*self.paths[season])
            while len(self.cache) > self.keep:
                self.cache.popitem(last=False)
        self.cache.move_to_end(season)
        return self.cache[season]

    def __getitem__(self, key: str) -> dict[str, Any]:
        season, phase = key.split(":")
        if phase != PHASE or season not in self.paths:
            raise KeyError(key)
        return self.load(season)[0]

    def __iter__(self) -> Iterator[str]:
        return iter(f"{s}:{PHASE}" for s in sorted(self.paths))

    def __len__(self) -> int:
        return len(self.paths)


def season_end(cohort: dict[str, Any]) -> str:
    """Rule H3: the day after the season's last admitted regular-season game."""
    last = max(g["day"] for g in cohort["games"].values())
    return (date.fromisoformat(last) + timedelta(days=1)).isoformat()


def sealed_artifacts() -> list[dict[str, Any]]:
    seal = checked(SEALED_RATINGS / "acceptance.json.gz")
    return [
        json.loads(
            gzip.decompress((SEALED_RATINGS / "artifacts" / f"{digest}.json.gz").read_bytes())
        )
        for digest in sorted(seal["artifact_hashes"])
    ]


# ---------------------------------------------------------------------------------------------
# IM04-method fits on the new windows (registration courtlens-impact-history-v2).


def history_windows() -> list[tuple[str, ...]]:
    """1Y/2Y/3Y windows ending 2014-15 to 2022-23, plus those the sealed run could not form."""
    seasons = [season_label(y) for y in range(FIRST_YEAR, LAST_YEAR + 1)]
    windows = []
    for end, season in enumerate(seasons):
        year = int(season[:4])
        for years in range(1, min(end + 1, 3) + 1):
            if (
                year <= LAST_HISTORY_YEAR
                or (year == 2023 and years > 1)
                or (year == 2024 and years == 3)
            ):
                windows.append(tuple(seasons[end + 1 - years : end + 1]))
    return windows


def history_receipts(output: Path) -> list[dict[str, Any]]:
    """Every partial history-fit receipt (runs are chunked by ending season)."""
    result = []
    for path in sorted((output / "runs").glob("*.json")):
        body = json.loads(path.read_bytes())
        if content_hash(body) != path.stem:
            raise ValueError(f"changed run receipt {path}")
        if body.get("kind") == "history-fit":
            result.append(body)
    return result


def fitted_history(output: Path) -> dict[tuple[str, ...], tuple[str, dict[str, Any]]]:
    """Window -> (digest, artifact) for every history fit already made."""
    result: dict[tuple[str, ...], tuple[str, dict[str, Any]]] = {}
    for receipt in history_receipts(output):
        for entry in receipt["artifacts"]:
            window = tuple(entry["seasons"])
            body = json.loads(Path(entry["path"]).read_bytes())
            if content_hash(body) != entry["sha256"]:
                raise ValueError("changed history rating artifact")
            if window in result and result[window][0] != entry["sha256"]:
                raise ValueError(f"two different fits for {window}")
            result[window] = (entry["sha256"], body)
    return result


def fit_history(output: Path, ends: list[str] | None = None) -> dict[str, Any]:
    """Fit the windows ending in `ends` (default all) that are not fitted yet, in order."""
    started = time.monotonic()
    deps, code = dependencies(), implementation()
    receipt = registration_receipt(HISTORY)
    cohorts = Cohorts()
    done = fitted_history(output)
    fitted: list[dict[str, Any]] = [body for _, body in done.values()]
    receipts: list[dict[str, Any]] = []
    provenance: dict[str, Any] = {}
    with threadpool_limits(limits=1):
        for window in history_windows():
            if window in done or (ends is not None and window[-1] not in ends):
                continue
            have = set(done) | {tuple(r["seasons"]) for r in receipts}
            missing = [w for w in history_windows() if w[-1] < window[-1] and w not in have]
            if missing:
                # The box prior reads every earlier season's fit, so fits run in season order.
                raise ValueError(f"fit earlier windows first: {missing[0]}")
            selected = [cohorts[f"{s}:{PHASE}"] for s in window]
            for s in window:
                provenance[f"{s}:{PHASE}"] = cohorts.load(s)[1]
            cutoff = season_end(selected[-1])
            stints, inputs = select_window(selected, cutoff)
            print(f"fitting {window} {len(stints)} stints cutoff {cutoff}", flush=True)
            rapm_alpha, rapm_cv = choose_alpha(stints, ("rapm",))
            factor_alpha, factor_cv = choose_alpha(stints, ("ts", "tov", "reb"))
            # build_prior only indexes cohorts by key; the lazy mapping loads them on demand.
            prior, prior_metadata = build_prior(
                cast(dict[str, Any], cohorts), fitted, PHASE, window[0], Path("data/raw")
            )
            obj = {
                "version": RATINGS_VERSION,
                "registration": receipt,
                "claim": "descriptive model estimate under lineup confounding",
                "input": inputs,
                "implementation": code,
                "dependencies": deps,
                "rapm_cv": rapm_cv,
                "six_factor_cv": factor_cv,
                "rapm": fit_target(stints, "rapm", rapm_alpha),
                "six_factor": {t: fit_target(stints, t, factor_alpha) for t in TARGETS[1:]},
                "on_off": on_off(stints),
                "bpr_prior": prior_metadata,
                "bpr": fit_target(stints, "rapm", rapm_alpha, prior) if prior is not None else None,
                "margin_diagnostic": margin_diagnostic(stints),
            }
            path, digest = write_artifact(output / "ratings", obj)
            fitted.append(obj)
            receipts.append({"seasons": list(window), "sha256": digest, "path": str(path)})
            print(f"saved {digest} alpha={rapm_alpha}/{factor_alpha}", flush=True)
            del stints, selected
    summary = {
        "kind": "history-fit",
        "version": RATINGS_VERSION,
        "registration": receipt,
        "implementation": code,
        "artifacts": receipts,
        "provenance": provenance,
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }
    path, digest = write_artifact(output / "runs", summary)
    print(json.dumps({"receipt": str(path), "sha256": digest}), flush=True)
    return summary


def one_year_artifacts(output: Path) -> dict[str, dict[str, Any]]:
    """Season -> 1Y IM04-method artifact: history fits plus the sealed seasons' artifacts."""
    done = fitted_history(output)
    if set(done) != set(history_windows()):
        raise ValueError("history fits incomplete")
    result: dict[str, dict[str, Any]] = {
        window[0]: body for window, (_, body) in done.items() if len(window) == 1
    }
    for body in sealed_artifacts():
        inp = body["input"]
        if inp["phase"] == PHASE and len(inp["seasons"]) == 1:
            result[inp["seasons"][0]] = body
    return dict(sorted(result.items()))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--season", action="append", help="ending seasons to fit (default all)")
    args = parser.parse_args()
    fit_history(args.output, args.season)


if __name__ == "__main__":
    main()
