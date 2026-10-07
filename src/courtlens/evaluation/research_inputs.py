"""Independent byte/row verification and append-only admission of complete shot inputs."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date
from itertools import groupby
from pathlib import Path
from typing import Any

from sqlalchemy import insert, select, text
from sqlalchemy.orm import Session

from courtlens.database import session_scope
from courtlens.domain.rich_sources import compute_payload_hash
from courtlens.domain.shotchart import ShotAttempt, parse_shot, reconcile_game
from courtlens.evaluation.shot_corrections import apply_reviewed_corrections, load_ledger
from courtlens.evaluation.shotchart_admission import independent_sources, season_schedule
from courtlens.ingestion.shotchart import shot_rows, verify_source
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.models import new_uuid
from courtlens.research_models import ResearchDataset, ResearchGame, ResearchShotMember


@dataclass(frozen=True)
class SeasonBundle:
    root: Path
    shot_root: Path
    box_root: Path
    starting_year: int
    ledger: Path | None


def read_json(path: Path, *, maximum: int = 16 * 1024 * 1024) -> Any:
    if path.is_symlink() or not 0 < path.stat().st_size <= maximum:
        raise ValueError("research artifact byte/path limit")
    return json.loads(path.read_bytes())


def verified_games(bundle: SeasonBundle) -> Iterator[tuple[dict[str, Any], list[ShotAttempt]]]:
    manifest = read_json(bundle.root / "manifest.json", maximum=64 * 1024)
    if (
        not manifest["complete_reconciled_season"]
        or manifest["reconciled_games"] != 1230
        or manifest["quarantined_games"] != 0
        or manifest["transform_version"] != "courtload-shotchart-v2"
    ):
        raise ValueError("admission requires a complete reconciled v2 season")
    for name, declared in manifest["artifacts"].items():
        if Path(name).name != name or (bundle.root / name).is_symlink():
            raise ValueError("unsafe candidate artifact locator")
        digest, size = hash_file(bundle.root / name)
        if declared != {"sha256": digest, "bytes": size}:
            raise ValueError("candidate artifact checksum mismatch")
    if (
        manifest["quality_contract_sha256"]
        != hash_file(Path("docs/design/shotchart-admission-v2.md"))[0]
    ):
        raise ValueError("candidate quality contract mismatch")
    for name, digest in manifest["implementation_sha256"].items():
        if name not in (
            "domain/shotchart.py",
            "ingestion/shotchart.py",
            "evaluation/shotchart_admission.py",
            "evaluation/shot_corrections.py",
        ):
            raise ValueError("unknown candidate implementation")
        if hash_file(Path(__file__).parents[1] / name)[0] != digest:
            raise ValueError("candidate implementation changed; rerun admission audit")
    source = verify_source(bundle.shot_root, starting_year=bundle.starting_year)
    independent, raw = independent_sources(bundle.box_root, starting_year=bundle.starting_year)
    if source != manifest["source"] or independent != manifest["independent_sources"]:
        raise ValueError("candidate original-source receipt mismatch")
    schedule, denominator = season_schedule(
        raw["schedule"],
        starting_year=bundle.starting_year,
        before_date=date.fromisoformat(manifest["before_date"]),
    )
    if denominator != manifest["denominator"] or not denominator["denominator_verified"]:
        raise ValueError("independent denominator mismatch")
    archive: dict[str, list[ShotAttempt]] = defaultdict(list)
    for line, row in shot_rows(
        bundle.shot_root / f"datasets/shotdetail_{bundle.starting_year}.tar.xz",
        starting_year=bundle.starting_year,
    ):
        shot = parse_shot(row, starting_year=bundle.starting_year, source_line=line)
        archive[shot.game_id].append(shot)
        if len(archive[shot.game_id]) > 1000:
            raise ValueError("per-game attempt budget")
    if set(archive) != set(schedule):
        raise ValueError("original archive is not the exact complete-season membership")
    correction_hash = hash_file(bundle.ledger)[0] if bundle.ledger is not None else None
    if correction_hash != manifest.get("correction_ledger_sha256"):
        raise ValueError("candidate correction ledger mismatch")
    if bundle.ledger is not None:
        ledger, official = load_ledger(
            bundle.ledger,
            archive_sha256=next(a["sha256"] for a in source["assets"] if a["name"].endswith(".xz")),
            contract_sha256=manifest["quality_contract_sha256"],
        )
        for gid, observed in official.items():
            archive[gid], _ = apply_reviewed_corrections(archive[gid], ledger, observed)
    teams: dict[str, list[dict[str, str]]] = defaultdict(list)
    players: dict[str, list[dict[str, str]]] = defaultdict(list)
    for kind, groups in (("teams", teams), ("players", players)):
        for row in raw[kind]:
            groups[row["game_id"]].append(row)
    reports = {r["game_id"]: r for r in read_json(bundle.root / "games.json")}
    if len(reports) != 1230 or set(reports) != set(schedule):
        raise ValueError("candidate report game membership mismatch")
    seen = set()
    attempts = bundle.root / "attempts.jsonl"
    if attempts.stat().st_size > 384 * 1024 * 1024:
        raise ValueError("candidate normalized byte limit")

    def rows() -> Iterator[dict[str, Any]]:
        with attempts.open() as stream:
            for line in stream:
                if len(line) > 16 * 1024:
                    raise ValueError("candidate normalized row byte limit")
                yield json.loads(line)["attempt"]

    for gid, records in groupby(rows(), key=lambda r: r["game_id"]):
        if gid in seen or gid not in archive:
            raise ValueError("duplicate/extra normalized game group")
        seen.add(gid)
        values = list(records)
        original = sorted(archive[gid], key=lambda s: s.event_id)
        if compute_payload_hash(values) != compute_payload_hash([s.payload() for s in original]):
            raise ValueError(
                "normalized membership differs from independently verified original rows"
            )
        expected = reconcile_game(
            original,
            schedule[gid],
            teams[gid],
            players[gid],
            starting_year=bundle.starting_year,
            policy_version="v2",
        )
        if expected["status"] != "reconciled" or compute_payload_hash(
            expected
        ) != compute_payload_hash({k: reports[gid][k] for k in expected}):
            raise ValueError("independent all-attempt reconciliation differs from candidate")
        yield expected, original
    if seen != set(schedule):
        raise ValueError("missing normalized complete-game rows")


def admit_inputs(session: Session, bundles: list[SeasonBundle]) -> ResearchDataset:
    if session.bind is None or session.bind.dialect.name != "postgresql":
        raise ValueError("sealed research admission requires PostgreSQL")
    if len(bundles) < 3 or len({b.starting_year for b in bundles}) != len(bundles):
        raise ValueError("require three distinct complete seasons")
    manifests = [read_json(b.root / "manifest.json", maximum=64 * 1024) for b in bundles]
    review_hash = hash_file(Path("docs/design/research-source-admission-v1.md"))[0]
    sources = compute_payload_hash([m["source"] for m in manifests])
    transforms = compute_payload_hash(
        [
            {
                k: m[k]
                for k in (
                    "quality_contract_sha256",
                    "implementation_sha256",
                    "correction_ledger_sha256",
                )
            }
            for m in manifests
        ]
    )
    coverage = compute_payload_hash([hash_file(b.root / "games.json")[0] for b in bundles])
    content = compute_payload_hash(
        {
            "sources": sources,
            "transforms": transforms,
            "coverage": coverage,
            "attempts": [m["artifacts"]["attempts.jsonl"] for m in manifests],
            "use_review": review_hash,
        }
    )
    session.execute(text("SELECT pg_advisory_xact_lock(260026)"))
    if session.scalar(select(ResearchDataset.id).where(ResearchDataset.content_sha256 == content)):
        raise ValueError("research input already admitted; refusing membership replacement")
    dataset = ResearchDataset(
        id=new_uuid(),
        content_sha256=content,
        source_membership_sha256=sources,
        transform_sha256=transforms,
        coverage_report_sha256=coverage,
        admission_transaction=str(session.scalar(text("SELECT txid_current()"))),
        manifest_json={
            "scope": "local_noncommercial_research",
            "use_review_sha256": review_hash,
            "bundles": [
                {
                    "root": str(b.root),
                    "shot_root": str(b.shot_root),
                    "box_root": str(b.box_root),
                    "starting_year": b.starting_year,
                    "ledger": str(b.ledger) if b.ledger else None,
                    "manifest_sha256": hash_file(b.root / "manifest.json")[0],
                }
                for b in bundles
            ],
        },
    )
    session.add(dataset)
    session.flush()
    count = 0
    for bundle in bundles:
        for report, shots in verified_games(bundle):
            eligible = [s.payload() for s in shots if not s.geometry_exclusions]
            game = ResearchGame(
                dataset_id=dataset.id,
                game_id=report["game_id"],
                season=f"{bundle.starting_year}-{str(bundle.starting_year + 1)[-2:]}",
                game_date=report["game_date"],
                all_rows=len(shots),
                eligible_rows=len(eligible),
                row_membership_sha256=report["row_membership_sha256"],
                eligible_membership_sha256=compute_payload_hash(eligible),
            )
            session.add(game)
            session.flush()
            session.execute(
                insert(ResearchShotMember),
                [
                    {
                        "dataset_id": dataset.id,
                        "game_id": s.game_id,
                        "event_id": s.event_id,
                        "eligible": not s.geometry_exclusions,
                        "payload_json": s.payload(),
                    }
                    for s in shots
                ],
            )
            count += len(shots)
            if count > 1_000_000:
                raise ValueError("research input row budget exceeded")
    return dataset


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("specification", type=Path)
    args = parser.parse_args()
    spec = read_json(args.specification, maximum=64 * 1024)
    bundles = [
        SeasonBundle(
            Path(b["root"]),
            Path(b["shot_root"]),
            Path(b["box_root"]),
            b["starting_year"],
            Path(b["ledger"]) if b["ledger"] else None,
        )
        for b in spec
    ]
    with session_scope() as session:
        dataset = admit_inputs(session, bundles)
        print(
            json.dumps(
                {
                    "dataset_id": dataset.id,
                    "content_sha256": dataset.content_sha256,
                    "status": "admitted_append_only",
                    "fit_authorized": False,
                }
            )
        )


if __name__ == "__main__":
    main()
