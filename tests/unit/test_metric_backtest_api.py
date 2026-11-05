"""R08 API: the page payload, and 503 when a frozen file is missing or changed."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from courtlens.api.app import create_app
from courtlens.services import metric_backtest


def test_page_payload() -> None:
    metric_backtest._cache.clear()
    response = TestClient(create_app()).get("/api/metric-backtest")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"results", "metrics", "omitted", "prospective"}
    assert list(body["metrics"]) == body["results"]["registration"]["parameters"]["candidates"]
    assert body["prospective"]["manifest"]["frozen_at"].startswith("2026-11-05")


def test_missing_results_give_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(metric_backtest, "RESULTS_PATH", Path("missing.json"))
    metric_backtest._cache.clear()
    response = TestClient(create_app()).get("/api/metric-backtest")
    assert response.status_code == 503
