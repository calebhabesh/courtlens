"""Fictional PC06 source fixtures shared by SQLite and PostgreSQL checks."""

import json

import httpx

from courtlens.services.finance_refresh import FinanceFetcher
from courtlens.services.player_context_ingestion import (
    PLAYER_INDEX_URL,
    admit_context,
    capture_local,
)
from courtlens.workbench_models import WorkbenchIdentity

BREF = "https://www.basketball-reference.com/contracts/TOR.html"
CAP = "https://www.spotrac.com/nba/toronto-raptors/cap/_/year/2026"
FA = "https://www.spotrac.com/nba/free-agents/_/year/2026"
THRESHOLDS = {
    "season": "2026-27",
    "source_url": "https://www.nba.com/news/nba-salary-cap-2026-27-season",
    "effective_date": "2026-07-01",
    "cap_cents": "16496100000",
    "tax_cents": "20042800000",
    "first_apron_cents": "20901500000",
    "second_apron_cents": "22168600000",
    "minimum_cents": "14846500000",
}


def bref_body(salary="100.01", flag="salary-pl", nba_id=True):
    nba = 'data-nba-id="99001"' if nba_id else ""
    return f'''<table id="contracts"><thead><tr>
    <th data-stat="player">Player</th><th data-stat="y1">2026-27</th>
    <th data-stat="y2">2027-28</th><th data-stat="remain_gtd">Guaranteed</th>
    </tr></thead><tbody><tr><th data-stat="player" {nba}>
    <a href="/players/f/fixture01.html">Fictional Player</a></th>
    <td data-stat="y1" class="{flag}">${salary}</td><td data-stat="y2"></td>
    <td data-stat="remain_gtd">$123.45</td></tr></tbody></table>'''.encode()


def spotrac_body(free_agents=False):
    if free_agents:
        return b"""<h1>2026 NBA Free Agents</h1><table><thead><tr><th>Player (1)</th>
        <th>Prev Team</th><th>Type</th><th>Status</th><th>AAV</th><th>Total Value</th>
        </tr></thead><tbody><tr><td data-nba-id="99001">
        <a href="/nba/player/fictional/id/9991">Fictional Player</a></td>
        <td>TOR</td><td>UFA / Bird</td><td>Signed</td><td></td><td>$999.99</td>
        </tr></tbody></table>"""
    return b"""<h1>Toronto Raptors 2026-27 Cap</h1><table><thead><tr><th>Player</th>
    <th>Base Salary</th><th>Cap Hit</th><th>Cash</th></tr></thead><tbody><tr>
    <td data-nba-id="99001"><a href="/nba/player/fictional/id/9991">Fictional Player</a></td>
    <td>$999</td><td>$102.02</td><td></td></tr></tbody></table>"""


def finance_capture(session, root, source="bref_contracts", body=None, code=200):
    urls = {"bref_contracts": BREF, "spotrac_cap": CAP, "spotrac_free_agents": FA}
    body = body if body is not None else bref_body()

    def respond(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        return httpx.Response(code, content=body)

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        receipt = FinanceFetcher(session, root, client).fetch(source, urls[source], "2026-27")
    session.commit()
    return receipt


def roster_capture(session, root):
    raw = {
        "parameters": {"Season": "2026-27"},
        "resultSets": [
            {
                "name": "PlayerIndex",
                "headers": [
                    "PERSON_ID",
                    "PLAYER_FIRST_NAME",
                    "PLAYER_LAST_NAME",
                    "TEAM_ID",
                    "TEAM_ABBREVIATION",
                    "POSITION",
                    "HEIGHT",
                    "WEIGHT",
                    "ROSTER_STATUS",
                ],
                "rowSet": [
                    [99001, "Fictional", "Player", 1610612761, "TOR", "F", None, None, 1],
                    [99002, "Fictional", "Rookie", 1610612761, "TOR", "G", None, None, 1],
                ],
            }
        ],
    }
    path = root / "index.json"
    path.write_text(json.dumps(raw))
    receipt = capture_local(session, root, path, "nba_player_index", PLAYER_INDEX_URL, "2026-27")
    session.commit()
    roster = admit_context(session, receipt.id, root)
    session.add(
        WorkbenchIdentity(
            namespace="nba", kind="player", external_id="99001", display_name="Fictional Player"
        )
    )
    session.commit()
    return roster
