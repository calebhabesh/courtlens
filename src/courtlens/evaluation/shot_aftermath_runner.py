"""Run `courtlens-shot-aftermath-v1` (Research R17): Databallr's Shot Aftermath, sealed possessions.

For every first-chance field-goal attempt of the 2024-25 and 2025-26 regular seasons: its made
points, the shooting team's later points in the same possession after a miss, and the points the
opponent scores on its immediate next possession against the season's league points per
possession. Summed per game and cell (shooting team x estimated position group x zone), with
2,000-replicate game-bootstrap 95% intervals. Descriptive, one pass, nothing chosen. Every
constant is checked against the registration; every input is read by content hash.

    systemd-run --user --wait --collect -p MemoryMax=4G -p MemorySwapMax=0 \
      -E OMP_NUM_THREADS=1 -E OPENBLAS_NUM_THREADS=1 -E MKL_NUM_THREADS=1 \
      --working-directory=<repo> \
      .venv/bin/python -m courtlens.evaluation.shot_aftermath_runner run --out <file> --log <file>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import resource
import time
from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain import shot_aftermath as sa
from courtlens.domain import shot_decomposition as sd
from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.domain.teams import resolve_team_tricode
from courtlens.evaluation import expected_shot_v2_data as shots_data
from courtlens.evaluation import expected_shot_v2_runner as r05
from courtlens.evaluation.impact_history_fits import bundle_paths
from courtlens.evaluation.impact_rating_inputs import checked

REGISTRATION = "courtlens-shot-aftermath-v1"
FROZEN = Path("evaluation/research/frozen/courtlens-shot-aftermath-v1.json")
POSITIONS_ARTIFACT = Path("data/derived/position-estimates-v1")
SEASONS = ("2024-25", "2025-26")
REPLICATES = 2000
CHUNK = 250
PERCENTILES = (2.5, 97.5)
INTERVAL = 0.95
SEED = 1717
IDENTITY_TOLERANCE = 1e-12
DATABALLR_2024_25 = {
    "rim": 61494,
    "short_mid": 33391,
    "long_mid": 13195,
    "three": 82583,
    "all": 190685,
}
NB = len(sa.BASE_GROUPS)
NZ = len(sa.BASE_ZONES)
K = len(sa.SUMS)


def parameters(identity: str = REGISTRATION) -> dict[str, Any]:
    """The registration's parameters, after checking every module constant against them."""
    params = load_registration(identity).parameters
    checks: dict[str, Any] = {
        "seasons": list(SEASONS),
        "zones": list(sa.ZONES),
        "positions": list(sa.POSITIONS),
        "position_groups": sa.POSITION_GROUPS,
        "rim_action_words": list(sa.RIM_ACTION_WORDS),
        "rim_max_feet": sa.RIM_MAX_FEET,
        "short_mid_max_feet": sa.SHORT_MID_MAX_FEET,
        "bootstrap_replicates": REPLICATES,
        "interval": INTERVAL,
        "percentiles": list(PERCENTILES),
        "thin_attempts": sa.THIN_ATTEMPTS,
        "thin_possessions": sa.THIN_POSSESSIONS,
        "identity_tolerance": IDENTITY_TOLERANCE,
        "databallr_first_chance_2024_25": DATABALLR_2024_25,
    }
    for key, expected in checks.items():
        if params[key] != expected:
            raise SystemExit(f"module constant {key} differs from the registration")
    if load_registration(identity).seed != SEED:
        raise SystemExit("seed differs from the registration")
    return params


# ---- Per-game extraction ------------------------------------------------------------------------


@dataclass(frozen=True)
class Shot:
    team: str
    made: int
    value: int
    zone: str
    group: str


@dataclass
class GameSums:
    """One game's sums per base cell (team, group, zone) plus league possessions and points."""

    cells: dict[tuple[str, str, str], np.ndarray] = field(default_factory=dict)
    possessions: int = 0
    points: float = 0.0
    counts: Counter[str] = field(default_factory=Counter)

    def add(self, key: tuple[str, str, str], name: str, amount: float = 1.0) -> None:
        row = self.cells.get(key)
        if row is None:
            row = self.cells[key] = np.zeros(K)
        row[sa.S[name]] += amount


def _next_counted(possessions: list[dict[str, Any]], index: int) -> dict[str, Any] | None:
    for later in possessions[index + 1 :]:
        if later["count_as_possession"]:
            return later
    return None


def game_sums(
    game_id: str,
    possessions: list[dict[str, Any]],
    shots: Mapping[tuple[str, int], Shot],
    blocks: set[tuple[str, int]],
    and_ones: set[tuple[str, int]],
) -> tuple[GameSums, dict[tuple[str, int], bool | None]]:
    """Sums for one game of sealed possessions; also each matched shot's first-chance flag
    (None on an uncounted segment)."""
    out = GameSums()
    matched: dict[tuple[str, int], bool | None] = {}
    for index, p in enumerate(possessions):
        events = p["stats_json"]["events"]
        orders = [e["order_index"] for e in events]
        if orders != sorted(orders):
            raise SystemExit(f"possession events out of order in {game_id}")
        if sum(float(e["values"].get("points", 0)) for e in events) != float(p["points"]):
            out.counts["possession_points_differ_from_events"] += 1
        counted = bool(p["count_as_possession"])
        if counted:
            out.possessions += 1
            out.points += float(p["points"])
        seen_oreb = False
        for at, event in enumerate(events):
            values = event["values"]
            if values.get("orb"):
                seen_oreb = True
            if "fga" not in values:
                continue
            key = (game_id, int(event["locator"]["action_number"]))
            shot = shots.get(key)
            if shot is None:
                out.counts["possession_fga_without_shot"] += 1
                continue
            if shot.team != p["offense_team_id"] or shot.made != int(values.get("fgm", 0)):
                out.counts["unjoined:team_or_result_differs"] += 1
                continue
            matched[key] = None if not counted else not seen_oreb
            if not counted:
                out.counts["unknown:attempt_on_uncounted_segment"] += 1
                continue
            if seen_oreb:
                out.counts["second_chance_attempts"] += 1
                continue
            out.counts["first_chance_attempts"] += 1
            cell = (shot.team, shot.group, shot.zone)
            out.add(cell, "attempts")
            if key in blocks:
                out.add(cell, "blocks")
            rest = events[at + 1 :]
            nxt = _next_counted(possessions, index)
            if nxt is None or nxt["period"] != p["period"]:
                pairing = "censored"
            elif nxt["offense_team_id"] == p["defense_team_id"]:
                pairing = "paired"
            else:
                pairing = "same_team"
            if shot.made:
                out.add(cell, "makes")
                out.add(cell, "made_points", float(shot.value))
                if any((game_id, int(e["locator"]["action_number"])) in and_ones for e in rest):
                    out.add(cell, "and_ones")
                if any("fga" in e["values"] for e in rest):
                    out.add(cell, "make_followed")
                elif pairing == "paired":
                    assert nxt is not None
                    out.add(cell, "make_possessions")
                    out.add(cell, "make_points", float(nxt["points"]))
                else:
                    out.add(cell, f"make_{pairing}")
                continue
            rebound = next(
                (
                    e["values"]
                    for e in rest
                    if "orb" in e["values"] or "orb_opportunities" in e["values"]
                ),
                None,
            )
            if rebound is None:
                out.add(cell, "miss_unknown")
                continue
            if rebound.get("orb"):
                out.add(cell, "oreb")
                out.add(
                    cell, "second_points", sum(float(e["values"].get("points", 0)) for e in rest)
                )
                continue
            out.add(cell, "dreb")
            if pairing == "paired":
                assert nxt is not None
                out.add(cell, "dreb_possessions")
                out.add(cell, "dreb_points", float(nxt["points"]))
            else:
                out.add(cell, f"dreb_{pairing}")
    return out, matched


# ---- Season inputs ------------------------------------------------------------------------------


def _file_sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def load_positions(expected_sha: str) -> dict[str, dict[str, Any]]:
    path = POSITIONS_ARTIFACT / f"{expected_sha}.json"
    if _file_sha(path) != expected_sha:
        raise SystemExit("position estimates changed")
    seasons: dict[str, dict[str, Any]] = json.loads(path.read_text())["seasons"]
    return seasons


def pbp_flags(season: str, pin: str) -> tuple[set[tuple[str, int]], set[tuple[str, int]], int]:
    """Blocked field-goal keys, and-one free-throw keys, and unknown free-throw subTypes."""
    if shots_data.pbp_pins()[season] != pin:
        raise SystemExit(f"play-by-play pin for {season} differs from the registration")
    year = int(season[:4])
    blocks: set[tuple[str, int]] = set()
    and_ones: set[tuple[str, int]] = set()
    unknown = 0
    for game, rows in shots_data.games_in_order(shots_data.archive_csv(pin, f"nbastatsv3_{year}")):
        for row in rows:
            if " BLOCK (" in (row.get("description") or ""):
                blocks.add((game, int(row["actionNumber"])))
        found, bad = sd.game_free_throws(rows)
        unknown += len(bad)
        and_ones.update((game, ft.action_number) for ft in found if ft.kind == sd.AND_ONE)
    return blocks, and_ones, unknown


def season_shots(
    table: Mapping[str, np.ndarray], positions: Mapping[str, Any]
) -> tuple[dict[tuple[str, int], Shot], Counter[str], Counter[str]]:
    shots: dict[tuple[str, int], Shot] = {}
    groups: Counter[str] = Counter()
    zones: Counter[str] = Counter()
    for i in range(len(table["game_id"])):
        estimate = positions.get(str(table["player_id"][i]))
        group = sa.position_group(estimate["position"] if estimate else None)
        z = sa.zone(
            int(table["value"][i]), str(table["action_type"][i]), float(table["distance"][i])
        )
        shots[(str(table["game_id"][i]), int(table["event_id"][i]))] = Shot(
            str(table["team_id"][i]), int(table["made"][i]), int(table["value"][i]), z, group
        )
        groups[group] += 1
        zones[z] += 1
    return shots, groups, zones


@dataclass
class SeasonInputs:
    season: str
    teams: list[str]
    base: np.ndarray  # (games, teams, groups, zones, K)
    league: np.ndarray  # (games, 2): counted possessions, points
    data_check: dict[str, Any]


def extract(
    season: str,
    shots: Mapping[tuple[str, int], Shot],
    games: Iterable[tuple[str, list[dict[str, Any]]]],
    blocks: set[tuple[str, int]],
    and_ones: set[tuple[str, int]],
    after_oreb: Mapping[tuple[str, int], int] | None = None,
) -> SeasonInputs:
    teams = sorted({s.team for s in shots.values()})
    t_index = {t: i for i, t in enumerate(teams)}
    g_index = {g: i for i, g in enumerate(sa.BASE_GROUPS)}
    z_index = {z: i for i, z in enumerate(sa.BASE_ZONES)}
    rows: list[np.ndarray] = []
    league: list[tuple[int, float]] = []
    counts: Counter[str] = Counter()
    matched: dict[tuple[str, int], bool | None] = {}
    game_ids: list[str] = []
    for game_id, possessions in games:
        sums, keys = game_sums(game_id, possessions, shots, blocks, and_ones)
        array = np.zeros((len(teams), NB, NZ, K))
        for (team, group, z), row in sums.cells.items():
            array[t_index[team], g_index[group], z_index[z]] += row
        rows.append(array)
        league.append((sums.possessions, sums.points))
        counts.update(sums.counts)
        matched.update(keys)
        game_ids.append(game_id)
    admitted = set(game_ids)
    unjoined = Counter(
        "unjoined:game_not_admitted" if key[0] not in admitted else "unjoined:not_on_a_possession"
        for key in shots
        if key not in matched
    )
    counts.update(unjoined)
    check: dict[str, Any] = {
        "shots": len(shots),
        "games": len(game_ids),
        "joined": len(matched),
        "counts": dict(sorted(counts.items())),
    }
    if after_oreb is not None:
        flags: Counter[str] = Counter()
        for key, first in matched.items():
            if first is None:
                continue
            flag = after_oreb.get(key, -1)
            if flag not in (0, 1):
                flags["shot_table_flag_unknown"] += 1
            elif flag == int(not first):
                flags["agree"] += 1
            else:
                flags["possessions_first_chance" if first else "possessions_second_chance"] += 1
        check["first_chance_vs_shot_table_after_oreb"] = dict(sorted(flags.items()))
    return SeasonInputs(
        season,
        teams,
        np.stack(rows) if rows else np.zeros((0, len(teams), NB, NZ, K)),
        np.array(league, dtype=float).reshape(-1, 2),
        check,
    )


def load_season_inputs(season: str, params: Mapping[str, Any]) -> SeasonInputs:
    table = r05.load_season(season, params["shot_table_sha256"][season])
    positions = load_positions(params["position_estimates_sha256"])[season]
    shots, groups, zones = season_shots(table, positions)
    blocks, and_ones, unknown_ft = pbp_flags(season, params["pbp_archive_sha256"][season])
    path, _source = bundle_paths()[season]
    expected = params["possession_bundle_sha256"][season]
    if path.name.removesuffix(".json.gz") != expected:
        raise SystemExit(f"possession bundle for {season} differs from the registration")
    bundle = checked(path, expected)

    def games() -> Iterable[tuple[str, list[dict[str, Any]]]]:
        for gid, member in sorted(bundle["members"].items()):
            yield gid, checked(Path(member["path"]), member["content_sha256"])["possessions"]

    after = {
        (str(g), int(e)): int(a)
        for g, e, a in zip(table["game_id"], table["event_id"], table["after_oreb"], strict=True)
    }
    inputs = extract(season, shots, games(), blocks, and_ones, after)
    inputs.data_check.update(
        {
            "shooter_groups_all_shots": dict(sorted(groups.items())),
            "zones_all_shots": dict(sorted(zones.items())),
            "blocked_attempts_all_shots": sum(1 for k in shots if k in blocks),
            "unknown_free_throw_sub_types": unknown_ft,
        }
    )
    return inputs


POINT_SUMS = ("made_points", "second_points", "make_points", "dreb_points")


def counts_of(sums: np.ndarray) -> dict[str, int]:
    return {name: int(np.rint(sums[i])) for i, name in enumerate(sa.SUMS) if name not in POINT_SUMS}


# ---- Cells and intervals ------------------------------------------------------------------------


def aggregate(team_sums: np.ndarray) -> np.ndarray:
    """(..., teams, base groups, base zones, K) -> (..., teams + 1, positions, zones, K).

    Team "all" is first. Positions: all (every base group, unclassified included), guards,
    forwards, bigs. Zones: rim, short mid, long mid, three, all (unresolved included).
    """
    teams = np.concatenate([team_sums.sum(axis=-4, keepdims=True), team_sums], axis=-4)
    groups = np.concatenate([teams.sum(axis=-3, keepdims=True), teams[..., :3, :, :]], axis=-3)
    return np.concatenate([groups[..., :4, :], groups.sum(axis=-2, keepdims=True)], axis=-2)


def replicate_weights(games: int, year: int) -> np.ndarray:
    rng = np.random.Generator(np.random.PCG64(np.random.SeedSequence([SEED, year])))
    weights: np.ndarray = rng.multinomial(games, np.full(games, 1.0 / games), size=REPLICATES)
    return weights.astype(float)


def season_result(inputs: SeasonInputs) -> dict[str, Any]:
    games = inputs.base.shape[0]
    flat = inputs.base.reshape(games, -1)
    point = aggregate(inputs.base.sum(axis=0))
    league_point = inputs.league[:, 1].sum() / inputs.league[:, 0].sum()
    values = sa.cell_values(point, np.full(point.shape[:-1], league_point))
    worst_identity = sa.identity_residual(values)
    worst_count = sa.count_residual(point)
    weights = replicate_weights(games, int(inputs.season[:4]))
    replicate_values: dict[str, list[np.ndarray]] = {name: [] for name in sa.VALUES}
    league_reps: list[np.ndarray] = []
    for start in range(0, REPLICATES, CHUNK):
        w = weights[start : start + CHUNK]
        sums = aggregate((w @ flat).reshape((len(w), *inputs.base.shape[1:])))
        lg = (w @ inputs.league[:, 1]) / (w @ inputs.league[:, 0])
        league_reps.append(lg)
        rv = sa.cell_values(sums, np.broadcast_to(lg[:, None, None, None], sums.shape[:-1]))
        worst_identity = max(worst_identity, sa.identity_residual(rv))
        worst_count = max(worst_count, sa.count_residual(sums))
        for name in sa.VALUES:
            replicate_values[name].append(rv[name])
    if worst_identity > IDENTITY_TOLERANCE or worst_count > IDENTITY_TOLERANCE:
        raise SystemExit(f"identity check failed: {worst_identity}, {worst_count}")
    stacked = {name: np.concatenate(parts) for name, parts in replicate_values.items()}
    league_all = np.concatenate(league_reps)

    cells: list[dict[str, Any]] = []
    team_keys = ["all", *inputs.teams]
    for ti, team in enumerate(team_keys):
        for pi, position in enumerate(sa.POSITIONS):
            for zi, z in enumerate(sa.ZONES):
                s = point[ti, pi, zi]
                st = sa.status(
                    s[sa.S["attempts"]], s[sa.S["make_possessions"]], s[sa.S["dreb_possessions"]]
                )
                served: dict[str, Any] = {}
                for name in sa.VALUES:
                    v = float(values[name][ti, pi, zi])
                    reps = stacked[name][:, ti, pi, zi]
                    finite = reps[np.isfinite(reps)]
                    if not np.isfinite(v) or finite.size == 0:
                        served[name] = None
                        continue
                    lo, hi = np.percentile(finite, PERCENTILES)
                    served[name] = {
                        "value": v,
                        "low": float(lo),
                        "high": float(hi),
                        "undefined_replicates": int(REPLICATES - finite.size),
                    }
                tones: dict[str, str | None] = {}
                for name in sa.COSTS:
                    entry = served[name]
                    poss = (
                        s[sa.S["make_possessions"]] + s[sa.S["dreb_possessions"]]
                        if name == "cost"
                        else s[sa.S["dreb_possessions"]]
                    )
                    tones[name] = sa.tone(
                        st,
                        float(poss),
                        entry["low"] if entry else None,
                        entry["high"] if entry else None,
                    )
                cells.append(
                    {
                        "team": team,
                        "position": position,
                        "zone": z,
                        "status": st,
                        "counts": counts_of(s),
                        "values": served,
                        "tones": tones,
                    }
                )
    lo, hi = np.percentile(league_all, PERCENTILES)
    first_by_zone = {z: int(point[0, 0, zi, sa.S["attempts"]]) for zi, z in enumerate(sa.ZONES)}
    comparison = None
    if inputs.season == "2024-25":
        comparison = {
            z: {
                "courtlens": first_by_zone[z],
                "databallr": DATABALLR_2024_25[z],
                "difference": first_by_zone[z] - DATABALLR_2024_25[z],
            }
            for z in sa.ZONES
        }
    return {
        "data_check": inputs.data_check,
        "league": {
            "possessions": int(inputs.league[:, 0].sum()),
            "points": float(inputs.league[:, 1].sum()),
            "ppp": {"value": float(league_point), "low": float(lo), "high": float(hi)},
        },
        "first_chance_by_zone": first_by_zone,
        "databallr_comparison": comparison,
        "teams": [{"team_id": t, "code": resolve_team_tricode(t)} for t in inputs.teams],
        "checks": {"identity_residual": worst_identity, "count_residual": worst_count},
        "cells": cells,
    }


# ---- Run ----------------------------------------------------------------------------------------


def _rounded(value: Any) -> Any:
    if isinstance(value, float | np.floating):
        number = float(value)
        if not np.isfinite(number):
            raise SystemExit("non-finite value in results")
        return round(number, 9)
    if isinstance(value, dict):
        return {str(k): _rounded(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_rounded(v) for v in value]
    if isinstance(value, np.integer):
        return int(value)
    return value


def canonical(payload: Mapping[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def finish(seasons: Mapping[str, Any], receipt: Mapping[str, Any]) -> dict[str, Any]:
    body = {
        "registration": dict(receipt),
        "seasons": dict(seasons),
        "zones": list(sa.ZONES),
        "positions": list(sa.POSITIONS),
        "values": list(sa.VALUES),
    }
    rounded = dict(_rounded(body))
    rounded["results_sha256"] = hashlib.sha256(canonical(rounded)).hexdigest()
    return rounded


def _check_threads() -> None:
    for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        if os.environ.get(name) != "1":
            raise SystemExit(f"set {name}=1 (registration budget: one thread)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("run",))
    parser.add_argument("--out", type=Path, default=FROZEN)
    parser.add_argument("--log", type=Path)
    args = parser.parse_args()
    _check_threads()
    params = parameters()
    started = time.monotonic()
    seasons: dict[str, Any] = {}
    timings: dict[str, float] = {}
    for season in SEASONS:
        t0 = time.monotonic()
        seasons[season] = season_result(load_season_inputs(season, params))
        timings[season] = round(time.monotonic() - t0, 1)
        print(f"{season} done in {timings[season]} s", flush=True)
    result = finish(seasons, registration_receipt(REGISTRATION))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=1, sort_keys=True) + "\n")
    log = {
        "results_sha256": result["results_sha256"],
        "season_seconds": timings,
        "wall_seconds": round(time.monotonic() - started, 1),
        "peak_rss_mib": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
    }
    if args.log:
        args.log.write_text(json.dumps(log, indent=1) + "\n")
    print(json.dumps(log), flush=True)


if __name__ == "__main__":
    main()
