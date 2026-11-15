"""waves.py <capture.json>: group each page's server reads into waves (a read starts after another ended)."""
import json, sys
for p in json.load(open(sys.argv[1]))["pages"]:
    reads = sorted(p["reads"], key=lambda r: r["start"])
    waves = []  # each wave: reads whose start precedes the earliest end of the previous wave's... simple rule:
    for r in reads:
        # a read belongs to the first wave whose reads all started before r ended and r started before any of them ended
        if waves and r["start"] < min(x["end"] for x in waves[-1]):
            waves[-1].append(r)
        else:
            waves.append([r])
    short = lambda r: r["method"][0] + " " + r["path"].split("?")[0].replace("/api/workbench", "").replace("/api", "")
    print(f"{p['name']}: {p['seconds']*1000:.0f} ms, {len(reads)} reads, {len(waves)} waves")
    for i, w in enumerate(waves, 1):
        print(f"   {i}: {min(x['start'] for x in w)*1000:4.0f}-{max(x['end'] for x in w)*1000:4.0f} ms  " + ", ".join(short(x) for x in w))
