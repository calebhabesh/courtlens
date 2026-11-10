"""Public Ask on the hosted demo: per-visitor and site limits, and private conversation history."""

import hashlib
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from test_conversation_postgres import postgres_conversation as _postgres_fixture
from test_hybrid_assistant_postgres import legacy_api

from courtlens.api.app import create_app
from courtlens.assistant_history_models import AssistantThread
from courtlens.config import get_settings
from courtlens.database import get_db
from courtlens.domain.hybrid_assistant import HybridTurnRequest
from courtlens.services.assistant.public_ask import PUBLIC_ASK

postgres_conversation = _postgres_fixture
TURN = "/api/workbench/assistant/v2/turn"
THREADS = "/api/workbench/assistant/v2/threads"


class KnowledgeOnly:
    def plan(self, *a, **kw):
        raise AssertionError("curated guide answers never call a provider")


def who(name):
    digest = hashlib.sha256(name.encode()).hexdigest()
    return {"X-CourtLens-Visitor": digest, "X-CourtLens-Client": digest}


@pytest.fixture
def public(postgres_conversation, monkeypatch):
    monkeypatch.setenv("COURTLENS_PUBLIC_ASK", "true")
    monkeypatch.setenv("COURTLENS_PUBLIC_ASK_PROMPTS_PER_VISITOR", "2")
    get_settings.cache_clear()
    PUBLIC_ASK.reset()
    legacy_api(monkeypatch, KnowledgeOnly())
    session, _ = postgres_conversation
    now = datetime.now(UTC)
    # The owner's local history, copied to the demo with the database: never listed publicly.
    session.add(
        AssistantThread(id=str(uuid4()), title="Owner's question", created_at=now, updated_at=now)
    )
    session.flush()
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    operator = {"X-Operator-Token": get_settings().operator_token.get_secret_value()}
    with TestClient(app) as client:
        yield client, operator
    PUBLIC_ASK.reset()
    get_settings.cache_clear()


def ask(client, operator, visitor, message="Explain spacing on offense."):
    body = HybridTurnRequest(request_id=uuid4(), message=message).model_dump(mode="json")
    return client.post(TURN, json=body, headers={**operator, **who(visitor)})


def test_public_mode_requires_the_site_proxy_identity(public):
    client, operator = public
    assert client.get(THREADS).status_code == 403
    body = HybridTurnRequest(request_id=uuid4(), message="Explain spacing.").model_dump(mode="json")
    assert client.post(TURN, json=body, headers=operator).status_code == 403
    assert (
        client.get(
            THREADS, headers={"X-CourtLens-Visitor": "x", "X-CourtLens-Client": "y"}
        ).status_code
        == 403
    )


def test_each_visitor_sees_only_their_own_conversations(public):
    client, operator = public
    answer = ask(client, operator, "alice")
    assert answer.status_code == 200, answer.text
    thread = answer.json()["thread_id"]
    mine = client.get(THREADS, headers=who("alice")).json()["threads"]
    assert [t["thread_id"] for t in mine] == [thread]
    assert client.get(THREADS, headers=who("bob")).json()["threads"] == []
    assert client.get(f"{THREADS}/{thread}/turns", headers=who("bob")).status_code == 404
    assert client.get(f"{THREADS}/{thread}/turns", headers=who("alice")).status_code == 200
    # Bob can't continue Alice's thread either.
    body = HybridTurnRequest(request_id=uuid4(), message="And defense?", thread_id=thread)
    stolen = client.post(
        TURN, json=body.model_dump(mode="json"), headers={**operator, **who("bob")}
    )
    assert stolen.status_code == 404
    created = client.post(THREADS, headers={**operator, **who("bob")})
    assert created.status_code == 201
    assert [t["thread_id"] for t in client.get(THREADS, headers=who("bob")).json()["threads"]] == [
        created.json()["thread_id"]
    ]
    assert client.delete(THREADS, headers={**operator, **who("alice")}).status_code == 403


def test_a_visitor_gets_a_few_questions_a_day(public):
    client, operator = public
    assert (
        client.get("/api/workbench/assistant/v2/limits", headers=who("carol")).json()["remaining"]
        == 2
    )
    assert ask(client, operator, "carol").status_code == 200
    assert (
        client.get("/api/workbench/assistant/v2/limits", headers=who("carol")).json()["remaining"]
        == 1
    )
    assert ask(client, operator, "carol").status_code == 200
    refused = ask(client, operator, "carol")
    assert refused.status_code == 429
    detail = refused.json()["detail"]
    assert detail["code"] == "visitor_limit" and detail["remaining"] == 0 and detail["resets_at"]
    # Someone else still can.
    assert ask(client, operator, "dave").status_code == 200


def test_the_site_stops_before_the_free_quota_runs_out(public, monkeypatch):
    client, operator = public
    monkeypatch.setattr(
        PUBLIC_ASK.ledger, "requests_today", lambda name: 475 if name == "gemini" else 0
    )
    refused = ask(client, operator, "erin")
    assert refused.status_code == 429
    assert refused.json()["detail"]["code"] == "site_limit"
    status = client.get("/api/workbench/assistant/v2/limits", headers=who("erin")).json()
    assert status["site_open"] is False and status["remaining"] == 2


def test_local_use_is_unchanged(postgres_conversation, monkeypatch):
    get_settings.cache_clear()
    session, _ = postgres_conversation
    now = datetime.now(UTC)
    session.add(AssistantThread(id=str(uuid4()), title="Local", created_at=now, updated_at=now))
    session.flush()
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    with TestClient(app) as client:
        assert client.get("/api/workbench/assistant/v2/limits").json() == {"enabled": False}
        titles = [t["title"] for t in client.get(THREADS).json()["threads"]]
        assert "Local" in titles
