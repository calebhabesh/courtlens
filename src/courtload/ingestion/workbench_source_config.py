"""Configuration for SportsDataverse NBA Stats datasets and raw schedules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True)
class SeasonConfig:
    ending_year: int
    canonical_season: str
    has_player_boxscores: bool = True
    has_team_boxscores: bool = True
    has_schedule_csv: bool = True
    has_raw_schedule_json: bool = False


# Admitted completed seasons and upcoming schedule for the workbench and points-v1 experiment.
ADMITTED_SEASONS: Final[dict[int, SeasonConfig]] = {
    2022: SeasonConfig(ending_year=2022, canonical_season="2021-22"),
    2023: SeasonConfig(ending_year=2023, canonical_season="2022-23"),
    2024: SeasonConfig(ending_year=2024, canonical_season="2023-24"),
    2025: SeasonConfig(ending_year=2025, canonical_season="2024-25"),
    2026: SeasonConfig(ending_year=2026, canonical_season="2025-26"),
    2027: SeasonConfig(
        ending_year=2027,
        canonical_season="2026-27",
        has_player_boxscores=False,
        has_team_boxscores=False,
        has_schedule_csv=False,
        has_raw_schedule_json=True,
    ),
}

# URL templates for SportsDataverse releases and raw github assets.
SDV_BASE_URL: Final[str] = (
    "https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
)
RAW_SCHEDULE_BASE_URL: Final[str] = (
    "https://raw.githubusercontent.com/sportsdataverse/hoopR-nba-stats-raw/main/nba_stats/json/scheduleleaguev2"
)


def player_boxscores_url(ending_year: int) -> str:
    return f"{SDV_BASE_URL}/nba_stats_player_boxscores/player_boxscores_{ending_year}.csv"


def team_boxscores_url(ending_year: int) -> str:
    return f"{SDV_BASE_URL}/nba_stats_team_boxscores/team_boxscores_{ending_year}.csv"


def schedule_csv_url(ending_year: int) -> str:
    return f"{SDV_BASE_URL}/nba_stats_schedules/nba_schedule_{ending_year}.csv.gz"


def raw_schedule_json_url(ending_year: int) -> str:
    return f"{RAW_SCHEDULE_BASE_URL}/{ending_year}.json"


def canonical_season_name(ending_year: int) -> str:
    if ending_year in ADMITTED_SEASONS:
        return ADMITTED_SEASONS[ending_year].canonical_season
    return f"{ending_year - 1}-{str(ending_year)[-2:]}"
