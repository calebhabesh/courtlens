import pytest

from courtlens.domain.matching import MatchPlayer, expand_slots, maximum_weight_matching


def test_matching_maximizes_cardinality_before_weight() -> None:
    players = (
        MatchPlayer(1, "High Weight Guard", ("PG",), 100),
        MatchPlayer(2, "Flexible Guard", ("PG", "SG"), 20),
        MatchPlayer(3, "Shooting Guard", ("SG",), 10),
    )
    result = maximum_weight_matching(players, expand_slots({"PG": 1, "SG": 1}))

    assert result.cardinality == 2
    assert {assignment.player_id for assignment in result.assignments} == {1, 2}
    assert result.unassigned_player_ids == (3,)


def test_matching_is_stable_for_equal_weights() -> None:
    players = (
        MatchPlayer(20, "Second", ("G",), 10),
        MatchPlayer(10, "First", ("G",), 10),
    )
    slots = expand_slots({"G": 1})

    first = maximum_weight_matching(players, slots)
    second = maximum_weight_matching(tuple(reversed(players)), slots)

    assert first == second
    assert first.assignments[0].player_id == 10


def test_heavy_day_surfaces_conflicts() -> None:
    players = tuple(
        MatchPlayer(index, f"Player {index}", ("UTIL",), index) for index in range(1, 6)
    )
    result = maximum_weight_matching(players, expand_slots({"UTIL": 3}))

    assert result.cardinality == 3
    assert len(result.unassigned_player_ids) == 2
    assert {assignment.player_id for assignment in result.assignments} == {3, 4, 5}


def test_slot_mask_capacity_is_bounded() -> None:
    with pytest.raises(ValueError, match="at most 12"):
        expand_slots({"UTIL": 13})
