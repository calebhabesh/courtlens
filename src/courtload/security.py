from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from courtload.config import Settings, get_settings

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
        "iss": "courtload",
        "aud": "courtload-dashboard",
    }
    return jwt.encode(payload, current.jwt_secret.get_secret_value(), algorithm=ALGORITHM)


def decode_access_token(token: str, settings: Settings | None = None) -> str:
    current = settings or get_settings()
    payload = jwt.decode(
        token,
        current.jwt_secret.get_secret_value(),
        algorithms=[ALGORITHM],
        audience="courtload-dashboard",
        issuer="courtload",
    )
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise jwt.InvalidTokenError("token is missing a subject")
    return subject
