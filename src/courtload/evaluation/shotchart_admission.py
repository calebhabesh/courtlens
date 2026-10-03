"""Offline B26 shot input audit with exclusive evidence retention; never fits or publishes."""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import lzma
import sqlite3
import tarfile
import tempfile
from collections import Counter, defaultdict
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from courtload.domain.rich_sources import compute_payload_hash
from courtload.domain.shotchart import (
    POLICY_VERSIONS,
    REQUIRED_COLUMNS,
    TRANSFORM_VERSION,
    ShotAttempt,
    game_identity,
    integer,
    parse_shot,
    reconcile_game,
)
from courtload.evaluation.shot_corrections import apply_reviewed_corrections, load_ledger
from courtload.ingestion.shotchart import (
    MAX_EXPANDED_BYTES,
    MAX_FIELD_BYTES,
    acquire_source,
    shot_rows,
    verify_source,
)
from courtload.ingestion.sportsdataverse import hash_file
from courtload.ingestion.workbench_source_config import (
    player_boxscores_url,
    schedule_csv_url,
    team_boxscores_url,
)


def _write_json(path: Path, payload: Any) -> None:
    with path.open("x", encoding="utf-8") as stream:
        json.dump(payload, stream, sort_keys=True, indent=2, allow_nan=False)
        stream.write("\n")


def _independent_rows(path: Path) -> list[dict[str, str]]:
    if not 0 < path.stat().st_size <= MAX_EXPANDED_BYTES:
        raise ValueError("independent source file size limit")
    opener = gzip.open if path.suffix == ".gz" else Path.open
    previous = csv.field_size_limit(MAX_FIELD_BYTES)
    try:
        with opener(path, "rt", encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream, strict=True)
            headers = reader.fieldnames or []
            if not headers or len(headers) != len(set(headers)):
                raise ValueError("invalid independent source header")
            result = []
            expanded_size = 0
            for row in reader:
                if None in row or any(v is None for v in row.values()):
                    raise ValueError("invalid independent source record")
                expanded_size += sum(len(v.encode()) for v in row.values())
                result.append(row)
                if len(result) > 50_000 or expanded_size > MAX_EXPANDED_BYTES:
                    raise ValueError("independent source row/expanded byte limit")
            return result
    finally:
        csv.field_size_limit(previous)


def independent_sources(
    root: Path, *, starting_year: int
) -> tuple[dict[str, Any], dict[str, list[dict[str, str]]]]:
    receipt = root / "retrieval-manifest.json"
    if receipt.stat().st_size > 64 * 1024:
        raise ValueError("independent source receipt too large")
    manifest = json.loads(receipt.read_text())
    year = starting_year + 1
    if manifest["ending_year"] != year:
        raise ValueError("independent source season mismatch")
    specs = {
        "schedule": (f"nba_schedule_{year}.csv.gz", schedule_csv_url(year)),
        "teams": (f"team_boxscores_{year}.csv", team_boxscores_url(year)),
        "players": (f"player_boxscores_{year}.csv", player_boxscores_url(year)),
    }
    verified = []
    rows = {}
    for kind, (name, url) in specs.items():
        declared = manifest["files"][
            {"teams": "team_boxscores", "players": "player_boxscores"}.get(kind, kind)
        ]
        path = root / name
        if not 0 < path.stat().st_size <= MAX_EXPANDED_BYTES:
            raise ValueError("independent source file size limit")
        digest, size = hash_file(path)
        if declared["url"] != url or declared["sha256"] != digest or declared["bytes"] != size:
            raise ValueError("independent source receipt mismatch")
        verified.append({"kind": kind, "name": name, "url": url, "sha256": digest, "bytes": size})
        rows[kind] = _independent_rows(path)
    return {
        "receipt_sha256": hash_file(receipt)[0],
        "assets": verified,
        "receipt_acquired_at_utc": manifest["acquired_at_utc"],
        "observation_limit": (
            "retained receipt reports acquisition/reuse; not historical availability proof"
        ),
    }, rows


def season_schedule(
    rows: list[dict[str, str]], *, starting_year: int, before_date: date
) -> tuple[dict[str, dict[str, str]], dict[str, Any]]:
    games = {}
    appearances: Counter[str] = Counter()
    for row in rows:
        if row["season_type"] != "regular-season":
            continue
        gid = game_identity(row["game_id"], starting_year)
        if row["season"] != str(starting_year + 1) or gid in games:
            raise ValueError("duplicate/wrong-season regular schedule")
        game_date = date.fromisoformat(row["game_date"])
        if (
            not date(starting_year, 7, 1)
            <= game_date
            < min(before_date, date(starting_year + 1, 7, 1))
        ):
            raise ValueError("schedule date outside completed historical scope")
        home, away = row["home_team_id"], row["away_team_id"]
        integer(home, "home_team_id", minimum=1)
        integer(away, "away_team_id", minimum=1)
        home_pts, away_pts = (
            integer(row["home_pts"], "home_pts"),
            integer(row["away_pts"], "away_pts"),
        )
        if (
            home == away
            or home_pts == away_pts
            or (row["home_wl"], row["away_wl"])
            != (("W", "L") if home_pts > away_pts else ("L", "W"))
        ):
            raise ValueError("nonfinal/nonreciprocal schedule outcome")
        games[gid] = row
        appearances.update([home, away])
    complete = len(games) == 1230 and len(appearances) == 30 and set(appearances.values()) == {82}
    return games, {
        "expected_games": len(games),
        "teams": len(appearances),
        "team_games": dict(sorted(appearances.items())),
        "denominator_verified": complete,
        "membership_sha256": compute_payload_hash([games[k] for k in sorted(games)]),
    }


def quality_contract(policy_version: str) -> Path:
    if policy_version not in POLICY_VERSIONS:
        raise ValueError("unknown shot admission policy")
    return Path(f"docs/design/shotchart-admission-{policy_version}.md")


def verify_game_proof(
    root: Path,
    *,
    source: dict[str, Any],
    independent: dict[str, Any],
    policy_version: str = "v1",
    correction_ledger_sha256: str | None = None,
) -> None:
    """Check retained proof bytes against this exact source, recipe and independent boxes."""
    manifest = root / "manifest.json"
    if manifest.stat().st_size > 64 * 1024:
        raise ValueError("game proof too large")
    proof = json.loads(manifest.read_text())
    if (
        proof["scope"] != "one_game"
        or proof["status"] != "reconciled_offline_candidate"
        or proof["reconciled_games"] != 1
        or proof["quarantined_games"] != 0
        or proof["source"] != source
        or proof["independent_sources"] != independent
        or proof.get("correction_ledger_sha256") != correction_ledger_sha256
    ):
        raise ValueError("game proof does not reconcile these exact sources")
    if (
        proof["quality_contract_sha256"] != hash_file(quality_contract(policy_version))[0]
        or proof["transform_version"] != f"courtload-shotchart-{policy_version}"
    ):
        raise ValueError("game proof quality recipe changed")
    for name in (
        "domain/shotchart.py",
        "ingestion/shotchart.py",
        "evaluation/shotchart_admission.py",
    ):
        if proof["implementation_sha256"][name] != hash_file(Path(__file__).parents[1] / name)[0]:
            raise ValueError("game proof implementation changed; rerun one-game audit")
    for name in ("attempts.jsonl", "games.json", "rejected-rows.json", "source-games.json"):
        digest, size = hash_file(root / name)
        if proof["artifacts"][name] != {"sha256": digest, "bytes": size}:
            raise ValueError("game proof artifact bytes changed")
    if policy_version == "v2":
        path = root / "policy-registration.json"
        digest, size = hash_file(path)
        if proof["artifacts"][path.name] != {"sha256": digest, "bytes": size}:
            raise ValueError("game proof policy registration bytes changed")
    if correction_ledger_sha256 is not None:
        for name in ("correction-ledger.json", "corrections.json"):
            digest, size = hash_file(root / name)
            if proof["artifacts"][name] != {"sha256": digest, "bytes": size}:
                raise ValueError("game proof correction artifact bytes changed")
        if (
            proof["implementation_sha256"]["evaluation/shot_corrections.py"]
            != hash_file(Path(__file__).with_name("shot_corrections.py"))[0]
        ):
            raise ValueError("game proof correction implementation changed")


def audit_source(
    *,
    shot_root: Path,
    box_root: Path,
    starting_year: int,
    before_date: date,
    output: Path,
    game_id: str | None = None,
    game_proof: Path | None = None,
    policy_version: str = "v1",
    correction_ledger: Path | None = None,
) -> dict[str, Any]:
    contract_sha256 = hash_file(quality_contract(policy_version))[0]
    source = verify_source(shot_root, starting_year=starting_year)
    ledger = None
    official: dict[str, dict[int, dict[str, Any]]] = {}
    correction_hash = None
    if correction_ledger is not None:
        if policy_version != "v2":
            raise ValueError("corrections require separately registered v2 policy")
        ledger, official = load_ledger(
            correction_ledger,
            archive_sha256=next(a["sha256"] for a in source["assets"] if a["name"].endswith(".xz")),
            contract_sha256=contract_sha256,
        )
        correction_hash = hash_file(correction_ledger)[0]
    independent, raw = independent_sources(box_root, starting_year=starting_year)
    schedule, denominator = season_schedule(
        raw["schedule"], starting_year=starting_year, before_date=before_date
    )
    if game_id is not None:
        game_id = game_identity(game_id, starting_year)
        if game_id not in schedule:
            raise ValueError("selected game lacks finalized independent schedule")
    else:
        if game_proof is None:
            raise ValueError("season expansion requires retained successful one-game proof")
        verify_game_proof(
            game_proof,
            source=source,
            independent=independent,
            policy_version=policy_version,
            correction_ledger_sha256=correction_hash,
        )
    selected = {game_id: schedule[game_id]} if game_id is not None else schedule
    teams: dict[str, list[dict[str, str]]] = defaultdict(list)
    players: dict[str, list[dict[str, str]]] = defaultdict(list)
    for name, grouped in (("teams", teams), ("players", players)):
        for row in raw[name]:
            if row["game_id"] in selected:
                grouped[row["game_id"]].append(row)
    # Exclusive output directory protects retained candidates, even on a failed attempt.
    output.mkdir(parents=True, exist_ok=False)
    if correction_ledger is not None:
        with (output / "correction-ledger.json").open("xb") as stream:
            stream.write(correction_ledger.read_bytes())
    implementation = {
        name: hash_file(Path(__file__).parents[1] / name)[0]
        for name in (
            "domain/shotchart.py",
            "ingestion/shotchart.py",
            "evaluation/shotchart_admission.py",
        )
    }
    if ledger is not None:
        implementation["evaluation/shot_corrections.py"] = hash_file(
            Path(__file__).with_name("shot_corrections.py")
        )[0]
    if policy_version == "v2":
        _write_json(
            output / "policy-registration.json",
            {
                "schema_version": "courtload-shot-input-policy-registration-v1",
                "transform_version": "courtload-shotchart-v2",
                "registered_at": datetime.now(UTC).isoformat(),
                "quality_contract_sha256": contract_sha256,
                "parent_quality_contract_sha256": hash_file(quality_contract("v1"))[0],
                "implementation_sha256": implementation,
                "event_order": "identity_only_reversals_diagnostic",
                "sequence_analytics_authorized": False,
                "fit_authorized": False,
            },
        )
    rejected_rows: list[dict[str, Any]] = []
    bad_games: dict[str, list[str]] = defaultdict(list)
    source_games: Counter[str] = Counter()
    scan_rows = 0
    unscoped_failure = False
    reports = []
    corrections: list[dict[str, Any]] = []
    with (
        tempfile.TemporaryDirectory(prefix="courtload-shotchart-") as temporary,
        sqlite3.connect(Path(temporary) / "spool.sqlite") as spool,
    ):
        spool.execute(
            "CREATE TABLE attempts (game_id TEXT, event_id INTEGER, payload TEXT, raw TEXT)"
        )
        spool.execute("CREATE INDEX game_events ON attempts(game_id, event_id)")
        for line, row in shot_rows(
            shot_root / f"datasets/shotdetail_{starting_year}.tar.xz",
            starting_year=starting_year,
        ):
            scan_rows += 1
            if REQUIRED_COLUMNS - row.keys():
                raise ValueError("source missing required ShotChartDetail columns")
            try:
                gid = game_identity(row["GAME_ID"], starting_year)
            except ValueError as exc:
                unscoped_failure = True
                rejected_rows.append(
                    {
                        "source_line": line,
                        "game_id": None,
                        "reason": str(exc),
                        "raw_fields_sha256": compute_payload_hash(row),
                    }
                )
                continue
            source_games[gid] += 1
            if game_id is not None and gid != game_id and gid not in official:
                continue
            if source_games[gid] > 1000:
                raise ValueError("per-game shot row limit")
            try:
                shot = parse_shot(row, starting_year=starting_year, source_line=line)
            except ValueError as exc:
                bad_games[gid].append(str(exc))
                rejected_rows.append(
                    {
                        "source_line": line,
                        "game_id": gid,
                        "reason": str(exc),
                        "raw_fields_sha256": compute_payload_hash(row),
                    }
                )
                continue
            spool.execute(
                "INSERT INTO attempts VALUES (?, ?, ?, ?)",
                (
                    gid,
                    shot.event_id,
                    json.dumps(shot.payload(), allow_nan=False),
                    json.dumps(row),
                ),
            )
        with (output / "attempts.jsonl").open("x", encoding="utf-8") as normalized:
            for gid in sorted(set(selected) | set(official)):
                shots = []
                raw_by_event = {}
                for payload, raw_fields in spool.execute(
                    "SELECT payload, raw FROM attempts WHERE game_id=? ORDER BY event_id",
                    (gid,),
                ):
                    values = json.loads(payload)
                    values["geometry_exclusions"] = tuple(values["geometry_exclusions"])
                    shots.append(ShotAttempt(**values))
                    raw_by_event[values["event_id"]] = json.loads(raw_fields)
                precorrection = None
                if ledger is not None and gid in official:
                    if gid in bad_games:
                        raise ValueError("malformed correction game remains quarantined")
                    if gid in selected:
                        precorrection = reconcile_game(
                            shots,
                            selected[gid],
                            teams[gid],
                            players[gid],
                            starting_year=starting_year,
                            policy_version=policy_version,
                        )
                    shots, removed = apply_reviewed_corrections(shots, ledger, official[gid])
                    corrections.extend(
                        {"attempt": s.payload(), "raw_fields": raw_by_event[s.event_id]}
                        for s in removed
                    )
                    for entry in ledger.entries:
                        if entry.game_id == gid and entry.operation == "append_official_attempt":
                            raw_by_event[entry.event_id] = entry.official_raw_action
                            corrections.append(
                                {
                                    "operation": entry.operation,
                                    "attempt": next(
                                        s.payload() for s in shots if s.event_id == entry.event_id
                                    ),
                                    "raw_fields": entry.official_raw_action,
                                }
                            )
                    shots.sort(key=lambda s: s.event_id)
                if gid not in selected:
                    continue
                for shot in shots:
                    normalized.write(
                        json.dumps(
                            {"attempt": shot.payload(), "raw_fields": raw_by_event[shot.event_id]},
                            sort_keys=True,
                        )
                        + "\n"
                    )
                result = reconcile_game(
                    shots,
                    selected[gid],
                    teams[gid],
                    players[gid],
                    starting_year=starting_year,
                    policy_version=policy_version,
                )
                if precorrection is not None:
                    result["precorrection"] = precorrection
                if gid in bad_games:
                    result["reasons"] = sorted(set(result["reasons"] + bad_games[gid]))
                    result["status"] = "quarantined"
                    result["model_eligible_attempts"] = 0
                reports.append(result)
    extra = sorted(set(source_games) - set(schedule)) if game_id is None else []
    reconciled = sum(r["status"] == "reconciled" for r in reports)
    complete = (
        game_id is None
        and denominator["denominator_verified"]
        and not extra
        and not unscoped_failure
        and reconciled == len(schedule)
    )
    passed = complete if game_id is None else reconciled == 1 and not unscoped_failure
    _write_json(output / "games.json", reports)
    _write_json(output / "rejected-rows.json", rejected_rows)
    _write_json(output / "source-games.json", dict(sorted(source_games.items())))
    if ledger is not None:
        _write_json(output / "corrections.json", corrections)
    artifacts = {
        name: {"sha256": hash_file(output / name)[0], "bytes": (output / name).stat().st_size}
        for name in ("attempts.jsonl", "games.json", "rejected-rows.json", "source-games.json")
    }
    if policy_version == "v2":
        path = output / "policy-registration.json"
        digest, size = hash_file(path)
        artifacts[path.name] = {"sha256": digest, "bytes": size}
    if ledger is not None:
        for name in ("correction-ledger.json", "corrections.json"):
            digest, size = hash_file(output / name)
            artifacts[name] = {"sha256": digest, "bytes": size}
    report = {
        "schema_version": "courtload-shotchart-audit-v1",
        "candidate_id": str(uuid4()),
        "observed_at": datetime.now(UTC).isoformat(),
        "transform_version": TRANSFORM_VERSION
        if policy_version == "v1"
        else "courtload-shotchart-v2",
        "scope": "one_game" if game_id is not None else "season",
        "game_id": game_id,
        "game_proof_sha256": hash_file(game_proof / "manifest.json")[0] if game_proof else None,
        "season": f"{starting_year}-{str(starting_year + 1)[-2:]}",
        "before_date": before_date.isoformat(),
        "source": source,
        "independent_sources": independent,
        "denominator": denominator,
        "source_rows_scanned": scan_rows,
        "source_games": len(source_games),
        "expected_games": len(selected),
        "reconciled_games": reconciled,
        "quarantined_games": len(reports) - reconciled,
        "game_reason_counts": dict(
            sorted(
                Counter(
                    reason.split(":")[0] for result in reports for reason in result["reasons"]
                ).items()
            )
        ),
        "games_with_clock_order_diagnostics": sum(
            bool(r["clock_order_violations"]) for r in reports
        ),
        "clock_order_diagnostic_count": sum(len(r["clock_order_violations"]) for r in reports),
        "sequence_analytics_authorized": False,
        "corrections_applied": len(corrections),
        "correction_ledger_sha256": correction_hash,
        "extra_source_games": extra,
        "unscoped_identity_failure": unscoped_failure,
        "rejected_rows": len(rejected_rows),
        "observed_attempts": sum(r["observed_attempts"] for r in reports),
        "model_eligible_attempts": sum(r["model_eligible_attempts"] for r in reports),
        "geometry_excluded_attempts": sum(len(r["geometry_exclusions"]) for r in reports),
        "status": "reconciled_offline_candidate" if passed else "source_blocked",
        "complete_reconciled_season": complete,
        "fit_authorized": False,
        "database_admitted": False,
        "reuse_scope": "local research diagnostic; public redistribution unresolved",
        "remaining_gates": [
            "independent reuse/admission review",
            "append-only database membership",
            "three complete seasons",
            "chronology amendment and exact split binding",
        ],
        "artifacts": artifacts,
        "implementation_sha256": implementation,
        "quality_contract_sha256": contract_sha256,
    }
    report["candidate_content_sha256"] = compute_payload_hash(
        {
            "source": source,
            "independent_sources": independent,
            "artifacts": artifacts,
            "implementation_sha256": report["implementation_sha256"],
            "quality_contract_sha256": report["quality_contract_sha256"],
            "correction_ledger_sha256": correction_hash,
        }
    )
    _write_json(output / "manifest.json", report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shot-source-dir", type=Path, required=True)
    parser.add_argument("--box-source-dir", type=Path, required=True)
    parser.add_argument("--starting-year", type=int, required=True)
    parser.add_argument("--before-date", type=date.fromisoformat, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--game-id")
    parser.add_argument("--game-proof-dir", type=Path)
    parser.add_argument("--policy-version", choices=POLICY_VERSIONS, default="v1")
    parser.add_argument("--correction-ledger", type=Path)
    parser.add_argument("--acquire-revision", help="Explicitly acquire into a new source directory")
    args = parser.parse_args()
    try:
        if args.acquire_revision:
            acquire_source(
                args.shot_source_dir,
                revision=args.acquire_revision,
                starting_year=args.starting_year,
            )
        result = audit_source(
            shot_root=args.shot_source_dir,
            box_root=args.box_source_dir,
            starting_year=args.starting_year,
            before_date=args.before_date,
            output=args.output_dir,
            game_id=args.game_id,
            game_proof=args.game_proof_dir,
            policy_version=args.policy_version,
            correction_ledger=args.correction_ledger,
        )
    except (
        OSError,
        ValueError,
        KeyError,
        csv.Error,
        EOFError,
        sqlite3.Error,
        lzma.LZMAError,
        tarfile.TarError,
    ) as exc:
        parser.exit(2, f"shot input audit failed: {exc}\n")
    print(
        json.dumps(
            {
                k: result[k]
                for k in (
                    "status",
                    "scope",
                    "reconciled_games",
                    "quarantined_games",
                    "model_eligible_attempts",
                    "complete_reconciled_season",
                    "fit_authorized",
                )
            }
        )
    )
    if result["status"] == "source_blocked":
        parser.exit(2)


if __name__ == "__main__":
    main()
