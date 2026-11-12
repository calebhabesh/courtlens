"""The frozen win-probability model in production (R15b).

- `capture_slate`: before tip-off, seal each scheduled game's pregame inputs.
- `score_range`: after games finish, score CourtLens and ESPN on the same events and append to the
  scorecard. A game counts as prospective only if it tipped after the freeze and its inputs were
  sealed before its tip-off.
- `game_probability`: what the Live page draws.

Everything under `serving_root()` is plain files, so the read-only hosted demo gets them by a
scheduled sync and never runs this job.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import threading
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from itertools import pairwise
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.config import get_settings
from courtlens.domain.live import parse_plays, parse_summary, score_running
from courtlens.domain.teams import TRICODE_TO_TEAM
from courtlens.domain.win_probability_live import AWAY_ID, HOME_ID, clock_seconds, replay_rows
from courtlens.domain.win_probability_scorecard import (
    PHASES,
    game_bins,
    losses,
    phase_masks,
    summarize,
)
from courtlens.domain.win_probability_state import (
    COLUMNS,
    Replay,
    parse_clock,
    period_length,
    period_start,
    replay,
    segment_end,
)
from courtlens.services.win_probability_market import HomeModel
from courtlens.services.win_probability_serving import (
    MANIFEST_SCHEMA,
    FrozenModel,
    GameInputs,
    StateColumns,
    manifest_hash,
    sampled_states,
)

MANIFEST_PATH = Path("evaluation/research/frozen/courtlens-win-probability-v2.json")
CARD_PATH = Path("evaluation/research/frozen/courtlens-win-probability-v2-card.json")
MODEL_DIRECTORY = Path("data/artifacts/win-probability")
REGULAR_SEASON_TYPE = 2
CLUTCH_SECONDS = 300.0
CLUTCH_MARGIN = 5
NOT_CREDITED = {"Substitution", "End Period", "End Game", "Full Timeout", "Short Timeout"}
SWINGS = 5
SEASON_START_MONTH = 7

_lock = threading.Lock()
_model: FrozenModel | None = None
_game_cache: dict[str, tuple[tuple[int, str], dict[str, Any]]] = {}
_CACHE_GAMES = 64


def serving_root() -> Path:
    return get_settings().win_probability_serving_dir


def load_manifest() -> dict[str, Any]:
    body: dict[str, Any] = json.loads(MANIFEST_PATH.read_text())
    if body.get("schema") != MANIFEST_SCHEMA or manifest_hash(body) != body["manifest_sha256"]:
        raise ValueError("frozen manifest failed its hash check")
    return body


def get_model() -> FrozenModel:
    """The frozen model, once per process. Every file's hash is checked at load."""
    global _model
    with _lock:
        if _model is None:
            _model = FrozenModel(load_manifest(), get_settings().win_probability_models_dir)
        return _model


def season_of(day: str) -> str:
    when = date.fromisoformat(day)
    start = when.year if when.month >= SEASON_START_MONTH else when.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def _seal(directory: Path, stem: str, body: dict[str, Any]) -> Path:
    raw = json.dumps(body, sort_keys=True, separators=(",", ":")).encode()
    digest = hashlib.sha256(raw).hexdigest()
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{stem}.{digest}.json"
    if not path.exists():
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(raw)
        tmp.rename(path)
    return path


def _replace(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text)
    tmp.rename(path)


# ---------------------------------------------------------------------------------------------
# Pregame capture.


def _team_id(espn_team_id: str) -> str:
    from courtlens.ingestion.espn_rosters import ESPN_TEAMS

    return TRICODE_TO_TEAM[ESPN_TEAMS[espn_team_id][1]].team_id


def scheduled_regular_games(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Regular-season games on a scoreboard that have not started."""
    games = []
    for event in payload.get("events") or []:
        season_type = (event.get("season") or {}).get("type")
        state = (event.get("status") or {}).get("type", {}).get("state")
        if season_type != REGULAR_SEASON_TYPE or state != "pre":
            continue
        competitors = event["competitions"][0]["competitors"]
        sides = {c["homeAway"]: str(c["team"]["id"]) for c in competitors}
        games.append(
            {
                "espn_id": str(event["id"]),
                "event_time": event["date"],
                "home_espn": sides["home"],
                "away_espn": sides["away"],
            }
        )
    return games


def roster_availability(
    roster_players: list[dict[str, Any]], injuries: dict[str, list[dict[str, Any]]]
) -> tuple[dict[str, list[str]], dict[str, dict[str, Any]]]:
    """Available NBA ids per ESPN team: on the roster, not reported Out, with a known NBA id."""
    from courtlens.services.bref_identity import normalize_name

    out: dict[str, set[str]] = {
        team: {normalize_name(p["name"]) for p in rows if p.get("status") == "Out"}
        for team, rows in injuries.items()
    }
    available: dict[str, list[str]] = defaultdict(list)
    detail: dict[str, dict[str, Any]] = defaultdict(lambda: {"out": [], "unmapped": 0})
    tricode_to_espn = {}
    from courtlens.ingestion.espn_rosters import ESPN_TEAMS

    for espn_team, (_, tricode) in ESPN_TEAMS.items():
        tricode_to_espn[tricode] = espn_team
    for player in roster_players:
        team = tricode_to_espn.get(player["tricode"])
        if team is None:
            continue
        if normalize_name(player["name"]) in out.get(team, set()):
            detail[team]["out"].append(player["name"])
        elif player.get("player_id"):
            available[team].append(str(player["player_id"]))
        else:
            detail[team]["unmapped"] += 1
    return dict(available), dict(detail)


def capture_slate(day: date, client: Any, now: datetime | None = None) -> Path | None:
    """Seal the inputs for one date's games that have not started. None when there are none."""
    from courtlens.ingestion.espn_win_probability import keep_raw
    from courtlens.services.espn_rosters import load_latest
    from courtlens.services.win_probability_pregame import (
        Target,
        build_entries,
        inputs_from_entry,
        load_box_history,
        monthly_ratings,
    )

    now = now or datetime.now(UTC)
    manifest = load_manifest()
    raw, payload = client.get("scoreboard", {"dates": day.strftime("%Y%m%d")})
    keep_raw(raw, "scoreboard", f"capture-{day.isoformat()}")
    games = scheduled_regular_games(payload)
    if not games:
        return None
    raw_injuries, injury_payload = client.get("injuries", {})
    keep_raw(raw_injuries, "injuries", now.isoformat(timespec="seconds"))
    from courtlens.domain.live import parse_injury_feed

    injuries = parse_injury_feed(injury_payload)["teams"]
    latest = load_latest()
    if latest is None:
        raise ValueError("no ESPN roster bundle")
    roster_path, roster = latest
    available, detail = roster_availability(roster["entry"]["players"], injuries)
    end_year = day.year + 1 if day.month >= SEASON_START_MONTH else day.year
    box_games, box_players = load_box_history(range(end_year - 2, end_year + 1))
    played = [g for g in box_games if g["date"] < day.isoformat()]

    espn_of_team = {}
    for game in games:
        espn_of_team[_team_id(game["home_espn"])] = game["home_espn"]
        espn_of_team[_team_id(game["away_espn"])] = game["away_espn"]

    def availability_for(_: dict[str, Any], team: str, __: list[Any]) -> list[str]:
        return available.get(espn_of_team[team], [])

    pregame = manifest["pregame"]
    targets = [
        Target(g["espn_id"], day.isoformat(), _team_id(g["home_espn"]), _team_id(g["away_espn"]))
        for g in games
    ]
    entries = build_entries(
        targets,
        played,
        box_players,
        monthly_ratings(get_settings().win_probability_snapshots_dir),
        availability_for,
        int(pregame["form_half_life_days"]),
    )
    records = {}
    for game in games:
        entry = entries[game["espn_id"]]
        inputs = inputs_from_entry(entry, pregame["coefficients"])
        records[game["espn_id"]] = {
            **game,
            "home": entry["home"],
            "away": entry["away"],
            "inputs": vars(inputs),
            "out_home": sorted(detail.get(game["home_espn"], {}).get("out", [])),
            "out_away": sorted(detail.get(game["away_espn"], {}).get("out", [])),
            "players_home": len(entry["roster"]["home"]),
            "players_away": len(entry["roster"]["away"]),
            "availability": "tip_off_capture",
            "rating_snapshot_cutoff": entry["snapshot_cutoff"],
        }
    body = {
        "schema": "courtlens-win-probability-pregame-v1",
        "day": day.isoformat(),
        "captured_at": now.isoformat(timespec="seconds"),
        "manifest_sha256": manifest["manifest_sha256"],
        "roster_bundle": roster_path.stem,
        "roster_observed_at": roster["entry"]["observed_at"],
        "box_through": max((g["date"] for g in played), default=None),
        "injury_report_sha256": hashlib.sha256(raw_injuries).hexdigest(),
        "games": records,
    }
    return _seal(serving_root() / "pregame", day.isoformat(), body)


def backfill_replay_inputs(
    day_games: list[dict[str, Any]], box_games: list[Any], box_players: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    """Pre-freeze games: the training availability rule, which reads the finished box. Hindsight."""
    from courtlens.services.win_probability_pregame import (
        Target,
        box_availability,
        build_entries,
        inputs_from_entry,
        monthly_ratings,
    )

    manifest = load_manifest()
    pregame = manifest["pregame"]
    targets = [Target(g["nba_id"], g["day"], g["home"], g["away"]) for g in day_games]
    entries = build_entries(
        targets,
        box_games,
        box_players,
        monthly_ratings(get_settings().win_probability_snapshots_dir),
        box_availability,
        int(pregame["form_half_life_days"]),
    )
    return {
        g["espn_id"]: {
            **g,
            "inputs": vars(inputs_from_entry(entries[g["nba_id"]], pregame["coefficients"])),
            "availability": "hindsight_box",
            "rating_snapshot_cutoff": entries[g["nba_id"]]["snapshot_cutoff"],
        }
        for g in day_games
    }


def read_captures(day: str) -> list[dict[str, Any]]:
    """Sealed captures for a date, oldest first; a file failing its hash is skipped."""
    captures = []
    for path in sorted((serving_root() / "pregame").glob(f"{day}.*.json")):
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != path.stem.split(".")[-1]:
            continue
        captures.append(json.loads(raw))
    captures.sort(key=lambda c: c["captured_at"])
    return captures


def inputs_for(game_id: str, day: str, event_time: str | None) -> tuple[dict[str, Any], str] | None:
    """The newest record sealed before tip-off, else the pre-freeze replay record."""
    tip = _parse_time(event_time) if event_time else None
    chosen = None
    for capture in read_captures(day):
        if game_id in capture["games"] and (
            tip is None or _parse_time(capture["captured_at"]) < tip
        ):
            chosen = (capture["games"][game_id], capture["captured_at"])
    if chosen is not None:
        return chosen
    for capture in read_captures(f"replay-{day}"):
        if game_id in capture["games"]:
            return capture["games"][game_id], capture["captured_at"]
    return None


def _parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


# ---------------------------------------------------------------------------------------------
# Scoring one game.


def _inputs(record: dict[str, Any]) -> GameInputs:
    return GameInputs(**record["inputs"])


def _replay_from(plays: list[dict[str, Any]]) -> tuple[Replay, list[dict[str, Any]]]:
    rows = replay_rows(plays)
    return replay(rows, HOME_ID, AWAY_ID), rows


def espn_at_states(
    states: StateColumns, plays: list[dict[str, Any]], points: list[dict[str, Any]] | None
) -> tuple[np.ndarray, np.ndarray]:
    """ESPN's latest probability at or before each state, kept when the score matches (R15a)."""
    values = {p["play_id"]: p["home"] for p in points or []}
    rows = []
    for play in plays:
        left = clock_seconds(play.get("clock"))
        if play["id"] in values and left is not None and isinstance(play.get("period"), int):
            when = period_start(play["period"]) + period_length(play["period"]) - left
            rows.append((when, play["home_score"], play["away_score"], values[play["id"]]))
    if not rows:
        return np.full(len(states), np.nan), np.zeros(len(states), dtype=bool)
    rows.sort(key=lambda r: r[0])
    elapsed = np.array([r[0] for r in rows])
    home = np.array([r[1] for r in rows], dtype=float)
    away = np.array([r[2] for r in rows], dtype=float)
    value = np.array([r[3] for r in rows], dtype=float)
    at = np.searchsorted(elapsed, states.time, side="right") - 1
    chosen = np.maximum(at, 0)
    same = (
        (at >= 0)
        & (home[chosen] == states.columns["home_score"])
        & (away[chosen] == states.columns["away_score"])
    )
    return np.where(same, value[chosen], np.nan), same


def score_game(
    model: FrozenModel, summary: dict[str, Any], record: dict[str, Any], frozen_at: str, tip: str
) -> dict[str, Any]:
    """One scorecard row for a final game."""
    game = summary["game"]
    plays = summary["plays"]
    teams = {t["side"]: t for t in game["teams"]}
    home_score, away_score = int(teams["home"]["score"]), int(teams["away"]["score"])
    win = 1.0 if home_score > away_score else 0.0
    built, _ = _replay_from(plays)
    states = sampled_states(built)
    p = model.predict_home(states, _inputs(record))
    log_loss, brier = losses(p, win)
    masks = phase_masks(states.time)
    phases = {}
    for name in PHASES:
        if masks[name].any():
            phase_loss, phase_brier = losses(p[masks[name]], win)
            phases[name] = {"log_loss": phase_loss, "brier": phase_brier}
    espn, matched = espn_at_states(states, plays, summary.get("win_probability"))
    comparison = None
    if matched.any():
        ours_loss, ours_brier = losses(p[matched], win)
        their_loss, their_brier = losses(espn[matched], win)
        comparison = {
            "log_loss": their_loss,
            "brier": their_brier,
            "courtlens_log_loss": ours_loss,
            "courtlens_brier": ours_brier,
            "matched_share": float(matched.mean()),
            "bins": game_bins(espn[matched], win),
            "bins_courtlens": game_bins(p[matched], win),
        }
    captured_before_tip = record.get("availability") == "tip_off_capture"
    return {
        "game_id": game["source_id"],
        "date": game["slate_date"],
        "tip_off": tip,
        "home": teams["home"].get("abbreviation"),
        "away": teams["away"].get("abbreviation"),
        "home_score": home_score,
        "away_score": away_score,
        "prospective": bool(captured_before_tip and _parse_time(tip) > _parse_time(frozen_at)),
        "availability": record.get("availability"),
        "states": len(states),
        "courtlens": {"log_loss": log_loss, "brier": brier, "phases": phases},
        "bins_courtlens": game_bins(p, win),
        "espn": comparison,
        "manifest_sha256": record.get("manifest_sha256"),
    }


def event_series(
    model: HomeModel, plays: list[dict[str, Any]], record: dict[str, Any]
) -> list[dict[str, Any]]:
    """Home win probability after each play, in game order.

    Plays at zero seconds of the fourth period or later are left out, as in training: the result,
    or the next overtime's tip, follows them.
    """
    built, rows = _replay_from(plays)
    # The replay's own order: period, then clock running down, then source order.
    timed = sorted(
        (int(row["period"]), -float(parse_clock(row["clock"]) or 0.0), index)
        for index, row in enumerate(rows)
    )
    order = [item[2] for item in timed]
    play_order = _row_plays(plays, rows)
    period = built.column("period").astype(np.int64)
    elapsed = built.column("elapsed")
    ends = np.array([segment_end(int(p)) for p in period])
    keep = ~((period >= 4) & (elapsed >= ends))
    state = built.state[keep].astype(np.float32).astype(np.float64)
    times = elapsed[keep].astype(np.float32).astype(np.float64)
    states = StateColumns(
        times, period[keep], {name: state[:, i] for i, name in enumerate(COLUMNS)}
    )
    p = model.predict_home(states, _inputs(record))
    out = []
    kept_rows = [order[i] for i in np.flatnonzero(keep)]
    for value, t, row_index, home, away, per in zip(
        p,
        times,
        kept_rows,
        states.columns["home_score"],
        states.columns["away_score"],
        period[keep],
        strict=True,
    ):
        out.append(
            {
                "play_id": play_order[row_index],
                "t": round(float(t), 2),
                "home": round(float(value), 4),
                "home_score": int(home),
                "away_score": int(away),
                "period": int(per),
            }
        )
    return out


def _row_plays(plays: list[dict[str, Any]], rows: list[dict[str, Any]]) -> list[str | None]:
    """The play behind each output row of `replay_rows`; added period starts have none."""
    valid = iter(
        p
        for p in plays
        if clock_seconds(p.get("clock")) is not None
        and isinstance(p.get("period"), int)
        and p["period"] >= 1
    )
    return [
        None if r["actionType"] == "period" and r["subType"] == "start" else next(valid)["id"]
        for r in rows
    ]


def biggest_swings(
    series: list[dict[str, Any]], plays: list[dict[str, Any]], count: int = SWINGS
) -> list[dict[str, Any]]:
    """The largest changes in home win probability between consecutive plays."""
    by_id = {p["id"]: p for p in plays}
    moves = []
    for before, after in pairwise(series):
        delta = after["home"] - before["home"]
        play = by_id.get(after["play_id"] or "")
        if play is None:
            continue
        moves.append(
            {
                "play_id": play["id"],
                "t": after["t"],
                "home_after": after["home"],
                "delta_home": round(delta, 4),
                "period": play.get("period"),
                "clock": play.get("clock"),
                "text": play.get("text"),
                "side": play.get("side"),
                "home_score": after["home_score"],
                "away_score": after["away_score"],
            }
        )
    moves.sort(key=lambda m: -abs(m["delta_home"]))
    return sorted(moves[:count], key=lambda m: m["t"])


def player_credit(
    series: list[dict[str, Any]], plays: list[dict[str, Any]]
) -> dict[str, dict[str, float]]:
    """Win probability added per ESPN player id: each play's swing goes to its first participant.

    This is credit assignment, not causal value: the swing also holds time passing since the
    previous play, and a shot's value belongs partly to whoever created it.
    """
    by_id = {p["id"]: p for p in plays}
    credit: dict[str, dict[str, float]] = defaultdict(
        lambda: {"wpa": 0.0, "events": 0.0, "clutch_wpa": 0.0, "clutch_events": 0.0}
    )
    for before, after in pairwise(series):
        play = by_id.get(after["play_id"] or "")
        if (
            play is None
            or not play.get("player_source_id")
            or play.get("side") not in ("home", "away")
            or play.get("type") in NOT_CREDITED
        ):
            continue
        delta = after["home"] - before["home"]
        swing = delta if play["side"] == "home" else -delta
        row = credit[play["player_source_id"]]
        row["wpa"] += swing
        row["events"] += 1
        period = int(after["period"])
        left = segment_end(period) - after["t"]
        margin = abs(before["home_score"] - before["away_score"])
        if period >= 4 and left <= CLUTCH_SECONDS and margin <= CLUTCH_MARGIN:
            row["clutch_wpa"] += swing
            row["clutch_events"] += 1
    return dict(credit)


def game_probability(game_id: str, data: dict[str, Any] | None) -> dict[str, Any]:
    """The Live chart for one game read: CourtLens's line, swings, and the model's identity."""
    manifest = load_manifest()
    identity = {
        "version": manifest["version"],
        "manifest_sha256": manifest["manifest_sha256"],
        "frozen_at": manifest["frozen_at"],
    }
    if not data or not data.get("plays"):
        return {"status": "no_plays", "model": identity}
    game = data["game"]
    found = inputs_for(game_id, game["slate_date"], game.get("event_time"))
    if found is None:
        return {
            "status": "no_inputs",
            "model": identity,
            "reason": "No pregame inputs were sealed before this game tipped off.",
        }
    record, captured_at = found
    plays = data["plays"]
    key = (len(plays), str(plays[-1].get("id")))
    with _lock:
        cached = _game_cache.get(game_id)
    if cached and cached[0] == key:
        return cached[1]
    model = get_model()
    series = event_series(model, plays, record)
    result = {
        "status": "ok",
        "model": identity,
        "availability": record.get("availability"),
        "captured_at": captured_at,
        "points": series,
        "swings": biggest_swings(series, plays),
        "out": {"home": record.get("out_home", []), "away": record.get("out_away", [])},
    }
    with _lock:
        if len(_game_cache) >= _CACHE_GAMES:
            _game_cache.pop(next(iter(_game_cache)))
        _game_cache[game_id] = (key, result)
    return result


# ---------------------------------------------------------------------------------------------
# The nightly job.


def scorecard_rows() -> list[dict[str, Any]]:
    path = serving_root() / "scorecard" / "games.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def write_summary() -> dict[str, Any]:
    manifest = load_manifest()
    from courtlens.ingestion.espn_rosters import ESPN_TEAMS

    summary = summarize(scorecard_rows(), manifest["drift"]["by_window_games"])
    tricode = dict(ESPN_TEAMS.values())
    for game in summary["recent_games"]:
        game["home"] = tricode.get(game["home"], game["home"])
        game["away"] = tricode.get(game["away"], game["away"])
    body = {
        "schema": "courtlens-win-probability-scorecard-v1",
        "updated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "model": {
            "version": manifest["version"],
            "manifest_sha256": manifest["manifest_sha256"],
            "frozen_at": manifest["frozen_at"],
        },
        "availability_check": read_availability_checks(),
        **summary,
    }
    _replace(
        serving_root() / "scorecard" / "summary.json",
        json.dumps(body, sort_keys=True, separators=(",", ":")),
    )
    return body


def read_summary() -> dict[str, Any] | None:
    path = serving_root() / "scorecard" / "summary.json"
    if not path.exists():
        return None
    body: dict[str, Any] = json.loads(path.read_text())
    return body


def _credit_rows(
    game_id: str,
    day: str,
    credit: dict[str, dict[str, float]],
    players: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    names = {str(p["source_id"]): (p.get("name"), p.get("team_source_id")) for p in players or []}
    rows = []
    for player, values in credit.items():
        name, team = names.get(player, (None, None))
        rows.append(
            {
                "game_id": game_id,
                "date": day,
                "player": player,
                "name": name,
                "team_espn": team,
                **{k: round(v, 5) for k, v in values.items()},
            }
        )
    return rows


def append_credit(season: str, rows: list[dict[str, Any]]) -> None:
    path = serving_root() / "wpa" / f"{season}.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as log:
        for row in rows:
            log.write(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n")


def _person_ids(season: str) -> dict[tuple[str, str], str]:
    """(NBA team id, normalized name) to NBA person id, from that season's retained boxes."""
    from courtlens.evaluation.win_probability_data import RAW
    from courtlens.ingestion.impact_repair_audit import retained_boxes
    from courtlens.services.bref_identity import normalize_name

    players, _, _ = retained_boxes(RAW, int(season[:4]) + 1)
    out = {}
    for rows in players.values():
        for row in rows:
            name = normalize_name(f"{row['first_name']} {row['family_name']}")
            out[(row["team_id"], name)] = row["person_id"]
    return out


def write_wpa_summary(season: str, limit: int = 200) -> dict[str, Any] | None:
    """Season leaders from the per-game credit rows, with NBA ids for photos and links."""
    from courtlens.ingestion.espn_rosters import ESPN_TEAMS
    from courtlens.services.bref_identity import normalize_name

    path = serving_root() / "wpa" / f"{season}.jsonl"
    if not path.exists():
        return None
    totals: dict[str, dict[str, Any]] = {}
    games: set[str] = set()
    for line in path.read_text().splitlines():
        row = json.loads(line)
        games.add(row["game_id"])
        total = totals.setdefault(
            row["player"],
            {
                "player": row["player"],
                "name": row["name"],
                "team_espn": row["team_espn"],
                "games": 0,
                "wpa": 0.0,
                "events": 0.0,
                "clutch_wpa": 0.0,
                "clutch_events": 0.0,
            },
        )
        total["name"] = row["name"] or total["name"]
        total["team_espn"] = row["team_espn"] or total["team_espn"]
        total["games"] += 1
        for key in ("wpa", "events", "clutch_wpa", "clutch_events"):
            total[key] += row[key]
    ids = _person_ids(season)
    rows = [r for r in totals.values() if r["name"]]
    for row in rows:
        row["wpa"] = round(row["wpa"], 3)
        row["clutch_wpa"] = round(row["clutch_wpa"], 3)
        tricode = ESPN_TEAMS.get(str(row["team_espn"]), (None, None))[1]
        row["team"] = tricode
        team = TRICODE_TO_TEAM[tricode].team_id if tricode in TRICODE_TO_TEAM else None
        row["player_id"] = ids.get((team or "", normalize_name(row["name"])))
    rows.sort(key=lambda r: -r["wpa"])
    body = {
        "season": season,
        "games": len(games),
        "players": len(rows),
        "players_with_nba_id": sum(r["player_id"] is not None for r in rows),
        "leaders": rows[:limit],
        "clutch_leaders": sorted(rows, key=lambda r: -r["clutch_wpa"])[:limit],
    }
    _replace(
        serving_root() / "wpa" / f"{season}.summary.json",
        json.dumps(body, sort_keys=True, separators=(",", ":")),
    )
    return body


def wpa_seasons() -> list[str]:
    return sorted(
        (
            p.name.removesuffix(".summary.json")
            for p in (serving_root() / "wpa").glob("*.summary.json")
        ),
        reverse=True,
    )


def wpa_table(season: str) -> dict[str, Any] | None:
    path = serving_root() / "wpa" / f"{season}.summary.json"
    if not path.exists():
        return None
    body: dict[str, Any] = json.loads(path.read_text())
    return body


def score_date(
    day: date, client: Any, model: FrozenModel, manifest: dict[str, Any], done: set[str]
) -> dict[str, int]:
    """Score one date's finished regular-season games not yet on the scorecard."""
    from courtlens.ingestion.espn_win_probability import keep_raw

    counts = {"scored": 0, "no_inputs": 0, "not_final": 0}
    raw, payload = client.get("scoreboard", {"dates": day.strftime("%Y%m%d")})
    keep_raw(raw, "scoreboard", f"score-{day.isoformat()}")
    path = serving_root() / "scorecard" / "games.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    for event in payload.get("events") or []:
        game_id = str(event["id"])
        if game_id in done or (event.get("season") or {}).get("type") != REGULAR_SEASON_TYPE:
            continue
        if (event.get("status") or {}).get("type", {}).get("completed") is not True:
            counts["not_final"] += 1
            continue
        found = inputs_for(game_id, day.isoformat(), event.get("date"))
        if found is None:
            counts["no_inputs"] += 1
            continue
        record, _ = found
        raw_summary, body = client.get("summary", {"event": game_id})
        keep_raw(raw_summary, "summary", game_id)
        summary = parse_summary(body, day, game_id)
        if not summary.get("plays"):
            counts["no_inputs"] += 1
            continue
        row = score_game(
            model,
            summary,
            {**record, "manifest_sha256": manifest["manifest_sha256"]},
            manifest["frozen_at"],
            event["date"],
        )
        with path.open("a") as log:
            log.write(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n")
        series = event_series(model, summary["plays"], record)
        credit = player_credit(series, summary["plays"])
        append_credit(
            season_of(day.isoformat()),
            _credit_rows(game_id, day.isoformat(), credit, summary.get("players")),
        )
        done.add(game_id)
        counts["scored"] += 1
    return counts


def write_availability_checks() -> dict[str, Any]:
    """For prospective games with a published box: tip-off mu0 against the hindsight box rule.

    This is the measured size of what Live could not know at tip-off, kept outside the scored rows.
    """
    from courtlens.services.win_probability_pregame import (
        Target,
        box_availability,
        build_entries,
        inputs_from_entry,
        load_box_history,
        monthly_ratings,
    )

    path = serving_root() / "scorecard" / "availability.jsonl"
    done = (
        {json.loads(line)["game_id"] for line in path.read_text().splitlines()}
        if path.exists()
        else set()
    )
    pending = [r for r in scorecard_rows() if r["prospective"] and r["game_id"] not in done]
    if pending:
        manifest = load_manifest()
        pregame = manifest["pregame"]
        end_year = int(season_of(pending[0]["date"])[:4]) + 1
        box_games, box_players = load_box_history(range(end_year - 2, end_year + 1))
        keys = {(g["date"], g["home"], g["away"]): g["gid"] for g in box_games}
        targets = {}
        tip_off = {}
        for row in pending:
            found = inputs_for(row["game_id"], row["date"], row.get("tip_off"))
            if found is None:
                continue
            record = found[0]
            gid = keys.get((row["date"], record["home"], record["away"]))
            if gid is None:
                continue
            targets[gid] = Target(gid, row["date"], record["home"], record["away"])
            tip_off[gid] = (row, record)
        if targets:
            ratings = monthly_ratings(get_settings().win_probability_snapshots_dir)
            entries = build_entries(
                list(targets.values()),
                box_games,
                box_players,
                ratings,
                box_availability,
                int(pregame["form_half_life_days"]),
            )
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a") as log:
                for gid, entry in entries.items():
                    row, record = tip_off[gid]
                    hindsight = inputs_from_entry(entry, pregame["coefficients"]).mu
                    log.write(
                        json.dumps(
                            {
                                "game_id": row["game_id"],
                                "date": row["date"],
                                "mu_tip_off": record["inputs"]["mu"],
                                "mu_hindsight": hindsight,
                            }
                        )
                        + "\n"
                    )
    return read_availability_checks()


def read_availability_checks() -> dict[str, Any]:
    path = serving_root() / "scorecard" / "availability.jsonl"
    rows = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
    gaps = [abs(r["mu_tip_off"] - r["mu_hindsight"]) for r in rows]
    return {
        "games": len(rows),
        "mean_abs_mu_gap": float(np.mean(gaps)) if gaps else None,
        "p95_abs_mu_gap": float(np.quantile(gaps, 0.95)) if gaps else None,
    }


def nightly(client: Any, today: date | None = None, lookback_days: int = 7) -> dict[str, Any]:
    """Score recent finished games, seal today's pregame inputs, rebuild the scorecard."""
    from zoneinfo import ZoneInfo

    today = today or datetime.now(ZoneInfo("America/New_York")).date()
    from courtlens.evaluation.win_probability_ratings import ensure_snapshots

    manifest = load_manifest()
    model = get_model()
    done = {row["game_id"] for row in scorecard_rows()}
    snapshots = ensure_snapshots(today, get_settings().win_probability_snapshots_dir)
    totals: dict[str, int] = defaultdict(int)
    for offset in range(lookback_days, 0, -1):
        for key, value in score_date(
            today - timedelta(days=offset), client, model, manifest, done
        ).items():
            totals[key] += value
    captured = capture_slate(today, client)
    write_availability_checks()
    summary = write_summary()
    write_wpa_summary(season_of(today.isoformat()))
    return {
        "date": today.isoformat(),
        **totals,
        "capture": str(captured) if captured else None,
        "snapshots": snapshots,
        "games_on_scorecard": summary["games_scored"],
        "prospective_games": summary["prospective"]["games"],
        "drift": summary["drift"]["latest"]["status"],
    }


def raw_plays(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Plays from a stored ESPN summary with the running score applied (backfill and tests)."""
    competitors = payload["header"]["competitions"][0]["competitors"]
    sides = {str(c["team"]["id"]): c["homeAway"] for c in competitors}
    plays = parse_plays(payload.get("plays"), sides) or []
    if plays:
        score_running(plays, {c["homeAway"]: int(c["score"]) for c in competitors})
    return plays


def read_raw_summary(digest: str) -> dict[str, Any]:
    with gzip.open(Path("data/raw/espn-wp/summary") / f"{digest}.json.gz") as stream:
        payload: dict[str, Any] = json.loads(stream.read())
    return payload
