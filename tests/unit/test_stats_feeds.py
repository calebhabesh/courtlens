"""PC07 stats feed scope checks, unknowns, truncation, identity and bounded acquisition.

All payloads here are explicitly fictional fixtures (person ids 99xxx); no source claim.
"""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from stats_feed_fixtures import ISO_URL, REV, fetch_and_admit, lineup_body, synergy_body

from courtlens.domain.context import CapabilityStatus
from courtlens.ingestion.stats_feeds import (
    HOOPR_SOURCE,
    PBPSTATS_SOURCE,
    hoopr_url,
    parse_feed,
    pbpstats_url,
    scope_for_url,
    snake,
)
from courtlens.services.stats_feed_ingestion import (
    FeedFetcher,
    admit_feed,
    feed_capabilities,
    latest_datasets,
    run_plan,
    verify_feed,
)
from courtlens.stats_feed_models import StatsFeedDataset, StatsFeedVersion


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)


def test_hoopr_label_maps_to_canonical_and_draft_years() -> None:
    scope = scope_for_url(HOOPR_SOURCE, ISO_URL, "2025-26")
    assert (scope.feed, scope.season_type, scope.variant) == (
        "play_types",
        "regular_season",
        "isolation_offensive",
    )
    # hoopR's 2026 label holds the 2025 draft and combine.
    draft = scope_for_url(HOOPR_SOURCE, hoopr_url(REV, "drafthistory", 2026, None), "2025")
    assert (draft.season, draft.season_type) == ("2025", "draft")
    with pytest.raises(ValueError, match="disagree"):
        scope_for_url(HOOPR_SOURCE, hoopr_url(REV, "drafthistory", 2026, None), "2026")
    with pytest.raises(ValueError, match="disagree"):
        scope_for_url(HOOPR_SOURCE, ISO_URL, "2024-25")


@pytest.mark.parametrize(
    "url",
    [
        ISO_URL.replace(REV, "main"),
        ISO_URL.replace("synergyplaytypes", "playergamelogs"),
        ISO_URL.replace("_totals", "_pergame"),
        ISO_URL.replace("isolation", "fastbreak"),
        "https://stats.nba.com/stats/synergyplaytypes",
        "https://api.pbpstats.com/get-wowy-stats/nba?Season=2025-26",
        pbpstats_url("2025-26", "regular_season", "Lineup", "1"),
        pbpstats_url("2025-26", "regular_season", "Player") + "&StartType=x",
    ],
)
def test_allowlist_rejects_unadmitted_urls(url: str) -> None:
    source = PBPSTATS_SOURCE if "pbpstats" in url else HOOPR_SOURCE
    with pytest.raises(ValueError):
        scope_for_url(source, url, "2025-26")


@pytest.mark.parametrize(
    "params",
    [
        {"SeasonYear": "2024-25"},
        {"SeasonType": "Playoffs"},
        {"PerMode": "PerGame"},
        {"PlayType": "Spotup"},
        {"TypeGrouping": "Defensive"},
    ],
)
def test_payload_declaring_another_scope_is_rejected(params: dict[str, str]) -> None:
    scope = scope_for_url(HOOPR_SOURCE, ISO_URL, "2025-26")
    with pytest.raises(ValueError, match=r"different|Totals"):
        parse_feed(synergy_body(**params), scope)


def test_values_keep_nulls_and_empty_feed_is_not_zero() -> None:
    scope = scope_for_url(HOOPR_SOURCE, ISO_URL, "2025-26")
    parsed = parse_feed(synergy_body(), scope)
    payload = parsed.rows[0][1]
    assert payload["player_id"] == "99001" and payload["team_id"] == "1610612761"
    assert payload["values"]["percentile"] is None
    empty = parse_feed(synergy_body(rows=[]), scope)
    assert empty.rows == [] and empty.coverage["empty"] is True
    assert "not a zero" in empty.coverage["limitations"][0]


def test_traded_player_keeps_one_row_per_team_and_duplicates_reject() -> None:
    scope = scope_for_url(HOOPR_SOURCE, ISO_URL, "2025-26")
    rows = [
        ["22025", 99001, "Fictional One", 1610612761, 60, 50, 0.5],
        ["22025", 99001, "Fictional One", 1610612738, 40, 30, 0.4],
    ]
    assert len(parse_feed(synergy_body(rows=rows), scope).rows) == 2
    with pytest.raises(ValueError, match="duplicate"):
        parse_feed(synergy_body(rows=[rows[0], rows[0]]), scope)
    with pytest.raises(ValueError, match="NBA person id"):
        parse_feed(synergy_body(rows=[["22025", None, "Name Only", 1610612761, 1, 1, 0]]), scope)


def test_row_cap_marks_truncation() -> None:
    url = hoopr_url(REV, "leaguedashlineups", 2026, "regular-season_base_totals")
    scope = scope_for_url(HOOPR_SOURCE, url, "2025-26")
    assert parse_feed(lineup_body(1999), scope).coverage["truncated"] is False
    capped = parse_feed(lineup_body(2000), scope).coverage
    assert capped["truncated"] is True and capped["row_cap"] == 2000


def test_pbpstats_rows_use_nba_ids_and_snake_case() -> None:
    url = pbpstats_url("2025-26", "playoffs", "Player")
    scope = scope_for_url(PBPSTATS_SOURCE, url, "2025-26")
    body = json.dumps(
        {
            "multi_row_table_data": [
                {"EntityId": "99001", "TeamId": "1610612761", "OffPoss": 10, "Charge Fouls": 1}
            ]
        }
    ).encode()
    payload = parse_feed(body, scope).rows[0][1]
    assert payload["player_id"] == "99001"
    assert payload["values"]["off_poss"] == 10 and payload["values"]["charge_fouls"] == 1
    assert snake("2pt And 1 Free Throw Trips") == "2pt_and_1_free_throw_trips"


def test_run_plan_is_totals_only_and_bounded() -> None:
    plan = run_plan(REV, "2025-26", [2025], pbpstats=True, pbpstats_lineups=False)
    urls = [url for _, url, _ in plan]
    assert all("pergame" not in u for u in urls)
    assert len(urls) == len(set(urls))
    for source, url, season in plan:
        scope_for_url(source, url, season)
    assert sum("pbpstats" in u for u in urls) == 4


def test_admission_is_append_only_and_reverts_keep_versions(
    session: Session, tmp_path: Path
) -> None:
    a = fetch_and_admit(session, tmp_path, synergy_body())
    changed = [["22025", 99001, "Fictional One", 1610612761, 101, 99, 0.7]]
    b = fetch_and_admit(session, tmp_path, synergy_body(rows=changed))
    last = fetch_and_admit(session, tmp_path, synergy_body())
    assert a.content_sha256 == last.content_sha256 != b.content_sha256
    assert session.scalar(select(func.count()).select_from(StatsFeedVersion)) == 2
    assert session.scalar(select(func.count()).select_from(StatsFeedDataset)) == 3
    assert admit_feed(session, a.acquisition_id, tmp_path).id == a.id
    assert [d.id for d in latest_datasets(session)] == [last.id]
    assert [d.id for d in latest_datasets(session, b.observed_at)] in ([b.id], [a.id])
    with pytest.raises(ValueError, match="timezone"):
        latest_datasets(session, datetime.now(UTC).replace(tzinfo=None))
    assert latest_datasets(session, datetime.now(UTC) - timedelta(days=1)) == []
    assert verify_feed(session, a.id, tmp_path)["verified"] is True


def test_tampered_retained_bytes_fail_verification(session: Session, tmp_path: Path) -> None:
    dataset = fetch_and_admit(session, tmp_path, synergy_body())
    stored = next(p for p in tmp_path.rglob("*") if p.is_file() and p.stat().st_size > 200)
    stored.write_bytes(stored.read_bytes().replace(b"Fictional", b"Fictitious"))
    with pytest.raises(ValueError, match="checksum"):
        verify_feed(session, dataset.id, tmp_path)


def test_capabilities_report_observed_scopes_empty_and_truncated(
    session: Session, tmp_path: Path
) -> None:
    fetch_and_admit(session, tmp_path, synergy_body(rows=[]))
    url = hoopr_url(REV, "leaguedashlineups", 2026, "regular-season_base_totals")
    fetch_and_admit(session, tmp_path, lineup_body(2000), url)
    entries = feed_capabilities(session)
    assert set(entries) == {"play_types", "lineups"}
    assert all(e.status == CapabilityStatus.PARTIAL for e in entries.values())
    assert entries["play_types"].seasons == ["2025-26"]
    assert entries["play_types"].phases == ["regular_season"]
    assert any("zero rows" in text for text in entries["play_types"].limitations)
    assert any("row cap" in text for text in entries["lineups"].limitations)


@pytest.mark.parametrize("code", [403, 429])
def test_blocked_host_stops_and_retains_failure(
    session: Session, tmp_path: Path, code: int
) -> None:
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        return httpx.Response(code, text="blocked")

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        fetcher = FeedFetcher(session, tmp_path, client)
        first = fetcher.fetch(HOOPR_SOURCE, ISO_URL, "2025-26")
        second = fetcher.fetch(HOOPR_SOURCE, ISO_URL, "2025-26")
    assert first.status == second.status == "failed"
    assert len(requests) == 1
    with pytest.raises(ValueError, match="successful"):
        admit_feed(session, first.id, tmp_path)


def matchup_body(declared_season: str, season_id: str) -> bytes:
    headers = ["SEASON_ID", "OFF_PLAYER_ID", "DEF_PLAYER_ID", "PARTIAL_POSS"]
    params = {"SeasonYear": declared_season, "SeasonType": "Regular Season", "PerMode": "Totals"}
    rows = [[season_id, 99001, 99002, 12.5]]
    return json.dumps(
        {
            "parameters": params,
            "resultSets": [{"name": "SeasonMatchups", "headers": headers, "rowSet": rows}],
        }
    ).encode()


def test_start_year_declaration_must_be_proven_by_row_season_ids() -> None:
    url = hoopr_url(REV, "leagueseasonmatchups", 2026, "regular-season_totals")
    scope = scope_for_url(HOOPR_SOURCE, url, "2025-26")
    parsed = parse_feed(matchup_body("2025", "22025"), scope)
    assert parsed.coverage["declared_parameters"]["season_established_by"] == "row SEASON_ID"
    assert (
        "season_established_by"
        not in parse_feed(matchup_body("2025-26", "22025"), scope).coverage["declared_parameters"]
    )
    for body in (matchup_body("2025", "22024"), matchup_body("2025", "42025")):
        with pytest.raises(ValueError, match="different season"):
            parse_feed(body, scope)
    # Only the matchup endpoint has this declaration form; others stay strict.
    with pytest.raises(ValueError, match="different season"):
        parse_feed(synergy_body(SeasonYear="2025"), scope_for_url(HOOPR_SOURCE, ISO_URL, "2025-26"))


def test_combine_placeholder_identity_stays_unknown_not_name_matched() -> None:
    url = hoopr_url(REV, "draftcombinestats", 2002, None)
    scope = scope_for_url(HOOPR_SOURCE, url, "2001")
    headers = ["SEASON", "PLAYER_ID", "PLAYER_NAME", "WINGSPAN"]
    rows = [["2001", 99001, "Fictional One", 80.0], ["2001", -1, "Fictional Two", 79.5]]
    body = json.dumps(
        {
            "parameters": {"SeasonYear": "2001-02"},
            "resultSets": [{"name": "DraftCombineStats", "headers": headers, "rowSet": rows}],
        }
    ).encode()
    parsed = parse_feed(body, scope)
    keys = [payload["entity_key"] for _, payload in parsed.rows]
    assert keys == ["99001", "unidentified:row:1"]
    assert parsed.rows[1][1]["player_id"] is None
    assert parsed.coverage["unidentified_rows"] == 1
    assert (
        "unidentified_rows"
        not in parse_feed(synergy_body(), scope_for_url(HOOPR_SOURCE, ISO_URL, "2025-26")).coverage
    )


def _bio_body(
    result: str, params: dict[str, object], headers: list[str], rows: list[list[object]]
) -> bytes:
    return json.dumps(
        {"parameters": params, "resultSets": [{"name": result, "headers": headers, "rowSet": rows}]}
    ).encode()


def test_bio_urls_follow_hoopr_labels_and_payloads_must_agree() -> None:
    from courtlens.ingestion.stats_feeds import hoopr_bio_url

    # The index is labelled by season END year; rosters by START year.
    index_url = hoopr_bio_url(REV, "playerindex", "2026-27")
    assert index_url.endswith("/playerindex/2027.json")
    index = scope_for_url(HOOPR_SOURCE, index_url, "2026-27")
    assert (index.feed, index.capability, index.season_type, index.variant) == (
        "player_index",
        "player_bio",
        "bio",
        "",
    )
    roster_url = hoopr_bio_url(REV, "commonteamroster", "2025-26", "1610612743")
    assert roster_url.endswith("/commonteamroster/2025/1610612743.json")
    roster = scope_for_url(HOOPR_SOURCE, roster_url, "2025-26")
    assert (roster.feed, roster.variant) == ("team_roster", "1610612743")
    for url, season in (
        (roster_url, "2026-27"),
        (index_url, "2025-26"),
        (roster_url.replace("1610612743", "1"), "2025-26"),
    ):
        with pytest.raises(ValueError):
            scope_for_url(HOOPR_SOURCE, url, season)
    headers = ["TeamID", "SEASON", "PLAYER", "NUM", "HEIGHT", "BIRTH_DATE", "EXP", "PLAYER_ID"]
    row = [1610612743, "2025", "Fictional Center", "15", "6-11", "FEB 19, 1995", "10", 99001]
    parsed = parse_feed(
        _bio_body("CommonTeamRoster", {"Season": "2025", "TeamID": 1610612743}, headers, [row]),
        roster,
    )
    payload = parsed.rows[0][1]
    assert (payload["entity_key"], payload["player_id"], payload["team_id"]) == (
        "99001",
        "99001",
        "1610612743",
    )
    assert payload["values"]["birth_date"] == "FEB 19, 1995"
    assert parsed.coverage["declared_parameters"]["TeamID"] == 1610612743
    for params in ({"Season": "2024", "TeamID": 1610612743}, {"Season": "2025", "TeamID": 1}):
        with pytest.raises(ValueError, match="different"):
            parse_feed(_bio_body("CommonTeamRoster", params, headers, [row]), roster)
    # The index declares the canonical season (older files the start year).
    index_headers = ["PERSON_ID", "PLAYER_LAST_NAME", "COUNTRY", "DRAFT_YEAR"]
    index_row = [99001, "Center", "Serbia", 2014]
    for declared in ("2026-27", "2026"):
        parsed = parse_feed(
            _bio_body("PlayerIndex", {"Season": declared}, index_headers, [index_row]), index
        )
        assert parsed.rows[0][1]["player_id"] == "99001"
    with pytest.raises(ValueError, match="different season"):
        parse_feed(
            _bio_body("PlayerIndex", {"Season": "2025-26"}, index_headers, [index_row]), index
        )


def test_bio_plan_covers_the_index_and_every_team_roster() -> None:
    from courtlens.services.stats_feed_ingestion import bio_plan

    plan = bio_plan(REV, ["2024-25", "2025-26"], "2026-27")
    assert len(plan) == 1 + 2 * 30
    for source, url, season in plan:
        scope_for_url(source, url, season)
