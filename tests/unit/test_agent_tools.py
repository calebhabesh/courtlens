"""Agent tool trust boundary, budgets, and hashed local registries."""

import json
import time
from datetime import date

import pytest

from courtlens.services.assistant import operations
from courtlens.services.assistant.agent.providers.base import ToolCall
from courtlens.services.assistant.agent.tools import declarations, dispatch, repair_stats_call


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

    from courtlens.services.assistant.agent import tools

    def broken_resolution(*args, **kwargs):
        session.execute(text("SELECT * FROM nonexistent_ag02_table"))

    with monkeypatch.context() as patch:
        patch.setattr(tools, "resolve_workbench_context", broken_resolution)
        result = dispatch(session, call("list_metrics"))
        assert result.result.payload["error"]["code"] == "execution_failed"
    assert not dispatch(session, call("site_help")).result.is_error


def test_worker_disconnect_is_a_recoverable_error(session, monkeypatch):
    from courtlens.services.assistant.agent import tools

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


# ---- Argument repair (measured on R16's 224 development calls) ----------------------------------


LEADERS = {
    "entity_kind": "player_season",
    "metric_selectors": [{"key": "pts_per_game", "normalization": "raw"}],
    "sort": [{"direction": "desc", "field": "pts_per_game"}],
    "page": {"limit": 5},
}


@pytest.mark.parametrize(
    "sent,expected",
    [
        # 73 calls: the query wrapped in {"query": ...}.
        (
            {"operation": "query", "season": "2025-26", "arguments": {"query": LEADERS}},
            {"operation": "query", "season": "2025-26", "arguments": LEADERS},
        ),
        # The query at the top level, beside operation.
        (
            {"operation": "query", "season": "2025-26", "query": LEADERS},
            {"operation": "query", "season": "2025-26", "arguments": LEADERS},
        ),
        # The operation inside arguments, scope keys the operation doesn't own hoisted.
        (
            {"arguments": {"operation": "profile", "player_id": "1630567", "season": "2025-26"}},
            {"operation": "profile", "season": "2025-26", "arguments": {"player_id": "1630567"}},
        ),
        # The tool's name given as the operation; the nested operation wins.
        (
            {"operation": "query_stats", "arguments": {"operation": "profile", "player_id": "1"}},
            {"operation": "profile", "arguments": {"player_id": "1"}},
        ),
        # A redundant compare inside a query call: the fields belong to compare.
        (
            {
                "operation": "query",
                "arguments": {"operation": "compare", "player_a": "1", "player_b": "2"},
            },
            {"operation": "compare", "arguments": {"player_a": "1", "player_b": "2"}},
        ),
        # A bare player in a query asks for that player's numbers.
        (
            {"operation": "query", "season": "2025-26", "arguments": {"player_id": "203999"}},
            {"operation": "profile", "season": "2025-26", "arguments": {"player_id": "203999"}},
        ),
        # operation_version is pinned by the server.
        (
            {
                "operation": "profile",
                "operation_version": "profile-v1",
                "arguments": {"player_id": "1"},
            },
            {"operation": "profile", "arguments": {"player_id": "1"}},
        ),
    ],
)
def test_repairs_unambiguous_shapes(sent, expected):
    repaired, notes = repair_stats_call(sent)
    assert repaired == expected
    assert notes


def test_repairs_units_and_pinned_release_inside_a_query():
    sent = {
        "operation": "query",
        "arguments": {
            "entity_kind": "player_season",
            "release_id": "model-chosen",
            "season": "2024-25",
            "season_scope": {"aggregate_multi_season": False, "seasons": ["2024-25"]},
            "metric_selectors": [
                {"key": "pts", "normalization": "per_game"},
                {"key": "blk_per_game", "normalization": "per_game"},
                {"key": "reb_per_game", "normalization": "totals"},
                {"key": "ast", "normalization": "per_36"},
            ],
            "sort": [{"field": "pts", "direction": "desc"}],
        },
    }
    repaired, _ = repair_stats_call(sent)
    query = repaired["arguments"]
    # The inner season isn't moved up: only a call-level season may change the pinned scope.
    assert "season" not in repaired and query["season"] == "2024-25"
    assert "release_id" not in query and "season_scope" not in query
    assert query["metric_selectors"] == [
        {"key": "pts_per_game", "normalization": "raw"},
        {"key": "blk_per_game", "normalization": "raw"},
        {"key": "reb", "normalization": "raw"},
        # No per-36 key exists, so it is left for the validator to name.
        {"key": "ast", "normalization": "per_36"},
    ]
    assert query["sort"] == [{"field": "pts_per_game", "direction": "desc"}]


def test_a_conflicting_season_is_not_silently_chosen():
    sent = {
        "operation": "query",
        "season": "2025-26",
        "arguments": {**LEADERS, "season": "2023-24"},
    }
    repaired, _ = repair_stats_call(sent)
    assert repaired["season"] == "2025-26"
    assert repaired["arguments"]["season"] == "2023-24"


def test_unrepairable_calls_get_specific_safe_corrections(session):
    missing = dispatch(session, call("query_stats", operation="query", season="2025-26"))
    error = missing.result.payload["error"]
    assert error["code"] == "invalid_arguments"
    assert error["example"]["operation"] == "query"
    assert "arguments is required" in error["hint"]
    unknown = dispatch(
        session,
        call("query_stats", operation="profile", arguments={"player_id": "1", "shell; DROP": 1}),
    )
    error = unknown.result.payload["error"]
    assert error["required_fields"] == ["player_id"]
    assert "DROP" not in json.dumps(error)
    bad_operation = dispatch(session, call("query_stats", operation="made_up", arguments={}))
    assert "profile" in bad_operation.result.payload["error"]["operations"]
