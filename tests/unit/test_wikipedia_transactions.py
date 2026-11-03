"""Wikipedia's season transactions article: dated moves, store-on-change sealing and pruning."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select

from courtlens.ingestion.wikipedia_transactions import page_url, parse_transactions
from courtlens.services import wikipedia_transactions
from courtlens.workbench_models import WorkbenchAcquisition

# Trimmed from the real article (revision 1381121598, 2026-10-20).
FIXTURE = Path(__file__).parents[1] / "fixtures/wikipedia/transactions-2026-27.html"
NYK, UTA = "1610612752", "1610612762"


def _moves(name: str) -> list[tuple]:
    events = parse_transactions(FIXTURE.read_bytes(), "2026-27", date(2026, 10, 20))["events"]
    return [(e["kind"], e["team_id"], e["date"]) for e in events if e["key"] == name]


def test_every_table_becomes_dated_moves() -> None:
    parsed = parse_transactions(FIXTURE.read_bytes(), "2026-27", date(2026, 10, 20))
    assert parsed["revision_id"] == 1381121598
    # Two rows for one article (disambiguated link), a former-team waiver note and a camp cut.
    assert _moves("Tony Bradley") == [
        ("signed", NYK, "2026-09-30"),
        ("waived", NYK, "2026-10-15"),
        ("signed", UTA, "2026-10-17"),
        ("cut", NYK, None),
    ]
    # A column-spanning team cell is both the new and the former team (re-signed).
    carter = next(e for e in parsed["events"] if e["key"] == "Jevon Carter")
    assert carter["team_id"] == carter["former_team_id"] == "1610612753"
    # A row-spanning date reaches the next row; June precedes the July signing in 2026.
    assert _moves("Jonathan Isaac") == [
        ("waived", "1610612753", "2026-06-27"),
        ("signed", "1610612753", "2026-07-01"),
    ]
    assert _moves("Malachi Smith") == [
        ("two_way", "1610612761", "2026-09-21"),
        ("waived", "1610612751", "2026-07-10"),
    ]
    ingles = next(e for e in parsed["events"] if e["key"] == "Joe Ingles")
    assert (ingles["kind"], ingles["club"], ingles["country"]) == (
        "abroad",
        "Melbourne United",
        "Australia",
    )
    assert _moves("Gabe Vincent") == [("unsigned", None, None)]
    assert ("retired", None, "2026-07-07") in _moves("Kyle Lowry")


def test_wrong_page_or_lost_table_fails_loudly() -> None:
    body = FIXTURE.read_bytes()
    with pytest.raises(ValueError, match="different page"):
        parse_transactions(body, "2025-26", date(2026, 10, 20))
    with pytest.raises(ValueError, match="lost tables"):
        parse_transactions(body.replace(b">Waived</h3>", b">Other</h3>"), "2026-27", date.today())
    with pytest.raises(ValueError, match="columns"):
        parse_transactions(
            body.replace(b"<th>Date waived</th>", b"<th>When</th>"), "2026-27", date.today()
        )


def test_page_url_allowlist() -> None:
    url = page_url("2026-27")
    assert url.endswith("/wiki/List_of_2026%E2%80%9327_NBA_season_transactions")
    assert wikipedia_transactions.validate_page_url("wikipedia_transactions", url, "2026-27") == 5.0
    with pytest.raises(ValueError):
        wikipedia_transactions.validate_page_url("wikipedia_transactions", url, "2025-26")


def test_refresh_seals_only_changed_moves_and_prunes_old_pages(
    session, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)
    page = {"body": FIXTURE.read_bytes()}

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /w/\n")
        return httpx.Response(200, content=page["body"])

    out, raw = tmp_path / "out", tmp_path / "raw"
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        first, a = wikipedia_transactions.refresh(session, raw, client, out, "2026-27")
        # An edit elsewhere on the page (new bytes, same moves) seals nothing.
        page["body"] += b"<!-- unrelated edit -->"
        same, b = wikipedia_transactions.refresh(session, raw, client, out, "2026-27")
        page["body"] = page["body"].replace(b"October 17", b"October 18")
        moved, c = wikipedia_transactions.refresh(session, raw, client, out, "2026-27")
    assert a["changed"] and not b["changed"] and c["changed"]
    assert same == first and moved != first
    receipts = session.scalars(
        select(WorkbenchAcquisition).where(
            WorkbenchAcquisition.source_name == "wikipedia_transactions"
        )
    ).all()
    assert sorted(r.artifact_id is not None for r in receipts) == [False, True, True]
    beat = json.loads((out / ".checked").read_text())
    assert beat["manifest_sha256"] == moved.stem
    # Pruning drops the older bundle and its raw page once past the window; never the newest.
    future = datetime(2027, 1, 1, tzinfo=UTC)
    assert wikipedia_transactions.prune(out, raw, 30, future) == {"bundles": 1, "raw": 1}
    assert moved.exists() and not first.exists()
