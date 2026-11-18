"""Rebuild tests/ci_file_durations.json, the per-file seconds CI's backend shards are dealt by.

    python scripts/test_python.py -n 4 --junitxml="$PWD/junit.xml"
    python scripts/ci_file_durations.py junit.xml

or, better, from a CI run's backend-tests shards (artifacts coverage-1 and coverage-2):

    gh run download <run id> --pattern 'coverage-*' --dir ci-reports/<run id>
    python scripts/ci_file_durations.py ci-reports/*/*/junit-*.xml

Stale numbers only unbalance the two shards (a file not listed counts as the median); they never
drop or repeat a test. Refresh when one backend-tests shard runs clearly longer than the other.
CI's times are better than a fast local machine's, although only their proportions matter.

Each file's weight is its tests' reported seconds plus PER_TEST_OVERHEAD per test: under xdist a
test also costs scheduling and fixture work the report does not count. Fitting four shard runs
(CI runs 44245107940 and 44246152250) gave wall = 0.316 x reported + 0.131 x tests - 164 s, so a
test is worth about 0.4 reported seconds. A file's time also depends on which Postgres-heavy
files share its runner, so pass the reports of several runs: their sums average that out.
"""

from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ElementTree
from collections import defaultdict
from pathlib import Path

PER_TEST_OVERHEAD = 0.4


def main() -> int:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    seconds: dict[str, float] = defaultdict(float)
    cases = (
        case
        for report in sys.argv[1:]
        for case in ElementTree.parse(report).getroot().iter("testcase")
    )
    for case in cases:
        module = case.get("classname", "").split(".")
        # classname is "tests.unit.test_x" or "tests.unit.test_x.TestClass".
        while module and not module[-1].startswith("test_"):
            module.pop()
        if module:
            seconds["/".join(module) + ".py"] += float(case.get("time", 0)) + PER_TEST_OVERHEAD
    target = Path(__file__).resolve().parents[1] / "tests/ci_file_durations.json"
    rounded = {name: round(value, 1) for name, value in sorted(seconds.items())}
    target.write_text(json.dumps(rounded, indent=1) + "\n")
    print(f"{len(rounded)} files, {sum(rounded.values()):.0f} s -> {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
