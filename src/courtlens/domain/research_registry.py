"""Research-phase model registrations (docs/research-plan.md, "Register before fitting").

The B25 `ResearchProtocol` schema covers only the sealed pre-rename B25 experiments, and the API
reads every file in `evaluation/research/protocols/` as one, so Research registrations live in
`evaluation/research/registrations/` under this separate schema. A registration is frozen
before any fit: fitting code loads it by identity, and every artifact records its content hash,
so a registration edited after a fit no longer matches the artifacts it produced.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

REGISTRY = Path("evaluation/research/registrations")
Text = Annotated[str, Field(min_length=1)]
Identity = Annotated[str, Field(pattern=r"^courtlens-[a-z0-9]+(-[a-z0-9]+)*-v[0-9]+$")]


class Budget(BaseModel):
    """Per-run limits; runs are started under a kernel-enforced cap no larger than these."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    cpu_threads: int = Field(ge=1, le=2)
    max_peak_mib: int = Field(gt=0, le=4096)
    max_wall_seconds: int = Field(gt=0, le=1800)


class ResearchRegistration(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)

    schema_version: Literal["courtlens-research-registration-v1"]
    identity: Identity
    block: Text
    registered_on: date
    kind: Literal["pipeline", "descriptive", "predictive"]
    question: Text
    inputs: tuple[Text, ...] = Field(min_length=1)
    method: tuple[Text, ...] = Field(min_length=1)
    parameters: dict[str, Any]
    selection: Text
    uncertainty: Text
    evaluation: tuple[Text, ...] = Field(min_length=1)
    acceptance: tuple[Text, ...] = Field(min_length=1)
    outputs: tuple[Text, ...] = Field(min_length=1)
    limitations: tuple[Text, ...] = Field(min_length=1)
    negative_result_policy: Text
    seed: int
    budget: Budget

    @model_validator(mode="after")
    def published_negative_results(self) -> ResearchRegistration:
        if "publish" not in self.negative_result_policy.lower():
            raise ValueError("registrations must commit to publishing negative results")
        return self

    def content_hash(self) -> str:
        payload = json.dumps(self.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode()).hexdigest()


def load_registration(identity: str, root: Path = REGISTRY) -> ResearchRegistration:
    """Load a registration by identity; the file name must equal the identity."""
    path = root / f"{identity}.json"
    registration = ResearchRegistration.model_validate_json(path.read_text())
    if registration.identity != identity:
        raise ValueError("registration file name and identity differ")
    return registration


def registration_receipt(identity: str, root: Path = REGISTRY) -> dict[str, Any]:
    """What an artifact records about the registration it was fitted under."""
    registration = load_registration(identity, root)
    return {
        "identity": registration.identity,
        "registered_on": registration.registered_on.isoformat(),
        "content_sha256": registration.content_hash(),
        "parameters": registration.parameters,
    }
