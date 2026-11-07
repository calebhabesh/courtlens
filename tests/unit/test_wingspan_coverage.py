"""RD01 round 2: CraftedNBA coverage beside the frozen R10 wingspan results (no database; the
current D-DPM board is stubbed). Combine measurements win; reported values stay out of the
registered analysis."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from courtlens.api.app import create_app
from courtlens.ingestion.craftednba import feet_inches, parse_length_page
from courtlens.services import wingspan, wingspan_coverage


def _row(rank: int, slug: str, name: str, team: str, height: str, span: str, length: str) -> str:
    return (
        f'<tr data-v><td class="the-rank font-bold" data-v><strong data-v>{rank}</strong></td>'
        f'<td class="the-name font-medium" data-v><a href="/players/{slug}" class="" data-v>'
        f'{name}</a><span class="block" data-v>{team}</span></td><td data-v>{height}</td>'
        f"<td data-v>{span}</td><td data-v>{length}</td></tr>"
    )


def _page(rows: list[str]) -> bytes:
    return ("<html><table>" + "".join(rows) + "</table></html>").encode()


FILLER = [
    _row(i, f"p-{i}", f"Filler {i}", "BOS | SG", "6&#39;5&quot;", "6&#39;9&quot;", "4")
    for i in range(10, 110)
]


def test_feet_inches_and_unknowns() -> None:
    assert feet_inches("7&#39;4&quot;") == 88
    assert feet_inches("6'11.25\"") == 83.25
    assert feet_inches("—") is None
    assert feet_inches("6'12\"") is None


def test_parser_reads_every_row_and_keeps_the_listed_length_as_a_check() -> None:
    rows = parse_length_page(
        _page(
            [
                _row(
                    1,
                    "kelly-oubre-jr.",
                    "Kelly Oubre Jr.",
                    "IND | SF",
                    "6&#39;5.75&quot;",
                    "7&#39;2.25&quot;",
                    "8.5",
                ),
                *FILLER,
            ]
        )
    )
    assert rows[0] == {
        "rank": 1,
        "slug": "kelly-oubre-jr.",
        "name": "Kelly Oubre Jr.",
        "team": "IND",
        "position": "SF",
        "height": 77.75,
        "wingspan": 86.25,
        "listed_length": 8.5,
    }
    with pytest.raises(ValueError, match="layout changed"):
        parse_length_page(_page(FILLER) + b'<td class="the-rank">broken</td>')


def test_matching_is_by_name_with_aliases_and_board_tiebreak() -> None:
    rows = [
        {"slug": "bones-hyland", "name": "Bones Hyland", "team": "MIN"},
        {"slug": "jalen-williams", "name": "Jalen Williams", "team": "OKC"},
        {"slug": "nobody", "name": "No Such Player", "team": "BOS"},
        {"slug": "twin", "name": "Twin Name", "team": "BOS"},
    ]
    frozen = [
        {"player_id": "1", "name": "Nah'Shon Hyland"},
        {"player_id": "2", "name": "Jalen Williams"},
        {"player_id": "3", "name": "Jalen Williams"},
        {"player_id": "4", "name": "Twin Name"},
        {"player_id": "5", "name": "Twin Name"},
    ]
    board = {"players": {"3": {"name": "Jalen Williams"}}}
    matched, ambiguous, unmatched = wingspan_coverage.match_ids(rows, frozen, board)  # type: ignore[arg-type]
    assert [(m["slug"], m["player_id"]) for m in matched] == [
        ("bones-hyland", "1"),
        ("jalen-williams", "3"),
    ]
    assert [a["slug"] for a in ambiguous] == ["twin"]
    assert [u["slug"] for u in unmatched] == ["nobody"]


def test_committed_seal_verifies_and_matches_its_raw_page() -> None:
    sealed = wingspan_coverage.load()
    assert sealed is not None and sealed["version"] == "courtlens-wingspan-coverage-v1"
    assert wingspan_coverage.verify_raw(sealed)
    assert sealed["results_sha256"] == wingspan._load_results()["results_sha256"]
    counts = sealed["counts"]
    assert counts["matched"] + counts["ambiguous"] + counts["unmatched"] == counts["rows"]


def test_tampered_seal_is_refused(tmp_path: Path) -> None:
    body = json.loads(wingspan_coverage.SEAL_PATH.read_bytes())
    body["players"][0]["wingspan"] += 1
    path = tmp_path / "seal.json"
    path.write_text(json.dumps(body))
    with pytest.raises(ValueError, match="changed"):
        wingspan_coverage.load(path)


def test_build_refuses_naive_times() -> None:
    with pytest.raises(ValueError, match="timezone"):
        wingspan_coverage.build(b"", datetime(2026, 11, 7), {"players": []}, None)
    assert datetime(2026, 11, 7, tzinfo=UTC).tzinfo is not None


@pytest.fixture
def api(monkeypatch: pytest.MonkeyPatch) -> Any:
    wingspan._cache.clear()
    board = {
        "season": "2026-27",
        "data_date": "2026-11-02",
        "as_of": "2026-11-05",
        "players": {"1641705": {"d_dpm": 2.4}},
    }
    monkeypatch.setattr(wingspan, "current_board", lambda: board)
    client = TestClient(create_app())
    return lambda path: client.get(path)


def test_summary_fills_skippers_and_adds_players_without_touching_the_analysis(api: Any) -> None:
    body = api("/api/wingspan").json()
    sealed = wingspan_coverage.load()
    assert sealed is not None
    frozen = {p["player_id"]: p for p in wingspan._load_results()["players"]}
    rows = {p["player_id"]: p for p in body["players"]}
    for entry in sealed["players"]:
        row = rows[entry["player_id"]]
        if frozen.get(entry["player_id"], {}).get("measured"):
            assert row["measurement_source"] == "combine"  # the combine wins
            assert row["wingspan"] == frozen[entry["player_id"]]["wingspan"]
        else:
            assert row["measurement_source"] == "craftednba"
            assert (row["height"], row["wingspan"]) == (entry["height"], entry["wingspan"])
            assert row["in_population"] is False and row["measured"] is False
            assert set(row["percentiles"]) <= {"d_dpm"}
    wemby = rows["1641705"]
    assert (wemby["height"], wemby["wingspan"], wemby["diff"]) == (88.0, 96.0, 8.0)
    assert wemby["active"] is True and wemby["d_dpm_now"] == 2.4
    # The registered population and its correlations are unchanged.
    assert sum(p["in_population"] for p in body["players"]) == body["population"]["analysis"]
    assert sum(p["measured"] for p in body["players"]) == body["population"]["measured"]
    assert body["coverage"]["state"] == "ready" and any(
        s["name"] == "CraftedNBA" for s in body["sources"]
    )


def test_nearest_for_a_reported_player_uses_the_combine_pool(api: Any) -> None:
    body = api("/api/wingspan/nearest/1641705").json()
    assert body["state"] == "ready" and body["target_source"] == "craftednba"
    assert len(body["neighbours"]) == 5
    assert all(n["measurement_source"] == "combine" for n in body["neighbours"])
    assert api("/api/wingspan/nearest/999999999").status_code == 404
