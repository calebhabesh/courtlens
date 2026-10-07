"""Unit tests for capability-driven season discovery and expected empty coverage."""

from pathlib import Path
from unittest.mock import MagicMock

import httpx

from courtlens.ingestion.workbench_source_config import (
    ADMITTED_SEASONS,
    canonical_season_name,
    discover_season_capability,
    get_season_config,
    list_supported_seasons,
)


def test_canonical_season_naming() -> None:
    assert canonical_season_name(2001) == "2000-01"
    assert canonical_season_name(2010) == "2009-10"
    assert canonical_season_name(2024) == "2023-24"
    assert canonical_season_name(2026) == "2025-26"
    assert canonical_season_name(2027) == "2026-27"


def test_discover_historical_season_capability() -> None:
    # 2024 season (has local files in repo data/raw)
    cfg2024 = get_season_config(2024)
    assert cfg2024.ending_year == 2024
    assert cfg2024.canonical_season == "2023-24"
    assert cfg2024.has_player_boxscores is True
    assert cfg2024.has_team_boxscores is True
    assert cfg2024.boxscore_status == "available"
    assert cfg2024.expected_empty is False

    # 2026 season
    cfg2026 = get_season_config(2026)
    assert cfg2026.canonical_season == "2025-26"
    assert cfg2026.boxscore_status == "available"
    assert cfg2026.expected_empty is False


def test_discover_current_season_expected_empty_distinction() -> None:
    # 2027 season (schedule-only, future/in-progress)
    cfg2027 = get_season_config(2027)
    assert cfg2027.ending_year == 2027
    assert cfg2027.canonical_season == "2026-27"
    assert cfg2027.has_player_boxscores is False
    assert cfg2027.has_team_boxscores is False
    assert cfg2027.boxscore_status == "not_yet_observed"
    assert cfg2027.expected_empty is True
    # Schedule JSON is present in data/raw
    assert cfg2027.has_raw_schedule_json is True
    assert cfg2027.schedule_status == "available"


def test_discover_season_with_remote_probe(tmp_path: Path) -> None:
    # Mock client returning 200 for available asset
    mock_client_ok = MagicMock(spec=httpx.Client)
    mock_resp_ok = MagicMock()
    mock_resp_ok.status_code = 200
    mock_client_ok.head.return_value = mock_resp_ok

    cfg_ok = discover_season_capability(2015, raw_root=tmp_path, client=mock_client_ok)
    assert cfg_ok.boxscore_status == "available"
    assert cfg_ok.has_player_boxscores is True

    # Mock client returning 404 for unobserved season
    mock_client_404 = MagicMock(spec=httpx.Client)
    mock_resp_404 = MagicMock()
    mock_resp_404.status_code = 404
    mock_client_404.head.return_value = mock_resp_404

    cfg_404 = discover_season_capability(2015, raw_root=tmp_path, client=mock_client_404)
    assert cfg_404.boxscore_status == "not_yet_observed"
    assert cfg_404.has_player_boxscores is False

    # Mock client returning 403 for blocked source
    mock_client_403 = MagicMock(spec=httpx.Client)
    mock_resp_403 = MagicMock()
    mock_resp_403.status_code = 403
    mock_client_403.head.return_value = mock_resp_403

    cfg_403 = discover_season_capability(2015, raw_root=tmp_path, client=mock_client_403)
    assert cfg_403.boxscore_status == "source_blocked"


def test_list_supported_seasons_range() -> None:
    seasons = list_supported_seasons(start_year=2001, end_year=2027)
    assert len(seasons) == 27
    assert seasons[0].canonical_season == "2000-01"
    assert seasons[-1].canonical_season == "2026-27"


def test_admitted_seasons_mapping_compatibility() -> None:
    assert 2026 in ADMITTED_SEASONS
    assert 2027 in ADMITTED_SEASONS
    assert 2005 in ADMITTED_SEASONS
    assert 1990 not in ADMITTED_SEASONS

    cfg = ADMITTED_SEASONS[2024]
    assert cfg.canonical_season == "2023-24"

    cfg_get = ADMITTED_SEASONS.get(2027)
    assert cfg_get is not None
    assert cfg_get.expected_empty is True
