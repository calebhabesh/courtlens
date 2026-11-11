from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from courtlens.config import Settings, get_settings

ALGORITHM = "HS256"
password_hasher = PasswordHasher(time_cost=2, memory_cost=19_456, parallelism=1)


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    try:
        return password_hasher.verify(encoded, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_access_token(subject: str, settings: Settings | None = None) -> str:
    current = settings or get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=current.access_token_minutes),
        "iss": "courtlens",
        "aud": "courtlens-dashboard",
    }
    return jwt.encode(payload, current.jwt_secret.get_secret_value(), algorithm=ALGORITHM)


def decode_access_token(token: str, settings: Settings | None = None) -> str:
    current = settings or get_settings()
    payload = jwt.decode(
        token,
        current.jwt_secret.get_secret_value(),
        algorithms=[ALGORITHM],
        audience="courtlens-dashboard",
        issuer="courtlens",
    )
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise jwt.InvalidTokenError("token is missing a subject")
    return subject


SESSION_AUDIENCE = "courtlens-session"


def create_session_token(
    user_id: str, session_version: int, settings: Settings | None = None
) -> str:
    """A sign-in session (F04). It lives only in an HttpOnly cookie set by the dashboard proxy."""
    current = settings or get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": user_id,
        "ver": session_version,
        "iat": now,
        "exp": now + timedelta(hours=current.session_hours),
        "iss": "courtlens",
        "aud": SESSION_AUDIENCE,
    }
    return jwt.encode(payload, current.jwt_secret.get_secret_value(), algorithm=ALGORITHM)


def decode_session_token(token: str, settings: Settings | None = None) -> tuple[str, int]:
    """The user ID and session version, or jwt.InvalidTokenError."""
    current = settings or get_settings()
    payload = jwt.decode(
        token,
        current.jwt_secret.get_secret_value(),
        algorithms=[ALGORITHM],
        audience=SESSION_AUDIENCE,
        issuer="courtlens",
    )
    subject = payload.get("sub")
    version = payload.get("ver")
    if not isinstance(subject, str) or not subject or not isinstance(version, int):
        raise jwt.InvalidTokenError("session is missing its subject or version")
    return subject, version
