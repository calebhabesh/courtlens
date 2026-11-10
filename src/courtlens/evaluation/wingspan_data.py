"""R10 Wingspan input tables (`courtlens-wingspan-ddpm-v1`).

Every table is built from sources that existed before registration and is content-hashed; the
registration pins the hashes, and the runner refuses a table whose hash differs. No association
(correlation, average by position, nearest build) is computed here, only coverage counts.

- `combine`: every NBA Draft Combine row 2000-26 with an NBA person ID (official combine and
  anthropometric feeds via the hoopR mirror, `mart_stats_draft_combine`), grouped by player.
- `seasons`: for each of those players, every NBA regular season 2000-01 to 2025-26 with logged
  minutes in the published game logs (team with the most minutes), and DARKO's D-DPM from the
  sealed regular-season board at that season's last regular-season game date.

    python -m courtlens.evaluation.wingspan_data build
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from sqlalchemy import text

from courtlens.ingestion.native_reconstruction import content_hash

REGISTRATION = "courtlens-wingspan-ddpm-v1"
OUTPUT = Path("data/derived/wingspan-v1")
FIRST_SEASON = "2000-01"
LAST_SEASON = "2025-26"
TABLES = ("combine", "seasons")
MEASURES = (
    "height_no_shoes_inches",
    "height_shoes_inches",
    "wingspan_inches",
    "standing_reach_inches",
    "weight_lbs",
)


def season_label(year: int) -> str:
    return f"{year}-{(year + 1) % 100:02d}"


SEASONS = tuple(season_label(y) for y in range(2000, 2026))


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


def _num(value: Any) -> float | None:
    return None if value is None else float(value)


def build_combine(session: Any) -> dict[str, Any]:
    rows = session.execute(
        text(
            "select draft_year, player_id::text, source_player_name, combine_position, "
            + ", ".join(MEASURES)
            + " from analytics_marts.mart_stats_draft_combine order by player_id, draft_year"
        )
    ).all()
    players: dict[str, list[dict[str, Any]]] = defaultdict(list)
    no_id = []
    for r in rows:
        entry = {
            "draft_year": int(r[0]),
            "name": r[2],
            "position": (r[3] or "").strip() or None,
            **{m: _num(v) for m, v in zip(MEASURES, r[4:], strict=True)},
        }
        if r[1] in (None, "", "-1"):
            no_id.append({"name": r[2], "draft_year": int(r[0])})
            continue
        players[str(r[1])].append(entry)
    return {
        "version": REGISTRATION,
        "source": "mart_stats_draft_combine (NBA Draft Combine via the hoopR mirror)",
        "rows": len(rows),
        "without_person_id": no_id,
        "players": {pid: players[pid] for pid in sorted(players)},
    }


def build_seasons(
    session: Any, dataset_id: str, darko: dict[str, Any], ids: set[str]
) -> dict[str, Any]:
    logged = session.execute(
        text(
            "select player_id, season, team_id, sum(minutes_seconds), "
            "count(*) filter (where minutes_seconds > 0) from workbench_player_games "
            "where dataset_id = :d and phase = 'regular_season' and season between :a and :b "
            "and appearance = 'appeared' group by 1, 2, 3"
        ),
        {"d": dataset_id, "a": FIRST_SEASON, "b": LAST_SEASON},
    ).all()
    per: dict[tuple[str, str], dict[str, Any]] = {}
    for pid, season, team, seconds, games in logged:
        if str(pid) not in ids:
            continue
        slot = per.setdefault((str(pid), season), {"seconds": 0, "games": 0, "teams": {}})
        slot["seconds"] += int(seconds or 0)
        slot["games"] += int(games or 0)
        slot["teams"][team] = slot["teams"].get(team, 0) + int(seconds or 0)
    boards = {
        e["season"]: e
        for e in darko["entries"]
        if e["phase"] == "regular_season" and FIRST_SEASON <= e["season"] <= LAST_SEASON
    }
    out: dict[str, dict[str, Any]] = defaultdict(dict)
    keys = {k for k in per} | {
        (pid, s) for s, e in boards.items() for pid in e["players"] if pid in ids
    }
    for pid, season in sorted(keys):
        found = per.get((pid, season))
        rating = boards.get(season, {}).get("players", {}).get(pid)
        team = None
        if found and found["teams"]:
            team = max(found["teams"].items(), key=lambda kv: (kv[1], kv[0]))[0]
        out[pid][season] = {
            "minutes": None if found is None else round(found["seconds"] / 60, 4),
            "games": None if found is None else found["games"],
            "team": team,
            "d_dpm": None if rating is None else rating.get("d_dpm"),
            "on_board": rating is not None,
        }
    return {
        "version": REGISTRATION,
        "dataset_id": dataset_id,
        "darko_bundle_sha256": darko["_sha256"],
        "boards": {
            s: {"as_of": e["as_of"], "data_date": e["data_date"], "raw_sha256": e["raw_sha256"]}
            for s, e in sorted(boards.items())
        },
        "players": {pid: out[pid] for pid in sorted(out)},
    }


def coverage(combine: dict[str, Any], seasons: dict[str, Any]) -> dict[str, Any]:
    """Counts only: who is measured, who has minutes and DARKO, and every exclusion's reason."""
    players = combine["players"]
    measured = {
        pid
        for pid, rows in players.items()
        if any(
            r["height_no_shoes_inches"] is not None and r["wingspan_inches"] is not None
            for r in rows
        )
    }
    by_player = seasons["players"]
    with_minutes = {
        pid for pid in measured if any(v["minutes"] for v in by_player.get(pid, {}).values())
    }
    on_board = {
        pid for pid in measured if any(v["on_board"] for v in by_player.get(pid, {}).values())
    }
    thresholds = {}
    for minutes in (0, 250, 500, 1000):
        thresholds[str(minutes)] = sum(
            1
            for pid in measured
            if any(
                (v["minutes"] or 0) >= max(minutes, 1e-9) and v["d_dpm"] is not None
                for v in by_player.get(pid, {}).values()
            )
        )
    board_no_minutes = [
        {"player_id": pid, "season": s}
        for pid, rows in by_player.items()
        for s, v in rows.items()
        if v["on_board"] and not v["minutes"]
    ]
    minutes_no_board = [
        {"player_id": pid, "season": s, "minutes": v["minutes"]}
        for pid, rows in by_player.items()
        for s, v in rows.items()
        if v["minutes"] and not v["on_board"]
    ]
    multi = Counter(len(rows) for rows in players.values())
    unmeasured = sorted(set(players) - measured)
    return {
        "combine_rows": combine["rows"],
        "rows_without_person_id": combine["without_person_id"],
        "players_with_person_id": len(players),
        "players_by_combine_count": {str(k): v for k, v in sorted(multi.items())},
        "players_measured_height_and_wingspan": len(measured),
        "players_not_measured": [
            {"player_id": pid, "name": players[pid][-1]["name"]} for pid in unmeasured
        ],
        "measured_with_logged_minutes_2000_26": len(with_minutes),
        "measured_on_a_darko_regular_season_board": len(on_board),
        "measured_with_a_season_at_or_above_minutes_and_d_dpm": thresholds,
        "darko_board_season_without_logged_minutes": {
            "count": len(board_no_minutes),
            "reason": "DARKO lists the player on its season-end board but the published game "
            "logs have no regular-season minutes for him that season (did not play, or rated "
            "from earlier seasons); never counted as 0 minutes.",
            "rows": board_no_minutes,
        },
        "logged_minutes_without_darko_rating": {
            "count": len(minutes_no_board),
            "reason": "Minutes in the game logs but no row on DARKO's season-end regular-season "
            "board: D-DPM unknown for that season, never zero.",
            "rows": minutes_no_board,
        },
    }


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


def load_darko(path: Path) -> dict[str, Any]:
    from courtlens.services.darko import _decode

    raw = path.read_bytes()
    from hashlib import sha256

    if sha256(raw).hexdigest() != path.stem:
        raise ValueError("DARKO bundle content address changed")
    body: dict[str, Any] = _decode(raw)
    return {**body, "_sha256": path.stem}


def build_all(output: Path, darko_path: Path, dataset_id: str | None = None) -> dict[str, Any]:
    from courtlens.database import SessionLocal

    darko = load_darko(darko_path)
    with SessionLocal() as session:
        dataset = dataset_id or published_dataset(session)
        combine = build_combine(session)
        seasons = build_seasons(session, dataset, darko, set(combine["players"]))
    hashes = {"combine": write_table(output, combine), "seasons": write_table(output, seasons)}
    return {
        "table_sha256": hashes,
        "dataset_id": dataset,
        "darko_bundle_sha256": darko["_sha256"],
        "coverage": coverage(combine, seasons),
    }


def main() -> None:
    from courtlens.services.darko import darko_path

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build",))
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--darko", type=Path, default=None)
    parser.add_argument("--dataset-id", default=None)
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()
    path = args.darko or darko_path()
    if path is None:
        raise SystemExit("no DARKO bundle configured")
    out = build_all(args.output, path, args.dataset_id)
    if args.report:
        args.report.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")
    print(json.dumps({k: v for k, v in out.items() if k != "coverage"}, indent=1))


if __name__ == "__main__":
    main()
