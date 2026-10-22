from datetime import date

from courtlens.services.starter_evidence import observed_unit

D1, D2, D3 = date(2026, 1, 1), date(2026, 1, 3), date(2026, 1, 5)
FIVE = ["1", "2", "3", "4", "5"]


def _game(game: str, day: date, players: list[str]) -> list[tuple[str, date, str]]:
    return [(game, day, p) for p in players]


def test_most_used_unit_with_majority_positions_and_honest_counts() -> None:
    raw = {}
    for game, labels in (("g1", "GGFFC"), ("g2", "GFFFC"), ("g3", "GGFFC")):
        raw |= {(game, p): label for p, label in zip(FIVE, labels, strict=True)}
        raw[(game, "6")] = ""
    # g4: player 7 has no raw row, so the game is unknown, not bench.
    raw |= {("g4", p): label for p, label in zip(FIVE, "GGFFC", strict=True)}
    appearances = (
        _game("g1", D1, [*FIVE, "6"])
        + _game("g2", D2, [*FIVE, "6"])
        + _game("g3", D3, [*FIVE, "6"])
        + _game("g4", D3, [*FIVE, "7"])
    )
    result = observed_unit(appearances, raw)
    assert result["team_games"] == 4 and result["verified_games"] == 3
    assert result["unknown_games"] == 1 and result["unit_games"] == 3
    positions = {row["player_id"]: row["position"] for row in result["unit_players"]}
    assert positions == {"1": "G", "2": "G", "3": "F", "4": "F", "5": "C"}
    players = {row["player_id"]: row for row in result["players"]}
    assert players["6"] == {
        "player_id": "6",
        "starts": 0,
        "bench_appearances": 3,
        "unknown_appearances": 0,
    }
    assert players["7"]["starts"] is None and players["7"]["unknown_appearances"] == 1


def test_a_tie_picks_the_most_recent_unit() -> None:
    other = ["1", "2", "3", "4", "6"]
    raw = {("g1", p): "G" for p in FIVE} | {("g2", p): "G" for p in other}
    result = observed_unit(_game("g1", D1, FIVE) + _game("g2", D2, other), raw)
    assert result["unit_ties"] == 2
    assert [row["player_id"] for row in result["unit_players"]] == other


def test_a_game_without_exactly_five_starters_is_unknown() -> None:
    raw = {("g1", p): "G" for p in FIVE[:4]} | {("g1", "5"): ""}
    result = observed_unit(_game("g1", D1, FIVE), raw)
    assert result["verified_games"] == 0 and result["unit_players"] == []
