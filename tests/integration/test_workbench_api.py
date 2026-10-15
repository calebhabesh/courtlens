"""Integration tests for CourtLens research workbench API contracts and Done criteria."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from courtlens.api.app import create_app
from courtlens.database import Base, get_db


@pytest.fixture
def client(workbench_db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: workbench_db
    with TestClient(app) as client:
        yield client


@pytest.fixture
def postgres_session():
    url = os.getenv("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        if os.getenv("CI") or os.getenv("COURTLENS_REQUIRE_POSTGRES_TESTS"):
            pytest.fail("COURTLENS_TEST_POSTGRES_URL must be configured")
        pytest.skip("COURTLENS_TEST_POSTGRES_URL is not configured")
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def test_workbench_catalog(client: TestClient) -> None:
    """Catalog endpoint returns published release, semantic signature, and capabilities."""
    response = client.get("/api/workbench/catalog")
    assert response.status_code == 200
    data = response.json()
    assert "release_id" in data
    assert "snapshot_id" in data
    assert "semantic_signature" in data
    assert "default_season" in data
    assert "coverage_start" in data
    assert "coverage_end" in data
    assert len(data["warnings"]) >= 1


def test_workbench_metrics(client: TestClient) -> None:
    """Metrics endpoint returns versioned definitions and limitations for both v2 and v1."""
    # Default is active v2 catalog
    response = client.get("/api/workbench/metrics")
    assert response.status_code == 200
    data = response.json()
    assert data["version"] == "v2"
    metrics = {m["key"]: m for m in data["metrics"]}
    assert "pts" in metrics
    assert "reb" in metrics
    assert "ast" in metrics
    assert "stl" in metrics
    assert "blk" in metrics
    assert "tov" in metrics
    assert "fg_pct" in metrics
    assert "ts_pct" in metrics
    assert "efg_pct" in metrics
    assert "ftr" in metrics
    assert "legacy_fantasy_score" in metrics
    assert metrics["pts"]["unit"] == "points"
    assert metrics["tov"]["default_sort_direction"] == "asc"
    assert metrics["ts_pct"]["unit"] == "percentage"
    assert metrics["efg_pct"]["unit"] == "percentage"

    # Preserved v1 catalog remains accessible for reproducible evidence
    resp_v1 = client.get("/api/workbench/metrics?version=v1")
    assert resp_v1.status_code == 200
    data_v1 = resp_v1.json()
    assert data_v1["version"] == "v1"


def test_workbench_lookup_endpoint(client: TestClient) -> None:
    """Incremental lookup endpoint discovers players, teams, and navigation pages."""
    # 1. Empty query returns navigation suggestions
    resp_empty = client.get("/api/workbench/lookup")
    assert resp_empty.status_code == 200
    data_empty = resp_empty.json()
    assert data_empty["catalog_version"] == "pf04-v2"
    assert len(data_empty["items"]) == 10
    assert all(i["match_basis"] == "suggestion" for i in data_empty["items"])
    destinations = [i["destination_url"] for i in data_empty["items"]]
    assert any("/stats" in d for d in destinations)

    # 2. Query player with diacritics folding ('Jokic' finds Nikola Jokić)
    resp_jokic = client.get("/api/workbench/lookup?q=Jokic")
    assert resp_jokic.status_code == 200
    data_jokic = resp_jokic.json()
    assert len(data_jokic["items"]) >= 1
    top_jokic = data_jokic["items"][0]
    assert top_jokic["display_name"] == "Nikola Jokić"
    assert top_jokic["kind"] == "player"
    assert top_jokic["match_basis"] == "exact"
    assert top_jokic["portrait_fallback"] == "NJ"
    assert "/api/workbench/players/203999/portrait" in (top_jokic["portrait_url"] or "")
    assert "/players/203999" in top_jokic["destination_url"]

    # 3. Query team via tricode and nickname ('TOR' and 'Raptors')
    resp_tor = client.get("/api/workbench/lookup?q=TOR")
    assert resp_tor.status_code == 200
    data_tor = resp_tor.json()
    assert any(i["display_name"] == "Toronto Raptors" for i in data_tor["items"])

    resp_raptors = client.get("/api/workbench/lookup?q=Raptors")
    assert resp_raptors.status_code == 200
    assert resp_raptors.json()["items"][0]["display_name"] == "Toronto Raptors"

    # 4. Kinds filter: only pages
    resp_pages = client.get("/api/workbench/lookup?q=stats&kinds=page")
    assert resp_pages.status_code == 200
    data_pages = resp_pages.json()
    assert all(i["kind"] == "page" for i in data_pages["items"])
    assert any(i["canonical_id"] == "stats" for i in data_pages["items"])

    # 5. Preserve a verified release; an invented release cannot establish identity scope.
    release_id = client.get("/api/workbench/catalog").json()["release_id"]
    resp_ctx = client.get(
        "/api/workbench/lookup",
        params={"q": "Jokic", "season": "2023-24", "release_id": release_id},
    )
    assert resp_ctx.status_code == 200
    dest = resp_ctx.json()["items"][0]["destination_url"]
    assert "season=2023-24" in dest
    assert f"release_id={release_id}" in dest
    assert (
        client.get(
            "/api/workbench/lookup?q=Jokic&season=2023-24&release_id=rel-test-123"
        ).status_code
        == 404
    )


def test_two_real_players_reconciled(client: TestClient) -> None:
    """Two real players (Scottie Barnes and LeBron James) return reconciled research results."""
    # 1. Search Scottie Barnes
    resp_scottie = client.get("/api/workbench/players?name=Scottie&limit=10")
    assert resp_scottie.status_code == 200
    data_scottie = resp_scottie.json()
    assert data_scottie["total_eligible_players"] >= 1
    scottie_item = next(p for p in data_scottie["items"] if "Scottie Barnes" in p["player_name"])
    assert scottie_item["player_id"] == "1630567"
    assert "TOR" in scottie_item["teams"]
    assert scottie_item["games_played"] > 0
    assert scottie_item["metrics"]["pts"] > 0
    assert scottie_item["metrics"]["reb"] > 0
    assert scottie_item["metrics"]["ast"] > 0

    # 2. Search LeBron James
    resp_lebron = client.get("/api/workbench/players?name=LeBron&limit=10")
    assert resp_lebron.status_code == 200
    data_lebron = resp_lebron.json()
    assert data_lebron["total_eligible_players"] >= 1
    lebron_item = next(p for p in data_lebron["items"] if "LeBron" in p["player_name"])
    assert lebron_item["player_id"] == "2544"
    assert "LAL" in lebron_item["teams"]
    assert lebron_item["games_played"] > 0
    assert lebron_item["metrics"]["pts"] > 0

    # 3. Scottie Barnes Profile
    resp_p_scottie = client.get("/api/workbench/players/1630567")
    assert resp_p_scottie.status_code == 200
    p_scottie = resp_p_scottie.json()
    assert p_scottie["player"]["name"] == "Scottie Barnes"
    assert p_scottie["summaries"]["season"]["gp"] == scottie_item["games_played"]
    assert p_scottie["summaries"]["season"]["pts"] == scottie_item["metrics"]["pts"]
    assert "last_5" in p_scottie["summaries"]
    assert "last_10" in p_scottie["summaries"]
    assert p_scottie["forecast_status"]["status"] in (
        "no_policy_registered",
        "no_upcoming_target",
        "archive_mode",
        "unavailable_no_schedule",
        "season_opener_awaiting_first_game",
        "forecast_issued",
    )

    # 4. LeBron James Profile
    resp_p_lebron = client.get("/api/workbench/players/2544")
    assert resp_p_lebron.status_code == 200
    p_lebron = resp_p_lebron.json()
    assert "LeBron" in p_lebron["player"]["name"]
    assert p_lebron["summaries"]["season"]["gp"] == lebron_item["games_played"]

    # 5. Prior-only Game Log
    resp_log = client.get("/api/workbench/players/1630567/games?limit=10")
    assert resp_log.status_code == 200
    log_data = resp_log.json()
    assert len(log_data["games"]) > 0
    # Reverse chronological check
    dates = [g["game_date"] for g in log_data["games"]]
    assert dates == sorted(dates, reverse=True)
    # Each game has lineage reference
    assert "/api/workbench/lineage" in log_data["games"][0]["lineage_ref"]


@pytest.mark.requires_published_data
def test_traded_player_team_filters_and_stints(client: TestClient) -> None:
    """A traded player returns team-scoped stats and multi-team stints."""
    siakam_id = "1627783"

    # 1. Filtered by Toronto (1610612761)
    resp_tor = client.get("/api/workbench/players?teamId=1610612761&name=Siakam&season=2023-24")
    assert resp_tor.status_code == 200
    tor_data = resp_tor.json()
    assert tor_data["total_eligible_players"] == 1
    tor_item = tor_data["items"][0]
    assert tor_item["player_id"] == siakam_id
    # Siakam played 39 appeared games for Toronto in 2023-24
    assert tor_item["games_played"] == 39

    # 2. Filtered by Indiana (1610612754)
    resp_ind = client.get("/api/workbench/players?teamId=1610612754&name=Siakam&season=2023-24")
    assert resp_ind.status_code == 200
    ind_data = resp_ind.json()
    assert ind_data["total_eligible_players"] == 1
    ind_item = ind_data["items"][0]
    assert ind_item["player_id"] == siakam_id
    # Siakam played 41 appeared games for Indiana in 2023-24
    assert ind_item["games_played"] == 41

    # 3. Overall player profile displays both stints and full-season TOT
    resp_profile = client.get(f"/api/workbench/players/{siakam_id}?season=2023-24")
    assert resp_profile.status_code == 200
    profile = resp_profile.json()
    assert profile["summaries"]["season"]["gp"] == 80  # 39 + 41 = 80
    assert len(profile["stints"]) == 2
    stint_tricodes = {s["team_tricode"]: s["games_played"] for s in profile["stints"]}
    assert stint_tricodes["TOR"] == 39
    assert stint_tricodes["IND"] == 41


def test_player_seasons_lists_seasons_with_game_rows(client: TestClient) -> None:
    """A stat trend asks only for the seasons a player appeared in; unknown players get none."""
    response = client.get("/api/workbench/player-seasons?playerId=1630567&playerId=0")
    assert response.status_code == 200
    data = response.json()
    assert data["phase"] == "regular_season"
    assert len(data["seasons"]["1630567"]) >= 1
    assert data["seasons"]["1630567"] == sorted(data["seasons"]["1630567"])
    assert data["seasons"]["0"] == []
    assert client.get("/api/workbench/player-seasons").status_code == 422


@pytest.mark.requires_published_data
def test_toronto_team_research_and_detail(client: TestClient) -> None:
    """Toronto team research results reconcile record, production, and player cohort."""
    toronto_id = "1610612761"

    # 1. Teams overview table
    resp_teams = client.get("/api/workbench/teams?season=2023-24")
    assert resp_teams.status_code == 200
    teams_data = resp_teams.json()
    assert len(teams_data["teams"]) == 30
    toronto = next(t for t in teams_data["teams"] if t["team_id"] == toronto_id)
    assert toronto["tricode"] == "TOR"
    assert toronto["name"] == "Toronto Raptors"
    assert toronto["games_played"] == 82
    assert toronto["wins"] + toronto["losses"] == 82
    assert toronto["production"]["pts_per_game"] > 100
    assert toronto["allowance"]["pts_allowed_per_game"] > 100
    notice_text = "Ties in record ordering do not establish official conference placement"
    assert notice_text in teams_data["order_notice"]

    # 2. Team Detail with Player Cohort
    resp_detail = client.get(f"/api/workbench/teams/{toronto_id}?season=2023-24")
    assert resp_detail.status_code == 200
    detail = resp_detail.json()
    assert detail["team"]["tricode"] == "TOR"
    assert detail["record"]["games_played"] == 82

    cohort_names = [p["player_name"] for p in detail["player_cohort"]]
    assert any("Scottie Barnes" in name for name in cohort_names)
    assert any("Pascal Siakam" in name for name in cohort_names)


def test_insufficient_history_and_threshold_filters(client: TestClient) -> None:
    """Threshold filters (minGames, minMinutes, minAvgMinutes) exclude insufficient history."""
    # 1. High minGames filter
    resp_all = client.get("/api/workbench/players?season=2023-24&limit=100")
    total_all = resp_all.json()["total_eligible_players"]

    resp_min_games = client.get("/api/workbench/players?season=2023-24&minGames=70&limit=100")
    total_min_games = resp_min_games.json()["total_eligible_players"]
    assert total_min_games < total_all
    for p in resp_min_games.json()["items"]:
        assert p["games_played"] >= 70

    # 2. High minMinutes filter
    resp_min_min = client.get("/api/workbench/players?season=2023-24&minMinutes=2000&limit=100")
    for p in resp_min_min.json()["items"]:
        assert p["total_minutes"] >= 2000.0

    # 3. High minAvgMinutes filter
    resp_min_avg = client.get("/api/workbench/players?season=2023-24&minAvgMinutes=32&limit=100")
    for p in resp_min_avg.json()["items"]:
        assert p["metrics"]["min_per_game"] >= 32.0


def test_player_with_no_upcoming_target(client: TestClient) -> None:
    """Player with no upcoming target returns valid descriptive research with explicit reason."""
    # Cutoff at end of season when no future games exist
    resp = client.get("/api/workbench/players/1630567?season=2023-24&beforeDate=2024-04-14")
    assert resp.status_code == 200
    data = resp.json()
    assert data["player"]["id"] == "1630567"
    assert data["summaries"]["season"]["gp"] > 0
    assert data["forecast_status"]["status"] in (
        "no_policy_registered",
        "no_upcoming_target",
        "archive_mode",
        "unavailable_no_schedule",
        "season_opener_awaiting_first_game",
        "forecast_issued",
    )


def test_player_comparison(client: TestClient) -> None:
    """Player comparison returns aligned metrics under a single context without forced winner."""
    resp = client.get("/api/workbench/compare?playerA=1630567&playerB=2544&season=2023-24")
    assert resp.status_code == 200
    data = resp.json()
    assert data["player_a"]["id"] == "1630567"
    assert data["player_b"]["id"] == "2544"
    assert "Scottie" in data["player_a"]["name"]
    assert "LeBron" in data["player_b"]["name"]

    metric_keys = [item["metric"] for item in data["aligned_metrics"]]
    assert "pts" in metric_keys
    assert "reb" in metric_keys
    assert "ast" in metric_keys
    assert "fg_pct" in metric_keys

    # Check that diff is computed
    pts_item = next(item for item in data["aligned_metrics"] if item["metric"] == "pts")
    assert pts_item["diff"] == round(pts_item["value_a"] - pts_item["value_b"], 2)

    # Check zero inferred winner claim
    assert "We never invent a winner probability" in data["no_forced_winner_notice"]


def test_mismatched_query_cursor_rejected(client: TestClient) -> None:
    """Cursor generated for query A is rejected with 422 when passed to query B."""
    # Query A: sorted by points
    resp_a = client.get("/api/workbench/players?season=2023-24&sortMetric=pts&limit=5")
    assert resp_a.status_code == 200
    cursor_a = resp_a.json()["next_cursor"]
    assert cursor_a is not None

    # Query B: sorted by assists with cursor_a -> must return 422
    resp_b = client.get(f"/api/workbench/players?season=2023-24&sortMetric=ast&cursor={cursor_a}")
    assert resp_b.status_code == 422
    assert "cursor does not match this request" in resp_b.json()["detail"]


def test_unsupported_metric_rejected(client: TestClient) -> None:
    """Requesting an unsupported metric returns HTTP 422."""
    resp = client.get("/api/workbench/players?sortMetric=invented_fantasy_stat")
    assert resp.status_code == 422
    assert "unsupported metric" in resp.json()["detail"]


def test_saved_investigation_reproduction_and_export(client: TestClient) -> None:
    """Saved investigation stores reproducible manifest, verifies hashes, and exports CSV."""
    payload = {
        "title": "Top Scorers 2023-24",
        "query": {
            "season": "2023-24",
            "sortMetric": "pts",
            "sortDirection": "desc",
            "limit": 10,
        },
    }
    # 1. Save investigation
    resp_save = client.post("/api/workbench/analyses", json=payload)
    assert resp_save.status_code == 201
    save_data = resp_save.json()
    inv_id = save_data["id"]
    manifest_hash = save_data["manifest_sha256"]
    result_hash = save_data["result_sha256"]
    assert inv_id
    assert manifest_hash
    assert result_hash

    # 2. Retrieve investigation
    resp_get = client.get(f"/api/workbench/analyses/{inv_id}")
    assert resp_get.status_code == 200
    get_data = resp_get.json()
    assert get_data["id"] == inv_id
    assert get_data["title"] == "Top Scorers 2023-24"
    assert len(get_data["results"]) > 0

    # 3. Reproduce investigation
    resp_repro = client.get(f"/api/workbench/analyses/{inv_id}/reproduce")
    assert resp_repro.status_code == 200
    repro_data = resp_repro.json()
    assert repro_data["reproducible"] is True
    assert repro_data["match"] is True
    assert repro_data["saved_result_sha256"] == repro_data["recomputed_result_sha256"]

    # 4. Export JSON
    resp_export_json = client.get(f"/api/workbench/analyses/{inv_id}/export?format=json")
    assert resp_export_json.status_code == 200
    assert "application/json" in resp_export_json.headers["content-type"]
    exported_json = resp_export_json.json()
    assert exported_json["id"] == inv_id

    # 5. Export CSV with formula injection protection
    resp_export_csv = client.get(f"/api/workbench/analyses/{inv_id}/export?format=csv")
    assert resp_export_csv.status_code == 200
    assert "text/csv" in resp_export_csv.headers["content-type"]
    csv_text = resp_export_csv.text
    assert "# CourtLens Workbench Analysis Export" in csv_text
    assert manifest_hash in csv_text
    assert "player_id,player_name,teams" in csv_text


def test_workbench_lineage(client: TestClient) -> None:
    """Lineage endpoint returns sanitized facts and transform steps without leakage."""
    resp = client.get("/api/workbench/lineage?playerId=1630567")
    assert resp.status_code == 200
    data = resp.json()
    assert "release_id" in data
    assert "dataset_id" in data
    assert "semantic_signature" in data
    assert len(data["contributing_facts"]) > 0
    assert len(data["transform_path"]) > 0
    # Ensure no server absolute filesystem path is exposed
    for fact in data["contributing_facts"]:
        assert "/home/" not in str(fact)
        assert "/tmp/" not in str(fact)


@pytest.mark.requires_published_data
def test_workbench_forecasts_evaluation(client: TestClient) -> None:
    """Forecasts evaluation endpoint returns report, model card, policy, and slices."""
    resp = client.get("/api/workbench/forecasts/evaluation")
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is True
    assert data["run_id"] == "b0e4bb3300011b5a3499"
    assert data["promotion"]["decision"] == "do_not_promote"
    assert data["active_policy"] is not None
    assert data["active_policy"]["policy_name"] == "points-v1-prior_blend"
    assert "player_only" in data["final_test"]["metrics"]
    assert "prior_blend" in data["final_test"]["metrics"]
    assert len(data["final_test"]["prespecified_slices"]) >= 5
    assert data["model_card_markdown"] is not None
    assert "do_not_promote" in data["model_card_markdown"]


def test_workbench_forecasts_ledger(client: TestClient) -> None:
    """Prospective forecasts endpoint returns ledger, summary metrics, and status."""
    resp = client.get("/api/workbench/forecasts")
    assert resp.status_code == 200
    data = resp.json()
    assert "summary" in data
    assert "items" in data
    summary = data["summary"]
    assert "total_issued" in summary
    assert "total_scored" in summary
    assert "prospective_accuracy_status" in summary
    assert summary["prospective_accuracy_status"] in ("not_yet_observed", "observed")
    assert "message" in summary

    if data["items"]:
        item = data["items"][0]
        assert "id" in item
        assert "player_id" in item
        assert "player_name" in item
        assert "point_estimate" in item
        assert item["point_estimate"] >= 0.0
        assert "interval_lower" in item
        assert "interval_upper" in item
        assert item["interval_lower"] <= item["point_estimate"] <= item["interval_upper"]
        assert "target_game_date" in item
        assert "features_hash" in item


def test_workbench_forecast_detail(client: TestClient) -> None:
    """Forecast detail endpoint returns features, evidence, and append-only scores."""
    # 404 for unknown issuance
    resp_404 = client.get("/api/workbench/forecasts/00000000-0000-0000-0000-000000000000")
    assert resp_404.status_code == 404

    # Detail for real issuance if ledger has items
    resp_list = client.get("/api/workbench/forecasts?limit=5")
    assert resp_list.status_code == 200
    list_data = resp_list.json()
    if list_data["items"]:
        iss_id = list_data["items"][0]["id"]
        resp_detail = client.get(f"/api/workbench/forecasts/{iss_id}")
        assert resp_detail.status_code == 200
        detail = resp_detail.json()
        assert detail["id"] == iss_id
        assert isinstance(detail["scores"], list)


def test_workbench_assistant_status(client: TestClient) -> None:
    """Assistant status endpoint returns configuration, model, limits, and allowed tools."""
    response = client.get("/api/workbench/assistant/status")
    assert response.status_code == 200
    data = response.json()
    assert "configured" in data
    assert "model" in data
    assert "provider" in data
    assert "limits" in data
    assert "allowed_tools" in data
    assert len(data["allowed_tools"]) >= 8
    assert "query" in data["allowed_tools"]
    assert "privacy_notice" in data
    assert "setup_instructions" in data


def test_workbench_assistant_query_disabled(client: TestClient) -> None:
    """Assistant query returns typed disabled response when server API key is not configured."""
    from unittest.mock import patch

    with patch("courtlens.services.assistant.conversations.get_settings") as mock_settings:
        mock_settings.return_value.gemini_api_key = None
        mock_settings.return_value.gemini_model = "gemini-2.5-flash"
        response = client.post(
            "/api/workbench/assistant/query",
            json={"question": "Who scored the most points?"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "disabled"
        assert "disabled" in data["interpretation"].lower()
        assert data["error_detail"] is not None
        assert "not configured" in data["error_detail"].lower()


def test_workbench_assistant_query_length_limit(client: TestClient) -> None:
    """Assistant query rejects prompts exceeding 2000 character limit."""
    long_q = "a" * 2001
    response = client.post(
        "/api/workbench/assistant/query",
        json={"question": long_q},
    )
    assert response.status_code == 422


def test_workbench_assistant_query_offline_provider(client: TestClient) -> None:
    """Assistant query endpoint executes end-to-end with offline fixture provider."""
    from unittest.mock import patch

    from courtlens.services.assistant.provider import OfflineFixtureAssistantProvider

    provider = OfflineFixtureAssistantProvider()
    with patch(
        "courtlens.api.routers.workbench.run_assistant_query",
        side_effect=lambda **kwargs: run_assistant_query(
            session=kwargs["session"],
            question=kwargs["question"],
            user_context=kwargs.get("user_context"),
            provider=provider,
        ),
    ):
        from courtlens.services.assistant.service import run_assistant_query

        response = client.post(
            "/api/workbench/assistant/query",
            json={"question": "Compare Scottie Barnes and RJ Barrett"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "answered"
        assert len(data["tool_trace"]) >= 1
        assert len(data["supported_claims"]) >= 1
        assert "limitations" in data
        assert "explorer_query" in data
        assert data["explorer_query"]["target_url"].startswith("/")


def test_workbench_catalog_capabilities(client: TestClient) -> None:
    """Catalog endpoint includes capability status metadata (B01 contract)."""
    response = client.get("/api/workbench/catalog")
    assert response.status_code == 200
    data = response.json()
    assert "capabilities" in data
    assert isinstance(data["capabilities"], dict)
    assert "core_stats" in data["capabilities"]
    assert "status" in data["capabilities"]["core_stats"]
    # Source policy v2: admitted but not yet ingested sources are never source_blocked.
    tracking = data["capabilities"]["defensive_tracking"]
    assert tracking["status"] == "not_yet_observed"
    assert "hoopR" in tracking["limitations"][0]


def test_workbench_players_snake_and_camel_case_parity(client: TestClient) -> None:
    """GET /api/workbench/players produces identical results with camelCase and snake_case params.

    Resolves Findings 5 & 6.
    """
    camel_resp = client.get(
        "/api/workbench/players?season=2025-26&phase=regular_season&beforeDate=2026-02-10&minGames=5&sortMetric=pts&sortDirection=desc&limit=5"
    )
    assert camel_resp.status_code == 200
    camel_data = camel_resp.json()

    snake_resp = client.get(
        "/api/workbench/players?season=2025-26&phase=regular_season&before_date=2026-02-10&min_games=5&sort_metric=pts&sort_direction=desc&limit=5"
    )
    assert snake_resp.status_code == 200
    snake_data = snake_resp.json()

    assert camel_data["total_eligible_players"] == snake_data["total_eligible_players"]
    assert len(camel_data["items"]) == len(snake_data["items"])
    if camel_data["items"]:
        assert camel_data["items"][0]["player_id"] == snake_data["items"][0]["player_id"]
        assert camel_data["items"][0]["metrics"]["pts"] == snake_data["items"][0]["metrics"]["pts"]

    assert "has_more" in camel_data
    assert "next_cursor" in camel_data


def test_workbench_players_validation_rejection(client: TestClient) -> None:
    """GET /api/workbench/players returns 422 on invalid phase or unknown sort metric."""
    resp_phase = client.get("/api/workbench/players?phase=completely_invalid_phase_name")
    assert resp_phase.status_code == 422

    resp_metric = client.get("/api/workbench/players?sortMetric=bogus_stat_metric")
    assert resp_metric.status_code == 422


def test_workbench_query_v2_endpoint_success(client: TestClient) -> None:
    """POST /api/workbench/query executes typed QuerySpec and returns WorkbenchQueryResponse."""
    req_payload = {
        "query": {
            "season": "2025-26",
            "phase": "regular_season",
            "before_date": "2026-02-10",
            "name": "LeBron",
            "page": {"limit": 5},
        }
    }
    response = client.post("/api/workbench/query", json=req_payload)
    assert response.status_code == 200
    data = response.json()
    assert "query" in data
    assert "context" in data
    assert "items" in data
    assert "total_eligible_players" in data
    assert "has_more" in data
    assert "next_cursor" in data
    assert len(data["items"]) >= 1
    assert any("LeBron" in item["player_name"] for item in data["items"])


def test_workbench_query_v2_cursor_pagination(client: TestClient) -> None:
    """POST /api/workbench/query advances cursor correctly across pages (Finding 3)."""
    first_page_resp = client.post(
        "/api/workbench/query",
        json={
            "query": {
                "season": "2025-26",
                "phase": "regular_season",
                "before_date": "2026-02-10",
                "page": {"limit": 2},
            }
        },
    )
    assert first_page_resp.status_code == 200
    first_data = first_page_resp.json()
    assert len(first_data["items"]) == 2

    if first_data["has_more"]:
        cursor = first_data["next_cursor"]
        assert cursor is not None

        second_page_resp = client.post(
            "/api/workbench/query",
            json={
                "query": {
                    "season": "2025-26",
                    "phase": "regular_season",
                    "before_date": "2026-02-10",
                    "page": {"limit": 2, "cursor": cursor},
                }
            },
        )
        assert second_page_resp.status_code == 200
        second_data = second_page_resp.json()
        assert len(second_data["items"]) == 2
        # Different items on page 2
        assert first_data["items"][0]["player_id"] != second_data["items"][0]["player_id"]


def test_workbench_query_v2_validation_rejections(client: TestClient) -> None:
    """POST /api/workbench/query returns 422 on invalid metrics, phases, and corrupted cursor."""
    # 1. Invalid sort metric
    resp = client.post(
        "/api/workbench/query",
        json={"query": {"sort": [{"field": "unregistered_fantasy_score"}]}},
    )
    assert resp.status_code == 422

    # 2. Invalid phase
    resp = client.post(
        "/api/workbench/query",
        json={"query": {"phase": "not_a_valid_phase"}},
    )
    assert resp.status_code == 422

    # 3. Excessive predicates (>12 leaves)
    excessive_leaves = [{"field": "pts", "op": "gte", "value": i} for i in range(13)]
    resp = client.post(
        "/api/workbench/query",
        json={
            "query": {
                "predicates": {
                    "combinator": "and",
                    "predicates": excessive_leaves,
                }
            }
        },
    )
    assert resp.status_code == 422

    # 4. Corrupted cursor
    resp = client.post(
        "/api/workbench/query",
        json={"query": {"page": {"cursor": "corrupted_bad_cursor_token"}}},
    )
    assert resp.status_code == 422
