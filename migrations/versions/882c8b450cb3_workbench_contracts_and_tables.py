"""workbench_contracts_and_tables

Revision ID: 882c8b450cb3
Revises: 4b19f0a2c7de
Create Date: 2026-10-01 10:35:12.983427
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "882c8b450cb3"
down_revision: str | None = "4b19f0a2c7de"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. workbench_artifacts
    op.create_table(
        "workbench_artifacts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("resource", sa.String(length=100), nullable=False),
        sa.Column("bytes", sa.Integer(), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("source_attribution", sa.Text(), nullable=False),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sha256", "resource"),
    )

    # 2. workbench_acquisitions
    op.create_table(
        "workbench_acquisitions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_name", sa.String(length=100), nullable=False),
        sa.Column("resource", sa.String(length=100), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("bytes", sa.Integer(), nullable=True),
        sa.Column("content_sha256", sa.String(length=64), nullable=True),
        sa.Column("artifact_id", sa.String(length=36), nullable=True),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["artifact_id"], ["workbench_artifacts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 3. workbench_identities
    op.create_table(
        "workbench_identities",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("namespace", sa.String(length=50), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("external_id", sa.String(length=100), nullable=False),
        sa.Column("canonical_id", sa.String(length=36), nullable=True),
        sa.Column("display_name", sa.String(length=200), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["canonical_id"], ["workbench_identities.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("namespace", "kind", "external_id"),
    )

    # 4. workbench_versions
    op.create_table(
        "workbench_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("identity_id", sa.String(length=36), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("parser_version", sa.String(length=40), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["identity_id"], ["workbench_identities.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("identity_id", "content_sha256", "parser_version"),
    )

    # 5. workbench_observations
    op.create_table(
        "workbench_observations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("acquisition_id", sa.String(length=36), nullable=False),
        sa.Column("artifact_id", sa.String(length=36), nullable=False),
        sa.Column("row_identifier", sa.String(length=100), nullable=False),
        sa.Column("identity_id", sa.String(length=36), nullable=False),
        sa.Column("version_id", sa.String(length=36), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("observation_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["acquisition_id"], ["workbench_acquisitions.id"]),
        sa.ForeignKeyConstraint(["artifact_id"], ["workbench_artifacts.id"]),
        sa.ForeignKeyConstraint(["identity_id"], ["workbench_identities.id"]),
        sa.ForeignKeyConstraint(["version_id"], ["workbench_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("acquisition_id", "artifact_id", "row_identifier"),
    )
    op.create_index(
        "ix_workbench_obs_identity_order",
        "workbench_observations",
        ["identity_id", "observation_order"],
    )
    op.create_index(
        "ix_workbench_obs_identity_time",
        "workbench_observations",
        ["identity_id", "observed_at"],
    )

    # 6. workbench_datasets
    op.create_table(
        "workbench_datasets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("membership_sha256", sa.String(length=64), nullable=False),
        sa.Column("semantic_signature", sa.String(length=64), nullable=False),
        sa.Column("source_namespace", sa.String(length=100), nullable=False),
        sa.Column("parser_version", sa.String(length=40), nullable=False),
        sa.Column("quality_version", sa.String(length=40), nullable=False),
        sa.Column("seasons_json", sa.JSON(), nullable=False),
        sa.Column("phases_json", sa.JSON(), nullable=False),
        sa.Column("manifest_json", sa.JSON(), nullable=False),
        sa.Column("coverage_json", sa.JSON(), nullable=False),
        sa.Column("exclusions_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("content_sha256", "membership_sha256"),
    )

    # 7. workbench_dataset_members
    op.create_table(
        "workbench_dataset_members",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("identity_id", sa.String(length=36), nullable=False),
        sa.Column("version_id", sa.String(length=36), nullable=False),
        sa.Column("observation_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["workbench_datasets.id"]),
        sa.ForeignKeyConstraint(["identity_id"], ["workbench_identities.id"]),
        sa.ForeignKeyConstraint(["observation_id"], ["workbench_observations.id"]),
        sa.ForeignKeyConstraint(["version_id"], ["workbench_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset_id", "identity_id"),
    )

    # 8. workbench_schedules
    op.create_table(
        "workbench_schedules",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("game_id", sa.String(length=10), nullable=False),
        sa.Column("season", sa.String(length=10), nullable=False),
        sa.Column("phase", sa.String(length=30), nullable=False),
        sa.Column("game_date", sa.Date(), nullable=False),
        sa.Column("date_precision", sa.String(length=20), nullable=False),
        sa.Column("tipoff_utc", sa.DateTime(timezone=True), nullable=True),
        sa.Column("home_team_id", sa.String(length=100), nullable=False),
        sa.Column("away_team_id", sa.String(length=100), nullable=False),
        sa.Column("game_status", sa.Integer(), nullable=False),
        sa.Column("annotations_json", sa.JSON(), nullable=False),
        sa.Column("source_version_id", sa.String(length=36), nullable=False),
        sa.Column("source_observation_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["workbench_datasets.id"]),
        sa.ForeignKeyConstraint(["source_observation_id"], ["workbench_observations.id"]),
        sa.ForeignKeyConstraint(["source_version_id"], ["workbench_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset_id", "game_id"),
    )
    op.create_index(
        "ix_workbench_schedules_dataset_date",
        "workbench_schedules",
        ["dataset_id", "game_date"],
    )

    # 9. workbench_team_games
    op.create_table(
        "workbench_team_games",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("game_id", sa.String(length=10), nullable=False),
        sa.Column("team_id", sa.String(length=100), nullable=False),
        sa.Column("opponent_id", sa.String(length=100), nullable=False),
        sa.Column("game_date", sa.Date(), nullable=False),
        sa.Column("date_precision", sa.String(length=20), nullable=False),
        sa.Column("tipoff_utc", sa.DateTime(timezone=True), nullable=True),
        sa.Column("season", sa.String(length=10), nullable=False),
        sa.Column("phase", sa.String(length=30), nullable=False),
        sa.Column("side", sa.String(length=10), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("opponent_points", sa.Integer(), nullable=False),
        sa.Column("is_final", sa.Boolean(), nullable=False),
        sa.Column("stats_json", sa.JSON(), nullable=False),
        sa.Column("source_version_id", sa.String(length=36), nullable=False),
        sa.Column("source_observation_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["workbench_datasets.id"]),
        sa.ForeignKeyConstraint(["source_observation_id"], ["workbench_observations.id"]),
        sa.ForeignKeyConstraint(["source_version_id"], ["workbench_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset_id", "game_id", "team_id"),
    )
    op.create_index(
        "ix_wb_team_dataset_team_date",
        "workbench_team_games",
        ["dataset_id", "team_id", "game_date"],
    )

    # 10. workbench_player_games
    op.create_table(
        "workbench_player_games",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("game_id", sa.String(length=10), nullable=False),
        sa.Column("player_id", sa.String(length=100), nullable=False),
        sa.Column("team_id", sa.String(length=100), nullable=False),
        sa.Column("opponent_id", sa.String(length=100), nullable=False),
        sa.Column("game_date", sa.Date(), nullable=False),
        sa.Column("date_precision", sa.String(length=20), nullable=False),
        sa.Column("tipoff_utc", sa.DateTime(timezone=True), nullable=True),
        sa.Column("season", sa.String(length=10), nullable=False),
        sa.Column("phase", sa.String(length=30), nullable=False),
        sa.Column("appearance", sa.String(length=30), nullable=False),
        sa.Column("minutes_original", sa.String(length=20), nullable=False),
        sa.Column("minutes_seconds", sa.Integer(), nullable=True),
        sa.Column("points", sa.Integer(), nullable=True),
        sa.Column("stats_json", sa.JSON(), nullable=False),
        sa.Column("source_version_id", sa.String(length=36), nullable=False),
        sa.Column("source_observation_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["workbench_datasets.id"]),
        sa.ForeignKeyConstraint(["source_observation_id"], ["workbench_observations.id"]),
        sa.ForeignKeyConstraint(["source_version_id"], ["workbench_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset_id", "game_id", "player_id"),
    )
    op.create_index(
        "ix_wb_player_dataset_player_date",
        "workbench_player_games",
        ["dataset_id", "player_id", "game_date"],
    )

    # 11. workbench_release_bindings
    op.create_table(
        "workbench_release_bindings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("snapshot_id", sa.String(length=36), nullable=False),
        sa.Column("semantic_signature", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("capability_bindings_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["workbench_datasets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("snapshot_id"),
    )

    # 12. workbench_snapshot_equivalences
    op.create_table(
        "workbench_snapshot_equivalences",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("local_snapshot_id", sa.String(length=36), nullable=False),
        sa.Column("authoritative_snapshot_id", sa.String(length=36), nullable=False),
        sa.Column("semantic_signature", sa.String(length=64), nullable=False),
        sa.Column("dataset_content_sha256", sa.String(length=64), nullable=False),
        sa.Column("dataset_observation_sha256", sa.String(length=64), nullable=False),
        sa.Column("scoring_version", sa.String(length=64), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("verification_report_json", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("local_snapshot_id", "authoritative_snapshot_id"),
    )
    op.create_index(
        "ix_wb_equiv_local_snap",
        "workbench_snapshot_equivalences",
        ["local_snapshot_id"],
    )
    op.create_index(
        "ix_wb_equiv_authoritative_snap",
        "workbench_snapshot_equivalences",
        ["authoritative_snapshot_id"],
    )

    # 13. saved_investigations
    op.create_table(
        "saved_investigations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("manifest_sha256", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("query_json", sa.JSON(), nullable=False),
        sa.Column("context_json", sa.JSON(), nullable=False),
        sa.Column("metric_version", sa.String(length=40), nullable=False),
        sa.Column("result_sha256", sa.String(length=64), nullable=False),
        sa.Column("result_artifact_path", sa.Text(), nullable=False),
        sa.Column("warnings_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("manifest_sha256"),
    )

    # 14. player_portraits
    op.create_table(
        "player_portraits",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("player_id", sa.String(length=100), nullable=False),
        sa.Column("source_name", sa.String(length=50), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.String(length=50), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("bytes", sa.Integer(), nullable=False),
        sa.Column("attribution", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("player_id", "source_name"),
    )

    # 15. workbench_jobs
    op.create_table(
        "workbench_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("job_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("arguments_json", sa.JSON(), nullable=False),
        sa.Column("owner", sa.String(length=100), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stage", sa.String(length=50), nullable=True),
        sa.Column("timings_json", sa.JSON(), nullable=False),
        sa.Column("input_refs_json", sa.JSON(), nullable=False),
        sa.Column("output_refs_json", sa.JSON(), nullable=False),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # 16. model_policy_activations
    op.create_table(
        "model_policy_activations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("policy_name", sa.String(length=100), nullable=False),
        sa.Column("target_metric", sa.String(length=40), nullable=False),
        sa.Column("estimator_identity", sa.String(length=100), nullable=False),
        sa.Column("calibration_identity", sa.String(length=100), nullable=False),
        sa.Column("eligibility_criteria_json", sa.JSON(), nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("experiment_run_id", sa.String(length=64), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # 17. forecast_issuances
    op.create_table(
        "forecast_issuances",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("policy_id", sa.String(length=36), nullable=False),
        sa.Column("player_id", sa.String(length=100), nullable=False),
        sa.Column("target_game_id", sa.String(length=10), nullable=False),
        sa.Column("target_game_date", sa.Date(), nullable=False),
        sa.Column("target_opponent_id", sa.String(length=100), nullable=False),
        sa.Column("issued_at_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("features_hash", sa.String(length=64), nullable=False),
        sa.Column("features_json", sa.JSON(), nullable=False),
        sa.Column("schedule_evidence_json", sa.JSON(), nullable=False),
        sa.Column("team_evidence_json", sa.JSON(), nullable=False),
        sa.Column("point_estimate", sa.Float(), nullable=False),
        sa.Column("interval_lower", sa.Float(), nullable=False),
        sa.Column("interval_upper", sa.Float(), nullable=False),
        sa.Column("availability_reason", sa.String(length=100), nullable=True),
        sa.Column("issuance_status", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["workbench_datasets.id"]),
        sa.ForeignKeyConstraint(["policy_id"], ["model_policy_activations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("policy_id", "player_id", "target_game_id"),
    )

    # 18. forecast_scores
    op.create_table(
        "forecast_scores",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("issuance_id", sa.String(length=36), nullable=False),
        sa.Column("observed_points", sa.Integer(), nullable=True),
        sa.Column("scored_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scoring_policy_id", sa.String(length=100), nullable=False),
        sa.Column("outcome_observation_id", sa.String(length=36), nullable=True),
        sa.Column("absolute_error", sa.Float(), nullable=True),
        sa.Column("interval_hit", sa.Boolean(), nullable=True),
        sa.Column("score_status", sa.String(length=30), nullable=False),
        sa.Column("reason", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(["issuance_id"], ["forecast_issuances.id"]),
        sa.ForeignKeyConstraint(["outcome_observation_id"], ["workbench_observations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # Database mutation-rejecting triggers for PostgreSQL
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("""
            CREATE OR REPLACE FUNCTION prevent_sealed_row_mutation()
            RETURNS TRIGGER AS $$
            BEGIN
                IF current_setting('courtload.allow_admin_mutation', true) = 'true' THEN
                    IF TG_OP = 'DELETE' THEN
                        RETURN OLD;
                    ELSE
                        RETURN NEW;
                    END IF;
                END IF;
                RAISE EXCEPTION 'Table % is sealed and immutable against ordinary mutation', TG_TABLE_NAME;
            END;
            $$ LANGUAGE plpgsql;
        """)
        for table in (
            "workbench_dataset_members",
            "workbench_schedules",
            "workbench_team_games",
            "workbench_player_games",
            "forecast_issuances",
        ):
            op.execute(f"""
                CREATE TRIGGER trg_sealed_{table}_protect
                BEFORE UPDATE OR DELETE ON {table}
                FOR EACH ROW EXECUTE FUNCTION prevent_sealed_row_mutation();
            """)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for table in (
            "forecast_issuances",
            "workbench_player_games",
            "workbench_team_games",
            "workbench_schedules",
            "workbench_dataset_members",
        ):
            op.execute(f"DROP TRIGGER IF EXISTS trg_sealed_{table}_protect ON {table};")
        op.execute("DROP FUNCTION IF EXISTS prevent_sealed_row_mutation();")

    op.drop_table("forecast_scores")
    op.drop_table("forecast_issuances")
    op.drop_table("model_policy_activations")
    op.drop_table("workbench_jobs")
    op.drop_table("player_portraits")
    op.drop_table("saved_investigations")
    op.drop_index("ix_wb_equiv_authoritative_snap", table_name="workbench_snapshot_equivalences")
    op.drop_index("ix_wb_equiv_local_snap", table_name="workbench_snapshot_equivalences")
    op.drop_table("workbench_snapshot_equivalences")
    op.drop_table("workbench_release_bindings")
    op.drop_index("ix_wb_player_dataset_player_date", table_name="workbench_player_games")
    op.drop_table("workbench_player_games")
    op.drop_index("ix_wb_team_dataset_team_date", table_name="workbench_team_games")
    op.drop_table("workbench_team_games")
    op.drop_index("ix_workbench_schedules_dataset_date", table_name="workbench_schedules")
    op.drop_table("workbench_schedules")
    op.drop_table("workbench_dataset_members")
    op.drop_table("workbench_datasets")
    op.drop_index("ix_workbench_obs_identity_time", table_name="workbench_observations")
    op.drop_index("ix_workbench_obs_identity_order", table_name="workbench_observations")
    op.drop_table("workbench_observations")
    op.drop_table("workbench_versions")
    op.drop_table("workbench_identities")
    op.drop_table("workbench_acquisitions")
    op.drop_table("workbench_artifacts")
