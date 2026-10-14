"""Split a layered CSS file into colocated files by section-start line, and check cascade safety.
usage: split.py <source.css> <layer> <mapping.json> [--write]
mapping: {"<line>": "<target path or SHARED>"}; sections inherit the target of the nearest mapped
line at or above them. Output files wrap their sections in @layer <layer> { ... }. The SHARED target
keeps the source path. Prints the import list (first-appearance order) and any rule pairs whose
relative order changes while sharing a class token and a property."""

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rules import rules

src, layer, mapping_path = sys.argv[1:4]
write = "--write" in sys.argv
css = Path(src).read_text()
lines = css.split("\n")
mapping = {int(k): v for k, v in json.loads(Path(mapping_path).read_text()).items()}
# body = text inside the @layer blocks; record each line's depth to find layer wrappers
clean = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group()), css, flags=re.S).split(
    "\n"
)
depth = []
d = 0
for line in clean:
    depth.append(d)
    d += line.count("{") - line.count("}")
heads = sorted(mapping)
# mark lines that sit inside a top-level block other than @layer <layer> (unlayered rules)
unlayered = []
top = None
for i, line in enumerate(clean):
    if depth[i] == 0:
        st = line.strip()
        top = (
            "layer"
            if re.match(r"^@layer\s+" + layer + r"\s*\{", st)
            else ("other" if "{" in st else None)
        )
        unlayered.append(top == "other")
    else:
        unlayered.append(top == "other")


def target(i):  # i: 1-based line
    t = "SHARED"
    for h in heads:
        if h <= i:
            t = mapping[h]
    return t


# assign every line inside a layer block to a target; drop the layer wrapper lines themselves
chunks = []  # (target, text)
for idx, line in enumerate(lines, 1):
    s = clean[idx - 1].strip()
    if re.match(r"^@layer\s+" + layer + r"\s*\{\s*$", s) and depth[idx - 1] == 0:
        continue
    if s == "}" and depth[idx - 1] == 1 and not unlayered[idx - 1] and re.match(r"^\}", line):
        # a column-0 closing brace at depth 1 closes the layer block
        continue
    if depth[idx - 1] == 0 and not line.strip():
        continue
    # Lines outside the layer block are unlayered (they beat every layer): keep them in the shared
    # file, outside its @layer wrapper, in their original order.
    if depth[idx - 1] == 0 or (depth[idx - 1] >= 1 and unlayered[idx - 1]):
        chunks.append(("UNLAYERED", line, idx))
        continue
    chunks.append((target(idx), line, idx))
order = []
for t, _, _ in chunks:
    if t not in order and t != "UNLAYERED":
        order.append(t)
if "SHARED" not in order:
    order.insert(0, "SHARED")
files = {t: "\n".join(line for tt, line, _ in chunks if tt == t) for t in order}
unlayered_text = "\n".join(line for tt, line, _ in chunks if tt == "UNLAYERED")
# cascade check: rule sequence before vs after (concatenate files in import order)
before = [(r, i) for i, r in enumerate(rules(css))]
after_css = "\n".join(
    f"@layer {layer} {{\n{files[t]}\n}}" + ("\n" + unlayered_text if t == "SHARED" else "")
    for t in order
)
after = rules(after_css)
pos_after = {}
for k, r in enumerate(after):
    pos_after.setdefault(r, []).append(k)
assert sorted(map(str, after)) == sorted(map(str, [r for r, _ in before])), "rule multiset changed"


def classes(sel):
    return set(re.findall(r"\.([a-zA-Z_][\w-]*)", sel))


def props(decls):
    return {d.split(":", 1)[0].strip() for d in decls}


def spec(sel):
    sel = re.sub(r":(?:where)\([^)]*\)", "", sel)
    ids = len(re.findall(r"#[\w-]+", sel))
    cls = len(re.findall(r"\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+", sel))
    el = len(re.findall(r"(?:^|[\s>+~(])[a-z][\w-]*", sel)) + len(re.findall(r"::[\w-]+", sel))
    return (ids, cls, el)


def spec_overlap(a, b, shared):
    # parts of each selector that name a shared class; a conflict needs equal specificity somewhere
    pa = [spec(x) for x in a.split(",") if classes(x) & shared]
    pb = [spec(x) for x in b.split(",") if classes(x) & shared]
    return any(x == y for x in pa for y in pb)


seq = [r for r, _ in before]
idx_after = []
used = {}
for r in seq:
    k = used.get(r, 0)
    idx_after.append(pos_after[r][k])
    used[r] = k + 1
conflicts = []
n = len(seq)
for a in range(n):
    for b in range(a + 1, n):
        if idx_after[a] > idx_after[b]:
            ra, rb = seq[a], seq[b]
            if ra[0] != rb[0]:
                pass
            if ("@layer" in str(ra[0])) != ("@layer" in str(rb[0])):
                continue  # unlayered beats layered regardless of order
            shared = classes(ra[1]) & classes(rb[1])
            if shared and props(ra[2]) & props(rb[2]) and spec_overlap(ra[1], rb[1], shared):
                conflicts.append((ra[1][:70], rb[1][:70], sorted(props(ra[2]) & props(rb[2]))[:3]))
print("targets:", len(order))
[print("  ", t, len(files[t].encode()), "bytes") for t in order]
print("reordered conflicting pairs:", len(conflicts))
for c in conflicts[:25]:
    print("   ", c)
if write:
    for t in order:
        path = src if t == "SHARED" else t
        tail = (
            ("\n" + unlayered_text.strip(chr(10)) + "\n")
            if t == "SHARED" and unlayered_text.strip()
            else ""
        )
        Path(path).write_text(f"@layer {layer} {{\n{files[t].strip(chr(10))}\n}}\n" + tail)
    Path(mapping_path.replace(".json", ".order.json")).write_text(
        json.dumps([src if t == "SHARED" else t for t in order])
    )
