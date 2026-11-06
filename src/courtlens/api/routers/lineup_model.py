"""Research → Lineup Model (courtlens-lineup-model-v1, R14): results, map and the lineup tool."""

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from courtlens.services import lineup_model

router = APIRouter(prefix="/lineup-model", tags=["lineup model"])


@router.get("")
def lineup_model_page() -> dict[str, Any]:
    try:
        return lineup_model.page()
    except (OSError, ValueError, KeyError) as error:
        raise HTTPException(503, "Lineup model results unavailable") from error


@router.get("/players")
def lineup_model_players() -> dict[str, Any]:
    try:
        return lineup_model.players()
    except (OSError, ValueError) as error:
        raise HTTPException(503, "Lineup model results unavailable") from error


@router.get("/fit")
def lineup_model_fit(
    players: str = Query(..., description="Five NBA player ids, comma-separated"),
) -> dict[str, Any]:
    try:
        return lineup_model.fit(players.split(","))
    except KeyError as error:
        raise HTTPException(404, f"Not in the 2026-27 fit: {error.args[0]}") from error
    except ValueError as error:
        if "changed" in str(error):
            raise HTTPException(503, "Lineup model results unavailable") from error
        raise HTTPException(422, str(error)) from error
    except OSError as error:
        raise HTTPException(503, "Lineup model results unavailable") from error
