"""Accounts, favourite players and the shared demo account (finish plan F04, accounts plan).

People create accounts with a password (confirmed by an emailed link before it signs in) or with
Google; the operator can still create accounts from the CLI. An address nobody has proven yet
(``email_verified_at`` unset) is claimable: whoever proves the mailbox, by a confirmation link, a
reset link or Google, gets the account, and a password set before then is replaced or cleared, so
pre-registering someone else's address gives no way in. A session is a signed
token that only the dashboard's server proxy sees: it sets it in an HttpOnly cookie and forwards
it as a bearer token. Sessions are stateless, so nothing is stored per sign-in; bumping a user's
``session_version`` ends every session they hold.

The demo account is one shared user that anyone may enter without a password. Its favourites are
a single list, reset nightly to ``DEMO_FAVORITES`` by ``courtlens reset-demo-favorites``. Every
account holds at most ``MAX_FAVORITES`` rows, so the table cannot grow without bound.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.models import AccountToken, User, UserFavoritePlayer, UserIdentity, utc_now
from courtlens.security import hash_password, verify_password
from courtlens.services import account_mail
from courtlens.services.account_mail import Mail
from courtlens.services.google_oauth import GoogleProfile
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
        email_verified_at=utc_now(),
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
    user.email_verified_at = user.email_verified_at or utc_now()
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
    if user is None or user.password_hash is None:
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
# Sign-up, email links, Google (accounts plan)
# ---------------------------------------------------------------------------

CONFIRM = "confirm"
RESET = "reset"
TOKEN_TTL = {CONFIRM: timedelta(hours=24), RESET: timedelta(hours=1)}
UNCONFIRMED_DAYS = 7
LINK_INVALID = "This link has expired or was already used. Ask for a new one."
TURNED_OFF = "This account is turned off."


def _claimable(user: User) -> bool:
    """Nobody has proven this address yet, so proving it takes the account."""
    return not user.is_demo and user.email_verified_at is None


def _prove_email(user: User) -> None:
    if user.email_verified_at is None:
        user.email_verified_at = utc_now()
        user.account_enabled = True


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def issue_token(session: Session, user: User, purpose: str) -> str:
    """A new single-use link token; older unused ones of the same purpose stop working."""
    session.execute(
        delete(AccountToken).where(AccountToken.user_id == user.id, AccountToken.purpose == purpose)
    )
    raw = secrets.token_urlsafe(32)
    now = utc_now()
    session.add(
        AccountToken(
            token_hash=_hash_token(raw),
            user_id=user.id,
            purpose=purpose,
            created_at=now,
            expires_at=now + TOKEN_TTL[purpose],
        )
    )
    session.commit()
    return raw


def _consume(session: Session, raw: str, purpose: str) -> User:
    if not raw or len(raw) > 128:
        raise AccountError(LINK_INVALID)
    token = session.get(AccountToken, _hash_token(raw))
    now = utc_now()
    if (
        token is None
        or token.purpose != purpose
        or token.used_at is not None
        or _aware(token.expires_at) <= now
    ):
        raise AccountError(LINK_INVALID)
    user = session.get(User, token.user_id)
    if user is None or user.is_demo:
        raise AccountError(LINK_INVALID)
    if not user.account_enabled and not _claimable(user):
        raise AccountError(TURNED_OFF)
    token.used_at = now
    return user


def _aware(moment: datetime) -> datetime:
    # SQLite returns naive datetimes; every stored time is UTC.
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=utc_now().tzinfo)


def _links(session: Session, user: User, purpose: str) -> str:
    raw = issue_token(session, user, purpose)
    path = "/account/verify" if purpose == CONFIRM else "/account/reset"
    return account_mail.site_link(f"{path}?token={raw}")


def request_sign_up(
    session: Session, email: str, password: str, display_name: str | None = None
) -> Mail | None:
    """Start a password sign-up. The caller answers the same way whatever this returns.

    New or still-unproven address: store the password and mail a confirmation link. Proven
    address: mail "you already have an account" with a reset link. Turned-off accounts and
    reserved addresses get nothing.
    """
    address = normalize_email(email)
    _check_password(password)
    if address in (DEMO_EMAIL, DEV_EMAIL):
        return None
    name = (display_name or "").strip()[:80] or None
    user = find_user(session, address)
    if user is None:
        user = User(
            email=address,
            password_hash=hash_password(password),
            display_name=name,
            account_enabled=True,
        )
        session.add(user)
        session.commit()
    elif _claimable(user):
        user.password_hash = hash_password(password)
        user.display_name = name or user.display_name
        user.account_enabled = True
        user.session_version += 1
        session.commit()
    else:
        if user.is_demo or not user.account_enabled:
            return None
        return account_mail.existing_account_mail(
            address, account_mail.site_link("/?signin=1"), _links(session, user, RESET)
        )
    return account_mail.confirm_mail(address, _links(session, user, CONFIRM))


def resend_confirmation(session: Session, user: User) -> Mail | None:
    if not _claimable(user) or user.password_hash is None:
        return None
    return account_mail.confirm_mail(user.email, _links(session, user, CONFIRM))


def confirm_email(session: Session, raw: str) -> User:
    user = _consume(session, raw, CONFIRM)
    _prove_email(user)
    session.commit()
    return user


def request_password_reset(session: Session, email: str) -> Mail | None:
    """A reset link for an account that can use one; None otherwise (the caller answers alike)."""
    try:
        address = normalize_email(email)
    except AccountError:
        return None
    user = find_user(session, address)
    if user is None or user.is_demo or address == DEV_EMAIL:
        return None
    if not user.account_enabled and not _claimable(user):
        return None
    return account_mail.reset_mail(address, _links(session, user, RESET))


def reset_password(session: Session, raw: str, password: str) -> User:
    """Set a new password from a reset link; it proves the address and ends other sessions."""
    _check_password(password)
    user = _consume(session, raw, RESET)
    user.password_hash = hash_password(password)
    _prove_email(user)
    user.session_version += 1
    session.commit()
    return user


def google_sign_in(session: Session, profile: GoogleProfile) -> User:
    """The account for a verified Google identity: linked, matched by email, or new."""
    if not profile.email_verified:
        raise AccountError("Your Google account's email isn't verified, so it can't sign in here.")
    identity = session.scalar(
        select(UserIdentity).where(
            UserIdentity.provider == "google", UserIdentity.subject == profile.subject
        )
    )
    if identity is not None:
        user = session.get(User, identity.user_id)
        if user is None or not user.account_enabled or user.is_demo:
            raise AccountError(TURNED_OFF)
        identity.email = profile.email.lower()[:320]
        session.commit()
        return user
    address = normalize_email(profile.email)
    if address in (DEMO_EMAIL, DEV_EMAIL):
        raise AccountError("that address is reserved")
    user = find_user(session, address)
    if user is None:
        user = User(
            email=address,
            password_hash=None,
            display_name=(profile.name or "").strip()[:80] or None,
            account_enabled=True,
            email_verified_at=utc_now(),
        )
        session.add(user)
        session.flush()
    elif _claimable(user):
        # A password nobody confirmed may belong to someone else: it goes.
        user.password_hash = None
        user.session_version += 1
        user.display_name = user.display_name or (profile.name or "").strip()[:80] or None
        _prove_email(user)
    elif not user.account_enabled or user.is_demo:
        raise AccountError(TURNED_OFF)
    session.add(
        UserIdentity(user_id=user.id, provider="google", subject=profile.subject, email=address)
    )
    session.commit()
    return user


def sign_in_methods(session: Session, user: User) -> list[Literal["password", "google"]]:
    methods: list[Literal["password", "google"]] = []
    if user.password_hash is not None and not user.is_demo:
        methods.append("password")
    linked = session.scalar(
        select(func.count()).select_from(UserIdentity).where(UserIdentity.user_id == user.id)
    )
    if linked:
        methods.append("google")
    return methods


def ask_owner(user: User) -> str | None:
    """Ask conversations of a real account follow the account; the demo keeps per-browser ones.

    A keyed hash of the account ID, in the same 64-hex form as the proxy's visitor hashes.
    """
    if user.is_demo:
        return None
    secret = get_settings().jwt_secret.get_secret_value().encode()
    return hmac.new(secret, f"ask-account:{user.id}".encode(), hashlib.sha256).hexdigest()


def delete_account(session: Session, user: User) -> None:
    """Delete an account and everything stored for it. The demo account can't be deleted."""
    if user.is_demo:
        raise AccountError("the demo account can't be deleted")
    owner = ask_owner(user)
    if owner is not None:
        from courtlens.services.assistant.history import delete_visitor_history

        delete_visitor_history(session, owner)
    for model in (UserFavoritePlayer, UserIdentity, AccountToken):
        session.execute(delete(model).where(model.user_id == user.id))
    session.delete(user)
    session.commit()


def prune_accounts(session: Session, now: datetime | None = None) -> dict[str, int]:
    """Delete sign-ups never confirmed within UNCONFIRMED_DAYS, and spent or expired links.

    Only rows a sign-up created (enabled, unproven) qualify; the disabled pre-F04 seed users
    are left alone.
    """
    moment = now or utc_now()
    stale = list(
        session.scalars(
            select(User.id).where(
                User.email_verified_at.is_(None),
                User.account_enabled.is_(True),
                User.is_demo.is_(False),
                User.created_at < moment - timedelta(days=UNCONFIRMED_DAYS),
            )
        )
    )
    linked = set(
        session.scalars(select(UserIdentity.user_id).where(UserIdentity.user_id.in_(stale)))
    )
    stale = [uid for uid in stale if uid not in linked]
    for model in (UserFavoritePlayer, AccountToken):
        session.execute(delete(model).where(model.user_id.in_(stale)))
    session.execute(delete(User).where(User.id.in_(stale)))
    tokens = session.execute(
        delete(AccountToken).where(
            (AccountToken.used_at.is_not(None)) | (AccountToken.expires_at < moment)
        )
    )
    session.commit()
    return {"accounts": len(stale), "links": int(getattr(tokens, "rowcount", 0) or 0)}


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
