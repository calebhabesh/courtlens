"""AG02 tools on committed disposable PostgreSQL facts and immutable finance books."""

import hashlib
import json
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import func, select
from test_conversation_postgres import postgres_conversation as _postgres_fixture

from courtlens.domain.conversation import ConversationContext
from courtlens.domain.finance import FinanceRow, export_csv
from courtlens.services.assistant.agent.providers.base import ToolCall
from courtlens.services.assistant.agent.tools import dispatch
from courtlens.services.finance_import import admit_bundle, verify_release
from courtlens.workbench_models import WorkbenchIdentity, WorkbenchPlayerGame, WorkbenchTeamGame

postgres_conversation = _postgres_fixture
pytestmark = pytest.mark.postgres


@pytest.fixture
def tool_data(postgres_conversation):
    session, context = postgres_conversation
    original = session.scalar(select(WorkbenchPlayerGame))
    session.add(
        WorkbenchIdentity(
            namespace="nba", kind="player", external_id="1641705", display_name="Victor Wembanyama"
        )
    )
    for day in range(1, 31):
        session.add(
            WorkbenchPlayerGame(
                dataset_id=context.dataset_id,
                game_id=f"002250{day:04}",
                player_id="1641705",
                team_id="1610612759",
                opponent_id="1610612761",
                game_date=date(2026, 3, day),
                season="2025-26",
                phase="regular_season",
                appearance="appeared",
                minutes_original="30",
                minutes_seconds=1800,
                points=20,
                stats_json={**original.stats_json, "points": 20, "blocks": 4},
                source_version_id=original.source_version_id,
                source_observation_id=original.source_observation_id,
            )
        )
        session.add(
            WorkbenchTeamGame(
                dataset_id=context.dataset_id,
                game_id=f"002250{day:04}",
                team_id="1610612759",
                opponent_id="1610612761",
                game_date=date(2026, 3, day),
                season="2025-26",
                phase="regular_season",
                side="home",
                points=100,
                opponent_points=90,
                stats_json={},
                source_version_id=original.source_version_id,
                source_observation_id=original.source_observation_id,
            )
        )
    session.commit()
    return session, ConversationContext(release_id=context.release_id)


def run(tool_data, name, **arguments):
    session, selections = tool_data
    return dispatch(
        session,
        ToolCall(id="pg_call", name=name, arguments=arguments),
        selections=selections,
        as_of=date(2026, 10, 7),
    )


def stats(tool_data, operation="query", arguments=None, **scope):
    return run(tool_data, "query_stats", operation=operation, arguments=arguments or {}, **scope)


@pytest.mark.parametrize("season", [None, "last season", "last_season", "2025-26"])
def test_last_season_is_server_resolved_and_exact(tool_data, season):
    result = stats(
        tool_data,
        arguments={"metric_selectors": [{"key": "blk_per_game"}]},
        **({"season": season} if season else {}),
    )
    assert not result.result.is_error, result.result.payload
    assert result.context.season == "2025-26"
    assert result.warehouse_result.rows[0]["metrics"]["blk_per_game"] == 4
    assert result.result.payload["units"]["blk_per_game"] == "blocks"
    assert result.warehouse_result.operation_hash == result.result.payload["operation_hash"]
    assert result.warehouse_result.open_url.startswith("/stats?")
    assert (
        result.result.payload["context_fingerprint"]
        == result.warehouse_result.evidence[0].context_fingerprint
    )


def test_unsupported_scope_does_not_poison_next_tool(tool_data):
    for scope in [{"season": "1999-00"}, {"phase": "playoffs"}]:
        bad = stats(tool_data, **scope)
        assert bad.result.payload["error"]["code"] == "unsupported_scope"
        assert bad.result.payload["error"]["available_scopes"]
    assert not stats(tool_data).result.is_error


def test_scope_inheritance_change_cutoff_and_nested_conflict(tool_data):
    session, selections = tool_data
    inherited = selections.model_copy(
        update={"season": "2024-25", "before_date": date(2025, 3, 11), "window": "last_5"}
    )
    call = ToolCall(
        id="scope", name="query_stats", arguments={"operation": "query", "arguments": {}}
    )
    answer = dispatch(session, call, selections=inherited, as_of=date(2026, 10, 7))
    assert not answer.result.is_error
    assert answer.context.before_date == date(2025, 3, 11)
    assert answer.warehouse_result.arguments["window"]["kind"] == "last_5"
    assert answer.warehouse_result.rows[0]["games_played"] == 5
    changed = dispatch(
        session,
        call.model_copy(update={"arguments": {**call.arguments, "season": "last season"}}),
        selections=inherited,
        as_of=date(2026, 10, 7),
    )
    assert changed.context.season == "2025-26"
    assert changed.context.before_date == date(2026, 3, 31)
    conflict = stats(tool_data, "query", {"season": "2024-25"})
    assert conflict.result.is_error
    prior = stats(tool_data, before_date="2026-03-11")
    assert prior.warehouse_result.rows[0]["games_played"] == 10


def test_fuzzy_and_ambiguous_candidates(tool_data):
    typo = run(tool_data, "lookup_entity", query="wenbeyama")
    assert typo.result.payload["candidates"] == [
        {"player_id": "1641705", "name": "Victor Wembanyama"}
    ]
    ambiguous = run(tool_data, "lookup_entity", query="Barnes")
    assert {c["player_id"] for c in ambiguous.result.payload["candidates"]} == {"1630567", "1"}
    assert (
        run(tool_data, "lookup_entity", query="notarealplayer").result.payload["error"]["code"]
        == "unknown_entity"
    )
    chosen = stats(
        tool_data, "profile", {"player_id": typo.result.payload["candidates"][0]["player_id"]}
    )
    assert not chosen.result.is_error


@pytest.mark.parametrize(
    "name,arguments",
    [
        ("list_metrics", {"key": "blk_per_game"}),
        ("awards", {"award": "mvp", "season": "2024-25"}),
        ("site_help", {"topic": "players"}),
    ],
)
def test_catalog_awards_and_help(tool_data, name, arguments):
    result = run(tool_data, name, **arguments)
    assert not result.result.is_error, result.result.payload
    if name == "list_metrics":
        metric = result.full_payload["metrics"][0]
        assert metric["unit"] == "blocks" and metric["formula"]
        assert {s["season"] for s in metric["observed_scopes"]} == {"2024-25", "2025-26"}


@pytest.mark.parametrize(
    "operation,arguments",
    [
        ("definition", {"metric": "blk_per_game"}),
        ("profile", {"player_id": "1641705"}),
        ("compare", {"player_a": "1630567", "player_b": "2"}),
        ("team", {"team_id": "1610612759"}),
        ("compare_periods", {"player_id": "1641705", "metrics": ["pts_per_game"]}),
        ("distribution", {"player_id": "1641705", "metric": "blk"}),
        ("splits", {"player_id": "1641705"}),
        ("similarity", {"target_player_id": "1630567"}),
        ("workload_shifts", {}),
    ],
)
def test_registered_operations_are_bounded_and_evidenced(tool_data, operation, arguments):
    scope = {"season": "2024-25"} if operation in ("compare", "similarity") else {}
    result = stats(tool_data, operation, arguments, **scope)
    assert not result.result.is_error, result.result.payload
    assert result.warehouse_result.operation == operation
    assert len(result.warehouse_result.operation_hash) == 64
    assert len(result.result.payload["result_hash"]) == 64


@pytest.mark.parametrize(
    "operation,arguments,code",
    [
        ("forecast", {"player_id": "1641705"}, "no_issuance"),
        ("position_query", {"position": "center", "query": {}}, "source_unavailable"),
        ("distribution", {"player_id": "1641705", "window_n": 3}, "insufficient_sample"),
        ("profile", {"player_id": "xyzz"}, "invalid_arguments"),
        ("query", {"name": "missingplayer"}, "no_observations"),
    ],
)
def test_operation_gaps_are_recoverable(tool_data, operation, arguments, code):
    result = stats(tool_data, operation, arguments)
    assert result.result.payload["error"]["code"] == code, result.result.payload
    assert result.result.payload["error"]["recoverable"]
    assert not stats(tool_data).result.is_error


def test_injection_rejected_and_tables_unchanged(tool_data):
    session, _ = tool_data
    count = session.scalar(select(func.count()).select_from(WorkbenchPlayerGame))
    result = stats(
        tool_data,
        arguments={"metric_selectors": [{"key": "pts; DROP TABLE workbench_player_games;--"}]},
    )
    assert result.result.payload["error"]["code"] == "invalid_arguments"
    assert session.scalar(select(func.count()).select_from(WorkbenchPlayerGame)) == count
    assert not session.new and not session.dirty and not session.deleted


@pytest.mark.parametrize("value,expected", [("123456789.01", "12345678901"), (None, None)])
def test_finance_is_book_bound_without_basketball_scope(tool_data, tmp_path, value, expected):
    session, _ = tool_data
    now = datetime(2026, 10, 3, tzinfo=UTC)
    raw_source = b"AG02 synthetic contract, not real salary evidence"
    sha = hashlib.sha256(raw_source).hexdigest()
    row = FinanceRow(
        row_id="salary",
        kind="amount",
        source_namespace="nba",
        source_entity_id="1641705",
        nba_player_id="1641705",
        contract_id="synthetic",
        financial_season="2025-26",
        effective_date=date(2025, 7, 1),
        observed_at=now,
        source_sha256=sha,
        source_locator="synthetic",
        original_label="synthetic salary",
        amount_kind="base_salary",
        currency="USD",
        value=value,
    )
    raw = export_csv((row,))
    (tmp_path / "observations.csv").write_bytes(raw)
    (tmp_path / "sources").mkdir()
    (tmp_path / "sources" / sha).write_bytes(raw_source)
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "csv_sha256": hashlib.sha256(raw).hexdigest(),
                "coverage_note": "one synthetic contract",
                "sources": [
                    {
                        "sha256": sha,
                        "url": "https://example.com/synthetic",
                        "observed_at": now.isoformat(),
                        "attribution": "synthetic",
                        "use_basis": "synthetic",
                    }
                ],
                "mappings": [
                    {
                        "source_namespace": "nba",
                        "source_entity_id": "1641705",
                        "nba_player_id": "1641705",
                        "evidence_sha256": sha,
                        "method": "direct_nba_id",
                    }
                ],
            }
        )
    )
    release = admit_bundle(session, tmp_path)
    session.commit()
    before = verify_release(session, release.id)
    result = dispatch(
        session,
        ToolCall(
            id="finance",
            name="finance",
            arguments={
                "book_id": release.id,
                "financial_season": "2025-26",
                "known_at": now.isoformat(),
                "effective_on": "2026-10-03",
            },
        ),
    )
    assert not result.result.is_error, result.result.payload
    assert result.context is None
    assert result.warehouse_result.data["subtotal"]["known_subtotal_cents"] == expected
    assert result.result.payload["data"]["contracts"][0]["known_amount_cents"] == expected
    assert result.result.payload["units"]["known_subtotal_cents"] == "USD cents"
    assert result.warehouse_result.open_url.startswith("/contracts?")
    assert verify_release(session, release.id) == before


def test_payload_cap_keeps_full_server_result(tool_data):
    session, _ = tool_data
    original = session.scalar(
        select(WorkbenchPlayerGame).where(WorkbenchPlayerGame.season == "2025-26")
    )
    for index in range(35):
        session.add(
            WorkbenchPlayerGame(
                dataset_id=original.dataset_id,
                game_id=original.game_id,
                player_id=str(90000 + index),
                team_id=original.team_id,
                opponent_id=original.opponent_id,
                game_date=original.game_date,
                season=original.season,
                phase=original.phase,
                appearance="appeared",
                minutes_original="30",
                minutes_seconds=1800,
                points=index,
                stats_json={**original.stats_json, "points": index},
                source_version_id=original.source_version_id,
                source_observation_id=original.source_observation_id,
            )
        )
    session.commit()
    result = stats(tool_data)
    assert not result.result.is_error, result.result.payload
    assert len(result.warehouse_result.rows) == 36
    assert len(result.full_payload["data"]["items"]) == 36
    assert len(result.result.payload["data"]["items"]) == 25
    assert result.result.payload["truncated_lists"]["/data/items"] == 36
    assert result.warehouse_result.eligible_count == 36


def test_legacy_lookup_defaults_stay_stricter(tool_data):
    from courtlens.services.assistant.operations import resolve_entity

    session, _ = tool_data
    with pytest.raises(ValueError):
        resolve_entity(session, None, "wenbeyama", "player_id")
    assert not run(tool_data, "lookup_entity", query="wenbeyama").result.is_error


def test_parent_sql_failure_does_not_poison_next_tool(tool_data, monkeypatch):
    from sqlalchemy import text

    from courtlens.services.assistant.agent import tools

    session, _ = tool_data

    def broken_resolution(*args, **kwargs):
        session.execute(text("SELECT * FROM nonexistent_ag02_table"))

    with monkeypatch.context() as patch:
        patch.setattr(tools, "resolve_workbench_context", broken_resolution)
        result = run(tool_data, "list_metrics")
        assert result.result.payload["error"]["code"] == "execution_failed"
    assert not stats(tool_data).result.is_error


def test_future_outcomes_do_not_change_prior_tool_evidence(tool_data):
    session, _ = tool_data
    first = stats(tool_data, before_date="2026-03-11")
    future = list(
        session.scalars(
            select(WorkbenchPlayerGame).where(WorkbenchPlayerGame.game_date >= date(2026, 3, 11))
        )
    )
    for row in future:
        row.points = 999
        row.stats_json = {**row.stats_json, "points": 999, "blocks": 999}
    # Deliberate future-mutation control in this disposable fixture only.
    session.info["allow_admin_mutation"] = True
    try:
        session.commit()
    finally:
        session.info.pop("allow_admin_mutation", None)
    second = stats(tool_data, before_date="2026-03-11")
    assert first.warehouse_result.result_hash == second.warehouse_result.result_hash
    assert first.warehouse_result.operation_hash == second.warehouse_result.operation_hash
    assert (
        first.result.payload["context_fingerprint"] == second.result.payload["context_fingerprint"]
    )


def test_latest_completed_season_never_falls_back_to_stale_coverage(postgres_conversation):
    session, context = (
        postgres_conversation  # Only 2024-25 has observed facts, despite the manifest.
    )
    result = dispatch(
        session,
        ToolCall(
            id="latest", name="query_stats", arguments={"operation": "query", "arguments": {}}
        ),
        selections=ConversationContext(release_id=context.release_id),
        as_of=date(2026, 10, 7),
    )
    assert result.result.payload["error"]["code"] == "unsupported_scope"
    assert result.result.payload["error"]["requested"]["season"] == "2025-26"
