"""W1 models under `courtlens-win-probability-v4` (see the registration for every rule).

v2, the frozen served model, is read and never changed: its game table, state files, pregame table,
model files and saved test-season probabilities under `data/derived/win-probability-v1`. v4 writes
only to `data/derived/win-probability-v4` and its evidence directory.

The pregame forecast is `mu4 = own + w x (line - own)`, where `own` is v2's stored expected home
margin (checked against `mu_from_entry` with the freeze manifest's coefficients) and `line` is the
closing spread's home margin (`-home_point`). A game with no line keeps `own`.

Stages:
`events` (ESPN scoreboards for the line seasons that v2's ESPN extracts do not cover, so the
closing lines can be joined to games; acquisition only, resumable), `checks` (the pre-fit checks:
own forecast, RMSEs and v2's log loss; no fit), `select` (stage S: w on 2022-23, K1 against K2 on
2023-24, writes the selection log), `check` (stage C: once, after the selection log is committed;
gates D1, D2 and A2 on 2024-25 and 2025-26) and `publish` (the summary the page reads).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import time
from collections.abc import Callable, Iterable
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow.parquet as pq  # type: ignore[import-untyped]

from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.domain.teams import TRICODE_TO_TEAM
from courtlens.evaluation import win_probability_data as wpd
from courtlens.evaluation import win_probability_models as wpm
from courtlens.evaluation import win_probability_v3 as v3
from courtlens.evaluation.win_probability_models import (
    MU_FULL,
    Stack,
    bootstrap_interval,
    fit_baseline,
    fit_overtime,
    game_means,
    improvement,
    state_losses,
)
from courtlens.evaluation.win_probability_report import MARKET, MARKET_SHA256, metric_block
from courtlens.services.win_probability_pregame import mu_from_entry

REGISTRATION = "courtlens-win-probability-v4"
REGISTERED = load_registration(REGISTRATION)
PARAMETERS = REGISTERED.parameters
SPLITS: dict[str, list[str]] = PARAMETERS["splits"]
SEED = int(PARAMETERS["seed"])
LINE_SEASONS: tuple[str, ...] = tuple(PARAMETERS["line_seasons"])
WEIGHT_SEASONS: dict[str, list[str]] = PARAMETERS["weight_fit_seasons"]
BOUNDS: tuple[float, float] = (
    float(PARAMETERS["weight_bounds"][0]),
    float(PARAMETERS["weight_bounds"][1]),
)
OUTPUT = Path("data/derived/win-probability-v4")
EVIDENCE = Path("docs/evidence/win-probability-v4")
PUBLISHED = Path("evaluation/research/derived/courtlens-win-probability-v4-check.json")
V2 = wpd.OUTPUT
V2_MANIFEST = Path("evaluation/research/frozen/courtlens-win-probability-v2.json")
OWN = MU_FULL
MU4 = "mu4"
FEATURES: tuple[str, ...] = v3.FEATURES_B
SPECIALIST_FEATURES: tuple[str, ...] = v3.SPECIALIST_FEATURES
SELECTION_LOG = "selection-log.json"
CHECK_REPORT = "check-report.json"
# Stage C's evaluation seasons and reference; module constants so a dry run can point them at a
# non-test season without touching the test seasons.
CHECK_SEASONS: list[str] = SPLITS["check"]
V2_REFERENCE = "selected"
# Measured for the plan (R15a and F05); the pre-fit checks must recompute them.
EXPECTED = {"own_rmse": 14.163, "line_rmse": 13.708, "v2_log_loss": 0.4028}


def receipt() -> dict[str, Any]:
    return registration_receipt(REGISTRATION)


def write_json(path: Path, body: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")


def read_json(path: Path) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(path.read_text())
    return body


def check_shared_rules() -> None:
    """v4 reuses v2's bootstrap, bins and seed through v2's code: they must be the same rules."""
    if SEED != wpm.SEED:
        raise ValueError("v4's seed differs from v2's")
    if int(PARAMETERS["bootstrap"]["replicates"]) != wpm.REPLICATES:
        raise ValueError("v4's bootstrap replicates differ from v2's")
    if int(PARAMETERS["ece_bins"]) != wpm.ECE_BINS:
        raise ValueError("v4's calibration bins differ from v2's")
    if PARAMETERS["reference"] != wpd.REGISTRATION:
        raise ValueError("the reference is not v2")


# ---------------------------------------------------------------------------------------------
# The pregame forecast.


def fit_weight(own: np.ndarray, line: np.ndarray, margin: np.ndarray) -> dict[str, Any]:
    """Least-squares w = sum((line - own)(margin - own)) / sum((line - own)^2), clipped."""
    gap = line - own
    denominator = float(np.sum(gap * gap))
    if len(own) == 0 or denominator == 0.0:
        raise ValueError("no games with a line that differs from the own forecast")
    unclipped = float(np.sum(gap * (margin - own)) / denominator)
    return {
        "w": float(min(max(unclipped, BOUNDS[0]), BOUNDS[1])),
        "unclipped": unclipped,
        "games": len(own),
    }


def with_market(own: float, line: float | None, w: float) -> float:
    """mu4 for one game; a game with no line keeps the own forecast."""
    if line is None:
        return own
    return own + w * (line - own)


def regression(own: np.ndarray, line: np.ndarray, margin: np.ndarray) -> dict[str, float]:
    """Unconstrained check (not used): margin on an intercept, the own forecast and the line."""
    design = np.column_stack([np.ones(len(own)), own, line])
    coefficients, *_ = np.linalg.lstsq(design, margin, rcond=None)
    residual = margin - design @ coefficients
    return {
        "intercept": float(coefficients[0]),
        "own": float(coefficients[1]),
        "line": float(coefficients[2]),
        "rmse": float(np.sqrt(np.mean(residual**2))),
        "games": len(own),
    }


def pregame_scores(margin: np.ndarray, forecast: np.ndarray) -> dict[str, Any]:
    """RMSE and winner accuracy (R15a's rule: a forecast of 0 picks the away team)."""
    squared = (margin - forecast) ** 2
    return {
        "rmse": float(math.sqrt(float(np.mean(squared)))),
        "squared_error": bootstrap_interval(squared),
        "winner_accuracy": float(np.mean((forecast > 0) == (margin > 0))),
    }


# ---------------------------------------------------------------------------------------------
# Closing lines joined to games.


def _team_id(espn_team: str) -> str | None:
    from courtlens.ingestion.espn_rosters import ESPN_TEAMS

    pair = ESPN_TEAMS.get(espn_team)
    if pair is None:
        return None
    team = TRICODE_TO_TEAM.get(pair[1])
    return None if team is None else str(team.team_id)


def scoreboard_events(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Every event on one ESPN scoreboard, with NBA team ids and the final score."""
    out = []
    for event in payload.get("events") or []:
        competition = (event.get("competitions") or [{}])[0]
        sides = {
            c.get("homeAway"): (_team_id(str((c.get("team") or {}).get("id"))), c.get("score"))
            for c in competition.get("competitors") or []
        }
        if "home" not in sides or "away" not in sides:
            continue
        out.append(
            {
                "event_id": int(event["id"]),
                "season_type": (event.get("season") or {}).get("type"),
                "home": sides["home"][0],
                "away": sides["away"][0],
                "home_score": None if sides["home"][1] is None else int(sides["home"][1]),
                "away_score": None if sides["away"][1] is None else int(sides["away"][1]),
            }
        )
    return out


def events_needed(table: dict[str, Any]) -> list[str]:
    """Game dates in the line seasons that v2's ESPN extracts do not cover."""
    covered = set(SPLITS["check"])
    return sorted(
        {
            g["date"]
            for g in table.values()
            if g["season"] in LINE_SEASONS and g["season"] not in covered
        }
    )


def stage_events(output: Path = OUTPUT) -> dict[str, Any]:
    """Read ESPN's scoreboard for each needed date; resumable, one line per date."""
    from courtlens.ingestion.espn_win_probability import Client, keep_raw

    table = wpd.read_games(V2)["games"]
    path = output / "espn-scoreboards.jsonl"
    done = set()
    if path.exists():
        done = {json.loads(line)["date"] for line in path.read_text().splitlines() if line}
    pending = [d for d in events_needed(table) if d not in done]
    client = Client()
    started = time.monotonic()
    for number, day in enumerate(pending, start=1):
        raw, payload = client.get(
            "scoreboard", {"dates": date.fromisoformat(day).strftime("%Y%m%d")}
        )
        kept = keep_raw(raw, "scoreboard", f"v4-{day}")
        row = {"date": day, "raw_sha256": kept["sha256"], "events": scoreboard_events(payload)}
        with path.open("a") as log:
            log.write(json.dumps(row, sort_keys=True) + "\n")
        if number % 25 == 0 or number == len(pending):
            print(
                json.dumps(
                    {
                        "date": day,
                        "done": number,
                        "of": len(pending),
                        "elapsed": round(time.monotonic() - started),
                    }
                ),
                flush=True,
            )
    return {"dates": len(done) + len(pending), "fetched": len(pending)}


def event_map(
    table: dict[str, Any], output: Path = OUTPUT
) -> tuple[dict[int, str], dict[str, Any]]:
    """ESPN event id -> NBA game id, from v2's ESPN extracts and v4's scoreboards.

    v2's extracts (2024-25, 2025-26) are joined exactly as R15a joined them. A scoreboard event is
    matched by date, home and away, and kept only when ESPN's final score equals the game table's.
    """
    mapping: dict[int, str] = {}
    for gid, g in table.items():
        if g["season"] not in SPLITS["check"]:
            continue
        path = V2 / "espn" / f"{gid}.json"
        if path.exists():
            extract = read_json(path)
            if extract["final_matches_nba"]:
                mapping[int(extract["espn_event_id"])] = gid
    by_key = {
        (g["date"], g["home"], g["away"]): gid
        for gid, g in table.items()
        if g["season"] in LINE_SEASONS and g["season"] not in SPLITS["check"]
    }
    score_mismatch: list[str] = []
    path = output / "espn-scoreboards.jsonl"
    rows = (
        [json.loads(line) for line in path.read_text().splitlines() if line]
        if path.exists()
        else []
    )
    for row in rows:
        for event in row["events"]:
            found = by_key.get((row["date"], event["home"], event["away"]))
            if found is None:
                continue
            gid = found
            g = table[gid]
            if (event["home_score"], event["away_score"]) != (g["home_pts"], g["away_pts"]):
                score_mismatch.append(gid)
                continue
            mapping[int(event["event_id"])] = gid
    return mapping, {"scoreboard_dates": len(rows), "score_mismatch": sorted(score_mismatch)}


def read_market() -> list[dict[str, Any]]:
    digest = hashlib.sha256(MARKET.read_bytes()).hexdigest()
    if digest != MARKET_SHA256:
        raise ValueError("closing lines differ from the pinned file")
    rows: list[dict[str, Any]] = pq.read_table(
        MARKET, columns=["game_id", "home_point", "commence_time"]
    ).to_pylist()
    return rows


def game_lines(
    table: dict[str, Any], output: Path = OUTPUT
) -> tuple[dict[str, float], dict[str, Any]]:
    """The closing line's home margin (-home_point) for each line-season game that has one."""
    mapping, receipts = event_map(table, output)
    market = read_market()
    ids = [int(r["game_id"]) for r in market]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate ESPN ids in the closing lines")
    lines: dict[str, float] = {}
    unmatched_lines = 0
    for row in market:
        gid = mapping.get(int(row["game_id"]))
        if gid is None:
            unmatched_lines += 1
            continue
        if row["home_point"] is None:
            continue
        lines[gid] = -float(row["home_point"])
    coverage = {}
    for season in LINE_SEASONS:
        games = [gid for gid, g in table.items() if g["season"] == season]
        with_line = sum(gid in lines for gid in games)
        mapped = len({gid for gid in mapping.values() if table[gid]["season"] == season})
        coverage[season] = {
            "games": len(games),
            "mapped_to_espn": mapped,
            "with_line": with_line,
            "without_line": len(games) - with_line,
        }
    return lines, {
        "market_sha256": MARKET_SHA256,
        "market_rows": len(market),
        "market_rows_not_joined": unmatched_lines,
        "coverage": coverage,
        **receipts,
    }


# ---------------------------------------------------------------------------------------------
# Seasons with mu4.


class SeasonV4(v3.SeasonV3):
    """v2's season view plus mu4 (v3's P1 columns are present and unused)."""

    def __init__(self, season: str, table: dict[str, Any], pregame: dict[str, Any]) -> None:
        super().__init__(season, table, pregame)
        values = np.array([float(pregame["games"][g][MU4]) for g in self.games], dtype=np.float64)
        self.game[MU4] = values[self.index]


def pregame_with(v2_pregame: dict[str, Any], lines: dict[str, float], w: float) -> dict[str, Any]:
    """v2's pregame table with mu4 added; every other column is v2's."""
    games = {
        gid: {
            **entry,
            MU4: with_market(float(entry[OWN]), lines.get(gid), w),
            v3.MU_PI: None,
            v3.PI_FEATURE: None,
        }
        for gid, entry in v2_pregame["games"].items()
    }
    return {"games": games}


def load(names: Iterable[str], pregame: dict[str, Any]) -> dict[str, SeasonV4]:
    table = wpd.read_games(V2)["games"]
    return {name: SeasonV4(name, table, pregame) for name in names}


def weight_for(
    seasons: list[str], table: dict[str, Any], v2_pregame: dict[str, Any], lines: dict[str, float]
) -> dict[str, Any]:
    games = sorted(g for g, x in table.items() if x["season"] in seasons and g in lines)
    own = np.array([v2_pregame["games"][g][OWN] for g in games], dtype=float)
    line = np.array([lines[g] for g in games], dtype=float)
    margin = np.array([table[g]["home_pts"] - table[g]["away_pts"] for g in games], dtype=float)
    fitted = fit_weight(own, line, margin)
    return {
        **fitted,
        "seasons": seasons,
        "games_sha256": hashlib.sha256("\n".join(games).encode()).hexdigest(),
        "regression_check": regression(own, line, margin),
    }


# ---------------------------------------------------------------------------------------------
# K1: the frozen model's boosters reading mu4.


def frozen_v2() -> dict[str, Any]:
    """v2's frozen parts, read from its ladder and checked against its freeze manifest."""
    manifest = read_json(V2_MANIFEST)
    if manifest["manifest_sha256"] != PARAMETERS["reference_manifest_sha256"]:
        raise ValueError("v2's freeze manifest is not the registered one")
    ladder = read_json(V2 / "ladder.json")
    step = ladder["steps"][ladder["accepted"]]
    models = {
        "mean": step["mean_model"],
        "variance": step["variance_model"],
        "end_game": ladder["end_game"]["model"],
    }
    if models != manifest["models"]:
        raise ValueError("v2's ladder models differ from its manifest")
    if step["mu"] != OWN or ladder["end_game"]["mu"] != OWN:
        raise ValueError("v2's boosters do not read the own forecast")
    if ladder["baseline"][OWN] != manifest["baseline"]:
        raise ValueError("v2's baseline differs from its manifest")
    if ladder["overtime_slope"][OWN] != manifest["overtime_slope"]:
        raise ValueError("v2's overtime slope differs from its manifest")
    if tuple(manifest["main_features"]) != FEATURES:
        raise ValueError("v2's main features differ from v4's")
    if tuple(manifest["end_game_features"]) != SPECIALIST_FEATURES:
        raise ValueError("v2's end-game features differ from v4's")
    if ladder["calibration"]["applied"]:
        raise ValueError("v2's selected model is recalibrated; K1 does not apply a slope")
    return {
        "baseline": manifest["baseline"],
        "overtime_slope": float(manifest["overtime_slope"]),
        "main": {
            "mean": wpm.read_model(V2, models["mean"]),
            "variance": wpm.read_model(V2, models["variance"]),
        },
        "specialist": wpm.read_model(V2, models["end_game"]),
        "models": models,
        "coefficients": manifest["pregame"]["coefficients"],
        "form_half_life_days": int(manifest["pregame"]["form_half_life_days"]),
    }


def k1_predict(frozen: dict[str, Any], season: SeasonV4, mu: str = MU4) -> np.ndarray:
    return v3.predict(
        season,
        mu,
        FEATURES,
        frozen["baseline"],
        frozen["overtime_slope"],
        frozen["main"],
        frozen["specialist"],
        False,
    )


# ---------------------------------------------------------------------------------------------
# Pre-fit checks (the Original model and the closing line only; nothing is fitted).


def own_forecast_check(
    table: dict[str, Any], v2_pregame: dict[str, Any], frozen: dict[str, Any]
) -> dict[str, Any]:
    half_life = str(frozen["form_half_life_days"])
    worst = 0.0
    rated = 0
    for gid, g in table.items():
        if g["strength_home"] is None or g["strength_away"] is None:
            continue
        mu = mu_from_entry({**g, "form": g["form"][half_life]}, frozen["coefficients"])
        worst = max(worst, abs(mu - float(v2_pregame["games"][gid][OWN])))
        rated += 1
    return {"rated_games": rated, "max_abs_difference": worst, "passed": worst < 1e-9}


def stage_checks(output: Path = OUTPUT) -> dict[str, Any]:
    check_shared_rules()
    started = time.monotonic()
    table = wpd.read_games(V2)["games"]
    v2_pregame = read_json(V2 / "pregame.json")
    frozen = frozen_v2()
    lines, join = game_lines(table, output)
    own_check = own_forecast_check(table, v2_pregame, frozen)
    seasons = load(SPLITS["check"], {"games": pregame_with(v2_pregame, {}, 0.0)["games"]})
    pregame: dict[str, Any] = {}
    losses = []
    for season in SPLITS["check"]:
        s = seasons[season]
        p = wpm.read_prediction(V2, "selected", season)
        if len(p) != len(s.time):
            raise ValueError("the frozen model's saved states differ from these states")
        loss, _ = game_means(state_losses(p, s.win)["log_loss"], s.index, len(s.games))
        losses.append(loss)
        pregame[season] = {"v2_log_loss": float(loss.mean())}
    games = [g for s in SPLITS["check"] for g in seasons[s].games]
    with_line = [g for g in games if g in lines]
    margin = np.array([table[g]["home_pts"] - table[g]["away_pts"] for g in with_line], dtype=float)
    own = np.array([v2_pregame["games"][g][OWN] for g in with_line], dtype=float)
    line = np.array([lines[g] for g in with_line], dtype=float)
    measured = {
        "own_rmse": float(math.sqrt(float(np.mean((margin - own) ** 2)))),
        "line_rmse": float(math.sqrt(float(np.mean((margin - line) ** 2)))),
        "own_winner_accuracy": float(np.mean((own > 0) == (margin > 0))),
        "line_winner_accuracy": float(np.mean((line > 0) == (margin > 0))),
        "v2_log_loss": float(np.concatenate(losses).mean()),
        "games": len(games),
        "games_with_line": len(with_line),
    }
    matches = {
        k: round(measured[k], 3 if k != "v2_log_loss" else 4) == v for k, v in EXPECTED.items()
    }
    body = {
        "version": REGISTRATION,
        "registration": receipt(),
        "own_forecast": own_check,
        "line_join": join,
        "check_seasons": measured,
        "by_season": pregame,
        "expected": EXPECTED,
        "matches": matches,
        "passed": bool(own_check["passed"] and all(matches.values())),
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }
    write_json(output / "prefit-checks.json", body)
    print(
        json.dumps(
            {k: body[k] for k in ("own_forecast", "check_seasons", "matches", "passed")}, indent=1
        ),
        flush=True,
    )
    print(json.dumps(join, indent=1), flush=True)
    return body


def require_checks(output: Path) -> dict[str, Any]:
    path = output / "prefit-checks.json"
    if not path.exists():
        raise ValueError("run the pre-fit checks first")
    checks = read_json(path)
    if not checks["passed"]:
        raise ValueError("the pre-fit checks did not pass; no fit")
    return checks


# ---------------------------------------------------------------------------------------------
# Stage S: selection on 2023-24.


def stage_select(output: Path = OUTPUT, evidence: Path = EVIDENCE) -> dict[str, Any]:
    check_shared_rules()
    started = time.monotonic()
    if (output / SELECTION_LOG).exists():
        raise ValueError("the selection log is already written")
    require_checks(output)
    table = wpd.read_games(V2)["games"]
    v2_pregame = read_json(V2 / "pregame.json")
    lines, join = game_lines(table, output)
    weight = weight_for(WEIGHT_SEASONS["selection"], table, v2_pregame, lines)
    pregame = pregame_with(v2_pregame, lines, weight["w"])
    select_name = SPLITS["select"][0]
    seasons = load([*SPLITS["train"], select_name], pregame)
    select = seasons[select_name]
    frozen = frozen_v2()

    # The K1 machinery reading the own forecast must reproduce v2's saved 2023-24 probabilities.
    reproduced = k1_predict(frozen, select, OWN)
    saved = wpm.read_prediction(V2, "E", select_name)
    reproduction = float(np.max(np.abs(reproduced - saved)))
    if reproduction > 1e-6:
        raise ValueError(f"K1 does not reproduce v2 on {select_name}: {reproduction}")

    p1 = k1_predict(frozen, select)
    wpm.save_prediction(output, "K1", select_name, p1)

    train = [seasons[s] for s in SPLITS["train"]]
    signs = v3.views(list(train))
    base = fit_baseline(list(train), signs, MU4)
    slope = fit_overtime(list(train), MU4)
    stack = Stack(list(train), signs, MU4, FEATURES, base)
    rng = np.random.default_rng(SEED + 1)
    select_stack = Stack(
        [select], [rng.choice(np.array([1.0, -1.0]), size=len(select.time))], MU4, FEATURES, base
    )
    main = v3.fit_main(stack, FEATURES, v3.v2_leaves(), select_stack, {})
    del stack, select_stack
    specialist, specialist_rounds = v3.fit_specialist(list(train), signs, MU4, False, select, None)
    p2 = v3.predict(select, MU4, FEATURES, base, slope, main, specialist, False)
    wpm.save_prediction(output, "K2", select_name, p2)

    def mean_loss(p: np.ndarray) -> float:
        loss, _ = game_means(
            state_losses(p, select.win)["log_loss"], select.index, len(select.games)
        )
        return float(loss.mean())

    level = float(PARAMETERS["selection_level"])
    gain = improvement(p2, p1, select, level)
    selected = "K2" if gain["low"] > 0 else "K1"
    games = select.games
    margin = np.array([table[g]["home_pts"] - table[g]["away_pts"] for g in games], dtype=float)
    own = np.array([v2_pregame["games"][g][OWN] for g in games], dtype=float)
    mu4 = np.array([pregame["games"][g][MU4] for g in games], dtype=float)
    has_line = np.array([g in lines for g in games])
    body: dict[str, Any] = {
        "version": REGISTRATION,
        "registration": receipt(),
        "stage": "S",
        "line_join": join,
        "weight": weight,
        "select_season": select_name,
        "games": len(games),
        "states": len(select.time),
        "k1": {
            "definition": "v2's frozen boosters, baseline and end-game specialist reading mu4",
            "models": frozen["models"],
            "reproduces_v2_with_own_forecast_max_abs": reproduction,
            "select_log_loss": mean_loss(p1),
        },
        "k2": {
            "definition": "v2's recipe refitted with mu4 on train, early stopping on select",
            "train_seasons": SPLITS["train"],
            "baseline": base,
            "overtime_slope": slope,
            "leaves": v3.v2_leaves(),
            "mean_model": wpm.write_model_file(output, main["mean"]),
            "variance_model": wpm.write_model_file(output, main["variance"]),
            "mean_rounds": int(main["mean_rounds"]),
            "variance_rounds": int(main["variance_rounds"]),
            "specialist_model": wpm.write_model_file(output, specialist),
            "specialist_rounds": int(specialist_rounds),
            "select_log_loss": mean_loss(p2),
        },
        "k2_vs_k1_90": gain,
        "against_v2_on_select_90": {
            "K1": improvement(p1, saved, select, level),
            "K2": improvement(p2, saved, select, level),
        },
        "v2_select_log_loss": mean_loss(saved),
        "pregame_on_select": {
            "games_without_line": int((~has_line).sum()),
            "own": pregame_scores(margin, own),
            "mu4": pregame_scores(margin, mu4),
            "line": pregame_scores(
                margin[has_line], np.array([lines[g] for g in games if g in lines], dtype=float)
            ),
        },
        "selected": selected,
        "rule": REGISTERED.selection,
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }
    write_json(output / SELECTION_LOG, body)
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / SELECTION_LOG).write_bytes((output / SELECTION_LOG).read_bytes())
    print(
        json.dumps(
            {
                k: body[k]
                for k in (
                    "weight",
                    "k2_vs_k1_90",
                    "against_v2_on_select_90",
                    "selected",
                    "elapsed_seconds",
                )
            },
            indent=1,
        ),
        flush=True,
    )
    return body


# ---------------------------------------------------------------------------------------------
# Stage C: the do-no-harm check, read once.


def git_committed(path: Path) -> bool:
    """True when `path` is tracked and identical to HEAD."""
    tracked = subprocess.run(
        ["git", "ls-files", "--error-unmatch", str(path)], capture_output=True, check=False
    )
    if tracked.returncode != 0:
        return False
    clean = subprocess.run(
        ["git", "diff", "--quiet", "HEAD", "--", str(path)], capture_output=True, check=False
    )
    return clean.returncode == 0


def require_selection(
    output: Path, evidence: Path, committed: Callable[[Path], bool] | None = None
) -> dict[str, Any]:
    """Stage C's guard: once only, and only after the selection log is written and committed."""
    if (output / CHECK_REPORT).exists():
        raise ValueError("stage C has already been read; a re-run needs a new version")
    log = output / SELECTION_LOG
    copy = evidence / SELECTION_LOG
    if not log.exists() or not copy.exists():
        raise ValueError("stage C needs the selection log")
    if log.read_bytes() != copy.read_bytes():
        raise ValueError("the evidence copy of the selection log differs from the stage S output")
    if not (committed or git_committed)(copy):
        raise ValueError("commit the selection log before stage C")
    return read_json(log)


def stage_check(output: Path = OUTPUT, evidence: Path = EVIDENCE) -> dict[str, Any]:
    check_shared_rules()
    started = time.monotonic()
    selection = require_selection(output, evidence)
    selection_sha = hashlib.sha256((output / SELECTION_LOG).read_bytes()).hexdigest()
    # Claim the read before any test-season outcome is touched, so a crash cannot allow a second.
    write_json(output / CHECK_REPORT, {"started": True, "selection_log_sha256": selection_sha})
    table = wpd.read_games(V2)["games"]
    v2_pregame = read_json(V2 / "pregame.json")
    lines, join = game_lines(table, output)
    weight = weight_for(WEIGHT_SEASONS["check"], table, v2_pregame, lines)
    pregame = pregame_with(v2_pregame, lines, weight["w"])
    selected = selection["selected"]
    check = CHECK_SEASONS
    refit: dict[str, Any] | None = None
    if selected == "K1":
        frozen = frozen_v2()

        def model(season: SeasonV4) -> np.ndarray:
            return k1_predict(frozen, season)

    else:
        k2 = selection["k2"]
        fit_seasons = [*SPLITS["train"], *SPLITS["select"]]
        train_map = load(fit_seasons, pregame)
        train = [train_map[s] for s in fit_seasons]
        signs = v3.views(list(train))
        base = fit_baseline(list(train), signs, MU4)
        slope = fit_overtime(list(train), MU4)
        stack = Stack(list(train), signs, MU4, FEATURES, base)
        main = v3.fit_main(
            stack,
            FEATURES,
            int(k2["leaves"]),
            None,
            {"mean_rounds": int(k2["mean_rounds"]), "variance_rounds": int(k2["variance_rounds"])},
        )
        del stack
        specialist, _ = v3.fit_specialist(
            list(train), signs, MU4, False, None, int(k2["specialist_rounds"])
        )
        del train_map, train
        refit = {
            "seasons": fit_seasons,
            "baseline": base,
            "overtime_slope": slope,
            "mean_model": wpm.write_model_file(output, main["mean"]),
            "variance_model": wpm.write_model_file(output, main["variance"]),
            "specialist_model": wpm.write_model_file(output, specialist),
        }

        def model(season: SeasonV4) -> np.ndarray:
            return v3.predict(season, MU4, FEATURES, base, slope, main, specialist, False)

    seasons = load(check, pregame)
    ordered = [seasons[s] for s in check]
    predictions = {
        "v4": {s: model(seasons[s]) for s in check},
        "v2_frozen": {s: wpm.read_prediction(V2, V2_REFERENCE, s) for s in check},
    }
    for s in check:
        if len(predictions["v2_frozen"][s]) != len(seasons[s].time):
            raise ValueError("the frozen model's saved states differ from these states")
        wpm.save_prediction(output, "v4_check", s, predictions["v4"][s])

    groups: dict[str, list[SeasonV4]] = {"pooled": ordered, **{s.season: [s] for s in ordered}}
    results: dict[str, Any] = {}
    pregame_block: dict[str, Any] = {}
    for label, members in groups.items():
        group: list[wpm.Season] = list(members)
        offsets = [int(o) for o in np.cumsum([0] + [len(s.games) for s in group[:-1]])]

        def pooled(name: str, members: list[SeasonV4] = members) -> np.ndarray:
            return np.concatenate([predictions[name][s.season] for s in members])

        results[label] = {
            "v4": metric_block(pooled("v4"), pooled("v2_frozen"), group, offsets),
            "v2_frozen": metric_block(pooled("v2_frozen"), None, group, offsets),
        }
        games = [g for s in members for g in s.games]
        margin = np.array([table[g]["home_pts"] - table[g]["away_pts"] for g in games], dtype=float)
        own = np.array([v2_pregame["games"][g][OWN] for g in games], dtype=float)
        mu4 = np.array([pregame["games"][g][MU4] for g in games], dtype=float)
        has_line = np.array([g in lines for g in games])
        pregame_block[label] = {
            "games": len(games),
            "games_without_line": int((~has_line).sum()),
            "mu4": pregame_scores(margin, mu4),
            "own": pregame_scores(margin, own),
            "line": pregame_scores(
                margin[has_line], np.array([lines[g] for g in games if g in lines], dtype=float)
            ),
            "squared_error_improvement": bootstrap_interval(
                (margin - own) ** 2 - (margin - mu4) ** 2
            ),
        }
    overall = results["pooled"]["v4"]["overall"]
    d1 = overall["log_loss_improvement"]
    d2 = pregame_block["pooled"]["squared_error_improvement"]
    a2 = overall["calibration"]["ece"]
    gates = {
        "D1": {"log_loss_improvement_vs_v2_frozen": d1, "passed": not d1["high"] < 0},
        "D2": {"squared_error_improvement_vs_own": d2, "passed": not d2["high"] < 0},
        "A2": {"ece": a2, "limit": 0.02, "passed": a2 <= 0.02},
    }
    body = {
        "version": REGISTRATION,
        "registration": receipt(),
        "stage": "C",
        "selection_log_sha256": selection_sha,
        "selected": selected,
        "line_join": join,
        "weight": weight,
        "k2_refit": refit,
        "games": {s.season: len(s.games) for s in ordered},
        "states": {s.season: len(s.time) for s in ordered},
        "gates": gates,
        "continue": all(g["passed"] for g in gates.values()),
        "pregame": pregame_block,
        "results": results,
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }
    write_json(output / CHECK_REPORT, body)
    print(
        json.dumps(
            {
                k: body[k]
                for k in ("selected", "weight", "games", "gates", "continue", "elapsed_seconds")
            },
            indent=1,
        ),
        flush=True,
    )
    return body


# ---------------------------------------------------------------------------------------------
# The summary the page reads.


def stage_publish(output: Path = OUTPUT, evidence: Path = EVIDENCE) -> dict[str, Any]:
    report_path = output / CHECK_REPORT
    report = read_json(report_path)
    if "gates" not in report:
        raise ValueError("stage C has not finished")
    selection = read_json(output / SELECTION_LOG)
    evidence.mkdir(parents=True, exist_ok=True)
    for name in ("prefit-checks.json", CHECK_REPORT):
        (evidence / name).write_bytes((output / name).read_bytes())
    pooled = report["results"]["pooled"]

    def interval(block: dict[str, Any]) -> dict[str, Any]:
        return {k: float(block[k]) for k in ("mean", "low", "high")} | {"games": block["games"]}

    def scores(name: str) -> dict[str, float]:
        overall = pooled[name]["overall"]
        return {
            "log_loss": float(overall["log_loss"]["mean"]),
            "brier": float(overall["brier"]["mean"]),
            "calibration_error": float(overall["calibration"]["ece"]),
        }

    def pregame(label: str) -> dict[str, Any]:
        block = report["pregame"][label]
        return {
            "games": block["games"],
            "games_without_line": block["games_without_line"],
            **{
                name: {k: block[name][k] for k in ("rmse", "winner_accuracy")}
                for name in ("mu4", "own", "line")
            },
            "squared_error_improvement": interval(block["squared_error_improvement"]),
        }

    body: dict[str, Any] = {
        "version": REGISTRATION,
        "registration_sha256": receipt()["content_sha256"],
        "check_report_sha256": hashlib.sha256(report_path.read_bytes()).hexdigest(),
        "selection_log_sha256": report["selection_log_sha256"],
        "check_seasons": CHECK_SEASONS,
        "games": int(sum(report["games"].values())),
        "weights": {
            "selection": {
                k: selection["weight"][k] for k in ("w", "unclipped", "games", "seasons")
            },
            "check": {k: report["weight"][k] for k in ("w", "unclipped", "games", "seasons")},
        },
        "selected": report["selected"],
        "selection": {
            "k2_vs_k1_90": interval(selection["k2_vs_k1_90"]),
            "k1_select_log_loss": selection["k1"]["select_log_loss"],
            "k2_select_log_loss": selection["k2"]["select_log_loss"],
        },
        "gates": report["gates"],
        "continue": report["continue"],
        "scores": {"v4": scores("v4"), "v2_frozen": scores("v2_frozen")},
        "by_phase": {
            phase: interval(pooled["v4"][phase]["log_loss_improvement"]) for phase in wpm.PHASES
        },
        "by_season": {
            season: interval(report["results"][season]["v4"]["overall"]["log_loss_improvement"])
            for season in CHECK_SEASONS
        },
        "pregame": {label: pregame(label) for label in ("pooled", *CHECK_SEASONS)},
    }
    write_json(PUBLISHED, body)
    print(
        json.dumps({k: body[k] for k in ("selected", "weights", "continue")}, indent=1), flush=True
    )
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("events", "checks", "select", "check", "publish"))
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    {
        "events": stage_events,
        "checks": stage_checks,
        "select": stage_select,
        "check": stage_check,
        "publish": stage_publish,
    }[args.command](args.output)


if __name__ == "__main__":
    main()
