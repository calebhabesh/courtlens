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


def test_player_bio_dates_age_to_the_scope_and_keeps_listings_apart_from_combine(marts):
    from datetime import UTC, date, datetime

    from courtlens.services.player_bio import age_on, current_teams, player_bio

    # Without the bio marts, draft and combine still serve and listings stay unknown.
    early = player_bio(marts, "99001", "2025-26", date(2026, 4, 13))
    assert early["listing_source"] is None and early["age"] is None
    assert early["draft"]["pick"] == 3 and early["combine"]["wingspan_inches"] == 92
    marts.execute(
        text(
            "CREATE TABLE mart_player_bio (player_id text, source_player_name text, jersey text, "
            "listed_position text, listed_height_inches int, listed_weight_lbs numeric, "
            "college text, country text, draft_year int, draft_round int, draft_number int, "
            "from_year int, to_year int, listed_team_id text, birth_date date, "
            "index_season text, dataset_id text, index_observed_at timestamptz, last_team_id text)"
        )
    )
    marts.execute(
        text(
            "CREATE TABLE mart_player_roster_seasons (season text, team_id text, player_id text, "
            "source_player_name text, jersey text, listed_position text, "
            "listed_height_inches int, listed_weight_lbs numeric, birth_date date, "
            "prior_seasons int, school text, how_acquired text, dataset_id text, row_key text)"
        )
    )
    marts.execute(
        text(
            "INSERT INTO mart_player_bio VALUES ('99001','Fictional One','15','C',84,250,"
            "'Fictional U','Fictionland',2025,1,3,2025,2026,'1610612761','2004-04-20',"
            "'2026-27','i','2026-10-01T00:00:00Z','1610612761'),"
            "('99003','Fictional Three',NULL,'G',75,190,NULL,'Fictionland',NULL,NULL,NULL,"
            "2020,2026,NULL,NULL,'2026-27','i','2026-10-01T00:00:00Z','1610612738')"
        )
    )
    marts.execute(
        text(
            "INSERT INTO mart_player_roster_seasons VALUES ('2025-26','1610612761','99001',"
            "'Fictional One','12','C-F',83,245,'2004-04-20',0,'Fictional U',NULL,'r','k')"
        )
    )
    # The season's own roster listing wins over the current index listing.
    bio = player_bio(marts, "99001", "2025-26", date(2026, 4, 13))
    assert bio["listing_source"] == "season_roster"
    assert (bio["jersey"], bio["listed_height_inches"], bio["prior_seasons"]) == ("12", 83, 0)
    assert bio["age"] == 21 and bio["as_of"] == date(2026, 4, 12)
    assert bio["country"] == "Fictionland" and not bio["undrafted"]
    # The current team is the latest index listing, whatever season the page looks at.
    assert bio["current_team"] == {
        "team_id": "1610612761",
        "team_tricode": "TOR",
        "listing_season": "2026-27",
        "index_refreshed_at": datetime(2026, 10, 1, tzinfo=UTC),
        "trade_date": None,
        "trade_source_url": None,
    }
    # Another season has no roster row: the index listing serves, experience stays unknown.
    other = player_bio(marts, "99001", "2024-25", date(2025, 4, 14))
    assert other["listing_source"] == "player_index" and other["prior_seasons"] is None
    assert other["age"] == 20
    undrafted = player_bio(marts, "99003", "2025-26", date(2026, 4, 13))
    assert undrafted["undrafted"] and undrafted["draft"] is None and undrafted["age"] is None
    assert undrafted["current_team"] is None  # No team in the index: a free agent or retired.
    # Stats rows read the same listing; players without a team are left out.
    assert current_teams(marts, ["99001", "99003", "missing"]) == {
        "99001": {
            "team_id": "1610612761",
            "team_tricode": "TOR",
            "listing_season": "2026-27",
            "index_refreshed_at": datetime(2026, 10, 1, tzinfo=UTC),
            "trade_date": None,
            "trade_source_url": None,
        }
    }
    assert undrafted["last_team"]["team_tricode"] == "BOS"
    assert current_teams(marts, []) == {}
    marts.execute(
        text(
            "CREATE TABLE mart_player_transactions (player_id text, type text, "
            "to_team text, date date, source_url text, entry_number int)"
        )
    )
    marts.execute(
        text(
            "INSERT INTO mart_player_transactions VALUES "
            "('99001','traded','TOR','2026-09-14','https://www.basketball-reference.com/players/f/fixture01.html',1),"
            "('99001','extended','TOR','2026-09-22','https://www.basketball-reference.com/players/f/fixture01.html',2)"
        )
    )
    assert current_teams(marts, ["99001"])["99001"]["trade_date"] == date(2026, 9, 14)
    # A later signing elsewhere prevents an old trade to the current listing being misattributed.
    marts.execute(
        text(
            "INSERT INTO mart_player_transactions VALUES "
            "('99001','signed','BOS','2026-10-02','https://www.basketball-reference.com/players/f/fixture01.html',3)"
        )
    )
    assert current_teams(marts, ["99001"])["99001"]["trade_date"] is None
    assert age_on(date(2004, 4, 20), date(2026, 4, 19)) == 21
    assert age_on(date(2004, 4, 20), date(2026, 4, 20)) == 22
