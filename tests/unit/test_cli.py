import json
from pathlib import Path
from unittest.mock import Mock

import pytest
from sqlalchemy.dialects import postgresql, sqlite
from typer.testing import CliRunner

from courtload.cli import _drop_dbt_schemas, app


def test_drop_dbt_schemas_removes_postgres_layers_in_dependency_order() -> None:
    connection = Mock()
    connection.dialect = postgresql.dialect()

    _drop_dbt_schemas(connection, "analytics")

    statements = [call.args[0] for call in connection.exec_driver_sql.call_args_list]
    assert statements == [
        "DROP SCHEMA IF EXISTS analytics_marts CASCADE",
        "DROP SCHEMA IF EXISTS analytics_intermediate CASCADE",
        "DROP SCHEMA IF EXISTS analytics_staging CASCADE",
    ]


def test_drop_dbt_schemas_is_a_noop_for_sqlite() -> None:
    connection = Mock()
    connection.dialect = sqlite.dialect()

    _drop_dbt_schemas(connection, "analytics")

    connection.exec_driver_sql.assert_not_called()


def test_acquire_archive_command(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    runner = CliRunner()
    fake_manifest = tmp_path / "retrieval-manifest.json"
    fake_manifest.write_text(
        json.dumps(
            {
                "source": "test-source",
                "revision": "test-revision",
                "files": [{"file": "f1.csv", "sha256": "abc"}],
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(
        "courtload.cli.acquire_archive",
        lambda dest, local_source=None: fake_manifest,
    )

    result = runner.invoke(app, ["acquire-archive", "--destination", str(tmp_path)])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["status"] == "verified"
    assert payload["file_count"] == 1
    assert payload["source"] == "test-source"
