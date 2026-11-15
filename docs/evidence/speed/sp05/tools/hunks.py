"""hunks.py list <file> | keep <file> <idx,idx..> <out.patch> : -U0 hunks of the working-tree diff."""
import subprocess, sys, re
mode, path = sys.argv[1], sys.argv[2]
d = subprocess.run(["git", "-C", "/home/ethioking/dev/courtlens", "diff", "-U0", "HEAD", "--", path], capture_output=True, text=True).stdout
head, *rest = re.split(r"(?m)^(?=@@ )", d)
if mode == "list":
    for i, h in enumerate(rest):
        lines = h.splitlines()
        print(f"[{i}] {lines[0]}")
        for l in lines[1:7]: print("     " + l[:150])
else:
    keep = {int(x) for x in sys.argv[3].split(",") if x}
    open(sys.argv[4], "w").write(head + "".join(h for i, h in enumerate(rest) if i in keep))
