"""Run courtlens-zts-validation-v1 (R04): served zTS values and the registered validation.

Usage (one thread, under the registered memory cap):
    OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
        python -m courtlens.evaluation.zts_runner --output <file>

`--choice-only` reads only the choice-season pairs, as the registration requires before the
test pairs are read. Reads the Synergy play-type mart, the served impact bundle (rTS and oTS
RAPM) and, for the FTA check only, raw Synergy fields and box totals. Fits nothing; every
metric must be finite.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import resource
import time
from collections import defaultdict
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session

from courtlens.database import SessionLocal
from courtlens.domain import zts
from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.services.impact_serving import load_impact_store, served_path
from courtlens.services.workbench_analytics import resolve_workbench_context

PHASE = "regular_season"


def _check_threads() -> None:
    for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        if os.environ.get(name) != "1":
            raise SystemExit(f"{name}=1 is required (registered budget: one thread)")


def _parameters() -> dict[str, Any]:
    params = load_registration(zts.REGISTRATION).parameters
    # The module's constants must be the registered ones.
    checks = {
        "play_types": list(zts.PLAY_TYPES),
        "source_min_possessions": zts.SOURCE_MIN_POSSESSIONS,
        "min_tsa": zts.MIN_TSA,
        "min_coverage": zts.MIN_COVERAGE,
        "frequency_rounding": zts.FREQUENCY_ROUNDING,
    }
    for key, value in checks.items():
        if params[key] != value:
            raise SystemExit(f"module constant {key} differs from the registration")
    return params


# ---- Inputs -------------------------------------------------------------------------------------


def load_play_types(session: Session, seasons: list[str]) -> dict[str, Any]:
    rows = session.execute(
        text(
            """SELECT season, player_id::text, team_id::text, play_type, possessions, frequency,
                   points, turnover_frequency
            FROM analytics_marts.mart_stats_player_play_types
            WHERE side = 'offensive' AND season_type = :phase AND season = ANY(:seasons)
            ORDER BY season, player_id, team_id, play_type"""
        ),
        {"phase": PHASE, "seasons": seasons},
    ).all()
    by: dict[str, dict[str, dict[str, list[zts.TypeRow]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(list))
    )
    digests: dict[str, Any] = {}
    for season, player, team, play_type, poss, freq, pts, tov in rows:
        if None in (poss, freq, pts, tov):
            raise SystemExit(f"null Synergy field for {season} {player} {team} {play_type}")
        row = zts.TypeRow(play_type, float(poss), float(freq), float(pts), float(tov))
        if row.possessions < zts.SOURCE_MIN_POSSESSIONS:
            raise SystemExit("a listed row is below the registered source minimum")
        by[season][player][team].append(row)
        digests.setdefault(season, hashlib.sha256()).update(
            f"{player}|{team}|{play_type}|{poss}|{freq}|{pts}|{tov}\n".encode()
        )
    missing = sorted(set(seasons) - set(by))
    if missing:
        raise SystemExit(f"no Synergy rows for {missing}")
    return {"rows": by, "sha256": {s: d.hexdigest() for s, d in sorted(digests.items())}}


def load_bundle(seasons: list[str]) -> dict[str, Any]:
    store = load_impact_store()
    path = served_path()
    if store is None or path is None:
        raise SystemExit("impact serving bundle unavailable")
    rts: dict[str, dict[str, tuple[float | None, float | None]]] = {}
    ots: dict[str, dict[str, float | None]] = {}
    for entry in store["entries"]:
        scope = entry["scope"]
        if scope.get("phase") != PHASE or scope.get("years") != 1:
            continue
        season = scope["season"]
        if season not in seasons:
            continue
        if entry["kind"] == "extras":
            rts[season] = {
                pid: (
                    p["metrics"].get("impact_rts"),
                    (p["support"].get("impact_rts") or {}).get("denominator"),
                )
                for pid, p in entry["players"].items()
            }
        elif entry["kind"] == "ratings":
            ots[season] = {pid: p["metrics"].get("o_ts") for pid, p in entry["players"].items()}
    for name, got in (("extras", rts), ("ratings", ots)):
        if sorted(got) != sorted(seasons):
            raise SystemExit(f"bundle {name} seasons {sorted(got)} differ from {seasons}")
    digests = {}
    for season in seasons:
        d = hashlib.sha256()
        for pid in sorted(set(rts[season]) | set(ots[season])):
            value, tsa = rts[season].get(pid, (None, None))
            d.update(f"{pid}|{value!r}|{tsa!r}|{ots[season].get(pid)!r}\n".encode())
        digests[season] = d.hexdigest()
    return {"rts": rts, "ots": ots, "bundle_sha256": path.stem, "values_sha256": digests}


def fta_check(session: Session, dataset_id: str, seasons: list[str]) -> dict[str, Any]:
    """Can box FTA be recovered from Synergy fields? Reported only; chooses nothing."""
    box = {
        (r[0], str(r[1])): r[2:]
        for r in session.execute(
            text(
                """SELECT season, player_id,
                    sum((stats_json->>'free_throws_attempted')::float),
                    sum((stats_json->>'field_goals_attempted')::float),
                    sum((stats_json->>'points')::float),
                    sum((stats_json->>'field_goals_made')::float),
                    sum((stats_json->>'three_pointers_made')::float),
                    sum((stats_json->>'free_throws_made')::float)
                FROM workbench_player_games
                WHERE dataset_id = :d AND phase = :phase AND appearance = 'appeared'
                    AND season = ANY(:seasons)
                GROUP BY 1, 2"""
            ),
            {"d": dataset_id, "phase": PHASE, "seasons": seasons},
        )
    }
    synergy = session.execute(
        text(
            """SELECT season, player_id::text, count(DISTINCT team_id),
                sum((v->>'poss')::float), sum((v->>'poss_pct')::float),
                sum((v->>'pts')::float), sum((v->>'fgm')::float),
                sum((v->>'poss')::float * (v->>'ft_poss_pct')::float),
                sum((v->>'poss')::float * (v->>'plusone_poss_pct')::float)
            FROM (SELECT season, player_id, team_id, source_values AS v
                  FROM analytics_staging.stg_stats_feed_rows
                  WHERE feed = 'play_types' AND season_type = :phase
                    AND variant LIKE '%%\\_offensive' AND season = ANY(:seasons)) x
            GROUP BY 1, 2"""
        ),
        {"phase": PHASE, "seasons": seasons},
    ).all()
    proxy, trips_only, mixed = [], [], []
    for season, player, teams, _poss, freq, pts, fgm, trips, and_ones in synergy:
        b = box.get((season, player))
        if b is None or teams != 1 or freq < 0.98:
            continue
        fta, fga, _box_pts, _fgm, fg3m, ftm = b
        if not fga or fga < 300 or not fta:
            continue
        proxy.append((2 * (trips - and_ones) + and_ones) / fta)
        trips_only.append(2 * trips / fta)
        mixed.append((pts - 2 * fgm) - (fg3m + ftm))

    def quantiles(values: list[float]) -> dict[str, float]:
        q = np.percentile(values, [1, 5, 25, 50, 75, 95, 99])
        return dict(zip(("p01", "p05", "p25", "p50", "p75", "p95", "p99"), q.tolist(), strict=True))

    exact = sum(1 for v in proxy if abs(v - 1.0) < 1e-9)
    return {
        "population": "single-team regular-season player-seasons with Synergy frequency sum >= "
        "0.98 and >= 300 box FGA",
        "player_seasons": len(proxy),
        "exact_matches": exact,
        "ratio_proxy_to_box_fta": quantiles(proxy),
        "ratio_two_per_trip_to_box_fta": quantiles(trips_only),
        "synergy_pts_minus_2fgm_minus_box_3pm_ftm": quantiles(mixed),
        "derivable": False,
        "rule": "play-type TS = PTS / (2 x possessions x (1 - turnover share)), CourtLens's "
        "definition",
    }


# ---- Values --------------------------------------------------------------------------------------


def season_values(
    synergy: Mapping[str, Mapping[str, list[zts.TypeRow]]],
    rts: Mapping[str, tuple[float | None, float | None]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    refs = zts.league_references(
        row for teams in synergy.values() for rows in teams.values() for row in rows
    )
    # Acceptance: the league mix reproduces league Synergy TS (difficulty zero).
    league_mix = {k: v["share"] for k, v in refs["types"].items()}
    if abs(zts.expected_ts(league_mix, refs) - refs["ts"]) > 1e-9:
        raise SystemExit("league mix does not reproduce league TS")
    players: dict[str, Any] = {}
    for pid in sorted(set(synergy) | set(rts)):
        teams = synergy.get(pid)
        mix = None
        team_order: list[str] = []
        if teams:
            team_mixes = {team: zts.team_mix(rows) for team, rows in teams.items()}
            mix = zts.combine(list(team_mixes.values()))
            team_order = sorted(team_mixes, key=lambda t: (-team_mixes[t]["listed_possessions"], t))
        value, tsa = rts.get(pid, (None, None))
        result = zts.player_value(value, tsa, mix, refs)
        if result["status"] == zts.KNOWN:
            assert mix is not None
            if abs(sum(zts.shares(mix["types"]).values()) - 1.0) > 1e-9:
                raise SystemExit("shares do not sum to one")
            if abs(result["zts"] - result["rts"] - result["difficulty"]) > 1e-12:
                raise SystemExit("zTS - rTS differs from difficulty")
        players[pid] = {
            **result,
            "teams": team_order,
            "coverage": mix["coverage"] if mix else None,
            "listed_possessions": mix["listed_possessions"] if mix else None,
            "implied_possessions": mix["implied_possessions"] if mix else None,
            "dropped_row": mix["dropped_row"] if mix else None,
            "types": {
                k: [v["possessions"], v["scoring_possessions"], v["points"]]
                for k, v in (mix["types"].items() if mix else [])
            },
        }
    return refs, players


# ---- Validation ----------------------------------------------------------------------------------


def _pairs(
    values: Mapping[str, Mapping[str, Any]],
    bundle: Mapping[str, Any],
    seasons: list[str],
    target: str,
) -> list[tuple[str, str, float, float, float, float]]:
    """(season, player, rTS_t, zTS_t, target, weight) rows."""
    out = []
    for season in seasons:
        for pid, v in sorted(values[season].items()):
            if v["status"] != zts.KNOWN:
                continue
            if target == "predictive":
                nxt = f"{int(season[:4]) + 1}-{(int(season[:4]) + 2) % 100:02d}"
                value, tsa = bundle["rts"][nxt].get(pid, (None, None))
                if value is None or tsa is None or tsa < zts.MIN_TSA:
                    continue
                weight = float(zts.harmonic_mean(np.array(v["tsa"]), np.array(tsa)))
                out.append((season, pid, v["rts"], v["zts"], float(value), weight))
            else:
                ots = bundle["ots"][season].get(pid)
                if ots is None:
                    continue
                out.append((season, pid, v["rts"], v["zts"], float(ots), float(v["tsa"])))
    return out


def _summarise(
    rows: list[tuple[str, str, float, float, float, float]],
    *,
    with_mse: bool,
    replicates: int,
    rng: np.random.Generator,
) -> dict[str, Any]:
    players = np.array([r[1] for r in rows])
    arrays = [np.array([r[i] for r in rows], dtype=float) for i in (2, 3, 4, 5)]
    metrics = zts.paired_bootstrap(
        players, *arrays, with_mse=with_mse, replicates=replicates, rng=rng
    )
    return {
        "rows": len(rows),
        "players": len(set(players.tolist())),
        "metrics": metrics,
        "verdict_r": zts.verdict(metrics["delta_r"]),
        **({"verdict_mse": zts.verdict(metrics["delta_mse"])} if with_mse else {}),
    }


def validation(
    values: Mapping[str, Mapping[str, Any]],
    bundle: Mapping[str, Any],
    params: Mapping[str, Any],
    splits: tuple[str, ...] = ("choice", "test"),
) -> dict[str, Any]:
    rng = np.random.default_rng(load_registration(zts.REGISTRATION).seed)
    replicates = int(params["bootstrap_replicates"])
    out: dict[str, Any] = {}
    for target, key in (("predictive", "predictive_t"), ("tracking", "tracking_t")):
        with_mse = target == "predictive"
        out[target] = {}
        for split, seasons in (
            ("choice", params["choice_seasons"][key]),
            ("test", params["test_seasons"][key]),
        ):
            if split not in splits:
                continue
            rows = _pairs(values, bundle, list(seasons), target)
            pooled = _summarise(rows, with_mse=with_mse, replicates=replicates, rng=rng)
            by_season = {
                s: _summarise(
                    [r for r in rows if r[0] == s],
                    with_mse=with_mse,
                    replicates=replicates,
                    rng=rng,
                )
                for s in seasons
            }
            out[target][split] = {
                "seasons": list(seasons),
                "pooled": pooled,
                "by_season": by_season,
            }
    return out


# ---- Output --------------------------------------------------------------------------------------


def _rounded(value: Any) -> Any:
    if isinstance(value, float):
        if not np.isfinite(value):
            raise SystemExit("non-finite value in results")
        return round(value, 9)
    if isinstance(value, dict):
        return {str(k): _rounded(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_rounded(v) for v in value]
    if isinstance(value, np.generic):
        return _rounded(value.item())
    return value


def canonical(payload: Mapping[str, Any]) -> bytes:
    return (
        json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n"
    ).encode()


def coverage_table(values: Mapping[str, Any]) -> dict[str, Any]:
    out = {}
    for season, players in values.items():
        counts: dict[str, int] = defaultdict(int)
        for v in players.values():
            counts[v["status"]] += 1
        out[season] = {"player_seasons": len(players), "status": dict(sorted(counts.items()))}
    return out


def build(session: Session, splits: tuple[str, ...] = ("choice", "test")) -> dict[str, Any]:
    params = _parameters()
    receipt = registration_receipt(zts.REGISTRATION)
    seasons = list(params["zts_seasons"])
    context = resolve_workbench_context(session)
    synergy = load_play_types(session, seasons)
    bundle = load_bundle(seasons)
    references: dict[str, Any] = {}
    values: dict[str, Any] = {}
    for season in seasons:
        references[season], values[season] = season_values(
            synergy["rows"][season], bundle["rts"][season]
        )
    payload = {
        "registration": receipt,
        "inputs": {
            "release_id": str(context.release_id),
            "dataset_id": context.dataset_id,
            "play_types_sha256": synergy["sha256"],
            "impact_bundle_sha256": bundle["bundle_sha256"],
            "impact_values_sha256": bundle["values_sha256"],
        },
        "fta_check": fta_check(session, context.dataset_id, seasons),
        "coverage": coverage_table(values),
        "references": references,
        "validation": validation(values, bundle, params, splits),
        "players": values,
    }
    rounded: dict[str, Any] = _rounded(payload)
    rounded["results_sha256"] = hashlib.sha256(canonical(rounded)).hexdigest()
    return rounded


EVIDENCE_SECTIONS = (
    "registration",
    "inputs",
    "fta_check",
    "coverage",
    "validation",
    "results_sha256",
)


def evidence_extract(result: Mapping[str, Any]) -> dict[str, Any]:
    """The registered evidence copy: these sections of the frozen file, values unchanged."""
    return {key: result[key] for key in EVIDENCE_SECTIONS}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--extract-from",
        type=Path,
        help="write the evidence sections of an existing results file to --output and stop",
    )
    parser.add_argument("--run-log", type=Path)
    parser.add_argument(
        "--choice-only",
        action="store_true",
        help="pipeline check on the choice seasons; never the published file",
    )
    args = parser.parse_args()
    if args.extract_from:
        frozen = json.loads(args.extract_from.read_text())
        args.output.write_bytes(
            (json.dumps(evidence_extract(frozen), sort_keys=True, indent=1) + "\n").encode()
        )
        return
    _check_threads()
    started = time.monotonic()
    with SessionLocal() as session:
        result = build(session, ("choice",) if args.choice_only else ("choice", "test"))
    if args.choice_only:
        result["choice_only"] = True
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(canonical(result))
    run = {
        "results_sha256": result["results_sha256"],
        "wall_seconds": round(time.monotonic() - started, 1),
        "peak_rss_mib": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
    }
    if args.run_log:
        args.run_log.write_text(json.dumps(run, indent=1) + "\n")
    print(json.dumps(run))


if __name__ == "__main__":
    main()
