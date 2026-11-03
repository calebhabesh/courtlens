"""A retired player's last team comes from his final season, never a guess (full history)."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from courtlens.services import player_bio


class _Rows:
    def __init__(self, rows: list[tuple[str, str, str]]) -> None:
        self.rows = [SimpleNamespace(season=s, phase=p, team_id=t) for s, p, t in rows]

    def execute(self, _query: Any) -> Any:
        return SimpleNamespace(all=lambda: self.rows)


def _last(
    rows: list[tuple[str, str, str]],
    monkeypatch: pytest.MonkeyPatch,
    index: str | None = None,
    last_game: str | None = None,
) -> str | None:
    monkeypatch.setattr(player_bio, "_last_game_team", lambda *_: last_game)
    team = player_bio.final_season_team(_Rows(rows), "1", index)  # type: ignore[arg-type]
    return None if team is None else f"{team['team_tricode']} {team['listing_season']}"


def test_one_team_in_the_final_season(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [("1972-73", "regular_season", "LAL"), ("1964-65", "regular_season", "SFW")]
    assert _last(rows, monkeypatch, index="1610612744") == "LAL 1972-73"


def test_traded_player_uses_playoffs_then_last_game_then_index(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    traded = [("1994-95", "regular_season", "SAC"), ("1994-95", "regular_season", "PHI")]
    assert _last([*traded, ("1994-95", "playoffs", "PHI")], monkeypatch) == "PHI 1994-95"
    assert _last(traded, monkeypatch, last_game="PHI") == "PHI 1994-95"
    assert _last(traded, monkeypatch, index="1610612758") == "SAC 1994-95"
    # No evidence of which team came last: no claim.
    assert _last(traded, monkeypatch) is None


def test_era_codes_keep_their_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    team = player_bio.final_season_team(  # type: ignore[arg-type]
        _Rows([("1961-62", "regular_season", "PHW")]), "1", None
    )
    assert team == {
        "team_id": "1610612744",
        "team_tricode": "PHW",
        "listing_season": "1961-62",
        "listing_source": "season_totals",
    }
