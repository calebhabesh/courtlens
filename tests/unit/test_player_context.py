"""PC05 admission semantics, unknowns, exact identity, cutoffs and bounded acquisition."""

import gzip
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtlens.domain.rich_sources import compute_payload_hash
from courtlens.ingestion.player_context import (
    parse_espn_injuries,
    parse_injury_text,
    parse_player_index,
    parse_transactions,
    pdf_text,
)
from courtlens.player_context_models import PlayerContextDataset, PlayerContextVersion
from courtlens.services.player_context import context_catalog, dataset_rows, projected_roster
from courtlens.services.player_context_ingestion import (
    PLAYER_INDEX_URL,
    ContextFetcher,
    admit_context,
    capture_local,
    latest_index,
    refresh_player_index,
    source_url,
)
from courtlens.workbench_models import WorkbenchAcquisition

HEADERS = [
    "PERSON_ID",
    "PLAYER_FIRST_NAME",
    "PLAYER_LAST_NAME",
    "TEAM_ID",
    "TEAM_ABBREVIATION",
    "POSITION",
    "HEIGHT",
    "WEIGHT",
    "ROSTER_STATUS",
    "PTS",
]


def index_body(
    team_id: int = 1610612761, tricode: str = "TOR", status: int | None = 1, pts: float = 10
) -> bytes:
    return json.dumps(
        {
            "parameters": {"Season": "2026-27"},
            "resultSets": [
                {
                    "name": "PlayerIndex",
                    "headers": HEADERS,
                    "rowSet": [
                        [
                            99001,
                            "Test",
                            "Player",
                            team_id,
                            tricode,
                            "F-G",
                            "6-8",
                            "220",
                            status,
                            pts,
                        ]
                    ],
                }
            ],
        }
    ).encode()


def admit(session: Session, tmp_path: Path, body: bytes) -> PlayerContextDataset:
    path = tmp_path / "incoming.json"
    path.write_bytes(body)
    receipt = capture_local(
        session, tmp_path / "store", path, "nba_player_index", PLAYER_INDEX_URL, "2026-27"
    )
    session.commit()
    dataset = admit_context(session, receipt.id, tmp_path / "store")
    session.commit()
    return dataset


def injury_text() -> str:
    widths = [16, 16, 14, 28, 25, 20, 70]

    def line(parts: list[str]) -> str:
        return "".join(value.ljust(width) for value, width in zip(parts, widths, strict=True))

    return "\n".join(
        [
            "Injury Report: 10/11/26 05:00 PM",
            line(
                [
                    "Game Date",
                    "Game Time",
                    "Matchup",
                    "Team",
                    "Player Name",
                    "Current Status",
                    "Reason",
                ]
            ),
            line(
                [
                    "10/12/2026",
                    "07:00 (ET)",
                    "TOR@BOS",
                    "Toronto Raptors",
                    "Player, Test",
                    "Out",
                    "Injury/Illness - Left Knee;",
                ]
            ),
            line(["", "", "", "", "", "", "Soreness"]),
            line(["", "", "", "Boston Celtics", "", "", "NOT YET SUBMITTED"]),
            "Page 1 of 1",
        ]
    )


def test_index_excludes_career_rates_and_keeps_unknown_associations() -> None:
    first = parse_player_index(index_body(), "2026-27")
    later = parse_player_index(index_body(pts=500), "2026-27")
    assert compute_payload_hash(first.rows) == compute_payload_hash(later.rows)
    player = first.rows[0][1]
    assert player["height_inches"] == 80 and player["listed_position"] == "F-G"
    unknown = parse_player_index(index_body(status=None), "2026-27").rows[0][1]
    assert unknown["roster_status"] == "unknown" and unknown["team_id"] is None
    assert unknown["source_team_id"] == "1610612761"


def test_wrong_team_is_quarantined_not_remapped() -> None:
    data = json.loads(index_body())
    data["resultSets"][0]["rowSet"].append(
        [99002, "Other", "Player", 1610612761, "BOS", "C", None, None, 1, 0]
    )
    parsed = parse_player_index(json.dumps(data).encode(), "2026-27")
    assert len(parsed.rows) == 1
    assert parsed.coverage["rejected"][0]["reason"] == "active roster team ID/abbreviation mismatch"


def test_duplicate_identity_and_wrong_season_reject_candidate() -> None:
    data = json.loads(index_body())
    data["resultSets"][0]["rowSet"] *= 2
    with pytest.raises(ValueError, match="duplicate"):
        parse_player_index(json.dumps(data).encode(), "2026-27")
    with pytest.raises(ValueError, match="declare"):
        parse_player_index(index_body(), "2025-26")


def test_injury_report_context_wraps_and_not_submitted_are_distinct() -> None:
    parsed = parse_injury_text(injury_text(), "2026-27")
    assert len(parsed.rows) == 2
    player, team = [r for _, r in parsed.rows]
    assert player["player_id"] is None and player["status"] == "Out"
    assert player["reason"].endswith("Soreness")
    assert player["report_at"] == "2026-10-11T17:00:00-04:00"
    assert team["status"] == "unknown" and team["name"] is None


@pytest.mark.parametrize("mutation", ["Out", "TOR@BOS", "Game Date"])
def test_injury_schema_drift_rejects_instead_of_empty_report(mutation: str) -> None:
    with pytest.raises(ValueError):
        parse_injury_text(injury_text().replace(mutation, "unrecognized"), "2026-27")


def test_espn_ids_never_become_nba_ids() -> None:
    body = json.dumps(
        {
            "injuries": [
                {
                    "id": "28",
                    "injuries": [
                        {
                            "athlete": {"id": "123", "displayName": "Test Player"},
                            "status": "Out",
                            "date": "2026-10-11T18:00:00Z",
                            "shortComment": "Source observation",
                        }
                    ],
                }
            ]
        }
    ).encode()
    row = parse_espn_injuries(body, "2026-27").rows[0][1]
    assert row["source_player_id"] == "123" and row["player_id"] is None
    assert row["namespace"] == "espn"
    assert parse_espn_injuries(b'{"injuries": []}', "2026-27").coverage["admitted_rows"] == 0


def test_transaction_requires_explicit_official_evidence() -> None:
    row = {
        "transaction_id": "official-1",
        "player_id": "99001",
        "type": "Signed",
        "effective_date": "2026-10-11",
        "from_team_id": None,
        "to_team_id": "1610612761",
        "source_url": "https://www.nba.com/raptors/news/official-signing",
    }
    data = {"schema": "nba-transactions-v1", "season": "2026-27", "transactions": [row]}
    assert parse_transactions(json.dumps(data).encode(), "2026-27").rows[0][1]["type"] == "Signed"
    row["effective_date"] = None
    row["announced_date"] = "2026-10-11"
    row["effective_date_unknown_reason"] = "Source reports announcement, not effective date."
    row["unrelated_raw_field"] = "excluded"
    normalized = parse_transactions(json.dumps(data).encode(), "2026-27").rows[0][1]
    assert normalized["effective_date"] is None
    assert normalized["announced_date"] == "2026-10-11"
    assert "unrelated_raw_field" not in normalized
    del row["source_url"]
    with pytest.raises(KeyError):
        parse_transactions(json.dumps(data).encode(), "2026-27")


def test_a_b_a_retains_three_observations_two_versions(session: Session, tmp_path: Path) -> None:
    a = admit(session, tmp_path, index_body())
    b = admit(session, tmp_path, index_body(1610612738, "BOS"))
    last = admit(session, tmp_path, index_body())
    assert a.id != last.id and a.content_sha256 == last.content_sha256 != b.content_sha256
    assert session.scalar(select(func.count()).select_from(PlayerContextVersion)) == 2
    assert (
        context_catalog(session, "2026-27", b.observed_at)["capabilities"][0]["dataset"].dataset_id
        == b.id
    )
    assert dataset_rows(session, a)[0]["team_tricode"] == "TOR"
    assert dataset_rows(session, b)[0]["team_tricode"] == "BOS"
    assert admit_context(session, a.acquisition_id, tmp_path / "store").id == a.id
    assert session.scalar(select(func.count()).select_from(PlayerContextDataset)) == 3


def test_projection_without_stats_keeps_rookie_unknown(session: Session, tmp_path: Path) -> None:
    dataset = admit(session, tmp_path, index_body())
    result = projected_roster(session, dataset.id, "TOR", None)
    assert result["reference_season"] == "2025-26"
    assert result["players"][0]["reference"] is None
    assert result["current_season_appearances_in_release"] is None
    with pytest.raises(HTTPException, match="observed after"):
        projected_roster(session, dataset.id, "TOR", None, datetime.now(UTC) - timedelta(days=1))


@pytest.mark.parametrize("code", [403, 429])
def test_fetch_stops_host_and_retains_failure(session: Session, tmp_path: Path, code: int) -> None:
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        return httpx.Response(code, text="blocked")

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        fetcher = ContextFetcher(session, tmp_path, client)
        first = fetcher.fetch("nba_player_index", PLAYER_INDEX_URL, "2026-27")
        second = fetcher.fetch("nba_player_index", PLAYER_INDEX_URL, "2026-27")
    assert first.status == second.status == "failed"
    assert len(requests) == 1 and first.metadata_json["robots_status"] == code


def test_robots_disallow_is_recorded_not_a_refusal(session: Session, tmp_path: Path) -> None:
    """Source policy v3: robots.txt paces and is recorded; it no longer blocks a source."""
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /static/\n")
        return httpx.Response(200, content=index_body())

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        receipt = ContextFetcher(session, tmp_path, client).fetch(
            "nba_player_index", PLAYER_INDEX_URL, "2026-27"
        )
    assert receipt.status == "success" and len(requests) == 2
    assert receipt.metadata_json["robots_disallowed"] is True


@pytest.mark.parametrize(
    "url",
    [
        "http://cdn.nba.com/static/json/staticData/playerIndex.json",
        "https://stats.nba.com/stats/playerindex",
        "https://raw.githubusercontent.com/other/repo/main/2027.json",
    ],
)
def test_source_allowlist_rejects_unadmitted_paths(url: str) -> None:
    with pytest.raises(ValueError, match="not admitted"):
        source_url("nba_player_index", url, "2026-27")


def test_fetch_decodes_transport_once_and_obeys_crawl_delay(
    session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    delays = []
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", delays.append)

    def respond(request: httpx.Request) -> httpx.Response:
        body = (
            b"User-agent: *\nAllow: /\nCrawl-delay: 8\n"
            if request.url.path == "/robots.txt"
            else index_body()
        )
        return httpx.Response(
            200, content=gzip.compress(body), headers={"Content-Encoding": "gzip"}
        )

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        receipt = ContextFetcher(session, tmp_path, client).fetch(
            "nba_player_index", PLAYER_INDEX_URL, "2026-27"
        )
    assert receipt.status == "success", receipt.error_summary
    assert receipt.bytes == len(index_body())
    assert delays and 7.5 < delays[0] <= 8
    session.commit()
    assert admit_context(session, receipt.id, tmp_path).coverage_json["active_players"] == 1


def test_pdf_extraction_preserves_report_columns() -> None:
    # Explicitly fictional PDF exercises the actual Poppler path; no source claim.
    lines = injury_text().splitlines()
    commands = ["BT /F1 5 Tf 8 TL 30 750 Td"]
    for line in lines:
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        commands.append(f"({escaped}) Tj T*")
    commands.append("ET")
    stream = "\n".join(commands).encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    body = b"%PDF-1.4\n"
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(body))
        body += f"{number} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(body)
    body += b"xref\n0 6\n0000000000 65535 f \n"
    body += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    body += f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    parsed = parse_injury_text(pdf_text(body), "2026-27")
    assert len(parsed.rows) == 2 and parsed.rows[0][1]["status"] == "Out"


def test_scheduled_index_refresh_admits_only_changed_roster_rows(
    session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)
    state = {"revision": "a" * 40, "body": index_body()}
    fetched: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            assert request.url.params["path"] == "nba_stats/json/playerindex/2027.json"
            return httpx.Response(200, json=[{"sha": state["revision"]}])
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        fetched.append(request.url.path)
        return httpx.Response(200, content=state["body"])

    root = tmp_path / "store"
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        first = refresh_player_index(session, root, client, "2026-27")
        # Same hoopR commit: nothing is downloaded.
        same = refresh_player_index(session, root, client, "2026-27")
        # A new commit whose roster rows match (only PTS moved) admits nothing, keeps no bytes.
        state |= {"revision": "b" * 40, "body": index_body(pts=25)}
        stats_only = refresh_player_index(session, root, client, "2026-27")
        state |= {"revision": "c" * 40, "body": index_body(1610612738, "BOS")}
        moved = refresh_player_index(session, root, client, "2026-27")
    assert first["changed"] and moved["changed"] and moved["dataset_id"] != first["dataset_id"]
    assert (same["changed"], same["fetched"]) == (False, False)
    assert (stats_only["changed"], stats_only["fetched"]) == (False, True)
    assert stats_only["dataset_id"] == first["dataset_id"] and len(fetched) == 3
    assert session.scalar(select(func.count()).select_from(PlayerContextDataset)) == 2
    kept = session.scalars(
        select(WorkbenchAcquisition).where(WorkbenchAcquisition.resource == "player_context")
    ).all()
    assert sorted(r.artifact_id is not None for r in kept) == [False, True, True]
    latest = latest_index(session, "2026-27")
    assert latest is not None and dataset_rows(session, latest)[0]["team_tricode"] == "BOS"
