"""Research → Win Probability: the frozen model's card, live scorecard, drift and player credit."""

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from courtlens.services.win_probability_production import (
    CARD_PATH,
    load_manifest,
    read_summary,
    wpa_seasons,
    wpa_table,
)

router = APIRouter(prefix="/win-probability", tags=["win probability"])


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
    }


@router.get("/wpa")
def win_probability_added(season: str = Query(pattern=r"^\d{4}-\d{2}$")) -> dict[str, Any]:
    table = wpa_table(season)
    if table is None:
        raise HTTPException(404, "No win probability added for this season")
    return table
