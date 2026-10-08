"""Versioned IM05 stats definitions; serving registration belongs to IM06."""

from __future__ import annotations

from courtlens.domain.metrics import MetricDefinition

VERSION = "courtlens-impact-extras-v1"
BUCKETS = ("create", "space", "trans", "finish", "unknown")
WAVE_TWO = {
    "deflections": "requires admitted hustle data",
    "potential_assists": "requires admitted complete tracking data",
    "on_ball_pct": "requires tracking possession-time attribution",
    "tracking_dfga_per100": "aggregate matchups are not shot contests",
    "rim_points_saved_per100": "no per-shot defender and rim-zone join in aggregate matchups",
    "stop_pct": "requires an explicit individual stop attribution method",
    "d_sqi": "undefined proprietary model; needs a separately documented CourtLens method",
    "forced_turnovers": "complete forced-turnover attribution is absent; credited analogue only",
    "stolen_tov_pct": "requires complete linked steal attribution, not assumed from box steals",
}


def definition(
    key: str,
    name: str,
    unit: str,
    formula: str,
    denominator: str | None,
    fields: list[str],
    *,
    analogue: bool = False,
) -> MetricDefinition:
    return MetricDefinition(
        key=key,
        version=VERSION,
        display_name=name,
        short_name=name,
        category="impact_extras",
        unit=unit,
        formula=formula,
        denominator=denominator,
        phase_scope=["regular_season", "playoffs"],
        default_sort_direction="desc",
        limitations=[
            "Descriptive public-source sample; coverage and repair rates accompany values.",
            "Not causal or a forecasting feature; see impact-extras-v1.md.",
            *(["CourtLens analogue; not a vendor-equivalent metric."] if analogue else []),
        ],
        required_fields=fields,
        compatible_normalizations=["raw"],
        aggregation_recipe="sum_then_ratio" if denominator else "sum",
        validity_definition=(
            "Complete source-specific game sample; positive rate denominator; missing is null. "
            "Rank with >=500 reconstructed minutes and >=200 denominator units for rates."
        ),
        capability_requirement="impact_extras_im06",
        classification="modeled" if analogue else "observed",
    )


_SPECS = (
    (
        "pbp_stl_per100",
        "STL/100",
        "steals per100",
        "100*steals/def_controls",
        "def_controls",
        False,
    ),
    (
        "pbp_blk_per100",
        "BLK/100",
        "blocks per100",
        "100*blocks/def_controls",
        "def_controls",
        False,
    ),
    ("pbp_foul_frequency", "FOUL frequency", "ratio", "pf/mean_controls", "mean_controls", False),
    ("pbp_drb_pct", "DRB%", "ratio", "drb/drb_opportunities", "drb_opportunities", False),
    (
        "pbp_block_recovered_pct",
        "Block recovered fraction",
        "ratio",
        "block_recovered/block_known",
        "block_known",
        False,
    ),
    (
        "matchup_fga_per100",
        "Matchup FGA faced/100",
        "attempts per100",
        "100*matchup_fga/def_controls",
        "def_controls",
        False,
    ),
    ("impact_ts_pct", "TS%", "ratio", "points/(2*tsa)", "tsa", False),
    ("impact_rts", "rTS", "ratio difference", "ts-league_ts", "tsa", False),
    (
        "impact_tsadd_per100",
        "TSAdd/100",
        "points per100",
        "100*(points-2*tsa*league_ts)/off_controls",
        "off_controls",
        True,
    ),
    ("impact_three_point_rate", "3PR", "ratio", "fg3a/fga", "fga", False),
    ("impact_ftr", "FTR", "ratio", "fta/fga", "fga", False),
    (
        "impact_ast_per100",
        "AST/100",
        "assists per100",
        "100*assists/off_controls",
        "off_controls",
        False,
    ),
    (
        "pbp_bad_pass_tov",
        "Bad-pass turnovers",
        "turnovers",
        "sum(explicit_bad_pass_tov)",
        None,
        False,
    ),
    (
        "pbp_rim_assists",
        "Rim assists",
        "assists",
        "sum(credited_assists_on_joined_RA_makes)",
        None,
        False,
    ),
    (
        "pbp_self_miss_orb_pct",
        "Self-miss ORB%",
        "ratio",
        "self_orb/self_opportunities",
        "self_opportunities",
        False,
    ),
    (
        "pbp_team_miss_orb_pct",
        "Teammate-miss ORB%",
        "ratio",
        "team_orb/team_opportunities",
        "team_opportunities",
        False,
    ),
    (
        "pbp_charges_drawn",
        "Explicit charges drawn",
        "charges",
        "sum(credited_CDN_offensive_charges)",
        None,
        False,
    ),
    (
        "pbp_credited_ftov_per100",
        "Credited turnovers forced/100",
        "turnovers per100",
        "100*(steals+charges)/def_controls",
        "def_controls",
        True,
    ),
)

_INPUTS = {
    "pbp_stl_per100": ["player_box.steals", "stints.def_controls"],
    "pbp_blk_per100": ["player_box.blocks", "stints.def_controls"],
    "pbp_foul_frequency": ["player_box.personal_fouls", "stints.mean_controls"],
    "pbp_drb_pct": ["pbp.player_rebound", "candidate.event_lineups"],
    "pbp_block_recovered_pct": ["pbp.block_actor", "pbp.next_live_individual_rebound"],
    "matchup_fga_per100": ["matchups.matchups_person_id", "matchups.fga", "stints.def_controls"],
    "impact_ts_pct": ["player_box.points", "player_box.fga", "player_box.fta"],
    "impact_rts": [
        "player_box.points",
        "player_box.fga",
        "player_box.fta",
        "selected_phase.league_ts",
    ],
    "impact_tsadd_per100": [
        "player_box.points",
        "player_box.tsa",
        "selected_phase.league_ts",
        "stints.off_controls",
    ],
    "impact_three_point_rate": ["player_box.fg3a", "player_box.fga"],
    "impact_ftr": ["player_box.fta", "player_box.fga"],
    "impact_ast_per100": ["player_box.assists", "stints.off_controls"],
    "pbp_bad_pass_tov": ["pbp.turnover_actor", "pbp.turnover_subtype"],
    "pbp_rim_assists": ["pbp.assist_actor", "shotdetail.zone"],
    "pbp_self_miss_orb_pct": [
        "pbp.missed_fg_actor",
        "pbp.rebound_actor",
        "candidate.event_lineups",
    ],
    "pbp_team_miss_orb_pct": [
        "pbp.missed_fg_actor",
        "pbp.rebound_actor",
        "candidate.event_lineups",
    ],
    "pbp_charges_drawn": ["pbp.offensive_charge", "cdn.foulDrawnPersonId"],
    "pbp_credited_ftov_per100": ["player_box.steals", "cdn.charge_actor", "stints.def_controls"],
}
IMPACT_EXTRAS_CATALOG = {
    key: definition(key, name, unit, formula, denominator, _INPUTS[key], analogue=analogue)
    for key, name, unit, formula, denominator, analogue in _SPECS
}
for _bucket in BUCKETS:
    for _suffix, _unit, _formula, _denominator in (
        ("tsa", "attempts", "sum(fga)+0.44*sum(fta)", None),
        ("frequency", "ratio", "bucket_tsa/all_tsa", "all_tsa"),
        ("ts", "ratio", "bucket_points/(2*bucket_tsa)", "bucket_tsa"),
        ("rts", "ratio difference", "bucket_ts-league_bucket_ts", "bucket_tsa"),
    ):
        _key = f"pbp_{_bucket}_{_suffix}"
        IMPACT_EXTRAS_CATALOG[_key] = definition(
            _key,
            f"{_bucket.title()} analogue {_suffix}",
            _unit,
            _formula,
            _denominator,
            ["selected_pbp", "shotdetail", "event_lineups"],
            analogue=True,
        )
