"""Create the initial CourtLoad operational schema.

Revision ID: 0001
Revises: None
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "data_quality_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("passed_count", sa.Integer(), nullable=False),
        sa.Column("failed_count", sa.Integer(), nullable=False),
        sa.Column("results_json", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "ingestion_runs",
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("source_name", sa.String(length=50), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("requested_count", sa.Integer(), nullable=False),
        sa.Column("received_count", sa.Integer(), nullable=False),
        sa.Column("inserted_count", sa.Integer(), nullable=False),
        sa.Column("updated_count", sa.Integer(), nullable=False),
        sa.Column("unchanged_count", sa.Integer(), nullable=False),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("run_id"),
    )
    op.create_index(op.f("ix_ingestion_runs_status"), "ingestion_runs", ["status"])
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_table(
        "fantasy_leagues",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("timezone", sa.String(length=80), nullable=False),
        sa.Column("week_starts_on", sa.Integer(), nullable=False),
        sa.Column("lineup_mode", sa.String(length=30), nullable=False),
        sa.Column("lineup_slots_json", sa.JSON(), nullable=False),
        sa.Column("acquisition_limit", sa.Integer(), nullable=False),
        sa.Column("scoring_mode", sa.String(length=30), nullable=False),
        sa.Column("scoring_rules_json", sa.JSON(), nullable=False),
        sa.Column("scoring_rules_version", sa.String(length=64), nullable=False),
        sa.Column("config_version", sa.Integer(), nullable=False),
        sa.Column("roster_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_fantasy_leagues_owner_id"), "fantasy_leagues", ["owner_id"])
    op.create_table(
        "raw_objects",
        sa.Column("object_id", sa.String(length=36), nullable=False),
        sa.Column("ingestion_run_id", sa.String(length=36), nullable=False),
        sa.Column("source_name", sa.String(length=50), nullable=False),
        sa.Column("resource", sa.String(length=50), nullable=False),
        sa.Column("source_key", sa.String(length=200), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("storage_uri", sa.Text(), nullable=False),
        sa.Column("source_schema_version", sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(["ingestion_run_id"], ["ingestion_runs.run_id"]),
        sa.PrimaryKeyConstraint("object_id"),
        sa.UniqueConstraint(
            "source_name",
            "resource",
            "source_key",
            "content_sha256",
            name="uq_raw_version",
        ),
    )
    op.create_index(op.f("ix_raw_objects_ingestion_run_id"), "raw_objects", ["ingestion_run_id"])
    op.create_table(
        "dim_teams",
        sa.Column("team_key", sa.Integer(), nullable=False),
        sa.Column("source_team_id", sa.Integer(), nullable=False),
        sa.Column("abbreviation", sa.String(length=8), nullable=False),
        sa.Column("city", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("full_name", sa.String(length=160), nullable=False),
        sa.Column("conference", sa.String(length=20), nullable=True),
        sa.Column("division", sa.String(length=30), nullable=True),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_object_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["source_object_id"], ["raw_objects.object_id"]),
        sa.PrimaryKeyConstraint("team_key"),
        sa.UniqueConstraint("source_team_id"),
    )
    op.create_index(op.f("ix_dim_teams_abbreviation"), "dim_teams", ["abbreviation"])
    op.create_table(
        "fantasy_week_states",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("league_id", sa.String(length=36), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("acquisitions_used", sa.Integer(), nullable=False),
        sa.Column("recorded_as_of", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["league_id"], ["fantasy_leagues.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("league_id", "week_start", name="uq_league_week_state"),
    )
    op.create_table(
        "dim_players",
        sa.Column("player_key", sa.Integer(), nullable=False),
        sa.Column("source_player_id", sa.Integer(), nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("full_name", sa.String(length=220), nullable=False),
        sa.Column("listed_position", sa.String(length=20), nullable=True),
        sa.Column("current_team_key", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_object_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["current_team_key"], ["dim_teams.team_key"]),
        sa.ForeignKeyConstraint(["source_object_id"], ["raw_objects.object_id"]),
        sa.PrimaryKeyConstraint("player_key"),
        sa.UniqueConstraint("source_player_id"),
    )
    op.create_index(op.f("ix_dim_players_full_name"), "dim_players", ["full_name"])
    op.create_table(
        "fct_games",
        sa.Column("game_key", sa.Integer(), nullable=False),
        sa.Column("source_game_id", sa.Integer(), nullable=False),
        sa.Column("season", sa.Integer(), nullable=False),
        sa.Column("game_type", sa.String(length=30), nullable=False),
        sa.Column("scheduled_start_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("status_state", sa.String(length=30), nullable=False),
        sa.Column("home_team_key", sa.Integer(), nullable=False),
        sa.Column("away_team_key", sa.Integer(), nullable=False),
        sa.Column("home_score", sa.Integer(), nullable=True),
        sa.Column("away_score", sa.Integer(), nullable=True),
        sa.Column("neutral_site", sa.Boolean(), nullable=False),
        sa.Column("postponed", sa.Boolean(), nullable=False),
        sa.Column("source_object_id", sa.String(length=36), nullable=True),
        sa.Column("last_observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["away_team_key"], ["dim_teams.team_key"]),
        sa.ForeignKeyConstraint(["home_team_key"], ["dim_teams.team_key"]),
        sa.ForeignKeyConstraint(["source_object_id"], ["raw_objects.object_id"]),
        sa.PrimaryKeyConstraint("game_key"),
        sa.UniqueConstraint("source_game_id"),
    )
    op.create_index(
        op.f("ix_fct_games_scheduled_start_utc"),
        "fct_games",
        ["scheduled_start_utc"],
    )
    op.create_index(op.f("ix_fct_games_season"), "fct_games", ["season"])
    op.create_index(op.f("ix_fct_games_status_state"), "fct_games", ["status_state"])
    op.create_table(
        "bridge_player_observed_team_stints",
        sa.Column("stint_id", sa.String(length=36), nullable=False),
        sa.Column("player_key", sa.Integer(), nullable=False),
        sa.Column("team_key", sa.Integer(), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("first_source_object_id", sa.String(length=36), nullable=True),
        sa.Column("last_source_object_id", sa.String(length=36), nullable=True),
        sa.Column("reconstruction_status", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(["first_source_object_id"], ["raw_objects.object_id"]),
        sa.ForeignKeyConstraint(["last_source_object_id"], ["raw_objects.object_id"]),
        sa.ForeignKeyConstraint(["player_key"], ["dim_players.player_key"]),
        sa.ForeignKeyConstraint(["team_key"], ["dim_teams.team_key"]),
        sa.PrimaryKeyConstraint("stint_id"),
        sa.UniqueConstraint("player_key", "team_key", "valid_from", name="uq_player_team_stint"),
    )
    op.create_index(
        op.f("ix_bridge_player_observed_team_stints_player_key"),
        "bridge_player_observed_team_stints",
        ["player_key"],
    )
    op.create_index(
        op.f("ix_bridge_player_observed_team_stints_team_key"),
        "bridge_player_observed_team_stints",
        ["team_key"],
    )
    op.create_table(
        "fantasy_player_status_overrides",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("league_id", sa.String(length=36), nullable=False),
        sa.Column("player_key", sa.Integer(), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["league_id"], ["fantasy_leagues.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_key"], ["dim_players.player_key"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "fantasy_roster_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("league_id", sa.String(length=36), nullable=False),
        sa.Column("player_key", sa.Integer(), nullable=False),
        sa.Column("roster_role", sa.String(length=30), nullable=False),
        sa.Column("eligible_slot_types_json", sa.JSON(), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=True),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("roster_version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["league_id"], ["fantasy_leagues.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_key"], ["dim_players.player_key"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("league_id", "player_key", name="uq_league_roster_player"),
    )
    op.create_table(
        "fantasy_watchlist_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("league_id", sa.String(length=36), nullable=False),
        sa.Column("player_key", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["league_id"], ["fantasy_leagues.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_key"], ["dim_players.player_key"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("league_id", "player_key", name="uq_league_watchlist_player"),
    )
    op.create_table(
        "fct_player_games",
        sa.Column("source_stat_id", sa.Integer(), nullable=False),
        sa.Column("game_key", sa.Integer(), nullable=False),
        sa.Column("player_key", sa.Integer(), nullable=False),
        sa.Column("team_key", sa.Integer(), nullable=False),
        sa.Column("opponent_team_key", sa.Integer(), nullable=False),
        sa.Column("is_home", sa.Boolean(), nullable=False),
        sa.Column("minutes", sa.Float(), nullable=True),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("rebounds", sa.Integer(), nullable=False),
        sa.Column("assists", sa.Integer(), nullable=False),
        sa.Column("steals", sa.Integer(), nullable=False),
        sa.Column("blocks", sa.Integer(), nullable=False),
        sa.Column("turnovers", sa.Integer(), nullable=False),
        sa.Column("three_pointers_made", sa.Integer(), nullable=False),
        sa.Column("field_goals_made", sa.Integer(), nullable=False),
        sa.Column("field_goals_attempted", sa.Integer(), nullable=False),
        sa.Column("free_throws_made", sa.Integer(), nullable=False),
        sa.Column("free_throws_attempted", sa.Integer(), nullable=False),
        sa.Column("offensive_rebounds", sa.Integer(), nullable=False),
        sa.Column("defensive_rebounds", sa.Integer(), nullable=False),
        sa.Column("personal_fouls", sa.Integer(), nullable=False),
        sa.Column("plus_minus", sa.Integer(), nullable=True),
        sa.Column("appearance_status", sa.String(length=30), nullable=False),
        sa.Column("source_object_id", sa.String(length=36), nullable=True),
        sa.Column("last_observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["game_key"], ["fct_games.game_key"]),
        sa.ForeignKeyConstraint(["opponent_team_key"], ["dim_teams.team_key"]),
        sa.ForeignKeyConstraint(["player_key"], ["dim_players.player_key"]),
        sa.ForeignKeyConstraint(["source_object_id"], ["raw_objects.object_id"]),
        sa.ForeignKeyConstraint(["team_key"], ["dim_teams.team_key"]),
        sa.PrimaryKeyConstraint("source_stat_id"),
        sa.UniqueConstraint("game_key", "player_key", name="uq_player_full_game_stat"),
    )
    op.create_index(
        "ix_player_games_player_tip",
        "fct_player_games",
        ["player_key", "game_key"],
    )
    op.create_table(
        "planner_scenarios",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("league_id", sa.String(length=36), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("dropped_player_key", sa.Integer(), nullable=False),
        sa.Column("added_player_key", sa.Integer(), nullable=False),
        sa.Column("scoring_rules_version", sa.String(length=64), nullable=False),
        sa.Column("league_config_version", sa.Integer(), nullable=False),
        sa.Column("roster_version", sa.Integer(), nullable=False),
        sa.Column("acquisitions_remaining_before", sa.Integer(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("result_json", sa.JSON(), nullable=False),
        sa.Column("data_snapshot_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["added_player_key"], ["dim_players.player_key"]),
        sa.ForeignKeyConstraint(["data_snapshot_id"], ["ingestion_runs.run_id"]),
        sa.ForeignKeyConstraint(["dropped_player_key"], ["dim_players.player_key"]),
        sa.ForeignKeyConstraint(["league_id"], ["fantasy_leagues.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("planner_scenarios")
    op.drop_index("ix_player_games_player_tip", table_name="fct_player_games")
    op.drop_table("fct_player_games")
    op.drop_table("fantasy_watchlist_entries")
    op.drop_table("fantasy_roster_entries")
    op.drop_table("fantasy_player_status_overrides")
    op.drop_index(
        op.f("ix_bridge_player_observed_team_stints_team_key"),
        table_name="bridge_player_observed_team_stints",
    )
    op.drop_index(
        op.f("ix_bridge_player_observed_team_stints_player_key"),
        table_name="bridge_player_observed_team_stints",
    )
    op.drop_table("bridge_player_observed_team_stints")
    op.drop_index(op.f("ix_fct_games_status_state"), table_name="fct_games")
    op.drop_index(op.f("ix_fct_games_season"), table_name="fct_games")
    op.drop_index(op.f("ix_fct_games_scheduled_start_utc"), table_name="fct_games")
    op.drop_table("fct_games")
    op.drop_index(op.f("ix_dim_players_full_name"), table_name="dim_players")
    op.drop_table("dim_players")
    op.drop_table("fantasy_week_states")
    op.drop_index(op.f("ix_dim_teams_abbreviation"), table_name="dim_teams")
    op.drop_table("dim_teams")
    op.drop_index(op.f("ix_raw_objects_ingestion_run_id"), table_name="raw_objects")
    op.drop_table("raw_objects")
    op.drop_index(op.f("ix_fantasy_leagues_owner_id"), table_name="fantasy_leagues")
    op.drop_table("fantasy_leagues")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    op.drop_index(op.f("ix_ingestion_runs_status"), table_name="ingestion_runs")
    op.drop_table("ingestion_runs")
    op.drop_table("data_quality_runs")
