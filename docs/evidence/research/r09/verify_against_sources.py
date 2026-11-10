"""R09 source check: recompute realized value straight from the database, apart from the pipeline.

Reads the frozen results and, with its own SQL, the full-history season totals, the bio draft
fields and the official draft mart. Checks that:

1. every complete-class pick's four-season and career win shares and minutes equal a sum over
   the season totals (summary row for multi-team seasons) of that player's seasons;
2. every 2000-26 class equals the official mart pick for pick;
3. every 1966-95 pick that NBA.com's bio places at a (year, pick) slot is that player in the
   frozen class rows.

Run from a directory holding `evaluation/` and `.env` (database URL):
    python docs/evidence/research/r09/verify_against_sources.py > source-check.json
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from sqlalchemy import text

from courtlens.database import SessionLocal

RESULTS = Path("evaluation/research/frozen/courtlens-draft-value-v1.json")


def season(year: int) -> str:
    return f"{year}-{(year + 1) % 100:02d}"


def main() -> None:
    body = json.loads(RESULTS.read_text())
    with SessionLocal() as s:
        rows = s.execute(
            text(
                "select distinct on (player_id, season) player_id, season, minutes, "
                "(advanced_json->>'ws')::float from bbref_player_seasons "
                "where phase = 'regular_season' and season between '1966-67' and '2025-26' "
                "order by player_id, season, is_summary desc"
            )
        ).all()
        mart = s.execute(
            text(
                "select draft_year, overall_pick, player_id::text from "
                "analytics_marts.mart_stats_draft_history where draft_type = 'Draft'"
            )
        ).all()
        bio = s.execute(
            text(
                "select draft_year, draft_number, player_id::text from "
                "analytics_marts.mart_player_bio where draft_year between 1966 and 1995 "
                "and draft_number is not null"
            )
        ).all()
    seasons: dict[str, dict[str, tuple[float, float]]] = defaultdict(dict)
    for pid, label, minutes, ws in rows:
        seasons[pid][label] = (float(minutes or 0), float(ws or 0))
    names = {pid for pid in seasons if pid.startswith("bbref:")}
    checked = mismatched = skipped_alias = 0
    examples = []
    for year, entry in body["classes"].items():
        if entry["status"] != "complete":
            continue
        y = int(year)
        window = {season(y + k) for k in range(4)}
        for r in entry["rows"]:
            pid = r["player_id"]
            if pid is None or pid not in seasons:
                if r["identity"] and "bbref" in r["identity"]:
                    skipped_alias += 1  # seasons held under a Basketball-Reference ID
                    continue
                want = (0.0, 0.0, 0.0, 0.0)
            else:
                mine = seasons[pid]
                in_window = [v for k, v in mine.items() if k in window]
                career = [v for k, v in mine.items() if int(k[:4]) >= y]
                want = (
                    sum(v[1] for v in in_window),
                    sum(v[0] for v in in_window),
                    sum(v[1] for v in career),
                    sum(v[0] for v in career),
                )
            got = (r["window_ws"], r["window_min"], r["career_ws"], r["career_min"])
            checked += 1
            if any(abs((g or 0) - w) > 1e-6 for g, w in zip(got, want, strict=True)):
                mismatched += 1
                examples.append({"year": y, "pick": r["pick"], "got": got, "want": want})
    official = defaultdict(dict)
    for y, p, pid in mart:
        official[y][p] = pid
    mart_mismatch = 0
    for y, picks in official.items():
        served = {r["pick"]: r["player_id"] for r in body["classes"][str(y)]["rows"]}
        mart_mismatch += sum(served.get(p) != pid for p, pid in picks.items())
        mart_mismatch += abs(len(served) - len(picks))
    bio_mismatch = 0
    for y, p, pid in bio:
        rows_y = {r["pick"]: r["player_id"] for r in body["classes"][str(y)]["rows"]}
        bio_mismatch += rows_y.get(p) != pid
    print(
        json.dumps(
            {
                "results_sha256": body["results_sha256"],
                "value_rows_checked": checked,
                "value_rows_mismatched": mismatched,
                "value_rows_skipped_bbref_alias": skipped_alias,
                "bbref_only_players_in_totals": len(names),
                "mismatch_examples": examples[:10],
                "official_classes_checked": len(official),
                "official_pick_mismatches": mart_mismatch,
                "bio_slots_checked": len(bio),
                "bio_slot_mismatches": bio_mismatch,
            },
            indent=1,
        )
    )


if __name__ == "__main__":
    main()
