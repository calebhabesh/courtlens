"""Agent tool trust boundary, budgets, and hashed local registries."""

import json
import time
from datetime import date

import pytest

from courtload.services.assistant import operations
from courtload.services.assistant.agent.providers.base import ToolCall
from courtload.services.assistant.agent.tools import declarations, dispatch


def call(name, **arguments):
    return ToolCall(id="call_1", name=name, arguments=arguments)


def test_schemas_cover_only_read_only_tools():
    tools = {tool.name: tool for tool in declarations()}
    assert set(tools) == {
        "query_stats",
        "lookup_entity",
        "list_metrics",
        "awards",
        "finance",
        "site_help",
    }
    schema = tools["query_stats"].parameters
    assert set(schema["discriminator"]["mapping"]) == set(operations.REGISTRY) - {"finance"}
    assert tools["lookup_entity"].parameters["additionalProperties"] is False
    assert "api_key" not in json.dumps([tool.model_dump() for tool in tools.values()])


@pytest.mark.parametrize(
    "name,arguments",
    [
        ("sql", {"sql": "SELECT 1"}),
        ("query_stats", {"operation": "finance", "arguments": {}}),
        ("query_stats", {"operation": "query", "arguments": {"sql": "SELECT 1"}}),
        (
            "query_stats",
            {
                "operation": "query",
                "arguments": {"page": {"limit": 10, "sql": "DROP TABLE players"}},
            },
        ),
        (
            "query_stats",
            {
                "operation": "query",
                "arguments": {"metric_selectors": [{"key": "pts; DROP TABLE players"}]},
            },
        ),
        ("query_stats", {"operation": "query", "arguments": {}, "release_id": "model-selected"}),
        ("query_stats", {"operation": "query", "arguments": {}, "season": "2025-99"}),
        ("query_stats", {"operation": "query", "arguments": {}, "phase": "execute_sql"}),
        ("lookup_entity", {"query": "Robert'); DROP TABLE players;--"}),
        ("lookup_entity", {"query": "a" * 101}),
        ("site_help", {"topic": "players", "shell": "env"}),
        ("awards", {"award": "made_up"}),
        ("finance", {"book_id": "a-key"}),
    ],
)
def test_invalid_arguments_are_safe_recoverable_results(session, name, arguments):
    result = dispatch(session, ToolCall(id="bad", name=name, arguments=arguments))
    assert result.result.is_error
    assert result.result.call_id == "bad"
    assert result.result.payload["error"]["recoverable"]
    assert "DROP" not in json.dumps(result.result.payload)
    assert result.warehouse_result is None


@pytest.mark.parametrize("arguments", [{"topic": "a" * 17000}, {"topic": float("nan")}])
def test_argument_budget_and_nonfinite_values(session, arguments):
    assert dispatch(
        session, ToolCall(id="bad", name="site_help", arguments=arguments)
    ).result.is_error


def test_expired_deadline_does_not_execute(session):
    result = dispatch(session, call("site_help"), deadline=time.monotonic() - 1)
    assert result.result.payload["error"]["code"] == "timeout"
    assert dispatch(session, call("site_help")).result.is_error is False


def test_awards_are_sourced_and_report_registry_gaps(session):
    known = dispatch(
        session, call("awards", award="mvp", season="2024-25"), as_of=date(2026, 10, 7)
    )
    assert not known.result.is_error
    assert known.full_payload["record"]["winner"] == "Shai Gilgeous-Alexander"
    assert known.full_payload["source"]["url"].startswith("https://www.nba.com/")
    assert len(known.full_payload["source"]["content_sha256"]) == 64
    unknown = dispatch(session, call("awards", award="mvp", season="2000-01"))
    assert unknown.result.payload["error"]["code"] == "source_unavailable"


def test_site_help_without_a_release_and_unknown_topic(session):
    index = dispatch(session, call("site_help"))
    assert not index.result.is_error
    players = dispatch(session, call("site_help", topic="players"))
    assert players.full_payload["routes"]
    assert players.full_payload["source"]["content_sha256"]
    assert dispatch(session, call("site_help", topic="xyzzzz")).result.is_error


def test_database_resolution_failure_is_recoverable(session, monkeypatch):
    from sqlalchemy import text

    from courtload.services.assistant.agent import tools

    def broken_resolution(*args, **kwargs):
        session.execute(text("SELECT * FROM nonexistent_ag02_table"))

    with monkeypatch.context() as patch:
        patch.setattr(tools, "resolve_workbench_context", broken_resolution)
        result = dispatch(session, call("list_metrics"))
        assert result.result.payload["error"]["code"] == "execution_failed"
    assert not dispatch(session, call("site_help")).result.is_error


def test_worker_disconnect_is_a_recoverable_error(session, monkeypatch):
    from courtload.services.assistant.agent import tools

    def disconnected(*args, **kwargs):
        raise EOFError

    monkeypatch.setattr(tools, "execute_bounded", disconnected)
    # Finance is independent of basketball resolution, so it reaches the worker directly.
    result = dispatch(
        session,
        call(
            "finance",
            book_id="00000000-0000-0000-0000-000000000000",
            financial_season="2025-26",
            known_at="2026-10-07T00:00:00Z",
            effective_on="2026-10-07",
        ),
    )
    assert result.result.payload["error"]["code"] == "execution_failed"
    assert not dispatch(session, call("site_help")).result.is_error
