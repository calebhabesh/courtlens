import pytest
from pydantic import ValidationError

from courtload.config import Settings


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
