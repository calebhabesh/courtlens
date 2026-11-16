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
    # A 10-day contract is one season by the CBA; a rest-of-season one may carry later years.
    assert spans(ref) == [
        ("2019-20", "2019-20", "next_contract", "signing"),
        ("2020-21", "2020-21", "stated_length", "signing"),
        ("2020-21", "2022-23", "last_reported_season", "signing"),
    ]


def durant() -> dict[str, Any]:
    """Kevin Durant's Basketball-Reference profile as retained (2026), lengths mostly missing."""
    teams = {2016: "GSW", 2017: "GSW", 2018: "GSW", 2019: "BRK", 2020: "BRK", 2021: "BRK"}
    teams |= {2022: "PHO", 2023: "PHO", 2024: "PHO", 2025: "HOU"}
    return {
        "salary_history": [
            {"season": f"{y}-{str(y + 1)[2:]}", "team_code": t} for y, t in teams.items()
        ],
        "current_contract": [
            {"season": "2026-27", "team_code": "HOU"},
            {"season": "2027-28", "team_code": "HOU", "option": "player"},
        ],
        "contract_events": [
            {"date": "2025-10-19", "type": "extended", "description": "Signed extension."},
            {
                "date": "2021-08-08",
                "type": "extended",
                "description": "Signed 4-yr/$194M contract extension Sunday, August 8, 2021.",
            },
        ],
        "transactions": [
            {
                "date": "2016-07-07",
                "type": "signed",
                "description": "Signed a multi-year contract with the Golden State Warriors .",
                "to_team_code": "GSW",
            },
            {
                "date": "2018-07-07",
                "type": "signed",
                "description": "Signed as a free agent with the Golden State Warriors .",
                "to_team_code": "GSW",
            },
            {
                "date": "2019-07-07",
                "type": "signed",
                "description": "Signed as a free agent with the Golden State Warriors .",
                "to_team_code": "GSW",
            },
        ],
    }


def statement(day: str, years: int, value: str, teams: list[str], **extra: Any) -> dict[str, Any]:
    return {
        "date": day,
        "month": int(day[5:7]),
        "day": int(day[8:10]),
        "year_basis": "sentence",
        "years": years,
        "value": value,
        "teams": teams,
        "teams_basis": "sentence",
        "kind": "signing",
        "term": "standard",
        "text": "...",
    } | extra


DURANT_WIKI = {
    "article_url": "https://en.wikipedia.org/wiki/Kevin_Durant",
    "statements": [
        statement("2016-07-07", 2, "$54.3M", ["GSW"], year_basis="narrative"),
        statement("2017-07-25", 2, "$51.25M", ["GSW"], year_basis="narrative"),
        statement("2018-07-07", 2, "$61.5M", ["GSW"]),
        statement("2019-07-07", 4, "$164.3M", ["BRK"], year_basis="narrative"),
        statement("2021-08-08", 4, "$198M", ["BRK", "NJN"], kind="extension"),
        statement("2025-10-19", 2, "$90M", ["HOU"], kind="extension", teams_basis="heading"),
    ],
}


def test_without_wikipedia_durants_contracts_after_2018_cannot_be_bracketed():
    ref = durant()
    assert spans(ref) == [
        ("2016-17", "2017-18", "next_contract", "signing"),
        ("2018-19", "2018-19", "next_contract", "signing"),
    ]
    assert [u["season"] for u in unplaced_signings(ref, contract_spans(ref))] == [
        "2019-20",
        "2021-22",
        "2025-26",
    ]


def test_wikipedia_lengths_place_every_contract_and_the_extensions_count_back():
    ref = durant()
    placed = contract_spans(ref, DURANT_WIKI)
    assert [(s["start_season"], s["end_season"], s["end_basis"]) for s in placed] == [
        ("2016-17", "2016-17", "next_contract"),
        # The 2017 re-signing Basketball-Reference does not list, added from the article.
        ("2017-18", "2017-18", "next_contract"),
        ("2018-19", "2018-19", "next_contract"),
        # The 2021 extension replaced the 2022-23 option year: counted back from 2027-28.
        ("2019-20", "2021-22", "next_contract"),
        ("2022-23", "2025-26", "stated_length"),
        ("2026-27", "2027-28", "stated_length"),
    ]
    assert [s["source"] for s in placed] == ["basketball_reference", "wikipedia"] + [
        "basketball_reference"
    ] * 4
    assert placed[1]["description"] == "Signed 2-yr/$51.25M contract"
    assert placed[1]["team_code"] == "GSW"
    # Basketball-Reference's stated 4-yr stays its own; the free-agent deal takes the article's.
    assert placed[4]["length_source"] == "stated" and placed[4]["terms"] is None
    assert placed[3]["length_source"] == "wikipedia" and placed[3]["terms"] == "4-yr/$164.3M"
    assert placed[3]["source_url"] == DURANT_WIKI["article_url"]
    assert [s["start_basis"] for s in placed[-2:]] == ["current_contract", "current_contract"]
    assert placed[-1]["current"] is True
    assert unplaced_signings(ref, placed, DURANT_WIKI) == []


def test_a_statement_naming_another_team_or_too_far_from_the_signing_is_not_matched():
    ref = durant()
    wiki = {
        "article_url": "u",
        "statements": [
            statement("2019-07-07", 4, "$164.3M", ["NYK"]),  # a team that never paid him
            statement("2018-09-20", 2, "$61.5M", ["GSW"]),  # 75 days from the signing
        ],
    }
    placed = contract_spans(ref, wiki)
    assert all(s["length_source"] != "wikipedia" for s in placed)
    # Neither is added either: one names no paying team, and the source already lists a 2018-19
    # signing with the Warriors.
    assert all(s["source"] == "basketball_reference" for s in placed)


def test_an_added_signing_needs_a_paying_team_and_a_day_and_never_duplicates_one():
    ref = durant()
    wiki = {
        "article_url": "u",
        "statements": [
            # Abroad, or a team that did not pay him that season: not added.
            statement("2017-07-25", 2, "$51.25M", ["PHO"]),
            # A heading-range date is for matching only.
            statement("2017-07-25", 2, "$51.25M", ["GSW"], year_basis="range", date=None),
            # Twelve days after the listed 2016 signing: that signing, not a second one.
            statement("2016-07-19", 2, "$54.3M", ["GSW"]),
        ],
    }
    found = contract_spans(ref, wiki)
    assert [s["source"] for s in found] == ["basketball_reference"] * len(found)


def test_an_undated_season_statement_fills_only_a_signing_in_that_season():
    ref = reference(
        seasons(2010, 2015),
        [],
        [("2010-07-09", "extended", "Signed a contract extension.")],
    )
    ref["salary_history"] = [{"season": s, "team_code": "OKC"} for s in seasons(2010, 2015)]
    ref["contract_events"][0]["to_team_code"] = "OKC"
    wiki = {
        "article_url": "u",
        "statements": [
            {
                "date": None,
                "season": 2010,
                "year_basis": "season",
                "years": 5,
                "value": "$86M",
                "teams": ["OKC"],
                "teams_basis": "sentence",
                "kind": "extension",
                "term": "standard",
            }
        ],
    }
    (only,) = unplaced_signings(ref, contract_spans(ref, wiki), wiki)
    # Its length is now known; where it starts still is not (no contract before it is listed).
    assert (only["years"], only["length_source"], only["terms"]) == (5, "wikipedia", "5-yr/$86M")


def test_counting_back_needs_counting_forward_to_overrun_the_current_contract():
    ref = reference(
        seasons(2017, 2025),
        ["2026-27", "2027-28"],
        [
            ("2017-07-01", "signed", "Signed 5-yr contract."),
            ("2021-08-06", "extended", "Signed a contract extension."),
            ("2024-08-30", "extended", "Signed 1-yr extension."),
        ],
    )
    # Forward is only blocked (the 2021 extension has no length), never contradicted: the 2024
    # extension stays a note rather than being assumed to be the current contract.
    assert spans(ref) == [("2017-18", "2021-22", "stated_length", "signing")]
    assert [u["season"] for u in unplaced_signings(ref, contract_spans(ref))] == [
        "2021-22",
        "2024-25",
    ]


def test_counting_back_that_would_start_before_the_newest_signing_is_not_used():
    # A one-year extension counted back from 2027-28 would begin in 2027-28; the 2026 signing
    # starts 2026-27, so that fits. A three-year one would begin in 2025-26, before the signing:
    # the lengths contradict each other, so the forward reading stands (clipped at the end).
    ref = reference(
        seasons(2020, 2025),
        ["2026-27", "2027-28"],
        [
            ("2026-07-06", "signed", "Signed 1-yr contract."),
            ("2026-12-15", "extended", "Signed 3-yr extension."),
        ],
    )
    assert spans(ref) == [
        ("2026-27", "2026-27", "stated_length", "signing"),
        ("2027-28", "2027-28", "stated_length", "extension"),
    ]


def test_a_first_round_picks_first_signing_in_his_draft_season_is_a_rookie_scale_deal():
    ref = reference(
        seasons(2017, 2025),
        ["2026-27"],
        [
            ("2017-07-06", "signed", "Signed a multi-year contract with the Sacramento Kings ."),
            ("2020-11-25", "extended", "Signed 5-yr $163M max extension"),
        ],
    )
    # Without the draft the multi-year signing has no length, so the extension cannot follow it
    # and neither has a known end.
    assert spans(ref) == []
    assert [u["season"] for u in unplaced_signings(ref, contract_spans(ref))] == [
        "2017-18",
        "2020-21",
    ]
    draft = {"year": 2017, "round": 1}
    assert [
        (s["start_season"], s["end_season"], s["length_source"])
        for s in contract_spans(ref, None, draft)
    ] == [("2017-18", "2020-21", "rookie_scale"), ("2021-22", "2025-26", "stated")]
    # A second-round pick, or a signing after his draft season, gets no rookie scale length.
    assert contract_spans(ref, None, {"year": 2017, "round": 2}) == []
    assert contract_spans(ref, None, {"year": 2016, "round": 1}) == []


def test_an_article_stating_only_a_rookie_deals_guaranteed_years_yields_to_the_cba():
    ref = reference(seasons(2010, 2016), [], [("2013-09-25", "extended", "Signed 5-yr extension.")])
    ref["salary_history"] = [{"season": s, "team_code": "IND"} for s in seasons(2010, 2016)]
    wiki = {"article_url": "u", "statements": [statement("2010-07-01", 2, "$3.9M", ["IND"])]}
    found = contract_spans(ref, wiki, {"year": 2010, "round": 1})
    assert [(s["start_season"], s["end_season"], s["description"]) for s in found] == [
        ("2010-11", "2013-14", "Signed rookie scale contract"),
        ("2014-15", "2016-17", "Signed 5-yr extension"),
    ]


def test_a_stated_length_above_the_maximum_salary_yields_to_the_article():
    ref = reference(seasons(2018, 2025), [], [])
    ref["salary_history"] = [
        {"season": s, "team_code": "MEM", "salary": "28000000", "share_of_cap": 0.25}
        for s in seasons(2018, 2025)
    ]
    ref["contract_events"] = [
        {
            "date": "2021-10-18",
            "type": "extended",
            "description": "Signed 1-yr/$105M contract extension Monday, October 18, 2021.",
            "to_team_code": "MEM",
        }
    ]
    ref["transactions"] = [
        {
            "date": "2018-07-01",
            "type": "signed",
            "description": "Signed 4-yr contract.",
            "to_team_code": "MEM",
        }
    ]
    wiki = {
        "article_url": "u",
        "statements": [statement("2021-10-18", 4, "$105M", ["MEM"], kind="extension")],
    }
    # $105M in one year is above 35% of a $112M cap; four years is the article's and fits.
    (_, extension) = contract_spans(ref, wiki)
    assert (extension["start_season"], extension["end_season"]) == ("2022-23", "2025-26")
    assert (extension["length_source"], extension["terms"]) == ("wikipedia", "4-yr/$105M")
    assert extension["description"] == "Signed contract extension"
