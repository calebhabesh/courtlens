"""Configuration and capability discovery for SportsDataverse datasets and schedules."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final

import httpx

from courtload.config import get_settings


@dataclass(frozen=True)
class SeasonConfig:
    ending_year: int
    canonical_season: str
    has_player_boxscores: bool = True
    has_team_boxscores: bool = True
    has_schedule_csv: bool = True
    has_raw_schedule_json: bool = False
    has_pbp: bool = False
    has_possessions: bool = False
    has_lineups: bool = False
    has_shots: bool = False
    has_matchups: bool = False
    boxscore_status: str = "available"  # available, partial, not_yet_observed, source_blocked
    schedule_status: str = "available"  # available, partial, not_yet_observed, source_blocked
    pbp_status: str = "not_yet_observed"
    possessions_status: str = "not_yet_observed"
    lineups_status: str = "not_yet_observed"
    shots_status: str = "not_yet_observed"
    matchups_status: str = "not_yet_observed"
    expected_empty: bool = False  # True for future scheduled games with no outcomes yet
    source_freshness: str | None = None


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


def draft_combine_url(ending_year: int) -> str:
    return f"{SDV_BASE_URL}/nba_stats_draft_combine/draft_combine_player_anthro_{ending_year}.csv"


def rosters_url(ending_year: int) -> str:
    return f"{SDV_BASE_URL}/nba_stats_rosters/rosters_{ending_year}.csv"


def pbp_url(ending_year: int) -> str:
    return f"{SDV_BASE_URL}/nba_stats_pbp/nba_play_by_play_{ending_year}.csv.gz"


def possessions_url(ending_year: int) -> str:
    return f"{SDV_BASE_URL}/nba_stats_possessions/nba_possessions_{ending_year}.csv.gz"


def lineups_url(ending_year: int) -> str:
    return f"{SDV_BASE_URL}/nba_stats_game_lineups/nba_lineups_{ending_year}.csv.gz"


def shots_url(ending_year: int) -> str:
    return f"{SDV_BASE_URL}/nba_stats_shots/shots_{ending_year}.csv"


def matchups_url(ending_year: int) -> str:
    return f"{SDV_BASE_URL}/nba_stats_game_matchups/game_matchups_{ending_year}.csv"


def canonical_season_name(ending_year: int) -> str:
    """Derive canonical season string ('YYYY-YY') from ending year."""
    start_year = ending_year - 1
    return f"{start_year}-{str(ending_year)[-2:]}"


def discover_season_capability(
    ending_year: int,
    raw_root: Path | None = None,
    client: httpx.Client | None = None,
) -> SeasonConfig:
    """Discover season capabilities based on available local assets or upstream availability.

    Replaces hardcoded disabled-season source flags with capability-driven discovery.
    Distinguishes expected empty coverage (e.g. 2026-27 upcoming schedule with no box scores yet)
    from observed daily changes.
    """
    canonical = canonical_season_name(ending_year)
    root = raw_root or get_settings().raw_store_path
    season_dir = root / f"sportsdataverse_{ending_year}"

    has_p_box = False
    has_t_box = False
    has_sched_csv = False
    has_raw_sched = False
    has_pbp_file = False
    has_poss_file = False
    has_lineups_file = False
    has_shots_file = False
    has_matchups_file = False
    expected_empty = False
    box_status = "available"
    sched_status = "available"
    pbp_stat = "not_yet_observed"
    poss_stat = "not_yet_observed"
    lineups_stat = "not_yet_observed"
    shots_stat = "not_yet_observed"
    matchups_stat = "not_yet_observed"
    freshness = None

    # Check local files first if season_dir exists
    if season_dir.exists():
        p_file = season_dir / f"player_boxscores_{ending_year}.csv"
        t_file = season_dir / f"team_boxscores_{ending_year}.csv"
        s_csv_file = season_dir / f"nba_schedule_{ending_year}.csv.gz"
        s_json_file = season_dir / f"schedule_{ending_year}.json"
        pbp_f = season_dir / f"nba_play_by_play_{ending_year}.csv.gz"
        poss_f = season_dir / f"nba_possessions_{ending_year}.csv.gz"
        lineups_f = season_dir / f"nba_lineups_{ending_year}.csv.gz"
        shots_f = season_dir / f"shots_{ending_year}.csv"
        matchups_f = season_dir / f"game_matchups_{ending_year}.csv"

        has_p_box = p_file.exists() and p_file.stat().st_size > 0
        has_t_box = t_file.exists() and t_file.stat().st_size > 0
        has_sched_csv = s_csv_file.exists() and s_csv_file.stat().st_size > 0
        has_raw_sched = s_json_file.exists() and s_json_file.stat().st_size > 0
        has_pbp_file = pbp_f.exists() and pbp_f.stat().st_size > 0
        has_poss_file = poss_f.exists() and poss_f.stat().st_size > 0
        has_lineups_file = lineups_f.exists() and lineups_f.stat().st_size > 0
        has_shots_file = shots_f.exists() and shots_f.stat().st_size > 0
        has_matchups_file = matchups_f.exists() and matchups_f.stat().st_size > 0

        pbp_stat = "available" if has_pbp_file else "not_yet_observed"
        poss_stat = "available" if has_poss_file else "not_yet_observed"
        lineups_stat = "available" if has_lineups_file else "not_yet_observed"
        shots_stat = "available" if has_shots_file else "not_yet_observed"
        matchups_stat = "available" if has_matchups_file else "not_yet_observed"

        # Check manifest for freshness
        manifest_file = season_dir / "retrieval-manifest.json"
        if manifest_file.exists():
            import json

            try:
                m = json.loads(manifest_file.read_text(encoding="utf-8"))
                freshness = m.get("acquired_at_utc")
            except Exception:
                pass

    # If client is provided and local files are missing, probe remote
    if client is not None and not has_p_box:
        try:
            resp = client.head(player_boxscores_url(ending_year), timeout=5.0)
            if resp.status_code == 200:
                has_p_box = True
                has_t_box = True
                has_sched_csv = True
                box_status = "available"
            elif resp.status_code == 404:
                has_p_box = False
                has_t_box = False
                box_status = "not_yet_observed"
                expected_empty = True
            elif resp.status_code == 403:
                has_p_box = False
                has_t_box = False
                box_status = "source_blocked"
        except Exception:
            pass
    elif ending_year >= 2027:
        if not has_p_box and not has_t_box:
            expected_empty = True
            box_status = "not_yet_observed"
        sched_status = "available" if (has_raw_sched or has_sched_csv) else "partial"
    else:
        # Completed historical seasons (2001..2026)
        if not has_p_box and not has_t_box:
            has_p_box = True
            has_t_box = True
            has_sched_csv = True
            box_status = "available"

    return SeasonConfig(
        ending_year=ending_year,
        canonical_season=canonical,
        has_player_boxscores=has_p_box,
        has_team_boxscores=has_t_box,
        has_schedule_csv=has_sched_csv,
        has_raw_schedule_json=has_raw_sched,
        has_pbp=has_pbp_file,
        has_possessions=has_poss_file,
        has_lineups=has_lineups_file,
        has_shots=has_shots_file,
        has_matchups=has_matchups_file,
        boxscore_status=box_status,
        schedule_status=sched_status,
        pbp_status=pbp_stat,
        possessions_status=poss_stat,
        lineups_status=lineups_stat,
        shots_status=shots_stat,
        matchups_status=matchups_stat,
        expected_empty=expected_empty,
        source_freshness=freshness,
    )


def get_season_config(ending_year: int, raw_root: Path | None = None) -> SeasonConfig:
    """Retrieve SeasonConfig for a given ending year using capability-driven discovery."""
    return discover_season_capability(ending_year, raw_root=raw_root)


def list_supported_seasons(
    raw_root: Path | None = None,
    start_year: int = 2001,
    end_year: int = 2027,
) -> list[SeasonConfig]:
    """List all supported seasons from start_year (default 2001: 2000-01) to end_year."""
    return [get_season_config(y, raw_root=raw_root) for y in range(start_year, end_year + 1)]


# Retained dictionary interface for backwards compatibility across existing workbench jobs/imports.
class _AdmittedSeasonsMapping(dict[int, SeasonConfig]):
    """Dynamic mapping that resolves SeasonConfig via capability-driven discovery."""

    def __getitem__(self, key: int) -> SeasonConfig:
        return get_season_config(key)

    def get(self, key: int, default: SeasonConfig | None = None) -> SeasonConfig | None:  # type: ignore[override]
        try:
            return get_season_config(key)
        except Exception:
            return default

    def __contains__(self, key: object) -> bool:
        return isinstance(key, int) and 2000 <= key <= 2030


ADMITTED_SEASONS: Final[_AdmittedSeasonsMapping] = _AdmittedSeasonsMapping(
    {
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
            boxscore_status="not_yet_observed",
            expected_empty=True,
        ),
    }
)
