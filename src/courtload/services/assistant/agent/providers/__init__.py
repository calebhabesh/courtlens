"""SDK construction stays private to each adapter; no automatic provider fallback."""

from courtload.config import Settings
from courtload.services.assistant.agent.providers.base import AgentProvider, ProviderFailure


def create_provider(settings: Settings) -> AgentProvider:
    if not settings.assistant_configured:
        raise ProviderFailure("provider_disabled")
    provider = settings.resolved_assistant_provider
    key = getattr(settings, f"{provider}_api_key").get_secret_value()
    model = settings.resolved_assistant_model
    if provider == "gemini":
        from courtload.services.assistant.agent.providers.gemini import GeminiProvider

        return GeminiProvider(key, model)
    if provider == "anthropic":
        from courtload.services.assistant.agent.providers.anthropic import AnthropicProvider

        return AnthropicProvider(key, model)
    from courtload.services.assistant.agent.providers.openai import OpenAIProvider

    return OpenAIProvider(key, model)
