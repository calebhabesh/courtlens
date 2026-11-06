"""R09 Draft Classes input tables (`courtlens-draft-value-v1`).

Every table is built from sources that existed before registration and is content-hashed; the
registration pins the hashes, and the runner refuses a table whose hash differs. No outcome
summary (value by pick, redraft, steals, correlations) is computed here.

- `picks`: every pick of every NBA draft 1966-2026 with its slot, round, team and the NBA player
  it names. 1966-95 from the sealed Wikipedia lists, 1996-99 from the official files (both in
  `courtlens-draft-history-v1`), 2000-26 from the official draft-history mart.
- `seasons`: each drafted player's NBA regular-season minutes, games and win shares per season,
  1966-67 to 2025-26, from the full-history season totals (one row per player-season: the
  multi-team summary row when there is one).
- `rapm`: 1Y RAPM and its seconds per player-season, 2014-15 to 2025-26 (R01's sealed fits).
- `combine`: NBA Draft Combine measurements for drafted players, 2000-26.
- `rookies`: each drafted player's first NBA regular season (classes 1983-2025), game by game,
  from the published game logs: the rookie tracker's comparison pool.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import defaultdict
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from sqlalchemy import text

from courtlens.domain.teams import TEAM_ERAS
from courtlens.ingestion.native_reconstruction import content_hash

REGISTRATION = "courtlens-draft-value-v1"
OUTPUT = Path("data/derived/draft-value-v1")
DRAFT_BUNDLE = Path(
    "data/derived/draft-history-v1/"
    "cfa65a4870ddfb8b0048486f83af17351b671e278afe89ade3f5f8ee7b902180.json"
)
FIRST_CLASS = 1966
LAST_CLASS = 2026
FIRST_SEASON = "1966-67"
LAST_COMPLETE_SEASON = "2025-26"
RAPM_SEASONS = tuple(f"{y}-{(y + 1) % 100:02d}" for y in range(2014, 2026))
FIRST_LOG_CLASS = 1983  # game logs start in 1983-84
FIRST_SEASON_GAMES = 82  # the first-season rows kept per player (the comparison never needs more)
NAME_RULE_SEASONS = 2  # a name match must debut within this many seasons of the draft
TABLES = ("picks", "seasons", "rapm", "combine", "rookies")
BOX_KEYS = (
    "points",
    "rebounds_total",
    "assists",
    "steals",
    "blocks",
    "turnovers",
    "field_goals_made",
    "field_goals_attempted",
    "three_pointers_made",
    "three_pointers_attempted",
    "free_throws_made",
    "free_throws_attempted",
)


def season_label(year: int) -> str:
    return f"{year}-{(year + 1) % 100:02d}"


def season_start(season: str) -> int:
    return int(season[:4])


def norm_name(name: str) -> str:
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    plain = re.sub(r'"[^"]*"', "", plain)
    plain = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", plain)
    return re.sub(r"[^a-z]", "", plain)


# ---------------------------------------------------------------------------------------------
# Teams


def _era_codes() -> dict[str, list[tuple[int, int, str, str | None]]]:
    """Team name -> (first, last season start, code, franchise id) from the era registry."""
    out: dict[str, list[tuple[int, int, str, str | None]]] = defaultdict(list)
    for era in TEAM_ERAS:
        first, last = season_start(era.first_season), season_start(era.last_season)
        out[era.name].append((first, last, era.code, era.franchise_id))
    return out


def _season_names() -> dict[int, dict[str, str]]:
    """Season start -> team name -> code, from the standings (team_seasons.json)."""
    path = Path(__file__).parents[1] / "domain" / "team_seasons.json"
    document = json.loads(path.read_text())
    return {
        season_start(season): {row["name"]: code for code, row in entry["teams"].items()}
        for season, entry in document["seasons"].items()
    }


def team_for_name(name: str | None, year: int) -> dict[str, Any]:
    """The drafting team's code at the draft (the season that ends with it, else the next)."""
    if not name:
        return {"code": None, "name": None}
    # Footnote stars, the en dash in "Kansas City-Omaha" and the 1974 expansion team listed
    # before it had a name.
    clean = re.sub(r"\s+", " ", name.replace("\N{EN DASH}", "-")).strip().rstrip("* ").strip()
    clean = {"New Orleans": "New Orleans Jazz"}.get(clean, clean)
    names = _season_names()
    for start in (year - 1, year):
        code = names.get(start, {}).get(clean)
        if code:
            return {"code": code, "name": clean}
    for first, last, code, _ in _era_codes().get(clean, []):
        if first <= year <= last + 1:
            return {"code": code, "name": clean}
    raise ValueError(f"{year} draft: team {clean!r} has no code")


# ---------------------------------------------------------------------------------------------
# Picks


def _bio(session: Any) -> dict[str, dict[str, Any]]:
    rows = session.execute(
        text(
            "select player_id::text, source_player_name, draft_year, draft_number, from_year, "
            "to_year from analytics_marts.mart_player_bio"
        )
    ).all()
    return {
        r[0]: {"name": r[1], "draft_year": r[2], "draft_number": r[3], "from": r[4], "to": r[5]}
        for r in rows
    }


def _first_seasons(session: Any) -> dict[str, tuple[str, int, str]]:
    """Every season-totals player: (name, first season start, id), keyed by player id."""
    rows = session.execute(
        text(
            "select player_id, min(player_name), min(season) from bbref_player_seasons "
            "where phase = 'regular_season' group by player_id"
        )
    ).all()
    return {r[0]: (r[1], season_start(r[2]), r[0]) for r in rows}


def build_picks(session: Any, bundle: Mapping[str, Any]) -> dict[str, Any]:
    bio = _bio(session)
    by_slot = {
        (b["draft_year"], b["draft_number"]): pid
        for pid, b in bio.items()
        if b["draft_year"] and b["draft_number"]
    }
    firsts = _first_seasons(session)
    by_name: dict[str, list[tuple[str, int, str]]] = defaultdict(list)
    for fid, (name, first, _) in firsts.items():
        by_name[norm_name(name)].append((name, first, fid))
    claimed: set[str] = set()
    rows: list[dict[str, Any]] = []
    rules: dict[str, int] = defaultdict(int)

    def name_rule(name: str, year: int) -> str | None:
        """A pick no slot names: a unique same-name NBA player whose bio has no draft and who
        debuts within two seasons of the draft, or a season-totals player without an NBA ID."""
        hits = [
            pid
            for _, first, pid in by_name.get(norm_name(name), [])
            if year <= first <= year + NAME_RULE_SEASONS
            and pid not in claimed
            and (pid.startswith("bbref:") or not (bio.get(pid) or {}).get("draft_year"))
        ]
        return hits[0] if len(hits) == 1 else None

    official = session.execute(
        text(
            "select draft_year, overall_pick, round_number, player_id::text, source_player_name, "
            "drafting_team_id, organization from analytics_marts.mart_stats_draft_history "
            "where draft_type = 'Draft' order by draft_year, overall_pick"
        )
    ).all()
    sources: list[tuple[int, list[dict[str, Any]], str]] = []
    for year, entry in sorted(bundle["drafts"].items()):
        sources.append((int(year), entry["picks"], entry["source"]))
    by_year: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for r in official:
        by_year[r[0]].append(
            {
                "overall_pick": r[1],
                "round_number": r[2],
                "player_id": r[3],
                "player_name": r[4],
                "team_id": r[5],
                "organization": r[6],
            }
        )
    for year in sorted(by_year):
        sources.append((year, by_year[year], "nba_stats_mart"))
    years = sorted({s[0] for s in sources})
    if years != list(range(FIRST_CLASS, LAST_CLASS + 1)):
        raise ValueError(f"draft classes are not {FIRST_CLASS}-{LAST_CLASS}: {years}")
    for year, picks, source in sources:
        for pick in picks:
            slot = int(pick["overall_pick"])
            pid_seasons: str | None
            if source == "wikipedia_drafts":
                pid = by_slot.get((year, slot))
                identity = "bio_slot" if pid else None
                team = team_for_name(pick["team"], year)
            else:
                pid = pick["player_id"]
                identity = "official"
                if source == "hoopr_nba_stats_raw":
                    team = {"code": pick["team"], "name": None}
                else:
                    team = {"code": pick["team_id"], "name": None}
            if pid is not None and pid not in firsts:
                # No season under the NBA ID: the same player may hold seasons under a
                # Basketball-Reference ID only.
                alias = name_rule(pick["player_name"], year)
                if alias is not None and alias.startswith("bbref:"):
                    rules["official_to_bbref_id"] += 1
                    identity = f"{identity}+bbref_id"
                    pid_seasons = alias
                else:
                    pid_seasons = pid
            elif pid is None:
                alias = name_rule(pick["player_name"], year)
                if alias is not None:
                    rules["name_rule"] += 1
                    identity = "name_rule"
                pid = pid_seasons = alias
            else:
                pid_seasons = pid
            if pid_seasons is not None:
                claimed.add(pid_seasons)
            info = bio.get(pid or "") or {}
            rows.append(
                {
                    "year": year,
                    "pick": slot,
                    "round": pick["round_number"],
                    "source": source,
                    "source_name": pick["player_name"],
                    "name": info.get("name") or pick["player_name"],
                    "player_id": pid,
                    "season_id": pid_seasons,
                    "identity": identity,
                    "team": team["code"],
                    "team_name": team["name"],
                    "organization": pick.get("organization"),
                    "wiki_title": pick.get("wiki_title"),
                }
            )
    return {"rows": rows, "rules": dict(rules)}


# ---------------------------------------------------------------------------------------------
# Outcomes


def build_seasons(session: Any, ids: set[str]) -> dict[str, Any]:
    rows = session.execute(
        text(
            "select player_id, season, is_summary, games, minutes, advanced_json->>'ws', "
            "team_id from bbref_player_seasons where phase = 'regular_season' "
            "and season between :first and :last order by player_id, season, is_summary desc"
        ),
        {"first": FIRST_SEASON, "last": LAST_COMPLETE_SEASON},
    ).all()
    out: dict[str, dict[str, Any]] = defaultdict(dict)
    teams: dict[tuple[str, str], list[str]] = defaultdict(list)
    for pid, season, summary, games, minutes, ws, team in rows:
        if pid not in ids:
            continue
        if not summary:
            teams[(pid, season)].append(team)
        if season in out[pid]:
            continue  # the summary row came first
        out[pid][season] = {
            "g": games,
            "min": minutes,
            "ws": None if ws is None else float(ws),
        }
    for (pid, season), codes in teams.items():
        out[pid][season]["teams"] = codes
    return {"players": {p: dict(sorted(s.items())) for p, s in sorted(out.items())}}


def build_rapm(ids: set[str]) -> dict[str, Any]:
    from courtlens.evaluation.metric_backtest_data import load_season_fits

    fits = load_season_fits()
    out: dict[str, dict[str, Any]] = defaultdict(dict)
    shas = {}
    for season in RAPM_SEASONS:
        body = fits[(1, season)]
        shas[season] = body["_sha256"]
        for pid, row in body["rapm"]["players"].items():
            if pid in ids:
                out[pid][season] = {"rapm": float(row["total"]), "seconds": float(row["seconds"])}
    return {"fit_sha256": shas, "players": {p: out[p] for p in sorted(out)}}


def build_combine(session: Any, ids: set[str]) -> dict[str, Any]:
    rows = session.execute(
        text(
            "select draft_year, player_id::text, height_no_shoes_inches, wingspan_inches, "
            "standing_reach_inches, weight_lbs, max_vertical_inches, lane_agility_seconds, "
            "three_quarter_sprint_seconds, combine_position from "
            "analytics_marts.mart_stats_draft_combine order by draft_year, player_id"
        )
    ).all()
    keys = (
        "height",
        "wingspan",
        "standing_reach",
        "weight",
        "max_vertical",
        "lane_agility",
        "sprint",
    )
    out = []
    for r in rows:
        if r[1] not in ids:
            continue
        values = {k: (None if v is None else float(v)) for k, v in zip(keys, r[2:9], strict=True)}
        out.append({"year": r[0], "player_id": r[1], "position": r[9], **values})
    return {"rows": out}


def build_rookies(session: Any, ids: set[str], dataset_id: str) -> dict[str, Any]:
    """First NBA regular season with a logged appearance, first 82 appearances, in date order."""
    rows = session.execute(
        text(
            "select player_id, season, game_date, game_id, minutes_seconds, stats_json "
            "from workbench_player_games where dataset_id = :d and phase = 'regular_season' "
            "and appearance = 'appeared' and season >= '1983-84' and season <= :last "
            "order by player_id, game_date, game_id"
        ),
        {"d": dataset_id, "last": LAST_COMPLETE_SEASON},
    ).all()
    out: dict[str, dict[str, Any]] = {}
    for pid, season, day, game, seconds, stats in rows:
        if pid not in ids:
            continue
        entry = out.setdefault(pid, {"season": season, "games": []})
        if entry["season"] != season or len(entry["games"]) >= FIRST_SEASON_GAMES:
            continue
        entry["games"].append(
            [day.isoformat(), game, int(seconds or 0), *[int(stats.get(k) or 0) for k in BOX_KEYS]]
        )
    return {"columns": ["date", "game_id", "seconds", *BOX_KEYS], "players": out}


# ---------------------------------------------------------------------------------------------
# Writing


def write_table(output: Path, body: dict[str, Any]) -> str:
    digest = content_hash(body)
    path = output / "tables" / f"{digest}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps(body, sort_keys=True, separators=(",", ":")))
    return digest


def read_table(output: Path, digest: str) -> dict[str, Any]:
    body: dict[str, Any] = json.loads((output / "tables" / f"{digest}.json").read_bytes())
    if content_hash(body) != digest:
        raise ValueError(f"table {digest} changed")
    return body


def published_dataset(session: Any) -> str:
    row = session.execute(
        text(
            "select b.dataset_id from published_snapshots p join workbench_release_bindings b "
            "on b.snapshot_id = p.snapshot_id where p.channel = 'public'"
        )
    ).first()
    if row is None:
        raise ValueError("no published dataset")
    return str(row[0])


def build_all(output: Path = OUTPUT, dataset_id: str | None = None) -> dict[str, str]:
    from courtlens.database import SessionLocal

    bundle = json.loads(DRAFT_BUNDLE.read_bytes())
    if content_hash(bundle) != DRAFT_BUNDLE.stem:
        raise ValueError("draft-history bundle changed")
    with SessionLocal() as session:
        dataset = dataset_id or published_dataset(session)
        picks = build_picks(session, bundle)
        ids = {r["season_id"] for r in picks["rows"] if r["season_id"]}
        nba_ids = {r["player_id"] for r in picks["rows"] if r["player_id"]}
        tables = {
            "picks": {"version": REGISTRATION, "draft_bundle": DRAFT_BUNDLE.stem, **picks},
            "seasons": {"version": REGISTRATION, **build_seasons(session, ids)},
            "rapm": {"version": REGISTRATION, **build_rapm(ids | nba_ids)},
            "combine": {"version": REGISTRATION, **build_combine(session, nba_ids)},
            "rookies": {
                "version": REGISTRATION,
                "dataset_id": dataset,
                **build_rookies(session, ids | nba_ids, dataset),
            },
        }
    return {name: write_table(output, body) for name, body in tables.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "coverage"))
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--dataset-id")
    parser.add_argument("--tables", type=Path, help="JSON of table hashes (coverage)")
    args = parser.parse_args()
    if args.command == "coverage":
        hashes = json.loads(args.tables.read_text())
        print(json.dumps(coverage(args.output, hashes), indent=1, sort_keys=True))
        return
    print(json.dumps(build_all(args.output, args.dataset_id), indent=1))


def coverage(output: Path, hashes: Mapping[str, str]) -> dict[str, Any]:
    """Per-class source and identity coverage, read before registration. No outcome summary."""
    picks = read_table(output, hashes["picks"])
    seasons = read_table(output, hashes["seasons"])["players"]
    rookies = read_table(output, hashes["rookies"])["players"]
    combine = read_table(output, hashes["combine"])["rows"]
    rapm = read_table(output, hashes["rapm"])["players"]
    measured: dict[int, int] = defaultdict(int)
    for row in combine:
        measured[row["year"]] += 1
    classes: dict[str, Any] = {}
    for year in range(FIRST_CLASS, LAST_CLASS + 1):
        rows = [r for r in picks["rows"] if r["year"] == year]
        identity: dict[str, int] = defaultdict(int)
        for r in rows:
            identity[r["identity"] or "none"] += 1
        classes[str(year)] = {
            "source": rows[0]["source"],
            "picks": len(rows),
            "first_60": sum(r["pick"] <= 60 for r in rows),
            "identity": dict(sorted(identity.items())),
            "with_season_rows": sum(
                bool(r["season_id"] and r["season_id"] in seasons) for r in rows
            ),
            "with_first_season_log": sum(
                bool(r["player_id"] and r["player_id"] in rookies) for r in rows
            )
            if year >= FIRST_LOG_CLASS
            else None,
            "with_rapm_season": sum(bool(r["player_id"] and r["player_id"] in rapm) for r in rows),
            "combine_rows": measured.get(year, 0),
            "team_codes_missing": sum(r["team"] is None for r in rows),
        }
    return {"tables": dict(hashes), "rules": picks["rules"], "classes": classes}


if __name__ == "__main__":
    main()
