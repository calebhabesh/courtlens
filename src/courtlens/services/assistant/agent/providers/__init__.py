"""SDK construction stays private to each adapter.

Every turn runs through an ordered pool of the configured providers (see config): members
share a process-wide quota ledger, and a rate-limited member hands the step to the next.
"""

from courtlens.config import Settings
from courtlens.services.assistant.agent.providers.base import AgentProvider, ProviderFailure
from courtlens.services.assistant.agent.providers.pool import Limits, PooledProvider, PoolMember


def pool_members(settings: Settings) -> list[tuple[str, str]]:
    """Ordered (provider, model) members for the configured pool."""
    return [
        (name, model)
        for name in settings.resolved_assistant_providers
        for model in settings.assistant_models_for(name)
    ]


def _adapter(settings: Settings, provider: str, model: str) -> AgentProvider:
    key = settings.provider_key(provider)
    if key is None:
        raise ProviderFailure("provider_disabled")
    secret = key.get_secret_value()
    if provider == "gemini":
        from courtlens.services.assistant.agent.providers.gemini import GeminiProvider

        return GeminiProvider(secret, model)
    if provider == "groq":
        from courtlens.services.assistant.agent.providers.groq import GroqProvider

        return GroqProvider(secret, model)
    if provider == "anthropic":
        from courtlens.services.assistant.agent.providers.anthropic import AnthropicProvider

        return AnthropicProvider(secret, model)
    from courtlens.services.assistant.agent.providers.openai import OpenAIProvider

    return OpenAIProvider(secret, model)


def _limits(settings: Settings, provider: str) -> Limits:
    if provider == "gemini":
        return Limits(
            requests_per_minute=settings.gemini_requests_per_minute,
            tokens_per_minute=settings.gemini_tokens_per_minute,
            requests_per_day=settings.gemini_requests_per_day,
            daily_reset_pacific=True,
        )
    # Groq reports its limits in response headers; the ledger learns them from there.
    return Limits()


def create_provider(settings: Settings) -> AgentProvider:
    if not settings.assistant_configured:
        raise ProviderFailure("provider_disabled")
    return PooledProvider(
        [
            PoolMember(name, _adapter(settings, name, model), _limits(settings, name))
            for name, model in pool_members(settings)
        ]
    )
