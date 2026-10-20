"""Source policy v3 registry (docs/design/source-policy-v3.md): any free source; cost excludes."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from courtlens.domain.context import CapabilityEntry, CapabilityStatus

POLICY_VERSION = "courtlens-source-policy-v3"
POLICY_DOC = "docs/design/source-policy-v3.md"
USER_AGENT = "CourtLens/2 (+https://github.com/calebhabesh/courtlens; non-commercial portfolio)"


@dataclass(frozen=True)
class AdmittedSource:
    key: str
    name: str
    host: str
    role: Literal["primary", "fallback", "secondary", "manual"]
    capabilities: tuple[str, ...]
    min_interval_seconds: float | None  # None: entered by hand, never fetched
    attribution: str


ADMITTED_SOURCES: tuple[AdmittedSource, ...] = (
    AdmittedSource(
        "nba_cdn",
        "NBA CDN static JSON",
        "cdn.nba.com",
        "primary",
        ("player_index", "rosters", "on_off", "shots"),
        3,
        "NBA.com",
    ),
    AdmittedSource(
        "nba_injury_report",
        "NBA official injury report",
        "ak-static.cms.nba.com",
        "primary",
        ("injuries",),
        3,
        "NBA official injury report",
    ),
    AdmittedSource(
        "hoopr_nba_stats_raw",
        "hoopR NBA Stats raw",
        "github.com/sportsdataverse/hoopR-nba-stats-raw",
        "primary",
        (
            "player_index",
            "rosters",
            "play_types",
            "tracking",
            "defensive_tracking",
            "matchups",
            "hustle",
            "lineups",
            "combine",
            "draft_metadata",
        ),
        1,
        "NBA Stats via SportsDataverse hoopR",
    ),
    AdmittedSource(
        "league_transactions",
        "Official NBA transactions (versioned operator import)",
        "nba.com",
        "manual",
        ("transactions",),
        None,
        "NBA",
    ),
    AdmittedSource(
        "shufinskiy_nba_data",
        "nba_data archive",
        "github.com/shufinskiy/nba_data",
        "fallback",
        ("play_types", "matchups", "shots", "on_off"),
        1,
        "NBA Stats via Sergey Shufinskiy nba_data (Apache-2.0)",
    ),
    AdmittedSource(
        "pbpstats",
        "pbpstats API",
        "api.pbpstats.com",
        "secondary",
        ("on_off", "lineups"),
        5,
        "pbpstats.com",
    ),
    AdmittedSource(
        "basketball_reference",
        "Basketball-Reference",
        "www.basketball-reference.com",
        "primary",
        ("contracts", "draft_metadata", "player_bio"),
        3,
        "Basketball-Reference.com",
    ),
    AdmittedSource(
        "spotrac",
        "Spotrac",
        "www.spotrac.com",
        "primary",
        ("contracts", "free_agency", "cap_thresholds"),
        5,
        "Spotrac",
    ),
    AdmittedSource(
        "hoopshype",
        "HoopsHype salaries",
        "hoopshype.com",
        "fallback",
        ("contracts",),
        5,
        "HoopsHype",
    ),
    AdmittedSource(
        "espn_injuries",
        "ESPN injuries",
        "site.api.espn.com",
        "secondary",
        ("injuries",),
        5,
        "ESPN",
    ),
    AdmittedSource(
        "espn_team_rosters",
        "ESPN team rosters",
        "site.api.espn.com",
        "secondary",
        ("rosters",),
        5,
        "ESPN",
    ),
    AdmittedSource(
        "wikipedia_transactions",
        "Wikipedia NBA season transactions",
        "en.wikipedia.org",
        "secondary",
        ("transactions", "free_agency"),
        5,
        "Wikipedia (CC BY-SA 4.0)",
    ),
    AdmittedSource(
        "darko",
        "DARKO Daily Plus-Minus",
        "www.darko.app",
        "secondary",
        ("external_impact",),
        5,
        "DARKO (darko.app, Kostya Medvedovsky)",
    ),
    AdmittedSource(
        "nba_free_agent_tracker",
        "NBA.com free-agent tracker",
        "www.nba.com",
        "primary",
        ("free_agency",),
        3,
        "NBA.com",
    ),
    AdmittedSource(
        "league_cap_release",
        "Official league salary cap release",
        "nba.com",
        "manual",
        ("cap_thresholds",),
        None,
        "NBA",
    ),
)

# Admitted but no ingestion exists yet (PC05/PC07). Capabilities with existing data
# (shots, on/off, matchups, contracts, draft) are declared from measured coverage instead.
NOT_YET_INGESTED: tuple[str, ...] = (
    "player_index",
    "rosters",
    "transactions",
    "injuries",
    "play_types",
    "tracking",
    "defensive_tracking",
    "hustle",
    "combine",
)


def sources_for(capability: str) -> list[AdmittedSource]:
    return [s for s in ADMITTED_SOURCES if capability in s.capabilities]


def pending_capabilities() -> dict[str, CapabilityEntry]:
    """Admitted, not yet observed. Never `source_blocked`: the policy no longer blocks them."""
    entries = {}
    for name in NOT_YET_INGESTED:
        names = ", ".join(s.name for s in sources_for(name))
        entries[name] = CapabilityEntry(
            name=name,
            status=CapabilityStatus.NOT_YET_OBSERVED,
            limitations=[f"Source admitted ({names}); not yet ingested in this release."],
        )
    return entries
