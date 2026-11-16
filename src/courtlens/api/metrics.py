from __future__ import annotations

import time
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

from courtlens.api.server_timing import RequestTiming, current_timing

REQUESTS = Counter(
    "courtlens_http_requests_total",
    "HTTP requests processed",
    ("method", "route", "status"),
)
LATENCY = Histogram(
    "courtlens_http_request_duration_seconds",
    "HTTP request duration",
    ("method", "route"),
)


async def observe_request(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    timing = RequestTiming()
    # Bound before the route runs, so its worker thread shares this holder (see server_timing).
    token = current_timing.set(timing)
    started = time.perf_counter()
    try:
        response = await call_next(request)
    finally:
        current_timing.reset(token)
    elapsed = time.perf_counter() - started
    route = request.scope.get("route")
    # Unknown paths share one label to prevent unbounded Prometheus cardinality.
    route_path = getattr(route, "path", "unmatched")
    REQUESTS.labels(request.method, route_path, str(response.status_code)).inc()
    LATENCY.labels(request.method, route_path).observe(elapsed)
    # Time until the response starts; a streamed body's later queries are not counted.
    response.headers["Server-Timing"] = timing.header(elapsed)
    return response


def metrics_response() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
