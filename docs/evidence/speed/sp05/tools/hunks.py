"""-U0 hunks of the working-tree diff.

Usage: hunks.py list <file> | keep <file> <idx,idx..> <out.patch>
"""

import re
import subprocess
import sys

mode, path = sys.argv[1], sys.argv[2]
d = subprocess.run(
    ["git", "-C", "/home/ethioking/dev/courtlens", "diff", "-U0", "HEAD", "--", path],
    capture_output=True,
    text=True,
).stdout
head, *rest = re.split(r"(?m)^(?=@@ )", d)
if mode == "list":
    for i, h in enumerate(rest):
        lines = h.splitlines()
        print(f"[{i}] {lines[0]}")
        for line in lines[1:7]:
            print("     " + line[:150])
else:
    keep = {int(x) for x in sys.argv[3].split(",") if x}
    with open(sys.argv[4], "w") as fh:
        fh.write(head + "".join(h for i, h in enumerate(rest) if i in keep))
