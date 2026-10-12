"""Canonical URL serialization, deserialization, and legacy query mapping."""

from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import date
from typing import TYPE_CHECKING, Any, Literal

if TYPE_CHECKING:
    from courtlens.services.workbench_analytics import ResearchQuery
from urllib.parse import urlencode

from courtlens.domain.query_spec import (
    EntityKind,
    MetricSelector,
    NormalizationMode,
    PagingSpec,
    PredicateGroup,
    PredicateLeaf,
    PredicateOp,
    QuerySpec,
    SampleFilter,
    SortSpec,
    TeamScope,
    ViewState,
    WindowKind,
    WindowSpec,
)


def _parse_date(val: Any) -> date | None:
    if val is None or val == "":
        return None
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        return date.fromisoformat(val.strip())
    raise ValueError(f"cannot parse date from: {val!r}")


def _parse_int(val: Any) -> int | None:
    if val is None or val == "":
        return None
    return int(val)


def _parse_float(val: Any) -> float | None:
    if val is None or val == "":
        return None
    return float(val)


def _parse_predicates(raw: Any) -> PredicateGroup | None:
    if raw is None or raw == "":
        return None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as err:
            raise ValueError(f"invalid JSON in predicates parameter: {err}") from err
    if not isinstance(raw, dict):
        raise ValueError("predicates must be an object")

    def _parse_node(node: dict[str, Any]) -> PredicateLeaf | PredicateGroup:
        if "field" in node and "op" in node:
            return PredicateLeaf(
                field=str(node["field"]),
                op=PredicateOp(str(node["op"]).lower()),
                value=node.get("value"),
            )
        conjunction_raw = str(node.get("conjunction", "and")).lower()
        if conjunction_raw not in ("and", "or"):
            raise ValueError(f"invalid conjunction '{conjunction_raw}'; expected 'and' or 'or'")
        conjunction_val: Literal["and", "or"] = "or" if conjunction_raw == "or" else "and"
        children: list[PredicateLeaf | PredicateGroup] = []
        for child in node.get("predicates", []):
            if isinstance(child, dict):
                children.append(_parse_node(child))
        return PredicateGroup(conjunction=conjunction_val, predicates=children)

    result = _parse_node(raw)
    if isinstance(result, PredicateLeaf):
        return PredicateGroup(conjunction="and", predicates=[result])
    return result


def serialize_query_to_params(query: QuerySpec, *, style: str = "camelCase") -> dict[str, str]:
    """Serialize a QuerySpec into URL search parameters.

    Default style is camelCase for Next.js consistency, but all output round-trips
    through deserialize_params_to_query regardless of casing.
    """
    params: dict[str, str] = {}

    def set_param(camel: str, snake: str, value: str | None) -> None:
        if value is None or value == "":
            return
        key = camel if style == "camelCase" else snake
        params[key] = value

    # Core context dimensions
    set_param("releaseId", "release_id", query.release_id)
    set_param("impactManifest", "impact_manifest_sha256", query.impact_manifest_sha256)
    set_param("darkoManifest", "darko_manifest_sha256", query.darko_manifest_sha256)
    set_param("season", "season", query.season)
    set_param("phase", "phase", query.phase)
    if query.before_date:
        set_param("beforeDate", "before_date", query.before_date.isoformat())

    # Window
    set_param("window", "window", query.window.kind.value)
    if query.window.n is not None and query.window.kind in (
        WindowKind.LAST_N_APPEARANCES,
        WindowKind.LAST_N_TEAM_GAMES,
    ):
        set_param("windowN", "window_n", str(query.window.n))
    if query.window.from_date:
        set_param("fromDate", "from_date", query.window.from_date.isoformat())
    if query.window.to_date:
        set_param("toDate", "to_date", query.window.to_date.isoformat())

    # Entity / search
    if query.entity_kind != EntityKind.PLAYER:
        set_param("entityKind", "entity_kind", query.entity_kind.value)
    if query.name:
        set_param("name", "name", query.name)

    # Team scope
    if query.team_scope.team_id:
        set_param("teamId", "team_id", query.team_scope.team_id)

    # Sample filters
    sf = query.sample_filters
    if sf.min_games is not None:
        set_param("minGames", "min_games", str(sf.min_games))
    if sf.min_minutes is not None:
        set_param("minMinutes", "min_minutes", str(sf.min_minutes))
    if sf.min_avg_minutes is not None:
        set_param("minAvgMinutes", "min_avg_minutes", str(sf.min_avg_minutes))
    if sf.min_possessions is not None:
        set_param("minPossessions", "min_possessions", str(sf.min_possessions))
    if sf.min_attempts is not None:
        set_param("minAttempts", "min_attempts", str(sf.min_attempts))

    # Sort
    if query.sort:
        primary = query.sort[0]
        set_param("sortMetric", "sort_metric", primary.field)
        set_param("sortDirection", "sort_direction", primary.direction)
        if len(query.sort) > 1:
            sort_list = [s.model_dump(mode="json") for s in query.sort]
            set_param("sort", "sort", json.dumps(sort_list))

    # Page & Cursor
    if query.page.limit != 50:
        set_param("limit", "limit", str(query.page.limit))
    if query.page.cursor:
        set_param("cursor", "cursor", query.page.cursor)

    # Predicates
    if query.predicates and len(query.predicates.predicates) > 0:
        pred_dict = query.predicates.model_dump(mode="json")
        set_param("predicates", "predicates", json.dumps(pred_dict))

    if query.metric_selectors:
        set_param(
            "metrics",
            "metrics",
            json.dumps([m.model_dump(mode="json") for m in query.metric_selectors]),
        )

    # View state
    if query.view_state:
        vs = query.view_state
        if vs.view_id:
            set_param("viewId", "view_id", vs.view_id)
        if vs.columns:
            set_param("columns", "columns", ",".join(vs.columns))
        if vs.density:
            set_param("density", "density", vs.density)
        if vs.identity_mode:
            set_param("identityMode", "identity_mode", vs.identity_mode)

    return params


def serialize_query_to_url_string(query: QuerySpec) -> str:
    """Encode QuerySpec into a standard URL query string."""
    params = serialize_query_to_params(query)
    return urlencode(params)


def deserialize_params_to_query(params: Mapping[str, Any]) -> QuerySpec:
    """Deserialize query parameters into a canonical QuerySpec.

    Accepts both camelCase and snake_case keys transparently, resolving Finding 5
    and preserving context across navigation and saved queries.
    """

    def get_val(*keys: str, default: Any = None) -> Any:
        for k in keys:
            if k in params and params[k] is not None and params[k] != "":
                return params[k]
        return default

    # Release ID (Finding 6)
    release_id = get_val("releaseId", "release_id")
    if release_id:
        release_id = str(release_id).strip()

    # Season and Phase
    season = str(get_val("season", default="2025-26")).strip()
    phase = str(get_val("phase", default="regular_season")).strip()

    # Dates
    before_date_raw = get_val("beforeDate", "before_date")
    before_date = _parse_date(before_date_raw)

    # Window
    window_raw = str(get_val("window", default="season")).strip().lower()
    window_n_raw = get_val("windowN", "window_n")
    window_n = _parse_int(window_n_raw)
    from_date = _parse_date(get_val("fromDate", "from_date"))
    to_date = _parse_date(get_val("toDate", "to_date"))

    if window_raw == "last_5":
        window_spec = WindowSpec(kind=WindowKind.LAST_5, n=5)
    elif window_raw == "last_10":
        window_spec = WindowSpec(kind=WindowKind.LAST_10, n=10)
    elif window_raw == "date_range":
        window_spec = WindowSpec(kind=WindowKind.DATE_RANGE, from_date=from_date, to_date=to_date)
    elif window_raw in ("last_n_appearances", "last_n_team_games"):
        kind = (
            WindowKind.LAST_N_APPEARANCES
            if window_raw == "last_n_appearances"
            else WindowKind.LAST_N_TEAM_GAMES
        )
        window_spec = WindowSpec(kind=kind, n=window_n or 10)
    else:
        window_spec = WindowSpec(kind=WindowKind.SEASON)

    # Name and Entity Kind
    name = get_val("name")
    if name:
        name = str(name).strip()
    entity_kind_raw = str(get_val("entityKind", "entity_kind", default="player")).strip().lower()
    try:
        entity_kind = EntityKind(entity_kind_raw)
    except ValueError:
        entity_kind = EntityKind.PLAYER

    # Team scope
    team_id = get_val("teamId", "team_id")
    if team_id:
        team_id = str(team_id).strip()
    team_scope = TeamScope(team_id=team_id)

    # Sample filters
    sample_filters = SampleFilter(
        min_games=_parse_int(get_val("minGames", "min_games")),
        min_minutes=_parse_float(get_val("minMinutes", "min_minutes")),
        min_avg_minutes=_parse_float(get_val("minAvgMinutes", "min_avg_minutes")),
        min_possessions=_parse_int(get_val("minPossessions", "min_possessions")),
        min_attempts=_parse_int(get_val("minAttempts", "min_attempts")),
    )

    # Sort
    sort_raw = get_val("sort")
    sort_specs: list[SortSpec] = []
    if sort_raw:
        if isinstance(sort_raw, str):
            try:
                sort_raw = json.loads(sort_raw)
            except json.JSONDecodeError:
                sort_raw = None
        if isinstance(sort_raw, list):
            for s in sort_raw:
                if isinstance(s, dict) and "field" in s:
                    dir_val = "asc" if str(s.get("direction", "")).lower() == "asc" else "desc"
                    sort_specs.append(
                        SortSpec(
                            field=str(s["field"]).lower(),
                            direction=dir_val,
                            nulls_last=bool(s.get("nulls_last", True)),
                        )
                    )
    if not sort_specs:
        sort_metric = str(get_val("sortMetric", "sort_metric", default="pts")).strip().lower()
        sort_dir = str(get_val("sortDirection", "sort_direction", default="desc")).strip().lower()
        sort_specs = [
            SortSpec(
                field=sort_metric,
                direction="asc" if sort_dir == "asc" else "desc",
            )
        ]

    # Page & Cursor (Finding 3)
    limit = _parse_int(get_val("limit", default=50)) or 50
    cursor = get_val("cursor")
    if cursor:
        cursor = str(cursor).strip()
    paging = PagingSpec(limit=min(max(1, limit), 100), cursor=cursor)

    # Predicates
    predicates_raw = get_val("predicates")
    predicates = _parse_predicates(predicates_raw)

    # View state
    columns_raw = get_val("columns")
    columns: list[str] = []
    if columns_raw:
        if isinstance(columns_raw, list):
            columns = [str(c).strip() for c in columns_raw if c]
        elif isinstance(columns_raw, str):
            columns = [c.strip() for c in columns_raw.split(",") if c.strip()]
    view_state: ViewState | None = None
    if columns or get_val("viewId", "view_id") or get_val("density"):
        view_state = ViewState(
            view_id=get_val("viewId", "view_id"),
            columns=columns,
            density=get_val("density"),
            identity_mode=get_val("identityMode", "identity_mode"),
        )

    # Metric selectors
    selectors: list[MetricSelector] = []
    metrics_raw = get_val("metrics")
    if metrics_raw:
        if isinstance(metrics_raw, str):
            try:
                metrics_list = json.loads(metrics_raw)
            except json.JSONDecodeError:
                metrics_list = [m.strip() for m in metrics_raw.split(",") if m.strip()]
        elif isinstance(metrics_raw, list):
            metrics_list = metrics_raw
        else:
            metrics_list = []
        for m in metrics_list:
            if isinstance(m, dict) and "key" in m:
                selectors.append(
                    MetricSelector(
                        key=str(m["key"]).lower(),
                        version=m.get("version"),
                        normalization=NormalizationMode(m.get("normalization", "raw")),
                        denominator_type=m.get("denominator_type"),
                    )
                )
            elif isinstance(m, str):
                selectors.append(MetricSelector(key=m.lower()))

    return QuerySpec(
        release_id=release_id,
        impact_manifest_sha256=get_val("impactManifest", "impact_manifest_sha256"),
        darko_manifest_sha256=get_val("darkoManifest", "darko_manifest_sha256"),
        season=season,
        phase=phase,
        before_date=before_date,
        name=name,
        entity_kind=entity_kind,
        window=window_spec,
        team_scope=team_scope,
        metric_selectors=selectors,
        predicates=predicates,
        sample_filters=sample_filters,
        sort=sort_specs,
        view_state=view_state,
        page=paging,
    )


def query_spec_to_research_query(spec: QuerySpec) -> ResearchQuery:
    """Convert canonical QuerySpec to legacy ResearchQuery for execution."""
    from courtlens.services.workbench_analytics import ResearchQuery

    metrics = [m.key for m in spec.metric_selectors] if spec.metric_selectors else None
    primary_sort = spec.sort[0] if spec.sort else SortSpec(field="pts", direction="desc")
    return ResearchQuery(
        impact_manifest_sha256=spec.impact_manifest_sha256,
        darko_manifest_sha256=spec.darko_manifest_sha256,
        release_id=spec.release_id,
        season=spec.season,
        phase=spec.phase,
        before_date=spec.before_date,
        window=spec.window.kind.value,
        team_id=spec.team_scope.team_id,
        name=spec.name,
        metrics=metrics,
        min_games=spec.sample_filters.min_games,
        min_minutes=spec.sample_filters.min_minutes,
        min_avg_minutes=spec.sample_filters.min_avg_minutes,
        sort_metric=primary_sort.field,
        sort_direction=primary_sort.direction,
        limit=spec.page.limit,
        cursor=spec.page.cursor,
    )


def research_query_to_query_spec(query: ResearchQuery) -> QuerySpec:
    """Convert legacy ResearchQuery to canonical QuerySpec."""
    try:
        window_kind = WindowKind(query.window)
    except ValueError:
        window_kind = WindowKind.SEASON
    window_spec = WindowSpec(kind=window_kind)

    selectors = [MetricSelector(key=m) for m in query.metrics] if query.metrics else []
    primary_sort = SortSpec(
        field=query.sort_metric,
        direction="asc" if query.sort_direction == "asc" else "desc",
    )

    return QuerySpec(
        release_id=query.release_id,
        impact_manifest_sha256=query.impact_manifest_sha256,
        darko_manifest_sha256=query.darko_manifest_sha256,
        season=query.season or "2025-26",
        phase=query.phase or "regular_season",
        before_date=query.before_date,
        name=query.name,
        entity_kind=EntityKind.PLAYER,
        window=window_spec,
        team_scope=TeamScope(team_id=query.team_id),
        metric_selectors=selectors,
        sample_filters=SampleFilter(
            min_games=query.min_games,
            min_minutes=query.min_minutes,
            min_avg_minutes=query.min_avg_minutes,
        ),
        sort=[primary_sort],
        page=PagingSpec(limit=min(max(1, query.limit), 100), cursor=query.cursor),
    )
