"""Read-only bounded financial operations on an explicit immutable source book."""

from collections import defaultdict
from decimal import Decimal, localcontext
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session

from courtload.domain.finance import MAX_ROWS, FinanceRow, SourceEvidence
from courtload.domain.finance_query import (
    STATUSES,
    ContractResult,
    FinanceQuery,
    FinanceResult,
    FinancialObservation,
    FinancialSubtotal,
    Status,
)
from courtload.finance_models import (
    FinanceMember,
    FinanceObservation,
    FinanceRelease,
    FinanceSource,
)
from courtload.services.finance_import import digest


def _as_of(
    session: Session, request: FinanceQuery
) -> tuple[list[FinanceObservation], dict[str, int]]:
    selected = list(
        session.scalars(
            select(FinanceObservation)
            .join(FinanceMember, FinanceMember.observation_id == FinanceObservation.id)
            .where(FinanceMember.release_id == str(request.book_id))
            .order_by(FinanceObservation.id)
            .limit(MAX_ROWS + 1)
        )
    )
    if len(selected) > MAX_ROWS:
        raise HTTPException(503, "finance book row budget exceeded")
    # Corrections observed after the cutoff cannot hide an earlier selected observation.
    pending = selected
    eligible: list[FinanceObservation] = []
    excluded = {"not_known_at": 0, "future_effective": 0, "unknown_effective": 0, "other_season": 0}
    seen: set[str] = set()
    for _ in range(100):
        ancestors = []
        for observation in pending:
            if observation.id in seen:
                raise HTTPException(503, "finance correction chain cycle")
            seen.add(observation.id)
            row = FinanceRow.model_validate(observation.payload_json)
            if row.observed_at > request.known_at:
                if observation.supersedes_id:
                    ancestors.append(observation.supersedes_id)
                else:
                    excluded["not_known_at"] += 1
                continue
            eligible.append(observation)
        if not ancestors:
            break
        pending = list(
            session.scalars(select(FinanceObservation).where(FinanceObservation.id.in_(ancestors)))
        )
        if len(pending) != len(set(ancestors)) or len(seen) + len(pending) > 50_000:
            raise HTTPException(503, "finance correction integrity/budget failure")
    else:
        raise HTTPException(503, "finance correction depth budget exceeded")
    return eligible, excluded


def _contract(
    key: tuple[str, str], observations: list[FinancialObservation], request: FinanceQuery
) -> ContractResult:
    rows = [o.terms for o in observations]
    teams = {r.team_id for r in rows if r.team_id is not None and r.effective_date is not None}
    # Association is from this contract's admitted facts, never basketball participation.
    team = next(iter(teams)) if len(teams) == 1 else None
    statuses = {r.status for r in rows if r.kind == "status" and r.status is not None}
    status: Status = next(iter(statuses)) if len(statuses) == 1 else "unknown_review"
    amounts = [
        r
        for r in rows
        if r.kind == "amount"
        and r.amount_kind == request.amount_kind
        and r.financial_season == request.financial_season
    ]
    options = [r for r in rows if r.kind == "option"]
    amount = amounts[0] if len(amounts) == 1 else None
    amount_status: Any = "missing"
    cents = None
    if amount is not None:
        if amount.cents is None:
            amount_status = "unknown"
        elif amount.effective_date is None:
            amount_status = "unknown_date"
        elif any(r.option_state == "declined" for r in options):
            amount_status = "declined"
        elif any(r.option in {"player", "team"} and r.option_state != "exercised" for r in options):
            amount_status = "conditional"
        else:
            cents = amount.cents
            amount_status = "known"
    scenario_cents = None
    if request.scenario == "include-unexercised-options-v1":
        scenario_cents = cents
        if amount_status == "conditional" and amount is not None:
            scenario_cents = amount.cents
    totals = [
        r
        for r in rows
        if r.kind == "amount" and r.amount_kind == "total_value" and r.cents is not None
    ]
    years = {r.years for r in rows if r.kind == "contract" and r.years is not None}
    aav = None
    if len(totals) == 1 and len(years) == 1:
        denominator = next(iter(years))
        assert denominator is not None and totals[0].cents is not None
        with localcontext() as ctx:
            ctx.prec = 40
            aav = str(Decimal(totals[0].cents) / Decimal(100) / Decimal(denominator))
    return ContractResult(
        player_id=key[0],
        contract_id=key[1],
        team_id=team,
        team_status="explicit" if team else "conflicting" if teams else "unknown",
        status=status,
        observations=tuple(
            sorted(
                observations,
                key=lambda o: (o.terms.financial_season or "", o.terms.kind, o.observation_id),
            )
        ),
        scenario_amount_cents=str(scenario_cents) if scenario_cents is not None else None,
        known_amount_cents=str(cents) if cents is not None else None,
        amount_status=amount_status,
        size_group="unknown"
        if cents is None
        else "small"
        if cents < request.small_big_threshold_cents
        else "big",
        derived_aav_usd=aav,
    )


def finance_query(session: Session, request: FinanceQuery) -> FinanceResult:
    release = session.get(FinanceRelease, str(request.book_id))
    if release is None:
        raise HTTPException(404, "finance book not found")
    eligible, excluded = _as_of(session, request)
    # Fetch metadata only. A read never loads/downloads source documents or changes a book.
    source_keys = {(o.release_id, o.payload_json["source_sha256"]) for o in eligible}
    sources = {
        (book, sha): SourceEvidence.model_validate(metadata)
        for book, sha, metadata in session.execute(
            select(
                FinanceSource.release_id, FinanceSource.sha256, FinanceSource.metadata_json
            ).where(tuple_(FinanceSource.release_id, FinanceSource.sha256).in_(source_keys))
        )
    }
    grouped: dict[tuple[str, str], list[FinancialObservation]] = defaultdict(list)
    timeline: list[FinancialObservation] = []
    for observation in eligible:
        row = FinanceRow.model_validate(observation.payload_json)
        if (
            digest(row.model_dump(mode="json")) != observation.content_sha256
            or row.cents != observation.amount_cents
        ):
            raise HTTPException(503, "finance observation integrity failure")
        source = sources.get((observation.release_id, row.source_sha256))
        if source is None or source.observed_at > request.known_at:
            raise HTTPException(503, "finance source provenance integrity failure")
        temporal_label: Any = "dated_report"
        if row.effective_date is None:
            temporal_label = "unknown_effective_date"
        elif row.effective_date > request.effective_on:
            temporal_label = "future_effective"
        item = FinancialObservation(
            observation_id=observation.id,
            origin_book_id=observation.release_id,
            content_sha256=observation.content_sha256,
            supersedes_id=observation.supersedes_id,
            temporal_label=temporal_label,
            terms=row,
            source=source,
        )
        timeline.append(item)
        if row.financial_season not in {None, request.financial_season}:
            excluded["other_season"] += 1
            continue
        if temporal_label == "future_effective":
            excluded["future_effective"] += 1
            continue
        if row.effective_date is None and request.unknown_dates == "exclude":
            excluded["unknown_effective"] += 1
            continue
        grouped[(row.nba_player_id, row.contract_id)].append(item)
    contracts = [_contract(key, rows, request) for key, rows in sorted(grouped.items())]
    contracts = [
        c
        for c in contracts
        if (request.team_id is None or c.team_id == request.team_id)
        and (not request.player_ids or c.player_id in request.player_ids)
    ]
    unfiltered = {status: sum(c.status == status for c in contracts) for status in STATUSES}
    filtered = [c for c in contracts if not request.statuses or c.status in request.statuses]
    groups = {status: sum(c.status == status for c in filtered) for status in STATUSES}
    known = [c for c in filtered if c.known_amount_cents is not None]
    unknown = [c for c in filtered if c.known_amount_cents is None]
    total = str(sum(int(c.known_amount_cents or "0") for c in known)) if known else None
    scenario_rows = [c for c in filtered if c.scenario_amount_cents is not None]
    subtotal = FinancialSubtotal(
        amount_kind=request.amount_kind,
        scenario_subtotal_cents=str(sum(int(c.scenario_amount_cents or "0") for c in scenario_rows))
        if scenario_rows
        else None,
        scenario_contracts=len(scenario_rows),
        known_subtotal_cents=total,
        expected_book_contracts=len(filtered),
        known_contracts=len(known),
        unknown_contracts=len(unknown),
        known_player_ids=tuple(sorted({c.player_id for c in known})),
        unknown_player_ids=tuple(sorted({c.player_id for c in unknown})),
        position_allocations_cents={"unclassified": total},
    )
    filtered_keys = {(c.player_id, c.contract_id) for c in filtered}
    payload = dict(
        context=request,
        book_sha256=release.content_sha256,
        coverage_note=release.manifest_json["coverage_note"],
        timeline=tuple(
            sorted(
                (
                    o
                    for o in timeline
                    if (o.terms.nba_player_id, o.terms.contract_id) in filtered_keys
                ),
                key=lambda o: (o.terms.financial_season or "", o.terms.kind, o.observation_id),
            )
        ),
        historical_reconstruction=any(
            o.terms.observed_at.date() > request.effective_on for o in timeline
        ),
        subtotal=subtotal,
        contracts=tuple(filtered),
        status_groups_unfiltered=unfiltered,
        status_groups_filtered=groups,
        unfiltered_contract_count=len(contracts),
        filtered_contract_count=len(filtered),
        excluded_observations=excluded,
        limitations=(
            "Source-book contract groups are exclusive; they do not establish "
            "current free-agent status or roster completeness.",
            "Unknown effective dates are labelled and excluded from monetary subtotals; "
            "future effective rows are excluded.",
            "Known amounts are reported components, not legal cap room, "
            "tax owed or apron compliance.",
            "No admitted position allocation, official threshold rules or modeled dollar "
            "conversion; all allocation is unclassified.",
            "Derived AAV is decimal USD (40 significant digits), never a seasonal allocation.",
        ),
    )
    semantic_contracts = []
    for contract in filtered:
        semantic = contract.model_dump(mode="json", exclude={"observations"})
        semantic["observations"] = sorted(
            [
                {
                    "terms": o.terms.model_dump(mode="json", exclude={"row_id", "supersedes_id"}),
                    "source": o.source.model_dump(mode="json"),
                    "temporal_label": o.temporal_label,
                }
                for o in contract.observations
            ],
            key=digest,
        )
        semantic_contracts.append(semantic)
    analytical_hash = digest(
        {
            "version": "finance-query-v1",
            "context": request.model_dump(mode="json", exclude={"book_id"}),
            "contracts": semantic_contracts,
            "subtotal": subtotal.model_dump(mode="json"),
            "status_groups": groups,
        }
    )
    result = FinanceResult(**payload, analytical_content_sha256=analytical_hash, result_sha256="")
    return result.model_copy(
        update={"result_sha256": digest(result.model_dump(mode="json", exclude={"result_sha256"}))}
    )
