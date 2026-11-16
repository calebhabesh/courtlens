"""html_ab.py <dir>: each page's before/after HTML must be identical once SP06's intended changes
(the `.webp` suffix, React's image preload links, loading/fetchpriority attributes, the watermark's
width and height) and build-specific names (chunk files, build id) are normalised away."""

import re
import sys
from pathlib import Path

folder = Path(sys.argv[1])
RULES = [
    (rb"/portrait\.webp\?", b"/portrait?"),
    (rb'<link rel="preload" as="image"[^>]*>', b""),
    (rb'\\?"rel\\?":\\?"preload\\?",\\?"as\\?":\\?"image\\?"[^\]]*?\]', b""),
    (rb' loading="(?:lazy|eager)"', b""),
    (rb' fetchPriority="high"', b""),
    (rb' width="160" height="160"', b""),
    (rb"/_next/static/[^\"'\s\\)]+", b"/_next/static/X"),
    (rb'"buildId":"[^"]+"|\\"b\\":\\"[^\\]+\\"', b"BUILD"),
    (rb'\\"(?:loading|fetchPriority)\\":\\"[a-z]+\\",?', b""),
    (rb'\\"width\\":160,\\"height\\":160,?', b""),
]
bad = 0
for before in sorted(folder.glob("*-before.html")):
    after = before.with_name(before.name.replace("-before", "-after"))
    a, b = after.read_bytes(), before.read_bytes()
    for pattern, repl in RULES:
        a, b = re.sub(pattern, repl, a), re.sub(pattern, repl, b)
    same = a == b
    bad += not same
    detail = ""
    if not same:
        i = next(i for i in range(min(len(a), len(b))) if a[i] != b[i])
        context = slice(i - 80, i + 120)
        detail = f" first difference at {i}: before {b[context]!r} after {a[context]!r}"
    print(f"{before.name[:-12]}: {'identical' if same else 'DIFFERENT'}{detail}")
print(f"{bad} page(s) differ")
