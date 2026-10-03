"""Unit tests for Block B03: Bounded Stats query engine.

Covers SQL query generation, analytical windowing, predicate compilation, multi-sort,
stable cursor pagination, bounded full-result export, arithmetic reconciliation,
and query plan performance harness.
"""

from __future__ import annotations

import os
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from courtload.domain.metrics import compute_metrics_v2
from courtload.domain.query_spec import (
    PagingSpec,
    PredicateGroup,
    PredicateLeaf,
    PredicateOp,
    QuerySpec,
    SampleFilter,
    SortSpec,
    WindowKind,
    WindowSpec,
)
from courtload.services.stats_engine import (
    build_stats_query_sql,
    compile_predicate_node,
    execute_stats_query,
    explain_stats_query,
    export_stats_query,
    map_field_to_sql_column,
)
from courtload.services.workbench_analytics import (
    ResolvedContext,
    _load_player_games,
    canonical_hash,
    get_investigation,
    reproduce_investigation,
    resolve_workbench_context,
    save_investigation,
)


@pytest.fixture
def db_session() -> Session:
    """Fixture providing database session connected to Postgres test DB if available."""
    default_url = "postgresql+psycopg://courtload:courtload@localhost:5432/courtload"
    url = os.getenv("COURTLOAD_TEST_POSTGRES_URL", default_url)
    engine = create_engine(url)
    with Session(engine) as session:
        yield session


@pytest.fixture
def sample_context() -> ResolvedContext:
    """Standard resolved context for testing SQL generation."""
    return ResolvedContext(
        release_id="test-release-uuid",
        snapshot_id="test-snapshot-uuid",
        dataset_id="test-dataset-uuid",
        dataset_type="workbench",
        semantic_signature="test-signature-1234567890",
        mode="test",
        source="test-source",
        season="2023-24",
        phase="regular_season",
        before_date=date(2024, 6, 18),
        cutoff_utc="2024-06-18T04:00:00Z",
        window="season",
        coverage_start=date(2023, 10, 24),
        coverage_end=date(2024, 6, 18),
        default_before_date=date(2024, 6, 18),
        supported_dates=["2023-24"],
        published_at="2024-06-18T04:00:00Z",
        warnings=[],
    )


class TestSQLGenerationAndCompilation:
    """Test SQL query construction, window functions, and dialect compatibility."""

    def test_map_field_to_sql_column(self) -> None:
        """Registered metrics and metadata fields must map to correct aggregated SQL columns."""
        assert map_field_to_sql_column("pts") == "pts"
        assert map_field_to_sql_column("pts_per_game") == "pts_per_game"
        assert map_field_to_sql_column("reb_total") == "reb"
        assert map_field_to_sql_column("reb_total_per_game") == "reb_per_game"
        assert map_field_to_sql_column("gp") == "games_played"
        assert map_field_to_sql_column("min") == "total_minutes"
        assert map_field_to_sql_column("min_per_game") == "min_per_game"
        assert map_field_to_sql_column("ts_pct") == "ts_pct"
        assert map_field_to_sql_column("efg_pct") == "efg_pct"
        assert map_field_to_sql_column("ftr") == "ftr"

    def test_compile_predicate_leaf_operators(self) -> None:
        """Leaf predicates must compile to valid parameterized SQL across all operators."""
        params: dict[str, object] = {}

        # 1. EQ
        p_eq = PredicateLeaf(field="pts_per_game", op=PredicateOp.EQ, value=25.0)
        assert compile_predicate_node(p_eq, params) == "(pts_per_game = :p_leaf_0)"
        assert params["p_leaf_0"] == 25.0

        # 2. GTE
        p_gte = PredicateLeaf(field="ts_pct", op=PredicateOp.GTE, value=0.60)
        assert compile_predicate_node(p_gte, params) == "(ts_pct >= :p_leaf_1)"
        assert params["p_leaf_1"] == 0.60

        # 3. BETWEEN
        p_between = PredicateLeaf(field="min_per_game", op=PredicateOp.BETWEEN, value=[20.0, 35.0])
        clause_between = compile_predicate_node(p_between, params)
        assert "min_per_game >= :p_leaf_2_low" in clause_between
        assert "min_per_game <= :p_leaf_2_high" in clause_between
        assert params["p_leaf_2_low"] == 20.0
        assert params["p_leaf_2_high"] == 35.0

        # 4. IN
        p_in = PredicateLeaf(field="player_id", op=PredicateOp.IN, value=["1629029", "1628983"])
        clause_in = compile_predicate_node(p_in, params)
        assert clause_in == "(player_id IN (:p_leaf_4_0, :p_leaf_4_1))"
        assert params["p_leaf_4_0"] == "1629029"
        assert params["p_leaf_4_1"] == "1628983"

    def test_compile_predicate_group_nested_and_or(self) -> None:
        """PredicateGroup must correctly compile nested AND and OR expressions."""
        params: dict[str, object] = {}
        group = PredicateGroup(
            conjunction="and",
            predicates=[
                PredicateLeaf(field="pts_per_game", op=PredicateOp.GTE, value=20.0),
                PredicateGroup(
                    conjunction="or",
                    predicates=[
                        PredicateLeaf(field="ast_per_game", op=PredicateOp.GTE, value=8.0),
                        PredicateLeaf(field="reb_per_game", op=PredicateOp.GTE, value=10.0),
                    ],
                ),
            ],
        )
        sql_clause = compile_predicate_node(group, params)
        assert "pts_per_game >= :p_leaf_0" in sql_clause
        assert " OR " in sql_clause
        assert "ast_per_game >= :p_leaf_1" in sql_clause
        assert "reb_per_game >= :p_leaf_2" in sql_clause

    def test_build_stats_query_sql_season_window(self, sample_context: ResolvedContext) -> None:
        """Season window query must aggregate all games before cutoff date."""
        query = QuerySpec(season="2023-24", window=WindowSpec(kind=WindowKind.SEASON))
        sql, params = build_stats_query_sql(sample_context, query, limit=50, offset=0)
        assert "WITH ranked_games AS" in sql
        assert "candidate_games AS (" in sql
        assert "WHERE 1=1" in sql  # no window cutoff for season
        assert "LIMIT 50" in sql
        assert params["dataset_id"] == sample_context.dataset_id
        assert params["season"] == "2023-24"

    def test_build_stats_query_sql_last_n_window(self, sample_context: ResolvedContext) -> None:
        """Last-N appearances query must apply ROW_NUMBER window function partition by player."""
        query = QuerySpec(
            season="2023-24",
            window=WindowSpec(kind=WindowKind.LAST_N_APPEARANCES, n=15),
        )
        sql, params = build_stats_query_sql(sample_context, query, limit=50, offset=0)
        assert "ROW_NUMBER() OVER (" in sql
        assert "PARTITION BY wpg.player_id" in sql
        assert "WHERE app_rank <= :window_n" in sql
        assert params["window_n"] == 15

    def test_build_stats_query_sql_multi_sort_order(self, sample_context: ResolvedContext) -> None:
        """Query must include up to 3 sort fields with stable player_id tiebreaker."""
        query = QuerySpec(
            season="2023-24",
            sort=[
                SortSpec(field="pts_per_game", direction="desc"),
                SortSpec(field="min_per_game", direction="asc"),
            ],
        )
        sql, _ = build_stats_query_sql(sample_context, query, limit=50, offset=0)
        expected_order = (
            "ORDER BY pts_per_game DESC NULLS LAST, min_per_game ASC NULLS LAST, player_id ASC"
        )
        assert expected_order in sql


class TestStatsQueryEngineRuntime:
    """Runtime tests executing against real operational PostgreSQL database."""

    def test_arithmetic_reconciliation_with_compute_metrics_v2(self, db_session: Session) -> None:
        """SQL aggregated metrics must reconcile bit-for-bit with compute_metrics_v2."""
        ctx = resolve_workbench_context(db_session)
        player_id = "1629029"  # Luka Dončić

        # 1. Compute via pure Python compute_metrics_v2
        raw_games = _load_player_games(db_session, ctx, player_id=player_id)
        assert len(raw_games) > 0
        py_metrics, py_samples = compute_metrics_v2(raw_games)

        # 2. Compute via SQL Stats query engine
        query = QuerySpec(
            season=ctx.season,
            predicates=PredicateGroup(
                conjunction="and",
                predicates=[PredicateLeaf(field="player_id", op=PredicateOp.EQ, value=player_id)],
            ),
            page=PagingSpec(limit=5),
        )
        items, total, _, _ = execute_stats_query(db_session, ctx, query)
        assert total == 1
        sql_item = items[0]
        sql_metrics = sql_item["metrics"]
        sql_samples = sql_item["sample_sizes"]

        # 3. Assert exact reconciliation on all core metrics
        assert sql_metrics["pts"] == py_metrics["pts"]
        assert sql_metrics["pts_per_game"] == py_metrics["pts_per_game"]
        assert sql_metrics["pts_per_36"] == py_metrics["pts_per_36"]
        assert sql_metrics["reb"] == py_metrics["reb"]
        assert sql_metrics["reb_per_game"] == py_metrics["reb_per_game"]
        assert sql_metrics["ast"] == py_metrics["ast"]
        assert sql_metrics["ast_per_game"] == py_metrics["ast_per_game"]
        assert sql_metrics["ts_pct"] == py_metrics["ts_pct"]
        assert sql_metrics["efg_pct"] == py_metrics["efg_pct"]
        assert sql_metrics["ftr"] == py_metrics["ftr"]
        assert (
            sql_metrics["legacy_fantasy_score_per_game"]
            == py_metrics["legacy_fantasy_score_per_game"]
        )

        # 4. Assert exact sample size reconciliation
        assert sql_samples["pts"] == py_samples["pts"]
        assert sql_samples["ts_pct"] == py_samples["ts_pct"]
        assert sql_samples["efg_pct"] == py_samples["efg_pct"]

    def test_stable_page_traversal_every_row_traverses_once(self, db_session: Session) -> None:
        """Advancing through pages using cursors must traverse every eligible player once."""
        ctx = resolve_workbench_context(db_session)
        page_size = 25

        all_traversed_ids: list[str] = []
        cursor: str | None = None
        has_more = True
        pages_count = 0
        total_eligible = 0

        # Traverse all pages
        while has_more:
            current_query = QuerySpec(
                season=ctx.season,
                page=PagingSpec(limit=page_size, cursor=cursor),
                sort=[SortSpec(field="pts", direction="desc")],
            )
            items, total_count, cursor, has_more = execute_stats_query(
                db_session, ctx, current_query
            )
            total_eligible = total_count
            pages_count += 1
            all_traversed_ids.extend([item["player_id"] for item in items])
            if pages_count > 30:  # safety break
                break

        # Every player traversed once, no duplicates, count matches
        assert total_eligible > 100
        assert len(all_traversed_ids) == total_eligible
        assert len(set(all_traversed_ids)) == total_eligible

    def test_saved_investigation_reproduces_over_100_rows(self, db_session: Session) -> None:
        """Saving an investigation with >100 eligible rows must reproduce matching SHA-256."""
        ctx = resolve_workbench_context(db_session)
        title = "Complete 2023-24 Player Cohort Investigation"

        # Query covers entire season without tight limit
        query = QuerySpec(
            season="2023-24",
            sort=[SortSpec(field="pts", direction="desc")],
        )

        # 1. Export stats query directly verifies >100 rows
        all_items = export_stats_query(db_session, ctx, query, max_rows=2000)
        assert len(all_items) > 100

        # 2. Save investigation
        from courtload.domain.query_url import query_spec_to_research_query

        research_query = query_spec_to_research_query(query)
        inv = save_investigation(db_session, ctx, title=title, query=research_query)

        # 3. Retrieve saved investigation
        inv_data = get_investigation(db_session, inv.id)
        assert inv_data["total_rows"] > 100
        assert inv_data["total_rows"] == len(all_items)
        assert inv_data["result_sha256"] == canonical_hash(all_items)

        # 4. Reproduce investigation
        repro_result = reproduce_investigation(db_session, inv.id)
        assert repro_result["reproducible"] is True
        assert repro_result["match"] is True
        assert repro_result["saved_result_sha256"] == repro_result["recomputed_result_sha256"]

    def test_query_plan_performance_harness(self, db_session: Session) -> None:
        """Performance harness must measure execution time <500ms and verify DB plan execution."""
        ctx = resolve_workbench_context(db_session)
        query = QuerySpec(
            season=ctx.season,
            predicates=PredicateGroup(
                conjunction="and",
                predicates=[
                    PredicateLeaf(field="pts_per_game", op=PredicateOp.GTE, value=20.0),
                    PredicateLeaf(field="ts_pct", op=PredicateOp.GTE, value=0.58),
                ],
            ),
            page=PagingSpec(limit=50),
        )

        perf = explain_stats_query(db_session, ctx, query)
        assert "execution_time_ms" in perf
        assert "planning_time_ms" in perf
        assert "total_cost" in perf

        # Acceptance budget: execution time well under p95 <= 500 ms target
        assert perf["execution_time_ms"] < 500.0
        assert perf["planning_time_ms"] < 100.0
        assert perf["total_cost"] > 0.0

    def test_predicates_and_sample_filters_reconcile(self, db_session: Session) -> None:
        """Predicates and sample filters must be strictly satisfied on all returned rows."""
        ctx = resolve_workbench_context(db_session)
        query = QuerySpec(
            season=ctx.season,
            sample_filters=SampleFilter(min_games=10, min_minutes=200.0, min_avg_minutes=15.0),
            predicates=PredicateGroup(
                conjunction="and",
                predicates=[
                    PredicateLeaf(field="pts_per_game", op=PredicateOp.BETWEEN, value=[18.0, 28.0]),
                ],
            ),
            sort=[SortSpec(field="pts_per_game", direction="desc")],
            page=PagingSpec(limit=50),
        )

        items, total_count, _, _ = execute_stats_query(db_session, ctx, query)
        assert total_count > 0

        for it in items:
            m = it["metrics"]
            assert it["games_played"] >= 10
            assert it["total_minutes"] >= 200.0
            assert m["min_per_game"] >= 15.0
            assert 18.0 <= m["pts_per_game"] <= 28.0
