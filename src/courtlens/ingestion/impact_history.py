"""R01 impact history: IM01 -> IM02 -> IM03 for regular seasons 2014-15 to 2022-23.

Registered as `courtlens-impact-history-v1` (evaluation/research/registrations/). The sealed
seasons' modules (`impact_archive`, `impact_repair_audit`, `impact_population`, the domain
repair/possession/verification code) are pinned by hash, and their entry points accept only
2023-24 to 2025-26. This module imports their functions unchanged and adds only what older
seasons need:

- archive names and a bounded CSV reader for the older seasons (the IM01 reader rejects them);
- schedule denominators per season (2019-20: 1,059 games including the bubble; 2020-21: 1,080),
  read from the SportsDataverse schedules already retained with the box scores;
- no CDN stream before 2020-21 (the pinned archive index has none): candidates pass
  `cdn_rows=None`, as `ingestion/season_impact.py` does in season;
- v3 substitution names written in an older era are resolved from the game's own rows
  (rule R01-H5, `domain/impact_history_aliases.py`); the v3 input identity names that
  normalization, and every rewrite is kept per game and recorded as an override when sealed;
- a game that fails IM03 event verification is excluded and listed (rule H2) instead of
  being iterated on, and the bundle's summary counts it as excluded.

Bundles carry the fields `impact_population.populate_impact_season` checks, so each season is
sealed as an ordinary `courtlens-impact` dataset through the shared orchestrator.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import itertools
import json
import lzma
import re
import tarfile
import tempfile
import time
import zlib
from collections import Counter, defaultdict
from collections.abc import Iterator
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from courtlens.domain.impact_event_repairs import project_team_actions
from courtlens.domain.impact_history_aliases import VERSION as ALIAS_VERSION
from courtlens.domain.impact_history_aliases import resolve_aliases
from courtlens.domain.impact_possessions import METHOD_VERSION_V2, build_impact_game
from courtlens.domain.impact_public_verification import (
    public_sequence_groups,
    review_public_sequences,
)
from courtlens.domain.impact_verification import GATE_VERSION, verify_event_game
from courtlens.domain.possession_repair import (
    POLICY_VERSION,
    Repair,
    normalize_events,
    order_same_clock,
    reconstruct_repaired_game,
)
from courtlens.domain.research_registry import registration_receipt
from courtlens.ingestion.impact_archive import (
    MAX_COMPRESSED_BYTES,
    MAX_EXPANDED_BYTES,
    MAX_FIELD_BYTES,
    MAX_ROWS,
    NOTICES,
    _LimitedReader,
    retain_asset,
    write_json,
)
from courtlens.ingestion.impact_population import read_json
from courtlens.ingestion.impact_repair_audit import (
    ArchiveGames,
    retain_candidate,
    retained_boxes,
    summarize,
)
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_normalization import canonical_hash, normalize_game_id

VERSION = "courtlens-impact-history-v2"
REGISTRATION = "courtlens-impact-history-v2"
REVISION = "e829d4678be1e075f99e5d41a1c5f97089be446b"
STARTING_YEARS = tuple(range(2014, 2023))
CDN_YEARS = (2020, 2021, 2022)
MATCHUP_YEARS = tuple(range(2017, 2023))
REGULAR_SEASON_GAMES = {2019: 1059, 2020: 1080}
PHASE = "regular_season"
EVENT_GATE_RULE = "R01-H2"
ATTRIBUTION = (
    "NBA Stats and NBA CDN; pbpstats; Sergey Shufinskiy (shufinskiy/nba_data, Apache-2.0); "
    "SportsDataverse NBA Stats schedules and boxes (CC BY 4.0 data, MIT software). "
    "Local noncommercial research; underlying NBA redistribution rights not granted."
)
CODE = (
    "src/courtlens/domain/possession_repair.py",
    "src/courtlens/domain/impact_possessions.py",
    "src/courtlens/domain/impact_event_repairs.py",
    "src/courtlens/domain/impact_verification.py",
    "src/courtlens/domain/impact_public_verification.py",
    "src/courtlens/ingestion/impact_repair_audit.py",
    "src/courtlens/ingestion/impact_population.py",
    "src/courtlens/ingestion/impact_archive.py",
    "src/courtlens/ingestion/native_reconstruction.py",
    "src/courtlens/ingestion/sportsdataverse.py",
    "src/courtlens/ingestion/workbench_normalization.py",
    "src/courtlens/domain/impact_history_aliases.py",
    "src/courtlens/ingestion/impact_history.py",
)


def season_label(year: int) -> str:
    return f"{year}-{str(year + 1)[-2:]}"


def families(year: int) -> tuple[str, ...]:
    return (
        "nbastatsv3",
        *(("cdnnba",) if year in CDN_YEARS else ()),
        *(("matchups",) if year in MATCHUP_YEARS else ()),
        "shotdetail",
        "pbpstats",
    )


def archive_names() -> tuple[str, ...]:
    return tuple(f"{family}_{year}" for year in STARTING_YEARS for family in families(year))


def source_url(name: str) -> str:
    if name not in NOTICES and name not in {f"datasets/{n}.tar.xz" for n in archive_names()}:
        raise ValueError("unsupported impact history asset")
    return f"https://raw.githubusercontent.com/shufinskiy/nba_data/{REVISION}/{name}"


def history_rows(path: Path, name: str) -> Iterator[dict[str, str]]:
    """`impact_archive.archive_rows` for the history archive names (same bounds and checks)."""
    if name not in archive_names():
        raise ValueError("unsupported archive name")
    if not 0 < path.stat().st_size <= MAX_COMPRESSED_BYTES:
        raise ValueError("compressed byte budget exceeded")
    prior = csv.field_size_limit(MAX_FIELD_BYTES)
    try:
        with (
            lzma.LZMAFile(path) as expanded,
            io.BufferedReader(_LimitedReader(expanded, MAX_EXPANDED_BYTES)) as bounded,
            tarfile.open(fileobj=bounded, mode="r|") as archive,
        ):
            members = 0
            for member in archive:
                members += 1
                if (
                    members != 1
                    or member.name != f"{name}.csv"
                    or not member.isfile()
                    or not 0 < member.size < MAX_EXPANDED_BYTES
                ):
                    raise ValueError("expected exactly one regular CSV member")
                extracted = archive.extractfile(member)
                if extracted is None:
                    raise ValueError("unreadable archive member")
                with (
                    io.BufferedReader(_LimitedReader(extracted, MAX_EXPANDED_BYTES)) as stream,
                    io.TextIOWrapper(stream, encoding="utf-8-sig", newline="") as text,
                ):
                    reader = csv.DictReader(text, strict=True)
                    headers = reader.fieldnames or []
                    if not headers or len(headers) != len(set(headers)) or len(headers) > 150:
                        raise ValueError("invalid CSV header")
                    rows = 0
                    for rows, row in enumerate(reader, start=1):
                        if rows > MAX_ROWS or None in row or any(v is None for v in row.values()):
                            raise ValueError("row budget exceeded or malformed CSV record")
                        yield row
                    if not rows:
                        raise ValueError("empty archive CSV")
            if members != 1:
                raise ValueError("missing archive CSV")
            while bounded.read(64 * 1024):
                pass
    finally:
        csv.field_size_limit(prior)


class HistoryGames(ArchiveGames):
    """`ArchiveGames` spooling (bounded per-game memory) over the history archive reader."""

    def load(self, source: str, path: Path, name: str) -> None:
        located = (
            {**row, "_row_index": str(index)} for index, row in enumerate(history_rows(path, name))
        )
        for gid, group in itertools.groupby(
            located, key=lambda row: normalize_game_id(row["gameId"])
        ):
            batch = list(group)
            old = self.get(source, gid)
            packed = zlib.compress(json.dumps([*old, *batch], separators=(",", ":")).encode())
            self.connection.execute(
                "INSERT OR REPLACE INTO games VALUES (?, ?, ?)", (source, gid, packed)
            )
        self.connection.commit()


def schedule_receipt(raw_root: Path, year: int) -> tuple[Path, str]:
    """The SportsDataverse schedule retained with the season's boxes, bound to its receipt."""
    manifest_path = raw_root / f"sportsdataverse_{year + 1}" / "retrieval-manifest.json"
    asset = json.loads(manifest_path.read_text())["files"]["schedule"]
    path = manifest_path.parent / Path(asset["path"]).name
    if hash_file(path) != (asset["sha256"], asset["bytes"]):
        raise ValueError("retained schedule bytes do not match receipt")
    return path, asset["sha256"]


def schedule_membership(path: Path, year: int) -> dict[str, Any]:
    """Regular-season membership with the season's own denominator (rule H1)."""
    required = (
        "game_id",
        "season",
        "season_type",
        "game_date",
        "home_team_id",
        "away_team_id",
        "home_pts",
        "away_pts",
        "home_wl",
        "away_wl",
    )
    games: dict[str, dict[str, str]] = {}
    team_games: Counter[str] = Counter()
    with gzip.open(path, "rt", encoding="utf-8-sig", newline="") as text:
        reader = csv.DictReader(text, strict=True)
        if not set(required).issubset(reader.fieldnames or []):
            raise ValueError("invalid schedule header")
        for index, row in enumerate(reader, start=1):
            if index > 2000 or None in row or any(v is None for v in row.values()):
                raise ValueError("schedule row budget exceeded or malformed record")
            if row["season_type"] != "regular-season":
                continue
            gid = normalize_game_id(row["game_id"])
            home, away = row["home_team_id"], row["away_team_id"]
            game_date = date.fromisoformat(row["game_date"])
            if (
                not gid.startswith("002" + str(year)[-2:])
                or row["season"] != str(year + 1)
                or not date(year, 7, 1) <= game_date < date(year + 1, 11, 1)
                or home == away
                or gid in games
            ):
                raise ValueError("invalid/duplicate schedule identity, team or date")
            if not (row["home_pts"].isdigit() and row["away_pts"].isdigit()):
                raise ValueError("unknown schedule outcome")
            home_pts, away_pts = int(row["home_pts"]), int(row["away_pts"])
            if home_pts == away_pts or (row["home_wl"], row["away_wl"]) != (
                ("W", "L") if home_pts > away_pts else ("L", "W")
            ):
                raise ValueError("nonfinal/nonreciprocal schedule outcome")
            games[gid] = {key: row[key] for key in sorted(required)}
            team_games.update((home, away))
    expected = REGULAR_SEASON_GAMES.get(year, 1230)
    if len(games) != expected or len(team_games) != 30:
        raise ValueError(f"{season_label(year)}: schedule denominator {len(games)} != {expected}")
    return {
        "games": games,
        "team_games": dict(sorted(team_games.items())),
        "membership_sha256": canonical_hash(games),
    }


def coverage(path: Path, name: str, schedule: dict[str, Any]) -> dict[str, Any]:
    family, year = name.rsplit("_", 1)
    id_column = {"matchups": "game_id", "shotdetail": "GAME_ID", "pbpstats": "GAMEID"}.get(
        family, "gameId"
    )
    counts: Counter[str] = Counter()
    for row in history_rows(path, name):
        counts[normalize_game_id(row[id_column])] += 1
    expected = set(schedule["games"])
    observed = {gid for gid in counts if gid.startswith("002")}
    return {
        "family": family,
        "season": season_label(int(year)),
        "expected_games": len(expected),
        "matched_games": len(expected & observed),
        "missing_game_ids": sorted(expected - observed),
        "unexpected_game_ids": sorted(observed - expected),
        "rows": sum(counts.values()),
    }


def acquire(root: Path, raw_root: Path) -> Path:
    """Download every history archive at the pinned revision and record one observation."""
    assets = [retain_asset(root, name, source_url(name)) for name in NOTICES]
    index = (root / assets[-1]["object"]).read_text()
    available = {line.split("=", 1)[0] for line in index.splitlines() if "=" in line}
    if not set(archive_names()).issubset(available):
        raise ValueError("pinned archive index lacks requested history archives")
    schedules = {}
    for year in STARTING_YEARS:
        path, digest = schedule_receipt(raw_root, year)
        schedules[year] = {"sha256": digest, **schedule_membership(path, year)}
    reports = []
    for name in archive_names():
        asset = retain_asset(root, f"datasets/{name}.tar.xz", source_url(f"datasets/{name}.tar.xz"))
        assets.append(asset)
        report = coverage(root / asset["object"], name, schedules[int(name.rsplit("_", 1)[1])])
        report["source_sha256"] = asset["sha256"]
        reports.append(report)
        print(f"{name}: {report['matched_games']}/{report['expected_games']} games", flush=True)
    content = {
        "version": VERSION,
        "revision": REVISION,
        "assets": [{k: a[k] for k in ("name", "url", "sha256", "bytes")} for a in assets],
        "schedules": {
            str(y): {k: v for k, v in s.items() if k != "games"} for y, s in schedules.items()
        },
        "coverage": reports,
    }
    observation_id = str(uuid4())
    manifest = {
        **content,
        "assets": assets,
        "observation_id": observation_id,
        "completed_at": datetime.now(UTC).isoformat(),
        "content_sha256": canonical_hash(content),
        "attribution": ATTRIBUTION,
        "unavailable": [f"cdnnba_{y}" for y in STARTING_YEARS if y not in CDN_YEARS]
        + [f"matchups_{y}" for y in STARTING_YEARS if y not in MATCHUP_YEARS],
    }
    path = root / "history-observations" / f"{observation_id}.json"
    write_json(path, manifest)
    return path


def verify_observation(root: Path, raw_root: Path, path: Path) -> dict[str, Any]:
    """Offline rehash of every asset and rescan of coverage against the recorded content."""
    manifest = json.loads(path.read_text())
    if manifest["version"] != VERSION or manifest["revision"] != REVISION:
        raise ValueError("unknown history observation")
    expected = {name: source_url(name) for name in NOTICES}
    expected.update(
        {f"datasets/{n}.tar.xz": source_url(f"datasets/{n}.tar.xz") for n in archive_names()}
    )
    by_name = {a["name"]: a for a in manifest["assets"]}
    if set(by_name) != set(expected) or len(by_name) != len(manifest["assets"]):
        raise ValueError("missing/duplicate/unexpected observation assets")
    for name, asset in by_name.items():
        if not re.fullmatch(r"[0-9a-f]{64}", asset["sha256"]) or asset["url"] != expected[name]:
            raise ValueError("invalid asset digest or URL")
        if hash_file(root / asset["object"]) != (asset["sha256"], asset["bytes"]):
            raise ValueError(f"observation bytes/hash mismatch: {name}")
    schedules = {}
    for year in STARTING_YEARS:
        schedule_path, digest = schedule_receipt(raw_root, year)
        schedules[year] = {"sha256": digest, **schedule_membership(schedule_path, year)}
    reports = []
    for name in archive_names():
        asset = by_name[f"datasets/{name}.tar.xz"]
        report = coverage(root / asset["object"], name, schedules[int(name.rsplit("_", 1)[1])])
        report["source_sha256"] = asset["sha256"]
        reports.append(report)
    content = {
        "version": VERSION,
        "revision": REVISION,
        "assets": [
            {k: a[k] for k in ("name", "url", "sha256", "bytes")} for a in manifest["assets"]
        ],
        "schedules": {
            str(y): {k: v for k, v in s.items() if k != "games"} for y, s in schedules.items()
        },
        "coverage": reports,
    }
    if canonical_hash(content) != manifest["content_sha256"]:
        raise ValueError("reproduced coverage/content differs from observation")
    return {"content_sha256": manifest["content_sha256"], "verified_assets": len(by_name)}


def _assets(observation: Path) -> dict[str, dict[str, Any]]:
    return {a["name"]: a for a in json.loads(observation.read_text())["assets"]}


def _load_store(
    store: HistoryGames, root: Path, assets: dict[str, dict[str, Any]], year: int
) -> dict[str, str]:
    hashes = {}
    for source, family in (("v3", "nbastatsv3"), ("cdn", "cdnnba")):
        if family not in families(year):
            continue
        asset = assets[f"datasets/{family}_{year}.tar.xz"]
        hashes[source] = asset["sha256"]
        store.load(source, root / asset["object"], f"{family}_{year}")
    # v3 rows are read through rule R01-H5, so candidates name that input, not raw archive rows.
    hashes["v3_archive"] = hashes["v3"]
    hashes["v3"] = content_hash({"archive_sha256": hashes["v3"], "normalization": ALIAS_VERSION})
    return hashes


def v3_rows(
    store: HistoryGames, gid: str, boxes: list[dict[str, str]]
) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    """The game's v3 rows after rule R01-H5, with the rewrites it made."""
    return resolve_aliases(store.get("v3", gid), boxes)


def history_candidates(
    *,
    observation: Path,
    raw_root: Path,
    candidate_root: Path,
    output: Path,
    years: tuple[int, ...] = STARTING_YEARS,
    pilot_games: int | None = None,
) -> dict[str, Any]:
    """IM02 candidates for every scheduled regular-season game (or an even pilot sample)."""
    started = time.monotonic()
    root = raw_root / "impact-archive"
    assets = _assets(observation)
    report: dict[str, Any] = {
        "version": VERSION,
        "policy_version": POLICY_VERSION,
        "registration": registration_receipt(REGISTRATION),
        "archive_observation_sha256": hash_file(observation)[0],
        "archive_content_sha256": json.loads(observation.read_text())["content_sha256"],
        "policy_sha256": hash_file(Path("docs/design/possession-policy-v2.md"))[0],
        "code_sha256": {p: hash_file(Path(p))[0] for p in CODE},
        "pilot_games": pilot_games,
        "seasons": {},
        "database_admission": False,
    }
    for year in years:
        schedule_path, schedule_sha = schedule_receipt(raw_root, year)
        schedule = schedule_membership(schedule_path, year)
        players, teams, box_receipts = retained_boxes(raw_root, year + 1)
        scheduled_games = sorted(schedule["games"].items())
        if pilot_games is not None:
            step = max(1, len(scheduled_games) // pilot_games)
            scheduled_games = scheduled_games[::step][:pilot_games]
        key = f"{season_label(year)}:{PHASE}"
        season_started = time.monotonic()
        with tempfile.TemporaryDirectory(prefix="courtlens-r01-im02-") as temporary:
            store = HistoryGames(Path(temporary) / "games.sqlite")
            try:
                hashes = {
                    "schedule": schedule_sha,
                    "player_box": box_receipts["player_box"],
                    "team_box": box_receipts["team_box"],
                    **_load_store(store, root, assets, year),
                }
                games: dict[str, dict[str, Any]] = {}
                for index, (gid, scheduled) in enumerate(scheduled_games):
                    points = {
                        scheduled["home_team_id"]: int(scheduled["home_pts"]),
                        scheduled["away_team_id"]: int(scheduled["away_pts"]),
                    }
                    rows, aliases = v3_rows(store, gid, players.get(gid, []))
                    result = reconstruct_repaired_game(
                        game_id=gid,
                        v3_rows=rows,
                        cdn_rows=store.get("cdn", gid) or None,
                        boxes=players.get(gid, []),
                        team_points=points,
                        input_hashes=hashes,
                    )
                    team_rows = teams.get(gid, [])
                    observed = {b["team_id"]: int(b["points"]) for b in team_rows}
                    if len(team_rows) != 2 or observed != points:
                        # The sealed audit's IM02-R7 check: boxes and schedule must agree.
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
                    games[gid]["name_aliases"] = aliases
                    if (index + 1) % 200 == 0:
                        print(key, index + 1, dict(Counter(g["quality"] for g in games.values())))
            finally:
                store.close()
        report["seasons"][key] = {
            "schedule_membership_sha256": canonical_hash(
                {gid: schedule["games"][gid] for gid in games}
            ),
            "box_receipts": box_receipts,
            "input_sha256": hashes,
            "summary": summarize(games),
            "name_alias_summary": alias_summary(games),
            "games": games,
        }
        quality = report["seasons"][key]["summary"]["quality_counts"]
        print(key, json.dumps(quality), round(time.monotonic() - season_started, 1), flush=True)
    report["content_sha256"] = content_hash(report)
    report["elapsed_seconds"] = round(time.monotonic() - started, 3)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as stream:
        stream.write(
            gzip.compress((json.dumps(report, sort_keys=True, indent=2) + "\n").encode(), mtime=0)
        )
    return report


def alias_summary(games: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Rule R01-H5 counts: games touched, rewrites by side, and quality of touched games."""
    touched = {gid: g for gid, g in games.items() if g["name_aliases"]}
    return {
        "games_with_rewrites": len(touched),
        "rewrites": sum(len(g["name_aliases"]) for g in touched.values()),
        "by_side": dict(Counter(a["side"] for g in touched.values() for a in g["name_aliases"])),
        "touched_quality": dict(Counter(g["quality"] for g in touched.values())),
    }


def verified_report(path: Path) -> dict[str, Any]:
    report = read_json(path)
    if (
        report.get("version") != VERSION
        or content_hash(
            {k: v for k, v in report.items() if k not in {"content_sha256", "elapsed_seconds"}}
        )
        != report["content_sha256"]
    ):
        raise ValueError("history IM02 report hash mismatch")
    if report["pilot_games"] is not None:
        raise ValueError("a pilot report cannot admit a population")
    for name, digest in report["code_sha256"].items():
        if name != "src/courtlens/ingestion/impact_history.py" and hash_file(Path(name))[0] != (
            digest
        ):  # this module may gain later stages; the repair code and rule R01-H5 may not change
            raise ValueError(f"accepted IM02 method changed: {name}")
    if hash_file(Path("docs/design/possession-policy-v2.md"))[0] != report["policy_sha256"]:
        raise ValueError("accepted IM02 policy changed")
    return report


def public_groups(path: Path, name: str) -> tuple[dict[str, dict[str, int]], dict[Any, Any]]:
    """`impact_population.public_possession_groups` and the event-gate sequences, one pass."""
    groups: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for row in history_rows(path, name):
        group = content_hash(
            {key: row[key] for key in ("PERIOD", "STARTTIME", "ENDTIME", "EVENTS")}
        )
        groups[normalize_game_id(row["GAMEID"])][row["OPPONENT"]].add(group)
    counts = {
        gid: {opponent: len(values) for opponent, values in sides.items()}
        for gid, sides in groups.items()
    }
    return counts, public_sequence_groups(history_rows(path, name))


def prepare_bundles(
    *,
    report_path: Path,
    observation: Path,
    raw_root: Path,
    output_root: Path,
    years: tuple[int, ...] = STARTING_YEARS,
) -> list[Path]:
    """IM03 event-gate bundles, one per season, as `impact_population.prepare_population`."""
    accepted = verified_report(report_path)
    if hash_file(observation)[0] != accepted["archive_observation_sha256"]:
        raise ValueError("archive observation differs from accepted report")
    root = raw_root / "impact-archive"
    assets = _assets(observation)
    observed_at = json.loads(observation.read_text())["completed_at"]
    paths = []
    for key, cohort in sorted(accepted["seasons"].items()):
        started = time.monotonic()
        season = key.split(":")[0]
        year = int(season[:4])
        if year not in years:
            continue
        players, boxes, box_receipts = retained_boxes(raw_root, year + 1)
        if box_receipts != cohort["box_receipts"]:
            raise ValueError("boxes differ from accepted report")
        public_asset = assets[f"datasets/pbpstats_{year}.tar.xz"]
        possession_groups, sequences = public_groups(
            root / public_asset["object"], f"pbpstats_{year}"
        )
        games = {gid: dict(admission) for gid, admission in cohort["games"].items()}
        members: dict[str, Any] = {}
        failed: dict[str, Any] = {}
        deltas: list[float] = []
        public_deltas: list[int] = []
        public_unavailable: list[str] = []
        counts: Counter[str] = Counter()
        schedule_path, _ = schedule_receipt(raw_root, year)
        schedule = schedule_membership(schedule_path, year)
        with tempfile.TemporaryDirectory(prefix="courtlens-r01-im03-") as temporary:
            store = HistoryGames(Path(temporary) / "events.sqlite")
            try:
                if _load_store(store, root, assets, year) != {
                    k: v
                    for k, v in cohort["input_sha256"].items()
                    if k in ("v3", "v3_archive", "cdn")
                }:
                    raise ValueError("archive asset differs from accepted report")
                for gid, admission in sorted(cohort["games"].items()):
                    if admission["quality"] == "excluded":
                        continue
                    candidate = read_json(Path(admission["candidate_path"]))
                    source = candidate["arbitration"]["selected"]
                    aliases: list[dict[str, Any]] = []
                    if source == "v3":
                        rows, aliases = v3_rows(store, gid, players[gid])
                        if aliases != admission["name_aliases"]:
                            raise ValueError("rule R01-H5 rewrites differ from accepted IM02")
                    else:
                        rows = store.get(source, gid)
                    events, _ = order_same_clock(
                        normalize_events(
                            rows,
                            source=source,
                            source_sha256=cohort["input_sha256"][source],
                            boxes=players[gid],
                        ),
                        gid,
                    )
                    scheduled = schedule["games"][gid]
                    teams = (scheduled["home_team_id"], scheduled["away_team_id"])
                    other_rows: list[dict[str, str]] = []
                    if any(
                        e.kind in {"shot", "free_throw", "turnover", "rebound"}
                        and e.team_id not in teams
                        for e in events
                    ):
                        other_rows = (
                            store.get("cdn", gid)
                            if source == "v3"
                            else v3_rows(store, gid, players[gid])[0]
                        )
                    events, raw_rows, method_repairs = project_team_actions(
                        events=events,
                        rows=rows,
                        other_rows=other_rows,
                        input_sha256=cohort["input_sha256"],
                        teams=teams,
                    )
                    try:
                        result = build_impact_game(
                            candidate=candidate,
                            events=events,
                            raw_rows=raw_rows,
                            home_team=teams[0],
                            away_team=teams[1],
                            team_boxes=boxes[gid],
                            method_version=METHOD_VERSION_V2,
                        )
                    except ValueError as error:
                        failed[gid] = {"errors": [f"possession build: {error}"]}
                        continue
                    if method_repairs:
                        result["method_repairs"] = method_repairs
                        result["content_sha256"] = content_hash(
                            {k: v for k, v in result.items() if k != "content_sha256"}
                        )
                    comparison: dict[str, Any] = {"status": "unavailable"}
                    observed = {
                        b["team_id"]: possession_groups.get(gid, {}).get(
                            next(
                                o["team_tricode"]
                                for o in boxes[gid]
                                if o["team_id"] != b["team_id"]
                            )
                        )
                        for b in boxes[gid]
                    }
                    if gid in possession_groups and all(v is not None for v in observed.values()):
                        comparison = {
                            "status": "compared",
                            "source_sha256": public_asset["sha256"],
                            "public_unique_groups": observed,
                            "deltas": {
                                team: result["conservation"][team]["possessions"] - value
                                for team, value in observed.items()
                                if value is not None
                            },
                        }
                    check = verify_event_game(
                        candidate=candidate,
                        events=events,
                        raw_rows=raw_rows,
                        game=result,
                        team_boxes=boxes[gid],
                    )
                    public_reviews: dict[str, Any] = {}
                    public_passed = True
                    if comparison["status"] == "compared":
                        for box in boxes[gid]:
                            team = box["team_id"]
                            opponent = next(
                                b["team_tricode"] for b in boxes[gid] if b["team_id"] != team
                            )
                            groups = sequences[(gid, opponent)]
                            review = review_public_sequences(result, rows, groups, team)
                            if review["delta"] != comparison["deltas"][team]:
                                raise ValueError("public sequence count differs from cross-check")
                            public_reviews[team] = {
                                "source_sha256": comparison["source_sha256"],
                                "opponent": opponent,
                                "groups": groups,
                                "result": review,
                            }
                            public_passed &= bool(review["passed"])
                    if not check["passed"] or not public_passed:
                        failed[gid] = {
                            "errors": check["errors"][:20],
                            "public_passed": public_passed,
                        }
                        continue
                    target = (
                        output_root
                        / "games"
                        / result["content_sha256"][:2]
                        / f"{result['content_sha256']}.json.gz"
                    )
                    retain_candidate(target, result)
                    proof = {
                        "result": check,
                        "source": source,
                        "source_sha256": cohort["input_sha256"][source],
                        "rows": rows,
                        "player_boxes": players[gid],
                        "team_boxes": boxes[gid],
                        "box_receipts": box_receipts,
                        "other_rows": other_rows,
                        "method_repairs": method_repairs,
                        "public_reviews": public_reviews,
                    }
                    proof["content_sha256"] = content_hash(proof)
                    proof_path = (
                        output_root
                        / "event-verification"
                        / proof["content_sha256"][:2]
                        / f"{proof['content_sha256']}.json.gz"
                    )
                    retain_candidate(proof_path, proof)
                    if comparison["status"] == "compared":
                        public_deltas.extend(comparison["deltas"].values())
                    else:
                        public_unavailable.append(gid)
                    members[gid] = {
                        "content_sha256": result["content_sha256"],
                        "path": str(target),
                        "candidate_sha256": admission["content_sha256"],
                        "candidate_path": admission["candidate_path"],
                        "schedule": scheduled,
                        "name_aliases": aliases,
                        "public_possession_crosscheck": comparison,
                        "event_verification": {
                            "path": str(proof_path),
                            "content_sha256": proof["content_sha256"],
                        },
                    }
                    deltas.extend(v["delta"] for v in result["conservation"].values())
                    counts["stints"] += len(result["stints"])
                    counts["possessions"] += len(result["possessions"])
            finally:
                store.close()
        for gid in failed:
            reason = f"{EVENT_GATE_RULE}: IM03 event verification failed"
            games[gid]["quality"] = "excluded"
            games[gid]["errors"] = sorted({*games[gid]["errors"], reason})
        bundle = {
            "version": VERSION,
            "method_version": METHOD_VERSION_V2,
            "gate_version": GATE_VERSION,
            "accepted_im02_sha256": accepted["content_sha256"],
            "archive_observed_at": observed_at,
            "registration": accepted["registration"],
            "season": season,
            "phase": PHASE,
            "code_sha256": {p: hash_file(Path(p))[0] for p in CODE},
            "method_contract_sha256": hash_file(Path("docs/design/impact-possession-method-v2.md"))[
                0
            ],
            "gate_contract_sha256": hash_file(Path("docs/design/impact-event-verification-v1.md"))[
                0
            ],
            "members": members,
            "membership_sha256": content_hash(
                {gid: v["content_sha256"] for gid, v in members.items()}
            ),
            # Admission summary: IM02 exclusions plus rule H2 event-gate exclusions.
            "im02_summary": summarize(games),
            "im02_summary_before_event_gate": cohort["summary"],
            "name_alias_summary": cohort["name_alias_summary"],
            "failed_event_checks": failed,
            "public_possession_crosscheck": {
                "grouping": ["PERIOD", "STARTTIME", "ENDTIME", "EVENTS"],
                "source_sha256": public_asset["sha256"],
                "comparisons": len(public_deltas),
                "exact": sum(v == 0 for v in public_deltas),
                "within_two": sum(abs(v) <= 2 for v in public_deltas),
                "max_absolute_delta": max((abs(v) for v in public_deltas), default=None),
                "unavailable_games": public_unavailable,
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
        }
        bundle["content_sha256"] = content_hash(bundle)
        target = output_root / "bundles" / f"{bundle['content_sha256']}.json.gz"
        retain_candidate(target, bundle)
        paths.append(target)
        print(
            season,
            dict(counts),
            "members",
            len(members),
            "event-gate exclusions",
            len(failed),
            "seconds",
            round(time.monotonic() - started, 1),
            flush=True,
        )
    return paths


def populate(paths: list[Path]) -> list[dict[str, Any]]:
    """Seal each bundle as an ordinary `courtlens-impact` dataset (append-only, permanent)."""
    from courtlens.database import SessionLocal
    from courtlens.models import new_uuid
    from courtlens.services.possession_warehouse import (
        build_possession_warehouse_for_season,
        record_reconstruction_override,
    )

    results = []
    for path in paths:
        bundle = read_json(path)
        with SessionLocal.begin() as session:
            result = build_possession_warehouse_for_season(
                session, dataset_id=new_uuid(), season=bundle["season"], impact_bundle=path
            )
            if not result["reused"]:
                # Rule R01-H5 rewrites sit outside the pinned v2 envelopes; record each one.
                for gid, member in sorted(bundle["members"].items()):
                    for alias in member["name_aliases"]:
                        record_reconstruction_override(
                            session,
                            dataset_id=result["dataset_id"],
                            game_id=gid,
                            override_type="r01_history_name_alias",
                            reason="older-era substitution name resolved from the game's rows",
                            author="courtlens-impact-history",
                            override_value=alias,
                            original_value={"text": alias["original_text"]},
                            period=alias["period"],
                            action_number=alias["action_number"],
                            team_id=alias["team_id"],
                            player_id=alias["player_id"],
                            commit=False,
                            flush=False,
                        )
        print(json.dumps(result), flush=True)
        results.append(result)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("acquire", "verify", "candidates", "bundles", "populate"):
        command = sub.add_parser(name)
        command.add_argument("--raw-root", type=Path, default=Path("data/raw"))
        command.add_argument(
            "--output-root", type=Path, default=Path("data/derived/impact-history-v2")
        )
        command.add_argument("--observation", type=Path)
        command.add_argument("--report", type=Path)
        command.add_argument("--output", type=Path)
        command.add_argument("--year", type=int, action="append", choices=STARTING_YEARS)
        command.add_argument("--pilot-games", type=int)
        command.add_argument("--bundle", type=Path, action="append")
    args = parser.parse_args()
    root = args.raw_root / "impact-archive"
    if args.command == "acquire":
        print(acquire(root, args.raw_root))
    elif args.command == "verify":
        print(json.dumps(verify_observation(root, args.raw_root, args.observation)))
    elif args.command == "candidates":
        report = history_candidates(
            observation=args.observation,
            raw_root=args.raw_root,
            candidate_root=args.output_root / "candidates",
            output=args.output,
            years=tuple(args.year or STARTING_YEARS),
            pilot_games=args.pilot_games,
        )
        print(
            json.dumps(
                {"content_sha256": report["content_sha256"], "seconds": report["elapsed_seconds"]}
            )
        )
    elif args.command == "bundles":
        paths = prepare_bundles(
            report_path=args.report,
            observation=args.observation,
            raw_root=args.raw_root,
            output_root=args.output_root,
            years=tuple(args.year or STARTING_YEARS),
        )
        print(json.dumps({"bundles": [str(p) for p in paths]}))
    else:
        populate(args.bundle)


if __name__ == "__main__":
    main()
