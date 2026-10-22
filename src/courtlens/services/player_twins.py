"""Player Twins view (alignment row 17) over the sealed pbpstats season-totals bundle."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from courtlens.domain.player_twins import (
    BASE_POSSESSIONS,
    DIMENSIONS,
    MATCH_SCALE,
    MIN_ATTEMPTS,
    Index,
    Match,
    Mode,
    Profile,
    Ranking,
    SeasonTable,
    compare,
    min_overlap,
    next_season,
    projection,
    season_table,
)
from courtlens.services.position_estimates import load_position_store
from courtlens.services.shot_zones import ATTRIBUTION, load_shot_zones

POOLS = ("same", "all")
DEFAULT_MIN_POSSESSIONS = 1000
# A measure's weight: off, half, normal or double.
WEIGHT_STEPS = (0.0, 0.5, 1.0, 2.0)

_tables: dict[tuple[str, Mode], dict[str, SeasonTable]] = {}
_indexes: dict[tuple[str, Mode], Index] = {}


def parse_weights(mode: Mode, text_value: str | None) -> dict[str, float]:
    """'three_vol:2,ft_eff:0' -> weights for the mode's measures; unnamed ones stay 1."""
    keys = [dim.key for dim in DIMENSIONS[mode]]
    weights: dict[str, float] = {}
    for part in (text_value or "").split(","):
        if not part.strip():
            continue
        key, _, raw = part.partition(":")
        try:
            value = float(raw)
        except ValueError:
            value = -1.0
        if key not in keys or value not in WEIGHT_STEPS:
            raise HTTPException(status_code=422, detail=f"Unknown measure weight {part!r}")
        if value != 1.0:
            weights[key] = value
    if all(weights.get(key, 1.0) == 0 for key in keys):
        raise HTTPException(status_code=422, detail="At least one measure needs a weight")
    return weights


def listed_positions(session: Session) -> dict[str, str]:
    """NBA.com's listed position per player (G, F-C…), for seasons without an estimate."""
    rows = session.execute(
        text(
            "SELECT player_id, listed_position FROM analytics_marts.mart_player_bio "
            "WHERE COALESCE(listed_position, '') <> ''"
        )
    )
    return {str(pid): str(position) for pid, position in rows}


def tables(
    bundle: dict[str, Any], mode: Mode, listed: dict[str, str] | None = None
) -> dict[str, SeasonTable]:
    """Every season's standardized profiles with positions, built once per bundle and mode."""
    key = (str(bundle["sealed_at"]), mode)
    if key not in _tables:
        if len(_tables) > 6:
            _tables.clear()
            _indexes.clear()
        estimates = (load_position_store() or {}).get("seasons", {})
        built = {
            season: season_table(mode, season, entry["players"])
            for season, entry in sorted(bundle["seasons"].items())
        }
        for season, table in built.items():
            season_estimates = estimates.get(season, {})
            for profile in table.profiles.values():
                estimate = season_estimates.get(profile.player_id)
                if estimate:
                    profile.position, profile.position_basis = estimate["position"], "estimated"
                elif listed and profile.player_id in listed:
                    profile.position, profile.position_basis = listed[profile.player_id], "listed"
        _tables[key] = built
        _indexes[key] = Index(
            [p for table in built.values() for p in table.profiles.values()],
            [dim.key for dim in DIMENSIONS[mode]],
        )
    return _tables[key]


def _next(profile: Profile, by_season: dict[str, SeasonTable]) -> dict[str, Any]:
    """The player's following season as recorded, not a forecast. Missing is unknown: the
    season may be beyond the data, or the player has no row in it."""
    season = next_season(profile.season)
    if season not in by_season:
        return {"season": season, "status": "beyond_data"}
    after = by_season[season].profiles.get(profile.player_id)
    if after is None:
        return {"season": season, "status": "no_record"}

    def change(a: float | None, b: float | None) -> float | None:
        return None if a is None or b is None else b - a

    return {
        "season": season,
        "status": "recorded",
        "team": after.team,
        "games": after.games,
        "off_poss": after.off_poss,
        "pts_per_game": after.pts_per_game,
        "ts_pct": after.ts_pct,
        "pts_change": change(profile.pts_per_game, after.pts_per_game),
        "ts_change": change(profile.ts_pct, after.ts_pct),
        "relative": after.relative,
    }


def _profile(profile: Profile, table: SeasonTable) -> dict[str, Any]:
    return {
        **{k: v for k, v in asdict(profile).items() if k not in ("values", "relative", "z")},
        "dims": {
            key: {
                "value": profile.values[key],
                "league": table.league[key],
                "relative": profile.relative[key],
                "z": profile.z[key],
                "percentile": profile.percentile.get(key),
            }
            for key in profile.values
        },
    }


def _match(rank: int, match: Match, by_season: dict[str, SeasonTable]) -> dict[str, Any]:
    p = match.profile
    return {
        "next": _next(p, by_season),
        "rank": rank,
        "player_id": p.player_id,
        "name": p.name,
        "season": p.season,
        "team": p.team,
        "teams": p.teams,
        "position": p.position,
        "position_basis": p.position_basis,
        "off_poss": p.off_poss,
        "match": match.match,
        "distance": match.distance,
        "overlap": match.overlap,
        "relative": p.relative,
        "gaps": match.gaps,
    }


def player_index() -> dict[str, Any]:
    """Every player in the bundle with his first and last season and last team, for a search
    that reaches beyond the selected season."""
    bundle = load_shot_zones()
    if bundle is None:
        raise HTTPException(status_code=503, detail="Player Twins data has not been acquired")
    players: dict[str, dict[str, Any]] = {}
    for season, entry in sorted(bundle["seasons"].items()):
        for row in entry["players"]:
            pid = str(row["player_id"])
            teams = [str(t["tricode"]) for t in row.get("teams", []) if t.get("tricode")]
            found = players.setdefault(
                pid, {"player_id": pid, "first_season": season, "seasons": 0}
            )
            found |= {
                "name": str(row.get("name") or pid),
                "last_season": season,
                "last_team": teams[0] if teams else None,
                "seasons": found["seasons"] + 1,
            }
    return {"players": sorted(players.values(), key=lambda p: (p["name"], p["player_id"]))}


def player_twins_view(
    session: Session | None = None,
    *,
    mode: Mode = "shot",
    season: str | None = None,
    player_id: str | None = None,
    pool: str = "all",
    from_season: str | None = None,
    to_season: str | None = None,
    min_possessions: int = DEFAULT_MIN_POSSESSIONS,
    exclude_own: bool = False,
    by_position: bool = False,
    weights: str | None = None,
    versus: str | None = None,
    limit: int = 12,
) -> dict[str, Any]:
    bundle = load_shot_zones()
    if bundle is None:
        raise HTTPException(status_code=503, detail="Player Twins data has not been acquired")
    weighting = parse_weights(mode, weights)
    key = (str(bundle["sealed_at"]), mode)
    listed = listed_positions(session) if session is not None and key not in _tables else None
    by_season = tables(bundle, mode, listed)
    index = _indexes[key]
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

    def rank(profile: Profile, *, own: bool, within: list[str]) -> Ranking:
        return index.rank(
            profile,
            min_possessions=min_possessions,
            exclude_own=own,
            by_position=by_position,
            weights=weighting,
            seasons=within,
        )

    ranking = rank(target, own=exclude_own, within=span)
    matches = ranking.top(limit)
    other = None
    if versus and ":" in versus:
        other_id, other_season = versus.split(":", 1)
        other_profile = by_season.get(other_season, table).profiles.get(other_id)
        if other_profile is not None and other_season in by_season:
            other = (other_profile, compare(target, other_profile, weighting))
    if other is None and matches:
        other = (matches[0].profile, matches[0])
    twin = None
    if other is not None:
        profile, found = other
        twin = {
            **_profile(profile, by_season[profile.season]),
            "rank": ranking.rank_of(profile.player_id, profile.season),
            "match": found.match if found else None,
            "overlap": found.overlap if found else None,
            "next": _next(profile, by_season),
        }
    # Career strip: each of the player's seasons beside its nearest other player, same rules.
    career = []
    for career_season in seasons:
        own = by_season[career_season].profiles.get(player_id)
        if own is None:
            continue
        best = rank(own, own=True, within=[career_season] if pool == "same" else span).top(1)
        career.append(
            {
                "season": career_season,
                "team": own.team,
                "position": own.position,
                "off_poss": own.off_poss,
                "twin": {
                    "player_id": best[0].profile.player_id,
                    "name": best[0].profile.name,
                    "season": best[0].profile.season,
                    "team": best[0].profile.team,
                    "match": best[0].match,
                }
                if best
                else None,
            }
        )
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
            "by_position": by_position,
            "candidates": len(ranking),
        },
        "weights": weighting,
        "focus_rule": focus_rule,
        "player": {**_profile(target, table), "next": _next(target, by_season)},
        "twin": twin,
        "matches": [_match(i, m, by_season) for i, m in enumerate(matches, 1)],
        "career": career,
        "map": _map(table, index.keys, weighting, target, matches, min_possessions),
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
                {
                    "player_id": p.player_id,
                    "name": p.name,
                    "team": p.team,
                    "position": p.position,
                    "off_poss": p.off_poss,
                }
                for p in table.profiles.values()
            ),
            key=lambda row: (-row["off_poss"], row["name"]),
        ),
        "method": {
            "base_possessions": BASE_POSSESSIONS,
            "min_attempts": MIN_ATTEMPTS,
            "min_overlap": min_overlap(index.keys, weighting),
            "measures": sum(1 for k in index.keys if weighting.get(k, 1.0) > 0),
            "match_scale": MATCH_SCALE,
        },
        "source": ATTRIBUTION,
    }


def _map(
    table: SeasonTable,
    keys: list[str],
    weights: dict[str, float],
    target: Profile,
    matches: list[Match],
    min_possessions: int,
) -> dict[str, Any] | None:
    """The season's player-seasons on two axes fitted to its base pool; the shown twins (any
    season) are placed on the same axes."""
    base = [p for p in table.profiles.values() if p.off_poss >= BASE_POSSESSIONS]
    fitted = projection(base, keys, weights)
    if fitted is None:
        return None

    def point(profile: Profile) -> dict[str, Any]:
        x, y = fitted.at(profile)
        return {
            "player_id": profile.player_id,
            "name": profile.name,
            "season": profile.season,
            "team": profile.team,
            "position": profile.position,
            "x": x,
            "y": y,
        }

    return {
        "axes": [
            {
                "explained": fitted.explained[i],
                "loadings": [
                    {"key": key, "loading": loading}
                    for loading, key in sorted(
                        (
                            (float(fitted.axes[i][j]), key)
                            for j, key in enumerate(keys)
                            if weights.get(key, 1.0) > 0
                        ),
                        key=lambda pair: -abs(pair[0]),
                    )[:3]
                ],
            }
            for i in range(2)
        ],
        "points": [
            point(p)
            for p in sorted(table.profiles.values(), key=lambda p: p.player_id)
            if p.off_poss >= min_possessions and p.player_id != target.player_id
        ],
        "player": point(target),
        "twins": [{"rank": i, **point(m.profile)} for i, m in enumerate(matches, 1)],
    }
