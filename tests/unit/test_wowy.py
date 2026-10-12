"""PC11 WOWY splits over fictional stints (person ids 99xxx); no source claim."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from courtlens.config import Settings
from courtlens.domain.wowy import VERSION, cohort_splits, ratings, team_stints
from courtlens.services import wowy_serving

HOME, AWAY = "1610612761", "1610612738"
HOME_FIVE = ("99001", "99002", "99003", "99004", "99005")
AWAY_FIVE = ("99101", "99102", "99103", "99104", "99105")


def stint(
    home: tuple[str, ...],
    seconds: float,
    hp: float,
    ap: float,
    poss: float,
    away: tuple[str, ...] = AWAY_FIVE,
) -> SimpleNamespace:
    return SimpleNamespace(
        home_team=HOME,
        away_team=AWAY,
        home=home,
        away=away,
        seconds=seconds,
        hp=hp,
        ap=ap,
        hx=poss,
        ax=poss,
    )


STINTS = [
    stint(HOME_FIVE, 600, 30, 20, 250),  # both 99001 and 99002
    stint(("99001", "99006", "99003", "99004", "99005"), 300, 10, 12, 210),  # 99001 only
    # Neither; the away team subs out entirely, so 99003-99005 lead in on-court time.
    stint(
        ("99006", "99007", "99003", "99004", "99005"),
        120,
        2,
        6,
        10,
        away=("99106", "99107", "99108", "99109", "99110"),
    ),
]


def test_pair_cells_partition_every_team_stint_exactly() -> None:
    teams = cohort_splits(team_stints(STINTS), top=3)
    home = teams[HOME]
    assert [p["player_id"] for p in home["players"]] == ["99003", "99004", "99005"]
    teams = cohort_splits(team_stints(STINTS), top=10)
    home = teams[HOME]
    pair = next(p for p in home["pairs"] if (p["a"], p["b"]) == ("99001", "99002"))
    cells = pair["cells"]
    assert cells["both"]["seconds"] == 600 and cells["a_only"]["seconds"] == 300
    assert cells["b_only"]["stints"] == 0 and cells["neither"]["seconds"] == 120
    for field in ("seconds", "points_for", "points_against", "possessions_for", "stints"):
        assert sum(c[field] for c in cells.values()) == home["total"][field]
    # The away side sees the same stints with points and possessions swapped.
    away = teams[AWAY]
    assert away["total"]["points_for"] == home["total"]["points_against"] == 38


def test_ratings_flag_small_samples_and_leave_empty_ends_unknown() -> None:
    teams = cohort_splits(team_stints(STINTS))
    pair = next(p for p in teams[HOME]["pairs"] if (p["a"], p["b"]) == ("99001", "99002"))
    both = ratings(pair["cells"]["both"])
    assert both["offensive_rating"] == 12.0 and both["net_rating"] == 4.0
    assert both["small_sample"] is False
    assert ratings(pair["cells"]["neither"])["small_sample"] is True
    empty = ratings(pair["cells"]["b_only"])
    assert empty["offensive_rating"] is None and empty["net_rating"] is None


def artifact(tmp_path: Path) -> Path:
    body = {
        "version": VERSION,
        "inputs": {"acceptance_sha256": "f" * 64},
        "cohorts": {
            "2025-26:regular_season": {
                "season": "2025-26",
                "phase": "regular_season",
                "games": 1,
                "last_game_date": "2026-04-12",
                "teams": cohort_splits(team_stints(STINTS)),
            }
        },
    }
    raw = json.dumps(body, sort_keys=True).encode()
    path = tmp_path / f"{hashlib.sha256(raw).hexdigest()}.json"
    path.write_bytes(raw)
    return path


def test_view_defaults_to_the_minutes_leaders_top_duo_and_rejects_tamper(tmp_path: Path) -> None:
    path = artifact(tmp_path)
    session = SimpleNamespace(execute=lambda *_: SimpleNamespace(all=lambda: []))
    with patch.object(wowy_serving, "get_settings", return_value=Settings(wowy_manifest=path)):
        view = wowy_serving.wowy_view(session, None, None, None, None, None)  # type: ignore[arg-type]
        assert view["team"]["team_tricode"] == "TOR"
        assert view["default_rule"] == "Minutes leader's team, top duo by shared minutes"
        assert view["selected"]["shared_minutes"] == 17.0
        assert view["players"][0]["player_name"] == "NBA player 99003"  # no identity: labeled
        chosen = wowy_serving.wowy_view(session, "2025-26", None, HOME, "99002", "99001")  # type: ignore[arg-type]
        assert {chosen["selected"]["a"], chosen["selected"]["b"]} == {"99001", "99002"}
        assert chosen["default_rule"] is None
        # Small samples are never compared.
        assert chosen["selected"]["net_together_minus_apart"] is None
        with pytest.raises(HTTPException, match="404"):
            wowy_serving.wowy_view(session, "2019-20", None, None, None, None)  # type: ignore[arg-type]
    path.write_bytes(path.read_bytes().replace(b"2026-04-12", b"2026-04-13"))
    wowy_serving._decode.cache_clear()
    with (
        patch.object(wowy_serving, "get_settings", return_value=Settings(wowy_manifest=path)),
        pytest.raises(HTTPException, match="503"),
    ):
        wowy_serving.load_wowy()
