import json
import sys

with open(sys.argv[1]) as fh:
    d = json.load(fh)
for p in d["pages"]:
    print(p["path"], "first load", p["first_load"])
    for f in sorted(p["files"], key=lambda f: -f["encoded"])[
        : int(sys.argv[2]) if len(sys.argv) > 2 else 12
    ]:
        print(
            f"  {f['encoded']:>8,} {f['decoded']:>9,} {f['kind']} "
            f"{'html ' if f['in_html'] else 'later'} {f['path']}"
        )
