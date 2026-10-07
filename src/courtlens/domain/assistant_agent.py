"""Answer-first v3 contract; sealed v2 responses remain independently valid."""

from __future__ import annotations

import re
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import AwareDatetime, Field, RootModel, TypeAdapter, field_validator, model_validator

from courtlens.domain.conversation import ConversationContext, StrictModel
from courtlens.domain.hybrid_assistant import (
    AnswerAction,
    DurableThreadHeader,
    Hash,
    HybridTurnRequest,
    HybridTurnResponse,
    ResultBlock,
    StreamAcceptedEvent,
    StreamNarrativeEvent,
    StreamPhaseEvent,
)

MARKER = re.compile(r"\[\^(s[0-9]+)\]")


class ProseBlock(StrictModel):
    text: str = Field(min_length=1, max_length=24000)


class AgentSource(StrictModel):
    source_id: str = Field(pattern=r"^s[0-9]+$")
    origin: Literal["web", "databallr", "warehouse", "external", "knowledge"]
    title: str
    publisher: str
    url: str | None = None
    retrieved_at: AwareDatetime | None = None
    as_of: str | None = None
    excerpt: str = Field(default="", max_length=24000)
    # Provider grounding spans refer to final normalized prose, never a prior step.
    span: tuple[int, int] | None = None
    operation_hash: Hash | None = None
    content_sha256: Hash | None = None

    @model_validator(mode="after")
    def safe_source(self) -> AgentSource:
        if self.url:
            parsed = urlsplit(self.url)
            if any(ord(c) < 32 for c in self.url) or "\\" in self.url:
                raise ValueError("unsafe source URL")
            if self.origin == "warehouse":
                if not self.url.startswith("/") or self.url.startswith("//"):
                    raise ValueError("warehouse sources require local navigation")
            elif (
                parsed.scheme != "https"
                or not parsed.hostname
                or parsed.username is not None
                or parsed.password is not None
            ):
                raise ValueError("external sources require HTTPS")
        if self.span and not 0 <= self.span[0] < self.span[1]:
            raise ValueError("invalid grounding span")
        return self


class UnverifiedSentence(StrictModel):
    text: str
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    numbers: list[str]


class ProvenanceReport(StrictModel):
    checker_version: Literal["agent-provenance-v1"] = "agent-provenance-v1"
    bound_numbers: list[str] = Field(default_factory=list)
    cited_numbers: list[str] = Field(default_factory=list)
    unsupported_numbers: list[str] = Field(default_factory=list)
    unverified_sentences: list[UnverifiedSentence] = Field(default_factory=list)
    warehouse_override_missed: int = Field(default=0, ge=0)
    repaired: bool = False
    assumption_unverified: bool = False


class TraceStep(StrictModel):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    status: Literal["ok", "error"]
    elapsed_ms: float = Field(ge=0)
    rows: int = Field(default=0, ge=0)
    hits: int = Field(default=0, ge=0)


class AgentAccounting(StrictModel):
    provider: str
    model: str
    prompt_version: str
    steps: int = Field(default=0, ge=0)
    provider_calls: int = Field(default=0, ge=0)
    web_searches: int = Field(default=0, ge=0)
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    est_cost_usd: float | None = Field(default=None, ge=0)
    elapsed_ms: float = Field(default=0, ge=0)
    stopped_by_limit: Literal["steps", "searches", "tokens", "timeout"] | None = None
    # Native search can exceed the requested budget (notably Gemini); expose it.
    web_search_overshoot: int = Field(default=0, ge=0)
    token_overshoot: int = Field(default=0, ge=0)


class TranscriptReference(StrictModel):
    turn_id: UUID
    sha256: Hash


class AgentResultBlock(ResultBlock):
    # Scope is retained beside immutable data: not every operation embeds its context.
    context: dict[str, Any] | None = None

    @model_validator(mode="after")
    def executed_identity(self) -> AgentResultBlock:
        from courtlens.services.workbench_analytics import canonical_hash

        for cell in self.result.evidence:
            if (
                cell.operation_hash != self.result.operation_hash
                or cell.result_hash != self.result.result_hash
            ):
                raise ValueError("evidence does not bind to executed result")
            if self.context and cell.context_fingerprint != canonical_hash(self.context):
                raise ValueError("result scope does not bind to executed evidence")
        return self


class AgentTurnResponse(StrictModel):
    schema_version: Literal["courtlens-assistant-v3"] = "courtlens-assistant-v3"
    request_id: UUID
    thread_id: UUID
    turn_id: UUID
    status: Literal["answered", "refused", "failed", "cancelled"]
    mode: Literal["agent", "limited"] = "agent"
    answer: ProseBlock
    assumption: str | None = Field(default=None, max_length=500)
    results: list[AgentResultBlock] = Field(default_factory=list, max_length=120)
    sources: list[AgentSource] = Field(default_factory=list, max_length=100)
    follow_ups: list[str] = Field(default_factory=list, max_length=3)
    actions: list[AnswerAction] = Field(default_factory=list, max_length=120)
    trace: list[TraceStep] = Field(default_factory=list, max_length=200)
    accounting: AgentAccounting
    provenance: ProvenanceReport = Field(default_factory=ProvenanceReport)
    saveable: bool = False
    failure: str | None = None
    retry_after: int | None = Field(default=None, ge=1)
    # Server-owned resolved selections; individual results may have different scopes.
    selections: ConversationContext | None = None
    transcript: TranscriptReference | None = None

    @field_validator("assumption")
    @classmethod
    def one_line(cls, value: str | None) -> str | None:
        if value and ("\n" in value or "\r" in value):
            raise ValueError("assumption must be one line")
        return value

    @field_validator("follow_ups")
    @classmethod
    def bounded_prompts(cls, values: list[str]) -> list[str]:
        if any(not value.strip() or len(value) > 200 for value in values):
            raise ValueError("follow-ups must be short nonblank prompts")
        return values

    @model_validator(mode="after")
    def bindings(self) -> AgentTurnResponse:
        sources = {s.source_id: s for s in self.sources}
        if len(sources) != len(self.sources):
            raise ValueError("duplicate source identity")
        if not set(MARKER.findall(self.answer.text + (self.assumption or ""))) <= sources.keys():
            raise ValueError("unknown citation marker")
        results = {b.result.operation_hash: b.result for b in self.results}
        if len(results) != len(self.results):
            raise ValueError("duplicate executed result")
        for source in self.sources:
            if source.origin == "warehouse":
                result = results.get(source.operation_hash or "")
                if result is None or source.url != result.open_url:
                    raise ValueError("warehouse source requires equivalent executed evidence")
            if source.span and source.span[1] > len(self.answer.text):
                raise ValueError("grounding span outside answer")
        for action in self.actions:
            if action.kind == "executed_operation":
                result = results.get(action.operation_hash or "")
                if result is None or action.url != result.open_url:
                    raise ValueError("action does not bind to executed result")
        if self.saveable != (self.status == "answered" and bool(results)):
            raise ValueError("saveable must reflect an executed warehouse answer")
        if self.transcript and self.transcript.turn_id != self.turn_id:
            raise ValueError("transcript identity mismatch")
        for sentence in self.provenance.unverified_sentences:
            if self.answer.text[sentence.start : sentence.end] != sentence.text:
                raise ValueError("unverified marker does not bind to answer")
        return self


TurnResponse = Annotated[
    HybridTurnResponse | AgentTurnResponse, Field(discriminator="schema_version")
]
RESPONSE_ADAPTER: TypeAdapter[HybridTurnResponse | AgentTurnResponse] = TypeAdapter(TurnResponse)

StepKind = Literal["thinking", "tool", "search", "writing"]


class StreamStepEvent(StrictModel):
    event: Literal["step"] = "step"
    kind: StepKind
    label: str = Field(min_length=1, max_length=500)


class StreamDeltaEvent(StrictModel):
    event: Literal["delta"] = "delta"
    text: str


class StreamResetEvent(StrictModel):
    event: Literal["reset"] = "reset"


class StreamFinalEvent(StrictModel):
    event: Literal["final"] = "final"
    response: TurnResponse


StreamEvent = (
    StreamAcceptedEvent
    | StreamPhaseEvent
    | StreamNarrativeEvent
    | StreamStepEvent
    | StreamDeltaEvent
    | StreamResetEvent
    | StreamFinalEvent
)


class AgentStreamEvent(RootModel[Annotated[StreamEvent, Field(discriminator="event")]]):
    """Additive v3 transport, including sealed v2 phase/narrative compatibility."""


class StoredTurnRecord(StrictModel):
    # Preserve the existing durable envelope and request hashes, including old history.
    record_version: Literal["courtload-thread-turn-v2"] = "courtload-thread-turn-v2"
    thread_id: UUID
    turn_id: UUID
    request: HybridTurnRequest
    request_sha256: Hash
    accepted_at: AwareDatetime
    state: Literal["pending", "running", "completed", "failed", "cancelled"]
    response: TurnResponse | None = None
    response_sha256: Hash | None = None

    @model_validator(mode="after")
    def identities(self) -> StoredTurnRecord:
        from courtlens.services.workbench_analytics import canonical_hash

        if self.request_sha256 != canonical_hash(self.request.model_dump(mode="json")):
            raise ValueError("retained request digest mismatch")
        if self.response:
            if (self.response.request_id, self.response.thread_id, self.response.turn_id) != (
                self.request.request_id,
                self.thread_id,
                self.turn_id,
            ):
                raise ValueError("retained turn identity mismatch")
            if self.response_sha256 != canonical_hash(self.response.model_dump(mode="json")):
                raise ValueError("retained response digest mismatch")
            if (self.state == "cancelled") != (self.response.status == "cancelled") or (
                self.state == "failed"
            ) != (self.response.status == "failed"):
                raise ValueError("retained terminal status mismatch")
        terminal = self.state in ("completed", "failed", "cancelled")
        if terminal != (self.response is not None and self.response_sha256 is not None):
            raise ValueError("terminal record requires complete response and digest")
        if not terminal and (self.response is not None or self.response_sha256 is not None):
            raise ValueError("active record cannot contain a response")
        return self


class AgentHistoryPage(StrictModel):
    schema_version: Literal["courtload-history-v2"] = "courtload-history-v2"
    thread: DurableThreadHeader
    turns: list[StoredTurnRecord] = Field(max_length=100)
    next_cursor: str | None = None
