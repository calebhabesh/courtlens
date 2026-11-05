from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AssistantProviderName = Literal["gemini", "groq", "anthropic", "openai"]
ASSISTANT_PROVIDERS: tuple[AssistantProviderName, ...] = ("gemini", "groq", "anthropic", "openai")
# Providers whose keys may be pooled automatically: free-tier quotas, no metered charge.
FREE_TIER_PROVIDERS: tuple[AssistantProviderName, ...] = ("gemini", "groq")


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables or a local .env file."""

    model_config = SettingsConfigDict(
        env_prefix="COURTLENS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
        env_ignore_empty=True,
        hide_input_in_errors=True,
    )

    environment: str = "development"
    database_url: str = "sqlite+pysqlite:///./data/courtlens.db"
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
    # A directory serves its `.current` bundle (moved by the weekly provisional impact run) or its
    # only one; a file pins one (services/served_bundle.py).
    impact_serving_manifest: Path | None = Path("data/derived/impact-serving-v1")
    # Per-team extras for team-filtered rows (scripts/build_impact_team_splits.py), resolved alike.
    impact_team_splits_manifest: Path | None = Path("data/derived/impact-team-splits-v1")
    position_estimates_manifest: Path | None = Path(
        "data/derived/position-estimates-v1/1f8c19f2f4f27e2322d80e59fbe1fa519d299bb970d6cdc60aa2d8febe572a00.json"
    )
    # Sealed by `courtlens refresh-darko` and the daily `refresh-darko-daily`; a directory serves
    # its newest bundle, a file pins one. Absent means DPM columns stay unknown.
    darko_manifest: Path | None = Path("data/derived/darko-dpm-v2")
    # `courtlens refresh-espn-rosters` seals here; the newest intact bundle is served.
    espn_rosters_dir: Path | None = Path("data/derived/espn-rosters-v1")
    # `courtlens refresh-contracts` records here when it last confirmed the newest refresh.
    contracts_check_dir: Path | None = Path("data/derived/contracts-checks")
    # `courtlens refresh-wikipedia-transactions` seals here; Free Agency reads the newest bundle.
    wikipedia_transactions_dir: Path | None = Path("data/derived/wikipedia-transactions-v1")
    # Sealed by `courtlens refresh-free-agency`; absent means the tracker reads not_configured.
    free_agency_manifest: Path | None = Path(
        "data/derived/free-agency-v1/9af16a45e65bd0ac876c635afe65e856545415c27538da8077d6212b136fda58.json"
    )
    value_archetypes_manifest: Path | None = Path(
        "data/derived/value-archetypes-v1/serving/5caeb935e21fce5842fb5ebb33c7ad515cb550eb2021b88886ca3e7b5b6e2f7e.json"
    )
    # Directories resolve like impact serving (services/served_bundle.py); a file pins one.
    wowy_manifest: Path | None = Path("data/derived/wowy-v1")
    win_probability_serving_dir: Path = Path("data/derived/win-probability-serving")
    win_probability_models_dir: Path = Path("data/artifacts/win-probability")
    win_probability_snapshots_dir: Path = Path("data/derived/win-probability-ratings")
    projected_impact_serving_dir: Path = Path("data/derived/projected-impact-serving")
    projected_impact_models_dir: Path = Path("data/artifacts/projected-impact")
    metric_backtest_serving_dir: Path = Path("data/derived/metric-backtest-serving")
    # Sealed by `courtlens.evaluation.stint_box_runner`; absent means focal stats beyond points
    # stay unknown for IM03 stints.
    stint_box_manifest: Path | None = Path("data/derived/stint-box-v1/manifest")
    # Sealed by `courtlens acquire-shot-zones` (Player Twins); a file pins one bundle.
    shot_zones_manifest: Path | None = Path("data/derived/shot-zones-v1")
    # Written by `scripts/series_matchups.py` from the retained NBA.com matchup archives.
    series_matchups_dir: Path | None = Path("data/derived/series-matchups-v1")
    portraits_cache_path: Path = Path("data/cache/portraits")
    operator_token: SecretStr = SecretStr("local-operator-secret-change-before-deploy")
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
        validation_alias=AliasChoices("COURTLENS_GEMINI_API_KEY", "GEMINI_API_KEY"),
    )
    gemini_model: str = Field(
        default="gemini-3.5-flash-lite",
        validation_alias=AliasChoices("COURTLENS_GEMINI_MODEL", "GEMINI_MODEL"),
    )
    anthropic_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("COURTLENS_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"),
    )
    openai_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("COURTLENS_OPENAI_API_KEY", "OPENAI_API_KEY"),
    )
    groq_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("COURTLENS_GROQ_API_KEY", "GROQ_API_KEY"),
    )
    # Comma-separated. Groq free-tier limits are per model, so each model is its own pool member
    # (about 8,000 tokens/minute each); the first is the preferred one.
    groq_model: str = Field(
        default="openai/gpt-oss-120b,qwen/qwen3.8-27b",
        min_length=1,
        max_length=256,
        validation_alias=AliasChoices("COURTLENS_GROQ_MODEL", "GROQ_MODEL"),
    )
    assistant_provider: AssistantProviderName | Literal["none"] | None = None
    # Ordered, comma-separated provider pool ("gemini,groq"). Unset pools every configured
    # free-tier provider; paid providers join only when listed here or selected above.
    assistant_providers: str | None = Field(default=None, max_length=128)
    # Optional local pacing for providers that publish no rate-limit headers (Gemini). Unset
    # means unknown: the pool then relies on the provider's own 429 quota details.
    gemini_requests_per_minute: int | None = Field(default=None, ge=1, le=100_000)
    gemini_tokens_per_minute: int | None = Field(default=None, ge=1000, le=100_000_000)
    gemini_requests_per_day: int | None = Field(default=None, ge=1, le=10_000_000)
    assistant_model: str | None = Field(default=None, min_length=1, max_length=128)
    assistant_max_steps: int = Field(default=6, ge=1, le=20)
    assistant_max_web_searches: int = Field(default=3, ge=0, le=20)
    assistant_max_tokens: int = Field(default=60000, ge=1024, le=1_000_000)
    assistant_turn_timeout_seconds: int = Field(default=60, ge=1, le=300)
    assistant_prices_file: Path = Path("config/assistant-prices.yaml")

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_environment(cls, values: dict[str, Any]) -> dict[str, Any]:
        """Fail explicitly for stale process or dotenv keys instead of ignoring them."""
        prefix = "COURTLOAD_"
        names = sorted(
            {
                key.upper()
                for key in (*os.environ, *values)
                if key.upper().startswith((prefix, "NEXT_PUBLIC_" + prefix))
            }
        )
        if names:
            replacements = ", ".join(
                f"{name} -> {name.replace(prefix, 'COURTLENS_', 1)}" for name in names
            )
            raise ValueError(
                f"Legacy environment names: {replacements}. "
                "Run scripts/migrate_env_names.py on your .env file."
            )
        return values

    @field_validator("assistant_provider", "assistant_model", mode="before")
    @classmethod
    def normalize_assistant_selection(cls, value: str | None) -> str | None:
        return value.strip() if value and value.strip() else None

    @field_validator("assistant_providers", mode="before")
    @classmethod
    def normalize_provider_pool(cls, value: str | None) -> str | None:
        if value is None or not str(value).strip():
            return None
        names = [name.strip().lower() for name in str(value).split(",") if name.strip()]
        unknown = sorted(set(names) - set(ASSISTANT_PROVIDERS))
        if unknown:
            raise ValueError(f"unknown assistant providers: {', '.join(unknown)}")
        return ",".join(dict.fromkeys(names))

    @field_validator(
        "gemini_api_key", "anthropic_api_key", "openai_api_key", "groq_api_key", mode="before"
    )
    @classmethod
    def normalize_assistant_key(cls, value: str | SecretStr | None) -> str | SecretStr | None:
        raw = value.get_secret_value() if isinstance(value, SecretStr) else value
        return raw.strip() if raw and raw.strip() else None

    def provider_key(self, provider: str) -> SecretStr | None:
        key = getattr(self, f"{provider}_api_key", None)
        return key if isinstance(key, SecretStr) else None

    @property
    def resolved_assistant_providers(self) -> list[AssistantProviderName]:
        """Ordered pool with keys. Paid providers are never added implicitly."""
        if self.assistant_provider == "none":
            return []
        if self.assistant_providers is not None:
            listed = [p for p in ASSISTANT_PROVIDERS if p in self.assistant_providers.split(",")]
            order = sorted(listed, key=self.assistant_providers.split(",").index)
            return [p for p in order if self.provider_key(p) is not None]
        if self.assistant_provider is not None:
            return [self.assistant_provider]
        free = [p for p in FREE_TIER_PROVIDERS if self.provider_key(p) is not None]
        if free:
            return free
        for provider in ("anthropic", "openai"):
            if self.provider_key(provider) is not None:
                return [provider]
        return []

    @property
    def resolved_assistant_provider(self) -> AssistantProviderName | Literal["none"]:
        if self.assistant_provider is not None and self.assistant_providers is None:
            return self.assistant_provider
        pool = self.resolved_assistant_providers
        return pool[0] if pool else "none"

    def assistant_model_for(self, provider: str) -> str:
        from courtlens.services.assistant.agent.providers.base import PROVIDER_DEFAULT_MODELS

        # ASSISTANT_MODEL names the primary provider's model; pool members use their own.
        if self.assistant_model is not None and provider == self.resolved_assistant_provider:
            return self.assistant_model
        if provider == "gemini" and "gemini_model" in self.model_fields_set:
            return self.gemini_model
        if provider == "groq":
            return self.groq_models[0]
        return PROVIDER_DEFAULT_MODELS[provider]

    @property
    def groq_models(self) -> list[str]:
        models = [m.strip() for m in self.groq_model.split(",") if m.strip()]
        return list(dict.fromkeys(models)) or ["openai/gpt-oss-120b"]

    def assistant_models_for(self, provider: str) -> list[str]:
        """Pool members for one provider: every configured Groq model, else one model."""
        if provider == "groq":
            primary = self.assistant_model_for("groq")
            return list(dict.fromkeys([primary, *self.groq_models]))
        return [self.assistant_model_for(provider)]

    @property
    def resolved_assistant_model(self) -> str:
        provider = self.resolved_assistant_provider
        if provider == "none":
            return "none"
        return self.assistant_model_for(provider)

    @property
    def assistant_configured(self) -> bool:
        provider = self.resolved_assistant_provider
        return provider != "none" and self.provider_key(provider) is not None

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
                "COURTLENS_JWT_SECRET must be a unique 32+ character value in production"
            )
        op_secret = self.operator_token.get_secret_value()
        if len(op_secret) < 32 or any(
            marker in op_secret.lower() for marker in ("development", "replace")
        ):
            raise ValueError(
                "COURTLENS_OPERATOR_TOKEN must be a unique 32+ character value in production"
            )
        if "*" in self.cors_origins:
            raise ValueError("wildcard CORS is not permitted in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
