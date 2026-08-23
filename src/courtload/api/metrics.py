from __future__ import annotations

import time
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

REQUESTS = Counter(
    "courtload_http_requests_total",
    "HTTP requests processed",
    ("method", "route", "status"),
)
LATENCY = Histogram(
    "courtload_http_request_duration_seconds",
    "HTTP request duration",
    ("method", "route"),
)


async def observe_request(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    started = time.perf_counter()
    response = await call_next(request)
    route = request.scope.get("route")
    # Unknown paths share one label to prevent unbounded Prometheus cardinality.
    route_path = getattr(route, "path", "unmatched")
    REQUESTS.labels(request.method, route_path, str(response.status_code)).inc()
    LATENCY.labels(request.method, route_path).observe(time.perf_counter() - started)
    return response


def metrics_response() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
