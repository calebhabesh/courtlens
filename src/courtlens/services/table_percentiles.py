"""PC12 league comparison ranks, separate from retained Stats cohort arithmetic."""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from math import floor, isfinite
from typing import Any

from sqlalchemy.orm import Session

from courtlens.domain.impact_catalog import SERVING_CATALOG
from courtlens.domain.metrics import TABLE_PERCENTILE_MIN_MINUTES
from courtlens.domain.query_spec import QuerySpec, SampleFilter, SortSpec, TeamScope, WindowSpec
from courtlens.domain.stats_presentation import StatsPresentation
from courtlens.services.stats_cohort_cache import cached_rows, cohort_key, cohort_query
from courtlens.services.stats_engine import execute_stats_query, stats_presentation_hash
from courtlens.services.workbench_analytics import ResolvedContext, canonical_hash

VERSION = "courtlens-table-percentiles-v1"


def number(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and isfinite(value) else None


def percentile(value: Any, cohort: list[float], direction: str | None) -> float | None:
    """Evaluate a value against the complete qualified distribution, ties at midrank."""
    observed = number(value)
    if observed is None or len(cohort) < 2:
        return None
    less = bisect_left(cohort, observed)
    equal = bisect_right(cohort, observed) - less
    raw = 100 * (less + 0.5 * equal) / len(cohort)
    oriented = 100 - raw if direction == "low" else raw
    return floor(min(99, max(1, oriented)) + 0.5)


def annotate_players(
    session: Session, context: ResolvedContext, query: QuerySpec, items: list[dict[str, Any]]
) -> dict[str, Any]:
    """Season minutes qualify; rates/ranks use the selected window before output filters.

    A team-filtered value is compared against league values in the same window, while
    qualification uses all of that player's appearances through the exclusive cutoff.
    Neither name, favorites, paging, team nor minimum-sample filters change the reference.
    """
    league_query = query.model_copy(
        update={
            "name": None,
            "team_scope": TeamScope(),
            "sample_filters": SampleFilter(),
            "predicates": None,
            "sort": [SortSpec(field="player_id", direction="asc")],
        }
    )

    def league_rows(requested: QuerySpec) -> tuple[list[dict[str, Any]], int]:
        # Every joined view of a scope shares one reference carrying all joined columns.
        scope = cohort_query(requested)

        # The league reference ignores display filters; cache it with the cohort.
        def compute() -> tuple[list[dict[str, Any]], int]:
            rows, total, _, _ = execute_stats_query(
                session,
                context,
                scope,
                is_export=True,
                max_export_rows=2000,
                presentation=StatsPresentation(),
                cohort_percentiles=False,
            )
            # The reference reads only values and qualification; keep the cached copy small.
            keep = ("player_id", "metrics")
            slim = [
                {key: row[key] for key in keep}
                | {
                    "impact_support": {
                        name: {"qualified": entry.get("qualified")}
                        for name, entry in (row.get("impact_support") or {}).items()
                    }
                }
                for row in rows
            ]
            return slim, total

        scope_hash = stats_presentation_hash(context, scope, StatsPresentation(), cohort=True)
        # Read-only: the reference rows are never modified below.
        return cached_rows(cohort_key("table-league", scope_hash, scope), compute, shared=True)

    league, count = league_rows(league_query)
    if count > len(league):
        # Never rank a truncated reference population.
        raise ValueError("Table percentile reference exceeds the 2,000-player bound")
    season_rows = league
    if query.window.kind.value != "season":
        season_scope = league_query.model_copy(update={"window": WindowSpec()})
        season_rows, season_count = league_rows(season_scope)
        if season_count > len(season_rows):
            raise ValueError("Season qualification exceeds the 2,000-player bound")
    qualified_ids = {
        row["player_id"]
        for row in season_rows
        if (number(row["metrics"].get("min")) or 0) >= TABLE_PERCENTILE_MIN_MINUTES
    }
    keys = {key for row in items for key in row["metrics"] if key in SERVING_CATALOG}
    distributions: dict[str, list[float]] = {}
    for key in keys:
        distributions[key] = sorted(
            value
            for row in league
            if row["player_id"] in qualified_ids
            and (row.get("impact_support") or {}).get(key, {}).get("qualified", True)
            and (value := number(row["metrics"].get(key))) is not None
        )
    for row in items:
        row["table_qualified"] = row["player_id"] in qualified_ids
        row["table_percentiles"] = {
            key: percentile(row["metrics"].get(key), values, SERVING_CATALOG[key].good_direction)
            if (row.get("impact_support") or {}).get(key, {}).get("qualified", True)
            else None
            for key, values in distributions.items()
        }
        row["table_cohort_sample_sizes"] = {
            key: len(values) for key, values in distributions.items()
        }
    return {
        "version": VERSION,
        "scope_hash": canonical_hash(
            {
                "version": VERSION,
                "release_id": context.release_id,
                "dataset_id": context.dataset_id,
                "semantic_signature": context.semantic_signature,
                "season": query.season or context.season,
                "phase": query.phase or context.phase,
                "before_date": (query.before_date or context.before_date).isoformat(),
                "query": league_query.model_dump(mode="json", exclude={"page", "view_state"}),
                "min_minutes": TABLE_PERCENTILE_MIN_MINUTES,
            }
        ),
        "qualified_players": len(qualified_ids),
        "min_season_minutes": TABLE_PERCENTILE_MIN_MINUTES,
        "reference": (
            "League, same season, phase, cutoff and selected window; season minutes qualify"
        ),
        "formula": (
            "100 * (count_less + 0.5 * count_equal) / n; "
            "oriented by catalog, rounded, clamped to 1-99"
        ),
    }


# All teams with a known value; no player-minute rule applies to teams.
TEAM_METRICS: dict[str, tuple[str | None, str]] = {
    "win_pct": ("high", "win_pct"),
    "wins": ("high", "wins"),
    "ppg": ("high", "production.pts_per_game"),
    "opp_ppg": ("low", "allowance.pts_allowed_per_game"),
    "fg_pct": ("high", "production.fg_pct"),
    "opp_fg_pct": ("low", "allowance.fg_pct_allowed"),
    "fg3_pct": ("high", "production.fg3_pct"),
    "ft_pct": ("high", "production.ft_pct"),
    "production_efg_pct": ("high", "production.efg_pct"),
    "off_rating": ("high", "ratings.off_rating"),
    "def_rating": ("low", "ratings.def_rating"),
    "net_rating": ("high", "ratings.net_rating"),
    "pace": (None, "ratings.pace"),
    "efg_pct": ("high", "four_factors.efg_pct"),
    "tov_pct": ("low", "four_factors.tov_pct"),
    "oreb_pct": ("high", "four_factors.oreb_pct"),
    "ftr": ("high", "four_factors.ftr"),
    "opp_efg_pct": ("low", "four_factors.opp_efg_pct"),
    "opp_tov_pct": ("high", "four_factors.opp_tov_pct"),
    "opp_oreb_pct": ("low", "four_factors.opp_oreb_pct"),
    "opp_ftr": ("low", "four_factors.opp_ftr"),
}


def team_values(row: dict[str, Any]) -> dict[str, float | None]:
    values = {}
    for key, (_, path) in TEAM_METRICS.items():
        value: Any = row
        for part in path.split("."):
            value = value.get(part) if isinstance(value, dict) else None
        values[key] = number(value)
    ppg, opp_ppg = values["ppg"], values["opp_ppg"]
    values["net_margin"] = ppg - opp_ppg if ppg is not None and opp_ppg is not None else None
    return values


def annotate_teams(teams: list[dict[str, Any]]) -> None:
    values = [team_values(row) for row in teams]
    for key, direction in [
        *((key, rule[0]) for key, rule in TEAM_METRICS.items()),
        ("net_margin", "high"),
    ]:
        cohort = sorted(value for row in values if (value := row[key]) is not None)
        for team, row in zip(teams, values, strict=True):
            team.setdefault("table_percentiles", {})[key] = percentile(row[key], cohort, direction)
            team.setdefault("table_cohort_sample_sizes", {})[key] = len(cohort)
