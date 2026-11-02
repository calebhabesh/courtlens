"""Playoff series context (row 8): records, season series, matchups and impact boards."""

from __future__ import annotations

import gzip
import json
from datetime import date
from pathlib import Path

import pytest

from courtlens.api.workbench_schemas import SeriesImpactPlayer
from courtlens.services import series_matchups as matchups_module
from courtlens.services.playoff_context import RegularSeason, _top, franchise
from courtlens.services.playoff_series import (
    SeasonSeries,
    SeriesGame,
    context_before,
    series_bracket,
)
from courtlens.services.series_matchups import FIELDS, VERSION, series_matchups


def _season() -> RegularSeason:
    context = RegularSeason("2025-26")
    games = [
        ("0022500001", date(2025, 11, 28), "OKC", "PHX", 123, 119),
        ("0022500002", date(2026, 1, 4), "PHX", "OKC", 108, 105),
        ("0022500003", date(2026, 2, 11), "PHX", "OKC", 109, 136),
        ("0022500004", date(2026, 2, 12), "OKC", "LAL", 99, 90),
    ]
    for game_id, day, home, away, hp, ap in games:
        context.games.append((game_id, day, home, away, hp, ap))
        context.wins[franchise(home if hp > ap else away)] += 1
        context.losses[franchise(away if hp > ap else home)] += 1
    return context


def test_season_series_counts_each_meeting_once_from_either_side() -> None:
    context = _season()
    assert context.record("OKC") == (3, 1)
    assert context.series_wins("OKC", "PHX") == (2, 1)
    assert context.series_wins("PHX", "OKC") == (1, 2)
    # Teams that never met have an unknown season series, not 0-0.
    assert context.series_wins("PHX", "LAL") == (None, None)
    games = context.season_series("OKC", "PHX")
    assert [(g.game_date, g.home_tricode, g.winner_team_id) for g in games] == [
        ("2025-11-28", "OKC", "OKC"),
        ("2026-01-04", "PHX", "PHX"),
        ("2026-02-11", "PHX", "OKC"),
    ]


def test_a_team_without_stored_games_has_no_record() -> None:
    assert RegularSeason("2025-26").record("OKC") == (None, None)
    assert _season().record("BOS") == (None, None)


def test_context_ends_at_the_playoffs_or_after_an_earlier_cutoff() -> None:
    starts = [date(2026, 4, 18), date(2026, 4, 19)]
    assert context_before(starts, None) == date(2026, 4, 18)
    assert context_before(starts, date(2026, 4, 1)) == date(2026, 4, 2)
    assert context_before(starts, date(2026, 6, 1)) == date(2026, 4, 18)
    assert context_before([], None) is None


def test_bracket_slots_carry_records_and_season_series() -> None:
    series = SeasonSeries(
        season="2025-26",
        ending_year=2026,
        round_number=1,
        round_name="First Round",
        conference="Western",
        matchup_index=4,
        best_of=7,
        team1="OKC",
        team2="PHX",
        games=[SeriesGame(1, date(2026, 4, 19), "OKC", "PHX", 119, 84, None)],
        series_id="004250014",
        slug="2026-r1-okc-phx",
    )
    slot = series_bracket("2025-26", [series], None, {}, {}, _season()).rounds[0].series[0]
    assert (slot.team1.record_wins, slot.team1.record_losses) == (3, 1)
    assert (slot.team1.season_series_wins, slot.team2.season_series_wins) == (2, 1)


def _write(directory: Path) -> None:
    pair = dict.fromkeys(FIELDS, 0)
    rows = []
    for off, defender, tri, poss, pts in (
        ("1", "9", "OKC", 10.5, 4),
        ("1", "8", "OKC", 3.0, 2),
        ("9", "1", "PHX", 7.0, 3),
    ):
        pair.update(off_player_id=off, def_player_id=defender, off_tricode=tri)
        pair.update(possessions=poss, points=pts, fga=2)
        rows.append([pair[f] for f in FIELDS])
    body = {
        "version": VERSION,
        "fields": FIELDS,
        "names": {"1": "Shai Gilgeous-Alexander", "9": "Dillon Brooks", "8": "Devin Booker"},
        "games": {
            "0042500141": {"phase": "playoffs", "pairs": rows},
            "0042500142": {"phase": "playoffs", "pairs": rows[:1]},
            "0022500001": {"phase": "regular_season", "pairs": rows[:1]},
        },
    }
    (directory / "2025-26.json.gz").write_bytes(gzip.compress(json.dumps(body).encode()))


def test_series_matchups_sum_pairs_per_phase(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write(tmp_path)
    monkeypatch.setattr(matchups_module, "matchups_dir", lambda: tmp_path)
    side = {"OKC": "OKC", "PHX": "PHX"}.get
    got = series_matchups(
        "2025-26", side, ["0042500141", "0042500142", "0042500143"], ["0022500001"]
    )
    assert got is not None
    # Game 3 has no matchup document: two of three played games are covered.
    assert (got.playoff_games, got.playoff_games_played, got.regular_season_games) == (2, 3, 1)
    brooks = next(
        r
        for r in got.rows
        if r.phase == "playoffs" and r.off_player_id == "1" and r.def_player_id == "9"
    )
    assert (brooks.games, brooks.possessions, brooks.points, brooks.fga) == (2, 21.0, 8, 4)
    assert brooks.def_player_name == "Dillon Brooks" and brooks.off_team_id == "OKC"
    regular = [r for r in got.rows if r.phase == "regular_season"]
    assert [(r.off_player_id, r.def_player_id, r.possessions) for r in regular] == [
        ("1", "9", 10.5)
    ]
    # No file for the season, or none of the series' games in it: no matchups section.
    assert series_matchups("2019-20", side, ["0041900101"], []) is None
    assert series_matchups("2025-26", side, ["0042500101"], []) is None


def test_impact_boards_rank_each_team_and_keep_twelve() -> None:
    players = [
        SeriesImpactPlayer(player_id=str(n), player_name=f"P{n}", team_id=team, total=float(n))
        for team in ("OKC", "PHX")
        for n in range(15)
    ] + [SeriesImpactPlayer(player_id="x", player_name="Unrated", team_id="OKC", total=None)]
    top = _top(players, ("OKC", "PHX"))
    assert [p.team_id for p in top] == ["OKC"] * 12 + ["PHX"] * 12
    assert [p.total for p in top[:3]] == [14.0, 13.0, 12.0]
    assert all(p.total is not None for p in top)
