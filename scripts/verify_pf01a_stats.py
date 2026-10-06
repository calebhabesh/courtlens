"""Read-only PF01a verification against the retained local application database."""

from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import select, text

from courtload.database import SessionLocal
from courtload.domain.query_spec import PagingSpec, QuerySpec, SortSpec, WindowSpec
from courtload.domain.stats_presentation import StatsPresentation
from courtload.services.stats_engine import execute_stats_query, stats_cohort_summary
from courtload.services.workbench_analytics import (
    ResearchQuery,
    canonical_hash,
    execute_player_research_query,
    reproduce_investigation,
    resolve_workbench_context,
)
from courtload.workbench_models import SavedInvestigation


def rounded(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report: dict[str, Any] = {"version": "pf01a-v1", "read_only": True, "queries": []}
    with SessionLocal() as session:
        session.execute(text("SET TRANSACTION READ ONLY"))
        baseline = json.loads(Path("docs/evidence/pf00-baseline/players-default.json").read_text())
        bq = baseline["query"]
        context = resolve_workbench_context(
            session,
            release_id=bq["release_id"],
            requested_season=bq["season"],
            requested_phase=bq["phase"],
            requested_before_date=date.fromisoformat(bq["before_date"]),
        )
        report["context"] = context.to_dict()
        legacy = ResearchQuery(**{**bq, "before_date": context.before_date})
        legacy_items, legacy_count, legacy_cursor, _ = execute_player_research_query(
            session, context, legacy
        )
        baseline_items = [
            {k: v for k, v in row.items() if k != "portrait_url"} for row in baseline["items"]
        ]
        current_items = [
            {k: v for k, v in row.items() if k != "portrait_url"} for row in legacy_items
        ]
        assert baseline_items == current_items
        assert legacy_count == baseline["total_eligible_players"]
        assert legacy_cursor == baseline["next_cursor"]
        report["pf00_legacy_reproduction"] = {
            "rows": len(legacy_items),
            "count": legacy_count,
            "baseline_hash": canonical_hash(baseline_items),
            "current_hash": canonical_hash(current_items),
            "cursor_match": True,
        }
        raw = (
            session.execute(
                text("""
            SELECT player_id, points, minutes_seconds, game_date, game_id, appearance
            FROM workbench_player_games WHERE dataset_id = :dataset
              AND season = :season AND phase = :phase AND game_date < :cutoff
            ORDER BY player_id, game_date DESC, game_id DESC
        """),
                {
                    "dataset": context.dataset_id,
                    "season": context.season,
                    "phase": context.phase,
                    "cutoff": context.before_date,
                },
            )
            .mappings()
            .all()
        )
        for window in ("season", "last_10", "last_5"):
            groups: dict[str, list[Any]] = defaultdict(list)
            for row in raw:
                if window == "season" or row["appearance"] == "appeared":
                    groups[row["player_id"]].append(row)
            if window != "season":
                n = 10 if window == "last_10" else 5
                groups = {key: rows[:n] for key, rows in groups.items()}
            arithmetic = {}
            for player_id, rows in groups.items():
                points = [
                    r["points"]
                    for r in rows
                    if r["appearance"] == "appeared" and r["points"] is not None
                ]
                seconds = [
                    r["minutes_seconds"]
                    for r in rows
                    if r["appearance"] == "appeared"
                    and r["points"] is not None
                    and (r["minutes_seconds"] or 0) > 0
                ]
                arithmetic[player_id] = {
                    "pts": sum(points) if points else None,
                    "pts_per_game": rounded(Decimal(sum(points)) / len(points)) if points else None,
                    "pts_per_36": rounded(
                        Decimal(
                            sum(
                                r["points"]
                                for r in rows
                                if r["appearance"] == "appeared"
                                and r["points"] is not None
                                and (r["minutes_seconds"] or 0) > 0
                            )
                        )
                        * 2160
                        / sum(seconds)
                    )
                    if seconds
                    else None,
                }
            for metric in ("pts", "pts_per_game", "pts_per_36"):
                query = QuerySpec(
                    release_id=context.release_id,
                    season=context.season,
                    before_date=context.before_date,
                    window=WindowSpec(kind=window),
                    sort=[SortSpec(field=metric)],
                )
                started = time.perf_counter()
                rows, count, _, _ = execute_stats_query(
                    session, context, query, is_export=True, presentation=StatsPresentation()
                )
                assert len(rows) == count == len(groups)
                expected_order = sorted(
                    arithmetic,
                    key=lambda pid: (
                        arithmetic[pid][metric] is None,
                        -(arithmetic[pid][metric] or 0),
                        pid,
                    ),
                )
                assert [r["player_id"] for r in rows] == expected_order
                for row in rows:
                    assert all(
                        row["metrics"][key] == value
                        for key, value in arithmetic[row["player_id"]].items()
                    ), (window, row["player_id"], arithmetic[row["player_id"]], row["metrics"])
                    for key, percentile in row["percentiles"].items():
                        values = [r["metrics"][key] for r in rows if r["metrics"][key] is not None]
                        assert row["cohort_sample_sizes"][key] == len(values)
                        value = row["metrics"][key]
                        if value is None or len(values) < 2:
                            assert percentile is None
                        else:
                            midrank = (
                                Decimal(100)
                                * (
                                    sum(v < value for v in values)
                                    + Decimal("0.5") * values.count(value)
                                )
                                / len(values)
                            )
                            expected = max(
                                1,
                                min(99, int(midrank.quantize(Decimal(1), rounding=ROUND_HALF_UP))),
                            )
                            assert percentile == expected
                # Traverse real pages; compare all percentiles, samples and ordering.
                traversed = []
                cursor = None
                pages = 0
                while True:
                    page_query = query.model_copy(
                        update={"page": PagingSpec(limit=100, cursor=cursor)}
                    )
                    page, page_count, cursor, more = execute_stats_query(
                        session, context, page_query, presentation=StatsPresentation()
                    )
                    assert page_count == count
                    traversed.extend(page)
                    pages += 1
                    if not more:
                        break
                assert traversed == rows
                favorite = rows[-1]
                presentation = StatsPresentation(player_ids=[favorite["player_id"]])
                selected, output_count, _, _ = execute_stats_query(
                    session, context, query, presentation=presentation
                )
                assert selected == [favorite] and output_count == 1
                summary = stats_cohort_summary(session, context, query, presentation)
                assert summary["eligible_players"] == count
                report["queries"].append(
                    {
                        "window": window,
                        "sort": metric,
                        "eligible": count,
                        "pages": pages,
                        "percentile_metrics": len(favorite["percentiles"]),
                        "elapsed_seconds": time.perf_counter() - started,
                        "cohort": summary,
                        "result_sha256": canonical_hash(rows),
                    }
                )
        ids = session.scalars(select(SavedInvestigation.id).order_by(SavedInvestigation.id)).all()
        reproductions = []
        for investigation_id in ids:
            try:
                result = reproduce_investigation(session, investigation_id)
                reproductions.append(result)
            except Exception as error:
                reproductions.append({"id": investigation_id, "error": str(error)})
        report["saved_reproduction"] = reproductions
        report["saved_reproduction_matches"] = sum(r.get("match") is True for r in reproductions)
        report["saved_reproduction_total"] = len(reproductions)
        session.rollback()
    args.output.write_text(json.dumps(report, indent=2, default=str) + "\n")
    print(
        json.dumps(
            {
                "verified_queries": len(report["queries"]),
                "saved_matches": report["saved_reproduction_matches"],
                "saved_total": report["saved_reproduction_total"],
            }
        )
    )


if __name__ == "__main__":
    main()
