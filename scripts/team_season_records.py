"""Write each season's team records and ratings from the retained league pages.

Offline: reads the newest retained Basketball-Reference league season page of every season
(``/leagues/NBA_<year>.html``, ``BAA_`` before 1949-50) from the history crawl's receipts and
writes src/courtlens/domain/team_season_records.json: wins and losses from the standings, and
margin, schedule strength, SRS, offensive and defensive rating, pace, arena and attendance from
the advanced team table. Teams are keyed by the code CourtLens stores their games under (``PHX``
for the source's ``PHO``). No network I/O.

    .venv/bin/python scripts/team_season_records.py
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from courtlens.database import SessionLocal
from courtlens.ingestion.bbref_history import season_label
from courtlens.ingestion.bbref_seasons import PARSER_VERSION, parse_team_records, team_code
from courtlens.services.bbref_history_seal import retained_pages

OUT = Path("src/courtlens/domain/team_season_records.json")
LEAGUE_PAGE = re.compile(r"/leagues/(?:NBA|BAA)_(\d{4})\.html$")


def main() -> None:
    seasons: dict[str, dict[str, object]] = {}
    with SessionLocal() as session:
        pages = retained_pages(session, Path("data/raw/bbref"))
    for page in pages:
        match = LEAGUE_PAGE.search(page.url)
        if match is None:
            continue
        raw = page.path.read_bytes()
        teams = {team_code(row.pop("team")): row for row in parse_team_records(raw)}
        # A team that folded mid-season (1954-55 Baltimore Bullets) has no standings record: null.
        assert sum(r["wins"] is not None for r in teams.values()) >= len(teams) - 1, page.url
        seasons[season_label(int(match.group(1)))] = {
            "source_url": page.url,
            "source_sha256": hashlib.sha256(raw).hexdigest(),
            "teams": dict(sorted(teams.items())),
        }
    document = {
        "parser": PARSER_VERSION,
        "semantics": (
            "Each season's regular-season record (standings) and the source's season measures "
            "(advanced team table): mov, sos and srs in points per game; ortg, drtg per 100 "
            "possessions and pace per 48 minutes, from the source's own possession estimate; "
            "arena and attendance. Empty cells are null. Keys are the codes releases store "
            "games under."
        ),
        "seasons": dict(sorted(seasons.items())),
    }
    text = json.dumps(document, indent=1, ensure_ascii=False)
    # One team per line keeps the file compact and its diffs readable.
    text = re.sub(
        r"\{\n\s+(\"wins\".*?)\n\s+\}",
        lambda m: "{" + re.sub(r",\n\s+", ", ", m.group(1)) + "}",
        text,
        flags=re.S,
    )
    OUT.write_text(text + "\n")
    print(
        json.dumps(
            {
                "seasons": len(seasons),
                "team_seasons": sum(len(s["teams"]) for s in seasons.values()),  # type: ignore[arg-type]
            }
        )
    )


if __name__ == "__main__":
    main()
