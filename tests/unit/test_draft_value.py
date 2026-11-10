"""R09 Draft Classes: parsers, value rules, redraft, expectations and the rookie comparison."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from courtlens.evaluation import draft_value_data as data
from courtlens.evaluation import draft_value_runner as runner
from courtlens.ingestion import draft_history as history

WIKI = """
<html><script>"wgRevisionId":123456</script>
<table class="wikitable"><tr><th>Pos.</th><th>G</th></tr></table>
<table class="wikitable sortable">
<tr><th>Round</th><th>Pick</th><th>Player</th><th>Pos.</th><th>Nationality</th><th>Team</th>
<th>School/club team</th></tr>
<tr><td rowspan="2">1</td><td>1</td><td><a href="/wiki/Kareem_Abdul-Jabbar">Lew Alcindor</a>
<sup>*</sup></td><td>C</td><td>USA</td><td>Milwaukee Bucks</td><td>UCLA (Sr.)</td></tr>
<tr><td>2</td><td><span style="display:none">Cox, Chubby</span>Chubby Cox^</td><td>G</td>
<td>USA</td><td>Phoenix Suns <small>(from Boston)</small></td><td>San Francisco</td></tr>
<tr><td>2</td><td>3</td><td>Felix Knox</td><td>F</td><td>USA</td><td>Atlanta Hawks**</td>
<td>Iowa</td></tr>
</table>
<table class="wikitable"><tr><th>Round</th><th>Pick</th><th>Player</th><th>Pos.</th>
<th>Nationality</th><th>Team</th><th>ABA team</th></tr>
<tr><td>1</td><td>1</td><td>Someone Else</td><td>F</td><td>USA</td><td>Atlanta Hawks</td>
<td>X</td></tr></table>
</html>
"""


def test_wikipedia_reads_only_the_draft_table() -> None:
    picks = history.parse_wikipedia(WIKI.encode(), 1969)
    assert [p["overall_pick"] for p in picks] == [1, 2, 3]
    assert [p["round_number"] for p in picks] == [1, 1, 2]  # rowspan carries the round
    assert picks[0]["player_name"] == "Lew Alcindor"
    assert picks[0]["wiki_title"] == "Kareem_Abdul-Jabbar"
    # A trailing x is part of a name, not a legend mark; the hidden sort key is dropped.
    assert picks[1]["player_name"] == "Chubby Cox"
    assert picks[2]["player_name"] == "Felix Knox"
    assert picks[1]["team"] == "Phoenix Suns"
    assert history.revision_id(WIKI.encode()) == 123456


def test_wikipedia_refuses_a_gap_in_pick_numbers() -> None:
    gap = WIKI.replace("<td>2</td><td>3</td>", "<td>2</td><td>4</td>")
    with pytest.raises(ValueError, match=r"not 1\.\.4"):
        history.parse_wikipedia(gap.encode(), 1969)


def test_official_file_keeps_draft_rows_of_its_year() -> None:
    body = {
        "resultSets": [
            {
                "headers": [
                    "PERSON_ID",
                    "PLAYER_NAME",
                    "SEASON",
                    "ROUND_NUMBER",
                    "OVERALL_PICK",
                    "DRAFT_TYPE",
                    "TEAM_ABBREVIATION",
                ],
                "rowSet": [
                    [977, "Kobe Bryant", "1996", 1, 13, "Draft", "CHH"],
                    [1, "Territorial", "1996", 0, 0, "Territorial", "BOS"],
                ],
            }
        ]
    }
    picks = history.parse_official(json.dumps(body).encode(), 1996)
    assert picks == [
        {
            "draft_year": 1996,
            "overall_pick": 13,
            "round_number": 1,
            "player_name": "Kobe Bryant",
            "player_id": "977",
            "team": "CHH",
            "team_id": None,
            "organization": None,
            "wiki_title": None,
        }
    ]
    body["resultSets"][0]["rowSet"][0][2] = "1997"
    with pytest.raises(ValueError, match="row from draft 1997"):
        history.parse_official(json.dumps(body).encode(), 1996)


def test_urls_are_pinned() -> None:
    assert history.year_for_url(history.hoopr_url(1996)) == ("hoopr_nba_stats_raw", 1996)
    assert history.hoopr_url(1996).endswith("/drafthistory/1997.json")
    assert history.year_for_url(history.wiki_url(1985)) == ("wikipedia_drafts", 1985)
    for bad in (history.hoopr_url(1996).replace("7f2c0a", "000000"), history.wiki_url(1985) + "x"):
        with pytest.raises(ValueError):
            history.year_for_url(bad)
    with pytest.raises(ValueError):
        history.wiki_url(1999)


def test_team_names_map_to_era_codes() -> None:
    assert data.team_for_name("Kansas City\N{EN DASH}Omaha Kings", 1972)["code"] == "KCO"
    assert data.team_for_name("Atlanta Hawks**", 1971)["code"] == "ATL"
    assert data.team_for_name("New Orleans", 1974)["code"] == "NOJ"
    with pytest.raises(ValueError):
        data.team_for_name("Nowhere Nobodies", 1980)


def pick(year: int, slot: int, pid: str | None, round_: int = 1) -> dict[str, Any]:
    return {
        "year": year,
        "pick": slot,
        "round": round_,
        "source": "test",
        "source_name": f"P{pid}",
        "name": f"P{pid}",
        "player_id": pid,
        "season_id": pid,
        "identity": "official" if pid else None,
        "team": "BOS",
        "team_name": None,
        "organization": None,
        "wiki_title": None,
    }


def season(ws: float | None, minutes: int = 1000) -> dict[str, Any]:
    return {"g": 50, "min": minutes, "ws": ws}


def test_absent_from_complete_totals_is_zero_and_missing_ws_is_unknown() -> None:
    seasons = {
        "a": {
            "1999-00": season(9.0),  # before the draft: never counted
            "2000-01": season(1.0),
            "2003-04": season(2.0),
            "2004-05": season(5.0),  # outside the four-season window
            "2025-26": season(1.0),
        },
        "b": {"2000-01": season(None)},
    }
    values = runner.pick_values(
        [pick(2000, 1, "a"), pick(2000, 2, "b"), pick(2000, 3, None)], seasons, {}
    )
    a, b, none = values
    assert a["window_ws"] == 3.0 and a["window_seasons_played"] == 2
    assert a["career_ws"] == 9.0 and a["active"]
    assert b["window_ws"] is None and b["played"]
    assert none["window_ws"] == 0.0 and none["window_min"] == 0.0 and not none["played"]


def test_rapm_is_seconds_weighted_inside_the_window_only() -> None:
    rapm = {
        "a": {
            "2014-15": {"rapm": 1.0, "seconds": 100.0},
            "2015-16": {"rapm": 4.0, "seconds": 300.0},
            "2018-19": {"rapm": 50.0, "seconds": 1000.0},
        }
    }
    (value,) = runner.pick_values([pick(2014, 1, "a")], {}, rapm)
    assert value["window_rapm"] == pytest.approx(3.25)
    (old,) = runner.pick_values([pick(2013, 1, "a")], {}, rapm)
    assert old["window_rapm"] is None


def test_redraft_orders_by_value_then_minutes_then_pick() -> None:
    rows = [
        {"year": 2000, "pick": 1, "window_ws": 2.0, "window_min": 900.0},
        {"year": 2000, "pick": 2, "window_ws": 5.0, "window_min": 100.0},
        {"year": 2000, "pick": 3, "window_ws": 2.0, "window_min": 950.0},
        {"year": 2000, "pick": 4, "window_ws": None, "window_min": 2000.0},
        {"year": 2000, "pick": 5, "window_ws": 0.0, "window_min": 0.0},
    ]
    ranks = runner.redraft(rows, "window_ws")
    assert [ranks[(2000, p)] for p in (2, 3, 1, 5, 4)] == [1, 2, 3, 4, 5]


def test_expectation_leaves_out_the_players_own_class() -> None:
    values = [
        {"year": 1990, "pick": 1, "window_ws": 10.0},
        {"year": 1991, "pick": 1, "window_ws": 20.0},
        {"year": 1992, "pick": 1, "window_ws": 30.0},
        {"year": 1970, "pick": 1, "window_ws": 99.0},  # another era
        {"year": 2024, "pick": 1, "window_ws": 99.0},  # censored class
    ]
    expected = runner.expectations(values)
    assert expected[("two_round", "1", 1990)] == 25.0
    assert expected[("two_round", "1", 1992)] == 15.0
    assert ("multi_round", "1", 1970) not in expected  # no other class at that slot


def game(day: str, seconds: int, pts: int) -> list[Any]:
    return [day, day, seconds, pts, 5, 2, 1, 0, 1, 4, 9, 1, 3, 2, 2]


def test_rookie_comparison_aligns_games_and_never_reads_later_games() -> None:
    pool = {
        "old1": {"games": [game(f"1990-11-{d:02d}", 1800, 10) for d in range(1, 30)]},
        "old2": {"games": [game("1991-11-01", 1200, 30)]},  # fewer games than the rookie
    }
    current = [game(f"2026-10-{d:02d}", 2160, 18) for d in (21, 23, 25)]
    result = runner.rookie_comparison(current, pool)
    assert result["line"]["games"] == 3 and result["line"]["pts36"] == pytest.approx(18.0)
    assert result["comparisons"]["old1"]["games"] == 3
    assert result["comparisons"]["old2"]["games"] == 1
    assert result["reached_games"] == 1 and result["pool"] == 2
    later = {
        **pool,
        "old1": {"games": pool["old1"]["games"][:3] + [game("1991-03-01", 2880, 60)] * 20},
    }
    assert runner.rookie_comparison(current, later) == result
    # old1 scores 12 per 36 and old2 36 per 36: the rookie's 18 sits between them.
    stats = result["stats"]["pts36"]
    assert stats["n"] == 2 and stats["percentile"] == 50.0


def synthetic_tables() -> dict[str, Any]:
    picks, seasons = [], {}
    for year in range(1966, 2027):
        for slot in range(1, 63 if year <= 1988 else 61):
            pid = f"{year}-{slot}"
            picks.append(pick(year, slot, pid, 1 if slot <= 30 else 2))
            if (year * 7 + slot) % 5 and year <= 2025:
                seasons[pid] = {
                    data.season_label(year + k): season(round(6.0 - slot / 12 + (year % 3), 1))
                    for k in range(0, min(6, 2026 - year))
                }
    combine = [
        {
            "year": p["year"],
            "player_id": p["player_id"],
            "position": "G",
            "height": 75.0 + p["pick"] % 7,
            "wingspan": 78.0 + p["pick"] % 5,
            "standing_reach": None,
            "weight": 200.0,
            "max_vertical": None,
            "lane_agility": None,
            "sprint": None,
        }
        for p in picks
        if 2000 <= p["year"] <= 2026 and p["pick"] <= 30
    ]
    rookies = {
        p["player_id"]: {
            "season": data.season_label(p["year"]),
            "games": [game("2000-11-01", 1500, 9)] * 5,
        }
        for p in picks
        if 1983 <= p["year"] <= 2025 and p["pick"] <= 5
    }
    v = runner.REGISTRATION
    return {
        "picks": {"version": v, "rows": picks, "rules": {}},
        "seasons": {"version": v, "players": seasons},
        "rapm": {"version": v, "players": {}},
        "combine": {"version": v, "rows": combine},
        "rookies": {"version": v, "players": rookies},
    }


def test_run_end_to_end_is_deterministic() -> None:
    receipt = {"identity": runner.REGISTRATION, "parameters": {"table_sha256": {"picks": "x"}}}
    tables = synthetic_tables()
    first = runner.run(tables, receipt)
    assert first == runner.run(tables, receipt)
    assert first["classes"]["2022"]["status"] == "complete"
    assert first["classes"]["2023"]["status"] == "censored"
    assert first["classes"]["2026"]["status"] == "rookies"
    for year in ("2023", "2026"):
        rows = first["classes"][year]["rows"]
        assert all(r["redraft_window"] is None and r["surplus_window_ws"] is None for r in rows)
        assert not first["classes"][year]["steals"]
    window = first["value_by_pick"]["window"]["all"]["ws"]
    assert len(window) == runner.SLOTS
    assert all(r["lo"] <= r["mean"] <= r["hi"] for r in window)
    assert all(m["round"] == 1 for m in first["misses"])
    assert {b["verdict"] for b in first["bands"]} <= {"higher", "lower", "no difference"}
    assert first["rookie_pool"]["1"] == 2025 - 1983 + 1


def test_registration_constants_are_checked() -> None:
    params = dict(runner.PARAMETERS)
    runner.check_registration(params, runner.SEED)
    with pytest.raises(SystemExit):
        runner.check_registration({**params, "window_seasons": 3}, runner.SEED)
    with pytest.raises(SystemExit):
        runner.check_registration(params, runner.SEED + 1)


def test_second_test_run_is_refused(tmp_path: Path) -> None:
    results = tmp_path / "results.json"
    results.write_text("{}")
    with pytest.raises(SystemExit, match="have been read"):
        runner.command_test(tmp_path, results)
