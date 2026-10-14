"""Ordered (context, selector, declarations) for every style rule in a CSS text."""
import re
def rules(css):
    clean = re.sub(r'/\*.*?\*/', ' ', css, flags=re.S)
    out = []; stack = []; buf = ''
    i = 0
    tokens = re.split(r'([{};])', clean)
    cur = ''
    decls = []
    for t in tokens:
        if t == '{':
            stack.append((' '.join(cur.split()), decls)); cur = ''; decls = []
        elif t == ';':
            if cur.strip(): decls.append(' '.join(cur.split()))
            cur = ''
        elif t == '}':
            if cur.strip(): decls.append(' '.join(cur.split()))
            head, outer = stack.pop()
            if decls: out.append((tuple(h for h, _ in stack), head, tuple(decls)))
            decls = outer; cur = ''
        else:
            cur += t
    return out
