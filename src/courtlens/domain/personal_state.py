"""Domain models and contracts for personal state persistence, views, boards, and preferences."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from courtlens.domain.impact_extras_catalog import RETIRED_METRICS
from courtlens.domain.metrics import METRIC_CATALOG_V2
from courtlens.domain.query_spec import ALLOWED_METADATA_FIELDS, get_allowed_query_fields

MAX_CUSTOM_VIEWS = 10
MAX_COLUMNS_PER_VIEW = 25
MAX_COMPARE_PLAYERS = 8

DensityMode = Literal["compact", "standard", "expanded"]
IdentityPresentationMode = Literal["photos", "logos", "initials", "none"]
CountingMode = Literal["per_game", "raw", "per_36", "per_75", "per_100"]
RankingBoardType = Literal["overall", "offense", "defense", "position", "custom"]
ImportConflictMode = Literal["replace", "merge"]
AggregationMethod = Literal["borda", "average_rank"]


def utc_now_iso() -> str:
    """Current UTC timestamp formatted as ISO-8601 string."""
    return datetime.now(UTC).isoformat()


class CustomViewDefinition(BaseModel):
    """Personal custom table view with selectable metric/metadata columns."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    metric_version: Literal["v2", "courtlens-stats-v3", "courtlens-stats-v4"] = "v2"
    unavailable_columns: list[str] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)
    sort_field: str | None = None
    sort_direction: Literal["asc", "desc"] = "desc"
    is_default: bool = False
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)

    @model_validator(mode="before")
    @classmethod
    def drop_retired_metrics(cls, data: Any) -> Any:
        """Saved views keep loading after a metric is retired; the retired column is dropped."""
        if not isinstance(data, dict):
            return data
        cleaned = dict(data)
        for field in ("columns", "unavailable_columns"):
            if isinstance(cleaned.get(field), list):
                cleaned[field] = [key for key in cleaned[field] if key not in RETIRED_METRICS]
        if cleaned.get("sort_field") in RETIRED_METRICS:
            cleaned["sort_field"] = None
        return cleaned

    @model_validator(mode="after")
    def validate_definition(self) -> CustomViewDefinition:
        allowed = (
            set(METRIC_CATALOG_V2) | ALLOWED_METADATA_FIELDS
            if self.metric_version == "v2"
            else get_allowed_query_fields()
        )
        if len(self.columns) > MAX_COLUMNS_PER_VIEW or len(set(self.columns)) != len(self.columns):
            raise ValueError("view columns must be unique and contain at most 25 keys")
        unavailable = set(self.unavailable_columns)
        if unavailable != set(self.columns) - allowed:
            raise ValueError("unsupported columns must be explicitly listed as unavailable_columns")
        if self.sort_field and self.sort_field not in allowed:
            raise ValueError("unsupported sort field")
        return self


class RankingEntry(BaseModel):
    """Subjective rank entry for an individual player within a ranking board."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    rank: int = Field(ge=1)
    player_id: str = Field(min_length=1)
    player_name: str | None = None
    notes: str | None = None
    tags: list[str] = Field(default_factory=list)


class RankingBoardDefinition(BaseModel):
    """Personal ranking board with subjective notes, scope, and ordered player entries."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    board_type: RankingBoardType = "overall"
    scope: dict[str, Any] | None = None
    notes: str | None = None
    entries: list[RankingEntry] = Field(default_factory=list)
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)

    @model_validator(mode="after")
    def validate_entries(self) -> RankingBoardDefinition:
        ids = [entry.player_id for entry in self.entries]
        ranks = [entry.rank for entry in self.entries]
        if len(set(ids)) != len(ids) or sorted(ranks) != list(range(1, len(ranks) + 1)):
            raise ValueError("board players must be unique with contiguous ranks starting at 1")
        return self


class TierGroup(BaseModel):
    """Tier group with label, optional color token, and assigned players."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    tier_id: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=50)
    color: str | None = None
    player_ids: list[str] = Field(default_factory=list)


class TierListDefinition(BaseModel):
    """Personal subjective tier list with categorized tiers and player allocations."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    tiers: list[TierGroup] = Field(default_factory=list)
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)

    @model_validator(mode="after")
    def validate_tiers(self) -> TierListDefinition:
        ids = [tier.tier_id for tier in self.tiers]
        players = [pid for tier in self.tiers for pid in tier.player_ids]
        if len(set(ids)) != len(ids) or len(set(players)) != len(players):
            raise ValueError("tier IDs and assigned players must be unique")
        return self


class WorkspacePreferences(BaseModel):
    """Personal layout and presentation preferences."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    density: DensityMode = "standard"
    identity_mode: IdentityPresentationMode = "photos"
    counting_mode: CountingMode = "per_game"
    default_view_id: str = "overview"
    table_expanded: bool = False
    theme: str = "dark"
    updated_at: str = Field(default_factory=utc_now_iso)


class PersonalWorkspaceState(BaseModel):
    """Complete mutable personal workspace state document."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    workspace_id: str = Field(
        default="default", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    )
    name: str = Field(default="Default Workspace", min_length=1, max_length=100)
    version: int = Field(default=1, ge=1)
    views: list[CustomViewDefinition] = Field(default_factory=list)
    favorites: list[str] = Field(default_factory=list)
    compare_tray: list[str] = Field(default_factory=list)
    ranking_boards: list[RankingBoardDefinition] = Field(default_factory=list)
    tier_lists: list[TierListDefinition] = Field(default_factory=list)
    preferences: WorkspacePreferences = Field(default_factory=WorkspacePreferences)
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)

    @field_validator("views")
    @classmethod
    def validate_views_limit(cls, views: list[CustomViewDefinition]) -> list[CustomViewDefinition]:
        if sum(v.id not in BUILTIN_VIEW_IDS for v in views) > MAX_CUSTOM_VIEWS:
            raise ValueError(
                f"maximum {MAX_CUSTOM_VIEWS} custom views allowed per workspace, found {len(views)}"
            )
        return views

    @field_validator("compare_tray")
    @classmethod
    def validate_compare_tray_limit(cls, tray: list[str]) -> list[str]:
        if len(tray) > MAX_COMPARE_PLAYERS:
            raise ValueError(
                f"maximum {MAX_COMPARE_PLAYERS} players allowed in compare tray, found {len(tray)}"
            )
        return tray

    @model_validator(mode="after")
    def validate_references(self) -> PersonalWorkspaceState:
        for items in (self.views, self.ranking_boards, self.tier_lists):
            ids = [item.id for item in items]
            if len(set(ids)) != len(ids):
                raise ValueError("duplicate document IDs")
        for ids in (self.favorites, self.compare_tray):
            if any(not pid.strip() for pid in ids) or len(set(ids)) != len(ids):
                raise ValueError("player IDs must be nonempty and unique")
        defaults = [view for view in self.views if view.is_default]
        if len(defaults) > 1:
            raise ValueError("only one custom view may be default")
        view_ids = {view.id for view in self.views} | BUILTIN_VIEW_IDS
        if self.preferences.default_view_id not in view_ids:
            raise ValueError("default_view_id must reference a custom view or built-in preset")
        if defaults and defaults[0].id != self.preferences.default_view_id:
            raise ValueError("default view and preferences must agree")
        return self


class AggregatedRankingItem(BaseModel):
    """Aggregated ranking output for a player across multiple selected personal boards."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    player_id: str
    player_name: str | None = None
    aggregated_rank: int
    borda_score: float
    average_rank: float
    boards_present_count: int
    total_boards_count: int
    best_rank: int
    worst_rank: int


class BoardAggregationResult(BaseModel):
    """Explicit mathematical aggregation of personal subjective boards (no inferred consensus)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    method: AggregationMethod
    boards_evaluated: list[str]
    missing_rank_penalty: int
    ranked_players: list[AggregatedRankingItem]
    methodology_notes: str


def compute_board_aggregation(
    boards: list[RankingBoardDefinition],
    method: AggregationMethod = "borda",
    missing_rank_penalty: int | None = None,
) -> BoardAggregationResult:
    """Aggregate selected personal ranking boards mathematically with explicit missing-rank rules.

    Zero Inferred Claims: absent players receive the declared missing-rank penalty.
    No invented global community consensus is claimed; this is a transparent personal aggregate.
    """
    if not boards:
        return BoardAggregationResult(
            method=method,
            boards_evaluated=[],
            missing_rank_penalty=0,
            ranked_players=[],
            methodology_notes="No ranking boards were supplied for aggregation.",
        )

    # 1. Determine player universe, player names, and max rank across evaluated boards
    player_names: dict[str, str | None] = {}
    player_board_ranks: dict[str, dict[str, int]] = {}
    max_board_size = 0

    for board in boards:
        if len(board.entries) > max_board_size:
            max_board_size = len(board.entries)
        for entry in board.entries:
            pid = entry.player_id
            if pid not in player_board_ranks:
                player_board_ranks[pid] = {}
                player_names[pid] = entry.player_name
            elif entry.player_name and not player_names[pid]:
                player_names[pid] = entry.player_name
            player_board_ranks[pid][board.id] = entry.rank

    penalty = missing_rank_penalty if missing_rank_penalty is not None else max_board_size + 1
    total_boards = len(boards)

    # 2. Compute individual player statistics
    player_stats: list[dict[str, Any]] = []
    for pid, b_ranks in player_board_ranks.items():
        present_count = len(b_ranks)
        ranks_list: list[int] = []
        borda_points = 0.0

        for board in boards:
            if board.id in b_ranks:
                r = b_ranks[board.id]
                ranks_list.append(r)
                # Borda score: points = max_board_size - rank + 1 (>= 1 for ranked players)
                borda_points += max(0, max_board_size - r + 1)
            else:
                ranks_list.append(penalty)

        avg_rank = sum(ranks_list) / float(total_boards)
        best_r = min(ranks_list)
        worst_r = max(ranks_list)

        player_stats.append(
            {
                "player_id": pid,
                "player_name": player_names.get(pid),
                "borda_score": borda_points,
                "average_rank": avg_rank,
                "boards_present_count": present_count,
                "total_boards_count": total_boards,
                "best_rank": best_r,
                "worst_rank": worst_r,
            }
        )

    # 3. Sort players
    if method == "borda":
        # Higher borda score is better; break ties by presence, then best rank, then player_id
        player_stats.sort(
            key=lambda x: (
                -x["borda_score"],
                -x["boards_present_count"],
                x["best_rank"],
                x["player_id"],
            )
        )
    else:
        # Lower average rank is better; break ties by presence, then best rank, then player_id
        player_stats.sort(
            key=lambda x: (
                x["average_rank"],
                -x["boards_present_count"],
                x["best_rank"],
                x["player_id"],
            )
        )

    # 4. Assign 1-indexed aggregated rank
    aggregated_items: list[AggregatedRankingItem] = []
    for idx, stat in enumerate(player_stats, start=1):
        aggregated_items.append(
            AggregatedRankingItem(
                player_id=stat["player_id"],
                player_name=stat["player_name"],
                aggregated_rank=idx,
                borda_score=stat["borda_score"],
                average_rank=stat["average_rank"],
                boards_present_count=stat["boards_present_count"],
                total_boards_count=stat["total_boards_count"],
                best_rank=stat["best_rank"],
                worst_rank=stat["worst_rank"],
            )
        )

    notes = (
        f"Aggregated {total_boards} personal board(s) using {method} scoring. "
        f"Absent players were assessed a penalty rank of {penalty}. "
        "Results reflect individual personal boards; no external consensus is claimed."
    )

    return BoardAggregationResult(
        method=method,
        boards_evaluated=[b.id for b in boards],
        missing_rank_penalty=penalty,
        ranked_players=aggregated_items,
        methodology_notes=notes,
    )


class WorkspaceBundle(BaseModel):
    """Portable export/import bundle for full personal workspace state."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    bundle_version: Literal["1.0"] = "1.0"
    exported_at: str = Field(default_factory=utc_now_iso)
    workspace_id: str = Field(
        default="default", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    )
    name: str = Field(default="Default Workspace", min_length=1, max_length=100)
    version: int = Field(default=1, ge=1)
    views: list[CustomViewDefinition] = Field(default_factory=list)
    favorites: list[str] = Field(default_factory=list)
    compare_tray: list[str] = Field(default_factory=list)
    ranking_boards: list[RankingBoardDefinition] = Field(default_factory=list)
    tier_lists: list[TierListDefinition] = Field(default_factory=list)
    preferences: WorkspacePreferences = Field(default_factory=WorkspacePreferences)
    checksum_sha256: str | None = None


def calculate_bundle_checksum(bundle_dict: dict[str, Any]) -> str:
    """Compute cryptographic SHA-256 digest of canonical workspace bundle payload."""
    payload_to_hash = {k: v for k, v in bundle_dict.items() if k != "checksum_sha256"}
    canonical_json = json.dumps(payload_to_hash, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


BUILTIN_VIEW_IDS = {
    "overview",
    "shooting",
    "defense",
    "trueshooting",
    "advanced",
    "playmaking",
    "rebounding",
    "impact",
    "onoff",
    "sixfactor",
}


# Canonical recoverable presets for custom views (F04 built-in presets recoverable)
CANONICAL_BUILTIN_VIEWS: list[CustomViewDefinition] = [
    CustomViewDefinition(
        id="overview",
        name="Overview",
        columns=[
            "gp",
            "min",
            "min_per_game",
            "pts_per_game",
            "reb_per_game",
            "ast_per_game",
            "stl_per_game",
            "blk_per_game",
            "fg_pct",
            "fg3_pct",
            "ft_pct",
            "tov_per_game",
        ],
        sort_field="pts_per_game",
        sort_direction="desc",
        is_default=True,
    ),
    CustomViewDefinition(
        id="shooting",
        name="Shooting",
        columns=[
            "gp",
            "pts_per_game",
            "fgm",
            "fga",
            "fg_pct",
            "fg3m",
            "fg3a",
            "fg3_pct",
            "ftm",
            "fta",
            "ft_pct",
            "ts_pct",
            "efg_pct",
        ],
        sort_field="ts_pct",
        sort_direction="desc",
        is_default=False,
    ),
    CustomViewDefinition(
        id="defense",
        name="Defense",
        columns=[
            "gp",
            "min_per_game",
            "stl_per_game",
            "blk_per_game",
            "dreb_per_game",
            "pf_per_game",
        ],
        sort_field="stl_per_game",
        sort_direction="desc",
        is_default=False,
    ),
    CustomViewDefinition(
        id="trueshooting",
        name="True Shooting",
        columns=[
            "gp",
            "pts_per_game",
            "ts_pct",
            "efg_pct",
            "ftr",
            "fg_pct",
            "fg3_pct",
            "ft_pct",
        ],
        sort_field="ts_pct",
        sort_direction="desc",
        is_default=False,
    ),
    CustomViewDefinition(
        id="advanced",
        name="Rates Per 36",
        columns=[
            "gp",
            "min_per_game",
            "pts_per_36",
            "reb_per_36",
            "ast_per_36",
            "stl_per_36",
            "blk_per_36",
            "tov_per_36",
            "ts_pct",
            "efg_pct",
        ],
        sort_field="pts_per_36",
        sort_direction="desc",
        is_default=False,
    ),
    CustomViewDefinition(
        id="playmaking",
        name="Playmaking",
        columns=[
            "gp",
            "ast_per_game",
            "tov_per_game",
            "ast_per_36",
            "tov_per_36",
            "pts_per_game",
        ],
        sort_field="ast_per_game",
        sort_direction="desc",
        is_default=False,
    ),
    CustomViewDefinition(
        id="rebounding",
        name="Rebounding",
        columns=[
            "gp",
            "reb_per_game",
            "oreb_per_game",
            "dreb_per_game",
            "reb_per_36",
            "min_per_game",
        ],
        sort_field="reb_per_game",
        sort_direction="desc",
        is_default=False,
    ),
]

# Capability-gated presets remain portable unavailable choices until their data blocks pass.
for _view_id, _name, _metric in (
    ("impact", "Impact", "rapm"),
    ("onoff", "On-Off", "onoff_net_rating"),
    ("sixfactor", "Six Factor", "six_factor_impact"),
):
    CANONICAL_BUILTIN_VIEWS.append(
        CustomViewDefinition(
            id=_view_id, name=_name, columns=[_metric], unavailable_columns=[_metric]
        )
    )
