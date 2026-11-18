"""Rebuild tests/ci_file_durations.json, the per-file seconds CI's backend shards are dealt by.

    python scripts/test_python.py -n 4 --junitxml="$PWD/junit.xml"
    python scripts/ci_file_durations.py junit.xml

Stale numbers only unbalance the two shards (a file not listed counts as the median); they never
drop or repeat a test. Refresh when one backend-tests shard runs clearly longer than the other.
Times from a CI run (download its JUnit report) are better than a fast local machine's, although
only their proportions matter.
"""

from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ElementTree
from collections import defaultdict
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    seconds: dict[str, float] = defaultdict(float)
    for case in ElementTree.parse(sys.argv[1]).getroot().iter("testcase"):
        module = case.get("classname", "").split(".")
        # classname is "tests.unit.test_x" or "tests.unit.test_x.TestClass".
        while module and not module[-1].startswith("test_"):
            module.pop()
        if module:
            seconds["/".join(module) + ".py"] += float(case.get("time", 0))
    target = Path(__file__).resolve().parents[1] / "tests/ci_file_durations.json"
    rounded = {name: round(value, 1) for name, value in sorted(seconds.items())}
    target.write_text(json.dumps(rounded, indent=1) + "\n")
    print(f"{len(rounded)} files, {sum(rounded.values()):.0f} s -> {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
