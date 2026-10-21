"""Player Twins view (alignment row 17) over the sealed pbpstats season-totals bundle."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import HTTPException

from courtlens.domain.player_twins import (
    BASE_POSSESSIONS,
    DIMENSIONS,
    MATCH_SCALE,
    MIN_ATTEMPTS,
    MIN_OVERLAP,
    Match,
    Mode,
    Profile,
    SeasonTable,
    compare,
    nearest,
    season_table,
)
from courtlens.services.shot_zones import ATTRIBUTION, load_shot_zones

POOLS = ("same", "all")
DEFAULT_MIN_POSSESSIONS = 1000

_tables: dict[tuple[str, Mode], dict[str, SeasonTable]] = {}


def tables(bundle: dict[str, Any], mode: Mode) -> dict[str, SeasonTable]:
    """Every season's standardized profiles, built once per bundle and mode."""
    key = (str(bundle["sealed_at"]), mode)
    if key not in _tables:
        if len(_tables) > 4:
            _tables.clear()
        _tables[key] = {
            season: season_table(mode, season, entry["players"])
            for season, entry in sorted(bundle["seasons"].items())
        }
    return _tables[key]


def _profile(profile: Profile, table: SeasonTable) -> dict[str, Any]:
    return {
        **{k: v for k, v in asdict(profile).items() if k not in ("values", "relative", "z")},
        "dims": {
            key: {
                "value": profile.values[key],
                "league": table.league[key],
                "relative": profile.relative[key],
                "z": profile.z[key],
            }
            for key in profile.values
        },
    }


def _match(rank: int, match: Match) -> dict[str, Any]:
    p = match.profile
    return {
        "rank": rank,
        "player_id": p.player_id,
        "name": p.name,
        "season": p.season,
        "team": p.team,
        "teams": p.teams,
        "off_poss": p.off_poss,
        "match": match.match,
        "distance": match.distance,
        "overlap": match.overlap,
        "relative": p.relative,
        "gaps": match.gaps,
    }


def player_twins_view(
    *,
    mode: Mode = "shot",
    season: str | None = None,
    player_id: str | None = None,
    pool: str = "all",
    from_season: str | None = None,
    to_season: str | None = None,
    min_possessions: int = DEFAULT_MIN_POSSESSIONS,
    exclude_own: bool = False,
    versus: str | None = None,
    limit: int = 12,
) -> dict[str, Any]:
    bundle = load_shot_zones()
    if bundle is None:
        raise HTTPException(status_code=503, detail="Player Twins data has not been acquired")
    by_season = tables(bundle, mode)
    seasons = sorted(by_season)
    season = season if season in by_season else seasons[-1]
    table = by_season[season]
    focus_rule = None
    if player_id not in table.profiles:
        # A season the player didn't play falls back to the season's busiest player, and says so.
        missing = next(
            (s.profiles[player_id].name for s in by_season.values() if player_id in s.profiles),
            None,
        )
        player_id = max(table.profiles.values(), key=lambda p: (p.off_poss, p.player_id)).player_id
        focus_rule = f"most offensive possessions in {season}" + (
            f" ({missing} has no {season} season)" if missing else ""
        )
    target = table.profiles[player_id]
    if pool == "same":
        span = [season]
    else:
        low = from_season if from_season in by_season else seasons[0]
        high = to_season if to_season in by_season else seasons[-1]
        low, high = min(low, high), max(low, high)
        span = [s for s in seasons if low <= s <= high]
    candidates = [p for s in span for p in by_season[s].profiles.values()]
    matches = nearest(target, candidates, min_possessions=min_possessions, exclude_own=exclude_own)
    other = None
    if versus and ":" in versus:
        other_id, other_season = versus.split(":", 1)
        other_profile = by_season.get(other_season, table).profiles.get(other_id)
        if other_profile is not None and other_season in by_season:
            other = (other_profile, compare(target, other_profile))
    if other is None and matches:
        other = (matches[0].profile, matches[0])
    ranks = {(m.profile.player_id, m.profile.season): i for i, m in enumerate(matches, 1)}
    twin = None
    if other is not None:
        profile, found = other
        twin = {
            **_profile(profile, by_season[profile.season]),
            "rank": ranks.get((profile.player_id, profile.season)),
            "match": found.match if found else None,
            "overlap": found.overlap if found else None,
        }
    return {
        "mode": mode,
        "season": season,
        "seasons": seasons,
        "pool": {
            "scope": pool,
            "from_season": span[0],
            "to_season": span[-1],
            "min_possessions": min_possessions,
            "exclude_own": exclude_own,
            "candidates": len(matches),
        },
        "focus_rule": focus_rule,
        "player": _profile(target, table),
        "twin": twin,
        "matches": [_match(i, m) for i, m in enumerate(matches[:limit], 1)],
        "dimensions": [
            {
                "key": d.key,
                "group": d.group,
                "label": d.label,
                "kind": d.kind,
                "description": d.description,
            }
            for d in DIMENSIONS[mode]
        ],
        "roster": sorted(
            (
                {"player_id": p.player_id, "name": p.name, "team": p.team, "off_poss": p.off_poss}
                for p in table.profiles.values()
            ),
            key=lambda row: (-row["off_poss"], row["name"]),
        ),
        "method": {
            "base_possessions": BASE_POSSESSIONS,
            "min_attempts": MIN_ATTEMPTS,
            "min_overlap": MIN_OVERLAP,
            "match_scale": MATCH_SCALE,
        },
        "source": ATTRIBUTION,
    }
