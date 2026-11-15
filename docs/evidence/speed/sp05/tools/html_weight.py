"""SP05: where a page's HTML bytes go. Usage: html_weight.py <url> [--top N] [--json out]
Splits the document into markup and the inline RSC payload (self.__next_f.push strings),
then walks the payload's element tree and attributes bytes to each client component's props."""
import json, re, sys, urllib.request
from collections import defaultdict

url = sys.argv[1]
top = int(sys.argv[sys.argv.index("--top") + 1]) if "--top" in sys.argv else 25
html = urllib.request.urlopen(url, timeout=120).read().decode()
total = len(html.encode())
scripts = list(re.finditer(r"<script>self\.__next_f\.push\((\[.*?\])\)</script>", html, re.S))
script_bytes = sum(len(m.group(0).encode()) for m in scripts)
payload = ""
for m in scripts:
    arr = json.loads(m.group(1))
    if len(arr) > 1 and isinstance(arr[1], str):
        payload += arr[1]
other_scripts = sum(len(m.group(0).encode()) for m in re.finditer(r"<script[^>]*>.*?</script>", html, re.S)) - script_bytes
markup = total - script_bytes - other_scripts
# markup breakdown: hidden-ish attributes
style_attr = sum(len(m.group(0)) for m in re.finditer(r' style="[^"]*"', html))
class_attr = sum(len(m.group(0)) for m in re.finditer(r' class="[^"]*"', html))
svg = sum(len(m.group(0)) for m in re.finditer(r"<svg.*?</svg>", html, re.S))

# parse rows: "<hex id>:<tag?><json>\n" ; T rows: "<id>:T<hexlen>,<text>"
rows = {}
i = 0
P = payload
while i < len(P):
    m = re.compile(r"([0-9a-f]+):").match(P, i)
    if not m:
        nl = P.find("\n", i); i = len(P) if nl < 0 else nl + 1; continue
    rid = m.group(1); j = m.end()
    if P[j] == "T":
        comma = P.index(",", j); n = int(P[j+1:comma], 16)
        # n is utf-8 byte length
        b = P[comma+1:].encode()[:n].decode(errors="ignore")
        rows[rid] = ("T", b); i = comma + 1 + len(b); continue
    nl = P.find("\n", j); nl = len(P) if nl < 0 else nl
    body = P[j:nl]; i = nl + 1
    tag = body[0] if body and body[0].isalpha() else ""
    rows[rid] = (tag, body[1:] if tag else body)

modules = {}
for rid, (tag, body) in rows.items():
    if tag == "I":
        try:
            v = json.loads(body); modules[rid] = (v[2] if len(v) > 2 else v[0])
        except Exception: modules[rid] = body[:80]
def _resolve(n):
    while isinstance(n, str) and n.startswith("$") and n[1:] in rows and rows[n[1:]][0] == "":
        try: n = json.loads(rows[n[1:]][1])
        except Exception: break
    return n
modules = {k: _resolve(v) for k, v in modules.items()}
row_bytes = defaultdict(int)
for rid, (tag, body) in rows.items():
    row_bytes[tag or "json"] += len(body.encode())

DUMP = sys.argv[sys.argv.index("--dump") + 1] if "--dump" in sys.argv else None
DUMPED = []
prop_bytes = defaultdict(int)      # (component, prop) -> bytes
comp_bytes = defaultdict(int)
comp_count = defaultdict(int)
def size(v): return len(json.dumps(v, separators=(",", ":"), ensure_ascii=False).encode())
def walk(v, owner=None):
    if isinstance(v, list):
        if len(v) >= 4 and v[0] == "$" and isinstance(v[1], str):
            t = v[1]; props = v[3] if isinstance(v[3], dict) else {}
            if t.startswith("$L"):
                name = modules.get(t[2:], t)
                if isinstance(name, list): name = ",".join(map(str, name))
                comp_count[name] += 1
                for k, pv in props.items():
                    if k == "children": continue
                    if DUMP and DUMP == f"{name}.{k}": DUMPED.append(pv)
                    s = size(pv); prop_bytes[(name, k)] += s; comp_bytes[name] += s
            for pv in props.values(): walk(pv)
        else:
            for x in v: walk(x)
    elif isinstance(v, dict):
        for x in v.values(): walk(x)
for rid, (tag, body) in rows.items():
    if tag == "":
        try: walk(json.loads(body))
        except Exception: pass

out = {"url": url, "total": total, "markup": markup, "rsc_scripts": script_bytes, "other_scripts": other_scripts,
       "rsc_payload_chars": len(P.encode()), "markup_style_attrs": style_attr, "markup_class_attrs": class_attr, "markup_svg": svg,
       "rows_by_tag": dict(row_bytes),
       "client_components": sorted(({"component": c, "count": comp_count[c], "prop_bytes": b} for c, b in comp_bytes.items()), key=lambda x: -x["prop_bytes"])[:top],
       "props": sorted(({"component": c, "prop": p, "bytes": b} for (c, p), b in prop_bytes.items()), key=lambda x: -x["bytes"])[:top]}
if "--json" in sys.argv:
    json.dump(out, open(sys.argv[sys.argv.index("--json") + 1], "w"), indent=1)
print(f"{url}\n total {total:,}  markup {markup:,}  rsc-scripts {script_bytes:,} (payload {len(P.encode()):,})  other-scripts {other_scripts:,}")
print(f" markup: class attrs {class_attr:,}  style attrs {style_attr:,}  svg {svg:,}")
print(" rows:", {k: f"{v:,}" for k, v in row_bytes.items()})
print(" client components by prop bytes:")
for x in out["client_components"][:12]: print(f"   {x['prop_bytes']:>10,}  x{x['count']:<4} {x['component']}")
print(" largest props:")
for x in out["props"][:top]: print(f"   {x['bytes']:>10,}  {x['component']}.{x['prop']}")
if DUMP:
    json.dump(DUMPED, open(sys.argv[sys.argv.index("--dump") + 2], "w"))
