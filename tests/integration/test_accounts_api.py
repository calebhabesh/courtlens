"""Finish plan F04: invite-only accounts, sessions, sign-in limits, favourites, the demo account."""

from __future__ import annotations

import hashlib
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtlens.api.routers.account import Limits
from courtlens.config import get_settings
from courtlens.models import User, UserFavoritePlayer
from courtlens.security import create_access_token, hash_password
from courtlens.services import accounts
from courtlens.services.accounts import (
    DEMO_FAVORITES,
    MAX_FAVORITES,
    AccountError,
    SlidingWindowLimiter,
)
from courtlens.workbench_models import WorkbenchIdentity

PASSWORD = "correct horse battery"
PROXY_TOKEN = "f04-account-proxy-token-for-tests-0123456789"


def client_key(name: str) -> dict[str, str]:
    return {"X-CourtLens-Client": hashlib.sha256(name.encode()).hexdigest()}


@pytest.fixture(autouse=True)
def fresh_limits() -> Generator[None, None, None]:
    get_settings.cache_clear()
    Limits.build()
    yield
    Limits.current = None
    get_settings.cache_clear()


@pytest.fixture
def players(session: Session) -> list[str]:
    ids = [*DEMO_FAVORITES, *(str(9_000_000 + n) for n in range(MAX_FAVORITES + 2))]
    for pid in ids:
        session.add(
            WorkbenchIdentity(
                namespace="nba", kind="player", external_id=pid, display_name=f"Player {pid}"
            )
        )
    session.commit()
    return ids


def sign_in(client: TestClient, email: str, password: str = PASSWORD, who: str = "a"):  # type: ignore[no-untyped-def]
    return client.post(
        "/api/auth/session", json={"email": email, "password": password}, headers=client_key(who)
    )


def bearer(response) -> dict[str, str]:  # type: ignore[no-untyped-def]
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


# --- Accounts are invite-only ---------------------------------------------------------------


def test_public_registration_is_gone(api_client: TestClient) -> None:
    response = api_client.post(
        "/api/auth/register", json={"email": "new@example.com", "password": "x" * 16}
    )
    assert response.status_code in (404, 405)
    paths = api_client.get("/api/openapi.json").json()["paths"]
    assert "/api/auth/session" in paths and not any("register" in path for path in paths)


def test_operator_creates_an_account_that_can_sign_in(
    api_client: TestClient, session: Session
) -> None:
    accounts.create_user(session, "Owner@Example.com", PASSWORD, "Owner")
    response = sign_in(api_client, "owner@example.com")
    body = response.json()
    assert body["user"] == {
        "id": body["user"]["id"],
        "name": "Owner",
        "email": "owner@example.com",
        "is_demo": False,
    }
    assert body["expires_in"] == 12 * 3600
    assert api_client.get("/api/me", headers=bearer(response)).json()["name"] == "Owner"


def test_create_user_refuses_duplicates_short_passwords_and_the_demo_address(
    session: Session,
) -> None:
    accounts.create_user(session, "a@example.com", PASSWORD)
    with pytest.raises(AccountError, match="already exists"):
        accounts.create_user(session, "A@example.com", PASSWORD)
    with pytest.raises(AccountError, match="12 to 128"):
        accounts.create_user(session, "b@example.com", "short")
    with pytest.raises(AccountError, match="reserved"):
        accounts.create_user(session, accounts.DEMO_EMAIL, PASSWORD)


def test_pre_f04_users_cannot_sign_in(api_client: TestClient, session: Session) -> None:
    # The fantasy-league seed users have public fixture passwords and predate accounts.
    session.add(User(email="demo@courtlens.dev", password_hash=hash_password(PASSWORD)))
    session.commit()
    assert sign_in(api_client, "demo@courtlens.dev").status_code == 401
    accounts.set_password(session, "demo@courtlens.dev", "a new private password")
    assert sign_in(api_client, "demo@courtlens.dev", "a new private password").status_code == 200


def test_wrong_password_and_unknown_email_get_the_same_answer(
    api_client: TestClient, session: Session
) -> None:
    accounts.create_user(session, "a@example.com", PASSWORD)
    wrong = sign_in(api_client, "a@example.com", "not the password")
    unknown = sign_in(api_client, "nobody@example.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


# --- Sessions --------------------------------------------------------------------------------


def test_requests_without_a_valid_session_are_refused(
    api_client: TestClient, session: Session
) -> None:
    user = accounts.create_user(session, "a@example.com", PASSWORD)
    assert api_client.get("/api/me").status_code == 401
    assert api_client.get("/api/me", headers={"Authorization": "Bearer junk"}).status_code == 401
    # A Planner token (other audience) is not a session.
    planner = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    assert api_client.get("/api/me/favorites", headers=planner).status_code == 401


def test_revoking_and_disabling_end_sessions(api_client: TestClient, session: Session) -> None:
    accounts.create_user(session, "a@example.com", PASSWORD)
    first = bearer(sign_in(api_client, "a@example.com"))
    accounts.revoke_sessions(session, "a@example.com")
    assert api_client.get("/api/me", headers=first).status_code == 401
    second = bearer(sign_in(api_client, "a@example.com"))
    assert api_client.get("/api/me", headers=second).status_code == 200
    accounts.disable_user(session, "a@example.com")
    assert api_client.get("/api/me", headers=second).status_code == 401
    assert sign_in(api_client, "a@example.com").status_code == 401


def test_planner_sign_in_is_refused_in_production(
    api_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("COURTLENS_ENVIRONMENT", "production")
    monkeypatch.setenv("COURTLENS_JWT_SECRET", "p" * 40)
    monkeypatch.setenv("COURTLENS_OPERATOR_TOKEN", "o" * 40)
    monkeypatch.setenv("COURTLENS_CORS_ORIGINS", '["https://courtlens.example"]')
    get_settings.cache_clear()
    response = api_client.post("/api/auth/token", json={"email": "a@b.co", "password": "x"})
    assert response.status_code == 404


# --- The dashboard proxy is the only caller ------------------------------------------------


def test_with_a_proxy_token_only_the_proxy_may_call(
    api_client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("COURTLENS_ACCOUNT_PROXY_TOKEN", PROXY_TOKEN)
    get_settings.cache_clear()
    accounts.create_user(session, "a@example.com", PASSWORD)
    assert sign_in(api_client, "a@example.com").status_code == 403
    proxy = {"X-CourtLens-Account-Token": PROXY_TOKEN}
    body = {"email": "a@example.com", "password": PASSWORD}
    # The proxy must also name the client, or the limits could not apply.
    assert api_client.post("/api/auth/session", json=body, headers=proxy).status_code == 403
    response = api_client.post("/api/auth/session", json=body, headers={**proxy, **client_key("a")})
    assert response.status_code == 200
    me = api_client.get("/api/me", headers={**bearer(response), **proxy, **client_key("a")})
    assert me.status_code == 200
    assert api_client.get("/api/me", headers=bearer(response)).status_code == 403


def test_production_without_a_proxy_token_turns_accounts_off(
    api_client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("COURTLENS_ENVIRONMENT", "production")
    monkeypatch.setenv("COURTLENS_JWT_SECRET", "p" * 40)
    monkeypatch.setenv("COURTLENS_OPERATOR_TOKEN", "o" * 40)
    monkeypatch.setenv("COURTLENS_CORS_ORIGINS", '["https://courtlens.example"]')
    get_settings.cache_clear()
    response = api_client.post("/api/auth/demo-session", headers=client_key("a"))
    assert response.status_code == 403
    assert "turned off" in response.json()["detail"]


def test_production_refuses_a_weak_proxy_token(monkeypatch: pytest.MonkeyPatch) -> None:
    from courtlens.config import Settings

    monkeypatch.setenv("COURTLENS_ENVIRONMENT", "production")
    monkeypatch.setenv("COURTLENS_JWT_SECRET", "p" * 40)
    monkeypatch.setenv("COURTLENS_OPERATOR_TOKEN", "o" * 40)
    monkeypatch.setenv("COURTLENS_CORS_ORIGINS", '["https://courtlens.example"]')
    monkeypatch.setenv("COURTLENS_ACCOUNT_PROXY_TOKEN", "short")
    with pytest.raises(ValueError, match="ACCOUNT_PROXY_TOKEN"):
        Settings()


# --- Sign-in limits --------------------------------------------------------------------------


def test_failed_sign_ins_are_limited_per_client(api_client: TestClient, session: Session) -> None:
    accounts.create_user(session, "a@example.com", PASSWORD)
    for _ in range(5):
        assert sign_in(api_client, "a@example.com", "guess", who="attacker").status_code == 401
    blocked = sign_in(api_client, "a@example.com", who="attacker")
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
    # Another client is unaffected (the per-email limit is higher).
    assert sign_in(api_client, "a@example.com", who="owner").status_code == 200


def test_failed_sign_ins_are_limited_per_email_across_clients(
    api_client: TestClient, session: Session
) -> None:
    accounts.create_user(session, "a@example.com", PASSWORD)
    for n in range(10):
        assert sign_in(api_client, "a@example.com", "guess", who=f"bot{n}").status_code == 401
    assert sign_in(api_client, "a@example.com", who="owner").status_code == 429
    assert sign_in(api_client, "b@example.com", "guess", who="owner").status_code == 401


def test_a_successful_sign_in_clears_the_email_count(
    api_client: TestClient, session: Session
) -> None:
    accounts.create_user(session, "a@example.com", PASSWORD)
    for n in range(9):
        sign_in(api_client, "a@example.com", "typo", who=f"device{n}")
    assert sign_in(api_client, "a@example.com", who="device0").status_code == 200
    assert sign_in(api_client, "a@example.com", "typo", who="other").status_code == 401
    assert sign_in(api_client, "a@example.com", who="other").status_code == 200


def test_limiter_memory_is_bounded() -> None:
    limiter = SlidingWindowLimiter(limit=1, window_seconds=60, max_keys=100)
    for n in range(5_000):
        limiter.record(f"k{n}", now=float(n))
    assert len(limiter) <= 100
    assert limiter.retry_after("k4999", now=4999.0) > 0
    assert limiter.retry_after("k4999", now=5100.0) == 0


# --- Favourites per user ---------------------------------------------------------------------


def test_favourites_belong_to_their_user(
    api_client: TestClient, session: Session, players: list[str]
) -> None:
    accounts.create_user(session, "a@example.com", PASSWORD)
    accounts.create_user(session, "b@example.com", PASSWORD)
    a = bearer(sign_in(api_client, "a@example.com"))
    b = bearer(sign_in(api_client, "b@example.com", who="b"))
    added = api_client.post(f"/api/me/favorites/{players[0]}", headers=a).json()
    assert added["player_ids"] == [players[0]]
    assert added["players"][0]["name"] == f"Player {players[0]}"
    assert added["shared"] is False
    api_client.post(f"/api/me/favorites/{players[1]}", headers=b)
    assert api_client.get("/api/me/favorites", headers=a).json()["player_ids"] == [players[0]]
    assert api_client.get("/api/me/favorites", headers=b).json()["player_ids"] == [players[1]]
    # B removing A's player changes nothing for A.
    api_client.delete(f"/api/me/favorites/{players[0]}", headers=b)
    assert api_client.get("/api/me/favorites", headers=a).json()["player_ids"] == [players[0]]


def test_favourite_writes_are_idempotent_and_ordered(
    api_client: TestClient, session: Session, players: list[str]
) -> None:
    accounts.create_user(session, "a@example.com", PASSWORD)
    a = bearer(sign_in(api_client, "a@example.com"))
    for pid in (players[2], players[0], players[2]):
        api_client.post(f"/api/me/favorites/{pid}", headers=a)
    assert api_client.get("/api/me/favorites", headers=a).json()["player_ids"] == [
        players[2],
        players[0],
    ]
    api_client.delete(f"/api/me/favorites/{players[2]}", headers=a)
    gone = api_client.delete(f"/api/me/favorites/{players[2]}", headers=a)
    assert gone.status_code == 200 and gone.json()["player_ids"] == [players[0]]


def test_unknown_players_and_a_full_list_are_refused(
    api_client: TestClient, session: Session, players: list[str]
) -> None:
    user = accounts.create_user(session, "a@example.com", PASSWORD)
    a = bearer(sign_in(api_client, "a@example.com"))
    assert api_client.post("/api/me/favorites/123456789", headers=a).status_code == 404
    assert api_client.post("/api/me/favorites/not-a-player", headers=a).status_code == 404
    for pid in players[:MAX_FAVORITES]:
        accounts.add_favorite(session, user, pid)
    full = api_client.post(f"/api/me/favorites/{players[MAX_FAVORITES]}", headers=a)
    assert full.status_code == 409
    count = session.scalar(
        select(func.count())
        .select_from(UserFavoritePlayer)
        .where(UserFavoritePlayer.user_id == user.id)
    )
    assert count == MAX_FAVORITES


def test_favourite_writes_are_rate_limited(
    api_client: TestClient, session: Session, players: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("COURTLENS_FAVORITE_WRITES_PER_HOUR", "3")
    get_settings.cache_clear()
    Limits.build()
    accounts.create_user(session, "a@example.com", PASSWORD)
    a = bearer(sign_in(api_client, "a@example.com"))
    for pid in players[:3]:
        assert api_client.post(f"/api/me/favorites/{pid}", headers=a).status_code == 200
    assert api_client.delete(f"/api/me/favorites/{players[0]}", headers=a).status_code == 429
    assert api_client.get("/api/me/favorites", headers=a).status_code == 200


# --- The demo account ------------------------------------------------------------------------


def test_demo_sign_in_needs_the_seeded_account(api_client: TestClient) -> None:
    assert api_client.post("/api/auth/demo-session", headers=client_key("a")).status_code == 404


def test_demo_visitors_share_one_list(
    api_client: TestClient, session: Session, players: list[str]
) -> None:
    accounts.seed_demo_account(session)
    first = api_client.post("/api/auth/demo-session", headers=client_key("visitor1"))
    assert first.json()["user"] == {
        "id": first.json()["user"]["id"],
        "name": "Demo account",
        "email": None,
        "is_demo": True,
    }
    one, two = (
        bearer(first),
        bearer(api_client.post("/api/auth/demo-session", headers=client_key("visitor2"))),
    )
    seeded = api_client.get("/api/me/favorites", headers=one).json()
    assert seeded["player_ids"] == list(DEMO_FAVORITES) and seeded["shared"] is True
    extra = players[len(DEMO_FAVORITES)]
    api_client.post(f"/api/me/favorites/{extra}", headers=one)
    assert extra in api_client.get("/api/me/favorites", headers=two).json()["player_ids"]


def test_the_demo_account_has_no_password_sign_in(api_client: TestClient, session: Session) -> None:
    demo = accounts.seed_demo_account(session)
    demo.password_hash = hash_password(PASSWORD)
    session.commit()
    assert sign_in(api_client, accounts.DEMO_EMAIL).status_code == 401
    with pytest.raises(AccountError):
        accounts.set_password(session, accounts.DEMO_EMAIL, PASSWORD)


def test_demo_sign_ins_are_limited_per_client(api_client: TestClient, session: Session) -> None:
    accounts.seed_demo_account(session)
    for _ in range(20):
        assert api_client.post("/api/auth/demo-session", headers=client_key("x")).status_code == 200
    assert api_client.post("/api/auth/demo-session", headers=client_key("x")).status_code == 429
    assert api_client.post("/api/auth/demo-session", headers=client_key("y")).status_code == 200


def test_nightly_reset_restores_the_seed_and_stores_nothing_else(
    session: Session, players: list[str]
) -> None:
    demo = accounts.seed_demo_account(session)
    owner = accounts.create_user(session, "owner@example.com", PASSWORD)
    accounts.add_favorite(session, owner, players[-1])
    for pid in players[len(DEMO_FAVORITES) : len(DEMO_FAVORITES) + 40]:
        accounts.add_favorite(session, demo, pid)
    accounts.remove_favorite(session, demo, DEMO_FAVORITES[0])
    for _ in range(3):
        assert accounts.reset_demo_favorites(session) == len(DEMO_FAVORITES)
    assert accounts.favorite_ids(session, demo) == list(DEMO_FAVORITES)
    # Bounded: the table holds the seed plus other accounts' rows, nothing from the resets.
    assert (
        session.scalar(select(func.count()).select_from(UserFavoritePlayer))
        == len(DEMO_FAVORITES) + 1
    )
    assert accounts.favorite_ids(session, owner) == [players[-1]]


def test_seeding_is_idempotent_and_keeps_todays_list(session: Session, players: list[str]) -> None:
    demo = accounts.seed_demo_account(session)
    accounts.add_favorite(session, demo, players[-1])
    again = accounts.seed_demo_account(session)
    assert again.id == demo.id
    assert session.scalar(select(func.count()).select_from(User).where(User.is_demo)) == 1
    assert players[-1] in accounts.favorite_ids(session, demo)


def test_reset_without_a_demo_account_says_so(session: Session) -> None:
    with pytest.raises(AccountError, match="seed-demo-account"):
        accounts.reset_demo_favorites(session)
