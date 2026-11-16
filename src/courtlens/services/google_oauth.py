"""Sign in with Google: authorization-code flow with PKCE, state and nonce (accounts plan).

The API owns the client ID and secret. ``start`` returns Google's authorization URL plus the
state, nonce and PKCE verifier, which the dashboard proxy keeps in a short-lived HttpOnly cookie;
``finish`` exchanges the code (with the verifier and the secret) and verifies the ID token's
signature, issuer, audience, expiry and nonce against Google's published keys.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt

from courtlens.config import Settings, get_settings

AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = ("https://accounts.google.com", "accounts.google.com")
CALLBACK_PATH = "/api/account/google/callback"

_jwks: jwt.PyJWKClient | None = None


class GoogleError(ValueError):
    """The Google sign-in can't complete; the message is safe to show."""


def google_configured(settings: Settings | None = None) -> bool:
    current = settings or get_settings()
    secret = current.google_client_secret
    return bool(current.google_client_id and secret and secret.get_secret_value())


def redirect_uri(settings: Settings | None = None) -> str:
    current = settings or get_settings()
    return current.public_site_url.rstrip("/") + CALLBACK_PATH


@dataclass(frozen=True)
class GoogleStart:
    url: str
    state: str
    nonce: str
    verifier: str


@dataclass(frozen=True)
class GoogleProfile:
    subject: str
    email: str
    email_verified: bool
    name: str | None


def start(settings: Settings | None = None) -> GoogleStart:
    current = settings or get_settings()
    if not google_configured(current):
        raise GoogleError("Google sign-in isn't set up on this server.")
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
    query = urlencode(
        {
            "client_id": current.google_client_id,
            "redirect_uri": redirect_uri(current),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
    )
    return GoogleStart(
        url=f"{AUTHORIZATION_URL}?{query}", state=state, nonce=nonce, verifier=verifier
    )


def _signing_key(token: str) -> Any:
    global _jwks
    if _jwks is None:
        _jwks = jwt.PyJWKClient(JWKS_URL, cache_keys=True, lifespan=3600, timeout=10)
    return _jwks.get_signing_key_from_jwt(token).key


def exchange_code(code: str, verifier: str, settings: Settings) -> str:
    """The ID token for an authorization code."""
    secret = settings.google_client_secret
    try:
        response = httpx.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": secret.get_secret_value() if secret else "",
                "redirect_uri": redirect_uri(settings),
                "grant_type": "authorization_code",
                "code_verifier": verifier,
            },
            timeout=10,
        )
    except httpx.HTTPError as error:
        raise GoogleError("Couldn't reach Google. Try again.") from error
    if response.status_code != 200:
        raise GoogleError("Google didn't accept the sign-in. Try again.")
    token = response.json().get("id_token")
    if not isinstance(token, str):
        raise GoogleError("Google didn't return an identity. Try again.")
    return token


def verify_id_token(
    token: str, nonce: str, settings: Settings, key: Any | None = None
) -> GoogleProfile:
    try:
        claims: dict[str, Any] = jwt.decode(
            token,
            key if key is not None else _signing_key(token),
            algorithms=["RS256"],
            audience=settings.google_client_id,
            issuer=list(ISSUERS),
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
            leeway=60,
        )
    except (jwt.PyJWTError, httpx.HTTPError) as error:
        raise GoogleError("Google's sign-in couldn't be verified. Try again.") from error
    if not secrets.compare_digest(str(claims.get("nonce", "")), nonce):
        raise GoogleError("Google's sign-in couldn't be verified. Try again.")
    email = claims.get("email")
    if not isinstance(email, str) or not email:
        raise GoogleError("Your Google account didn't share an email address.")
    name = claims.get("name")
    return GoogleProfile(
        subject=str(claims["sub"]),
        email=email,
        email_verified=claims.get("email_verified") is True,
        name=name if isinstance(name, str) else None,
    )


def finish(code: str, verifier: str, nonce: str, settings: Settings | None = None) -> GoogleProfile:
    current = settings or get_settings()
    if not google_configured(current):
        raise GoogleError("Google sign-in isn't set up on this server.")
    return verify_id_token(exchange_code(code, verifier, current), nonce, current)
