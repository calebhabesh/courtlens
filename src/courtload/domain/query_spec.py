"""Canonical Query Specification v2 with strict validation and typed predicates."""

from __future__ import annotations

from datetime import date
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from courtload.domain.metrics import METRIC_CATALOG, SUPPORTED_PHASES

MAX_LEAF_PREDICATES = 12
MAX_SORT_FIELDS = 3
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100

ALLOWED_METADATA_FIELDS = {
    "player_id",
    "player_name",
    "name",
    "team_id",
    "team_tricode",
    "season",
    "phase",
    "games_played",
    "total_minutes",
    "stints_count",
}


def get_allowed_query_fields() -> set[str]:
    """Union of registered catalog metric keys and recognized metadata fields."""
    return set(METRIC_CATALOG.keys()) | ALLOWED_METADATA_FIELDS


class EntityKind(StrEnum):
    PLAYER = "player"
    TEAM = "team"
    PLAYER_SEASON = "player_season"
    TEAM_SEASON = "team_season"
    GAME = "game"
    STINT = "stint"
    ASSIGNMENT = "assignment"


class WindowKind(StrEnum):
    SEASON = "season"
    LAST_5 = "last_5"
    LAST_10 = "last_10"
    LAST_N_APPEARANCES = "last_n_appearances"
    LAST_N_TEAM_GAMES = "last_n_team_games"
    DATE_RANGE = "date_range"


class WindowSpec(BaseModel):
    """Temporal window specification for aggregation."""

    model_config = ConfigDict(frozen=True)

    kind: WindowKind = WindowKind.SEASON
    n: int | None = Field(default=None, ge=1, le=82)
    from_date: date | None = None
    to_date: date | None = None

    @model_validator(mode="after")
    def validate_window(self) -> WindowSpec:
        if self.kind == WindowKind.LAST_5:
            object.__setattr__(self, "n", 5)
        elif self.kind == WindowKind.LAST_10:
            object.__setattr__(self, "n", 10)
        elif self.kind in (WindowKind.LAST_N_APPEARANCES, WindowKind.LAST_N_TEAM_GAMES):
            if self.n is None:
                object.__setattr__(self, "n", 10)
        elif (
            self.kind == WindowKind.DATE_RANGE
            and self.from_date
            and self.to_date
            and self.from_date >= self.to_date
        ):
            raise ValueError("from_date must be strictly before to_date in date_range window")
        return self


class SeasonScope(BaseModel):
    """Season scope covering one or bounded multi-season/career queries."""

    model_config = ConfigDict(frozen=True)

    seasons: list[str] = Field(default_factory=list)
    aggregate_multi_season: bool = False


class TeamScope(BaseModel):
    """Team participation scope."""

    model_config = ConfigDict(frozen=True)

    team_id: str | None = None
    participation_only: bool = True
    current_roster_only: bool = False


class NormalizationMode(StrEnum):
    RAW = "raw"
    PER_GAME = "per_game"
    PER_MINUTE = "per_minute"
    PER_36 = "per_36"
    PER_75 = "per_75"
    PER_100 = "per_100"
    TOTALS = "totals"


class MetricSelector(BaseModel):
    """Requested metric key, version, and exposure normalization."""

    model_config = ConfigDict(frozen=True)

    key: str
    version: str | None = None
    normalization: NormalizationMode = NormalizationMode.RAW
    denominator_type: str | None = None

    @model_validator(mode="after")
    def validate_selector(self) -> MetricSelector:
        from courtload.domain.metrics import METRIC_CATALOG

        if self.key not in METRIC_CATALOG:
            valid_keys = ", ".join(sorted(METRIC_CATALOG.keys()))
            raise ValueError(
                f"unsupported metric key '{self.key}'; valid metrics are: {valid_keys}"
            )
        defn = METRIC_CATALOG[self.key]
        norm_val = self.normalization.value
        # 'totals' is treated as synonymous with 'raw'
        norm_check = "raw" if norm_val == "totals" else norm_val
        if norm_check not in defn.compatible_normalizations:
            raise ValueError(
                f"metric '{self.key}' does not support normalization '{norm_val}'; "
                f"compatible modes: {defn.compatible_normalizations}"
            )
        return self


class PredicateOp(StrEnum):
    EQ = "eq"
    NE = "ne"
    LT = "lt"
    LTE = "lte"
    GT = "gt"
    GTE = "gte"
    BETWEEN = "between"
    IN = "in"


class PredicateLeaf(BaseModel):
    """Leaf comparison predicate against an allowlisted field."""

    model_config = ConfigDict(frozen=True)

    field: str
    op: PredicateOp
    value: Any

    @model_validator(mode="after")
    def validate_leaf(self) -> PredicateLeaf:
        allowed = get_allowed_query_fields()
        normalized_field = self.field.strip().lower()
        if normalized_field not in allowed:
            valid_fields = ", ".join(sorted(allowed))
            raise ValueError(
                f"unsupported predicate field '{self.field}'; valid fields are: {valid_fields}"
            )
        if self.op == PredicateOp.BETWEEN:
            if not isinstance(self.value, (list, tuple)) or len(self.value) != 2:
                raise ValueError("predicate op 'between' requires a 2-element list [min, max]")
            if (
                self.value[0] is not None
                and self.value[1] is not None
                and self.value[0] > self.value[1]
            ):
                raise ValueError(
                    f"predicate 'between' lower bound {self.value[0]} "
                    f"exceeds upper bound {self.value[1]}"
                )
        elif self.op == PredicateOp.IN:
            if not isinstance(self.value, (list, tuple)) or len(self.value) == 0:
                raise ValueError("predicate op 'in' requires a non-empty list of values")
            if len(self.value) > 50:
                raise ValueError("predicate op 'in' exceeds 50 allowed values")
        return self


class PredicateGroup(BaseModel):
    """Boolean combination of predicates with max leaf depth controls."""

    model_config = ConfigDict(frozen=True)

    conjunction: Literal["and", "or"] = "and"
    predicates: list[PredicateLeaf | PredicateGroup] = Field(default_factory=list)


def count_leaf_predicates(group: PredicateGroup | PredicateLeaf | None) -> int:
    """Recursively count the total number of leaf predicates in an expression tree."""
    if group is None:
        return 0
    if isinstance(group, PredicateLeaf):
        return 1
    total = 0
    for child in group.predicates:
        if isinstance(child, PredicateLeaf):
            total += 1
        elif isinstance(child, PredicateGroup):
            total += count_leaf_predicates(child)
    return total


class SampleFilter(BaseModel):
    """Sample thresholds on appearances, minutes, possessions, or attempts."""

    model_config = ConfigDict(frozen=True)

    min_games: int | None = Field(default=None, ge=0)
    min_minutes: float | None = Field(default=None, ge=0.0)
    min_avg_minutes: float | None = Field(default=None, ge=0.0)
    min_possessions: int | None = Field(default=None, ge=0)
    min_attempts: int | None = Field(default=None, ge=0)


class SortSpec(BaseModel):
    """Sort key with direction and null ordering."""

    model_config = ConfigDict(frozen=True)

    field: str
    direction: Literal["asc", "desc"] = "desc"
    nulls_last: bool = True

    @model_validator(mode="after")
    def validate_sort_field(self) -> SortSpec:
        allowed = get_allowed_query_fields()
        normalized_field = self.field.strip().lower()
        if normalized_field not in allowed:
            valid_fields = ", ".join(sorted(allowed))
            raise ValueError(
                f"unsupported sort field '{self.field}'; valid sort fields are: {valid_fields}"
            )
        return self


class ViewState(BaseModel):
    """Presentation preferences reference that does not change analytical truth."""

    model_config = ConfigDict(frozen=True)

    view_id: str | None = None
    columns: list[str] = Field(default_factory=list)
    density: Literal["compact", "standard", "expanded"] | None = None
    identity_mode: Literal["photos", "logos", "initials", "none"] | None = None


class PagingSpec(BaseModel):
    """Bounded pagination request."""

    model_config = ConfigDict(frozen=True)

    limit: int = Field(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE)
    cursor: str | None = None


class QuerySpec(BaseModel):
    """Canonical Query Specification v2 for all analytical research queries."""

    model_config = ConfigDict(frozen=True)

    release_id: str | None = None
    season: str = "2025-26"
    phase: str = "regular_season"
    before_date: date | None = None
    name: str | None = None
    entity_kind: EntityKind = EntityKind.PLAYER
    window: WindowSpec = Field(default_factory=WindowSpec)
    season_scope: SeasonScope = Field(default_factory=SeasonScope)
    team_scope: TeamScope = Field(default_factory=TeamScope)
    metric_selectors: list[MetricSelector] = Field(default_factory=list)
    predicates: PredicateGroup | None = None
    sample_filters: SampleFilter = Field(default_factory=SampleFilter)
    sort: list[SortSpec] = Field(default_factory=lambda: [SortSpec(field="pts", direction="desc")])
    view_state: ViewState | None = None
    page: PagingSpec = Field(default_factory=PagingSpec)

    @model_validator(mode="after")
    def validate_query(self) -> QuerySpec:
        # 1. Phase validation
        if self.phase not in SUPPORTED_PHASES:
            valid_phases = ", ".join(SUPPORTED_PHASES)
            raise ValueError(f"unsupported phase '{self.phase}'; valid phases are: {valid_phases}")

        # 2. Metric selectors validation
        for selector in self.metric_selectors:
            if selector.key not in METRIC_CATALOG:
                valid_metrics = ", ".join(sorted(METRIC_CATALOG.keys()))
                raise ValueError(
                    f"unsupported metric '{selector.key}'; valid metrics are: {valid_metrics}"
                )

        # 3. Predicates leaf count validation
        leaf_count = count_leaf_predicates(self.predicates)
        if leaf_count > MAX_LEAF_PREDICATES:
            raise ValueError(
                f"maximum {MAX_LEAF_PREDICATES} leaf predicates allowed, found {leaf_count}"
            )

        # 4. Sort specs count validation
        if len(self.sort) > MAX_SORT_FIELDS:
            raise ValueError(
                f"maximum {MAX_SORT_FIELDS} sort fields allowed, found {len(self.sort)}"
            )

        return self
