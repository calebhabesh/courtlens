"""Sign-in and favourite players per account (finish plan F04).

Only the dashboard's server proxy calls these. It presents ``COURTLENS_ACCOUNT_PROXY_TOKEN``
(required in production), forwards a salted hash of the client address for the sign-in limits,
keeps the session token in an HttpOnly cookie and forwards it here as a bearer token.
"""

from __future__ import annotations

import hmac
import re
from dataclasses import dataclass
from typing import Any

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.database import get_db
from courtlens.models import User
from courtlens.security import create_session_token, decode_session_token
from courtlens.services import accounts
from courtlens.services.accounts import AccountError, SlidingWindowLimiter

router = APIRouter(tags=["accounts"])
_bearer = HTTPBearer(auto_error=False)
_CLIENT = re.compile(r"^[0-9a-f]{64}$")
PROXY_ONLY = "Accounts are only available through the CourtLens site."
ACCOUNTS_OFF = "Accounts are turned off on this server."
SESSION_ENDED = "Your session has ended. Sign in again."
NO_MATCH = "That email and password don't match an account."


@dataclass(frozen=True)
class AccountLimits:
    failures_by_client: SlidingWindowLimiter
    failures_by_email: SlidingWindowLimiter
    demo_by_client: SlidingWindowLimiter
    writes_by_user: SlidingWindowLimiter


class Limits:
    """Process-wide limiters, built from settings on first use (tests rebuild them)."""

    current: AccountLimits | None = None

    @classmethod
    def build(cls) -> AccountLimits:
        settings = get_settings()
        window = settings.sign_in_window_minutes * 60
        cls.current = AccountLimits(
            failures_by_client=SlidingWindowLimiter(settings.sign_in_failures_per_client, window),
            failures_by_email=SlidingWindowLimiter(settings.sign_in_failures_per_email, window),
            demo_by_client=SlidingWindowLimiter(settings.demo_sign_ins_per_client_hour, 3600),
            writes_by_user=SlidingWindowLimiter(settings.favorite_writes_per_hour, 3600),
        )
        return cls.current

    @classmethod
    def get(cls) -> AccountLimits:
        return cls.current if cls.current is not None else cls.build()


def _too_many(retry_after: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many attempts. Try again later.",
        headers={"Retry-After": str(retry_after)},
    )


def account_client(
    request: Request,
    x_account_token: str | None = Header(None, alias="X-CourtLens-Account-Token"),
    x_client: str | None = Header(None, alias="X-CourtLens-Client"),
) -> str:
    """The calling client's key for limits; refuses callers other than the dashboard proxy."""
    settings = get_settings()
    expected = settings.account_proxy_token
    if expected is not None:
        if not x_account_token or not hmac.compare_digest(
            x_account_token, expected.get_secret_value()
        ):
            raise HTTPException(status_code=403, detail=PROXY_ONLY)
    elif settings.environment == "production":
        raise HTTPException(status_code=403, detail=ACCOUNTS_OFF)
    if x_client and _CLIENT.match(x_client):
        return x_client
    if expected is not None:
        raise HTTPException(status_code=403, detail=PROXY_ONLY)
    return f"local:{request.client.host if request.client else 'unknown'}"


def signed_in(
    _client: str = Depends(account_client),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Sign in to use favourites.")
    try:
        user_id, version = decode_session_token(credentials.credentials)
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=401, detail=SESSION_ENDED) from error
    user = accounts.session_user(session, user_id, version)
    if user is None:
        raise HTTPException(status_code=401, detail=SESSION_ENDED)
    return user


class SignInRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class AccountUser(BaseModel):
    id: str
    name: str
    email: str | None
    is_demo: bool


class SessionResponse(BaseModel):
    user: AccountUser
    token: str
    expires_in: int


class FavoritePlayer(BaseModel):
    player_id: str
    name: str | None
    season: str | None
    team: str | None


class FavoritesResponse(BaseModel):
    player_ids: list[str]
    players: list[FavoritePlayer]
    limit: int
    shared: bool


def _user(user: User) -> AccountUser:
    return AccountUser(
        id=user.id,
        name=user.display_name or user.email.split("@", 1)[0],
        email=None if user.is_demo else user.email,
        is_demo=user.is_demo,
    )


def _session(user: User) -> SessionResponse:
    return SessionResponse(
        user=_user(user),
        token=create_session_token(user.id, user.session_version),
        expires_in=get_settings().session_hours * 3600,
    )


def _favorites(session: Session, user: User, ids: list[str] | None = None) -> FavoritesResponse:
    player_ids = accounts.favorite_ids(session, user) if ids is None else ids
    described: list[dict[str, Any]] = accounts.describe_favorites(session, player_ids)
    return FavoritesResponse(
        player_ids=player_ids,
        players=[FavoritePlayer(**row) for row in described],
        limit=accounts.MAX_FAVORITES,
        shared=user.is_demo,
    )


@router.post("/auth/session", response_model=SessionResponse)
def sign_in(
    payload: SignInRequest,
    client: str = Depends(account_client),
    session: Session = Depends(get_db),
) -> SessionResponse:
    limits = Limits.get()
    by_client, by_email = limits.failures_by_client, limits.failures_by_email
    email_key = payload.email.strip().lower()
    wait = max(by_client.retry_after(client), by_email.retry_after(email_key))
    if wait:
        raise _too_many(wait)
    user = accounts.authenticate(session, payload.email, payload.password)
    if user is None:
        by_client.record(client)
        by_email.record(email_key)
        raise HTTPException(status_code=401, detail=NO_MATCH)
    by_email.clear(email_key)
    return _session(user)


@router.post("/auth/demo-session", response_model=SessionResponse)
def demo_sign_in(
    client: str = Depends(account_client), session: Session = Depends(get_db)
) -> SessionResponse:
    demo_limit = Limits.get().demo_by_client
    wait = demo_limit.retry_after(client)
    if wait:
        raise _too_many(wait)
    demo_limit.record(client)
    user = accounts.demo_user(session)
    if user is None:
        raise HTTPException(status_code=404, detail="The demo account isn't set up on this server.")
    return _session(user)


@router.post("/auth/dev-session", response_model=SessionResponse)
def dev_sign_in(
    _client: str = Depends(account_client), session: Session = Depends(get_db)
) -> SessionResponse:
    """Local development only (COURTLENS_DEV_ACCOUNT); every other server answers 404."""
    settings = get_settings()
    if not settings.dev_account or settings.environment == "production":
        raise HTTPException(status_code=404, detail="Not Found")
    try:
        return _session(accounts.dev_account(session))
    except AccountError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error


@router.get("/me", response_model=AccountUser)
def me(user: User = Depends(signed_in)) -> AccountUser:
    return _user(user)


@router.get("/me/favorites", response_model=FavoritesResponse)
def list_favorites(
    user: User = Depends(signed_in), session: Session = Depends(get_db)
) -> FavoritesResponse:
    return _favorites(session, user)


def _write_allowed(user: User, client: str) -> None:
    writes = Limits.get().writes_by_user
    key = f"{user.id}:{client}"
    wait = writes.retry_after(key)
    if wait:
        raise _too_many(wait)
    writes.record(key)


@router.post("/me/favorites/{player_id}", response_model=FavoritesResponse)
def add_favorite(
    player_id: str,
    client: str = Depends(account_client),
    user: User = Depends(signed_in),
    session: Session = Depends(get_db),
) -> FavoritesResponse:
    _write_allowed(user, client)
    try:
        ids = accounts.add_favorite(session, user, player_id)
    except AccountError as error:
        code = 409 if "limited" in str(error) else 404
        raise HTTPException(status_code=code, detail=str(error)) from error
    return _favorites(session, user, ids)


@router.delete("/me/favorites/{player_id}", response_model=FavoritesResponse)
def remove_favorite(
    player_id: str,
    client: str = Depends(account_client),
    user: User = Depends(signed_in),
    session: Session = Depends(get_db),
) -> FavoritesResponse:
    _write_allowed(user, client)
    return _favorites(session, user, accounts.remove_favorite(session, user, player_id))
