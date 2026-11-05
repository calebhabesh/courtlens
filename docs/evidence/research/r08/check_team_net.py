"""Recompute check (run from the scratch dir with data/ linked): R08's prior-season team net ratings against the Teams API on :8000 (GET only)."""
import json, sys, urllib.request
from pathlib import Path
hashes = json.load(open(sys.argv[1]))
worst = 0.0; n = 0; rows = {}
for season, digest in hashes.items():
    body = json.loads((Path(sys.argv[2]) / "tables" / f"{digest}.json").read_bytes())
    start = 2026 if season == "prospective" else int(season[:4])  # the 2026-27 sources table
    prior = f"{start - 1}-{start % 100:02d}"
    mine = body["candidates"]["team_net"]["teams"]
    api = json.load(urllib.request.urlopen(f"http://localhost:8000/api/workbench/teams?season={prior}"))
    theirs = {t["team_id"]: t["ratings"]["net_rating"] for t in api["teams"]}
    diff = max(abs(mine[t] - theirs[t]) for t in mine)
    worst = max(worst, diff); n += len(mine)
    rows[prior] = {"teams": len(mine), "api_teams": len(theirs), "max_abs_difference": diff, "same_ids": set(mine) == set(theirs)}
print(json.dumps({"seasons": rows, "values": n, "max_abs_difference": worst}, indent=1))
