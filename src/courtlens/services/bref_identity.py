"""Basketball-Reference -> NBA player crosswalks by the owner-approved name-and-team rule.

Approved 2026-10-12 (PC06 unblock). A BRef player maps to an NBA person only when the
normalized name AND the current team agree between a retained BRef contract page and a
pinned NBA player index, and the pairing is unique on both sides. Ties, collisions and
cross-team conflicts stay unresolved. Mappings carry their own confidence tier
(`name_team_unique`), never `verified`, and keep the evidence that produced them.
"""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.ingestion.finance_sources import parse_bref
from courtlens.models import utc_now
from courtlens.services.finance_refresh import read_source
from courtlens.services.player_context import dataset_rows, resolve_dataset
from courtlens.workbench_models import (
    WorkbenchAcquisition,
    WorkbenchIdentity,
    WorkbenchIdentityCrosswalk,
)

RULE_VERSION = "bref-name-team-v1"
CONFIDENCE = "name_team_unique"
METHOD = "exact_name_current_team"
SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def normalize_name(name: str) -> str:
    """Case, accents, punctuation and generational suffixes never decide a match alone."""
    text = unicodedata.normalize("NFKD", name)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    # "A.J." and "AJ", "D'Angelo" and "DAngelo" are spellings, not different people.
    text = re.sub(r"[.'\u2019]", "", text)
    tokens = [t for t in re.split(r"[^a-z0-9]+", text) if t]
    # Spaced initials ("A. J. Lawson", Wikipedia's style) are the same spelling as "A.J.".
    joined: list[str] = []
    initials = False
    for token in tokens:
        if len(token) == 1 and initials:
            joined[-1] += token
        else:
            joined.append(token)
            initials = len(token) == 1
    tokens = joined
    while len(tokens) > 2 and tokens[-1] in SUFFIXES:
        tokens.pop()
    return " ".join(tokens)


def roster_players(session: Session, roster_dataset_id: str) -> tuple[Any, list[dict[str, Any]]]:
    roster = resolve_dataset(session, roster_dataset_id, kind="player_index")
    rows: list[dict[str, Any]] = []
    while page := dataset_rows(session, roster, 2000, len(rows)):
        rows.extend(page)
    return roster, [r for r in rows if r.get("roster_status") == "active" and r.get("team_id")]


def propose_mappings(
    session: Session, acquisition_ids: list[str], roster_dataset_id: str, root: Path
) -> dict[str, Any]:
    """Pure proposal: reads retained pages and the pinned index, writes nothing."""
    roster, players = roster_players(session, roster_dataset_id)
    nba_by_key: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for player in players:
        nba_by_key[(player["team_id"], normalize_name(player["name"]))].append(player)
    bref_by_key: dict[tuple[str, str], set[str]] = defaultdict(set)
    bref_rows: dict[str, dict[str, Any]] = {}
    pages = []
    for acquisition_id in sorted(acquisition_ids):
        receipt = session.get(WorkbenchAcquisition, acquisition_id)
        if (
            receipt is None
            or receipt.source_name != "bref_contracts"
            or receipt.status != "success"
            or receipt.metadata_json.get("season") != roster.season
        ):
            raise ValueError("mapping requires successful BRef acquisitions for the roster season")
        pages.append({"acquisition_id": receipt.id, "url": receipt.source_url})
        for row in parse_bref(
            read_source(session, receipt, root), roster.season, receipt.source_url
        ):
            key = (row["team_id"], normalize_name(row["name"]))
            bref_by_key[key].add(row["entity_id"])
            bref_rows.setdefault(
                row["entity_id"],
                {"name": row["name"], "teams": set(), "acquisitions": set()},
            )
            bref_rows[row["entity_id"]]["teams"].add(row["team_id"])
            bref_rows[row["entity_id"]]["acquisitions"].add(receipt.id)

    candidates: dict[str, set[str]] = defaultdict(set)  # bref id -> nba ids
    evidence: dict[tuple[str, str], dict[str, Any]] = {}
    unresolved: dict[str, str] = {}
    for key, bref_ids in bref_by_key.items():
        team_id, normalized = key
        nba_matches = nba_by_key.get(key, [])
        if len(bref_ids) > 1:
            for bref_id in bref_ids:
                unresolved[bref_id] = "Several BRef players share this name on the team page."
            continue
        if not nba_matches:
            continue  # no current-team match; the player stays unresolved below
        if len(nba_matches) > 1:
            unresolved[next(iter(bref_ids))] = "Several NBA index players share this name/team."
            continue
        bref_id, player = next(iter(bref_ids)), nba_matches[0]
        candidates[bref_id].add(player["player_id"])
        evidence[(bref_id, player["player_id"])] = {
            "rule": RULE_VERSION,
            "team_id": team_id,
            "normalized_name": normalized,
            "bref_name": bref_rows[bref_id]["name"],
            "nba_name": player["name"],
            "roster_dataset_id": roster.id,
            "roster_content_sha256": roster.content_sha256,
            "acquisition_ids": sorted(bref_rows[bref_id]["acquisitions"]),
        }
    by_nba: dict[str, set[str]] = defaultdict(set)
    for bref_id, nba_ids in candidates.items():
        for nba_id in nba_ids:
            by_nba[nba_id].add(bref_id)
    mappings = []
    for bref_id, nba_ids in sorted(candidates.items()):
        if bref_id in unresolved:
            continue
        if len(nba_ids) != 1:
            unresolved[bref_id] = "Matches different NBA players on different team pages."
            continue
        nba_id = next(iter(nba_ids))
        if len(by_nba[nba_id]) != 1:
            unresolved[bref_id] = "The NBA player also matches another BRef player."
            continue
        mappings.append(
            {"bref_id": bref_id, "nba_id": nba_id, "evidence": evidence[(bref_id, nba_id)]}
        )
    mapped = {m["bref_id"] for m in mappings}
    for bref_id in bref_rows:
        if bref_id not in mapped and bref_id not in unresolved:
            unresolved[bref_id] = "No NBA index player with this name on the same current team."
    return {
        "rule": RULE_VERSION,
        "roster_dataset_id": roster.id,
        "pages": pages,
        "bref_players": len(bref_rows),
        "mappings": mappings,
        "unresolved": [
            {
                "bref_id": k,
                "name": bref_rows[k]["name"],
                "teams": sorted(bref_rows[k]["teams"]),
                "reason": v,
            }
            for k, v in sorted(unresolved.items())
        ],
    }


def record_mappings(session: Session, proposal: dict[str, Any]) -> dict[str, int]:
    """Append new crosswalk rows; existing pairs (any confidence) are left untouched.

    A BRef id that already maps elsewhere is a conflict and is reported, never overwritten.
    """
    created = kept = conflicts = 0
    now = utc_now()
    for mapping in proposal["mappings"]:
        existing = list(
            session.scalars(
                select(WorkbenchIdentityCrosswalk).where(
                    WorkbenchIdentityCrosswalk.source_namespace == "bref",
                    WorkbenchIdentityCrosswalk.source_id == mapping["bref_id"],
                    WorkbenchIdentityCrosswalk.target_namespace == "nba",
                    WorkbenchIdentityCrosswalk.kind == "player",
                )
            ).all()
        )
        if any(e.target_id != mapping["nba_id"] for e in existing):
            conflicts += 1
            continue
        if existing:
            kept += 1
            continue
        session.add(
            WorkbenchIdentityCrosswalk(
                source_namespace="bref",
                source_id=mapping["bref_id"],
                target_namespace="nba",
                target_id=mapping["nba_id"],
                kind="player",
                confidence=CONFIDENCE,
                mapping_method=METHOD,
                evidence_json=mapping["evidence"],
                created_at=now,
                updated_at=now,
            )
        )
        created += 1
    session.flush()
    return {"created": created, "kept": kept, "conflicts": conflicts}


def register_index_identities(session: Session, roster_dataset_id: str) -> dict[str, int]:
    """Add registry rows for active NBA index players that box-score ingestion never saw.

    The NBA person id is attested by the pinned official index; no name matching occurs.
    """
    roster, players = roster_players(session, roster_dataset_id)
    known = set(
        session.scalars(
            select(WorkbenchIdentity.external_id).where(
                WorkbenchIdentity.namespace == "nba", WorkbenchIdentity.kind == "player"
            )
        ).all()
    )
    created = 0
    for player in players:
        if player["player_id"] in known:
            continue
        session.add(
            WorkbenchIdentity(
                namespace="nba",
                external_id=player["player_id"],
                kind="player",
                display_name=player["name"],
                metadata_json={
                    "aliases": [player["name"]],
                    "registered_from": {
                        "player_context_dataset_id": roster.id,
                        "content_sha256": roster.content_sha256,
                    },
                },
            )
        )
        known.add(player["player_id"])
        created += 1
    session.flush()
    return {"active_index_players": len(players), "registered": created}
