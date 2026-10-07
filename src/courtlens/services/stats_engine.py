"""Bounded Stats query engine for CourtLens research workbench.

Provides SQL-backed aggregation, analytical window functions, predicates compilation,
multi-column sorting, stable cursor pagination, and bounded full-result export iterators.
"""

from __future__ import annotations

import base64
import json
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from courtlens.domain.metrics import (
    METRIC_CATALOG,
    resolve_metric_alias,
    validate_metric_keys,
)
from courtlens.domain.query_spec import (
    ALLOWED_METADATA_FIELDS,
    MAX_PAGE_SIZE,
    EntityKind,
    PredicateGroup,
    PredicateLeaf,
    PredicateOp,
    QuerySpec,
    SortSpec,
    WindowKind,
)
from courtlens.domain.stats_presentation import StatsPresentation
from courtlens.domain.teams import get_team_info, resolve_team_tricode
from courtlens.services.workbench_analytics import (
    MAX_EXPORT_ROWS,
    ResearchQuery,
    ResolvedContext,
    canonical_hash,
    compute_query_context_hash,
)

COLUMN_MAP: dict[str, str] = {
    "gp": "games_played",
    "games_played": "games_played",
    "min": "total_minutes",
    "total_minutes": "total_minutes",
    "min_per_game": "min_per_game",
    "min_avg_minutes": "min_per_game",
    "pts": "pts",
    "pts_per_game": "pts_per_game",
    "pts_per_36": "pts_per_36",
    "reb": "reb",
    "reb_per_game": "reb_per_game",
    "reb_per_36": "reb_per_36",
    "reb_total": "reb",
    "reb_total_per_game": "reb_per_game",
    "oreb": "oreb",
    "oreb_per_game": "oreb_per_game",
    "oreb_per_36": "oreb_per_36",
    "dreb": "dreb",
    "dreb_per_game": "dreb_per_game",
    "dreb_per_36": "dreb_per_36",
    "ast": "ast",
    "ast_per_game": "ast_per_game",
    "ast_per_36": "ast_per_36",
    "stl": "stl",
    "stl_per_game": "stl_per_game",
    "stl_per_36": "stl_per_36",
    "blk": "blk",
    "blk_per_game": "blk_per_game",
    "blk_per_36": "blk_per_36",
    "tov": "tov",
    "tov_per_game": "tov_per_game",
    "tov_per_36": "tov_per_36",
    "pf": "pf",
    "pf_per_game": "pf_per_game",
    "pf_per_36": "pf_per_36",
    "fgm": "fgm",
    "fga": "fga",
    "fg_pct": "fg_pct",
    "fga_per_36": "fga_per_36",
    "fg3m": "fg3m",
    "fg3a": "fg3a",
    "fg3_pct": "fg3_pct",
    "fg3a_per_36": "fg3a_per_36",
    "ftm": "ftm",
    "fta": "fta",
    "ft_pct": "ft_pct",
    "fta_per_36": "fta_per_36",
    "efg_pct": "efg_pct",
    "ts_pct": "ts_pct",
    "ftr": "ftr",
    "legacy_fantasy_score_per_game": "legacy_fantasy_score_per_game",
    "player_id": "player_id",
    "player_name": "player_name",
    "name": "player_name",
    "stints_count": "stints_count",
}

# Only implemented numeric catalog columns participate; metadata is never ranked.
PERCENTILE_COLUMNS = {key: column for key, column in COLUMN_MAP.items() if key in METRIC_CATALOG}


def stats_presentation_hash(
    context: ResolvedContext,
    query: QuerySpec,
    presentation: StatsPresentation,
    *,
    cohort: bool = False,
) -> str:
    """Bind complete query semantics, independently of paging and visual preferences."""
    spec = query.model_dump(mode="json", exclude={"page", "view_state"})
    if cohort:
        for key in ("name", "sort", "metric_selectors"):
            spec.pop(key, None)
    return canonical_hash(
        {
            "version": presentation.version,
            "release_id": context.release_id,
            "dataset_id": context.dataset_id,
            "semantic_signature": context.semantic_signature,
            "season": context.season,
            "phase": context.phase,
            "before_date": context.before_date.isoformat(),
            "query": spec,
            "player_ids": None if cohort else presentation.player_ids,
        }
    )


def map_field_to_sql_column(field: str) -> str:
    """Map a query field or registered metric alias to an aggregated SQL column name."""
    norm = resolve_metric_alias(field.strip().lower())
    if norm in COLUMN_MAP:
        return COLUMN_MAP[norm]
    if norm in ALLOWED_METADATA_FIELDS:
        return norm
    return norm


def compute_stats_query_context_hash(context: ResolvedContext, query: QuerySpec) -> str:
    """Deterministic hash of QuerySpec and resolved context for cursor verification."""
    primary_sort = query.sort[0] if query.sort else SortSpec(field="pts", direction="desc")
    payload = [
        context.release_id,
        context.season,
        context.phase,
        context.before_date.isoformat(),
        query.window.kind.value,
        query.team_scope.team_id or "",
        (query.name or "").strip().lower(),
        query.sample_filters.min_games or 0,
        query.sample_filters.min_minutes or 0.0,
        query.sample_filters.min_avg_minutes or 0.0,
        primary_sort.field,
        primary_sort.direction,
    ]
    return canonical_hash(payload)[:32]


def encode_cursor(context_hash: str, offset: int) -> str:
    """Encode query context hash and offset into URL-safe opaque cursor token."""
    payload = [context_hash, offset]
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def decode_cursor(
    cursor: str,
    expected_context_hashes: list[str] | set[str] | str,
) -> int:
    """Decode and validate opaque cursor token against expected query context hashes."""
    if isinstance(expected_context_hashes, str):
        valid_hashes = {expected_context_hashes}
    else:
        valid_hashes = set(expected_context_hashes)

    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        payload = json.loads(raw)
        if not isinstance(payload, list) or len(payload) != 2:
            raise ValueError("invalid cursor structure")
        c_hash, offset = payload[0], int(payload[1])
        if c_hash not in valid_hashes:
            raise ValueError("cursor hash mismatch")
        return offset
    except Exception as err:
        raise HTTPException(
            status_code=422,
            detail="cursor does not match this request",
        ) from err


def compile_predicate_node(
    node: PredicateGroup | PredicateLeaf,
    params: dict[str, Any],
    is_sqlite: bool = False,
) -> str:
    """Compile a PredicateGroup or PredicateLeaf into an SQL predicate clause."""
    if isinstance(node, PredicateLeaf):
        raw_field = node.field.strip().lower()
        col = map_field_to_sql_column(raw_field)
        op = node.op
        val = node.value

        # Handle team filtering specially when column is teams array/text
        if raw_field in ("team_id", "team_tricode"):
            if op in (PredicateOp.EQ, PredicateOp.NE):
                p_key = f"p_leaf_{len(params)}"
                params[p_key] = str(val).strip()
                op_sign = "=" if op == PredicateOp.EQ else "!="
                if is_sqlite:
                    return f"(teams LIKE '%' || :{p_key} || '%')"
                return (
                    f"(:{p_key} = ANY(teams))"
                    if op_sign == "="
                    else f"(NOT (:{p_key} = ANY(teams)))"
                )
            if op == PredicateOp.IN:
                val_list = [str(v).strip() for v in val]
                base_id = len(params)
                if is_sqlite:
                    sub_clauses = []
                    for idx, v in enumerate(val_list):
                        p_k = f"p_leaf_{base_id}_{idx}"
                        params[p_k] = v
                        sub_clauses.append(f"teams LIKE '%' || :{p_k} || '%'")
                    return f"({' OR '.join(sub_clauses)})"
                p_keys = []
                for idx, v in enumerate(val_list):
                    p_k = f"p_leaf_{base_id}_{idx}"
                    params[p_k] = v
                    p_keys.append(f":{p_k} = ANY(teams)")
                return f"({' OR '.join(p_keys)})"

        # Standard field comparison
        if op == PredicateOp.EQ:
            p_key = f"p_leaf_{len(params)}"
            params[p_key] = val
            return f"({col} = :{p_key})"
        elif op == PredicateOp.NE:
            p_key = f"p_leaf_{len(params)}"
            params[p_key] = val
            return f"({col} != :{p_key})"
        elif op == PredicateOp.LT:
            p_key = f"p_leaf_{len(params)}"
            params[p_key] = val
            return f"({col} < :{p_key})"
        elif op == PredicateOp.LTE:
            p_key = f"p_leaf_{len(params)}"
            params[p_key] = val
            return f"({col} <= :{p_key})"
        elif op == PredicateOp.GT:
            p_key = f"p_leaf_{len(params)}"
            params[p_key] = val
            return f"({col} > :{p_key})"
        elif op == PredicateOp.GTE:
            p_key = f"p_leaf_{len(params)}"
            params[p_key] = val
            return f"({col} >= :{p_key})"
        elif op == PredicateOp.BETWEEN:
            p_low = f"p_leaf_{len(params)}_low"
            p_high = f"p_leaf_{len(params)}_high"
            params[p_low] = val[0]
            params[p_high] = val[1]
            return f"({col} >= :{p_low} AND {col} <= :{p_high})"
        elif op == PredicateOp.IN:
            p_keys = []
            base_id = len(params)
            for idx, item in enumerate(val):
                p_k = f"p_leaf_{base_id}_{idx}"
                params[p_k] = item
                p_keys.append(f":{p_k}")
            return f"({col} IN ({', '.join(p_keys)}))"
        return "1=1"

    elif isinstance(node, PredicateGroup):
        if not node.predicates:
            return "1=1"
        sub_clauses = [compile_predicate_node(p, params, is_sqlite) for p in node.predicates]
        conjunction = " AND " if node.conjunction == "and" else " OR "
        return f"({conjunction.join(sub_clauses)})"

    return "1=1"


def _rate_per_36_sql(stat_col: str, alias: str, *, paired: bool = False) -> str:
    """SQL expression calculating per-36 rate and sample size."""
    if paired:
        valid = f"minutes_seconds > 0 AND {stat_col} IS NOT NULL"
        return f"""case when sum(minutes_seconds) FILTER (WHERE {valid}) > 0
        then round(
            (sum({stat_col}) FILTER (WHERE {valid}))::numeric * 2160
            / (sum(minutes_seconds) FILTER (WHERE {valid}))::numeric, 1
        ) else null end as {alias},
        count(*) FILTER (WHERE {valid}) AS n_{alias}"""
    return f"""case when sum(minutes_seconds) FILTER (
        WHERE minutes_seconds > 0 AND {stat_col} IS NOT NULL
    ) > 0
    then round(
        (sum({stat_col})::numeric / (
            sum(minutes_seconds) FILTER (
                WHERE minutes_seconds > 0 AND {stat_col} IS NOT NULL
            )::numeric / 60.0
        )) * 36.0,
        1
    ) else null end as {alias},
    count(*) FILTER (WHERE minutes_seconds > 0 AND {stat_col} IS NOT NULL) AS n_{alias}"""


def build_stats_query_sql(
    context: ResolvedContext,
    query: QuerySpec,
    *,
    is_count_only: bool = False,
    limit: int | None = None,
    offset: int = 0,
    is_sqlite: bool = False,
    legacy_nonappearance: bool = False,
    presentation: StatsPresentation | None = None,
) -> tuple[str, dict[str, Any]]:
    """Build parameterized SQL query for aggregating and filtering eligible player stats.

    Uses analytical window functions for last-N appearance membership before aggregating,
    keeping query execution strictly in the database engine.
    """
    params: dict[str, Any] = {
        "dataset_id": context.dataset_id,
        "phase": query.phase or context.phase,
        "before_date": query.before_date or context.before_date,
    }

    # 1. Fact Table & Dialect Settings
    is_workbench = context.dataset_type == "workbench"
    table_name = "workbench_player_games" if is_workbench else "archive_player_games"

    def json_extract(col_name: str, key_wb: str, key_ar: str) -> str:
        key = key_wb if is_workbench else key_ar
        if is_sqlite:
            value = f"CAST(json_extract({col_name}, '$.{key}') AS INTEGER)"
        else:
            value = f"({col_name}->>'{key}')::int"
        if is_workbench and legacy_nonappearance:
            return value
        return f"CASE WHEN wpg.appearance = 'appeared' THEN {value} ELSE NULL END"

    teams_agg = "group_concat(distinct team_id)" if is_sqlite else "array_agg(distinct team_id)"

    if is_workbench:
        player_name_expr = "coalesce(wi.display_name, wpg.player_id)"
        identity_join = """LEFT JOIN workbench_identities wi
            ON wi.external_id = wpg.player_id AND wi.kind = 'player'"""
    else:
        # Archive names are retained in the game source version, not the identity row.
        archive_name = (
            "json_extract(av.payload_json, '$.player')"
            if is_sqlite
            else "av.payload_json->>'player'"
        )
        player_name_expr = f"coalesce({archive_name}, wpg.player_id)"
        identity_join = "JOIN archive_versions av ON av.id = wpg.source_version_id"

    # 2. Candidate Filters
    candidate_filters = [
        "wpg.dataset_id = :dataset_id",
        "wpg.game_date < :before_date",
    ]

    if is_workbench:
        candidate_filters.append("wpg.phase = :phase")

    # Seasons filter
    if query.season_scope.seasons:
        season_keys = []
        for idx, s in enumerate(query.season_scope.seasons):
            k = f"season_{idx}"
            params[k] = s
            season_keys.append(f":{k}")
        candidate_filters.append(f"wpg.season IN ({', '.join(season_keys)})")
    else:
        target_season = query.season or context.season
        params["season"] = target_season
        candidate_filters.append("wpg.season = :season")

    # Team scope filter
    if query.team_scope.team_id:
        t_info = get_team_info(query.team_scope.team_id)
        match_tids = {query.team_scope.team_id}
        if t_info:
            match_tids.add(t_info.team_id)
            match_tids.add(t_info.tricode)
        t_keys = []
        for idx, tid in enumerate(sorted(match_tids)):
            k = f"tid_{idx}"
            params[k] = tid
            t_keys.append(f":{k}")
        candidate_filters.append(f"wpg.team_id IN ({', '.join(t_keys)})")

    # Date range window
    if query.window.kind == WindowKind.DATE_RANGE:
        if query.window.from_date:
            params["window_from_date"] = query.window.from_date
            candidate_filters.append("wpg.game_date >= :window_from_date")
        if query.window.to_date:
            params["window_to_date"] = query.window.to_date
            candidate_filters.append("wpg.game_date < :window_to_date")

    # Name search
    if query.name and presentation is None:
        params["name_pattern"] = f"%{query.name.strip().lower()}%"
        candidate_filters.append(f"LOWER({player_name_expr}) LIKE :name_pattern")

    # 3. Window Function for Last-N Appearances
    has_window_rank = query.window.kind in (
        WindowKind.LAST_5,
        WindowKind.LAST_10,
        WindowKind.LAST_N_APPEARANCES,
        WindowKind.LAST_N_TEAM_GAMES,
    )
    if has_window_rank:
        candidate_filters.append("wpg.appearance = 'appeared'")

    # Points column extraction
    if is_workbench:
        pts_expr = (
            "wpg.points"
            if legacy_nonappearance
            else "CASE WHEN wpg.appearance = 'appeared' THEN wpg.points ELSE NULL END"
        )
    else:
        pts_expr = json_extract("wpg.stats_json", "points", "points")

    reb_expr = json_extract("wpg.stats_json", "rebounds_total", "reboundsTotal")
    oreb_expr = json_extract("wpg.stats_json", "rebounds_offensive", "reboundsOffensive")
    dreb_expr = json_extract("wpg.stats_json", "rebounds_defensive", "reboundsDefensive")
    ast_expr = json_extract("wpg.stats_json", "assists", "assists")
    stl_expr = json_extract("wpg.stats_json", "steals", "steals")
    blk_expr = json_extract("wpg.stats_json", "blocks", "blocks")
    tov_expr = json_extract("wpg.stats_json", "turnovers", "turnovers")
    pf_expr = json_extract("wpg.stats_json", "fouls_personal", "foulsPersonal")

    fgm_expr = json_extract("wpg.stats_json", "field_goals_made", "fieldGoalsMade")
    fga_expr = json_extract("wpg.stats_json", "field_goals_attempted", "fieldGoalsAttempted")
    fg3m_expr = json_extract("wpg.stats_json", "three_pointers_made", "threePointersMade")
    fg3a_expr = json_extract("wpg.stats_json", "three_pointers_attempted", "threePointersAttempted")
    ftm_expr = json_extract("wpg.stats_json", "free_throws_made", "freeThrowsMade")
    fta_expr = json_extract("wpg.stats_json", "free_throws_attempted", "freeThrowsAttempted")

    where_candidate_clause = " AND ".join(candidate_filters)

    # Window cutoff condition
    window_limit_clause = "1=1"
    if query.window.kind == WindowKind.LAST_5:
        window_limit_clause = "app_rank <= 5"
    elif query.window.kind == WindowKind.LAST_10:
        window_limit_clause = "app_rank <= 10"
    elif query.window.kind in (WindowKind.LAST_N_APPEARANCES, WindowKind.LAST_N_TEAM_GAMES):
        params["window_n"] = query.window.n or 10
        window_limit_clause = "app_rank <= :window_n"

    # 4. Aggregated Table Filters (Sample Filters & Predicates)
    agg_filters = []

    # Sample Filters
    if query.sample_filters.min_games is not None:
        params["sf_min_games"] = query.sample_filters.min_games
        agg_filters.append("games_played >= :sf_min_games")
    if query.sample_filters.min_minutes is not None:
        params["sf_min_minutes"] = query.sample_filters.min_minutes
        agg_filters.append("total_minutes >= :sf_min_minutes")
    if query.sample_filters.min_avg_minutes is not None:
        params["sf_min_avg_minutes"] = query.sample_filters.min_avg_minutes
        agg_filters.append("min_per_game >= :sf_min_avg_minutes")
    if query.sample_filters.min_attempts is not None:
        params["sf_min_attempts"] = query.sample_filters.min_attempts
        agg_filters.append("fga >= :sf_min_attempts")

    # Predicates
    if query.predicates and len(query.predicates.predicates) > 0:
        pred_clause = compile_predicate_node(query.predicates, params, is_sqlite)
        if pred_clause and pred_clause != "1=1":
            agg_filters.append(pred_clause)

    where_agg_clause = ("WHERE " + " AND ".join(agg_filters)) if agg_filters else ""

    # 5. Sorting
    sort_clauses = []
    for sort_item in query.sort:
        col = map_field_to_sql_column(sort_item.field)
        direction = "ASC" if sort_item.direction == "asc" else "DESC"
        nulls = "NULLS LAST" if sort_item.nulls_last else "NULLS FIRST"
        sort_clauses.append(f"{col} {direction} {nulls}")

    # Deterministic tie-breaker
    sort_clauses.append("player_id ASC")
    order_by_clause = "ORDER BY " + ", ".join(sort_clauses)

    # 6. Assemble Full Query
    paired_rates = presentation is not None
    cte_sql = f"""WITH ranked_games AS (
        SELECT
            wpg.player_id,
            {player_name_expr} AS player_name,
            wpg.team_id,
            wpg.game_id,
            wpg.game_date,
            wpg.appearance,
            wpg.minutes_seconds,
            {pts_expr} AS points,
            {reb_expr} AS rebounds_total,
            {oreb_expr} AS rebounds_offensive,
            {dreb_expr} AS rebounds_defensive,
            {ast_expr} AS assists,
            {stl_expr} AS steals,
            {blk_expr} AS blocks,
            {tov_expr} AS turnovers,
            {pf_expr} AS fouls_personal,
            {fgm_expr} AS fgm,
            {fga_expr} AS fga,
            {fg3m_expr} AS fg3m,
            {fg3a_expr} AS fg3a,
            {ftm_expr} AS ftm,
            {fta_expr} AS fta,
            ROW_NUMBER() OVER (
                PARTITION BY wpg.player_id
                ORDER BY wpg.game_date DESC, wpg.game_id DESC
            ) AS app_rank
        FROM {table_name} wpg
        {identity_join}
        WHERE {where_candidate_clause}
    ),
    candidate_games AS (
        SELECT * FROM ranked_games WHERE {window_limit_clause}
    ),
    aggregated AS (
        SELECT
            player_id,
            max(player_name) AS player_name,
            {teams_agg} AS teams,
            count(distinct team_id) AS stints_count,
            count(*) FILTER (WHERE appearance = 'appeared') AS games_played,
            round(coalesce(sum(minutes_seconds), 0)::numeric / 60.0, 1) AS total_minutes,
            round(
                avg(minutes_seconds::numeric / 60.0)
                FILTER (WHERE appearance = 'appeared' AND minutes_seconds IS NOT NULL),
                1
            ) AS min_per_game,
            sum(points) AS pts,
            count(points) AS n_pts,
            round(avg(points) FILTER (WHERE points IS NOT NULL), 1) AS pts_per_game,
            sum(rebounds_total) AS reb,
            count(rebounds_total) AS n_reb,
            round(
                avg(rebounds_total) FILTER (WHERE rebounds_total IS NOT NULL),
                1
            ) AS reb_per_game,
            sum(rebounds_offensive) AS oreb,
            count(rebounds_offensive) AS n_oreb,
            round(
                avg(rebounds_offensive) FILTER (WHERE rebounds_offensive IS NOT NULL),
                1
            ) AS oreb_per_game,
            sum(rebounds_defensive) AS dreb,
            count(rebounds_defensive) AS n_dreb,
            round(
                avg(rebounds_defensive) FILTER (WHERE rebounds_defensive IS NOT NULL),
                1
            ) AS dreb_per_game,
            sum(assists) AS ast,
            count(assists) AS n_ast,
            round(avg(assists) FILTER (WHERE assists IS NOT NULL), 1) AS ast_per_game,
            sum(steals) AS stl,
            count(steals) AS n_stl,
            round(avg(steals) FILTER (WHERE steals IS NOT NULL), 1) AS stl_per_game,
            sum(blocks) AS blk,
            count(blocks) AS n_blk,
            round(avg(blocks) FILTER (WHERE blocks IS NOT NULL), 1) AS blk_per_game,
            sum(turnovers) AS tov,
            count(turnovers) AS n_tov,
            round(avg(turnovers) FILTER (WHERE turnovers IS NOT NULL), 1) AS tov_per_game,
            sum(fouls_personal) AS pf,
            count(fouls_personal) AS n_pf,
            round(
                avg(fouls_personal) FILTER (WHERE fouls_personal IS NOT NULL),
                1
            ) AS pf_per_game,
            sum(fgm) FILTER (WHERE fgm IS NOT NULL AND fga IS NOT NULL) AS fgm,
            sum(fga) FILTER (WHERE fgm IS NOT NULL AND fga IS NOT NULL) AS fga,
            count(*) FILTER (WHERE fgm IS NOT NULL AND fga IS NOT NULL) AS n_fg,
            case when sum(fga) FILTER (WHERE fgm IS NOT NULL AND fga IS NOT NULL) > 0
                 then round(sum(fgm)::numeric / sum(fga)::numeric, 4) else null end as fg_pct,
            sum(fg3m) FILTER (WHERE fg3m IS NOT NULL AND fg3a IS NOT NULL) AS fg3m,
            sum(fg3a) FILTER (WHERE fg3m IS NOT NULL AND fg3a IS NOT NULL) AS fg3a,
            count(*) FILTER (WHERE fg3m IS NOT NULL AND fg3a IS NOT NULL) AS n_fg3,
            case when sum(fg3a) FILTER (WHERE fg3m IS NOT NULL AND fg3a IS NOT NULL) > 0
                 then round(sum(fg3m)::numeric / sum(fg3a)::numeric, 4) else null end as fg3_pct,
            sum(ftm) FILTER (WHERE ftm IS NOT NULL AND fta IS NOT NULL) AS ftm,
            sum(fta) FILTER (WHERE ftm IS NOT NULL AND fta IS NOT NULL) AS fta,
            count(*) FILTER (WHERE ftm IS NOT NULL AND fta IS NOT NULL) AS n_ft,
            case when sum(fta) FILTER (WHERE ftm IS NOT NULL AND fta IS NOT NULL) > 0
                 then round(sum(ftm)::numeric / sum(fta)::numeric, 4) else null end as ft_pct,
            count(*) FILTER (
                WHERE fgm IS NOT NULL AND fg3m IS NOT NULL AND fga IS NOT NULL
            ) AS n_efg,
            case when sum(fga) FILTER (
                WHERE fgm IS NOT NULL AND fg3m IS NOT NULL AND fga IS NOT NULL
            ) > 0
                 then round(
                     (sum(fgm)::numeric + 0.5 * sum(fg3m)::numeric) / sum(fga)::numeric,
                     4
                 ) else null end as efg_pct,
            count(*) FILTER (
                WHERE points IS NOT NULL AND fga IS NOT NULL AND fta IS NOT NULL
            ) AS n_ts,
            case when (
                sum(fga) FILTER (WHERE points IS NOT NULL AND fga IS NOT NULL AND fta IS NOT NULL)
                + 0.44 * sum(fta) FILTER (
                    WHERE points IS NOT NULL AND fga IS NOT NULL AND fta IS NOT NULL
                )
            ) > 0
                 then round(
                     sum(points)::numeric / (2.0 * (
                         sum(fga) FILTER (
                             WHERE points IS NOT NULL AND fga IS NOT NULL AND fta IS NOT NULL
                         )::numeric
                         + 0.44 * sum(fta) FILTER (
                             WHERE points IS NOT NULL AND fga IS NOT NULL AND fta IS NOT NULL
                         )::numeric
                     )),
                     4
                 ) else null end as ts_pct,
            count(*) FILTER (WHERE fta IS NOT NULL AND fga IS NOT NULL) AS n_ftr,
            case when sum(fga) FILTER (WHERE fta IS NOT NULL AND fga IS NOT NULL) > 0
                 then round(sum(fta)::numeric / sum(fga)::numeric, 4) else null end as ftr,
            {_rate_per_36_sql("points", "pts_per_36", paired=paired_rates)},
            {_rate_per_36_sql("rebounds_total", "reb_per_36", paired=paired_rates)},
            {_rate_per_36_sql("assists", "ast_per_36", paired=paired_rates)},
            {_rate_per_36_sql("steals", "stl_per_36", paired=paired_rates)},
            {_rate_per_36_sql("blocks", "blk_per_36", paired=paired_rates)},
            {_rate_per_36_sql("turnovers", "tov_per_36", paired=paired_rates)},
            {_rate_per_36_sql("fouls_personal", "pf_per_36", paired=paired_rates)},
            {_rate_per_36_sql("rebounds_offensive", "oreb_per_36", paired=paired_rates)},
            {_rate_per_36_sql("rebounds_defensive", "dreb_per_36", paired=paired_rates)},
            {_rate_per_36_sql("fga", "fga_per_36", paired=paired_rates)},
            {_rate_per_36_sql("fg3a", "fg3a_per_36", paired=paired_rates)},
            {_rate_per_36_sql("fta", "fta_per_36", paired=paired_rates)},
            round(
                avg(
                    points + 1.2 * rebounds_total + 1.5 * assists
                    + 3.0 * steals + 3.0 * blocks - turnovers
                ) FILTER (
                    WHERE points IS NOT NULL
                    AND rebounds_total IS NOT NULL
                    AND assists IS NOT NULL
                    AND steals IS NOT NULL
                    AND blocks IS NOT NULL
                    AND turnovers IS NOT NULL
                ),
                1
            ) AS legacy_fantasy_score_per_game,
            count(*) FILTER (
                WHERE points IS NOT NULL
                AND rebounds_total IS NOT NULL
                AND assists IS NOT NULL
                AND steals IS NOT NULL
                AND blocks IS NOT NULL
                AND turnovers IS NOT NULL
            ) AS n_legacy_fantasy_score_per_game
        FROM candidate_games
        GROUP BY player_id
    )"""

    result_table = "aggregated"
    result_filter = where_agg_clause
    if presentation is not None:
        # Analytical predicates/sample/team/window filters define eligibility.
        # Name search and explicit entity selection apply after the cohort windows.
        cte_sql += f", eligible AS (SELECT * FROM aggregated {where_agg_clause})"
        display_filters = []
        if query.name:
            params["name_pattern"] = f"%{query.name.strip().lower()}%"
            display_filters.append("LOWER(player_name) LIKE :name_pattern")
        if presentation.player_ids is not None:
            id_keys = []
            for idx, player_id in enumerate(presentation.player_ids):
                key = f"display_player_{idx}"
                params[key] = player_id
                id_keys.append(f":{key}")
            display_filters.append(f"player_id IN ({', '.join(id_keys)})" if id_keys else "1=0")
        result_filter = "WHERE " + " AND ".join(display_filters) if display_filters else ""
        result_table = "eligible"
        if not is_count_only:
            percentile_sql = []
            for key, column in PERCENTILE_COLUMNS.items():
                n = f"count({column}) OVER ()"
                less = f"rank() OVER (ORDER BY {column} ASC NULLS LAST) - 1"
                equal = f"count(*) OVER (PARTITION BY {column})"
                percentile_sql.append(
                    f"CASE WHEN {column} IS NULL OR {n} < 2 THEN NULL ELSE "
                    f"least(99, greatest(1, round(100.0 * ({less} + 0.5 * {equal}) / {n}))) "
                    f"END AS pct_{key}, {n} AS cohort_n_{key}"
                )
            cte_sql += (
                ", cohort_ranked AS (SELECT *, " + ", ".join(percentile_sql) + " FROM eligible)"
            )
            result_table = "cohort_ranked"

    if is_count_only:
        sql = f"{cte_sql}\n    SELECT count(*) FROM {result_table} {result_filter};"
        return sql.strip(), params

    limit_clause = f"LIMIT {limit}" if limit is not None else ""
    offset_clause = f"OFFSET {offset}" if offset > 0 else ""

    sql = f"""{cte_sql}
    SELECT * FROM {result_table}
    {result_filter}
    {order_by_clause}
    {limit_clause}
    {offset_clause};
    """
    return sql.strip(), params


def _cast_num(val: Any) -> Any:
    """Cast numeric values from database Decimal to float or int."""
    if isinstance(val, Decimal):
        f = float(val)
        return int(f) if f.is_integer() else f
    return val


def parse_player_row(row_dict: dict[str, Any]) -> dict[str, Any]:
    """Format an aggregated SQL result row into canonical player research item structure."""
    pid = str(row_dict["player_id"])
    pname = str(row_dict.get("player_name") or pid)

    # Teams array or string
    raw_teams = row_dict.get("teams")
    if isinstance(raw_teams, (list, tuple)):
        teams_list = [resolve_team_tricode(str(t)) for t in raw_teams if t]
    elif isinstance(raw_teams, str):
        teams_list = [resolve_team_tricode(str(t)) for t in raw_teams.split(",") if t]
    else:
        teams_list = []
    teams_list = sorted(set(teams_list))

    gp = int(row_dict.get("games_played") or 0)
    tot_min = float(row_dict.get("total_minutes") or 0.0)
    min_val = row_dict.get("min_per_game")
    mpg = float(min_val) if min_val is not None else None

    # Base Metrics & Sample Sizes
    metrics: dict[str, Any] = {
        "gp": gp,
        "min": tot_min,
        "min_per_game": mpg,
    }
    sample_sizes: dict[str, int] = {
        "gp": gp,
        "min": gp,
        "min_per_game": gp,
    }

    # Populate all standard metrics
    stat_keys = [
        "pts",
        "reb",
        "oreb",
        "dreb",
        "ast",
        "stl",
        "blk",
        "tov",
        "pf",
    ]
    for k in stat_keys:
        tot_val = _cast_num(row_dict.get(k))
        avg_val = _cast_num(row_dict.get(f"{k}_per_game"))
        p36_val = _cast_num(row_dict.get(f"{k}_per_36"))
        n_stat = int(row_dict.get(f"n_{k}") or 0)
        n_p36 = int(row_dict.get(f"n_{k}_per_36") or 0)

        metrics[k] = tot_val
        sample_sizes[k] = n_stat

        metrics[f"{k}_per_game"] = avg_val
        sample_sizes[f"{k}_per_game"] = n_stat

        metrics[f"{k}_per_36"] = p36_val
        sample_sizes[f"{k}_per_36"] = n_p36

    # Rebounds aliases
    metrics["reb_total"] = metrics["reb"]
    sample_sizes["reb_total"] = sample_sizes["reb"]
    metrics["reb_total_per_game"] = metrics["reb_per_game"]
    sample_sizes["reb_total_per_game"] = sample_sizes["reb_per_game"]

    # Shooting
    for make, att, pct in [
        ("fgm", "fga", "fg_pct"),
        ("fg3m", "fg3a", "fg3_pct"),
        ("ftm", "fta", "ft_pct"),
    ]:
        m_val = _cast_num(row_dict.get(make))
        a_val = _cast_num(row_dict.get(att))
        p_val = _cast_num(row_dict.get(pct))
        n_val = int(row_dict.get(f"n_{make[:3]}") or 0)

        metrics[make] = m_val
        sample_sizes[make] = n_val
        metrics[att] = a_val
        sample_sizes[att] = n_val
        metrics[pct] = p_val
        sample_sizes[pct] = n_val

        # per-36 for attempts
        att_p36_key = f"{att}_per_36"
        metrics[att_p36_key] = _cast_num(row_dict.get(att_p36_key))
        sample_sizes[att_p36_key] = int(row_dict.get(f"n_{att_p36_key}") or 0)

    # eFG%, TS%, FTR
    metrics["efg_pct"] = _cast_num(row_dict.get("efg_pct"))
    sample_sizes["efg_pct"] = int(row_dict.get("n_efg") or 0)

    metrics["ts_pct"] = _cast_num(row_dict.get("ts_pct"))
    sample_sizes["ts_pct"] = int(row_dict.get("n_ts") or 0)

    metrics["ftr"] = _cast_num(row_dict.get("ftr"))
    sample_sizes["ftr"] = int(row_dict.get("n_ftr") or 0)

    # Fantasy score
    metrics["legacy_fantasy_score_per_game"] = _cast_num(
        row_dict.get("legacy_fantasy_score_per_game")
    )
    sample_sizes["legacy_fantasy_score_per_game"] = int(
        row_dict.get("n_legacy_fantasy_score_per_game") or 0
    )

    result = {
        "player_id": pid,
        "player_name": pname,
        "teams": teams_list,
        "stints_count": int(row_dict.get("stints_count") or len(teams_list)),
        "games_played": gp,
        "total_minutes": tot_min,
        "metrics": metrics,
        "sample_sizes": sample_sizes,
        "portrait_url": f"/api/workbench/players/{pid}/portrait",
    }
    if "pct_gp" in row_dict:
        result["percentiles"] = {
            key: _cast_num(row_dict.get(f"pct_{key}")) for key in PERCENTILE_COLUMNS
        }
        result["cohort_sample_sizes"] = {
            key: int(row_dict.get(f"cohort_n_{key}") or 0) for key in PERCENTILE_COLUMNS
        }
    return result


def execute_stats_query(
    session: Session,
    context: ResolvedContext,
    query: QuerySpec,
    *,
    is_export: bool = False,
    max_export_rows: int = MAX_EXPORT_ROWS,
    legacy_nonappearance: bool = False,
    presentation: StatsPresentation | None = None,
) -> tuple[list[dict[str, Any]], int, str | None, bool]:
    """Execute typed QuerySpec against indexed facts using SQL aggregation and windowing.

    Returns:
        (items, total_eligible_count, next_cursor, has_more)
    """
    if presentation is not None:
        if query.entity_kind != EntityKind.PLAYER or query.season_scope.seasons:
            raise HTTPException(
                status_code=422, detail="Stats presentation supports single-season players"
            )
        if query.team_scope.current_roster_only or not query.team_scope.participation_only:
            raise HTTPException(
                status_code=422, detail="Stats presentation requires observed team participation"
            )
        if query.window.kind not in (WindowKind.SEASON, WindowKind.LAST_5, WindowKind.LAST_10):
            raise HTTPException(
                status_code=422, detail="Stats presentation supports season, last_5 and last_10"
            )
        if query.sample_filters.min_possessions is not None:
            raise HTTPException(
                status_code=422,
                detail="Possession sample filtering is unavailable in Stats presentation",
            )
        for sort in query.sort:
            if sort.field not in COLUMN_MAP:
                raise HTTPException(
                    status_code=422, detail=f"Stats presentation cannot sort {sort.field}"
                )
        if query.metric_selectors:
            raise HTTPException(
                status_code=422,
                detail="Stats presentation does not support metric selectors",
            )

        def validate_predicate(node: PredicateGroup | PredicateLeaf) -> None:
            if isinstance(node, PredicateLeaf):
                if node.field not in COLUMN_MAP and node.field not in ("team_id", "team_tricode"):
                    raise HTTPException(
                        status_code=422, detail=f"Stats presentation cannot filter {node.field}"
                    )
            else:
                for child in node.predicates:
                    validate_predicate(child)

        if query.predicates is not None:
            validate_predicate(query.predicates)
    # 1. Validate metric keys
    for s in query.sort:
        if s.field not in METRIC_CATALOG and s.field not in ALLOWED_METADATA_FIELDS:
            valid_keys = ", ".join(sorted(METRIC_CATALOG.keys()))
            raise HTTPException(
                status_code=422,
                detail=f"unsupported metric '{s.field}'; valid metrics are: {valid_keys}",
            )
    if query.metric_selectors:
        keys_to_check = [s.key for s in query.metric_selectors]
        try:
            validate_metric_keys(keys_to_check)
        except ValueError as err:
            raise HTTPException(status_code=422, detail=str(err)) from err

    # 2. Check cursor and bounds
    context_hash = (
        stats_presentation_hash(context, query, presentation)
        if presentation is not None
        else compute_stats_query_context_hash(context, query)
    )
    start_offset = 0

    if not is_export and query.page.cursor:
        # Also accept legacy research query context hash for full URL round-trip compatibility
        primary_sort = query.sort[0] if query.sort else SortSpec(field="pts", direction="desc")
        legacy_query = ResearchQuery(
            release_id=query.release_id,
            season=query.season,
            phase=query.phase,
            before_date=query.before_date,
            window=query.window.kind.value,
            team_id=query.team_scope.team_id,
            name=query.name,
            min_games=query.sample_filters.min_games,
            min_minutes=query.sample_filters.min_minutes,
            min_avg_minutes=query.sample_filters.min_avg_minutes,
            sort_metric=primary_sort.field,
            sort_direction=primary_sort.direction,
            limit=query.page.limit,
            cursor=query.page.cursor,
        )
        legacy_hash = compute_query_context_hash(context, legacy_query)
        valid_hashes = [context_hash] if presentation is not None else [context_hash, legacy_hash]
        start_offset = decode_cursor(query.page.cursor, valid_hashes)
        if start_offset < 0:
            raise HTTPException(status_code=422, detail="cursor offset must be nonnegative")

    # 3. Determine dialect
    is_sqlite = session.bind.dialect.name == "sqlite" if session.bind else False

    # 4. Execute Count Query
    count_sql, count_params = build_stats_query_sql(
        context,
        query,
        is_count_only=True,
        is_sqlite=is_sqlite,
        legacy_nonappearance=legacy_nonappearance,
        presentation=presentation,
    )
    total_count = session.execute(text(count_sql), count_params).scalar() or 0

    # 5. Determine limit & offset
    if is_export:
        limit = max_export_rows
        offset = 0
    else:
        limit = min(max(1, query.page.limit), MAX_PAGE_SIZE)
        offset = start_offset

    # 6. Execute Main Aggregation Query
    main_sql, main_params = build_stats_query_sql(
        context,
        query,
        is_count_only=False,
        limit=limit,
        offset=offset,
        is_sqlite=is_sqlite,
        legacy_nonappearance=legacy_nonappearance,
        presentation=presentation,
    )
    result_rows = session.execute(text(main_sql), main_params).mappings().all()

    items = [parse_player_row(dict(r)) for r in result_rows]

    # 7. Cursor & Pagination Flags
    if is_export:
        return items, total_count, None, False

    has_more = (offset + len(items)) < total_count
    next_cursor = encode_cursor(context_hash, offset + len(items)) if has_more else None

    return items, total_count, next_cursor, has_more


def stats_cohort_summary(
    session: Session, context: ResolvedContext, query: QuerySpec, presentation: StatsPresentation
) -> dict[str, Any]:
    """Count the complete eligible cohort even when presentation returns no rows."""
    cohort_query = query.model_copy(update={"name": None})
    sql, params = build_stats_query_sql(
        context,
        cohort_query,
        is_count_only=True,
        is_sqlite=session.bind.dialect.name == "sqlite" if session.bind else False,
        presentation=StatsPresentation(),
    )
    return {
        "version": presentation.version,
        "scope_hash": stats_presentation_hash(context, query, presentation, cohort=True),
        "eligible_players": int(session.execute(text(sql), params).scalar() or 0),
        "formula": "100 * (count_less + 0.5 * count_equal) / n; rounded, clamped to 1-99",
        "good_directions": {key: METRIC_CATALOG[key].good_direction for key in PERCENTILE_COLUMNS},
    }


def export_stats_query(
    session: Session,
    context: ResolvedContext,
    query: QuerySpec,
    *,
    max_rows: int = MAX_EXPORT_ROWS,
    legacy_nonappearance: bool = False,
) -> list[dict[str, Any]]:
    """Execute complete bounded full-result export iterator without page clamping."""
    items, _, _, _ = execute_stats_query(
        session,
        context,
        query,
        is_export=True,
        max_export_rows=max_rows,
        legacy_nonappearance=legacy_nonappearance,
    )
    return items


def explain_stats_query(
    session: Session,
    context: ResolvedContext,
    query: QuerySpec,
    *,
    legacy_nonappearance: bool = False,
) -> dict[str, Any]:
    """Execute query plan analysis and performance harness.

    Runs EXPLAIN (ANALYZE, COSTS, BUFFERS, FORMAT JSON) on PostgreSQL to measure planning,
    execution times, and verified cost bounds.
    """
    is_sqlite = session.bind.dialect.name == "sqlite" if session.bind else False
    limit = min(max(1, query.page.limit), MAX_PAGE_SIZE)
    main_sql, main_params = build_stats_query_sql(
        context,
        query,
        is_count_only=False,
        limit=limit,
        offset=0,
        is_sqlite=is_sqlite,
        legacy_nonappearance=legacy_nonappearance,
    )

    if is_sqlite:
        explain_sql = f"EXPLAIN QUERY PLAN {main_sql}"
        rows = session.execute(text(explain_sql), main_params).fetchall()
        return {
            "dialect": "sqlite",
            "plan": [str(r) for r in rows],
            "planning_time_ms": 0.0,
            "execution_time_ms": 0.0,
            "total_cost": 0.0,
            "sql": main_sql,
            "params": main_params,
        }

    explain_sql = f"EXPLAIN (ANALYZE, COSTS, BUFFERS, FORMAT JSON) {main_sql}"
    res = session.execute(text(explain_sql), main_params).scalar()
    plan_data = json.loads(res) if isinstance(res, str) else res

    first_node = plan_data[0] if isinstance(plan_data, list) and plan_data else {}
    plan_root = first_node.get("Plan", {})

    return {
        "dialect": "postgresql",
        "planning_time_ms": float(first_node.get("Planning Time", 0.0)),
        "execution_time_ms": float(first_node.get("Execution Time", 0.0)),
        "total_cost": float(plan_root.get("Total Cost", 0.0)),
        "plan": plan_data,
        "sql": main_sql,
        "params": main_params,
    }
