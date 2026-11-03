"""Per-team play-by-play extras: aggregation of committed facts and team-filtered serving."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import patch

from impact_serving_fixture import make_store

from courtlens.config import Settings
from courtlens.domain.impact_extras import aggregate, aggregate_by_team
from courtlens.domain.impact_extras_catalog import BUCKETS
from courtlens.domain.query_spec import QuerySpec, TeamScope
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.services.impact_serving import impact_artifacts, impact_for_query
from courtlens.services.impact_team_splits import VERSION


def fact_row(team: str, points: int, fga: int, rim: int) -> dict[str, Any]:
    box = {
        "points": points,
        "fga": fga,
        "fgm": points // 2,
        "fg3a": 0,
        "fg3m": 0,
        "fta": 0,
        "ftm": 0,
        "assists": 5,
        "steals": 1,
        "blocks": 0,
        "pf": 2,
    }
    return {
        "team": team,
        "support": {"seconds": 2000, "off_controls": 70, "def_controls": 70},
        "box": box,
        "counts": {"rim_assists": rim},
        "buckets": {
            b: {"fga": fga if b == "unknown" else 0, "points": points if b == "unknown" else 0}
            for b in BUCKETS
        },
        "rim_assists_complete": True,
        "charges_complete": True,
        "matchup_fga": None,
        "block_recovery_unresolved": 0,
    }


def game(day: str, players: dict[str, dict[str, Any]]) -> dict[str, Any]:
    facts = {
        "players": players,
        "coverage": {},
        "join_failures": [],
        "matchup_offensive_fga_deltas": {},
    }
    return {"day": day, "quality": "clean", "game_sha256": day, "facts": facts}


GAMES = {
    "g1": game("2024-01-01", {"x": fact_row("A", 30, 20, 4), "y": fact_row("B", 10, 10, 0)}),
    "g2": game("2024-01-02", {"x": fact_row("A", 20, 20, 2), "y": fact_row("B", 10, 10, 1)}),
    "g3": game("2024-02-01", {"x": fact_row("C", 10, 10, 3), "y": fact_row("B", 20, 10, 0)}),
}


def test_team_rows_split_the_season_row_and_keep_the_league_reference() -> None:
    season = aggregate(GAMES, "2024-07-01")
    split = aggregate_by_team(GAMES, "2024-07-01")
    assert split["league"] == season["league"]
    assert set(split["players"]["x"]) == {"A", "C"} and set(split["players"]["y"]) == {"B"}
    rim = {t: r["metrics"]["pbp_rim_assists"]["value"] for t, r in split["players"]["x"].items()}
    assert rim == {"A": 6, "C": 3}
    assert sum(rim.values()) == season["players"]["x"]["metrics"]["pbp_rim_assists"]["value"]
    league_ts = season["league"]["ts"]
    rts = split["players"]["x"]["C"]["metrics"]["impact_rts"]
    assert rts["reference"] == league_ts and abs(rts["value"] - (10 / 20 - league_ts)) < 1e-12
    # A one-team player's team row is the season row.
    assert split["players"]["y"]["B"]["metrics"] == season["players"]["y"]["metrics"]


def write_split(root: Path, team_id: str) -> Path:
    row = {
        "metrics": {"pbp_stl_per100": 7},
        "support": {"pbp_stl_per100": {"qualified": True, "numerator": 7, "denominator": 100}},
    }
    body = {"version": VERSION, "entries": {"extras-one": {"players": {"c": {team_id: row}}}}}
    path, _ = write_artifact(root / "splits", body)
    return path


def test_team_filtered_extras_use_the_team_split_and_bind_it(tmp_path: Path) -> None:
    store, _ = make_store(tmp_path)
    split = write_split(tmp_path, "1610612761")
    query = QuerySpec(season="2023-24", team_scope=TeamScope(team_id="TOR"))
    with (
        patch(
            "courtlens.services.impact_serving.get_settings",
            return_value=Settings(impact_serving_manifest=store),
        ),
        patch(
            "courtlens.services.impact_team_splits.get_settings",
            return_value=Settings(impact_team_splits_manifest=split),
        ),
    ):
        result = impact_for_query(query, "2024-02-01")
        assert result["players"]["c"]["metrics"]["pbp_stl_per100"] == 7
        # Players without games for the team get no extras from the season row.
        assert "pbp_stl_per100" not in result["players"]["a"]["metrics"]
        bound = next(a for a in result["artifacts"] if a["sha256"] == "extras-one")
        assert bound["team_split_sha256"] == split.stem
        assert impact_artifacts(query, "2024-02-01") == (result["artifacts"], result["status"])
        # Unfiltered queries keep the sealed season rows.
        assert (
            impact_for_query(QuerySpec(season="2023-24"), "2024-02-01")["players"]["c"]["metrics"][
                "pbp_stl_per100"
            ]
            == 3
        )


def test_changed_or_missing_split_leaves_team_extras_unknown(tmp_path: Path) -> None:
    store, _ = make_store(tmp_path)
    split = write_split(tmp_path, "1610612761")
    split.write_bytes(split.read_bytes().replace(b'"pbp_stl_per100":7', b'"pbp_stl_per100":9'))
    query = QuerySpec(season="2023-24", team_scope=TeamScope(team_id="TOR"))
    for path in (split, None):
        with (
            patch(
                "courtlens.services.impact_serving.get_settings",
                return_value=Settings(impact_serving_manifest=store),
            ),
            patch(
                "courtlens.services.impact_team_splits.get_settings",
                return_value=Settings(impact_team_splits_manifest=path),
            ),
        ):
            result = impact_for_query(query, "2024-02-01")
            assert "pbp_stl_per100" not in result["players"]["c"]["metrics"]
            assert all(a["sha256"] != "extras-one" for a in result["artifacts"])
