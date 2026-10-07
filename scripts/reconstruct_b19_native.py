#!/usr/bin/env python3
"""Acquire immutable raw bundles or replay native reconstruction to a fresh directory.

No DB writes. Missing responses are retained as failed acquisition observations.
Scale with an explicit --games-file only after representative input gates pass.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from courtlens.ingestion.native_reconstruction import VERSION, reconstruct_native_game
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_normalization import normalize_game_id, parse_schedule_file

COMMIT = "000610d46d149ebb45db4f5ae6f80b16d5e2fb6b"
BASE = f"https://raw.githubusercontent.com/sportsdataverse/hoopR-nba-stats-raw/{COMMIT}"
FAMILIES = ("playbyplayv3", "gamerotation", "boxscoretraditionalv3", "boxscoretraditionalv3_period")
SAMPLE = ("0022500025", "0022500007", "0022500013", "0022501045", "0022500003", "0022500016")
METHODS = (
    "python/nba_stats_03_period_boxscores.py",
    "python/nba_stats_raw_scrape/period_capture.py",
)


def write_json(path: Path, value: Any) -> None:
    with path.open("x", encoding="utf-8") as stream:
        stream.write(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def capture(client: httpx.Client, root: Path, url: str) -> dict[str, Any]:
    observation: dict[str, Any] = {"url": url, "started_at": datetime.now(UTC).isoformat()}
    started = time.monotonic()
    try:
        with client.stream("GET", url) as response:
            observation["http_status"] = response.status_code
            observation["http_headers"] = dict(response.headers)
            chunks = bytearray()
            for chunk in response.iter_bytes():
                if time.monotonic() - started > 30:
                    raise ValueError("response exceeds 30 second wall budget")
                if len(chunks) + len(chunk) > 5_000_000:
                    raise ValueError("response exceeds 5 MB raw bundle budget")
                chunks.extend(chunk)
            payload = bytes(chunks)
        digest = hashlib.sha256(payload).hexdigest()
        path = root / f"{digest}.blob"
        if not path.exists():
            with path.open("xb") as stream:
                stream.write(payload)
        observation.update(sha256=digest, bytes=len(payload), path=path.name)
    except (httpx.HTTPError, ValueError) as exc:
        observation["error"] = f"{type(exc).__name__}: {exc}"
    observation["finished_at"] = datetime.now(UTC).isoformat()
    observation["elapsed_seconds"] = round(time.monotonic() - started, 3)
    return observation


def acquire(root: Path, games: list[str]) -> None:
    root.mkdir(parents=True, exist_ok=False)
    observations: list[dict[str, Any]] = []
    with httpx.Client(timeout=15, follow_redirects=True) as client:
        requests = [
            (gid, family, f"nba_stats/json/{family}/2026/{gid}.json")
            for gid in games
            for family in FAMILIES
        ]
        requests += [(None, "method", method) for method in METHODS]
        for gid, family, resource in requests:
            url = f"{BASE}/{resource}"
            observation = {**capture(client, root, url), "game_id": gid, "family": family}
            observations.append(observation)
            print(
                gid or resource,
                family,
                observation.get("http_status", observation.get("error")),
                flush=True,
            )
    write_json(
        root / "manifest.json",
        {
            "commit": COMMIT,
            "games": games,
            "observations": observations,
            "acquisition_script_sha256": hash_file(Path(__file__))[0],
        },
    )


def probe_sources(root: Path) -> None:
    """Retain a complete rotation tree and bounded alternate-input attempts."""
    root.mkdir(parents=True, exist_ok=False)
    observations = []
    api = "https://api.github.com/repos/sportsdataverse/hoopR-nba-stats-raw"
    with httpx.Client(
        timeout=15,
        follow_redirects=True,
        headers={"User-Agent": "CourtLens-native-spike/1.0", "Referer": "https://www.nba.com/"},
    ) as client:
        listing = capture(client, root, f"{api}/contents/nba_stats/json/gamerotation?ref={COMMIT}")
        observations.append(listing)
        if listing.get("http_status") == 200:
            years = json.loads((root / listing["path"]).read_text())
            year = next(y for y in years if y["name"] == "2026")
            observations.append(capture(client, root, f"{api}/git/trees/{year['sha']}"))
        urls = [
            "https://stats.nba.com/stats/gamerotation?GameID=0022500003&LeagueID=00",
            "https://stats.nba.com/stats/boxscoretraditionalv3?GameID=0022500025"
            "&StartPeriod=2&EndPeriod=2&StartRange=7200&EndRange=7210&RangeType=2",
            "https://raw.githubusercontent.com/shufinskiy/nba_data/main/list_data.txt",
            "https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-py/"
            "81eb7e7060de58ec79b6bdf8bbc1a797f9eb537f/sportsdataverse/scrape/stats/periods.py",
            "https://raw.githubusercontent.com/dblackrun/pbpstats/"
            "e7ccf2fb6326da630a3cf1665aac964a1e108f4c/pbpstats/data_loader/stats_nba/pbp/loader.py",
            "https://raw.githubusercontent.com/dblackrun/pbpstats/"
            "e7ccf2fb6326da630a3cf1665aac964a1e108f4c/pbpstats/data_loader/stats_nba/pbp/file.py",
            "https://raw.githubusercontent.com/shufinskiy/nba_data/main/README.md",
        ]
        for url in urls:
            observation = capture(client, root, url)
            observations.append(observation)
            print(url, observation.get("http_status", observation.get("error")), flush=True)
    write_json(
        root / "manifest.json",
        {
            "purpose": "external_reconstruction_input_probe",
            "commit": COMMIT,
            "observations": observations,
            "acquisition_script_sha256": hash_file(Path(__file__))[0],
        },
    )


def replay(root: Path, output: Path, baseline: Path | None = None) -> None:
    manifest = json.loads((root / "manifest.json").read_text())
    # Verify ALL retained artifacts, including unsuccessful responses and methods.
    for observation in manifest["observations"]:
        if "path" in observation:
            digest, size = hash_file(root / observation["path"])
            if digest != observation["sha256"] or size != observation["bytes"]:
                raise ValueError("raw artifact checksum mismatch")
    output.mkdir(parents=True, exist_ok=False)
    baseline_inputs = {}
    schedule = {}
    teams: dict[str, list[dict[str, str]]] = {}
    if baseline is not None:
        import csv

        schedule_path = baseline / "nba_schedule_2026.csv.gz"
        team_path = baseline / "team_boxscores_2026.csv"
        baseline_inputs = {p.name: hash_file(p)[0] for p in (schedule_path, team_path)}
        schedule = parse_schedule_file(schedule_path)
        with team_path.open(newline="") as stream:
            for row in csv.DictReader(stream):
                gid = normalize_game_id(row["game_id"])
                teams.setdefault(gid, []).append(row)
    games = {}
    for gid in manifest["games"]:
        inputs = {o["family"]: o for o in manifest["observations"] if o["game_id"] == gid}
        missing = [f for f in FAMILIES if inputs[f].get("http_status") != 200]
        if missing:
            games[gid] = {"status": "missing_native_inputs", "missing": missing}
            continue
        hashes = {f: inputs[f]["sha256"] for f in FAMILIES}
        docs = [json.loads((root / inputs[f]["path"]).read_text()) for f in FAMILIES]
        try:
            result = reconstruct_native_game(*docs, hashes)
            if baseline is not None:
                b = docs[2]["boxScoreTraditional"]
                if gid not in schedule or schedule[gid]["phase"] != "regular_season":
                    raise ValueError("native game absent from independent regular schedule")
                if len(teams.get(gid, [])) != 2:
                    raise ValueError("independent baseline lacks two team boxes")
                for row in teams[gid]:
                    side = row["side"]
                    if str(b[f"{side}TeamId"]) != row["team_id"] or b[f"{side}Team"]["statistics"][
                        "points"
                    ] != int(row["points"]):
                        raise ValueError("native/retained independent team box disagreement")
            write_json(output / f"{gid}.json", result)
            games[gid] = {
                "status": "reconciled_candidate"
                if result["reconstruction_passed"]
                else "quarantined_candidate",
                "events": len(result["events"]),
                "intervals": len(result["stints"]),
                "errors": result["errors"],
                "content_sha256": result["content_sha256"],
            }
        except (ValueError, KeyError, TypeError) as exc:
            games[gid] = {"status": "unresolved_native_input", "error": str(exc)}
    dependencies = {
        p: hash_file(Path(p))[0]
        for p in (
            "scripts/reconstruct_b19_native.py",
            "src/courtlens/ingestion/native_reconstruction.py",
            "src/courtlens/ingestion/sportsdataverse.py",
            "src/courtlens/ingestion/workbench_normalization.py",
        )
    }
    write_json(
        output / "report.json",
        {
            "version": VERSION,
            "games": games,
            "manifest_sha256": hash_file(root / "manifest.json")[0],
            "dependency_sha256": dependencies,
            "baseline_sha256": baseline_inputs,
            "database_admission": False,
            "complete_season_acceptance": False,
        },
    )
    print(json.dumps({gid: g["status"] for gid, g in games.items()}, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("acquire", "replay", "probe-sources"))
    parser.add_argument("--raw", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--game", action="append")
    parser.add_argument("--games-file", type=Path)
    parser.add_argument("--baseline", type=Path)
    args = parser.parse_args()
    games = args.game or (args.games_file.read_text().splitlines() if args.games_file else SAMPLE)
    if len(set(games)) != len(games) or any(not re.fullmatch(r"00225\d{5}", g) for g in games):
        parser.error("unique ten-digit 2025-26 regular-season NBA game IDs required")
    if args.mode == "probe-sources":
        probe_sources(args.raw)
    elif args.mode == "acquire":
        acquire(args.raw, list(games))
    elif args.output is None:
        parser.error("replay requires --output")
    else:
        replay(args.raw, args.output, args.baseline)


if __name__ == "__main__":
    main()
