"""Contract spans are placed only where both ends are known (services/contract_spans.py)."""

from __future__ import annotations

from typing import Any

from courtlens.services.contract_spans import contract_spans, season_of, unplaced_signings


def reference(
    seasons: list[str], current: list[str], events: list[tuple[str, str, str]]
) -> dict[str, Any]:
    return {
        "salary_history": [{"season": s} for s in seasons],
        "current_contract": [{"season": s} for s in current],
        "contract_events": [
            {"date": day, "type": kind, "description": text, "to_team_code": None}
            for day, kind, text in events
        ],
        "transactions": [],
    }


def spans(ref: dict[str, Any]) -> list[tuple[str, str, str | None, str]]:
    return [
        (s["start_season"], s["end_season"], s["end_basis"], s["kind"]) for s in contract_spans(ref)
    ]


def seasons(first: int, last: int) -> list[str]:
    return [f"{y}-{str(y + 1)[2:]}" for y in range(first, last + 1)]


def test_season_runs_july_to_june():
    from datetime import date

    assert season_of(date(2022, 7, 8)) == 2022
    assert season_of(date(2023, 6, 30)) == 2022


def test_signings_lengths_and_an_extension_after_a_known_end():
    ref = reference(
        seasons(2015, 2025),
        ["2026-27", "2027-28"],
        [
            ("2015-07-12", "signed", "Signed a multi-year contract with the Denver Nuggets ."),
            (
                "2018-07-09",
                "signed",
                "Signed 5-yr maximum salary contract on Monday, July 9, 2018.",
            ),
            ("2022-07-08", "extended", "Signed extension Friday, July 8, 2022."),
        ],
    )
    assert spans(ref) == [
        ("2015-16", "2017-18", "next_contract", "signing"),
        ("2018-19", "2022-23", "stated_length", "signing"),
        ("2023-24", "2027-28", "current_contract", "extension"),
    ]
    assert contract_spans(ref)[1]["description"] == "Signed 5-yr maximum salary contract"
    assert [s["current"] for s in contract_spans(ref)] == [False, False, True]


def test_rookie_scale_is_four_seasons_and_carries_its_extensions():
    ref = reference(
        seasons(2018, 2025),
        seasons(2026, 2030),
        [
            ("2018-07-04", "signed", "Signed rookie scale contract on Wednesday, July 4, 2018."),
            ("2021-08-06", "extended", "Signed 5-yr/$173M extension Friday, August 6, 2021."),
            (
                "2025-07-07",
                "extended",
                "Signed a contract extension with the Oklahoma City Thunder .",
            ),
        ],
    )
    assert spans(ref) == [
        ("2018-19", "2021-22", "stated_length", "signing"),
        ("2022-23", "2026-27", "stated_length", "extension"),
        ("2027-28", "2030-31", "current_contract", "extension"),
    ]


def test_an_extension_that_cannot_be_placed_never_borrows_a_neighbour():
    # The 2024 extension has no stated length, so the 2026 one cannot be placed after it, and
    # the 2024 one's end is then unknown: neither gets a span.
    ref = reference(
        seasons(2017, 2025),
        ["2026-27", "2027-28"],
        [
            ("2017-07-01", "other", "Agreed to 5-yr/$201M deal on Saturday, July 1, 2017."),
            ("2021-08-06", "extended", "Signed 4-yr/$215M extension Friday, August 6, 2021."),
            (
                "2024-08-29",
                "extended",
                "Signed a contract extension with the Golden State Warriors .",
            ),
            (
                "2026-09-25",
                "extended",
                "Signed a contract extension with the Golden State Warriors .",
            ),
        ],
    )
    assert spans(ref) == [
        ("2017-18", "2021-22", "stated_length", "signing"),
        ("2022-23", "2025-26", "stated_length", "extension"),
    ]


def test_an_unplaced_extension_leaves_the_contract_before_it_without_an_end():
    ref = reference(
        seasons(2018, 2025),
        ["2026-27"],
        [
            ("2018-07-09", "signed", "Signed as a free agent with the Los Angeles Lakers ."),
            ("2022-08-18", "extended", "Signed a contract extension with the Los Angeles Lakers ."),
            ("2024-07-06", "signed", "Signed a multi-year contract with the Los Angeles Lakers ."),
        ],
    )
    assert spans(ref) == [("2024-25", "2026-27", "current_contract", "signing")]
    # The two it could not bracket stay visible as dated signings in their season.
    assert [(u["season"], u["kind"]) for u in unplaced_signings(ref, contract_spans(ref))] == [
        ("2018-19", "signing"),
        ("2022-23", "extension"),
    ]


def test_a_new_signing_cuts_a_stated_length_short_and_a_same_season_signing_shares_it():
    # Released after one season of a four-year deal; two signings in 2020-21 share that season.
    ref = reference(
        seasons(2019, 2022),
        [],
        [
            ("2019-07-10", "signed", "Signed 4-yr contract."),
            ("2021-02-01", "signed", "Signed 10-day contract."),
            ("2021-02-20", "signed", "Signed rest-of-season contract."),
        ],
    )
    assert spans(ref) == [
        ("2019-20", "2019-20", "next_contract", "signing"),
        ("2020-21", "2020-21", "next_contract", "signing"),
        ("2020-21", "2022-23", "last_reported_season", "signing"),
    ]
