"""R15a benchmark acquisition: ESPN's per-play win probability for the final-test seasons.

For every admitted regular-season game of 2024-25 and 2025-26 (the sealed IM03 bundles), read
ESPN's scoreboard for the game date (US Eastern), match the game by home and away team, then
read ESPN's game summary. Raw payloads are kept gzip-compressed under their SHA-256; a compact
extract (plays with period, clock and score, and ESPN's home win probability by play) is what
the evaluation reads. ESPN Analytics' numbers are theirs, shown as a benchmark, never an input.

Source policy v3: free public JSON, 5 seconds between requests, resumable (an existing extract
is never fetched again), stops on the first denial (401/403/429).
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import time
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import httpx

from courtlens.domain.teams import resolve_team_tricode
from courtlens.evaluation.impact_history_fits import bundle_paths
from courtlens.evaluation.impact_rating_inputs import checked
from courtlens.ingestion.espn_rosters import ESPN_TEAMS

VERSION = "courtlens-espn-win-probability-v1"
BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
RAW = Path("data/raw/espn-wp")
OUTPUT = Path("data/derived/win-probability-v1/espn")
TEST_SEASONS = ("2024-25", "2025-26")
PACING_SECONDS = 5.0
ATTEMPTS = 3
CAPS = {"scoreboard": 1024 * 1024, "summary": 4 * 1024 * 1024, "injuries": 2 * 1024 * 1024}
TRICODE = {espn: tricode for espn, (_, tricode) in ESPN_TEAMS.items()}


class Denied(RuntimeError):
    pass


class Client:
    def __init__(self) -> None:
        self.http = httpx.Client(
            timeout=httpx.Timeout(15, connect=5),
            follow_redirects=False,
            headers={"Accept-Encoding": "identity", "User-Agent": "courtlens-research"},
        )
        self.last = 0.0

    def get(self, kind: str, params: dict[str, str]) -> tuple[bytes, dict[str, Any]]:
        for attempt in range(ATTEMPTS):
            wait = self.last + PACING_SECONDS * (attempt + 1) - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self.last = time.monotonic()
            try:
                response = self.http.get(f"{BASE}/{kind}", params=params)
                if response.status_code in {401, 403, 429}:
                    raise Denied(f"{kind} {params}: http {response.status_code}")
                response.raise_for_status()
                break
            except httpx.HTTPError:
                if attempt == ATTEMPTS - 1:
                    raise
        raw = response.content
        if len(raw) > CAPS[kind]:
            raise ValueError(f"{kind} payload too large ({len(raw)} bytes)")
        return raw, json.loads(raw)


def keep_raw(raw: bytes, kind: str, key: str) -> dict[str, Any]:
    digest = hashlib.sha256(raw).hexdigest()
    path = RAW / kind / f"{digest}.json.gz"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(gzip.compress(raw, mtime=0))
        tmp.rename(path)
    receipt = {
        "kind": kind,
        "key": key,
        "sha256": digest,
        "bytes": len(raw),
        "fetched_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    with (RAW / "receipts.jsonl").open("a") as log:
        log.write(json.dumps(receipt, sort_keys=True) + "\n")
    return receipt


def test_games() -> dict[str, dict[str, Any]]:
    """Admitted test-season games: id -> date, home and away tricodes, final score."""
    games = {}
    paths = bundle_paths()
    for season in TEST_SEASONS:
        path, _ = paths[season]
        bundle = checked(path, path.name.removesuffix(".json.gz"))
        for gid, member in bundle["members"].items():
            s = member["schedule"]
            games[gid] = {
                "season": season,
                "date": s["game_date"],
                "home": resolve_team_tricode(s["home_team_id"]),
                "away": resolve_team_tricode(s["away_team_id"]),
                "home_pts": int(s["home_pts"]),
                "away_pts": int(s["away_pts"]),
            }
    return games


def match_events(payload: dict[str, Any]) -> dict[tuple[str | None, str | None], dict[str, Any]]:
    out = {}
    for event in payload.get("events") or []:
        comp = (event.get("competitions") or [{}])[0]
        sides = {
            c.get("homeAway"): (TRICODE.get(str(c.get("team", {}).get("id"))), c.get("score"))
            for c in comp.get("competitors") or []
        }
        if "home" in sides and "away" in sides:
            out[(sides["home"][0], sides["away"][0])] = {
                "event_id": str(event.get("id")),
                "home_score": sides["home"][1],
                "away_score": sides["away"][1],
            }
    return out


def seconds_left(display: str) -> float:
    if ":" in display:
        minutes, seconds = display.split(":")
        return 60 * int(minutes) + float(seconds)
    return float(display)


def extract(
    payload: dict[str, Any], gid: str, event_id: str, meta: dict[str, Any]
) -> dict[str, Any]:
    header = payload["header"]["competitions"][0]
    if str(payload["header"].get("id")) != event_id:
        raise ValueError("summary identity mismatch")
    score = {c["homeAway"]: int(c["score"]) for c in header["competitors"]}
    plays: list[dict[str, Any]] = [
        {
            "id": str(p["id"]),
            "period": int(p["period"]["number"]),
            "seconds_left": seconds_left(p["clock"]["displayValue"]),
            "home": int(p.get("homeScore", 0)),
            "away": int(p.get("awayScore", 0)),
        }
        for p in payload.get("plays") or []
    ]
    probability = {
        str(r["playId"]): float(r["homeWinPercentage"])
        for r in payload.get("winprobability") or []
        if r.get("homeWinPercentage") is not None
    }
    return {
        "version": VERSION,
        "game_id": gid,
        "espn_event_id": event_id,
        "final": score,
        "final_matches_nba": score == {"home": meta["home_pts"], "away": meta["away_pts"]},
        "plays": [{**p, "home_win": probability.get(p["id"])} for p in plays],
        "plays_with_probability": sum(p["id"] in probability for p in plays),
    }


def acquire(limit: int | None = None) -> dict[str, Any]:
    games = test_games()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    pending = {g: m for g, m in games.items() if not (OUTPUT / f"{g}.json").exists()}
    by_date: dict[str, list[str]] = {}
    for gid, meta in sorted(pending.items()):
        by_date.setdefault(meta["date"], []).append(gid)
    client = Client()
    fetched = unmatched = failed = 0
    started = time.monotonic()
    for day, gids in sorted(by_date.items()):
        raw, payload = client.get(
            "scoreboard", {"dates": date.fromisoformat(day).strftime("%Y%m%d")}
        )
        keep_raw(raw, "scoreboard", day)
        events = match_events(payload)
        for gid in gids:
            meta = games[gid]
            event = events.get((meta["home"], meta["away"]))
            if event is None:
                unmatched += 1
                print(json.dumps({"unmatched": gid, "date": day}), flush=True)
                continue
            try:
                raw, summary = client.get("summary", {"event": event["event_id"]})
                receipt = keep_raw(raw, "summary", gid)
                body = {
                    **extract(summary, gid, event["event_id"], meta),
                    "raw_sha256": receipt["sha256"],
                }
            except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
                failed += 1
                print(json.dumps({"failed": gid, "error": repr(exc)[:200]}), flush=True)
                continue
            tmp = OUTPUT / f"{gid}.tmp"
            tmp.write_text(json.dumps(body, separators=(",", ":")))
            tmp.rename(OUTPUT / f"{gid}.json")
            fetched += 1
            if limit is not None and fetched >= limit:
                return {"fetched": fetched, "unmatched": unmatched, "failed": failed}
        print(
            json.dumps(
                {"date": day, "fetched": fetched, "elapsed": round(time.monotonic() - started)}
            ),
            flush=True,
        )
    return {"fetched": fetched, "unmatched": unmatched, "failed": failed, "games": len(games)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    print(json.dumps(acquire(args.limit)), flush=True)


if __name__ == "__main__":
    main()
