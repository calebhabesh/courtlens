from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables or a local .env file."""

    model_config = SettingsConfigDict(
        env_prefix="COURTLOAD_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
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
        if "*" in self.cors_origins:
            raise ValueError("wildcard CORS is not permitted in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
