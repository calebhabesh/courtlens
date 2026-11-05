"""Input tables for the Metric Backtest (`courtlens-metric-backtest-v1`, R08).

One table per regular season: every game with a two-team box (date, teams, final margin, neutral
site, each player's box seconds) and, for every candidate metric, the player or team ratings that
were knowable before that season's games. Rating sources are read, never refitted:

- season-end fits (1Y, 3Y, box-prior RAPM, on/off) are used only for the *next* season;
- time-decay RAPM uses R01's dated snapshots (each fitted on games strictly before its cutoff);
- Projected Impact uses R07's frozen LightGBM through R07's own feature path, no refit;
- the team baseline is last season's box-score net rating, by the Teams page's formula.

`rating_for_game` picks a game's rating; the leakage tests prove that adding later games never
changes the rating used for an earlier one. Tables are content-hashed and pinned in the
registration; the runner refuses any other bytes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from collections.abc import Iterable, Mapping
from datetime import date
from pathlib import Path
from typing import Any

from courtlens.domain.team_analytics import compute_team_four_factors
from courtlens.evaluation.projected_impact_data import (
    FIT_DIRECTORIES,
    RAW,
    SERVED_FITS,
    SNAPSHOT_DIRECTORIES,
    game_rows,
    season_label,
)
from courtlens.ingestion.impact_repair_audit import retained_boxes
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.services.win_probability_pregame import _schedule

REGISTRATION = "courtlens-metric-backtest-v1"
OUTPUT = Path("data/derived/metric-backtest-v1")
CALIBRATION_FIRST = "2015-16"
TEST_SEASONS = tuple(season_label(y) for y in range(2016, 2026))
TABLE_SEASONS = (CALIBRATION_FIRST, *TEST_SEASONS)
PROSPECTIVE = "2026-27"
BASELINE = "team_net"
PLAYER_CANDIDATES = (
    "plus_minus",
    "on_off",
    "rapm_1y",
    "rapm_3y",
    "box_prior_rapm",
    "time_decay",
    "time_decay_opener",
    "projected_impact",
)
CANDIDATES = (BASELINE, *PLAYER_CANDIDATES)
# Raw on-court ratings need a sample to mean anything; shrunk ratings do not (ridge pulls small
# samples to zero). Counted possessions ("controls") on each side in the source season.
RAW_MIN_CONTROLS = 250.0
REPLACEMENT_QUANTILE = 0.2
BUBBLE_NEUTRAL_FROM = "2020-07-30"
PROJECTED_IMPACT_SEASONS = ("2023-24", "2024-25", "2025-26")
PROJECTED_IMPACT_TEST = ("2024-25", "2025-26")
PROJECTED_IMPACT_ARTIFACTS = Path("data/artifacts/projected-impact")


def previous(season: str) -> str:
    return season_label(int(season[:4]) - 1)


def end_year(season: str) -> int:
    return int(season[:4]) + 1


# ---------------------------------------------------------------------------------------------
# Rules (pure; unit-tested).


def weighted_quantile(values: Iterable[float], weights: Iterable[float], q: float) -> float:
    """Smallest value whose cumulative weight reaches q of the total (weights > 0 only)."""
    pairs = sorted((v, w) for v, w in zip(values, weights, strict=True) if w > 0)
    if not pairs:
        raise ValueError("no weighted values")
    total = sum(w for _, w in pairs)
    running = 0.0
    for value, weight in pairs:
        running += weight
        if running >= q * total - 1e-12:
            return value
    return pairs[-1][0]


def snapshot_for(game_date: str, cutoffs: Iterable[str]) -> str | None:
    """Newest snapshot cutoff on or before the game date (cutoffs are exclusive of their day)."""
    eligible = [c for c in cutoffs if c <= game_date]
    return max(eligible) if eligible else None


def neutral(game_date: str) -> bool:
    return game_date >= BUBBLE_NEUTRAL_FROM and game_date < "2020-10-15"


def pooled_on_court(entries: Iterable[Mapping[str, Any]]) -> dict[str, float]:
    """One player's on-court and on/off net per 100 across their teams in a season."""
    points = allowed = off_c = def_c = 0.0
    diff_weighted = diff_weight = 0.0
    off_off = off_def = 0.0
    for e in entries:
        on, off = e["on"], e["off"]
        points += on["points"]
        allowed += on["allowed"]
        off_c += on["off_controls"]
        def_c += on["def_controls"]
        off_off += off["off_controls"]
        off_def += off["def_controls"]
        if off["off_controls"] > 0 and off["def_controls"] > 0 and on["off_controls"] > 0:
            weight = on["off_controls"] + on["def_controls"]
            diff_weighted += weight * e["difference"]["net"]
            diff_weight += weight
    on_net = (
        100 * points / off_c - 100 * allowed / def_c if off_c > 0 and def_c > 0 else float("nan")
    )
    return {
        "on_net": on_net,
        "on_off": diff_weighted / diff_weight if diff_weight > 0 else float("nan"),
        "on_off_controls": min(off_c, def_c),
        "off_controls": min(off_off, off_def),
    }


# ---------------------------------------------------------------------------------------------
# Loading sources.


def _fit_paths() -> list[Path]:
    return [p for d in FIT_DIRECTORIES for p in sorted(d.glob("*.json"))]


def load_season_fits() -> dict[tuple[int, str], dict[str, Any]]:
    """Regular-season fits by (window length, last season). Duplicates must agree on RAPM."""
    fits: dict[tuple[int, str], tuple[str, dict[str, Any]]] = {}
    for path in _fit_paths():
        body = json.loads(path.read_bytes())
        seasons = body["input"].get("seasons", [])
        if body["input"].get("phase") != "regular_season" or not seasons:
            continue
        key = (len(seasons), seasons[-1])
        served = SERVED_FITS.get(seasons[0]) if len(seasons) == 1 else None
        if served and not path.stem.startswith(served):
            continue
        if key in fits:
            other = fits[key][1]["rapm"]["players"]
            mine = body["rapm"]["players"]
            if (
                set(other) != set(mine)
                or max(abs(other[p]["total"] - mine[p]["total"]) for p in mine) > 1e-9
            ):
                raise ValueError(f"two different fits for {key}")
            if path.stem > fits[key][0]:
                continue
        fits[key] = (path.stem, body)
    return {k: {**v[1], "_sha256": v[0]} for k, v in fits.items()}


def load_snapshots() -> dict[str, dict[str, Any]]:
    """Every dated time-decay snapshot by cutoff, checked by hash and by its leakage rule."""
    out: dict[str, dict[str, Any]] = {}
    for directory in SNAPSHOT_DIRECTORIES:
        for path in sorted(directory.glob("*.json")):
            body = json.loads(path.read_bytes())
            if body.get("kind") not in (None, "snapshot"):
                continue
            if content_hash(body) != path.stem:
                raise ValueError(f"changed snapshot {path}")
            if not body["latest_game_date"] < body["cutoff"]:
                raise ValueError(f"leaking snapshot {path}")
            if body["cutoff"] in out:
                raise ValueError(f"two snapshots for {body['cutoff']}")
            out[body["cutoff"]] = {
                "sha256": path.stem,
                "cutoff": body["cutoff"],
                "latest_game_date": body["latest_game_date"],
                "players": {
                    pid: (float(row["rapm"]), float(row["decayed_seconds"]))
                    for pid, row in body["players"].items()
                },
            }
    return out


def openers() -> dict[str, str]:
    return {season_label(y - 1): min(_schedule(y).values()) for y in range(2015, 2028)}


def day_after(day: str) -> str:
    return date.fromordinal(date.fromisoformat(day).toordinal() + 1).isoformat()


def team_net(season: str) -> tuple[dict[str, float], str]:
    """Box-score net rating per team over the season's regular-season games (Teams page formula),
    and the day after the last game read."""
    year = end_year(season)
    schedule = _schedule(year)
    _, team_rows, _ = retained_boxes(RAW, year)
    totals: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    against: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    games: dict[str, int] = defaultdict(int)
    fields = (
        "field_goals_made",
        "field_goals_attempted",
        "three_pointers_made",
        "three_pointers_attempted",
        "free_throws_made",
        "free_throws_attempted",
        "rebounds_offensive",
        "rebounds_defensive",
        "turnovers",
        "points",
    )
    last = ""
    for gid, rows in team_rows.items():
        if gid not in schedule or len(rows) != 2:
            continue
        last = max(last, schedule[gid])
        a, b = rows
        for mine, theirs in ((a, b), (b, a)):
            team = mine["team_id"]
            games[team] += 1
            for f in fields:
                totals[team][f] += float(mine[f] or 0)
                against[team][f] += float(theirs[f] or 0)
    out = {}
    for team in sorted(totals):
        net = compute_team_four_factors(totals[team], against[team], games[team])["net_rating"]
        if net is None:
            raise ValueError(f"no net rating for {team} {season}")
        out[team] = float(net)
    return out, day_after(last)


def _player_table(
    ratings: Mapping[str, float], weights: Mapping[str, float], *, weighted: bool = True
) -> dict[str, Any]:
    ids = sorted(ratings)
    replacement = weighted_quantile(
        [ratings[p] for p in ids],
        [weights[p] if weighted else 1.0 for p in ids],
        REPLACEMENT_QUANTILE,
    )
    return {
        "ratings": {p: ratings[p] for p in ids},
        "replacement": replacement,
        "rated": len(ids),
    }


def fit_tables(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Plus-minus, on/off, RAPM and box-prior RAPM tables from one season-end fit."""
    before = day_after(max(g["day"] for g in body["input"]["games"].values()))
    rapm = {p: float(r["total"]) for p, r in body["rapm"]["players"].items()}
    rapm_w = {p: float(r["seconds"]) for p, r in body["rapm"]["players"].items()}
    out = {"rapm_1y": _player_table(rapm, rapm_w)}
    if body.get("bpr"):
        bpr = {p: float(r["total"]) for p, r in body["bpr"]["players"].items()}
        bpr_w = {p: float(r["seconds"]) for p, r in body["bpr"]["players"].items()}
        out["box_prior_rapm"] = _player_table(bpr, bpr_w)
    by_player: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for key, entry in body["on_off"].items():
        by_player[key.split(":")[0]].append(entry)
    on_net, on_off, weight = {}, {}, {}
    below = 0
    for pid, entries in sorted(by_player.items()):
        pooled = pooled_on_court(entries)
        if (
            pooled["on_off_controls"] < RAW_MIN_CONTROLS
            or pooled["off_controls"] < RAW_MIN_CONTROLS
        ):
            below += 1
            continue
        on_net[pid], on_off[pid] = pooled["on_net"], pooled["on_off"]
        weight[pid] = pooled["on_off_controls"]
    out["plus_minus"] = {**_player_table(on_net, weight), "below_minimum": below}
    out["on_off"] = {**_player_table(on_off, weight), "below_minimum": below}
    return {k: {**v, "inputs_before": before} for k, v in out.items()}


def snapshot_table(snapshot: dict[str, Any]) -> dict[str, Any]:
    ratings = {p: v[0] for p, v in snapshot["players"].items()}
    weights = {p: v[1] for p, v in snapshot["players"].items()}
    return {
        **_player_table(ratings, weights),
        "sha256": snapshot["sha256"],
        "inputs_before": snapshot["cutoff"],
    }


def projected_impact_ratings() -> dict[str, dict[str, float]]:
    """R07's frozen LightGBM on 2023-24 to 2025-26, through R07's feature path; no refit."""
    from courtlens.evaluation.projected_impact_data import load_sources, population
    from courtlens.evaluation.projected_impact_models import predict_all, read_state, rows_for

    sources = load_sources()
    state, booster = read_state()
    if state["selected"] != "lightgbm":
        raise ValueError("R07's selected model changed")
    out = {}
    for season in PROJECTED_IMPACT_SEASONS:
        rows = rows_for(season, population(season, sources), sources)
        values = predict_all(rows, state, booster)["lightgbm"]
        out[season] = dict(zip(rows.players, (float(v) for v in values), strict=True))
    return out


# ---------------------------------------------------------------------------------------------
# Tables.


def games_for(season: str) -> list[dict[str, Any]]:
    games = []
    for g in game_rows(end_year(season)):
        players = sorted(
            [p.player_id, p.side, float(p.seconds)] for p in g["players"] if p.seconds > 0
        )
        games.append(
            {
                "game_id": g["game_id"],
                "date": g["date"],
                "home": g["home"],
                "away": g["away"],
                "margin": g["margin"],
                "neutral": neutral(g["date"]),
                "players": players,
            }
        )
    return games


def season_sources(
    season: str,
    fits: Mapping[tuple[int, str], dict[str, Any]],
    snapshots: Mapping[str, dict[str, Any]],
    opener: Mapping[str, str],
    projected: Mapping[str, Mapping[str, float]],
) -> dict[str, Any]:
    """Every candidate's ratings for one season's games, or a named reason it has none."""
    prior = previous(season)
    teams, before = team_net(prior)
    out: dict[str, Any] = {
        BASELINE: {"teams": teams, "source": f"box {prior}", "inputs_before": before}
    }
    one = fits.get((1, prior))
    tables = fit_tables(one) if one else {}
    for name in ("plus_minus", "on_off", "rapm_1y", "box_prior_rapm"):
        if name in tables:
            out[name] = {**tables[name], "source": f"1Y fit {prior} {one['_sha256'][:10]}"}  # type: ignore[index]
        else:
            out[name] = {"unavailable": f"no {name} fit for {prior}"}
    three = fits.get((3, prior))
    if three:
        t3 = fit_tables(three)["rapm_1y"]
        out["rapm_3y"] = {**t3, "source": f"3Y fit ending {prior} {three['_sha256'][:10]}"}
    else:
        out["rapm_3y"] = {"unavailable": f"no complete 3-season fit ending {prior}"}
    start = opener[season]
    following = opener.get(season_label(int(season[:4]) + 1), "9999-12-31")
    cutoffs = sorted(c for c in snapshots if start <= c < following)
    if start in cutoffs:
        out["time_decay"] = {"snapshots": {c: snapshot_table(snapshots[c]) for c in cutoffs}}
        out["time_decay_opener"] = {**snapshot_table(snapshots[start]), "source": start}
    else:
        reason = f"no snapshot at the {season} opener {start}"
        out["time_decay"] = out["time_decay_opener"] = {"unavailable": reason}
    if season in projected:
        values = projected[season]
        table = _player_table(values, {}, weighted=False)
        out["projected_impact"] = {
            **table,
            "source": "R07 frozen LightGBM",
            # R07's F2 check: its features read nothing dated on or after the opener.
            "inputs_before": start,
        }
    else:
        out["projected_impact"] = {
            "unavailable": "outside R07's selection and test seasons (2023-24 to 2025-26)"
        }
    return out


def build_table(season: str, sources: dict[str, Any]) -> dict[str, Any]:
    return {
        "version": REGISTRATION,
        "season": season,
        "games": games_for(season),
        "candidates": sources,
    }


def frozen_projections() -> tuple[dict[str, float], str]:
    """R07's frozen 2026-27 projections, refused unless the bytes match the manifest."""
    from courtlens.services.projected_impact import load_manifest

    manifest = load_manifest()
    digest = manifest["projections_sha256"]
    payload = (PROJECTED_IMPACT_ARTIFACTS / f"{digest}.json").read_bytes()
    if hashlib.sha256(payload).hexdigest() != digest:
        raise ValueError("the frozen projections do not match their recorded hash")
    body = json.loads(payload)
    return {r["player_id"]: float(r["projection"]) for r in body["players"]}, digest


def prospective_sources() -> dict[str, Any]:
    """2026-27 sources fixed at the freeze. Dated time-decay snapshots are read per game, live."""
    fits = load_season_fits()
    snapshots = load_snapshots()
    opener = openers()
    values, digest = frozen_projections()
    sources = season_sources(PROSPECTIVE, fits, snapshots, opener, {PROSPECTIVE: values})
    sources["time_decay"] = {"live_snapshots": True, "opener": opener[PROSPECTIVE]}
    sources["projected_impact"]["source"] = f"R07 frozen 2026-27 projections {digest}"
    return {"version": REGISTRATION, "season": PROSPECTIVE, "candidates": sources}


def write_table(output: Path, body: dict[str, Any]) -> str:
    digest = content_hash(body)
    path = output / "tables" / f"{digest}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps(body, sort_keys=True, separators=(",", ":")))
    return digest


def read_table(output: Path, digest: str) -> dict[str, Any]:
    body: dict[str, Any] = json.loads((output / "tables" / f"{digest}.json").read_bytes())
    if content_hash(body) != digest:
        raise ValueError(f"table {digest} changed")
    return body


def build_all(output: Path = OUTPUT, seasons: Iterable[str] = TABLE_SEASONS) -> dict[str, str]:
    """Every season's table plus the 2026-27 source table (key `prospective`)."""
    fits = load_season_fits()
    snapshots = load_snapshots()
    opener = openers()
    projected = projected_impact_ratings()
    hashes = {}
    for season in seasons:
        body = build_table(season, season_sources(season, fits, snapshots, opener, projected))
        hashes[season] = write_table(output, body)
        print("table", season, hashes[season], len(body["games"]), flush=True)
    hashes["prospective"] = write_table(output, prospective_sources())
    return hashes


# ---------------------------------------------------------------------------------------------
# Rating per game (used by the runner and the prospective scorer).


def player_table_for(candidate: dict[str, Any], game_date: str) -> dict[str, Any] | None:
    """The table a game reads: a dated snapshot for time decay, the season table otherwise."""
    if "unavailable" in candidate:
        return None
    if "snapshots" in candidate:
        cutoff = snapshot_for(game_date, candidate["snapshots"])
        return None if cutoff is None else candidate["snapshots"][cutoff]
    return candidate


def strength(game: Mapping[str, Any], name: str, candidate: dict[str, Any]) -> dict[str, float]:
    """Home minus away strength per 100, its replaced seconds and total seconds.

    Team baseline: home minus away net rating. Players: home minus away of
    (seconds / 2,880) x rating, so a full 48-minute five sums five ratings; a player with no
    rating takes the table's replacement value and is counted.
    """
    if name == BASELINE:
        teams = candidate["teams"]
        if game["home"] not in teams or game["away"] not in teams:
            raise ValueError(f"team without a prior net rating in {game['game_id']}")
        return {
            "d": teams[game["home"]] - teams[game["away"]],
            "replaced": 0.0,
            "total": 0.0,
        }
    table = player_table_for(candidate, game["date"])
    if table is None:
        raise ValueError(f"{name} has no table for {game['game_id']}")
    ratings, fallback = table["ratings"], table["replacement"]
    d = replaced = total = 0.0
    for pid, side, seconds in game["players"]:
        rating = ratings.get(pid)
        if rating is None:
            rating = fallback
            replaced += seconds
        share = seconds / 2880.0
        d += share * rating if side == "home" else -share * rating
        total += seconds
    return {"d": d, "replaced": replaced, "total": total}


def leakage_audit(table: Mapping[str, Any]) -> dict[str, Any]:
    """Every game reads only sources whose inputs all precede it: `inputs_before` <= game date."""
    checked = 0
    for name, candidate in table["candidates"].items():
        if "unavailable" in candidate:
            continue
        for game in table["games"]:
            source = candidate if name == BASELINE else player_table_for(candidate, game["date"])
            if source is None or not source["inputs_before"] <= game["date"]:
                raise ValueError(f"{name} reads on or after {game['game_id']} ({game['date']})")
            checked += 1
    return {"game_ratings_checked": checked, "violations": 0}


# ---------------------------------------------------------------------------------------------
# Data check: counts only, no margins read.


def coverage(output: Path, hashes: Mapping[str, str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    admitted = {k[1]: len(v["input"]["games"]) for k, v in load_season_fits().items() if k[0] == 1}
    for season, digest in hashes.items():
        if season == "prospective":
            continue
        body = read_table(output, digest)
        games = body["games"]
        row: dict[str, Any] = {
            "box_games": len(games),
            "r01_admitted_games": admitted.get(season),
            "neutral_games": sum(g["neutral"] for g in games),
            "leakage": leakage_audit(body),
            "candidates": {},
        }
        for name, candidate in body["candidates"].items():
            if "unavailable" in candidate:
                row["candidates"][name] = {"available": False, "reason": candidate["unavailable"]}
                continue
            if name == BASELINE:
                row["candidates"][name] = {"available": True, "teams": len(candidate["teams"])}
                continue
            replaced = total = 0.0
            replaced_rows = rows = 0
            for game in games:
                s = strength(game, name, candidate)
                replaced += s["replaced"]
                total += s["total"]
            for game in games:
                table = player_table_for(candidate, game["date"])
                assert table is not None
                for pid, _, _ in game["players"]:
                    rows += 1
                    replaced_rows += pid not in table["ratings"]
            info: dict[str, Any] = {
                "available": True,
                "replaced_minutes_share": replaced / total,
                "replaced_player_games": replaced_rows,
                "player_games": rows,
            }
            if "snapshots" in candidate:
                info["snapshots"] = len(candidate["snapshots"])
                info["replacement"] = {
                    c: t["replacement"] for c, t in candidate["snapshots"].items()
                }
            else:
                info["replacement"] = candidate["replacement"]
                info["rated"] = candidate["rated"]
                if "below_minimum" in candidate:
                    info["below_minimum"] = candidate["below_minimum"]
            row["candidates"][name] = info
        out[season] = row
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "coverage"))
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--hashes", type=Path)
    args = parser.parse_args()
    if args.command == "build":
        print(json.dumps(build_all(args.output), indent=1))
    else:
        hashes = json.loads(args.hashes.read_text())
        print(json.dumps(coverage(args.output, hashes), indent=1, sort_keys=True))


if __name__ == "__main__":
    main()
