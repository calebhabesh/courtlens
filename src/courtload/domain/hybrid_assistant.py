"""Explicit v2 wire and durable-record contracts; v1 evidence keeps its meaning."""

import re
from datetime import date, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    Field,
    RootModel,
    SerializerFunctionWrapHandler,
    field_validator,
    model_serializer,
    model_validator,
)

from courtload.domain.conversation import (
    AnalysisPlan,
    ConversationContext,
    EvidenceCell,
    OperationResult,
    StrictModel,
)
from courtload.domain.narrative_check import check_narrative

Hash = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
GENERAL_LABEL = "General knowledge, not from CourtLens data"
GENERAL_NUMBERS = re.compile(
    r"\d|[%¼½¾]|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|"
    r"thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|"
    r"forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|percent|"
    r"trillion|dozen|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|"
    r"eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|"
    r"nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|"
    r"ninetieth|hundredth|thousandth|half|quarter)\b",
    re.I,
)
Intent = Literal[
    "local_analysis",
    "site_guidance",
    "explanation",
    "external",
    "discussion",
    "clarification",
    "inability",
]
Failure = Literal[
    "no_observations",
    "insufficient_sample",
    "unsupported_operation",
    "position_unavailable",
    "qualification_unverified",
    "external_unavailable",
    "external_stale",
    "external_conflict",
    "provider_disabled",
    "provider_quota",
    "provider_busy",
    "provider_timeout",
    "provider_error",
    "malformed_output",
    "backend_failure",
    "context_unavailable",
    "calendar_unavailable",
    "prohibited_action",
    "cancelled",
]


class AssistantPageContext(StrictModel):
    """Untrusted UI selections, never a transcript or evidence source."""

    route: str = Field(pattern=r"^(?:/players/[0-9]+|/teams/[0-9]{10}|/compare)$")
    player_ids: list[str] = Field(default_factory=list, max_length=6)
    team_ids: list[str] = Field(default_factory=list, max_length=1)
    selections: ConversationContext

    @model_validator(mode="after")
    def page_entities(self) -> "AssistantPageContext":
        if any(not re.fullmatch(r"[0-9]{1,10}", value) for value in self.player_ids):
            raise ValueError("page players require canonical numeric identities")
        if any(not re.fullmatch(r"[0-9]{10}", value) for value in self.team_ids):
            raise ValueError("page teams require canonical numeric identities")
        if len(set(self.player_ids)) != len(self.player_ids):
            raise ValueError("duplicate page players")
        if self.route.startswith("/players/"):
            if self.player_ids != [self.route.rsplit("/", 1)[1]] or self.team_ids:
                raise ValueError("player page selection does not match route")
        elif self.route.startswith("/teams/"):
            if self.team_ids != [self.route.rsplit("/", 1)[1]] or self.player_ids:
                raise ValueError("team page selection does not match route")
        elif self.team_ids or len(self.player_ids) < 2:
            raise ValueError("comparison page requires multiple players")
        return self


class HybridTurnRequest(StrictModel):
    schema_version: Literal["courtload-assistant-v2"] = "courtload-assistant-v2"
    request_id: UUID
    thread_id: UUID | None = None
    retry_of: UUID | None = None
    message: str = Field(min_length=1, max_length=2000)
    context: ConversationContext | None = None
    page_context: AssistantPageContext | None = None
    # PF07b supplies these from retained server state, never a client-authored transcript.
    plan: AnalysisPlan | None = None

    @model_serializer(mode="wrap")
    def retained_wire(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        payload: dict[str, Any] = handler(self)
        # Preserve pre-AR07 durable request hashes when the optional field is absent.
        if self.page_context is None:
            payload.pop("page_context", None)
        return payload

    @model_validator(mode="before")
    @classmethod
    def plan_version(cls, value: Any) -> Any:
        if isinstance(value, dict) and isinstance(value.get("plan"), dict):
            version = value["plan"].get("plan_version", "courtload-analysis-plan-v1")
            if version != "courtload-analysis-plan-v1":
                raise ValueError("unrecognized analytical plan version")
        return value

    @field_validator("message")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message must contain text")
        return value


class InterpretedScope(StrictModel):
    as_of: date
    timezone: Literal["America/New_York"] = "America/New_York"
    calendar_version: str
    calendar_sha256: Hash
    selections: ConversationContext
    local_context: dict[str, Any] | None = None
    context_fingerprint: Hash | None = None
    assumptions: list[str] = Field(default_factory=list, max_length=16)
    label: str


class SourceFact(StrictModel):
    """Adapter-owned verified tuple; extraction candidates cannot populate this registry."""

    entity: str
    metric: str
    value: str
    unit: str
    period: str
    qualifier: str
    locator: str
    supporting_excerpt: str = Field(min_length=1, max_length=8192)
    parser_version: str


class AnswerSource(StrictModel):
    source_id: str
    origin: Literal["knowledge", "calendar", "qualification", "external"]
    title: str
    publisher: str
    url: str | None = None
    updated_on: date | None = None
    retrieved_at: datetime | None = None
    period: str | None = None
    content_sha256: Hash
    locator: str
    excerpt: str = Field(max_length=8192)
    verification: Literal["curated", "verified", "stale", "failed"]
    facts: list[SourceFact] = Field(default_factory=list, max_length=100)

    @field_validator("url")
    @classmethod
    def public_link(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith("https://"):
            raise ValueError("sources require HTTPS")
        return value


class AnswerAction(StrictModel):
    kind: Literal["navigation", "executed_operation", "source", "retry"]
    label: str
    url: str | None = None
    operation_hash: Hash | None = None

    @model_validator(mode="after")
    def safe_action(self) -> "AnswerAction":
        if self.url and any(ord(char) < 32 for char in self.url):
            raise ValueError("action URL contains control characters")
        if self.url and not (
            (self.kind == "source" and self.url.startswith("https://"))
            or (
                self.kind in ("navigation", "executed_operation")
                and self.url.startswith("/")
                and not self.url.startswith("//")
                and "\\" not in self.url
            )
        ):
            raise ValueError("unsafe action URL")
        if self.kind == "executed_operation" and (not self.operation_hash or not self.url):
            raise ValueError("equivalent actions require executed operation identity")
        return self


class TextBlock(StrictModel):
    kind: Literal["text"] = "text"
    origin: Literal["knowledge", "discussion", "general_knowledge"]
    text: str = Field(min_length=1, max_length=8192)
    source_ids: list[str] = Field(default_factory=list)
    criteria: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def authority(self) -> "TextBlock":
        if self.origin == "knowledge" and not self.source_ids:
            raise ValueError("knowledge requires source identity")
        if self.origin == "discussion" and not self.criteria:
            raise ValueError("discussion requires stated criteria")
        if self.origin == "general_knowledge" and (
            not self.text.startswith(GENERAL_LABEL + "\n")
            or not self.text.removeprefix(GENERAL_LABEL + "\n").strip()
            or GENERAL_NUMBERS.search(self.text)
            or any(char.isnumeric() for char in self.text)
        ):
            raise ValueError("general knowledge requires the visible label and number-free prose")
        return self


class LocalClaimBlock(StrictModel):
    kind: Literal["local_claim"] = "local_claim"
    template: Literal["observed_cell_v2"] = "observed_cell_v2"
    text: str
    cell: EvidenceCell


def claim_text(cell: EvidenceCell, result: OperationResult) -> str:
    """Use names only from the same executed entity row, never a neighboring value."""
    from courtload.domain.metrics import METRIC_CATALOG

    name = cell.entity_id
    candidates = [*result.rows, result.data]
    for key in ("player", "target", "player_a", "player_b"):
        if isinstance(result.data.get(key), dict):
            candidates.append(result.data[key])
    for row in candidates:
        if str(row.get("player_id", row.get("id", ""))) == cell.entity_id:
            for key in ("name", "player_name", "display_name", "full_name"):
                if isinstance(row.get(key), str):
                    name = row[key]
                    break
            if name != cell.entity_id:
                break
    metric = METRIC_CATALOG.get(cell.metric)
    label = metric.display_name if metric else cell.metric.replace("_", " ")
    return f"{name}: {label} = {cell.value} {cell.unit}."


class LocalSummaryBlock(StrictModel):
    kind: Literal["local_summary"] = "local_summary"
    operation_hash: Hash
    text: Literal["The selected observations are shown below with their sample and scope."] = (
        "The selected observations are shown below with their sample and scope."
    )


class NarrativeBlock(StrictModel):
    """AR04 model-written prose; every number re-verifies against the bound result cells."""

    kind: Literal["narrative"] = "narrative"
    checker: Literal["narrative-check-v1"] = "narrative-check-v1"
    text: str = Field(min_length=1, max_length=700)
    operation_hashes: list[Hash] = Field(min_length=1, max_length=8)


class ResultBlock(StrictModel):
    kind: Literal["result"] = "result"
    result: OperationResult


def external_claim_text(fact: SourceFact) -> str:
    if fact.metric == "award_winner":
        return f"{fact.value} won the {fact.entity}."
    return (
        f"{fact.entity}: {fact.metric} = {fact.value} {fact.unit} "
        f"({fact.period}; {fact.qualifier})."
    )


class ExternalClaimBlock(StrictModel):
    kind: Literal["external_claim"] = "external_claim"
    text: str
    source_id: str
    locator: str
    entity: str
    metric: str
    value: str
    unit: str
    period: str
    qualifier: str
    supporting_excerpt: str = Field(min_length=1, max_length=8192)
    # Only the PF07c verified adapter may construct this block; model output is a candidate.
    parser_version: str


class ClarificationBlock(StrictModel):
    kind: Literal["clarification"] = "clarification"
    text: str = Field(min_length=1)
    choices: list[str] = Field(default_factory=list, max_length=10)


class InabilityBlock(StrictModel):
    kind: Literal["inability"] = "inability"
    reason: Failure
    text: str = Field(min_length=1)
    next_action: str = Field(min_length=1)


AnswerBlock = Annotated[
    TextBlock
    | LocalSummaryBlock
    | LocalClaimBlock
    | NarrativeBlock
    | ResultBlock
    | ExternalClaimBlock
    | ClarificationBlock
    | InabilityBlock,
    Field(discriminator="kind"),
]


class TurnAccounting(StrictModel):
    provider_calls: int = Field(0, ge=0, le=4)
    analytical_calls: int = Field(0, ge=0, le=8)
    source_requests: int = Field(0, ge=0, le=4)
    rows: int = Field(0, ge=0, le=200)
    elapsed_ms: float = Field(0, ge=0)


class HybridTurnResponse(StrictModel):
    schema_version: Literal["courtload-assistant-v2"] = "courtload-assistant-v2"
    request_id: UUID
    thread_id: UUID
    turn_id: UUID
    status: Literal["answered", "clarification_required", "unable", "failed", "cancelled"]
    intent: Intent
    scope: InterpretedScope | None = None
    blocks: list[AnswerBlock] = Field(min_length=1, max_length=24)
    sources: list[AnswerSource] = Field(default_factory=list, max_length=16)
    actions: list[AnswerAction] = Field(default_factory=list, max_length=16)
    plan: AnalysisPlan | None = None
    accounting: TurnAccounting = Field(default_factory=TurnAccounting)
    saveable: bool = False

    @model_validator(mode="after")
    def bindings(self) -> "HybridTurnResponse":
        sources = {s.source_id: s for s in self.sources}
        if len(sources) != len(self.sources):
            raise ValueError("duplicate source identity")
        results = {
            b.result.operation_hash: b.result for b in self.blocks if isinstance(b, ResultBlock)
        }
        for block in self.blocks:
            if isinstance(block, TextBlock) and not set(block.source_ids) <= sources.keys():
                raise ValueError("unknown knowledge source")
            if isinstance(block, LocalSummaryBlock) and block.operation_hash not in results:
                raise ValueError("local summary requires executed evidence")
            if isinstance(block, LocalClaimBlock):
                cell = block.cell
                result = results.get(cell.operation_hash)
                if result is None or cell not in result.evidence or not self.scope:
                    raise ValueError("local claim does not bind to executed evidence")
                if cell.context_fingerprint != self.scope.context_fingerprint:
                    raise ValueError("local claim context mismatch")
                expected = claim_text(cell, result)
                if block.text != expected:
                    raise ValueError("unbound local prose")
            if isinstance(block, NarrativeBlock):
                bound = [results.get(item) for item in block.operation_hashes]
                if not self.scope or any(result is None for result in bound):
                    raise ValueError("narrative does not bind to executed evidence")
                # Raises a ValueError subclass when any number no longer verifies.
                check_narrative(
                    block.text,
                    [result for result in bound if result is not None],
                    self.scope.model_dump(mode="json"),
                )
            if isinstance(block, ExternalClaimBlock):
                source = sources.get(block.source_id)
                fact = SourceFact.model_validate(
                    block.model_dump(exclude={"kind", "text", "source_id"})
                )
                if (
                    not source
                    or source.origin != "external"
                    or source.verification != "verified"
                    or source.locator != block.locator
                    or source.period != block.period
                    or block.supporting_excerpt not in source.excerpt
                    or fact not in source.facts
                    or block.text != external_claim_text(fact)
                ):
                    raise ValueError("external claim source binding mismatch")
        for action in self.actions:
            if action.kind == "executed_operation":
                result = results.get(action.operation_hash or "")
                if result is None or result.open_url != action.url:
                    raise ValueError("action does not bind to executed result")
        if self.saveable and (not results or self.status != "answered"):
            raise ValueError("only executed analytical answers may be saved")
        if self.status == "clarification_required" and not any(
            isinstance(b, ClarificationBlock) for b in self.blocks
        ):
            raise ValueError("clarification requires a question")
        if self.status in ("unable", "failed", "cancelled") and not any(
            isinstance(b, InabilityBlock) for b in self.blocks
        ):
            raise ValueError("terminal failure requires readable inability")
        return self


class DurableTurnRecord(StrictModel):
    """PF07b storage payload, excluding keys/provider transcripts; pending input is retained."""

    record_version: Literal["courtload-thread-turn-v2"] = "courtload-thread-turn-v2"
    thread_id: UUID
    turn_id: UUID
    request: HybridTurnRequest
    request_sha256: Hash
    accepted_at: AwareDatetime
    state: Literal["pending", "running", "completed", "failed", "cancelled"]
    response: HybridTurnResponse | None = None
    response_sha256: Hash | None = None

    @model_validator(mode="after")
    def identities(self) -> "DurableTurnRecord":
        if self.response and (
            self.response.request_id != self.request.request_id
            or self.response.thread_id != self.thread_id
            or self.response.turn_id != self.turn_id
        ):
            raise ValueError("retained turn identity mismatch")
        from courtload.services.workbench_analytics import canonical_hash

        if self.request_sha256 != canonical_hash(self.request.model_dump(mode="json")):
            raise ValueError("retained request digest mismatch")
        if self.response and self.response_sha256 != canonical_hash(
            self.response.model_dump(mode="json")
        ):
            raise ValueError("retained response digest mismatch")
        if self.response and (
            (self.state == "cancelled") != (self.response.status == "cancelled")
            or (self.state == "failed") != (self.response.status == "failed")
        ):
            raise ValueError("retained terminal status mismatch")
        terminal = self.state in ("completed", "failed", "cancelled")
        if not terminal and (self.response is not None or self.response_sha256 is not None):
            raise ValueError("active record cannot publish a verified response")
        if terminal != (self.response is not None and self.response_sha256 is not None):
            raise ValueError("terminal record requires complete response and digest")
        return self


class DurableThreadHeader(StrictModel):
    record_version: Literal["courtload-thread-v2"] = "courtload-thread-v2"
    thread_id: UUID
    title: str = Field(min_length=1, max_length=255)
    created_at: AwareDatetime
    updated_at: AwareDatetime
    version: int = Field(1, ge=1)


class ThreadHistoryPage(StrictModel):
    schema_version: Literal["courtload-history-v2"] = "courtload-history-v2"
    threads: list[DurableThreadHeader] = Field(max_length=100)
    next_cursor: str | None = None


class TurnHistoryPage(StrictModel):
    schema_version: Literal["courtload-history-v2"] = "courtload-history-v2"
    thread: DurableThreadHeader
    turns: list[DurableTurnRecord] = Field(max_length=100)
    next_cursor: str | None = None


TurnPhase = Literal["understanding", "querying", "writing"]


class StreamAcceptedEvent(StrictModel):
    """AR05 SSE: the durable turn exists; the client may poll or replay by request_id."""

    event: Literal["accepted"] = "accepted"
    request_id: UUID
    thread_id: UUID
    turn_id: UUID


class StreamPhaseEvent(StrictModel):
    event: Literal["phase"] = "phase"
    phase: TurnPhase


class StreamNarrativeEvent(StrictModel):
    """A slice of narrative that already passed the numeric check and was retained."""

    event: Literal["narrative"] = "narrative"
    text: str = Field(min_length=1, max_length=700)


class StreamFinalEvent(StrictModel):
    """The retained typed response; it is authoritative over any streamed text."""

    event: Literal["final"] = "final"
    response: HybridTurnResponse


class TurnStreamEvent(
    RootModel[
        Annotated[
            StreamAcceptedEvent | StreamPhaseEvent | StreamNarrativeEvent | StreamFinalEvent,
            Field(discriminator="event"),
        ]
    ]
):
    pass
