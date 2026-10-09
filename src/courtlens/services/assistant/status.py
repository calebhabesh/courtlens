"""Provider status for the agent, without importing retired orchestration."""

from courtlens.api.workbench_schemas import AssistantStatusResponse
from courtlens.config import get_settings
from courtlens.services.assistant.agent.prompt import PROMPT_VERSION
from courtlens.services.assistant.operations import REGISTRY


def get_assistant_status() -> AssistantStatusResponse:
    settings = get_settings()
    configured = settings.assistant_configured
    return AssistantStatusResponse(
        configured=configured,
        model=settings.resolved_assistant_model,
        provider=settings.resolved_assistant_provider,
        limited_mode=not configured,
        prompt_version=PROMPT_VERSION,
        limits={
            "max_steps": settings.assistant_max_steps,
            "max_web_searches": settings.assistant_max_web_searches,
            "max_tokens": settings.assistant_max_tokens,
            "turn_timeout_seconds": settings.assistant_turn_timeout_seconds,
            "max_question_chars": 2000,
            "max_rounds": 1,
            "max_calls": 8,
            "max_rows_per_call": 100,
            "max_total_rows": 200,
            "timeout_seconds": 45,
            "provider_timeout_seconds": 20,
            "provider_payload_bytes": 65536,
            "conversation_expiry_seconds": 1800,
        },
        allowed_tools=list(REGISTRY),
        privacy_notice=(
            "Questions, selected page context and bounded analytical results are sent "
            "to the configured provider. Native search sends queries through that provider. "
            "Threads stay in this local installation until deleted. Provider retention "
            "and data-use terms depend on your account configuration."
        ),
        setup_instructions=(
            "Set COURTLENS_GEMINI_API_KEY, COURTLENS_ANTHROPIC_API_KEY or "
            "COURTLENS_OPENAI_API_KEY in the server .env. Select a provider with "
            "COURTLENS_ASSISTANT_PROVIDER. Provider quotas and pricing apply."
        ),
    )
