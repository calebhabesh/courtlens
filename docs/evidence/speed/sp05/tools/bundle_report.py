"""SP05: per-route client JS from `next analyze export` JSONL. Usage: bundle_report.py <jsonl> <route> [--top N]
Sums the route's initial client outputs (bootstrap + render_dependent groups) once each, by module
and by package, using the analyzer's compressed_size. Async outputs (dynamic imports) are listed apart."""
import json, sys, re
from collections import defaultdict
path, route = sys.argv[1], sys.argv[2]
top = int(sys.argv[sys.argv.index("--top") + 1]) if "--top" in sys.argv else 25
groups, outputs, parts = [], {}, defaultdict(list)
for line in open(path):
    d = json.loads(line)
    if d.get("route") != route: continue
    if d["type"] == "group": groups.append(d)
    elif d["type"] == "output": outputs[d["filename"]] = d
    elif d["type"] == "part": parts[d["filename"]].append(d)
initial = set()
for g in groups:
    if g["kind"] == "async": continue
    initial.update(o for o in g["outputs"] if o.startswith("[client-fs]") and o.endswith(".js"))
lazy = set()
for g in groups:
    if g["kind"] == "async": lazy.update(o for o in g["outputs"] if o.startswith("[client-fs]") and o.endswith(".js"))
lazy -= initial
css = set()
for g in groups: css.update(o for o in g["outputs"] if o.startswith("[client-fs]") and o.endswith(".css"))
asyncs = set()
for f in initial:
    for a in outputs.get(f, {}).get("async_loaders", []) or []:
        asyncs.add(a if isinstance(a, str) else json.dumps(a))
by_mod, by_pkg = defaultdict(int), defaultdict(int)
total = 0
for f in initial:
    for p in parts.get(f, []):
        c = p.get("compressed_size", 0); total += c
        sp = p["source_path"]; by_mod[sp] += c
        m = re.match(r"\[project\]/node_modules/((?:@[^/]+/)?[^/]+)", sp)
        by_pkg[m.group(1) if m else ("app code" if sp.startswith("[project]/") else sp)] += c
css_total = sum(p.get("compressed_size", 0) for f in css for p in parts.get(f, []))
print(f"route {route}: initial client JS {len(initial)} files, {total:,} B compressed (analyzer); CSS {css_total:,} B")
print(" by package:")
for k, v in sorted(by_pkg.items(), key=lambda kv: -kv[1])[:15]: print(f"   {v:>8,}  {k}")
print(" largest modules:")
for k, v in sorted(by_mod.items(), key=lambda kv: -kv[1])[:top]: print(f"   {v:>8,}  {k.replace('[project]/', '')}")
lazy_total = sum(p.get("compressed_size", 0) for f in lazy for p in parts.get(f, []))
lazy_mods = sorted({p["source_path"].replace("[project]/", "") for f in lazy for p in parts.get(f, []) if not p["source_path"].startswith("[project]/node_modules")})
print(f" loaded on demand (next/dynamic, import()): {len(lazy)} files, {lazy_total:,} B; app modules: {', '.join(lazy_mods[:40])}{' ...' if len(lazy_mods) > 40 else ''}")
