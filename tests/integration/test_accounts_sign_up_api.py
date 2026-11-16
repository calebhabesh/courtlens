"""Accounts plan: password sign-up with email confirmation, resets, Google sign-in, housekeeping."""

from __future__ import annotations

import hashlib
import time
from collections.abc import Generator
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtlens.api.routers.account import Limits
from courtlens.config import Settings, get_settings
from courtlens.models import AccountToken, User, UserFavoritePlayer, UserIdentity, utc_now
from courtlens.services import account_mail, accounts, google_oauth
from courtlens.services.account_mail import Mail
from courtlens.services.google_oauth import GoogleError, GoogleProfile
from courtlens.workbench_models import WorkbenchIdentity

PASSWORD = "correct horse battery"
OTHER = "another long password"


def who(name: str = "a") -> dict[str, str]:
    return {"X-CourtLens-Client": hashlib.sha256(name.encode()).hexdigest()}


@pytest.fixture(autouse=True)
def isolated(monkeypatch: pytest.MonkeyPatch) -> Generator[list[Mail], None, None]:
    """No real mail, no real Google, and none of the developer's .env account settings."""
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    for name, value in {
        "COURTLENS_GOOGLE_CLIENT_ID": "client-123.apps.googleusercontent.com",
        "COURTLENS_GOOGLE_CLIENT_SECRET": "test-secret",
        "COURTLENS_PUBLIC_SITE_URL": "https://courtlens.example",
    }.items():
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()
    Limits.build()
    account_mail.CAP.reset()
    sent: list[Mail] = []
    monkeypatch.setattr(account_mail, "send", lambda mail, settings=None: sent.append(mail))
    yield sent
    Limits.current = None
    get_settings.cache_clear()


def link_token(mail: Mail) -> str:
    for word in mail.text.split():
        if "token=" in word:
            return parse_qs(urlparse(word).query)["token"][0]
    raise AssertionError(f"no link in {mail.text!r}")


def sign_up(client: TestClient, email: str, password: str = PASSWORD, who_: str = "a") -> Any:
    return client.post(
        "/api/auth/sign-up", json={"email": email, "password": password}, headers=who(who_)
    )


def sign_in(client: TestClient, email: str, password: str = PASSWORD) -> Any:
    return client.post(
        "/api/auth/session", json={"email": email, "password": password}, headers=who()
    )


def bearer(response: Any) -> dict[str, str]:
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}", **who()}


# --- Password sign-up -----------------------------------------------------------------------


def test_sign_up_waits_for_the_emailed_link(api_client: TestClient, isolated: list[Mail]) -> None:
    response = sign_up(api_client, "New@Example.com")
    assert response.status_code == 202
    assert response.json()["status"] == "check_email"
    [mail] = isolated
    assert mail.to == "new@example.com" and "/account/verify?token=" in mail.text
    assert mail.text.count("https://courtlens.example/account/verify") == 1

    # The password doesn't sign in yet, and trying sends a fresh link.
    early = sign_in(api_client, "new@example.com")
    assert early.status_code == 403 and "Confirm your email" in early.json()["detail"]
    assert len(isolated) == 2
    stale = link_token(isolated[0])
    assert (
        api_client.post("/api/auth/confirm", json={"token": stale}, headers=who()).status_code
        == 400
    )

    confirmed = api_client.post(
        "/api/auth/confirm", json={"token": link_token(isolated[1])}, headers=who()
    )
    assert confirmed.json()["user"]["email"] == "new@example.com"
    assert confirmed.json()["user"]["methods"] == ["password"]
    assert api_client.get("/api/me", headers=bearer(confirmed)).status_code == 200
    assert sign_in(api_client, "new@example.com").status_code == 200
    # Links work once.
    again = api_client.post(
        "/api/auth/confirm", json={"token": link_token(isolated[1])}, headers=who()
    )
    assert again.status_code == 400 and "expired or was already used" in again.json()["detail"]


def test_sign_up_answers_alike_for_an_existing_account(
    api_client: TestClient, session: Session, isolated: list[Mail]
) -> None:
    accounts.create_user(session, "owner@example.com", PASSWORD)
    fresh = sign_up(api_client, "someone@example.com", OTHER)
    taken = sign_up(api_client, "owner@example.com", OTHER)
    assert (fresh.status_code, fresh.json()) == (taken.status_code, taken.json())
    assert isolated[1].to == "owner@example.com"
    assert "already have" in isolated[1].subject and "/account/reset?token=" in isolated[1].text
    # The existing password is untouched; the attempted one doesn't work.
    assert sign_in(api_client, "owner@example.com").status_code == 200
    assert sign_in(api_client, "owner@example.com", OTHER).status_code == 401


def test_a_second_sign_up_replaces_an_unconfirmed_password(
    api_client: TestClient, isolated: list[Mail]
) -> None:
    sign_up(api_client, "contested@example.com", OTHER)  # someone who doesn't own the mailbox
    sign_up(api_client, "contested@example.com", PASSWORD, who_="b")  # the owner
    api_client.post("/api/auth/confirm", json={"token": link_token(isolated[-1])}, headers=who())
    assert sign_in(api_client, "contested@example.com").status_code == 200
    assert sign_in(api_client, "contested@example.com", OTHER).status_code == 401


def test_sign_up_checks_input_and_reserved_addresses(
    api_client: TestClient, isolated: list[Mail]
) -> None:
    short = sign_up(api_client, "x@example.com", "short")
    assert short.status_code == 422 and "12 to 128" in short.json()["detail"]
    assert sign_up(api_client, "not-an-email", PASSWORD).status_code == 422
    assert sign_up(api_client, accounts.DEMO_EMAIL, PASSWORD).status_code == 202
    assert isolated == []


def test_sign_up_is_rate_limited_per_client(api_client: TestClient, monkeypatch: Any) -> None:
    monkeypatch.setenv("COURTLENS_SIGN_UPS_PER_CLIENT_HOUR", "2")
    get_settings.cache_clear()
    Limits.build()
    assert sign_up(api_client, "a1@example.com").status_code == 202
    assert sign_up(api_client, "a2@example.com").status_code == 202
    limited = sign_up(api_client, "a3@example.com")
    assert limited.status_code == 429 and int(limited.headers["Retry-After"]) > 0
    assert sign_up(api_client, "a3@example.com", who_="elsewhere").status_code == 202


def test_emails_per_address_are_capped(
    api_client: TestClient, monkeypatch: Any, isolated: list[Mail]
) -> None:
    monkeypatch.setenv("COURTLENS_EMAILS_PER_ADDRESS_HOUR", "1")
    get_settings.cache_clear()
    Limits.build()
    sign_up(api_client, "flood@example.com")
    sign_up(api_client, "flood@example.com", who_="b")
    assert [m.to for m in isolated] == ["flood@example.com"]


def test_production_without_smtp_turns_sign_up_off(
    api_client: TestClient, monkeypatch: Any
) -> None:
    monkeypatch.setattr(account_mail, "mail_configured", lambda settings=None: False)
    options = api_client.get("/api/auth/options", headers=who()).json()
    assert options == {"google": True, "sign_up": False, "demo": False}
    assert sign_up(api_client, "x@example.com").status_code == 503
    forgot = api_client.post(
        "/api/auth/forgot-password", json={"email": "x@example.com"}, headers=who()
    )
    assert forgot.status_code == 503


def test_unconfigured_production_mail_refuses_without_logging_links(monkeypatch: Any) -> None:
    settings = Settings(environment="development")
    assert account_mail.mail_configured(settings)
    production = Settings.model_construct(environment="production", smtp_host=None)
    assert not account_mail.mail_configured(production)


# --- Password reset -------------------------------------------------------------------------


def test_reset_sets_a_password_and_ends_other_sessions(
    api_client: TestClient, session: Session, isolated: list[Mail]
) -> None:
    accounts.create_user(session, "owner@example.com", PASSWORD)
    old = bearer(sign_in(api_client, "owner@example.com"))
    missing = api_client.post(
        "/api/auth/forgot-password", json={"email": "nobody@example.com"}, headers=who()
    )
    known = api_client.post(
        "/api/auth/forgot-password", json={"email": "owner@example.com"}, headers=who()
    )
    assert (missing.status_code, missing.json()) == (known.status_code, known.json())
    [mail] = isolated
    token = link_token(mail)
    short = api_client.post(
        "/api/auth/reset-password", json={"token": token, "password": "x"}, headers=who()
    )
    assert short.status_code == 400
    reset = api_client.post(
        "/api/auth/reset-password", json={"token": token, "password": OTHER}, headers=who()
    )
    assert reset.status_code == 200
    assert api_client.get("/api/me", headers=old).status_code == 401
    assert sign_in(api_client, "owner@example.com", OTHER).status_code == 200
    assert sign_in(api_client, "owner@example.com").status_code == 401
    reused = api_client.post(
        "/api/auth/reset-password", json={"token": token, "password": PASSWORD}, headers=who()
    )
    assert reused.status_code == 400


def test_expired_links_are_refused(session: Session) -> None:
    user = accounts.create_user(session, "owner@example.com", PASSWORD)
    raw = accounts.issue_token(session, user, accounts.RESET)
    row = session.scalar(select(AccountToken))
    assert row is not None
    row.expires_at = utc_now() - timedelta(seconds=1)
    session.commit()
    with pytest.raises(accounts.AccountError, match="expired"):
        accounts.reset_password(session, raw, OTHER)


def test_turned_off_and_demo_accounts_get_no_reset(session: Session) -> None:
    accounts.create_user(session, "off@example.com", PASSWORD)
    accounts.disable_user(session, "off@example.com")
    accounts.seed_demo_account(session)
    assert accounts.request_password_reset(session, "off@example.com") is None
    assert accounts.request_password_reset(session, accounts.DEMO_EMAIL) is None
    assert accounts.request_password_reset(session, "not an email") is None


# --- Google ---------------------------------------------------------------------------------


def profile(email: str, sub: str = "g-1", verified: bool = True) -> GoogleProfile:
    return GoogleProfile(subject=sub, email=email, email_verified=verified, name="Grace Hopper")


def google(client: TestClient, monkeypatch: Any, found: GoogleProfile) -> Any:
    monkeypatch.setattr(google_oauth, "finish", lambda code, verifier, nonce, settings=None: found)
    return client.post(
        "/api/auth/google",
        json={"code": "abc", "verifier": "v" * 64, "nonce": "n" * 32},
        headers=who(),
    )


def test_google_start_returns_a_pkce_authorization_url(api_client: TestClient) -> None:
    body = api_client.get("/api/auth/google/start", headers=who()).json()
    query = parse_qs(urlparse(body["url"]).query)
    assert body["url"].startswith(google_oauth.AUTHORIZATION_URL)
    assert query["client_id"] == ["client-123.apps.googleusercontent.com"]
    assert query["redirect_uri"] == ["https://courtlens.example/api/account/google/callback"]
    assert query["scope"] == ["openid email profile"]
    assert query["state"] == [body["state"]] and query["nonce"] == [body["nonce"]]
    assert query["code_challenge_method"] == ["S256"]
    assert body["verifier"] not in body["url"]


def test_google_is_off_without_credentials(api_client: TestClient, monkeypatch: Any) -> None:
    monkeypatch.delenv("COURTLENS_GOOGLE_CLIENT_SECRET")
    get_settings.cache_clear()
    assert api_client.get("/api/auth/google/start", headers=who()).status_code == 404
    assert api_client.get("/api/auth/options", headers=who()).json()["google"] is False


def test_google_creates_an_account_without_a_password(
    api_client: TestClient, session: Session, monkeypatch: Any
) -> None:
    first = google(api_client, monkeypatch, profile("Grace@Example.com"))
    assert first.status_code == 200, first.text
    user = first.json()["user"]
    assert user["name"] == "Grace Hopper" and user["methods"] == ["google"]
    row = session.get(User, user["id"])
    assert row is not None and row.password_hash is None and row.email_verified_at is not None
    # The same Google account signs into the same CourtLens account, even with a new email.
    again = google(api_client, monkeypatch, profile("grace@new.example"))
    assert again.json()["user"]["id"] == user["id"]
    assert sign_in(api_client, "grace@example.com").status_code == 401


def test_google_links_to_a_confirmed_account_by_email(
    api_client: TestClient, session: Session, monkeypatch: Any
) -> None:
    owner = accounts.create_user(session, "owner@example.com", PASSWORD)
    linked = google(api_client, monkeypatch, profile("owner@example.com"))
    assert linked.json()["user"]["id"] == owner.id
    assert linked.json()["user"]["methods"] == ["password", "google"]
    assert sign_in(api_client, "owner@example.com").status_code == 200


def test_google_clears_a_password_nobody_confirmed(
    api_client: TestClient, session: Session, monkeypatch: Any
) -> None:
    sign_up(api_client, "victim@example.com", OTHER)  # pre-registered by someone else
    taken = google(api_client, monkeypatch, profile("victim@example.com"))
    assert taken.status_code == 200
    assert sign_in(api_client, "victim@example.com", OTHER).status_code == 401
    row = accounts.find_user(session, "victim@example.com")
    assert row is not None and row.password_hash is None


def test_google_refuses_unverified_emails_and_turned_off_accounts(
    api_client: TestClient, session: Session, monkeypatch: Any
) -> None:
    unverified = google(api_client, monkeypatch, profile("u@example.com", verified=False))
    assert unverified.status_code == 400 and "verified" in unverified.json()["detail"]
    accounts.create_user(session, "off@example.com", PASSWORD)
    accounts.disable_user(session, "off@example.com")
    off = google(api_client, monkeypatch, profile("off@example.com", sub="g-2"))
    assert off.status_code == 400 and "turned off" in off.json()["detail"]


def test_id_tokens_are_checked_for_audience_issuer_expiry_and_nonce() -> None:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    settings = Settings(google_client_id="client-123", google_client_secret="s")
    now = int(time.time())
    claims = {
        "iss": "https://accounts.google.com",
        "aud": "client-123",
        "sub": "42",
        "email": "g@example.com",
        "email_verified": True,
        "iat": now,
        "exp": now + 300,
        "nonce": "the-nonce",
    }

    def token(**changes: Any) -> str:
        return jwt.encode({**claims, **changes}, key, algorithm="RS256")

    verify = google_oauth.verify_id_token
    found = verify(token(), "the-nonce", settings, key.public_key())
    assert (found.subject, found.email, found.email_verified) == ("42", "g@example.com", True)
    for bad in (
        token(aud="someone-else"),
        token(iss="https://evil.example"),
        token(exp=now - 3600),
        token(nonce="other"),
    ):
        with pytest.raises(GoogleError):
            verify(bad, "the-nonce", settings, key.public_key())
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(GoogleError):
        verify(token(), "the-nonce", settings, other_key.public_key())


# --- Deleting and pruning -------------------------------------------------------------------


def test_people_can_delete_their_own_account(
    api_client: TestClient, session: Session, monkeypatch: Any
) -> None:
    session.add(
        WorkbenchIdentity(namespace="nba", kind="player", external_id="201939", display_name="SC")
    )
    session.commit()
    signed = bearer(google(api_client, monkeypatch, profile("gone@example.com")))
    assert api_client.post("/api/me/favorites/201939", headers=signed).status_code == 200
    assert api_client.delete("/api/me", headers=signed).json() == {"deleted": True}
    assert accounts.find_user(session, "gone@example.com") is None
    assert session.scalar(select(func.count()).select_from(UserFavoritePlayer)) == 0
    assert session.scalar(select(func.count()).select_from(UserIdentity)) == 0
    assert api_client.get("/api/me", headers=signed).status_code == 401


def test_the_demo_account_cannot_be_deleted(api_client: TestClient, session: Session) -> None:
    accounts.seed_demo_account(session)
    demo = bearer(api_client.post("/api/auth/demo-session", headers=who()))
    assert api_client.delete("/api/me", headers=demo).status_code == 403


def test_prune_removes_stale_sign_ups_only(session: Session) -> None:
    accounts.request_sign_up(session, "stale@example.com", PASSWORD)
    accounts.request_sign_up(session, "recent@example.com", PASSWORD)
    accounts.create_user(session, "owner@example.com", PASSWORD)
    seed = User(email="seed@example.com", password_hash="x", account_enabled=False)
    session.add(seed)
    session.commit()
    for user in session.scalars(select(User)):
        if user.email in ("stale@example.com", "owner@example.com", "seed@example.com"):
            user.created_at = utc_now() - timedelta(days=30)
    session.commit()
    result = accounts.prune_accounts(session)
    assert result["accounts"] == 1
    left = set(session.scalars(select(User.email)))
    assert left == {"recent@example.com", "owner@example.com", "seed@example.com"}


def test_emails_carry_an_html_part_with_escaped_clickable_links() -> None:
    body = account_mail.html_body("Hi <you>.\n\nOpen:\nhttps://x.example/a?token=1&b=2\n")
    assert '<a href="https://x.example/a?token=1&amp;b=2">' in body
    assert "&lt;you&gt;" in body and "<img" not in body
