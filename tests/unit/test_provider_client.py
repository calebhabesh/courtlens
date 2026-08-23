from __future__ import annotations

import httpx
import pytest

from courtload.ingestion.client import BalldontlieClient
from courtload.ingestion.errors import (
    ProviderAuthenticationError,
    ProviderEntitlementError,
    ProviderRateLimitError,
    ProviderSchemaError,
)


def test_client_paginates_with_cursor_and_never_logs_key() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        cursor = request.url.params.get("cursor")
        if cursor is None:
            return httpx.Response(200, json={"data": [{"id": 1}], "meta": {"next_cursor": 25}})
        return httpx.Response(200, json={"data": [{"id": 2}], "meta": {"next_cursor": None}})

    with BalldontlieClient(
        api_key="secret-test-key",
        transport=httpx.MockTransport(handler),
        requests_per_minute=600,
        sleeper=lambda _: None,
    ) as client:
        client.rate_limiter.minimum_interval = 0
        pages = list(client.iter_pages("players"))

    assert [page.payload["data"][0]["id"] for page in pages] == [1, 2]
    assert requests[0].headers["Authorization"] == "secret-test-key"
    assert "secret-test-key" not in str(requests[0].url)


def test_stats_entitlement_failure_is_explicit() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(401, json={"error": "Unauthorized"}))
    with BalldontlieClient(
        api_key="free-key", transport=transport, requests_per_minute=600, sleeper=lambda _: None
    ) as client:
        client.rate_limiter.minimum_interval = 0
        with pytest.raises(ProviderEntitlementError, match="ALL-STAR"):
            list(client.stats_for_games([1]))


def test_truncated_or_wrong_envelope_fails_visibly() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(200, json={"unexpected": []}))
    with BalldontlieClient(
        api_key="key", transport=transport, requests_per_minute=600, sleeper=lambda _: None
    ) as client:
        client.rate_limiter.minimum_interval = 0
        with pytest.raises(ProviderSchemaError, match="envelope"):
            list(client.teams())


def test_retryable_server_error_uses_bounded_retry() -> None:
    attempts = 0
    sleeps: list[float] = []

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(503)
        return httpx.Response(200, json={"data": [], "meta": {}})

    with BalldontlieClient(
        api_key="key",
        transport=httpx.MockTransport(handler),
        requests_per_minute=600,
        sleeper=sleeps.append,
    ) as client:
        client.rate_limiter.minimum_interval = 0
        assert next(iter(client.teams())).payload["data"] == []

    assert attempts == 2
    assert sleeps == [0.5]


def test_rate_limit_honors_retry_after_and_eventually_fails() -> None:
    sleeps: list[float] = []
    transport = httpx.MockTransport(lambda _: httpx.Response(429, headers={"Retry-After": "3"}))
    with BalldontlieClient(
        api_key="key",
        transport=transport,
        requests_per_minute=600,
        max_attempts=2,
        sleeper=sleeps.append,
    ) as client:
        client.rate_limiter.minimum_interval = 0
        with pytest.raises(ProviderRateLimitError, match="persisted after 2 attempts"):
            list(client.teams())

    assert sleeps == [3.0]


def test_repeated_pagination_cursor_fails_visibly() -> None:
    transport = httpx.MockTransport(
        lambda _: httpx.Response(200, json={"data": [{"id": 1}], "meta": {"next_cursor": 25}})
    )
    with BalldontlieClient(
        api_key="key", transport=transport, requests_per_minute=600, sleeper=lambda _: None
    ) as client:
        client.rate_limiter.minimum_interval = 0
        with pytest.raises(ProviderSchemaError, match="repeated a pagination cursor"):
            list(client.players())


def test_timeout_retries_then_recovers() -> None:
    attempts = 0
    sleeps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise httpx.ReadTimeout("fixture timeout", request=request)
        return httpx.Response(200, json={"data": [], "meta": {}})

    with BalldontlieClient(
        api_key="key",
        transport=httpx.MockTransport(handler),
        requests_per_minute=600,
        sleeper=sleeps.append,
    ) as client:
        client.rate_limiter.minimum_interval = 0
        assert next(iter(client.teams())).payload["data"] == []

    assert attempts == 2
    assert len(sleeps) == 1
    assert 0.5 <= sleeps[0] <= 0.7


def test_non_stats_authentication_failure_is_not_mislabeled_as_entitlement() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(401))
    with BalldontlieClient(
        api_key="bad-key", transport=transport, requests_per_minute=600, sleeper=lambda _: None
    ) as client:
        client.rate_limiter.minimum_interval = 0
        with pytest.raises(ProviderAuthenticationError, match="credential"):
            list(client.teams())
