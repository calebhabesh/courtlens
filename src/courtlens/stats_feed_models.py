"""Independent season-level stats feeds; never extend historical statistical datasets."""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    event,
)
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Mapped, mapped_column

from courtlens.database import Base
from courtlens.models import new_uuid, utc_now


class StatsFeedDataset(Base):
    """One acquisition observation of one feed scope, including unchanged content."""

    __tablename__ = "stats_feed_datasets"
    __table_args__ = (
        UniqueConstraint("id", "source_name", "feed", "season"),
        UniqueConstraint("acquisition_id"),
        UniqueConstraint("observation_order"),
        Index(
            "ix_stats_feed_scope",
            "source_name",
            "feed",
            "season",
            "season_type",
            "variant",
            "observed_at",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    acquisition_id: Mapped[str] = mapped_column(ForeignKey("workbench_acquisitions.id"))
    source_name: Mapped[str] = mapped_column(String(50), nullable=False)
    feed: Mapped[str] = mapped_column(String(40), nullable=False)
    capability: Mapped[str] = mapped_column(String(40), nullable=False)
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    season_type: Mapped[str] = mapped_column(String(20), nullable=False)
    variant: Mapped[str] = mapped_column(String(40), nullable=False)
    upstream_revision: Mapped[str | None] = mapped_column(String(40))
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    membership_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    parser_version: Mapped[str] = mapped_column(String(40), nullable=False)
    observation_order: Mapped[int] = mapped_column(Integer, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    admission_transaction: Mapped[str] = mapped_column(String(32), nullable=False)
    coverage_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class StatsFeedVersion(Base):
    __tablename__ = "stats_feed_versions"
    __table_args__ = (
        UniqueConstraint("source_name", "feed", "season", "entity_key", "content_sha256"),
        UniqueConstraint("id", "entity_key", "source_name", "feed", "season"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    source_name: Mapped[str] = mapped_column(String(50), nullable=False)
    feed: Mapped[str] = mapped_column(String(40), nullable=False)
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    entity_key: Mapped[str] = mapped_column(String(200), nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class StatsFeedMember(Base):
    __tablename__ = "stats_feed_members"
    __table_args__ = (
        ForeignKeyConstraint(
            ["dataset_id", "source_name", "feed", "season"],
            [f"stats_feed_datasets.{c}" for c in ("id", "source_name", "feed", "season")],
        ),
        ForeignKeyConstraint(
            ["version_id", "entity_key", "source_name", "feed", "season"],
            [
                f"stats_feed_versions.{c}"
                for c in ("id", "entity_key", "source_name", "feed", "season")
            ],
        ),
    )

    dataset_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    entity_key: Mapped[str] = mapped_column(String(200), primary_key=True)
    source_name: Mapped[str] = mapped_column(String(50), nullable=False)
    feed: Mapped[str] = mapped_column(String(40), nullable=False)
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    version_id: Mapped[str] = mapped_column(String(36), nullable=False)
    row_locator: Mapped[str] = mapped_column(String(100), nullable=False)


MODELS = (StatsFeedDataset, StatsFeedVersion, StatsFeedMember)


def install_guards(connection: Connection) -> None:
    if connection.dialect.name != "postgresql":
        return
    connection.exec_driver_sql("""CREATE OR REPLACE FUNCTION seal_stats_feed()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'stats feeds are append-only'; END; $$""")
    for model in MODELS:
        table = model.__tablename__
        connection.exec_driver_sql(
            f"CREATE TRIGGER seal_{table} BEFORE UPDATE OR DELETE OR TRUNCATE ON {table} "
            "FOR EACH STATEMENT EXECUTE FUNCTION seal_stats_feed()"
        )
    connection.exec_driver_sql("""CREATE OR REPLACE FUNCTION seal_stats_feed_member()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM stats_feed_datasets WHERE id=NEW.dataset_id
    AND admission_transaction=txid_current()::text) THEN
    RAISE EXCEPTION 'stats feed membership is sealed'; END IF;
    RETURN NEW; END; $$""")
    connection.exec_driver_sql(
        "CREATE TRIGGER seal_stats_feed_insert BEFORE INSERT ON stats_feed_members "
        "FOR EACH ROW EXECUTE FUNCTION seal_stats_feed_member()"
    )
    connection.exec_driver_sql("""CREATE OR REPLACE FUNCTION seal_stats_feed_source()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_TABLE_NAME='workbench_acquisitions' AND EXISTS (
      SELECT 1 FROM stats_feed_datasets WHERE acquisition_id=OLD.id) THEN
      RAISE EXCEPTION 'stats feed provenance is append-only';
    END IF;
    IF TG_TABLE_NAME='workbench_artifacts' AND EXISTS (
      SELECT 1 FROM stats_feed_datasets d JOIN workbench_acquisitions a
      ON a.id=d.acquisition_id WHERE a.artifact_id=OLD.id) THEN
      RAISE EXCEPTION 'stats feed provenance is append-only';
    END IF;
    RETURN COALESCE(NEW, OLD); END; $$""")
    for table in ("workbench_acquisitions", "workbench_artifacts"):
        connection.exec_driver_sql(
            f"CREATE TRIGGER seal_stats_feed_source BEFORE UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION seal_stats_feed_source()"
        )


def _immutable(mapper: Any, connection: Any, target: Any) -> None:
    raise RuntimeError("stats feeds are append-only")


for _model in MODELS:
    event.listen(_model, "before_update", _immutable)
    event.listen(_model, "before_delete", _immutable)


@event.listens_for(StatsFeedMember.__table__, "after_create")
def _guards(target: Any, connection: Connection, **kwargs: Any) -> None:
    install_guards(connection)
