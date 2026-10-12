from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from courtlens.services import roster_shapes as rs
from courtlens.services.roster_shapes import (
    FULL_SEASON_MINUTES,
    REPLACEMENT_LEVEL,
    fit_status,
    roster_shapes,
    team_summary,
    vor,
)


def test_vor_is_value_over_replacement_times_season_share() -> None:
    assert vor(3.0, FULL_SEASON_MINUTES / 2) == pytest.approx((3.0 - REPLACEMENT_LEVEL) / 2)
    # Share is capped at one full season; a negative over-replacement value stays signed.
    assert vor(1.0, FULL_SEASON_MINUTES * 2) == pytest.approx(3.0)
    assert vor(-4.0, FULL_SEASON_MINUTES) == pytest.approx(-2.0)


@pytest.mark.parametrize(("value", "minutes"), [(None, 1000.0), (2.0, None), (None, None)])
def test_vor_unknown_inputs_stay_unknown_not_zero(
    value: float | None, minutes: float | None
) -> None:
    assert vor(value, minutes) is None


def test_fit_is_continuity_only() -> None:
    assert fit_status("DEN", {"DEN"}) == "returning"
    assert fit_status("DEN", {"DAL", "DEN"}) == "returning"
    assert fit_status("DEN", {"DAL"}) == "new"
    assert fit_status("DEN", None) == "unknown"
    assert fit_status("DEN", set()) == "unknown"


def player(
    vor_value: float | None, fit: str = "returning", cluster: int | None = 0
) -> dict[str, Any]:
    archetype = None if cluster is None else {"primary": cluster}
    return {"vor": vor_value, "fit": fit, "archetype": archetype}


def test_team_summary_excludes_unknown_and_below_replacement_from_area() -> None:
    summary = team_summary(
        [
            player(3.0),
            player(1.0, "new", 2),
            player(-0.5, "returning", 1),
            player(None, "unknown", None),
        ]
    )
    assert summary["total_vor"] == pytest.approx(4.0)
    assert summary["sized_players"] == 2
    assert summary["below_replacement_players"] == 1
    assert summary["unknown_players"] == 1
    assert summary["returning_share"] == pytest.approx(0.75)
    assert summary["archetype_mix"] == [
        {"cluster": 0, "vor": 3.0, "share": 0.75},
        {"cluster": 2, "vor": 1.0, "share": 0.25},
    ]


def test_team_summary_without_known_value_has_no_share() -> None:
    summary = team_summary([player(None, "unknown", None)])
    assert summary["total_vor"] == 0
    assert summary["returning_share"] is None


STORE = {
    "value": {
        "label": "Box-prior RAPM (BPR)",
        "scope": {"phase": "regular_season", "seasons": ["2024-25", "2025-26"]},
        "unit": "points per 100 possessions",
        "sha256": "v" * 64,
        "players": {
            "1": {"value": 4.0, "qualified": True, "value_percentile": 95.0},
            "2": {"value": -3.0, "qualified": False, "value_percentile": None},
        },
    },
    "archetypes": {
        "sha256": "a" * 64,
        "names": {
            "status": "confirmed",
            "clusters": [
                {"name": "Lead creator", "short": "creator", "description": "x"},
                {"name": "Rim runner", "short": "rim runner", "description": "y"},
            ],
        },
        "players": {
            "1": {
                "season": "2025-26",
                "minutes": 2000.0,
                "games": 70,
                "qualified": True,
                "primary": 0,
                "membership": [0.9, 0.1],
                "features": {"usg_pct": 30.0},
            }
        },
    },
}


def index_row(pid: str, team: str, minutes: float | None) -> dict[str, Any]:
    reference = None if minutes is None else {"metrics": {"min": minutes, "gp": 60}}
    return {
        "player_id": pid,
        "name": f"Player {pid}",
        "team_tricode": team,
        "listed_position": "G",
        "reference": reference,
    }


def test_roster_shapes_assembles_thirty_teams_with_unknowns_kept() -> None:
    roster = {
        "context": MagicMock(model_dump=lambda mode: {"dataset_id": "idx"}),
        "label": "2026-27 · projected",
        "reference_season": "2025-26",
        "statistics_release_id": "rel",
        "current_season_appearances_in_release": 0,
        "players": [
            index_row("1", "DEN", FULL_SEASON_MINUTES / 2),
            index_row("2", "DEN", 1000.0),
            index_row("3", "DEN", None),
        ],
    }
    with (
        patch.object(rs, "load_value_store", return_value=STORE),
        patch.object(rs, "projected_roster", return_value=roster) as projected,
        patch.object(rs, "_previous_teams", return_value={"1": {"DEN"}, "2": {"DAL"}}),
    ):
        body = roster_shapes(MagicMock(), "idx", "rel")
    projected.assert_called_once()
    assert len(body["teams"]) == 30
    assert body["projected_note"] == "Projected: no 2026-27 minutes played yet."
    den = next(t for t in body["teams"] if t["team_tricode"] == "DEN")
    assert [p["player_id"] for p in den["roster"]] == ["1", "2", "3"]
    star, bench, rookie = den["roster"]
    assert star["vor"] == pytest.approx(3.0) and star["fit"] == "returning"
    assert "features" not in star["archetype"]
    assert star["archetype"]["primary_name"] == "Lead creator"
    assert bench["vor"] < 0 and bench["fit"] == "new" and bench["archetype"] is None
    assert rookie["vor"] is None and rookie["value"] is None and rookie["fit"] == "unknown"
    assert len(rookie["unknown_reasons"]) == 3
    assert body["capacity"] == pytest.approx(3.0)
    empty = next(t for t in body["teams"] if t["team_tricode"] == "BOS")
    assert empty["players"] == 0 and empty["returning_share"] is None


def test_roster_shapes_without_manifest_is_unavailable() -> None:
    with (
        patch.object(rs, "load_value_store", return_value=None),
        pytest.raises(HTTPException) as err,
    ):
        roster_shapes(MagicMock(), None, None)
    assert err.value.status_code == 503
