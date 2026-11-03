"""Daily in-season statistics: hoopR box scores into a new full release; old daily ones retired.

`courtlens refresh-season-stats` (a `refresh-daily` step) keeps the in-progress season current:

1. Acquire. GitHub's commits API names hoopR's newest commit; the season's schedule and every
   final game's `boxscoretraditionalv3` document are read pinned to it. A game is fetched once,
   then again while it is within `recheck_days` of today (the NBA corrects box scores for a few
   days). Each new or changed document is retained (content-addressed raw store, receipt per
   fetch); an unchanged recheck keeps only its receipt, pruned after the window.
2. Rebuild. Every retained game is flattened into SportsDataverse's release-asset columns
   (`ingestion/hoopr_boxscores.py`) and written as `sportsdataverse_<year>/player_boxscores_*.csv`
   and `team_boxscores_*.csv`, where the existing importer reads them unchanged.
3. Publish. When the season's files changed, `import_workbench_data` seals a new dataset (every
   season, marked `builder: season-refresh`), `publish_workbench_release` swaps the public pointer
   and Stats cohorts are warmed for it.
4. Retire. Daily-built datasets other than the published one and the one before it are deleted
   with their rows, release binding and snapshot (deleting is an admin mutation; impact datasets
   stay append-only and are never touched). A dataset an assistant answer, saved analysis,
   forecast or live reconciliation cites is kept. Storage stays at about two full releases.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from courtlens.domain.source_policy import USER_AGENT
from courtlens.ingestion.hoopr_boxscores import (
    FAMILIES,
    PLAYER_COLUMNS,
    REPO,
    TEAM_COLUMNS,
    URL_PATTERN,
    boxscore_url,
    final_games,
    flatten_game,
    matchup_rows,
    playbyplay_rows,
    schedule_url,
)
from courtlens.services.source_acquisition import (
    KEEP_DAYS,
    ScheduledFetcher,
    keep_body,
    prune_receipts,
)
from courtlens.warehouse_models import PublishedSnapshot, ServingSnapshot, WarehouseBuild
from courtlens.workbench_models import (
    WorkbenchDataset,
    WorkbenchReleaseBinding,
    allow_admin_mutation,
)

SOURCE = "hoopr_nba_stats_raw"
RESOURCE = "season_boxscores"
BUILDER = "season-refresh"
INTERVAL_SECONDS = 1.0
RECHECK_DAYS = 3
KEEP_RELEASES = 2


def validate_raw_url(source: str, url: str, season: str) -> float:
    match = URL_PATTERN.fullmatch(url)
    end_year = int(season[:4]) + 1
    years = {match[2], match[4]} - {None} if match else set()
    if source != SOURCE or match is None or years != {str(end_year)}:
        raise ValueError("not a pinned hoopR box score or schedule for this season")
    return INTERVAL_SECONDS


class BoxscoreFetcher(ScheduledFetcher):
    def __init__(self, session: Session, root: Path, client: httpx.Client) -> None:
        super().__init__(
            session,
            root,
            client,
            resource=RESOURCE,
            kinds={SOURCE: "boxscores"},
            validate_url=validate_raw_url,
            max_bytes=12_000_000,
            retain_bodies=False,
        )


def latest_revision(client: httpx.Client) -> str:
    """hoopR's newest commit on main; every file is then read pinned to it."""
    response = client.get(
        f"https://api.github.com/repos/{REPO}/commits",
        params={"per_page": 1},
        headers={"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"},
        timeout=30,
    )
    response.raise_for_status()
    commits = response.json()
    revision = commits[0]["sha"] if isinstance(commits, list) and commits else None
    if not isinstance(revision, str) or len(revision) != 40:
        raise ValueError("hoopR returned no revision")
    return revision


def _write(path: Path, body: bytes) -> bool:
    """Atomically replace `path` with `body`; False when it already holds those bytes."""
    if path.exists() and path.read_bytes() == body:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_bytes(body)
    os.replace(tmp, path)
    return True


def _csv(rows: list[dict[str, str]], columns: list[str]) -> bytes:
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


def _game_dates(schedule: bytes) -> dict[str, date]:
    days: dict[str, date] = {}
    for day in json.loads(schedule).get("leagueSchedule", {}).get("gameDates", []):
        for game in day.get("games", []):
            stamp = game.get("gameDateEst") or ""
            if stamp:
                days[str(game.get("gameId"))] = date.fromisoformat(stamp[:10])
    return days


def _validate(family: str, body: bytes, game_id: str, end_year: int) -> None:
    """Parse a document as its importer will; one that fails is never kept."""
    if family == "boxscoretraditionalv3":
        flatten_game(body, game_id, end_year)
    elif family == "playbyplayv3":
        playbyplay_rows(body, game_id)
    else:
        matchup_rows(body, game_id)


def _index(store: Path, end_year: int) -> dict[str, dict[str, str]]:
    """{family: {game id: SHA-256 of its newest retained document}}."""
    path = store / str(end_year) / "index.json"
    index = json.loads(path.read_text()) if path.exists() else {}
    if index and not set(index) <= set(FAMILIES):  # first format: box scores only
        index = {"boxscoretraditionalv3": index}
    return {family: dict(index.get(family, {})) for family in FAMILIES}


def season_documents(store: Path, end_year: int, family: str) -> dict[str, bytes]:
    """Every retained document of one family for the season, hash-checked."""
    documents = {}
    for game_id, sha in sorted(_index(store, end_year)[family].items()):
        body = (store / sha[:2] / sha).read_bytes()
        if hashlib.sha256(body).hexdigest() != sha:
            raise ValueError(f"retained {family} for {game_id} changed on disk")
        documents[game_id] = body
    return documents


def acquire_season(
    session: Session,
    raw_root: Path,
    store: Path,
    client: httpx.Client,
    end_year: int,
    today: date,
    recheck_days: int = RECHECK_DAYS,
    keep_days: int = KEEP_DAYS,
) -> dict[str, Any]:
    """Fetch the schedule and new or recent final games; rebuild the season's CSVs.

    Each final game's box score, play-by-play and matchups are read pinned to one hoopR
    commit; `store` holds the content-addressed documents and `index.json`. A document not yet
    published (404) is reported and retried next run; a refused host (403/429) ends the run
    before anything is rewritten. Only the box scores and schedule feed the statistics release
    (`changed`); play-by-play and matchups feed the weekly impact run (`impact_changed`).
    """
    season = f"{end_year - 1}-{end_year % 100:02d}"
    revision = latest_revision(client)
    fetcher = BoxscoreFetcher(session, store, client)
    receipt = fetcher.fetch(SOURCE, schedule_url(revision, end_year), season)
    session.commit()
    schedule = fetcher.bodies.get(receipt.id)
    if receipt.status != "success" or schedule is None:
        raise ValueError(f"hoopR schedule: {receipt.error_summary}; nothing rebuilt")
    finals = final_games(schedule, end_year)
    dates = _game_dates(schedule)
    index = _index(store, end_year)
    recent = today - timedelta(days=recheck_days)
    fetched: dict[str, int] = dict.fromkeys(FAMILIES, 0)
    changed: dict[str, int] = dict.fromkeys(FAMILIES, 0)
    missing: dict[str, list[str]] = {family: [] for family in FAMILIES}
    for game_id in finals:
        for family in FAMILIES:
            if game_id in index[family] and dates.get(game_id, today) < recent:
                continue
            url = boxscore_url(revision, end_year, game_id, family)
            receipt = fetcher.fetch(SOURCE, url, season)
            session.commit()
            body = fetcher.bodies.get(receipt.id)
            if receipt.status != "success" or body is None:
                if fetcher.stopped:
                    raise ValueError(f"hoopR refused {family} {game_id}: {receipt.error_summary}")
                missing[family].append(game_id)  # not published yet (404): retried next run
                continue
            fetched[family] += 1
            _validate(family, body, game_id, end_year)
            digest = hashlib.sha256(body).hexdigest()
            if index[family].get(game_id) != digest:
                keep_body(fetcher, receipt, "application/json")
                session.commit()
                index[family][game_id] = digest
                changed[family] += 1
    _write(store / str(end_year) / "index.json", json.dumps(index, sort_keys=True).encode())
    players: list[dict[str, str]] = []
    teams: list[dict[str, str]] = []
    for game_id, body in season_documents(store, end_year, "boxscoretraditionalv3").items():
        p, t = flatten_game(body, game_id, end_year)
        players.extend(p)
        teams.extend(t)
    season_dir = raw_root / f"sportsdataverse_{end_year}"
    files = {
        "raw_schedule_json": (season_dir / f"schedule_{end_year}.json", schedule),
        "player_boxscores": (
            season_dir / f"player_boxscores_{end_year}.csv",
            _csv(players, PLAYER_COLUMNS) if players else None,
        ),
        "team_boxscores": (
            season_dir / f"team_boxscores_{end_year}.csv",
            _csv(teams, TEAM_COLUMNS) if teams else None,
        ),
    }
    rewrote = [
        name for name, (path, body) in files.items() if body is not None and _write(path, body)
    ]
    _write_manifest(season_dir, end_year, revision, files, force=bool(rewrote))
    pruned = prune_receipts(session, SOURCE, keep_days, datetime.now(UTC))
    return {
        "season": season,
        "revision": revision,
        "final_games": len(finals),
        "games": {family: len(index[family]) for family in FAMILIES},
        "fetched": fetched,
        "new_or_corrected": changed,
        "not_yet_published": {f: ids for f, ids in missing.items() if ids},
        "rewrote": rewrote,
        "changed": bool(rewrote),
        "impact_changed": bool(changed["playbyplayv3"] or changed["boxscorematchupsv3"]),
        "pruned": {"receipts": pruned},
    }


def _write_manifest(
    season_dir: Path,
    end_year: int,
    revision: str,
    files: dict[str, tuple[Path, bytes | None]],
    *,
    force: bool,
) -> None:
    """The season's retrieval receipt (as the release-asset acquisition writes one): each file's
    path, size and SHA-256, so the impact pipeline binds box bytes to it before reading them."""
    path = season_dir / "retrieval-manifest.json"
    entries = {}
    for name, (file, _) in files.items():
        if file.exists():
            body = file.read_bytes()
            entries[name] = {
                "url": schedule_url(revision, end_year)
                if name == "raw_schedule_json"
                else f"derived:hoopR boxscoretraditionalv3 at {revision}",
                "path": str(file),
                "bytes": len(body),
                "sha256": hashlib.sha256(body).hexdigest(),
            }
    if not force and path.exists():
        old = json.loads(path.read_text()).get("files", {})
        if {k: (v["sha256"], v["bytes"]) for k, v in old.items()} == {
            k: (v["sha256"], v["bytes"]) for k, v in entries.items()
        }:
            return
    manifest = {
        "source": f"sportsdataverse/hoopR-nba-stats-raw@{revision}",
        "ending_year": end_year,
        "canonical_season": f"{end_year - 1}-{end_year % 100:02d}",
        "acquired_at_utc": datetime.now(UTC).isoformat(),
        "license_declared": "hoopR (MIT); underlying NBA data rights unverified",
        "files": entries,
    }
    _write(path, (json.dumps(manifest, indent=2) + "\n").encode())


def publish_season(session: Session, raw_root: Path) -> dict[str, Any]:
    """Seal a dataset from the raw season files, publish it and warm its Stats cohorts."""
    from courtlens.services.player_career import warm_stats_cohorts
    from courtlens.services.workbench_ingestion import (
        import_workbench_data,
        publish_workbench_release,
    )

    dataset = import_workbench_data(session, raw_root=raw_root, builder=BUILDER)
    session.commit()
    binding = publish_workbench_release(session, dataset.id)
    warmed = warm_stats_cohorts(session, binding.snapshot_id, prune=True)
    return {"dataset_id": dataset.id, "release_id": binding.snapshot_id, "warmed": warmed}


# Tables citing a dataset as user history: a cited dataset is never retired.
_CITED = (
    "assistant_turn_inputs.workbench_dataset_id",
    "saved_conversation_analyses.workbench_dataset_id",
    "forecast_issuances.dataset_id",
    "live_reconciliations.dataset_id",
)
# Rows owned by a dataset without ON DELETE CASCADE.
_OWNED = (
    "workbench_player_games",
    "workbench_team_games",
    "workbench_schedules",
    "workbench_dataset_members",
)


def _published(session: Session) -> set[str]:
    return {
        b.dataset_id
        for b in session.scalars(
            select(WorkbenchReleaseBinding).where(
                WorkbenchReleaseBinding.snapshot_id.in_(select(PublishedSnapshot.snapshot_id))
            )
        )
    }


def _cited(session: Session, dataset_id: str) -> bool:
    return any(
        session.scalar(
            text(f"SELECT 1 FROM {ref.split('.')[0]} WHERE {ref.split('.')[1]} = :id LIMIT 1"),
            {"id": dataset_id},
        )
        for ref in _CITED
    )


def retire_dataset(session: Session, dataset_id: str) -> None:
    """Delete one release dataset with its rows, binding, snapshot and build.

    Refuses a published, impact or cited dataset; the caller decides which are superseded.
    """
    dataset = session.get(WorkbenchDataset, dataset_id)
    if dataset is None:
        raise ValueError(f"no dataset {dataset_id}")
    if dataset.source_namespace != "sportsdataverse":
        raise ValueError("only statistics release datasets can be retired")
    if dataset_id in _published(session):
        raise ValueError("the published release cannot be retired")
    if _cited(session, dataset_id):
        raise ValueError("an assistant answer, saved analysis, forecast or live check cites it")
    with allow_admin_mutation(session):
        snapshots = list(
            session.scalars(
                select(WorkbenchReleaseBinding.snapshot_id).where(
                    WorkbenchReleaseBinding.dataset_id == dataset_id
                )
            )
        )
        builds = list(
            session.scalars(
                select(ServingSnapshot.build_id).where(ServingSnapshot.id.in_(snapshots))
            )
        )
        for table in _OWNED:
            session.execute(text(f"DELETE FROM {table} WHERE dataset_id = :id"), {"id": dataset_id})
        session.execute(
            delete(WorkbenchReleaseBinding).where(WorkbenchReleaseBinding.dataset_id == dataset_id)
        )
        session.execute(delete(ServingSnapshot).where(ServingSnapshot.id.in_(snapshots)))
        still_used = select(func.count()).where(ServingSnapshot.build_id == WarehouseBuild.id)
        session.execute(
            delete(WarehouseBuild).where(
                WarehouseBuild.id.in_(builds), still_used.scalar_subquery() == 0
            )
        )
        session.execute(delete(WorkbenchDataset).where(WorkbenchDataset.id == dataset_id))
        session.commit()


def retire_releases(session: Session, keep: int = KEEP_RELEASES) -> list[str]:
    """Delete daily-built datasets beyond the published one and the newest `keep`."""
    built = list(
        session.scalars(
            select(WorkbenchDataset.id)
            .where(WorkbenchDataset.manifest_json["builder"].as_string() == BUILDER)
            .order_by(WorkbenchDataset.created_at.desc())
        )
    )
    published = _published(session)
    retired: list[str] = []
    for dataset_id in built[keep:]:
        if dataset_id in published or _cited(session, dataset_id):
            continue
        retire_dataset(session, dataset_id)
        retired.append(dataset_id)
    return retired
