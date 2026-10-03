from __future__ import annotations

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from courtload import __version__
from courtload.api.metrics import metrics_response, observe_request
from courtload.api.routers import auth, fantasy, public, research, shared_floor, shooting, workbench
from courtload.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    application = FastAPI(
        title="CourtLoad API",
        version=__version__,
        description=(
            "Source-traceable NBA fantasy-week planning. Watchlist availability and player "
            "health are never inferred."
        ),
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Operator-Token"],
    )

    @application.middleware("http")
    async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        response = await observe_request(request, call_next)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        return response

    application.include_router(public.router, prefix="/api")
    application.include_router(workbench.router, prefix="/api")
    application.include_router(shared_floor.router, prefix="/api")
    application.include_router(shooting.router, prefix="/api")
    application.include_router(research.router, prefix="/api")
    application.include_router(auth.router, prefix="/api")
    application.include_router(fantasy.router, prefix="/api")
    application.add_api_route(
        "/metrics", metrics_response, methods=["GET"], include_in_schema=False
    )
    return application
