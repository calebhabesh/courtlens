"""Explicit v2 team-action projections; retained source rows and IM02 stay immutable."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from courtlens.domain.possession_repair import RepairEvent
from courtlens.ingestion.native_reconstruction import content_hash


def project_team_actions(
    *,
    events: list[RepairEvent],
    rows: list[dict[str, str]],
    other_rows: list[dict[str, str]],
    input_sha256: dict[str, str],
    teams: tuple[str, str],
) -> tuple[list[RepairEvent], dict[int, dict[str, str]], list[dict[str, Any]]]:
    projected = {int(r["_row_index"]): dict(r) for r in rows}
    result = []
    repairs = []
    for event in events:
        if (
            event.kind not in {"shot", "free_throw", "turnover", "rebound"}
            or event.team_id in teams
        ):
            result.append(event)
            continue
        row = projected[event.row_index]
        team = row.get("possession") if event.kind == "turnover" else None
        evidence = None
        if team not in teams:
            matches = [
                r
                for r in other_rows
                if r.get("actionNumber") == row.get("actionNumber")
                and r.get("period") == row.get("period")
                and r.get("clock") == row.get("clock")
                and r.get("actionType", "").lower().replace(" ", "") == event.kind
            ]
            identified = {
                r.get("teamId") or r.get("possession")
                for r in matches
                if (r.get("teamId") or r.get("possession")) in teams
            }
            if len(identified) == 1 and len(matches) == 1:
                team = identified.pop()
                evidence = {
                    "source": "cdn" if event.source == "v3" else "v3",
                    "sha256": input_sha256["cdn" if event.source == "v3" else "v3"],
                    "row": matches[0],
                }
        if team not in teams:
            result.append(event)
            continue
        repair = {
            "rule_id": "IM03-R1",
            "method_version": "courtlens-impact-possession-v2",
            "locator": event.locator(),
            "original_team_id": event.team_id,
            "team_id": team,
            "evidence": evidence
            or {"source": event.source, "sha256": event.source_sha256, "row": row},
            "reason": "explicit source possession/team identity for anonymous team action",
        }
        repair["repair_sha256"] = content_hash(repair)
        repairs.append(repair)
        projected[event.row_index] = {**row, "teamId": team}
        result.append(replace(event, team_id=team))
    return result, projected, repairs
