"""Complete-season assignment admission with exact source identity and decimal exposure.

The caller owns commit/rollback. No admin bypass, public pointer or existing box
dataset is touched. A failed game rejects the entire candidate, with diagnostics.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import re
import shutil
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from sqlalchemy import insert, select, text
from sqlalchemy.orm import Session

from courtload.assignment_models import (
    AssignmentDataset,
    AssignmentGame,
    AssignmentMember,
    AssignmentObservation,
)
from courtload.domain.rich_sources import compute_payload_hash
from courtload.ingestion.sportsdataverse import hash_file
from courtload.ingestion.workbench_normalization import normalize_game_id, parse_schedule_file
from courtload.models import new_uuid

POLICY_VERSION = "assignment-exposure-v1"
DENOMINATORS = {
    "matchup_seconds": "source matchup_minutes_sort seconds; display MM:SS is not arithmetic input",
    "partial_possessions": "provider fractional matchup credits, not ordinary team possessions",
    "percentage_defender_total_time": "provider share of defender floor time",
    "percentage_offensive_total_time": "provider share of offensive player floor time",
    "percentage_total_time_both_on": "provider share of shared floor time",
    "shooting_percentage": (
        "sum source makes / sum corresponding source attempts; zero attempts is unknown"
    ),
    "limitations": (
        "Provider tracking/credit allocation is not independently reconstructed. "
        "Pair credits and help fields need not conserve box totals. "
        "No causal impact, nearest-defender or WOWY claim."
    ),
}
COUNTS = (
    "switches_on",
    "player_points",
    "team_points",
    "matchup_assists",
    "matchup_potential_assists",
    "matchup_turnovers",
    "matchup_blocks",
    "matchup_field_goals_made",
    "matchup_field_goals_attempted",
    "matchup_three_pointers_made",
    "matchup_three_pointers_attempted",
    "help_blocks",
    "help_field_goals_made",
    "help_field_goals_attempted",
    "matchup_free_throws_made",
    "matchup_free_throws_attempted",
    "shooting_fouls",
)
PAIRS = (
    ("matchup_field_goals_made", "matchup_field_goals_attempted"),
    ("matchup_three_pointers_made", "matchup_three_pointers_attempted"),
    ("matchup_free_throws_made", "matchup_free_throws_attempted"),
    ("help_field_goals_made", "help_field_goals_attempted"),
)
PERCENTAGES = (
    "percentage_defender_total_time",
    "percentage_offensive_total_time",
    "percentage_total_time_both_on",
    "matchup_field_goals_percentage",
    "matchup_three_pointers_percentage",
    "help_field_goals_percentage",
)
BOX_COUNTS = (
    "field_goals_made",
    "field_goals_attempted",
    "three_pointers_made",
    "three_pointers_attempted",
)


class AssignmentAdmissionError(ValueError):
    def __init__(self, failures: list[dict[str, Any]]) -> None:
        self.failures = failures
        super().__init__(f"Assignment candidate rejected: {len(failures)} failures")


def source_rows(path: Path) -> Any:
    opener = gzip.open if path.suffix == ".gz" else Path.open
    with opener(path, "rt", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or len(reader.fieldnames) != len(set(reader.fieldnames)):
            raise ValueError("missing/duplicate CSV header")
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError("malformed CSV row")
            yield row


def nonnegative(raw: str) -> Decimal:
    value = Decimal(raw)
    if not value.is_finite() or value < 0:
        raise ValueError(f"invalid nonnegative exposure: {raw!r}")
    return value


def integer(raw: str) -> int:
    if not re.fullmatch(r"\d+", raw):
        raise ValueError(f"unknown/noninteger count: {raw!r}")
    return int(raw)


def retain(path: Path, root: Path) -> dict[str, Any]:
    """Retain full byte streams before admission; exclusive creation never replaces bytes."""
    digest, size = hash_file(path)
    target = root / digest / path.name
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with target.open("xb") as output, path.open("rb") as source:
            shutil.copyfileobj(source, output)
    except FileExistsError:
        pass
    if hash_file(target) != (digest, size):
        raise ValueError("retained input checksum differs")
    return {"sha256": digest, "bytes": size, "locator": str(target.relative_to(root))}


def prepare_assignments(
    source: Path, baseline: Path | dict[str, Path], methodology: Path, store: Path, year: int
) -> dict[str, Any]:
    inputs = {"assignments": retain(source, store), "methodology": retain(methodology, store)}
    teams: dict[str, dict[str, dict[str, str]]] = defaultdict(dict)
    players: dict[str, dict[str, dict[str, str]]] = defaultdict(dict)
    for family, target, identity in (("team", teams, "team_id"), ("player", players, "person_id")):
        path = (
            baseline[family]
            if isinstance(baseline, dict)
            else baseline / f"{family}_boxscores_{year}.csv"
        )
        inputs[family] = retain(path, store)
        for row in source_rows(store / inputs[family]["locator"]):
            gid = normalize_game_id(row["game_id"])
            if not gid.startswith("002"):
                continue
            if row[identity] in target[gid]:
                raise ValueError("duplicate independent box identity")
            if integer(row["season"]) != year:
                raise ValueError("independent box season mismatch")
            target[gid][row[identity]] = row
    schedule_path = (
        baseline["schedule"]
        if isinstance(baseline, dict)
        else baseline / f"nba_schedule_{year}.csv.gz"
    )
    inputs["schedule"] = retain(schedule_path, store)
    schedule = {
        gid: game
        for gid, game in parse_schedule_file(store / inputs["schedule"]["locator"]).items()
        if game["phase"] == "regular_season"
    }
    if not schedule or set(teams) != set(schedule) or set(players) != set(schedule):
        raise ValueError("independent schedule/team/player coverage mismatch")
    for gid, game in schedule.items():
        if gid[3:5] != str(year - 1)[-2:]:
            raise ValueError("schedule season mismatch")
        boxes = teams[gid]
        if len(boxes) != 2 or {row["side"] for row in boxes.values()} != {"home", "away"}:
            raise ValueError("independent two-team baseline incomplete")
        for tid, box in boxes.items():
            side = box["side"]
            if tid != game[side + "_team_id"] or integer(box["points"]) != game[side + "_pts"]:
                raise ValueError(f"independent schedule/team outcome mismatch: {gid}")
            for metric in BOX_COUNTS:
                total = sum(
                    integer(row[metric]) for row in players[gid].values() if row["team_id"] == tid
                )
                if total != integer(box[metric]):
                    raise ValueError(f"independent player/team count mismatch: {gid}/{metric}")
        if any(row["team_id"] not in boxes for row in players[gid].values()):
            raise ValueError("independent player on unknown team")

    members: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    observed: set[str] = set()
    excluded = 0
    for number, row in enumerate(source_rows(store / inputs["assignments"]["locator"]), 1):
        gid = "unresolved"
        try:
            gid = normalize_game_id(row["game_id"])
            if not gid.startswith("002"):
                excluded += 1
                continue
            observed.add(gid)
            if (
                gid not in schedule
                or integer(row["season"]) != year
                or row["season_type_id"] != "2"
            ):
                raise ValueError("assignment season/game/phase mismatch")
            off, defense = row["off_person_id"], row["def_person_id"]
            key = (gid, off, defense)
            if key in seen:
                raise ValueError("duplicate assignment pair")
            seen.add(key)
            if off == defense or row["off_team_id"] == row["def_team_id"]:
                raise ValueError("assignment same side")
            for pid, team_key in ((off, "off_team_id"), (defense, "def_team_id")):
                if (
                    not pid.isdigit()
                    or int(pid) <= 0
                    or players[gid].get(pid, {}).get("team_id") != row[team_key]
                ):
                    raise ValueError("assignment player/team identity mismatch")
            if (
                row["side"] not in ("home", "away")
                or schedule[gid][row["side"] + "_team_id"] != row["off_team_id"]
            ):
                raise ValueError("assignment offensive side mismatch")
            seconds = nonnegative(row["matchup_minutes_sort"])
            exposure = nonnegative(row["partial_possessions"])
            if not re.fullmatch(r"\d+:[0-5]\d", row["matchup_minutes"]):
                raise ValueError("invalid display minutes")
            for field in COUNTS:
                integer(row[field])
            for made, attempted in PAIRS:
                if integer(row[made]) > integer(row[attempted]):
                    raise ValueError(f"makes exceed attempts: {made}")
            if integer(row["matchup_three_pointers_made"]) > integer(
                row["matchup_field_goals_made"]
            ) or integer(row["matchup_three_pointers_attempted"]) > integer(
                row["matchup_field_goals_attempted"]
            ):
                raise ValueError("three-pointers exceed field goals")
            for field in PERCENTAGES:
                if row[field] and nonnegative(row[field]) > 1:
                    raise ValueError(f"percentage out of range: {field}")
            members.append(
                {
                    "source_row": number,
                    "game_id": gid,
                    "off_person_id": off,
                    "def_person_id": defense,
                    "off_team_id": row["off_team_id"],
                    "def_team_id": row["def_team_id"],
                    "matchup_seconds": seconds,
                    "partial_possessions": exposure,
                    "row_sha256": compute_payload_hash(row),
                    "payload_json": row,
                }
            )
        except (ValueError, KeyError, InvalidOperation) as exc:
            failures.append({"game_id": gid, "source_row": number, "reason": str(exc)})
    failures.extend(
        {"game_id": gid, "source_row": None, "reason": "missing assignments"}
        for gid in sorted(set(schedule) - observed)
    )
    if failures:
        raise AssignmentAdmissionError(failures)
    games = []
    by_game: dict[str, list[list[Any]]] = defaultdict(list)
    for member in members:
        by_game[member["game_id"]].append([member["source_row"], member["row_sha256"]])
    for gid in sorted(by_game):
        games.append(
            {
                "game_id": gid,
                "game_date": str(schedule[gid]["game_date"]),
                "row_count": len(by_game[gid]),
                "membership_sha256": compute_payload_hash(by_game[gid]),
            }
        )
    membership = compute_payload_hash([[m["source_row"], m["row_sha256"]] for m in members])
    manifest = {
        "policy_version": POLICY_VERSION,
        "transform_sha256": hash_file(Path(__file__))[0],
        "normalization_sha256": hash_file(
            Path(__file__).parents[1] / "ingestion" / "workbench_normalization.py"
        )[0],
        "hash_policy_sha256": hash_file(Path(__file__).parents[1] / "domain" / "rich_sources.py")[
            0
        ],
        "source_url": f"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats_game_matchups/game_matchups_{year}.csv",
        "season": f"{year - 1}-{str(year)[-2:]}",
        "phase": "regular_season",
        "inputs": inputs,
        "membership_sha256": membership,
        "row_identity": (
            "retained SHA-256 plus 1-based CSV data-row number; "
            "every decoded field hashed as canonical JSON, original CSV bytes retained"
        ),
        "denominators": DENOMINATORS,
        "games": games,
        "coverage": {
            "games": len(games),
            "rows": len(members),
            "excluded_nonregular_rows": excluded,
            "rejected_games": [],
        },
        "appearance_scope": (
            "independent player/team participation identities; "
            "no box-minute repair or reconstructed floor-time certification"
        ),
    }
    return {
        "manifest": manifest,
        "content_sha256": compute_payload_hash(manifest),
        "members": members,
    }


def admit_assignments(session: Session, candidate: dict[str, Any]) -> AssignmentDataset:
    """Stage atomic admission. PostgreSQL unique identity serializes concurrent replays."""
    if session.get_bind().dialect.name != "postgresql":
        raise ValueError("assignment sealing requires PostgreSQL")
    digest = candidate["content_sha256"]
    # Transaction lock serializes identical admissions without mutating older inputs.
    key = int.from_bytes(hashlib.sha256(digest.encode()).digest()[:8], "big", signed=True)
    session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
    existing = session.scalar(
        select(AssignmentDataset).where(AssignmentDataset.content_sha256 == digest)
    )
    if existing is not None:
        session.add(AssignmentObservation(dataset_id=existing.id))
        session.flush()
        return existing
    manifest = candidate["manifest"]
    dataset = AssignmentDataset(
        id=new_uuid(),
        content_sha256=digest,
        source_sha256=manifest["inputs"]["assignments"]["sha256"],
        membership_sha256=manifest["membership_sha256"],
        manifest_json=manifest,
        admission_transaction=session.scalar(text("SELECT txid_current()::text")),
    )
    session.add(dataset)
    session.flush()
    session.execute(
        insert(AssignmentGame), [{"dataset_id": dataset.id, **game} for game in manifest["games"]]
    )
    for offset in range(0, len(candidate["members"]), 2000):
        session.execute(
            insert(AssignmentMember),
            [
                {"dataset_id": dataset.id, **member}
                for member in candidate["members"][offset : offset + 2000]
            ],
        )
    session.add(AssignmentObservation(dataset_id=dataset.id))
    session.flush()
    return dataset


def verify_assignments(session: Session, dataset: AssignmentDataset, store: Path) -> dict[str, Any]:
    """Rebuild from sealed byte streams, then compare every normalized stored member."""
    manifest = dataset.manifest_json
    paths = {}
    for family, artifact in manifest["inputs"].items():
        path = (store / artifact["locator"]).resolve()
        if not path.is_relative_to(store.resolve()) or hash_file(path) != (
            artifact["sha256"],
            artifact["bytes"],
        ):
            raise ValueError("assignment artifact checksum/locator mismatch")
        paths[family] = path
    rebuilt = prepare_assignments(
        paths["assignments"],
        paths,
        paths["methodology"],
        store,
        int(manifest["season"][:4]) + 1,
    )
    if rebuilt["content_sha256"] != dataset.content_sha256:
        raise ValueError("assignment source/baseline/transform reproduction differs")
    stored = session.execute(
        select(AssignmentMember)
        .where(AssignmentMember.dataset_id == dataset.id)
        .order_by(AssignmentMember.source_row)
    ).scalars()
    identities = []
    by_game: dict[str, list[list[Any]]] = defaultdict(list)
    total_seconds = Decimal(0)
    total_possessions = Decimal(0)
    raw = {
        n: row
        for n, row in enumerate(source_rows(paths["assignments"]), 1)
        if normalize_game_id(row["game_id"]).startswith("002")
    }
    for member in stored:
        row = raw.pop(member.source_row, None)
        if (
            row is None
            or row != member.payload_json
            or compute_payload_hash(row) != member.row_sha256
        ):
            raise ValueError("assignment source row/hash differs")
        for field in ("game_id", "off_person_id", "def_person_id", "off_team_id", "def_team_id"):
            expected = normalize_game_id(row[field]) if field == "game_id" else row[field]
            if getattr(member, field) != expected:
                raise ValueError("assignment normalized identity differs")
        if member.matchup_seconds != Decimal(
            row["matchup_minutes_sort"]
        ) or member.partial_possessions != Decimal(row["partial_possessions"]):
            raise ValueError("assignment normalized exposure differs")
        identity = [member.source_row, member.row_sha256]
        identities.append(identity)
        by_game[member.game_id].append(identity)
        total_seconds += member.matchup_seconds
        total_possessions += member.partial_possessions
    games = session.scalars(
        select(AssignmentGame)
        .where(AssignmentGame.dataset_id == dataset.id)
        .order_by(AssignmentGame.game_id)
    ).all()
    actual_games = [
        {
            "game_id": g.game_id,
            "game_date": g.game_date,
            "row_count": g.row_count,
            "membership_sha256": g.membership_sha256,
        }
        for g in games
    ]
    if (
        raw
        or compute_payload_hash(identities) != dataset.membership_sha256
        or dataset.membership_sha256 != manifest["membership_sha256"]
        or compute_payload_hash(manifest) != dataset.content_sha256
        or actual_games != manifest["games"]
    ):
        raise ValueError("assignment dataset membership/manifest differs")
    for game in games:
        if (
            game.row_count != len(by_game[game.game_id])
            or compute_payload_hash(by_game[game.game_id]) != game.membership_sha256
        ):
            raise ValueError("assignment game membership differs")
    return {
        "dataset_id": dataset.id,
        "content_sha256": dataset.content_sha256,
        "membership_sha256": dataset.membership_sha256,
        "games": len(games),
        "rows": len(identities),
        "matchup_seconds": str(total_seconds),
        "partial_possessions": str(total_possessions),
        "verified": True,
    }
