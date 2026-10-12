"""Strict source adapters for dated player context. No basketball metrics or inference."""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from courtlens.domain.teams import NBA_TEAMS, TRICODE_TO_TEAM

PARSER_VERSION = "courtlens-player-context-v1"
KINDS = ("player_index", "injuries", "transactions")
SOURCES = (
    "nba_player_index",
    "hoopr_player_index",
    "nba_injury_report",
    "espn_injuries",
    "nba_transactions",
)
STATUSES = {"Out", "Doubtful", "Questionable", "Probable", "Available"}


@dataclass(frozen=True)
class ParsedContext:
    rows: list[tuple[str, dict[str, Any]]]
    coverage: dict[str, Any]


def valid_season(season: str) -> str:
    if (
        not re.fullmatch(r"20\d{2}-\d{2}", season)
        or int(season[-2:]) != (int(season[:4]) + 1) % 100
    ):
        raise ValueError("invalid canonical season")
    return season


def positive_id(raw: Any) -> str:
    if isinstance(raw, bool) or not re.fullmatch(r"[1-9]\d*", str(raw)):
        raise ValueError("invalid source identity")
    return str(raw)


def parse_player_index(body: bytes, season: str) -> ParsedContext:
    data = json.loads(body)
    declared = data.get("parameters", {}).get("Season") or data.get("meta", {}).get("season")
    if declared != valid_season(season):
        raise ValueError("player index must explicitly declare the requested season")
    sets = data["resultSets"]
    if isinstance(sets, dict):
        sets = [sets]
    index = next(s for s in sets if s["name"] == "PlayerIndex")
    headers = index["headers"]
    required = {
        "PERSON_ID",
        "PLAYER_FIRST_NAME",
        "PLAYER_LAST_NAME",
        "TEAM_ID",
        "TEAM_ABBREVIATION",
        "POSITION",
        "HEIGHT",
        "WEIGHT",
        "ROSTER_STATUS",
    }
    if len(headers) != len(set(headers)) or not required.issubset(headers):
        raise ValueError("missing/duplicate player index columns")
    rows: list[tuple[str, dict[str, Any]]] = []
    rejected: list[dict[str, Any]] = []
    seen: set[str] = set()
    for number, raw in enumerate(index["rowSet"]):
        locator = f"PlayerIndex/{number}"
        # Ambiguous grain is a whole-candidate rejection, never file-order precedence.
        row = dict(zip(headers, raw, strict=True))
        pid = positive_id(row["PERSON_ID"])
        if pid in seen:
            raise ValueError("duplicate player index identity")
        seen.add(pid)
        try:
            name = " ".join(
                str(row[k] or "").strip() for k in ("PLAYER_FIRST_NAME", "PLAYER_LAST_NAME")
            ).strip()
            if not name:
                raise ValueError("missing player name")
            status = row["ROSTER_STATUS"]
            if isinstance(status, bool) or status not in (None, 0, 1):
                raise ValueError("unrecognized roster status")
            active = status == 1
            team = NBA_TEAMS.get(str(row["TEAM_ID"]))
            if active and (team is None or team.tricode != row["TEAM_ABBREVIATION"]):
                raise ValueError("active roster team ID/abbreviation mismatch")
            position = row["POSITION"] or None
            if position is not None and position not in {"G", "F", "C", "G-F", "F-G", "F-C", "C-F"}:
                raise ValueError("unrecognized listed position")
            height = str(row["HEIGHT"] or "").strip()
            inches = None
            if height:
                match = re.fullmatch(r"([4-8])-(\d{1,2})", height)
                if match is None or int(match[2]) > 11:
                    raise ValueError("invalid listed height")
                inches = int(match[1]) * 12 + int(match[2])
            weight = str(row["WEIGHT"] or "").strip()
            if weight and (not weight.isdigit() or not 100 <= int(weight) <= 500):
                raise ValueError("invalid listed weight")
            rows.append(
                (
                    locator,
                    {
                        "entity_key": pid,
                        "player_id": pid,
                        "namespace": "nba",
                        "name": name,
                        "season": season,
                        "listed_position": position,
                        "height_original": height or None,
                        "height_inches": inches,
                        "weight_pounds": int(weight) if weight else None,
                        "roster_status": "active"
                        if active
                        else ("inactive" if status == 0 else "unknown"),
                        "team_id": team.team_id if active and team else None,
                        "team_tricode": team.tricode if active and team else None,
                        "source_team_id": str(row["TEAM_ID"]),
                        "source_team_abbreviation": row["TEAM_ABBREVIATION"],
                        "jersey_number": row.get("JERSEY_NUMBER"),
                        "measurement_type": "listed_roster",
                        "effective_date": None,
                    },
                )
            )
        except ValueError as error:
            rejected.append({"locator": locator, "player_id": pid, "reason": str(error)})
    if not rows:
        raise ValueError("empty admitted player index")
    active_rows = [r for _, r in rows if r["roster_status"] == "active"]
    return ParsedContext(
        rows,
        {
            "source_rows": len(index["rowSet"]),
            "admitted_rows": len(rows),
            "rejected": rejected,
            "active_players": len(active_rows),
            "teams": sorted({r["team_tricode"] for r in active_rows}),
            "unknown_positions": sum(r["listed_position"] is None for _, r in rows),
            "limitations": [
                "Current association observed at acquisition, not backdated to season start.",
                "Listed measurements are not combine measurements; career rates excluded.",
            ],
        },
    )


def pdf_text(body: bytes) -> str:
    if not body.startswith(b"%PDF-"):
        raise ValueError("not a PDF")
    with tempfile.TemporaryDirectory(prefix="courtlens-injury-") as directory:
        path = Path(directory) / "report.pdf"
        path.write_bytes(body)
        result = subprocess.run(
            ["pdftotext", "-layout", str(path), "-"], check=True, capture_output=True, timeout=30
        )
        if len(result.stdout) > 8_000_000:
            raise ValueError("injury text exceeds bound")
        return result.stdout.decode("utf-8")


def parse_injury_text(content: str, season: str) -> ParsedContext:
    """Use the report's column boundaries; reject unexplained rows and drift."""
    valid_season(season)
    stamps = re.findall(r"Injury Report:\s*(\d{2}/\d{2}/\d{2,4})\s+(\d{2}:\d{2}\s*[AP]M)", content)
    if not stamps or len(set(stamps)) != 1:
        raise ValueError("missing/conflicting injury report timestamp")
    stamp, clock = stamps[0]
    fmt = "%m/%d/%Y" if len(stamp) == 10 else "%m/%d/%y"
    report_at = datetime.strptime(stamp + " " + clock.replace(" ", ""), fmt + " %I:%M%p").replace(
        tzinfo=ZoneInfo("America/New_York")
    )
    columns = [
        "Game Date",
        "Game Time",
        "Matchup",
        "Team",
        "Player Name",
        "Current Status",
        "Reason",
    ]
    offsets: list[int] | None = None
    context: dict[str, str] = {}
    rows: list[tuple[str, dict[str, Any]]] = []
    for line_number, line in enumerate(content.splitlines(), 1):
        if (
            not line.strip()
            or "Injury Report:" in line
            or re.fullmatch(r"\s*Page \d+ of \d+\s*", line)
        ):
            continue
        if all(c in line for c in columns):
            offsets = [line.index(c) for c in columns]
            if offsets != sorted(offsets):
                raise ValueError("injury report columns reordered")
            continue
        if offsets is None:
            raise ValueError("injury report row before header")
        parts = [
            line[start:end].strip()
            for start, end in zip(offsets, [*offsets[1:], len(line)], strict=True)
        ]
        for key, value in zip(
            ("game_date", "game_time", "matchup", "team"), parts[:4], strict=True
        ):
            if value:
                # A new game/matchup must not inherit a stale team from the previous game.
                if key in ("game_date", "matchup") and value != context.get(key):
                    context.pop("team", None)
                context[key] = value
        name, status, reason = parts[4:]
        if "NOT YET SUBMITTED" in line:
            name, status, reason = "", "unknown", "NOT YET SUBMITTED"
        elif not name and not status:
            if reason and rows and not any(parts[:4]):
                rows[-1][1]["reason"] = (rows[-1][1]["reason"] or "") + " " + reason
                continue
            raise ValueError(f"unparsed injury line {line_number}")
        if set(context) != {"game_date", "game_time", "matchup", "team"}:
            raise ValueError("injury row lacks game/team context")
        game_date = datetime.strptime(context["game_date"], "%m/%d/%Y").date()
        if not int(season[:4]) <= game_date.year <= int(season[:4]) + 1:
            raise ValueError("injury game date outside declared season")
        matchup = context["matchup"].split("@")
        teams = [t for t in TRICODE_TO_TEAM.values() if t.name == context["team"]]
        if len(teams) != 1 or len(matchup) != 2 or teams[0].tricode not in matchup:
            raise ValueError("injury team/matchup mismatch")
        if status not in STATUSES | {"unknown"}:
            raise ValueError("unrecognized injury status")
        team = teams[0]
        key = f"{game_date}:{team.tricode}:{name or '__not_submitted__'}"
        rows.append(
            (
                f"line/{line_number}",
                {
                    "entity_key": key,
                    "namespace": "nba_injury_report",
                    "player_id": None,
                    "source_player_id": f"{team.tricode}:{name}" if name else None,
                    "name": name or None,
                    "team_id": team.team_id,
                    "team_tricode": team.tricode,
                    "game_date": game_date.isoformat(),
                    "game_time_original": context["game_time"],
                    "matchup": context["matchup"],
                    "status": status,
                    "reason": reason or None,
                    "report_at": report_at.isoformat(),
                    "season": season,
                    "identity_reason": "report_has_no_player_id"
                    if name
                    else "team_report_not_submitted",
                },
            )
        )
    keys = [r["entity_key"] for _, r in rows]
    if not rows or len(keys) != len(set(keys)):
        raise ValueError("empty/duplicate injury report grain")
    return ParsedContext(
        rows,
        {
            "admitted_rows": len(rows),
            "rejected": [],
            "report_at": report_at.isoformat(),
            "limitations": [
                "Dated report only; absent players remain unknown.",
                "Names require an explicit verified crosswalk.",
            ],
        },
    )


def parse_espn_injuries(body: bytes, season: str) -> ParsedContext:
    valid_season(season)
    data = json.loads(body)
    rows = []
    for team_number, team in enumerate(data["injuries"]):
        for number, item in enumerate(team["injuries"]):
            athlete = item["athlete"]
            pid = positive_id(athlete["id"])
            stamp = item.get("date")
            if not stamp or datetime.fromisoformat(stamp.replace("Z", "+00:00")).tzinfo is None:
                raise ValueError("ESPN injury lacks an aware source timestamp")
            rows.append(
                (
                    f"injuries/{team_number}/{number}",
                    {
                        "entity_key": f"{pid}:{item.get('id', stamp)}",
                        "namespace": "espn",
                        "source_player_id": pid,
                        "player_id": None,
                        "name": athlete["displayName"],
                        "source_team_id": str(team["id"]),
                        "season": season,
                        "status": item["status"],
                        "reason": item.get("longComment") or item.get("shortComment"),
                        "report_at": stamp,
                        "identity_reason": "verified_crosswalk_required",
                    },
                )
            )
    if len({r["entity_key"] for _, r in rows}) != len(rows):
        raise ValueError("duplicate ESPN injury grain")
    return ParsedContext(
        rows,
        {
            "admitted_rows": len(rows),
            "rejected": [],
            "limitations": [
                "ESPN secondary observation, not an official report.",
                "No entry is unknown, never healthy.",
            ],
        },
    )


def parse_transactions(body: bytes, season: str) -> ParsedContext:
    """Versioned operator import of explicit official transactions, never roster diffs."""
    data = json.loads(body)
    if data["season"] != valid_season(season) or data["schema"] != "nba-transactions-v1":
        raise ValueError("transaction schema/season mismatch")
    rows = []
    for number, row in enumerate(data["transactions"]):
        pid = positive_id(row["player_id"])
        for key in ("effective_date", "announced_date"):
            if row.get(key) is not None:
                event_date = datetime.strptime(row[key], "%Y-%m-%d").date()
                if not int(season[:4]) <= event_date.year <= int(season[:4]) + 1:
                    raise ValueError("transaction outside declared season")
        if row.get("effective_date") is None and not row.get("effective_date_unknown_reason"):
            raise ValueError("undated transaction needs an explicit unknown reason")
        for key in ("from_team_id", "to_team_id"):
            if row.get(key) is not None and str(row[key]) not in NBA_TEAMS:
                raise ValueError("invalid transaction team identity")
        if not str(row["source_url"]).startswith("https://www.nba.com/") or not row["type"]:
            raise ValueError("transaction lacks official evidence/type")
        rows.append(
            (
                f"transactions/{number}",
                {
                    "player_id": pid,
                    "namespace": "nba",
                    "entity_key": str(row["transaction_id"]),
                    "transaction_id": str(row["transaction_id"]),
                    "type": row["type"],
                    "effective_date": row.get("effective_date"),
                    "announced_date": row.get("announced_date"),
                    "effective_date_unknown_reason": row.get("effective_date_unknown_reason"),
                    "from_team_id": str(row["from_team_id"]) if row.get("from_team_id") else None,
                    "to_team_id": str(row["to_team_id"]) if row.get("to_team_id") else None,
                    "source_url": row["source_url"],
                    "season": season,
                },
            )
        )
    if not rows or len({r["entity_key"] for _, r in rows}) != len(rows):
        raise ValueError("empty/duplicate transaction grain")
    return ParsedContext(
        rows,
        {
            "admitted_rows": len(rows),
            "rejected": [],
            "limitations": [
                "Explicit official transaction import; not inferred from roster changes."
            ],
        },
    )
