"""R17 evidence extracts from the frozen results (no recomputation). Run from the repo root:
    python3 -I docs/evidence/research/r17-shot-aftermath/extract.py
Writes data-check.json and headline.json beside this script.
"""
import json
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
FROZEN = Path("evaluation/research/frozen/courtlens-shot-aftermath-v1.json")
d = json.loads(FROZEN.read_text())
data_check, headline = {}, {"results_sha256": d["results_sha256"], "registration": d["registration"]["content_sha256"], "seasons": {}}
for season, body in d["seasons"].items():
    data_check[season] = {k: body[k] for k in ("data_check", "league", "first_chance_by_zone", "databallr_comparison", "checks")}
    data_check[season]["statuses"] = dict(Counter(c["status"] for c in body["cells"]))
    tones = Counter((c["team"] == "all", name, t) for c in body["cells"] for name, t in c["tones"].items() if t)
    data_check[season]["coloured_costs"] = {f"{'league' if a else 'team'}:{n}:{t}": v for (a, n, t), v in sorted(tones.items())}
    rows = {}
    for c in body["cells"]:
        if c["team"] == "all":
            rows[f"{c['position']}/{c['zone']}"] = {"status": c["status"], "attempts": c["counts"]["attempts"], "tones": c["tones"],
                "values": {k: (None if v is None else {x: v[x] for x in ("value", "low", "high")}) for k, v in c["values"].items()}}
    headline["seasons"][season] = rows
(HERE / "data-check.json").write_text(json.dumps(data_check, indent=1, sort_keys=True) + "\n")
(HERE / "headline.json").write_text(json.dumps(headline, indent=1, sort_keys=True) + "\n")
print(json.dumps({s: v["coloured_costs"] for s, v in data_check.items()}, indent=1))
