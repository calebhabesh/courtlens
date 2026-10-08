"""IM07 independent SQL oracles over sealed IM04 originals, never serving helpers."""

from __future__ import annotations

import gzip
import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from courtlens.services.workbench_analytics import ResolvedContext, canonical_hash

SOURCE_ROOT = Path("docs/evidence/im04")


@lru_cache(maxsize=4)
def source_artifacts(root: Path = SOURCE_ROOT) -> tuple[dict[str, Any], ...]:
    seal = json.loads(gzip.decompress((root / "acceptance.json.gz").read_bytes()))
    artifacts = []
    for digest in seal["artifact_hashes"]:
        path = root / "artifacts" / f"{digest}.json.gz"
        # Check retained compressed bytes as well as the original semantic identity.
        relative = str(path.relative_to(root))
        if hashlib.sha256(path.read_bytes()).hexdigest() != seal["evidence_file_sha256"][relative]:
            raise ValueError("IM04 oracle retained bytes changed")
        body = json.loads(gzip.decompress(path.read_bytes()))
        if canonical_hash(body) != digest:
            raise ValueError("IM04 oracle artifact checksum mismatch")
        artifacts.append({"sha256": digest, "body": body})
    return tuple(artifacts)


def coefficient_rows(body: dict[str, Any], metric: str) -> list[dict[str, Any]]:
    """Recompute direct on/off rates; read fitted coefficients and original supports."""
    stem = metric.removesuffix("_2y").removesuffix("_3y")
    rows = []
    for pid, sample in body["rapm"]["players"].items():
        value = None
        qualified = False
        games = sample["games"]
        if stem in {"rapm", "orapm", "drapm", "bpr", "obpr", "dbpr"}:
            family = "bpr" if stem.endswith("bpr") else "rapm"
            sample = body[family]["players"].get(pid, {}) if body[family] else {}
            field = (
                "offense"
                if stem.startswith("o")
                else "defense"
                if stem.startswith("d")
                else "total"
            )
            qualified = sample.get("qualified", False)
            value = sample[field] if qualified else None
            games = sample.get("games", 0)
        elif stem in {"o_ts", "d_ts", "o_tov", "d_tov", "o_reb", "d_reb"}:
            side, target = stem.split("_")
            sample = body["six_factor"][target]["players"].get(pid, {})
            qualified = sample.get("qualified", False)
            value = sample["offense" if side == "o" else "defense"] if qualified else None
            games = sample.get("games", 0)
        elif stem.startswith(("on_", "onoff_")):
            records = [r for key, r in body["on_off"].items() if key.split(":")[0] == pid]
            if len(records) == 1:
                record = records[0]
                rates = {}
                for side in ("on", "off"):
                    totals = record[side]
                    offense = (
                        100 * totals["points"] / totals["off_controls"]
                        if totals["off_controls"]
                        else None
                    )
                    defense = (
                        100 * totals["allowed"] / totals["def_controls"]
                        if totals["def_controls"]
                        else None
                    )
                    rates[side] = {
                        "offensive": offense,
                        "defensive": defense,
                        "net": offense - defense
                        if offense is not None and defense is not None
                        else None,
                    }
                stat = stem.split("_")[1]
                on, off = rates["on"][stat], rates["off"][stat]
                value = (
                    on
                    if stem.startswith("on_")
                    else on - off
                    if on is not None and off is not None
                    else None
                )
                qualified = (
                    games >= 20
                    and min(
                        record[side][control]
                        for side in ("on", "off")
                        for control in ("off_controls", "def_controls")
                    )
                    >= 1000
                )
            else:
                games = 0
        else:
            raise ValueError("Unsupported independent impact oracle metric")
        rows.append({"player_id": pid, "value": value, "n": games, "qualified": qualified})
    return rows


def oracle_answer(
    session: Session,
    context: ResolvedContext,
    case: dict[str, Any],
    *,
    artifacts: tuple[dict[str, Any], ...] | None = None,
) -> dict[str, Any]:
    if session.get_bind().dialect.name != "postgresql" or context.dataset_type != "workbench":
        raise ValueError("IM07 oracle requires PostgreSQL workbench facts")
    oracle = case["oracle"]
    metric = oracle["metric"]
    years = 3 if metric.endswith("_3y") else 2 if metric.endswith("_2y") else 1
    selected = [
        a
        for a in (source_artifacts() if artifacts is None else artifacts)
        if a["body"]["input"]["seasons"][-1] == context.season
        and a["body"]["input"]["phase"] == context.phase
        and len(a["body"]["input"]["seasons"]) == years
        and all(
            g["day"] < context.before_date.isoformat() for g in a["body"]["input"]["games"].values()
        )
    ]
    if len(selected) != 1:
        raise ValueError("IM07 oracle needs exactly one fully observable sealed fit")
    coefficients = coefficient_rows(selected[0]["body"], metric)
    rows = (
        session.execute(
            text("""
        WITH members AS (
            SELECT DISTINCT player_id FROM workbench_player_games
            WHERE dataset_id = :dataset_id AND season = :season AND phase = :phase
              AND game_date < :cutoff AND appearance = 'appeared'
        ), coefficients AS (
            SELECT * FROM jsonb_to_recordset(CAST(:coefficients AS jsonb))
              AS c(player_id text, value double precision, n integer, qualified boolean)
        )
        SELECT m.player_id, c.value, coalesce(c.n, 0) AS n
        FROM members m LEFT JOIN coefficients c USING (player_id)
        WHERE (CAST(:player_id AS text) IS NULL OR m.player_id = CAST(:player_id AS text))
        ORDER BY c.qualified DESC NULLS LAST, c.value DESC NULLS LAST, m.player_id
        LIMIT :limit
    """),
            {
                "dataset_id": context.dataset_id,
                "season": context.season,
                "phase": context.phase,
                "cutoff": context.before_date,
                "coefficients": json.dumps(coefficients),
                "player_id": oracle.get("player_id"),
                "limit": oracle["limit"],
            },
        )
        .mappings()
        .all()
    )
    if not rows:
        raise ValueError("IM07 oracle has no matching observed box cohort")
    return {
        "status": case["expected_status"],
        "kind": "single" if oracle["kind"] == "impact_single" else "ranking",
        "metric": metric,
        "rows": [dict(r) for r in rows],
        "artifact_sha256": selected[0]["sha256"],
        "scope": {
            "release_id": context.release_id,
            "season": context.season,
            "phase": context.phase,
            "before_date": context.before_date.isoformat(),
            "window": "season",
        },
    }
