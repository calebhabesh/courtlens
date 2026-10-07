from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables or a local .env file."""

    model_config = SettingsConfigDict(
        env_prefix="COURTLOAD_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
        env_ignore_empty=True,
    )

    environment: str = "development"
    database_url: str = "sqlite+pysqlite:///./data/courtload.db"
    jwt_secret: SecretStr = SecretStr("local-development-secret-change-before-deploy")
    access_token_minutes: int = Field(default=720, ge=5, le=10_080)
    cors_origins: list[str] = ["http://localhost:3000"]
    log_level: str = "INFO"

    balldontlie_api_key: SecretStr | None = Field(
        default=None, validation_alias="BALLDONTLIE_API_KEY"
    )
    bdl_base_url: str = "https://api.balldontlie.io/v1"
    bdl_requests_per_minute: int = Field(default=5, ge=1, le=600)
    raw_store_path: Path = Path("data/raw")
    artifacts_root: Path = Path("data/artifacts")
    portraits_cache_path: Path = Path("data/cache/portraits")
    operator_token: SecretStr = SecretStr("local-operator-secret-change-before-deploy")
    live_enabled: bool = False
    worker_refresh_time_utc: str = "09:00"
    worker_poll_interval_seconds: int = Field(default=5, ge=1, le=300)
    worker_heartbeat_interval_seconds: int = Field(default=15, ge=2, le=300)
    worker_lease_timeout_seconds: int = Field(default=60, ge=10, le=3600)
    dbt_schema: str = Field(
        default="analytics",
        validation_alias="DBT_SCHEMA",
        min_length=1,
        max_length=48,
        pattern=r"^[A-Za-z_][A-Za-z0-9_$]*$",
    )
    gemini_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("COURTLOAD_GEMINI_API_KEY", "GEMINI_API_KEY"),
    )
    gemini_model: str = Field(
        default="gemini-3.5-flash-lite",
        validation_alias=AliasChoices("COURTLOAD_GEMINI_MODEL", "GEMINI_MODEL"),
    )
    anthropic_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("COURTLOAD_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"),
    )
    openai_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("COURTLOAD_OPENAI_API_KEY", "OPENAI_API_KEY"),
    )
    assistant_provider: Literal["gemini", "anthropic", "openai", "none"] | None = None
    assistant_model: str | None = Field(default=None, min_length=1, max_length=128)
    assistant_max_steps: int = Field(default=6, ge=1, le=20)
    assistant_max_web_searches: int = Field(default=3, ge=0, le=20)
    assistant_max_tokens: int = Field(default=60000, ge=1024, le=1_000_000)
    assistant_turn_timeout_seconds: int = Field(default=60, ge=1, le=300)
    assistant_prices_file: Path = Path("config/assistant-prices.yaml")

    @field_validator("assistant_provider", "assistant_model", mode="before")
    @classmethod
    def normalize_assistant_selection(cls, value: str | None) -> str | None:
        return value.strip() if value and value.strip() else None

    @field_validator("gemini_api_key", "anthropic_api_key", "openai_api_key", mode="before")
    @classmethod
    def normalize_assistant_key(cls, value: str | SecretStr | None) -> str | SecretStr | None:
        raw = value.get_secret_value() if isinstance(value, SecretStr) else value
        return raw.strip() if raw and raw.strip() else None

    @property
    def resolved_assistant_provider(self) -> Literal["gemini", "anthropic", "openai", "none"]:
        if self.assistant_provider is not None:
            return self.assistant_provider
        for provider in ("gemini", "anthropic", "openai"):
            if getattr(self, f"{provider}_api_key") is not None:
                return provider
        return "none"

    @property
    def resolved_assistant_model(self) -> str:
        from courtload.services.assistant.agent.providers.base import DEFAULT_MODELS

        provider = self.resolved_assistant_provider
        if provider == "none":
            return "none"
        if self.assistant_model is not None:
            return self.assistant_model
        if provider == "gemini" and "gemini_model" in self.model_fields_set:
            return self.gemini_model
        return DEFAULT_MODELS[provider]

    @property
    def assistant_configured(self) -> bool:
        provider = self.resolved_assistant_provider
        return provider != "none" and getattr(self, f"{provider}_api_key") is not None

    @field_validator("environment")
    @classmethod
    def normalize_environment(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"development", "test", "production"}:
            raise ValueError("environment must be development, test, or production")
        return normalized

    @model_validator(mode="after")
    def validate_production_boundaries(self) -> Settings:
        if self.environment != "production":
            return self
        secret = self.jwt_secret.get_secret_value()
        if len(secret) < 32 or any(
            marker in secret.lower() for marker in ("development", "replace")
        ):
            raise ValueError(
                "COURTLOAD_JWT_SECRET must be a unique 32+ character value in production"
            )
        op_secret = self.operator_token.get_secret_value()
        if len(op_secret) < 32 or any(
            marker in op_secret.lower() for marker in ("development", "replace")
        ):
            raise ValueError(
                "COURTLOAD_OPERATOR_TOKEN must be a unique 32+ character value in production"
            )
        if "*" in self.cors_origins:
            raise ValueError("wildcard CORS is not permitted in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
