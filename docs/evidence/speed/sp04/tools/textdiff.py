import json, sys, difflib
a, b = (json.load(open(f)) for f in sys.argv[1:3])
pb = {p["name"]: p for p in b["pages"]}
bad = 0
for p in a["pages"]:
    q = pb.get(p["name"])
    if q is None: print("missing", p["name"]); bad += 1; continue
    for key in ("url", "text"):
        if p[key] != q[key]:
            bad += 1
            print(f"== {p['name']} {key} differs")
            for line in list(difflib.unified_diff(p[key].splitlines(), q[key].splitlines(), lineterm="", n=0))[:20]: print("  ", line[:200])
print(f"{len(a['pages'])} pages; {bad} difference(s)")
sys.exit(1 if bad else 0)
