"""Research → Projected Impact: frozen projections, final test, weekly game-level score."""

import json
from typing import Any

from fastapi import APIRouter, HTTPException

from courtlens.services.projected_impact import (
    CARD_PATH,
    load_manifest,
    load_projections,
    read_summary,
)

router = APIRouter(prefix="/projected-impact", tags=["projected impact"])


def _frozen() -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        return load_manifest(), load_projections()
    except (OSError, ValueError) as error:
        raise HTTPException(503, "Frozen projections unavailable") from error


@router.get("")
def projected_impact_page() -> dict[str, Any]:
    manifest, projections = _frozen()
    try:
        card = json.loads(CARD_PATH.read_text())
    except (OSError, ValueError) as error:
        raise HTTPException(503, "Projected impact model card unavailable") from error
    rows = [{k: v for k, v in r.items() if k != "contributions"} for r in projections["players"]]
    return {
        "model": {
            key: manifest[key]
            for key in (
                "version",
                "registration",
                "registration_sha256",
                "frozen_at",
                "selected",
                "projections_sha256",
                "manifest_sha256",
                "trained_through",
                "calibrated_on",
                "feature_cutoff",
                "f1_waiver",
                "fallback_rating",
                "conformal",
            )
        },
        "card": card,
        "scorecard": read_summary(),
        "players": rows,
    }


@router.get("/players/{player_id}")
def projected_impact_player(player_id: str) -> dict[str, Any]:
    _, projections = _frozen()
    for row in projections["players"]:
        if row["player_id"] == player_id:
            return {
                "season": projections["season"],
                "selected": projections["selected"],
                "base": projections["contribution_base"],
                "player": row,
            }
    raise HTTPException(404, "No frozen projection for this player")
