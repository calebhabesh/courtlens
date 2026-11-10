"""Recompute check: R08's Projected Impact tables reproduce R07's published test-season game RMSE
(R07's own game rows, fallback and frozen a/b), so the projections equal R07's."""

import json
import sys
from pathlib import Path

import numpy as np

from courtlens.domain.projected_impact import strength_difference
from courtlens.evaluation.projected_impact_data import game_rows

hashes = json.loads(Path(sys.argv[1]).read_text())
root = Path(sys.argv[2])
sel = json.loads(Path("data/derived/projected-impact-v1/selection.json").read_text())
report = json.loads(Path("data/derived/projected-impact-v1/test-report.json").read_text())
m = sel["game_mapping"]["lightgbm"]
fallback = sel["group_means"]["rookie"]
out = {}
pooled = []
for season in ("2024-25", "2025-26"):
    body = json.loads((root / "tables" / f"{hashes[season]}.json").read_bytes())
    table = body["candidates"]["projected_impact"]["ratings"]
    errs = []
    for g in game_rows(int(season[:4]) + 1):
        d = strength_difference(g["players"], table, fallback).difference
        errs.append(g["margin"] - (m["a"] + m["b"] * d))
    errs = np.array(errs)
    pooled.append(errs)
    published = (
        report["seasons"][season]["game"]["ratings"]["lightgbm"]["rmse"]
        if "seasons" in report
        else None
    )
    out[season] = {
        "games": len(errs),
        "rmse": float(np.sqrt(np.mean(errs**2))),
        "published": published,
    }
allp = np.concatenate(pooled)
out["pooled"] = {
    "games": len(allp),
    "rmse": float(np.sqrt(np.mean(allp**2))),
    "published": report["pooled"]["game"]["ratings"]["lightgbm"]["rmse"],
}
print(json.dumps(out, indent=1))
