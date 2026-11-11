"""Invite-only accounts, favourite players and the shared demo account (finish plan F04).

Accounts are created by the operator from the CLI; there is no sign-up. A session is a signed
token that only the dashboard's server proxy sees: it sets it in an HttpOnly cookie and forwards
it as a bearer token. Sessions are stateless, so nothing is stored per sign-in; bumping a user's
``session_version`` ends every session they hold.

The demo account is one shared user that anyone may enter without a password. Its favourites are
a single list, reset nightly to ``DEMO_FAVORITES`` by ``courtlens reset-demo-favorites``. Every
account holds at most ``MAX_FAVORITES`` rows, so the table cannot grow without bound.
"""

from __future__ import annotations

import re
import secrets
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from courtlens.models import User, UserFavoritePlayer, utc_now
from courtlens.security import hash_password, verify_password
from courtlens.workbench_models import WorkbenchIdentity

MAX_FAVORITES = 100
MIN_PASSWORD_LENGTH = 12
DEMO_EMAIL = "guest@demo.courtlens"
DEV_EMAIL = "dev@courtlens.local"
DEV_DISPLAY_NAME = "Dev"
DEMO_DISPLAY_NAME = "Demo account"
# The demo's seeded list (NBA person IDs), restored nightly. Current stars, so their season
# photos and Stats rows exist in every recent release.
DEMO_FAVORITES: tuple[str, ...] = (
    "203999",  # Nikola Jokić
    "1628983",  # Shai Gilgeous-Alexander
    "203507",  # Giannis Antetokounmpo
    "1641705",  # Victor Wembanyama
    "1629029",  # Luka Dončić
    "1630162",  # Anthony Edwards
    "1628973",  # Jalen Brunson
    "201939",  # Stephen Curry
)
PLAYER_ID = re.compile(r"^\d{1,12}$")
# A real argon2 hash to verify against when the email is unknown, so a miss costs the same time.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(24))


class AccountError(ValueError):
    """An operator or user mistake with a message safe to show."""


def normalize_email(email: str) -> str:
    value = email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value) or len(value) > 320:
        raise AccountError("enter a valid email address")
    return value


def _check_password(password: str) -> None:
    if not MIN_PASSWORD_LENGTH <= len(password) <= 128:
        raise AccountError(f"passwords are {MIN_PASSWORD_LENGTH} to 128 characters")


def find_user(session: Session, email: str) -> User | None:
    return session.scalar(select(User).where(func.lower(User.email) == normalize_email(email)))


def create_user(
    session: Session, email: str, password: str, display_name: str | None = None
) -> User:
    """Create an enabled account. Refuses an existing email and the demo address."""
    address = normalize_email(email)
    if address in (DEMO_EMAIL, DEV_EMAIL):
        raise AccountError("that address is reserved")
    _check_password(password)
    if find_user(session, address) is not None:
        raise AccountError("an account with that email already exists")
    user = User(
        email=address,
        password_hash=hash_password(password),
        display_name=(display_name or "").strip()[:80] or None,
        account_enabled=True,
    )
    session.add(user)
    session.commit()
    return user


def _operator_target(session: Session, email: str) -> User:
    user = find_user(session, email)
    if user is None:
        raise AccountError("no account with that email")
    if user.is_demo:
        raise AccountError("the demo account is managed by seed-demo-account")
    return user


def set_password(session: Session, email: str, password: str) -> User:
    """Set a password and enable the account; other sessions end."""
    _check_password(password)
    user = _operator_target(session, email)
    user.password_hash = hash_password(password)
    user.account_enabled = True
    user.session_version += 1
    session.commit()
    return user


def disable_user(session: Session, email: str) -> User:
    user = _operator_target(session, email)
    user.account_enabled = False
    user.session_version += 1
    session.commit()
    return user


def revoke_sessions(session: Session, email: str) -> User:
    user = find_user(session, email)
    if user is None:
        raise AccountError("no account with that email")
    user.session_version += 1
    session.commit()
    return user


def authenticate(session: Session, email: str, password: str) -> User | None:
    """The enabled, non-demo account with this email and password, else None."""
    try:
        address = normalize_email(email)
    except AccountError:
        verify_password(password, _DUMMY_HASH)
        return None
    user = session.scalar(select(User).where(func.lower(User.email) == address))
    if user is None:
        verify_password(password, _DUMMY_HASH)
        return None
    if not verify_password(password, user.password_hash):
        return None
    if not user.account_enabled or user.is_demo:
        return None
    return user


def demo_user(session: Session) -> User | None:
    user = session.scalar(select(User).where(User.is_demo.is_(True)))
    return user if user is not None and user.account_enabled else None


def session_user(session: Session, user_id: str, version: int) -> User | None:
    user = session.get(User, user_id)
    if user is None or not user.account_enabled or user.session_version != version:
        return None
    return user


# ---------------------------------------------------------------------------
# Favourites
# ---------------------------------------------------------------------------


def favorite_ids(session: Session, user: User) -> list[str]:
    return list(
        session.scalars(
            select(UserFavoritePlayer.player_id)
            .where(UserFavoritePlayer.user_id == user.id)
            .order_by(UserFavoritePlayer.added_at, UserFavoritePlayer.player_id)
        )
    )


def _known_player(session: Session, player_id: str) -> bool:
    return (
        session.scalar(
            select(WorkbenchIdentity.id).where(
                WorkbenchIdentity.kind == "player", WorkbenchIdentity.external_id == player_id
            )
        )
        is not None
    )


def add_favorite(session: Session, user: User, player_id: str) -> list[str]:
    """Idempotent. Unknown players and a full list are refused."""
    if not PLAYER_ID.match(player_id) or not _known_player(session, player_id):
        raise AccountError("unknown player")
    current = favorite_ids(session, user)
    if player_id in current:
        return current
    if len(current) >= MAX_FAVORITES:
        raise AccountError(f"favourites are limited to {MAX_FAVORITES} players")
    session.add(UserFavoritePlayer(user_id=user.id, player_id=player_id, added_at=utc_now()))
    session.commit()
    return [*current, player_id]


def remove_favorite(session: Session, user: User, player_id: str) -> list[str]:
    """Idempotent."""
    session.execute(
        delete(UserFavoritePlayer).where(
            UserFavoritePlayer.user_id == user.id, UserFavoritePlayer.player_id == player_id
        )
    )
    session.commit()
    return favorite_ids(session, user)


def describe_favorites(session: Session, ids: list[str]) -> list[dict[str, Any]]:
    """Name, latest season and latest team for each favourite, for season photos and logos."""
    from courtlens.services.entity_lookup import get_or_build_entity_index, resolve_lookup_binding

    try:
        _, dataset_id = resolve_lookup_binding(session, None)
        index = {
            entity.id: entity
            for entity in get_or_build_entity_index(session, dataset_id)
            if entity.kind == "player"
        }
    except Exception:
        session.rollback()
        index = {}
    names: dict[str, str] = {
        str(pid): str(name)
        for pid, name in session.execute(
            select(WorkbenchIdentity.external_id, WorkbenchIdentity.display_name).where(
                WorkbenchIdentity.kind == "player", WorkbenchIdentity.external_id.in_(ids)
            )
        )
    }
    rows: list[dict[str, Any]] = []
    for player_id in ids:
        entity = index.get(player_id)
        rows.append(
            {
                "player_id": player_id,
                "name": (entity.display_name if entity else None) or names.get(player_id),
                "season": entity.seasons[-1] if entity and entity.seasons else None,
                "team": entity.latest_tricode if entity else None,
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Demo account
# ---------------------------------------------------------------------------


def seed_demo_account(session: Session) -> User:
    """Create or repair the demo user. Idempotent; its password is random and never used."""
    user = demo_user(session) or session.scalar(select(User).where(User.is_demo.is_(True)))
    if user is None:
        user = session.scalar(select(User).where(func.lower(User.email) == DEMO_EMAIL))
    if user is None:
        user = User(email=DEMO_EMAIL, password_hash=hash_password(secrets.token_urlsafe(32)))
        session.add(user)
        session.flush()
        new = True
    else:
        new = False
    user.is_demo = True
    user.account_enabled = True
    user.display_name = DEMO_DISPLAY_NAME
    session.commit()
    if new:
        reset_demo_favorites(session)
    return user


def dev_account(session: Session) -> User:
    """The local development account, created on first use. Its password is random and unused."""
    user = session.scalar(select(User).where(func.lower(User.email) == DEV_EMAIL))
    if user is None:
        user = User(
            email=DEV_EMAIL,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            display_name=DEV_DISPLAY_NAME,
            account_enabled=True,
        )
        session.add(user)
        session.commit()
    elif not user.account_enabled:
        raise AccountError("the dev account is disabled")
    return user


def reset_demo_favorites(session: Session) -> int:
    """Replace the demo's shared list with the seed, in one transaction. Stores no history."""
    user = session.scalar(select(User).where(User.is_demo.is_(True)))
    if user is None:
        raise AccountError("no demo account; run courtlens seed-demo-account")
    session.execute(delete(UserFavoritePlayer).where(UserFavoritePlayer.user_id == user.id))
    now = utc_now()
    known = set(
        session.scalars(
            select(WorkbenchIdentity.external_id).where(
                WorkbenchIdentity.kind == "player",
                WorkbenchIdentity.external_id.in_(DEMO_FAVORITES),
            )
        )
    )
    seeded = [pid for pid in DEMO_FAVORITES if pid in known]
    # Strictly increasing timestamps keep the seed's order.
    for offset, player_id in enumerate(seeded):
        session.add(
            UserFavoritePlayer(
                user_id=user.id,
                player_id=player_id,
                added_at=now.replace(microsecond=0) + timedelta(seconds=offset),
            )
        )
    session.commit()
    return len(seeded)


# ---------------------------------------------------------------------------
# Rate limits
# ---------------------------------------------------------------------------


@dataclass
class SlidingWindowLimiter:
    """Events per key in a sliding window, in memory (the API runs one worker).

    At most ``max_keys`` keys are kept; past that, keys with no recent events are dropped and
    then the oldest, so memory stays bounded whatever callers send.
    """

    limit: int
    window_seconds: float
    max_keys: int = 10_000

    def __post_init__(self) -> None:
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> deque[float]:
        events = self._events.get(key)
        if events is None:
            return deque()
        while events and events[0] <= now - self.window_seconds:
            events.popleft()
        return events

    def retry_after(self, key: str, now: float | None = None) -> int:
        """Seconds until another event is allowed; 0 when allowed now."""
        moment = time.monotonic() if now is None else now
        with self._lock:
            events = self._recent(key, moment)
            if len(events) < self.limit:
                return 0
            return max(1, int(events[0] + self.window_seconds - moment) + 1)

    def record(self, key: str, now: float | None = None) -> None:
        moment = time.monotonic() if now is None else now
        with self._lock:
            events = self._recent(key, moment)
            events.append(moment)
            self._events[key] = events
            if len(self._events) > self.max_keys:
                self._prune(moment)

    def clear(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._events.clear()

    def _prune(self, now: float) -> None:
        for key in [
            k for k, v in self._events.items() if not v or v[-1] <= now - self.window_seconds
        ]:
            del self._events[key]
        while len(self._events) > self.max_keys:
            del self._events[next(iter(self._events))]

    def __len__(self) -> int:
        return len(self._events)
