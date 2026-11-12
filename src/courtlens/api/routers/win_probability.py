"""Research → Win Probability: the frozen model's card, live scorecard, drift and player credit."""

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from courtlens.services import win_probability_head_to_head as head_to_head
from courtlens.services.win_probability_production import (
    CARD_PATH,
    load_manifest,
    read_summary,
    wpa_seasons,
    wpa_table,
)

router = APIRouter(prefix="/win-probability", tags=["win probability"])
# F05: the tested upgrade (courtlens-win-probability-v3). Not adopted; shown as a published result.
UPGRADE_PATH = Path("evaluation/research/derived/courtlens-win-probability-v3-test.json")


def upgrade_result() -> dict[str, Any] | None:
    try:
        body: dict[str, Any] = json.loads(UPGRADE_PATH.read_text())
    except (OSError, ValueError):
        return None
    return body


@router.get("")
def win_probability_page() -> dict[str, Any]:
    try:
        manifest = load_manifest()
        card = json.loads(CARD_PATH.read_text())
    except (OSError, ValueError) as error:
        raise HTTPException(503, "Win probability model card unavailable") from error
    return {
        "model": {
            "version": manifest["version"],
            "registration": manifest["registration"],
            "registration_sha256": manifest["registration_sha256"],
            "manifest_sha256": manifest["manifest_sha256"],
            "frozen_at": manifest["frozen_at"],
            "selected": manifest["selected"],
            "trained_through": manifest["trained_through"],
            "models": manifest["models"],
            "pregame": {k: v for k, v in manifest["pregame"].items() if k != "coefficients"},
            "drift_interval": manifest["drift"],
        },
        "card": card,
        "scorecard": read_summary(),
        "wpa_seasons": wpa_seasons(),
        "upgrade": upgrade_result(),
        # W3b: the Market-informed model against the Original from the same seals, and the dated
        # protocol notes. Existing fields keep their shape.
        "head_to_head": head_to_head.read_summary(),
        "protocol_notes": head_to_head.protocol_notes(),
    }


@router.get("/wpa")
def win_probability_added(season: str = Query(pattern=r"^\d{4}-\d{2}$")) -> dict[str, Any]:
    table = wpa_table(season)
    if table is None:
        raise HTTPException(404, "No win probability added for this season")
    return table
