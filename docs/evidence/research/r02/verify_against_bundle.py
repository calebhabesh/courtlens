"""R02 check: every served 1Y player and node, through the page's code, equals the bundle exactly.

Run from a directory holding the repo's `evaluation/` and `data/`:
    PYTHONPATH=src python docs/evidence/research/r02/verify_against_bundle.py <output.json>
Also audits interval coverage: which rating entries and nodes have intervals.
"""

import json
import sys
from collections import Counter
from pathlib import Path

from courtlens.services.impact_serving import load_impact_store, served_path
from courtlens.services.six_factor_research import (
    FACTORS,
    NODES,
    impact_tree,
    load_reconstruction,
    season_page,
    season_weights,
)


def main(output: Path) -> None:
    store = load_impact_store()
    path = served_path()
    assert store is not None and path is not None
    scopes, mismatches, compared = [], [], Counter()
    entries = [e for e in store["entries"] if e["kind"] == "ratings" and e["scope"]["years"] == 1]
    for entry in sorted(entries, key=lambda e: (e["scope"]["season"], e["scope"]["phase"])):
        season, phase = entry["scope"]["season"], entry["scope"]["phase"]
        intervals = store["intervals"].get(entry["sha256"], {}).get("players", {})
        statuses: Counter[str] = Counter()
        missing_with_value = 0
        below_replicates = 0
        page = season_page(season, phase)
        assert page is not None
        table = {row["player_id"]: row for row in page["players"]}
        for pid, player in entry["players"].items():
            tree = impact_tree(pid, season, phase)
            assert tree is not None
            for key in NODES:
                node, value = tree["metrics"][key], player["metrics"].get(key)
                served = intervals.get(pid, {}).get(key)
                statuses[node["status"]] += 1
                compared["nodes"] += 1
                if value is not None and served is None:
                    missing_with_value += 1
                if value is not None and served and served["replicates"] < 200:
                    below_replicates += 1
                expected = (value, None, None)
                if value is not None and served is not None:
                    expected = (value, served["p10"], served["p90"])
                if (node["value"], node["low"], node["high"]) != expected:
                    mismatches.append([season, phase, pid, key, "tree"])
                if pid in table and table[pid]["metrics"][key] != node:
                    mismatches.append([season, phase, pid, key, "table"])
        scopes.append(
            {
                "season": season,
                "phase": phase,
                "artifact_sha256": entry["sha256"],
                "players_in_fit": len(entry["players"]),
                "players_in_table": len(page["players"]),
                "interval_entry": entry["sha256"] in store["intervals"],
                "values_without_interval": missing_with_value,
                "values_with_under_200_replicates": below_replicates,
                "node_statuses": dict(sorted(statuses.items())),
                "archetypes": [c["player_id"] for c in page["archetypes"]],
            }
        )
    # A value above is exact; the second-stage weights must rebuild the composites too.
    reconstruction = load_reconstruction()
    rebuilt = 0
    for scope in scopes:
        if scope["phase"] != "regular_season":
            continue
        weights = season_weights(reconstruction, scope["season"])
        assert weights is not None
        page = season_page(scope["season"], "regular_season")
        assert page is not None
        for row in page["players"]:
            values = [row["metrics"][key]["value"] for key in FACTORS]
            total = row["composites"]["reconstructed_rapm"]
            if any(value is None for value in values):
                assert total is None
                continue
            rebuilt += 1
            direct = weights["intercept"] + sum(
                weights[key] * value for key, value in zip(FACTORS, values, strict=True)
            )
            assert abs(total - direct) < 1e-9
    report = {
        "manifest_sha256": path.stem,
        "nodes_compared": compared["nodes"],
        "mismatches": mismatches,
        "composites_rebuilt": rebuilt,
        "scopes": scopes,
    }
    output.write_text(json.dumps(report, indent=1, sort_keys=True) + "\n")
    print(report["nodes_compared"], "nodes", len(mismatches), "mismatches", rebuilt, "composites")
    for scope in scopes:
        print(
            scope["season"],
            scope["phase"],
            scope["players_in_fit"],
            scope["players_in_table"],
            "iv" if scope["interval_entry"] else "NO-IV",
            scope["values_without_interval"],
            scope["values_with_under_200_replicates"],
        )


if __name__ == "__main__":
    main(Path(sys.argv[1]))
