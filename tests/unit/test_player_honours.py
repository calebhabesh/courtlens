from datetime import date

from sqlalchemy.orm import Session

from courtlens.services.player_honours import (
    championships,
    season_champions,
    teams_by_last_appearance,
)
from courtlens.workbench_models import WorkbenchPlayerGame, WorkbenchTeamGame


def _team_game(game: str, day: date, team: str, opponent: str, won: bool) -> WorkbenchTeamGame:
    return WorkbenchTeamGame(
        dataset_id="d", game_id=game, team_id=team, opponent_id=opponent, game_date=day,
        season="2016-17", phase="playoffs", side="home", points=110 if won else 100,
        opponent_points=100 if won else 110, stats_json={}, source_version_id="v",
        source_observation_id="o",
    )  # fmt: skip


def _player_game(
    player: str, team: str, season: str, phase: str, day: date, game: str
) -> WorkbenchPlayerGame:
    return WorkbenchPlayerGame(
        dataset_id="d", game_id=game, player_id=player, team_id=team, opponent_id="X",
        game_date=day, season=season, phase=phase, appearance="appeared",
        minutes_original="30:00", stats_json={}, source_version_id="v", source_observation_id="o",
    )  # fmt: skip


def _finals(session: Session) -> None:
    """GSW beat CLE 4-1, finishing on June 12; both rows of every game are stored."""
    results = [True, True, True, False, True]
    for index, gsw_won in enumerate(results):
        day = date(2017, 6, 1 + index * 3 if index < 4 else 12)
        session.add(_team_game(f"F{index}", day, "GSW", "CLE", gsw_won))
        session.add(_team_game(f"F{index}", day, "CLE", "GSW", not gsw_won))


def test_champion_needs_a_fourth_win_before_the_cutoff(session: Session) -> None:
    _finals(session)
    session.commit()
    assert season_champions(session, "d", None) == {"2016-17": "GSW"}
    assert season_champions(session, "d", date(2017, 6, 12)) == {}


def test_titles_go_to_players_who_appeared_for_the_champion(session: Session) -> None:
    _finals(session)
    session.add_all([
        _player_game("lbj", "CLE", "2014-15", "regular_season", date(2015, 1, 1), "R0"),
        _player_game("kd", "OKC", "2015-16", "regular_season", date(2016, 1, 1), "R1"),
        _player_game("kd", "GSW", "2016-17", "playoffs", date(2017, 6, 1), "F0"),
        _player_game("lbj", "CLE", "2016-17", "playoffs", date(2017, 6, 1), "F0"),
    ])  # fmt: skip
    session.commit()
    titles = championships(session, "d", date(2017, 7, 1), ["kd", "lbj"])
    assert titles["kd"]["seasons"] == ["2016-17"] and titles["kd"]["complete"] is True
    assert titles["lbj"]["seasons"] == []
    # The first admitted season could hide earlier titles for a player who debuted in it.
    assert titles["lbj"]["complete"] is False
    assert championships(session, "d", date(2017, 6, 10), ["kd"])["kd"]["seasons"] == []


def test_traded_player_teams_end_with_the_latest(session: Session) -> None:
    session.add_all([
        _player_game("kd", "BKN", "2022-23", "regular_season", date(2023, 2, 1), "G1"),
        _player_game("kd", "PHX", "2022-23", "regular_season", date(2023, 3, 1), "G2"),
    ])  # fmt: skip
    session.commit()
    order = teams_by_last_appearance(session, "d", "2022-23", "regular_season", None, ["kd"])
    assert order == {"kd": ["BKN", "PHX"]}
    early = teams_by_last_appearance(
        session, "d", "2022-23", "regular_season", date(2023, 2, 15), ["kd"]
    )
    assert early == {"kd": ["BKN"]}
