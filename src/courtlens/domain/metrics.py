"""Versioned metric catalog, definitions, and canonical formulas for CourtLens research."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

METRIC_CATALOG_V1_VERSION = "v1"
METRIC_CATALOG_V2_VERSION = "v2"
METRIC_CATALOG_VERSION = METRIC_CATALOG_V2_VERSION

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
    """Canonical definition of a research metric with strict metadata and limitations."""

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
    required_fields: list[str] = field(default_factory=list)
    compatible_normalizations: list[str] = field(default_factory=list)
    aggregation_recipe: str = "sum"
    validity_definition: str = "valid non-null values"
    aliases: list[str] = field(default_factory=list)
    capability_requirement: str = "core_stats"
    classification: str = "observed"
    good_direction: str | None = None

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
            "required_fields": list(self.required_fields),
            "compatible_normalizations": list(self.compatible_normalizations),
            "aggregation_recipe": self.aggregation_recipe,
            "validity_definition": self.validity_definition,
            "aliases": list(self.aliases),
            "capability_requirement": self.capability_requirement,
            "classification": self.classification,
            "good_direction": self.good_direction,
        }


# --- Canonical Metric Definitions (v2) ---

ALL_NORMALIZATIONS = ["raw", "per_game", "per_36", "per_75", "per_100"]

METRIC_DEFINITIONS_V2: list[MetricDefinition] = [
    # Participation
    MetricDefinition(
        key="gp",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Games Played",
        short_name="GP",
        category="participation",
        unit="games",
        formula="count(appearance == 'appeared')",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Only includes confirmed active appearances with recorded minutes."],
        required_fields=["appearance"],
        compatible_normalizations=["raw"],
        aggregation_recipe="count",
        validity_definition="appearance == 'appeared'",
        capability_requirement="core_stats",
        classification="observed",
        good_direction=None,
    ),
    MetricDefinition(
        key="min",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Total Minutes",
        short_name="MIN",
        category="participation",
        unit="minutes",
        formula="sum(minutes_seconds / 60)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Parsed from official boxscore minutes. Null when no minutes recorded."],
        required_fields=["minutes_seconds"],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="sum",
        validity_definition="minutes_seconds is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction=None,
    ),
    MetricDefinition(
        key="min_per_game",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Minutes Per Game",
        short_name="MPG",
        category="participation",
        unit="minutes",
        formula="sum(minutes_seconds / 60) / gp",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Requires at least 1 confirmed appearance with recorded minutes."],
        required_fields=["minutes_seconds"],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="mean",
        validity_definition="gp > 0 and valid minutes",
        capability_requirement="core_stats",
        classification="observed",
        good_direction=None,
    ),
    # Scoring
    MetricDefinition(
        key="pts",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Total Points",
        short_name="PTS",
        category="scoring",
        unit="points",
        formula="sum(points)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Derived from official boxscore points. Null when unrecorded."],
        required_fields=["points"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="points is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="pts_per_game",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Points Per Game",
        short_name="PPG",
        category="scoring",
        unit="points",
        formula="sum(points) / valid_pts_games",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Averages strictly over games with valid recorded points."],
        required_fields=["points"],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="mean",
        validity_definition="valid_pts_games > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    # Rebounding
    MetricDefinition(
        key="oreb",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Offensive Rebounds",
        short_name="OREB",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_offensive)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Individual player offensive rebounds. Null when unrecorded."],
        required_fields=["rebounds_offensive"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="rebounds_offensive is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="oreb_per_game",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Offensive Rebounds Per Game",
        short_name="ORPG",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_offensive) / valid_oreb_games",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Averages over games with recorded offensive rebounds."],
        required_fields=["rebounds_offensive"],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="mean",
        validity_definition="valid_oreb_games > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="dreb",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Defensive Rebounds",
        short_name="DREB",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_defensive)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Individual player defensive rebounds. Null when unrecorded."],
        required_fields=["rebounds_defensive"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="rebounds_defensive is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="dreb_per_game",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Defensive Rebounds Per Game",
        short_name="DRPG",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_defensive) / valid_dreb_games",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Averages over games with recorded defensive rebounds."],
        required_fields=["rebounds_defensive"],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="mean",
        validity_definition="valid_dreb_games > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="reb",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Total Rebounds",
        short_name="REB",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_total)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Team rebounds not included in player totals. Null when unrecorded."],
        required_fields=["rebounds_total"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="rebounds_total is not null",
        aliases=["reb_total"],
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="reb_total",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Total Rebounds",
        short_name="REB",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_total)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Alias for 'reb' (Total Rebounds)."],
        required_fields=["rebounds_total"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="rebounds_total is not null",
        aliases=["reb"],
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="reb_per_game",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Rebounds Per Game",
        short_name="RPG",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_total) / valid_reb_games",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Averages over games with recorded total rebounds."],
        required_fields=["rebounds_total"],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="mean",
        validity_definition="valid_reb_games > 0",
        aliases=["reb_total_per_game"],
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="reb_total_per_game",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Rebounds Per Game",
        short_name="RPG",
        category="rebounding",
        unit="rebounds",
        formula="sum(rebounds_total) / valid_reb_games",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Alias for 'reb_per_game' (Rebounds Per Game)."],
        required_fields=["rebounds_total"],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="mean",
        validity_definition="valid_reb_games > 0",
        aliases=["reb_per_game"],
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    # Playmaking
    MetricDefinition(
        key="ast",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Total Assists",
        short_name="AST",
        category="playmaking",
        unit="assists",
        formula="sum(assists)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Standard boxscore assist counts. Null when unrecorded."],
        required_fields=["assists"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="assists is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="ast_per_game",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Assists Per Game",
        short_name="APG",
        category="playmaking",
        unit="assists",
        formula="sum(assists) / valid_ast_games",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Averages over games with recorded assists."],
        required_fields=["assists"],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="mean",
        validity_definition="valid_ast_games > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="tov",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Total Turnovers",
        short_name="TOV",
        category="playmaking",
        unit="turnovers",
        formula="sum(turnovers)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="asc",
        limitations=["Player-charged turnovers; default sort is ascending. Null when unrecorded."],
        required_fields=["turnovers"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="turnovers is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="low",
    ),
    MetricDefinition(
        key="tov_per_game",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Turnovers Per Game",
        short_name="TPG",
        category="playmaking",
        unit="turnovers",
        formula="sum(turnovers) / valid_tov_games",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="asc",
        limitations=["Averages over games with recorded turnovers."],
        required_fields=["turnovers"],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="mean",
        validity_definition="valid_tov_games > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="low",
    ),
    # Defense
    MetricDefinition(
        key="stl",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Total Steals",
        short_name="STL",
        category="defense",
        unit="steals",
        formula="sum(steals)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive boxscore steals; does not measure defensive positioning."],
        required_fields=["steals"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="steals is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="stl_per_game",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Steals Per Game",
        short_name="SPG",
        category="defense",
        unit="steals",
        formula="sum(steals) / valid_stl_games",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Averages over games with recorded steals."],
        required_fields=["steals"],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="mean",
        validity_definition="valid_stl_games > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="blk",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Total Blocks",
        short_name="BLK",
        category="defense",
        unit="blocks",
        formula="sum(blocks)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive boxscore blocks; does not measure rim deterrence."],
        required_fields=["blocks"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="blocks is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="blk_per_game",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Blocks Per Game",
        short_name="BPG",
        category="defense",
        unit="blocks",
        formula="sum(blocks) / valid_blk_games",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Averages over games with recorded blocks."],
        required_fields=["blocks"],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="mean",
        validity_definition="valid_blk_games > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="pf",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Personal Fouls",
        short_name="PF",
        category="defense",
        unit="fouls",
        formula="sum(fouls_personal)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="asc",
        limitations=["Player personal fouls; default sort is ascending."],
        required_fields=["fouls_personal"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="fouls_personal is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="low",
    ),
    MetricDefinition(
        key="pf_per_game",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Personal Fouls Per Game",
        short_name="PFPG",
        category="defense",
        unit="fouls",
        formula="sum(fouls_personal) / valid_pf_games",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="asc",
        limitations=["Averages over games with recorded fouls."],
        required_fields=["fouls_personal"],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="mean",
        validity_definition="valid_pf_games > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="low",
    ),
    # Efficiency & Shooting
    MetricDefinition(
        key="fgm",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Field Goals Made",
        short_name="FGM",
        category="efficiency",
        unit="shots",
        formula="sum(field_goals_made)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Includes 2PT and 3PT field goals."],
        required_fields=["field_goals_made"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="field_goals_made is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="fga",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Field Goals Attempted",
        short_name="FGA",
        category="efficiency",
        unit="shots",
        formula="sum(field_goals_attempted)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Includes 2PT and 3PT field goal attempts."],
        required_fields=["field_goals_attempted"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="field_goals_attempted is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction=None,
    ),
    MetricDefinition(
        key="fg_pct",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Field Goal Percentage",
        short_name="FG%",
        category="efficiency",
        unit="percentage",
        formula="sum(field_goals_made) / sum(field_goals_attempted)",
        denominator="fga",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Null when 0 attempts or no paired make/attempt records exist."],
        required_fields=["field_goals_made", "field_goals_attempted"],
        compatible_normalizations=["raw"],
        aggregation_recipe="ratio",
        validity_definition="paired make and attempt records; sum(fga) > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="fg3m",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Three-Pointers Made",
        short_name="3PM",
        category="efficiency",
        unit="shots",
        formula="sum(three_pointers_made)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Three-point field goals made."],
        required_fields=["three_pointers_made"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="three_pointers_made is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="fg3a",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Three-Pointers Attempted",
        short_name="3PA",
        category="efficiency",
        unit="shots",
        formula="sum(three_pointers_attempted)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Three-point field goal attempts."],
        required_fields=["three_pointers_attempted"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="three_pointers_attempted is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction=None,
    ),
    MetricDefinition(
        key="fg3_pct",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Three-Point Percentage",
        short_name="3P%",
        category="efficiency",
        unit="percentage",
        formula="sum(three_pointers_made) / sum(three_pointers_attempted)",
        denominator="fg3a",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Null when 0 attempts or no paired 3P make/attempt records exist."],
        required_fields=["three_pointers_made", "three_pointers_attempted"],
        compatible_normalizations=["raw"],
        aggregation_recipe="ratio",
        validity_definition="paired 3P make and attempt records; sum(fg3a) > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="ftm",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Free Throws Made",
        short_name="FTM",
        category="efficiency",
        unit="shots",
        formula="sum(free_throws_made)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Free throws made."],
        required_fields=["free_throws_made"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="free_throws_made is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="fta",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Free Throws Attempted",
        short_name="FTA",
        category="efficiency",
        unit="shots",
        formula="sum(free_throws_attempted)",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Free throw attempts."],
        required_fields=["free_throws_attempted"],
        compatible_normalizations=ALL_NORMALIZATIONS,
        aggregation_recipe="sum",
        validity_definition="free_throws_attempted is not null",
        capability_requirement="core_stats",
        classification="observed",
        good_direction=None,
    ),
    MetricDefinition(
        key="ft_pct",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Free Throw Percentage",
        short_name="FT%",
        category="efficiency",
        unit="percentage",
        formula="sum(free_throws_made) / sum(free_throws_attempted)",
        denominator="fta",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Null when 0 attempts or no paired FT make/attempt records exist."],
        required_fields=["free_throws_made", "free_throws_attempted"],
        compatible_normalizations=["raw"],
        aggregation_recipe="ratio",
        validity_definition="paired FT make and attempt records; sum(fta) > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="ts_pct",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="True Shooting Percentage",
        short_name="TS%",
        category="efficiency",
        unit="percentage",
        formula="sum(PTS) / (2 * (sum(FGA) + 0.44 * sum(FTA)))",
        denominator="2 * (fga + 0.44 * fta)",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=[
            "Conventional TS approximation using standard 0.44 free throw factor.",
            "Event-based true possessions are a distinct later metric.",
            "Requires jointly valid points, FGA, and FTA on the same game records.",
            "Null when valid denominator is 0.",
        ],
        required_fields=["points", "field_goals_attempted", "free_throws_attempted"],
        compatible_normalizations=["raw"],
        aggregation_recipe="ratio",
        validity_definition="jointly valid points, fga, and fta; 2*(fga+0.44*fta) > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="efg_pct",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Effective Field Goal Percentage",
        short_name="eFG%",
        category="efficiency",
        unit="percentage",
        formula="(sum(FGM) + 0.5 * sum(3PM)) / sum(FGA)",
        denominator="fga",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=[
            "Conventional eFG approximation adjusting for 3-point value.",
            "Requires jointly valid FGM, 3PM, and FGA on the same game records.",
            "Null when valid FGA is 0.",
        ],
        required_fields=["field_goals_made", "three_pointers_made", "field_goals_attempted"],
        compatible_normalizations=["raw"],
        aggregation_recipe="ratio",
        validity_definition="jointly valid fgm, fg3m, and fga; sum(fga) > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="ftr",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Free Throw Rate",
        short_name="FTR",
        category="efficiency",
        unit="ratio",
        formula="sum(FTA) / sum(FGA)",
        denominator="fga",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=[
            "Free throw attempt rate relative to field goal attempts.",
            "Requires jointly valid FTA and FGA on the same game records.",
            "Null when valid FGA is 0.",
        ],
        required_fields=["free_throws_attempted", "field_goals_attempted"],
        compatible_normalizations=["raw"],
        aggregation_recipe="ratio",
        validity_definition="jointly valid fta and fga; sum(fga) > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    # Rates per 36 minutes
    MetricDefinition(
        key="pts_per_36",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Points Per 36 Minutes",
        short_name="PTS/36",
        category="rates",
        unit="rate",
        formula="(sum(points) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=[
            "Descriptive rate normalization, not expected output at projected workload.",
            "Requires positive minutes and valid points on the same game records.",
        ],
        required_fields=["points", "minutes_seconds"],
        compatible_normalizations=["raw", "per_36"],
        aggregation_recipe="rate_per_36",
        validity_definition="jointly valid points and positive minutes",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="reb_per_36",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Rebounds Per 36 Minutes",
        short_name="REB/36",
        category="rates",
        unit="rate",
        formula="(sum(rebounds_total) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive rate normalization. Requires positive minutes."],
        required_fields=["rebounds_total", "minutes_seconds"],
        compatible_normalizations=["raw", "per_36"],
        aggregation_recipe="rate_per_36",
        validity_definition="jointly valid rebounds and positive minutes",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="ast_per_36",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Assists Per 36 Minutes",
        short_name="AST/36",
        category="rates",
        unit="rate",
        formula="(sum(assists) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive rate normalization. Requires positive minutes."],
        required_fields=["assists", "minutes_seconds"],
        compatible_normalizations=["raw", "per_36"],
        aggregation_recipe="rate_per_36",
        validity_definition="jointly valid assists and positive minutes",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="stl_per_36",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Steals Per 36 Minutes",
        short_name="STL/36",
        category="rates",
        unit="rate",
        formula="(sum(steals) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive rate normalization. Requires positive minutes."],
        required_fields=["steals", "minutes_seconds"],
        compatible_normalizations=["raw", "per_36"],
        aggregation_recipe="rate_per_36",
        validity_definition="jointly valid steals and positive minutes",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="blk_per_36",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Blocks Per 36 Minutes",
        short_name="BLK/36",
        category="rates",
        unit="rate",
        formula="(sum(blocks) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive rate normalization. Requires positive minutes."],
        required_fields=["blocks", "minutes_seconds"],
        compatible_normalizations=["raw", "per_36"],
        aggregation_recipe="rate_per_36",
        validity_definition="jointly valid blocks and positive minutes",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="tov_per_36",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Turnovers Per 36 Minutes",
        short_name="TOV/36",
        category="rates",
        unit="rate",
        formula="(sum(turnovers) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="asc",
        limitations=["Descriptive rate normalization. Default sort is ascending."],
        required_fields=["turnovers", "minutes_seconds"],
        compatible_normalizations=["raw", "per_36"],
        aggregation_recipe="rate_per_36",
        validity_definition="jointly valid turnovers and positive minutes",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="low",
    ),
    MetricDefinition(
        key="pf_per_36",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Personal Fouls Per 36 Minutes",
        short_name="PF/36",
        category="rates",
        unit="rate",
        formula="(sum(fouls_personal) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="asc",
        limitations=["Descriptive rate normalization. Default sort is ascending."],
        required_fields=["fouls_personal", "minutes_seconds"],
        compatible_normalizations=["raw", "per_36"],
        aggregation_recipe="rate_per_36",
        validity_definition="jointly valid fouls and positive minutes",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="low",
    ),
    MetricDefinition(
        key="oreb_per_36",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Offensive Rebounds Per 36 Minutes",
        short_name="OREB/36",
        category="rates",
        unit="rate",
        formula="(sum(rebounds_offensive) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive rate normalization. Requires positive minutes."],
        required_fields=["rebounds_offensive", "minutes_seconds"],
        compatible_normalizations=["raw", "per_36"],
        aggregation_recipe="rate_per_36",
        validity_definition="jointly valid offensive rebounds and positive minutes",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="dreb_per_36",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Defensive Rebounds Per 36 Minutes",
        short_name="DREB/36",
        category="rates",
        unit="rate",
        formula="(sum(rebounds_defensive) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive rate normalization. Requires positive minutes."],
        required_fields=["rebounds_defensive", "minutes_seconds"],
        compatible_normalizations=["raw", "per_36"],
        aggregation_recipe="rate_per_36",
        validity_definition="jointly valid defensive rebounds and positive minutes",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="fga_per_36",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Field Goals Attempted Per 36 Minutes",
        short_name="FGA/36",
        category="rates",
        unit="rate",
        formula="(sum(field_goals_attempted) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive volume rate normalization. Requires positive minutes."],
        required_fields=["field_goals_attempted", "minutes_seconds"],
        compatible_normalizations=["raw", "per_36"],
        aggregation_recipe="rate_per_36",
        validity_definition="jointly valid fga and positive minutes",
        capability_requirement="core_stats",
        classification="observed",
        good_direction=None,
    ),
    MetricDefinition(
        key="fg3a_per_36",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Three-Pointers Attempted Per 36 Minutes",
        short_name="3PA/36",
        category="rates",
        unit="rate",
        formula="(sum(three_pointers_attempted) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive volume rate normalization. Requires positive minutes."],
        required_fields=["three_pointers_attempted", "minutes_seconds"],
        compatible_normalizations=["raw", "per_36"],
        aggregation_recipe="rate_per_36",
        validity_definition="jointly valid 3pa and positive minutes",
        capability_requirement="core_stats",
        classification="observed",
        good_direction=None,
    ),
    MetricDefinition(
        key="fta_per_36",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Free Throws Attempted Per 36 Minutes",
        short_name="FTA/36",
        category="rates",
        unit="rate",
        formula="(sum(free_throws_attempted) / (sum(minutes_seconds) / 60)) * 36",
        denominator="min",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Descriptive volume rate normalization. Requires positive minutes."],
        required_fields=["free_throws_attempted", "minutes_seconds"],
        compatible_normalizations=["raw", "per_36"],
        aggregation_recipe="rate_per_36",
        validity_definition="jointly valid fta and positive minutes",
        capability_requirement="core_stats",
        classification="observed",
        good_direction=None,
    ),
    # Team Factors & Estimated Possessions (replica contract lines 74-75)
    MetricDefinition(
        key="team_pace",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Estimated Team Pace",
        short_name="PACE",
        category="team_factors",
        unit="possessions",
        formula="48 * (team_possessions_estimated / (minutes / 5))",
        denominator="minutes",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Conventional box-score pace estimate normalized to 48 minutes."],
        required_fields=["team_possessions_estimated", "minutes_seconds"],
        compatible_normalizations=["raw"],
        aggregation_recipe="derived",
        validity_definition="valid team possessions and minutes > 0",
        capability_requirement="core_stats",
        classification="modeled",
        good_direction=None,
    ),
    MetricDefinition(
        key="team_possessions_estimated",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Estimated Possessions",
        short_name="POSS_EST",
        category="team_factors",
        unit="possessions",
        formula="fga + 0.44 * fta - oreb + tov",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=[
            "Conventional box-score possession estimate with 0.44 FT factor.",
            "Distinct from reconstructed PBP possessions.",
        ],
        required_fields=[
            "field_goals_attempted",
            "free_throws_attempted",
            "rebounds_offensive",
            "turnovers",
        ],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="derived",
        validity_definition="jointly valid fga, fta, oreb, tov",
        capability_requirement="core_stats",
        classification="modeled",
        good_direction=None,
    ),
    MetricDefinition(
        key="team_off_rtg_estimated",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Estimated Offensive Rating",
        short_name="ORTG_EST",
        category="team_factors",
        unit="rating",
        formula="100 * points / team_possessions_estimated",
        denominator="team_possessions_estimated",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Points scored per 100 estimated possessions."],
        required_fields=["points", "team_possessions_estimated"],
        compatible_normalizations=["raw"],
        aggregation_recipe="ratio",
        validity_definition="valid points and positive estimated possessions",
        capability_requirement="core_stats",
        classification="modeled",
        good_direction="high",
    ),
    MetricDefinition(
        key="team_def_rtg_estimated",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Estimated Defensive Rating",
        short_name="DRTG_EST",
        category="team_factors",
        unit="rating",
        formula="100 * opp_points / opp_possessions_estimated",
        denominator="opp_possessions_estimated",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="asc",
        limitations=[
            "Points allowed per 100 estimated opponent possessions. Default sort is ascending."
        ],
        required_fields=["opp_points", "opp_possessions_estimated"],
        compatible_normalizations=["raw"],
        aggregation_recipe="ratio",
        validity_definition="valid opponent points and positive possessions",
        capability_requirement="core_stats",
        classification="modeled",
        good_direction="low",
    ),
    MetricDefinition(
        key="team_net_rtg_estimated",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Estimated Net Rating",
        short_name="NET_EST",
        category="team_factors",
        unit="rating",
        formula="team_off_rtg_estimated - team_def_rtg_estimated",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Offensive rating minus defensive rating under box-score estimates."],
        required_fields=["team_off_rtg_estimated", "team_def_rtg_estimated"],
        compatible_normalizations=["raw"],
        aggregation_recipe="derived",
        validity_definition="valid off_rtg and def_rtg",
        capability_requirement="core_stats",
        classification="modeled",
        good_direction="high",
    ),
    MetricDefinition(
        key="team_efg_pct",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Team Effective Field Goal Percentage",
        short_name="TEAM_eFG%",
        category="team_factors",
        unit="percentage",
        formula="(sum(team_fgm) + 0.5 * sum(team_fg3m)) / sum(team_fga)",
        denominator="team_fga",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Four Factors: shooting component for team."],
        required_fields=["field_goals_made", "three_pointers_made", "field_goals_attempted"],
        compatible_normalizations=["raw"],
        aggregation_recipe="ratio",
        validity_definition="jointly valid team fgm, fg3m, fga; fga > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="team_tov_pct",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Team Turnover Percentage",
        short_name="TEAM_TOV%",
        category="team_factors",
        unit="percentage",
        formula="tov / (fga + 0.44 * fta + tov)",
        denominator="fga + 0.44 * fta + tov",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="asc",
        limitations=["Four Factors: turnover component. Default sort is ascending."],
        required_fields=["turnovers", "field_goals_attempted", "free_throws_attempted"],
        compatible_normalizations=["raw"],
        aggregation_recipe="ratio",
        validity_definition="jointly valid tov, fga, fta; denominator > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="low",
    ),
    MetricDefinition(
        key="team_oreb_pct",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Team Offensive Rebound Percentage",
        short_name="TEAM_OREB%",
        category="team_factors",
        unit="percentage",
        formula="oreb / (oreb + opp_dreb)",
        denominator="oreb + opp_dreb",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Four Factors: offensive rebounding component."],
        required_fields=["rebounds_offensive", "opp_rebounds_defensive"],
        compatible_normalizations=["raw"],
        aggregation_recipe="ratio",
        validity_definition="jointly valid oreb and opp_dreb; denominator > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    MetricDefinition(
        key="team_ftr",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Team Free Throw Rate",
        short_name="TEAM_FTR",
        category="team_factors",
        unit="ratio",
        formula="fta / fga",
        denominator="fga",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Four Factors: free throw factor for team."],
        required_fields=["free_throws_attempted", "field_goals_attempted"],
        compatible_normalizations=["raw"],
        aggregation_recipe="ratio",
        validity_definition="jointly valid team fta and fga; fga > 0",
        capability_requirement="core_stats",
        classification="observed",
        good_direction="high",
    ),
    # Legacy Metrics
    MetricDefinition(
        key="legacy_fantasy_score",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Legacy Fantasy Score",
        short_name="FS",
        category="legacy",
        unit="score",
        formula="PTS + 1.2*REB + 1.5*AST + 3.0*STL + 3.0*BLK - TOV",
        denominator=None,
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Retained legacy fantasy scoring formula from earlier product scopes."],
        required_fields=["points", "rebounds_total", "assists", "steals", "blocks", "turnovers"],
        compatible_normalizations=["raw"],
        aggregation_recipe="derived",
        validity_definition="all constituent box-score fields must be non-null",
        capability_requirement="core_stats",
        classification="modeled",
        good_direction="high",
    ),
    MetricDefinition(
        key="legacy_fantasy_score_per_game",
        version=METRIC_CATALOG_V2_VERSION,
        display_name="Legacy Fantasy Score Per Game",
        short_name="FS/G",
        category="legacy",
        unit="score",
        formula="(PTS + 1.2*REB + 1.5*AST + 3.0*STL + 3.0*BLK - TOV) / gp",
        denominator="gp",
        phase_scope=SUPPORTED_PHASES,
        default_sort_direction="desc",
        limitations=["Retained legacy fantasy scoring formula per game."],
        required_fields=["points", "rebounds_total", "assists", "steals", "blocks", "turnovers"],
        compatible_normalizations=["raw", "per_game"],
        aggregation_recipe="mean",
        validity_definition="valid fantasy score games > 0",
        capability_requirement="core_stats",
        classification="modeled",
        good_direction="high",
    ),
]


# --- Preserved V1 Metric Definitions (for retained historical artifacts) ---

METRIC_DEFINITIONS_V1: list[MetricDefinition] = [
    MetricDefinition(
        key=m.key,
        version=METRIC_CATALOG_V1_VERSION,
        display_name=m.display_name,
        short_name=m.short_name,
        category=m.category,
        unit=m.unit,
        formula=m.formula,
        denominator=m.denominator,
        phase_scope=list(m.phase_scope),
        default_sort_direction=m.default_sort_direction,
        limitations=list(m.limitations),
        required_fields=list(m.required_fields),
        compatible_normalizations=list(m.compatible_normalizations),
        aggregation_recipe=m.aggregation_recipe,
        validity_definition=m.validity_definition,
        aliases=list(m.aliases),
        capability_requirement=m.capability_requirement,
        classification=m.classification,
        good_direction=m.good_direction,
    )
    for m in METRIC_DEFINITIONS_V2
    if m.key
    not in {
        "ts_pct",
        "efg_pct",
        "ftr",
        "tov_per_36",
        "pf_per_36",
        "oreb_per_36",
        "dreb_per_36",
        "fga_per_36",
        "fg3a_per_36",
        "fta_per_36",
        "reb_total",
        "reb_total_per_game",
        "team_pace",
        "team_possessions_estimated",
        "team_off_rtg_estimated",
        "team_def_rtg_estimated",
        "team_net_rtg_estimated",
        "team_efg_pct",
        "team_tov_pct",
        "team_oreb_pct",
        "team_ftr",
    }
]

# Alias dictionary mapping alternative names to canonical keys
METRIC_ALIASES: dict[str, str] = {
    "reb_total": "reb",
    "reb_total_per_game": "reb_per_game",
}

# The active definitions list
METRIC_DEFINITIONS: list[MetricDefinition] = METRIC_DEFINITIONS_V2

# Full catalogs indexed by key
METRIC_CATALOG_V1: dict[str, MetricDefinition] = {defn.key: defn for defn in METRIC_DEFINITIONS_V1}
METRIC_CATALOG_V2: dict[str, MetricDefinition] = {defn.key: defn for defn in METRIC_DEFINITIONS_V2}
METRIC_CATALOG: dict[str, MetricDefinition] = METRIC_CATALOG_V2


def resolve_metric_alias(key: str) -> str:
    """Resolve an alias (e.g. 'reb_total') to its canonical metric key (e.g. 'reb')."""
    return METRIC_ALIASES.get(key, key)


def get_metric_definition(key: str, version: str = METRIC_CATALOG_VERSION) -> MetricDefinition:
    """Retrieve definition for a registered metric key or alias."""
    cat = METRIC_CATALOG_V1 if version == METRIC_CATALOG_V1_VERSION else METRIC_CATALOG_V2
    if key in cat:
        return cat[key]
    canonical = resolve_metric_alias(key)
    if canonical in cat:
        return cat[canonical]
    valid_keys = ", ".join(sorted(cat.keys()))
    raise KeyError(f"unsupported metric '{key}'; valid metrics are: {valid_keys}")


def list_metric_definitions(version: str = METRIC_CATALOG_VERSION) -> list[MetricDefinition]:
    """List all registered metric definitions for the specified version."""
    if version == METRIC_CATALOG_V1_VERSION:
        return list(METRIC_DEFINITIONS_V1)
    return list(METRIC_DEFINITIONS_V2)


def validate_metric_keys(keys: Iterable[str], version: str = METRIC_CATALOG_VERSION) -> None:
    """Validate that all metric keys or aliases exist in the catalog; raise ValueError if not."""
    cat = METRIC_CATALOG_V1 if version == METRIC_CATALOG_V1_VERSION else METRIC_CATALOG_V2
    for key in keys:
        if key not in cat and resolve_metric_alias(key) not in cat:
            valid_keys = ", ".join(sorted(cat.keys()))
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


# --- Calculation Implementations ---


def compute_metrics_v1(games: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, int]]:
    """Preserved v1 calculation (retained for backward compatibility and evidence)."""
    appeared_games = [g for g in games if g.get("appearance") == "appeared"]
    gp = len(appeared_games)

    total_seconds = sum(
        g.get("minutes_seconds") or 0
        for g in appeared_games
        if g.get("minutes_seconds") is not None
    )
    total_min = round(total_seconds / 60.0, 1)
    min_per_game = round(total_min / gp, 1) if gp > 0 else None

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

    fg_pct = round(fgm / fga, 4) if fga > 0 else None
    fg3_pct = round(fg3m / fg3a, 4) if fg3a > 0 else None
    ft_pct = round(ftm / fta, 4) if fta > 0 else None

    pts_per_36 = round((pts / total_min) * 36.0, 1) if total_min > 0 else None
    reb_per_36 = round((reb / total_min) * 36.0, 1) if total_min > 0 else None
    ast_per_36 = round((ast / total_min) * 36.0, 1) if total_min > 0 else None
    stl_per_36 = round((stl / total_min) * 36.0, 1) if total_min > 0 else None
    blk_per_36 = round((blk / total_min) * 36.0, 1) if total_min > 0 else None

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


def compute_metrics_v2(games: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, int]]:
    """Compute v2 catalog metrics with strict sample preservation, null handling, and paired rows.

    Key improvements over v1:
    - Per-metric valid samples tracked separately in sample_sizes.
    - Zero valid observations produces None (null), NOT a 0-initialized sum.
    - Means divide by that metric's valid observation count, NOT all appearances (gp).
    - Ratios and percentages (FG%, 3P%, FT%, eFG%, TS%, FTR) require jointly valid
      makes and attempts on the same game records; unpaired rows are excluded.
    - Conventional TS%, eFG%, and FTR are computed as first-class metrics.
    - Per-36 rates require positive minutes and divide by unrounded minutes (seconds / 60.0).
    - Aliases 'reb_total' and 'reb_total_per_game' are populated alongside 'reb' and 'reb_per_game'.
    """
    appeared_games = [g for g in games if g.get("appearance") == "appeared"]
    gp = len(appeared_games)

    metrics: dict[str, Any] = {"gp": gp}
    sample_sizes: dict[str, int] = {"gp": gp}

    # 1. Minutes and MPG
    min_games = [g for g in appeared_games if g.get("minutes_seconds") is not None]
    sample_sizes["min"] = len(min_games)
    sample_sizes["min_per_game"] = gp

    if min_games:
        total_seconds = sum(int(g["minutes_seconds"]) for g in min_games)
        total_min = round(total_seconds / 60.0, 1)
        min_per_game = round(total_min / gp, 1) if gp > 0 else None
        metrics["min"] = total_min
        metrics["min_per_game"] = min_per_game
    else:
        metrics["min"] = None
        metrics["min_per_game"] = None

    # 2. Counting metrics and per-game averages
    counting_mapping: dict[str, str] = {
        "pts": "points",
        "oreb": "rebounds_offensive",
        "dreb": "rebounds_defensive",
        "reb": "rebounds_total",
        "ast": "assists",
        "stl": "steals",
        "blk": "blocks",
        "tov": "turnovers",
        "pf": "fouls_personal",
        "fgm": "field_goals_made",
        "fga": "field_goals_attempted",
        "fg3m": "three_pointers_made",
        "fg3a": "three_pointers_attempted",
        "ftm": "free_throws_made",
        "fta": "free_throws_attempted",
    }

    for m_key, col in counting_mapping.items():
        valid_games = [g for g in appeared_games if g.get(col) is not None]
        n_valid = len(valid_games)
        sample_sizes[m_key] = n_valid

        per_game_key = f"{m_key}_per_game"
        if per_game_key in {
            "pts_per_game",
            "oreb_per_game",
            "dreb_per_game",
            "reb_per_game",
            "ast_per_game",
            "stl_per_game",
            "blk_per_game",
            "tov_per_game",
            "pf_per_game",
        }:
            sample_sizes[per_game_key] = n_valid

        if n_valid > 0:
            tot = sum(int(g[col]) for g in valid_games)
            metrics[m_key] = tot
            if per_game_key in sample_sizes:
                metrics[per_game_key] = round(tot / n_valid, 1)
        else:
            metrics[m_key] = None
            if per_game_key in sample_sizes:
                metrics[per_game_key] = None

    # 3. Aliases for rebounds
    metrics["reb_total"] = metrics["reb"]
    sample_sizes["reb_total"] = sample_sizes["reb"]
    metrics["reb_total_per_game"] = metrics["reb_per_game"]
    sample_sizes["reb_total_per_game"] = sample_sizes["reb_per_game"]

    # 4. Shooting Ratios / Percentages (strict paired-row requirement)

    # FG% (sum(FGM) / sum(FGA) on jointly valid rows)
    paired_fg = [
        g
        for g in appeared_games
        if g.get("field_goals_made") is not None and g.get("field_goals_attempted") is not None
    ]
    sample_sizes["fg_pct"] = len(paired_fg)
    if paired_fg:
        sum_fgm = sum(int(g["field_goals_made"]) for g in paired_fg)
        sum_fga = sum(int(g["field_goals_attempted"]) for g in paired_fg)
        metrics["fg_pct"] = round(sum_fgm / sum_fga, 4) if sum_fga > 0 else None
    else:
        metrics["fg_pct"] = None

    # 3P% (sum(3PM) / sum(3PA) on jointly valid rows)
    paired_fg3 = [
        g
        for g in appeared_games
        if g.get("three_pointers_made") is not None
        and g.get("three_pointers_attempted") is not None
    ]
    sample_sizes["fg3_pct"] = len(paired_fg3)
    if paired_fg3:
        sum_fg3m = sum(int(g["three_pointers_made"]) for g in paired_fg3)
        sum_fg3a = sum(int(g["three_pointers_attempted"]) for g in paired_fg3)
        metrics["fg3_pct"] = round(sum_fg3m / sum_fg3a, 4) if sum_fg3a > 0 else None
    else:
        metrics["fg3_pct"] = None

    # FT% (sum(FTM) / sum(FTA) on jointly valid rows)
    paired_ft = [
        g
        for g in appeared_games
        if g.get("free_throws_made") is not None and g.get("free_throws_attempted") is not None
    ]
    sample_sizes["ft_pct"] = len(paired_ft)
    if paired_ft:
        sum_ftm = sum(int(g["free_throws_made"]) for g in paired_ft)
        sum_fta = sum(int(g["free_throws_attempted"]) for g in paired_ft)
        metrics["ft_pct"] = round(sum_ftm / sum_fta, 4) if sum_fta > 0 else None
    else:
        metrics["ft_pct"] = None

    # eFG% ((sum(FGM) + 0.5 * sum(3PM)) / sum(FGA) on jointly valid rows)
    paired_efg = [
        g
        for g in appeared_games
        if g.get("field_goals_made") is not None
        and g.get("three_pointers_made") is not None
        and g.get("field_goals_attempted") is not None
    ]
    sample_sizes["efg_pct"] = len(paired_efg)
    if paired_efg:
        sum_efg_fgm = sum(int(g["field_goals_made"]) for g in paired_efg)
        sum_efg_fg3m = sum(int(g["three_pointers_made"]) for g in paired_efg)
        sum_efg_fga = sum(int(g["field_goals_attempted"]) for g in paired_efg)
        efg_val = (sum_efg_fgm + 0.5 * sum_efg_fg3m) / sum_efg_fga if sum_efg_fga > 0 else None
        metrics["efg_pct"] = round(efg_val, 4) if efg_val is not None else None
    else:
        metrics["efg_pct"] = None

    # TS% (sum(PTS) / (2 * (sum(FGA) + 0.44 * sum(FTA))) on jointly valid rows)
    paired_ts = [
        g
        for g in appeared_games
        if g.get("points") is not None
        and g.get("field_goals_attempted") is not None
        and g.get("free_throws_attempted") is not None
    ]
    sample_sizes["ts_pct"] = len(paired_ts)
    if paired_ts:
        sum_ts_pts = sum(int(g["points"]) for g in paired_ts)
        sum_ts_fga = sum(int(g["field_goals_attempted"]) for g in paired_ts)
        sum_ts_fta = sum(int(g["free_throws_attempted"]) for g in paired_ts)
        ts_denom = 2.0 * (sum_ts_fga + 0.44 * sum_ts_fta)
        metrics["ts_pct"] = round(sum_ts_pts / ts_denom, 4) if ts_denom > 0 else None
    else:
        metrics["ts_pct"] = None

    # FTR (sum(FTA) / sum(FGA) on jointly valid rows)
    paired_ftr = [
        g
        for g in appeared_games
        if g.get("free_throws_attempted") is not None and g.get("field_goals_attempted") is not None
    ]
    sample_sizes["ftr"] = len(paired_ftr)
    if paired_ftr:
        sum_ftr_fta = sum(int(g["free_throws_attempted"]) for g in paired_ftr)
        sum_ftr_fga = sum(int(g["field_goals_attempted"]) for g in paired_ftr)
        metrics["ftr"] = round(sum_ftr_fta / sum_ftr_fga, 4) if sum_ftr_fga > 0 else None
    else:
        metrics["ftr"] = None

    # 5. Per-36 Rates (jointly valid positive minutes and stat observation)
    per_36_mapping: dict[str, str] = {
        "pts_per_36": "points",
        "reb_per_36": "rebounds_total",
        "ast_per_36": "assists",
        "stl_per_36": "steals",
        "blk_per_36": "blocks",
        "tov_per_36": "turnovers",
        "pf_per_36": "fouls_personal",
        "oreb_per_36": "rebounds_offensive",
        "dreb_per_36": "rebounds_defensive",
        "fga_per_36": "field_goals_attempted",
        "fg3a_per_36": "three_pointers_attempted",
        "fta_per_36": "free_throws_attempted",
    }

    for rate_key, col in per_36_mapping.items():
        valid_rate_games = [
            g
            for g in appeared_games
            if g.get("minutes_seconds") is not None
            and int(g["minutes_seconds"]) > 0
            and g.get(col) is not None
        ]
        sample_sizes[rate_key] = len(valid_rate_games)
        if valid_rate_games:
            stat_sum = sum(int(g[col]) for g in valid_rate_games)
            sec_sum = sum(int(g["minutes_seconds"]) for g in valid_rate_games)
            unrounded_minutes = sec_sum / 60.0
            rate_val = (stat_sum / unrounded_minutes) * 36.0 if unrounded_minutes > 0 else None
            metrics[rate_key] = round(rate_val, 1) if rate_val is not None else None
        else:
            metrics[rate_key] = None

    # 6. Legacy Fantasy Scores
    legacy_scores: list[float] = []
    for g in appeared_games:
        lfs = compute_legacy_fantasy_score(g)
        if lfs is not None:
            legacy_scores.append(lfs)

    sample_sizes["legacy_fantasy_score"] = len(legacy_scores)
    sample_sizes["legacy_fantasy_score_per_game"] = len(legacy_scores)
    if legacy_scores:
        legacy_total = round(sum(legacy_scores), 1)
        legacy_per_game = round(sum(legacy_scores) / len(legacy_scores), 1)
        metrics["legacy_fantasy_score"] = legacy_total
        metrics["legacy_fantasy_score_per_game"] = legacy_per_game
    else:
        metrics["legacy_fantasy_score"] = None
        metrics["legacy_fantasy_score_per_game"] = None

    return metrics, sample_sizes


def compute_metrics(
    games: list[dict[str, Any]],
    version: str = METRIC_CATALOG_VERSION,
) -> tuple[dict[str, Any], dict[str, int]]:
    """Compute catalog metrics for a list of game records, dispatching to specified version.

    Default version is 'v2' (canonical bug-fixed implementation).
    Passing version='v1' reproduces the historical M0-P9 implementation.
    """
    if version == METRIC_CATALOG_V1_VERSION:
        return compute_metrics_v1(games)
    return compute_metrics_v2(games)
