"""Workspace documents validate portable presentation state separately from evidence."""

import pytest
from pydantic import ValidationError

from courtlens.domain.personal_state import (
    CustomViewDefinition,
    PersonalWorkspaceState,
    RankingBoardDefinition,
    RankingEntry,
    TierGroup,
    TierListDefinition,
    WorkspacePreferences,
    compute_board_aggregation,
)


def test_custom_limits_and_unavailable_columns() -> None:
    views = [CustomViewDefinition(id=f"v{i}", name="View", columns=["pts"]) for i in range(10)]
    assert len(PersonalWorkspaceState(views=views).views) == 10
    with pytest.raises(ValidationError):
        PersonalWorkspaceState(views=[*views, CustomViewDefinition(name="Eleventh")])
    with pytest.raises(ValidationError):
        CustomViewDefinition(name="Unknown", columns=["invented_impact"])
    view = CustomViewDefinition(
        name="Retained", columns=["future_impact"], unavailable_columns=["future_impact"]
    )
    assert view.unavailable_columns == ["future_impact"]
    with pytest.raises(ValidationError):
        CustomViewDefinition(name="Duplicate", columns=["pts", "pts"])
    with pytest.raises(ValidationError):
        CustomViewDefinition(name="Version", metric_version="v99")


def test_workspace_defaults_and_duplicate_references() -> None:
    with pytest.raises(ValidationError):
        PersonalWorkspaceState(favorites=["1", "1"])
    with pytest.raises(ValidationError):
        PersonalWorkspaceState(compare_tray=[str(i) for i in range(9)])
    with pytest.raises(ValidationError):
        PersonalWorkspaceState(preferences=WorkspacePreferences(default_view_id="missing"))
    with pytest.raises(ValidationError):
        PersonalWorkspaceState(
            views=[CustomViewDefinition(id="custom", name="Default", is_default=True)]
        )
    with pytest.raises(ValidationError):
        PersonalWorkspaceState(workspace_id="../bad")
    with pytest.raises(ValidationError):
        PersonalWorkspaceState(analysis_result={"pts": 99})


def test_board_and_tier_memberships() -> None:
    with pytest.raises(ValidationError):
        RankingBoardDefinition(title="Invalid", entries=[RankingEntry(rank=2, player_id="1")])
    with pytest.raises(ValidationError):
        RankingBoardDefinition(
            title="Invalid",
            entries=[RankingEntry(rank=1, player_id="1"), RankingEntry(rank=2, player_id="1")],
        )
    with pytest.raises(ValidationError):
        TierListDefinition(
            title="Duplicate",
            tiers=[
                TierGroup(tier_id="a", label="A", player_ids=["1"]),
                TierGroup(tier_id="b", label="B", player_ids=["1"]),
            ],
        )


def test_personal_aggregate_declares_population_and_missing_penalty() -> None:
    boards = [
        RankingBoardDefinition(
            id="a",
            title="A",
            entries=[RankingEntry(rank=1, player_id="1"), RankingEntry(rank=2, player_id="2")],
        ),
        RankingBoardDefinition(id="b", title="B", entries=[RankingEntry(rank=1, player_id="2")]),
    ]
    result = compute_board_aggregation(boards, method="average_rank")
    assert result.missing_rank_penalty == 3
    assert result.ranked_players[0].player_id == "2"
    assert result.ranked_players[1].average_rank == 2
    assert result.ranked_players[1].boards_present_count == 1
    assert "no external consensus" in result.methodology_notes


def test_stats_presentation_positions_are_canonical_and_bounded() -> None:
    from pydantic import ValidationError

    from courtlens.domain.stats_presentation import StatsPresentation

    assert StatsPresentation(positions=["C", "PG", "PG", "SF"]).positions == ["PG", "SF", "C"]
    assert StatsPresentation().positions is None
    with pytest.raises(ValidationError):
        StatsPresentation.model_validate({"positions": ["G"]})
    assert StatsPresentation(draft_year=2018).draft_year == 2018
    with pytest.raises(ValidationError):
        StatsPresentation.model_validate({"draft_year": 1900})
