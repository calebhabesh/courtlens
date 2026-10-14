"""List CSS rules whose every selector names a class the TS/TSX source never mentions.
Conservative: a class counts as live if its full name appears anywhere in source text, or if a
prefix ending in '-' appears followed by a template/concatenation (`foo-${`, "foo-" +)."""

import glob
import json
import re
import sys
from pathlib import Path

root = sys.argv[1]
src = "\n".join(
    Path(f).read_text()
    for pat in (
        "app/**/*.tsx",
        "app/**/*.ts",
        "components/**/*.tsx",
        "components/**/*.ts",
        "lib/**/*.ts",
        "lib/**/*.tsx",
    )
    for f in glob.glob(f"{root}/{pat}", recursive=True)
    if ".test." not in f
)
dyn = set(m.group(1) for m in re.finditer(r'([a-z][a-z0-9-]*-)(?:\$\{|"\s*\+|\'\s*\+)', src))


def live(cls):
    if re.search(r"(?<![a-z0-9-])" + re.escape(cls) + r"(?![a-z0-9-])", src):
        return True
    return any(cls.startswith(p) for p in dyn)


def rules(css):
    # yield (start, end, selector) for innermost style rules; skip @-rule headers
    out = []
    stack = []
    for m in re.finditer(r"[{}]", css):
        if m.group() == "{":
            j = max(
                css.rfind("}", 0, m.start()),
                css.rfind("{", 0, m.start()),
                css.rfind(";", 0, m.start()),
            )
            head = css[j + 1 : m.start()]
            stack.append((head.strip(), j + 1))
        else:
            head, start = stack.pop()
            out.append((start, m.end(), head))
    return out


report = {}
for f in sys.argv[2:]:
    css = Path(f).read_text()
    clean = re.sub(r"/\*.*?\*/", lambda m: " " * len(m.group()), css, flags=re.S)
    dead = []
    for start, end, head in rules(clean):
        if (
            not head or head.startswith("@") or "{" in clean[start : end - 1].split("{", 1)[1]
            if "{" in clean[start:end]
            else False
        ):
            continue
        parts = [p.strip() for p in head.split(",")]

        def part_dead(p):
            classes = re.findall(
                r"\.([a-zA-Z_][a-zA-Z0-9_-]*)", re.sub(r":(?:not|is|where|has)\([^)]*\)", "", p)
            )
            return bool(classes) and any(not live(c) for c in classes)

        if parts and all(part_dead(p) for p in parts):
            dead.append(
                {"line": css[:start].count("\n") + 1, "selector": head[:160], "bytes": end - start}
            )
    report[f] = dead
    print(f, len(dead), "dead rules,", sum(d["bytes"] for d in dead), "bytes")
Path(sys.argv[0].replace("dead.py", "dead.json")).write_text(json.dumps(report, indent=1))
