"""Remove the dead rules listed by dead.py from each file (selector through closing brace), then
drop @media/@supports/@container blocks left empty. Prints bytes before and after."""
import json, re, sys
d = json.load(open(sys.argv[1]))
for f, rs in d.items():
    if not rs: continue
    css = open(f).read(); before = len(css.encode())
    clean = re.sub(r'/\*.*?\*/', lambda m: ' ' * len(m.group()), css, flags=re.S)
    lines = css.split('\n'); offs = [0]
    for l in lines: offs.append(offs[-1] + len(l) + 1)
    cuts = []
    for r in rs:
        # locate the rule: find the selector text at/after the reported line start in the clean text
        pos = offs[r['line'] - 1]
        sel = r['selector'].split(',')[0].strip()[:40]
        i = clean.find(sel, pos)
        if i < 0: sys.exit(f"cannot find {sel!r} in {f}")
        j = clean.index('{', i); depth = 0; k = j
        while True:
            if clean[k] == '{': depth += 1
            elif clean[k] == '}':
                depth -= 1
                if depth == 0: break
            k += 1
        # extend the cut to the end of line and back to the start of line when the rule owns it
        ls = css.rfind('\n', 0, i) + 1
        start = ls if css[ls:i].strip() == '' else i
        le = css.find('\n', k)
        end = le + 1 if le != -1 and css[k+1:le].strip() == '' else k + 1
        cuts.append((start, end))
    for s, e in sorted(set(cuts), reverse=True):
        css = css[:s] + css[e:]
    prev = None
    while prev != css:
        prev = css
        css = re.sub(r'\n?[ \t]*@(?:media|supports|container)[^{;]*\{\s*\}[ \t]*', '', css)
    css = re.sub(r'\n{3,}', '\n\n', css)
    open(f, 'w').write(css)
    print(f, before, '->', len(css.encode()), 'bytes', len(rs), 'rules')
