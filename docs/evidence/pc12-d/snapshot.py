"""Read-only publication, input and personal-state retention evidence."""

import hashlib
import json
import sys
from pathlib import Path

from sqlalchemy import create_engine, text

from courtlens.config import Settings

engine = create_engine(Settings().database_url)
with engine.connect() as connection:
    connection.execute(text("SET TRANSACTION READ ONLY"))
    counts = {
        table: connection.execute(text("SELECT COUNT(*) FROM " + table)).scalar_one()
        for table in (
            "published_snapshots",
            "workbench_identities",
            "workbench_player_measurements",
            "stats_feed_datasets",
            "stats_feed_versions",
            "stats_feed_members",
        )
    }
    for table, order, key in (
        ("published_snapshots", "channel", "pointer"),
        ("workbench_personal_workspaces", "id", "personal_state"),
    ):
        rows = connection.execute(text(f"SELECT * FROM {table} ORDER BY {order}"))
        records = [dict(row) for row in rows.mappings()]
        counts[key + "_sha256"] = hashlib.sha256(
            json.dumps(records, sort_keys=True, default=str).encode()
        ).hexdigest()
        if key == "personal_state":
            counts["personal_workspaces"] = len(records)
            counts["ranking_boards"] = sum(len(row["ranking_boards_json"]) for row in records)
            counts["tier_lists"] = sum(len(row["tier_lists_json"]) for row in records)

Path(__file__).with_name(sys.argv[1]).write_text(json.dumps(counts, indent=2) + "\n")
print(json.dumps(counts, indent=2))
