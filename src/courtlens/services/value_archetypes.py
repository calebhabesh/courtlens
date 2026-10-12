"""Read-only PC09 serving: sealed BPR value rows and derived archetype memberships."""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from typing import Any

from fastapi import HTTPException

from courtlens.config import get_settings
from courtlens.domain.context import CapabilityEntry, CapabilityStatus
from courtlens.domain.metrics import MetricDefinition

VERSION = "courtlens-value-archetypes-serving-v1"
METHOD_URL = "/methodology#value-archetypes"
LIMITATIONS = [
    "Descriptive model estimates under lineup confounding; not causal, a forecast or a verdict.",
    "BPR shrinks toward a box regression trained only on earlier seasons.",
    "Derived archetypes describe one season's statistical style, not a listed position or role.",
    "Players without stints or complete features have no value or archetype; never zero.",
]
CATALOG = [
    MetricDefinition(
        key="value_bpr",
        version="courtlens-value-v1",
        display_name="Value (Box-prior RAPM)",
        short_name="Value",
        category="impact",
        unit="points per 100 possessions",
        formula="sealed IM04 BPR total = ORAPM + favorable-sign DRAPM",
        denominator="counted controls",
        phase_scope=["regular_season"],
        default_sort_direction="desc",
        limitations=LIMITATIONS[:2],
        validity_definition="IM04 rule: 20 games and 1,000 controls on each side for percentiles",
        capability_requirement="value_archetypes_pc09",
        classification="modeled",
        good_direction="higher",
    ),
    MetricDefinition(
        key="archetype_primary",
        version="courtlens-archetypes-v1",
        display_name="Derived archetype",
        short_name="Archetype",
        category="impact",
        unit="cluster label with soft membership",
        formula="Gaussian mixture over nine regular-season rate features",
        denominator=None,
        phase_scope=["regular_season"],
        default_sort_direction="asc",
        limitations=LIMITATIONS[2:],
        validity_definition="complete features; 500 minutes for the training sample",
        capability_requirement="value_archetypes_pc09",
        classification="modeled",
    ),
]


@lru_cache(maxsize=4)
def _decode(raw: bytes) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(raw)
    if body.get("version") != VERSION:
        raise ValueError("unsupported value/archetype serving version")
    return body


def load_value_store() -> dict[str, Any] | None:
    path = get_settings().value_archetypes_manifest
    if path is None or not path.exists():
        return None
    try:
        raw = path.read_bytes()
        # The file name is the external content address; re-hash on every read.
        if hashlib.sha256(raw).hexdigest() != path.stem:
            raise ValueError("value/archetype serving content address changed")
        return _decode(raw)
    except (ValueError, OSError) as exc:
        raise HTTPException(
            status_code=503, detail="Value and archetype serving integrity check failed"
        ) from exc


def _archetype(store: dict[str, Any], record: dict[str, Any] | None) -> dict[str, Any] | None:
    if record is None:
        return None
    clusters = store["archetypes"]["names"]["clusters"]
    ranked = sorted(enumerate(record["membership"]), key=lambda x: (-x[1], x[0]))
    return {
        "season": record["season"],
        "minutes": record["minutes"],
        "games": record["games"],
        "small_sample": not record["qualified"],
        "primary": record["primary"],
        "primary_name": clusters[record["primary"]]["name"],
        "membership": [
            {"cluster": i, "name": clusters[i]["short"], "probability": p}
            for i, p in ranked
            if p >= 0.05
        ],
        "features": record["features"],
    }


def value_archetype_rows(store: dict[str, Any]) -> dict[str, dict[str, Any]]:
    value = store["value"]["players"]
    archetypes = store["archetypes"]["players"]
    rows = {}
    for pid in sorted(value.keys() | archetypes.keys()):
        v = value.get(pid)
        rows[pid] = {
            "player_id": pid,
            "value": v,
            "value_reason": None if v else "No stints in the BPR window; value is unknown.",
            "archetype": _archetype(store, archetypes.get(pid)),
            "archetype_reason": None
            if pid in archetypes
            else "No complete regular-season feature sample; archetype is unknown.",
        }
    return rows


def unknown_row(pid: str) -> dict[str, Any]:
    """A requested player outside both artifacts: unknown with reasons, never zero."""
    return {
        "player_id": pid,
        "value": None,
        "value_reason": "No stints in the BPR window; value is unknown.",
        "archetype": None,
        "archetype_reason": "No complete regular-season feature sample; archetype is unknown.",
    }


def value_archetypes_capability(store: dict[str, Any] | None) -> CapabilityEntry:
    return CapabilityEntry(
        name="value_archetypes_pc09",
        status=CapabilityStatus.AVAILABLE if store else CapabilityStatus.SOURCE_BLOCKED,
        seasons=store["archetypes"]["seasons"] if store else [],
        phases=["regular_season"] if store else [],
        metric_requirements=[m.key for m in CATALOG],
        limitations=LIMITATIONS,
    )


def value_archetypes_summary(store: dict[str, Any] | None) -> dict[str, Any]:
    path = get_settings().value_archetypes_manifest
    base: dict[str, Any] = {
        "status": "available" if store else "unavailable",
        "source": "CourtLens model",
        "version": VERSION,
        "methodology_url": METHOD_URL,
        "manifest_sha256": path.stem if store and path else None,
        "limitations": LIMITATIONS,
        "catalog": [m.to_dict() for m in CATALOG],
        "credit": "Wyman-style shape diagrams credited to @taylormetrics (PC10).",
    }
    if store is None:
        return {**base, "reason": "No sealed value/archetype serving manifest installed."}
    value, archetypes = store["value"], store["archetypes"]
    names = archetypes["names"]
    return {
        **base,
        "value": {
            "label": value["label"],
            "rule": value["rule"],
            "claim": value["claim"],
            "unit": value["unit"],
            "scope": value["scope"],
            "artifact_sha256": value["sha256"],
            "source_artifact": value["source_artifact"],
        },
        "evaluation": store["evaluation"],
        "archetypes": {
            "artifact_sha256": archetypes["sha256"],
            "claim": archetypes["claim"],
            "components": archetypes["components"],
            "features": archetypes["features"],
            "seasons": archetypes["seasons"],
            "training_samples": archetypes["training_samples"],
            "names_status": names["status"],
            "clusters": [
                {
                    "cluster": i,
                    "name": c["name"],
                    "short": c["short"],
                    "description": c["description"],
                    # v1.2 defines six categorical tokens; larger K needs new tokens first.
                    "color_token": f"--color-category-{i + 1}" if i < 6 else None,
                    "weight": archetypes["weights"][i],
                    "means": dict(zip(archetypes["features"], archetypes["means"][i], strict=True)),
                }
                for i, c in enumerate(names["clusters"])
            ],
        },
    }
