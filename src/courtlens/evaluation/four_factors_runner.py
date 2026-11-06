"""ORtg calculator inputs (`courtlens-four-factors-inputs-v2`, R10). Descriptive counts.

v2 corrects v1's three-point rule (v1 read only `shotValue`, absent before 2024-25) and checks
every game's counted points against its final score.

For every NBA regular season 2014-15 to 2025-26, counts each team's field goals, free throws by
trip kind, turnovers (team turnovers included) and rebounds after each kind of miss from the
pinned PlayByPlayV3 archives R05/R06 read (shufinskiy/nba_data). From the counts: the share of
possession-ending free throws (mu, Poropudas and Halme, Appendix A), the paper's inputs and its
Eq. (11) offensive rating, league and team, plus offensive-rebound rates after missed twos,
threes and final free throws (Databallr's ORtg Lab splits the rebound term this way).

Subcommands: `check` (coverage only: games, unknown free-throw text; no rate), `test` (one read,
refused once results exist), `reproduce` (recompute and compare hashes).
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from courtlens.domain import four_factors as ff
from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.evaluation import expected_shot_v2_data as shots_data
from courtlens.ingestion.native_reconstruction import content_hash

REGISTRATION = "courtlens-four-factors-inputs-v2"
RESULTS_PATH = Path("evaluation/research/frozen/courtlens-four-factors-inputs-v2.json")
SEASONS = tuple(f"{y}-{(y + 1) % 100:02d}" for y in range(2014, 2026))
PAPER = "arXiv:2305.13032v2"
PARAMETERS: dict[str, Any] = {
    "seasons": list(SEASONS),
    "phase": "regular_season",
    "ending_sub_types": list(ff.ENDING_SUB_TYPES),
    "miss_kinds": list(ff.MISS_KINDS),
    "marginal_step": 0.01,
    "paper": PAPER,
    "three_rule": "shotValue when present, else '3PT' in the description",
    "points_check": "counted points of both teams equal the final scoreHome + scoreAway",
}


def check_registration(parameters: Mapping[str, Any]) -> None:
    for key, value in PARAMETERS.items():
        if parameters.get(key) != value:
            raise SystemExit(f"module constant {key} differs from the registration")


def season_counts(season: str, sha: str) -> tuple[dict[str, Counter[str]], dict[str, Any]]:
    """Team counts for one season, plus coverage and each team ID's tricode."""
    year = int(season[:4])
    teams: dict[str, Counter[str]] = {}
    unknown: Counter[str] = Counter()
    codes: dict[str, str] = {}
    no_score: list[str] = []
    mismatched: list[dict[str, Any]] = []
    games = 0
    for game, rows in shots_data.games_in_order(shots_data.archive_csv(sha, f"nbastatsv3_{year}")):
        games += 1
        for row in rows:
            team, code = row.get("teamId", "").strip(), row.get("teamTricode", "").strip()
            if team not in ("", "0") and code:
                codes.setdefault(team, code)
        counted = ff.count_game(rows)
        unknown.update(counted.unknown_sub_types)
        total = sum(c["points"] for c in counted.teams.values())
        if counted.final_points is None:
            no_score.append(game)
        elif total != counted.final_points:
            mismatched.append({"game_id": game, "counted": total, "final": counted.final_points})
        for team, c in counted.teams.items():
            teams.setdefault(team, Counter()).update(c)
    return teams, {
        "games": games,
        "games_without_final_score": no_score,
        "games_points_differ_from_final_score": mismatched,
        "unknown_ft_sub_types": dict(sorted(unknown.items())),
        "tricodes": dict(sorted(codes.items())),
    }


def r6(value: float | None) -> float | None:
    return None if value is None else round(float(value), 6)


def summarize(c: Mapping[str, float], mu: float) -> dict[str, Any]:
    f = ff.factors(c, mu)
    kinds = {}
    for k in ff.MISS_KINDS:
        rebounded = c[f"orb_{k}"] + c[f"drb_{k}"]
        kinds[k] = {
            "misses": int(c[f"miss_{k}"]),
            "offensive": int(c[f"orb_{k}"]),
            "defensive": int(c[f"drb_{k}"]),
            "unrebounded": int(c[f"unrebounded_{k}"]),
            "orb_rate": r6(ff.rate(c[f"orb_{k}"], rebounded)),
        }
    fg2a = c["fga"] - c["fg3a"]
    inputs = {k: f[k] for k in ("efg", "ftr", "tov_pct", "orb_pct", "fg", "ft")}
    complete = all(v is not None for v in inputs.values())
    return {
        "counts": {k: int(v) for k, v in sorted(c.items())},
        "inputs": {k: r6(v) for k, v in inputs.items()},
        "fg2": r6(ff.rate(c["fgm"] - c["fg3m"], fg2a)),
        "fg3": r6(ff.rate(c["fg3m"], c["fg3a"])),
        "fg3a_rate": r6(ff.rate(c["fg3a"], c["fga"])),
        "ts": r6(ff.rate(c["points"], 2 * (c["fga"] + 0.44 * c["fta"]))),
        "possessions": r6(f["possessions"]),
        "ortg_box": r6(f["ortg_box"]),
        "ortg_factors": r6(f["ortg_factors"]),
        "rebounds_by_miss": kinds,
        "marginals": (
            {k: r6(v) for k, v in ff.marginals(inputs, mu).items()}  # type: ignore[arg-type]
            if complete
            else {}
        ),
    }


def season_result(season: str, sha: str) -> dict[str, Any]:
    teams, coverage = season_counts(season, sha)
    codes = coverage.pop("tricodes")
    # A row with neither a team nor a team in personId (one turnover in 2020-21..2022-23) has
    # no offence: reported here, kept out of every team and league total.
    stray = {t: dict(teams.pop(t)) for t in [t for t in teams if t in ("", "0")]}
    coverage["unattributed_rows"] = stray
    league: Counter[str] = Counter()
    for c in teams.values():
        league.update(c)
    league["games"] = coverage["games"]
    mu = league["ft_end"] / league["fta"]
    beta = league["ft_end_made"] / league["ft_end"]
    alpha = ff.rate(league["orb_ft_end"], league["orb_ft_end"] + league["drb_ft_end"])
    unknown_team = sorted(t for t in teams if t not in codes)
    return {
        "season": season,
        "archive_sha256": sha,
        "coverage": {**coverage, "teams": len(teams), "teams_without_tricode": unknown_team},
        "mu": r6(mu),
        "ft_end_make_rate": r6(beta),
        "ft_end_orb_rate": r6(alpha),
        "league": summarize(league, mu),
        "teams": {
            codes.get(t, t): summarize(c, mu)
            for t, c in sorted(teams.items(), key=lambda kv: codes.get(kv[0], kv[0]))
        },
    }


def run(pins: Mapping[str, str], receipt: Mapping[str, Any]) -> dict[str, Any]:
    seasons = [season_result(s, pins[s]) for s in SEASONS]
    for s in seasons:
        print("season", s["season"], "mu", s["mu"], flush=True)
    results: dict[str, Any] = {
        "version": REGISTRATION,
        "registration": dict(receipt),
        "paper": PAPER,
        "seasons": {s["season"]: s for s in seasons},
    }
    results["results_sha256"] = content_hash(results)
    return results


def checked_pins() -> tuple[dict[str, str], dict[str, Any]]:
    registration = load_registration(REGISTRATION)
    params = registration.parameters
    check_registration(params)
    pins = shots_data.pbp_pins()
    if {s: pins[s] for s in SEASONS} != params["archive_sha256"]:
        raise SystemExit("play-by-play archive pins differ from the registration")
    return pins, registration_receipt(REGISTRATION)


def command_check() -> dict[str, Any]:
    """Coverage only, before registration: games and unknown free-throw text per season."""
    pins = shots_data.pbp_pins()
    out = {}
    for season in SEASONS:
        teams, coverage = season_counts(season, pins[season])
        coverage.pop("tricodes")
        coverage["unattributed_rows"] = {t: dict(teams[t]) for t in teams if t in ("", "0")}
        total: Counter[str] = Counter()
        for c in teams.values():
            total.update(c)
        out[season] = {
            **coverage,
            "archive_sha256": pins[season],
            "teams": len(teams),
            "free_throw_rows_unclassified": int(total["unknown_ft_sub_types"]),
            "no_turnover_rows": int(total["no_turnover_rows"]),
        }
        print(season, out[season]["games"], flush=True)
    return out


def write_json(path: Path, body: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("check", "test", "reproduce"))
    parser.add_argument("--results", type=Path, default=RESULTS_PATH)
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()
    if args.command == "check":
        out: dict[str, Any] = command_check()
        if args.report:
            write_json(args.report, out)
    elif args.command == "test":
        if args.results.exists():
            raise SystemExit("the results have been read; `reproduce` recomputes them")
        pins, receipt = checked_pins()
        results = run(pins, receipt)
        write_json(args.results, results)
        out = {"results_sha256": results["results_sha256"]}
    else:
        pins, receipt = checked_pins()
        again = run(pins, receipt)
        frozen = json.loads(args.results.read_text())
        out = {
            "frozen": frozen["results_sha256"],
            "recomputed": again["results_sha256"],
            "identical": frozen["results_sha256"] == again["results_sha256"],
        }
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
