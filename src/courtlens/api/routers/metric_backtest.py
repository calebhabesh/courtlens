"""Research → Metric Backtest (courtlens-metric-backtest-v1): frozen results, 2026-27 score."""

from typing import Any

from fastapi import APIRouter, HTTPException

from courtlens.services import metric_backtest

router = APIRouter(prefix="/metric-backtest", tags=["metric backtest"])


@router.get("")
def metric_backtest_page() -> dict[str, Any]:
    try:
        return metric_backtest.page()
    except (OSError, ValueError) as error:
        raise HTTPException(503, "Metric backtest results unavailable") from error
