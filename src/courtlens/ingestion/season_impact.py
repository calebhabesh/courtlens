"""Current-season impact inputs: single-source IM02 candidates and IM03 provisional bundles.

The sealed seasons (2023-24 to 2025-26) were reconstructed once from Shufinskiy's archives under
accepted reports whose code hashes pin `impact_population.py`, `impact_repair_audit.py` and the
domain modules. This module reuses their functions without editing them (an edit would break
those seals) and rebuilds the same inputs for the in-progress season from hoopR's daily
documents (`services/season_refresh.py`):

- the `nbastatsv3` stream is hoopR's `playbyplayv3` flattened (`hoopr_boxscores.playbyplay_rows`);
- the CDN stream is unavailable (cdn.nba.com refuses non-browser clients), so arbitration runs on
  `nbastatsv3` alone (`cdn_rows=None`, as the native B19d baseline does); a game the single source
  cannot reconstruct is excluded with its errors, never guessed;
- scores come from hoopR's schedule and boxes from the season's retained box CSVs, bound to the
  retrieval receipt exactly as for sealed seasons.

Bundles carry `provisional: true`; `services/season_impact.py` seals them under a namespace the
append-only impact triggers do not cover, and retires superseded ones.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

from courtlens.domain.impact_event_repairs import project_team_actions
from courtlens.domain.impact_possessions import METHOD_VERSION_V2, build_impact_game
from courtlens.domain.impact_verification import GATE_VERSION, verify_event_game
from courtlens.domain.possession_repair import (
    POLICY_VERSION,
    Repair,
    normalize_events,
    order_same_clock,
    reconstruct_repaired_game,
)
from courtlens.ingestion.hoopr_boxscores import playbyplay_rows
from courtlens.ingestion.impact_repair_audit import retain_candidate, retained_boxes, summarize
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_normalization import canonical_hash

VERSION = "courtlens-season-impact-v1"
PHASES = {"002": "regular_season", "004": "playoffs"}
SOURCE_NOTE = (
    "hoopR playbyplayv3 (nbastatsv3 equivalent); CDN stream unavailable in season, so "
    "arbitration uses one source and games it cannot reconstruct are excluded"
)


def provisional_schedule(schedule: bytes, end_year: int) -> dict[str, dict[str, Any]]:
    """Final regular-season and playoff games from hoopR's schedule, in `schedule_membership`'s
    shape (the sealed seasons' independent schedule check), without its full-season denominator."""
    start = end_year - 1
    result: dict[str, dict[str, Any]] = {p: {"games": {}} for p in PHASES.values()}
    data = json.loads(schedule).get("leagueSchedule") or {}
    if data.get("seasonYear") != f"{start}-{end_year % 100:02d}":
        raise ValueError("schedule is for another season")
    for day in data.get("gameDates", []):
        for game in day.get("games", []):
            gid = str(game.get("gameId", ""))
            phase = PHASES.get(gid[:3])
            if phase is None or game.get("gameStatus") != 3:
                continue
            home, away = game["homeTeam"], game["awayTeam"]
            home_pts, away_pts = int(home["score"]), int(away["score"])
            game_date = date.fromisoformat(str(game["gameDateEst"])[:10])
            if home_pts == away_pts or not date(start, 7, 1) <= game_date < date(end_year, 7, 1):
                raise ValueError(f"{gid}: nonfinal outcome or date outside the season")
            result[phase]["games"][gid] = {
                "game_id": gid,
                "season": str(end_year),
                "season_type": "regular-season" if phase == "regular_season" else "playoffs",
                "game_date": game_date.isoformat(),
                "home_team_id": str(home["teamId"]),
                "away_team_id": str(away["teamId"]),
                "home_pts": str(home_pts),
                "away_pts": str(away_pts),
                "home_wl": "W" if home_pts > away_pts else "L",
                "away_wl": "L" if home_pts > away_pts else "W",
            }
    for data_phase in result.values():
        data_phase["membership_sha256"] = canonical_hash(data_phase["games"])
    return result


def source_digest(documents: dict[str, bytes]) -> str:
    """The season's play-by-play input identity: every retained document's SHA-256."""
    return content_hash(
        {gid: hashlib.sha256(body).hexdigest() for gid, body in sorted(documents.items())}
    )


def season_candidates(
    *,
    raw_root: Path,
    playbyplay: dict[str, bytes],
    end_year: int,
    candidate_root: Path,
) -> dict[str, Any]:
    """IM02 candidates for every final game with retained play-by-play, per phase."""
    started = time.monotonic()
    season = f"{end_year - 1}-{end_year % 100:02d}"
    schedule_path = raw_root / f"sportsdataverse_{end_year}" / f"schedule_{end_year}.json"
    schedule = provisional_schedule(schedule_path.read_bytes(), end_year)
    players, teams, box_receipts = retained_boxes(raw_root, end_year)
    hashes = {
        "schedule": hash_file(schedule_path)[0],
        "player_box": box_receipts["player_box"],
        "team_box": box_receipts["team_box"],
        "v3": source_digest(playbyplay),
    }
    report: dict[str, Any] = {
        "version": VERSION,
        "policy_version": POLICY_VERSION,
        "provisional": True,
        "season": season,
        "source_note": SOURCE_NOTE,
        "seasons": {},
    }
    for phase, data in schedule.items():
        games: dict[str, dict[str, Any]] = {}
        for gid, scheduled in sorted(data["games"].items()):
            if gid not in playbyplay:
                continue  # not yet published by hoopR: next week's run
            rows = [
                {**row, "_row_index": str(index)}
                for index, row in enumerate(playbyplay_rows(playbyplay[gid], gid))
            ]
            points = {
                scheduled["home_team_id"]: int(scheduled["home_pts"]),
                scheduled["away_team_id"]: int(scheduled["away_pts"]),
            }
            result = reconstruct_repaired_game(
                game_id=gid,
                v3_rows=rows,
                cdn_rows=None,
                boxes=players.get(gid, []),
                team_points=points,
                input_hashes=hashes,
            )
            team_rows = teams.get(gid, [])
            observed = {b["team_id"]: int(b["points"]) for b in team_rows}
            if len(team_rows) != 2 or observed != points:
                # Same rule as the sealed audit (IM02-R7): boxes and schedule must agree.
                reason = "independent team box/schedule totals disagree or missing"
                result["quality"] = "excluded"
                result["errors"] = sorted({*result["errors"], reason})
                result["repairs"].append(
                    Repair(
                        "IM02-R7",
                        gid,
                        None,
                        None,
                        None,
                        {"sha256": hashes["team_box"]},
                        observed,
                        points,
                        reason,
                    ).envelope(hashes)
                )
                result["rule_counts"]["IM02-R7"] += 1
                result["content_sha256"] = content_hash(
                    {k: v for k, v in result.items() if k != "content_sha256"}
                )
            digest = result["content_sha256"]
            target = candidate_root / digest[:2] / f"{digest}.json.gz"
            retain_candidate(target, result)
            games[gid] = {
                k: v
                for k, v in result.items()
                if k not in ("team_stints", "event_lineups", "repairs")
            }
            games[gid]["candidate_path"] = str(target)
            games[gid]["schedule"] = scheduled
        if games:
            report["seasons"][f"{season}:{phase}"] = {
                "schedule_membership_sha256": canonical_hash(
                    {gid: data["games"][gid] for gid in games}
                ),
                "box_receipts": box_receipts,
                "input_sha256": hashes,
                "summary": summarize(games),
                "games": games,
            }
    report["content_sha256"] = content_hash(report)
    report["elapsed_seconds"] = round(time.monotonic() - started, 3)
    return report


def prepare_bundles(
    *,
    report: dict[str, Any],
    raw_root: Path,
    playbyplay: dict[str, bytes],
    end_year: int,
    output_root: Path,
) -> list[Path]:
    """IM03 event-gate bundles for each phase, as `prepare_population` builds sealed ones.

    No public pbpstats possessions exist for the current season, so the public cross-check is
    recorded unavailable (as for every 2025-26 game in the sealed run).
    """
    players, boxes, box_receipts = retained_boxes(raw_root, end_year)
    paths = []
    for key, cohort in sorted(report["seasons"].items()):
        season, phase = key.split(":")
        members: dict[str, Any] = {}
        deltas: list[float] = []
        counts: Counter[str] = Counter()
        failed: dict[str, Any] = {}
        for gid, admission in sorted(cohort["games"].items()):
            if admission["quality"] == "excluded":
                continue
            candidate = _read(Path(admission["candidate_path"]))
            source = candidate["arbitration"]["selected"]
            rows = [
                {**row, "_row_index": str(index)}
                for index, row in enumerate(playbyplay_rows(playbyplay[gid], gid))
            ]
            events, _ = order_same_clock(
                normalize_events(
                    rows,
                    source=source,
                    source_sha256=cohort["input_sha256"][source],
                    boxes=players[gid],
                ),
                gid,
            )
            scheduled = admission["schedule"]
            raw_rows = {int(r["_row_index"]): r for r in rows}
            events, raw_rows, method_repairs = project_team_actions(
                events=events,
                rows=rows,
                other_rows=[],
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
                method_version=METHOD_VERSION_V2,
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
            check = verify_event_game(
                candidate=candidate,
                events=events,
                raw_rows=raw_rows,
                game=result,
                team_boxes=boxes[gid],
            )
            proof = {
                "result": check,
                "source": source,
                "source_sha256": cohort["input_sha256"][source],
                "rows": rows,
                "player_boxes": players[gid],
                "team_boxes": boxes[gid],
                "box_receipts": box_receipts,
                "other_rows": [],
                "method_repairs": method_repairs,
                "public_reviews": {},
            }
            proof["content_sha256"] = content_hash(proof)
            proof_path = (
                output_root
                / "event-verification"
                / proof["content_sha256"][:2]
                / f"{proof['content_sha256']}.json.gz"
            )
            retain_candidate(proof_path, proof)
            if not check["passed"]:
                # Sealed seasons were iterated until every game passed; a weekly run excludes
                # the game instead and lists it, so the gate holds over every admitted member.
                failed[gid] = {"errors": check["errors"][:20], "proof": str(proof_path)}
                continue
            members[gid] = {
                "content_sha256": result["content_sha256"],
                "path": str(target),
                "candidate_sha256": admission["content_sha256"],
                "candidate_path": admission["candidate_path"],
                "schedule": scheduled,
                "public_possession_crosscheck": {"status": "unavailable"},
                "event_verification": {
                    "path": str(proof_path),
                    "content_sha256": proof["content_sha256"],
                },
            }
            deltas.extend(v["delta"] for v in result["conservation"].values())
            counts["stints"] += len(result["stints"])
            counts["possessions"] += len(result["possessions"])
        if not members:
            continue
        bundle = {
            "version": VERSION,
            "provisional": True,
            "method_version": METHOD_VERSION_V2,
            "gate_version": GATE_VERSION,
            "accepted_im02_sha256": report["content_sha256"],
            "season": season,
            "phase": phase,
            "source_note": SOURCE_NOTE,
            "members": members,
            "membership_sha256": content_hash(
                {gid: v["content_sha256"] for gid, v in members.items()}
            ),
            "im02_summary": cohort["summary"],
            "public_possession_crosscheck": {
                "source_sha256": None,
                "comparisons": 0,
                "unavailable_games": sorted(members),
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
            "verification_gate": {
                "points_and_shooting_conserved": True,
                "accepted_player_seconds_preserved": True,
                "all_event_boundaries_and_factors_verified": True,
                "all_available_public_sequences_reviewed": True,
            },
            "failed_event_checks": failed,
        }
        bundle["content_sha256"] = content_hash(bundle)
        target = output_root / "bundles" / f"{bundle['content_sha256']}.json.gz"
        retain_candidate(target, bundle)
        paths.append(target)
    return paths


def _read(path: Path) -> dict[str, Any]:
    from courtlens.ingestion.impact_population import read_json

    return read_json(path)
