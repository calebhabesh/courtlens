"""waves.py <capture.json>: group each page's server reads into waves.

A read starts a new wave when it starts after another ended.
"""

import json
import sys


def short(r):
    return (
        r["method"][0]
        + " "
        + r["path"].split("?")[0].replace("/api/workbench", "").replace("/api", "")
    )


with open(sys.argv[1]) as fh:
    capture = json.load(fh)
for p in capture["pages"]:
    reads = sorted(p["reads"], key=lambda r: r["start"])
    waves = []  # simple rule, below
    for r in reads:
        # a read joins the last wave when it starts before any of that wave's reads ended
        if waves and r["start"] < min(x["end"] for x in waves[-1]):
            waves[-1].append(r)
        else:
            waves.append([r])
    print(f"{p['name']}: {p['seconds'] * 1000:.0f} ms, {len(reads)} reads, {len(waves)} waves")
    for i, w in enumerate(waves, 1):
        print(
            f"   {i}: {min(x['start'] for x in w) * 1000:4.0f}-"
            f"{max(x['end'] for x in w) * 1000:4.0f} ms  " + ", ".join(short(x) for x in w)
        )
