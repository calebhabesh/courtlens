"""Contract statements read from Wikipedia player articles (ingestion and services)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from courtlens.ingestion.wikipedia_contracts import parse_article
from courtlens.services import wikipedia_contracts as service


def article(*sections: tuple[str, list[str]]) -> str:
    body = "".join(
        f'<div class="mw-heading"><h3>{heading}</h3><span class="mw-editsection">[edit]</span>'
        "</div>" + "".join(f"<p>{p}</p>" for p in paragraphs)
        for heading, paragraphs in sections
    )
    return (
        '<html><script>RLCONF={"wgPageName":"Example_Player","wgRevisionId":12345};</script>'
        f'<div class="mw-parser-output">{body}</div></html>'
    )


def statements(html: str) -> list[dict[str, Any]]:
    return list(parse_article(html)["statements"])


def test_a_dated_signing_with_terms_team_and_revision():
    parsed = parse_article(
        article(
            (
                "Brooklyn Nets (2019\u20132023)",
                [
                    "On August 8, 2021, Durant signed a four-year, $198 million extension with "
                    'the Nets.<sup class="reference">[12]</sup>'
                ],
            )
        )
    )
    assert (parsed["revision_id"], parsed["title"]) == (12345, "Example Player")
    (found,) = parsed["statements"]
    assert found["date"] == "2021-08-08" and found["year_basis"] == "sentence"
    assert (found["kind"], found["years"], found["value"]) == ("extension", 4, "$198M")
    assert "NJN" in found["teams"] and "BRK" in found["teams"]
    assert "[12]" not in found["text"]


def test_a_date_without_a_year_takes_the_narratives_year_then_a_one_season_heading():
    found = statements(
        article(
            (
                "First championship (2016\u20132017)",
                [
                    "On July 4, 2016, Durant announced he would join the Warriors. On July 7, he "
                    "signed with Golden State on a two-year, $54.3 million contract."
                ],
            ),
            (
                "Minnesota Timberwolves (2021\u20132022)",
                ["On February 16, Beverley signed a one-year, $13 million contract extension."],
            ),
            (
                "Houston Rockets (2013\u20132017)",
                ["On July 9, he re-signed with the Rockets on a four-year, $23 million deal."],
            ),
        )
    )
    assert [(s["date"], s["year_basis"]) for s in found] == [
        ("2016-07-07", "narrative"),
        # February of the 2021-22 season is 2022.
        ("2022-02-16", "heading"),
        # A heading spanning seasons is kept as a range, for matching only.
        (None, "range"),
    ]
    assert found[1]["teams"] == ["MIN"] and found[1]["teams_basis"] == "heading"
    assert found[2]["year_range"] == [2013, 2017]


def test_day_month_year_dates_values_with_a_hyphen_and_team_nicknames():
    (green, randolph, mann) = statements(
        article(
            (
                "Career",
                [
                    "On 23 October 2023, Green signed a three-year, $41 million extension with "
                    "the Mavericks.",
                    "In 2004, after his breakout season, he signed a 6-year, $84-million "
                    "extension with the Blazers.",
                    "On September 27, 2024, Mann agreed to a three-year, $47 million contract "
                    "extension with the Los Angeles Clippers.",
                ],
            )
        )
    )
    assert green["date"] == "2023-10-23"
    assert randolph["value"] == "$84M" and randolph["date"] is None
    # "Los Angeles Clippers" is the Clippers, not also the Lakers.
    assert "LAL" not in mann["teams"] and "LAC" in mann["teams"]


def test_hedges_endorsements_and_clubs_abroad_are_not_signings():
    found = statements(
        article(
            (
                "Career",
                [
                    "On July 1, 2019, he declined to sign a four-year, $100 million extension.",
                    "He was offered a two-year contract by the Knicks on July 2, 2019.",
                    "On July 3, 2019, he signed a ten-year endorsement deal with Nike.",
                    "On July 4, 2019, he signed a one-year contract with Fenerbahçe.",
                ],
            ),
            ("Mega Basket (2012\u20132015)", ["In February 2013, he signed a four-year contract."]),
        )
    )
    assert found == []


def test_cba_terms_and_an_undated_season_phrase():
    two_way, exhibit, season = statements(
        article(
            (
                "Career",
                [
                    "On July 26, 2019, Mason signed a two-way contract with the Milwaukee Bucks.",
                    "On September 27, 2023, he signed an Exhibit 10 contract with the Bulls.",
                    "Before the 2010\u201311 season, Durant announced that he had signed a "
                    "five-year contract extension with the Thunder worth about $86 million.",
                ],
            )
        )
    )
    assert (two_way["term"], two_way["years"]) == ("two_way", None)
    assert (exhibit["term"], exhibit["years"]) == ("exhibit_10", 1)
    assert (season["season"], season["year_basis"], season["years"]) == (2010, "season", 5)


def test_the_index_ties_an_id_to_one_article_and_drops_an_id_with_two():
    body = json.dumps(
        {
            "results": {
                "bindings": [
                    {
                        "bref": {"value": "d/duranke01"},
                        "article": {"value": "https://en.wikipedia.org/wiki/Kevin_Durant"},
                    },
                    {
                        "bref": {"value": "x/twins01"},
                        "article": {"value": "https://en.wikipedia.org/wiki/A"},
                    },
                    {
                        "bref": {"value": "x/twins01"},
                        "article": {"value": "https://en.wikipedia.org/wiki/B"},
                    },
                ]
            }
        }
    ).encode()
    assert service.parse_index(body) == {"duranke01": "https://en.wikipedia.org/wiki/Kevin_Durant"}


def test_only_the_index_query_and_english_articles_are_fetched():
    assert service.validate_url(service.INDEX_SOURCE, service.INDEX_URL, "all") == 5.0
    assert service.validate_url(
        service.ARTICLE_SOURCE, "https://en.wikipedia.org/wiki/Kevin_Durant", "all"
    )
    for url in (
        "https://en.wikipedia.org/w/api.php?action=parse",
        "https://de.wikipedia.org/wiki/Kevin_Durant",
    ):
        with pytest.raises(ValueError):
            service.validate_url(service.ARTICLE_SOURCE, url, "all")


def entry(bbref_id: str, raw: str = "0" * 64) -> dict[str, Any]:
    return {
        "bbref_id": bbref_id,
        "article_url": f"https://en.wikipedia.org/wiki/{bbref_id}",
        "title": bbref_id,
        "revision_id": 1,
        "observed_at": "2026-11-14T12:00:00+00:00",
        "acquisition_id": "a",
        "raw_sha256": raw,
        "parser": "old",
        "statements": [],
    }


def test_bundles_are_content_addressed_the_newest_is_served_and_three_kept(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    for i in range(5):
        service.seal(tmp_path, {f"p{j}": entry(f"p{j}") for j in range(i + 1)})
    assert len(list(tmp_path.glob("*.json"))) == 3
    latest = service.newest(tmp_path)
    assert latest is not None and len(latest[1]["entries"]) == 5
    # A damaged bundle is skipped, never served.
    latest[0].write_text(latest[0].read_text().replace("p4", "pX"))
    newest = service.newest(tmp_path)
    assert newest is not None and len(newest[1]["entries"]) == 4

    from courtlens.config import get_settings

    monkeypatch.setattr(get_settings(), "wikipedia_contracts_dir", tmp_path)
    found = service.player_entry("p1")
    assert found is not None and found["bbref_id"] == "p1"
    assert service.player_entry("nobody") is None and service.player_entry(None) is None


def test_reparse_reads_retained_pages_and_keeps_an_entry_whose_page_is_gone(tmp_path: Path):
    import hashlib

    page = article(("Career", ["On July 9, 2019, he signed a three-year, $63 million contract."]))
    raw = page.encode()
    sha = hashlib.sha256(raw).hexdigest()
    root = tmp_path / "raw"
    (root / sha[:2]).mkdir(parents=True)
    (root / sha[:2] / sha).write_bytes(raw)
    output = tmp_path / "bundles"
    service.seal(output, {"a": entry("a", sha), "b": entry("b")})
    _, result = service.reparse(root, output)
    assert result == {"players": 2, "missing_raw": 1, "statements": 1}
    latest = service.newest(output)
    assert latest is not None
    by_id = {e["bbref_id"]: e for e in latest[1]["entries"]}
    assert by_id["a"]["statements"][0]["years"] == 3 and by_id["b"]["parser"] == "old"


def test_undated_sentences_keep_a_season_or_a_year_for_matching_only():
    offseason, after, own, carried, ended = statements(
        article(
            (
                "Cleveland Cavaliers (2014\u20132018)",
                [
                    "During the 2015 offseason, James re-signed with Cleveland on a two-year, "
                    "$47 million contract.",
                    "Following the 2015\u201316 season, he re-signed with the Cavaliers on a "
                    "three-year, $100 million contract.",
                    "In 2017, he signed a two-year contract with the Cavaliers.",
                ],
            ),
            (
                "Los Angeles Lakers (2018\u2013present)",
                [
                    "On July 1, 2018, James agreed to join the Lakers.",
                    "He signed with the Los Angeles Lakers on a four-year, $153.5 million deal.",
                    "He signed a two-year extension with the Lakers that runs through 2027.",
                ],
            ),
        )
    )
    assert (offseason["season"], offseason["year_basis"]) == (2015, "season")
    # The summer after the 2015-16 season opens 2016-17.
    assert (after["season"], after["year_basis"]) == (2016, "season")
    assert (own["year"], own["year_basis"]) == (2017, "sentence_year")
    # Each is its own paragraph: the section's narrative year carries over.
    assert (carried["year"], carried["year_basis"]) == (2018, "section_year")
    # "through 2027" is when it ends, not when it was signed.
    assert (ended["year"], ended["year_basis"]) == (2018, "section_year")
    assert all(s["date"] is None for s in (offseason, after, own, carried, ended))


def test_a_sentences_own_year_outranks_the_heading_it_sits_under():
    (found,) = statements(
        article(
            (
                "2023\u201324 season: First All-Star selection",
                [
                    "On July 7, Maxey signed a $204 million 5-year max contract with the 76ers in "
                    "the 2024 offseason."
                ],
            )
        )
    )
    assert (found["date"], found["year_basis"]) == ("2024-07-07", "sentence")


def test_a_term_the_sentence_revises_is_read_as_revised():
    (found,) = statements(
        article(
            (
                "Memphis Grizzlies (2024\u2013present)",
                [
                    "On June 30, 2025, Spencer re-signed with the Grizzlies on a two-year, "
                    "$4.5 million contract; the deal was later restructured to a four-year, "
                    "$10.5 million contract on July 16."
                ],
            )
        )
    )
    assert (found["years"], found["value"]) == (4, "$10.5M")


def test_an_option_year_is_not_the_signing_year_and_the_narrative_outranks_a_bare_year():
    (found,) = statements(
        article(
            (
                "Houston Rockets (2025\u2013present)",
                [
                    "On July 6, 2025, Durant was traded to the Rockets. On October 19, Durant "
                    "signed a two-year, $90 million contract extension with a player option for "
                    "2027\u20132028."
                ],
            )
        )
    )
    assert (found["date"], found["year_basis"]) == ("2025-10-19", "narrative")
