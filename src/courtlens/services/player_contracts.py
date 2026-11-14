"""Current player-page financial context. No historical-feature or publication inputs."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from courtlens.domain.teams import get_team_info
from courtlens.finance_context_models import FinanceRefresh
from courtlens.finance_models import FinanceSource
from courtlens.services.finance_import import release_rows
from courtlens.services.stats_feed_views import _mart, _rows


def enrich_contracts(session: Session, player_id: str, reference: dict[str, Any]) -> None:
    """Attach only cap rows from this exact parsed profile and compatible finance guarantees."""
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        available = session.scalar(
            text("SELECT to_regclass(:name)"), {"name": _mart("mart_player_salaries")}
        )
        if available:
            rows = _rows(
                session,
                f"SELECT * FROM {_mart('mart_player_salaries')} WHERE profile_id = :profile_id",
                profile_id=reference["profile_id"],
            )
            by_key = {r["row_key"]: r for r in rows}
            for kind in ("salary_history", "current_contract"):
                for i, salary in enumerate(reference[kind], 1):
                    mart = by_key.get(f"{player_id}:{kind}:{i}")
                    if mart:
                        salary["share_of_cap"] = (
                            float(mart["share_of_cap"])
                            if mart["share_of_cap"] is not None
                            else None
                        )
                        salary["cap_source_url"] = mart["cap_source_url"]
                        salary["cap_source"] = mart.get("cap_source")
                        salary["cap_as_of"] = mart["cap_observed_at"]
    _guarantees(session, player_id, reference)


def _guarantees(session: Session, player_id: str, reference: dict[str, Any]) -> None:
    contract = reference["current_contract"]
    if not contract:
        return
    refresh = session.scalar(
        select(FinanceRefresh)
        .where(FinanceRefresh.book_id.is_not(None))
        .order_by(FinanceRefresh.observed_at.desc(), FinanceRefresh.id.desc())
        .limit(1)
    )
    if refresh is None or refresh.book_id is None:
        return
    book = [r for _, r in release_rows(session, refresh.book_id) if r.nba_player_id == player_id]
    # A changed salary schedule or a later contract event invalidates the old guarantee scope.
    # Totals are never divided into annual guarantees.
    last_event = max(
        (
            e["date"]
            for e in reference["contract_events"]
            if e["date"] and e["type"] in {"signed", "extended", "traded"}
        ),
        default=None,
    )
    for row in book:
        if row.kind != "guarantee" and row.amount_kind != "guaranteed_value":
            continue
        if last_event and row.observed_at.date().isoformat() < last_event:
            continue
        team = get_team_info(row.team_id) if row.team_id else None
        if team is None:
            continue
        code = {"BKN": "BRK", "CHA": "CHO", "PHX": "PHO"}.get(team.tricode, team.tricode)
        reported = [c for c in contract if c["team_code"] == code]
        if not reported:
            continue
        salary_rows = {
            r.financial_season: r.value
            for r in book
            if r.contract_id == row.contract_id
            and r.team_id == row.team_id
            and r.amount_kind == "base_salary"
        }
        if any(
            c["salary"] is None
            or salary_rows.get(c["season"]) is None
            or Decimal(c["salary"]) != Decimal(salary_rows[c["season"]] or "0")
            for c in reported
        ):
            continue
        source = session.get(FinanceSource, (refresh.book_id, row.source_sha256))
        if source is None or not source.metadata_json.get("url"):
            continue
        context = {
            "source_url": source.metadata_json["url"],
            "as_of": row.observed_at,
            "amount": row.value,
            "status": row.guarantee,
        }
        if row.financial_season:
            for salary in reported:
                if salary["season"] == row.financial_season:
                    salary["guarantee"] = context
        elif row.amount_kind == "guaranteed_value" and row.value is not None:
            reference["remaining_guaranteed"] = context
            options = {
                r.financial_season
                for r in book
                if r.contract_id == row.contract_id
                and r.team_id == row.team_id
                and r.kind == "option"
            }
            _seasons_from_total(reported, salary_rows, options, Decimal(row.value), context)


def _seasons_from_total(
    reported: list[dict[str, Any]],
    salary_rows: dict[str | None, str | None],
    options: set[str | None],
    total: Decimal,
    context: dict[str, Any],
) -> None:
    """Mark seasons fully guaranteed when the remaining guaranteed total settles them exactly.

    The source reports one total per contract, never a season's guarantee. No season's guarantee
    can exceed its salary, so a total equal to every remaining salary means each season is fully
    guaranteed. A total equal to the seasons without an option says the same of those seasons,
    given the source's convention of leaving option years out of the total. Any other total stays
    a total: it is never divided among seasons.
    """
    salaries = {s: Decimal(v) for s, v in salary_rows.items() if s is not None and v is not None}
    if not salaries:
        return
    firm = {s: v for s, v in salaries.items() if s not in options}
    if total == sum(salaries.values()):
        covered, basis = salaries, "total_equals_salaries"
    elif options and firm and total == sum(firm.values()):
        covered, basis = firm, "total_equals_non_option_salaries"
    else:
        return
    for salary in reported:
        if salary["season"] in covered and "guarantee" not in salary:
            salary["guarantee"] = {
                **context,
                "amount": salary["salary"],
                "status": "full",
                "basis": basis,
            }
