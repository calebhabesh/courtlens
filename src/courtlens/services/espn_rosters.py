"""Scheduled, sealed ESPN team rosters for the free-agency roster check. Visitors never fetch.

`courtlens refresh-espn-rosters` fetches all 30 ESPN team rosters serially. When the rosters
differ from the newest sealed bundle it retains each response and seals one content-addressed
`courtlens-espn-rosters-v1` bundle; an unchanged run only records its receipts and rewrites the
small `.checked` heartbeat, so a 6-hourly timer grows storage only when rosters move. Bundles and
their raw responses older than the retention window are pruned, never the newest (hosted on a
shared VPS: see docs/deployment.md). A run that misses any team seals nothing: a partial league
would read every player of the missing team as off a roster. ESPN ids become NBA ids through a
verified crosswalk first, then a normalized name that is unique in the NBA player index (or
unique on the same team); anything else stays unmatched and is listed, never guessed. The newest
bundle in the output directory is the one served, so a timer refreshes it without a config change.
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.ingestion.espn_rosters import ESPN_TEAMS, HOST, URL_PATTERN, parse_roster, roster_url
from courtlens.player_context_models import PlayerContextDataset
from courtlens.services.bref_identity import normalize_name
from courtlens.services.player_context import dataset_rows
from courtlens.services.source_acquisition import (
    KEEP_DAYS,
    ScheduledFetcher,
    keep_body,
    prune_receipts,
    read_heartbeat,
    write_heartbeat,
)
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchIdentityCrosswalk

VERSION = "courtlens-espn-rosters-v1"
SOURCE = "espn_team_rosters"
RESOURCE = "espn_rosters"
ATTRIBUTION = "ESPN team rosters"
INTERVAL_SECONDS = 5.0
TEAM_KEYS = ("espn_team_id", "tricode", "team_id", "acquisition_id", "raw_sha256")
LIMITATIONS = [
    "ESPN's 30 team rosters as fetched; a run that misses any team is not sealed.",
    "ESPN ids are matched to NBA ids by a verified crosswalk, else a normalized name unique in "
    "the NBA player index (or unique on the same team). Unmatched players are listed and never "
    "read as off a roster.",
]


def validate_roster_url(source: str, url: str, season: str) -> float:
    match = URL_PATTERN.fullmatch(url)
    if source != SOURCE or match is None or match[1] not in ESPN_TEAMS:
        raise ValueError("not an ESPN NBA team roster URL")
    return INTERVAL_SECONDS


class RosterFetcher(ScheduledFetcher):
    def __init__(self, session: Session, root: Path, client: httpx.Client) -> None:
        super().__init__(
            session,
            root,
            client,
            resource=RESOURCE,
            kinds={SOURCE: "team_roster"},
            validate_url=validate_roster_url,
            max_bytes=2_000_000,
            # site.api.espn.com answers robots.txt with an edge 403 for every client, ours and a
            # bare curl alike (checked 2026-10-19): it serves no robots file to read.
            robots_optional_hosts=frozenset({HOST}),
            # Bodies are retained only when the rosters changed (see `refresh`).
            retain_bodies=False,
        )


def _index_players(session: Session) -> tuple[list[dict[str, Any]], PlayerContextDataset | None]:
    index = session.scalars(
        select(PlayerContextDataset)
        .where(PlayerContextDataset.kind == "player_index")
        .order_by(
            PlayerContextDataset.observed_at.desc(), PlayerContextDataset.observation_order.desc()
        )
        .limit(1)
    ).first()
    if index is None:
        return [], None
    rows: list[dict[str, Any]] = []
    while page := dataset_rows(session, index, 2000, len(rows)):
        rows.extend(page)
    return rows, index


def match_players(
    teams: list[dict[str, Any]],
    index: list[dict[str, Any]],
    crosswalk: dict[str, str],
) -> list[dict[str, Any]]:
    """Each ESPN athlete with its NBA id (or None) and how it was matched."""
    by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in index:
        by_name[normalize_name(row["name"])].append(row)
    players: list[dict[str, Any]] = []
    for team in teams:
        for athlete in team["players"]:
            key = normalize_name(athlete["name"])
            candidates = by_name.get(key, [])
            same_team = [r for r in candidates if r.get("team_id") == team["team_id"]]
            if athlete["espn_id"] in crosswalk:
                player_id, method = crosswalk[athlete["espn_id"]], "verified_crosswalk"
            elif len(candidates) == 1:
                player_id, method = str(candidates[0]["player_id"]), "name_unique"
            elif len(same_team) == 1:
                player_id, method = str(same_team[0]["player_id"]), "name_team_unique"
            else:
                player_id, method = None, "ambiguous" if candidates else "unmatched"
            players.append(
                {
                    **athlete,
                    "normalized_name": key,
                    "team_id": team["team_id"],
                    "tricode": team["tricode"],
                    "player_id": player_id,
                    "match": method,
                }
            )
    # One NBA id on two rosters is a matching error (or a trade mid-run): keep neither.
    counts: dict[str, int] = defaultdict(int)
    for p in players:
        if p["player_id"]:
            counts[p["player_id"]] += 1
    for p in players:
        if p["player_id"] and counts[p["player_id"]] > 1:
            p["player_id"], p["match"] = None, "duplicate"
    return players


def seal(entry: dict[str, Any], output: Path) -> Path:
    sealed = {
        "version": VERSION,
        "source": {
            "name": ATTRIBUTION,
            "host": HOST,
            "policy": "courtlens-source-policy-v3",
            "limitations": LIMITATIONS,
        },
        "sealed_at": datetime.now(UTC).isoformat(),
        "entry": entry,
    }
    path, _ = write_artifact(output, sealed)
    return path


def roster_digest(season: str, players: list[dict[str, Any]], index_id: str | None) -> str:
    """What the roster check reads: who is on which team, and how they were matched."""
    rows = sorted(
        (p["team_id"], p["espn_id"], p["normalized_name"], p["player_id"] or "") for p in players
    )
    return hashlib.sha256(
        json.dumps([season, index_id, rows], separators=(",", ":")).encode()
    ).hexdigest()


def prune(output: Path, root: Path, keep_days: int, now: datetime) -> dict[str, int]:
    """Delete bundles observed before the window and their raw responses; never the newest.

    Receipts stay in the database (source, time, SHA-256 and size), so a pruned run is still
    accounted for; only its bytes go.
    """
    bundles = _bundles(output)
    if not bundles:
        return {"bundles": 0, "raw": 0}
    newest = max(bundles, key=lambda b: b[1]["entry"]["observed_at"])[0]
    cutoff = now - timedelta(days=keep_days)
    keep: list[tuple[Path, dict[str, Any]]] = []
    drop: list[tuple[Path, dict[str, Any]]] = []
    for path, body in bundles:
        old = datetime.fromisoformat(body["entry"]["observed_at"]) < cutoff
        (drop if old and path != newest else keep).append((path, body))
    kept_raw = {t["raw_sha256"] for _, b in keep for t in b["entry"]["teams"]}
    raw = 0
    for path, body in drop:
        for team in body["entry"]["teams"]:
            sha = team["raw_sha256"]
            file = root / sha[:2] / sha
            if sha not in kept_raw and file.exists():
                file.unlink()
                raw += 1
        path.unlink()
    return {"bundles": len(drop), "raw": raw}


def refresh(
    session: Session,
    root: Path,
    client: httpx.Client,
    output: Path,
    keep_days: int = KEEP_DAYS,
) -> tuple[Path, dict[str, Any]]:
    fetcher = RosterFetcher(session, root, client)
    teams: list[dict[str, Any]] = []
    receipts: list[WorkbenchAcquisition] = []
    finished: list[datetime] = []
    for espn_id in ESPN_TEAMS:
        receipt = fetcher.fetch(SOURCE, roster_url(espn_id), "current")
        session.commit()
        body = fetcher.bodies.get(receipt.id)
        if receipt.status != "success" or body is None or receipt.finished_at is None:
            raise ValueError(
                f"ESPN roster {ESPN_TEAMS[espn_id][1]}: {receipt.error_summary}; no bundle sealed"
            )
        team = parse_roster(body, espn_id)
        teams.append(
            {**team, "acquisition_id": str(receipt.id), "raw_sha256": receipt.content_sha256}
        )
        receipts.append(receipt)
        done = receipt.finished_at
        finished.append(done if done.tzinfo else done.replace(tzinfo=UTC))
    seasons = {t["season"] for t in teams}
    if len(seasons) != 1:
        raise ValueError(f"ESPN rosters disagree on the season: {sorted(seasons)}")
    index, index_dataset = _index_players(session)
    crosswalk = {
        m.source_id: m.target_id
        for m in session.scalars(
            select(WorkbenchIdentityCrosswalk).where(
                WorkbenchIdentityCrosswalk.source_namespace == "espn",
                WorkbenchIdentityCrosswalk.target_namespace == "nba",
                WorkbenchIdentityCrosswalk.kind == "player",
                WorkbenchIdentityCrosswalk.confidence == "verified",
            )
        )
    }
    players = match_players(teams, index, crosswalk)
    season = seasons.pop()
    digest = roster_digest(season, players, index_dataset.id if index_dataset else None)
    checked_at = max(finished).isoformat()
    run = [str(r.id) for r in receipts]
    summary: dict[str, Any] = {
        "season": season,
        "teams": len(teams),
        "players": len(players),
        "matched": sum(p["player_id"] is not None for p in players),
        "unmatched": [p["name"] for p in players if p["player_id"] is None],
    }
    output.mkdir(parents=True, exist_ok=True)
    latest = _newest(output)
    receipts_pruned = prune_receipts(session, SOURCE, keep_days, max(finished))
    if latest is not None and latest[1]["entry"].get("roster_sha256") == digest:
        write_heartbeat(
            output, {"manifest_sha256": latest[0].stem, "checked_at": checked_at, "run": run}
        )
        return latest[0], {**summary, "changed": False, "pruned": {"receipts": receipts_pruned}}
    # Changed: keep this run's bytes so the new bundle can be re-derived from its sources.
    for receipt in receipts:
        keep_body(fetcher, receipt, "application/json")
    session.commit()
    entry = {
        "season": season,
        # The run's last completed fetch: every roster is at least this fresh.
        "observed_at": checked_at,
        "started_at": min(finished).isoformat(),
        "capture": "scheduled_fetch",
        "roster_sha256": digest,
        "player_index": (
            {"dataset_id": index_dataset.id, "observed_at": index_dataset.observed_at.isoformat()}
            if index_dataset
            else None
        ),
        "teams": [{k: t[k] for k in TEAM_KEYS} | {"players": len(t["players"])} for t in teams],
        "players": players,
    }
    path = seal(entry, output)
    write_heartbeat(output, {"manifest_sha256": path.stem, "checked_at": checked_at, "run": run})
    pruned = prune(output, root, keep_days, max(finished)) | {"receipts": receipts_pruned}
    return path, {**summary, "changed": True, "pruned": pruned}


_cache: dict[Path, tuple[tuple[int, int], tuple[Path, dict[str, Any]] | None]] = {}


def _verified(path: Path) -> dict[str, Any] | None:
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != path.stem:
        return None
    body: dict[str, Any] = json.loads(raw)
    return body if body.get("version") == VERSION else None


def _bundles(directory: Path) -> list[tuple[Path, dict[str, Any]]]:
    bundles: list[tuple[Path, dict[str, Any]]] = []
    for path in directory.glob("*.json"):
        try:
            body = _verified(path)
        except (OSError, ValueError):
            continue
        if body is not None:
            bundles.append((path, body))
    return bundles


def _newest(directory: Path) -> tuple[Path, dict[str, Any]] | None:
    bundles = _bundles(directory)
    return max(bundles, key=lambda b: b[1]["entry"]["observed_at"]) if bundles else None


def load_latest() -> tuple[Path, dict[str, Any]] | None:
    """The newest intact bundle in the configured directory; a damaged file is skipped."""
    directory = get_settings().espn_rosters_dir
    if directory is None or not directory.is_dir():
        return None
    stat = directory.stat()
    signature = (stat.st_mtime_ns, stat.st_ino)
    cached = _cache.get(directory)
    if cached and cached[0] == signature:
        return cached[1]
    latest = _newest(directory)
    _cache[directory] = (signature, latest)
    return latest


def last_checked(path: Path, body: dict[str, Any]) -> str:
    """When this bundle's rosters were last confirmed: the heartbeat if it names this bundle."""
    beat = read_heartbeat(path.parent)
    if beat is None or beat.get("manifest_sha256") != path.stem:
        return str(body["entry"]["observed_at"])
    return max(str(beat["checked_at"]), str(body["entry"]["observed_at"]))
