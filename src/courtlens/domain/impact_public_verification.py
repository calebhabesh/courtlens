"""Bind retained public possession groups to independently verified source controls."""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from collections.abc import Iterable
from typing import Any

from courtlens.ingestion.native_reconstruction import clock_seconds, content_hash
from courtlens.ingestion.workbench_normalization import normalize_game_id


def public_sequence_groups(
    rows: Iterable[dict[str, str]],
) -> dict[tuple[str, str], list[dict[str, Any]]]:
    groups: dict[tuple[str, str], dict[str, dict[str, Any]]] = defaultdict(dict)
    for ordinal, row in enumerate(rows):
        gid = normalize_game_id(row["GAMEID"])
        key = content_hash({k: row[k] for k in ("PERIOD", "STARTTIME", "ENDTIME", "EVENTS")})
        group = groups[(gid, row["OPPONENT"])].setdefault(
            key, {**row, "_event_ids": [], "_descriptions": [], "_row_ordinals": []}
        )
        group["_row_ordinals"].append(ordinal)
        description = row.get("DESCRIPTION", "")
        if any(x in description.upper() for x in ("TURNOVER", "MISS ", " PTS)")):
            match = re.search(r"/\d{10}/(\d+)/", row.get("URL", ""))
            if match and int(match[1]) not in group["_event_ids"]:
                group["_event_ids"].append(int(match[1]))
        for text in [description, *row["EVENTS"].replace("\\n", "\n").splitlines()]:
            for part in [text, *text.split(":")]:
                if part.strip() and part.strip() not in group["_descriptions"]:
                    group["_descriptions"].append(part.strip())
    return {key: list(values.values()) for key, values in groups.items()}


def seconds(clock: str) -> float:
    minute, second = clock.split(":")
    return int(minute) * 60 + float(second)


def public_signature(row: dict[str, Any]) -> tuple[int, float, int, int, int]:
    return (
        int(row["PERIOD"]),
        seconds(row["ENDTIME"]),
        int(float(row["FG2A"])) + int(float(row["FG3A"])),
        int(float(row["FG2M"])) + int(float(row["FG3M"])),
        int(float(row["TURNOVERS"])),
    )


def court_signature(possession: dict[str, Any]) -> tuple[int, float, int, int, int]:
    stats = possession["stats_json"]
    return (
        possession["period"],
        possession["end_seconds_remaining"],
        stats["fga"],
        stats["fgm"],
        stats["turnovers"],
    )


def description_key(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    text = text.replace("turnover turnover", "turnover")
    return re.sub(r"[^a-z0-9]", "", text)


def trial_description(text: str) -> tuple[str, str, str] | None:
    """Bridge explicit actor/outcome counters across NBA/CDN description schemas."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    actor = re.match(
        r"^(?:miss\s+)?(.+?)\s+(?:\d+'\s+)?(?:3pt|2pt|jump|pullup|step|turnaround|driving|"
        r"running|cutting|layup|dunk|tip|fadeaway|hook|floating|alley|reverse|putback|free throw|"
        r"bad pass|lost ball|out of bounds|offensive|traveling|palming|double dribble|"
        r"discontinue dribble|lane violation|shot clock|8 second|backcourt)",
        text,
    )
    if not actor:
        return None
    name = re.sub(r"^(?:[a-z]{1,3}\.\s*)+", "", actor[1])
    name = description_key(name)
    if "turnover" in text:
        counter = re.search(r"\(p(\d+)\.t|\((\d+) to\)", text)
        return (name, "turnover", next(g for g in counter.groups() if g)) if counter else None
    made = re.search(r"\((\d+) pts\)", text)
    kind = "free_throw" if "free throw" in text else "shot"
    if made:
        return name, kind, made[1]
    if text.startswith("miss "):
        return name, kind, "miss"
    return None


def review_public_sequences(
    game: dict[str, Any],
    raw_rows: list[dict[str, str]],
    public: list[dict[str, Any]],
    team: str,
) -> dict[str, Any]:
    """Explain count differences through source-identity overlap, not fitted residuals."""
    rows = {int(r["_row_index"]): r for r in raw_rows}
    controls = [
        p for p in game["possessions"] if p["count_as_possession"] and p["offense_team_id"] == team
    ]
    positions = {p["possession_number"]: i for i, p in enumerate(controls)}
    by_id: dict[tuple[int, int], set[int]] = defaultdict(set)
    by_description: dict[tuple[int, str], set[int]] = defaultdict(set)
    owners = {}
    by_trial: dict[tuple[int, tuple[str, str, str]], list[tuple[int, float]]] = defaultdict(list)
    for possession in game["possessions"]:
        owners[possession["possession_number"]] = (
            possession["offense_team_id"],
            possession["count_as_possession"],
        )
        for contribution in possession["stats_json"]["events"]:
            if not any(k in contribution["values"] for k in ("fga", "fta", "turnovers")):
                continue
            locator = contribution["locator"]
            period = possession["period"]
            by_id[(period, locator["action_number"])].add(possession["possession_number"])
            raw = rows[locator["row_index"]]
            trial = trial_description(raw.get("description", ""))
            if trial:
                by_trial[(period, trial)].append(
                    (possession["possession_number"], float(clock_seconds(raw["clock"])))
                )
            by_description[
                (period, description_key(rows[locator["row_index"]].get("description", "")))
            ].add(possession["possession_number"])
    adjacency: dict[tuple[str, int], set[tuple[str, int]]] = defaultdict(set)
    public_matches: list[set[int]] = []
    match_methods: list[str] = []
    revisions: list[dict[str, Any]] = []
    for i, row in enumerate(public):
        found: set[int] = set()
        for event_id in row["_event_ids"]:
            found.update(by_id[(int(row["PERIOD"]), event_id)])
        for description in row["_descriptions"]:
            found.update(by_description[(int(row["PERIOD"]), description_key(description))])
        method = "source_identity_or_description" if found else "unmatched"
        if not found:
            for description in row["_descriptions"]:
                trial = trial_description(description)
                if not trial:
                    continue
                matches = by_trial[(int(row["PERIOD"]), trial)]
                if trial[2] == "miss":
                    matches = [
                        (n, clock)
                        for n, clock in matches
                        if seconds(row["ENDTIME"]) - 1 <= clock <= seconds(row["STARTTIME"]) + 1
                    ]
                numbers = {n for n, _ in matches}
                if len(numbers) == 1:
                    found.update(numbers)
            if found:
                method = "unique_actor_outcome_counter"
        # CDN descriptions use different shot/team-turnover wording. A unique
        # nonempty factor/end-clock match binds that group to independently
        # verified control contributions without assuming a count agreement.
        if not found and (
            public_signature(row)[2:] != (0, 0, 0) or "free throw" in row["EVENTS"].lower()
        ):
            signature = public_signature(row)
            factor_matches = [
                p
                for p in game["possessions"]
                if p["period"] == signature[0]
                and court_signature(p)[2:] == signature[2:]
                and abs(p["end_seconds_remaining"] - signature[1]) <= 1
                and (signature[2:] != (0, 0, 0) or p["stats_json"]["fta"] > 0)
            ]
            same_team = [p for p in factor_matches if p["offense_team_id"] == team]
            if len(same_team) == 1:
                factor_matches = same_team
            if len(factor_matches) == 1:
                found.add(factor_matches[0]["possession_number"])
                method = "unique_period_end_factor_match"
        if not found:
            # A retained public export may predate a source action correction.
            # Require a unique same-actor observation in the explicit group clock
            # interval and retain both outcomes; no residual count is fitted.
            for description in row["_descriptions"]:
                trial = trial_description(description)
                if not trial:
                    continue
                revised = [
                    (n, clock, key)
                    for (period, key), observations in by_trial.items()
                    if period == int(row["PERIOD"]) and key[0] == trial[0] and key[1:] != trial[1:]
                    for n, clock in observations
                    if seconds(row["ENDTIME"]) - 1 <= clock <= seconds(row["STARTTIME"]) + 1
                ]
                if len(revised) == 1:
                    number, clock, key = revised[0]
                    found.add(number)
                    revisions.append(
                        {
                            "public_group_index": i,
                            "public_description": description,
                            "selected_record": number,
                            "selected_trial": list(key),
                            "selected_seconds_remaining": clock,
                            "selected_descriptions": [
                                rows[e["locator"]["row_index"]].get("description", "")
                                for p in game["possessions"]
                                if p["possession_number"] == number
                                for e in p["stats_json"]["events"]
                            ],
                            "source_locators": [
                                e["locator"]
                                for p in game["possessions"]
                                if p["possession_number"] == number
                                for e in p["stats_json"]["events"]
                            ],
                        }
                    )
            if found:
                method = "unique_actor_clock_source_revision"
        public_matches.append(found)
        match_methods.append(method)
        for number in found:
            if number in positions:
                left, right = ("p", i), ("c", positions[number])
                adjacency[left].add(right)
                adjacency[right].add(left)
    unseen = {("p", i) for i in range(len(public))} | {("c", i) for i in range(len(controls))}
    components: list[dict[str, Any]] = []
    while unseen:
        pending = [min(unseen)]
        nodes: set[tuple[str, int]] = set()
        while pending:
            node = pending.pop()
            if node in nodes:
                continue
            nodes.add(node)
            pending.extend(adjacency[node] - nodes)
        unseen -= nodes
        ps = sorted(i for kind, i in nodes if kind == "p")
        cs = sorted(i for kind, i in nodes if kind == "c")
        if len(ps) == len(cs):
            continue
        if not ps:
            rule = "selected_control_without_public_group"
        elif cs:
            rule = "public_grouping_boundary_difference"
        elif all(
            public_signature(public[i])[2:] == (0, 0, 0)
            and (not public_matches[i] or all(not owners[n][1] for n in public_matches[i]))
            for i in ps
        ):
            rule = "public_without_observed_control"
        elif all(
            public_matches[i]
            and all(owners[n][0] != team for n in public_matches[i] if owners[n][1])
            for i in ps
        ):
            rule = "public_team_label_difference"
        else:
            rule = "unresolved_public_event"
        components.append(
            {
                "rule": rule,
                "delta": len(cs) - len(ps),
                "selected_controls": [
                    {
                        "possession_number": controls[i]["possession_number"],
                        "period": controls[i]["period"],
                        "start_order_index": controls[i]["start_order_index"],
                        "end_order_index": controls[i]["end_order_index"],
                        "selected_descriptions": [
                            rows[e["locator"]["row_index"]].get("description", "")
                            for e in controls[i]["stats_json"]["events"]
                        ],
                        "source_locators": [
                            e["locator"] for e in controls[i]["stats_json"]["events"]
                        ],
                    }
                    for i in cs
                ],
                "public_groups": [
                    {
                        "period": public[i]["PERIOD"],
                        "start": public[i]["STARTTIME"],
                        "end": public[i]["ENDTIME"],
                        "events": public[i]["EVENTS"],
                        "source_row_ordinals": public[i]["_row_ordinals"],
                        "event_ids": public[i]["_event_ids"],
                        "matched_selected_records": sorted(public_matches[i]),
                        "match_method": match_methods[i],
                    }
                    for i in ps
                ],
            }
        )
    delta = len(controls) - len(public)
    if sum(c["delta"] for c in components) != delta:
        raise ValueError("source-identity graph does not reconcile public count difference")
    return {
        "game_sha256": game["content_sha256"],
        "delta": delta,
        "components": components,
        "source_event_revisions": revisions,
        "passed": not any(c["rule"] == "unresolved_public_event" for c in components),
    }
