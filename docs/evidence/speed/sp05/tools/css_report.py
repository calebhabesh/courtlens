import sys,re
from collections import defaultdict
c=open(sys.argv[1]).read()
def blocks(s, i=0):
    """yield (prelude, body, start, end) for top-level blocks of s"""
    out=[]; depth=0; start=i; pre_start=i
    j=i
    while j < len(s):
        ch=s[j]
        if ch=='{':
            if depth==0: brace=j
            depth+=1
        elif ch=='}':
            depth-=1
            if depth==0:
                out.append((s[pre_start:brace].strip(), s[brace+1:j])); pre_start=j+1
        elif ch==';' and depth==0: pre_start=j+1
        j+=1
    return out
top=blocks(c)
agg=defaultdict(int)
for pre, body in top: agg[pre[:40]]+=len(pre)+len(body)+2
print("top-level:"); [print(f"  {v:>8,} {k}") for k,v in sorted(agg.items(), key=lambda kv:-kv[1])[:12]]
# within the biggest layers, aggregate by selector's first class token
for pre, body in top:
    if len(body) < 50000: continue
    sub=defaultdict(int)
    def walk(b):
        for p, bd in blocks(b):
            if p.startswith("@media") or p.startswith("@supports") or p.startswith("@container") or p.startswith("@layer"):
                walk(bd); continue
            m=re.search(r"\.([a-zA-Z][\w-]*?)(?:-|\b|:)", p) ; k=m.group(1) if m else p[:20]
            k=re.split(r"[-_]", k)[0] if not k.startswith("kit") else "kit"
            sub[k]+=len(p)+len(bd)+2
    walk(body)
    print(f"{pre[:40]} ({len(body):,}):")
    for k,v in sorted(sub.items(), key=lambda kv:-kv[1])[:30]: print(f"   {v:>8,} {k}")
