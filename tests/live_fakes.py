"""Shared deterministic provider for Live call-count and relational tests."""

import copy
import json
from datetime import UTC, datetime

from courtlens.domain.live import parse_scoreboard, parse_summary
from courtlens.services.live_provider import LiveFetch

NOW = datetime(2026, 10, 3, 18, tzinfo=UTC)
SLATE = NOW.date()


def event(game_id="1", state="pre", *, completed=False, score="0", name=None):
    return {
        "id": game_id,
        "date": "2026-10-03T23:00Z",
        "status": {
            "period": 1,
            "displayClock": "10:21",
            "type": {
                "state": state,
                "completed": completed,
                "name": name or ("STATUS_SCHEDULED" if state == "pre" else "STATUS_IN_PROGRESS"),
            },
        },
        "competitions": [
            {
                "date": "2026-10-03T23:00Z",
                "competitors": [
                    {
                        "team": {"id": "28", "displayName": "Toronto"},
                        "homeAway": "home",
                        "score": score,
                    },
                    {
                        "team": {"id": "14", "displayName": "Miami"},
                        "homeAway": "away",
                        "score": "0",
                    },
                ],
            }
        ],
    }


class FakeProvider:
    def __init__(self, events=None):
        self.events = events or [event()]
        self.calls = []
        self.error = None

    def fetch(self, slate, game_id=None):
        self.calls.append((slate, game_id))
        if self.error:
            raise self.error
        if game_id:
            e = next(e for e in self.events if e["id"] == game_id)
            payload = {"header": copy.deepcopy(e)}
            normalized = parse_summary(payload, slate, game_id)
        else:
            payload = {"events": copy.deepcopy(self.events)}
            normalized = parse_scoreboard(payload, slate)
        return LiveFetch(json.dumps(payload).encode(), normalized, "http-date", None)
