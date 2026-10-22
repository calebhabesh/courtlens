"""Playoff series of every completed season (FH05): rounds, lengths and results from the source."""

from __future__ import annotations

from datetime import date

import pytest

from courtlens.domain.playoff_series import classify_round, season_playoff_series
from courtlens.ingestion.bbref_seasons import parse_playoff_series
from courtlens.services.playoff_series import (
    SeasonSeries,
    SeriesGame,
    find_series,
    series_bracket,
)

PAGE = """
<table class="suppress_all stats_table" id="all_playoffs"><tbody>
<tr><td><span><strong>Finals</strong></span></td>
<td><a href='/teams/LAL/1980.html'>Los Angeles Lakers</a> over
<a href='/teams/PHI/1980.html'>Philadelphia 76ers</a>&nbsp;(4-2)</td>
<td><a href='/playoffs/x.html'>Series Stats</a></td></tr>
<tr class="toggleable"><td colspan="3"><div><table>
<tr><td><a href="/boxscores/198005040LAL.html">Game 1</a></td><td>Sun, May 4</td>
<td>Philadelphia 76ers</td><td>102</td><td>@ Los Angeles Lakers</td><td>109</td></tr>
<tr><td><a href="/boxscores/198005070LAL.html">Game 2</a></td><td>Wed, May 7</td>
<td>Philadelphia 76ers</td><td>107</td><td>@ Los Angeles Lakers</td><td>104</td></tr>
</table></div></td></tr>
<tr><td><span><strong>Western Conference First Round</strong></span></td>
<td><a href='/teams/PHO/1980.html'>Phoenix Suns</a> over
<a href='/teams/KCK/1980.html'>Kansas City Kings</a>&nbsp;(2-1)</td><td></td></tr>
<tr class="toggleable"><td colspan="3"><div><table>
<tr><td><a href="/boxscores/198004020PHO.html">Game 1</a></td><td>Wed, Apr 2</td>
<td>Kansas City Kings</td><td>93</td><td>@ Phoenix Suns</td><td>96</td></tr>
</table></div></td></tr>
</tbody></table><div>after</div>
"""


def test_series_and_their_games_parse_from_the_season_page() -> None:
    finals, first = parse_playoff_series(PAGE.encode())
    assert (finals["round"], finals["winner"], finals["loser"]) == ("Finals", "LAL", "PHI")
    assert (finals["winner_wins"], finals["loser_wins"]) == (4, 2)
    assert finals["games"][1] == {
        "number": 2,
        "date": "1980-05-07",
        "home": "LAL",
        "visitor": "PHI",
        "home_points": 104,
        "visitor_points": 107,
    }
    # The nested game tables do not end the series table early.
    assert first["round"] == "Western Conference First Round" and first["winner"] == "PHO"
    assert [g["home"] for g in first["games"]] == ["PHO"]


@pytest.mark.parametrize(
    ("label", "season", "expected"),
    [
        ("Finals", "1946-47", (4, None, "BAA Finals")),
        ("Eastern Conference First Round", "1990-91", (1, "Eastern", "First Round")),
        ("Western Division Semifinals", "1965-66", (2, "Western", "Division Semifinals")),
        ("Central Division First Place Tiebreaker", "1949-50", (0, "Central", "Tiebreakers")),
        ("Quarterfinals", "1946-47", (1, None, "Quarterfinals")),
    ],
)
def test_rounds_classify(label: str, season: str, expected: tuple[int, str | None, str]) -> None:
    got = classify_round(label, season)
    assert (got.number, got.conference, got.name) == expected


def test_file_results_agree_with_their_games() -> None:
    for season in ("1946-47", "1965-66", "1990-91", "2000-01", "2023-24"):
        listed = season_playoff_series(season)
        assert listed
        for series in listed:
            assert len(series["games"]) == series["winner_wins"] + series["loser_wins"]
    finals = next(s for s in season_playoff_series("1990-91") or [] if s["round"] == "Finals")
    assert (finals["winner"], finals["loser"], finals["winner_wins"]) == ("CHI", "LAL", 4)
    assert season_playoff_series("2030-31") is None


def _series(best_of: int, scores: list[tuple[str, int, int]]) -> SeasonSeries:
    games = [
        SeriesGame(
            n + 1, date(1991, 4, 25 + n), home, "NYK" if home == "CHI" else "CHI", hp, vp, None
        )
        for n, (home, hp, vp) in enumerate(scores)
    ]
    return SeasonSeries(
        season="1990-91",
        ending_year=1991,
        round_number=1,
        round_name="First Round",
        conference="Eastern",
        matchup_index=0,
        best_of=best_of,
        team1="CHI",
        team2="NYK",
        games=games,
        series_id="1991-1-E0",
        slug="1991-r1-chi-nyk",
    )


def test_a_best_of_five_ends_at_three_wins_and_a_cutoff_shows_it_in_progress() -> None:
    series = _series(5, [("CHI", 126, 85), ("CHI", 89, 79), ("NYK", 101, 103)])
    finished = series_bracket("1990-91", [series], None, {}, {}).rounds[0].series[0]
    assert finished.status == "finished" and finished.winner_tricode == "CHI"
    assert finished.total_scheduled == 5 and finished.is_sweep
    during = series_bracket("1990-91", [series], date(1991, 4, 26), {}, {}).rounds[0].series[0]
    assert during.status == "in_progress" and (during.team1.wins, during.team2.wins) == (2, 0)
    assert during.winner_team_id is None


def test_series_resolve_by_slug_either_order_or_id() -> None:
    series = _series(5, [("CHI", 126, 85)])
    for alias in ("1991-r1-chi-nyk", "1991-r1-nyk-chi", "1991-1-E0"):
        assert find_series([series], alias) is series
    assert find_series([series], "1991-r1-chi-bos") is None
