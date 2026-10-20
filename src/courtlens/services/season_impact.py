"""Weekly current-season impact: provisional IM03 datasets, fits, serving and retirement.

`courtlens refresh-season-impact` runs the sealed seasons' pipeline on the in-progress season
(docs/season-impact-plan.md; owner approved 2026-10-20):

1. Candidates and bundles from hoopR's retained documents (`ingestion/season_impact.py`).
2. Population under `courtlens-impact-provisional`. The append-only triggers protect only
   `courtlens-impact`, so superseded provisional datasets can be retired: the newest two are kept.
   `populate_provisional` mirrors `impact_population.populate_impact_season`, which cannot take a
   namespace argument without changing its pinned hash and breaking the sealed seasons' checks.
3. Ratings and extras for the current season only; a new serving bundle carries every sealed
   entry verbatim plus the provisional ones (`provisional: true`).

After the season one final run is sealed as an ordinary `courtlens-impact` dataset by the
existing IM03 path; provisional rows never become permanent by themselves.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import delete, insert, select, text
from sqlalchemy.orm import Session

from courtlens.domain.impact_possessions import METHOD_VERSION_V2
from courtlens.ingestion.impact_population import read_json, verify_event_receipt
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.models import new_uuid, utc_now
from courtlens.workbench_models import (
    WorkbenchAcquisition,
    WorkbenchArtifact,
    WorkbenchDataset,
    WorkbenchDatasetMember,
    WorkbenchIdentity,
    WorkbenchLineupStint,
    WorkbenchObservation,
    WorkbenchPossession,
    WorkbenchSchedule,
    WorkbenchStintPlayer,
    WorkbenchVersion,
    allow_admin_mutation,
)

NAMESPACE = "courtlens-impact-provisional"
KEEP_DATASETS = 2


def populate_provisional(session: Session, bundle_path: Path) -> dict[str, Any]:
    """Seal one provisional season/phase bundle; reuse an identical earlier dataset.

    Every member's event-verification receipt is recomputed before anything is written (a
    receipt's pass flag is never trusted), as for sealed seasons.
    """
    from courtlens.services.possession_warehouse import (
        record_reconstruction_override,
        record_repair_result_overrides,
    )

    bundle = read_json(bundle_path)
    digest = bundle["content_sha256"]
    if (
        content_hash({k: v for k, v in bundle.items() if k != "content_sha256"}) != digest
        or not bundle.get("provisional")
        or bundle["method_version"] != METHOD_VERSION_V2
        or content_hash({gid: m["content_sha256"] for gid, m in bundle["members"].items()})
        != bundle["membership_sha256"]
    ):
        raise ValueError("invalid provisional impact bundle")
    existing = session.scalar(
        select(WorkbenchDataset).where(
            WorkbenchDataset.content_sha256 == digest,
            WorkbenchDataset.source_namespace == NAMESPACE,
        )
    )
    if existing is not None:
        return {"dataset_id": existing.id, "content_sha256": digest, "reused": True}
    counts = {"stints": 0, "possessions": 0}
    for gid, member in bundle["members"].items():
        game = read_json(Path(member["path"]))
        if (
            game["game_id"] != gid
            or content_hash({k: v for k, v in game.items() if k != "content_sha256"})
            != member["content_sha256"]
        ):
            raise ValueError(f"invalid provisional game member {gid}")
        check = verify_event_receipt(member, game)
        if not check["passed"]:
            raise ValueError(f"{gid}: event verification does not hold")
        counts["stints"] += len(game["stints"])
        counts["possessions"] += len(game["possessions"])
    if counts != bundle["counts"]:
        raise ValueError("provisional row counts differ from the bundle")
    season, phase = bundle["season"], bundle["phase"]
    dataset_id = new_uuid()
    session.add(
        WorkbenchDataset(
            id=dataset_id,
            content_sha256=digest,
            membership_sha256=bundle["membership_sha256"],
            semantic_signature=content_hash({"method": METHOD_VERSION_V2, "provisional": True}),
            source_namespace=NAMESPACE,
            parser_version=METHOD_VERSION_V2,
            quality_version="possession-policy-v2",
            seasons_json=[season],
            phases_json=[phase],
            manifest_json={k: v for k, v in bundle.items() if k != "members"},
            coverage_json=bundle["im02_summary"],
            exclusions_json={
                **bundle["im02_summary"]["excluded_games"],
                **{g: f["errors"] for g, f in bundle["failed_event_checks"].items()},
            },
            status="ready",
        )
    )
    session.flush()
    sha, size = hash_file(bundle_path)
    artifact = session.scalar(
        select(WorkbenchArtifact).where(
            WorkbenchArtifact.sha256 == sha,
            WorkbenchArtifact.resource == "impact-season-bundle",
        )
    )
    if artifact is None:
        artifact = WorkbenchArtifact(
            sha256=sha,
            resource="impact-season-bundle",
            bytes=size,
            storage_path=str(bundle_path),
            mime_type="application/gzip",
            source_attribution="NBA public data via hoopR (MIT); local non-commercial use",
        )
        session.add(artifact)
        session.flush()
    observed_at = utc_now()
    acquisition = WorkbenchAcquisition(
        source_name=NAMESPACE,
        resource="impact-season-bundle",
        source_url="local:" + str(bundle_path),
        status="success",
        artifact_id=artifact.id,
        content_sha256=sha,
        started_at=observed_at,
        finished_at=observed_at,
        metadata_json={"accepted_im02_sha256": bundle["accepted_im02_sha256"]},
    )
    session.add(acquisition)
    session.flush()
    for index, (gid, member) in enumerate(sorted(bundle["members"].items())):
        game = read_json(Path(member["path"]))
        identity = session.scalar(
            select(WorkbenchIdentity).where(
                WorkbenchIdentity.namespace == NAMESPACE,
                WorkbenchIdentity.kind == "game",
                WorkbenchIdentity.external_id == gid,
            )
        )
        if identity is None:
            identity = WorkbenchIdentity(
                namespace=NAMESPACE, kind="game", external_id=gid, display_name=gid
            )
            session.add(identity)
            session.flush()
        version = session.scalar(
            select(WorkbenchVersion).where(
                WorkbenchVersion.identity_id == identity.id,
                WorkbenchVersion.content_sha256 == member["content_sha256"],
                WorkbenchVersion.parser_version == METHOD_VERSION_V2,
            )
        )
        if version is None:
            version = WorkbenchVersion(
                identity_id=identity.id,
                content_sha256=member["content_sha256"],
                parser_version=METHOD_VERSION_V2,
                payload_json={
                    "path": member["path"],
                    "candidate_sha256": member["candidate_sha256"],
                    "schedule": member["schedule"],
                },
            )
            session.add(version)
            session.flush()
        observation = WorkbenchObservation(
            acquisition_id=acquisition.id,
            artifact_id=artifact.id,
            row_identifier=gid,
            identity_id=identity.id,
            version_id=version.id,
            observed_at=observed_at,
            observation_order=index + 1,
        )
        session.add(observation)
        session.flush()
        session.add(
            WorkbenchDatasetMember(
                dataset_id=dataset_id,
                identity_id=identity.id,
                version_id=version.id,
                observation_id=observation.id,
            )
        )
        scheduled = member["schedule"]
        session.add(
            WorkbenchSchedule(
                dataset_id=dataset_id,
                game_id=gid,
                season=season,
                phase=phase,
                game_date=date.fromisoformat(scheduled["game_date"]),
                home_team_id=scheduled["home_team_id"],
                away_team_id=scheduled["away_team_id"],
                game_status=3,
                source_version_id=version.id,
                source_observation_id=observation.id,
                annotations_json={
                    "quality": game["quality"],
                    "conservation": game["conservation"],
                    "candidate_sha256": member["candidate_sha256"],
                    "provisional": True,
                },
            )
        )
        session.flush()
        record_repair_result_overrides(
            session,
            dataset_id=dataset_id,
            result=read_json(Path(member["candidate_path"])),
            author="courtlens-season-impact",
        )
        for repair in game.get("method_repairs", []):
            record_reconstruction_override(
                session,
                dataset_id=dataset_id,
                game_id=gid,
                override_type="impact_v2_event_repair",
                reason=repair["reason"],
                author="courtlens-season-impact",
                override_value=repair,
                original_value={"team_id": repair["original_team_id"]},
                team_id=repair["team_id"],
                action_number=repair["locator"]["action_number"],
                commit=False,
                flush=False,
            )
        session.execute(
            insert(WorkbenchPossession),
            [
                {"id": new_uuid(), "dataset_id": dataset_id, "game_id": gid, **p}
                for p in game["possessions"]
            ],
        )
        stint_rows = [
            {"id": new_uuid(), "dataset_id": dataset_id, "game_id": gid, **s}
            for s in game["stints"]
        ]
        session.execute(insert(WorkbenchLineupStint), stint_rows)
        exposures = [
            {
                "id": new_uuid(),
                "dataset_id": dataset_id,
                "stint_id": s["id"],
                "game_id": gid,
                "team_id": s[f"{side}_team_id"],
                "opponent_team_id": s[f"{other}_team_id"],
                "player_id": pid,
                "side": side,
                "period": s["period"],
                "duration_seconds": s["duration_seconds"],
                "possessions": s[f"{side}_possessions"],
                "opponent_possessions": s[f"{other}_possessions"],
                "points": s["player_stats_json"].get(pid, {}).get("points", 0),
                "team_points": s[f"{side}_points"],
                "points_allowed": s[f"{other}_points"],
                "stats_json": s["player_stats_json"].get(pid, {}),
                "source_hash": s["source_hash"],
            }
            for s in stint_rows
            for side, other in (("home", "away"), ("away", "home"))
            for pid in s[f"{side}_lineup_json"]
        ]
        session.execute(insert(WorkbenchStintPlayer), exposures)
    session.flush()
    return {"dataset_id": dataset_id, "content_sha256": digest, "reused": False, **counts}


def retire_provisional(session: Session, keep: int = KEEP_DATASETS) -> list[str]:
    """Delete provisional datasets beyond the newest `keep` per season and phase.

    Possessions, stints, stint players and overrides cascade; members and schedules are
    deleted explicitly. Sealed `courtlens-impact` datasets are never selected.
    """
    datasets = list(
        session.scalars(
            select(WorkbenchDataset)
            .where(WorkbenchDataset.source_namespace == NAMESPACE)
            .order_by(WorkbenchDataset.created_at.desc())
        )
    )
    seen: dict[tuple[str, str], int] = {}
    retired = []
    for dataset in datasets:
        scope = (dataset.seasons_json[0], dataset.phases_json[0])
        seen[scope] = seen.get(scope, 0) + 1
        if seen[scope] <= keep:
            continue
        with allow_admin_mutation(session):
            for table in ("workbench_dataset_members", "workbench_schedules"):
                session.execute(
                    text(f"DELETE FROM {table} WHERE dataset_id = :id"), {"id": dataset.id}
                )
            session.execute(delete(WorkbenchDataset).where(WorkbenchDataset.id == dataset.id))
            session.commit()
        retired.append(dataset.id)
    return retired


MIN_TEAM_GAMES = 10


def team_games(schedule: dict[str, dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for game in schedule["regular_season"]["games"].values():
        for team in (game["home_team_id"], game["away_team_id"]):
            counts[team] = counts.get(team, 0) + 1
    return counts


def _serve(
    directory: Path,
    build: Callable[[dict[str, Any]], dict[str, Any]],
    meta: dict[str, Any],
) -> tuple[Path, list[str]]:
    """Write `build(current body)` as the new served bundle; install it and prune.

    Kept: the bundle served before this one (rollback) and the sealed-only bundle the chain
    started from (built from sealed evidence; carried in `provisional.sealed_origin`).
    """
    from courtlens.evaluation.impact_rating_inputs import write_artifact
    from courtlens.services import served_bundle

    current = served_bundle.resolve(directory)
    if current is None:
        raise ValueError(f"no bundle installed in {directory}")
    base = json.loads(current.read_bytes())
    origin = base.get("provisional", {}).get("sealed_origin", current.stem)
    path, _ = write_artifact(
        directory, {**build(base), "provisional": {**meta, "sealed_origin": origin}}
    )
    served_bundle.install(directory, path)
    return path, served_bundle.prune(directory, {current.stem, origin})


def refresh_season_impact(
    session: Session,
    *,
    raw_root: Path,
    store: Path,
    end_year: int,
    today: date,
    work_root: Path,
    serving_dir: Path,
    splits_dir: Path,
    wowy_dir: Path,
    stint_box_dir: Path,
    force: bool = False,
) -> dict[str, Any]:
    """One weekly run; returns a summary. Waits until every team has `MIN_TEAM_GAMES` games."""
    from courtlens.domain.impact_extras import aggregate_by_team
    from courtlens.domain.stint_box import VERSION as STINT_BOX_VERSION
    from courtlens.domain.stint_box import stint_box
    from courtlens.domain.wowy import cohort_splits, team_stints
    from courtlens.evaluation.impact_rating_inputs import checked, write_artifact
    from courtlens.evaluation.impact_serving_build import (
        project_extras,
        project_rating,
        project_team_split,
    )
    from courtlens.evaluation.season_impact_fits import (
        build_extras,
        fit_ratings,
        provisional_cohort,
    )
    from courtlens.ingestion.hoopr_boxscores import playbyplay_rows
    from courtlens.ingestion.impact_repair_audit import retained_boxes
    from courtlens.ingestion.season_impact import (
        prepare_bundles,
        provisional_schedule,
        season_candidates,
    )
    from courtlens.services.season_refresh import season_documents

    season = f"{end_year - 1}-{end_year % 100:02d}"
    schedule_path = raw_root / f"sportsdataverse_{end_year}" / f"schedule_{end_year}.json"
    schedule = provisional_schedule(schedule_path.read_bytes(), end_year)
    played = team_games(schedule)
    fewest = min(played.values(), default=0) if len(played) == 30 else 0
    if fewest < MIN_TEAM_GAMES and not force:
        return {"season": season, "status": "waiting", "fewest_team_games": fewest}
    playbyplay = season_documents(store, end_year, "playbyplayv3")
    matchups = season_documents(store, end_year, "boxscorematchupsv3")
    report = season_candidates(
        raw_root=raw_root,
        playbyplay=playbyplay,
        end_year=end_year,
        candidate_root=work_root / "candidates",
    )
    bundles = prepare_bundles(
        report=report,
        raw_root=raw_root,
        playbyplay=playbyplay,
        end_year=end_year,
        output_root=work_root,
    )
    cutoff = today.isoformat()
    populated: list[dict[str, Any]] = []
    serving_entries: list[dict[str, Any]] = []
    split_entries: dict[str, Any] = {}
    wowy_cohorts: dict[str, Any] = {}
    stint_boxes: dict[str, Any] = {}
    phases: dict[str, Any] = {}
    players, _, _ = retained_boxes(raw_root, end_year)
    for bundle_path in bundles:
        result = populate_provisional(session, bundle_path)
        session.commit()
        populated.append(result)
        receipts, provenance = fit_ratings(
            bundle_path=bundle_path, raw_root=raw_root, output=work_root, cutoff=cutoff
        )
        for receipt in receipts:
            body = json.loads(Path(receipt["path"]).read_bytes())
            entry = project_rating(body, receipt["sha256"], provenance)
            serving_entries.append({**entry, "provisional": True})
        extras = build_extras(
            bundle_path=bundle_path,
            raw_root=raw_root,
            playbyplay=playbyplay,
            matchups=matchups,
            output=work_root,
            cutoff=cutoff,
        )
        body = json.loads(Path(extras["path"]).read_bytes())
        key = f"{body['season']}:{body['phase']}"
        serving_entries.append(
            {**project_extras(body, extras["sha256"], provenance[key]), "provisional": True}
        )
        facts = json.loads(Path(extras["fact_path"]).read_bytes())
        split = aggregate_by_team(facts, cutoff)
        split_entries[extras["sha256"]] = {
            "season": body["season"],
            "phase": body["phase"],
            "cutoff": cutoff,
            "fact_sha256": extras["fact_sha256"],
            "provisional": True,
            "players": {
                pid: {
                    team: project_team_split(row, extras["sha256"], cutoff, team)
                    for team, row in teams.items()
                }
                for pid, teams in sorted(split["players"].items())
            },
        }
        cohort, _ = provisional_cohort(bundle_path)
        wowy_cohorts[key] = {
            "season": cohort["season"],
            "phase": cohort["phase"],
            "games": len(cohort["games"]),
            "last_game_date": max(g["day"] for g in cohort["games"].values()),
            "teams": cohort_splits(team_stints(cohort["stints"])),
            "provisional": True,
        }
        bundle = checked(bundle_path)
        games = {}
        for gid, member in sorted(bundle["members"].items()):
            rows = [
                {**r, "_row_index": str(i)}
                for i, r in enumerate(playbyplay_rows(playbyplay[gid], gid))
            ]
            games[gid] = stint_box(
                checked(Path(member["path"]), member["content_sha256"]),
                checked(Path(member["candidate_path"]), member["candidate_sha256"]),
                players[gid],
                rows,
                [],
            )
        box_path, box_sha = write_artifact(
            stint_box_dir.parent,
            {
                "version": STINT_BOX_VERSION,
                "season": bundle["season"],
                "phase": bundle["phase"],
                "bundle_content_sha256": bundle["content_sha256"],
                "provisional": True,
                "attribution": "NBA Stats via hoopR (MIT); local non-commercial research",
                "games": games,
            },
        )
        stint_boxes[bundle["content_sha256"]] = {
            "sha256": box_sha,
            "path": box_path.name,
            "season": bundle["season"],
            "phase": bundle["phase"],
            "provisional": True,
        }
        phases[key] = {
            "dataset_id": result["dataset_id"],
            "ratings": [r["sha256"] for r in receipts],
            "extras": extras["sha256"],
            "games": len(json.loads(Path(extras["path"]).read_bytes())["input"]),
        }
    meta = {"season": season, "cutoff": cutoff, "im02_sha256": report["content_sha256"]}
    serving, pruned_serving = _serve(
        serving_dir,
        lambda base: {
            **base,
            "entries": [
                *(e for e in base["entries"] if not e.get("provisional")),
                *serving_entries,
            ],
        },
        meta,
    )
    splits, pruned_splits = _serve(
        splits_dir,
        lambda base: {
            **base,
            "entries": {
                **{k: v for k, v in base["entries"].items() if not v.get("provisional")},
                **split_entries,
            },
        },
        meta,
    )
    wowy, pruned_wowy = _serve(
        wowy_dir,
        lambda base: {
            **base,
            "cohorts": {
                **{k: v for k, v in base["cohorts"].items() if not v.get("provisional")},
                **wowy_cohorts,
            },
        },
        meta,
    )
    boxes, pruned_boxes = _serve(
        stint_box_dir,
        lambda base: {
            **base,
            "artifacts": {
                **{k: v for k, v in base["artifacts"].items() if not v.get("provisional")},
                **stint_boxes,
            },
        },
        meta,
    )
    retired = retire_provisional(session)
    work_pruned = prune_work(session, work_root, serving_dir, splits_dir)
    return {
        "season": season,
        "status": "published",
        "fewest_team_games": fewest,
        "quality": {k: v["summary"]["quality_counts"] for k, v in report["seasons"].items()},
        "phases": phases,
        "populated": populated,
        "serving": serving.stem,
        "team_splits": splits.stem,
        "wowy": wowy.stem,
        "stint_box": boxes.stem,
        "pruned": {
            "serving": pruned_serving,
            "splits": pruned_splits,
            "wowy": pruned_wowy,
            "stint_box": pruned_boxes,
        },
        "retired": retired,
        "work_pruned": work_pruned,
    }


def prune_work(session: Session, work_root: Path, serving_dir: Path, splits_dir: Path) -> int:
    """Delete working files no kept serving bundle or provisional dataset references.

    Kept: ratings and extras artifacts of every served or retained bundle, their facts, and the
    bundles of retained provisional datasets with their games, candidates and proofs.
    """
    keep: set[str] = set()
    for directory, entries_key in ((serving_dir, "entries"), (splits_dir, "entries")):
        for path in directory.glob("[0-9a-f]*.json"):
            body = json.loads(path.read_bytes())
            if "provisional" not in body:
                continue
            entries = body[entries_key]
            if isinstance(entries, dict):
                keep.update(e["fact_sha256"] for e in entries.values() if e.get("provisional"))
                keep.update(k for k, e in entries.items() if e.get("provisional"))
            else:
                keep.update(e["sha256"] for e in entries if e.get("provisional"))
    bundles = set(
        session.scalars(
            select(WorkbenchDataset.content_sha256).where(
                WorkbenchDataset.source_namespace == NAMESPACE
            )
        )
    )
    keep |= bundles
    for digest in bundles:
        path = work_root / "bundles" / f"{digest}.json.gz"
        if not path.exists():
            continue
        for member in read_json(path)["members"].values():
            keep.update(Path(member[k]).name.split(".")[0] for k in ("path", "candidate_path"))
            keep.add(Path(member["event_verification"]["path"]).name.split(".")[0])
    removed = 0
    for folder in ("ratings", "extras", "facts", "bundles", "games", "event-verification"):
        for path in (work_root / folder).rglob("*.json*"):
            if path.name.split(".")[0] not in keep:
                path.unlink()
                removed += 1
    for path in (work_root / "candidates").rglob("*.json.gz"):
        if path.name.split(".")[0] not in keep:
            path.unlink()
            removed += 1
    return removed
