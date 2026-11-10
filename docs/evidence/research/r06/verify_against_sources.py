"""Recompute R06 served numbers from source tables and archives, not the runners' code.

Run from a directory with data/ and evaluation/ (PYTHONPATH=<checkout>/src).
Writes source-check.json.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from courtlens.evaluation import defensive_shot_quality_data as bdata
from courtlens.evaluation import expected_shot_v2_data as shots

A = json.loads(Path("evaluation/research/frozen/courtlens-shot-decomposition-v1.json").read_text())
FROZEN = Path("evaluation/research/frozen")
B = json.loads((FROZEN / "courtlens-defensive-shot-quality-v1.json").read_text())
R03 = json.loads((FROZEN / "courtlens-signal-noise-v1.json").read_text())["priors"]
out: dict[str, object] = {"worst": {}}


def worst(name: str, got: float, want: float) -> None:
    out["worst"][name] = max(out["worst"].get(name, 0.0), abs(got - want))  # type: ignore[union-attr, attr-defined]


# Part A: league values from the pinned attempt tables, by plain sums over the rows.
for season, block in A["seasons"].items():
    pin = A["registration"]["parameters"]["table_sha256"][season]
    tables = Path("data/derived/shot-decomposition-v1/tables")
    t = np.load(next(tables.glob(f"{season}.{pin[:16]}.npz")))
    fga = t["kind"] == "fga"
    avg = t["actual"][fga].mean()
    shift = avg - t["expected_points"][fga].mean()
    size = np.where(t["kind"] == "two_shot", 2, np.where(t["kind"] == "three_shot", 3, 0))
    shots_total = fga.sum() + (1 / size[size > 0]).sum()
    ft = t["ft_probability"][~fga].sum() - (avg / size[size > 0]).sum()
    worst("a_avg_points", avg, block["avg_points"])
    worst("a_shift", shift, block["expected_shift"])
    worst("a_shots", shots_total, block["shots"])
    worst("a_league_ft", 100 * ft / shots_total, block["league_per_100_shots"]["ft"])
    sq = 100 * (avg * fga.sum() + (avg / size[size > 0]).sum()) / shots_total
    worst("a_league_sq", sq, block["league_per_100_shots"]["sq"])

# Part B: league totals and three defenders each season, from the archive rows themselves.
pins = bdata.archive_pins()
for season, block in B["seasons"].items():
    year = int(season[:4])
    rows = list(shots.archive_csv(pins[season], f"matchups_{year}"))
    pairs: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    totals: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    games: Counter[str] = Counter()
    for r in rows:
        fga = int(float(r["matchup_field_goals_attempted"]))
        fgm = int(float(r["matchup_field_goals_made"]))
        a3 = int(float(r["matchup_three_pointers_attempted"]))
        m3 = int(float(r["matchup_three_pointers_made"]))
        if fga:
            games[r["game_id"]] += 1
        for store in (pairs[(r["person_id"], r["matchups_person_id"])], totals[r["person_id"]]):
            store[0] += fga - a3
            store[1] += fgm - m3
            store[2] += a3
            store[3] += m3
    p2, p3 = R03["fg2_pct"][season], R03["fg3_pct"][season]
    expected: dict[str, float] = defaultdict(float)
    actual: dict[str, float] = defaultdict(float)
    volume: dict[str, float] = defaultdict(float)
    for (shooter, defender), (a2, m2, a3, m3) in pairs.items():
        t = totals[shooter]
        e2 = (p2["alpha"] + t[1] - m2) / (p2["alpha"] + p2["beta"] + t[0] - a2)
        e3 = (p3["alpha"] + t[3] - m3) / (p3["alpha"] + p3["beta"] + t[2] - a3)
        expected[defender] += a2 * 2 * e2 + a3 * 3 * e3
        actual[defender] += 2 * m2 + 3 * m3
        volume[defender] += a2 + a3
    n = sum(volume.values())
    term = (sum(expected.values()) - sum(actual.values())) / n
    worst("b_league_term", term, block["league"]["all"]["term"])
    worst("b_league_fga", n, block["league"]["all"]["fga"])
    for player in block["players"]:
        pid = player["player_id"]
        worst("b_defender_fga", volume[pid], player["fga"])
        if player["status"] == "served":
            value = player["kinds"]["all"]
            worst("b_defender_pps", actual[pid] / volume[pid], value["pps"])
            worst("b_defender_xpps", expected[pid] / volume[pid], value["xpps"])
            dsq = 100 * ((expected[pid] - actual[pid]) / volume[pid] - term)
            worst("b_defender_dsq", dsq, value["dsq"])
    print("checked", season, flush=True)
Path(sys.argv[1]).write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")
print(json.dumps(out))
