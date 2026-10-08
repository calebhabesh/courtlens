"""IM08 bounded browser observations. Diagnostic only; no warehouse or serving writes."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from courtlens.ingestion.impact_archive import schedule_membership, write_json
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_normalization import canonical_hash

VERSION = "courtlens-nba-browser-v1"
TERMS_URL = "https://www.nba.com/termsofuse"
MAX_BYTES = 8 * 1024 * 1024
MAX_ROWS = 5000
MIN_INTERVAL_SECONDS = 10
TIMEOUT_SECONDS = 30
POLICY_PATH = Path("docs/design/nba-direct-admission-v1.md")
PLAY_TYPES = (
    "Isolation",
    "Transition",
    "PRBallHandler",
    "PRRollman",
    "Postup",
    "Spotup",
    "Handoff",
    "Cut",
    "OffScreen",
    "OffRebound",
    "Misc",
)
ATTRIBUTION = "NBA.com / NBA Stats; private noncommercial source diagnostics only."
ADMISSION_REASON = "nba_terms_prior_consent_required"


def season_year(season: str) -> int:
    if not re.fullmatch(r"20\d{2}-\d{2}", season):
        raise ValueError("invalid canonical NBA season")
    year = int(season[:4])
    if season[-2:] != f"{(year + 1) % 100:02d}":
        raise ValueError("invalid canonical NBA season")
    return year


def targets(season: str, phase: str, game_id: str | None) -> list[dict[str, Any]]:
    """Fixed official endpoints; URLs cannot be supplied by a caller or model."""
    year = season_year(season)
    phase_name = {"regular_season": "Regular Season", "playoffs": "Playoffs"}.get(phase)
    if phase_name is None:
        raise ValueError("unsupported phase")
    prefix = "002" if phase == "regular_season" else "004"
    if game_id is not None and not re.fullmatch(prefix + f"{year % 100:02d}" + r"\d{5}", game_id):
        raise ValueError("game ID does not match season/phase")
    common = dict.fromkeys(
        (
            "College",
            "Conference",
            "Country",
            "DateFrom",
            "DateTo",
            "Division",
            "DraftPick",
            "DraftYear",
            "Height",
            "Location",
            "Month",
            "OpponentTeamID",
            "Outcome",
            "PORound",
            "PlayerExperience",
            "PlayerPosition",
            "SeasonSegment",
            "TeamID",
            "VsConference",
            "VsDivision",
            "Weight",
        ),
        "",
    )
    common.update(LeagueID="00", PerMode="Totals", Season=season, SeasonType=phase_name)
    result: list[dict[str, Any]] = [{"key": "terms", "url": TERMS_URL, "kind": "terms"}]

    def add(key: str, endpoint: str, parameters: dict[str, str], **metadata: Any) -> None:
        result.append(
            {
                "key": key,
                "url": f"https://stats.nba.com/stats/{endpoint}?{urlencode(parameters)}",
                "kind": "table",
                **metadata,
            }
        )

    add(
        "hustle",
        "leaguehustlestatsplayer",
        common,
        dataset="HustleStatsPlayer",
        identity="PLAYER_ID",
        counts=["G", "DEFLECTIONS", "CHARGES_DRAWN", "CONTESTED_SHOTS"],
    )
    for key, category in (("defense", "Overall"), ("rim_defense", "Less Than 6Ft")):
        add(
            key,
            "leaguedashptdefend",
            {
                **common,
                "DefenseCategory": category,
                "GameSegment": "",
                "LastNGames": "",
                "Period": "",
                "PlayerID": "",
                "StarterBench": "",
            },
            dataset="LeagueDashPTDefend",
            identity="CLOSE_DEF_PERSON_ID",
            counts=["GP", "D_FGM", "D_FGA"],
        )
    add(
        "passing",
        "leaguedashptstats",
        {
            **common,
            "PtMeasureType": "Passing",
            "LastNGames": "0",
            "PlayerID": "0",
        },
        dataset="LeagueDashPtStats",
        identity="PLAYER_ID",
        counts=["GP", "POTENTIAL_AST"],
    )
    for play_type in PLAY_TYPES:
        add(
            f"playtype_{play_type}",
            "synergyplaytypes",
            {
                "LeagueID": "00",
                "PerMode": "Totals",
                "PlayerOrTeam": "P",
                "SeasonType": phase_name,
                "SeasonYear": season,
                "TypeGrouping": "offensive",
                "PlayType": play_type,
            },
            dataset="SynergyPlayType",
            identity="PLAYER_ID",
            counts=["GP", "POSS", "PTS", "FGA", "FGM"],
            play_type=play_type,
        )
    result.append(
        {
            "key": "scoreboard",
            "kind": "scoreboard",
            "url": "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json",
        }
    )
    if game_id:
        result.append(
            {
                "key": "play_by_play",
                "kind": "play_by_play",
                "game_id": game_id,
                "url": f"https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{game_id}.json",
            }
        )
    return result


def positive_id(value: Any) -> str:
    if isinstance(value, bool) or not re.fullmatch(r"[1-9]\d{0,9}", str(value)):
        raise ValueError("invalid source identity")
    return str(value)


def count(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("missing or nonnumeric count")
    try:
        number = float(value)
    except OverflowError:
        raise ValueError("invalid nonnegative count") from None
    if not math.isfinite(number) or number < 0:
        raise ValueError("invalid nonnegative count")
    return number


def inspect_payload(raw: bytes, target: dict[str, Any], scope: dict[str, Any]) -> dict[str, Any]:
    """Validate only source shape/identity/sample. Do not manufacture coverage or metrics."""
    if not 0 < len(raw) <= MAX_BYTES:
        raise ValueError("body byte budget exceeded or empty")
    body = json.loads(
        raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError("nonfinite JSON"))
    )
    if not isinstance(body, dict):
        raise ValueError("expected JSON object")
    kind = target["kind"]
    if kind == "table":
        tables = body.get("resultSets")
        if not isinstance(tables, list) or not 1 <= len(tables) <= 10:
            raise ValueError("missing NBA resultSets")
        matching = [t for t in tables if isinstance(t, dict) and t.get("name") == target["dataset"]]
        if len(matching) != 1:
            raise ValueError("expected unique named NBA result set")
        table = matching[0]
        headers, rows = table.get("headers"), table.get("rowSet")
        if (
            not isinstance(headers, list)
            or not all(isinstance(h, str) for h in headers)
            or not 1 <= len(headers) <= 150
            or len(headers) != len(set(headers))
            or not {target["identity"], *target["counts"]}.issubset(headers)
            or not isinstance(rows, list)
            or len(rows) > MAX_ROWS
        ):
            raise ValueError("invalid table header or row budget")
        seen: set[tuple[str, str]] = set()
        observed: set[str] = set()
        null_counts = dict.fromkeys(target["counts"], 0)
        for row in rows:
            if not isinstance(row, list) or len(row) != len(headers):
                raise ValueError("malformed table row")
            item = dict(zip(headers, row, strict=True))
            pid = positive_id(item[target["identity"]])
            # Traded players may have legitimate separate team rows; never merge by name.
            team = item.get("TEAM_ID", item.get("PLAYER_LAST_TEAM_ID", 0))
            if isinstance(team, bool) or not re.fullmatch(r"\d{1,10}", str(team)):
                raise ValueError("invalid source team identity")
            grain = (pid, str(team))
            if grain in seen:
                raise ValueError("duplicate player/team grain")
            seen.add(grain)
            observed.add(pid)
            for field in target["counts"]:
                if item[field] is None:
                    null_counts[field] += 1
                else:
                    count(item[field])
            if (
                "D_FGM" in item
                and item["D_FGM"] is not None
                and item["D_FGA"] is not None
                and item["D_FGM"] > item["D_FGA"]
            ):
                raise ValueError("defensive makes exceed attempts")
            if target.get("play_type"):
                if (
                    item.get("PLAY_TYPE") != target["play_type"]
                    or item.get("TYPE_GROUPING") != "offensive"
                ):
                    raise ValueError("play type/group mismatch")
                if str(item.get("SEASON_ID")) not in (scope["season"], scope["season"][:4]):
                    raise ValueError("play type season mismatch")
                if (
                    item["FGM"] is not None
                    and item["FGA"] is not None
                    and item["FGM"] > item["FGA"]
                ):
                    raise ValueError("makes exceed attempts")
        expected = scope.get("player_ids")
        return {
            "rows": len(rows),
            "observed_players": sorted(observed),
            "null_counts": null_counts,
            "expected_players": len(expected) if expected is not None else None,
            "missing_players": sorted(set(expected) - observed) if expected is not None else None,
            "unexpected_players": sorted(observed - set(expected))
            if expected is not None
            else None,
            "coverage_basis": "player presence only; season totals do not expose game membership",
            "game_coverage": None,
            "empty": not rows,
        }
    if kind == "scoreboard":
        slate = body.get("scoreboard")
        if not isinstance(slate, dict) or not isinstance(slate.get("games"), list):
            raise ValueError("missing scoreboard games")
        if len(slate["games"]) > 30:
            raise ValueError("scoreboard game budget exceeded")
        datetime.strptime(slate["gameDate"], "%Y-%m-%d")
        games = []
        seen_games: set[str] = set()
        for game in slate["games"]:
            gid = game.get("gameId")
            if not isinstance(gid, str) or not re.fullmatch(r"\d{10}", gid) or gid in seen_games:
                raise ValueError("invalid or duplicate scoreboard game")
            seen_games.add(gid)
            status = game.get("gameStatus")
            if isinstance(status, bool) or status not in (1, 2, 3):
                raise ValueError("unknown scoreboard game status")
            games.append(
                {
                    "game_id": gid,
                    "status": status,
                    "requested_scope": gid.startswith(scope["game_prefix"]),
                }
            )
        return {
            "slate_date": slate["gameDate"],
            "games": games,
            "freshness": "single observation; no changing in-game or ingestion proof",
        }
    if kind != "play_by_play":
        raise ValueError("unsupported JSON kind")
    game = body.get("game")
    if not isinstance(game, dict) or game.get("gameId") != target["game_id"]:
        raise ValueError("play-by-play game mismatch")
    actions = game.get("actions")
    if not isinstance(actions, list) or not 1 <= len(actions) <= 5000:
        raise ValueError("empty or oversized actions")
    numbers: set[int] = set()
    for action in actions:
        number, period = action.get("actionNumber"), action.get("period")
        if (
            isinstance(number, bool)
            or not isinstance(number, int)
            or number < 0
            or number in numbers
            or isinstance(period, bool)
            or not isinstance(period, int)
            or not 1 <= period <= 20
            or not isinstance(action.get("actionType"), str)
            or not re.fullmatch(r"PT\d{2}M\d{2}(?:\.\d+)?S", str(action.get("clock")))
        ):
            raise ValueError("invalid or duplicate play-by-play action")
        numbers.add(number)
    expected_games = scope.get("game_ids")
    return {
        "game_id": game["gameId"],
        "actions": len(actions),
        "independently_scheduled": game["gameId"] in expected_games
        if expected_games is not None
        else None,
        "expected_games": len(expected_games) if expected_games is not None else None,
        "observed_games": 1,
        "freshness": "single game; not season completeness or live proof",
    }


def retain_bytes(
    root: Path, target: dict[str, Any], raw: bytes, observed_at: str
) -> dict[str, Any]:
    """Exact decoded HTTP bytes, shared IM01 address/UUID rules and exclusive installation."""
    if not 0 < len(raw) <= MAX_BYTES:
        raise ValueError("body byte budget exceeded or empty")
    digest = hashlib.sha256(raw).hexdigest()
    relative = Path("objects") / digest[:2] / digest
    destination = root / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
            try:
                os.link(temporary, destination)
            except FileExistsError:
                if hash_file(destination) != (digest, len(raw)):
                    raise ValueError("retained object is corrupt") from None
        finally:
            temporary.unlink()
    asset = {
        "name": target["key"],
        "url": target["url"],
        "sha256": digest,
        "bytes": len(raw),
        "object": relative.as_posix(),
        "observed_at": observed_at,
        "content_version_id": str(uuid5(NAMESPACE_URL, f"{target['url']}#sha256={digest}")),
        "observation_id": str(uuid4()),
        "attribution": ATTRIBUTION,
    }
    write_json(root / "asset-observations" / f"{asset['observation_id']}.json", asset)
    return asset


def reference_scope(
    season: str, phase: str, archive_root: Path, observation: Path, boxes_root: Path
) -> dict[str, Any]:
    """Independent finalized schedule and appeared box IDs; read-only and hash checked."""
    year = season_year(season)
    scope: dict[str, Any] = {
        "season": season,
        "phase": phase,
        "game_prefix": ("002" if phase == "regular_season" else "004") + f"{year % 100:02d}",
        "game_ids": None,
        "player_ids": None,
        "references": {},
    }
    if year not in (2023, 2024, 2025):
        scope["reference_unavailable"] = "no independently admitted schedule/box scope for season"
        return scope
    receipt = json.loads(observation.read_text())
    asset = next(a for a in receipt["assets"] if a["name"] == f"nba_schedule_{year + 1}.csv.gz")
    path = archive_root / "objects" / asset["sha256"][:2] / asset["sha256"]
    if hash_file(path) != (asset["sha256"], asset["bytes"]):
        raise ValueError("independent schedule hash mismatch")
    games = schedule_membership(path, year)[phase]["games"]
    manifest_path = boxes_root / f"sportsdataverse_{year + 1}" / "retrieval-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    box = manifest["files"]["player_boxscores"]
    box_path = manifest_path.parent / Path(box["path"]).name
    if hash_file(box_path) != (box["sha256"], box["bytes"]):
        raise ValueError("independent box hash mismatch")
    players: set[str] = set()
    with box_path.open(newline="", encoding="utf-8-sig") as stream:
        for index, row in enumerate(csv.DictReader(stream, strict=True)):
            if index >= 100_000 or None in row or any(v is None for v in row.values()):
                raise ValueError("invalid independent box rows")
            if row["game_id"] not in games:
                continue
            if row["season"] != str(year + 1):
                raise ValueError("independent box season mismatch")
            minutes = re.fullmatch(r"(\d+):([0-5]\d)", row["minutes"])
            if minutes and int(minutes[1]) * 60 + int(minutes[2]) > 0:
                players.add(positive_id(row["person_id"]))
    scope.update(
        game_ids=sorted(games),
        player_ids=sorted(players),
        references={
            "archive_observation_sha256": hash_file(observation)[0],
            "schedule_sha256": asset["sha256"],
            "box_sha256": box["sha256"],
            "box_receipt_sha256": hash_file(manifest_path)[0],
        },
    )
    return scope


def process_capture(
    root: Path,
    capture: dict[str, Any],
    scratch: Path,
    expected: list[dict[str, Any]],
    scope: dict[str, Any],
    policy: Path = POLICY_PATH,
) -> dict[str, Any]:
    """A failed/denied/HTML response is evidence of failure, never a data admission."""
    records = capture["responses"]
    if len(records) != len(expected) or [r["key"] for r in records] != [t["key"] for t in expected]:
        raise ValueError("incomplete or reordered browser capture")
    results = []
    for target, record in zip(expected, records, strict=True):
        if record["url"] != target["url"]:
            raise ValueError("browser requested URL mismatch")
        observed = datetime.fromisoformat(record["completed_at"])
        if observed.tzinfo is None or observed > datetime.now(UTC):
            raise ValueError("invalid browser observation time")
        item = {
            **target,
            "transport": {k: v for k, v in record.items() if k != "body_file"},
            "status": "source_blocked",
            "admission_reason": ADMISSION_REASON,
            "asset": None,
            "coverage": None,
        }
        error = record.get("error")
        if record.get("body_file"):
            if record["body_file"] != f"{target['key']}.body":
                raise ValueError("unexpected browser body path")
            raw = (scratch / record["body_file"]).read_bytes()
            item["asset"] = retain_bytes(root, target, raw, record["completed_at"])
        else:
            raw = b""
        if error:
            item["technical_status"] = error
        elif record.get("http_status") != 200:
            item["technical_status"] = f"http_{record.get('http_status')}"
        elif target["kind"] == "terms":
            # Receipt is not a grant of consent and cannot unlock data serving.
            text = raw.decode("utf-8", errors="replace").casefold()
            item["technical_status"] = (
                "terms_retained"
                if "terms of use" in text and "nba statistics" in text
                else "unrecognized_terms_payload"
            )
        else:
            try:
                item["coverage"] = inspect_payload(raw, target, scope)
                item["technical_status"] = (
                    "empty_sample" if item["coverage"].get("empty") else "validated_payload"
                )
            except (ValueError, KeyError, TypeError, AttributeError, RecursionError) as failure:
                item["technical_status"] = "invalid_payload"
                item["validation_error"] = str(failure)[:240]
        results.append(item)
    report = {
        "version": VERSION,
        "observation_id": str(uuid4()),
        "completed_at": datetime.now(UTC).isoformat(),
        "attribution": ATTRIBUTION,
        "scope": scope,
        "policy_sha256": hash_file(policy)[0],
        "browser": {k: v for k, v in capture.items() if k != "responses"},
        "admission_scope": "diagnostic_only_no_database_admission",
        "results": results,
    }
    report["content_sha256"] = canonical_hash(report)
    write_json(root / "observations" / f"{report['observation_id']}.json", report)
    return report


def verify_receipt(root: Path, path: Path, policy: Path = POLICY_PATH) -> dict[str, Any]:
    report: dict[str, Any] = json.loads(path.read_text())
    digest = report.pop("content_sha256")
    if report["version"] != VERSION or canonical_hash(report) != digest:
        raise ValueError("observation semantic hash mismatch")
    if report["policy_sha256"] != hash_file(policy)[0]:
        raise ValueError("observation admission policy changed")
    if report["admission_scope"] != "diagnostic_only_no_database_admission":
        raise ValueError("invalid admission scope")
    selected_game = next(
        (item["game_id"] for item in report["results"] if item["kind"] == "play_by_play"),
        None,
    )
    matrix = {
        t["key"]: t
        for t in targets(report["scope"]["season"], report["scope"]["phase"], selected_game)
    }
    for item in report["results"]:
        template = matrix.get(item["key"])
        if template is None or any(item.get(key) != value for key, value in template.items()):
            raise ValueError("endpoint template mismatch")
        if item["status"] != "source_blocked" or item["admission_reason"] != ADMISSION_REASON:
            raise ValueError("unadmitted direct source cannot become ready")
        asset = item["asset"]
        if asset:
            digest = asset["sha256"]
            if not re.fullmatch(r"[0-9a-f]{64}", digest):
                raise ValueError("invalid object digest")
            if asset["object"] != f"objects/{digest[:2]}/{digest}":
                raise ValueError("invalid object locator")
            if (
                not 0 < asset["bytes"] <= MAX_BYTES
                or asset["url"] != item["url"]
                or asset["name"] != item["key"]
                or asset["content_version_id"]
                != str(uuid5(NAMESPACE_URL, f"{item['url']}#sha256={digest}"))
                or str(UUID(asset["observation_id"])) != asset["observation_id"]
            ):
                raise ValueError("invalid asset identity")
            raw_path = root / asset["object"]
            if hash_file(raw_path) != (digest, asset["bytes"]):
                raise ValueError("retained object hash mismatch")
            observation = root / "asset-observations" / f"{asset['observation_id']}.json"
            if json.loads(observation.read_text()) != asset:
                raise ValueError("asset observation mismatch")
            if item["technical_status"] in ("validated_payload", "empty_sample") and (
                inspect_payload(raw_path.read_bytes(), item, report["scope"]) != item["coverage"]
            ):
                raise ValueError("coverage mismatch")
    report["content_sha256"] = json.loads(path.read_text())["content_sha256"]
    return report


def acquire(
    root: Path,
    scope: dict[str, Any],
    game_id: str | None,
    *,
    project: Path = Path("."),
    headed: bool = False,
) -> dict[str, Any]:
    import fcntl

    expected = targets(scope["season"], scope["phase"], game_id)
    if game_id and scope["game_ids"] is not None and game_id not in scope["game_ids"]:
        raise ValueError("requested game is absent from independent schedule")
    root.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(root).free < MAX_BYTES * (len(expected) + 2):
        raise ValueError("insufficient disk headroom")
    with (root / ".browser.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("another direct NBA browser observation is running") from None
        with tempfile.TemporaryDirectory(dir=root, prefix=".browser-") as temporary:
            scratch = Path(temporary)
            command = [
                "node",
                str((project / "scripts/fetch_nba_browser.cjs").resolve()),
                str(scratch.resolve()),
            ]
            job = {
                "targets": expected,
                "max_bytes": MAX_BYTES,
                "interval_ms": MIN_INTERVAL_SECONDS * 1000,
                "timeout_ms": TIMEOUT_SECONDS * 1000,
                "headed": headed,
            }
            subprocess.run(
                command,
                input=json.dumps(job),
                text=True,
                check=True,
                timeout=(len(expected) + 1) * (TIMEOUT_SECONDS + MIN_INTERVAL_SECONDS) + 60,
            )
            capture = json.loads((scratch / "capture.json").read_text())
            return process_capture(root, capture, scratch, expected, scope)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("data/raw/nba-direct"))
    parser.add_argument("--season", default="2025-26")
    parser.add_argument("--phase", choices=("regular_season", "playoffs"), default="regular_season")
    parser.add_argument(
        "--game-id", help="One explicit same-season/phase game; no automatic bulk PBP"
    )
    parser.add_argument("--archive-root", type=Path, default=Path("data/raw/impact-archive"))
    parser.add_argument(
        "--archive-observation",
        type=Path,
        default=Path(
            "data/raw/impact-archive/observations/068decb9-4599-4385-91dc-a541f1302ff3.json"
        ),
    )
    parser.add_argument("--boxes-root", type=Path, default=Path("data/raw"))
    parser.add_argument("--headed", action="store_true")
    parser.add_argument("--verify", type=Path)
    args = parser.parse_args()
    if args.verify:
        report = verify_receipt(args.root, args.verify)
    else:
        scope = reference_scope(
            args.season, args.phase, args.archive_root, args.archive_observation, args.boxes_root
        )
        report = acquire(args.root, scope, args.game_id, headed=args.headed)
    print(
        json.dumps(
            {
                "observation_id": report["observation_id"],
                "content_sha256": report["content_sha256"],
                "endpoints": [
                    {
                        "key": r["key"],
                        "status": r["status"],
                        "technical_status": r["technical_status"],
                    }
                    for r in report["results"]
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
