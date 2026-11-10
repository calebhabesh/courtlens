"""R04: recompute minutes, scoring usage, TS add and zTS add from the served impact bundle and
the frozen zTS results, and compare with what the zTS API serves. Run from a directory whose
`data` is the main checkout's, with the API on :4180."""

import json
import sys
import urllib.request
from pathlib import Path

from courtlens.services.impact_serving import load_impact_store

API = "http://localhost:4180/api/zts"
frozen = json.loads(Path("evaluation/research/frozen/courtlens-zts-validation-v1.json").read_text())
store = load_impact_store()
assert store is not None


def bundle(season: str) -> dict[str, dict[str, float | None]]:
    entries = [
        e
        for e in store["entries"]
        if e["scope"].get("season") == season
        and e["scope"].get("phase") == "regular_season"
        and e["scope"].get("years") == 1
    ]
    extras = next(e for e in entries if e["kind"] == "extras")["players"]
    ratings = next(e for e in entries if e["kind"] == "ratings")["players"]
    out = {}
    for pid, p in extras.items():
        off = p["support"]["impact_tsadd_per100"]["denominator"]
        tsa = p["support"]["impact_rts"]["denominator"]
        seconds = ratings.get(pid, {}).get("support", {}).get("rapm", {}).get("seconds")
        out[pid] = {
            "minutes": None if seconds is None else seconds / 60,
            "usage": 100 * tsa / off if off and tsa is not None else None,
            "ts_add": p["support"]["impact_tsadd_per100"]["value"],
        }
    return out


checked = mismatches = 0
for season in frozen["players"]:
    served = json.load(urllib.request.urlopen(f"{API}/leaderboard?season={season}&limit=1000"))
    ref = bundle(season)
    for row in served["rows"]:
        want = ref[row["player_id"]]
        zts_value = frozen["players"][season][row["player_id"]]["zts"]
        expected = {
            "minutes": want["minutes"],
            "scoring_usage": want["usage"],
            "ts_add": want["ts_add"],
            "zts_add": 2 * want["usage"] * zts_value,
            "zts": zts_value,
        }
        for key, value in expected.items():
            checked += 1
            if row[key] is None or abs(row[key] - value) > 1e-9:
                mismatches += 1
                print("mismatch", season, row["player_id"], key, row[key], value)
        # TS add identity: the Stats table's TS add/100 equals 2 x usage x rTS.
        checked += 1
        if abs(want["ts_add"] - 2 * want["usage"] * row["rts"]) > 1e-6:
            mismatches += 1
            print("ts_add identity", season, row["player_id"])
print(json.dumps({"values_checked": checked, "mismatches": mismatches}))
sys.exit(1 if mismatches else 0)
