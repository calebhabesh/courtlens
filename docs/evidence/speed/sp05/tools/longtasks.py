import json
import sys

for f in sys.argv[1:]:
    with open(f) as fh:
        d = json.load(fh)
    print("==", f.split("/")[-1])
    by = {}
    for r in d["results"]:
        by.setdefault(r["journey"], []).append(r)
    for j, rs in by.items():
        lt = [x.get("longTasks", []) for x in rs]
        tot = sorted(sum(t[1] for t in tasks) for tasks in lt)
        mx = sorted(max([t[1] for t in tasks] or [0]) for tasks in lt)
        print(
            f"  {j:<34} ms {sorted(x['ms'] for x in rs)}  longest task median {mx[len(mx) // 2]}  "
            f"total long-task median {tot[len(tot) // 2]}  e.g. {lt[len(lt) // 2]}"
        )
