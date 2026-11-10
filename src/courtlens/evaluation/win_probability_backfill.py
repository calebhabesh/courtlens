"""R15b backfills, none of them prospective.

`replay`: seal hindsight input records for 2026-27 games played before the freeze, so Live can draw
them and the nightly job can be verified on real games. Their availability reads the finished box,
which is why they can never count as prospective.

`wpa`: win probability added for the final-test seasons, from the archived ESPN summaries.
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, date, datetime, timedelta
from typing import Any

from courtlens.domain.live import parse_plays, score_running
from courtlens.domain.teams import TRICODE_TO_TEAM
from courtlens.evaluation.win_probability_data import OUTPUT, read_games
from courtlens.evaluation.win_probability_parity import game_inputs
from courtlens.ingestion.espn_rosters import ESPN_TEAMS
from courtlens.ingestion.espn_win_probability import Client, keep_raw
from courtlens.services.win_probability_pregame import load_box_history
from courtlens.services.win_probability_production import (
    REGULAR_SEASON_TYPE,
    _credit_rows,
    _seal,
    append_credit,
    backfill_replay_inputs,
    event_series,
    get_model,
    load_manifest,
    player_credit,
    read_raw_summary,
    serving_root,
    write_wpa_summary,
)

OPENER = date(2026, 10, 20)
TEST_SEASONS = ("2024-25", "2025-26")


def replay(until: date) -> dict[str, Any]:
    """Records for regular-season games from the opener up to, not including, `until`."""
    manifest = load_manifest()
    client = Client()
    box_games, box_players = load_box_history(range(2025, 2028))
    by_key = {(g["date"], g["home"], g["away"]): g["gid"] for g in box_games if g["year"] == 2027}
    days = 0
    games = 0
    missing = []
    day = OPENER
    while day < until:
        raw, payload = client.get("scoreboard", {"dates": day.strftime("%Y%m%d")})
        keep_raw(raw, "scoreboard", f"replay-{day.isoformat()}")
        wanted = []
        for event in payload.get("events") or []:
            if (event.get("season") or {}).get("type") != REGULAR_SEASON_TYPE:
                continue
            sides = {
                c["homeAway"]: TRICODE_TO_TEAM[ESPN_TEAMS[str(c["team"]["id"])][1]].team_id
                for c in event["competitions"][0]["competitors"]
            }
            gid = by_key.get((day.isoformat(), sides["home"], sides["away"]))
            if gid is None:
                missing.append(str(event["id"]))
                continue
            wanted.append(
                {
                    "espn_id": str(event["id"]),
                    "nba_id": gid,
                    "day": day.isoformat(),
                    "home": sides["home"],
                    "away": sides["away"],
                    "event_time": event["date"],
                }
            )
        if wanted:
            earlier = [g for g in box_games if g["date"] < day.isoformat()]
            body = {
                "schema": "courtlens-win-probability-pregame-v1",
                "day": day.isoformat(),
                "captured_at": datetime.now(UTC).isoformat(timespec="seconds"),
                "manifest_sha256": manifest["manifest_sha256"],
                "note": "Hindsight replay of a game played before the freeze; never prospective.",
                "games": backfill_replay_inputs(wanted, earlier, box_players),
            }
            _seal(serving_root() / "pregame", f"replay-{day.isoformat()}", body)
            days += 1
            games += len(wanted)
        day += timedelta(days=1)
    return {"days": days, "games": games, "missing_box": missing}


def wpa() -> dict[str, Any]:
    model = get_model()
    table = read_games(OUTPUT)["games"]
    pregame = json.loads((OUTPUT / "pregame.json").read_text())["games"]
    result: dict[str, Any] = {}
    for season in TEST_SEASONS:
        target = serving_root() / "wpa" / f"{season}.jsonl"
        if target.exists():
            raise ValueError(f"{target} exists")
        games = 0
        for gid, entry in sorted(table.items()):
            if entry["season"] != season:
                continue
            path = OUTPUT / "espn" / f"{gid}.json"
            if not path.exists():
                continue
            extract = json.loads(path.read_text())
            payload = read_raw_summary(extract["raw_sha256"])
            competitors = payload["header"]["competitions"][0]["competitors"]
            sides = {str(c["team"]["id"]): c["homeAway"] for c in competitors}
            plays = parse_plays(payload.get("plays"), sides)
            if not plays:
                continue
            score_running(plays, {c["homeAway"]: int(c["score"]) for c in competitors})
            record = {"inputs": vars(game_inputs(entry, pregame[gid]))}
            series = event_series(model, plays, record)
            credit = player_credit(series, plays)
            players = _box_names(payload)
            append_credit(season, _credit_rows(gid, entry["date"], credit, players))
            games += 1
        result[season] = games
        write_wpa_summary(season)
    return result


def _box_names(payload: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for section in (payload.get("boxscore") or {}).get("players") or []:
        team = str(section["team"]["id"])
        for group in section.get("statistics") or []:
            for row in group.get("athletes") or []:
                athlete = row.get("athlete") or {}
                out.append(
                    {
                        "source_id": str(athlete.get("id")),
                        "name": athlete.get("displayName"),
                        "team_source_id": team,
                    }
                )
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("replay", "wpa"))
    parser.add_argument("--until", type=date.fromisoformat, default=date(2026, 11, 4))
    args = parser.parse_args()
    result = replay(args.until) if args.command == "replay" else wpa()
    print(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
