"""Attempt tables for `courtlens-shot-decomposition-v1` (Research R06, Part A).

One content-hashed table per regular season 2022-23 to 2025-26. A row is one shooting attempt
(a field-goal attempt or a single free throw) on an R01 sealed possession, with the possession's
offence and defence lineups. Inputs, all read by hash, none edited:

- R01 possessions: the accepted regular-season IM03 bundles (`impact_history_fits.bundle_paths`),
  every game member checked against its content SHA-256. Events carry their PlayByPlayV3 action
  number (CDN-arbitrated events use the same numbering; the join checks team and result).
- R05 shots: the pinned `courtlens-expected-shot-v2` tables and its accepted model
  (`serving_model`, lightgbm_31, run `a`), checked against the choice file's SHA-256, with the
  frozen 2023-24 Platt calibration. Nothing is refitted.
- Free throws: PlayByPlayV3 archives (subType, shooter, result), the same pinned bytes R05 read.
- FT% prior: R03's frozen league Beta prior for FT% for the season (`courtlens-signal-noise-v1`,
  fitted on the three earlier seasons only).

    python -m courtlens.evaluation.shot_decomposition_data --season 2024-25
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain import expected_shot_v2 as es
from courtlens.domain import shot_decomposition as sd
from courtlens.domain.research_registry import load_registration
from courtlens.evaluation import expected_shot_v2_data as shots_data
from courtlens.evaluation import expected_shot_v2_runner as r05
from courtlens.evaluation.impact_history_fits import bundle_paths
from courtlens.evaluation.impact_rating_inputs import checked

OUTPUT = Path("data/derived/shot-decomposition-v1/tables")
SEASONS = ("2022-23", "2023-24", "2024-25", "2025-26")
HISTORY_SEASONS = 3  # the shooter's own attempts: this season and the three before it
R05_RUN = Path("data/derived/expected-shot-v2/runs/a")
R05_FROZEN = Path("evaluation/research/frozen/courtlens-expected-shot-v2.json")
R03_FROZEN = Path("evaluation/research/frozen/courtlens-signal-noise-v1.json")
STRING_COLUMNS = ("game_id", "kind")


def season_label(year: int) -> str:
    return f"{year}-{(year + 1) % 100:02d}"


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def r05_model() -> dict[str, Any]:
    """The accepted R05 model, its hash-checked text and the frozen Platt values."""
    frozen = json.loads(R05_FROZEN.read_text())
    name = frozen["serving_model"]
    if name != "lightgbm_31" or not frozen["test"]["accepted"]:
        raise SystemExit("R05's accepted model is not lightgbm_31")
    choice = json.loads((R05_RUN / "choice.json").read_text())
    models = R05_RUN / "models"
    for file, digest in choice["model_sha256"].items():
        if file_sha(models / file) != digest:
            raise SystemExit(f"R05 saved model {file} changed")
    platt = frozen["calibration"]["platt"][name]
    return {
        "name": name,
        "models_dir": models,
        "model_sha256": choice["model_sha256"][f"{name}.txt"],
        "vocabulary_sha256": choice["model_sha256"]["vocabulary.json"],
        "platt": {"a": platt["a"], "b": platt["b"]},
        "frozen_league_xpps": {s: frozen["players"]["seasons"][s]["league_xpps"] for s in SEASONS},
    }


def expected_shot_points(season: str, model: dict[str, Any]) -> dict[str, Any]:
    """Calibrated expected field-goal points for every R05 shot of the season."""
    pins = load_registration(r05.REGISTRATION).parameters["table_sha256"]
    table = r05.load_season(season, pins[season])
    raw = r05.predict_all(model["models_dir"], table, (model["name"],))[model["name"]]
    p = es.platt(raw, model["platt"]["a"], model["platt"]["b"])
    value = table["value"].astype(float)
    return {
        "table_sha256": pins[season],
        "keys": {
            (str(g), int(e)): i
            for i, (g, e) in enumerate(zip(table["game_id"], table["event_id"], strict=True))
        },
        "game_id": table["game_id"],
        "team_id": table["team_id"],
        "made": table["made"],
        "value": value,
        "expected": value * p,
        "dates": {str(g): int(d) for g, d in zip(table["game_id"], table["date"], strict=True)},
        "league_xpps": float(np.mean(value * p)),
    }


def free_throw_events(years: range, dates: dict[str, int]) -> dict[str, Any]:
    """Classified free throws of the given regular seasons, keyed by (game, action number)."""
    pins = shots_data.pbp_pins()
    events: dict[tuple[str, int], tuple[sd.FreeThrow, int, str]] = {}
    unknown: Counter[str] = Counter()
    for year in years:
        season = season_label(year)
        for game, rows in shots_data.games_in_order(
            shots_data.archive_csv(pins[season], f"nbastatsv3_{year}")
        ):
            if game not in dates:
                raise SystemExit(f"no date for {game}")
            found, bad = sd.game_free_throws(rows)
            unknown.update(f"{season}:{text}" for text in bad)
            for ft in found:
                key = (game, ft.action_number)
                if key in events:
                    raise SystemExit(f"duplicate free throw {key}")
                events[key] = (ft, dates[game], season)
        print("free throws read", season, len(events), flush=True)
    return {"events": events, "unknown_sub_types": dict(sorted(unknown.items()))}


def ft_probabilities(
    events: dict[tuple[str, int], tuple[sd.FreeThrow, int, str]],
    season: str,
    prior: dict[str, float],
) -> tuple[dict[tuple[str, int], float], dict[str, int]]:
    """Each free throw of `season` gets the posterior mean from attempts on earlier dates only."""
    first = int(season[:4]) - HISTORY_SEASONS
    window = {season_label(y) for y in range(first, int(season[:4]) + 1)}
    by_date: dict[int, list[tuple[tuple[str, int], sd.FreeThrow, str]]] = defaultdict(list)
    for key, (ft, day, s) in events.items():
        if s in window:
            by_date[day].append((key, ft, s))
    makes: Counter[str] = Counter()
    attempts: Counter[str] = Counter()
    result: dict[tuple[str, int], float] = {}
    no_history = 0
    for day in sorted(by_date):
        for key, ft, s in by_date[day]:
            if s == season:
                if attempts[ft.person_id] == 0:
                    no_history += 1
                result[key] = sd.ft_probability(
                    prior["alpha"], prior["beta"], makes[ft.person_id], attempts[ft.person_id]
                )
        for _key, ft, _s in by_date[day]:
            attempts[ft.person_id] += 1
            makes[ft.person_id] += int(ft.made)
    return result, {
        "free_throws_scored": len(result),
        "shooter_without_earlier_attempts": no_history,
    }


def content_sha(arrays: dict[str, np.ndarray]) -> str:
    return shots_data.content_sha(arrays)


def build(season: str, model: dict[str, Any], output: Path = OUTPUT) -> dict[str, Any]:
    year = int(season[:4])
    shots = expected_shot_points(season, model)
    history_dates = dict(shots["dates"])
    pins = load_registration(r05.REGISTRATION).parameters["table_sha256"]
    for back in range(1, HISTORY_SEASONS + 1):
        earlier = r05.load_season(season_label(year - back), pins[season_label(year - back)])
        history_dates.update(
            {str(g): int(d) for g, d in zip(earlier["game_id"], earlier["date"], strict=True)}
        )
    fts = free_throw_events(range(year - HISTORY_SEASONS, year + 1), history_dates)
    prior_entry = json.loads(R03_FROZEN.read_text())["priors"]["ft_pct"][season]
    if not prior_entry["converged"] or prior_entry["on_bound"]:
        raise SystemExit(f"R03 FT% prior for {season} is not usable")
    prior = {"alpha": float(prior_entry["alpha"]), "beta": float(prior_entry["beta"])}
    probabilities, ft_history = ft_probabilities(fts["events"], season, prior)

    path, source = bundle_paths()[season]
    bundle = checked(path, path.name.removesuffix(".json.gz"))
    counts: Counter[str] = Counter()
    kinds: Counter[str] = Counter()
    col: dict[str, list[Any]] = defaultdict(list)
    used_shots: set[int] = set()
    used_fts: set[tuple[str, int]] = set()
    admitted = set(bundle["members"])
    for gid, member in sorted(bundle["members"].items()):
        game = checked(Path(member["path"]), member["content_sha256"])
        home = member["schedule"]["home_team_id"]
        day = shots["dates"].get(gid)
        if day is None:
            raise SystemExit(f"admitted game {gid} has no R05 shot date")
        for p in game["possessions"]:
            counts["possessions"] += 1
            off, defense = p["off_lineup_json"], p["def_lineup_json"]
            if len(set(off)) != 5 or len(set(defense)) != 5 or set(off) & set(defense):
                raise SystemExit(f"possession lineup is not two disjoint fives in {gid}")
            attempts = 0
            for event in p["stats_json"]["events"]:
                values = event["values"]
                number = int(event["locator"]["action_number"])
                key = (gid, number)
                if "fga" in values:
                    index = shots["keys"].get(key)
                    if index is None:
                        counts["fga_without_r05_shot"] += 1
                        continue
                    if str(shots["team_id"][index]) != p["offense_team_id"] or int(
                        shots["made"][index]
                    ) != int(values.get("fgm", 0)):
                        counts["fga_team_or_result_differs"] += 1
                        continue
                    used_shots.add(index)
                    counts[f"fga_joined_via_{event['locator']['source']}"] += 1
                    kind, actual = sd.FGA, float(shots["value"][index] * shots["made"][index])
                    expected, prob, shooter = float(shots["expected"][index]), np.nan, -1
                elif "fta" in values:
                    entry = fts["events"].get(key)
                    if entry is None:
                        counts["ft_without_pbp_row"] += 1
                        continue
                    ft = entry[0]
                    if ft.team_id != p["offense_team_id"] or int(ft.made) != int(
                        values.get("ftm", 0)
                    ):
                        counts["ft_team_or_result_differs"] += 1
                        continue
                    used_fts.add(key)
                    kind, actual, expected = ft.kind, float(ft.made), np.nan
                    prob, shooter = probabilities[key], int(ft.person_id)
                else:
                    continue
                attempts += 1
                kinds[kind] += 1
                col["game_id"].append(gid)
                col["date"].append(day)
                col["action_number"].append(number)
                col["off"].append([int(x) for x in sorted(off)])
                col["def"].append([int(x) for x in sorted(defense)])
                col["offense_home"].append(int(p["offense_team_id"] == home))
                col["offense_team"].append(int(p["offense_team_id"]))
                col["counted_possession"].append(int(bool(p["count_as_possession"])))
                col["kind"].append(kind)
                col["actual"].append(actual)
                col["expected_points"].append(expected)
                col["ft_probability"].append(prob)
                col["shooter"].append(shooter)
            if p["count_as_possession"]:
                counts["counted_possessions"] += 1
                if attempts == 0:
                    counts["counted_possessions_without_attempt"] += 1
                    if p["stats_json"]["turnovers"]:
                        counts["counted_possessions_without_attempt_turnover"] += 1
                elif p["stats_json"]["turnovers"]:
                    counts["counted_possessions_with_attempt_and_turnover"] += 1
            elif attempts:
                counts["uncounted_segments_with_attempt"] += 1

    shot_games = {str(g) for g in shots["game_id"]}
    unjoined = [i for i in range(len(shots["game_id"])) if i not in used_shots]
    unjoined_by: Counter[str] = Counter(
        "game_not_admitted" if str(shots["game_id"][i]) not in admitted else "not_on_a_possession"
        for i in unjoined
    )
    season_fts = [k for k, v in fts["events"].items() if v[2] == season]
    ft_unjoined: Counter[str] = Counter(
        "game_not_admitted" if k[0] not in admitted else "not_on_a_possession"
        for k in season_fts
        if k not in used_fts
    )
    arrays: dict[str, np.ndarray] = {}
    for name, values in col.items():
        if name in STRING_COLUMNS:
            arrays[name] = np.array(values, dtype=np.str_)
        elif name in ("off", "def"):
            arrays[name] = np.array(values, dtype=np.int64).reshape(-1, 5)
        elif name in ("date", "action_number", "offense_team", "shooter"):
            arrays[name] = np.array(values, dtype=np.int64)
        elif name in ("offense_home", "counted_possession"):
            arrays[name] = np.array(values, dtype=np.int8)
        else:
            arrays[name] = np.array(values, dtype=np.float64)
    digest = content_sha(arrays)
    output.mkdir(parents=True, exist_ok=True)
    table_path = output / f"{season}.{digest[:16]}.npz"
    np.savez(table_path, **arrays)  # type: ignore[arg-type]
    receipt: dict[str, Any] = {
        "season": season,
        "table": str(table_path),
        "content_sha256": digest,
        "rows": len(col["kind"]),
        "kinds": dict(sorted(kinds.items())),
        "possessions": {k: v for k, v in sorted(counts.items()) if "possession" in k},
        "join": {k: v for k, v in sorted(counts.items()) if "possession" not in k},
        "inputs": {
            "r01_bundle_sha256": path.name.removesuffix(".json.gz"),
            "r01_bundle_source": source,
            "r01_admitted_games": len(admitted),
            "r05_table_sha256": shots["table_sha256"],
            "r05_model": model["name"],
            "r05_model_sha256": model["model_sha256"],
            "r05_vocabulary_sha256": model["vocabulary_sha256"],
            "r05_platt": model["platt"],
            "r03_ft_prior": prior,
            "pbp_archive_sha256": {
                season_label(y): shots_data.pbp_pins()[season_label(y)]
                for y in range(year - HISTORY_SEASONS, year + 1)
            },
        },
        "r05_shots": {
            "shots": len(shots["game_id"]),
            "games": len(shot_games),
            "joined": len(used_shots),
            "join_rate": len(used_shots) / len(shots["game_id"]),
            "unjoined": dict(sorted(unjoined_by.items())),
            "unjoined_games": len({str(shots["game_id"][i]) for i in unjoined}),
        },
        "free_throws": {
            "season_free_throws": len(season_fts),
            "joined": len(used_fts),
            "unjoined": dict(sorted(ft_unjoined.items())),
            "classified": dict(
                sorted(Counter(fts["events"][k][0].kind for k in season_fts).items())
            ),
            "unknown_sub_types": fts["unknown_sub_types"],
            **ft_history,
        },
        "recompute": {
            "league_xpps": shots["league_xpps"],
            "r05_frozen_league_xpps": model["frozen_league_xpps"][season],
            "absolute_difference": abs(shots["league_xpps"] - model["frozen_league_xpps"][season]),
        },
    }
    if receipt["recompute"]["absolute_difference"] > 1e-6:
        raise SystemExit(f"R05 league xPPS does not recompute for {season}: {receipt['recompute']}")
    (output / f"{season}.receipt.json").write_text(json.dumps(receipt, indent=1, sort_keys=True))
    print(json.dumps(receipt, sort_keys=True), flush=True)
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", action="append", choices=SEASONS)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    model = r05_model()
    for season in args.season or SEASONS:
        build(season, model, args.output)


if __name__ == "__main__":
    main()
