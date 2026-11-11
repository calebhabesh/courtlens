"""RD18 content check: shot-to-possession match counts only (no point values, no PPP).

Run from the repo root:
systemd-run --user --scope -p MemoryMax=8G .venv/bin/python \
    docs/evidence/research/design-RD18/content-check.py 2024-25 2025-26
"""

import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

from courtlens.domain.research_registry import load_registration
from courtlens.evaluation import expected_shot_v2_data as sdata
from courtlens.evaluation import expected_shot_v2_runner as r05
from courtlens.evaluation.impact_history_fits import bundle_paths
from courtlens.evaluation.impact_rating_inputs import checked

RIM_WORDS = ("layup", "dunk", "tip", "alley oop", "putback", "finger roll")
POSITIONS = Path(
    "data/derived/position-estimates-v1/"
    "1f8c19f2f4f27e2322d80e59fbe1fa519d299bb970d6cdc60aa2d8febe572a00.json"
)
with POSITIONS.open() as handle:
    pos = json.load(handle)["seasons"]
pins = load_registration(r05.REGISTRATION).parameters["table_sha256"]
out = {}
for season in sys.argv[1:]:
    year = int(season[:4])
    s = r05.load_season(season, pins[season])
    n = len(s["game_id"])
    keys = {
        (str(g), int(e)): i
        for i, (g, e) in enumerate(zip(s["game_id"], s["event_id"], strict=True))
    }
    c = Counter()
    c["shots"] = n
    c.update(f"r05_possession_reason:{r or 'known'}" for r in s["possession_reason"])
    c.update(f"r05_after_oreb:{int(a)}" for a in s["after_oreb"])
    # distance / zone
    for i in range(n):
        at = str(s["action_type"][i]).lower()
        d = s["distance"][i]
        v = int(s["value"][i])
        if not np.isfinite(d):
            c["distance_nan"] += 1
        if v == 3:
            c["zone:three"] += 1
        elif any(w in at for w in RIM_WORDS) or (np.isfinite(d) and d <= 4):
            c["zone:rim"] += 1
        elif not np.isfinite(d):
            c["zone:mid_unresolved"] += 1
        elif d <= 14:
            c["zone:short_mid"] += 1
        else:
            c["zone:long_mid"] += 1
        pl = pos[season].get(str(s["player_id"][i]))
        c[
            "shooter_position:"
            + (
                {"PG": "G", "SG": "G", "SF": "F", "PF": "F", "C": "C"}[pl["position"]]
                if pl
                else "unclassified"
            )
        ] += 1
    # blocks from PBP (same actionNumber as the miss)
    blocks = set()
    for game, rows in sdata.games_in_order(
        sdata.archive_csv(sdata.pbp_pins()[season], f"nbastatsv3_{year}")
    ):
        for r in rows:
            if " BLOCK (" in (r.get("description") or ""):
                blocks.add((("00" + game) if len(game) == 8 else game, int(r["actionNumber"])))
    c["pbp_block_rows"] = len(blocks)
    c["r05_shots_blocked"] = sum(1 for k in keys if k in blocks)
    path, src = bundle_paths()[season]
    b = checked(path, path.name.removesuffix(".json.gz"))
    admitted = set(b["members"])
    c["r01_games"] = len(admitted)
    used = set()
    for gid, m in sorted(b["members"].items()):
        g = checked(Path(m["path"]), m["content_sha256"])
        ps = g["possessions"]
        nums = [p["possession_number"] for p in ps]
        if nums != sorted(nums):
            c["possessions_out_of_order_games"] += 1
        for pi, p in enumerate(ps):
            evs = p["stats_json"]["events"]
            seen_oreb = False
            for ei, e in enumerate(evs):
                v = e["values"]
                if "orb" in v and v.get("orb"):
                    seen_oreb = True
                if "fga" not in v:
                    continue
                k = (gid, int(e["locator"]["action_number"]))
                i = keys.get(k)
                if i is None:
                    c["possession_fga_without_shot"] += 1
                    continue
                if str(s["team_id"][i]) != p["offense_team_id"] or int(s["made"][i]) != int(
                    v.get("fgm", 0)
                ):
                    c["team_or_result_differs"] += 1
                    continue
                used.add(i)
                c["joined"] += 1
                first = not seen_oreb
                c[f"joined_first_chance:{int(first)}"] += 1
                if int(s["after_oreb"][i]) == int(not first):
                    c["after_oreb_agrees"] += 1
                if not first:
                    continue
                # next opponent possession (same period)
                nxt = ps[pi + 1] if pi + 1 < len(ps) else None
                if nxt is None or nxt["period"] != p["period"]:
                    nxt_state = "period_or_game_end"
                elif nxt["offense_team_id"] == p["defense_team_id"]:
                    nxt_state = "opponent_next"
                else:
                    nxt_state = "same_team_next"
                if int(s["made"][i]):
                    later_fga = any("fga" in x["values"] for x in evs[ei + 1 :])
                    c[
                        f"made_first:{'last_fga' if not later_fga else 'later_fga_same_possession'}"
                    ] += 1
                    c[f"made_next:{nxt_state}"] += 1
                else:
                    rest = evs[ei + 1 :]
                    reb = next(
                        (
                            x["values"]
                            for x in rest
                            if "orb_opportunities" in x["values"] or "orb" in x["values"]
                        ),
                        None,
                    )
                    other = next((x["values"] for x in rest), None)
                    if reb is None:
                        kind = "no_rebound_event:" + (
                            ",".join(sorted(other)) if other else "possession_ends"
                        )
                    elif reb.get("orb"):
                        kind = "oreb"
                    else:
                        kind = "dreb"
                    c[f"miss_after:{kind}"] += 1
                    if kind == "dreb":
                        c[f"dreb_next:{nxt_state}"] += 1
                    if k in blocks:
                        c[f"blocked_miss_after:{kind.split(':')[0]}"] += 1
    unj = Counter(
        "game_not_admitted" if str(s["game_id"][i]) not in admitted else "not_on_a_possession"
        for i in range(n)
        if i not in used
    )
    c.update({f"unjoined:{k}": v for k, v in unj.items()})
    out[season] = dict(sorted(c.items()))
    print(season, json.dumps(out[season], indent=1), flush=True)
with Path(__file__).with_name("content-check.json").open("w") as handle:
    json.dump(out, handle, indent=1)
