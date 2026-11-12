"""Both models scored from the same seals after the Market-informed model's freeze (v4, W3b).

The Original (`courtlens-win-probability-v2`) keeps its scorecard rows, schema and drift exactly as
before. This module adds, beside them and keyed by the same game:

- one head-to-head row per regular-season game tipping after v4's freeze that has a seal: both
  models' probabilities on the same sampled states, their tip-off calls, and the pregame margin
  error of the own forecast and of mu4;
- the registered reads (V1 pregame margin, V2 whole-game log loss), each "better", "worse" or
  "not distinguishable", reported from 25 games, read once at 300 games and once at the end of the
  regular season; the 300-game and final reads are written once and never recomputed;
- `serving_model`, which the Live chart follows: the Market-informed model, unless a read found
  V1 or V2 "worse", which returns Live to the Original with no person involved.

Positive differences favour v4. Nothing here changes the Original's rows or files.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np

from courtlens.domain.win_probability_scorecard import (
    BOOTSTRAP_REPLICATES,
    BOOTSTRAP_SEED,
    DRIFT_WINDOW_DAYS,
    PHASES,
    calibration_error,
    drift_status,
    game_bins,
    losses,
    phase_masks,
)
from courtlens.domain.win_probability_state import COLUMNS
from courtlens.services import win_probability_production as production
from courtlens.services.win_probability_market import market_inputs, market_mu
from courtlens.services.win_probability_serving import (
    FrozenModel,
    GameInputs,
    StateColumns,
    manifest_hash,
    sampled_states,
)

MANIFEST_PATH = Path("evaluation/research/frozen/courtlens-win-probability-v4.json")
MANIFEST_SCHEMA = "courtlens-win-probability-v4-frozen-v1"
DRIFT_PATH = Path("evaluation/research/derived/courtlens-win-probability-v4-drift.json")
NOTES_PATH = Path("evaluation/research/derived/courtlens-win-probability-v2-protocol-notes.json")
ROWS = "head-to-head.jsonl"
READS = "head-to-head-reads.jsonl"
SUMMARY = "head-to-head.json"
REPORT_FROM = 25
VERDICT_AT = 300
TOSS_UP = (0.45, 0.55)
ORIGINAL = "original"
MARKET = "market_informed"
POSTSEASON_MONTHS = (4, 5, 6)
EASTERN = ZoneInfo("America/New_York")


# ---------------------------------------------------------------------------------------------
# The frozen Market-informed model.


def load_market_manifest() -> dict[str, Any]:
    """v4's manifest, hash-checked and tied to the Original's manifest as served."""
    body: dict[str, Any] = json.loads(MANIFEST_PATH.read_text())
    if body.get("schema") != MANIFEST_SCHEMA or manifest_hash(body) != body["manifest_sha256"]:
        raise ValueError("v4 manifest failed its hash check")
    if body["reference"]["manifest_sha256"] != production.load_manifest()["manifest_sha256"]:
        raise ValueError("v4 was frozen against a different Original manifest")
    return body


def line_of(record: dict[str, Any]) -> float | None:
    """The market's expected home margin in a seal; None when the seal has no line."""
    line = record.get("line")
    if not line or line.get("home_margin") is None:
        return None
    return float(line["home_margin"])


class MarketModel:
    """K1: the Original's model reading mu4 where it reads the own forecast."""

    def __init__(self, base: FrozenModel, line: float | None, w: float) -> None:
        self.base, self.line, self.w = base, line, w

    def predict_home(self, states: StateColumns, game: GameInputs) -> np.ndarray:
        return self.base.predict_home(states, market_inputs(game, self.line, self.w))


def opening_state() -> StateColumns:
    """The state every game starts from: no time gone, period 1, every counter zero."""
    columns = {name: np.zeros(1) for name in COLUMNS}
    columns["period"] = np.ones(1)
    return StateColumns(np.zeros(1), np.ones(1, dtype=np.int64), columns)


def tip_off_probabilities(base: FrozenModel, record: dict[str, Any], w: float) -> dict[str, float]:
    """Each model's home win probability at the opening state, as a seal records them."""
    inputs = GameInputs(**record["inputs"])
    state = opening_state()
    return {
        ORIGINAL: float(base.predict_home(state, inputs)[0]),
        MARKET: float(MarketModel(base, line_of(record), w).predict_home(state, inputs)[0]),
    }


def seal_fields(base: FrozenModel, record: dict[str, Any], w: float) -> dict[str, Any]:
    """The fields a seal made after the freeze carries: mu4, w and both tip-off probabilities."""
    return {
        "mu4": market_mu(float(record["inputs"]["mu"]), line_of(record), w),
        "w": w,
        "tip_off_home": tip_off_probabilities(base, record, w),
    }


# ---------------------------------------------------------------------------------------------
# Scoring one game for both models.


def _call(p: float, home_won: bool) -> float:
    """1 for a right call, 0 for a wrong one, a half for an even call."""
    if p == 0.5:
        return 0.5
    return 1.0 if (p > 0.5) == home_won else 0.0


def head_to_head_row(
    base: FrozenModel,
    summary: dict[str, Any],
    record: dict[str, Any],
    captured_at: str,
    tip: str,
    manifest: dict[str, Any],
) -> dict[str, Any]:
    """Both models on the same sampled states of one final game."""
    game = summary["game"]
    teams = {t["side"]: t for t in game["teams"]}
    home_score, away_score = int(teams["home"]["score"]), int(teams["away"]["score"])
    win = 1.0 if home_score > away_score else 0.0
    built, _ = production._replay_from(summary["plays"])
    states = sampled_states(built)
    inputs = GameInputs(**record["inputs"])
    w = float(manifest["market"]["w"])
    line = line_of(record)
    p = {
        ORIGINAL: base.predict_home(states, inputs),
        MARKET: MarketModel(base, line, w).predict_home(states, inputs),
    }
    masks = phase_masks(states.time)
    scored: dict[str, Any] = {}
    for name, values in p.items():
        log_loss, brier = losses(values, win)
        phases = {}
        for phase in PHASES:
            if masks[phase].any():
                phase_loss, phase_brier = losses(values[masks[phase]], win)
                phases[phase] = {"log_loss": phase_loss, "brier": phase_brier}
        scored[name] = {
            "log_loss": log_loss,
            "brier": brier,
            "phases": phases,
            "tip_off_home": float(values[0]),
            "bins": game_bins(values, win),
        }
    own = float(inputs.mu)
    mu4 = market_mu(own, line, w)
    margin = home_score - away_score
    age = production._parse_time(tip) - production._parse_time(captured_at)
    return {
        "game_id": game["source_id"],
        "date": game["slate_date"],
        "tip_off": tip,
        "home": teams["home"].get("abbreviation"),
        "away": teams["away"].get("abbreviation"),
        "home_score": home_score,
        "away_score": away_score,
        "states": len(states),
        "captured_at": captured_at,
        "seal_age_minutes": round(age.total_seconds() / 60, 1),
        "pregame": {
            "own": own,
            "line": line,
            "mu4": mu4,
            "margin": margin,
            "squared_error_own": (margin - own) ** 2,
            "squared_error_mu4": (margin - mu4) ** 2,
        },
        "calls": {
            ORIGINAL: _call(scored[ORIGINAL]["tip_off_home"], win == 1.0),
            MARKET: _call(scored[MARKET]["tip_off_home"], win == 1.0),
            "line": None if line is None else _call(0.5 + float(np.sign(line)) / 4, win == 1.0),
        },
        ORIGINAL: scored[ORIGINAL],
        MARKET: scored[MARKET],
        "manifest_sha256": manifest["manifest_sha256"],
    }


def rows() -> list[dict[str, Any]]:
    path = production.serving_root() / "scorecard" / ROWS
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def pending_games(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    """The Original's scored prospective rows tipping after v4's freeze with no head-to-head row."""
    frozen = production._parse_time(manifest["frozen_at"])
    done = {r["game_id"] for r in rows()}
    return [
        r
        for r in production.scorecard_rows()
        if r["prospective"]
        and r["game_id"] not in done
        and r.get("tip_off")
        and production._parse_time(r["tip_off"]) > frozen
    ]


def score_pending(client: Any, base: FrozenModel, manifest: dict[str, Any]) -> dict[str, int]:
    """Head-to-head rows for every game the Original has scored since v4's freeze."""
    from courtlens.domain.live import parse_summary
    from courtlens.ingestion.espn_win_probability import keep_raw

    counts = {"head_to_head_scored": 0, "head_to_head_no_seal": 0}
    path = production.serving_root() / "scorecard" / ROWS
    path.parent.mkdir(parents=True, exist_ok=True)
    for scored in pending_games(manifest):
        found = production.inputs_for(scored["game_id"], scored["date"], scored["tip_off"])
        if found is None or found[0].get("availability") != "tip_off_capture":
            counts["head_to_head_no_seal"] += 1
            continue
        record, captured_at = found
        raw, body = client.get("summary", {"event": scored["game_id"]})
        keep_raw(raw, "summary", scored["game_id"])
        summary = parse_summary(body, date.fromisoformat(scored["date"]), scored["game_id"])
        if not summary.get("plays"):
            continue
        row = head_to_head_row(base, summary, record, captured_at, scored["tip_off"], manifest)
        with path.open("a") as log:
            log.write(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n")
        counts["head_to_head_scored"] += 1
    return counts


# ---------------------------------------------------------------------------------------------
# The reads.


def paired_interval(values: np.ndarray) -> dict[str, float]:
    """The registered game bootstrap (stage C's `bootstrap_interval`, seed 2501, 2000 draws)."""
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    picks = rng.integers(0, len(values), size=(BOOTSTRAP_REPLICATES, len(values)))
    draws = values[picks].mean(axis=1)
    return {
        "mean": float(values.mean()),
        "low": float(np.quantile(draws, 0.025)),
        "high": float(np.quantile(draws, 0.975)),
        "games": len(values),
    }


def result_of(interval: dict[str, float]) -> str:
    if interval["low"] > 0:
        return "better"
    if interval["high"] < 0:
        return "worse"
    return "not distinguishable"


def _ordered(games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(games, key=lambda r: (r["tip_off"], r["game_id"]))


def read(games: list[dict[str, Any]]) -> dict[str, Any]:
    """V1 and V2 on a set of head-to-head games; positive favours v4."""
    games = _ordered(games)
    v1 = paired_interval(
        np.array(
            [g["pregame"]["squared_error_own"] - g["pregame"]["squared_error_mu4"] for g in games]
        )
    )
    v2 = paired_interval(np.array([g[ORIGINAL]["log_loss"] - g[MARKET]["log_loss"] for g in games]))
    phases = {}
    for phase in PHASES:
        reached = [g for g in games if phase in g[MARKET]["phases"]]
        if len(reached) >= 2:
            interval = paired_interval(
                np.array(
                    [
                        g[ORIGINAL]["phases"][phase]["log_loss"]
                        - g[MARKET]["phases"][phase]["log_loss"]
                        for g in reached
                    ]
                )
            )
            phases[phase] = {**interval, "result": result_of(interval)}
    return {
        "games": len(games),
        "through": games[-1]["tip_off"],
        "v1": {**v1, "result": result_of(v1)},
        "v2": {**v2, "result": result_of(v2), "phases": phases},
    }


def written_reads() -> list[dict[str, Any]]:
    path = production.serving_root() / "scorecard" / READS
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def _write_read(body: dict[str, Any]) -> None:
    path = production.serving_root() / "scorecard" / READS
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as log:
        log.write(json.dumps(body, sort_keys=True, separators=(",", ":")) + "\n")


def season_over(payload: dict[str, Any], today: date) -> bool:
    """ESPN's scoreboard has left the regular season (play-in or playoffs) in spring."""
    leagues = payload.get("leagues") or [{}]
    kind = ((leagues[0].get("season") or {}).get("type") or {}).get("type")
    return today.month in POSTSEASON_MONTHS and kind is not None and int(kind) != 2


def take_reads(games: list[dict[str, Any]], over: bool, now: datetime) -> list[dict[str, Any]]:
    """Write the 300-game read and the final read, each once. Returns every written read."""
    written = written_reads()
    kinds = {r["kind"] for r in written}
    ordered = _ordered(games)
    stamp = now.isoformat(timespec="seconds")
    if "verdict" not in kinds and len(ordered) >= VERDICT_AT:
        body = {"kind": "verdict", "read_at": stamp, **read(ordered[:VERDICT_AT])}
        _write_read(body)
        written.append(body)
    if "final" not in kinds and over and len(ordered) >= REPORT_FROM:
        body = {"kind": "final", "read_at": stamp, **read(ordered)}
        _write_read(body)
        written.append(body)
    return written


def serving_model(written: list[dict[str, Any]]) -> dict[str, Any]:
    """The registered rule: Live returns to the Original if a read found V1 or V2 worse."""
    for body in written:
        if "worse" in (body["v1"]["result"], body["v2"]["result"]):
            return {
                "model": ORIGINAL,
                "reason": f"the {body['kind']} read found the Market-informed model worse",
                "since": body["read_at"],
            }
    return {"model": MARKET, "reason": "no read has found the Market-informed model worse"}


def record_of_calls(games: list[dict[str, Any]]) -> dict[str, Any]:
    lined = [g for g in games if g["calls"]["line"] is not None]
    toss_up = [g for g in games if TOSS_UP[0] <= g[MARKET]["tip_off_home"] <= TOSS_UP[1]]
    return {
        "games": len(games),
        ORIGINAL: sum(g["calls"][ORIGINAL] for g in games),
        MARKET: sum(g["calls"][MARKET] for g in games),
        "line": {"games": len(lined), "right": sum(g["calls"]["line"] for g in lined)},
        "toss_ups": len(toss_up),
    }


def drift(games: list[dict[str, Any]]) -> dict[str, Any] | None:
    """v4's own monitor: the Original's rule, with v4's interval from its stage C predictions."""
    if not games or not DRIFT_PATH.exists():
        return None
    table = json.loads(DRIFT_PATH.read_text())["by_window_games"]
    ordered = sorted(games, key=lambda r: (r["date"], r["game_id"]))
    last = date.fromisoformat(ordered[-1]["date"])
    start = date.fromordinal(last.toordinal() - DRIFT_WINDOW_DAYS + 1).isoformat()
    window = [r for r in ordered if start <= r["date"] <= last.isoformat()]
    error = calibration_error(np.array([r[MARKET]["bins"] for r in window]).sum(axis=0))
    return {
        "date": last.isoformat(),
        "games": len(window),
        **drift_status(error, len(window), table),
    }


def summarize(games: list[dict[str, Any]], written: list[dict[str, Any]]) -> dict[str, Any]:
    games = _ordered(games)
    ages = [g["seal_age_minutes"] for g in games]
    body: dict[str, Any] = {
        "games": len(games),
        "report_from_games": REPORT_FROM,
        "verdict_at_games": VERDICT_AT,
        "games_without_line": sum(g["pregame"]["line"] is None for g in games),
        "seal_age_minutes": {
            "median": float(np.median(ages)) if ages else None,
            "maximum": max(ages) if ages else None,
        },
        "record_of_calls": record_of_calls(games),
        "current": read(games) if len(games) >= REPORT_FROM else None,
        "too_early_to_call": not any(r["kind"] == "verdict" for r in written),
        "reads": written,
        "serving_model": serving_model(written),
        "drift": drift(games),
    }
    return body


def write_summary(
    client: Any | None = None, today: date | None = None, now: datetime | None = None
) -> dict[str, Any]:
    """Take any due read and rewrite the page's head-to-head summary."""
    now = now or datetime.now(UTC)
    today = today or now.astimezone(EASTERN).date()
    games = rows()
    over = False
    final_due = not any(r["kind"] == "final" for r in written_reads())
    if client is not None and today.month in POSTSEASON_MONTHS and games and final_due:
        _, payload = client.get("scoreboard", {"dates": today.strftime("%Y%m%d")})
        over = season_over(payload, today)
    written = take_reads(games, over, now)
    manifest = load_market_manifest()
    body = {
        "schema": "courtlens-win-probability-head-to-head-v1",
        "updated_at": now.isoformat(timespec="seconds"),
        "model": {
            "version": manifest["version"],
            "manifest_sha256": manifest["manifest_sha256"],
            "frozen_at": manifest["frozen_at"],
            "w": manifest["market"]["w"],
        },
        **summarize(games, written),
    }
    production._replace(
        production.serving_root() / "scorecard" / SUMMARY,
        json.dumps(body, sort_keys=True, separators=(",", ":")),
    )
    return body


def read_summary() -> dict[str, Any] | None:
    path = production.serving_root() / "scorecard" / SUMMARY
    if not path.exists():
        return None
    body: dict[str, Any] = json.loads(path.read_text())
    return body


def protocol_notes() -> list[dict[str, Any]]:
    try:
        notes: list[dict[str, Any]] = json.loads(NOTES_PATH.read_text())["notes"]
    except (OSError, ValueError, KeyError):
        return []
    return notes


# ---------------------------------------------------------------------------------------------
# Live.


def live_probability(game_id: str, data: dict[str, Any] | None) -> dict[str, Any]:
    """The Live chart: the serving model's line. A game sealed before v4's freeze, or any game
    while the Original serves, shows the Original's line exactly as before."""
    original = production.game_probability(game_id, data)
    if original.get("status") != "ok" or not data:
        return {**original, "serving": ORIGINAL}
    try:
        manifest = load_market_manifest()
    except (OSError, ValueError):
        return {**original, "serving": ORIGINAL}
    summary = read_summary()
    serving = (summary or {}).get("serving_model", {}).get("model", MARKET)
    sealed_after = production._parse_time(original["captured_at"]) > production._parse_time(
        manifest["frozen_at"]
    )
    if serving != MARKET or not sealed_after:
        return {**original, "serving": ORIGINAL}
    game = data["game"]
    found = production.inputs_for(game_id, game["slate_date"], game.get("event_time"))
    if found is None:
        return {**original, "serving": ORIGINAL}
    record = found[0]
    w = float(manifest["market"]["w"])
    line = line_of(record)
    model = MarketModel(production.get_model(), line, w)
    series = production.event_series(model, data["plays"], record)
    return {
        **original,
        "serving": MARKET,
        "model": {
            "version": manifest["version"],
            "manifest_sha256": manifest["manifest_sha256"],
            "frozen_at": manifest["frozen_at"],
        },
        "original_model": original["model"],
        "market": {
            "own": float(record["inputs"]["mu"]),
            "line": line,
            "mu4": market_mu(float(record["inputs"]["mu"]), line, w),
            "w": w,
        },
        "points": series,
        "swings": production.biggest_swings(series, data["plays"]),
    }
