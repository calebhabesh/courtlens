"""Frozen B35a retained-operation API contracts for the subsequent interface block."""

from typing import Any, Literal

from pydantic import Field

from courtload.domain.conversation import AnalysisPlan, OperationResult, StrictModel


class SavedOperationManifest(StrictModel):
    schema_version: Literal["courtload-saved-operation-v1"]
    context: dict[str, Any]
    context_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    plan: AnalysisPlan
    origin_plan: AnalysisPlan
    origin_manifest_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    metric_version: str
    result_scope: Literal["complete_stats_cohort_and_declared_operation_bounds"]
    results: list[OperationResult] = Field(min_length=1, max_length=8)
    limitations: list[str]


class SavedQuestionMetadata(StrictModel):
    question_saved: bool
    question: str | None = Field(None, max_length=2000)


class SavedConversationDetail(StrictModel):
    id: str
    title: str
    manifest_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    manifest: SavedOperationManifest
    metadata: SavedQuestionMetadata
    created_at: str


class SavedConversationSummary(StrictModel):
    id: str
    title: str
    manifest_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    created_at: str
    context: dict[str, Any]
    operations: list[str]
    question_saved: bool


class SavedOperationReproduction(StrictModel):
    step_id: str
    operation: str
    saved_result_sha256: str
    recomputed_result_sha256: str
    match: bool


class SavedConversationReproduction(StrictModel):
    id: str
    manifest_sha256: str
    match: bool
    reason: str | None
    operations: list[SavedOperationReproduction]
    provider_calls: Literal[0] = 0
