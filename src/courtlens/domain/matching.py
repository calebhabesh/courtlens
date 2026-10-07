from __future__ import annotations

from dataclasses import dataclass

FLEX_MEMBERS: dict[str, frozenset[str]] = {
    "G": frozenset({"PG", "SG", "G"}),
    "F": frozenset({"SF", "PF", "F"}),
    "UTIL": frozenset({"PG", "SG", "SF", "PF", "C", "G", "F", "UTIL"}),
}
MAX_ACTIVE_SLOTS = 12


@dataclass(frozen=True)
class MatchPlayer:
    player_id: int
    name: str
    eligible_slots: tuple[str, ...]
    weight: float = 0.0


@dataclass(frozen=True)
class SlotInstance:
    name: str
    slot_type: str


@dataclass(frozen=True)
class Assignment:
    player_id: int
    player_name: str
    slot: str
    slot_type: str
    weight: float


@dataclass(frozen=True)
class MatchResult:
    assignments: tuple[Assignment, ...]
    unassigned_player_ids: tuple[int, ...]
    cardinality: int
    total_weight: float


def expand_slots(slot_counts: dict[str, int]) -> tuple[SlotInstance, ...]:
    slots: list[SlotInstance] = []
    for slot_type, count in sorted(slot_counts.items()):
        if count < 0:
            raise ValueError("slot counts cannot be negative")
        slots.extend(
            SlotInstance(name=f"{slot_type}-{index + 1}", slot_type=slot_type)
            for index in range(count)
        )
    if len(slots) > MAX_ACTIVE_SLOTS:
        raise ValueError(f"CourtLens v1 supports at most {MAX_ACTIVE_SLOTS} active daily slots")
    return tuple(slots)


def is_eligible(eligible_slots: tuple[str, ...], slot_type: str) -> bool:
    normalized = frozenset(slot.upper() for slot in eligible_slots)
    if slot_type.upper() == "UTIL":
        return bool(normalized)
    accepted = FLEX_MEMBERS.get(slot_type.upper(), frozenset({slot_type.upper()}))
    return bool(normalized & accepted)


def maximum_weight_matching(
    players: tuple[MatchPlayer, ...], slots: tuple[SlotInstance, ...]
) -> MatchResult:
    """Maximize started players, then recent-production weight, with stable tie-breaking.

    Fantasy rosters have few active slots, so a mask dynamic program is simpler and easier
    to audit than a general optimizer. Each state keeps the best assignment for a used-slot
    mask after processing each player.
    """

    ordered_players = tuple(
        sorted(players, key=lambda player: (player.name.casefold(), player.player_id))
    )
    # mask -> (weight, assignments), where assignment tuples are (player, slot index)
    states: dict[int, tuple[float, tuple[tuple[MatchPlayer, int], ...]]] = {0: (0.0, ())}
    for player in ordered_players:
        next_states = dict(states)
        for mask, (weight, partial_assignments) in states.items():
            for slot_index, slot in enumerate(slots):
                bit = 1 << slot_index
                if mask & bit or not is_eligible(player.eligible_slots, slot.slot_type):
                    continue
                candidate_mask = mask | bit
                candidate = (
                    weight + player.weight,
                    (*partial_assignments, (player, slot_index)),
                )
                incumbent = next_states.get(candidate_mask)
                if incumbent is None or _candidate_key(candidate) > _candidate_key(incumbent):
                    next_states[candidate_mask] = candidate
        states = next_states

    best_mask, (best_weight, best_pairs) = max(
        states.items(),
        key=lambda item: (
            item[0].bit_count(),
            round(item[1][0], 8),
            _stable_signature(item[1][1]),
        ),
    )
    assigned_ids = {player.player_id for player, _ in best_pairs}
    resolved_assignments = tuple(
        Assignment(
            player_id=player.player_id,
            player_name=player.name,
            slot=slots[slot_index].name,
            slot_type=slots[slot_index].slot_type,
            weight=round(player.weight, 2),
        )
        for player, slot_index in sorted(best_pairs, key=lambda pair: pair[1])
    )
    return MatchResult(
        assignments=resolved_assignments,
        unassigned_player_ids=tuple(
            player.player_id for player in ordered_players if player.player_id not in assigned_ids
        ),
        cardinality=best_mask.bit_count(),
        total_weight=round(best_weight, 2),
    )


def _candidate_key(
    candidate: tuple[float, tuple[tuple[MatchPlayer, int], ...]],
) -> tuple[float, tuple[tuple[int, int], ...]]:
    weight, assignments = candidate
    return round(weight, 8), _stable_signature(assignments)


def _stable_signature(
    assignments: tuple[tuple[MatchPlayer, int], ...],
) -> tuple[tuple[int, int], ...]:
    # Negated values make lower player/slot ids win when max() resolves a full tie.
    return tuple((-pair[0].player_id, -pair[1]) for pair in assignments)
