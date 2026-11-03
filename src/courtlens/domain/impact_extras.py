"""Pure source-linked IM05 facts and sample-preserving descriptive aggregation."""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from typing import Any

from courtlens.domain.impact_extras_catalog import BUCKETS, IMPACT_EXTRAS_CATALOG, VERSION, WAVE_TWO
from courtlens.domain.possession_repair import RepairEvent, normalize_events
from courtlens.ingestion.native_reconstruction import clock_seconds, content_hash, name_key

BOX_COUNTS = {
    "points": "points",
    "fga": "field_goals_attempted",
    "fgm": "field_goals_made",
    "fg3a": "three_pointers_attempted",
    "fg3m": "three_pointers_made",
    "fta": "free_throws_attempted",
    "ftm": "free_throws_made",
    "assists": "assists",
    "steals": "steals",
    "blocks": "blocks",
    "pf": "fouls_personal",
}


def count(raw: str) -> int:
    value = float(raw)
    if not math.isfinite(value) or value < 0 or value != int(value):
        raise ValueError("unknown or invalid source count")
    return int(value)


def box_counts(row: dict[str, str]) -> dict[str, int] | None:
    try:
        values = {k: count(row[f]) for k, f in BOX_COUNTS.items()}
        if (
            values["fgm"] > values["fga"]
            or values["fg3m"] > values["fg3a"]
            or values["fg3a"] > values["fga"]
            or values["fg3m"] > values["fgm"]
            or values["ftm"] > values["fta"]
            or values["points"] != 2 * values["fgm"] + values["fg3m"] + values["ftm"]
        ):
            return None
        return values
    except (ValueError, KeyError, OverflowError):
        return None


def identity(row: dict[str, str]) -> tuple[Any, ...]:
    """Cross-source auxiliary identity; clocks/actors never match by proximity."""
    return (
        int(row["actionNumber"]),
        int(row["period"]),
        clock_seconds(row["clock"]),
        row.get("teamId") or "0",
        row.get("personId") or "0",
    )


def assist_actor(
    event: RepairEvent,
    row: dict[str, str],
    aliases: dict[str, set[str]],
    roster: dict[str, str],
    cdn: list[dict[str, str]],
) -> tuple[bool, str | None]:
    if not event.stats.get("fgm"):
        return True, None  # Assistance is undefined on misses; residual analogue only.
    match = re.search(r"\(([^()]+) \d+ AST\)", row.get("description", ""))
    text_ids = aliases.get(name_key(match[1]), set()) if match else set()
    text_actor = next(iter(text_ids)) if len(text_ids) == 1 else None
    if event.source == "cdn":
        actor = row.get("assistPersonId") or None
        return (
            (True, actor) if actor is None or roster.get(actor) == event.team_id else (False, None)
        )
    candidates = [
        r
        for r in cdn
        if identity(r) == identity(row)
        and r.get("isFieldGoal") == "1"
        and r.get("shotResult") == "Made"
    ]
    if len(candidates) > 1:
        return False, None
    if candidates:
        actor = candidates[0].get("assistPersonId") or None
        if (
            (actor is not None and roster.get(actor) != event.team_id)
            or (match and actor != text_actor)
            or (not match and actor is not None)
        ):
            return False, None
        return True, actor
    if match:
        return (True, text_actor) if text_actor is not None else (False, None)
    return (bool(row.get("description")), None)


def joined_shot(event: RepairEvent, rows: list[dict[str, str]]) -> dict[str, str] | None:
    matches = [r for r in rows if int(r["GAME_EVENT_ID"]) == event.action_number]
    if len(matches) != 1:
        return None
    r = matches[0]
    if (
        r["PLAYER_ID"] != event.player_id
        or r["TEAM_ID"] != event.team_id
        or int(r["PERIOD"]) != event.period
        or int(r["MINUTES_REMAINING"]) * 60 + int(r["SECONDS_REMAINING"]) != int(event.seconds)
        or count(r["SHOT_ATTEMPTED_FLAG"]) != 1
        or count(r["SHOT_MADE_FLAG"]) != event.stats["fgm"]
        or r["SHOT_TYPE"] != ("3PT Field Goal" if event.stats["fg3a"] else "2PT Field Goal")
    ):
        return None
    return r


def play_bucket(
    event: RepairEvent,
    shot: dict[str, str] | None,
    assist_known: bool,
    assist: str | None,
    preceding_control: dict[str, Any] | None,
) -> str:
    if preceding_control and (
        preceding_control["period"] == event.period
        and preceding_control["offense_team_id"] != event.team_id
        and preceding_control["ending"] in {"turnover", "defensive_rebound"}
        and 0 <= preceding_control["end_seconds_remaining"] - float(event.seconds) <= 6
    ):
        return "trans"
    if shot is None or not shot.get("SHOT_ZONE_BASIC"):
        return "unknown"
    if shot["SHOT_ZONE_BASIC"] == "Restricted Area":
        return "finish"
    if not assist_known:
        return "unknown"
    return "space" if assist else "create"


def game_facts(
    game: dict[str, Any],
    candidate: dict[str, Any],
    boxes: list[dict[str, str]],
    rows: list[dict[str, str]],
    cdn: list[dict[str, str]],
    shots: list[dict[str, str]],
    matchups: list[dict[str, str]],
) -> dict[str, Any]:
    """Use accepted ordered lineups and possession contributions without reconstructing."""
    roster = {r["person_id"]: r["team_id"] for r in boxes}
    if len(roster) != len(boxes):
        raise ValueError("duplicate box player")
    teams = sorted(candidate["event_lineups"])
    if len(teams) != 2 or any(t not in teams for t in roster.values()):
        raise ValueError("box team outside accepted game")
    source = candidate["arbitration"]["selected"]
    normalized = normalize_events(
        rows,
        source=source,
        source_sha256=candidate["input_sha256"][source],
        boxes=boxes,
    )
    by_row = {e.row_index: e for e in normalized}
    raw = {int(r["_row_index"]): r for r in rows}
    cdn_by_identity: dict[tuple[Any, ...], list[dict[str, str]]] = defaultdict(list)
    for r in cdn:
        cdn_by_identity[identity(r)].append(r)
    events = []
    for a, b in zip(*(candidate["event_lineups"][t] for t in teams), strict=True):
        e = by_row[a["locator"]["row_index"]]
        if a["locator"] != b["locator"] or e.locator() != a["locator"]:
            raise ValueError("changed ordered source identity")
        events.append(e)
    if len(events) != len(rows) or len(by_row) != len(rows):
        raise ValueError("incomplete ordered source membership")
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

    support: dict[str, Counter[str]] = defaultdict(Counter)
    for s in game["stints"]:
        for side, other in (("home", "away"), ("away", "home")):
            for p in s[f"{side}_lineup_json"]:
                support[p]["seconds"] += s["duration_seconds"]
                support[p]["off_controls"] += s[f"{side}_possessions"]
                support[p]["def_controls"] += s[f"{other}_possessions"]
    active = set(support)
    box_map = {r["person_id"]: box_counts(r) for r in boxes if r["person_id"] in active}
    if active - set(box_map):
        raise ValueError("active player missing box roster")
    totals: dict[str, Counter[str]] = defaultdict(Counter)
    buckets: dict[str, dict[str, Counter[str]]] = {
        p: {b: Counter() for b in BUCKETS} for p in active
    }
    coverage: Counter[str] = Counter()
    join_failures: list[dict[str, Any]] = []
    problems: dict[str, set[str]] = defaultdict(set)
    shot_by_action: dict[int, list[dict[str, str]]] = defaultdict(list)
    for r in shots:
        shot_by_action[int(r["GAME_EVENT_ID"])].append(r)
    contribution_indices = set()
    preceding = None
    for possession in game["possessions"]:
        for contribution in possession["stats_json"]["events"]:
            i = contribution["order_index"]
            e = events[i]
            if i in contribution_indices or e.locator() != contribution["locator"]:
                raise ValueError("changed or duplicate possession contribution")
            contribution_indices.add(i)
            if e.kind not in ("shot", "free_throw"):
                continue
            if e.player_id not in buckets:
                raise ValueError("scoring actor outside accepted lineups")
            if e.kind == "shot":
                shot = joined_shot(e, shot_by_action.get(e.action_number, []))
                known, assist = assist_actor(
                    e,
                    raw[e.row_index],
                    aliases[e.team_id],
                    roster,
                    cdn_by_identity.get(identity(raw[e.row_index]), []),
                )
                coverage["joined_shots" if shot else "unjoined_shots"] += 1
                coverage["known_assists" if known else "unknown_assists"] += int(e.stats["fgm"])
                if shot is None:
                    join_failures.append(
                        {"locator": e.locator(), "reason": "shot_identity_unavailable"}
                    )
                if not known:
                    join_failures.append(
                        {"locator": e.locator(), "reason": "assist_identity_unavailable"}
                    )
                if not known:
                    problems["rim_assists"].update(p for p in active if roster[p] == e.team_id)
                if shot is None and e.stats["fgm"]:
                    problems["rim_assists"].update(p for p in active if roster[p] == e.team_id)
                if shot and shot["SHOT_ZONE_BASIC"] == "Restricted Area" and assist:
                    totals[assist]["rim_assists"] += 1
                bucket = play_bucket(e, shot, known, assist, preceding)
            else:
                bucket = "unknown"
            values = contribution["values"]
            target = buckets[e.player_id][bucket]
            for field in ("fga", "fgm", "fta", "ftm", "points"):
                target[field] += values.get(field, 0)
        if possession["count_as_possession"]:
            end = events[possession["end_order_index"]]
            ending = end.kind
            if end.kind == "rebound" and end.team_id == possession["defense_team_id"]:
                ending = "defensive_rebound"
            preceding = {**possession, "ending": ending}

    # Link live individual rebounds to the nearest preceding missed FG/FT without
    # crossing another shot, control-ending turnover, jump ball or period boundary.
    pending: int | None = None
    for i, e in enumerate(events):
        if e.kind in {"shot", "free_throw"}:
            pending = i if not e.stats.get("fgm", e.stats.get("ftm", 0)) else None
        elif e.kind in {"turnover", "jump_ball", "period"}:
            pending = None
        elif e.kind == "rebound":
            if pending is None or e.player_id not in roster or e.team_id not in teams:
                coverage["unlinked_or_team_rebounds"] += 1
                pending = None
                continue
            missed = events[pending]
            if missed.period != e.period or missed.team_id not in teams:
                pending = None
                continue
            defense = next(t for t in teams if t != missed.team_id)
            off_lineup = candidate["event_lineups"][missed.team_id][i]["lineup"]
            def_lineup = candidate["event_lineups"][defense][i]["lineup"]
            if e.team_id == defense:
                totals[e.player_id]["drb"] += 1
            for p in def_lineup:
                totals[p]["drb_opportunities"] += 1
            if missed.kind == "shot":
                for p in off_lineup:
                    label = "self" if p == missed.player_id else "team"
                    totals[p][f"{label}_opportunities"] += 1
                    totals[p][f"{label}_orb"] += int(
                        e.team_id == missed.team_id and e.player_id == p
                    )
                # Blocks use an explicit auxiliary actor or one unique same-clock
                # selected-source BLOCK row; no spatial or lineup guess.
                primary = raw[missed.row_index]
                aux = [
                    r
                    for r in cdn_by_identity.get(identity(primary), [])
                    if r.get("isFieldGoal") == "1" and r.get("shotResult") == "Missed"
                ]
                inline = (
                    primary.get("blockPersonId")
                    if source == "cdn"
                    else aux[0].get("blockPersonId")
                    if len(aux) == 1
                    else None
                )
                standalone = {
                    x.player_id
                    for x in events[pending + 1 : i]
                    if x.kind == "block"
                    and x.period == missed.period
                    and x.seconds == missed.seconds
                    and x.team_id == defense
                }
                actors = standalone | ({inline} if inline else set())
                if len(actors) == 1 and roster.get(next(iter(actors))) == defense:
                    actor = next(iter(actors))
                    totals[actor]["block_known"] += 1
                    totals[actor]["block_recovered"] += int(e.team_id == defense)
                    coverage["blocks_with_individual_recovery"] += 1
            pending = None
        if (
            e.kind == "turnover"
            and e.player_id in active
            and "bad pass" in raw[e.row_index].get("subType", "").lower()
        ):
            totals[e.player_id]["bad_pass_tov"] += 1

    charges_complete = bool(cdn)
    for e in events:
        r = raw[e.row_index]
        if (
            e.kind != "foul"
            or "charge" not in (r.get("subType", "") + " " + r.get("descriptor", "")).lower()
        ):
            continue
        matches = [
            a
            for a in cdn_by_identity.get(identity(r), [])
            if a.get("actionType", "").lower() == "foul"
            and "charge" in (a.get("subType", "") + " " + a.get("descriptor", "")).lower()
        ]
        charge_actor = matches[0].get("foulDrawnPersonId") if len(matches) == 1 else None
        if charge_actor in active and roster[charge_actor] != e.team_id:
            totals[charge_actor]["charges"] += 1
            coverage["credited_charges"] += 1
        else:
            charges_complete = False
            coverage["unresolved_charges"] += 1
            join_failures.append({"locator": e.locator(), "reason": "charge_actor_unavailable"})

    matchup_values: Counter[str] = Counter()
    matchup_off: Counter[str] = Counter()
    pairs = set()
    matchup_complete = True
    for r in matchups:
        off, defender = r["person_id"], r["matchups_person_id"]
        pair = (off, defender)
        if pair in pairs:
            raise ValueError("invalid matchup orientation or duplicate pair")
        pairs.add(pair)
        if off not in roster or defender not in roster:
            matchup_complete = False
            coverage["unresolved_matchup_actors"] += 1
            join_failures.append(
                {
                    "source": "matchups",
                    "row_index": r["_row_index"],
                    "offense": off,
                    "defense": defender,
                    "reason": "actor_absent_from_independent_box_roster",
                }
            )
            continue
        if roster[off] == roster[defender] or r["team_id"] != roster[off]:
            raise ValueError("invalid matchup orientation or duplicate pair")
        attempted = count(r["matchup_field_goals_attempted"])
        if count(r["matchup_field_goals_made"]) > attempted:
            raise ValueError("invalid matchup shooting counts")
        matchup_values[defender] += attempted
        matchup_off[off] += attempted
    # Zero is known only for players explicitly represented by valid matchup rows.
    matchup_players = {defender for _, defender in pairs} if matchup_complete else set()
    players = {}
    for p in sorted(active):
        b = box_map[p]
        observed = {
            k: sum(bucket[k] for bucket in buckets[p].values())
            for k in ("fga", "fgm", "fta", "ftm", "points")
        }
        if b is not None and observed != {k: b[k] for k in observed}:
            raise ValueError(f"player shooting does not conserve box: {p}")
        players[p] = {
            "team": roster[p],
            "support": dict(support[p]),
            "box": b,
            "counts": dict(totals[p]),
            "buckets": {k: dict(v) for k, v in buckets[p].items()},
            "rim_assists_complete": p not in problems["rim_assists"],
            "charges_complete": charges_complete,
            "matchup_fga": matchup_values[p] if p in matchup_players else None,
            "block_recovery_unresolved": b["blocks"] - totals[p]["block_known"] if b else None,
        }
    return {
        "players": players,
        "coverage": dict(coverage),
        "join_failures": join_failures,
        "matchup_offensive_fga_deltas": {
            p: matchup_off[p] - b["fga"]
            for p, b in box_map.items()
            if b is not None and p in {off for off, _ in pairs}
        },
        "source_facts_sha256": content_hash(
            {"selected": rows, "cdn": cdn, "shots": shots, "matchups": matchups, "boxes": boxes}
        ),
    }


def aggregate(games: dict[str, dict[str, Any]], cutoff: str) -> dict[str, Any]:
    """Build a semantic result using only selected facts; full source receipts stay outside."""
    selected = {gid: g for gid, g in sorted(games.items()) if g["day"] < cutoff}
    if not selected:
        raise ValueError("no games before cutoff")
    league = Counter[str]()
    league_buckets = {b: Counter[str]() for b in BUCKETS}
    entries: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for g in selected.values():
        for p, r in g["facts"]["players"].items():
            entries[p].append(r)
            if r["box"] is not None:
                league.update(r["box"])
                for bucket in BUCKETS:
                    league_buckets[bucket].update(r["buckets"][bucket])
    league_tsa = league["fga"] + 0.44 * league["fta"]
    league_ts = league["points"] / (2 * league_tsa) if league_tsa else None
    bucket_refs = {}
    for b, c in league_buckets.items():
        tsa = c["fga"] + 0.44 * c["fta"]
        bucket_refs[b] = {
            "tsa": tsa,
            "points": c["points"],
            "ts": c["points"] / (2 * tsa) if tsa else None,
        }
    result = {}
    for p, rows in sorted(entries.items()):
        values: dict[str, Any] = {}
        seconds = sum(r["support"].get("seconds", 0) for r in rows)

        def put(
            key: str,
            sample: list[dict[str, Any]],
            numerator: float,
            denominator: float | None = None,
            scale: float = 1,
            reference: float | None = None,
            relative: bool = False,
            *,
            target: dict[str, Any] = values,
            total_games: int = len(rows),
        ) -> None:
            value = (
                (
                    numerator
                    if denominator is None
                    else scale * numerator / denominator
                    if denominator > 0
                    else None
                )
                if sample
                else None
            )
            if relative:
                value = value - reference if value is not None and reference is not None else None
            target[key] = {
                "value": value,
                "numerator": numerator if sample else None,
                "denominator": denominator if sample else None,
                "covered_games": len(sample),
                "total_games": total_games,
                "qualified": value is not None
                and sum(r["support"].get("seconds", 0) for r in sample) >= 30000
                and (denominator is None or denominator >= 200),
                "reference": reference,
            }

        def summed(sample: list[dict[str, Any]], group: str, field: str) -> float:
            return float(sum(r[group].get(field, 0) for r in sample))

        box_sample = [r for r in rows if r["box"] is not None]
        off = summed(box_sample, "support", "off_controls")
        defense = summed(box_sample, "support", "def_controls")
        for key, field in (("pbp_stl_per100", "steals"), ("pbp_blk_per100", "blocks")):
            put(key, box_sample, summed(box_sample, "box", field), defense, 100)
        put("pbp_foul_frequency", box_sample, summed(box_sample, "box", "pf"), (off + defense) / 2)
        for key, n, d in (
            ("pbp_drb_pct", "drb", "drb_opportunities"),
            ("pbp_block_recovered_pct", "block_recovered", "block_known"),
            ("pbp_self_miss_orb_pct", "self_orb", "self_opportunities"),
            ("pbp_team_miss_orb_pct", "team_orb", "team_opportunities"),
        ):
            put(key, rows, summed(rows, "counts", n), summed(rows, "counts", d))
        matchup_sample = [r for r in rows if r["matchup_fga"] is not None]
        put(
            "matchup_fga_per100",
            matchup_sample,
            sum(r["matchup_fga"] for r in matchup_sample),
            summed(matchup_sample, "support", "def_controls"),
            100,
        )
        points = summed(box_sample, "box", "points")
        fga = summed(box_sample, "box", "fga")
        fta = summed(box_sample, "box", "fta")
        tsa = fga + 0.44 * fta
        put("impact_ts_pct", box_sample, points, tsa, 0.5)
        put("impact_rts", box_sample, points, tsa, 0.5, league_ts, True)
        put(
            "impact_tsadd_per100",
            box_sample if league_ts is not None else [],
            points - 2 * tsa * league_ts if league_ts is not None else 0,
            off,
            100,
            league_ts,
        )
        put("impact_three_point_rate", box_sample, summed(box_sample, "box", "fg3a"), fga)
        put("impact_ftr", box_sample, fta, fga)
        put("impact_ast_per100", box_sample, summed(box_sample, "box", "assists"), off, 100)
        put("pbp_bad_pass_tov", rows, summed(rows, "counts", "bad_pass_tov"))
        rim_sample = [r for r in rows if r["rim_assists_complete"]]
        put("pbp_rim_assists", rim_sample, summed(rim_sample, "counts", "rim_assists"))
        charges = [r for r in rows if r["charges_complete"]]
        put("pbp_charges_drawn", charges, summed(charges, "counts", "charges"))
        forced = [r for r in box_sample if r["charges_complete"]]
        put(
            "pbp_credited_ftov_per100",
            forced,
            summed(forced, "box", "steals") + summed(forced, "counts", "charges"),
            summed(forced, "support", "def_controls"),
            100,
        )
        for bucket in BUCKETS:
            c = Counter[str]()
            for r in box_sample:
                c.update(r["buckets"][bucket])
            b_tsa = c["fga"] + 0.44 * c["fta"]
            put(f"pbp_{bucket}_tsa", box_sample, b_tsa)
            put(f"pbp_{bucket}_frequency", box_sample, b_tsa, tsa)
            put(f"pbp_{bucket}_ts", box_sample, c["points"], b_tsa, 0.5)
            put(
                f"pbp_{bucket}_rts",
                box_sample,
                c["points"],
                b_tsa,
                0.5,
                bucket_refs[bucket]["ts"],
                True,
            )
        if set(values) != set(IMPACT_EXTRAS_CATALOG):
            raise ValueError("catalog and produced columns differ")
        result[p] = {
            "seconds": seconds,
            "games": len(rows),
            "metrics": values,
            "teams": sorted({r["team"] for r in rows}),
        }
    return {
        "version": VERSION,
        "cutoff": cutoff,
        "input": {
            gid: {
                "day": g["day"],
                "quality": g["quality"],
                "game_sha256": g["game_sha256"],
                "facts_sha256": content_hash(g["facts"]),
            }
            for gid, g in selected.items()
        },
        "league": {
            "points": league["points"],
            "tsa": league_tsa,
            "ts": league_ts,
            "buckets": bucket_refs,
        },
        "players": result,
        "catalog": {k: d.to_dict() for k, d in IMPACT_EXTRAS_CATALOG.items()},
        "wave_two": WAVE_TWO,
        "coverage": {gid: g["facts"]["coverage"] for gid, g in selected.items()},
        "join_failures": {gid: g["facts"].get("join_failures", []) for gid, g in selected.items()},
        "matchup_offensive_fga_deltas": {
            gid: g["facts"]["matchup_offensive_fga_deltas"] for gid, g in selected.items()
        },
    }


def aggregate_by_team(games: dict[str, dict[str, Any]], cutoff: str) -> dict[str, Any]:
    """Each player's extras per team: the same aggregation over one team's games at a time.

    Every fact row already names the player's team in that game, so rows are keyed by
    (player, team) and aggregated exactly as the season result is. League references (league
    TS% for rTS) still come from every player's rows, as in the season result.
    """
    keyed = {
        gid: {
            **g,
            "facts": {
                **g["facts"],
                "players": {f"{p}|{r['team']}": r for p, r in g["facts"]["players"].items()},
            },
        }
        for gid, g in games.items()
    }
    body = aggregate(keyed, cutoff)
    players: dict[str, dict[str, Any]] = defaultdict(dict)
    for key, row in body["players"].items():
        player_id, team_id = key.split("|")
        players[player_id][team_id] = row
    return {"cutoff": body["cutoff"], "league": body["league"], "players": dict(players)}
