"""Versioned metric catalog, definitions, and canonical formulas for CourtLoad research."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

METRIC_CATALOG_VERSION = "v1"

SUPPORTED_PHASES = [
    "regular_season",
    "preseason",
    "playoffs",
    "play_in",
    "cup_final",
    "summer_league",
]


@dataclass(frozen=True)
class MetricDefinition:
    """Canonical definition of a research metric."""

    key: str
    version: str
    display_name: str
    short_name: str
    category: str
    unit: str
    formula: str
    denominator: str | None
    phase_scope: list[str]
    default_sort_direction: str
    limitations: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "version": self.version,
            "display_name": self.display_name,
            "short_name": self.short_name,
            "category": self.category,
            "unit": self.unit,
            "formula": self.formula,
            "denominator": self.denominator,
            "phase_scope": list(self.phase_scope),
            "default_sort_direction": self.default_sort_direction,
            "limitations": list(self.limitations),
        }


METRIC_DEFINITIONS: list[MetricDefinition] = [
    MetricDefinition(
        key="gp",
        version=METRIC_CATALOG_VERSION,
        display_name="Games Played",
        short_name="GP",
        category="participation",
        unit="games",
        formula="count(appearance == 'appeared')",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Only includes confirmed active appearances with recorded minutes."],
    ),
    MetricDefinition(
        key="min",
        version=METRIC_CATALOG_VERSION,
        display_name="Total Minutes",
        short_name="MIN",
        category="participation",
        unit="minutes",
        formula="sum(minutes_seconds / 60)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Parsed from official boxscore minutes."],
    ),
    MetricDefinition(
        key="min_per_game",
        version=METRIC_CATALOG_VERSION,
        display_name="Minutes Per Game",
        short_name="MPG",
        category="participation",
        unit="minutes",
        formula="sum(minutes_seconds / 60) / gp",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Requires at least 1 confirmed appearance."],
    ),
    MetricDefinition(
        key="pts",
        version=METRIC_CATALOG_VERSION,
        display_name="Total Points",
        short_name="PTS",
        category="scoring",
        unit="points",
        formula="sum(points)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Derived from 2*(FGM-3PM) + 3*3PM + FTM."],
    ),
    MetricDefinition(
        key="pts_per_game",
        version=METRIC_CATALOG_VERSION,
        display_name="Points Per Game",
        short_name="PPG",
        category="scoring",
        unit="points",
        formula="sum(points) / gp",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Averages over confirmed appearances."],
    ),
    MetricDefinition(
        key="oreb",
        version=METRIC_CATALOG_VERSION,
        display_name="Offensive Rebounds",
        short_name="OREB",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_offensive)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Individual player offensive rebounds."],
    ),
    MetricDefinition(
        key="oreb_per_game",
        version=METRIC_CATALOG_VERSION,
        display_name="Offensive Rebounds Per Game",
        short_name="ORPG",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_offensive) / gp",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Averages over confirmed appearances."],
    ),
    MetricDefinition(
        key="dreb",
        version=METRIC_CATALOG_VERSION,
        display_name="Defensive Rebounds",
        short_name="DREB",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_defensive)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Individual player defensive rebounds."],
    ),
    MetricDefinition(
        key="dreb_per_game",
        version=METRIC_CATALOG_VERSION,
        display_name="Defensive Rebounds Per Game",
        short_name="DRPG",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_defensive) / gp",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Averages over confirmed appearances."],
    ),
    MetricDefinition(
        key="reb",
        version=METRIC_CATALOG_VERSION,
        display_name="Total Rebounds",
        short_name="REB",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_total)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Team rebounds not included in player totals."],
    ),
    MetricDefinition(
        key="reb_per_game",
        version=METRIC_CATALOG_VERSION,
        display_name="Rebounds Per Game",
        short_name="RPG",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_total) / gp",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Averages over confirmed appearances."],
    ),
    MetricDefinition(
        key="ast",
        version=METRIC_CATALOG_VERSION,
        display_name="Total Assists",
        short_name="AST",
        category="playmaking",
        unit="assists",
        formula="sum(assists)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Standard boxscore assist counts."],
    ),
    MetricDefinition(
        key="ast_per_game",
        version=METRIC_CATALOG_VERSION,
        display_name="Assists Per Game",
        short_name="APG",
        category="playmaking",
        unit="assists",
        formula="sum(assists) / gp",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Averages over confirmed appearances."],
    ),
    MetricDefinition(
        key="stl",
        version=METRIC_CATALOG_VERSION,
        display_name="Total Steals",
        short_name="STL",
        category="defense",
        unit="steals",
        formula="sum(steals)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive boxscore steals; does not measure defensive positioning."],
    ),
    MetricDefinition(
        key="stl_per_game",
        version=METRIC_CATALOG_VERSION,
        display_name="Steals Per Game",
        short_name="SPG",
        category="defense",
        unit="steals",
        formula="sum(steals) / gp",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive boxscore steals."],
    ),
    MetricDefinition(
        key="blk",
        version=METRIC_CATALOG_VERSION,
        display_name="Total Blocks",
        short_name="BLK",
        category="defense",
        unit="blocks",
        formula="sum(blocks)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive boxscore blocks; does not measure rim deterrence."],
    ),
    MetricDefinition(
        key="blk_per_game",
        version=METRIC_CATALOG_VERSION,
        display_name="Blocks Per Game",
        short_name="BPG",
        category="defense",
        unit="blocks",
        formula="sum(blocks) / gp",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive boxscore blocks."],
    ),
    MetricDefinition(
        key="tov",
        version=METRIC_CATALOG_VERSION,
        display_name="Total Turnovers",
        short_name="TOV",
        category="playmaking",
        unit="turnovers",
        formula="sum(turnovers)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="asc",
        limitations=["Player-charged turnovers; default sort is ascending."],
    ),
    MetricDefinition(
        key="tov_per_game",
        version=METRIC_CATALOG_VERSION,
        display_name="Turnovers Per Game",
        short_name="TPG",
        category="playmaking",
        unit="turnovers",
        formula="sum(turnovers) / gp",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="asc",
        limitations=["Default sort is ascending."],
    ),
    MetricDefinition(
        key="pf",
        version=METRIC_CATALOG_VERSION,
        display_name="Personal Fouls",
        short_name="PF",
        category="defense",
        unit="fouls",
        formula="sum(fouls_personal)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="asc",
        limitations=["Player personal fouls; default sort is ascending."],
    ),
    MetricDefinition(
        key="pf_per_game",
        version=METRIC_CATALOG_VERSION,
        display_name="Personal Fouls Per Game",
        short_name="PFPG",
        category="defense",
        unit="fouls",
        formula="sum(fouls_personal) / gp",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="asc",
        limitations=["Default sort is ascending."],
    ),
    MetricDefinition(
        key="fgm",
        version=METRIC_CATALOG_VERSION,
        display_name="Field Goals Made",
        short_name="FGM",
        category="efficiency",
        unit="shots",
        formula="sum(field_goals_made)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Includes 2PT and 3PT field goals."],
    ),
    MetricDefinition(
        key="fga",
        version=METRIC_CATALOG_VERSION,
        display_name="Field Goals Attempted",
        short_name="FGA",
        category="efficiency",
        unit="shots",
        formula="sum(field_goals_attempted)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Includes 2PT and 3PT field goal attempts."],
    ),
    MetricDefinition(
        key="fg_pct",
        version=METRIC_CATALOG_VERSION,
        display_name="Field Goal Percentage",
        short_name="FG%",
        category="efficiency",
        unit="percentage",
        formula="sum(field_goals_made) / sum(field_goals_attempted)",
        denominator="fga",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Null when 0 attempts are recorded across the window."],
    ),
    MetricDefinition(
        key="fg3m",
        version=METRIC_CATALOG_VERSION,
        display_name="Three-Pointers Made",
        short_name="3PM",
        category="efficiency",
        unit="shots",
        formula="sum(three_pointers_made)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Three-point field goals made."],
    ),
    MetricDefinition(
        key="fg3a",
        version=METRIC_CATALOG_VERSION,
        display_name="Three-Pointers Attempted",
        short_name="3PA",
        category="efficiency",
        unit="shots",
        formula="sum(three_pointers_attempted)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Three-point field goal attempts."],
    ),
    MetricDefinition(
        key="fg3_pct",
        version=METRIC_CATALOG_VERSION,
        display_name="Three-Point Percentage",
        short_name="3P%",
        category="efficiency",
        unit="percentage",
        formula="sum(three_pointers_made) / sum(three_pointers_attempted)",
        denominator="fg3a",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Null when 0 attempts are recorded across the window."],
    ),
    MetricDefinition(
        key="ftm",
        version=METRIC_CATALOG_VERSION,
        display_name="Free Throws Made",
        short_name="FTM",
        category="efficiency",
        unit="shots",
        formula="sum(free_throws_made)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Free throws made."],
    ),
    MetricDefinition(
        key="fta",
        version=METRIC_CATALOG_VERSION,
        display_name="Free Throws Attempted",
        short_name="FTA",
        category="efficiency",
        unit="shots",
        formula="sum(free_throws_attempted)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Free throw attempts."],
    ),
    MetricDefinition(
        key="ft_pct",
        version=METRIC_CATALOG_VERSION,
        display_name="Free Throw Percentage",
        short_name="FT%",
        category="efficiency",
        unit="percentage",
        formula="sum(free_throws_made) / sum(free_throws_attempted)",
        denominator="fta",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Null when 0 attempts are recorded across the window."],
    ),
    MetricDefinition(
        key="pts_per_36",
        version=METRIC_CATALOG_VERSION,
        display_name="Points Per 36 Minutes",
        short_name="PTS/36",
        category="rates",
        unit="rate",
        formula="(sum(points) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=[
            "Descriptive rate normalization, not expected output at a projected workload.",
            "Requires positive minutes in sample.",
        ],
    ),
    MetricDefinition(
        key="reb_per_36",
        version=METRIC_CATALOG_VERSION,
        display_name="Rebounds Per 36 Minutes",
        short_name="REB/36",
        category="rates",
        unit="rate",
        formula="(sum(rebounds_total) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive rate normalization."],
    ),
    MetricDefinition(
        key="ast_per_36",
        version=METRIC_CATALOG_VERSION,
        display_name="Assists Per 36 Minutes",
        short_name="AST/36",
        category="rates",
        unit="rate",
        formula="(sum(assists) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive rate normalization."],
    ),
    MetricDefinition(
        key="stl_per_36",
        version=METRIC_CATALOG_VERSION,
        display_name="Steals Per 36 Minutes",
        short_name="STL/36",
        category="rates",
        unit="rate",
        formula="(sum(steals) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive rate normalization."],
    ),
    MetricDefinition(
        key="blk_per_36",
        version=METRIC_CATALOG_VERSION,
        display_name="Blocks Per 36 Minutes",
        short_name="BLK/36",
        category="rates",
        unit="rate",
        formula="(sum(blocks) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive rate normalization."],
    ),
    MetricDefinition(
        key="legacy_fantasy_score",
        version=METRIC_CATALOG_VERSION,
        display_name="Legacy Fantasy Score",
        short_name="FS",
        category="legacy",
        unit="score",
        formula="PTS + 1.2*REB + 1.5*AST + 3.0*STL + 3.0*BLK - TOV",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Retained legacy fantasy scoring formula from earlier product scopes."],
    ),
    MetricDefinition(
        key="legacy_fantasy_score_per_game",
        version=METRIC_CATALOG_VERSION,
        display_name="Legacy Fantasy Score Per Game",
        short_name="FS/G",
        category="legacy",
        unit="score",
        formula="(PTS + 1.2*REB + 1.5*AST + 3.0*STL + 3.0*BLK - TOV) / gp",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Retained legacy fantasy scoring formula."],
    ),
]

METRIC_CATALOG: dict[str, MetricDefinition] = {defn.key: defn for defn in METRIC_DEFINITIONS}


def get_metric_definition(key: str) -> MetricDefinition:
    """Retrieve definition for a registered metric key."""
    if key not in METRIC_CATALOG:
        valid_keys = ", ".join(sorted(METRIC_CATALOG.keys()))
        raise KeyError(f"unsupported metric '{key}'; valid metrics are: {valid_keys}")
    return METRIC_CATALOG[key]


def list_metric_definitions() -> list[MetricDefinition]:
    """List all registered metric definitions."""
    return list(METRIC_DEFINITIONS)


def validate_metric_keys(keys: Iterable[str]) -> None:
    """Validate that all metric keys exist in the catalog; raise ValueError if not."""
    for key in keys:
        if key not in METRIC_CATALOG:
            valid_keys = ", ".join(sorted(METRIC_CATALOG.keys()))
            raise ValueError(f"unsupported metric '{key}'; valid metrics are: {valid_keys}")


def compute_legacy_fantasy_score(stats: dict[str, Any]) -> float | None:
    """Compute legacy fantasy score from individual game stats."""
    pts = stats.get("points")
    reb = stats.get("rebounds_total")
    ast = stats.get("assists")
    stl = stats.get("steals")
    blk = stats.get("blocks")
    tov = stats.get("turnovers")
    if pts is None or reb is None or ast is None or stl is None or blk is None or tov is None:
        return None
    return (
        float(pts)
        + 1.2 * float(reb)
        + 1.5 * float(ast)
        + 3.0 * float(stl)
        + 3.0 * float(blk)
        - float(tov)
    )


def compute_metrics(games: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, int]]:
    """Compute all catalog metrics for a list of game records.

    Returns:
        (metrics_dict, sample_sizes_dict)
    """
    appeared_games = [g for g in games if g.get("appearance") == "appeared"]
    gp = len(appeared_games)

    total_seconds = sum(
        g.get("minutes_seconds") or 0
        for g in appeared_games
        if g.get("minutes_seconds") is not None
    )
    total_min = round(total_seconds / 60.0, 1)
    min_per_game = round(total_min / gp, 1) if gp > 0 else None

    # Track sums and counts
    sums: dict[str, int] = {
        "points": 0,
        "rebounds_offensive": 0,
        "rebounds_defensive": 0,
        "rebounds_total": 0,
        "assists": 0,
        "steals": 0,
        "blocks": 0,
        "turnovers": 0,
        "fouls_personal": 0,
        "field_goals_made": 0,
        "field_goals_attempted": 0,
        "three_pointers_made": 0,
        "three_pointers_attempted": 0,
        "free_throws_made": 0,
        "free_throws_attempted": 0,
    }
    counts: dict[str, int] = {k: 0 for k in sums}
    legacy_scores: list[float] = []

    for g in appeared_games:
        for k in sums:
            val = g.get(k)
            if val is not None:
                sums[k] += int(val)
                counts[k] += 1
        lfs = compute_legacy_fantasy_score(g)
        if lfs is not None:
            legacy_scores.append(lfs)

    pts = sums["points"]
    oreb = sums["rebounds_offensive"]
    dreb = sums["rebounds_defensive"]
    reb = sums["rebounds_total"]
    ast = sums["assists"]
    stl = sums["steals"]
    blk = sums["blocks"]
    tov = sums["turnovers"]
    pf = sums["fouls_personal"]
    fgm = sums["field_goals_made"]
    fga = sums["field_goals_attempted"]
    fg3m = sums["three_pointers_made"]
    fg3a = sums["three_pointers_attempted"]
    ftm = sums["free_throws_made"]
    fta = sums["free_throws_attempted"]

    # Percentages
    fg_pct = round(fgm / fga, 4) if fga > 0 else None
    fg3_pct = round(fg3m / fg3a, 4) if fg3a > 0 else None
    ft_pct = round(ftm / fta, 4) if fta > 0 else None

    # Per 36 (only games with positive minutes)
    pts_per_36 = round((pts / total_min) * 36.0, 1) if total_min > 0 else None
    reb_per_36 = round((reb / total_min) * 36.0, 1) if total_min > 0 else None
    ast_per_36 = round((ast / total_min) * 36.0, 1) if total_min > 0 else None
    stl_per_36 = round((stl / total_min) * 36.0, 1) if total_min > 0 else None
    blk_per_36 = round((blk / total_min) * 36.0, 1) if total_min > 0 else None

    # Legacy scores
    legacy_total = round(sum(legacy_scores), 1) if legacy_scores else None
    legacy_per_game = round(sum(legacy_scores) / len(legacy_scores), 1) if legacy_scores else None

    metrics: dict[str, Any] = {
        "gp": gp,
        "min": total_min,
        "min_per_game": min_per_game,
        "pts": pts,
        "pts_per_game": round(pts / gp, 1) if gp > 0 else None,
        "oreb": oreb,
        "oreb_per_game": round(oreb / gp, 1) if gp > 0 else None,
        "dreb": dreb,
        "dreb_per_game": round(dreb / gp, 1) if gp > 0 else None,
        "reb": reb,
        "reb_per_game": round(reb / gp, 1) if gp > 0 else None,
        "ast": ast,
        "ast_per_game": round(ast / gp, 1) if gp > 0 else None,
        "stl": stl,
        "stl_per_game": round(stl / gp, 1) if gp > 0 else None,
        "blk": blk,
        "blk_per_game": round(blk / gp, 1) if gp > 0 else None,
        "tov": tov,
        "tov_per_game": round(tov / gp, 1) if gp > 0 else None,
        "pf": pf,
        "pf_per_game": round(pf / gp, 1) if gp > 0 else None,
        "fgm": fgm,
        "fga": fga,
        "fg_pct": fg_pct,
        "fg3m": fg3m,
        "fg3a": fg3a,
        "fg3_pct": fg3_pct,
        "ftm": ftm,
        "fta": fta,
        "ft_pct": ft_pct,
        "pts_per_36": pts_per_36,
        "reb_per_36": reb_per_36,
        "ast_per_36": ast_per_36,
        "stl_per_36": stl_per_36,
        "blk_per_36": blk_per_36,
        "legacy_fantasy_score": legacy_total,
        "legacy_fantasy_score_per_game": legacy_per_game,
    }

    sample_sizes: dict[str, int] = {
        "gp": gp,
        "min": len([g for g in appeared_games if g.get("minutes_seconds") is not None]),
        "min_per_game": gp,
        "pts": counts["points"],
        "pts_per_game": counts["points"],
        "oreb": counts["rebounds_offensive"],
        "oreb_per_game": counts["rebounds_offensive"],
        "dreb": counts["rebounds_defensive"],
        "dreb_per_game": counts["rebounds_defensive"],
        "reb": counts["rebounds_total"],
        "reb_per_game": counts["rebounds_total"],
        "ast": counts["assists"],
        "ast_per_game": counts["assists"],
        "stl": counts["steals"],
        "stl_per_game": counts["steals"],
        "blk": counts["blocks"],
        "blk_per_game": counts["blocks"],
        "tov": counts["turnovers"],
        "tov_per_game": counts["turnovers"],
        "pf": counts["fouls_personal"],
        "pf_per_game": counts["fouls_personal"],
        "fgm": counts["field_goals_made"],
        "fga": counts["field_goals_attempted"],
        "fg_pct": counts["field_goals_attempted"],
        "fg3m": counts["three_pointers_made"],
        "fg3a": counts["three_pointers_attempted"],
        "fg3_pct": counts["three_pointers_attempted"],
        "ftm": counts["free_throws_made"],
        "fta": counts["free_throws_attempted"],
        "ft_pct": counts["free_throws_attempted"],
        "pts_per_36": counts["points"],
        "reb_per_36": counts["rebounds_total"],
        "ast_per_36": counts["assists"],
        "stl_per_36": counts["steals"],
        "blk_per_36": counts["blocks"],
        "legacy_fantasy_score": len(legacy_scores),
        "legacy_fantasy_score_per_game": len(legacy_scores),
    }

    return metrics, sample_sizes
