"""Versioned local conversation and read-only analytical planning contracts."""

from datetime import date
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ConversationContext(StrictModel):
    release_id: str | None = None
    season: str | None = Field(None, pattern=r"^\d{4}-\d{2}$")
    phase: Literal[
        "regular_season", "playoffs", "preseason", "play_in", "cup_final", "summer_league"
    ] = "regular_season"
    before_date: date | None = None
    window: Literal["season", "last_10", "last_5"] = "season"


class OperationStep(StrictModel):
    step_id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,31}$")
    operation: str = Field(min_length=1, max_length=48)
    arguments: dict[str, Any] = Field(default_factory=dict)
    # v1 steps are independent. No provider-defined arithmetic or dependency substitution.
    depends_on: list[str] = Field(default_factory=list, max_length=0)

    @field_validator("step_id", mode="before")
    @classmethod
    def normalize_step_id(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip().lower().replace("-", "_")
            if not value or not value[0].isalpha():
                value = f"step_{value}"
            return value[:32]
        return value


class AnalysisPlan(StrictModel):
    plan_version: Literal["courtload-analysis-plan-v1"] = "courtload-analysis-plan-v1"
    status: Literal["execute", "clarification_required", "unsupported"] = "execute"
    clarification: (
        Literal[
            "identity", "consistency", "defense_metric", "floor_or_game", "context", "capability"
        ]
        | None
    ) = None
    context_changes: ConversationContext | None = None
    steps: list[OperationStep] = Field(default_factory=list, max_length=8)
    output_kind: Literal["table", "definition", "comparison"] = "table"

    @model_validator(mode="before")
    @classmethod
    def normalize_plan_version(cls, data: Any) -> Any:
        if isinstance(data, dict) and data.get("plan_version") != "courtload-analysis-plan-v1":
            data = dict(data)
            data["plan_version"] = "courtload-analysis-plan-v1"
        return data

    @model_validator(mode="after")
    def validate_steps(self) -> "AnalysisPlan":
        ids = [s.step_id for s in self.steps]
        if len(ids) != len(set(ids)):
            raise ValueError("step identities must be unique")
        if self.status == "execute" and not self.steps:
            raise ValueError("an executable plan requires operations")
        if self.status != "execute" and self.steps:
            raise ValueError("clarification/unsupported plans cannot execute operations")
        return self


class ConversationTurnRequest(StrictModel):
    schema_version: Literal["courtload-conversation-v1"] = "courtload-conversation-v1"
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: UUID | None = None
    request_id: UUID
    context: ConversationContext | None = None
    context_fingerprint: str | None = Field(None, pattern=r"^[a-f0-9]{64}$")
    clarification_choice: str | None = Field(None, min_length=1, max_length=100)
    # An explicit manual plan works without a provider and is subjected to identical validation.
    plan: AnalysisPlan | None = None


class EvidenceCell(StrictModel):
    evidence_id: str
    result_hash: str
    operation_hash: str
    operation_version: str
    context_fingerprint: str
    entity_id: str
    row_identity: str
    path: str
    metric: str
    metric_version: str
    unit: str
    value: Any
    sample: dict[str, Any] = Field(default_factory=dict)
    input_identity: dict[str, Any]
    null_reason: str | None = None


class OperationResult(StrictModel):
    step_id: str
    operation: str
    operation_version: str
    arguments: dict[str, Any]
    operation_hash: str
    result_hash: str
    data: dict[str, Any]
    rows: list[dict[str, Any]]
    evidence: list[EvidenceCell]
    open_url: str | None = None
    eligible_count: int | None = None
    limitations: list[str] = Field(default_factory=list)


class ConversationTurnResponse(StrictModel):
    schema_version: Literal["courtload-conversation-v1"] = "courtload-conversation-v1"
    status: Literal[
        "answered",
        "clarification_required",
        "unsupported",
        "no_data",
        "insufficient_sample",
        "disabled",
        "quota_exceeded",
        "timeout",
        "provider_error",
        "busy",
    ]
    conversation_id: UUID
    turn_id: UUID
    context: dict[str, Any]
    context_fingerprint: str
    interpretation: str
    plan: AnalysisPlan | None = None
    results: list[OperationResult] = Field(default_factory=list)
    choices: list[dict[str, str]] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    manifest: dict[str, Any] | None = None
    accounting: dict[str, Any] = Field(default_factory=dict)


class SaveConversationRequest(StrictModel):
    """Explicit retention of a server-held result; client numerical payloads are forbidden."""

    request_id: UUID
    conversation_id: UUID
    turn_id: UUID
    context_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    title: str = Field(min_length=1, max_length=255)
    include_question: bool = False

    @model_validator(mode="after")
    def nonblank_title(self) -> "SaveConversationRequest":
        if not self.title.strip() or any(ord(c) < 32 for c in self.title):
            raise ValueError("title must contain text without control characters")
        return self
