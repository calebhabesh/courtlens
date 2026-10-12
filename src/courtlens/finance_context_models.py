"""PC06 immutable refresh bindings and hand-entered league thresholds."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, LargeBinary, String, event
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Mapped, mapped_column

from courtlens.database import Base
from courtlens.models import new_uuid, utc_now


class FinanceThreshold(Base):
    __tablename__ = "finance_thresholds"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    season: Mapped[str] = mapped_column(String(10), index=True)
    content_sha256: Mapped[str] = mapped_column(String(64), unique=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source_bytes: Mapped[bytes] = mapped_column(LargeBinary)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON)


class FinanceRefresh(Base):
    __tablename__ = "finance_refreshes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    input_sha256: Mapped[str] = mapped_column(String(64), unique=True)
    content_sha256: Mapped[str] = mapped_column(String(64))
    season: Mapped[str] = mapped_column(String(10), index=True)
    roster_dataset_id: Mapped[str] = mapped_column(ForeignKey("player_context_datasets.id"))
    threshold_id: Mapped[str | None] = mapped_column(ForeignKey("finance_thresholds.id"))
    book_id: Mapped[str | None] = mapped_column(ForeignKey("finance_releases.id"))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    parser_version: Mapped[str] = mapped_column(String(40))
    admission_transaction: Mapped[str] = mapped_column(String(32))
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON)


class FinanceRefreshSource(Base):
    __tablename__ = "finance_refresh_sources"
    refresh_id: Mapped[str] = mapped_column(ForeignKey("finance_refreshes.id"), primary_key=True)
    acquisition_id: Mapped[str] = mapped_column(
        ForeignKey("workbench_acquisitions.id"), primary_key=True
    )


MODELS = (FinanceThreshold, FinanceRefresh, FinanceRefreshSource)
GUARD_SQL = (
    """CREATE FUNCTION seal_finance_context() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'finance context is append-only'; END; $$""",
    *(
        f"CREATE TRIGGER seal_{name} BEFORE UPDATE OR DELETE OR TRUNCATE ON {name} "
        "FOR EACH STATEMENT EXECUTE FUNCTION seal_finance_context()"
        for name in ("finance_thresholds", "finance_refreshes", "finance_refresh_sources")
    ),
    """CREATE FUNCTION seal_finance_refresh_member() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM finance_refreshes WHERE id=NEW.refresh_id
      AND admission_transaction=txid_current()::text) THEN
      RAISE EXCEPTION 'finance refresh membership is sealed'; END IF;
    RETURN NEW; END; $$""",
    "CREATE TRIGGER seal_finance_refresh_insert BEFORE INSERT ON finance_refresh_sources "
    "FOR EACH ROW EXECUTE FUNCTION seal_finance_refresh_member()",
    """CREATE FUNCTION validate_finance_refresh_scope() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
    IF TG_TABLE_NAME='finance_refreshes' THEN
      IF NOT EXISTS (SELECT 1 FROM player_context_datasets
        WHERE id=NEW.roster_dataset_id AND kind='player_index' AND season=NEW.season) THEN
        RAISE EXCEPTION 'finance refresh roster scope mismatch'; END IF;
      IF NEW.threshold_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM finance_thresholds
        WHERE id=NEW.threshold_id AND season=NEW.season) THEN
        RAISE EXCEPTION 'finance refresh threshold scope mismatch'; END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM finance_refreshes r JOIN workbench_acquisitions a
        ON a.id=NEW.acquisition_id WHERE r.id=NEW.refresh_id AND a.resource='finance'
        AND a.metadata_json->>'season'=r.season AND a.finished_at IS NOT NULL
        AND a.finished_at<=r.observed_at AND a.status IN ('success','failed')) THEN
        RAISE EXCEPTION 'finance refresh acquisition scope mismatch'; END IF;
    END IF;
    RETURN NEW; END; $$""",
    *(
        f"CREATE TRIGGER validate_finance_refresh_scope BEFORE INSERT ON {name} "
        "FOR EACH ROW EXECUTE FUNCTION validate_finance_refresh_scope()"
        for name in ("finance_refreshes", "finance_refresh_sources")
    ),
    """CREATE FUNCTION seal_finance_refresh_provenance() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
    IF TG_TABLE_NAME='workbench_acquisitions' AND EXISTS (
      SELECT 1 FROM finance_refresh_sources WHERE acquisition_id=OLD.id) THEN
      RAISE EXCEPTION 'finance refresh provenance is append-only'; END IF;
    IF TG_TABLE_NAME='workbench_artifacts' THEN
      IF EXISTS (SELECT 1 FROM finance_refresh_sources s JOIN workbench_acquisitions a
        ON a.id=s.acquisition_id WHERE a.artifact_id=OLD.id
          OR a.metadata_json->>'robots_sha256'=OLD.sha256) THEN
        RAISE EXCEPTION 'finance refresh provenance is append-only'; END IF;
    END IF;
    RETURN COALESCE(NEW, OLD); END; $$""",
    *(
        f"CREATE TRIGGER seal_finance_refresh_source BEFORE UPDATE OR DELETE ON {name} "
        "FOR EACH ROW EXECUTE FUNCTION seal_finance_refresh_provenance()"
        for name in ("workbench_acquisitions", "workbench_artifacts")
    ),
)


def install_guards(connection: Connection) -> None:
    if connection.dialect.name == "postgresql":
        for sql in GUARD_SQL:
            connection.exec_driver_sql(sql)


def immutable(mapper: Any, connection: Any, target: Any) -> None:
    raise ValueError("finance context is append-only")


for model in MODELS:
    event.listen(model, "before_update", immutable)
    event.listen(model, "before_delete", immutable)


@event.listens_for(FinanceRefreshSource.__table__, "after_create")
def guards(target: Any, connection: Connection, **kwargs: Any) -> None:
    install_guards(connection)
