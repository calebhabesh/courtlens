import collections
import glob
import json
import os
import re
import sys
from pathlib import Path

root = "."
files = [
    f
    for pat in ("app/**/*.tsx", "components/**/*.tsx")
    for f in glob.glob(pat, recursive=True)
    if ".test." not in f
]
text = {f: Path(f).read_text() for f in files}


def owners(classes):
    c = collections.Counter()
    for cls in set(classes):
        pat = re.compile(r"(?<![a-z0-9-])" + re.escape(cls) + r"(?![a-z0-9-])")
        hits = [f for f, t in text.items() if pat.search(t)]
        for f in hits:
            c[f] += 1 / len(hits)
    return c.most_common(3)


out = []
for p in sys.argv[1:]:
    lines = Path(p).read_text().split("\n")
    heads = [i for i, line in enumerate(lines) if re.match(r"^/\* ", line)]
    for k, i in enumerate(heads):
        end = heads[k + 1] if k + 1 < len(heads) else len(lines)
        body = "\n".join(lines[i:end])
        cls = re.findall(r"\.([a-z][a-z0-9-]*)", re.sub(r"/\*.*?\*/", "", body, flags=re.S))
        o = owners(cls)
        out.append(
            {
                "file": p,
                "line": i + 1,
                "head": lines[i][:70],
                "owners": [(f, round(w, 1)) for f, w in o],
            }
        )
        print(
            f"{p.split('/')[-1]}:{i + 1:<5} {lines[i][:52]:54} "
            + "  ".join(f"{f.replace('components/', 'c/')}:{w:.1f}" for f, w in o)
        )
Path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "proposal.json")).write_text(
    json.dumps(out, indent=1)
)
