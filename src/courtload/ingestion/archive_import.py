"""Import a pinned archive into immutable, dataset-bound facts and lineage."""

from __future__ import annotations

import collections
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from courtload.archive_models import (
    ArchiveArtifact,
    ArchiveDataset,
    ArchiveIdentity,
    ArchiveImport,
    ArchiveMember,
    ArchiveObservation,
    ArchivePlayerGame,
    ArchiveQuarantine,
    ArchiveTeamGame,
    ArchiveVersion,
)
from courtload.ingestion.archive import FILES, REVISION, SHA256, SOURCE, hash_file
from courtload.ingestion.archive_normalization import (
    PLAYER_FILES,
    SEASONS,
    TEAM_FILE,
    canonical_hash,
    game_id,
    parse_player,
    parse_team,
    rows,
)
from courtload.models import new_uuid

PARSER_VERSION = "archive-v1"
NAMESPACE = f"github:{SOURCE}@{REVISION}"


def _counts(values: Iterable[str]) -> dict[str, int]:
    return dict(sorted(collections.Counter(values).items()))


@dataclass(frozen=True)
class ParsedRow:
    resource: str
    line: int
    kind: str
    external_id: str
    game: str
    payload: dict[str, Any]
    content_sha256: str


def _parse_files(root: Path) -> tuple[list[ParsedRow], list[tuple[str, int, str, str | None]]]:
    parsed: list[ParsedRow] = []
    invalid: list[tuple[str, int, str, str | None]] = []
    for resource in (*PLAYER_FILES, TEAM_FILE):
        player = resource in PLAYER_FILES
        for line, raw in rows(root / resource):
            if raw["season_year" if player else "SEASON_YEAR"] not in SEASONS:
                continue
            try:
                payload = parse_player(raw) if player else parse_team(raw)
            except (ValueError, KeyError) as error:
                raw_id = raw.get("gameId" if player else "GAME_ID", "")
                try:
                    normalized_game: str | None = game_id(raw_id)
                except ValueError:
                    normalized_game = None
                invalid.append((resource, line, str(error)[:80], normalized_game))
                continue
            game = str(payload["game"])
            kind = "player_game" if player else "team_game"
            external_id = f"{game}:{payload['player_id' if player else 'team_id']}"
            parsed.append(
                ParsedRow(resource, line, kind, external_id, game, payload, canonical_hash(payload))
            )
    return parsed, invalid


def _admit(
    parsed: list[ParsedRow], invalid: list[tuple[str, int, str, str | None]]
) -> tuple[set[str], dict[str, str], dict[tuple[str, str], ParsedRow]]:
    by_key: dict[tuple[str, str], ParsedRow] = {}
    excluded: dict[str, str] = {game: "invalid_source_row" for _, _, _, game in invalid if game}
    for row in parsed:
        key = (row.kind, row.external_id)
        prior = by_key.get(key)
        if prior and prior.content_sha256 != row.content_sha256:
            excluded[row.game] = "conflicting_source_rows"
        else:
            by_key.setdefault(key, row)
    teams: dict[str, list[ParsedRow]] = collections.defaultdict(list)
    players: dict[str, list[ParsedRow]] = collections.defaultdict(list)
    for row in by_key.values():
        (players if row.kind == "player_game" else teams)[row.game].append(row)
    admitted: set[str] = set()
    for game, sides in teams.items():
        if game in excluded:
            continue
        if len(sides) != 2 or {s.payload["side"] for s in sides} != {"home", "away"}:
            excluded[game] = "bad_team_pair"
            continue
        a, b = sides
        if (
            a.payload["team"] != b.payload["opponent"]
            or b.payload["team"] != a.payload["opponent"]
            or a.payload["date"] != b.payload["date"]
            or a.payload["season"] != b.payload["season"]
        ):
            excluded[game] = "bad_team_pair"
            continue
        side_by_team = {str(side.payload["team"]): side for side in sides}
        points: collections.Counter[str] = collections.Counter()
        bad = False
        for row in players[game]:
            payload = row.payload
            side = side_by_team.get(str(payload["team"]))
            if (
                side is None
                or payload["team_id"] != side.payload["team_id"]
                or payload["date"] != side.payload["date"]
                or payload["season"] != side.payload["season"]
                or payload["opponent"] != side.payload["opponent"]
            ):
                bad = True
                break
            if payload["appearance"] == "appeared":
                value = payload["stats"]["points"]
                if value is None:
                    bad = True
                    break
                points[str(payload["team"])] += value
        if bad:
            excluded[game] = "bad_player_membership_or_points"
        elif any(
            not players[game] or points[str(side.payload["team"])] != side.payload["points"]
            for side in sides
        ):
            excluded[game] = "point_reconciliation"
        else:
            admitted.add(game)
    for game in players.keys() - teams.keys():
        excluded[game] = "missing_team_game"
    return admitted, excluded, by_key


def _bulk(session: Session, model: type[Any], items: list[dict[str, Any]]) -> None:
    for start in range(0, len(items), 1000):
        session.execute(insert(model), items[start : start + 1000])


def _get_or_create_ids(
    session: Session, model: type[Any], key_columns: tuple[str, ...], values: set[tuple[str, ...]]
) -> dict[tuple[str, ...], str]:
    existing = {
        tuple(getattr(row, column) for column in key_columns): row.id
        for row in session.scalars(select(model)).all()
    }
    missing = sorted(values - existing.keys())
    _bulk(
        session,
        model,
        [dict(id=new_uuid(), **dict(zip(key_columns, key, strict=True))) for key in missing],
    )
    return {
        **existing,
        **{
            tuple(getattr(row, column) for column in key_columns): row.id
            for row in session.scalars(select(model)).all()
        },
    }


def import_archive(session: Session, root: Path) -> ArchiveImport:
    """Verify, observe and atomically admit files. Failed attempts persist only as failed runs."""
    attempt = ArchiveImport(status="running")
    session.add(attempt)
    session.commit()
    try:
        result = _import_verified(session, root, attempt)
        session.commit()
        return result
    except Exception as error:
        session.rollback()
        stored_attempt = session.get(ArchiveImport, attempt.id)
        assert stored_attempt is not None
        stored_attempt.status = "failed"
        stored_attempt.finished_at = datetime.now(UTC)
        stored_attempt.error = f"{type(error).__name__}: {str(error)[:240]}"
        session.commit()
        raise


def _import_verified(session: Session, root: Path, attempt: ArchiveImport) -> ArchiveImport:
    artifacts: dict[str, ArchiveArtifact] = {}
    manifest_path = root / "retrieval-manifest.json"
    acquired_at = datetime.now(UTC)
    if manifest_path.exists():
        retrieval_manifest = json.loads(manifest_path.read_text())
        if retrieval_manifest.get("revision") != REVISION:
            raise ValueError("Retrieval manifest revision differs from pinned archive")
        acquired_at = datetime.fromisoformat(retrieval_manifest["retrieved_at_utc"])
    for resource, size in FILES.items():
        digest, actual_size = hash_file(root / resource)
        if digest != SHA256[resource] or actual_size != size:
            raise ValueError(f"{resource} differs from pinned size or hash")
        artifact = session.scalar(
            select(ArchiveArtifact).where(
                ArchiveArtifact.resource == resource, ArchiveArtifact.sha256 == digest
            )
        )
        if artifact is None:
            artifact = ArchiveArtifact(
                resource=resource,
                sha256=digest,
                bytes=size,
                storage_uri=str((root / resource).resolve()),
                source_url=f"https://raw.githubusercontent.com/{SOURCE}/{REVISION}/{resource}",
                source_revision=REVISION,
                acquired_at=acquired_at,
            )
            session.add(artifact)
            session.flush()
        artifacts[resource] = artifact
    parsed, invalid = _parse_files(root)
    admitted, excluded, selected = _admit(parsed, invalid)
    if not admitted:
        raise ValueError("No reconciled games admitted")
    selected_team_rows = [row for row in selected.values() if row.kind == "team_game"]
    season_by_game = {row.game: str(row.payload["season"]) for row in selected_team_rows}
    report = {
        "selected_seasons": list(SEASONS),
        "admitted_games": len(admitted),
        "admitted_games_by_season": _counts(season_by_game[game] for game in admitted),
        "admitted_team_games_by_team": _counts(
            str(row.payload["team"]) for row in selected_team_rows if row.game in admitted
        ),
        "admitted_player_rows": sum(
            row.game in admitted and row.kind == "player_game" for row in selected.values()
        ),
        "invalid_rows_by_reason": _counts(reason for _, _, reason, _ in invalid),
        "invalid_rows_by_resource": _counts(resource for resource, _, _, _ in invalid),
        "excluded_games_by_reason": _counts(excluded.values()),
        "excluded_games_by_season": _counts(
            season_by_game[game] for game in excluded if game in season_by_game
        ),
    }
    artifact_manifest = {name: item.sha256 for name, item in sorted(artifacts.items())}
    content_sha = canonical_hash(
        {
            "artifacts": artifact_manifest,
            "parser": PARSER_VERSION,
            "seasons": SEASONS,
            "selected": sorted(
                (row.kind, row.external_id, row.content_sha256)
                for row in selected.values()
                if row.game in admitted
            ),
            "invalid": sorted(invalid),
            "excluded": sorted(excluded.items()),
        }
    )
    observation_sha = canonical_hash(
        sorted((row.resource, row.line, row.content_sha256) for row in parsed)
    )
    identity_keys: set[tuple[str, ...]] = set()
    for row in parsed:
        identity_keys.add((NAMESPACE, row.kind, row.external_id))
        identity_keys.add((NAMESPACE, "game", row.game))
        identity_keys.add((NAMESPACE, "team", str(row.payload["team_id"])))
        if row.kind == "player_game":
            identity_keys.add((NAMESPACE, "player", str(row.payload["player_id"])))
    identity_ids = _get_or_create_ids(
        session, ArchiveIdentity, ("namespace", "kind", "external_id"), identity_keys
    )
    version_keys = {
        (identity_ids[(NAMESPACE, row.kind, row.external_id)], row.content_sha256, PARSER_VERSION)
        for row in parsed
    }
    version_ids = {
        (v.identity_id, v.content_sha256, v.parser_version): v.id
        for v in session.scalars(select(ArchiveVersion)).all()
    }
    first_rows = {
        (
            identity_ids[(NAMESPACE, row.kind, row.external_id)],
            row.content_sha256,
            PARSER_VERSION,
        ): row
        for row in parsed
    }
    _bulk(
        session,
        ArchiveVersion,
        [
            {
                "id": new_uuid(),
                "identity_id": key[0],
                "content_sha256": key[1],
                "parser_version": key[2],
                "payload_json": first_rows[key].payload,
            }
            for key in sorted(version_keys - version_ids.keys())
        ],
    )
    version_ids = {
        (v.identity_id, v.content_sha256, v.parser_version): v.id
        for v in session.scalars(select(ArchiveVersion)).all()
    }
    now = datetime.now(UTC)
    observations: list[dict[str, Any]] = []
    obs_by_locator: dict[tuple[str, int], str] = {}
    for row in parsed:
        observation_id = new_uuid()
        obs_by_locator[(row.resource, row.line)] = observation_id
        identity_id = identity_ids[(NAMESPACE, row.kind, row.external_id)]
        observations.append(
            {
                "id": observation_id,
                "import_id": attempt.id,
                "artifact_id": artifacts[row.resource].id,
                "row_number": row.line,
                "identity_id": identity_id,
                "version_id": version_ids[(identity_id, row.content_sha256, PARSER_VERSION)],
                "observed_at": now,
            }
        )
    _bulk(session, ArchiveObservation, observations)
    dataset = session.scalar(
        select(ArchiveDataset).where(
            ArchiveDataset.content_sha256 == content_sha,
            ArchiveDataset.observation_sha256 == observation_sha,
            ArchiveDataset.status == "accepted",
        )
    )
    if dataset is None:
        dataset = ArchiveDataset(
            content_sha256=content_sha,
            observation_sha256=observation_sha,
            source_namespace=NAMESPACE,
            parser_version=PARSER_VERSION,
            manifest_json={"artifacts": artifact_manifest, "report": report},
            status="accepted",
        )
        session.add(dataset)
        session.flush()
        member_rows: list[dict[str, Any]] = []
        team_rows: list[dict[str, Any]] = []
        player_rows: list[dict[str, Any]] = []
        team_ids = {
            (row.game, str(row.payload["team"])): str(row.payload["team_id"])
            for row in selected.values()
            if row.kind == "team_game" and row.game in admitted
        }
        for row in selected.values():
            if row.game not in admitted:
                continue
            p = row.payload
            identity_id = identity_ids[(NAMESPACE, row.kind, row.external_id)]
            version_id = version_ids[(identity_id, row.content_sha256, PARSER_VERSION)]
            observation_id = obs_by_locator[(row.resource, row.line)]
            member_rows.append(
                dict(
                    id=new_uuid(),
                    dataset_id=dataset.id,
                    identity_id=identity_id,
                    version_id=version_id,
                    observation_id=observation_id,
                )
            )
            common = dict(
                id=new_uuid(),
                dataset_id=dataset.id,
                game_id=row.game,
                game_date=date.fromisoformat(str(p["date"])),
                date_precision="date_only",
                tipoff_utc=None,
                season=p["season"],
                source_version_id=version_id,
                source_observation_id=observation_id,
            )
            if row.kind == "player_game":
                player_rows.append(
                    dict(
                        **common,
                        player_id=p["player_id"],
                        team_id=p["team_id"],
                        opponent_id=team_ids[(row.game, str(p["opponent"]))],
                        appearance=p["appearance"],
                        minutes_original=p["minutes_original"],
                        minutes_seconds=p["minutes_seconds"],
                        stats_json=p["stats"],
                    )
                )
            else:
                team_rows.append(
                    dict(
                        **common,
                        team_id=p["team_id"],
                        opponent_id=team_ids[(row.game, str(p["opponent"]))],
                        side=p["side"],
                        points=p["points"],
                        stats_json=p["stats"],
                    )
                )
        _bulk(session, ArchiveMember, member_rows)
        _bulk(session, ArchiveTeamGame, team_rows)
        _bulk(session, ArchivePlayerGame, player_rows)
        quarantine_rows = [
            dict(
                id=new_uuid(),
                dataset_id=dataset.id,
                artifact_id=artifacts[resource].id,
                row_number=line,
                reason=reason,
                game_id=game,
            )
            for resource, line, reason, game in invalid
        ]
        quarantine_rows.extend(
            dict(
                id=new_uuid(),
                dataset_id=dataset.id,
                artifact_id=artifacts[row.resource].id,
                row_number=row.line,
                reason=excluded[row.game],
                game_id=row.game,
            )
            for row in parsed
            if row.game in excluded
        )
        _bulk(session, ArchiveQuarantine, quarantine_rows)
    attempt.status = "accepted"
    attempt.finished_at = now
    attempt.dataset_id = dataset.id
    attempt.report_json = report
    return attempt
