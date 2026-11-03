"""Per-player stint box from the accepted IM03 stints and their ordered source events.

Each selected-source event is replayed onto the sealed stint it belongs to, using IM02's
ordered event lineups. The replay is proven by reproducing every sealed stint's player
points exactly. A team's field is known for a game only when every one of its players'
stint totals equals the independent box score; otherwise it stays unknown for that game.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any

from courtlens.domain.impact_extras import assist_actor, identity
from courtlens.domain.possession_repair import RepairEvent, normalize_events
from courtlens.ingestion.native_reconstruction import content_hash, name_key

VERSION = "courtlens-stint-box-v1"
FIELDS = ("points", "fga", "fgm", "fg3a", "fg3m", "fta", "ftm", "oreb", "dreb", "ast", "tov")
BOX_FIELDS = {
    "points": "points",
    "fga": "field_goals_attempted",
    "fgm": "field_goals_made",
    "fg3a": "three_pointers_attempted",
    "fg3m": "three_pointers_made",
    "fta": "free_throws_attempted",
    "ftm": "free_throws_made",
    "oreb": "rebounds_offensive",
    "dreb": "rebounds_defensive",
    "ast": "assists",
    "tov": "turnovers",
}
REBOUND_COUNTS = re.compile(r"\(Off:(\d+) Def:(\d+)\)")


def _box_value(raw: str) -> int | None:
    try:
        value = float(raw)
    except ValueError:
        return None
    return int(value) if value >= 0 and value == int(value) else None


def _same_lineup(stint: dict[str, Any], home: list[str], away: list[str]) -> bool:
    return sorted(stint["home_lineup_json"]) == sorted(home) and sorted(
        stint["away_lineup_json"]
    ) == sorted(away)


def event_stints(
    events: list[RepairEvent],
    stints: list[dict[str, Any]],
    lineups: dict[str, list[dict[str, Any]]],
) -> list[int]:
    """The sealed stint of each ordered event: the first stint, from the previous event's,
    in the same period with the event's lineups and a clock range containing the event."""
    home, away = stints[0]["home_team_id"], stints[0]["away_team_id"]
    found: list[int] = []
    k = 0
    for i, e in enumerate(events):
        h, a = lineups[home][i]["lineup"], lineups[away][i]["lineup"]
        while k < len(stints) and not (
            stints[k]["period"] == e.period
            and stints[k]["start_seconds_remaining"]
            >= float(e.seconds)
            >= stints[k]["end_seconds_remaining"]
            and _same_lineup(stints[k], h, a)
        ):
            k += 1
        if k == len(stints):
            raise ValueError(f"event {i} has no sealed stint")
        found.append(k)
    return found


def _rebound_side(
    e: RepairEvent,
    row: dict[str, str],
    seen: dict[str, tuple[int, int]],
    missed_team: str | None,
) -> str | None:
    subtype = row.get("subType", "").lower()
    if subtype in ("offensive", "defensive"):
        return "oreb" if subtype == "offensive" else "dreb"
    match = REBOUND_COUNTS.search(row.get("description", ""))
    if match:
        off, deff = int(match[1]), int(match[2])
        before = seen.get(e.player_id, (0, 0))
        seen[e.player_id] = (off, deff)
        if (off, deff) == (before[0] + 1, before[1]):
            return "oreb"
        if (off, deff) == (before[0], before[1] + 1):
            return "dreb"
    if missed_team is not None:
        return "oreb" if e.team_id == missed_team else "dreb"
    return None


def stint_box(
    game: dict[str, Any],
    candidate: dict[str, Any],
    boxes: list[dict[str, str]],
    rows: list[dict[str, str]],
    cdn: list[dict[str, str]],
) -> dict[str, Any]:
    """Per-stint player counts, per team known fields and the replay/conservation proof."""
    roster = {r["person_id"]: r["team_id"] for r in boxes}
    teams = sorted(candidate["event_lineups"])
    source = candidate["arbitration"]["selected"]
    normalized = normalize_events(
        rows, source=source, source_sha256=candidate["input_sha256"][source], boxes=boxes
    )
    by_row = {e.row_index: e for e in normalized}
    raw = {int(r["_row_index"]): r for r in rows}
    events = []
    for a, b in zip(*(candidate["event_lineups"][t] for t in teams), strict=True):
        e = by_row[a["locator"]["row_index"]]
        if a["locator"] != b["locator"] or e.locator() != a["locator"]:
            raise ValueError("changed ordered source identity")
        events.append(e)
    if len(events) != len(rows):
        raise ValueError("incomplete ordered source membership")
    stints = game["stints"]
    at = event_stints(events, stints, candidate["event_lineups"])
    cdn_by_identity: dict[tuple[Any, ...], list[dict[str, str]]] = defaultdict(list)
    for r in cdn:
        cdn_by_identity[identity(r)].append(r)
    aliases: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for b in boxes:
        for field in ("name_i", "first_name", "family_name"):
            if b.get(field):
                aliases[b["team_id"]][name_key(b[field])].add(b["person_id"])
    for r in rows:
        if roster.get(r.get("personId", "")) == r.get("teamId"):
            for field in ("playerName", "playerNameI"):
                if r.get(field):
                    aliases[r["teamId"]][name_key(r[field])].add(r["personId"])

    counts: dict[int, dict[str, Counter[str]]] = defaultdict(lambda: defaultdict(Counter))
    unresolved: Counter[str] = Counter()
    unknown: dict[str, set[str]] = defaultdict(set)
    seen_rebounds: dict[str, tuple[int, int]] = {}
    missed_team: str | None = None
    period = 0
    for i, e in enumerate(events):
        if e.period != period:
            period, missed_team = e.period, None
        stint = counts[at[i]]
        if e.kind in ("shot", "free_throw"):
            for field in ("points", "fga", "fgm", "fg3a", "fg3m", "fta", "ftm"):
                if e.stats.get(field):
                    stint[e.player_id][field] += e.stats[field]
            if e.kind == "shot":
                assist_known, assist = assist_actor(
                    e,
                    raw[e.row_index],
                    aliases[e.team_id],
                    roster,
                    cdn_by_identity.get(identity(raw[e.row_index]), []),
                )
                if not assist_known:
                    unknown[e.team_id].add("ast")
                    unresolved["assist"] += 1
                elif assist is not None:
                    stint[assist]["ast"] += 1
            made = e.stats.get("fgm", e.stats.get("ftm", 0))
            missed_team = None if made else e.team_id
        elif e.kind == "rebound":
            if e.player_id != "0" and e.player_id in roster:
                side = _rebound_side(e, raw[e.row_index], seen_rebounds, missed_team)
                if side is None:
                    unknown[roster[e.player_id]].update(("oreb", "dreb"))
                    unresolved["rebound"] += 1
                else:
                    stint[e.player_id][side] += 1
            missed_team = None
        elif e.kind == "turnover":
            if e.player_id != "0" and e.player_id in roster:
                stint[e.player_id]["tov"] += 1
            missed_team = None
        elif e.kind == "jump_ball":
            missed_team = None

    # The replay is exact only if it reproduces every sealed stint's player points.
    for index, s in enumerate(stints):
        sealed = {p: v["points"] for p, v in s["player_stats_json"].items() if v.get("points")}
        replayed = {p: c["points"] for p, c in counts[index].items() if c["points"]}
        if sealed != replayed:
            raise ValueError(f"stint {index} points differ from the sealed stint")

    totals: dict[str, Counter[str]] = defaultdict(Counter)
    for stint_counts in counts.values():
        for p, c in stint_counts.items():
            totals[p].update(c)
    mismatches: list[dict[str, Any]] = []
    for b in boxes:
        p, team = b["person_id"], b["team_id"]
        for field, column in BOX_FIELDS.items():
            expected = _box_value(b.get(column, ""))
            if expected is None or totals[p][field] != expected:
                unknown[team].add(field)
                mismatches.append(
                    {"player": p, "field": field, "box": expected, "stints": totals[p][field]}
                )
    for p in totals:
        if p not in roster:
            raise ValueError(f"stint actor outside the box roster: {p}")
    known = {t: sorted(set(FIELDS) - unknown[t]) for t in teams}
    stint_rows = {
        str(index): {
            p: {k: v for k, v in sorted(c.items()) if v and k in known[roster[p]]}
            for p, c in sorted(by_player.items())
        }
        for index, by_player in sorted(counts.items())
    }
    return {
        "game_id": game["game_id"],
        "game_sha256": game["content_sha256"],
        "known_fields": known,
        "stints": {k: {p: v for p, v in rows_.items() if v} for k, rows_ in stint_rows.items()},
        "mismatches": mismatches,
        "unresolved": dict(unresolved),
        "source_facts_sha256": content_hash({"selected": rows, "cdn": cdn, "boxes": boxes}),
    }


def stint_player_stats(
    game: dict[str, Any], stint_index: int, lineup: list[str], team: str
) -> dict[str, dict[str, int]]:
    """Known fields for each on-floor player; a known field with no events is a known zero."""
    fields = game["known_fields"].get(team, [])
    recorded = game["stints"].get(str(stint_index), {})
    return {p: {f: recorded.get(p, {}).get(f, 0) for f in fields} for p in lineup}
