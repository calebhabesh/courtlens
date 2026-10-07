"""Nonblocking numeric bindings over this turn's retained cells and provider grounding."""

from __future__ import annotations

import math
import re
from collections.abc import Sequence
from decimal import Decimal, InvalidOperation
from itertools import combinations
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from datetime import date

    from sqlalchemy.orm import Session

    from courtlens.domain.conversation import ConversationContext
    from courtlens.services.assistant.agent.tools import DispatchedTool

from courtlens.domain.answer_numbers import (
    ISO_DATE,
    MAX_DERIVED_CELLS,
    NUMBER,
    ORDINAL_WORDS,
    RANK,
    SEASON,
    WORD,
    WORDS,
    YEAR,
    allowed_numbers,
    matches_display,
    numeric,
)
from courtlens.domain.assistant_agent import (
    MARKER,
    AgentSource,
    ProvenanceReport,
    UnverifiedSentence,
)
from courtlens.domain.conversation import OperationResult
from courtlens.domain.metrics import METRIC_CATALOG

# Sentence boundaries preserve decimal points and citation markers after punctuation.
SENTENCE = re.compile(r"[^\n]+?(?:[.!?](?=\s+(?!\[\^)|$)|(?=\n|$))")


def _tokens(text: str) -> list[tuple[str, str, bool, int, int]]:
    # Offset-preserving masking: dates/seasons/ranks/years are always allowed by v3.
    clean = MARKER.sub(lambda m: " " * len(m[0]), text)
    clean = re.sub(
        r"(\[[^\]]*\])\(https?://[^)]+\)", lambda m: m[1] + " " * (len(m[0]) - len(m[1])), clean
    )
    for pattern in (ISO_DATE, SEASON, RANK, YEAR):
        clean = pattern.sub(lambda m: " " * len(m[0]), clean)
    values = []
    for m in NUMBER.finditer(clean):
        shown = m[1].replace(",", "") + (m[2] or "")
        negative = m[0].startswith(("-", "\u2212"))
        values.append(
            (m[0].strip(), ("-" if negative else "") + shown, bool(m[3]), m.start(), m.end())
        )
    for m in WORD.finditer(clean):
        word = m[0].lower()
        if word in ORDINAL_WORDS or (word == "one" and re.match(r"\s+of\b", clean[m.end() :])):
            continue
        values.append((m[0], str(1 if word == "one" else WORDS[word]), False, m.start(), m.end()))
    # Quantity multipliers/fractions need numeric support too; don't silently skip them.
    extra = {
        "half": "0.5",
        "quarter": "0.25",
        "dozen": "12",
        "thousand": "1000",
        "million": "1000000",
        "billion": "1000000000",
        "sixty": "60",
        "seventy": "70",
        "eighty": "80",
        "ninety": "90",
    }
    for m in re.finditer(r"\b(" + "|".join(extra) + r")\b", clean, re.I):
        values.append((m[0], extra[m[0].lower()], False, m.start(), m.end()))
    return sorted(values, key=lambda item: item[3])


def _matches(shown: str, values: Sequence[float]) -> bool:
    target = Decimal(shown)
    # The v2 helper accepts absolute differences; v3 also binds the sign.
    signed = [v for v in values if (v < 0) == (target < 0) or v == target == 0]
    try:
        return matches_display(str(abs(target)), [v for v in signed if math.isfinite(v)])
    except (InvalidOperation, ValueError, OverflowError):
        return False


def check_provenance(
    text: str,
    results: Sequence[OperationResult],
    sources: Sequence[AgentSource],
    *,
    repaired: bool = False,
    contexts: dict[str, dict[str, Any] | None] | None = None,
) -> ProvenanceReport:
    allowed = allowed_numbers(results, {})
    source_map = {s.source_id: s for s in sources}
    cells = [
        ((c.metric, c.unit), n)
        for r in results
        for c in r.evidence
        if (n := numeric(c.value)) is not None
    ][:MAX_DERIVED_CELLS]
    signed_differences = [
        a - b for (kind_a, a), (kind_b, b) in combinations(cells, 2) if kind_a == kind_b
    ]
    signed_differences.extend(-n for n in list(signed_differences))
    bound, cited, unsupported, flagged = [], [], [], []
    override = 0
    for sentence in SENTENCE.finditer(text):
        prose = sentence[0]
        # Names with embedded digits are identifiers, not quantities.
        masked = prose
        for label in allowed.labels:
            masked = masked.replace(label, " " * len(label))
        bad = []
        markers = set(MARKER.findall(prose))
        sentence_sources = [source_map[m] for m in markers if m in source_map]
        if (
            _tokens(masked)
            and any(s.origin == "web" for s in sentence_sources)
            and not any(s.origin == "warehouse" for s in sentence_sources)
            and _covered_claim(prose, results, contexts)
        ):
            override += 1
        for token, shown, percent, start, end in _tokens(masked):
            candidates = [*allowed.values, *allowed.derived, *signed_differences]
            if percent:
                candidates.extend(allowed.percents)
            if _matches(shown, candidates):
                bound.append(token)
                continue
            supported = False
            for marker in markers:
                source = source_map.get(marker)
                if source is None or source.origin == "warehouse":
                    continue
                excerpt_values = [float(t[1]) for t in _tokens(source.excerpt)]
                absolute_start, absolute_end = sentence.start() + start, sentence.start() + end
                grounded = source.span is not None and (
                    source.span[0] <= absolute_start and absolute_end <= source.span[1]
                )
                if grounded or _matches(shown, excerpt_values):
                    supported = True
                    break
            if supported:
                cited.append(token)
            else:
                unsupported.append(token)
                bad.append(token)
        if bad:
            flagged.append(
                UnverifiedSentence(
                    text=prose, start=sentence.start(), end=sentence.end(), numbers=bad
                )
            )
    return ProvenanceReport(
        bound_numbers=bound,
        cited_numbers=cited,
        unsupported_numbers=unsupported,
        unverified_sentences=flagged,
        warehouse_override_missed=override,
        repaired=repaired,
    )


def _covered_claim(
    sentence: str,
    results: Sequence[OperationResult],
    contexts: dict[str, dict[str, Any] | None] | None = None,
) -> bool:
    lower = sentence.lower()
    for result in results:
        for cell in result.evidence:
            metric = METRIC_CATALOG.get(cell.metric)
            labels = [cell.metric.replace("_", " ")]
            if metric:
                labels.append(metric.display_name.lower())
            if not any(label in lower for label in labels):
                continue
            # Check identity and season together; coverage of a different player is not authority.
            names = [
                str(row.get("name", row.get("player_name", "")))
                for row in result.rows
                if str(row.get("player_id", row.get("id", ""))) == cell.entity_id
            ]
            context = (contexts or {}).get(result.operation_hash) or result.data.get("context", {})
            season = context.get("season") if isinstance(context, dict) else None
            phase = context.get("phase") if isinstance(context, dict) else None
            if re.search(r"\b(playoffs|postseason)\b", lower) and phase != "playoffs":
                continue
            if "regular season" in lower and phase != "regular_season":
                continue
            if any(name and name.lower() in lower for name in names) and (
                not SEASON.search(sentence) or (season is not None and season in sentence)
            ):
                return True
    return False


def audit_warehouse_coverage(
    session: Session,
    text: str,
    sources: Sequence[AgentSource],
    selections: ConversationContext,
    *,
    today: date,
    deadline: float,
) -> tuple[int, list[DispatchedTool]]:
    """Check named web stat claims against real cells, even when the model skipped SQL.

    This is a bounded read-only provenance audit, not answer evidence or a saved finding.
    A catalog entry alone cannot establish per-player/cell coverage. No impact metrics are
    inferred from box-score coverage. Audit payloads are retained in the server transcript.
    """
    from courtlens.services.assistant.agent.providers.base import ToolCall
    from courtlens.services.assistant.agent.tools import dispatch
    from courtlens.services.stats_engine import COLUMN_MAP

    seen: set[tuple[str, str, str, str]] = set()
    checked: list[DispatchedTool] = []
    overrides = 0
    source_map = {s.source_id: s for s in sources}
    for sentence in SENTENCE.finditer(text):
        prose = sentence[0]
        refs = [source_map[m] for m in MARKER.findall(prose) if m in source_map]
        if not any(s.origin == "web" for s in refs) or any(s.origin == "warehouse" for s in refs):
            continue
        if not _tokens(prose):
            continue
        # A named subject is required; pronouns/cohorts cannot establish a player-cell overlap.
        subject = re.search(
            r"([A-ZÀ-Ž][\w.'\u2019\-]*(?:\s+[A-ZÀ-Ž][\w.'\u2019\-]*){1,4})\s+"
            r"(?:had|has|averaged|averages|recorded|scored|posted|shot|led|leads)\b",
            prose,
        )
        if not subject:
            continue
        name = subject[1]
        season_match = SEASON.search(prose)
        season = season_match[0].replace("\u2013", "-") if season_match else selections.season
        if season is None:
            continue
        lower = prose.lower()
        metrics = [
            m
            for m in METRIC_CATALOG.values()
            if m.key in COLUMN_MAP
            and m.capability_requirement == "core_stats"
            and (m.display_name.lower() in lower or m.key.replace("_", " ") in lower)
        ]
        if not metrics:
            continue
        metric = max(metrics, key=lambda m: len(m.display_name))
        phase = (
            "playoffs"
            if re.search(r"\b(playoffs|postseason)\b", lower)
            else "regular_season"
            if "regular season" in lower
            else selections.phase
        )
        identity = (name, metric.key, season, phase)
        if identity in seen or len(checked) >= 3:
            continue
        seen.add(identity)
        tool = dispatch(
            session,
            ToolCall(
                id="coverage_audit",
                name="query_stats",
                arguments={
                    "operation": "query",
                    "season": season,
                    "arguments": {
                        "name": name,
                        "metric_selectors": [{"key": metric.key}],
                        "page": {"limit": 1},
                    },
                },
            ),
            selections=selections,
            as_of=today,
            deadline=deadline,
        )
        checked.append(tool)
        # Actual non-null metric cells, not IDs, ranks, sample counts or observed seasons.
        if tool.warehouse_result and any(
            c.metric == metric.key and c.value is not None for c in tool.warehouse_result.evidence
        ):
            overrides += 1
    return overrides, checked
