"""Write every season's playoff series from the retained league pages.

Offline: reads the newest retained Basketball-Reference league season page of every season and
writes src/courtlens/domain/playoff_series.json: each series' round as the source names it,
winner and loser (keyed by the codes releases store games under, ``PHX`` for ``PHO``), the
result and every game's date, home team and score. No network I/O.

    .venv/bin/python scripts/playoff_series.py
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from courtlens.database import SessionLocal
from courtlens.ingestion.bbref_history import season_label
from courtlens.ingestion.bbref_seasons import PARSER_VERSION, parse_playoff_series, team_code
from courtlens.services.bbref_history_seal import retained_pages

OUT = Path("src/courtlens/domain/playoff_series.json")
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
        series = parse_playoff_series(raw)
        for entry in series:
            entry["winner"], entry["loser"] = team_code(entry["winner"]), team_code(entry["loser"])
            for game in entry["games"]:
                game["home"], game["visitor"] = team_code(game["home"]), team_code(game["visitor"])
            # Every game is in the result: the winner won exactly its wins.
            assert len(entry["games"]) == entry["winner_wins"] + entry["loser_wins"], entry
        assert series, page.url
        seasons[season_label(int(match.group(1)))] = {
            "source_url": page.url,
            "source_sha256": hashlib.sha256(raw).hexdigest(),
            "series": series,
        }
    document = {
        "parser": PARSER_VERSION,
        "semantics": (
            "Each season's playoff series as the source lists them (latest round first): the "
            "round's name, winner, loser, the result and every game (number, date, home team, "
            "visitor, both scores). Codes are the ones releases store games under."
        ),
        "seasons": dict(sorted(seasons.items())),
    }
    text = json.dumps(document, indent=1, ensure_ascii=False)
    # One game per line keeps the file compact and its diffs readable.
    text = re.sub(
        r"\{\n\s+(\"number\".*?)\n\s+\}",
        lambda m: "{" + re.sub(r",\n\s+", ", ", m.group(1)) + "}",
        text,
        flags=re.S,
    )
    OUT.write_text(text + "\n")
    print(
        json.dumps(
            {
                "seasons": len(seasons),
                "series": sum(len(s["series"]) for s in seasons.values()),  # type: ignore[arg-type]
            }
        )
    )


if __name__ == "__main__":
    main()
