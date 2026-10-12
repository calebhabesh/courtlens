"""Explicitly fictional PC07 stats feed payloads (person ids 99xxx); no source claim."""

import json
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy.orm import Session

from courtlens.ingestion.stats_feeds import HOOPR_SOURCE, PBPSTATS_SOURCE, hoopr_url
from courtlens.services.stats_feed_ingestion import FeedFetcher, admit_feed
from courtlens.stats_feed_models import StatsFeedDataset

REV = "a" * 40
ISO_URL = hoopr_url(REV, "synergyplaytypes", 2026, "regular-season_isolation_offensive_totals")
PLAY_HEADERS = ["SEASON_ID", "PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "POSS", "PTS", "PERCENTILE"]


def synergy_body(rows: list[list[Any]] | None = None, **params: Any) -> bytes:
    declared = {
        "SeasonYear": "2025-26",
        "SeasonType": "Regular Season",
        "PerMode": "Totals",
        "PlayerOrTeam": "P",
        "PlayType": "Isolation",
        "TypeGrouping": "Offensive",
        **params,
    }
    if rows is None:
        rows = [["22025", 99001, "Fictional One", 1610612761, 100, 98, None]]
    return json.dumps(
        {
            "parameters": declared,
            "resultSets": [{"name": "SynergyPlayType", "headers": PLAY_HEADERS, "rowSet": rows}],
        }
    ).encode()


def lineup_body(count: int) -> bytes:
    headers = ["GROUP_SET", "GROUP_ID", "GROUP_NAME", "TEAM_ID", "MIN", "POSS"]
    rows = [
        ["Lineups", f"-{99000 + i}-99101-99102-99103-99104-", "fictional", 1610612761, 10, 20]
        for i in range(count)
    ]
    params = {
        "MeasureType": "Base",
        "PerMode": "Totals",
        "Season": "2025-26",
        "SeasonType": "Regular Season",
    }
    return json.dumps(
        {
            "parameters": params,
            "resultSets": [{"name": "Lineups", "headers": headers, "rowSet": rows}],
        }
    ).encode()


def fetch_and_admit(
    session: Session, tmp_path: Path, body: bytes, url: str = ISO_URL, season: str = "2025-26"
) -> StatsFeedDataset:
    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404, text="Not Found")
        return httpx.Response(200, content=body, headers={"Content-Type": "text/plain"})

    source = PBPSTATS_SOURCE if "pbpstats" in url else HOOPR_SOURCE
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        receipt = FeedFetcher(session, tmp_path, client).fetch(source, url, season)
    assert receipt.status == "success", receipt.error_summary
    session.commit()
    dataset = admit_feed(session, receipt.id, tmp_path)
    session.commit()
    return dataset
