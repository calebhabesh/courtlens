"""Dated USD estimates; unknown or expired rates never become an invented zero cost."""

from datetime import UTC, date, datetime
from pathlib import Path

import yaml
from pydantic import BaseModel, Field, ValidationError

from courtlens.services.assistant.agent.providers.base import Usage


class ModelPrice(BaseModel):
    input_per_million: float = Field(ge=0)
    output_per_million: float = Field(ge=0)
    search_per_call: float = Field(ge=0)
    cached_input_per_million: float = Field(ge=0)
    cache_write_per_million: float = Field(ge=0)
    max_input_tokens: int = Field(gt=0)
    valid_through: date


class PriceFile(BaseModel):
    checked_at: date
    currency: str
    models: dict[str, ModelPrice]


def estimate_cost(
    path: Path,
    model: str,
    usage: Usage,
    *,
    today: date | None = None,
) -> float | None:
    try:
        prices = PriceFile.model_validate(yaml.safe_load(path.read_text()))
    except (OSError, ValueError, ValidationError, yaml.YAMLError):
        return None
    price = prices.models.get(model)
    now = today or datetime.now(UTC).date()
    if (
        price is None
        or prices.currency != "USD"
        or now > price.valid_through
        or usage.input_tokens > price.max_input_tokens
        or now < prices.checked_at
    ):
        return None
    uncached = usage.input_tokens - usage.cached_input_tokens - usage.cache_write_tokens
    if uncached < 0:
        return None
    return (
        uncached * price.input_per_million
        + usage.cached_input_tokens * price.cached_input_per_million
        + usage.cache_write_tokens * price.cache_write_per_million
        + usage.output_tokens * price.output_per_million
    ) / 1_000_000 + usage.web_searches * price.search_per_call
