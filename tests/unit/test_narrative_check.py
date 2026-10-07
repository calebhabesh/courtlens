"""AR04 numeric checker: display tolerance, derived arithmetic and rejection."""

from typing import Any

import pytest

from courtlens.domain.conversation import EvidenceCell, OperationResult
from courtlens.domain.narrative_check import NarrativeRejected, check_narrative

HASH = "b" * 64
SCOPE: dict[str, Any] = {
    "as_of": "2026-10-06",
    "calendar_version": "nba-completed-seasons-2019-2026-v1",
    "selections": {"season": "2025-26", "before_date": "2026-04-13"},
    "label": "2025-26 · regular season",
}


def cell(entity: str, metric: str, unit: str, value: Any, row: int) -> EvidenceCell:
    return EvidenceCell(
        evidence_id=f"{entity}-{metric}",
        result_hash=HASH,
        operation_hash=HASH,
        operation_version="fixture",
        context_fingerprint=HASH,
        entity_id=entity,
        row_identity=f"/items/{row}",
        path=f"/items/{row}/metrics/{metric}",
        metric=metric,
        metric_version="fixture",
        unit=unit,
        value=value,
        input_identity={},
    )


def result(**data: Any) -> OperationResult:
    rows = [
        {"player_id": "1", "player_name": "Nikola Jokić", "team": "Philadelphia 76ers"},
        {"player_id": "2", "player_name": "Trae Young"},
        {"player_id": "3", "player_name": "Cade Cunningham"},
    ]
    return OperationResult(
        step_id="s1",
        operation="query",
        operation_version="fixture",
        arguments={},
        operation_hash=HASH,
        result_hash=HASH,
        data={"items": rows, **data},
        rows=rows,
        evidence=[
            cell("1", "ast_per_game", "assists", 10.74, 0),
            cell("2", "ast_per_game", "assists", 10.15, 1),
            cell("3", "ast_per_game", "assists", 9.1, 2),
            cell("1", "games_played", "observations", 65, 0),
            cell("1", "fg_pct", "percentage", 0.583, 0),
            cell("2", "total_points", "points", 1843, 1),
            cell("3", "missing", "assists", None, 2),
        ],
    )


def check(text: str, **data: Any) -> list[float]:
    return check_narrative(text, [result(**data)], SCOPE)


@pytest.mark.parametrize(
    "text",
    [
        "Nikola Jokić averaged 10.74 assists per game.",
        "Nikola Jokić averaged 10.7 assists per game.",  # display rounding
        "Nikola Jokić averaged 11 assists per game.",
        "Trae Young averaged 10.2 assists.",  # 10.15 rounds half-up
        "Trae Young averaged 10 assists.",
        "Jokić shot 58.3% from the field.",  # fraction displayed as a percentage
        "Jokić shot 58.3 percent.",
        "Young scored 1,843 points.",
    ],
)
def test_display_rounding_tolerance_accepts(text):
    assert check(text)


@pytest.mark.parametrize(
    "text",
    [
        "Nikola Jokić averaged 10.8 assists per game.",
        "Nikola Jokić averaged 13 assists per game.",
        "Trae Young averaged 10.1 assists.",  # 10.15 never displays as 10.1
        "Jokić shot 59% from the field.",  # not 100 x the 0.59 assist difference
        "Young scored 1,844 points.",
        "Jokić averaged 12.3 assists.",
    ],
)
def test_numbers_outside_display_rounding_reject(text):
    with pytest.raises(NarrativeRejected) as error:
        check(text)
    assert error.value.reason == "unmatched_number"


@pytest.mark.parametrize(
    "text",
    [
        "Jokić averaged 0.59 more assists than Young.",  # difference
        "Jokić averaged 0.6 more assists than Young.",
        "Jokić and Young combined for 20.89 assists per game.",  # sum
        "Jokić and Young combined for 20.9 assists per game.",
        "Jokić's rate was 1.06 times Young's.",  # ratio
        "Jokić's rate was 106% of Young's.",
        "Jokić averaged 1.64 more than Cunningham.",
    ],
)
def test_derived_arithmetic_of_comparable_cells_is_recomputed(text):
    assert check(text)


def test_derived_arithmetic_requires_same_metric_and_unit():
    # 65 games - 10.74 assists is not a meaningful derived quantity.
    with pytest.raises(NarrativeRejected):
        check("Jokić finished 54.26 short.")
    with pytest.raises(NarrativeRejected):
        check("Jokić and Young combined for 20.8 assists per game.")


def test_null_cells_are_unknown_not_zero():
    with pytest.raises(NarrativeRejected):
        check("Cunningham recorded 0 missing assists.")


@pytest.mark.parametrize(
    "text",
    [
        "Jokić led the 2025-26 regular season.",
        "Jokić led 2025\u201326 play.",  # en dash
        "Jokić ranked 1st, Young 2nd and Cunningham No. 3.",
        "Jokić was first and Young second.",
        "Through 2026-04-13, Jokić led the top 3.",
        "In 2026 Jokić led.",
        "Jokić led the Philadelphia 76ers in assists.",  # digit-bearing result label
        "Jokić is one of the top passers.",
    ],
)
def test_scope_labels_ranks_and_result_labels_are_allowed(text):
    check(text)


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ("Jokić also led the 2024-25 season.", "season_outside_scope"),
        ("Jokić won the award in 2019.", "year_outside_scope"),
        ("On 2025-01-01 Jokić had a big game.", "date_outside_scope"),
        ("Jokić had a triple-double.", "unverifiable_claim"),
        ("Jokić ranked 4th.", "rank_outside_rows"),
        ("Jokić was fifth.", "rank_outside_rows"),
        ("Jokić had twelve assists in a game.", "unmatched_number"),
        ("Jokić averaged twice as many assists.", "unverifiable_claim"),
        ("Jokić will outscore Young next week.", "unverifiable_claim"),
        ("Jokić led because of his vision.", "unverifiable_claim"),
        ("There is a 70% probability Jokić leads.", "unverifiable_claim"),
        ("**Jokić** led.", "markup"),
        ("Jokić led. Young was next. Cunningham was third. That is all.", "too_many_sentences"),
        ("", "length"),
    ],
)
def test_rejections_name_their_reason(text, reason):
    with pytest.raises(NarrativeRejected) as error:
        check(text)
    assert error.value.reason == reason


def test_calendar_version_strings_do_not_widen_scope():
    # "nba-completed-seasons-2019-2026-v1" contains a season-like token; it is not scope.
    with pytest.raises(NarrativeRejected):
        check("Jokić led every season from 2019-20 onward.")


def test_result_data_dates_are_allowed():
    assert check(
        "The forecast targets 2026-04-15 at 10.7 assists.", target_game_date="2026-04-15"
    ) == [10.7]


def test_no_results_rejects():
    with pytest.raises(NarrativeRejected) as error:
        check_narrative("Jokić led.", [], SCOPE)
    assert error.value.reason == "no_results"
