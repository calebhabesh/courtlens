"""AR04 numeric check: narrative numbers must come from executed result cells.

Every number in model-written narrative prose must equal a result cell at its displayed
precision, or a server-recomputed sum, difference or ratio of two cells of the same metric
and unit. Season labels, ranks within the returned rows and scope years/dates are the only
other numbers allowed. The check is pure so a stored response re-verifies on every load.
It verifies values, not attribution: a correct number next to the wrong name passes.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from courtload.domain.answer_numbers import (
    ISO_DATE,
    NUMBER,
    ORDINAL_WORDS,
    RANK,
    SEASON,
    WORD,
    WORDS,
    YEAR,
    _season_key,
    allowed_numbers,
    matches_display,
)
from courtload.domain.conversation import OperationResult

CHECKER_VERSION = "narrative-check-v1"
MAX_SENTENCES = 3
MAX_CHARS = 700
# Derived arithmetic is bounded to pairs; larger cell sets only allow direct matches.
MAX_DERIVED_CELLS = 120

# Unverifiable quantities and verdicts the zero-inferred-claims rule excludes.
FORBIDDEN = re.compile(
    r"\b(twice|double[sd]?|triple[sd]?|half|quarter|dozen|thousand|million|billion|"
    r"probability|probably|chance|odds|guarantee[sd]?|certain(?:ly)?|"
    r"will (?:outscore|outperform|beat|win|lead)|should (?:start|sit|bench)|"
    r"because|due to|caused?)\b",
    re.I,
)


class NarrativeRejected(ValueError):
    """The narrative contains an unverifiable number or claim; the template is used."""

    def __init__(self, reason: str, token: str = "") -> None:
        super().__init__(f"{reason}: {token}" if token else reason)
        self.reason = reason
        self.token = token


def check_narrative(
    text: str, results: Sequence[OperationResult], scope: dict[str, Any]
) -> list[float]:
    """Return the checked numbers, or raise NarrativeRejected with the first failure."""
    if not text.strip() or len(text) > MAX_CHARS:
        raise NarrativeRejected("length")
    if any(char in text for char in "*_#`|<>[]"):
        raise NarrativeRejected("markup")
    if len([s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]) > MAX_SENTENCES:
        raise NarrativeRejected("too_many_sentences")
    if forbidden := FORBIDDEN.search(text):
        raise NarrativeRejected("unverifiable_claim", forbidden[0])
    if not results:
        raise NarrativeRejected("no_results")
    allowed = allowed_numbers(results, scope)
    remaining = text
    for label in allowed.labels:
        remaining = remaining.replace(label, " ")
    for match in ISO_DATE.finditer(remaining):
        if match[0] not in allowed.dates:
            raise NarrativeRejected("date_outside_scope", match[0])
    remaining = ISO_DATE.sub(" ", remaining)
    for match in SEASON.finditer(remaining):
        if _season_key(match[1], match[2]) not in allowed.seasons:
            raise NarrativeRejected("season_outside_scope", match[0])
    remaining = SEASON.sub(" ", remaining)
    for match in RANK.finditer(remaining):
        rank = int(match[1] or match[2])
        if not 1 <= rank <= allowed.max_rank:
            raise NarrativeRejected("rank_outside_rows", match[0])
    remaining = RANK.sub(" ", remaining)
    for match in YEAR.finditer(remaining):
        if int(match[1]) not in allowed.years:
            raise NarrativeRejected("year_outside_scope", match[0])
    remaining = YEAR.sub(" ", remaining)
    checked: list[float] = []
    for match in NUMBER.finditer(remaining):
        digits = match[1].replace(",", "")
        fraction = match[2] or ""
        shown = digits + fraction
        candidates: list[float] = [*allowed.values, *allowed.derived]
        if match[3]:
            candidates = [*candidates, *allowed.percents]
        if not matches_display(shown, candidates):
            raise NarrativeRejected("unmatched_number", match[0].strip())
        checked.append(float(shown))
    for match in WORD.finditer(remaining):
        word = match[1].lower()
        if word == "one" and re.match(r"\s+of\b", remaining[match.end() :]):
            continue
        if word in ORDINAL_WORDS:
            if not 1 <= ORDINAL_WORDS[word] <= allowed.max_rank:
                raise NarrativeRejected("rank_outside_rows", match[0])
            continue
        value = 1 if word == "one" else WORDS[word]
        if not matches_display(str(value), [*allowed.values, *allowed.derived]):
            raise NarrativeRejected("unmatched_number", match[0])
        checked.append(float(value))
    return checked
