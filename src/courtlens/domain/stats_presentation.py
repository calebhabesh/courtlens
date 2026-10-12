"""Opt-in Stats presentation contract, separate from retained analytical queries."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StatsPresentation(BaseModel):
    """Filter displayed entities without redefining the analytical cohort.

    None means all entities; an empty list deliberately means no entities.
    Favorites are supplied as canonical player IDs by the client.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    version: str = "pf01a-v1"
    player_ids: list[str] | None = Field(default=None, max_length=2000)
    table_percentiles: bool = False
    # NBA listed roster positions (current player index, not backdated); a hyphenated listing
    # such as G-F matches both. Resolved to player IDs before execution; None means all.
    positions: list[Literal["G", "F", "C"]] | None = Field(default=None, max_length=3)

    @field_validator("version")
    @classmethod
    def supported_version(cls, value: str) -> str:
        if value != "pf01a-v1":
            raise ValueError("unsupported Stats presentation version")
        return value

    @field_validator("player_ids")
    @classmethod
    def canonical_ids(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        if any(not item.strip() or len(item) > 128 for item in value):
            raise ValueError("player IDs must be nonempty and at most 128 characters")
        return sorted({item.strip() for item in value})

    @field_validator("positions")
    @classmethod
    def canonical_positions(
        cls, value: list[Literal["G", "F", "C"]] | None
    ) -> list[Literal["G", "F", "C"]] | None:
        return None if value is None else sorted(set(value), key="GFC".index)


class StatsCohort(BaseModel):
    """Declared analytical population; scope_hash identifies scope, not result content."""

    version: str
    scope_hash: str
    eligible_players: int
    formula: str
    good_directions: dict[str, Literal["high", "low"] | None]
