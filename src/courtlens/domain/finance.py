"""B28 strict manual financial observations; no payroll or current-status inference."""

from __future__ import annotations

import csv
import hashlib
import io
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PARSER_VERSION = "finance-csv-v1"
MAX_BYTES = 2_000_000
MAX_ROWS = 5_000
AmountKind = Literal[
    "base_salary",
    "cash",
    "cap_hit",
    "total_value",
    "average_value",
    "guaranteed_value",
    "cap_hold",
    "dead_money",
    "tax_component",
    "unspecified",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)

    @field_validator("*", mode="before")
    @classmethod
    def safe_text(cls, value: object) -> object:
        if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
            raise ValueError("unsafe spreadsheet formula string")
        return value


class SourceEvidence(StrictModel):
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    url: str = Field(max_length=1000)
    observed_at: datetime
    attribution: str = Field(min_length=1, max_length=500)
    use_basis: str = Field(min_length=1, max_length=500)

    @field_validator("url")
    @classmethod
    def source_url(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme not in {"https", "http"} or not parsed.netloc or parsed.username:
            raise ValueError("public source URL required")
        return value

    @field_validator("observed_at")
    @classmethod
    def aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timezone-aware observation required")
        return value


class IdentityMapping(StrictModel):
    source_namespace: str = Field(min_length=1, max_length=50)
    source_entity_id: str = Field(min_length=1, max_length=100)
    nba_player_id: str = Field(pattern=r"^[0-9]{1,12}$")
    evidence_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    method: Literal["direct_nba_id", "reviewed_crosswalk", "name_team_crosswalk"]


class FinanceManifest(StrictModel):
    schema_version: Literal["finance-import-v1"] = "finance-import-v1"
    csv_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    sources: tuple[SourceEvidence, ...] = Field(min_length=1, max_length=100)
    mappings: tuple[IdentityMapping, ...] = Field(min_length=1, max_length=5000)
    coverage_note: str = Field(min_length=1, max_length=1000)
    parent_release_id: str | None = None

    @model_validator(mode="after")
    def unique_evidence(self) -> Self:
        hashes = [source.sha256 for source in self.sources]
        keys = [(m.source_namespace, m.source_entity_id) for m in self.mappings]
        if len(set(hashes)) != len(hashes) or len(set(keys)) != len(keys):
            raise ValueError("duplicate source/mapping")
        if any(m.evidence_sha256 not in hashes for m in self.mappings):
            raise ValueError("mapping evidence is not retained")
        if any(
            m.method == "direct_nba_id"
            and (m.source_namespace != "nba" or m.source_entity_id != m.nba_player_id)
            for m in self.mappings
        ):
            raise ValueError("direct NBA identity mismatch")
        return self


class FinanceRow(StrictModel):
    row_id: str = Field(min_length=1, max_length=100)
    kind: Literal["contract", "amount", "option", "guarantee", "status", "association"]
    source_namespace: str = Field(min_length=1, max_length=50)
    source_entity_id: str = Field(min_length=1, max_length=100)
    nba_player_id: str = Field(pattern=r"^[0-9]{1,12}$")
    contract_id: str = Field(min_length=1, max_length=100)
    financial_season: str | None = None
    team_id: str | None = None
    effective_date: date | None = None
    announced_at: datetime | None = None
    observed_at: datetime
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_locator: str = Field(min_length=1, max_length=500)
    original_label: str = Field(min_length=1, max_length=500)
    amount_kind: AmountKind | None = None
    currency: Literal["USD"] | None = None
    value: str | None = None
    status: (
        Literal["unknown_review", "unsigned", "signed", "returned", "option_pending", "two_way"]
        | None
    ) = None
    option: Literal["player", "team", "none"] | None = None
    option_state: Literal["unexercised", "exercised", "declined"] | None = None
    guarantee: Literal["full", "partial", "none"] | None = None
    years: int | None = Field(default=None, ge=1, le=10)
    supersedes_id: str | None = None
    correction_reason: str | None = Field(default=None, min_length=1, max_length=500)

    @field_validator("observed_at", "announced_at")
    @classmethod
    def aware(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("timezone-aware observation required")
        return value

    @model_validator(mode="after")
    def semantics(self) -> Self:
        if self.financial_season is not None:
            if not re.fullmatch(r"20\d{2}-\d{2}", self.financial_season):
                raise ValueError("financial season must be YYYY-YY")
            if (int(self.financial_season[:4]) + 1) % 100 != int(self.financial_season[-2:]):
                raise ValueError("financial season must be consecutive")
        allowed = {
            "contract": {"years"},
            "amount": {"amount_kind", "currency", "value"},
            "option": {"option", "option_state"},
            "guarantee": {"guarantee"},
            "status": {"status"},
            "association": set(),
        }[self.kind]
        fields = {
            "years",
            "amount_kind",
            "currency",
            "value",
            "option",
            "option_state",
            "guarantee",
            "status",
        }
        if any(getattr(self, field) is not None for field in fields - allowed):
            raise ValueError("observation families must be separate")
        if self.kind == "amount":
            if self.amount_kind is None or self.currency is None:
                raise ValueError("amount kind and currency required even for unknown amounts")
            if (
                self.amount_kind not in {"total_value", "guaranteed_value"}
                and self.financial_season is None
            ):
                raise ValueError("season required for seasonal amounts")
        if self.value is not None and not re.fullmatch(r"\d{1,12}(?:\.\d{1,2})?", self.value):
            raise ValueError("amount must be nonnegative exact USD with at most two decimals")
        if self.kind == "association" and (self.team_id is None or self.effective_date is None):
            raise ValueError("association needs explicit team and effective date")
        if self.option_state is not None and self.option not in {"player", "team"}:
            raise ValueError("option state needs player/team option")
        if self.announced_at is not None and self.announced_at > self.observed_at:
            raise ValueError("announcement later than observation")
        if bool(self.supersedes_id) != bool(self.correction_reason):
            raise ValueError("correction requires target and reason")
        return self

    @property
    def cents(self) -> int | None:
        return int(Decimal(self.value) * 100) if self.value is not None else None

    @property
    def grain(self) -> tuple[str | None, ...]:
        return (
            self.nba_player_id,
            self.contract_id,
            self.kind,
            self.financial_season,
            self.amount_kind,
        )


CSV_FIELDS = list(FinanceRow.model_fields)


def parse_csv(raw: bytes, manifest: FinanceManifest) -> tuple[FinanceRow, ...]:
    if len(raw) > MAX_BYTES or hashlib.sha256(raw).hexdigest() != manifest.csv_sha256:
        raise ValueError("CSV size/hash mismatch")
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig"), newline=""))
    if reader.fieldnames != CSV_FIELDS:
        raise ValueError("CSV header must match finance template exactly")
    rows: list[FinanceRow] = []
    ids: set[str] = set()
    grains: set[tuple[str | None, ...]] = set()
    mappings = {(m.source_namespace, m.source_entity_id): m for m in manifest.mappings}
    sources = {s.sha256: s for s in manifest.sources}
    for number, values in enumerate(reader, 2):
        if len(rows) >= MAX_ROWS or None in values or any(v is None for v in values.values()):
            raise ValueError(f"row {number}: row bound or malformed CSV")
        row = FinanceRow.model_validate({k: v if v != "" else None for k, v in values.items()})
        mapping = mappings.get((row.source_namespace, row.source_entity_id))
        source = sources.get(row.source_sha256)
        if mapping is None or mapping.nba_player_id != row.nba_player_id:
            raise ValueError(f"row {number}: missing or conflicting verified mapping")
        if sources[mapping.evidence_sha256].observed_at > row.observed_at:
            raise ValueError(f"row {number}: identity evidence observed later")
        if source is None or source.observed_at > row.observed_at:
            raise ValueError(f"row {number}: source evidence missing or observed later")
        if row.row_id in ids or row.grain in grains:
            raise ValueError(f"row {number}: duplicate identity/contract/season/family grain")
        ids.add(row.row_id)
        grains.add(row.grain)
        rows.append(row)
    if not rows:
        raise ValueError("empty import")
    return tuple(rows)


def export_csv(rows: tuple[FinanceRow, ...]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=CSV_FIELDS)
    writer.writeheader()
    for row in rows:
        # Revalidation also checks formula strings on reconstructed DB payloads.
        writer.writerow(FinanceRow.model_validate(row.model_dump()).model_dump(mode="json"))
    return stream.getvalue().encode()
