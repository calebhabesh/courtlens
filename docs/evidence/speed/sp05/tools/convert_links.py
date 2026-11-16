"""SP05: in each file given, render every next/link <Link> as IntentLink (no viewport prefetch)."""

import os
import re
import sys

changed = []
for path in sys.argv[1:]:
    with open(path) as fh:
        s = fh.read()
    tags = re.findall(r"<Link\b", s)
    if not tags:
        continue
    # every Link opening tag; default prefetch ones are those without a prefetch attribute
    s2 = re.sub(r"<Link\b", "<IntentLink", s)
    s2 = s2.replace("</Link>", "</IntentLink>")
    still = re.search(
        r"\bLink\b(?!\.)",
        re.sub(r'import Link from "next/link";\n', "", s2).replace("IntentLink", ""),
    )
    rel = os.path.relpath(path, "components") if path.startswith("components/") else None
    imp = "@/components/intent-link"
    if still:
        # Link still used another way (e.g. as a value); add IntentLink import beside it
        s2 = s2.replace(
            'import Link from "next/link";\n',
            f'import Link from "next/link";\nimport {{ IntentLink }} from "{imp}";\n',
            1,
        )
    else:
        s2 = s2.replace(
            'import Link from "next/link";\n', f'import {{ IntentLink }} from "{imp}";\n', 1
        )
    if s2 != s:
        with open(path, "w") as fh:
            fh.write(s2)
        changed.append((path, len(tags), bool(still)))
for c in changed:
    print(*c)
