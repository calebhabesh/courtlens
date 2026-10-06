"""Actual archive recovery into a fresh disposable DB and isolated file roots."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import time
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from courtload.services.assistant.history import history_inventory
from courtload.services.assistant.saved import reproduce_saved, saved_inventory
from courtload.services.backup_restore import (
    create_backup_archive,
    restore_backup_archive,
    verify_restored_state,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/evidence/pf09-freeze-acceptance"
SOURCE = "postgresql+psycopg://courtload:courtload@127.0.0.1:5432/courtload_pf09_acceptance"
TARGET = SOURCE.rsplit("/", 1)[0] + "/courtload_pf09_restored"


def records(session: Session) -> dict:
    tables = [
        "assistant_threads",
        "assistant_turns",
        "assistant_turn_inputs",
        "workbench_personal_workspaces",
        "saved_conversation_analyses",
        "saved_conversation_inputs",
    ]
    result = {}
    for table in tables:
        exists = session.execute(text("SELECT to_regclass(:name)"), {"name": table}).scalar()
        if not exists:
            continue
        rows = (
            session.execute(
                text(f"SELECT row_to_json(t)::text FROM {table} t ORDER BY row_to_json(t)::text")
            )
            .scalars()
            .all()
        )
        result[table] = {
            "rows": len(rows),
            "sha256": hashlib.sha256("\n".join(rows).encode()).hexdigest(),
        }
    return result


def main() -> None:
    source_engine = create_engine(SOURCE)
    work = Path("/tmp/courtload-pf09-recovery")
    stage = work / "source"
    stage.mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        ROOT / "data/artifacts/analyses", stage / "data/artifacts/analyses", dirs_exist_ok=True
    )
    shutil.copytree(ROOT / "evaluation", stage / "evaluation", dirs_exist_ok=True)
    with Session(source_engine) as session:
        assert (
            session.execute(text("select current_database()")).scalar()
            == "courtload_pf09_acceptance"
        )
        session.execute(
            text("CREATE TABLE IF NOT EXISTS pf09_clone_only_marker (value text PRIMARY KEY)")
        )
        session.execute(
            text(
                "INSERT INTO pf09_clone_only_marker VALUES ('explicit source database honored') "
                "ON CONFLICT DO NOTHING"
            )
        )
        session.commit()
        before = records(session)
        history = history_inventory(session)
        saved = saved_inventory(session)
        os.chdir(stage)
        started = time.monotonic()
        archive, manifest = create_backup_archive(
            session,
            backup_dir=work / "backups",
            artifacts_dir=ROOT / "data/artifacts/evaluation",
            raw_root=ROOT / "data/raw",
            configs_root=stage / "evaluation",
            database_url=SOURCE,
            code_version="PF09-working-tree",
        )
        backup_seconds = time.monotonic() - started
        (OUT / "backup-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        with create_engine(SOURCE, isolation_level="AUTOCOMMIT").connect() as connection:
            connection.execute(text("CREATE DATABASE courtload_pf09_restored"))
        restored = work / "restored"
        restored.mkdir(parents=True, exist_ok=True)
        os.chdir(restored)
        started = time.monotonic()
        result = restore_backup_archive(
            session,
            archive,
            target_database_url=TARGET,
            target_database_name="courtload_pf09_restored",
            artifacts_dir=restored / "data/artifacts/evaluation",
            raw_root=restored / "data/raw",
            configs_root=restored / "evaluation",
            verify_state=False,
        )
        restore_seconds = time.monotonic() - started
    target_engine = create_engine(TARGET)
    with Session(target_engine) as session:
        assert (
            session.execute(text("SELECT value FROM pf09_clone_only_marker")).scalar()
            == "explicit source database honored"
        )
        after = records(session)
        assert before == after
        assert history == history_inventory(session)
        assert saved == saved_inventory(session)
        report = verify_restored_state(
            session,
            artifacts_dir=restored / "data/artifacts/evaluation",
            expected_saved_conversations=manifest["saved_conversation_analyses"],
            expected_assistant_history=manifest["assistant_history"],
        )
        reproduction = [reproduce_saved(session, row["id"]) for row in saved]
        assert all(row["match"] for row in reproduction)
    report = {
        "status": result["status"],
        "verification": report,
        "relationship_hashes_before": before,
        "relationship_hashes_after": after,
        "clone_only_marker": True,
        "saved_reproduction": reproduction,
        "backup_seconds": backup_seconds,
        "restore_seconds": restore_seconds,
        "archive_bytes": archive.stat().st_size,
        "archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "archive": str(archive),
        "isolated_files": str(restored),
        "history": history,
    }
    (OUT / "recovery.json").write_text(json.dumps(report, indent=2, default=str) + "\n")
    source_engine.dispose()
    target_engine.dispose()
    print(
        json.dumps(
            {
                key: report[key]
                for key in [
                    "status",
                    "clone_only_marker",
                    "backup_seconds",
                    "restore_seconds",
                    "archive_bytes",
                ]
            }
        )
    )


if __name__ == "__main__":
    main()
