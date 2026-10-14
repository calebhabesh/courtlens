import sys, re, collections
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from rules import rules
b = rules(open(sys.argv[1]).read()); a = rules(open(sys.argv[2]).read())
cb, ca = collections.Counter(b), collections.Counter(a)
gone = cb - ca; new = ca - cb
print('before', len(b), 'after', len(a), 'removed', sum(gone.values()), 'added', sum(new.values()))
for r in list(new)[:5]: print('  ADDED', str(r)[:200])
ctxs = collections.Counter(r[0] for r in gone.elements()); print('  removed by context:', dict(ctxs))
def classes(sel): return set(re.findall(r'\.([a-zA-Z_][\w-]*)', sel))
def props(decls): return {d.split(':', 1)[0].strip() for d in decls}
def spec(sel):
    sel = re.sub(r':(?:where)\([^)]*\)', '', sel)
    return (len(re.findall(r'#[\w-]+', sel)), len(re.findall(r'\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+', sel)), len(re.findall(r'(?:^|[\s>+~(])[a-z][\w-]*', sel)) + len(re.findall(r'::[\w-]+', sel)))
def overlap(x, y):
    sh = classes(x[1]) & classes(y[1])
    if not sh or not (props(x[2]) & props(y[2])): return False
    pa = [spec(p) for p in x[1].split(',') if classes(p) & sh]; pb = [spec(p) for p in y[1].split(',') if classes(p) & sh]
    return any(p == q for p in pa for q in pb)
# keep only rules present in both, in order, with occurrence indexes
seen = collections.Counter(); keyb = []
for r in b:
    if ca[r] > seen[r]: keyb.append((r, seen[r]))
    seen[r] += 1
seen = collections.Counter(); posa = {}
for i, r in enumerate(a):
    posa[(r, seen[r])] = i; seen[r] += 1
idx = [posa[k] for k in keyb if k in posa]; rs = [k[0] for k in keyb if k in posa]
bad = 0
by_ctx = collections.defaultdict(list)
def layer_of(ctx):
    for c in ctx:
        if c.startswith('@layer'): return c
    return 'UNLAYERED'
for i, r in enumerate(rs): by_ctx[layer_of(r[0])].append((idx[i], r))
for ctx, lst in by_ctx.items():
    n = len(lst)
    for i in range(n):
        for j in range(i + 1, n):
            if lst[i][0] > lst[j][0] and overlap(lst[i][1], lst[j][1]):
                bad += 1
                if bad <= 40: print('  CONFLICT', ctx, lst[i][1][0][-1:], lst[i][1][1][:55], '|', lst[j][1][0][-1:], lst[j][1][1][:55])
print('order conflicts:', bad)
