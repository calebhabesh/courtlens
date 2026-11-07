"""Wingspan coverage beyond the combine (RD01 round 2, owner 2026-11-07).

CraftedNBA's reported height and wingspan for current players, sealed once and served beside the
frozen R10 results. The page is retained byte for byte (gzipped, SHA-256 of the raw bytes recorded)
and parsed into one committed seal whose content hash is checked on every load, so the hosted demo
serves it from the image.
Names are matched to NBA person IDs against the frozen combine players and DARKO's board on the seal
date: a unique normalized name matches; several IDs resolve to the one on that board, or stay out.

Combine measurements always win. Reported values never enter percentiles, positional averages or the
frozen `courtlens-wingspan-ddpm-v1` correlations; they carry `measurement_source = "craftednba"`.
"""

from __future__ import annotations

import gzip
import hashlib
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import Any

from courtlens.domain.source_policy import POLICY_VERSION
from courtlens.ingestion.craftednba import ATTRIBUTION, HOST, URL, parse_length_page
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.services.bref_identity import normalize_name

VERSION = "courtlens-wingspan-coverage-v1"
SOURCES_DIR = Path("evaluation/research/sources")
SEAL_PATH = SOURCES_DIR / f"{VERSION}.json"
LIMITATIONS = [
    "CraftedNBA credits no measurement source and doesn't say whether heights are with or without "
    "shoes; its values are labelled reported, never combine-measured.",
    "Reported values stay out of percentiles, positional averages and the registered correlations.",
    "The combine's measurement wins wherever a player has both.",
    "Names are matched to NBA person IDs; a name that fits several players and can't be settled by "
    "DARKO's board on the seal date is left out and listed.",
]
# CraftedNBA lists some players by nickname; the NBA's own name is used to match (reviewed by hand).
ALIASES = {
    "bones-hyland": "Nah'Shon Hyland",
    "alex-sarr": "Alexandre Sarr",
    "nic-claxton": "Nicolas Claxton",
    "bub-carrington": "Carlton Carrington",
}
_cache: dict[str, dict[str, Any]] = {}


def match_ids(
    rows: list[dict[str, Any]], frozen: list[dict[str, Any]], board: dict[str, Any] | None
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Matched rows (with `player_id`), ambiguous and unmatched rows, in the page's order."""
    pool: dict[str, set[str]] = defaultdict(set)
    for player in frozen:
        pool[normalize_name(player["name"])].add(player["player_id"])
    on_board = set(board["players"]) if board else set()
    for pid, rating in (board["players"] if board else {}).items():
        if rating.get("name"):
            pool[normalize_name(rating["name"])].add(pid)
    matched, ambiguous, unmatched = [], [], []
    taken: dict[str, str] = {}
    for row in rows:
        ids = pool.get(normalize_name(ALIASES.get(row["slug"], row["name"])), set())
        if len(ids) > 1 and len(ids & on_board) == 1:
            ids = ids & on_board
        if not ids:
            unmatched.append({"slug": row["slug"], "name": row["name"], "team": row["team"]})
        elif len(ids) > 1:
            ambiguous.append({"slug": row["slug"], "name": row["name"], "ids": sorted(ids)})
        else:
            pid = next(iter(ids))
            if pid in taken:
                ambiguous.append(
                    {"slug": row["slug"], "name": row["name"], "ids": [pid], "also": taken[pid]}
                )
                continue
            taken[pid] = row["slug"]
            matched.append({**row, "player_id": pid})
    return matched, ambiguous, unmatched


def _agreement(matched: list[dict[str, Any]], frozen: list[dict[str, Any]]) -> dict[str, Any]:
    """How CraftedNBA compares with the combine where a player has both (evidence, not a rule)."""
    by_id = {p["player_id"]: p for p in frozen if p["measured"]}
    pairs = [(m, by_id[m["player_id"]]) for m in matched if m["player_id"] in by_id]
    if not pairs:
        return {"players": 0}

    def summary(key: str, combine_key: str) -> dict[str, Any]:
        gaps = [
            m[key] - c[combine_key]
            for m, c in pairs
            if m[key] is not None and c[combine_key] is not None
        ]
        return {
            "compared": len(gaps),
            "equal": sum(abs(g) < 1e-9 for g in gaps),
            "within_half_inch": sum(abs(g) <= 0.5 for g in gaps),
            "mean_gap": round(mean(gaps), 4) if gaps else None,
        }

    return {
        "players": len(pairs),
        "height_vs_barefoot": summary("height", "height"),
        "height_vs_shoes": summary("height", "height_shoes"),
        "wingspan": summary("wingspan", "wingspan"),
    }


def build(
    raw: bytes, observed_at: datetime, results: dict[str, Any], board: dict[str, Any] | None
) -> dict[str, Any]:
    if observed_at.tzinfo is None:
        raise ValueError("observed_at must include a timezone")
    rows = parse_length_page(raw)
    matched, ambiguous, unmatched = match_ids(rows, results["players"], board)
    frozen = {p["player_id"]: p for p in results["players"]}
    body: dict[str, Any] = {
        "version": VERSION,
        "source": {
            "name": ATTRIBUTION,
            "host": HOST,
            "url": URL,
            "policy": POLICY_VERSION,
            "limitations": LIMITATIONS,
        },
        "observed_at": observed_at.isoformat(),
        "raw_sha256": hashlib.sha256(raw).hexdigest(),
        "results_sha256": results["results_sha256"],
        "board": None
        if board is None
        else {"season": board["season"], "data_date": board["data_date"]},
        "counts": {
            "rows": len(rows),
            "matched": len(matched),
            "combine_measured": sum(
                1 for m in matched if frozen.get(m["player_id"], {}).get("measured")
            ),
            "fills_combine_row": sum(
                1
                for m in matched
                if m["player_id"] in frozen and not frozen[m["player_id"]]["measured"]
            ),
            "adds_player": sum(1 for m in matched if m["player_id"] not in frozen),
            "ambiguous": len(ambiguous),
            "unmatched": len(unmatched),
            "listed_length_differs": sum(
                1
                for r in rows
                if r["height"] is not None
                and r["wingspan"] is not None
                and r["listed_length"] is not None
                and abs(r["wingspan"] - r["height"] - r["listed_length"]) > 0.01
            ),
        },
        "agreement_with_combine": _agreement(matched, results["players"]),
        "players": matched,
        "ambiguous": ambiguous,
        "unmatched": unmatched,
    }
    body["seal_sha256"] = content_hash(body)
    return body


def write(raw: bytes, sealed: dict[str, Any], root: Path = SOURCES_DIR) -> tuple[Path, Path]:
    """The gzipped raw page (named by its SHA-256) and the seal; neither is ever rewritten."""
    raw_path = root / "raw" / f"craftednba-length-{sealed['raw_sha256'][:16]}.html.gz"
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    if not raw_path.exists():
        raw_path.write_bytes(gzip.compress(raw, mtime=0))
    seal_path = root / f"{VERSION}.json"
    payload = (json.dumps(sealed, indent=1, sort_keys=True, ensure_ascii=False) + "\n").encode()
    if seal_path.exists() and seal_path.read_bytes() != payload:
        raise ValueError(f"{seal_path} exists with different content; seal a new version instead")
    seal_path.write_bytes(payload)
    return raw_path, seal_path


def load(path: Path = SEAL_PATH) -> dict[str, Any] | None:
    """The verified seal, or None when none is committed (combine players only then)."""
    if not path.exists():
        return None
    stat = path.stat()
    key = f"{path}:{stat.st_mtime_ns}:{stat.st_size}"
    if key in _cache:
        return _cache[key]
    body: dict[str, Any] = json.loads(path.read_bytes())
    claimed = body.pop("seal_sha256")
    if content_hash(body) != claimed:
        raise ValueError("wingspan coverage seal changed")
    body["seal_sha256"] = claimed
    _cache.clear()
    _cache[key] = body
    return body


def verify_raw(sealed: dict[str, Any], root: Path = SOURCES_DIR) -> bool:
    """The retained page still has the sealed hash and parses to the sealed rows."""
    raw_path = root / "raw" / f"craftednba-length-{sealed['raw_sha256'][:16]}.html.gz"
    raw = gzip.decompress(raw_path.read_bytes())
    rows: int = sealed["counts"]["rows"]
    return (
        hashlib.sha256(raw).hexdigest() == sealed["raw_sha256"]
        and len(parse_length_page(raw)) == rows
    )
