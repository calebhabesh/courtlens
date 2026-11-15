"""SP05: the player page's hero ranks from the full and the sort-only response must be identical.
Ranks follow lib/percentile-display.ts rankInSortedPage: 1 + strictly better known values; null when
absent or valueless. Usage: hero_ranks.py <api> <snapshot.json for pins> <out.json>"""

import hashlib
import json
import sys
import urllib.request

api, snap, out = sys.argv[1:4]
with open("/home/ethioking/dev/courtlens/scripts/speed/urls.json") as fh:
    urls = json.load(fh)
with open(snap) as fh:
    pins = json.load(fh)["pins"]


def fill(v):
    if isinstance(v, str):
        return (
            v.replace("{releaseId}", pins["releaseId"])
            .replace("{season}", pins["season"])
            .replace("{beforeDate}", pins["beforeDate"])
        )
    if isinstance(v, dict):
        return {k: fill(x) for k, x in v.items()}
    if isinstance(v, list):
        return [fill(x) for x in v]
    return v


def post(body):
    raw = json.dumps(body).encode()
    req = urllib.request.Request(
        api + "/api/workbench/query", data=raw, headers={"Content-Type": "application/json"}
    )
    data = urllib.request.urlopen(req, timeout=120).read()
    return json.loads(data), len(data)


def ranks(page, direction):
    out = {}
    for pid, v in page:
        if v is None:
            out[pid] = None
            continue
        out[pid] = 1 + sum(
            1 for _, w in page if w is not None and (w < v if direction == "low" else w > v)
        )
    return out


report = {"api": api, "pins": pins, "reads": []}
bad = 0
for entry in urls["snapshot"]:
    if not entry["name"].startswith("query-hero-rank-"):
        continue
    body = fill(entry["body"])
    sort = body["query"]["sort"][0]
    metric = sort["field"]
    direction = "low" if sort["direction"] == "asc" else "high"
    full, full_bytes = post(body)
    narrow_body = {**body, "presentation": {**body["presentation"], "metrics": "sort"}}
    narrow, narrow_bytes = post(narrow_body)
    a = [(i["player_id"], i["metrics"].get(metric)) for i in full["items"]]
    b = [(i["player_id"], i["metrics"].get(metric)) for i in narrow["items"]]
    ra, rb = ranks(a, direction), ranks(b, direction)
    ties = sum(
        1 for r in set(x for x in ra.values() if x is not None) if list(ra.values()).count(r) > 1
    )
    same = a == b and ra == rb
    bad += not same
    report["reads"].append(
        {
            "name": entry["name"],
            "metric": metric,
            "direction": direction,
            "rows": len(a),
            "full_bytes": full_bytes,
            "sort_only_bytes": narrow_bytes,
            "pages_equal": a == b,
            "ranks_equal": ra == rb,
            "tied_ranks": ties,
            "null_ranks": sum(1 for x in ra.values() if x is None),
            "ranks_sha256": hashlib.sha256(
                json.dumps(sorted(ra.items()), separators=(",", ":")).encode()
            ).hexdigest(),
            "sort_only_body": narrow_body,
        }
    )
    print(
        f"{entry['name']:<32} rows {len(a):>3}  {full_bytes:>9,} B -> {narrow_bytes:>7,} B  "
        f"page equal {a == b}  ranks equal {ra == rb}  ties {ties}  "
        f"nulls {report['reads'][-1]['null_ranks']}"
    )
with open(out, "w") as fh:
    json.dump(report, fh, indent=1)
print("differences:", bad)
sys.exit(1 if bad else 0)
