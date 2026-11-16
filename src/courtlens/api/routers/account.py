"""Sign-in, sign-up, Google, email links and favourite players per account (F04, accounts plan).

Only the dashboard's server proxy calls these. It presents ``COURTLENS_ACCOUNT_PROXY_TOKEN``
(required in production), forwards a salted hash of the client address for the sign-in limits,
keeps the session token in an HttpOnly cookie and forwards it here as a bearer token.
"""

from __future__ import annotations

import hmac
import re
from collections.abc import Sequence
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
from courtlens.security import create_session_token, decode_session_token, hash_password
from courtlens.services import account_mail, accounts, google_oauth
from courtlens.services.account_mail import Mail, MailUnavailable
from courtlens.services.accounts import AccountError, SlidingWindowLimiter
from courtlens.services.google_oauth import GoogleError

router = APIRouter(tags=["accounts"])
_bearer = HTTPBearer(auto_error=False)
_CLIENT = re.compile(r"^[0-9a-f]{64}$")
PROXY_ONLY = "Accounts are only available through the CourtLens site."
ACCOUNTS_OFF = "Accounts are turned off on this server."
SESSION_ENDED = "Your session has ended. Sign in again."
NO_MATCH = "That email and password don't match an account."
CHECK_EMAIL = "Check your email for a link to finish. It can take a minute to arrive."
NO_EMAIL = "Email isn't available right now, so this can't be done. Try again later or use Google."


@dataclass(frozen=True)
class AccountLimits:
    failures_by_client: SlidingWindowLimiter
    failures_by_email: SlidingWindowLimiter
    demo_by_client: SlidingWindowLimiter
    writes_by_user: SlidingWindowLimiter
    sign_ups_by_client: SlidingWindowLimiter
    emails_by_address: SlidingWindowLimiter
    google_by_client: SlidingWindowLimiter


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
            sign_ups_by_client=SlidingWindowLimiter(settings.sign_ups_per_client_hour, 3600),
            emails_by_address=SlidingWindowLimiter(settings.emails_per_address_hour, 3600),
            google_by_client=SlidingWindowLimiter(settings.google_sign_ins_per_client_hour, 3600),
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
    # How this account can sign in ("password", "google"); empty for the demo account.
    methods: list[str] = Field(default_factory=list)


class SignUpRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)
    name: str | None = Field(default=None, max_length=80)


class EmailRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class TokenRequest(BaseModel):
    token: str = Field(min_length=10, max_length=128)


class ResetRequest(TokenRequest):
    password: str = Field(min_length=1, max_length=128)


class GoogleFinishRequest(BaseModel):
    code: str = Field(min_length=1, max_length=2048)
    verifier: str = Field(min_length=43, max_length=128)
    nonce: str = Field(min_length=16, max_length=128)


class GoogleStartResponse(BaseModel):
    url: str
    state: str
    nonce: str
    verifier: str


class AccountOptions(BaseModel):
    google: bool
    sign_up: bool
    demo: bool


class Accepted(BaseModel):
    status: str = "check_email"
    message: str = CHECK_EMAIL


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


def _user(user: User, methods: Sequence[str] = ()) -> AccountUser:
    return AccountUser(
        id=user.id,
        name=user.display_name or user.email.split("@", 1)[0],
        email=None if user.is_demo else user.email,
        is_demo=user.is_demo,
        methods=list(methods),
    )


def _session(user: User, session: Session | None = None) -> SessionResponse:
    methods = accounts.sign_in_methods(session, user) if session is not None else []
    return SessionResponse(
        user=_user(user, methods),
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
    if user.email_verified_at is None:
        # Only someone who knows the password learns the account waits for confirmation.
        if _email_allowed(user.email):
            _send(accounts.resend_confirmation(session, user), quiet=True)
        raise HTTPException(
            status_code=403,
            detail=f"Confirm your email first. We sent a new link to {user.email}.",
        )
    return _session(user, session)


def _email_allowed(address: str) -> bool:
    limit = Limits.get().emails_by_address
    if limit.retry_after(address):
        return False
    limit.record(address)
    return True


def _send(mail: Mail | None, quiet: bool = False) -> None:
    if mail is None:
        return
    try:
        account_mail.send(mail)
    except MailUnavailable as error:
        if not quiet:
            raise HTTPException(status_code=503, detail=NO_EMAIL) from error


def _email_on() -> None:
    if not account_mail.mail_configured():
        raise HTTPException(status_code=503, detail=NO_EMAIL)


@router.get("/auth/options", response_model=AccountOptions)
def options(
    _client: str = Depends(account_client), session: Session = Depends(get_db)
) -> AccountOptions:
    """Which ways in this server offers, so the dialog shows only working ones."""
    return AccountOptions(
        google=google_oauth.google_configured(),
        sign_up=account_mail.mail_configured(),
        demo=accounts.demo_user(session) is not None,
    )


@router.post("/auth/sign-up", response_model=Accepted, status_code=202)
def sign_up(
    payload: SignUpRequest,
    client: str = Depends(account_client),
    session: Session = Depends(get_db),
) -> Accepted:
    """The same answer whether or not the address has an account (no enumeration)."""
    _email_on()
    limit = Limits.get().sign_ups_by_client
    wait = limit.retry_after(client)
    if wait:
        raise _too_many(wait)
    limit.record(client)
    try:
        mail = accounts.request_sign_up(session, payload.email, payload.password, payload.name)
    except AccountError as error:
        raise HTTPException(status_code=422, detail=_sentence(str(error))) from error
    if mail is None:
        hash_password(payload.password)  # the same work as a new account
    if mail is not None and _email_allowed(mail.to):
        _send(mail)
    return Accepted()


@router.post("/auth/confirm", response_model=SessionResponse)
def confirm(
    payload: TokenRequest,
    _client: str = Depends(account_client),
    session: Session = Depends(get_db),
) -> SessionResponse:
    try:
        user = accounts.confirm_email(session, payload.token)
    except AccountError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return _session(user, session)


@router.post("/auth/forgot-password", response_model=Accepted, status_code=202)
def forgot_password(
    payload: EmailRequest,
    client: str = Depends(account_client),
    session: Session = Depends(get_db),
) -> Accepted:
    _email_on()
    limit = Limits.get().sign_ups_by_client
    wait = limit.retry_after(client)
    if wait:
        raise _too_many(wait)
    limit.record(client)
    mail = accounts.request_password_reset(session, payload.email)
    if mail is not None and _email_allowed(mail.to):
        _send(mail)
    return Accepted()


@router.post("/auth/reset-password", response_model=SessionResponse)
def reset_password(
    payload: ResetRequest,
    _client: str = Depends(account_client),
    session: Session = Depends(get_db),
) -> SessionResponse:
    try:
        user = accounts.reset_password(session, payload.token, payload.password)
    except AccountError as error:
        raise HTTPException(status_code=400, detail=_sentence(str(error))) from error
    return _session(user, session)


@router.get("/auth/google/start", response_model=GoogleStartResponse)
def google_start(client: str = Depends(account_client)) -> GoogleStartResponse:
    limit = Limits.get().google_by_client
    wait = limit.retry_after(client)
    if wait:
        raise _too_many(wait)
    limit.record(client)
    try:
        flow = google_oauth.start()
    except GoogleError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return GoogleStartResponse(
        url=flow.url, state=flow.state, nonce=flow.nonce, verifier=flow.verifier
    )


@router.post("/auth/google", response_model=SessionResponse)
def google_finish(
    payload: GoogleFinishRequest,
    _client: str = Depends(account_client),
    session: Session = Depends(get_db),
) -> SessionResponse:
    try:
        profile = google_oauth.finish(payload.code, payload.verifier, payload.nonce)
        user = accounts.google_sign_in(session, profile)
    except (GoogleError, AccountError) as error:
        raise HTTPException(status_code=400, detail=_sentence(str(error))) from error
    return _session(user, session)


def _sentence(text: str) -> str:
    text = text.strip()
    return (text[:1].upper() + text[1:] + ("" if text.endswith(".") else ".")) if text else text


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
    return _session(user, session)


@router.post("/auth/dev-session", response_model=SessionResponse)
def dev_sign_in(
    _client: str = Depends(account_client), session: Session = Depends(get_db)
) -> SessionResponse:
    """Local development only (COURTLENS_DEV_ACCOUNT); every other server answers 404."""
    settings = get_settings()
    if not settings.dev_account or settings.environment == "production":
        raise HTTPException(status_code=404, detail="Not Found")
    try:
        return _session(accounts.dev_account(session), session)
    except AccountError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error


@router.get("/me", response_model=AccountUser)
def me(user: User = Depends(signed_in), session: Session = Depends(get_db)) -> AccountUser:
    return _user(user, accounts.sign_in_methods(session, user))


@router.delete("/me")
def delete_me(
    client: str = Depends(account_client),
    user: User = Depends(signed_in),
    session: Session = Depends(get_db),
) -> dict[str, bool]:
    """Delete the signed-in account, its favourites, Google links and Ask conversations."""
    _write_allowed(user, client)
    try:
        accounts.delete_account(session, user)
    except AccountError as error:
        raise HTTPException(status_code=403, detail=_sentence(str(error))) from error
    return {"deleted": True}


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
