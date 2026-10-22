"""Write each season's team names, conferences and divisions from the retained league pages.

Offline: reads the newest retained Basketball-Reference league season page of every season
(``/leagues/NBA_<year>.html``, ``BAA_`` before 1949-50) from the history crawl's receipts and
writes src/courtlens/domain/team_seasons.json. Teams are keyed by the code CourtLens stores
their games under (``PHX`` for the source's ``PHO``). No network I/O.

    .venv/bin/python scripts/team_season_alignment.py
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from courtlens.database import SessionLocal
from courtlens.ingestion.bbref_history import season_label
from courtlens.ingestion.bbref_seasons import PARSER_VERSION, parse_standings, team_code
from courtlens.services.bbref_history_seal import retained_pages

OUT = Path("src/courtlens/domain/team_seasons.json")
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
        teams = {
            team_code(row["team"]): {
                "name": row["name"],
                "conference": row["conference"],
                "division": row["division"],
            }
            for row in parse_standings(raw)
        }
        assert teams, page.url
        seasons[season_label(int(match.group(1)))] = {
            "source_url": page.url,
            "source_sha256": hashlib.sha256(raw).hexdigest(),
            "teams": dict(sorted(teams.items())),
        }
    document = {
        "parser": PARSER_VERSION,
        "semantics": (
            "Each season's teams as the league's standings list them: name, conference "
            "(none before 1970-71) and division. Keys are the codes releases store games under."
        ),
        "seasons": dict(sorted(seasons.items())),
    }
    text = json.dumps(document, indent=1, ensure_ascii=False)
    # One team per line keeps the file compact and its diffs readable.
    text = re.sub(
        r'\{\n\s+"name": (.*?),\n\s+"conference": (.*?),\n\s+"division": (.*?)\n\s+\}',
        r'{"name": \1, "conference": \2, "division": \3}',
        text,
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
