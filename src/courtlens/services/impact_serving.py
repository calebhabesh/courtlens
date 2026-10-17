"""Read-only sealed impact serving, independent of forecasts and B26 experiments."""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from courtlens.config import get_settings
from courtlens.domain.impact_catalog import IMPACT_COLUMNS
from courtlens.domain.impact_extras_catalog import RETIRED_METRICS, WAVE_TWO
from courtlens.domain.query_spec import QuerySpec
from courtlens.domain.teams import get_team_info
from courtlens.services.impact_team_splits import team_split

VERSION = "courtlens-impact-serving-v1"
METHOD_URL = "/methodology#impact"
LIMITATIONS = [
    "Descriptive model estimates under lineup confounding; not causal or forecast features.",
    "RAPM omits zero-control side observations; on/off retains their scoring.",
    "The unchanged box-estimate ±2 diagnostic is not an event acceptance gate.",
    "Patched lineups retain minute/plus-minus and unavailable period-minute limitations.",
    "On/off off-court references include team games without a player appearance.",
    "Multi-team on/off is unavailable without a selected team; team records remain separate.",
]
TEAM_LIMITATION = (
    "Ratings retain the full league fit; extras are the player's games with the selected team."
)


@lru_cache(maxsize=8)
def _decode(raw: bytes) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(raw)
    if body.get("version") != VERSION:
        raise ValueError("unsupported impact serving version")
    return body


_verified: dict[Path, tuple[tuple[int, int, int], dict[str, Any]]] = {}


def load_impact_store(manifest_sha256: str | None = None) -> dict[str, Any] | None:
    path = get_settings().impact_serving_manifest
    if manifest_sha256 and path:
        path = path.parent / f"{manifest_sha256}.json"
    if path is None or not path.exists():
        return None
    try:
        # A Stats request reads the store several times; the 47 MB file is re-read and re-hashed
        # whenever its identity (inode, size, modification time) changes, not on every call.
        stat = path.stat()
        signature = (stat.st_ino, stat.st_size, stat.st_mtime_ns)
        cached = _verified.get(path)
        if cached and cached[0] == signature:
            return cached[1]
        raw = path.read_bytes()
        body = _decode(raw)
        # File name is the external content address, not a self-reported success flag.
        if hashlib.sha256(raw).hexdigest() != path.stem:
            raise ValueError("impact serving content address changed")
        _verified[path] = (signature, body)
        return body
    except (ValueError, OSError) as exc:
        raise HTTPException(
            status_code=503, detail="Impact serving integrity check failed"
        ) from exc


def impact_catalog_scope() -> dict[str, Any]:
    store = load_impact_store()
    path = get_settings().impact_serving_manifest
    return {
        "status": "available" if store else "source_blocked",
        "source": "CourtLens model",
        "version": VERSION,
        "manifest_sha256": path.stem if store and path else None,
        "scopes": [e["scope"] for e in store["entries"]] if store else [],
        "methodology_url": METHOD_URL,
        "limitations": LIMITATIONS,
        "unavailable_columns": WAVE_TWO,
    }


def query_fields(query: QuerySpec) -> set[str]:
    """Every field a query sorts, selects, shows or filters by."""
    fields = {s.field for s in query.sort} | {s.key for s in query.metric_selectors}
    if query.view_state:
        fields.update(query.view_state.columns)

    def visit(node: Any) -> None:
        if node is None:
            return
        if hasattr(node, "field"):
            fields.add(node.field)
        else:
            for child in node.predicates:
                visit(child)

    visit(query.predicates)
    return fields


def impact_query_fields(query: QuerySpec) -> set[str]:
    return query_fields(query) & IMPACT_COLUMNS.keys()


def query_uses_impact(query: QuerySpec) -> bool:
    return bool(impact_query_fields(query))


def selected_entries(store: dict[str, Any], query: QuerySpec, cutoff: str) -> list[dict[str, Any]]:
    return [
        e
        for e in store["entries"]
        if e["scope"]["season"] == query.season
        and e["scope"]["phase"] == query.phase
        and e["scope"]["last_included_date"] < cutoff
    ]


def selected_team_id(query: QuerySpec) -> str | None:
    team = get_team_info(query.team_scope.team_id) if query.team_scope.team_id else None
    return team.team_id if team else query.team_scope.team_id


def impact_artifacts(query: QuerySpec, cutoff: str) -> tuple[list[dict[str, Any]], str]:
    """impact_for_query's artifacts and status without assembling every player's values.

    Query hashes bind these; building the player rows for each hash cost milliseconds a call.
    """
    store = load_impact_store(query.impact_manifest_sha256)
    if store is None or query.window.kind.value != "season" or query.season_scope.seasons:
        return [], "unavailable"
    team_id = selected_team_id(query)
    artifacts = []
    for entry in selected_entries(store, query, cutoff):
        bound = artifact_binding(entry, team_id)
        if bound is not None:
            artifacts.append(bound)
    return artifacts, "available" if artifacts else "unavailable"


def artifact_binding(entry: dict[str, Any], team_id: str | None) -> dict[str, Any] | None:
    """An entry's identity in a query; team-filtered extras bind the per-team split they use."""
    if not (team_id and entry["kind"] == "extras"):
        return {"sha256": entry["sha256"], **entry["scope"]}
    split = team_split(entry["sha256"])
    if split is None:
        # Extras are full-season player aggregates, not a selected-team sample.
        return None
    return {"sha256": entry["sha256"], "team_split_sha256": split[0], **entry["scope"]}


def impact_for_query(query: QuerySpec, cutoff: str) -> dict[str, Any]:
    """Select only sealed fits fully observable before this exclusive cutoff."""
    store = load_impact_store(query.impact_manifest_sha256)
    path = get_settings().impact_serving_manifest
    result: dict[str, Any] = {
        "status": "unavailable",
        "source": "CourtLens model",
        "version": VERSION,
        "methodology_url": METHOD_URL,
        "manifest_sha256": (query.impact_manifest_sha256 or path.stem) if store and path else None,
        "artifacts": [],
        "coverage": [],
        "limitations": LIMITATIONS,
        "unavailable_columns": WAVE_TWO,
        "players": {},
    }
    if store is None:
        result["reason"] = "No sealed impact serving bundle installed."
        return result
    if query.window.kind.value != "season" or query.season_scope.seasons:
        result["reason"] = (
            "Sealed impact fits support single-season scopes; "
            "short/date/career windows are unavailable."
        )
        return result
    selected = selected_entries(store, query, cutoff)
    if not selected:
        result["reason"] = (
            "No sealed fit is wholly before this cutoff; later outcomes are never used."
        )
        return result
    team_id = selected_team_id(query)
    for entry in selected:
        bound = artifact_binding(entry, team_id)
        if bound is None:
            continue
        result["artifacts"].append(bound)
        for coverage in entry["coverage"]:
            if coverage not in result["coverage"]:
                result["coverage"].append(coverage)
        players = entry["players"]
        split = team_split(entry["sha256"]) if team_id and entry["kind"] == "extras" else None
        if split is not None:
            # Each player's extras over their games with the selected team only.
            players = {pid: teams[team_id] for pid, teams in split[1].items() if team_id in teams}
        for pid, source in players.items():
            row = result["players"].setdefault(pid, {"metrics": {}, "support": {}, "on_off": {}})
            # Sealed extras still carry retired metrics; they never leave the server.
            row["metrics"].update(
                (k, v) for k, v in source["metrics"].items() if k not in RETIRED_METRICS
            )
            row["support"].update(
                (k, v) for k, v in source["support"].items() if k not in RETIRED_METRICS
            )
            if entry["kind"] == "extras":
                derive_extras(row)
            if entry["kind"] == "ratings" and entry["scope"]["years"] == 1:
                records = source["on_off"]
                row["on_off"] = records
                selected_team = team_id or (next(iter(records)) if len(records) == 1 else None)
                if selected_team in records:
                    record = records[selected_team]
                    for prefix, key in (("on", "on"), ("onoff", "difference")):
                        for stat, label in (
                            ("net", "net"),
                            ("ortg", "offensive"),
                            ("drtg", "defensive"),
                        ):
                            metric = f"{prefix}_{label}_rating"
                            row["metrics"][metric] = record[key][stat]
                            row["support"][metric] = {
                                "team_id": selected_team,
                                "on": record["on"],
                                "off": record["off"],
                                "qualified": min(
                                    record["on"]["off_controls"],
                                    record["on"]["def_controls"],
                                    record["off"]["off_controls"],
                                    record["off"]["def_controls"],
                                )
                                >= 1000
                                and source["support"]["rapm"]["games"] >= 20,
                                "covered_games": source["support"]["rapm"]["games"],
                            }
    result["status"] = "available" if result["artifacts"] else "unavailable"
    if team_id:
        result["limitations"] = [
            *LIMITATIONS,
            TEAM_LIMITATION,
        ]
    return result


def derive_extras(row: dict[str, Any]) -> None:
    """v4 rates from sealed extras support: rim assists per game and per 100 possessions.

    Offensive load and cTOV% are computed in SQL from box totals; they share the possession
    support (and its qualification) of AST/100, whose denominator is offensive possessions.
    """
    support = row["support"]
    rim, possessions = support.get("pbp_rim_assists"), support.get("impact_ast_per100")
    if rim is None or possessions is None:
        return
    games, controls = rim.get("covered_games") or 0, possessions.get("denominator") or 0
    rim_count = rim.get("numerator")
    per_game = rim_count / games if rim_count is not None and games > 0 else None
    per100 = 100 * rim_count / controls if rim_count is not None and controls > 0 else None
    row["metrics"]["rim_ast_per_game"] = per_game
    row["metrics"]["rim_ast_per100"] = per100
    support["rim_ast_per_game"] = {**rim, "value": per_game, "denominator": games or None}
    support["rim_ast_per100"] = {
        **rim,
        "value": per100,
        "denominator": controls or None,
        "qualified": bool(rim.get("qualified") and possessions.get("qualified")),
    }
    for key in ("offensive_load", "ctov_pct"):
        support[key] = {**possessions, "value": None, "numerator": None}
    support["rim_ast_per_36"] = {**rim, "value": None, "denominator": None}


# The only support fields SQL reads (ranking qualification, offensive-load denominator) or the
# row parser needs; the full support is reattached in Python after the query.
SQL_SUPPORT_FIELDS = ("qualified", "covered_games", "denominator")


def impact_sql_rows(impact: dict[str, Any], player_ids: list[str] | None = None) -> str:
    """Bounded coefficient/support payload, never raw play-by-play or game facts.

    Support is slimmed to SQL_SUPPORT_FIELDS: round-tripping every player's full support (about
    22 KB each) through the query and back dominated cold Stats requests. player_ids limits the
    payload to the players a query reads (the join is per player).
    """
    wanted = set(player_ids) if player_ids is not None else None
    return json.dumps(
        [
            {
                "player_id": pid,
                **row["metrics"],
                "support": {
                    key: {field: entry[field] for field in SQL_SUPPORT_FIELDS if field in entry}
                    for key, entry in row["support"].items()
                },
            }
            for pid, row in sorted(impact["players"].items())
            if wanted is None or pid in wanted
        ],
        separators=(",", ":"),
        allow_nan=False,
    )
