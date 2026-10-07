"""The one-time env rewrite preserves secrets, file modes and an exact backup."""

import importlib.util
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location(
    "migrate_env_names", Path(__file__).resolve().parents[2] / "scripts/migrate_env_names.py"
)
assert SPEC is not None and SPEC.loader is not None
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)


def test_migration_keeps_exact_backup_and_values(tmp_path, capsys) -> None:
    path = tmp_path / ".env"
    original = (
        b"# comment COURTLOAD_TOKEN=ignored\r\n"
        b'export COURTLOAD_OPERATOR_TOKEN = "private-secret"\r\n'
        b"NEXT_PUBLIC_COURTLOAD_API_URL=http://localhost:8000\r\n"
        b"GEMINI_API_KEY=provider-secret\r\n"
    )
    path.write_bytes(original)
    path.chmod(0o600)
    changes = migration.migrate(path)
    assert len(changes) == 2
    assert path.read_bytes() == original.replace(
        b"export COURTLOAD_", b"export COURTLENS_"
    ).replace(b"NEXT_PUBLIC_COURTLOAD_", b"NEXT_PUBLIC_COURTLENS_")
    backups = list(tmp_path.glob(".env.bak-*"))
    assert len(backups) == 1 and backups[0].read_bytes() == original
    assert path.stat().st_mode & 0o777 == 0o600
    assert backups[0].stat().st_mode & 0o777 == 0o600
    assert not migration.migrate(path)
    assert len(list(tmp_path.glob(".env.bak-*"))) == 1
    output = capsys.readouterr().out
    assert "private-secret" not in output and "provider-secret" not in output


def test_collision_aborts_without_changing_or_backing_up_file(tmp_path) -> None:
    path = tmp_path / ".env"
    original = "COURTLOAD_OPERATOR_TOKEN=old\nCOURTLENS_OPERATOR_TOKEN=new\n"
    path.write_text(original)
    with pytest.raises(ValueError, match="Both old and new keys"):
        migration.migrate(path)
    assert path.read_text() == original
    assert not list(tmp_path.glob(".env.bak-*"))
