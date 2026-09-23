"""Calendar split assignment and mandatory lead-time purging."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from courtload.evaluation.config import EvaluationConfig


def split_for_target(config: EvaluationConfig, season: str, target_date: date) -> str | None:
    for name in ("s1", "v1", "v2", "calibration", "s3"):
        split = config.splits[name]
        if split.season == season and split.start <= target_date <= split.end:
            return name
    return None


def is_purged(config: EvaluationConfig, split_name: str, cutoff_date: date) -> bool:
    """Prevent a forecast for a block's game from crossing its calendar boundary."""
    split = config.splits[split_name]
    return cutoff_date < split.start


def cutoff_utc(replay_date: date, timezone: str = "America/New_York") -> datetime:
    """Convert local start-of-day cutoff with date-specific DST rules."""
    return datetime.combine(replay_date, datetime.min.time(), ZoneInfo(timezone)).astimezone(
        ZoneInfo("UTC")
    )
