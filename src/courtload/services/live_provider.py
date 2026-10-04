"""Ordinary opt-in ESPN consumer access, with no retries or access-control bypass."""

import asyncio
import json
from dataclasses import dataclass
from datetime import UTC, date, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from courtload.domain.live import parse_scoreboard, parse_summary

BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"


class LiveProviderError(Exception):
    def __init__(self, reason: str, *, denied: bool = False, retry_after: int = 0, size: int = 0):
        super().__init__(reason)
        self.denied = denied
        self.retry_after = retry_after
        self.size = size


@dataclass(frozen=True)
class LiveFetch:
    raw: bytes
    normalized: dict[str, Any]
    http_date: str | None = None
    source_time: str | None = None


def retry_seconds(value: str) -> int:
    if value.isdigit():
        return int(value)
    try:
        return max(0, int((parsedate_to_datetime(value) - datetime.now(UTC)).total_seconds()))
    except (ValueError, TypeError, OverflowError):
        return 0


class ESPNLiveProvider:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.transport = transport

    def fetch(self, slate: date, game_id: str | None = None) -> LiveFetch:
        return asyncio.run(self._fetch(slate, game_id))

    async def _fetch(self, slate: date, game_id: str | None) -> LiveFetch:
        cap = 2 * 1024 * 1024 if game_id else 512 * 1024
        url = BASE_URL + ("/summary" if game_id else "/scoreboard")
        params = {"event": game_id} if game_id else {"dates": slate.strftime("%Y%m%d")}
        body = bytearray()
        try:
            async with (
                asyncio.timeout(10),
                httpx.AsyncClient(
                    timeout=httpx.Timeout(10, connect=5),
                    follow_redirects=False,
                    transport=self.transport,
                    headers={"Accept-Encoding": "identity"},
                ) as client,
                client.stream("GET", url, params=params) as response,
            ):
                if response.status_code != 200:
                    raise LiveProviderError(
                        f"http_{response.status_code}",
                        denied=response.status_code in {401, 403},
                        retry_after=retry_seconds(response.headers.get("retry-after", "0")),
                    )
                if response.headers.get("content-encoding", "identity") != "identity":
                    raise LiveProviderError("unsupported_content_encoding")
                async for chunk in response.aiter_raw(chunk_size=16384):
                    if len(body) + len(chunk) > cap:
                        raise LiveProviderError("payload_too_large", size=len(body) + len(chunk))
                    body.extend(chunk)
                raw = bytes(body)
                payload = json.loads(raw)
                normalized = (
                    parse_summary(payload, slate, game_id)
                    if game_id
                    else parse_scoreboard(payload, slate)
                )
                source_time = payload.get("lastUpdated")
                return LiveFetch(
                    raw,
                    normalized,
                    response.headers.get("date"),
                    source_time if isinstance(source_time, str) else None,
                )
        except LiveProviderError:
            raise
        except (
            httpx.HTTPError,
            TimeoutError,
            ValueError,
            KeyError,
            TypeError,
            IndexError,
            AttributeError,
        ) as exc:
            raise LiveProviderError(type(exc).__name__, size=len(body)) from exc
