"""Generate presentation-only impact definitions from the serving catalog."""

import json
from pathlib import Path

from courtlens.domain.impact_catalog import IMPACT_CATALOG
from courtlens.domain.impact_extras_catalog import WAVE_TWO

if __name__ == "__main__":
    Path("dashboard/lib/impact-metrics.json").write_text(
        json.dumps(
            {"metrics": [m.to_dict() for m in IMPACT_CATALOG.values()], "unavailable": WAVE_TWO},
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )
