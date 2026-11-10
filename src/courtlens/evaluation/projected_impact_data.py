"""Inputs and features for Projected Impact (`courtlens-projected-impact-v1`, R07).

`season_features` is the only feature path: training, selection, test and the 2026-27 freeze all
call it, and it reads nothing dated on or after the target season's opener. `causality_check`
and `window_check` prove that on the real inputs, and the freeze refuses to run if they fail.

The rules, the target definition and the five settled questions are in the registration.
"""

from __future__ import annotations

import glob
import json
import os
from collections import defaultdict
from dataclasses import dataclass, replace
from datetime import date
from pathlib import Path
from typing import Any

from courtlens.domain.projected_impact import PRIOR, RETURNER, ROOKIE, BoxPlayer
from courtlens.evaluation.win_probability_data import box_seconds
from courtlens.ingestion.impact_repair_audit import retained_boxes
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.services.win_probability_pregame import _schedule

OUTPUT = Path("data/derived/projected-impact-v1")
RAW = Path("data/raw")
FIT_DIRECTORIES = (
    Path("data/derived/impact-history-v2/ratings"),
    Path("data/derived/impact-ratings-v1/ratings"),
)
# The sealed 2023-24 to 2025-26 seasons were fitted twice with equal RAPM and six factors (only a
# design document's hash differs). These are the runs the site serves.
SERVED_FITS = {"2023-24": "f7f8928a38", "2024-25": "64df32d0ce", "2025-26": "d97363bee6"}
SNAPSHOT_DIRECTORIES = (
    Path("data/derived/impact-history-v2/snapshots"),
    Path("data/derived/win-probability-ratings"),
)
SHOT_ZONES = Path("data/derived/shot-zones-v1")
ESPN_BUNDLES = Path("data/derived/espn-rosters-v1")
ESPN_RAW = Path("data/raw/espn-rosters")

TRAIN = ("2016-17", "2017-18", "2018-19", "2019-20", "2020-21", "2021-22", "2022-23")
SELECT = "2023-24"
TEST = ("2024-25", "2025-26")
PROSPECTIVE = "2026-27"
TARGETS = (*TRAIN, SELECT, *TEST)
FIRST_BOX_YEAR = 2014

OFFENSIVE_TYPES = (
    "cut",
    "handoff",
    "isolation",
    "misc",
    "offrebound",
    "offscreen",
    "postup",
    "prballhandler",
    "prrollman",
    "spotup",
    "transition",
)
SIX_FACTORS = ("ts", "tov", "reb")
PER_36 = {
    "pts": "points",
    "fga": "field_goals_attempted",
    "fg3a": "three_pointers_attempted",
    "fta": "free_throws_attempted",
    "oreb": "rebounds_offensive",
    "dreb": "rebounds_defensive",
    "ast": "assists",
    "stl": "steals",
    "blk": "blocks",
    "tov": "turnovers",
    "pf": "fouls_personal",
}
SHOT_COLUMNS = (
    "rim_fga",
    "rim_fgm",
    "short_mid_fga",
    "short_mid_fgm",
    "long_mid_fga",
    "long_mid_fgm",
    "fg3a",
    "fg3m",
)
BOX_COLUMNS = (*PER_36.values(), "field_goals_made", "free_throws_made")


def season_label(start_year: int) -> str:
    return f"{start_year}-{(start_year + 1) % 100:02d}"


def previous(season: str) -> str:
    return season_label(int(season[:4]) - 1)


@dataclass(frozen=True)
class Fit:
    sha256: str
    games: frozenset[str]
    players: dict[str, dict[str, float | None]]


@dataclass(frozen=True)
class Snapshot:
    sha256: str
    cutoff: str
    latest_game_date: str
    players: dict[str, dict[str, float]]


@dataclass(frozen=True)
class BoxRow:
    game_id: str
    day: str
    player_id: str
    seconds: float
    stats: dict[str, float]


@dataclass(frozen=True)
class Sources:
    openers: dict[str, str]
    fits: dict[str, Fit]
    snapshots: dict[str, Snapshot]
    boxes: dict[str, list[BoxRow]]
    play_types: dict[str, dict[str, dict[str, float]]]
    defensive_types: tuple[str, ...]
    shots: dict[str, dict[str, dict[str, float]]]
    birth: dict[str, str]
    debut: dict[str, int]


def feature_names(defensive_types: tuple[str, ...]) -> tuple[str, ...]:
    return (
        "rapm_total_1",
        "rapm_off_1",
        "rapm_def_1",
        *(f"six_{f}_{side}_1" for f in SIX_FACTORS for side in ("off", "def")),
        "minutes_1",
        "games_1",
        "mpg_1",
        *(f"per36_{k}_1" for k in PER_36),
        "ts_1",
        "three_rate_1",
        "ft_rate_1",
        *(f"pt_off_{t}_1" for t in OFFENSIVE_TYPES),
        *(f"pt_def_{t}_1" for t in defensive_types),
        "shot_rim_share_1",
        "shot_short_mid_share_1",
        "shot_long_mid_share_1",
        "shot_three_share_1",
        "shot_rim_pct_1",
        "shot_mid_pct_1",
        "shot_three_pct_1",
        "rapm_total_2",
        "rapm_off_2",
        "rapm_def_2",
        "minutes_2",
        "td_rapm",
        "td_orapm",
        "td_drapm",
        "td_decayed_seconds",
        "age",
        "age_squared",
        "years_in_league",
    )


def feature_block(name: str) -> str:
    """Display and missing-indicator group of a feature."""
    if name.startswith(("rapm_total_1", "rapm_off_1", "rapm_def_1", "six_")):
        return "prior_rapm"
    if name.endswith("_2"):
        return "older_rapm"
    if name.startswith("td_"):
        return "time_decay_rapm"
    if name.startswith("pt_off_"):
        return "play_type_offense"
    if name.startswith("pt_def_"):
        return "play_type_defense"
    if name.startswith("shot_"):
        return "shot_profile"
    if name.startswith(("minutes_", "games_", "mpg_")):
        return "minutes"
    if name.startswith(("age", "years_")):
        return "age_experience"
    return "box_rates"


def _ratio(numerator: float, denominator: float) -> float | None:
    return numerator / denominator if denominator > 0 else None


def season_features(target: str, players: list[str], sources: Sources) -> dict[str, Any]:
    """Features for `players` in target season `target`, from data before its opener only."""
    cutoff = sources.openers[target]
    lag1, lag2 = previous(target), previous(previous(target))
    start_year = int(target[:4])
    fit1 = sources.fits.get(lag1)
    fit2 = sources.fits.get(lag2)
    snapshot = sources.snapshots.get(target)
    if snapshot is not None and (snapshot.cutoff != cutoff or snapshot.latest_game_date >= cutoff):
        raise ValueError(f"snapshot for {target} does not end before the opener")

    totals: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    games: dict[str, set[str]] = defaultdict(set)
    used_games: set[str] = set()
    for box_row in sources.boxes.get(lag1, []):
        if box_row.day >= cutoff or box_row.seconds <= 0:
            continue
        totals[box_row.player_id]["seconds"] += box_row.seconds
        games[box_row.player_id].add(box_row.game_id)
        used_games.add(box_row.game_id)
        for key, value in box_row.stats.items():
            totals[box_row.player_id][key] += value
    lag2_seconds: dict[str, float] = defaultdict(float)
    for box_row in sources.boxes.get(lag2, []):
        if box_row.day < cutoff and box_row.seconds > 0:
            lag2_seconds[box_row.player_id] += box_row.seconds
            used_games.add(box_row.game_id)
    appeared: set[str] = set()
    for season, rows in sources.boxes.items():
        if season < target:
            appeared.update(r.player_id for r in rows if r.day < cutoff and r.seconds > 0)

    shots = sources.shots.get(lag1, {})
    types = sources.play_types.get(lag1, {})
    names = feature_names(sources.defensive_types)
    out: dict[str, dict[str, float | None]] = {}
    groups: dict[str, str] = {}
    for pid in players:
        row: dict[str, float | None] = dict.fromkeys(names)
        one = fit1.players.get(pid) if fit1 else None
        two = fit2.players.get(pid) if fit2 else None
        if one:
            row["rapm_total_1"] = one["total"]
            row["rapm_off_1"] = one["offense"]
            row["rapm_def_1"] = one["defense"]
            for factor in SIX_FACTORS:
                row[f"six_{factor}_off_1"] = one.get(f"{factor}_off")
                row[f"six_{factor}_def_1"] = one.get(f"{factor}_def")
        if two:
            row["rapm_total_2"] = two["total"]
            row["rapm_off_2"] = two["offense"]
            row["rapm_def_2"] = two["defense"]
        if pid in lag2_seconds:
            row["minutes_2"] = lag2_seconds[pid] / 60
        box = totals.get(pid)
        if box:
            minutes = box["seconds"] / 60
            row["minutes_1"] = minutes
            row["games_1"] = float(len(games[pid]))
            row["mpg_1"] = minutes / len(games[pid])
            for key, column in PER_36.items():
                row[f"per36_{key}_1"] = 36 * box[column] / minutes
            attempts = box["field_goals_attempted"]
            free_throws = box["free_throws_attempted"]
            row["ts_1"] = _ratio(box["points"], 2 * (attempts + 0.44 * free_throws))
            row["three_rate_1"] = _ratio(box["three_pointers_attempted"], attempts)
            row["ft_rate_1"] = _ratio(free_throws, attempts)
        mix = types.get(pid)
        if mix:
            for side, side_types in (
                ("off", OFFENSIVE_TYPES),
                ("def", sources.defensive_types),
            ):
                total = sum(v for k, v in mix.items() if k.startswith(f"{side}:"))
                for kind in side_types:
                    possessions = mix.get(f"{side}:{kind}")
                    if possessions is not None and total > 0:
                        row[f"pt_{side}_{kind}_1"] = possessions / total
        shot = shots.get(pid)
        if shot:
            shots_taken = sum(shot[k] for k in ("rim_fga", "short_mid_fga", "long_mid_fga", "fg3a"))
            mid = shot["short_mid_fga"] + shot["long_mid_fga"]
            row["shot_rim_share_1"] = _ratio(shot["rim_fga"], shots_taken)
            row["shot_short_mid_share_1"] = _ratio(shot["short_mid_fga"], shots_taken)
            row["shot_long_mid_share_1"] = _ratio(shot["long_mid_fga"], shots_taken)
            row["shot_three_share_1"] = _ratio(shot["fg3a"], shots_taken)
            row["shot_rim_pct_1"] = _ratio(shot["rim_fgm"], shot["rim_fga"])
            row["shot_mid_pct_1"] = _ratio(shot["short_mid_fgm"] + shot["long_mid_fgm"], mid)
            row["shot_three_pct_1"] = _ratio(shot["fg3m"], shot["fg3a"])
        decayed = snapshot.players.get(pid) if snapshot else None
        if decayed:
            row["td_rapm"] = decayed["rapm"]
            row["td_orapm"] = decayed["orapm"]
            row["td_drapm"] = decayed["drapm"]
            row["td_decayed_seconds"] = decayed["decayed_seconds"]
        born = sources.birth.get(pid)
        if born:
            age = (date.fromisoformat(cutoff) - date.fromisoformat(born)).days / 365.25
            row["age"] = age
            row["age_squared"] = age * age
        debut = sources.debut.get(pid)
        if debut is not None and debut <= start_year:
            row["years_in_league"] = float(start_year - debut)
        out[pid] = row
        if one:
            groups[pid] = PRIOR
        elif row["years_in_league"] == 0 or pid not in appeared:
            groups[pid] = ROOKIE
        else:
            groups[pid] = RETURNER
    body = {
        "season": target,
        "cutoff": cutoff,
        "features": out,
        "groups": groups,
        "sources": {
            "fit_t_minus_1": fit1.sha256 if fit1 else None,
            "fit_t_minus_2": fit2.sha256 if fit2 else None,
            "snapshot": snapshot.sha256 if snapshot else None,
        },
    }
    feature_games = set(used_games)
    for fit in (fit1, fit2):
        if fit:
            feature_games |= fit.games
    return {
        **body,
        "feature_sha256": content_hash(body),
        "feature_games": sorted(feature_games),
    }


def target_rows(season: str, sources: Sources) -> dict[str, dict[str, float]]:
    """Target: RAPM total from the fit on this season's games alone, with its minutes."""
    return {
        pid: {"target": float(v["total"]), "minutes": float(v["seconds"] or 0) / 60}
        for pid, v in sources.fits[season].players.items()
        if v["total"] is not None
    }


def population(season: str, sources: Sources) -> list[str]:
    """Everyone with a fit row or box minutes in the season. Who played is hindsight (stated)."""
    players = set(sources.fits[season].players)
    players.update(r.player_id for r in sources.boxes.get(season, []) if r.seconds > 0)
    return sorted(players)


# ---------------------------------------------------------------------------------------------
# Checks. Any failure stops the freeze.


def strip_from(sources: Sources, target: str) -> Sources:
    """The inputs with everything on or after the target's opener removed."""
    cutoff = sources.openers[target]
    return replace(
        sources,
        fits={s: f for s, f in sources.fits.items() if s < target},
        boxes={
            s: [r for r in rows if r.day < cutoff]
            for s, rows in sources.boxes.items()
            if s < target
        },
        play_types={s: v for s, v in sources.play_types.items() if s < target},
        shots={s: v for s, v in sources.shots.items() if s < target},
        snapshots={s: v for s, v in sources.snapshots.items() if s <= target},
    )


def corrupt_from(sources: Sources, target: str) -> Sources:
    """The inputs with everything on or after the target's opener changed, not removed."""
    cutoff = sources.openers[target]

    def changed_fit(fit: Fit) -> Fit:
        return replace(
            fit,
            players={
                p: {k: (v + 7.0 if v is not None else v) for k, v in row.items()}
                for p, row in fit.players.items()
            },
        )

    return replace(
        sources,
        fits={s: changed_fit(f) if s >= target else f for s, f in sources.fits.items()},
        boxes={
            s: [
                replace(r, seconds=r.seconds + 600, stats={k: v + 9 for k, v in r.stats.items()})
                if r.day >= cutoff
                else r
                for r in rows
            ]
            for s, rows in sources.boxes.items()
        },
        play_types={
            s: {p: {k: v * 3 for k, v in m.items()} for p, m in v.items()} if s >= target else v
            for s, v in sources.play_types.items()
        },
        shots={
            s: {p: {k: x * 2 for k, x in m.items()} for p, m in v.items()} if s >= target else v
            for s, v in sources.shots.items()
        },
    )


def causality_check(sources: Sources, seasons: tuple[str, ...]) -> dict[str, Any]:
    """F2: removing or changing anything on or after a cutoff changes no feature hash."""
    rows: dict[str, Any] = {}
    for season in seasons:
        players = (
            population(season, sources)
            if season in sources.fits
            else sorted(sources.fits[previous(season)].players)
        )
        base = season_features(season, players, sources)["feature_sha256"]
        removed = season_features(season, players, strip_from(sources, season))["feature_sha256"]
        changed = season_features(season, players, corrupt_from(sources, season))["feature_sha256"]
        rows[season] = {
            "feature_sha256": base,
            "unchanged_when_removed": removed == base,
            "unchanged_when_changed": changed == base,
        }
    passed = all(r["unchanged_when_removed"] and r["unchanged_when_changed"] for r in rows.values())
    return {"passed": passed, "seasons": rows}


def window_check(sources: Sources, seasons: tuple[str, ...]) -> dict[str, Any]:
    """F3: target-season games and feature-window games share nothing."""
    rows: dict[str, Any] = {}
    for season in seasons:
        built = season_features(season, population(season, sources), sources)
        target_games = sources.fits[season].games
        shared = target_games & set(built["feature_games"])
        rows[season] = {
            "target_games": len(target_games),
            "feature_games": len(built["feature_games"]),
            "shared_games": len(shared),
        }
    return {"passed": all(r["shared_games"] == 0 for r in rows.values()), "seasons": rows}


def prospective_check(sources: Sources) -> dict[str, Any]:
    """F4: the 2026-27 build holds no 2026-27 game and is the test seasons' own function."""
    fit_seasons = sorted(sources.fits[previous(PROSPECTIVE)].players)
    built = season_features(PROSPECTIVE, fit_seasons, sources)
    current_games = {r.game_id for r in sources.boxes.get(PROSPECTIVE, [])}
    shared = current_games & set(built["feature_games"])
    snapshot = sources.snapshots[PROSPECTIVE]
    test_names = set(feature_names(sources.defensive_types))
    prospective_names = set(next(iter(built["features"].values())))
    return {
        "passed": not shared
        and snapshot.latest_game_date < sources.openers[PROSPECTIVE]
        and test_names == prospective_names,
        "games_2026_27_in_boxes": len(current_games),
        "games_2026_27_in_features": len(shared),
        "cutoff": sources.openers[PROSPECTIVE],
        "snapshot_latest_game_date": snapshot.latest_game_date,
        "same_feature_columns_as_test": test_names == prospective_names,
    }


# ---------------------------------------------------------------------------------------------
# Loading.


def load_fits() -> dict[str, Fit]:
    fits: dict[str, Fit] = {}
    for directory in FIT_DIRECTORIES:
        for path in sorted(directory.glob("*.json")):
            body = json.loads(path.read_bytes())
            seasons = body["input"].get("seasons", [])
            if len(seasons) != 1 or body["input"].get("phase") != "regular_season":
                continue
            season = seasons[0]
            if season in SERVED_FITS and not path.stem.startswith(SERVED_FITS[season]):
                continue
            players: dict[str, dict[str, float | None]] = {}
            for pid, row in body["rapm"]["players"].items():
                players[pid] = {
                    "total": row["total"],
                    "offense": row["offense"],
                    "defense": row["defense"],
                    "seconds": row["seconds"],
                }
            for factor in SIX_FACTORS:
                for pid, row in body["six_factor"][factor]["players"].items():
                    if pid in players:
                        players[pid][f"{factor}_off"] = row["offense"]
                        players[pid][f"{factor}_def"] = row["defense"]
            if season in fits:
                raise ValueError(f"two one-season regular fits for {season}")
            fits[season] = Fit(path.stem, frozenset(body["input"]["games"]), players)
    return fits


def load_snapshots(openers: dict[str, str]) -> dict[str, Snapshot]:
    by_cutoff = {v: k for k, v in openers.items()}
    snapshots: dict[str, Snapshot] = {}
    for directory in SNAPSHOT_DIRECTORIES:
        for path in directory.glob("*.json"):
            body = json.loads(path.read_bytes())
            season = by_cutoff.get(body["cutoff"])
            if season is None or season in snapshots:
                continue
            snapshots[season] = Snapshot(
                path.stem,
                body["cutoff"],
                body["latest_game_date"],
                {
                    pid: {k: float(row[k]) for k in ("rapm", "orapm", "drapm", "decayed_seconds")}
                    for pid, row in body["players"].items()
                },
            )
    return snapshots


def load_boxes(last_year: int) -> tuple[dict[str, list[BoxRow]], dict[str, str]]:
    """Regular-season player rows per season, and each season's first regular-season date."""
    boxes: dict[str, list[BoxRow]] = {}
    openers: dict[str, str] = {}
    for year in range(FIRST_BOX_YEAR, last_year + 1):
        season = season_label(year - 1)
        schedule = _schedule(year)
        openers[season] = min(schedule.values())
        player_rows, _, _ = retained_boxes(RAW, year)
        rows: list[BoxRow] = []
        for gid, members in player_rows.items():
            if gid not in schedule:
                continue
            for member in members:
                rows.append(
                    BoxRow(
                        gid,
                        schedule[gid],
                        member["person_id"],
                        box_seconds(member["minutes"]),
                        {c: float(member[c] or 0) for c in BOX_COLUMNS},
                    )
                )
        boxes[season] = rows
    return boxes, openers


def game_rows(year: int) -> list[dict[str, Any]]:
    """Regular-season games with a two-team box: final margin and who played how long."""
    schedule = _schedule(year)
    player_rows, team_rows, _ = retained_boxes(RAW, year)
    games = []
    for gid, rows in team_rows.items():
        if gid not in schedule or len(rows) != 2:
            continue
        by_side = {r["side"]: r for r in rows}
        if set(by_side) != {"home", "away"} or not by_side["home"].get("points"):
            continue
        home_team = by_side["home"]["team_id"]
        players = [
            BoxPlayer(
                m["person_id"],
                "home" if m["team_id"] == home_team else "away",
                box_seconds(m["minutes"]),
            )
            for m in player_rows.get(gid, [])
        ]
        games.append(
            {
                "game_id": gid,
                "date": schedule[gid],
                "home": home_team,
                "away": by_side["away"]["team_id"],
                "margin": float(by_side["home"]["points"]) - float(by_side["away"]["points"]),
                "players": players,
            }
        )
    games.sort(key=lambda g: (g["date"], g["game_id"]))
    return games


def tip_times(year: int) -> dict[str, str]:
    """Scheduled tip per game, UTC, from the in-season schedule document."""
    body = json.loads((RAW / f"sportsdataverse_{year}" / f"schedule_{year}.json").read_text())
    out = {}
    for day in body.get("leagueSchedule", {}).get("gameDates", []):
        for game in day.get("games", []):
            if str(game.get("gameId", "")).startswith("002") and game.get("gameDateTimeUTC"):
                out[str(game["gameId"])] = game["gameDateTimeUTC"]
    return out


def _espn_birth_dates() -> tuple[dict[str, str], dict[str, str]]:
    """ESPN id -> NBA id from sealed roster bundles, then NBA id -> birth date from raw payloads."""
    nba: dict[str, str] = {}
    for path in ESPN_BUNDLES.glob("*.json"):
        for player in json.loads(path.read_bytes())["entry"]["players"]:
            if player.get("player_id"):
                nba[str(player["espn_id"])] = str(player["player_id"])
    birth: dict[str, str] = {}
    for raw_path in glob.glob(str(ESPN_RAW / "*" / "*")):
        if os.path.getsize(raw_path) < 4096:  # robots refusals and receipts
            continue
        try:
            body = json.loads(Path(raw_path).read_bytes())
        except ValueError:
            continue
        for athlete in body.get("athletes", []) if isinstance(body, dict) else []:
            pid = nba.get(str(athlete.get("id")))
            born = athlete.get("dateOfBirth")
            if pid and born:
                birth[pid] = born[:10]
    return birth, nba


def capture_external(output: Path = OUTPUT) -> Path:
    """Seal the warehouse-held inputs once, so fits read a hashed file and not a moving database."""
    from sqlalchemy import text

    from courtlens.database import SessionLocal

    with SessionLocal() as session:
        types: dict[str, dict[str, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))
        defensive: set[str] = set()
        for season, pid, side, kind, possessions in session.execute(
            text(
                "SELECT season, player_id, side, play_type, sum(possessions) "
                "FROM analytics_marts.mart_stats_player_play_types "
                "WHERE season_type = 'regular_season' GROUP BY 1, 2, 3, 4"
            )
        ):
            short = "off" if side == "offensive" else "def"
            types[season][pid][f"{short}:{kind}"] = float(possessions or 0)
            if short == "def":
                defensive.add(kind)
        birth = {
            pid: born.isoformat()
            for pid, born in session.execute(
                text(
                    "SELECT player_id, max(birth_date) FROM "
                    "analytics_marts.mart_player_roster_seasons "
                    "WHERE birth_date IS NOT NULL GROUP BY 1"
                )
            )
        }
        sources = dict.fromkeys(birth, "nba_team_roster")
        debut: dict[str, int] = {}
        for pid, born, from_year in session.execute(
            text("SELECT player_id, birth_date, from_year FROM analytics_marts.mart_player_bio")
        ):
            if born:
                birth[pid] = born.isoformat()
                sources[pid] = "nba_player_index"
            if from_year is not None:
                debut[pid] = int(from_year)
    espn, _ = _espn_birth_dates()
    for pid, born in espn.items():
        if pid not in birth:
            birth[pid] = born
            sources[pid] = "espn_roster"
    body = {
        "registration": "courtlens-projected-impact-v1",
        "play_types": types,
        "defensive_types": sorted(defensive),
        "birth": birth,
        "birth_source": sources,
        "debut": debut,
    }
    output.mkdir(parents=True, exist_ok=True)
    digest = content_hash(json.loads(json.dumps(body)))
    path = output / "external.json"
    path.write_text(json.dumps({**body, "content_sha256": digest}, sort_keys=True))
    return path


def load_sources(output: Path = OUTPUT, last_year: int = 2027) -> Sources:
    external = json.loads((output / "external.json").read_text())
    boxes, openers = load_boxes(last_year)
    shot_bundle = json.loads(next(SHOT_ZONES.glob("*.json")).read_bytes())
    shots = {
        season: {
            row["player_id"]: {c: float(row.get(c) or 0) for c in SHOT_COLUMNS}
            for row in entry["players"]
        }
        for season, entry in shot_bundle["seasons"].items()
        if season >= "2013-14"
    }
    return Sources(
        openers=openers,
        fits=load_fits(),
        snapshots=load_snapshots(openers),
        boxes=boxes,
        play_types=external["play_types"],
        defensive_types=tuple(external["defensive_types"]),
        shots=shots,
        birth=external["birth"],
        debut={k: int(v) for k, v in external["debut"].items()},
    )


def coverage(sources: Sources, output: Path = OUTPUT) -> dict[str, Any]:
    """Share of each season's players with each input. Reads no outcome beyond who played."""
    external = json.loads((output / "external.json").read_text())
    rows: dict[str, Any] = {}
    names = feature_names(sources.defensive_types)
    for season in (*TARGETS, PROSPECTIVE):
        players = (
            population(season, sources)
            if season in sources.fits
            else sorted(sources.fits[previous(season)].players)
        )
        built = season_features(season, players, sources)
        features = built["features"]

        def share(column: str, rows: dict[str, dict[str, Any]] = features) -> float:
            return sum(1 for f in rows.values() if f[column] is not None) / len(rows)

        groups = list(built["groups"].values())
        rows[season] = {
            "players": len(players),
            "groups": {g: groups.count(g) for g in (PRIOR, ROOKIE, RETURNER)},
            "rapm_t_minus_1": share("rapm_total_1"),
            "rapm_t_minus_2": share("rapm_total_2"),
            "six_factors": share("six_ts_off_1"),
            "box": share("minutes_1"),
            "play_type_offense": share(f"pt_off_{OFFENSIVE_TYPES[-2]}_1"),
            "shot_profile": share("shot_rim_share_1"),
            "time_decay_snapshot": share("td_rapm"),
            "age": share("age"),
            "years_in_league": share("years_in_league"),
            "any_feature_missing": sum(
                1 for f in features.values() if any(f[c] is None for c in names)
            )
            / len(features),
        }
    source_counts: dict[str, int] = defaultdict(int)
    for value in external["birth_source"].values():
        source_counts[value] += 1
    return {"by_season": rows, "birth_date_sources": dict(source_counts)}
