"""Database persistence and business logic for personal workspace state."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from courtload.domain.personal_state import (
    BUILTIN_VIEW_IDS,
    MAX_COMPARE_PLAYERS,
    MAX_CUSTOM_VIEWS,
    AggregationMethod,
    BoardAggregationResult,
    CustomViewDefinition,
    ImportConflictMode,
    PersonalWorkspaceState,
    RankingBoardDefinition,
    TierListDefinition,
    WorkspaceBundle,
    WorkspacePreferences,
    calculate_bundle_checksum,
    compute_board_aggregation,
    utc_now_iso,
)
from courtload.models import utc_now
from courtload.workbench_models import WorkbenchIdentity, WorkbenchPersonalWorkspace


class VersionConflictError(Exception):
    """Raised when an update conflicts with the current persisted workspace version."""

    def __init__(self, current_version: int, expected_version: int):
        self.current_version = current_version
        self.expected_version = expected_version
        super().__init__(
            f"Version conflict: current version is {current_version}, expected {expected_version}"
        )


def _row_to_state(row: WorkbenchPersonalWorkspace) -> PersonalWorkspaceState:
    """Convert an ORM row to a typed domain PersonalWorkspaceState."""
    views = [CustomViewDefinition(**v) for v in row.views_json]
    favorites = list(row.favorites_json)
    compare_tray = list(row.compare_tray_json)
    ranking_boards = [RankingBoardDefinition(**b) for b in row.ranking_boards_json]
    tier_lists = [TierListDefinition(**t) for t in row.tier_lists_json]
    prefs_data = row.preferences_json if isinstance(row.preferences_json, dict) else {}
    preferences = WorkspacePreferences(**prefs_data)

    return PersonalWorkspaceState(
        workspace_id=row.id,
        name=row.name,
        version=row.version,
        views=views,
        favorites=favorites,
        compare_tray=compare_tray,
        ranking_boards=ranking_boards,
        tier_lists=tier_lists,
        preferences=preferences,
        created_at=row.created_at.isoformat() if row.created_at else utc_now_iso(),
        updated_at=row.updated_at.isoformat() if row.updated_at else utc_now_iso(),
    )


def get_or_create_workspace(
    session: Session, workspace_id: str = "default"
) -> PersonalWorkspaceState:
    """Retrieve personal workspace by ID or initialize with canonical defaults."""
    row = session.get(WorkbenchPersonalWorkspace, workspace_id, populate_existing=True)
    if row is not None:
        return _row_to_state(row)
    # Reads do not mutate the database. The first protected write persists defaults.
    return PersonalWorkspaceState(workspace_id=workspace_id)


def update_workspace_state(
    session: Session,
    new_state: PersonalWorkspaceState,
    expected_version: int | None = None,
) -> PersonalWorkspaceState:
    """Validate and atomically compare-and-swap a workspace, never analytical evidence."""
    new_state = PersonalWorkspaceState.model_validate(new_state.model_dump())
    expected = expected_version if expected_version is not None else new_state.version
    if new_state.version != expected:
        raise VersionConflictError(new_state.version, expected)
    players = set(new_state.favorites + new_state.compare_tray)
    players.update(entry.player_id for board in new_state.ranking_boards for entry in board.entries)
    players.update(
        pid for board in new_state.tier_lists for tier in board.tiers for pid in tier.player_ids
    )
    if players:
        known = set(
            session.scalars(
                select(WorkbenchIdentity.external_id).where(
                    WorkbenchIdentity.kind == "player", WorkbenchIdentity.external_id.in_(players)
                )
            )
        )
        if players - known:
            raise ValueError(f"unknown player IDs: {', '.join(sorted(players - known))}")
    values = dict(
        name=new_state.name,
        version=expected + 1,
        views_json=[v.model_dump(mode="json") for v in new_state.views],
        favorites_json=new_state.favorites,
        compare_tray_json=new_state.compare_tray,
        ranking_boards_json=[b.model_dump(mode="json") for b in new_state.ranking_boards],
        tier_lists_json=[t.model_dump(mode="json") for t in new_state.tier_lists],
        preferences_json=new_state.preferences.model_dump(mode="json"),
        updated_at=utc_now(),
    )
    changed = session.execute(
        update(WorkbenchPersonalWorkspace)
        .where(
            WorkbenchPersonalWorkspace.id == new_state.workspace_id,
            WorkbenchPersonalWorkspace.version == expected,
        )
        .values(**values)
        .returning(WorkbenchPersonalWorkspace.id)
    ).scalar_one_or_none()
    if changed is None:
        current = session.get(
            WorkbenchPersonalWorkspace, new_state.workspace_id, populate_existing=True
        )
        if current is not None or expected != 1:
            session.rollback()
            raise VersionConflictError(current.version if current else 1, expected)
        session.add(
            WorkbenchPersonalWorkspace(id=new_state.workspace_id, created_at=utc_now(), **values)
        )
        try:
            session.flush()
        except IntegrityError as exc:
            session.rollback()
            winner = get_or_create_workspace(session, new_state.workspace_id)
            raise VersionConflictError(winner.version, expected) from exc
    session.commit()
    return get_or_create_workspace(session, new_state.workspace_id)


def reset_workspace(
    session: Session,
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Reset workspace to canonical defaults (recovering built-in presets)."""
    current = get_or_create_workspace(session, workspace_id)
    new_state = PersonalWorkspaceState(
        workspace_id=workspace_id,
        name="Default Workspace",
        version=current.version,
        views=[],
        favorites=[],
        compare_tray=[],
        ranking_boards=[],
        tier_lists=[],
        preferences=WorkspacePreferences(),
        created_at=current.created_at,
        updated_at=utc_now_iso(),
    )
    return update_workspace_state(session, new_state, expected_version=expected_version)


def add_custom_view(
    session: Session,
    view: CustomViewDefinition,
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Add a personal custom view, enforcing maximum 10 views and unique default."""
    current = get_or_create_workspace(session, workspace_id)
    if sum(v.id not in BUILTIN_VIEW_IDS for v in current.views) >= MAX_CUSTOM_VIEWS:
        raise ValueError(f"maximum {MAX_CUSTOM_VIEWS} custom views allowed per workspace")

    updated_views: list[CustomViewDefinition] = []
    for existing in current.views:
        if view.is_default and existing.is_default:
            # Unset default on other views if this new view is default
            updated_views.append(existing.model_copy(update={"is_default": False}))
        else:
            updated_views.append(existing)

    if view.id in {v.id for v in current.views} | BUILTIN_VIEW_IDS:
        raise ValueError("view ID already exists or is reserved for a built-in preset")
    updated_views.append(view)
    prefs = current.preferences
    if any(v.is_default for v in updated_views):
        prefs = prefs.model_copy(
            update={"default_view_id": next(v.id for v in updated_views if v.is_default)}
        )
    new_state = current.model_copy(update={"views": updated_views, "preferences": prefs})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def update_custom_view(
    session: Session,
    view_id: str,
    view_data: dict[str, Any],
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Update an existing custom view by ID."""
    current = get_or_create_workspace(session, workspace_id)
    target_idx = -1
    for i, v in enumerate(current.views):
        if v.id == view_id:
            target_idx = i
            break

    if target_idx == -1:
        raise KeyError(f"view with id '{view_id}' not found")

    old_view = current.views[target_idx]
    merged_data = old_view.model_dump()
    merged_data.update(view_data)
    merged_data["id"] = view_id  # Immutable ID
    merged_data["updated_at"] = utc_now_iso()

    new_view = CustomViewDefinition(**merged_data)

    updated_views: list[CustomViewDefinition] = []
    for i, v in enumerate(current.views):
        if i == target_idx:
            updated_views.append(new_view)
        elif new_view.is_default and v.is_default:
            updated_views.append(v.model_copy(update={"is_default": False}))
        else:
            updated_views.append(v)

    prefs = current.preferences
    if any(v.is_default for v in updated_views):
        prefs = prefs.model_copy(
            update={"default_view_id": next(v.id for v in updated_views if v.is_default)}
        )
    new_state = current.model_copy(update={"views": updated_views, "preferences": prefs})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def delete_custom_view(
    session: Session,
    view_id: str,
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Delete a custom view by ID, ensuring at least one default view remains."""
    current = get_or_create_workspace(session, workspace_id)
    filtered_views = [v for v in current.views if v.id != view_id]
    if len(filtered_views) == len(current.views):
        raise KeyError(f"view with id '{view_id}' not found")

    # If the deleted view was default and there are remaining views, make the first one default
    has_default = any(v.is_default for v in filtered_views)
    if not has_default and filtered_views:
        filtered_views[0] = filtered_views[0].model_copy(update={"is_default": True})

    default_id = next((v.id for v in filtered_views if v.is_default), "overview")
    prefs = current.preferences.model_copy(update={"default_view_id": default_id})
    new_state = current.model_copy(update={"views": filtered_views, "preferences": prefs})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def reorder_custom_views(
    session: Session,
    ordered_view_ids: list[str],
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Reorder existing custom views to match the supplied ID ordering."""
    current = get_or_create_workspace(session, workspace_id)
    if len(set(ordered_view_ids)) != len(ordered_view_ids) or set(ordered_view_ids) != {
        v.id for v in current.views
    }:
        raise ValueError("reorder must contain every view ID exactly once")
    view_map = {v.id: v for v in current.views}

    reordered: list[CustomViewDefinition] = []
    for vid in ordered_view_ids:
        if vid in view_map:
            reordered.append(view_map.pop(vid))

    # Append any views that weren't mentioned in ordered_view_ids
    for remaining in current.views:
        if remaining.id in view_map:
            reordered.append(remaining)

    new_state = current.model_copy(update={"views": reordered})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def add_favorite_player(
    session: Session,
    player_id: str,
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Add a player ID to favorites."""
    current = get_or_create_workspace(session, workspace_id)
    if player_id in current.favorites:
        if expected_version is not None and current.version != expected_version:
            raise VersionConflictError(current.version, expected_version)
        return current

    updated_favorites = [*list(current.favorites), player_id]
    new_state = current.model_copy(update={"favorites": updated_favorites})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def remove_favorite_player(
    session: Session,
    player_id: str,
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Remove a player ID from favorites."""
    current = get_or_create_workspace(session, workspace_id)
    if player_id not in current.favorites:
        if expected_version is not None and current.version != expected_version:
            raise VersionConflictError(current.version, expected_version)
        return current

    updated_favorites = [p for p in current.favorites if p != player_id]
    new_state = current.model_copy(update={"favorites": updated_favorites})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def update_favorites(
    session: Session,
    favorites: list[str],
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Replace the full favorites player list."""
    current = get_or_create_workspace(session, workspace_id)
    # Deduplicate while preserving order
    seen: set[str] = set()
    deduped: list[str] = []
    for pid in favorites:
        if pid not in seen:
            seen.add(pid)
            deduped.append(pid)

    new_state = current.model_copy(update={"favorites": deduped})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def add_to_compare_tray(
    session: Session,
    player_id: str,
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Add a player ID to the comparison tray, enforcing maximum 8 players."""
    current = get_or_create_workspace(session, workspace_id)
    if player_id in current.compare_tray:
        if expected_version is not None and current.version != expected_version:
            raise VersionConflictError(current.version, expected_version)
        return current

    if len(current.compare_tray) >= MAX_COMPARE_PLAYERS:
        raise ValueError(
            f"maximum {MAX_COMPARE_PLAYERS} players allowed in comparison tray (B07 contract bound)"
        )

    updated_tray = [*list(current.compare_tray), player_id]
    new_state = current.model_copy(update={"compare_tray": updated_tray})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def remove_from_compare_tray(
    session: Session,
    player_id: str,
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Remove a player ID from the comparison tray."""
    current = get_or_create_workspace(session, workspace_id)
    if player_id not in current.compare_tray:
        if expected_version is not None and current.version != expected_version:
            raise VersionConflictError(current.version, expected_version)
        return current

    updated_tray = [p for p in current.compare_tray if p != player_id]
    new_state = current.model_copy(update={"compare_tray": updated_tray})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def update_compare_tray(
    session: Session,
    tray: list[str],
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Replace the comparison tray list with validation of the 8-player bound."""
    if len(tray) > MAX_COMPARE_PLAYERS:
        raise ValueError(
            f"maximum {MAX_COMPARE_PLAYERS} players allowed in comparison tray (found {len(tray)})"
        )
    current = get_or_create_workspace(session, workspace_id)
    seen: set[str] = set()
    deduped: list[str] = []
    for pid in tray:
        if pid not in seen:
            seen.add(pid)
            deduped.append(pid)

    new_state = current.model_copy(update={"compare_tray": deduped})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def clear_compare_tray(
    session: Session,
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Empty the comparison tray."""
    current = get_or_create_workspace(session, workspace_id)
    new_state = current.model_copy(update={"compare_tray": []})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def save_ranking_board(
    session: Session,
    board: RankingBoardDefinition,
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Create or update a personal ranking board."""
    current = get_or_create_workspace(session, workspace_id)
    updated_boards: list[RankingBoardDefinition] = []
    found = False

    for existing in current.ranking_boards:
        if existing.id == board.id:
            updated_boards.append(board.model_copy(update={"updated_at": utc_now_iso()}))
            found = True
        else:
            updated_boards.append(existing)

    if not found:
        updated_boards.append(board)

    new_state = current.model_copy(update={"ranking_boards": updated_boards})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def delete_ranking_board(
    session: Session,
    board_id: str,
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Delete a personal ranking board by ID."""
    current = get_or_create_workspace(session, workspace_id)
    filtered = [b for b in current.ranking_boards if b.id != board_id]
    if len(filtered) == len(current.ranking_boards):
        raise KeyError(f"ranking board with id '{board_id}' not found")

    new_state = current.model_copy(update={"ranking_boards": filtered})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def aggregate_ranking_boards_service(
    session: Session,
    board_ids: list[str],
    method: AggregationMethod = "borda",
    missing_rank_penalty: int | None = None,
    workspace_id: str = "default",
) -> BoardAggregationResult:
    """Aggregate selected personal ranking boards mathematically."""
    current = get_or_create_workspace(session, workspace_id)
    if len(set(board_ids)) != len(board_ids) or set(board_ids) - {
        b.id for b in current.ranking_boards
    }:
        raise ValueError("board IDs must be unique and reference existing boards")
    selected_boards = [b for b in current.ranking_boards if b.id in board_ids]
    return compute_board_aggregation(
        selected_boards, method=method, missing_rank_penalty=missing_rank_penalty
    )


def save_tier_list(
    session: Session,
    tier_list: TierListDefinition,
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Create or update a personal tier list."""
    current = get_or_create_workspace(session, workspace_id)
    updated_lists: list[TierListDefinition] = []
    found = False

    for existing in current.tier_lists:
        if existing.id == tier_list.id:
            updated_lists.append(tier_list.model_copy(update={"updated_at": utc_now_iso()}))
            found = True
        else:
            updated_lists.append(existing)

    if not found:
        updated_lists.append(tier_list)

    new_state = current.model_copy(update={"tier_lists": updated_lists})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def delete_tier_list(
    session: Session,
    tier_list_id: str,
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Delete a personal tier list by ID."""
    current = get_or_create_workspace(session, workspace_id)
    filtered = [t for t in current.tier_lists if t.id != tier_list_id]
    if len(filtered) == len(current.tier_lists):
        raise KeyError(f"tier list with id '{tier_list_id}' not found")

    new_state = current.model_copy(update={"tier_lists": filtered})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def update_preferences_service(
    session: Session,
    prefs_update: dict[str, Any],
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Update workspace presentation and layout preferences."""
    current = get_or_create_workspace(session, workspace_id)
    merged_data = current.preferences.model_dump()
    merged_data.update(prefs_update)
    merged_data["updated_at"] = utc_now_iso()

    new_prefs = WorkspacePreferences(**merged_data)
    views = [
        v.model_copy(update={"is_default": v.id == new_prefs.default_view_id})
        for v in current.views
    ]
    new_state = current.model_copy(update={"preferences": new_prefs, "views": views})
    return update_workspace_state(session, new_state, expected_version=expected_version)


def export_workspace_bundle(session: Session, workspace_id: str = "default") -> WorkspaceBundle:
    """Export complete personal workspace bundle with integrity checksum."""
    current = get_or_create_workspace(session, workspace_id)
    bundle_dict = {
        "bundle_version": "1.0",
        "exported_at": utc_now_iso(),
        "workspace_id": current.workspace_id,
        "name": current.name,
        "version": current.version,
        "views": [v.model_dump(mode="json") for v in current.views],
        "favorites": list(current.favorites),
        "compare_tray": list(current.compare_tray),
        "ranking_boards": [b.model_dump(mode="json") for b in current.ranking_boards],
        "tier_lists": [t.model_dump(mode="json") for t in current.tier_lists],
        "preferences": current.preferences.model_dump(mode="json"),
    }
    checksum = calculate_bundle_checksum(bundle_dict)
    bundle_dict["checksum_sha256"] = checksum
    return WorkspaceBundle(**bundle_dict)


def import_workspace_bundle(
    session: Session,
    bundle: WorkspaceBundle,
    mode: ImportConflictMode = "replace",
    expected_version: int | None = None,
    workspace_id: str = "default",
) -> PersonalWorkspaceState:
    """Import workspace bundle into personal state, supporting replace or merge mode.

    Validates:
    - Column metrics must exist in get_allowed_query_fields()
    - View count <= MAX_CUSTOM_VIEWS (10)
    - Compare tray count <= MAX_COMPARE_PLAYERS (8)
    """
    if not bundle.checksum_sha256 or bundle.checksum_sha256 != calculate_bundle_checksum(
        bundle.model_dump(mode="json")
    ):
        raise ValueError("workspace bundle checksum mismatch or missing checksum")
    PersonalWorkspaceState.model_validate(
        {
            key: value
            for key, value in bundle.model_dump(mode="json").items()
            if key not in {"bundle_version", "exported_at", "checksum_sha256"}
        }
    )

    current = get_or_create_workspace(session, workspace_id)

    if mode == "replace":
        if sum(v.id not in BUILTIN_VIEW_IDS for v in bundle.views) > MAX_CUSTOM_VIEWS:
            raise ValueError(
                f"bundle contains {len(bundle.views)} views, exceeding maximum {MAX_CUSTOM_VIEWS}"
            )
        new_state = PersonalWorkspaceState(
            workspace_id=workspace_id,
            name=bundle.name,
            version=current.version,
            views=list(bundle.views),
            favorites=list(bundle.favorites),
            compare_tray=list(bundle.compare_tray),
            ranking_boards=list(bundle.ranking_boards),
            tier_lists=list(bundle.tier_lists),
            preferences=bundle.preferences,
            created_at=current.created_at,
            updated_at=utc_now_iso(),
        )
        return update_workspace_state(session, new_state, expected_version=expected_version)

    # Merge mode: combine views, favorites, compare tray, boards, tier lists
    existing_view_ids = {v.id for v in current.views}
    merged_views = list(current.views)
    for v in bundle.views:
        if v.id not in existing_view_ids:
            merged_views.append(v)
            existing_view_ids.add(v.id)

    # Merge favorites (deduped union)
    merged_favs = list(current.favorites)
    fav_set = set(merged_favs)
    for f in bundle.favorites:
        if f not in fav_set:
            merged_favs.append(f)
            fav_set.add(f)

    # Merge compare tray (up to 8)
    merged_tray = list(current.compare_tray)
    tray_set = set(merged_tray)
    for t in bundle.compare_tray:
        if t not in tray_set:
            merged_tray.append(t)
            tray_set.add(t)

    # Merge ranking boards (update existing by ID, append new)
    board_map = {b.id: b for b in current.ranking_boards}
    for b in bundle.ranking_boards:
        board_map[b.id] = b
    merged_boards = list(board_map.values())

    # Merge tier lists (update existing by ID, append new)
    tier_map: dict[str, TierListDefinition] = {tl.id: tl for tl in current.tier_lists}
    for tl in bundle.tier_lists:
        tier_map[tl.id] = tl
    merged_tier_lists = list(tier_map.values())

    new_state = PersonalWorkspaceState(
        workspace_id=workspace_id,
        name=current.name,
        version=current.version,
        views=[
            v.model_copy(update={"is_default": v.id == bundle.preferences.default_view_id})
            for v in merged_views
        ],
        favorites=merged_favs,
        compare_tray=merged_tray,
        ranking_boards=merged_boards,
        tier_lists=merged_tier_lists,
        preferences=bundle.preferences,
        created_at=current.created_at,
        updated_at=utc_now_iso(),
    )
    return update_workspace_state(session, new_state, expected_version=expected_version)
