"""2026-27 rating snapshots for the frozen win-probability model (R15b).

The model was trained on `courtlens-rating-snapshots-v1`: time-decay RAPM refitted at each season's
opener and on the 1st of each month, read as the newest cutoff on or before the game date. Holding
one snapshot all season costs +0.0039 log loss on the test seasons (R15b evidence), so the frozen
model keeps the training rule. These fits update player ratings only; the model never changes, and
the method is pinned by the hash of `impact_history_ratings.py` in the freeze manifest.

Current-season stints come from the newest provisional `season-impact` bundle. A snapshot is built
only once that bundle holds every date before its cutoff, so it is never fitted on a partial month.
"""

from __future__ import annotations

import argparse
import gzip
import json
from collections.abc import Iterator, Mapping
from datetime import date
from pathlib import Path
from typing import Any

from threadpoolctl import threadpool_limits  # type: ignore[import-untyped]

from courtlens.domain.impact_possessions import METHOD_VERSION_V2
from courtlens.domain.impact_verification import GATE_VERSION
from courtlens.evaluation.impact_history_fits import PHASE, Cohorts
from courtlens.evaluation.impact_history_ratings import compact_all, decay_artifact, decay_fit
from courtlens.evaluation.impact_rating_inputs import checked, write_artifact
from courtlens.evaluation.impact_ratings import Stint
from courtlens.ingestion.native_reconstruction import content_hash

SEASON_BUNDLES = Path("data/derived/season-impact/bundles")
LIVE_SNAPSHOTS = Path("data/derived/win-probability-ratings")


def read_provisional_cohort(path: Path) -> dict[str, Any]:
    """`read_cohort`'s checks for a season-impact bundle, which records no IM03 code hashes."""
    bundle = checked(path, path.name.removesuffix(".json.gz"))
    if (
        bundle["method_version"] != METHOD_VERSION_V2
        or bundle["gate_version"] != GATE_VERSION
        or not all(bundle["verification_gate"].values())
        or content_hash({g: m["content_sha256"] for g, m in bundle["members"].items()})
        != bundle["membership_sha256"]
    ):
        raise ValueError("unverified or incomplete bundle")
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
    return {"season": season, "phase": PHASE, "stints": stints, "games": games}


class WithCurrent(Mapping[str, dict[str, Any]]):
    """The twelve sealed seasons plus one provisional season bundle."""

    def __init__(self, path: Path) -> None:
        self.base = Cohorts()
        self.path = path
        self.season = "2026-27"

    def __iter__(self) -> Iterator[str]:
        yield from self.base
        yield self.season

    def __len__(self) -> int:
        return len(self.base) + 1

    def __getitem__(self, key: str) -> dict[str, Any]:
        if key == self.season:
            return read_provisional_cohort(self.path)
        return self.base[key]


def newest_bundle(season: str = "2026-27") -> tuple[Path, str] | None:
    """The bundle reaching furthest for the season, and its last game date."""
    best: tuple[str, Path] | None = None
    for path in SEASON_BUNDLES.glob("*.json.gz"):
        with gzip.open(path, "rt") as stream:
            body = json.load(stream)
        if body["season"] != season or body["phase"] != "regular_season":
            continue
        last = max(m["schedule"]["game_date"] for m in body["members"].values())
        if best is None or (last, path.name) > (best[0], best[1].name):
            best = (last, path)
    return (best[1], best[0]) if best else None


def due_cutoffs(today: date, opener: str = "2026-10-20") -> list[str]:
    """Registered cutoffs for this season up to today: the opener, then each month's 1st."""
    cutoffs = [opener]
    start = date.fromisoformat(opener)
    month = date(start.year + start.month // 12, start.month % 12 + 1, 1)
    while month <= today:
        cutoffs.append(month.isoformat())
        month = date(month.year + month.month // 12, month.month % 12 + 1, 1)
    return cutoffs


def existing_cutoffs(output: Path = LIVE_SNAPSHOTS) -> set[str]:
    found = set()
    for path in output.glob("*.json"):
        body = json.loads(path.read_bytes())
        if content_hash(body) != path.stem or not body["latest_game_date"] < body["cutoff"]:
            raise ValueError(f"changed or leaking snapshot {path}")
        found.add(body["cutoff"])
    return found


def ensure_snapshots(today: date, output: Path = LIVE_SNAPSHOTS) -> dict[str, Any]:
    """Build any due snapshot the provisional bundle can support. Idempotent."""
    built: list[dict[str, str]] = []
    waiting: list[str] = []
    missing = [c for c in due_cutoffs(today) if c not in existing_cutoffs(output)]
    if not missing:
        return {"built": built, "waiting": waiting}
    bundle = newest_bundle()
    if bundle is None:
        return {"built": built, "waiting": missing}
    path, last = bundle
    compact = compact_all(WithCurrent(path))
    with threadpool_limits(limits=1):
        for cutoff in missing:
            # The cutoff is exclusive: games through the day before it must be in the bundle.
            if last < date.fromordinal(date.fromisoformat(cutoff).toordinal() - 1).isoformat():
                waiting.append(cutoff)
                continue
            artifact = decay_artifact(decay_fit(compact, cutoff), "snapshot")
            artifact["provisional_season_bundle"] = path.name.removesuffix(".json.gz")
            _, digest = write_artifact(output, artifact)
            built.append({"cutoff": cutoff, "sha256": digest})
    return {"built": built, "waiting": waiting}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--today", type=date.fromisoformat, default=date.today())
    args = parser.parse_args()
    print(json.dumps(ensure_snapshots(args.today)))


if __name__ == "__main__":
    main()
