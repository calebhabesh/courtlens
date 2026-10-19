from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from courtlens.services import roster_shapes as rs
from courtlens.services.roster_shapes import (
    BOX_NET,
    EXPONENT,
    PLAYOFF_PRIOR_GAMES,
    REPLACEMENT_LEVEL,
    TEAM_MINUTES,
    box_capacity,
    continuity,
    fit_ease,
    percentile_ranks,
    playoff_shifts,
    rebalance,
    roster_shapes,
    shape_size,
    team_summary,
)


def test_size_is_dpm_over_replacement_to_the_power_times_minutes() -> None:
    assert shape_size(3.0, 30.0) == pytest.approx((3.0 - REPLACEMENT_LEVEL) ** EXPONENT * 30.0)
    # At or below replacement is a known zero, never negative.
    assert shape_size(-2.0, 30.0) == 0
    assert shape_size(-5.0, 30.0) == 0


@pytest.mark.parametrize(("dpm", "minutes"), [(None, 30.0), (2.0, None), (None, None)])
def test_size_unknown_inputs_stay_unknown_not_zero(
    dpm: float | None, minutes: float | None
) -> None:
    assert shape_size(dpm, minutes) is None


def test_box_is_a_team_of_240_minutes_at_its_per_player_dpm() -> None:
    assert box_capacity() == pytest.approx(shape_size(BOX_NET / 5, TEAM_MINUTES))


def test_rebalance_caps_rosters_over_240_minutes_by_rotation() -> None:
    assert rebalance({"a": 100.0, "b": 100.0}) == {"a": 100.0, "b": 100.0}
    # In order of minutes: the stars keep theirs, the next gets what is left, the rest none.
    capped = rebalance(
        {"bench": 20.0, "star": 36.0, "c": 34.0, "d": 30.0} | {f"r{i}": 25.0 for i in range(6)}
    )
    assert sum(capped.values()) == pytest.approx(TEAM_MINUTES)
    assert (capped["star"], capped["c"], capped["d"]) == (36.0, 34.0, 30.0)
    assert [capped[f"r{i}"] for i in range(6)] == [25.0, 25.0, 25.0, 25.0, 25.0, 15.0]
    assert capped["bench"] == 0.0


def test_percentile_ranks_use_mid_ranks_for_ties() -> None:
    assert percentile_ranks({"a": 1.0, "b": 2.0, "c": 2.0, "d": 3.0}) == {
        "a": 0.125,
        "b": 0.5,
        "c": 0.5,
        "d": 0.875,
    }


def test_fit_ease_rewards_quality_defence_spacing_and_low_usage() -> None:
    inputs = {
        "connector": {"dpm": 3.0, "d_dpm": 2.0, "three_rate": 0.5, "usg_pct": 14.0},
        "solo": {"dpm": -1.0, "d_dpm": -2.0, "three_rate": 0.1, "usg_pct": 30.0},
        "mid": {"dpm": 1.0, "d_dpm": 0.0, "three_rate": 0.3, "usg_pct": 20.0},
        "partial": {"dpm": 1.0, "d_dpm": 0.0},
    }
    ease = fit_ease(inputs)
    # Players missing an input have no fit; the rest are banded in equal counts, easiest first.
    assert "partial" not in ease
    assert ease["connector"][0] > ease["mid"][0] > ease["solo"][0]
    assert ease["connector"][1] == 0 and ease["solo"][1] == 5


def test_playoff_shift_is_shrunk_games_weighted_offensive_change() -> None:
    def entry(season: str, phase: str, players: dict[str, Any]) -> dict[str, Any]:
        return {"season": season, "phase": phase, "players": players}

    entries = [
        entry("2024-25", "regular_season", {"1": {"o_dpm": 1.0, "career_games": 100}}),
        entry("2024-25", "playoffs", {"1": {"o_dpm": 2.0, "career_games": 110}}),
        entry("2025-26", "regular_season", {"1": {"o_dpm": 2.0, "career_games": 180}}),
        # No playoff games: no shift and no weight.
        entry("2025-26", "playoffs", {"1": {"o_dpm": 5.0, "career_games": 180}}),
        entry("2026-27", "regular_season", {"1": {"o_dpm": 0.0, "career_games": 190}}),
        entry("2026-27", "playoffs", {"1": {"o_dpm": 9.0, "career_games": 200}}),
    ]
    shift, games = playoff_shifts(entries, "2025-26")["1"]
    assert games == 10
    assert shift == pytest.approx(1.0 * 10 / (10 + PLAYOFF_PRIOR_GAMES))


def test_continuity() -> None:
    assert continuity("DEN", {"DEN"}) == "returning"
    assert continuity("DEN", {"DAL"}) == "new"
    assert continuity("DEN", None) == "unknown"
    assert continuity("DEN", set()) == "unknown"


def player(
    size: float | None, ease: float | None = 0.5, playoff: float | None = None
) -> dict[str, Any]:
    return {"size": size, "size_playoff": size if playoff is None else playoff, "fit_ease": ease}


def test_team_summary_fills_known_sizes_and_weights_ease_by_size() -> None:
    summary = team_summary(
        [player(3.0, 1.0, 4.0), player(1.0, 0.0), player(0.0), player(None)], 8.0
    )
    assert summary["size"] == pytest.approx(4.0)
    assert summary["fill"] == pytest.approx(0.5)
    assert summary["fill_playoff"] == pytest.approx(5.0 / 8.0)
    assert summary["fit_ease"] == pytest.approx(0.75)
    assert summary["sized_players"] == 2
    assert summary["below_replacement_players"] == 1
    assert summary["unknown_players"] == 1


STORE = {
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
            pid: {
                "season": "2025-26",
                "minutes": 2000.0,
                "games": 70,
                "qualified": True,
                "primary": 0,
                "membership": [0.9, 0.1],
                "features": {"usg_pct": usg, "three_rate": 0.4},
            }
            for pid, usg in (("1", 30.0), ("2", 15.0))
        },
    },
}
DARKO = {
    "sealed_at": "fixture",
    "entries": [
        {
            "season": "2025-26",
            "phase": "regular_season",
            "as_of": "2026-04-12",
            "data_date": "2026-04-12",
            "raw_sha256": "r" * 64,
            "players": {
                "1": {"dpm": 4.0, "o_dpm": 3.0, "d_dpm": 1.0, "career_games": 300},
                "2": {"dpm": -3.0, "o_dpm": -2.0, "d_dpm": -1.0, "career_games": 50},
            },
        }
    ],
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


@pytest.fixture(autouse=True)
def clear_cache() -> None:
    rs._cache.clear()


def test_projected_shapes_assemble_thirty_teams_with_unknowns_kept() -> None:
    roster = {
        "context": MagicMock(model_dump=lambda mode: {"dataset_id": "idx"}),
        "label": "2026-27 · Projected",
        "statistics_release_id": "rel",
        "players": [
            index_row("1", "DEN", 82 * 30.0),
            index_row("2", "DEN", 1000.0),
            index_row("3", "DEN", None),
        ],
    }
    with (
        patch.object(rs, "load_value_store", return_value=STORE),
        patch.object(rs, "load_darko_store", return_value=DARKO),
        patch.object(rs, "projected_roster", return_value=roster) as projected,
        patch.object(rs, "_previous_teams", return_value={"1": {"DEN"}, "2": {"DAL"}}),
    ):
        body = roster_shapes(MagicMock(), "idx", "rel")
    projected.assert_called_once()
    assert body["projected"] and body["season"] == "2026-27"
    assert len(body["teams"]) == 30
    den = next(t for t in body["teams"] if t["team_tricode"] == "DEN")
    star, bench, rookie = den["roster"]
    assert star["minutes_per_game"] == pytest.approx(30.0)
    assert star["size"] == pytest.approx(shape_size(4.0, 30.0))
    assert star["continuity"] == "returning" and "features" not in star["archetype"]
    assert star["fit_band"] is not None
    assert bench["size"] == 0 and bench["continuity"] == "new"
    assert rookie["size"] is None and rookie["dpm"] is None and rookie["continuity"] == "unknown"
    assert len(rookie["unknown_reasons"]) == 3
    assert den["fill"] == pytest.approx(star["size"] / box_capacity())
    empty = next(t for t in body["teams"] if t["team_tricode"] == "BOS")
    assert empty["players"] == 0 and empty["fit_ease"] is None


def test_actual_season_reads_team_minutes_per_team_game() -> None:
    minutes = {
        ("1", "1610612743"): (2460.0, 82, "Player 1"),
        ("2", "1610612742"): (100.0, 10, "P2"),
    }
    games = {"1610612743": 82, "1610612742": 82}
    with (
        patch.object(rs, "load_value_store", return_value=STORE),
        patch.object(rs, "load_darko_store", return_value=DARKO),
        patch.object(rs, "_season_minutes", return_value=("rel", minutes, games)),
        patch.object(rs, "_previous_teams", return_value={"1": {"DEN"}}),
    ):
        body = roster_shapes(MagicMock(), None, "rel", "2025-26")
    assert not body["projected"] and body["roster_context"] is None
    den = next(t for t in body["teams"] if t["team_tricode"] == "DEN")
    assert den["roster"][0]["minutes_per_game"] == pytest.approx(30.0)
    dal = next(t for t in body["teams"] if t["team_tricode"] == "DAL")
    assert dal["roster"][0]["continuity"] == "unknown"


def test_unsupported_season_is_rejected() -> None:
    with (
        patch.object(rs, "load_value_store", return_value=STORE),
        patch.object(rs, "load_darko_store", return_value=DARKO),
        pytest.raises(HTTPException) as err,
    ):
        roster_shapes(MagicMock(), None, "rel", "2019-20")
    assert err.value.status_code == 422


@pytest.mark.parametrize("missing", ["load_value_store", "load_darko_store"])
def test_roster_shapes_without_manifests_is_unavailable(missing: str) -> None:
    with (
        patch.object(rs, "load_value_store", return_value=STORE),
        patch.object(rs, "load_darko_store", return_value=DARKO),
        patch.object(rs, missing, return_value=None),
        pytest.raises(HTTPException) as err,
    ):
        roster_shapes(MagicMock(), None, None)
    assert err.value.status_code == 503


def test_projection_prefers_darko_current_ratings_and_expected_minutes() -> None:
    current = {
        **DARKO["entries"][0],
        "phase": "current",
        "as_of": "2026-10-19",
        "players": {
            "1": {"dpm": 5.0, "o_dpm": 3.5, "d_dpm": 1.5, "career_games": 320, "x_minutes": 30.0},
            "2": {"dpm": -1.0, "o_dpm": -1.0, "d_dpm": 0.0, "career_games": 60, "x_minutes": None},
        },
    }
    roster = {
        "context": MagicMock(model_dump=lambda mode: {"dataset_id": "idx"}),
        "label": "2026-27 · Projected",
        "statistics_release_id": "rel",
        "players": [index_row("1", "DEN", 82 * 10.0), index_row("2", "DEN", 82 * 20.0)],
    }
    with (
        patch.object(rs, "load_value_store", return_value=STORE),
        patch.object(
            rs, "load_darko_store", return_value={**DARKO, "entries": [*DARKO["entries"], current]}
        ),
        patch.object(rs, "projected_roster", return_value=roster),
        patch.object(rs, "_previous_teams", return_value={}),
    ):
        body = roster_shapes(MagicMock(), "idx", "rel")
    assert body["minutes_source"] == "darko_expected" and body["dpm"]["phase"] == "current"
    den = next(t for t in body["teams"] if t["team_tricode"] == "DEN")
    star, bench = den["roster"]
    # Expected minutes where DARKO has them, else reference minutes over 82 games.
    assert star["minutes_per_game"] == pytest.approx(30.0) and star["dpm"] == 5.0
    assert bench["minutes_per_game"] == pytest.approx(20.0)
    assert "DARKO's expected minutes" in body["limitations"][0]


def test_history_folds_era_ids_into_franchises_by_season() -> None:
    entries = [
        {"season": "2005-06", "phase": "regular_season", "players": {"1": {"dpm": 3.0}}},
        {"season": "2005-06", "phase": "playoffs", "players": {"1": {"dpm": 9.0}}},
        {"season": "2025-26", "phase": "regular_season", "players": {"2": {"dpm": 1.0}}},
    ]
    minutes = {
        "2005-06": ("rel", {("1", "SEA"): (82 * 30.0, 82, "P1")}, {"SEA": 82}),
        "2025-26": ("rel", {("2", "1610612760"): (41 * 20.0, 41, "P2")}, {"1610612760": 82}),
    }
    rs._history_cache.clear()
    with (
        patch.object(rs, "load_darko_store", return_value={"sealed_at": "h", "entries": entries}),
        patch.object(rs, "_season_minutes", side_effect=lambda _s, _r, season: minutes[season]),
    ):
        body = rs.roster_shape_history(MagicMock(), "rel")
    assert [s["season"] for s in body["seasons"]] == ["2005-06", "2025-26"]
    # SEA's 2005-06 games belong to the Thunder franchise; playoff snapshots are not used.
    assert body["seasons"][0]["fills"] == {
        "1610612760": pytest.approx(shape_size(3.0, 30.0) / box_capacity())
    }
    assert body["seasons"][1]["fills"]["1610612760"] == pytest.approx(
        shape_size(1.0, 10.0) / box_capacity()
    )
