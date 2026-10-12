"""PC11 view SQL over real PostgreSQL mart tables (fictional rows, person ids 99xxx)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from courtlens.services import stats_feed_views as views

pytestmark = pytest.mark.postgres

TABLES = {
    "mart_stats_player_defense": "dataset_id text, season text, season_type text, player_id text, "
    "team_id text, category text, source_player_name text, games int, frequency numeric, "
    "defended_fgm numeric, defended_fga numeric, defended_fg_pct numeric, "
    "expected_fg_pct numeric, fg_pct_difference numeric, row_key text",
    "mart_stats_player_hustle": "dataset_id text, season text, season_type text, player_id text, "
    "team_id text, source_player_name text, games int, minutes numeric, contested_shots numeric, "
    "deflections numeric, charges_drawn numeric",
    "mart_stats_season_matchups": "dataset_id text, season text, season_type text, "
    "off_player_id text, def_player_id text, games int, matchup_seconds numeric, "
    "partial_possessions numeric, player_points numeric, team_points numeric, assists numeric, "
    "turnovers numeric, blocks numeric, fgm numeric, fga numeric, fg3m numeric, fg3a numeric, "
    "ftm numeric, fta numeric, help_blocks numeric, shooting_fouls numeric, row_key text",
    "mart_stats_player_play_types": "dataset_id text, season text, season_type text, "
    "player_id text, team_id text, play_type text, side text, source_player_name text, "
    "games int, possessions numeric, frequency numeric, points numeric, "
    "points_per_possession numeric, fgm numeric, fga numeric, efg_pct numeric, "
    "turnover_frequency numeric, shooting_foul_frequency numeric, score_frequency numeric, "
    "source_percentile numeric, row_key text",
    "mart_stats_player_tracking": "dataset_id text, season text, season_type text, "
    "player_id text, team_id text, measure text, stat text, value numeric, row_key text",
    "mart_stats_draft_combine": "draft_year int, player_id text, entity_key text, "
    "source_player_name text, combine_position text, height_no_shoes_inches numeric, "
    "height_shoes_inches numeric, wingspan_inches numeric, standing_reach_inches numeric, "
    "weight_lbs numeric, body_fat_pct numeric, hand_length_inches numeric, "
    "hand_width_inches numeric, standing_vertical_inches numeric, max_vertical_inches numeric, "
    "lane_agility_seconds numeric, three_quarter_sprint_seconds numeric, "
    "stats_dataset_id text, anthro_dataset_id text, row_key text",
    "mart_stats_draft_history": "dataset_id text, draft_year int, player_id text, "
    "source_player_name text, round_number int, round_pick int, overall_pick int, "
    "draft_type text, drafting_team_id text, organization text, organization_type text, "
    "row_key text",
}
ROWS = [
    "INSERT INTO mart_stats_player_defense VALUES "
    "('d1','2025-26','regular_season','99001','1610612761','overall','Fictional One',70,1,"
    "440,1000,0.44,0.5,-0.06,'k1'),"
    "('d1','2025-26','regular_season','99002','1610612761','overall','Fictional Two',70,1,"
    "520,1000,0.52,0.5,0.02,'k2')",
    "INSERT INTO mart_stats_player_hustle VALUES "
    "('h1','2025-26','regular_season','99001','1610612761','Fictional One',70,2000,700,140,3)",
    "INSERT INTO mart_stats_season_matchups VALUES "
    "('m1','2025-26','regular_season','99003','99001',3,600,200,40,90,2,1,0,16,40,4,10,4,5,0,1,'a'),"
    "('m1','2025-26','regular_season','99004','99001',2,300,100,30,60,1,0,0,12,20,2,5,4,4,0,0,'b')",
    "INSERT INTO mart_stats_player_play_types VALUES "
    "('p1','2025-26','regular_season','99001','1610612761','cut','offensive','One',60,300,0.2,"
    "390,1.3,150,240,0.6,0.1,0.1,0.6,0.9,'c1'),"
    "('p1','2025-26','regular_season','99002','1610612761','cut','offensive','Two',60,100,0.2,"
    "90,0.9,40,80,0.5,0.1,0.1,0.4,0.2,'c2')",
    "INSERT INTO mart_stats_player_tracking VALUES "
    "('t1','2025-26','regular_season','99001','1610612761','drives','gp',50,'x1'),"
    "('t1','2025-26','regular_season','99001','1610612761','drives','min',1500,'x2'),"
    "('t1','2025-26','regular_season','99001','1610612761','drives','drives',500,'x3'),"
    "('t1','2025-26','regular_season','99001','1610612761','passing','gp',50,'x4'),"
    "('t1','2025-26','regular_season','99001','1610612761','passing','passes_made',2500,'x5')",
    "INSERT INTO mart_stats_draft_combine (draft_year, player_id, source_player_name, "
    "combine_position, height_no_shoes_inches, wingspan_inches, stats_dataset_id, "
    "anthro_dataset_id, row_key) VALUES "
    "(2025,'99001','Fictional One','C',84,92,'c1','c2','r1'),"
    "(2024,'99002','Fictional Two','G',75,79,'c1','c2','r2')",
    "INSERT INTO mart_stats_draft_history (dataset_id, draft_year, player_id, overall_pick, "
    "drafting_team_id) VALUES ('dh',2025,'99001',3,'1610612761')",
]


@pytest.fixture
def marts(workbench_db, monkeypatch):
    schema = workbench_db.scalar(text("SELECT current_schema()"))
    for name, columns in TABLES.items():
        workbench_db.execute(text(f"CREATE TABLE {name} ({columns})"))
    for statement in ROWS:
        workbench_db.execute(text(statement))
    workbench_db.flush()
    monkeypatch.setattr(views, "MART_SCHEMA", schema)
    return workbench_db


def test_defense_and_matchup_views_aggregate_in_sql(marts):
    view = views.defense_view(marts, None, None, "overall", None)
    assert (view["season"], view["phase"], view["matchups_observed"]) == (
        "2025-26",
        "regular_season",
        True,
    )
    first = view["players"][0]
    assert first["player_id"] == "99001" and first["makes_below_expected"] == pytest.approx(60)
    assert first["matchup_points_per_100"] == pytest.approx(70 / 300 * 100)
    assert view["detail"]["player_id"] == "99001" and view["detail"]["opponents"] == 2
    assert view["focus_rule"] == "Most makes below expected (qualified)"
    offense = views.matchups_view(marts, None, None, "99003", "offense")
    assert offense["detail"]["rows"][0]["player_id"] == "99001" and offense["focus_rule"] is None
    defense = views.matchups_view(marts, None, None, None, "defense")
    assert defense["detail"]["player_id"] == "99001" and defense["focus_rule"]
    with pytest.raises(HTTPException, match="422"):
        views.defense_view(marts, None, None, "rim", None)
    with pytest.raises(HTTPException, match="404"):
        views.defense_view(marts, "2019-20", None, "overall", None)


def test_play_type_tracking_and_combine_views(marts):
    plays = views.play_types_view(marts, None, None, "offensive", None)
    assert plays["focus_player_id"] == "99001" and plays["focus"]["breakdown"][0]["label"] == "Cut"
    assert all("breakdown" not in p for p in plays["players"])
    tracking = views.tracking_view(marts, None, None, "drives")
    assert tracking["players"][0]["values"]["drives"] == 10
    profile = views.player_tracking(marts, "99001", None, None)
    assert profile["observed"] and profile["groups"][4]["values"]["passes_made"] == 50
    assert views.player_tracking(marts, "99999", None, None)["observed"] is False
    combine = views.combine_view(marts, None, None)
    assert combine["draft_year"] == 2025 and combine["default_rule"] == "Latest draft class"
    assert combine["rows"][0]["pick_overall"] == 3 and combine["rows"][0]["drafted_by"] == "TOR"
    assert [y["year"] for y in combine["draft_years"]] == [2025, 2024]
    searched = views.combine_view(marts, None, "99002")
    assert searched["draft_year"] == 2024 and searched["selected_player_id"] == "99002"
    assert searched["default_rule"] is None
    missing = views.combine_view(marts, None, "99999")
    assert missing["selected_player_id"] is None and missing["draft_year"] == 2025
