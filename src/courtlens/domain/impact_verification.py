"""Independent raw-event boundary and accounting verification for descriptive IM03."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from decimal import Decimal
from itertools import pairwise
from typing import Any

from courtlens.domain.possession_repair import RepairEvent
from courtlens.ingestion.native_reconstruction import content_hash

GATE_VERSION = "courtlens-impact-event-gate-v1"
FACTOR_KEYS = ("points", "fga", "fgm", "fta", "ftm", "turnovers", "orb_opportunities", "orb")


@dataclass(frozen=True)
class Fact:
    index: int
    period: int
    seconds: Decimal
    kind: str
    team: str
    player: str
    values: dict[str, int]
    attempt: int = 0
    attempts: int = 0
    retained: bool = False


def raw_facts(
    events: list[RepairEvent], rows: dict[int, dict[str, str]], teams: tuple[str, str]
) -> list[Fact]:
    """Parse outcomes independently: only IM02's ordered identities are shared."""
    facts = []
    for index, event in enumerate(events):
        row = rows[event.row_index]
        action = row.get("actionType", "").lower().replace(" ", "").replace("_", "")
        kind = {
            "2pt": "shot",
            "3pt": "shot",
            "madeshot": "shot",
            "missedshot": "shot",
            "freethrow": "ft",
            "rebound": "reb",
            "turnover": "tov",
        }.get(action, "other")
        team, player = row.get("teamId") or "0", row.get("personId") or "0"
        if player in teams and team in ("0", player):
            team, player = player, "0"
        description = row.get("description", "")
        text = (description + " " + row.get("subType", "")).lower()
        values: dict[str, int] = {}
        attempt = attempts = 0
        retained = False
        if kind == "shot":
            outcome = row.get("shotResult")
            if outcome not in {"Made", "Missed"}:
                raise ValueError("unknown raw field-goal result")
            made = int(outcome == "Made")
            value = int(
                row.get("shotValue") or (3 if action == "3pt" or "3PT" in description else 2)
            )
            if value not in {2, 3}:
                raise ValueError("unknown raw field-goal value")
            values = {"fga": 1, "fgm": made, "points": made * value}
        elif kind == "ft":
            if description.startswith("MISS ") or row.get("shotResult") == "Missed":
                made = 0
            elif row.get("shotResult") == "Made" or re.search(r"\(\d+ PTS\)", description):
                made = 1
            else:
                raise ValueError("unknown raw free-throw result")
            retained = any(
                term in text
                for term in (
                    "technical",
                    "flagrant",
                    "clear path",
                    "away from play",
                    "transition take",
                )
            )
            if not retained:
                for earlier in reversed(events[:index]):
                    if (earlier.period, earlier.seconds) != (event.period, event.seconds):
                        break
                    previous_row = rows[earlier.row_index]
                    if previous_row.get("actionType", "").strip().lower() != "foul":
                        continue
                    foul = (
                        previous_row.get("subType", "") + " " + previous_row.get("description", "")
                    ).lower()
                    if "technical" in foul:
                        continue
                    retained = any(
                        term in foul
                        for term in (
                            "flagrant",
                            "clear path",
                            "away from play",
                            "away.from.play",
                            "transition take",
                            "inbound",
                        )
                    )
                    break
            sequence = re.search(r"(\d)\s*(?:of|/)\s*(\d)", text)
            if sequence:
                attempt, attempts = map(int, sequence.groups())
            elif not retained:
                raise ValueError("unknown raw free-throw sequence")
            values = {"fta": 1, "ftm": made, "points": made}
        elif kind == "tov":
            values = {"turnovers": 1}
        if kind in {"shot", "ft", "tov", "reb"} and team not in teams:
            kind = "unresolved_" + kind
        facts.append(
            Fact(
                index,
                event.period,
                event.seconds,
                kind,
                team,
                player,
                values,
                attempt,
                attempts,
                retained,
            )
        )
    return facts


def expected_records(facts: list[Fact]) -> list[dict[str, Any]]:
    """First classify raw ending events, then partition observed offensive actions.

    No reconstructed possession field or count is consulted. Rebound pairing and
    and-one classification happen before grouping, unlike the warehouse state machine.
    """
    actions = [f for f in facts if f.kind in {"shot", "ft", "tov"} and not f.retained]
    period_end = {f.period: f.index for f in facts}
    endings: dict[int, tuple[int, str]] = {}
    rebounds: dict[int, Fact] = {}
    for at, action in enumerate(actions):
        if action.kind == "tov":
            endings[action.index] = (action.index, "turnover")
        elif action.kind == "shot" and action.values["fgm"]:
            and_one = any(
                f.kind == "ft"
                and not f.retained
                and f.team == action.team
                and f.period == action.period
                and f.seconds == action.seconds
                and f.attempt == f.attempts == 1
                for f in facts[action.index + 1 :]
                if f.period == action.period and f.seconds == action.seconds
            )
            if not and_one:
                endings[action.index] = (action.index, "made_field_goal")
        elif action.kind == "ft" and action.attempt == action.attempts and action.values["ftm"]:
            endings[action.index] = (action.index, "made_final_ft")
        live_miss = (action.kind == "shot" and not action.values["fgm"]) or (
            action.kind == "ft" and action.attempt == action.attempts and not action.values["ftm"]
        )
        if live_miss:
            stop = actions[at + 1].index if at + 1 < len(actions) else len(facts)
            rebound = next(
                (
                    f
                    for f in facts[action.index + 1 : stop]
                    if f.period == action.period and f.kind == "reb"
                ),
                None,
            )
            if rebound:
                rebounds[action.index] = rebound
                if rebound.team != action.team:
                    endings[action.index] = (rebound.index, "defensive_rebound")
    groups: list[dict[str, Any]] = []
    for action in actions:
        new = (
            not groups
            or groups[-1]["closed"]
            or (groups[-1]["period"], groups[-1]["team"]) != (action.period, action.team)
        )
        if new:
            if groups and not groups[-1]["closed"]:
                previous = groups[-1]
                previous["end"] = (
                    period_end[previous["period"]]
                    if previous["period"] != action.period
                    else action.index - 1
                )
                previous["reason"] = (
                    "period_end"
                    if previous["period"] != action.period
                    else "opponent_observed_control"
                )
                previous["evidence"].append(action.index)
            groups.append(
                {
                    "period": action.period,
                    "team": action.team,
                    "start": action.index,
                    "end": action.index,
                    "counted": True,
                    "closed": False,
                    "reason": "",
                    "evidence": [],
                    "values": {},
                    "actions": [],
                }
            )
        group = groups[-1]
        group["actions"].append(action.index)
        group["values"][action.index] = action.values
        group["end"] = action.index
        if action.index in rebounds:
            rebound = rebounds[action.index]
            group["values"][rebound.index] = {
                "orb_opportunities": int(rebound.player != "0"),
                "orb": int(rebound.player != "0" and rebound.team == action.team),
            }
        if action.index in endings:
            group["end"], group["reason"] = endings[action.index]
            group["evidence"].append(group["end"])
            group["closed"] = True
    if groups and not groups[-1]["closed"]:
        groups[-1]["end"] = period_end[groups[-1]["period"]]
        groups[-1]["reason"] = "period_end"
        groups[-1]["evidence"].append(groups[-1]["end"])
    for fact in facts:
        if fact.retained:
            groups.append(
                {
                    "period": fact.period,
                    "team": fact.team,
                    "start": fact.index,
                    "end": fact.index,
                    "counted": False,
                    "reason": "retained_ball_ft",
                    "evidence": [fact.index],
                    "values": {fact.index: fact.values},
                    "actions": [fact.index],
                    "closed": True,
                }
            )
    return sorted(groups, key=lambda g: (g["end"], int(g["counted"])))


def verify_event_game(
    *,
    events: list[RepairEvent],
    raw_rows: dict[int, dict[str, str]],
    candidate: dict[str, Any],
    game: dict[str, Any],
    team_boxes: list[dict[str, str]],
) -> dict[str, Any]:
    teams = tuple(b["team_id"] for b in team_boxes)
    if len(teams) != 2:
        raise ValueError("expected two independent team boxes")
    facts = raw_facts(events, raw_rows, (teams[0], teams[1]))
    expected = expected_records(facts)
    errors: list[str] = []
    errors.extend(
        f"unresolved raw {f.kind} at {events[f.index].locator()}"
        for f in facts
        if f.kind.startswith("unresolved_")
    )
    actual = game["possessions"]
    if len(actual) != len(expected):
        errors.append(f"record count {len(actual)} != independent {len(expected)}")
    for number, (want, got) in enumerate(zip(expected, actual, strict=False), 1):
        boundary_key = (
            got["period"],
            got["offense_team_id"],
            got["start_order_index"],
            got["end_order_index"],
            got["count_as_possession"],
        )
        required = (want["period"], want["team"], want["start"], want["end"], want["counted"])
        if boundary_key != required:
            errors.append(f"boundary {number}: {boundary_key} != {required}")
            continue
        contributions = [
            {"locator": events[i].locator(), "order_index": i, "values": v}
            for i, v in sorted(want["values"].items())
        ]
        if got["stats_json"]["events"] != contributions:
            errors.append(f"event coverage/values {number}")
        totals = {k: sum(v.get(k, 0) for v in want["values"].values()) for k in FACTOR_KEYS}
        if (
            any(got["stats_json"][k] != totals[k] for k in FACTOR_KEYS)
            or got["points"] != totals["points"]
        ):
            errors.append(f"factor totals {number}")
        for team, field in (
            (want["team"], "off_lineup_json"),
            (teams[1] if want["team"] == teams[0] else teams[0], "def_lineup_json"),
        ):
            lineup = candidate["event_lineups"][team][want["end"]]
            if lineup["locator"] != events[want["end"]].locator() or got[field] != lineup["lineup"]:
                errors.append(f"ending lineup {number}/{team}")
    # Independently align the full source order with stored time/lineup intervals.
    # Administrative events advance the cursor too, preserving equal-clock changes.
    stints = game["stints"]
    event_stints = {}
    cursor = 0
    for index, event in enumerate(events):
        h = candidate["event_lineups"][stints[0]["home_team_id"]][index]["lineup"]
        a = candidate["event_lineups"][stints[0]["away_team_id"]][index]["lineup"]
        found = next(
            (
                i
                for i in range(cursor, len(stints))
                if stints[i]["period"] == event.period
                and Decimal(str(stints[i]["start_seconds_remaining"]))
                >= event.seconds
                >= Decimal(str(stints[i]["end_seconds_remaining"]))
                and stints[i]["home_lineup_json"] == h
                and stints[i]["away_lineup_json"] == a
            ),
            None,
        )
        if found is None:
            errors.append(f"source event lacks matching stint {index}")
        else:
            cursor = found
            event_stints[index] = found
    stint_values: dict[int, dict[str, Counter[str]]] = defaultdict(lambda: defaultdict(Counter))
    exposure: dict[int, Counter[str]] = defaultdict(Counter)
    scorers: dict[int, Counter[str]] = defaultdict(Counter)
    for group in expected:
        team = group["team"]
        for index, values in group["values"].items():
            if index in event_stints:
                stint_values[event_stints[index]][team].update(values)
                if values.get("points"):
                    scorers[event_stints[index]][facts[index].player] += values["points"]
        if group["counted"] and group["end"] in event_stints:
            exposure[event_stints[group["end"]]][team] += 1
    player_seconds: dict[str, Decimal] = defaultdict(Decimal)
    period_seconds: dict[int, Decimal] = defaultdict(Decimal)
    scores: Counter[str] = Counter()
    for index, stint in enumerate(stints):
        duration = Decimal(str(stint["duration_seconds"]))
        if duration < 0 or abs(
            duration
            - (
                Decimal(str(stint["start_seconds_remaining"]))
                - Decimal(str(stint["end_seconds_remaining"]))
            )
        ) > Decimal("0.000001"):
            errors.append(f"invalid duration {index}")
        period_seconds[stint["period"]] += duration
        players = stint["home_lineup_json"] + stint["away_lineup_json"]
        if len(players) != 10 or len(set(players)) != 10:
            errors.append(f"invalid five-on-five lineup {index}")
        for player in players:
            player_seconds[player] += duration
        for side in ("home", "away"):
            team = stint[f"{side}_team_id"]
            values = stint_values[index][team]
            if any(stint["stats_json"][team][k] != values[k] for k in FACTOR_KEYS):
                errors.append(f"stint factor attribution {index}/{team}")
            if (
                stint[f"{side}_points"] != values["points"]
                or stint[f"{side}_possessions"] != exposure[index][team]
            ):
                errors.append(f"stint points/exposure {index}/{team}")
            if (
                stint[f"start_{side}_score"] != scores[team]
                or stint[f"end_{side}_score"] != scores[team] + values["points"]
            ):
                errors.append(f"stint score progression {index}/{team}")
            scores[team] += values["points"]
        if stint["total_possessions"] != sum(exposure[index].values()):
            errors.append(f"stint total exposure {index}")
        if {p: v["points"] for p, v in stint["player_stats_json"].items()} != dict(scorers[index]):
            errors.append(f"scorer attribution {index}")
    if any(
        abs(seconds - (720 if period <= 4 else 300)) > Decimal("0.000001")
        for period, seconds in period_seconds.items()
    ):
        errors.append("period seconds do not conserve")
    if any(
        abs(player_seconds[p] - Decimal(c["seconds"])) > Decimal("0.000001")
        for p, c in candidate["player_comparisons"].items()
    ):
        errors.append("accepted player seconds do not conserve")
    ledger: dict[str, Any] = {}
    for box in team_boxes:
        team = box["team_id"]
        records = [g for g in expected if g["team"] == team]
        totals = Counter(
            {
                k: sum(v.get(k, 0) for g in records for v in g["values"].values())
                for k in FACTOR_KEYS
            }
        )
        for key, column in (
            ("points", "points"),
            ("fga", "field_goals_attempted"),
            ("fgm", "field_goals_made"),
            ("fta", "free_throws_attempted"),
            ("ftm", "free_throws_made"),
        ):
            if column in box and totals[key] != int(box[column]):
                errors.append(f"independent box conservation {team}/{key}")
        counts = sum(g["counted"] for g in records)
        terms: dict[str, Decimal] = defaultdict(Decimal)
        evidence = []
        for group in records:
            trials = []
            prior_ft: Fact | None = None
            for index in group["actions"]:
                fact = facts[index]
                if fact.retained:
                    terms["retained_ft_weight"] -= Decimal("0.44")
                    continue
                if fact.kind == "ft":
                    terms["ordinary_ft_weight"] -= Decimal("0.44")
                    first = (
                        prior_ft is None
                        or fact.attempt == 1
                        or (fact.team, fact.player, fact.period, fact.seconds, fact.attempts)
                        != (
                            prior_ft.team,
                            prior_ft.player,
                            prior_ft.period,
                            prior_ft.seconds,
                            prior_ft.attempts,
                        )
                    )
                    if first:
                        terms["ordinary_ft_trips"] += 1
                        trials.append(index)
                    prior_ft = fact
                else:
                    trials.append(index)
            for left, right in pairwise(trials):
                between = [
                    facts[i]
                    for i in group["values"]
                    if left < i < right and facts[i].kind == "reb" and facts[i].team == team
                ]
                if between:
                    category = (
                        "player_rebound_continuation"
                        if between[-1].player != "0"
                        else "team_rebound_continuation"
                    )
                elif (
                    facts[left].kind == "shot"
                    and facts[left].values["fgm"]
                    and facts[right].kind == "ft"
                ):
                    category = "and_one_continuation"
                else:
                    category = "observed_same_team_continuation"
                terms[category] -= 1
                evidence.append(
                    {
                        "rule": category,
                        "from": events[left].locator(),
                        "to": events[right].locator(),
                    }
                )
        terms["player_orb_box"] = Decimal(box["rebounds_offensive"])
        terms["team_turnover_box_difference"] = Decimal(totals["turnovers"] - int(box["turnovers"]))
        estimate = (
            Decimal(box["field_goals_attempted"])
            + Decimal("0.44") * Decimal(box["free_throws_attempted"])
            - Decimal(box["rebounds_offensive"])
            + Decimal(box["turnovers"])
        )
        delta = Decimal(counts) - estimate
        if sum(terms.values()) != delta:
            errors.append(f"unexplained box discrepancy {team}: {sum(terms.values())} != {delta}")
        ledger[team] = {
            "possessions": counts,
            "box_estimate": str(estimate),
            "delta": str(delta),
            "terms": {k: str(v) for k, v in sorted(terms.items())},
            "continuations": evidence,
        }
    result = {
        "gate_version": GATE_VERSION,
        "game_id": game["game_id"],
        "game_sha256": game["content_sha256"],
        "candidate_sha256": candidate["content_sha256"],
        "ordered_inputs_sha256": content_hash(raw_rows),
        "expected_records": len(expected),
        "boundaries_sha256": content_hash(expected),
        "boundary_rules": dict(Counter(g["reason"] for g in expected)),
        "box_discrepancy_ledger": ledger,
        "errors": errors,
        "passed": not errors,
    }
    result["content_sha256"] = content_hash(result)
    return result
