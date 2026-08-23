from __future__ import annotations

import random
import time
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

import httpx
from pydantic import ValidationError

from courtload.ingestion.errors import (
    ProviderAuthenticationError,
    ProviderEntitlementError,
    ProviderError,
    ProviderRateLimitError,
    ProviderSchemaError,
)
from courtload.ingestion.schemas import ProviderPage


@dataclass(frozen=True)
class FetchedPage:
    resource: str
    payload: dict[str, Any]
    status_code: int
    request_url: str


class PoliteRateLimiter:
    def __init__(
        self,
        requests_per_minute: int,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        self.minimum_interval = 60.0 / requests_per_minute
        self.clock = clock
        self.sleeper = sleeper
        self.last_request_at: float | None = None

    def wait(self) -> None:
        now = self.clock()
        if self.last_request_at is not None:
            remaining = self.minimum_interval - (now - self.last_request_at)
            if remaining > 0:
                self.sleeper(remaining)
        self.last_request_at = self.clock()


class BalldontlieClient:
    """Bounded-retry client for the documented BALLDONTLIE NBA v1 contract."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://api.balldontlie.io/v1",
        requests_per_minute: int = 5,
        timeout_seconds: float = 20.0,
        max_attempts: int = 4,
        transport: httpx.BaseTransport | None = None,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        if not api_key.strip():
            raise ProviderAuthenticationError(
                "BALLDONTLIE_API_KEY is required; CourtLoad will not substitute generated records"
            )
        self.max_attempts = max_attempts
        self.sleeper = sleeper
        self.rate_limiter = PoliteRateLimiter(requests_per_minute, sleeper=sleeper)
        self.client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=httpx.Timeout(timeout_seconds),
            headers={
                "Authorization": api_key,
                "Accept": "application/json",
                "User-Agent": "CourtLoad/0.1 (+https://github.com/calebhabesh/courtload)",
            },
            transport=transport,
        )

    def close(self) -> None:
        self.client.close()

    def __enter__(self) -> BalldontlieClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    @staticmethod
    def _expand_params(params: Mapping[str, Any] | None) -> httpx.QueryParams:
        expanded: list[tuple[str, str | int | float | bool | None]] = []
        for key, value in (params or {}).items():
            if value is None:
                continue
            if isinstance(value, Sequence) and not isinstance(value, str | bytes):
                expanded.extend((f"{key}[]", str(item)) for item in value)
            else:
                expanded.append(
                    (key, str(value).lower() if isinstance(value, bool) else str(value))
                )
        return httpx.QueryParams(expanded)

    def _request(self, resource: str, params: Mapping[str, Any] | None) -> FetchedPage:
        last_error: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            self.rate_limiter.wait()
            try:
                response = self.client.get(f"/{resource}", params=self._expand_params(params))
            except (httpx.TimeoutException, httpx.NetworkError) as error:
                last_error = error
                if attempt == self.max_attempts:
                    break
                self.sleeper(min(8.0, 0.5 * 2 ** (attempt - 1)) + random.uniform(0, 0.2))
                continue

            if response.status_code == 401:
                if resource == "stats":
                    raise ProviderEntitlementError(
                        "game-player stats require an NBA ALL-STAR or higher provider tier"
                    )
                raise ProviderAuthenticationError(
                    f"provider rejected the credential for /{resource} (HTTP 401)"
                )
            if response.status_code == 429:
                if attempt == self.max_attempts:
                    raise ProviderRateLimitError(
                        f"provider rate limit persisted after {self.max_attempts} attempts"
                    )
                retry_after = response.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else 2**attempt
                self.sleeper(min(delay, 60.0))
                continue
            if response.status_code in {500, 502, 503, 504}:
                if attempt == self.max_attempts:
                    raise ProviderError(
                        f"provider /{resource} remained unavailable (HTTP {response.status_code})"
                    )
                self.sleeper(min(8.0, 0.5 * 2 ** (attempt - 1)))
                continue
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as error:
                raise ProviderError(
                    f"provider request to /{resource} failed with HTTP {response.status_code}"
                ) from error
            try:
                payload = response.json()
                parsed = ProviderPage.model_validate(payload)
            except (ValueError, ValidationError) as error:
                raise ProviderSchemaError(
                    f"provider /{resource} response does not match the recorded envelope contract"
                ) from error
            return FetchedPage(
                resource=resource,
                payload=parsed.model_dump(mode="json"),
                status_code=response.status_code,
                request_url=str(response.request.url),
            )
        raise ProviderError(f"provider /{resource} request failed: {type(last_error).__name__}")

    def iter_pages(
        self, resource: str, params: Mapping[str, Any] | None = None
    ) -> Iterator[FetchedPage]:
        current = dict(params or {})
        current.setdefault("per_page", 100)
        seen_cursors: set[str] = set()
        while True:
            page = self._request(resource, current)
            yield page
            cursor = page.payload.get("meta", {}).get("next_cursor")
            if cursor in (None, ""):
                return
            cursor_key = str(cursor)
            if cursor_key in seen_cursors:
                raise ProviderSchemaError("provider repeated a pagination cursor")
            seen_cursors.add(cursor_key)
            current["cursor"] = cursor

    def teams(self) -> Iterator[FetchedPage]:
        return self.iter_pages("teams")

    def players(self, *, search: str | None = None) -> Iterator[FetchedPage]:
        return self.iter_pages("players", {"search": search})

    def games(self, *, start: date, end: date) -> Iterator[FetchedPage]:
        return self.iter_pages("games", {"start_date": start, "end_date": end})

    def stats_for_games(self, game_ids: Sequence[int]) -> Iterator[FetchedPage]:
        return self.iter_pages("stats", {"game_ids": list(game_ids), "period": 0})
