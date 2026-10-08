"""Network-free IM03 preparation and append-only warehouse population."""

from __future__ import annotations

import argparse
import gzip
import json
import tempfile
import time
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import insert, select, text
from sqlalchemy.orm import Session

from courtlens.domain.impact_event_repairs import project_team_actions
from courtlens.domain.impact_possessions import (
    METHOD_VERSION,
    METHOD_VERSION_V2,
    build_impact_game,
    verify_candidate,
)
from courtlens.domain.impact_public_verification import (
    public_sequence_groups,
    review_public_sequences,
)
from courtlens.domain.impact_verification import GATE_VERSION, verify_event_game
from courtlens.domain.possession_repair import normalize_events, order_same_clock
from courtlens.ingestion.impact_archive import archive_rows, schedule_membership, verify_observation
from courtlens.ingestion.impact_repair_audit import ArchiveGames, retain_candidate, retained_boxes
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_normalization import normalize_game_id
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
)


def read_json(path: Path) -> dict[str, Any]:
    with gzip.open(path, "rt") if path.suffix == ".gz" else path.open() as stream:
        value: dict[str, Any] = json.load(stream)
    return value


def verified_report(path: Path) -> dict[str, Any]:
    report = read_json(path)
    if (
        content_hash(
            {k: v for k, v in report.items() if k not in {"content_sha256", "elapsed_seconds"}}
        )
        != report["content_sha256"]
    ):
        raise ValueError("IM02 report hash mismatch")
    # The accepted orchestrator hash is historical: IM03 extends that file. Repair code
    # and source normalization must remain exactly the versions used for admission.
    for name, digest in report["code_sha256"].items():
        if (
            name != "src/courtlens/services/possession_warehouse.py"
            and hash_file(Path(name))[0] != digest
        ):
            raise ValueError(f"accepted IM02 method changed: {name}")
    if hash_file(Path("docs/design/possession-policy-v2.md"))[0] != report["policy_sha256"]:
        raise ValueError("accepted IM02 policy changed")
    return report


def public_possession_groups(path: Path, name: str) -> dict[str, dict[str, int]]:
    """The archive repeats possession EVENTS per event; deduplicate explicit groups.

    This is a source cross-check, not an official possession count. No team identity
    is inferred from names: OPPONENT matches the independent box team's tricode.
    """
    groups: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for row in archive_rows(path, name):
        gid = normalize_game_id(row["GAMEID"])
        group = content_hash(
            {key: row[key] for key in ("PERIOD", "STARTTIME", "ENDTIME", "EVENTS")}
        )
        groups[gid][row["OPPONENT"]].add(group)
    return {
        gid: {opponent: len(values) for opponent, values in sides.items()}
        for gid, sides in groups.items()
    }


def prepare_population(
    *,
    report_path: Path,
    observation: Path,
    raw_root: Path,
    output_root: Path,
    event_gate: bool = False,
) -> list[Path]:
    """Rehash raw inputs, bind accepted membership, retain reproducible season bundles."""
    accepted = verified_report(report_path)
    method_version = METHOD_VERSION_V2 if event_gate else METHOD_VERSION
    if hash_file(observation)[0] != accepted["archive_observation_sha256"]:
        raise ValueError("archive observation differs from accepted report")
    verify_observation(raw_root / "impact-archive", observation)
    receipt = read_json(observation)
    assets = {a["name"]: a for a in receipt["assets"]}
    paths = []
    for year in (2025, 2023, 2024):
        schedule_asset = assets[f"nba_schedule_{year + 1}.csv.gz"]
        schedule = schedule_membership(raw_root / "impact-archive" / schedule_asset["object"], year)
        players, boxes, box_receipts = retained_boxes(raw_root, year + 1)
        public_asset = assets.get(f"datasets/pbpstats_{year}.tar.xz")
        public_sequences = (
            public_sequence_groups(
                archive_rows(
                    raw_root / "impact-archive" / public_asset["object"], f"pbpstats_{year}"
                )
            )
            if public_asset and event_gate
            else {}
        )
        public_groups = (
            public_possession_groups(
                raw_root / "impact-archive" / public_asset["object"], f"pbpstats_{year}"
            )
            if public_asset
            else {}
        )

        for phase, suffix in (("regular_season", ""), ("playoffs", "_po")):
            started = time.monotonic()
            season = f"{year}-{str(year + 1)[-2:]}"
            cohort = accepted["seasons"][f"{season}:{phase}"]
            if (
                box_receipts != cohort["box_receipts"]
                or schedule[phase]["membership_sha256"] != cohort["schedule_membership_sha256"]
            ):
                raise ValueError("schedule or boxes differ from accepted report")
            members = {}
            deltas: list[float] = []
            counts: Counter[str] = Counter()
            public_deltas: list[int] = []
            public_unavailable: list[str] = []
            event_checks: list[bool] = []
            public_checks: list[bool] = []
            with tempfile.TemporaryDirectory(prefix="courtlens-im03-") as temporary:
                store = ArchiveGames(Path(temporary) / "events.sqlite")
                try:
                    for source, family in (("v3", "nbastatsv3"), ("cdn", "cdnnba")):
                        name = f"{family}{suffix}_{year}"
                        asset = assets[f"datasets/{name}.tar.xz"]
                        if asset["sha256"] != cohort["input_sha256"][source]:
                            raise ValueError("archive asset differs from accepted report")
                        store.load(source, raw_root / "impact-archive" / asset["object"], name)
                    if set(cohort["games"]) != set(schedule[phase]["games"]):
                        raise ValueError("accepted schedule membership changed")
                    for gid, admission in sorted(cohort["games"].items()):
                        if admission["quality"] == "excluded":
                            continue
                        candidate = read_json(Path(admission["candidate_path"]))
                        verify_candidate(candidate, admission["content_sha256"])
                        if candidate["input_sha256"] != cohort["input_sha256"]:
                            raise ValueError("candidate input hashes differ")
                        source = candidate["arbitration"]["selected"]
                        rows = store.get(source, gid)
                        events, _ = order_same_clock(
                            normalize_events(
                                rows,
                                source=source,
                                source_sha256=cohort["input_sha256"][source],
                                boxes=players[gid],
                            ),
                            gid,
                        )
                        scheduled = schedule[phase]["games"][gid]
                        raw_rows = {int(r["_row_index"]): r for r in rows}
                        method_repairs: list[dict[str, Any]] = []
                        other_rows: list[dict[str, str]] = []
                        if event_gate:
                            if any(
                                e.kind in {"shot", "free_throw", "turnover", "rebound"}
                                and e.team_id
                                not in (scheduled["home_team_id"], scheduled["away_team_id"])
                                for e in events
                            ):
                                other_rows = store.get("cdn" if source == "v3" else "v3", gid)
                            events, raw_rows, method_repairs = project_team_actions(
                                events=events,
                                rows=rows,
                                other_rows=other_rows,
                                input_sha256=cohort["input_sha256"],
                                teams=(scheduled["home_team_id"], scheduled["away_team_id"]),
                            )
                        result = build_impact_game(
                            candidate=candidate,
                            events=events,
                            raw_rows=raw_rows,
                            home_team=scheduled["home_team_id"],
                            away_team=scheduled["away_team_id"],
                            team_boxes=boxes[gid],
                            method_version=method_version,
                        )
                        if method_repairs:
                            result["method_repairs"] = method_repairs
                            result["content_sha256"] = content_hash(
                                {k: v for k, v in result.items() if k != "content_sha256"}
                            )
                        target = (
                            output_root
                            / "games"
                            / result["content_sha256"][:2]
                            / f"{result['content_sha256']}.json.gz"
                        )
                        retain_candidate(target, result)
                        comparison: dict[str, Any] = {"status": "unavailable"}
                        if gid in public_groups and public_asset is not None:
                            team_rows = boxes[gid]
                            observed = {
                                b["team_id"]: public_groups[gid].get(
                                    next(
                                        other["team_tricode"]
                                        for other in team_rows
                                        if other["team_id"] != b["team_id"]
                                    )
                                )
                                for b in team_rows
                            }
                            if all(v is not None for v in observed.values()):
                                diffs = {
                                    team: result["conservation"][team]["possessions"] - value
                                    for team, value in observed.items()
                                }
                                public_deltas.extend(diffs.values())
                                comparison = {
                                    "status": "compared",
                                    "source_sha256": public_asset["sha256"],
                                    "public_unique_groups": observed,
                                    "deltas": diffs,
                                }
                        if comparison["status"] == "unavailable":
                            public_unavailable.append(gid)
                        members[gid] = {
                            "content_sha256": result["content_sha256"],
                            "path": str(target),
                            "candidate_sha256": admission["content_sha256"],
                            "candidate_path": admission["candidate_path"],
                            "schedule": scheduled,
                            "public_possession_crosscheck": comparison,
                        }
                        if event_gate:
                            check = verify_event_game(
                                candidate=candidate,
                                events=events,
                                raw_rows=raw_rows,
                                game=result,
                                team_boxes=boxes[gid],
                            )
                            public_reviews = {}
                            if comparison["status"] == "compared":
                                for box in boxes[gid]:
                                    team = box["team_id"]
                                    opponent = next(
                                        b["team_tricode"]
                                        for b in boxes[gid]
                                        if b["team_id"] != team
                                    )
                                    groups = public_sequences[(gid, opponent)]
                                    review = review_public_sequences(result, rows, groups, team)
                                    if review["delta"] != comparison["deltas"][team]:
                                        raise ValueError(
                                            "public sequence count differs from cross-check"
                                        )
                                    public_reviews[team] = {
                                        "source_sha256": comparison["source_sha256"],
                                        "opponent": opponent,
                                        "groups": groups,
                                        "result": review,
                                    }
                                public_checks.append(
                                    all(r["result"]["passed"] for r in public_reviews.values())
                                )
                            else:
                                public_checks.append(
                                    True
                                )  # No available discrepancy; not agreement.
                            proof = {
                                "result": check,
                                "source": source,
                                "source_sha256": cohort["input_sha256"][source],
                                "rows": rows,
                                "player_boxes": players[gid],
                                "team_boxes": boxes[gid],
                                "box_receipts": box_receipts,
                                "other_rows": other_rows,
                                "method_repairs": method_repairs,
                                "public_reviews": public_reviews,
                            }
                            proof["content_sha256"] = content_hash(proof)
                            proof_path = (
                                output_root
                                / "event-verification"
                                / proof["content_sha256"][:2]
                                / f"{proof['content_sha256']}.json.gz"
                            )
                            retain_candidate(proof_path, proof)
                            members[gid]["event_verification"] = {
                                "path": str(proof_path),
                                "content_sha256": proof["content_sha256"],
                            }
                            event_checks.append(check["passed"])
                            if check["errors"]:
                                print(
                                    "event verification blocked",
                                    gid,
                                    check["errors"][:3],
                                    flush=True,
                                )
                        deltas.extend(v["delta"] for v in result["conservation"].values())
                        counts["stints"] += len(result["stints"])
                        counts["possessions"] += len(result["possessions"])
                        if len(members) % 200 == 0:
                            print(season, phase, len(members), flush=True)
                finally:
                    store.close()
            bundle = {
                "method_version": method_version,
                "accepted_im02_sha256": accepted["content_sha256"],
                "archive_observed_at": receipt["completed_at"],
                "season": season,
                "phase": phase,
                "code_sha256": {
                    p: hash_file(Path(p))[0]
                    for p in (
                        "src/courtlens/domain/impact_possessions.py",
                        "src/courtlens/ingestion/impact_population.py",
                        "src/courtlens/services/possession_warehouse.py",
                    )
                },
                "members": members,
                "membership_sha256": content_hash(
                    {gid: v["content_sha256"] for gid, v in members.items()}
                ),
                "im02_summary": cohort["summary"],
                "public_possession_crosscheck": {
                    "grouping": ["PERIOD", "STARTTIME", "ENDTIME", "EVENTS"],
                    "source_sha256": public_asset["sha256"] if public_asset else None,
                    "comparisons": len(public_deltas),
                    "exact": sum(v == 0 for v in public_deltas),
                    "within_two": sum(abs(v) <= 2 for v in public_deltas),
                    "max_absolute_delta": max((abs(v) for v in public_deltas), default=None),
                    "unavailable_games": public_unavailable,
                },
                "counts": dict(counts),
                "possession_estimate_distribution": {
                    "comparisons": len(deltas),
                    "within_two": sum(abs(v) <= 2 for v in deltas),
                    "mean_delta": sum(deltas) / len(deltas),
                    "p95_absolute_delta": sorted(abs(v) for v in deltas)[int(len(deltas) * 0.95)],
                    "max_absolute_delta": max(abs(v) for v in deltas),
                    "deltas": deltas,
                },
            }
            bundle["verification_gate"] = {
                "points_and_shooting_conserved": True,
                "accepted_player_seconds_preserved": True,
                "all_possession_estimates_within_two": all(abs(v) <= 2 for v in deltas),
            }
            if event_gate:
                bundle["gate_version"] = GATE_VERSION
                bundle["method_contract_sha256"] = hash_file(
                    Path("docs/design/impact-possession-method-v2.md")
                )[0]
                bundle["gate_contract_sha256"] = hash_file(
                    Path("docs/design/impact-event-verification-v1.md")
                )[0]
                bundle["code_sha256"]["src/courtlens/domain/impact_verification.py"] = hash_file(
                    Path("src/courtlens/domain/impact_verification.py")
                )[0]
                bundle["code_sha256"]["src/courtlens/domain/impact_event_repairs.py"] = hash_file(
                    Path("src/courtlens/domain/impact_event_repairs.py")
                )[0]
                bundle["code_sha256"]["src/courtlens/domain/impact_public_verification.py"] = (
                    hash_file(Path("src/courtlens/domain/impact_public_verification.py"))[0]
                )
                bundle["verification_gate"] = {
                    "points_and_shooting_conserved": True,
                    "accepted_player_seconds_preserved": True,
                    "all_event_boundaries_and_factors_verified": all(event_checks),
                    "all_available_public_sequences_reviewed": all(public_checks),
                }
            bundle["content_sha256"] = content_hash(bundle)
            target = output_root / "bundles" / f"{bundle['content_sha256']}.json.gz"
            retain_candidate(target, bundle)
            paths.append(target)
            print(
                season,
                phase,
                dict(counts),
                {
                    k: v
                    for k, v in bundle["possession_estimate_distribution"].items()
                    if k != "deltas"
                },
                "seconds",
                round(time.monotonic() - started, 3),
                flush=True,
            )
    return paths


def populate_impact_season(
    session: Session, *, dataset_id: str, season: str, bundle_path: Path
) -> dict[str, Any]:
    """Called only through the shared orchestrator; one transaction seals an entire phase."""
    from courtlens.services.possession_warehouse import record_repair_result_overrides

    bundle = read_json(bundle_path)
    method_version = bundle["method_version"]
    digest = bundle["content_sha256"]
    if (
        content_hash({k: v for k, v in bundle.items() if k != "content_sha256"}) != digest
        or bundle["season"] != season
        or method_version not in {METHOD_VERSION, METHOD_VERSION_V2}
    ):
        raise ValueError("invalid IM03 season bundle")
    for name, code_hash in bundle["code_sha256"].items():
        if hash_file(Path(name))[0] != code_hash:
            raise ValueError("IM03 method differs from prepared bundle")
    if (
        content_hash({gid: m["content_sha256"] for gid, m in bundle["members"].items()})
        != bundle["membership_sha256"]
    ):
        raise ValueError("IM03 membership differs")
    # Serialize identical admissions without modifying any publication pointer.
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
            {"key": "courtlens-im03:" + digest},
        )
    existing = session.scalar(
        select(WorkbenchDataset).where(
            WorkbenchDataset.content_sha256 == digest,
            WorkbenchDataset.membership_sha256 == bundle["membership_sha256"],
        )
    )
    # Verify every retained member before writing anything.
    all_within_two = True
    event_verified = True
    public_verified = True
    revised_gate = bundle.get("gate_version") == GATE_VERSION
    if "gate_version" in bundle and not revised_gate:
        raise ValueError("unknown IM03 verification gate")
    if (
        revised_gate
        and bundle.get("gate_contract_sha256")
        != hash_file(Path("docs/design/impact-event-verification-v1.md"))[0]
    ):
        raise ValueError("IM03 event verification contract changed")
    if (
        revised_gate
        and bundle.get("method_contract_sha256")
        != hash_file(Path("docs/design/impact-possession-method-v2.md"))[0]
    ):
        raise ValueError("IM03 possession method contract changed")
    measured_counts: Counter[str] = Counter()
    for gid, member in bundle["members"].items():
        game = read_json(Path(member["path"]))
        if (
            game["game_id"] != gid
            or game["method_version"] != method_version
            or game["content_sha256"] != member["content_sha256"]
            or content_hash({k: v for k, v in game.items() if k != "content_sha256"})
            != member["content_sha256"]
        ):
            raise ValueError("invalid IM03 game member")
        verify_candidate(read_json(Path(member["candidate_path"])), member["candidate_sha256"])
        if game["candidate_sha256"] != member["candidate_sha256"]:
            raise ValueError("IM03 game differs from accepted IM02 candidate")
        all_within_two &= all(abs(v["delta"]) <= 2 for v in game["conservation"].values())
        if revised_gate:
            check = verify_event_receipt(member, game)
            event_verified &= check["passed"]
            public_verified &= check["public_passed"]
        measured_counts["stints"] += len(game["stints"])
        measured_counts["possessions"] += len(game["possessions"])
    expected_gate = {
        "points_and_shooting_conserved": True,
        "accepted_player_seconds_preserved": True,
        "all_possession_estimates_within_two": all_within_two,
    }
    if revised_gate:
        expected_gate = {
            "points_and_shooting_conserved": True,
            "accepted_player_seconds_preserved": True,
            "all_event_boundaries_and_factors_verified": event_verified,
            "all_available_public_sequences_reviewed": public_verified,
        }
    if bundle["verification_gate"] != expected_gate or dict(measured_counts) != bundle["counts"]:
        raise ValueError("IM03 verification gates or row counts differ")
    if len(bundle["members"]) != bundle["im02_summary"]["scheduled_games"] - len(
        bundle["im02_summary"]["excluded_games"]
    ):
        raise ValueError("incomplete IM03 season/phase membership")
    if existing:
        return {
            "dataset_id": existing.id,
            "content_sha256": digest,
            "reused": True,
            "status": existing.status,
            **bundle["counts"],
        }
    if session.get(WorkbenchDataset, dataset_id):
        raise ValueError("cannot extend or replace an existing dataset")
    session.add(
        WorkbenchDataset(
            id=dataset_id,
            content_sha256=digest,
            membership_sha256=bundle["membership_sha256"],
            semantic_signature=content_hash(
                {"method": method_version, "code": bundle["code_sha256"]}
            ),
            source_namespace="courtlens-impact",
            parser_version=method_version,
            quality_version="possession-policy-v2",
            seasons_json=[season],
            phases_json=[bundle["phase"]],
            manifest_json={k: v for k, v in bundle.items() if k != "members"},
            coverage_json=bundle["im02_summary"],
            exclusions_json=bundle["im02_summary"]["excluded_games"],
            status="ready" if all(bundle["verification_gate"].values()) else "candidate",
        )
    )
    session.flush()
    artifact = session.scalar(
        select(WorkbenchArtifact).where(
            WorkbenchArtifact.sha256 == hash_file(bundle_path)[0],
            WorkbenchArtifact.resource == "impact-season-bundle",
        )
    )
    if artifact is None:
        artifact = WorkbenchArtifact(
            sha256=hash_file(bundle_path)[0],
            resource="impact-season-bundle",
            bytes=bundle_path.stat().st_size,
            storage_path=str(bundle_path),
            mime_type="application/gzip",
            source_attribution=(
                "NBA public data via shufinskiy/nba_data (Apache-2.0); "
                "SportsDataverse boxes/schedule; local non-commercial use"
            ),
        )
        session.add(artifact)
        session.flush()
    input_observed_at = datetime.fromisoformat(bundle["archive_observed_at"])
    observed_at = utc_now()
    acquisition = WorkbenchAcquisition(
        source_name="courtlens-impact",
        resource="impact-season-bundle",
        source_url="local:" + str(bundle_path),
        status="success",
        artifact_id=artifact.id,
        content_sha256=artifact.sha256,
        started_at=observed_at,
        finished_at=observed_at,
        metadata_json={
            "accepted_im02_sha256": bundle["accepted_im02_sha256"],
            "input_observed_at": input_observed_at.isoformat(),
        },
    )
    session.add(acquisition)
    session.flush()
    for index, (gid, member) in enumerate(sorted(bundle["members"].items())):
        game = read_json(Path(member["path"]))
        identity = session.scalar(
            select(WorkbenchIdentity).where(
                WorkbenchIdentity.namespace == "courtlens-impact",
                WorkbenchIdentity.kind == "game",
                WorkbenchIdentity.external_id == gid,
            )
        )
        if identity is None:
            identity = WorkbenchIdentity(
                namespace="courtlens-impact", kind="game", external_id=gid, display_name=gid
            )
            session.add(identity)
            session.flush()
        version = session.scalar(
            select(WorkbenchVersion).where(
                WorkbenchVersion.identity_id == identity.id,
                WorkbenchVersion.content_sha256 == member["content_sha256"],
                WorkbenchVersion.parser_version == method_version,
            )
        )
        if version is None:
            version = WorkbenchVersion(
                identity_id=identity.id,
                content_sha256=member["content_sha256"],
                parser_version=method_version,
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
        sch = member["schedule"]
        session.add(
            WorkbenchSchedule(
                dataset_id=dataset_id,
                game_id=gid,
                season=season,
                phase=bundle["phase"],
                game_date=date.fromisoformat(sch["game_date"]),
                home_team_id=sch["home_team_id"],
                away_team_id=sch["away_team_id"],
                game_status=3,
                source_version_id=version.id,
                source_observation_id=observation.id,
                annotations_json={
                    "quality": game["quality"],
                    "conservation": game["conservation"],
                    "candidate_sha256": member["candidate_sha256"],
                },
            )
        )
        session.flush()
        record_repair_result_overrides(
            session,
            dataset_id=dataset_id,
            result=read_json(Path(member["candidate_path"])),
            author="courtlens-im03",
        )
        if game.get("method_repairs"):
            from courtlens.services.possession_warehouse import record_reconstruction_override

            for repair in game["method_repairs"]:
                record_reconstruction_override(
                    session,
                    dataset_id=dataset_id,
                    game_id=gid,
                    override_type="impact_v2_event_repair",
                    reason=repair["reason"],
                    author="courtlens-im03-event-gate",
                    override_value=repair,
                    original_value={"team_id": repair["original_team_id"]},
                    team_id=repair["team_id"],
                    action_number=repair["locator"]["action_number"],
                    commit=False,
                    flush=False,
                )
        session.execute(
            insert(WorkbenchPossession).returning(WorkbenchPossession.id),
            [
                {"id": new_uuid(), "dataset_id": dataset_id, "game_id": gid, **p}
                for p in game["possessions"]
            ],
        )
        stint_rows = [
            {"id": new_uuid(), "dataset_id": dataset_id, "game_id": gid, **s}
            for s in game["stints"]
        ]
        session.execute(insert(WorkbenchLineupStint).returning(WorkbenchLineupStint.id), stint_rows)
        exposures = []
        for s in stint_rows:
            for side, other in (("home", "away"), ("away", "home")):
                for pid in s[f"{side}_lineup_json"]:
                    pstats = s["player_stats_json"].get(pid, {})
                    exposures.append(
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
                            "points": pstats.get("points", 0),
                            "team_points": s[f"{side}_points"],
                            "points_allowed": s[f"{other}_points"],
                            "stats_json": pstats,
                            "source_hash": s["source_hash"],
                        }
                    )
        session.execute(insert(WorkbenchStintPlayer).returning(WorkbenchStintPlayer.id), exposures)
        if (index + 1) % 200 == 0:
            print("persisted", season, bundle["phase"], index + 1, flush=True)
    session.flush()
    return {
        "dataset_id": dataset_id,
        "content_sha256": digest,
        "reused": False,
        "verification_gate": bundle["verification_gate"],
        **bundle["counts"],
    }


def verify_event_receipt(member: dict[str, Any], game: dict[str, Any]) -> dict[str, Any]:
    """Recompute independent verification; a receipt's pass flag is never trusted."""
    reference = member["event_verification"]
    proof = read_json(Path(reference["path"]))
    if (
        proof["content_sha256"] != reference["content_sha256"]
        or content_hash({k: v for k, v in proof.items() if k != "content_sha256"})
        != reference["content_sha256"]
    ):
        raise ValueError("invalid IM03 event verification receipt")
    candidate = read_json(Path(member["candidate_path"]))
    verify_candidate(candidate, member["candidate_sha256"])
    if (
        proof["source"] != candidate["arbitration"]["selected"]
        or proof["source_sha256"] != candidate["input_sha256"][proof["source"]]
    ):
        raise ValueError("event verification source differs from accepted candidate")
    events, _ = order_same_clock(
        normalize_events(
            proof["rows"],
            source=proof["source"],
            source_sha256=proof["source_sha256"],
            boxes=proof["player_boxes"],
        ),
        candidate["game_id"],
    )
    events, projected, repairs = project_team_actions(
        events=events,
        rows=proof["rows"],
        other_rows=proof.get("other_rows", []),
        input_sha256=candidate["input_sha256"],
        teams=tuple(b["team_id"] for b in proof["team_boxes"]),
    )
    if repairs != proof.get("method_repairs", []) or repairs != game.get("method_repairs", []):
        raise ValueError("IM03 event repairs do not reproduce")
    locators = [e.locator() for e in events]
    if any(
        [v["locator"] for v in values] != locators for values in candidate["event_lineups"].values()
    ):
        raise ValueError("event verification input identities differ from IM02")
    result = verify_event_game(
        events=events,
        raw_rows=projected,
        candidate=candidate,
        game=game,
        team_boxes=proof["team_boxes"],
    )
    if result != proof["result"]:
        raise ValueError("IM03 event verification does not reproduce")
    comparison = member["public_possession_crosscheck"]
    public_reviews = proof["public_reviews"]
    if comparison["status"] == "unavailable":
        if public_reviews:
            raise ValueError("unavailable public source has review evidence")
        public_passed = True
    elif comparison["status"] == "compared":
        if set(public_reviews) != set(comparison["deltas"]):
            raise ValueError("incomplete public sequence reviews")
        public_passed = True
        for team, review in public_reviews.items():
            if review["source_sha256"] != comparison["source_sha256"]:
                raise ValueError("public sequence source differs from cross-check")
            opponent = next(b["team_tricode"] for b in proof["team_boxes"] if b["team_id"] != team)
            groups = review["groups"]
            if review["opponent"] != opponent or any(
                normalize_game_id(g["GAMEID"]) != game["game_id"] or g["OPPONENT"] != opponent
                for g in groups
            ):
                raise ValueError("public group game/team identity mismatch")
            check = review_public_sequences(game, proof["rows"], groups, team)
            if (
                check != review["result"]
                or check["delta"] != comparison["deltas"][team]
                or len(groups) != comparison["public_unique_groups"][team]
            ):
                raise ValueError("IM03 public sequence verification does not reproduce")
            public_passed &= check["passed"]
    else:
        raise ValueError("unknown public sequence availability")
    return {**result, "public_passed": public_passed}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report", type=Path, default=Path("docs/evidence/im02/audit-accepted-first.json.gz")
    )
    parser.add_argument(
        "--observation",
        type=Path,
        default=Path(
            "data/raw/impact-archive/observations/068decb9-4599-4385-91dc-a541f1302ff3.json"
        ),
    )
    parser.add_argument("--raw-root", type=Path, default=Path("data/raw"))
    parser.add_argument("--output-root", type=Path, default=Path("data/derived/impact-population"))
    parser.add_argument("--populate", action="store_true")
    parser.add_argument(
        "--event-gate",
        action="store_true",
        help="prepare independently verified event-gate bundles",
    )
    parser.add_argument("--bundle", type=Path, action="append")
    args = parser.parse_args()
    paths = args.bundle or prepare_population(
        report_path=args.report,
        observation=args.observation,
        raw_root=args.raw_root,
        output_root=args.output_root,
        event_gate=args.event_gate,
    )
    if args.populate:
        from courtlens.database import SessionLocal
        from courtlens.services.possession_warehouse import build_possession_warehouse_for_season

        for path in paths:
            with SessionLocal.begin() as session:
                print(
                    json.dumps(
                        build_possession_warehouse_for_season(
                            session,
                            dataset_id=new_uuid(),
                            season=read_json(path)["season"],
                            impact_bundle=path,
                        )
                    ),
                    flush=True,
                )
    print(json.dumps({"bundles": [str(p) for p in paths]}))


if __name__ == "__main__":
    main()
