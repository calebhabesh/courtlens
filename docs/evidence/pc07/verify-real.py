"""Read-only integrity, catalog, SQL sealing and mart checks for the retained PC07 run.

Run after `courtlens acquire-stats-feeds` and
`(cd warehouse && ../.venv/bin/dbt build --profiles-dir . --select tag:stats_feed)`.
Requires the runtime raw store under data/raw/stats-feeds.
"""

import json
import time
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError

from courtlens.api.app import create_app
from courtlens.database import SessionLocal
from courtlens.services.stats_feed_ingestion import coverage_summary, latest_datasets, verify_feed
from courtlens.stats_feed_models import StatsFeedDataset, StatsFeedMember, StatsFeedVersion
from courtlens.warehouse_models import PublishedSnapshot

HERE = Path(__file__).resolve().parent
RAW = Path("data/raw/stats-feeds")
MARTS = (
    "mart_stats_player_play_types",
    "mart_stats_player_tracking",
    "mart_stats_player_defense",
    "mart_stats_player_hustle",
    "mart_stats_season_matchups",
    "mart_stats_lineups",
    "mart_stats_draft_combine",
    "mart_stats_draft_history",
    "mart_stats_pbpstats_player_totals",
)
FEED_CAPABILITIES = (
    "play_types",
    "tracking",
    "defensive_tracking",
    "hustle",
    "matchups",
    "lineups",
    "combine",
    "draft_metadata",
    "on_off",
)


def write(name: str, data: object) -> None:
    (HERE / name).write_text(json.dumps(data, indent=1, default=str) + "\n")


def counts(session) -> dict[str, int]:
    return {
        m.__tablename__: session.scalar(select(func.count()).select_from(m)) or 0
        for m in (StatsFeedDataset, StatsFeedVersion, StatsFeedMember)
    }


def main() -> None:
    with SessionLocal() as session:
        before_counts = counts(session)
        datasets = latest_datasets(session)
        results = [verify_feed(session, d.id, RAW) for d in datasets]
        write(
            "integrity.json",
            {
                "checked": len(results),
                "verified": sum(r["verified"] for r in results),
                "failures": [r for r in results if not r["verified"]],
            },
        )
        write("coverage.json", coverage_summary(session))

        rejections = {}
        dataset = datasets[0]
        for label, statement in {
            "update_dataset": "UPDATE stats_feed_datasets SET coverage_json='{}' WHERE id=:id",
            "delete_versions": "DELETE FROM stats_feed_versions",
            "truncate_members": "TRUNCATE stats_feed_members",
            "extend_membership": (
                "INSERT INTO stats_feed_members (dataset_id,entity_key,source_name,feed,season,"
                "version_id,row_locator) SELECT dataset_id,'extra',source_name,feed,season,"
                "version_id,'row:x' FROM stats_feed_members WHERE dataset_id=:id LIMIT 1"
            ),
            "update_acquisition": (
                "UPDATE workbench_acquisitions SET source_url='x' WHERE id=:acquisition"
            ),
        }.items():
            try:
                with session.begin_nested():
                    session.execute(
                        text(statement), {"id": dataset.id, "acquisition": dataset.acquisition_id}
                    )
                rejections[label] = "ACCEPTED"
            except DBAPIError as error:
                rejections[label] = str(error.orig).splitlines()[0]
        session.rollback()
        write("sql-sealing.json", rejections)

        marts = {}
        for mart in MARTS:
            marts[mart] = session.scalar(text(f"SELECT count(*) FROM analytics_marts.{mart}"))
        samples = {
            "top_isolation_possessions": [
                dict(r._mapping)
                for r in session.execute(
                    text(
                        "SELECT player_id, source_player_name, team_id, possessions, points, "
                        "points_per_possession FROM analytics_marts.mart_stats_player_play_types "
                        "WHERE season='2025-26' AND season_type='regular_season' "
                        "AND play_type='isolation' AND side='offensive' "
                        "ORDER BY possessions DESC NULLS LAST LIMIT 5"
                    )
                )
            ],
            "combine_2025_top_wingspan": [
                dict(r._mapping)
                for r in session.execute(
                    text(
                        "SELECT player_id, source_player_name, wingspan_inches, "
                        "height_no_shoes_inches, weight_lbs FROM "
                        "analytics_marts.mart_stats_draft_combine WHERE draft_year=2025 "
                        "ORDER BY wingspan_inches DESC NULLS LAST LIMIT 5"
                    )
                )
            ],
            "draft_2025_top_picks": [
                dict(r._mapping)
                for r in session.execute(
                    text(
                        "SELECT overall_pick, player_id, source_player_name, drafting_team_id "
                        "FROM analytics_marts.mart_stats_draft_history WHERE draft_year=2025 "
                        "ORDER BY overall_pick LIMIT 5"
                    )
                )
            ],
            "possession_crosscheck": [
                dict(r._mapping)
                for r in session.execute(
                    text(
                        "SELECT p.player_id, h.source_player_name, p.minutes AS pbpstats_minutes, "
                        "h.minutes AS nba_minutes, p.offensive_possessions "
                        "FROM analytics_marts.mart_stats_pbpstats_player_totals p "
                        "JOIN analytics_marts.mart_stats_player_hustle h "
                        "ON h.player_id=p.player_id AND h.season=p.season "
                        "AND h.season_type=p.season_type "
                        "WHERE p.season_type='regular_season' "
                        "ORDER BY p.minutes DESC LIMIT 5"
                    )
                )
            ],
        }
        write("marts.json", {"row_counts": marts, "samples": samples})
        pointers = [
            {"channel": c, "snapshot_id": i}
            for c, i in session.execute(
                select(PublishedSnapshot.channel, PublishedSnapshot.snapshot_id).order_by(
                    PublishedSnapshot.channel
                )
            )
        ]
        write("pointers-after.json", pointers)

    client = TestClient(create_app())
    started = time.perf_counter()
    response = client.get("/api/workbench/catalog")
    elapsed = (time.perf_counter() - started) * 1000
    capabilities = response.json()["capabilities"]
    write(
        "catalog-capabilities.json",
        {
            "http_status": response.status_code,
            "elapsed_ms": round(elapsed, 1),
            "capabilities": {k: capabilities.get(k) for k in FEED_CAPABILITIES},
        },
    )
    with SessionLocal() as session:
        after_counts = counts(session)
    before_pointers = json.loads((HERE / "pointers-before.json").read_text())
    write(
        "read-only-check.json",
        {
            "pointers_match": before_pointers == pointers,
            "pointer_count": len(pointers),
            "feed_counts_before_reads": before_counts,
            "feed_counts_after_reads": after_counts,
            "counts_match": before_counts == after_counts,
        },
    )


if __name__ == "__main__":
    main()
