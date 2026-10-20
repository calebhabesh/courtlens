"""Provisional current-season IM04 ratings and IM05 extras from a provisional IM03 bundle.

The sealed fit and extras runners read only the six accepted cohorts and are hash-pinned, so this
module imports their functions unchanged: the provisional cohort joins the sealed ones, and only
windows ending at the current season are fitted (1, 2 and 3 years). The box prior uses the
accepted historical rating artifacts, exactly as the sealed run built 2025-26's. Artifacts carry
`provisional: true` and the provisional bundle's hash; nothing here touches sealed artifacts.
"""

from __future__ import annotations

import gzip
import json
import platform
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import scipy  # type: ignore[import-untyped]
import sklearn  # type: ignore[import-untyped]
from threadpoolctl import threadpool_limits  # type: ignore[import-untyped]

from courtlens.domain.impact_extras import aggregate, game_facts
from courtlens.domain.impact_extras_catalog import VERSION as EXTRAS_VERSION
from courtlens.evaluation.impact_rating_inputs import (
    checked,
    read_accepted_inputs,
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
from courtlens.ingestion.hoopr_boxscores import matchup_rows, playbyplay_rows
from courtlens.ingestion.impact_repair_audit import retained_boxes
from courtlens.ingestion.sportsdataverse import hash_file

ACCEPTANCE = Path("docs/evidence/im03-event-gate/acceptance-v2.json.gz")
SEALED_BUNDLES = Path("data/derived/impact-event-gate/bundles")
ACCEPTED_RATINGS = Path("docs/evidence/im04")


def provisional_cohort(bundle_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    """The provisional bundle as a cohort (`read_accepted_inputs`' shape) and its provenance."""
    bundle = checked(bundle_path)
    if not bundle.get("provisional"):
        raise ValueError("not a provisional bundle")
    season, phase = bundle["season"], bundle["phase"]
    stints: list[Stint] = []
    games = {}
    for gid, member in sorted(bundle["members"].items()):
        game = checked(Path(member["path"]), member["content_sha256"])
        games[gid] = {
            "sha256": game["content_sha256"],
            "day": member["schedule"]["game_date"],
            "quality": game["quality"],
        }
        for s in game["stints"]:
            stints.append(
                Stint(
                    gid,
                    member["schedule"]["game_date"],
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
    cohort = {"season": season, "phase": phase, "stints": stints, "games": games}
    provenance = {
        "dataset": {"content_sha256": bundle["content_sha256"], "provisional": True},
        "im02_summary": bundle["im02_summary"],
        "box_estimate": bundle["possession_estimate_distribution"],
        "public_diagnostic": bundle["public_possession_crosscheck"],
        "failed_event_checks": sorted(bundle["failed_event_checks"]),
    }
    return cohort, provenance


def accepted_ratings() -> list[dict[str, Any]]:
    seal = checked(ACCEPTED_RATINGS / "acceptance.json.gz")
    return [
        json.loads(
            gzip.decompress((ACCEPTED_RATINGS / "artifacts" / f"{digest}.json.gz").read_bytes())
        )
        for digest in sorted(seal["artifact_hashes"])
    ]


def fit_ratings(
    *, bundle_path: Path, raw_root: Path, output: Path, cutoff: str
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Fit every window ending at the provisional season; returns receipts and provenance."""
    if sklearn.__version__ != "1.6.1":
        raise ValueError("ratings require pinned scikit-learn 1.6.1")
    date.fromisoformat(cutoff)
    cohorts, provenance = read_accepted_inputs(ACCEPTANCE, SEALED_BUNDLES)
    cohort, current = provisional_cohort(bundle_path)
    key = f"{cohort['season']}:{cohort['phase']}"
    cohorts[key] = cohort
    provenance["cohorts"][key] = current
    phase, season = cohort["phase"], cohort["season"]
    seasons = sorted(c["season"] for c in cohorts.values() if c["phase"] == phase)
    implementation = {
        name: hash_file(Path(name))[0]
        for name in (
            "src/courtlens/evaluation/impact_ratings.py",
            "src/courtlens/evaluation/impact_rating_inputs.py",
            "src/courtlens/evaluation/impact_rating_runner.py",
            "src/courtlens/evaluation/season_impact_fits.py",
            "docs/design/impact-ratings-v1.md",
        )
    }
    dependencies = {
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "sklearn": sklearn.__version__,
    }
    historical = accepted_ratings()
    receipts = []
    end = seasons.index(season)
    with threadpool_limits(limits=1):
        for years in range(1, min(end + 1, 3) + 1):
            window = seasons[end + 1 - years : end + 1]
            stints, inputs = select_window([cohorts[f"{s}:{phase}"] for s in window], cutoff)
            rapm_alpha, rapm_cv = choose_alpha(stints, ("rapm",))
            factor_alpha, factor_cv = choose_alpha(stints, ("ts", "tov", "reb"))
            prior, prior_metadata = build_prior(cohorts, historical, phase, window[0], raw_root)
            obj = {
                "version": RATINGS_VERSION,
                "provisional": True,
                "provisional_bundle_sha256": checked(bundle_path)["content_sha256"],
                "claim": "descriptive model estimate under lineup confounding",
                "input": inputs,
                "implementation": implementation,
                "dependencies": dependencies,
                "rapm_cv": rapm_cv,
                "six_factor_cv": factor_cv,
                "rapm": fit_target(stints, "rapm", rapm_alpha),
                "six_factor": {
                    t: fit_target(stints, t, factor_alpha) for t in ("ts", "tov", "reb")
                },
                "on_off": on_off(stints),
                "bpr_prior": prior_metadata,
                "bpr": fit_target(stints, "rapm", rapm_alpha, prior) if prior is not None else None,
                "margin_diagnostic": margin_diagnostic(stints),
            }
            path, digest = write_artifact(output / "ratings", obj)
            receipts.append(
                {"seasons": window, "phase": phase, "sha256": digest, "path": str(path)}
            )
    return receipts, provenance["cohorts"]


def build_extras(
    *,
    bundle_path: Path,
    raw_root: Path,
    playbyplay: dict[str, bytes],
    matchups: dict[str, bytes],
    output: Path,
    cutoff: str,
) -> dict[str, Any]:
    """IM05 extras for the provisional season. Shot detail is not published per game in season,
    so the columns that need it stay unknown (`coverage` says so per game)."""
    bundle = checked(bundle_path)
    season, phase = bundle["season"], bundle["phase"]
    players, _, box_receipts = retained_boxes(raw_root, int(season[:4]) + 1)
    facts = {}
    missing_matchups = []
    for gid, member in sorted(bundle["members"].items()):
        if member["schedule"]["game_date"] >= cutoff:
            continue
        game = checked(Path(member["path"]), member["content_sha256"])
        candidate = checked(Path(member["candidate_path"]), member["candidate_sha256"])
        rows = [
            {**row, "_row_index": str(i)}
            for i, row in enumerate(playbyplay_rows(playbyplay[gid], gid))
        ]
        pairs = (
            [{**r, "_row_index": str(i)} for i, r in enumerate(matchup_rows(matchups[gid], gid))]
            if gid in matchups
            else []
        )
        if not pairs:
            missing_matchups.append(gid)
        facts[gid] = {
            "day": member["schedule"]["game_date"],
            "quality": game["quality"],
            "game_sha256": game["content_sha256"],
            "facts": game_facts(game, candidate, players[gid], rows, [], [], pairs),
        }
    method = {
        "contract_sha256": hash_file(Path("docs/design/impact-extras-v1.md"))[0],
        "code_sha256": {
            p: hash_file(Path(p))[0]
            for p in (
                "src/courtlens/domain/impact_extras.py",
                "src/courtlens/domain/impact_extras_catalog.py",
                "src/courtlens/evaluation/season_impact_fits.py",
            )
        },
    }
    body = {
        **aggregate(facts, cutoff),
        "season": season,
        "phase": phase,
        "provisional": True,
        "provisional_bundle_sha256": bundle["content_sha256"],
        "method": method,
        "attribution": "NBA Stats via hoopR (MIT); local non-commercial research",
        "disclosures": [
            "Descriptive, not causal; no forecast features.",
            "Provisional in-season values from one play-by-play source; shot-detail columns "
            "are unavailable in season and stay unknown.",
        ],
    }
    path, digest = write_artifact(output / "extras", body)
    fact_path, fact_digest = write_artifact(output / "facts", facts)
    return {
        "fact_sha256": fact_digest,
        "fact_path": str(fact_path),
        "version": EXTRAS_VERSION,
        "season": season,
        "phase": phase,
        "cutoff": cutoff,
        "sha256": digest,
        "path": str(path),
        "games": len(facts),
        "missing_matchup_games": missing_matchups,
        "boxes": box_receipts["player_box"],
    }
