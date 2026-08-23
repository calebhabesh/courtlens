import json
from pathlib import Path

from courtload.ingestion.schemas import ProviderGame


def test_recorded_game_contract_fixture_parses() -> None:
    payload = json.loads(Path("fixtures/provider/game.contract.json").read_text(encoding="utf-8"))
    game = ProviderGame.model_validate(payload["data"])

    assert game.id == 990001
    assert game.normalized_status_state == "final"
    assert game.home_team_id == 9901
