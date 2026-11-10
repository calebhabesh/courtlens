"""R09 API and frozen results: payloads, unknown states, and checks against the committed data."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from courtlens.api.app import create_app
from courtlens.evaluation import draft_value_runner as runner
from courtlens.services import draft_classes


@pytest.fixture(autouse=True)
def fresh_cache() -> None:
    draft_classes._cache.clear()


def results() -> dict[str, Any]:
    return draft_classes._load_results()


def test_summary_payload() -> None:
    response = TestClient(create_app()).get("/api/draft")
    assert response.status_code == 200
    body = response.json()
    assert body["registration"]["identity"] == "courtlens-draft-value-v1"
    assert [c["year"] for c in body["classes"]] == list(range(1966, 2027))
    for era in ("all", "multi_round", "two_round"):
        for measure in ("ws", "min"):
            rows = body["value_by_pick"]["window"][era][measure]
            assert [r["slot"] for r in rows] == list(range(1, 61))
    assert len(body["steals"]) == len(body["misses"]) == runner.TOP_LIST
    assert body["credits"] and body["caveats"]


def test_class_endpoint_and_unknown_year() -> None:
    client = TestClient(create_app())
    jordan = client.get("/api/draft/classes/1984").json()["rows"][2]
    assert (jordan["name"], jordan["pick"], jordan["team"]) == ("Michael Jordan", 3, "CHI")
    assert client.get("/api/draft/classes/1950").status_code == 404
    assert client.get("/api/draft/combine").status_code == 200


def test_missing_results_give_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(draft_classes, "RESULTS_PATH", Path("missing.json"))
    monkeypatch.setattr(draft_classes._load_results, "__defaults__", (Path("missing.json"),))
    assert TestClient(create_app()).get("/api/draft").status_code == 503


def test_every_class_has_contiguous_picks_and_censoring_holds() -> None:
    body = results()
    for year, entry in body["classes"].items():
        picks = [r["pick"] for r in entry["rows"]]
        assert picks == list(range(1, len(picks) + 1)), year
        if entry["status"] != "complete":
            assert int(year) >= 2023
            assert all(r["redraft_window"] is None for r in entry["rows"])
            assert all(r["surplus_window_ws"] is None for r in entry["rows"])
            assert not entry["steals"] and not entry["misses"]
        else:
            ranks = sorted(r["redraft_window"] for r in entry["rows"])
            assert ranks == list(range(1, len(picks) + 1)), year


def test_expectations_recompute_leave_one_class_out_from_the_rows() -> None:
    body = results()
    pool: dict[tuple[str, str], list[tuple[int, float]]] = defaultdict(list)
    for year, entry in body["classes"].items():
        if entry["status"] != "complete":
            continue
        for r in entry["rows"]:
            if r["window_ws"] is not None:
                pool[(entry["era"], runner.slot_key(r["pick"]))].append((int(year), r["window_ws"]))
    checked = 0
    for year, entry in body["classes"].items():
        if entry["status"] != "complete":
            continue
        for r in entry["rows"]:
            others = [
                x for y, x in pool[(entry["era"], runner.slot_key(r["pick"]))] if y != int(year)
            ]
            if r["expected_window_ws"] is None:
                assert not others
                continue
            assert r["expected_window_ws"] == pytest.approx(sum(others) / len(others), abs=1e-5)
            checked += 1
    assert checked > 6000


def test_value_by_pick_means_equal_the_class_rows() -> None:
    body = results()
    for era, (first, last) in runner.ERAS.items():
        rows = body["value_by_pick"]["window"][era]["ws"]
        for slot in (1, 7, 30, 45, 60):
            values = [
                r["window_ws"]
                for y, c in body["classes"].items()
                if first <= int(y) <= last
                for r in c["rows"]
                if r["pick"] == slot and r["window_ws"] is not None
            ]
            entry = rows[slot - 1]
            assert entry["n"] == len(values)
            assert entry["mean"] == pytest.approx(sum(values) / len(values), abs=1e-5)
            assert entry["lo"] <= entry["mean"] <= entry["hi"]


def test_steals_and_misses_follow_the_rule() -> None:
    body = results()
    assert all(m["round"] == 1 for m in body["misses"])
    assert all(int(s["year"]) <= runner.WINDOW_CLASSES[1] for s in body["steals"] + body["misses"])
    surplus = [s["surplus_window_ws"] for s in body["steals"]]
    assert surplus == sorted(surplus, reverse=True)


class FakeSession:
    pass


def fake_tracker(monkeypatch: pytest.MonkeyPatch, *, darko: bool) -> None:
    day = date(2026, 11, 4)
    pick_one = results()["classes"]["2026"]["rows"][0]["player_id"]
    game = ["2026-10-22", "g1", 1800, 12, 4, 3, 1, 0, 2, 5, 10, 1, 4, 1, 2, "WAS"]
    monkeypatch.setattr(draft_classes, "comparison_date", lambda s, d: day)
    monkeypatch.setattr(draft_classes, "rookie_games", lambda s, d, ids, as_of: {pick_one: [game]})
    monkeypatch.setattr(
        draft_classes,
        "darko_on",
        lambda as_of: (
            {"data_date": "2026-11-02", "as_of": "2026-11-05", "players": {}} if darko else None
        ),
    )
    monkeypatch.setattr(draft_classes, "rapm_snapshot_on", lambda as_of: None)
    past = {"games": [game[:-1]] * 3, "season": "2019-20", "year": 2019, "name": "Past"}
    monkeypatch.setattr(draft_classes, "_pool", lambda: {1: {"p": past}})


def test_rookie_tracker_unknown_states(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_tracker(monkeypatch, darko=False)
    body = draft_classes.rookies(FakeSession(), "dataset")  # type: ignore[arg-type]
    assert body["state"] == "ok" and body["comparison_date"] == "2026-11-04"
    first, second = body["rookies"][0], body["rookies"][1]
    assert first["state"] == "compared" and first["team"] == "WAS"
    assert first["comparison"]["pool"] == 1 and first["comparison"]["small_sample"]
    assert second["state"] == "no_games" and second["comparison"] is None
    assert first["darko"] is None and first["rapm"] is None and body["darko"] is None


def test_rookie_tracker_without_games_or_pool(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_tracker(monkeypatch, darko=True)
    monkeypatch.setattr(draft_classes, "comparison_date", lambda s, d: None)
    assert draft_classes.rookies(FakeSession(), "d")["state"] == "no_games"  # type: ignore[arg-type]
    fake_tracker(monkeypatch, darko=True)
    monkeypatch.setattr(draft_classes, "_pool", lambda: None)
    assert draft_classes.rookies(FakeSession(), "d")["state"] == "pool_unavailable"  # type: ignore[arg-type]
