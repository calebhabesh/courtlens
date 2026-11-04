"""Pregame inputs for the frozen win-probability model, computed as of a date (R15b).

These are the R15a rules from `evaluation.win_probability_data.build_games`: team form, context
and expected minutes come only from regular-season boxes on strictly earlier dates. Two inputs
differ from training because training could read the finished game:

- Availability. Training read each game's own box (DND and NWT comments), which is published
  after the game. Live uses the newest ESPN roster minus players ESPN's injury report lists as
  Out, read when the slate is captured. Late scratches are not known.
- Ratings. Same rule as training (newest snapshot on or before the date), with 2026-27 snapshots
  fitted on a provisional season bundle (`evaluation.win_probability_ratings`).
"""

from __future__ import annotations

import gzip
import json
from collections import defaultdict, deque
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.evaluation.win_probability_data import (
    BUBBLE_SEASON,
    BUBBLE_START,
    HALF_LIVES,
    MINUTES_APPEARANCES,
    MINUTES_WINDOW_DAYS,
    RAW,
    TEAM_FORM_WINDOW_DAYS,
    PlayerRow,
    _team_context,
    _team_stats,
    box_seconds,
    days,
    inactive,
    snapshot_ratings,
    team_form,
)
from courtlens.ingestion.impact_repair_audit import retained_boxes
from courtlens.ingestion.workbench_normalization import normalize_game_id
from courtlens.services.win_probability_serving import GameInputs

DENVER, UTAH = "1610612743", "1610612762"
CSV_LAST_YEAR = 2026
Availability = Callable[[dict[str, Any], str, list[PlayerRow]], list[str]]
Ratings = Callable[[str], tuple[str, dict[str, float], float] | None]


@dataclass(frozen=True)
class Target:
    game_id: str
    day: str
    home: str
    away: str
    neutral: bool = False


def _schedule(year: int) -> dict[str, str]:
    """Regular-season game dates for one season ending in `year`."""
    if year <= CSV_LAST_YEAR:
        out = {}
        with gzip.open(RAW / f"sportsdataverse_{year}" / f"nba_schedule_{year}.csv.gz", "rt") as f:
            header = f.readline().strip().split(",")
            where = {k: header.index(k) for k in ("game_id", "game_date", "season_type")}
            for line in f:
                cells = line.rstrip("\n").split(",")
                if len(cells) == len(header) and cells[where["season_type"]] == "regular-season":
                    out[normalize_game_id(cells[where["game_id"]])] = cells[where["game_date"]]
        return out
    # The in-season schedule file is hoopR's raw document; regular-season ids start 002.
    body = json.loads((RAW / f"sportsdataverse_{year}" / f"schedule_{year}.json").read_text())
    out = {}
    for day in body.get("leagueSchedule", {}).get("gameDates", []):
        for game in day.get("games", []):
            gid, stamp = str(game.get("gameId", "")), game.get("gameDateEst") or ""
            if gid.startswith("002") and stamp:
                out[gid] = stamp[:10]
    return out


def load_box_history(
    years: Iterable[int],
) -> tuple[list[dict[str, Any]], dict[str, list[PlayerRow]]]:
    """Regular-season team games by date and their player rows, from retained boxes."""
    games: list[dict[str, Any]] = []
    players: dict[str, list[PlayerRow]] = {}
    for year in years:
        player_rows, team_rows, _ = retained_boxes(RAW, year)
        schedule = _schedule(year)
        for gid, rows in team_rows.items():
            if gid not in schedule or len(rows) != 2:
                continue
            by_side = {r["side"]: r for r in rows}
            if set(by_side) != {"home", "away"}:
                continue
            games.append(
                {
                    "gid": gid,
                    "date": schedule[gid],
                    "year": year,
                    "home": by_side["home"]["team_id"],
                    "away": by_side["away"]["team_id"],
                    **{f"{s}_stats": _team_stats(by_side[s]) for s in ("home", "away")},
                }
            )
            players[gid] = [
                (r["person_id"], box_seconds(r["minutes"]), inactive(r["comment"]), r["team_id"])
                for r in player_rows.get(gid, [])
            ]
    games.sort(key=lambda g: (g["date"], g["gid"]))
    return games, players


def box_availability(target: dict[str, Any], team: str, rows: list[PlayerRow]) -> list[str]:
    """The training rule: this game's own box, without DND and NWT. Hindsight for Live."""
    return [r[0] for r in rows if r[3] == team and not r[2]]


def build_entries(
    targets: list[Target],
    box_games: list[dict[str, Any]],
    box_players: dict[str, list[PlayerRow]],
    ratings: Ratings,
    availability: Availability,
    half_life: int,
) -> dict[str, dict[str, Any]]:
    """One input record per target, with results entering only after their whole date is done."""
    if half_life not in HALF_LIVES:
        raise ValueError("half-life outside the registered grid")
    teams = sorted({g["home"] for g in box_games} | {g["away"] for g in box_games})
    if len(teams) != 30:
        raise ValueError(f"expected 30 team ids, found {len(teams)}")
    number = {team: i for i, team in enumerate(teams)}
    by_day: dict[str, list[Target]] = defaultdict(list)
    for target in targets:
        by_day[target.day].append(target)
    played: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for game in box_games:
        played[game["date"]].append(game)

    earlier: deque[tuple[int, int, int, float, float]] = deque()
    team_log: dict[str, list[dict[str, Any]]] = defaultdict(list)
    appearances: dict[str, deque[tuple[int, float]]] = defaultdict(
        lambda: deque(maxlen=MINUTES_APPEARANCES)
    )
    entries: dict[str, dict[str, Any]] = {}
    for day in sorted(set(by_day) | set(played)):
        d = days(day)
        while earlier and d - earlier[0][0] > TEAM_FORM_WINDOW_DAYS:
            earlier.popleft()
        if day in by_day:
            if len(earlier) < 100:
                raise ValueError("not enough earlier games for team form")
            coefficients, home_term = team_form(list(earlier), d, half_life)
            chosen = ratings(day)
            for target in by_day[day]:
                game_rows = box_players.get(target.game_id, [])
                roster: dict[str, list[list[Any]]] = {"home": [], "away": []}
                strength: dict[str, float | None] = {}
                for side, team in (("home", target.home), ("away", target.away)):
                    active = availability(
                        {"game_id": target.game_id, "day": day, "side": side}, team, game_rows
                    )
                    expected = {}
                    for pid in active:
                        recent = [
                            m for when, m in appearances[pid] if d - when <= MINUTES_WINDOW_DAYS
                        ]
                        expected[pid] = float(np.mean(recent)) if recent else 0.0
                    total = sum(expected.values())
                    if total <= 0:
                        expected = {pid: 1.0 for pid in expected}
                        total = float(len(expected)) or 1.0
                    value = 0.0
                    for pid, minutes in expected.items():
                        share = minutes * 240 / total
                        rating = None
                        if chosen is not None:
                            rating = chosen[1].get(pid, chosen[2])
                            value += share / 48 * rating
                        roster[side].append([pid, round(share, 3), rating])
                    strength[side] = value if chosen is not None else None
                form = float(
                    coefficients[number[target.home]]
                    - coefficients[number[target.away]]
                    + (0.0 if target.neutral else home_term)
                )
                entry: dict[str, Any] = {
                    "game_id": target.game_id,
                    "date": day,
                    "home": target.home,
                    "away": target.away,
                    "neutral": target.neutral,
                    "form": form,
                    "strength_home": strength["home"],
                    "strength_away": strength["away"],
                    "snapshot_cutoff": chosen[0] if chosen else None,
                    "roster": roster,
                }
                for side, team in (("home", target.home), ("away", target.away)):
                    entry.update(
                        _team_context(side, team, target.home, d, team_log[team], target.neutral)
                    )
                entries[target.game_id] = entry
        for game in played.get(day, []):
            home_stats, away_stats = game["home_stats"], game["away_stats"]
            margin = home_stats["points"] - away_stats["points"]
            neutral = day >= BUBBLE_START and game["year"] == int(BUBBLE_SEASON[:4]) + 1
            earlier.append(
                (d, number[game["home"]], number[game["away"]], margin, 0.0 if neutral else 1.0)
            )
            for team, opponent, stats in (
                (game["home"], game["away"], home_stats),
                (game["away"], game["home"], away_stats),
            ):
                team_log[team].append(
                    {"day": d, "stats": stats, "host": game["home"], "opponent": opponent}
                )
            for pid, seconds, _, _ in box_players.get(game["gid"], []):
                if seconds > 0:
                    appearances[pid].append((d, seconds / 60))
    return entries


def mu_from_entry(entry: dict[str, Any], coefficients: dict[str, float]) -> float:
    """The pregame layer's expected home margin, with the fitted coefficients."""
    pace = (entry["pace_home"] + entry["pace_away"]) / 2
    strength = (entry["strength_home"] - entry["strength_away"]) * pace / 100
    city = 0.0 if entry["neutral"] else 1.0
    terms = {
        "strength_x_pace": strength,
        "form": entry["form"],
        "home": city,
        "rest": entry["rest_home"] - entry["rest_away"],
        "b2b_home": float(entry["b2b_home"]),
        "b2b_away": float(entry["b2b_away"]),
        "games7": entry["games7_home"] - entry["games7_away"],
        "travel_home_kkm": entry["travel_home"] / 1000,
        "travel_away_kkm": entry["travel_away"] / 1000,
        "denver": city * (entry["home"] == DENVER),
        "utah": city * (entry["home"] == UTAH),
    }
    return float(sum(coefficients[name] * value for name, value in terms.items()))


def inputs_from_entry(entry: dict[str, Any], coefficients: dict[str, float]) -> GameInputs:
    return GameInputs(
        mu=mu_from_entry(entry, coefficients),
        form=float(entry["form"]),
        strength=float(entry["strength_home"] - entry["strength_away"]),
        rest=float(entry["rest_home"] - entry["rest_away"]),
        b2b_home=float(entry["b2b_home"]),
        b2b_away=float(entry["b2b_away"]),
        games7=float(entry["games7_home"] - entry["games7_away"]),
        travel_home=float(entry["travel_home"]) / 1000,
        travel_away=float(entry["travel_away"]) / 1000,
        neutral=float(entry["neutral"]),
        denver=float(not entry["neutral"] and entry["home"] == DENVER),
        utah=float(not entry["neutral"] and entry["home"] == UTAH),
    )


def monthly_ratings(extra: Path | None = None) -> Ratings:
    """The training rule: the newest snapshot with a cutoff on or before the date.

    `extra` holds the current season's snapshots, which R15a's directory does not.
    """
    snapshots = snapshot_ratings()
    if extra is not None:
        snapshots = sorted([*snapshots, *_read_snapshots(extra)], key=lambda item: item[0])

    def pick(day: str) -> tuple[str, dict[str, float], float] | None:
        return next((s for s in reversed(snapshots) if s[0] <= day), None)

    return pick


def _read_snapshot(path: Path) -> tuple[str, dict[str, float], float]:
    from courtlens.ingestion.native_reconstruction import content_hash

    body = json.loads(path.read_bytes())
    if content_hash(body) != path.stem or not body["latest_game_date"] < body["cutoff"]:
        raise ValueError(f"changed or leaking snapshot {path}")
    rapm = {pid: float(p["rapm"]) for pid, p in body["players"].items()}
    low = [float(p["rapm"]) for p in body["players"].values() if not p["qualified"]]
    return str(body["cutoff"]), rapm, float(np.mean(low)) if low else 0.0


def _read_snapshots(directory: Path) -> list[tuple[str, dict[str, float], float]]:
    return [_read_snapshot(path) for path in sorted(directory.glob("*.json"))]


def pinned_ratings(path: Path) -> Ratings:
    """One snapshot for every date. Only the R15b check uses this: it costs too much to serve."""
    chosen = _read_snapshot(path)

    def pick(day: str) -> tuple[str, dict[str, float], float] | None:
        if chosen[0] > day:
            raise ValueError("pinned snapshot is later than the game")
        return chosen

    return pick
