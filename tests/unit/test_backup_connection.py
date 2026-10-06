"""Recovery must honor explicit disposable targets without leaking credentials."""

import io
from pathlib import Path
from unittest.mock import patch

from courtload.services.backup_restore import _dump_postgres_database


def test_docker_dump_honors_selected_database(tmp_path: Path) -> None:
    commands: list[list[str]] = []

    class Process:
        returncode = 0

        def __init__(self, command: list[str], **kwargs: object) -> None:
            commands.append(command)
            self.stdout = io.BytesIO(b"-- selected database dump")

        def communicate(self) -> tuple[bytes, bytes]:
            return b"", b""

    with (
        patch(
            "shutil.which", side_effect=lambda name: "/usr/bin/docker" if name == "docker" else None
        ),
        patch("subprocess.Popen", Process),
    ):
        _dump_postgres_database(
            tmp_path / "dump.sql.gz",
            "postgresql+psycopg://courtload@127.0.0.1:5432/disposable_backup_source",
        )
    assert "disposable_backup_source" in commands[0]
    assert "courtload" not in commands[0][commands[0].index("--dbname") + 1 :]


def test_docker_connection_preserves_endpoint_and_hides_password() -> None:
    from courtload.services.backup_restore import _docker_postgres_connection

    arguments, environment = _docker_postgres_connection(
        "postgresql+psycopg://recovery_user:secret-sentinel@db:5432/source", "target"
    )
    assert arguments == [
        "--host",
        "db",
        "--port",
        "5432",
        "--username",
        "recovery_user",
        "--dbname",
        "target",
    ]
    assert "secret-sentinel" not in " ".join(arguments)
    assert environment["PGPASSWORD"] == "secret-sentinel"


def test_docker_connection_uses_configured_database(monkeypatch) -> None:
    from courtload.services.backup_restore import _docker_postgres_connection

    monkeypatch.setenv("COURTLOAD_DATABASE_URL", "postgresql+psycopg://courtload@db/configured")
    arguments, _ = _docker_postgres_connection(None)
    assert arguments[-1] == "configured"


def test_docker_restore_honors_url_database_without_name_override(tmp_path: Path) -> None:
    import gzip

    from courtload.services.backup_restore import _restore_postgres_database

    commands: list[list[str]] = []

    class Process:
        returncode = 0

        def __init__(self, command: list[str], **kwargs: object) -> None:
            commands.append(command)

        def communicate(self, input: bytes) -> tuple[bytes, bytes]:
            assert input == b"-- disposable restore"
            return b"", b""

    path = tmp_path / "dump.sql.gz"
    with gzip.open(path, "wb") as stream:
        stream.write(b"-- disposable restore")
    with (
        patch(
            "shutil.which", side_effect=lambda name: "/usr/bin/docker" if name == "docker" else None
        ),
        patch("subprocess.Popen", Process),
    ):
        _restore_postgres_database(
            path, database_url="postgresql+psycopg://courtload@db/disposable_restore_target"
        )
    assert commands[0][commands[0].index("--dbname") + 1] == "disposable_restore_target"
    assert Path(commands[0][commands[0].index("-f") + 1]).is_absolute()
