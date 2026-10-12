"""courtlens-stats-v4: Databallr Overview additions on top of the unchanged v3 serving catalog.

Three families, each with its own availability rule:

- Box: per-game shooting volume and 2-point shooting, aggregated in SQL like every v2 box metric.
- Impact-derived: rim assists as rates and the creation-adjusted turnover share. They need the
  sealed impact extras (each player's offensive possessions), so they follow the impact gates:
  single full season, cutoff after the sealed fit, no team filter.
- Tracking: on-ball share and points created from NBA optical tracking season totals. These are
  season totals without dates, so they join only when the query covers the whole season-phase.
"""

from __future__ import annotations

from courtlens.domain.metrics import SUPPORTED_PHASES, MetricDefinition

VERSION = "courtlens-stats-v4"


def _metric(
    key: str,
    name: str,
    short: str,
    category: str,
    unit: str,
    formula: str,
    denominator: str | None,
    limitations: list[str],
    *,
    recipe: str,
    validity: str,
    capability: str = "core_stats",
    classification: str = "observed",
    good: str | None = "high",
    phases: list[str] | None = None,
) -> MetricDefinition:
    return MetricDefinition(
        key=key,
        version=VERSION,
        display_name=name,
        short_name=short,
        category=category,
        unit=unit,
        formula=formula,
        denominator=denominator,
        phase_scope=phases or SUPPORTED_PHASES,
        default_sort_direction="asc" if good == "low" else "desc",
        limitations=limitations,
        compatible_normalizations=["raw"],
        aggregation_recipe=recipe,
        validity_definition=validity,
        capability_requirement=capability,
        classification=classification,
        good_direction=good,
    )


def _per_game(stem: str, name: str, short: str, field: str) -> MetricDefinition:
    return _metric(
        f"{stem}_per_game",
        f"{name} Per Game",
        short,
        "efficiency",
        "shots",
        f"avg({field}) over appearances with a recorded {field}",
        "games with a recorded value",
        [f"{name} averaged over confirmed appearances; a missing box value is excluded."],
        recipe="mean",
        validity=f"{field} is not null",
        good="high" if stem.endswith("m") else None,
    )


BOX_METRICS: dict[str, MetricDefinition] = {
    m.key: m
    for m in (
        _per_game("fgm", "Field Goals Made", "FGM", "field_goals_made"),
        _per_game("fga", "Field Goals Attempted", "FGA", "field_goals_attempted"),
        _per_game("fg3m", "Three-Pointers Made", "3PM", "three_pointers_made"),
        _per_game("fg3a", "Three-Pointers Attempted", "3PA", "three_pointers_attempted"),
        _per_game("ftm", "Free Throws Made", "FTM", "free_throws_made"),
        _per_game("fta", "Free Throws Attempted", "FTA", "free_throws_attempted"),
        _metric(
            "fg2m",
            "Two-Pointers Made",
            "2PM",
            "efficiency",
            "shots",
            "sum(FGM) - sum(3PM)",
            None,
            ["Field goals made minus three-pointers made on jointly valid rows."],
            recipe="sum",
            validity="jointly valid fgm, fga, fg3m and fg3a",
        ),
        _metric(
            "fg2a",
            "Two-Pointers Attempted",
            "2PA",
            "efficiency",
            "shots",
            "sum(FGA) - sum(3PA)",
            None,
            ["Field goal attempts minus three-point attempts on jointly valid rows."],
            recipe="sum",
            validity="jointly valid fgm, fga, fg3m and fg3a",
            good=None,
        ),
        _metric(
            "fg2_pct",
            "Two-Point Percentage",
            "2P%",
            "efficiency",
            "percentage",
            "(sum(FGM) - sum(3PM)) / (sum(FGA) - sum(3PA))",
            "fg2a",
            ["Null when there are no two-point attempts on jointly valid rows."],
            recipe="ratio",
            validity="jointly valid fgm, fga, fg3m and fg3a; 2PA > 0",
        ),
    )
}

IMPACT_LIMITS = [
    "Uses the sealed impact extras: full single-season scopes only, unavailable in team-filtered "
    "or short-window views.",
]
# Ben Taylor's Box Creation and Offensive Load (Thinking Basketball / Backpicks), per 100
# offensive possessions counted from CourtLens stints.
BOX_CREATION_SQL_FORMULA = (
    "BC = AST*0.1843 + (PTS+TOV)*0.0969 - 2.3021*P3 + 0.0582*AST*(PTS+TOV)*P3 - 1.1942, "
    "P3 = (2/(1+exp(-3PA)) - 1) * 3P%, all per 100 offensive possessions"
)
IMPACT_DERIVED: dict[str, MetricDefinition] = {
    m.key: m
    for m in (
        _metric(
            "rim_ast_per_game",
            "Rim Assists Per Game",
            "Rim AST",
            "impact_extras",
            "assists",
            "sum(credited_assists_on_joined_RA_makes) / covered_games",
            "covered_games",
            [*IMPACT_LIMITS, "Restricted-area makes from the joined shot chart."],
            recipe="sum_then_ratio",
            validity="Rank with >=500 reconstructed minutes.",
            capability="impact_extras_im06",
            phases=["regular_season", "playoffs"],
        ),
        _metric(
            "rim_ast_per100",
            "Rim Assists Per 100",
            "Rim AST/100",
            "impact_extras",
            "assists per 100",
            "100 * rim_assists / off_controls",
            "off_controls",
            [*IMPACT_LIMITS, "Restricted-area makes from the joined shot chart."],
            recipe="sum_then_ratio",
            validity="Rank with >=500 reconstructed minutes and >=200 offensive possessions.",
            capability="impact_extras_im06",
            phases=["regular_season", "playoffs"],
        ),
        _metric(
            "rim_ast_per_36",
            "Rim Assists Per 36 Minutes",
            "Rim AST",
            "impact_extras",
            "assists",
            "36 * rim_assists / box minutes",
            "minutes",
            [*IMPACT_LIMITS, "Restricted-area makes from the joined shot chart."],
            recipe="sum_then_ratio",
            validity="Rank with >=500 reconstructed minutes.",
            capability="impact_extras_im06",
            phases=["regular_season", "playoffs"],
        ),
        _metric(
            "offensive_load",
            "Offensive Load",
            "Load",
            "impact_extras",
            "plays per 100",
            "(AST - 0.38*BC)*0.75 + FGA + 0.44*FTA + BC + TOV, per 100; "
            + BOX_CREATION_SQL_FORMULA,
            "off_controls",
            [*IMPACT_LIMITS, "Box Creation is Taylor's regression estimate of shots created."],
            recipe="formula",
            validity="Rank with >=500 reconstructed minutes and >=200 offensive possessions.",
            capability="impact_extras_im06",
            classification="modeled",
            phases=["regular_season", "playoffs"],
        ),
        _metric(
            "ctov_pct",
            "Creation-Adjusted Turnover Percentage",
            "cTOV%",
            "impact_extras",
            "percentage",
            "TOV per 100 / Offensive Load",
            "offensive_load",
            [*IMPACT_LIMITS, "Box Creation is Taylor's regression estimate of shots created."],
            recipe="formula",
            validity="Rank with >=500 reconstructed minutes and >=200 offensive possessions.",
            capability="impact_extras_im06",
            classification="modeled",
            good="low",
            phases=["regular_season", "playoffs"],
        ),
    )
}

TRACKING_LIMITS = [
    "NBA optical tracking season totals (hoopR-nba-stats-raw mirror); shown only when the view "
    "covers the whole season and phase, never in date-windowed or short-window scopes.",
]
TRACKING_METRICS: dict[str, MetricDefinition] = {
    m.key: m
    for m in (
        _metric(
            "on_ball_pct",
            "On-Ball Percentage",
            "OnBall%",
            "tracking",
            "percentage",
            "tracking time_of_poss / tracking min",
            "tracking minutes",
            TRACKING_LIMITS,
            recipe="ratio",
            validity="Tracking minutes > 0 in the selected season and phase.",
            capability="stats_feed_tracking",
            good=None,
            phases=["regular_season", "playoffs"],
        ),
        _metric(
            "pts_created",
            "Points Created",
            "PTS Created",
            "tracking",
            "points",
            "sum(PTS) + tracking ast_pts_created",
            None,
            [*TRACKING_LIMITS, "Assist points are NBA's points scored from this player's assists."],
            recipe="sum",
            validity="Tracking passing row present in the selected season and phase.",
            capability="stats_feed_tracking",
            phases=["regular_season", "playoffs"],
        ),
        _metric(
            "pts_created_per_game",
            "Points Created Per Game",
            "PTS Created",
            "tracking",
            "points",
            "(sum(PTS) + tracking ast_pts_created) / gp",
            "gp",
            [*TRACKING_LIMITS, "Assist points are NBA's points scored from this player's assists."],
            recipe="mean",
            validity="Tracking passing row present in the selected season and phase.",
            capability="stats_feed_tracking",
            phases=["regular_season", "playoffs"],
        ),
        _metric(
            "pts_created_per_36",
            "Points Created Per 36 Minutes",
            "PTS Created",
            "tracking",
            "points",
            "36 * (sum(PTS) + tracking ast_pts_created) / minutes",
            "minutes",
            [*TRACKING_LIMITS, "Assist points are NBA's points scored from this player's assists."],
            recipe="sum_then_ratio",
            validity="Tracking passing row present in the selected season and phase.",
            capability="stats_feed_tracking",
            phases=["regular_season", "playoffs"],
        ),
    )
}

DARKO_LIMITS = [
    "DARKO model output by Kostya Medvedovsky (darko.app), imported under source policy v3; "
    "not a CourtLens estimate. Latest retrospective pregame forecast as of the phase's last "
    "admitted game date, not a season average. Regular-season snapshots exclude playoff updates. "
    "Unknown in shorter or earlier scopes. Historical publication-time revisions are unavailable; "
    "never a forecasting feature. CourtLens computes its own league percentiles.",
]
DARKO_METRICS: dict[str, MetricDefinition] = {
    m.key: m
    for m in (
        _metric(
            key,
            name,
            short,
            "external_impact",
            "points per 100 possessions",
            formula,
            None,
            DARKO_LIMITS,
            recipe="external",
            validity="Player listed on the dated DARKO leaderboard for the season and phase.",
            capability="external_darko",
            classification="modeled",
            phases=["regular_season", "playoffs"],
        )
        for key, name, short, formula in (
            ("dpm", "Daily Plus-Minus", "DPM", "DARKO DPM (box score and plus-minus, Bayesian)"),
            ("o_dpm", "Offensive Daily Plus-Minus", "ODPM", "DARKO offensive DPM"),
            ("d_dpm", "Defensive Daily Plus-Minus", "DDPM", "DARKO defensive DPM"),
        )
    )
}

STATS_V4_CATALOG: dict[str, MetricDefinition] = {
    **BOX_METRICS,
    **IMPACT_DERIVED,
    **TRACKING_METRICS,
    **DARKO_METRICS,
}
