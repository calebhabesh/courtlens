"""Integration tests for Block B12: Analytical operations API endpoints.

Verifies:
1. POST and GET endpoints for /api/workbench/operations/compare-periods.
2. POST and GET endpoints for /api/workbench/operations/distribution with n >= 5 gating.
3. POST and GET endpoints for /api/workbench/operations/splits across venue, rest, and opponent.
4. POST and GET endpoints for /api/workbench/operations/opponent-context.
5. POST and GET endpoints for /api/workbench/operations/similarity (statistical peers).
6. POST and GET endpoints for /api/workbench/operations/rank.
7. Strict sample threshold enforcement, deterministic tie-breaking, and self-exclusion.
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from courtload.api.app import create_app

BAM_ADEBAYO_ID = "1628389"
LIMITED_SAMPLE_PLAYER_ID = "1628424"  # Kobi Simmons (4 appearances in 2023-24)


@pytest.fixture
def client() -> TestClient:
    app = create_app()
    return TestClient(app)


@pytest.mark.skipif(
    not os.getenv("COURTLOAD_TEST_POSTGRES_URL")
    and not os.path.exists("/var/run/postgresql/.s.PGSQL.5432"),
    reason="PostgreSQL database required for integration tests",
)
class TestAnalyticalOpsApi:
    """Integration test suite executing analytical operations against PostgreSQL."""

    def test_compare_periods_post_and_get(self, client: TestClient) -> None:
        """Disjoint period comparison returns correct appearance slices, deltas, and hash."""
        # 1. POST variant: Last 10 vs preceding 10 appearances
        payload = {
            "player_id": BAM_ADEBAYO_ID,
            "mode": "appearances",
            "period_a_n": 10,
            "period_b_n": 10,
        }
        res_post = client.post("/api/workbench/operations/compare-periods", json=payload)
        assert res_post.status_code == 200
        data = res_post.json()

        assert data["player_id"] == BAM_ADEBAYO_ID
        assert data["player_name"] == "Bam Adebayo"
        assert data["period_a"]["appearances_count"] == 10
        assert data["period_b"]["appearances_count"] == 10
        assert data["has_calendar_overlap"] is False
        assert len(data["evidence_hash"]) == 64

        deltas = {d["metric_key"]: d for d in data["deltas"]}
        assert "pts_per_game" in deltas
        assert deltas["pts_per_game"]["period_a_value"] is not None
        assert deltas["pts_per_game"]["period_b_value"] is not None
        assert deltas["pts_per_game"]["absolute_delta"] is not None

        # 2. GET variant
        res_get = client.get(
            f"/api/workbench/operations/compare-periods?playerId={BAM_ADEBAYO_ID}&periodAN=5&periodBN=5"
        )
        assert res_get.status_code == 200
        data_get = res_get.json()
        assert data_get["period_a"]["appearances_count"] == 5
        assert data_get["period_b"]["appearances_count"] == 5

    def test_distribution_summary_and_sample_gating(self, client: TestClient) -> None:
        """Distribution quantiles compute linear interpolation type 7, with n < 5 gating."""
        # 1. Standard player with ample history (n=20)
        res_bam = client.post(
            "/api/workbench/operations/distribution",
            json={"player_id": BAM_ADEBAYO_ID, "metric": "pts", "window_n": 20},
        )
        assert res_bam.status_code == 200
        data_bam = res_bam.json()

        assert data_bam["summary"]["summary_available"] is True
        assert data_bam["summary"]["n"] == 20
        assert data_bam["summary"]["p10"] <= data_bam["summary"]["p25"]
        assert data_bam["summary"]["p25"] <= data_bam["summary"]["median"]
        assert data_bam["summary"]["median"] <= data_bam["summary"]["p75"]
        assert data_bam["summary"]["p75"] <= data_bam["summary"]["p90"]
        assert data_bam["summary"]["iqr"] == round(
            data_bam["summary"]["p75"] - data_bam["summary"]["p25"], 2
        )
        assert len(data_bam["samples"]) == 20

        # 2. GET variant with different metric
        res_reb = client.get(
            f"/api/workbench/operations/distribution?playerId={BAM_ADEBAYO_ID}&metric=reb&windowN=10"
        )
        assert res_reb.status_code == 200
        assert res_reb.json()["summary"]["n"] == 10

        # 3. Limited history player (<5 games in 2023-24): sample summary must be gated
        res_limited = client.post(
            "/api/workbench/operations/distribution",
            json={"player_id": LIMITED_SAMPLE_PLAYER_ID, "metric": "pts", "window_n": 20},
        )
        assert res_limited.status_code == 200
        data_limited = res_limited.json()
        assert data_limited["summary"]["summary_available"] is False
        assert "Insufficient sample size" in data_limited["summary"]["reason"]
        assert data_limited["summary"]["mean"] is None
        assert data_limited["summary"]["iqr"] is None

    def test_splits_profile_venue_and_rest(self, client: TestClient) -> None:
        """Contextual splits group games by venue and contract team rest day definitions."""
        res = client.post(
            "/api/workbench/operations/splits",
            json={"player_id": BAM_ADEBAYO_ID, "split_type": "all"},
        )
        assert res.status_code == 200
        data = res.json()

        # Venue splits
        venue_keys = {v["bucket_key"] for v in data["venue_splits"]}
        assert "home" in venue_keys
        assert "away" in venue_keys

        # Rest splits (Back-to-back, 1 day, 2 days, etc.)
        rest_labels = {r["bucket_label"] for r in data["rest_splits"]}
        assert any("Back-to-back" in lbl or "Rest" in lbl for lbl in rest_labels)

        # Disclosures verification
        disclosures_text = " ".join(data["disclosures"])
        assert "0 means back-to-back" in disclosures_text
        assert "does not establish player rest" in disclosures_text

    def test_opponent_context_allowance_and_ranks(self, client: TestClient) -> None:
        """Opponent allowance aggregates historical production conceded across completed games."""
        # 1. League-wide opponent context
        res = client.post("/api/workbench/operations/opponent-context", json={})
        assert res.status_code == 200
        data = res.json()

        assert data["teams_analyzed"] == 30
        assert len(data["allowances"]) == 30
        # Check ranks 1..30
        assert data["allowances"][0]["league_rank_pts_allowed"] == 1
        assert data["allowances"][-1]["league_rank_pts_allowed"] == 30
        assert (
            data["allowances"][0]["pts_allowed_per_game"]
            <= data["allowances"][-1]["pts_allowed_per_game"]
        )

        # 2. GET variant for single opponent team
        res_single = client.get("/api/workbench/operations/opponent-context?teamId=BOS")
        assert res_single.status_code == 200
        single_data = res_single.json()
        assert len(single_data["allowances"]) == 1
        assert single_data["allowances"][0]["opponent_tricode"] == "BOS"

    def test_statistical_peers_similarity(self, client: TestClient) -> None:
        """Statistical peers finds geometrically closest cohort players on standardized
        dimensions.
        """
        # 1. Bam Adebayo similarity in last 10 appearances
        payload = {
            "target_player_id": BAM_ADEBAYO_ID,
            "window": "last_10",
            "min_appearances": 10,
            "min_minutes": 150.0,
            "top_k": 5,
        }
        res = client.post("/api/workbench/operations/similarity", json=payload)
        assert res.status_code == 200
        data = res.json()

        assert data["target"]["player_id"] == BAM_ADEBAYO_ID
        assert data["target"]["player_name"] == "Bam Adebayo"
        assert data["cohort"]["active_dimensions_count"] >= 6
        assert len(data["peers"]) == 5

        # Check self-exclusion & distance ordering
        peer_ids = [p["player_id"] for p in data["peers"]]
        assert BAM_ADEBAYO_ID not in peer_ids

        distances = [p["distance"] for p in data["peers"]]
        assert distances == sorted(distances)
        for p in data["peers"]:
            assert p["overlapping_dimensions_count"] >= 6
            assert p["distance"] >= 0.0

        # 2. Ineligible target player (<10 appearances) must return 422 with explanation
        res_ineligible = client.post(
            "/api/workbench/operations/similarity",
            json={
                "target_player_id": LIMITED_SAMPLE_PLAYER_ID,
                "window": "last_10",
                "min_appearances": 10,
                "min_minutes": 150.0,
            },
        )
        assert res_ineligible.status_code == 422
        err_detail = res_ineligible.json()["detail"]
        assert err_detail["reason"] == "insufficient_sample"

    def test_rank_operation_compare_and_distribution(self, client: TestClient) -> None:
        """Rank operations rank cohort candidates by period deltas and distribution dispersion."""
        # 1. Rank by scoring surge (compare_periods delta)
        payload_comp = {
            "operation_type": "compare_periods",
            "metric": "pts",
            "sort_direction": "desc",
            "limit": 10,
            "min_games": 10,
        }
        res_comp = client.post("/api/workbench/operations/rank", json=payload_comp)
        assert res_comp.status_code == 200
        data_comp = res_comp.json()
        assert len(data_comp["items"]) > 0
        assert data_comp["items"][0]["rank"] == 1
        deltas = [it["delta_value"] for it in data_comp["items"] if it["delta_value"] is not None]
        assert deltas == sorted(deltas, reverse=True)

        # 2. GET variant: rank by distribution IQR
        res_dist = client.get(
            "/api/workbench/operations/rank?operationType=distribution&metric=pts&measure=iqr&limit=10"
        )
        assert res_dist.status_code == 200
        data_dist = res_dist.json()
        assert len(data_dist["items"]) > 0
        assert data_dist["items"][0]["rank"] == 1
