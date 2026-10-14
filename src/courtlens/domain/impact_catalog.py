"""Serving catalog extension; retained v1/v2 definitions remain unchanged."""

from dataclasses import replace

from courtlens.domain.impact_extras_catalog import IMPACT_EXTRAS_CATALOG, RETIRED_METRICS
from courtlens.domain.metrics import METRIC_CATALOG_V2, MetricDefinition
from courtlens.domain.stats_v4_catalog import (
    BOX_METRICS,
    DARKO_METRICS,
    IMPACT_DERIVED,
    TRACKING_METRICS,
)
from courtlens.domain.stats_v4_catalog import VERSION as V4_VERSION

VERSION = "courtlens-stats-v3"


def rating(key: str, label: str, formula: str, *, factor: bool = False) -> MetricDefinition:
    return MetricDefinition(
        key=key,
        version="courtlens-impact-serving-v1",
        display_name=label,
        short_name=label,
        category="impact",
        unit="percentage points" if factor else "points per 100 controls",
        formula=formula,
        denominator="model-specific offensive and defensive opportunities",
        phase_scope=["regular_season", "playoffs"],
        default_sort_direction="desc",
        limitations=[
            "CourtLens descriptive model estimate under lineup confounding; not causal.",
            "Full declared fit window; never a short-window or team-conditioned coefficient.",
            "Missing historical BPR support remains unavailable. No forecasting features.",
        ],
        compatible_normalizations=["raw"],
        aggregation_recipe="sealed_coefficient",
        validity_definition=(
            "Positive minutes; ranking requires 20 games and 1000 opportunities on each side."
        ),
        capability_requirement="impact_ratings",
        classification="modeled",
        good_direction="high",
    )


RATING_METRICS = {
    key: rating(key, label, formula)
    for years in (1, 2, 3)
    for stem, label, formula in (
        ("orapm", "ORAPM", "centered offensive ridge coefficient"),
        ("drapm", "DRAPM", "negative centered opponent-defense ridge coefficient"),
        ("rapm", "RAPM", "ORAPM + DRAPM"),
        ("obpr", "OBPR", "offensive ridge coefficient shrunk toward prior-season box prior"),
        ("dbpr", "DBPR", "negative defensive coefficient shrunk toward prior-season box prior"),
        ("bpr", "BPR", "OBPR + DBPR"),
    )
    for key in [stem if years == 1 else f"{stem}_{years}y"]
    for label in [f"{years}Y {label}"]
}
RATING_METRICS.update(
    {
        key: rating(key, label, formula, factor=True)
        for key, label, formula in (
            ("o_ts", "oTS", "100 * centered offensive TS coefficient"),
            ("d_ts", "dTS", "-100 * centered opponent TS coefficient"),
            ("o_tov", "oTOV", "-100 * centered offensive turnover-share coefficient"),
            ("d_tov", "dTOV", "100 * centered opponent turnover-share coefficient"),
            ("o_reb", "oREB", "100 * centered offensive rebound-share coefficient"),
            ("d_reb", "dREB", "-100 * centered opponent rebound-share coefficient"),
        )
    }
)
ON_OFF_METRICS = {
    key: replace(
        rating(key, label, formula),
        category="on_off",
        classification="observed",
        aggregation_recipe="sealed_team_onoff",
        good_direction="low" if "defensive" in key else "high",
        default_sort_direction="asc" if "defensive" in key else "desc",
        validity_definition=(
            "Per-team positive on/off controls; qualification requires 20 games "
            "and 1000 controls on each side on and off."
        ),
    )
    for key, label, formula in (
        ("on_net_rating", "Net on", "on ORtg - on DRtg"),
        ("onoff_net_rating", "Net on/off", "on net - off net"),
        ("on_offensive_rating", "ORtg on", "100 * on points / on offensive controls"),
        ("onoff_offensive_rating", "ORtg on/off", "on ORtg - off ORtg"),
        ("on_defensive_rating", "DRtg on", "100 * on allowed points / on defensive controls"),
        ("onoff_defensive_rating", "DRtg on/off", "on DRtg - off DRtg"),
    )
}
# Served extras exclude retired metrics, which sealed artifacts still carry but nothing serves.
SERVED_EXTRAS = {k: d for k, d in IMPACT_EXTRAS_CATALOG.items() if k not in RETIRED_METRICS}
IMPACT_CATALOG = {**RATING_METRICS, **ON_OFF_METRICS, **SERVED_EXTRAS}
V3_CATALOG = {**METRIC_CATALOG_V2, **IMPACT_CATALOG}
# Sealed impact columns plus v4 values derived from them at serving time; all share impact gates.
IMPACT_COLUMNS = {**IMPACT_CATALOG, **IMPACT_DERIVED}
# Computed in SQL from box totals and impact support, not carried in the sealed rows.
SQL_DERIVED_IMPACT = frozenset({"offensive_load", "ctov_pct", "rim_ast_per_36"})
SERVING_CATALOG = {
    **V3_CATALOG,
    **BOX_METRICS,
    **IMPACT_DERIVED,
    **TRACKING_METRICS,
    **DARKO_METRICS,
}
SERVING_VERSIONS = {VERSION: V3_CATALOG, V4_VERSION: SERVING_CATALOG}
