"""Seal the retained Basketball-Reference history crawl into hashed, append-only files (FH02/FH03).

Offline: reads the newest successful receipt per page (services/bbref_history.py) and writes

* ``gamelogs-<parser>-<sha>.jsonl.gz``: schedules, team games and player games for the 1983-84
  to 1999-00 seasons, assembled from player game logs, plus their identities;
* ``seasons-<parser>-<sha>.jsonl.gz``: player and team season rows for every league season
  (totals, advanced) from 1946-47;
* a manifest beside each with coverage and the reconciliation report.

Content is deterministic (sorted, no timestamps), so the file hash names the content. The
workbench import (services/workbench_ingestion.py) folds the newest sealed files into every
dataset it seals, so the daily refresh keeps the history.

Players are matched to NBA person IDs through retained Basketball-Reference profiles
(``bbref_player_profiles``); an unmatched player keeps a namespaced ``bbref:<id>`` identity and is
never guessed. Game IDs follow the NBA's shape (``002`` regular season, ``004`` playoffs, two-digit
start year, five-digit sequence in date order) so every reader that parses a phase from an ID
keeps working; they are CourtLens IDs, not NBA.com's, and the source's box-score key is kept on
each schedule row. A team's game row sums its players' rows: the logs carry no team-only
rebounds or turnovers, recorded as ``stats_basis: player_sum``. Mismatches against the result
line or the season totals pages are recorded, never repaired.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
from collections import Counter, defaultdict
from collections.abc import Iterable, Iterator
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.ingestion.bbref_history import season_label
from courtlens.ingestion.bbref_seasons import (
    BOX_FIELDS,
    PARSER_VERSION,
    parse_advanced,
    parse_gamelog,
    parse_team_totals,
    parse_totals,
    team_code,
)
from courtlens.reference_models import BbrefPlayerProfile
from courtlens.services.bbref_history import RESOURCE
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchArtifact

SEALED_DIR = "bbref_history_sealed"
GAMELOG_PREFIX = "gamelogs"
SEASONS_PREFIX = "seasons"
_GAMELOG_URL = re.compile(r"/players/[a-z]/([a-z.'-]{1,9}\d{2})/gamelog/(\d{4})$")
_LEAGUE_URL = re.compile(
    r"/leagues/(?:NBA|BAA)_(\d{4})(|_totals|_per_game|_advanced|_per_poss)\.html$"
)
STAT_NAMES = tuple(BOX_FIELDS.values())


@dataclass(frozen=True)
class RetainedPage:
    url: str
    path: Path


def retained_pages(session: Session, root: Path) -> list[RetainedPage]:
    """The newest successfully retained body of every history page."""
    rows = session.execute(
        select(WorkbenchAcquisition.source_url, WorkbenchArtifact.storage_path)
        .join(WorkbenchArtifact, WorkbenchArtifact.id == WorkbenchAcquisition.artifact_id)
        .where(
            WorkbenchAcquisition.resource == RESOURCE,
            WorkbenchAcquisition.status == "success",
        )
        .order_by(WorkbenchAcquisition.source_url, WorkbenchAcquisition.finished_at.desc())
    ).all()
    seen: dict[str, RetainedPage] = {}
    for url, storage_path in rows:
        seen.setdefault(url, RetainedPage(url, root / storage_path))
    return sorted(seen.values(), key=lambda page: page.url)


def player_crosswalk(session: Session) -> dict[str, str]:
    """Basketball-Reference ID -> NBA person ID, from the newest profile of each match."""
    mapping: dict[str, str] = {}
    for bbref_id, player_id in session.execute(
        select(BbrefPlayerProfile.bbref_id, BbrefPlayerProfile.player_id).order_by(
            BbrefPlayerProfile.observed_at
        )
    ):
        mapping[str(bbref_id)] = str(player_id)
    return mapping


def player_key(bbref_id: str, crosswalk: dict[str, str]) -> str:
    return crosswalk.get(bbref_id) or f"bbref:{bbref_id}"


def _parse_gamelog_page(page: tuple[str, str]) -> list[dict[str, Any]]:
    url, path = page
    match = _GAMELOG_URL.search(url)
    if match is None:
        raise ValueError(f"not a game-log page: {url}")
    return parse_gamelog(Path(path).read_bytes(), match.group(1), int(match.group(2)))


def _parse_league_page(page: tuple[str, str]) -> tuple[int, str, Any]:
    url, path = page
    match = _LEAGUE_URL.search(url)
    if match is None:
        raise ValueError(f"not a league page: {url}")
    end_year, suffix = int(match.group(1)), match.group(2)
    raw = Path(path).read_bytes()
    if suffix == "_totals":
        return end_year, "totals", parse_totals(raw)
    if suffix == "_advanced":
        return end_year, "advanced", parse_advanced(raw)
    if suffix == "":
        return end_year, "teams", parse_team_totals(raw)
    return end_year, "skip", None


def _parallel(fn: Any, pages: list[RetainedPage], workers: int) -> Iterator[Any]:
    args = [(page.url, str(page.path)) for page in pages]
    if workers <= 1:
        yield from map(fn, args)
        return
    with ProcessPoolExecutor(max_workers=workers) as pool:
        yield from pool.map(fn, args, chunksize=32)


def _phase_prefix(phase: str) -> str:
    return "004" if phase == "playoffs" else "002"


def _game_ids(keys: Iterable[tuple[int, str, str, str]]) -> dict[tuple[int, str, str], str]:
    """(season end, phase, box key) -> ``002YYNNNNN`` / ``004YYNNNNN`` in date order."""
    ordered = sorted(set(keys))
    ids: dict[tuple[int, str, str], str] = {}
    sequence: Counter[tuple[int, str]] = Counter()
    for end_year, phase, _game_date, box_key in ordered:
        sequence[(end_year, phase)] += 1
        ids[(end_year, phase, box_key)] = (
            f"{_phase_prefix(phase)}{(end_year - 1) % 100:02d}{sequence[(end_year, phase)]:05d}"
        )
    return ids


def _sum(rows: list[dict[str, Any]], field: str) -> int | None:
    values: list[int | None] = [
        row["stats"][field] for row in rows if row["appearance"] == "appeared"
    ]
    if not values or any(value is None for value in values):
        return None
    return sum(value for value in values if value is not None)


def build_gamelog_rows(
    parsed: list[dict[str, Any]],
    crosswalk: dict[str, str],
    names: dict[str, str],
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    """Schedules, team games, player games and identities from parsed game-log rows."""
    by_game: dict[tuple[int, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in parsed:
        by_game[(row["season_end"], row["phase"], row["box_key"])].append(row)
    ids = _game_ids((key[0], key[1], rows[0]["game_date"], key[2]) for key, rows in by_game.items())

    schedules: list[dict[str, Any]] = []
    team_games: list[dict[str, Any]] = []
    player_games: list[dict[str, Any]] = []
    report: dict[str, Any] = {
        "games": 0,
        "games_one_side": [],
        "result_conflicts": [],
        "points_mismatches": [],
        "duplicate_player_rows": 0,
    }
    for key in sorted(by_game, key=lambda k: ids[k]):
        end_year, phase, box_key = key
        rows = by_game[key]
        game_id = ids[key]
        season = season_label(end_year)
        home = team_code(rows[0]["home"])
        sides: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            sides[team_code(row["team"])].append(row)
        teams = sorted(sides)
        # One side only when no player of the other team has a retained log for this game.
        if len(teams) == 1:
            opponent = team_code(rows[0]["opponent"])
            report["games_one_side"].append(game_id)
            teams = sorted([teams[0], opponent])
        away = next(team for team in teams if team != home) if home in teams else None
        if away is None or len(teams) != 2:
            raise ValueError(f"{box_key}: cannot place teams {teams} with home {home}")
        game_date = rows[0]["game_date"]
        scores: dict[str, int | None] = {}
        for team in teams:
            own = [r for r in rows if team_code(r["team"]) == team]
            other = [r for r in rows if team_code(r["opponent"]) == team]
            claimed = {r["team_points"] for r in own} | {r["opponent_points"] for r in other}
            claimed.discard(None)
            if len(claimed) > 1:
                report["result_conflicts"].append({"game_id": game_id, "team": team})
            scores[team] = min(claimed) if claimed else None
        report["games"] += 1
        schedules.append(
            {
                "game_id": game_id,
                "season": season,
                "phase": phase,
                "game_date": game_date,
                "home_team_id": home,
                "away_team_id": away,
                "game_status": 3,
                "annotations_json": {
                    "source": "basketball_reference",
                    "box_score_key": box_key,
                    "game_id_basis": "courtlens_sequence",
                },
            }
        )
        for team in teams:
            opponent = away if team == home else home
            own = sides.get(team, [])
            stats = {field: _sum(own, field) for field in STAT_NAMES}
            points = scores[team]
            if points is None:
                points = stats["points"]
            if own and stats["points"] is not None and points != stats["points"]:
                report["points_mismatches"].append(
                    {"game_id": game_id, "team": team, "result": points, "players": stats["points"]}
                )
            if own:
                team_games.append(
                    {
                        "game_id": game_id,
                        "team_id": team,
                        "opponent_id": opponent,
                        "game_date": game_date,
                        "season": season,
                        "phase": phase,
                        "side": "home" if team == home else "away",
                        "points": points,
                        "opponent_points": scores[opponent] if scores[opponent] is not None else 0,
                        "stats_json": {**stats, "points": points},
                    }
                )
            seen: set[str] = set()
            for row in sorted(own, key=lambda r: r["bbref_id"]):
                player_id = player_key(row["bbref_id"], crosswalk)
                if player_id in seen:
                    report["duplicate_player_rows"] += 1
                    continue
                seen.add(player_id)
                player_games.append(
                    {
                        "game_id": game_id,
                        "player_id": player_id,
                        "team_id": team,
                        "opponent_id": opponent,
                        "game_date": game_date,
                        "season": season,
                        "phase": phase,
                        "appearance": row["appearance"],
                        "minutes_original": row["minutes_original"],
                        "minutes_seconds": row["minutes_seconds"],
                        "points": row["stats"]["points"],
                        "stats_json": row["stats"],
                    }
                )
    # A one-sided game's missing team has no player rows; it still needs its team row so the
    # game has two sides (validate_workbench_candidate). Its box score is unknown.
    by_id = {(row["game_id"], row["team_id"]): row for row in team_games}
    for schedule in schedules:
        pair = (schedule["home_team_id"], schedule["away_team_id"])
        for team, other in (pair, pair[::-1]):
            if (schedule["game_id"], team) in by_id:
                continue
            mate = by_id[(schedule["game_id"], other)]
            team_games.append(
                {
                    **mate,
                    "team_id": team,
                    "opponent_id": mate["team_id"],
                    "side": "home" if team == schedule["home_team_id"] else "away",
                    "points": mate["opponent_points"],
                    "opponent_points": mate["points"],
                    "stats_json": dict.fromkeys(STAT_NAMES) | {"points": mate["opponent_points"]},
                }
            )
    team_games.sort(key=lambda r: (r["game_id"], r["team_id"]))
    players = sorted({row["player_id"] for row in player_games})
    bbref_of = {player_key(b, crosswalk): b for b in names}
    identities = [
        {
            "kind": "player",
            "external_id": player_id,
            "display_name": names.get(bbref_of.get(player_id, ""), player_id),
            "bbref_id": bbref_of.get(player_id),
        }
        for player_id in players
    ]
    report["unmatched_players"] = sorted(p for p in players if p.startswith("bbref:"))
    report["players"] = len(players)
    report["player_games"] = len(player_games)
    report["appearances"] = sum(1 for r in player_games if r["appearance"] == "appeared")
    return {
        "schedule": schedules,
        "team_game": team_games,
        "player_game": player_games,
        "identity": identities,
    }, report


def reconcile_totals(
    player_games: list[dict[str, Any]],
    totals: dict[int, dict[str, list[dict[str, Any]]]],
    crosswalk: dict[str, str],
) -> dict[str, Any]:
    """Each player-team-season's summed games against the season totals page."""
    summed: dict[tuple[str, str, str, str], Counter[str]] = defaultdict(Counter)
    for row in player_games:
        if row["appearance"] != "appeared":
            continue
        bucket = summed[(row["season"], row["phase"], row["player_id"], row["team_id"])]
        bucket["games"] += 1
        for field in ("points", "rebounds_total", "assists", "field_goals_attempted"):
            bucket[field] += row["stats_json"].get(field) or 0
    checked = 0
    mismatches: list[dict[str, Any]] = []
    for end_year, phases in sorted(totals.items()):
        season = season_label(end_year)
        for phase, rows in phases.items():
            for row in rows:
                if row["summary"]:
                    continue
                key = (
                    season,
                    phase,
                    player_key(row["bbref_id"], crosswalk),
                    team_code(row["team"]),
                )
                if not any(k[0] == season for k in summed):
                    continue
                checked += 1
                got = summed.get(key, Counter())
                for field in (
                    "games",
                    "points",
                    "rebounds_total",
                    "assists",
                    "field_goals_attempted",
                ):
                    want = row["stats"].get(field)
                    if want is not None and got.get(field, 0) != want:
                        mismatches.append(
                            {
                                "season": season,
                                "phase": phase,
                                "bbref_id": row["bbref_id"],
                                "team": row["team"],
                                "field": field,
                                "totals": want,
                                "games_sum": got.get(field, 0),
                            }
                        )
    return {"player_team_seasons_checked": checked, "mismatches": mismatches}


def build_season_rows(
    totals: dict[int, dict[str, list[dict[str, Any]]]],
    advanced: dict[int, dict[str, list[dict[str, Any]]]],
    teams: dict[int, list[dict[str, Any]]],
    crosswalk: dict[str, str],
) -> dict[str, list[dict[str, Any]]]:
    """Player-team-season and team-season rows, every absent stat null."""
    player_rows: list[dict[str, Any]] = []
    for end_year in sorted(totals):
        season = season_label(end_year)
        for phase, rows in sorted(totals[end_year].items()):
            adv = {
                (r["bbref_id"], r["team"]): r["advanced"]
                for r in advanced.get(end_year, {}).get(phase, [])
            }
            for row in rows:
                player_rows.append(
                    {
                        "season": season,
                        "phase": phase,
                        "player_id": player_key(row["bbref_id"], crosswalk),
                        "bbref_id": row["bbref_id"],
                        "player_name": row["name"],
                        "team_id": row["team"] if row["summary"] else team_code(row["team"]),
                        "is_summary": row["summary"],
                        "age": row["age"],
                        "position": row["position"],
                        "stats_json": row["stats"],
                        "advanced_json": adv.get((row["bbref_id"], row["team"])) or {},
                    }
                )
    player_rows.sort(key=lambda r: (r["season"], r["phase"], r["player_id"], r["team_id"]))
    team_rows = [
        {
            "season": season_label(end_year),
            "phase": "regular_season",
            "team_id": team_code(entry["team"]),
            "team_name": entry["name"],
            "stats_json": entry.get("totals") or {},
            "opponent_stats_json": entry.get("opponent_totals") or {},
        }
        for end_year in sorted(teams)
        for entry in sorted(teams[end_year], key=lambda e: e["team"])
    ]
    return {"player_season": player_rows, "team_season": team_rows}


def _write_sealed(
    directory: Path, prefix: str, records: dict[str, list[dict[str, Any]]], manifest: dict[str, Any]
) -> tuple[Path, str]:
    lines = [
        json.dumps({"record": kind, **row}, sort_keys=True, separators=(",", ":"), default=str)
        for kind in sorted(records)
        for row in records[kind]
    ]
    body = ("\n".join(lines) + "\n").encode()
    digest = hashlib.sha256(body).hexdigest()
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{prefix}-{PARSER_VERSION}-{digest[:16]}.jsonl.gz"
    if not path.exists():
        # mtime=0 keeps the compressed bytes deterministic too.
        with gzip.GzipFile(path, "wb", mtime=0) as stream:
            stream.write(body)
    (directory / f"{prefix}-current").write_text(path.name + "\n")
    (path.with_suffix("").with_suffix(".manifest.json")).write_text(
        json.dumps(
            {"sha256": digest, "parser_version": PARSER_VERSION, **manifest},
            indent=2,
            sort_keys=True,
            default=str,
        )
        + "\n"
    )
    return path, digest


def seal_history(
    session: Session, bbref_root: Path, raw_root: Path, *, workers: int = 8
) -> dict[str, Any]:
    """Parse every retained history page and write the two sealed files."""
    pages = retained_pages(session, bbref_root)
    crosswalk = player_crosswalk(session)
    gamelog_pages = [p for p in pages if _GAMELOG_URL.search(p.url)]
    league_pages = [p for p in pages if _LEAGUE_URL.search(p.url)]

    totals: dict[int, dict[str, list[dict[str, Any]]]] = {}
    advanced: dict[int, dict[str, list[dict[str, Any]]]] = {}
    teams: dict[int, list[dict[str, Any]]] = {}
    for end_year, kind, value in _parallel(_parse_league_page, league_pages, workers):
        if kind == "totals":
            totals[end_year] = value
        elif kind == "advanced":
            advanced[end_year] = value
        elif kind == "teams":
            teams[end_year] = value
    names: dict[str, str] = {}
    for end_year in sorted(totals):
        for rows in totals[end_year].values():
            for row in rows:
                names[row["bbref_id"]] = row["name"]

    parsed: list[dict[str, Any]] = []
    for rows in _parallel(_parse_gamelog_page, gamelog_pages, workers):
        parsed.extend(rows)
    records, report = build_gamelog_rows(parsed, crosswalk, names)
    gamelog_seasons = sorted({row["season"] for row in records["schedule"]})
    report["totals_reconciliation"] = reconcile_totals(
        records["player_game"],
        {y: v for y, v in totals.items() if season_label(y) in gamelog_seasons},
        crosswalk,
    )
    out_dir = raw_root / SEALED_DIR
    gamelog_path, gamelog_sha = _write_sealed(
        out_dir,
        GAMELOG_PREFIX,
        records,
        {
            "seasons": gamelog_seasons,
            "pages": len(gamelog_pages),
            "coverage": {
                "plus_minus": "not stored (game-level +/- from 1996-97 only)",
                "team_stats_basis": "player_sum",
            },
            "report": report,
        },
    )
    season_records = build_season_rows(totals, advanced, teams, crosswalk)
    seasons_path, seasons_sha = _write_sealed(
        out_dir,
        SEASONS_PREFIX,
        season_records,
        {
            "seasons": sorted({row["season"] for row in season_records["player_season"]}),
            "pages": len(league_pages),
            "player_season_rows": len(season_records["player_season"]),
            "team_season_rows": len(season_records["team_season"]),
            "unmatched_players": len(
                {
                    r["player_id"]
                    for r in season_records["player_season"]
                    if r["player_id"].startswith("bbref:")
                }
            ),
        },
    )
    mismatch_fields = Counter(m["field"] for m in report["totals_reconciliation"]["mismatches"])
    return {
        "gamelogs": {
            "path": str(gamelog_path),
            "sha256": gamelog_sha,
            "seasons": f"{gamelog_seasons[0]}..{gamelog_seasons[-1]}" if gamelog_seasons else None,
            "games": report["games"],
            "player_games": report["player_games"],
            "appearances": report["appearances"],
            "players": report["players"],
            "unmatched_players": len(report["unmatched_players"]),
            "games_one_side": len(report["games_one_side"]),
            "result_conflicts": len(report["result_conflicts"]),
            "points_mismatches": len(report["points_mismatches"]),
            "duplicate_player_rows": report["duplicate_player_rows"],
            "totals_checked": report["totals_reconciliation"]["player_team_seasons_checked"],
            "totals_mismatches": dict(mismatch_fields),
        },
        "seasons": {
            "path": str(seasons_path),
            "sha256": seasons_sha,
            "player_season_rows": len(season_records["player_season"]),
            "team_season_rows": len(season_records["team_season"]),
        },
    }


def newest_sealed(raw_root: Path, prefix: str) -> Path | None:
    """The sealed file of a kind that the last seal run wrote, if any."""
    pointer = raw_root / SEALED_DIR / f"{prefix}-current"
    if not pointer.is_file():
        return None
    path = raw_root / SEALED_DIR / pointer.read_text().strip()
    return path if path.is_file() else None


def read_sealed(path: Path) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = defaultdict(list)
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            out[row.pop("record")].append(row)
    return dict(out)


def load_seasons(session: Session, path: Path) -> dict[str, Any]:
    """Load a sealed seasons file into ``bbref_player_seasons`` / ``bbref_team_seasons`` once.

    Also adds a player identity (name) for every player without one, so old-era players are
    named and searchable like any other.
    """
    from sqlalchemy import func
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    from courtlens.reference_models import BbrefPlayerSeason, BbrefTeamSeason
    from courtlens.workbench_models import WorkbenchIdentity

    body = gzip.decompress(path.read_bytes())
    sha = hashlib.sha256(body).hexdigest()
    records = read_sealed(path)
    loaded = session.scalar(
        select(func.count())
        .select_from(BbrefPlayerSeason)
        .where(BbrefPlayerSeason.source_sha256 == sha)
    )
    players = records.get("player_season", [])
    if not loaded:
        rows = [
            {
                "source_sha256": sha,
                "parser_version": PARSER_VERSION,
                "season": r["season"],
                "phase": r["phase"],
                "player_id": r["player_id"],
                "bbref_id": r["bbref_id"],
                "player_name": r["player_name"],
                "team_id": r["team_id"],
                "is_summary": r["is_summary"],
                "age": r["age"],
                "position": r["position"],
                "games": r["stats_json"].get("games"),
                "games_started": r["stats_json"].get("games_started"),
                "minutes": r["stats_json"].get("minutes"),
                "points": r["stats_json"].get("points"),
                "stats_json": r["stats_json"],
                "advanced_json": r["advanced_json"],
            }
            for r in players
        ]
        for start in range(0, len(rows), 5000):
            session.execute(
                pg_insert(BbrefPlayerSeason).on_conflict_do_nothing(), rows[start : start + 5000]
            )
        teams = [{"source_sha256": sha, **r} for r in records.get("team_season", [])]
        if teams:
            session.execute(pg_insert(BbrefTeamSeason).on_conflict_do_nothing(), teams)
    known = set(
        session.scalars(
            select(WorkbenchIdentity.external_id).where(WorkbenchIdentity.kind == "player")
        )
    )
    names: dict[str, str] = {}
    for r in players:
        names.setdefault(r["player_id"], r["player_name"])
    added = 0
    for player_id, name in sorted(names.items()):
        if player_id in known:
            continue
        session.add(
            WorkbenchIdentity(
                namespace="basketball_reference" if player_id.startswith("bbref:") else "nba",
                external_id=player_id,
                kind="player",
                display_name=name,
                metadata_json={"aliases": [name], "name_source": "basketball_reference"},
            )
        )
        added += 1
    session.commit()
    return {
        "sha256": sha,
        "already_loaded": bool(loaded),
        "player_rows": len(players),
        "identities_added": added,
    }
