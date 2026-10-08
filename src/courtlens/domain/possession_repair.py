"""Deterministic v2 lineup repairs; offline candidates, never v1 admission or ML inputs."""

from __future__ import annotations

import itertools
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field, replace
from decimal import Decimal, InvalidOperation
from typing import Any

from courtlens.ingestion.native_reconstruction import clock_seconds, content_hash, name_key

POLICY_VERSION = "possession-policy-v2"
RULE_IDS = tuple(f"IM02-R{i}" for i in range(1, 8))
SCORING_FIELDS = {
    "points": "points",
    "fga": "field_goals_attempted",
    "fgm": "field_goals_made",
    "fg3a": "three_pointers_attempted",
    "fg3m": "three_pointers_made",
    "fta": "free_throws_attempted",
    "ftm": "free_throws_made",
}


@dataclass(frozen=True)
class RepairEvent:
    source: str
    source_sha256: str
    row_index: int
    action_id: str
    action_number: int
    period: int
    seconds: Decimal
    kind: str
    team_id: str
    player_id: str
    participants: tuple[str, ...] = ()
    outgoing: tuple[str, ...] = ()
    incoming: tuple[str, ...] = ()
    stats: dict[str, int] = field(default_factory=dict)
    technical: bool = False

    def locator(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "sha256": self.source_sha256,
            "row_index": self.row_index,
            "action_id": self.action_id,
            "action_number": self.action_number,
        }

    def semantic(self) -> dict[str, Any]:
        return {
            "period": self.period,
            "seconds": str(self.seconds.normalize()),
            "kind": self.kind,
            "team": self.team_id,
            "player": self.player_id,
            "stats": self.stats,
        }


@dataclass(frozen=True)
class Repair:
    rule_id: str
    game_id: str
    period: int | None
    team_id: str | None
    player_id: str | None
    locator: dict[str, Any]
    original: Any
    replacement: Any
    reason: str

    def envelope(self, input_hashes: dict[str, str]) -> dict[str, Any]:
        value = {"policy_version": POLICY_VERSION, "input_sha256": input_hashes, **asdict(self)}
        return {**value, "repair_sha256": content_hash(value)}


def parse_box_seconds(raw: str) -> tuple[Decimal | None, bool]:
    """Carry the observed :60 anomaly; other malformed/absent values remain unknown."""
    match = re.fullmatch(r"(\d+):(\d{2}(?:\.\d+)?)", raw.strip())
    if match is None:
        return None, False
    try:
        minutes, seconds = Decimal(match[1]), Decimal(match[2])
    except InvalidOperation:
        return None, False
    if seconds > 60:
        return None, False
    return minutes * 60 + seconds, seconds == 60


def _kind(row: dict[str, str]) -> str:
    raw = row.get("actionType", "").lower().replace(" ", "")
    if not raw:
        description = row.get("description", "")
        if re.search(r"\bBLOCK \(\d+ BLK\)", description):
            raw = "block"
        elif re.search(r"\bSTEAL \(\d+ STL\)", description):
            raw = "steal"
    return {
        "madeshot": "shot",
        "missedshot": "shot",
        "2pt": "shot",
        "3pt": "shot",
        "freethrow": "free_throw",
        "jumpball": "jump_ball",
    }.get(raw, raw)


def normalize_events(
    rows: list[dict[str, str]],
    *,
    source: str,
    source_sha256: str,
    boxes: list[dict[str, str]],
) -> list[RepairEvent]:
    """Resolve only explicit same-team identities; retain CSV row identity on every event."""
    roster = {b["person_id"]: b["team_id"] for b in boxes}
    names: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for b in boxes:
        for key in ("first_name", "family_name", "name_i"):
            if b.get(key):
                names[b["team_id"]][name_key(b[key])].add(b["person_id"])
    for row in rows:
        pid, team = row.get("personId", ""), row.get("teamId", "")
        if roster.get(pid) == team:
            for key in ("playerName", "playerNameI"):
                if row.get(key):
                    names[team][name_key(row[key])].add(pid)

    def resolve(team: str, text: str) -> str:
        ids = names[team].get(name_key(text), set())
        if len(ids) != 1:
            raise ValueError(f"ambiguous substitution identity: {team}/{text}")
        return next(iter(ids))

    events = []
    for index, row in enumerate(rows):
        kind = _kind(row)
        team, pid = row.get("teamId", "") or "0", row.get("personId", "") or "0"
        # Native v3 encodes team rebounds/turnovers as personId=teamId, teamId=0.
        # This is an explicit team action, not a missing player box row.
        if pid in set(roster.values()) and team in ("0", pid):
            team, pid = pid, "0"
        period, seconds = int(row["period"]), clock_seconds(row["clock"])
        desc, subtype = row.get("description", ""), row.get("subType", "").lower()
        technical = "technical" in (desc + " " + subtype).lower()
        stats: dict[str, int] = {}
        if kind == "shot":
            # The 2023 v3 schema has no shotValue column. Its explicit 3PT marker
            # supplies the value; pointsTotal is cumulative player points, not this shot.
            fallback = 3 if row["actionType"] == "3pt" or "3PT" in desc else 2
            value = int(row.get("shotValue") or fallback)
            outcome = row.get("shotResult", "")
            if value not in (2, 3) or outcome not in ("Made", "Missed"):
                raise ValueError(f"unknown shot outcome at row {index}")
            made = int(outcome == "Made")
            stats = {
                "fga": 1,
                "fgm": made,
                "fg3a": int(value == 3),
                "fg3m": int(value == 3) * made,
                "points": value * made,
            }
        elif kind == "free_throw":
            if desc.startswith("MISS ") or row.get("shotResult") == "Missed":
                made = 0
            elif re.search(r"\(\d+ PTS\)", desc) or row.get("shotResult") == "Made":
                made = 1
            else:
                raise ValueError(f"unknown free throw outcome at row {index}")
            stats = {"fta": 1, "ftm": made, "points": made}
        outgoing: tuple[str, ...] = ()
        incoming: tuple[str, ...] = ()
        if kind == "substitution":
            if source == "v3":
                match = re.fullmatch(r"SUB: (.+) FOR (.+)", desc)
                if match is None or roster.get(pid) != team or resolve(team, match[2]) != pid:
                    raise ValueError(f"unresolved outgoing substitution at row {index}")
                outgoing, incoming = (pid,), (resolve(team, match[1]),)
            elif subtype in ("out", "in") and roster.get(pid) == team:
                outgoing = (pid,) if subtype == "out" else ()
                incoming = (pid,) if subtype == "in" else ()
            else:
                raise ValueError(f"unresolved CDN substitution at row {index}")
        participants: set[str] = set()
        on_court = kind in (
            "shot",
            "free_throw",
            "rebound",
            "turnover",
            "jump_ball",
            "foul",
            "assist",
            "steal",
            "block",
        )
        if on_court and not technical and pid != "0" and pid not in roster:
            raise ValueError(f"on-court player absent from independent box roster at row {index}")
        if on_court and not technical and pid in roster:
            participants.add(pid)
        if source == "cdn" and on_court and not technical:
            for key in (
                "assistPersonId",
                "stealPersonId",
                "blockPersonId",
                "foulDrawnPersonId",
                "jumpBallWonPersonId",
                "jumpBallLostPersonId",
                "jumpBallRecoverdPersonId",
            ):
                if row.get(key) in roster:
                    participants.add(row[key])
        events.append(
            RepairEvent(
                source,
                source_sha256,
                int(row.get("_row_index", index)),
                row.get("actionId", row.get("orderNumber", str(index))),
                int(row["actionNumber"]),
                period,
                seconds,
                kind,
                team,
                pid,
                tuple(sorted(participants)),
                outgoing,
                incoming,
                stats,
                technical,
            )
        )
    if source == "cdn":
        # A free throw between two substitution runs is a real lineup boundary,
        # even when every event has the same clock. Never collapse across it.
        for run_key, grouped in itertools.groupby(
            enumerate(events),
            key=lambda pair: (pair[1].kind == "substitution", pair[1].period, pair[1].seconds),
        ):
            if not run_key[0]:
                continue
            batch: dict[str, list[tuple[int, RepairEvent]]] = defaultdict(list)
            for index, event in grouped:
                batch[event.team_id].append((index, event))
            for rows_in_team in batch.values():
                outgoing = tuple(p for _, e in rows_in_team for p in e.outgoing)
                incoming = tuple(p for _, e in rows_in_team for p in e.incoming)
                if len(outgoing) != len(incoming) or not outgoing:
                    raise ValueError(
                        f"unpaired CDN substitution at row {rows_in_team[0][1].row_index}"
                    )
                for at, (index, event) in enumerate(rows_in_team):
                    events[index] = replace(
                        event,
                        outgoing=outgoing if at == 0 else (),
                        incoming=incoming if at == 0 else (),
                    )
    return events


def order_same_clock(
    events: list[RepairEvent], game_id: str
) -> tuple[list[RepairEvent], list[Repair]]:
    """Only move a substitution when its incoming player is the same-clock FT shooter."""
    ordered: list[RepairEvent] = []
    repairs: list[Repair] = []
    for _, group in itertools.groupby(events, key=lambda e: (e.period, e.seconds)):
        block = list(group)
        original = [e.locator() for e in block]
        # A shooter already substituted in earlier in this group needs no movement.
        for event in list(block):
            if event.kind != "free_throw" or event.technical:
                continue
            at = block.index(event)
            if any(event.player_id in e.incoming for e in block[:at]):
                continue
            later = next((e for e in block[at + 1 :] if event.player_id in e.incoming), None)
            if later is not None:
                # The shooter can finish the attempts, leave during a timeout, then
                # re-enter after a violation without any clock movement. That later
                # entrance is not evidence that the shooter was absent for the FT.
                if any(event.player_id in e.outgoing for e in block[at + 1 : block.index(later)]):
                    continue
                block.remove(later)
                block.insert(at, later)
        if original != [e.locator() for e in block]:
            repairs.append(
                Repair(
                    "IM02-R3",
                    game_id,
                    block[0].period,
                    None,
                    None,
                    block[0].locator(),
                    original,
                    [e.locator() for e in block],
                    "incoming free-throw shooter precedes attempt",
                )
            )
        ordered.extend(block)
    return ordered, repairs


def scoring_errors(
    events: list[RepairEvent], boxes: list[dict[str, str]], team_points: dict[str, int]
) -> list[str]:
    totals: dict[str, Counter[str]] = defaultdict(Counter)
    for event in events:
        if event.stats:
            totals[event.player_id].update(event.stats)
    errors = []
    roster = {b["person_id"]: b["team_id"] for b in boxes}
    for event in events:
        if event.stats and roster.get(event.player_id) != event.team_id:
            errors.append(f"scoring identity mismatch at {event.source}/{event.row_index}")
    for box in boxes:
        for stat, key in SCORING_FIELDS.items():
            raw = box.get(key, "")
            if not raw or Decimal(raw) != totals[box["person_id"]][stat]:
                errors.append(
                    f"player {box['person_id']} {stat}: {raw!r} != {totals[box['person_id']][stat]}"
                )
    for team, expected in team_points.items():
        total = sum(c["points"] for p, c in totals.items() if roster.get(p) == team)
        if total != expected:
            errors.append(f"team {team} points: {total} != {expected}")
    return errors


def arbitrate_sources(
    *,
    game_id: str,
    v3: list[RepairEvent],
    cdn: list[RepairEvent] | None,
    boxes: list[dict[str, str]],
    team_points: dict[str, int],
    source_errors: dict[str, str] | None = None,
    preferred_source: str = "v3",
) -> tuple[list[RepairEvent], list[Repair], dict[str, Any], list[str]]:
    failures = source_errors or {}
    v3_errors = [failures["v3"]] if "v3" in failures else scoring_errors(v3, boxes, team_points)
    cdn_errors = (
        ([failures["cdn"]] if "cdn" in failures else scoring_errors(cdn, boxes, team_points))
        if cdn is not None
        else ["unavailable"]
    )
    selected = "v3" if not v3_errors else "cdn" if not cdn_errors else "none"
    if preferred_source == "cdn" and not cdn_errors:
        selected = "cdn"
    check: dict[str, Any] = {
        "selected": selected,
        "cdn_status": "unavailable" if cdn is None else "compared",
        "scoring_errors": {"v3": v3_errors, "cdn": cdn_errors},
        "agreed_events": 0,
        "conflicting_events": 0,
        "unmatched_events": 0,
        "agreed_substitution_blocks": 0,
        "conflicting_substitution_blocks": 0,
        "administrative_rows": {
            source: sum(e.kind in ("period", "timeout", "instantreplay") for e in rows)
            for source, rows in (("v3", v3), ("cdn", cdn or []))
        },
    }
    repairs: list[Repair] = []
    if cdn is not None:

        def indexed(events: list[RepairEvent]) -> dict[tuple[int, int], RepairEvent]:
            counts: Counter[int] = Counter()
            result = {}
            for e in events:
                # CDN splits substitutions into in/out; compare these independently as blocks.
                if e.kind in ("substitution", "period", "timeout", "instantreplay"):
                    continue
                counts[e.action_number] += 1
                result[(e.action_number, counts[e.action_number])] = e
            return result

        left, right = indexed(v3), indexed(cdn)
        for key in sorted(left.keys() | right.keys()):
            a, b = left.get(key), right.get(key)
            if a and b and a.semantic() == b.semantic():
                check["agreed_events"] += 1
                continue
            check["conflicting_events" if a and b else "unmatched_events"] += 1
            repairs.append(
                Repair(
                    "IM02-R6",
                    game_id,
                    a.period if a else b.period if b else None,
                    None,
                    None,
                    {"v3": a.locator() if a else None, "cdn": b.locator() if b else None},
                    {"v3": a.semantic() if a else None, "cdn": b.semantic() if b else None},
                    {"selected_source": selected},
                    "box-conserving source arbitration",
                )
            )

        def substitution_blocks(
            rows: list[RepairEvent],
        ) -> dict[tuple[int, Decimal, str], list[RepairEvent]]:
            blocks: dict[tuple[int, Decimal, str], list[RepairEvent]] = defaultdict(list)
            for e in rows:
                if e.kind == "substitution":
                    blocks[(e.period, e.seconds, e.team_id)].append(e)
            return blocks

        v3_blocks, cdn_blocks = substitution_blocks(v3), substitution_blocks(cdn)
        for block_key in sorted(v3_blocks.keys() | cdn_blocks.keys()):
            av, bv = v3_blocks.get(block_key, []), cdn_blocks.get(block_key, [])

            def transfers(rows: list[RepairEvent]) -> dict[str, list[str]]:
                return {
                    "outgoing": sorted(p for e in rows for p in e.outgoing),
                    "incoming": sorted(p for e in rows for p in e.incoming),
                }

            if av and bv and transfers(av) == transfers(bv):
                check["agreed_substitution_blocks"] += 1
            else:
                check["conflicting_substitution_blocks"] += 1
                repairs.append(
                    Repair(
                        "IM02-R6",
                        game_id,
                        block_key[0],
                        block_key[2],
                        None,
                        {"v3": [e.locator() for e in av], "cdn": [e.locator() for e in bv]},
                        {"v3": transfers(av), "cdn": transfers(bv)},
                        {"selected_source": selected},
                        "box-conserving substitution-block arbitration",
                    )
                )
    return (
        (v3 if selected == "v3" else cdn or []),
        repairs,
        check,
        ([] if selected != "none" else ["neither source conserves independent box totals"]),
    )


@dataclass
class _PeriodResult:
    seconds: dict[str, Decimal]
    plus_minus: dict[str, int]
    stints: list[dict[str, Any]]
    event_lineups: list[dict[str, Any]]
    repairs: list[Repair]
    errors: list[str]


def _simulate_period(
    events: list[RepairEvent],
    starters: tuple[str, ...],
    team: str,
    roster: dict[str, str],
    game_id: str,
    *,
    repair_missing: bool,
) -> _PeriodResult:
    period = events[0].period
    length = Decimal(720 if period <= 4 else 300)
    synthetic: dict[int, list[tuple[str, str]]] = defaultdict(list)
    repairs: list[Repair] = []
    visited: set[tuple[int, str, str]] = set()
    # Restart at the dead ball so scoring and duration before the discovery are corrected.
    for _ in range(21):
        lineup = set(starters)
        seconds: dict[str, Decimal] = defaultdict(Decimal)
        plus_minus: dict[str, int] = defaultdict(int)
        last_clock = length
        stints: list[dict[str, Any]] = []
        event_lineups: list[dict[str, Any]] = []
        errors: list[str] = []
        missing: tuple[int, str] | None = None
        for index, event in enumerate(events):
            if not 0 <= event.seconds <= last_clock:
                errors.append(f"clock reversal/out of range at {event.source}/{event.row_index}")
                break
            duration = last_clock - event.seconds
            if duration:
                stints.append(
                    {
                        "period": period,
                        "start_seconds": str(last_clock),
                        "end_seconds": str(event.seconds),
                        "lineup": sorted(lineup),
                    }
                )
                for pid in lineup:
                    seconds[pid] += duration
            for outgoing, incoming in synthetic[index]:
                if outgoing not in lineup or incoming in lineup:
                    errors.append("synthetic substitution no longer consistent")
                    break
                lineup.remove(outgoing)
                lineup.add(incoming)
            required = {p for p in event.participants if roster.get(p) == team}
            if event.team_id == team:
                required.update(event.outgoing)
            absent = sorted(required - lineup)
            if absent:
                missing = index, absent[0]
                break
            if event.team_id == team and event.outgoing:
                if len(set(event.outgoing)) != len(event.outgoing) or len(
                    set(event.incoming)
                ) != len(event.incoming):
                    errors.append("duplicate substitution identities")
                    break
                remaining = lineup - set(event.outgoing)
                if remaining & set(event.incoming):
                    errors.append("incoming player already on floor")
                    break
                lineup = remaining | set(event.incoming)
            if len(lineup) != 5 or any(roster.get(p) != team for p in lineup):
                errors.append("invalid five-player side")
                break
            points = event.stats.get("points", 0)
            if points:
                sign = 1 if event.team_id == team else -1
                for pid in lineup:
                    plus_minus[pid] += points * sign
            event_lineups.append({"locator": event.locator(), "lineup": sorted(lineup)})
            last_clock = event.seconds
        if missing is None:
            if last_clock:
                stints.append(
                    {
                        "period": period,
                        "start_seconds": str(last_clock),
                        "end_seconds": "0",
                        "lineup": sorted(lineup),
                    }
                )
                for pid in lineup:
                    seconds[pid] += last_clock
            return _PeriodResult(
                dict(seconds), dict(plus_minus), stints, event_lineups, repairs, errors
            )
        index, incoming = missing
        if not repair_missing:
            return _PeriodResult(
                {}, {}, [], [], [], [f"off-floor action: {incoming}/{events[index].row_index}"]
            )
        boundary = max(
            (
                i
                for i in range(index + 1)
                if events[i].kind in ("period", "foul", "timeout", "violation", "substitution")
            ),
            default=-1,
        )
        # At a substitution-out action, insert before that substitution, not after it.
        if boundary < 0:
            return _PeriodResult({}, {}, [], [], repairs, ["no dead ball for missing substitution"])
        # Recover lineup and last action at the boundary by replaying the successful prefix.
        boundary_lineup = (
            set(starters) if boundary == 0 else set(event_lineups[boundary - 1]["lineup"])
        )
        for out, inc in synthetic[boundary]:
            boundary_lineup.discard(out)
            boundary_lineup.add(inc)
        action_at: dict[str, Decimal] = {}
        for e in events[:boundary]:
            actors = set(e.participants)
            if e.team_id == team:
                actors.update(e.outgoing)
            for p in actors:
                if roster.get(p) == team:
                    action_at[p] = length - e.seconds
        outgoing = min(
            boundary_lineup,
            key=lambda p: (length - events[boundary].seconds - action_at.get(p, Decimal(0)), p),
        )
        key = boundary, outgoing, incoming
        if key in visited or incoming in boundary_lineup:
            return _PeriodResult({}, {}, [], [], repairs, ["missing-substitution cycle"])
        visited.add(key)
        synthetic[boundary].append((outgoing, incoming))
        repairs.append(
            Repair(
                "IM02-R2",
                game_id,
                period,
                team,
                incoming,
                {"boundary": events[boundary].locator(), "discovery": events[index].locator()},
                {"lineup": sorted(boundary_lineup)},
                {"outgoing": outgoing, "incoming": incoming},
                "off-floor action at preceding dead ball",
            )
        )
    return _PeriodResult({}, {}, [], [], repairs, ["missing-substitution repair budget exceeded"])


def _starter_candidates(
    events: list[RepairEvent], team: str, roster: dict[str, str]
) -> list[tuple[str, ...]]:
    entered: set[str] = set()
    required: list[str] = []
    for event in events:
        actors = sorted(p for p in event.participants if roster.get(p) == team)
        if event.team_id == team:
            actors += list(event.outgoing)
        for pid in actors:
            if pid not in entered and pid not in required:
                required.append(pid)
        if event.team_id == team:
            entered.update(event.incoming)
    # Excess required starters imply a missing substitution; R2 handles that contradiction.
    required = required[:5]
    pool = sorted(p for p, t in roster.items() if t == team and p not in required)
    return [
        tuple(sorted([*required, *extra]))
        for extra in itertools.combinations(pool, 5 - len(required))
    ]


def _reconstruct_repaired_game(
    *,
    game_id: str,
    v3_rows: list[dict[str, str]],
    cdn_rows: list[dict[str, str]] | None,
    boxes: list[dict[str, str]],
    team_points: dict[str, int],
    input_hashes: dict[str, str],
    starter_evidence: dict[tuple[int, str], dict[str, Any]] | None = None,
    preferred_source: str = "v3",
) -> dict[str, Any]:
    """Produce auditable v2 candidates and quality, without any warehouse mutation."""
    repairs: list[Repair] = []
    errors: list[str] = []
    roster = {b["person_id"]: b["team_id"] for b in boxes}
    known_seconds: dict[str, Decimal] = {}
    unknown_minutes: list[str] = []
    if len(roster) != len(boxes) or set(roster.values()) != set(team_points):
        errors.append("missing/duplicate box roster or team identities")
    for index, box in enumerate(boxes):
        pid = box["person_id"]
        seconds, carried = parse_box_seconds(box.get("minutes", ""))
        if seconds is None:
            unknown_minutes.append(pid)
            if box.get("minutes", ""):
                repairs.append(
                    Repair(
                        "IM02-R5",
                        game_id,
                        None,
                        box["team_id"],
                        pid,
                        {
                            "sha256": input_hashes.get("player_box"),
                            "row_index": box.get("_row_index", index),
                        },
                        box["minutes"],
                        None,
                        "ambiguous minutes remain unknown",
                    )
                )
        else:
            known_seconds[pid] = seconds
            if carried:
                repairs.append(
                    Repair(
                        "IM02-R5",
                        game_id,
                        None,
                        box["team_id"],
                        pid,
                        {
                            "sha256": input_hashes.get("player_box"),
                            "row_index": box.get("_row_index", index),
                        },
                        box["minutes"],
                        str(seconds),
                        "carry exactly 60 seconds",
                    )
                )
    source_errors: dict[str, str] = {}
    sources: dict[str, list[RepairEvent] | None] = {}
    for name, rows in (("v3", v3_rows), ("cdn", cdn_rows)):
        if rows is None:
            sources[name] = None
            continue
        try:
            sources[name] = normalize_events(
                rows, source=name, source_sha256=input_hashes[name], boxes=boxes
            )
        except (ValueError, KeyError, InvalidOperation) as exc:
            sources[name] = []
            source_errors[name] = str(exc)
    events, arbitration_repairs, arbitration, scoring = arbitrate_sources(
        game_id=game_id,
        v3=sources["v3"] or [],
        cdn=sources["cdn"],
        boxes=boxes,
        team_points=team_points,
        source_errors=source_errors,
        preferred_source=preferred_source,
    )
    repairs.extend(arbitration_repairs)
    errors.extend(scoring)
    events, ordering_repairs = order_same_clock(events, game_id)
    repairs.extend(ordering_repairs)
    periods = sorted({e.period for e in events})
    if not periods or periods != list(range(1, max(periods) + 1)) or max(periods) < 4:
        errors.append("incomplete game periods")
    previous: tuple[int, Decimal] = (0, Decimal(0))
    for e in events:
        current = e.period, -e.seconds
        if current < previous:
            errors.append(f"chronological event reversal at {e.row_index}")
            break
        previous = current
    choices: dict[tuple[int, str], list[tuple[tuple[str, ...], _PeriodResult]]] = {}
    selected: dict[tuple[int, str], int] = {}
    evidence = starter_evidence or {}
    if not errors:
        for period in periods:
            p_events = [e for e in events if e.period == period]
            length = Decimal(720 if period <= 4 else 300)
            if p_events[0].seconds != length or p_events[-1].seconds != 0:
                errors.append(f"missing period endpoints: {period}")
            for team in sorted(team_points):
                candidates = _starter_candidates(p_events, team, roster)
                results = [
                    (c, _simulate_period(p_events, c, team, roster, game_id, repair_missing=False))
                    for c in candidates
                ]
                valid = [(c, r) for c, r in results if not r.errors]
                if not valid:
                    valid = [
                        (
                            c,
                            _simulate_period(
                                p_events, c, team, roster, game_id, repair_missing=True
                            ),
                        )
                        for c in candidates
                    ]
                choices[(period, team)] = valid
                selected[(period, team)] = 0
                if not valid:
                    errors.append(f"no five-player starter candidate for {period}/{team}")

    def objective(
        selection: dict[tuple[int, str], int],
    ) -> tuple[int, Decimal, Decimal, tuple[Any, ...]]:
        seconds: dict[str, Decimal] = defaultdict(Decimal)
        failed = 0
        identity = []
        for key, at in selection.items():
            c, r = choices[key][at]
            failed += len(r.errors)
            identity.append(c)
            for pid, value in r.seconds.items():
                seconds[pid] += value
        deltas = [abs(seconds[p] - value) for p, value in known_seconds.items()]
        return failed, sum(deltas, Decimal(0)), max(deltas, default=Decimal(0)), tuple(identity)

    if choices and all(choices.values()):
        # Independent sides; small ambiguous starter sets. Deterministic coordinate descent,
        # then exact enumeration where bounded (<=10,000 candidate combinations).
        for team in sorted(team_points):
            keys = [k for k in choices if k[1] == team]
            size = 1
            for key in keys:
                size *= len(choices[key])
            if size <= 10000:
                variants = (
                    {**selected, **dict(zip(keys, indices, strict=True))}
                    for indices in itertools.product(*(range(len(choices[k])) for k in keys))
                )
                selected = min(variants, key=objective)
            else:
                for _ in range(8):
                    old = selected.copy()
                    for key in keys:
                        selected[key] = min(
                            range(len(choices[key])), key=lambda i: objective({**selected, key: i})
                        )
                    if selected == old:
                        break
    seconds_totals: dict[str, Decimal] = defaultdict(Decimal)
    plus_totals: dict[str, int] = defaultdict(int)
    stints: dict[str, list[dict[str, Any]]] = defaultdict(list)
    event_lineups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    starters: dict[str, dict[str, list[str]]] = defaultdict(dict)
    complete_periods: Counter[str] = Counter()
    for key, at in selected.items():
        if not choices[key]:
            continue
        period, team = key
        candidate, result = choices[key][at]
        starters[str(period)][team] = list(candidate)
        errors.extend(result.errors)
        if not result.errors:
            complete_periods[team] += 1
        repairs.extend(result.repairs)
        original = evidence.get(key)
        if original is None and period == 1:
            original = {
                "players": sorted(
                    b["person_id"] for b in boxes if b["team_id"] == team and b.get("position")
                ),
                "source": "player_box",
                "sha256": input_hashes.get("player_box"),
            }
        if original is not None and sorted(original["players"]) != list(candidate):
            repairs.append(
                Repair(
                    "IM02-R1",
                    game_id,
                    period,
                    team,
                    None,
                    {
                        "evidence": {k: v for k, v in original.items() if k != "players"},
                        "events": [e.locator() for e in events if e.period == period],
                    },
                    original["players"],
                    list(candidate),
                    "later event/substitution-consistent starters",
                )
            )
        for pid, value in result.seconds.items():
            seconds_totals[pid] += value
        for pid, margin in result.plus_minus.items():
            plus_totals[pid] += margin
        stints[team].extend(result.stints)
        event_lineups[team].extend(result.event_lineups)
    comparisons = {}
    max_delta = Decimal(0)
    for box in boxes:
        pid = box["person_id"]
        complete = bool(periods) and complete_periods[box["team_id"]] == len(periods)
        delta = (
            seconds_totals[pid] - known_seconds[pid] if complete and pid in known_seconds else None
        )
        if delta is not None:
            max_delta = max(max_delta, abs(delta))
        raw_plus = box.get("plus_minus_points", "")
        observed_plus = int(Decimal(raw_plus)) if raw_plus else None
        comparisons[pid] = {
            "team_id": box["team_id"],
            "seconds": str(seconds_totals[pid]) if complete else None,
            "box_seconds": str(known_seconds[pid]) if pid in known_seconds else None,
            "minutes_delta_seconds": str(delta) if delta is not None else None,
            "plus_minus": plus_totals[pid] if complete else None,
            "box_plus_minus": observed_plus,
            "plus_minus_delta": plus_totals[pid] - observed_plus
            if complete and observed_plus is not None
            else None,
        }
    if max_delta > 30:
        errors.append(f"player minutes exceed 30-second tolerance: {max_delta}")
    elif max_delta > 1:
        repairs.append(
            Repair(
                "IM02-R4",
                game_id,
                None,
                None,
                None,
                {"sha256": input_hashes.get("player_box")},
                {p: str(v) for p, v in known_seconds.items()},
                {p: str(v) for p, v in seconds_totals.items()},
                "minutes within 30-second tolerance",
            )
        )
    if periods:
        duration = sum((Decimal(720 if p <= 4 else 300) for p in periods), Decimal(0))
        for team in team_points:
            if complete_periods[team] != len(periods):
                errors.append(f"team {team} lineup reconstruction incomplete")
                continue
            total = sum((s for p, s in seconds_totals.items() if roster.get(p) == team), Decimal(0))
            if total != 5 * duration:
                errors.append(f"team {team} player-seconds do not conserve: {total}/{5 * duration}")
    errors = sorted(set(errors))
    if errors:
        repairs.append(
            Repair(
                "IM02-R7",
                game_id,
                None,
                None,
                None,
                {},
                None,
                {"reasons": errors},
                "unrecoverable after deterministic rules",
            )
        )
    envelopes = [r.envelope(input_hashes) for r in repairs]
    payload: dict[str, Any] = {
        "policy_version": POLICY_VERSION,
        "game_id": game_id,
        "input_sha256": input_hashes,
        "quality": "excluded" if errors else "patched" if repairs else "clean",
        "errors": errors,
        "repairs": envelopes,
        "rule_counts": {rule: sum(r.rule_id == rule for r in repairs) for rule in RULE_IDS},
        "arbitration": arbitration,
        "unknown_minutes": sorted(unknown_minutes),
        "period_starter_box_evidence": "available" if evidence else "unavailable",
        "starters": dict(starters),
        "player_comparisons": comparisons,
        "team_stints": dict(stints),
        "event_lineups": dict(event_lineups),
        "database_admission": False,
    }
    payload["content_sha256"] = content_hash(payload)
    return payload


def reconstruct_repaired_game(
    *,
    game_id: str,
    v3_rows: list[dict[str, str]],
    cdn_rows: list[dict[str, str]] | None,
    boxes: list[dict[str, str]],
    team_points: dict[str, int],
    input_hashes: dict[str, str],
    starter_evidence: dict[tuple[int, str], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Prefer a box-conserving source that also admits a consistent five-player timeline."""
    # Explicit kwargs retain static checking of the domain boundary.
    result = _reconstruct_repaired_game(
        game_id=game_id,
        v3_rows=v3_rows,
        cdn_rows=cdn_rows,
        boxes=boxes,
        team_points=team_points,
        input_hashes=input_hashes,
        starter_evidence=starter_evidence,
    )
    if (
        result["quality"] == "excluded"
        and result["arbitration"]["selected"] == "v3"
        and cdn_rows is not None
        and not result["arbitration"]["scoring_errors"]["cdn"]
    ):
        alternate = _reconstruct_repaired_game(
            game_id=game_id,
            v3_rows=v3_rows,
            cdn_rows=cdn_rows,
            boxes=boxes,
            team_points=team_points,
            input_hashes=input_hashes,
            starter_evidence=starter_evidence,
            preferred_source="cdn",
        )
        checks = {"v3": result["errors"], "cdn": alternate["errors"]}
        if alternate["quality"] != "excluded":
            override = Repair(
                "IM02-R6",
                game_id,
                None,
                None,
                None,
                {"v3_sha256": input_hashes["v3"], "cdn_sha256": input_hashes["cdn"]},
                {"selected": "v3", "reasons": result["errors"]},
                {"selected": "cdn"},
                "CDN conserves box totals and five-player minutes after v3 repairs fail",
            )
            alternate["repairs"].append(override.envelope(input_hashes))
            alternate["rule_counts"]["IM02-R6"] += 1
            alternate["quality"] = "patched"
            result = alternate
        result["arbitration"]["reconstruction_checks"] = checks
        result["content_sha256"] = content_hash(
            {k: v for k, v in result.items() if k != "content_sha256"}
        )
    return result
