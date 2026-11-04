"""R15a inputs under `courtlens-win-probability-v2`: the per-game table and per-season states.

`games`: every admitted regular-season game with inputs known before tip-off, each computed
only from strictly earlier dates (boxes from 2013-14 onward, dated rating snapshots).

`states <season>`: the registered state sample for one season as float32 columns in a
content-hashed `.npz`: replayed game state, lineups from the IM03 stints, rotation strength,
runs and shooting luck. Every column is computed from events at or before the state's time,
except the two targets (`target_home`, `win_home`). A game whose replayed final score differs
from the schedule is excluded and counted.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import tempfile
import time
from collections import Counter, defaultdict, deque
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.domain.teams import resolve_team_tricode
from courtlens.domain.win_probability_state import (
    COLUMNS,
    Replay,
    parse_clock,
    period_at,
    period_length,
    period_start,
    replay,
    segment_end_margins,
    state_rows,
)
from courtlens.evaluation.impact_history_fits import bundle_paths
from courtlens.evaluation.impact_rating_inputs import checked
from courtlens.ingestion.impact_archive import archive_rows
from courtlens.ingestion.impact_history import HistoryGames, history_rows
from courtlens.ingestion.impact_repair_audit import ArchiveGames, retained_boxes
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_normalization import normalize_game_id

REGISTRATION = "courtlens-win-probability-v2"
OUTPUT = Path("data/derived/win-probability-v1")
RAW = Path("data/raw")
HISTORY_OBSERVATION = Path(
    "data/raw/impact-archive/history-observations/31544bdf-7fbe-4122-9fd6-c84f88eca49b.json"
)
SEALED_OBSERVATION = Path(
    "data/raw/impact-archive/observations/068decb9-4599-4385-91dc-a541f1302ff3.json"
)
SNAPSHOTS = Path("data/derived/impact-history-v2/snapshots")
FIRST_BOX_YEAR, LAST_BOX_YEAR = 2014, 2026
BUBBLE_START = "2020-07-30"
BUBBLE_SEASON = "2019-20"
TEAM_FORM_WINDOW_DAYS = 400
TEAM_FORM_LAMBDA = 20.0
EWMA_HALF_LIFE_DAYS = 60.0
MINUTES_APPEARANCES = 10
MINUTES_WINDOW_DAYS = 365
HALF_LIVES = (30, 60, 120)
LONG_ABSENCE_SECONDS = 720.0
# Home-city coordinates (latitude, longitude) for travel distance.
CITIES = {
    "ATL": (33.76, -84.40),
    "BOS": (42.37, -71.06),
    "BKN": (40.68, -73.97),
    "CHA": (35.23, -80.84),
    "CHI": (41.88, -87.67),
    "CLE": (41.50, -81.69),
    "DAL": (32.79, -96.81),
    "DEN": (39.75, -105.01),
    "DET": (42.34, -83.06),
    "GSW": (37.77, -122.39),
    "HOU": (29.75, -95.36),
    "IND": (39.76, -86.16),
    "LAC": (34.04, -118.27),
    "LAL": (34.04, -118.27),
    "MEM": (35.14, -90.05),
    "MIA": (25.78, -80.19),
    "MIL": (43.04, -87.92),
    "MIN": (44.98, -93.28),
    "NOP": (29.95, -90.08),
    "NYK": (40.75, -73.99),
    "OKC": (35.46, -97.52),
    "ORL": (28.54, -81.38),
    "PHI": (39.90, -75.17),
    "PHX": (33.45, -112.07),
    "POR": (45.53, -122.67),
    "SAC": (38.58, -121.50),
    "SAS": (29.43, -98.44),
    "TOR": (43.64, -79.38),
    "UTA": (40.77, -111.90),
    "WAS": (38.90, -77.02),
}
PlayerRow = tuple[str, float, bool, str]
STATE_COLUMNS = (
    "game_index",
    "time",
    "period",
    "target_home",
    "win_home",
    *COLUMNS[2:],
    "run_120",
    "run_300",
    "three_luck_home",
    "three_luck_away",
    "ft_luck_home",
    "ft_luck_away",
    "rotation_home",
    "rotation_away",
    "lost_home",
    "lost_away",
    "foul_load_home",
    "foul_load_away",
    "foul_trouble_home",
    "foul_trouble_away",
    "current_home",
    "current_away",
)


def days(day: str) -> int:
    return date.fromisoformat(day).toordinal()


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = (
        math.sin((la2 - la1) / 2) ** 2
        + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    )
    return 2 * 6371 * math.asin(math.sqrt(h))


def box_seconds(value: str) -> float:
    if not value or ":" not in value:
        return 0.0
    minutes, seconds = value.split(":")
    return 60 * float(minutes) + float(seconds)


def inactive(comment: str) -> bool:
    """DND and NWT are on the inactive list before tip-off; DNP is a coach's decision."""
    return comment.strip().upper().startswith(("DND", "NWT"))


def load_boxes() -> tuple[list[dict[str, Any]], dict[str, list[PlayerRow]], dict[str, Any]]:
    """Regular-season team games by date and per-game player rows, from retained boxes."""
    games: list[dict[str, Any]] = []
    players: dict[str, list[PlayerRow]] = {}
    receipts = {}
    for year in range(FIRST_BOX_YEAR, LAST_BOX_YEAR + 1):
        player_rows, team_rows, hashes = retained_boxes(RAW, year)
        receipts[str(year)] = {"player_box": hashes["player_box"], "team_box": hashes["team_box"]}
        schedule = {}
        with gzip.open(RAW / f"sportsdataverse_{year}" / f"nba_schedule_{year}.csv.gz", "rt") as f:
            header = f.readline().strip().split(",")
            where = {k: header.index(k) for k in ("game_id", "game_date", "season_type")}
            for line in f:
                cells = line.rstrip("\n").split(",")
                if len(cells) == len(header) and cells[where["season_type"]] == "regular-season":
                    schedule[normalize_game_id(cells[where["game_id"]])] = cells[where["game_date"]]
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
                    **{f"{side}_stats": _team_stats(by_side[side]) for side in ("home", "away")},
                }
            )
            players[gid] = [
                (r["person_id"], box_seconds(r["minutes"]), inactive(r["comment"]), r["team_id"])
                for r in player_rows.get(gid, [])
            ]
    games.sort(key=lambda g: (g["date"], g["gid"]))
    return games, players, receipts


def _team_stats(row: dict[str, str]) -> dict[str, float]:
    def number(key: str) -> float:
        return float(row[key] or 0)

    return {
        "points": number("points"),
        "fga": number("field_goals_attempted"),
        "fta": number("free_throws_attempted"),
        "ftm": number("free_throws_made"),
        "oreb": number("rebounds_offensive"),
        "tov": number("turnovers"),
        "three_att": number("three_pointers_attempted"),
        "three_made": number("three_pointers_made"),
    }


def team_form(
    earlier: list[tuple[int, int, int, float, float]], day: int, half_life: float
) -> tuple[np.ndarray, float]:
    """Ridge team ratings and home term from earlier games (day, home, away, margin, is_home)."""
    size = 31
    xtx = np.zeros((size, size))
    xty = np.zeros(size)
    for played, home, away, margin, is_home in earlier:
        weight = 0.5 ** ((day - played) / half_life)
        row = np.zeros(size)
        row[home] += 1
        row[away] -= 1
        row[30] = is_home
        xtx += weight * np.outer(row, row)
        xty += weight * margin * row
    solved = np.linalg.solve(xtx + TEAM_FORM_LAMBDA * np.eye(size), xty)
    return solved[:30], float(solved[30])


def snapshot_ratings() -> list[tuple[str, dict[str, float], float]]:
    out = []
    for path in sorted(SNAPSHOTS.glob("*.json")):
        body = json.loads(path.read_bytes())
        if content_hash(body) != path.stem or not body["latest_game_date"] < body["cutoff"]:
            raise ValueError(f"changed or leaking snapshot {path}")
        rapm = {pid: float(p["rapm"]) for pid, p in body["players"].items()}
        low = [float(p["rapm"]) for p in body["players"].values() if not p["qualified"]]
        out.append((body["cutoff"], rapm, float(np.mean(low)) if low else 0.0))
    return sorted(out, key=lambda item: item[0])


def admitted() -> dict[str, tuple[str, dict[str, Any]]]:
    members: dict[str, tuple[str, dict[str, Any]]] = {}
    for season, (path, _) in bundle_paths().items():
        bundle = checked(path, path.name.removesuffix(".json.gz"))
        for gid, member in bundle["members"].items():
            members[gid] = (season, member["schedule"])
    return members


def build_games(output: Path = OUTPUT) -> dict[str, Any]:
    started = time.monotonic()
    box_games, box_players, receipts = load_boxes()
    members = admitted()
    snapshots = snapshot_ratings()
    teams = sorted({g["home"] for g in box_games} | {g["away"] for g in box_games})
    if len(teams) != 30:
        raise ValueError(f"expected 30 team ids, found {len(teams)}")
    number = {team: i for i, team in enumerate(teams)}

    earlier: deque[tuple[int, int, int, float, float]] = deque()
    team_log: dict[str, list[dict[str, Any]]] = defaultdict(list)
    appearances: dict[str, deque[tuple[int, float]]] = defaultdict(
        lambda: deque(maxlen=MINUTES_APPEARANCES)
    )
    table: dict[str, dict[str, Any]] = {}
    pending: list[dict[str, Any]] = []
    missing_box: Counter[str] = Counter()

    def finish_day(day_games: list[dict[str, Any]]) -> None:
        # Results enter the logs only after the whole date is done: no same-day information.
        for g in day_games:
            d = days(g["date"])
            home_stats, away_stats = g["home_stats"], g["away_stats"]
            margin = home_stats["points"] - away_stats["points"]
            neutral = g["date"] >= BUBBLE_START and g["year"] == 2020
            earlier.append(
                (d, number[g["home"]], number[g["away"]], margin, 0.0 if neutral else 1.0)
            )
            for team, opponent, stats, host in (
                (g["home"], g["away"], home_stats, g["home"]),
                (g["away"], g["home"], away_stats, g["home"]),
            ):
                team_log[team].append(
                    {"day": d, "stats": stats, "host": host, "opponent": opponent}
                )
            for pid, seconds, _, _ in box_players.get(g["gid"], []):
                if seconds > 0:
                    appearances[pid].append((d, seconds / 60))

    form_day = -1
    form: dict[int, tuple[np.ndarray, float]] = {}
    for g in [*box_games, {"date": "9999-12-31"}]:
        if pending and g["date"] != pending[0]["date"]:
            finish_day(pending)
            pending = []
        if "gid" not in g:
            break
        pending.append(g)
        d = days(g["date"])
        while earlier and d - earlier[0][0] > TEAM_FORM_WINDOW_DAYS:
            earlier.popleft()
        if g["gid"] not in members:
            continue
        season, schedule = members[g["gid"]]
        if len(earlier) < 100:
            raise ValueError("not enough earlier games for team form")
        if d != form_day:
            form_day = d
            form = {h: team_form(list(earlier), d, h) for h in HALF_LIVES}
        home, away = g["home"], g["away"]
        if (schedule["home_team_id"], schedule["away_team_id"]) != (home, away):
            raise ValueError(f"box and schedule sides differ for {g['gid']}")
        neutral = season == BUBBLE_SEASON and g["date"] >= BUBBLE_START
        cutoff = next((s for s in reversed(snapshots) if s[0] <= g["date"]), None)
        rows = box_players.get(g["gid"], [])
        if not rows:
            missing_box["no_player_rows"] += 1
        roster: dict[str, list[list[Any]]] = {"home": [], "away": []}
        strength: dict[str, float | None] = {}
        for side, team in (("home", home), ("away", away)):
            active = [r for r in rows if r[3] == team and not r[2]]
            expected = {}
            for pid, *_ in active:
                recent = [m for played, m in appearances[pid] if d - played <= MINUTES_WINDOW_DAYS]
                expected[pid] = float(np.mean(recent)) if recent else 0.0
            total = sum(expected.values())
            if total <= 0:
                expected = {pid: 1.0 for pid in expected}
                total = float(len(expected)) or 1.0
            value = 0.0
            for pid, minutes in expected.items():
                share = minutes * 240 / total
                rating = None
                if cutoff is not None:
                    rating = cutoff[1].get(pid, cutoff[2])
                    value += share / 48 * rating
                roster[side].append([pid, round(share, 3), rating])
            strength[side] = value if cutoff is not None else None
        entry: dict[str, Any] = {
            "season": season,
            "date": g["date"],
            "home": home,
            "away": away,
            "home_pts": int(schedule["home_pts"]),
            "away_pts": int(schedule["away_pts"]),
            "neutral": neutral,
            "form": {
                str(h): float(
                    form[h][0][number[home]]
                    - form[h][0][number[away]]
                    + (0.0 if neutral else form[h][1])
                )
                for h in HALF_LIVES
            },
            "strength_home": strength["home"],
            "strength_away": strength["away"],
            "snapshot_cutoff": cutoff[0] if cutoff else None,
            "roster": roster,
        }
        for side, team in (("home", home), ("away", away)):
            entry.update(_team_context(side, team, home, d, team_log[team], neutral))
        table[g["gid"]] = entry
    if set(table) != set(members):
        raise ValueError(f"{len(set(members) - set(table))} admitted games have no team box")
    body: dict[str, Any] = {
        "version": REGISTRATION,
        "registration": registration_receipt(REGISTRATION),
        "boxes": receipts,
        "games": dict(sorted(table.items())),
        "coverage": {
            "games": len(table),
            "by_season": dict(sorted(Counter(g["season"] for g in table.values()).items())),
            "no_snapshot": sum(g["snapshot_cutoff"] is None for g in table.values()),
            **missing_box,
        },
    }
    digest = _write_gz(output / "games", body)
    print(
        json.dumps(
            {"games": digest, **body["coverage"], "elapsed": round(time.monotonic() - started)}
        )
    )
    return body


def _team_context(
    side: str, team: str, host: str, day: int, log: list[dict[str, Any]], neutral: bool
) -> dict[str, Any]:
    recent = [g for g in log if day - g["day"] <= TEAM_FORM_WINDOW_DAYS]
    weights = np.array([0.5 ** ((day - g["day"]) / EWMA_HALF_LIFE_DAYS) for g in recent])

    def rate(numerator: Any, denominator: Any) -> float | None:
        if not recent:
            return None
        top = sum(w * numerator(g["stats"]) for w, g in zip(weights, recent, strict=True))
        bottom = sum(w * denominator(g["stats"]) for w, g in zip(weights, recent, strict=True))
        return float(top / bottom) if bottom > 0 else None

    last = log[-1] if log else None
    rest = min(day - last["day"], 7) if last else 7
    here = resolve_team_tricode(host)
    previous = resolve_team_tricode(last["host"]) if last else resolve_team_tricode(team)
    travelled = (
        0.0 if neutral or not last or day - last["day"] > 30 else km(CITIES[previous], CITIES[here])
    )
    return {
        f"pace_{side}": rate(
            lambda s: s["fga"] + 0.44 * s["fta"] - s["oreb"] + s["tov"], lambda _: 1.0
        ),
        f"three_rate_{side}": rate(lambda s: s["three_att"], lambda s: s["fga"]),
        f"three_pct_{side}": rate(lambda s: s["three_made"], lambda s: s["three_att"]),
        f"ft_pct_{side}": rate(lambda s: s["ftm"], lambda s: s["fta"]),
        f"rest_{side}": rest,
        f"b2b_{side}": rest == 1,
        f"games7_{side}": sum(day - g["day"] <= 7 for g in log),
        f"travel_{side}": travelled,
    }


def _write_gz(directory: Path, body: dict[str, Any]) -> str:
    digest = content_hash(body)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{digest}.json.gz"
    if not path.exists():
        tmp = path.with_suffix(".tmp")
        with gzip.GzipFile(tmp, "wb", mtime=0) as stream:
            stream.write(json.dumps(body, sort_keys=True, separators=(",", ":")).encode())
        tmp.rename(path)
    return digest


def read_games(output: Path = OUTPUT) -> dict[str, Any]:
    paths = sorted((output / "games").glob("*.json.gz"))
    if len(paths) != 1:
        raise ValueError(f"expected one games table, found {len(paths)}")
    with gzip.open(paths[0], "rt") as stream:
        body: dict[str, Any] = json.load(stream)
    if content_hash(body) != paths[0].name.removesuffix(".json.gz"):
        raise ValueError("changed games table")
    return body


# ---------------------------------------------------------------------------------------------
# States.


def rotation_features(
    times: np.ndarray,
    stints: list[dict[str, Any]],
    side: str,
    roster: list[list[Any]],
    game: Replay,
    fill: float,
) -> dict[str, np.ndarray]:
    """Rotation strength, exits, foul load and trouble, and current lineup for one team."""
    size = len(times)
    names = ("rotation", "lost", "foul_load", "foul_trouble", "current")
    if any(r[2] is None for r in roster) or not roster:
        return {n: np.full(size, np.nan, dtype=np.float64) for n in names}
    players = {r[0]: i for i, r in enumerate(roster)}
    minutes = [float(r[1]) for r in roster]
    ratings = [float(r[2]) for r in roster]
    on = []
    for stint in stints:
        finish = (
            period_start(stint["period"])
            + period_length(stint["period"])
            - stint["end_seconds_remaining"]
        )
        begin = finish - stint["duration_seconds"]
        for pid in stint[f"{side}_lineup_json"]:
            if pid not in players:
                players[pid] = len(minutes)
                minutes.append(0.0)
                ratings.append(fill)
            on.append((players[pid], begin, finish))
    expected = np.array(minutes)
    rating = np.array(ratings)
    floor = np.zeros((len(expected), size), dtype=bool)
    for index, begin, finish in on:
        floor[index] |= (times >= begin) & (times < finish)
    last = np.maximum.accumulate(np.where(floor, times, 0.0), axis=1)
    absent = times - last >= LONG_ABSENCE_SECONDS

    fouls = np.zeros((len(expected), size))
    out = np.zeros((len(expected), size), dtype=bool)
    for elapsed, team, pid, count in game.fouls:
        if team == side and pid in players:
            active = times >= elapsed
            fouls[players[pid], active] = np.maximum(fouls[players[pid], active], count)
    out |= fouls >= 6
    for elapsed, team, pid in game.ejections:
        if team == side and pid in players:
            out[players[pid], times >= elapsed] = True

    weight = np.tile(expected[:, None], (1, size))
    weight[absent & ~floor] *= 0.5
    weight[out] = 0.0
    total = weight.sum(axis=0)
    total[total <= 0] = 1.0
    rotation = (weight * rating[:, None]).sum(axis=0) * 5 / total
    base = float((expected * rating).sum() * 5 / max(expected.sum(), 1.0))
    allowed = 1 + 6 * np.minimum(times / 2880, 1.0)
    excess = np.maximum(fouls - allowed, 0.0)
    share = expected[:, None] / 240 * 5
    floor_rating = (floor * rating[:, None]).sum(axis=0)
    has_five = floor.sum(axis=0) == 5
    return {
        "rotation": rotation,
        "lost": base - rotation,
        "foul_load": (share * excess).sum(axis=0),
        "foul_trouble": (share * np.maximum(rating, 0.0)[:, None] * (excess > 0)).sum(axis=0),
        "current": np.where(has_five, floor_rating - rotation, np.nan),
    }


def game_states(
    gid_index: int, game: Replay, entry: dict[str, Any], stints: list[dict[str, Any]]
) -> np.ndarray:
    times, rows = state_rows(game)
    state = game.state[rows]
    columns = {name: state[:, i] for i, name in enumerate(COLUMNS)}
    margin = columns["home_score"] - columns["away_score"]
    elapsed_all = game.column("elapsed")
    margin_all = game.column("home_score") - game.column("away_score")

    def run(window: float) -> np.ndarray:
        index = np.searchsorted(elapsed_all, times - window, side="right") - 1
        before = np.where(index >= 0, margin_all[np.maximum(index, 0)], 0.0)
        result: np.ndarray = margin - before
        return result

    won = entry["home_pts"] > entry["away_pts"]
    data: dict[str, np.ndarray] = {
        "game_index": np.full(len(times), gid_index),
        "time": times,
        "period": period_at(times),
        "target_home": segment_end_margins(game, times),
        "win_home": np.full(len(times), 1.0 if won else 0.0),
        **{k: columns[k] for k in COLUMNS[2:]},
        "run_120": run(120),
        "run_300": run(300),
    }
    for side in ("home", "away"):
        three = entry[f"three_pct_{side}"]
        free = entry[f"ft_pct_{side}"]
        data[f"three_luck_{side}"] = 3 * (
            columns[f"three_made_{side}"] - columns[f"three_att_{side}"] * three
        )
        data[f"ft_luck_{side}"] = columns[f"ft_made_{side}"] - columns[f"ft_att_{side}"] * free
        fill = (
            float(np.mean([r[2] for r in entry["roster"][side]] or [0.0]))
            if all(r[2] is not None for r in entry["roster"][side])
            else 0.0
        )
        features = rotation_features(times, stints, side, entry["roster"][side], game, fill)
        for name, values in features.items():
            data[f"{name}_{side}"] = values
    return np.column_stack([data[name] for name in STATE_COLUMNS]).astype(np.float32)


def build_states(season: str, output: Path = OUTPUT) -> dict[str, Any]:
    started = time.monotonic()
    table = read_games(output)
    games = {g: e for g, e in table["games"].items() if e["season"] == season}
    year = int(season[:4])
    path, _ = bundle_paths()[season]
    bundle = checked(path, path.name.removesuffix(".json.gz"))
    observation = HISTORY_OBSERVATION if year <= 2022 else SEALED_OBSERVATION
    assets = {a["name"]: a for a in json.loads(observation.read_text())["assets"]}
    asset = assets[f"datasets/nbastatsv3_{year}.tar.xz"]
    archive = Path("data/raw/impact-archive") / asset["object"]
    if hash_file(archive)[0] != asset["sha256"]:
        raise ValueError("archive bytes differ from the observation")

    blocks = []
    ids: list[str] = []
    excluded: dict[str, str] = {}
    with tempfile.TemporaryDirectory(prefix="courtlens-r15a-") as temporary:
        store: ArchiveGames = (
            HistoryGames(Path(temporary) / "events.sqlite")
            if year <= 2022
            else ArchiveGames(Path(temporary) / "events.sqlite")
        )
        try:
            store.load("v3", archive, f"nbastatsv3_{year}")
            for gid, member in sorted(bundle["members"].items()):
                entry = games[gid]
                rows = store.get("v3", gid)
                if not rows:
                    excluded[gid] = "no_rows"
                    continue
                game = replay(rows, entry["home"], entry["away"])
                final = (game.column("home_score")[-1], game.column("away_score")[-1])
                if final != (entry["home_pts"], entry["away_pts"]):
                    excluded[gid] = "final_score_differs"
                    continue
                stints = checked(Path(member["path"]), member["content_sha256"])["stints"]
                if stints and stints[0]["home_team_id"] != entry["home"]:
                    raise ValueError(f"stint sides differ for {gid}")
                blocks.append(game_states(len(ids), game, entry, stints))
                ids.append(gid)
        finally:
            store.close()
    matrix = np.concatenate(blocks)
    directory = output / "states"
    directory.mkdir(parents=True, exist_ok=True)
    tmp = directory / f"{season}.tmp.npz"
    np.savez_compressed(tmp, matrix=matrix, columns=np.array(STATE_COLUMNS), games=np.array(ids))
    digest = hashlib.sha256(tmp.read_bytes()).hexdigest()
    final_path = directory / f"{season}.{digest}.npz"
    tmp.rename(final_path)
    receipt = {
        "season": season,
        "sha256": digest,
        "path": str(final_path),
        "archive_sha256": asset["sha256"],
        "games": len(ids),
        "states": len(matrix),
        "states_per_game": round(len(matrix) / max(len(ids), 1), 1),
        "excluded": excluded,
        "excluded_count": len(excluded),
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }
    (directory / f"{season}.receipt.json").write_text(json.dumps(receipt, indent=1, sort_keys=True))
    print(json.dumps({k: v for k, v in receipt.items() if k != "excluded"}), flush=True)
    return receipt


def audit_causality(season: str, count: int, output: Path = OUTPUT) -> dict[str, Any]:
    """Cut real games at seeded times: every earlier state's features must not change."""
    games = read_games(output)["games"]
    year = int(season[:4])
    path, _ = bundle_paths()[season]
    bundle = checked(path, path.name.removesuffix(".json.gz"))
    observation = HISTORY_OBSERVATION if year <= 2022 else SEALED_OBSERVATION
    assets = {a["name"]: a for a in json.loads(observation.read_text())["assets"]}
    archive = (
        Path("data/raw/impact-archive") / assets[f"datasets/nbastatsv3_{year}.tar.xz"]["object"]
    )
    chosen = sorted(bundle["members"])[:count]
    reader = history_rows if year <= 2022 else archive_rows
    rows: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in reader(archive, f"nbastatsv3_{year}"):
        gid = normalize_game_id(row["gameId"])
        if gid in chosen:
            rows[gid].append(row)

    def elapsed(row: dict[str, str]) -> float | None:
        left = parse_clock(row.get("clock", ""))
        period = int(row["period"]) if str(row.get("period", "")).isdigit() else 0
        return (
            None
            if left is None or period < 1
            else period_start(period) + period_length(period) - left
        )

    targets = {STATE_COLUMNS.index("target_home"), STATE_COLUMNS.index("win_home")}
    features = [i for i in range(len(STATE_COLUMNS)) if i not in targets]
    rng = np.random.default_rng(2501)
    compared = differing = 0
    for gid in chosen:
        entry = games[gid]
        member = bundle["members"][gid]
        stints = checked(Path(member["path"]), member["content_sha256"])["stints"]
        full = game_states(0, replay(rows[gid], entry["home"], entry["away"]), entry, stints)
        for share in (0.3, 0.6, 0.9):
            cut = float(rng.uniform(0.8, 1.0) * share * 2880)
            kept = [r for r in rows[gid] if (e := elapsed(r)) is not None and e <= cut]
            short = game_states(0, replay(kept, entry["home"], entry["away"]), entry, stints)
            before, after = full[full[:, 1] <= cut], short[short[:, 1] <= cut]
            size = min(len(before), len(after))
            same = before[:size][:, features] == after[:size][:, features]
            both_nan = np.isnan(before[:size][:, features]) & np.isnan(after[:size][:, features])
            compared += size
            differing += int((~(same | both_nan)).any(axis=1).sum())
    result = {
        "season": season,
        "games": len(chosen),
        "states_compared": compared,
        "states_differing": differing,
    }
    print(json.dumps(result))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("games", "states", "causality"))
    parser.add_argument("seasons", nargs="*")
    args = parser.parse_args()
    load_registration(REGISTRATION)
    if args.command == "games":
        build_games()
    elif args.command == "causality":
        for season in args.seasons:
            audit_causality(season, 200)
    else:
        for season in args.seasons:
            build_states(season)


if __name__ == "__main__":
    main()
