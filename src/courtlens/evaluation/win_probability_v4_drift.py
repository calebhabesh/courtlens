"""The Market-informed model's drift interval (v4, W3b).

The Original's monitor, with v4's own interval: the same game bootstrap of calibration error by
window size, read from v4's saved stage C predictions (`v4_check`, 2024-25 and 2025-26) instead of
the Original's. Nothing is fitted. Writes the committed file the nightly job reads.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from typing import Any

import numpy as np

from courtlens.evaluation import win_probability_v4 as v4
from courtlens.evaluation.win_probability_freeze import TEST_SEASONS, drift_interval
from courtlens.evaluation.win_probability_models import read_prediction
from courtlens.services.win_probability_head_to_head import DRIFT_PATH

PREDICTIONS = "v4_check"


def _load(season: str) -> np.ndarray:
    return read_prediction(v4.OUTPUT, PREDICTIONS, season)


def build() -> dict[str, Any]:
    body = drift_interval(_load, "v4's saved stage C predictions (w from stage C)")
    body["version"] = v4.REGISTRATION
    body["predictions"] = {
        season: hashlib.sha256(
            (v4.OUTPUT / "predictions" / PREDICTIONS / f"{season}.npy").read_bytes()
        ).hexdigest()
        for season in TEST_SEASONS
    }
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    body = build()
    DRIFT_PATH.parent.mkdir(parents=True, exist_ok=True)
    DRIFT_PATH.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")
    print(json.dumps({k: body[k] for k in ("all_test_games_calibration_error", "predictions")}))


if __name__ == "__main__":
    main()
