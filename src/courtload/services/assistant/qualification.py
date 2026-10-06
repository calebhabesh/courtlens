"""Official APG eligibility policy; never certifies incomplete local league coverage."""

from dataclasses import dataclass
from decimal import ROUND_CEILING, Decimal

from courtload.services.workbench_analytics import canonical_hash

POLICY_VERSION = "nba-apg-qualification-2026-10-05-v1"
POLICY_URL = "https://www.nba.com/stats/help/statminimums"
POLICY = {
    "version": POLICY_VERSION,
    "metric": "ast_per_game",
    "minimum_fraction": "0.70",
    "rounding": "ceiling",
    "season_end_exception": (
        "same assists total divided by required games must exceed the qualified leader"
    ),
    "verified_on": "2026-10-05",
    "source": POLICY_URL,
    "team_games": "verified actual team season length, never assumed 82",
    "cohort": (
        "complete league evidence required; dated explicit PG or PG/SG labels only for PG subset"
    ),
}
POLICY_SHA256 = canonical_hash(POLICY)


@dataclass(frozen=True)
class APGQualification:
    required_games: int
    eligible: bool
    exception_used: bool
    ranking_average: Decimal


def qualify_apg(
    *,
    appearances: int,
    assists: int,
    team_games: int,
    season_complete: bool,
    qualified_leader_average: Decimal | None = None,
) -> APGQualification:
    if team_games < 1 or assists < 0 or not 0 <= appearances <= team_games:
        raise ValueError("qualification requires valid verified team exposure")
    required = int(
        (Decimal(team_games) * Decimal("0.70")).to_integral_value(rounding=ROUND_CEILING)
    )
    eligible = appearances >= required
    average = Decimal(assists) / Decimal(appearances) if appearances else Decimal(0)
    adjusted = Decimal(assists) / Decimal(required)
    exception = bool(
        not eligible
        and season_complete
        and qualified_leader_average is not None
        and adjusted > qualified_leader_average
    )
    return APGQualification(
        required, eligible or exception, exception, adjusted if exception else average
    )


def pg_label_supported(label: str | None) -> bool:
    """Call only with dated release-bound labels; broad G and unknown stay unresolved."""
    return label in {"PG", "PG/SG", "SG/PG"}
