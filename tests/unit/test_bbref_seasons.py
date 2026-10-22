"""Full history FH02/FH03: Basketball-Reference game logs and season tables."""

from __future__ import annotations

from datetime import date

import pytest

from courtlens.ingestion.bbref_seasons import (
    parse_gamelog,
    parse_standings,
    parse_team_records,
    parse_totals,
    team_code,
)
from courtlens.services.bbref_history_seal import build_gamelog_rows, reconcile_totals
from courtlens.services.history_totals import season_end_date


def _cell(stat: str, value: str, extra: str = "") -> str:
    return f'<td data-stat="{stat}" {extra}>{value}</td>'


def _game_row(
    stamp: str, home: str, team: str, opp: str, away: bool, result: str, pts: int, fg: int, ft: int
) -> str:
    box = f"/boxscores/{stamp}0{home}.html"
    return (
        "<tr>"
        + _cell("date", f'<a href="{box}">{stamp[:4]}-{stamp[4:6]}-{stamp[6:]}</a>')
        + _cell("team_name_abbr", f'<a href="/teams/{team}/1985.html">{team}</a>')
        + _cell("game_location", "@" if away else "")
        + _cell("opp_name_abbr", f'<a href="/teams/{opp}/1985.html">{opp}</a>')
        + _cell("game_result", f'<a href="{box}">{result}</a>')
        + _cell("is_starter", "*")
        + _cell("mp", "40:00")
        + _cell("fg", str(fg))
        + _cell("fga", str(fg * 2))
        + _cell("fg3", "0")
        + _cell("fg3a", "0")
        + _cell("ft", str(ft))
        + _cell("fta", str(ft))
        + "".join(_cell(s, "1") for s in ("orb", "drb", "ast", "stl", "blk", "tov", "pf"))
        + _cell("trb", "2")
        + _cell("pts", str(pts))
        + "</tr>"
    )


def _log(rows: str) -> bytes:
    return (
        '<table id="player_game_log_reg"><thead><tr><th data-stat="date">Date</th></tr></thead>'
        f"<tbody>{rows}</tbody><tfoot><tr>"
        + _cell("date", "")
        + _cell("team_name_abbr", "")
        + _cell("game_result", "1-1")
        + "</tr></tfoot></table>"
    ).encode()


DNP = (
    "<tr>"
    + _cell("date", '<a href="/boxscores/198410270MIL.html">1984-10-27</a>')
    + _cell("team_name_abbr", '<a href="/teams/CHI/1985.html">CHI</a>')
    + _cell("game_location", "@")
    + _cell("opp_name_abbr", '<a href="/teams/MIL/1985.html">MIL</a>')
    + _cell("game_result", '<a href="/boxscores/198410270MIL.html">L, 90-100</a>')
    + _cell("is_starter", "Did Not Play", 'colspan="26"')
    + "</tr>"
)


def test_game_log_rows_appearances_and_nonappearances() -> None:
    raw = _log(_game_row("19841026", "CHI", "CHI", "WSB", False, "W, 109-93", 16, 5, 6) + DNP)
    rows = parse_gamelog(raw, "jordami01", 1985)
    assert [row["appearance"] for row in rows] == ["appeared", "reported_nonappearance"]
    played, absent = rows
    assert played["box_key"] == "198410260CHI"
    assert (played["team_points"], played["opponent_points"]) == (109, 93)
    assert played["minutes_seconds"] == 2400 and played["stats"]["points"] == 16
    assert played["started"] is True
    # A game not played is unknown, never a zero box score.
    assert absent["comment"] == "Did Not Play"
    assert all(value is None for value in absent["stats"].values())


def test_unknown_game_note_is_refused() -> None:
    with pytest.raises(ValueError, match="unknown game-row note"):
        parse_gamelog(_log(DNP.replace("Did Not Play", "Mystery")), "jordami01", 1985)


def test_games_assemble_from_both_teams_logs() -> None:
    chi = parse_gamelog(
        _log(_game_row("19841026", "CHI", "CHI", "WSB", False, "W, 20-11", 20, 7, 6)),
        "jordami01",
        1985,
    )
    wsb = parse_gamelog(
        _log(_game_row("19841026", "CHI", "WSB", "CHI", True, "L, 11-20", 11, 4, 3)),
        "malonje01",
        1985,
    )
    records, report = build_gamelog_rows(
        chi + wsb, {"jordami01": "893"}, {"jordami01": "Michael Jordan", "malonje01": "Jeff Malone"}
    )
    (schedule,) = records["schedule"]
    assert schedule["game_id"] == "0028400001"
    assert (schedule["home_team_id"], schedule["away_team_id"]) == ("CHI", "WSB")
    assert schedule["annotations_json"]["box_score_key"] == "198410260CHI"
    teams = {row["team_id"]: row for row in records["team_game"]}
    assert teams["CHI"]["points"] == 20 and teams["CHI"]["opponent_points"] == 11
    assert teams["WSB"]["side"] == "away"
    players = {row["player_id"] for row in records["player_game"]}
    # Matched players carry their NBA ID; an unmatched one keeps a namespaced source ID.
    assert players == {"893", "bbref:malonje01"}
    assert report["points_mismatches"] == [] and report["unmatched_players"] == ["bbref:malonje01"]


def test_totals_page_and_reconciliation_record_mismatches() -> None:
    raw = (
        '<table id="totals_stats"><tbody><tr>'
        '<td data-stat="name_display" data-append-csv="jordami01">Michael Jordan</td>'
        '<td data-stat="team_name_abbr"><a href="/teams/CHI/1985.html">CHI</a></td>'
        + _cell("games", "1")
        + _cell("pts", "21")
        + _cell("stl", "")
        + "</tr></tbody></table>"
    ).encode()
    totals = parse_totals(raw)
    (row,) = totals["regular_season"]
    assert row["stats"]["points"] == 21
    assert row["stats"]["steals"] is None  # not recorded: unknown, not zero
    games = [
        {
            "season": "1984-85",
            "phase": "regular_season",
            "player_id": "893",
            "team_id": "CHI",
            "appearance": "appeared",
            "stats_json": {"points": 20},
        }
    ]
    report = reconcile_totals(games, {1985: totals}, {"jordami01": "893"})
    assert report["player_team_seasons_checked"] == 1
    assert report["mismatches"][0]["field"] == "points"


def test_team_codes_and_season_end() -> None:
    assert team_code("PHO") == "PHX" and team_code("WSB") == "WSB"
    assert season_end_date("1961-62") == date(1962, 6, 30)


def _standings(
    table_id: str, conference_header: str, groups: dict[str, list[tuple[str, str]]]
) -> str:
    rows = "".join(
        f"<tr class='thead'><th colspan='8'><strong>{division} Division</strong></th></tr>"
        + "".join(
            f'<tr class="full_table"><th data-stat="team_name"><a href="/teams/{code}/1991.html">'
            f'{name}</a>*</th><td data-stat="wins">50</td></tr>'
            for code, name in teams
        )
        for division, teams in groups.items()
    )
    return (
        f'<table class="stats_table" id="{table_id}"><thead><tr><th>{conference_header}</th></tr>'
        f"</thead><tbody>{rows}</tbody></table>"
    )


def test_standings_read_conference_and_division() -> None:
    page = _standings(
        "divs_standings_W", "Western Conference", {"Midwest": [("SAS", "San Antonio Spurs")]}
    ) + _standings("divs_standings_E", "Eastern Conference", {"Atlantic": [("PHO", "X &amp; Y")]})
    # East is read before West, whatever the page order.
    assert parse_standings(page.encode()) == [
        {"team": "PHO", "name": "X & Y", "conference": "Eastern", "division": "Atlantic"},
        {
            "team": "SAS",
            "name": "San Antonio Spurs",
            "conference": "Western",
            "division": "Midwest",
        },
    ]


def test_standings_before_conferences_have_divisions_only() -> None:
    page = _standings("divs_standings_", "Division", {"Central": [("MNL", "Minneapolis Lakers")]})
    assert parse_standings(page.encode()) == [
        {"team": "MNL", "name": "Minneapolis Lakers", "conference": None, "division": "Central"}
    ]


def test_team_records_from_standings_and_advanced_table() -> None:
    standings = (
        '<table class="stats_table" id="divs_standings_"><tbody>'
        '<tr class="full_table"><th data-stat="team_name"><a href="/teams/BOS/1966.html">'
        'Boston Celtics</a>*</th><td data-stat="wins">54</td><td data-stat="losses">26</td></tr>'
        '<tr class="full_table"><th data-stat="team_name"><a href="/teams/BLB/1966.html">'
        'Gone</a></th><td data-stat="wins"></td><td data-stat="losses"></td></tr>'
        "</tbody></table>"
    )
    advanced = (
        '<table class="stats_table" id="advanced-team"><tbody><tr>'
        '<td data-stat="team"><a href="/teams/BOS/1966.html">Boston Celtics</a>*</td>'
        + "".join(
            _cell(stat, value)
            for stat, value in (
                ("mov", "4.89"),
                ("sos", "-0.54"),
                ("srs", "4.34"),
                ("off_rtg", "92.3"),
                ("def_rtg", "88.3"),
                ("pace", ""),
                ("arena_name", "Boston Garden"),
                ("attendance", "246,189"),
            )
        )
        + '</tr><tr><td data-stat="team">League Average</td></tr></tbody></table>'
    )
    records = parse_team_records((standings + advanced).encode())
    assert records == [
        {
            "team": "BOS",
            "wins": 54,
            "losses": 26,
            "mov": 4.89,
            "sos": -0.54,
            "srs": 4.34,
            "ortg": 92.3,
            "drtg": 88.3,
            "pace": None,
            "arena": "Boston Garden",
            "attendance": 246189,
        },
        # A team that folded mid-season has blank standings: unknown, never 0-0.
        {"team": "BLB", "wins": None, "losses": None},
    ]
