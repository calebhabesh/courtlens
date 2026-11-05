"""Run courtlens-signal-noise-v1 (Research R03) and write its frozen results.

Reads the published Stats game logs (regular season) and the pinned NBA ShotChartDetail
archives, then computes split-half stabilization points, beta-binomial priors, the shrinkage
validation and per-player rim totals. Everything follows the registration; nothing is tuned.
Run under a kernel-capped unit with one BLAS thread, e.g.

    systemd-run --user --wait --collect -p MemoryMax=3G -p MemorySwapMax=0 \
      -E OMP_NUM_THREADS=1 -E OPENBLAS_NUM_THREADS=1 -E MKL_NUM_THREADS=1 \
      --working-directory=<checkout with data/> \
      .venv/bin/python -m courtlens.evaluation.signal_noise_runner --output <path>
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import lzma
import os
import resource
import tarfile
import time
from collections import defaultdict
from collections.abc import Iterator, Mapping
from pathlib import Path
from typing import Any

import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session

from courtlens.database import SessionLocal
from courtlens.domain import signal_noise as sn
from courtlens.domain.research_registry import registration_receipt
from courtlens.services.workbench_analytics import resolve_workbench_context

STABILIZATION_SEASONS = tuple(f"{y}-{(y + 1) % 100:02d}" for y in range(2014, 2026))
VALIDATION_TARGETS = tuple(f"{y}-{(y + 1) % 100:02d}" for y in range(2015, 2025))
PRIOR_TARGET_LAST = "2026-27"
LAST_COMPLETE = "2025-26"
ATTEMPT_BANDS = (50.0, 200.0)
ARCHIVE_ROOT = Path("data/raw/impact-archive")
SHOT_REVISION = "e829d4678be1e075f99e5d41a1c5f97089be446b"
# Retained ShotChartDetail archives (regular season), SHA-256 as recorded by the R01/IM01 receipts.
SHOT_ARCHIVES = {
    "2014-15": "e2bf753050854e1eb99f6d5c5d690cdcfed4adae216726d330ef6adb3cd21513",
    "2015-16": "ac48fad67cabf79f8a5a726aa55ea4a8c793a85eaa3835d38b46f2d0e37495a3",
    "2016-17": "0681285a0bf08a1ef84b24895d2a4bb709f2d192ba9134e3600567c593dacd96",
    "2017-18": "a62d25aa9c9190477f350f06a9a2d808c7908a6720786970319a3b28af184e81",
    "2018-19": "c658890976559b69dff44ed08352baf64b935514506e726d21f34950ad5bfe9d",
    "2019-20": "0c6002cbc8bc379ecc0a2e0f57defb2e9804be8240aa0234242002ec5dd124fe",
    "2020-21": "02916ac0a4a0c8dcb1e115ed08ddb49b360305f98f4882c8933a2998b747487d",
    "2021-22": "5b56b6833d179fdef9c76223064c7923717b1add83570becf494a3f1d0a785f2",
    "2022-23": "62533f4e444ef0fc3354cdf6bbc04e249eb14ba9f444e6cd247c3e95d235e46d",
    "2023-24": "303e71f967c199568b345cd73a75e595f1f99532cca3e6ce59afb286b63f840d",
    "2024-25": "950100f9c84fe750ae2ac8eaeb82d24cdfb9f60a9ed04ceaa66f64789d7c216e",
    "2025-26": "dcb6c29edda8463132ab62f63118b5cee80d751bcbee9ad98fa38ebe12e6d33c",
}
MAX_SHOT_BYTES = 512 * 1024 * 1024
NOT_COVERED = [
    {
        "family": "Impact (RAPM, six factors, on/off, rTS%, impact extras)",
        "reason": "Fitted or counted from stints over whole seasons; no per-game value to split.",
    },
    {"family": "DARKO DPM", "reason": "An external model output, one value per player-season."},
    {
        "family": "Tracking (on-ball %, points created)",
        "reason": "NBA tracking season totals without dates; cannot be split by game.",
    },
    {
        "family": "Basketball-Reference advanced (PER, WS, BPM, VORP)",
        "reason": "Season values from an external source; cannot be split by game.",
    },
    {
        "family": "Play types, hustle and defense feeds",
        "reason": "Season totals from the stats feeds; cannot be split by game.",
    },
    {
        "family": "Per-game averages (PPG, RPG …)",
        "reason": "Driven by minutes as much as by rate; the per-36 rates are covered instead.",
    },
    {
        "family": "Seasons before 1983-84",
        "reason": "Served as season totals only, so they can be neither split nor read by a prior.",
    },
]


def season_label(start: int) -> str:
    return f"{start}-{(start + 1) % 100:02d}"


def _check_threads() -> None:
    for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        if os.environ.get(name) != "1":
            raise SystemExit(f"{name}=1 is required (registered budget: one thread)")


# ---- Inputs -------------------------------------------------------------------------------------


def load_game_logs(session: Session, dataset_id: str) -> dict[str, Any]:
    fields = ", ".join(
        f"(g.stats_json->>'{source}')::double precision AS {key}"
        for key, source in sn.FIELDS.items()
    )
    rows = session.execute(
        text(
            f"""SELECT g.season, g.player_id, g.game_id, g.game_date, g.minutes_seconds, {fields}
            FROM workbench_player_games g
            WHERE g.dataset_id = :dataset AND g.phase = 'regular_season'
                AND g.appearance = 'appeared' AND g.minutes_seconds > 0
                AND g.season <= :last
            ORDER BY g.season, g.player_id, g.game_date, g.game_id"""
        ),
        {"dataset": dataset_id, "last": LAST_COMPLETE},
    ).all()
    season = np.array([row[0] for row in rows])
    player = np.array([row[1] for row in rows])
    game = np.array([row[2] for row in rows])
    date = np.array([row[3].isoformat() for row in rows])
    columns: dict[str, np.ndarray] = {"minutes": np.array([row[4] / 60.0 for row in rows])}
    for index, key in enumerate(sn.FIELDS, start=5):
        columns[key] = np.array(
            [np.nan if row[index] is None else float(row[index]) for row in rows]
        )
    hashes: dict[str, str] = {}
    for label in sorted(set(season.tolist())):
        digest = hashlib.sha256()
        for i in np.flatnonzero(season == label):
            values = ",".join(
                "" if np.isnan(columns[k][i]) else repr(float(columns[k][i]))
                for k in ("minutes", *sn.FIELDS)
            )
            digest.update(f"{player[i]}|{game[i]}|{date[i]}|{values}\n".encode())
        hashes[label] = digest.hexdigest()
    return {
        "season": season,
        "player": player,
        "game": game,
        "date": date,
        "columns": columns,
        "hashes": hashes,
    }


def _archive_rows(path: Path, expected_sha: str) -> Iterator[dict[str, str]]:
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError(f"retained shot detail bytes changed: {path}")
    with (
        lzma.LZMAFile(io.BytesIO(raw)) as expanded,
        tarfile.open(fileobj=expanded, mode="r|") as tar,
    ):
        for members, member in enumerate(tar, start=1):
            if members != 1 or not member.isfile() or not 0 < member.size < MAX_SHOT_BYTES:
                raise ValueError("expected exactly one shot detail CSV")
            extracted = tar.extractfile(member)
            if extracted is None:
                raise ValueError("unreadable shot detail member")
            body = extracted.read().decode("utf-8-sig")
            yield from csv.DictReader(io.StringIO(body), strict=True)


def load_rim(root: Path) -> dict[str, Any]:
    """Per (season, game, player): rim makes, rim attempts and all field-goal attempts."""
    per_game: dict[tuple[str, str, str], list[int]] = {}
    covered: dict[str, set[str]] = defaultdict(set)
    rows_read: dict[str, int] = {}
    for season, sha in SHOT_ARCHIVES.items():
        path = root / "objects" / sha[:2] / sha
        count = 0
        for row in _archive_rows(path, sha):
            if row["SHOT_ATTEMPTED_FLAG"] != "1":
                continue
            count += 1
            game = row["GAME_ID"].zfill(10)
            covered[season].add(game)
            key = (season, game, row["PLAYER_ID"])
            entry = per_game.setdefault(key, [0, 0, 0])
            entry[2] += 1
            if row["SHOT_ZONE_BASIC"] == "Restricted Area":
                entry[1] += 1
                entry[0] += int(row["SHOT_MADE_FLAG"] == "1")
        rows_read[season] = count
    return {"per_game": per_game, "covered": covered, "rows": rows_read}


def attach_rim(logs: dict[str, Any], rim: dict[str, Any]) -> dict[str, Any]:
    n = len(logs["season"])
    rim_fgm = np.full(n, np.nan)
    rim_fga = np.full(n, np.nan)
    coverage: dict[str, dict[str, int]] = {}
    for season in SHOT_ARCHIVES:
        idx = np.flatnonzero(logs["season"] == season)
        covered = rim["covered"][season]
        games_logged = set(logs["game"][idx].tolist())
        mismatched = 0
        absolute_gap = 0
        for i in idx:
            game = str(logs["game"][i])
            if game not in covered:
                continue
            made, attempted, fga = rim["per_game"].get(
                (season, game, str(logs["player"][i])), (0, 0, 0)
            )
            rim_fgm[i], rim_fga[i] = made, attempted
            box = logs["columns"]["fga"][i]
            if not np.isnan(box) and int(box) != fga:
                mismatched += 1
                absolute_gap += abs(int(box) - fga)
        coverage[season] = {
            "games_in_logs": len(games_logged),
            "games_with_shot_detail": len(games_logged & covered),
            "shot_rows": rim["rows"][season],
            "player_games": len(idx),
            "player_games_fga_mismatch": mismatched,
            "fga_absolute_gap": absolute_gap,
        }
    logs["columns"]["rim_fgm"] = rim_fgm
    logs["columns"]["rim_fga"] = rim_fga
    return coverage


# ---- Season totals ------------------------------------------------------------------------------


def season_totals(logs: Mapping[str, Any]) -> dict[str, dict[str, dict[str, float]]]:
    """Per season and player: makes and attempts of each binomial component over valid games."""
    c = logs["columns"]
    parts = {
        "fg3m": ("fg3m", ("fg3m", "fg3a")),
        "fg3a": ("fg3a", ("fg3m", "fg3a")),
        "ftm": ("ftm", ("ftm", "fta")),
        "fta": ("fta", ("ftm", "fta")),
        "fg2m": (None, ("fgm", "fga", "fg3m", "fg3a")),
        "fg2a": (None, ("fgm", "fga", "fg3m", "fg3a")),
        "rim_fgm": ("rim_fgm", ("rim_fgm", "rim_fga")),
        "rim_fga": ("rim_fga", ("rim_fgm", "rim_fga")),
        "pts": ("pts", ("pts", "fga", "fta")),
        "fga": ("fga", ("pts", "fga", "fta")),
        "fta_ts": ("fta", ("pts", "fga", "fta")),
    }
    values: dict[str, np.ndarray] = {}
    for name, (column, requires) in parts.items():
        valid = np.ones(len(c["minutes"]), dtype=bool)
        for field in requires:
            valid &= ~np.isnan(c[field])
        if name == "fg2m":
            raw = c["fgm"] - c["fg3m"]
        elif name == "fg2a":
            raw = c["fga"] - c["fg3a"]
        else:
            assert column is not None
            raw = c[column]
        values[name] = np.where(valid, raw, 0.0)
        values[f"{name}__valid"] = valid.astype(np.float64)
    out: dict[str, dict[str, dict[str, float]]] = defaultdict(dict)
    keys = np.char.add(np.char.add(logs["season"].astype(str), "|"), logs["player"].astype(str))
    unique, inverse = np.unique(keys, return_inverse=True)
    sums = {name: np.bincount(inverse, weights=array) for name, array in values.items()}
    for index, key in enumerate(unique.tolist()):
        season, player = key.split("|", 1)
        out[season][player] = {name: float(array[index]) for name, array in sums.items()}
    return dict(out)


def _seasons_with(
    totals: Mapping[str, Mapping[str, Mapping[str, float]]], attempts: str
) -> list[str]:
    return sorted(
        season
        for season, players in totals.items()
        if any(row.get(f"{attempts}__valid", 0) > 0 for row in players.values())
    )


def fit_priors(
    totals: Mapping[str, Mapping[str, Mapping[str, float]]],
) -> dict[str, dict[str, Any]]:
    """Beta-binomial priors per stat and target season, from up to three earlier seasons."""
    priors: dict[str, dict[str, Any]] = {}
    last = int(PRIOR_TARGET_LAST[:4])
    for stat, (made, attempts) in sn.BINOMIAL.items():
        available = _seasons_with(totals, attempts)
        priors[stat] = {}
        first = int(available[0][:4]) + 1
        for year in range(first, last + 1):
            target = season_label(year)
            window = sn.prior_window(target, available)
            if not window:
                continue
            makes = np.array(
                [row[made] for s in window for row in totals[s].values() if row[attempts] >= 1]
            )
            tries = np.array(
                [row[attempts] for s in window for row in totals[s].values() if row[attempts] >= 1]
            )
            fit = sn.fit_beta_binomial(makes, tries)
            priors[stat][target] = {**fit, "seasons": window}
    return priors


# ---- Stabilization ------------------------------------------------------------------------------


def stabilization(logs: Mapping[str, Any]) -> dict[str, Any]:
    in_scope = np.isin(logs["season"], STABILIZATION_SEASONS)
    idx_all = np.flatnonzero(in_scope)
    seasons = logs["season"][idx_all]
    players = logs["player"][idx_all]
    columns = {k: v[idx_all] for k, v in logs["columns"].items()}
    numerator, sample, valid = sn.stat_arrays(columns)
    keys = np.char.add(np.char.add(seasons.astype(str), "|"), players.astype(str))
    # Rows are ordered by (season, player_id, date, game), so player-seasons are contiguous.
    boundaries = np.flatnonzero(np.r_[True, keys[1:] != keys[:-1], True])
    groups = [(boundaries[i], boundaries[i + 1]) for i in range(len(boundaries) - 1)]
    groups = [(s, e) for s, e in groups if e - s >= sn.MIN_VALID_GAMES]
    rng = np.random.default_rng(sn.SEED)
    count, n_stats = len(groups), len(sn.STATS)
    half_num = np.zeros((count, sn.SPLITS, n_stats), dtype=np.float32)
    half_den = np.zeros((count, sn.SPLITS, n_stats), dtype=np.float32)
    total_num = np.zeros((count, n_stats))
    total_den = np.zeros((count, n_stats))
    valid_games = np.zeros((count, n_stats))
    owner = []
    for g, (start, end) in enumerate(groups):
        mask = sn.split_masks(rng, end - start)
        half_num[g] = mask @ numerator[start:end]
        half_den[g] = mask @ sample[start:end]
        total_num[g] = numerator[start:end].sum(axis=0)
        total_den[g] = sample[start:end].sum(axis=0)
        valid_games[g] = valid[start:end].sum(axis=0)
        owner.append(str(players[start]))

    # Player-cluster bootstrap weights shared by every stat: column 0 is the point estimate.
    unique_players, player_index = np.unique(np.array(owner), return_inverse=True)
    boot = np.random.default_rng(sn.SEED)
    weights = np.ones((count, sn.BOOTSTRAP + 1))
    for rep in range(sn.BOOTSTRAP):
        draws = boot.integers(0, len(unique_players), len(unique_players))
        counts = np.bincount(draws, minlength=len(unique_players)).astype(np.float64)
        weights[:, rep + 1] = counts[player_index]

    results = []
    for s, stat in enumerate(sn.STATS):
        minimum = sn.MIN_MINUTES if stat.family == "per_36" else sn.MIN_PCT_SAMPLE
        eligible = np.flatnonzero(
            (valid_games[:, s] >= sn.MIN_VALID_GAMES) & (total_den[:, s] >= minimum)
        )
        results.append(
            _stat_result(
                stat,
                eligible,
                half_num[:, :, s],
                half_den[:, :, s],
                total_num[:, s],
                total_den[:, s],
                weights,
            )
        )
    return {"player_seasons_split": count, "players": len(unique_players), "stats": results}


def _interval(values: np.ndarray) -> dict[str, float | None]:
    finite = values[np.isfinite(values)]
    if len(finite) == 0:
        return {"low": None, "high": None}
    return {"low": float(np.percentile(finite, 2.5)), "high": float(np.percentile(finite, 97.5))}


def _stat_result(
    stat: sn.StatDef,
    eligible: np.ndarray,
    half_num: np.ndarray,
    half_den: np.ndarray,
    total_num: np.ndarray,
    total_den: np.ndarray,
    weights: np.ndarray,
) -> dict[str, Any]:
    base: dict[str, Any] = {
        "key": stat.key,
        "label": stat.label,
        "family": stat.family,
        "unit": stat.unit,
        "eligible_player_seasons": len(eligible),
    }
    if len(eligible) < sn.BINS * sn.MIN_PLAYERS_PER_BIN:
        return {**base, "status": "too_few_players", "bins": [], "levels": {}}
    samples = total_den[eligible]
    edges = sn.bin_edges(samples)
    assigned = sn.assign_bins(samples, edges)
    bounds = [float(samples.min()), *edges.tolist(), float(samples.max())]
    bins = []
    r_rows, h_rows, w_rows = [], [], []
    for b in range(sn.BINS):
        rows = eligible[assigned == b]
        terms = sn.split_half_sums(
            half_num[rows].astype(np.float64),
            half_den[rows].astype(np.float64),
            total_num[rows],
            total_den[rows],
            weights[rows],
        )
        r = sn.correlations(terms)  # splits x (1 + reps)
        r_mean = sn.fisher_mean(r, axis=0)
        n_sum = terms["n"].sum(axis=0)
        h = np.where(n_sum > 0, terms["h"].sum(axis=0) / np.where(n_sum > 0, n_sum, 1), np.nan)
        counted = terms["n"].mean(axis=0)
        reported = bool(counted[0] >= sn.MIN_PLAYERS_PER_BIN)
        rho = sn.spearman_brown_full(r_mean)
        bins.append(
            {
                "bin": b + 1,
                "sample_low": bounds[b],
                "sample_high": bounds[b + 1],
                "player_seasons": len(rows),
                "players_per_split": float(counted[0]),
                "reported": reported,
                "half_sample": float(h[0]),
                "n": float(2 * h[0]),
                "r": float(r_mean[0]),
                "r_split_sd": float(np.nanstd(r[:, 0])),
                "rho": float(rho[0]),
                "rho_interval": _interval(rho[1:]),
            }
        )
        if reported:
            r_rows.append(r_mean)
            h_rows.append(h)
            w_rows.append(counted)
    if not r_rows:
        return {**base, "status": "too_few_players", "bins": bins, "levels": {}}
    r_all, h_all, w_all = np.array(r_rows), np.array(h_rows), np.array(w_rows)
    fits = [sn.fit_m(r_all[:, j], h_all[:, j], w_all[:, j]) for j in range(r_all.shape[1])]
    m_values = np.array([m for m, _ in fits])
    m_point, on_bound = fits[0]
    shown = [entry for entry in bins if entry["reported"]]
    levels = {}
    for level in sn.LEVELS:
        status = sn.level_status(
            level,
            m_point,
            on_bound,
            [entry["rho"] for entry in shown],
            [entry["n"] for entry in shown],
            [entry["r"] for entry in shown],
        )
        largest = max(shown, key=lambda entry: entry["n"])
        levels[f"{level:.1f}"] = {
            **status,
            "largest_rho": largest["rho"],
            "interval": _interval(m_values[1:] * level / (1 - level)),
        }
    return {
        **base,
        "status": "measured",
        "median_sample": float(np.median(samples)),
        "m": {"value": m_point, **_interval(m_values[1:]), "on_bound": on_bound},
        "levels": levels,
        "bins": bins,
    }


# ---- Shrinkage validation -----------------------------------------------------------------------


def _component_values(
    row: Mapping[str, float], prior: Mapping[str, Mapping[str, Any]], stat: str
) -> tuple[float, float, float, float] | None:
    """(raw, prior mean, shrunk, attempts) for one player-season, or None when no attempts."""
    if stat == "ts_pct":
        fg2a, fg3a, fta = row["fg2a"], row["fg3a"], row["fta"]
        tsa = row["fga"] + sn.FTA_WEIGHT * row["fta_ts"]
        if tsa <= 0 or fg2a + fg3a + sn.FTA_WEIGHT * fta <= 0:
            return None
        raw = row["pts"] / (2 * tsa)
        means = {k: prior[k]["mean"] for k in ("fg2_pct", "fg3_pct", "ft_pct")}
        shrunk = {
            k: sn.shrunk_rate(row[m], row[a], prior[k]["alpha"], prior[k]["beta"])
            for k, (m, a) in (
                ("fg2_pct", ("fg2m", "fg2a")),
                ("fg3_pct", ("fg3m", "fg3a")),
                ("ft_pct", ("ftm", "fta")),
            )
        }
        prior_mean = sn.composed_ts(
            fg2a, fg3a, fta, means["fg2_pct"], means["fg3_pct"], means["ft_pct"]
        )
        shrunk_ts = sn.composed_ts(
            fg2a, fg3a, fta, shrunk["fg2_pct"], shrunk["fg3_pct"], shrunk["ft_pct"]
        )
        if prior_mean is None or shrunk_ts is None:
            return None
        return raw, prior_mean, shrunk_ts, tsa
    made, attempts = sn.BINOMIAL[stat]
    if row[attempts] < 1:
        return None
    p = prior[stat]
    value = sn.shrunk_rate(row[made], row[attempts], p["alpha"], p["beta"])
    assert value is not None
    return row[made] / row[attempts], p["mean"], value, row[attempts]


def validation(
    totals: Mapping[str, Mapping[str, Mapping[str, float]]], priors: Mapping[str, Mapping[str, Any]]
) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for stat in ("fg3_pct", "ft_pct", "fg2_pct", "ts_pct", "rim_fg_pct"):
        needed = ("fg2_pct", "fg3_pct", "ft_pct") if stat == "ts_pct" else (stat,)
        records = []  # player, raw_t, prior_t, shrunk_t, attempts_t, raw_next, attempts_next
        for target in VALIDATION_TARGETS:
            following = season_label(int(target[:4]) + 1)
            if any(target not in priors[k] for k in needed):
                continue
            if target not in totals or following not in totals:
                continue
            prior = {k: priors[k][target] for k in needed}
            for player, row in totals[target].items():
                after = totals[following].get(player)
                if after is None:
                    continue
                now = _component_values(row, prior, stat)
                if stat == "ts_pct":
                    tsa_next = after["fga"] + sn.FTA_WEIGHT * after["fta_ts"]
                    later = (after["pts"] / (2 * tsa_next), tsa_next) if tsa_next > 0 else None
                else:
                    made, attempts = sn.BINOMIAL[stat]
                    later = (
                        (after[made] / after[attempts], after[attempts])
                        if after[attempts] >= 1
                        else None
                    )
                if now is None or later is None:
                    continue
                records.append((player, *now, *later))
        out[stat] = _validation_summary(records)
    return out


def _validation_summary(records: list[tuple[Any, ...]]) -> dict[str, Any]:
    if not records:
        return {"pairs": 0}
    players = np.array([r[0] for r in records])
    raw, prior, shrunk, attempts, target, weight = (
        np.array([r[i] for r in records], dtype=np.float64) for i in range(1, 7)
    )
    unique, index = np.unique(players, return_inverse=True)
    rng = np.random.default_rng(sn.SEED)
    boot = np.zeros((len(records), sn.BOOTSTRAP))
    for rep in range(sn.BOOTSTRAP):
        counts = np.bincount(rng.integers(0, len(unique), len(unique)), minlength=len(unique))
        boot[:, rep] = counts[index]

    def summary(mask: np.ndarray) -> dict[str, Any]:
        if not mask.any():
            return {"pairs": 0}
        w = weight * mask
        errors = {
            name: (pred - target) ** 2
            for name, pred in (("raw", raw), ("prior", prior), ("shrunk", shrunk))
        }
        point = {name: float((w * e).sum() / w.sum()) for name, e in errors.items()}
        wb = w[:, None] * boot
        reps = {name: (wb * e[:, None]).sum(0) / wb.sum(0) for name, e in errors.items()}
        return {
            "pairs": int(mask.sum()),
            "players": len(np.unique(players[mask])),
            "mse": point,
            "raw_minus_shrunk": {
                "value": point["raw"] - point["shrunk"],
                **_interval(reps["raw"] - reps["shrunk"]),
            },
            "prior_minus_shrunk": {
                "value": point["prior"] - point["shrunk"],
                **_interval(reps["prior"] - reps["shrunk"]),
            },
        }

    low, high = ATTEMPT_BANDS
    return {
        "pooled": summary(np.ones(len(records), dtype=bool)),
        "bands": [
            {"band": f"under {low:.0f}", **summary(attempts < low)},
            {"band": f"{low:.0f}-{high - 1:.0f}", **summary((attempts >= low) & (attempts < high))},
            {"band": f"{high:.0f} or more", **summary(attempts >= high)},
        ],
    }


# ---- Output -------------------------------------------------------------------------------------


def _rounded(value: Any) -> Any:
    if isinstance(value, float):
        if not np.isfinite(value):
            return None
        return float(f"{value:.6g}") if abs(value) >= 1e6 else round(value, 6)
    if isinstance(value, dict):
        return {str(k): _rounded(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_rounded(v) for v in value]
    if isinstance(value, np.generic):
        return _rounded(value.item())
    return value


def canonical(payload: Mapping[str, Any]) -> bytes:
    return (json.dumps(payload, sort_keys=True, indent=1, allow_nan=False) + "\n").encode()


def build(session: Session, archive_root: Path) -> dict[str, Any]:
    receipt = registration_receipt(sn.REGISTRATION)
    context = resolve_workbench_context(session)
    logs = load_game_logs(session, context.dataset_id)
    rim_coverage = attach_rim(logs, load_rim(archive_root))
    totals = season_totals(logs)
    priors = fit_priors(totals)
    identity_failures = sum(
        1
        for players in totals.values()
        for row in players.values()
        if row["pts__valid"] > 0
        and row["fg2m__valid"] == row["pts__valid"]
        and row["ftm__valid"] == row["pts__valid"]
        and abs(row["pts"] - (2 * row["fg2m"] + 3 * row["fg3m"] + row["ftm"])) > 1e-9
    )
    rim_totals = {
        season: {
            player: [int(row["rim_fgm"]), int(row["rim_fga"])]
            for player, row in sorted(totals[season].items())
            if row["rim_fga__valid"] > 0
        }
        for season in SHOT_ARCHIVES
    }
    seasons_logged = sorted(totals)
    payload = {
        "registration": receipt,
        "inputs": {
            "release_id": str(context.release_id),
            "dataset_id": context.dataset_id,
            "game_log_seasons": [seasons_logged[0], seasons_logged[-1]],
            "game_log_sha256": logs["hashes"],
            "shot_detail": {
                "source": f"shufinskiy/nba_data@{SHOT_REVISION} (NBA ShotChartDetail)",
                "sha256": SHOT_ARCHIVES,
            },
        },
        "coverage": {
            "game_logs": {
                season: {
                    "player_games": int((logs["season"] == season).sum()),
                    "players": len(totals[season]),
                }
                for season in seasons_logged
            },
            "rim": rim_coverage,
            "ts_identity_failures": identity_failures,
        },
        "stabilization": stabilization(logs),
        "priors": priors,
        "validation": validation(totals, priors),
        "rim_totals": rim_totals,
        "not_covered": NOT_COVERED,
        "stabilization_seasons": list(STABILIZATION_SEASONS),
    }
    rounded: dict[str, Any] = _rounded(payload)
    rounded["results_sha256"] = hashlib.sha256(canonical(rounded)).hexdigest()
    return rounded


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--run-log", type=Path)
    parser.add_argument("--archive-root", type=Path, default=ARCHIVE_ROOT)
    args = parser.parse_args()
    _check_threads()
    started = time.monotonic()
    with SessionLocal() as session:
        result = build(session, args.archive_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(canonical(result))
    run = {
        "results_sha256": result["results_sha256"],
        "wall_seconds": round(time.monotonic() - started, 1),
        "peak_rss_mib": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
    }
    if args.run_log:
        args.run_log.write_text(json.dumps(run, indent=1) + "\n")
    print(json.dumps(run))


if __name__ == "__main__":
    main()
