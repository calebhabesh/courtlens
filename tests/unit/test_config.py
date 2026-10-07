import pytest
from pydantic import ValidationError

from courtlens.config import Settings


def test_production_rejects_short_or_placeholder_jwt_secret() -> None:
    with pytest.raises(ValidationError, match="unique 32\\+ character"):
        Settings(environment="production", jwt_secret="too-short")
    with pytest.raises(ValidationError, match="unique 32\\+ character"):
        Settings(
            environment="production",
            jwt_secret="replace-this-development-secret-before-deploying",
        )


def test_production_rejects_wildcard_cors() -> None:
    with pytest.raises(ValidationError, match="wildcard CORS"):
        Settings(
            environment="production",
            jwt_secret="a-unique-production-secret-that-is-long-enough",
            cors_origins=["*"],
        )


def test_dbt_schema_uses_the_warehouse_environment_name(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DBT_SCHEMA", "portfolio")

    assert Settings().dbt_schema == "portfolio"


def test_rejects_legacy_process_keys_without_exposing_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COURTLOAD_OPERATOR_TOKEN", "do-not-log")
    monkeypatch.setenv("COURTLOAD_UNKNOWN_OPTION", "also-private")
    with pytest.raises(ValidationError) as caught:
        Settings(_env_file=None)
    message = str(caught.value)
    assert "COURTLOAD_OPERATOR_TOKEN -> COURTLENS_OPERATOR_TOKEN" in message
    assert "COURTLOAD_UNKNOWN_OPTION -> COURTLENS_UNKNOWN_OPTION" in message
    assert "scripts/migrate_env_names.py" in message
    assert "do-not-log" not in message


def test_rejects_legacy_dotenv_keys(tmp_path) -> None:
    dotenv = tmp_path / ".env"
    dotenv.write_text("COURTLOAD_DATABASE_URL=private-url\n")
    with pytest.raises(
        ValidationError, match="COURTLOAD_DATABASE_URL -> COURTLENS_DATABASE_URL"
    ) as caught:
        Settings(_env_file=dotenv)
    assert "private-url" not in str(caught.value)
