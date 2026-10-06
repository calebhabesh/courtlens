"""AR04 numeric check: narrative numbers must come from executed result cells.

Every number in model-written narrative prose must equal a result cell at its displayed
precision, or a server-recomputed sum, difference or ratio of two cells of the same metric
and unit. Season labels, ranks within the returned rows and scope years/dates are the only
other numbers allowed. The check is pure so a stored response re-verifies on every load.
It verifies values, not attribution: a correct number next to the wrong name passes.
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal, InvalidOperation
from itertools import combinations
from typing import Any

from courtload.domain.conversation import OperationResult

CHECKER_VERSION = "narrative-check-v1"
MAX_SENTENCES = 3
MAX_CHARS = 700
# Derived arithmetic is bounded to pairs; larger cell sets only allow direct matches.
MAX_DERIVED_CELLS = 120

SEASON = re.compile(r"\b((?:19|20)\d{2})[-\u2013]((?:\d{2})|(?:(?:19|20)\d{2}))\b")
ISO_DATE = re.compile(r"\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b")
RANK = re.compile(
    r"(?:\b(?:no\.|number|ranked|ranks|rank|top)\s*|#)(\d{1,3})\b|\b(\d{1,3})(?:st|nd|rd|th)\b",
    re.I,
)
YEAR = re.compile(r"\b((?:19|20)\d{2})\b")
NUMBER = re.compile(
    r"(?<![\w.])[-\u2212]?\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?%|\s?percent\b)?", re.I
)
WORDS = {
    "zero": 0,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "hundred": 100,
}
ORDINAL_WORDS = {
    "first": 1,
    "second": 2,
    "third": 3,
    "fourth": 4,
    "fifth": 5,
    "sixth": 6,
    "seventh": 7,
    "eighth": 8,
    "ninth": 9,
    "tenth": 10,
}
WORD = re.compile(r"\b(" + "|".join([*WORDS, *ORDINAL_WORDS, "one"]) + r")\b", re.I)
# Unverifiable quantities and verdicts the zero-inferred-claims rule excludes.
FORBIDDEN = re.compile(
    r"\b(twice|double[sd]?|triple[sd]?|half|quarter|dozen|thousand|million|billion|"
    r"probability|probably|chance|odds|guarantee[sd]?|certain(?:ly)?|"
    r"will (?:outscore|outperform|beat|win|lead)|should (?:start|sit|bench)|"
    r"because|due to|caused?)\b",
    re.I,
)


ROUNDING = (ROUND_HALF_UP, ROUND_HALF_EVEN)
PERCENT_UNITS = frozenset({"percentage", "rate", "ratio", "percent change"})


class NarrativeRejected(ValueError):
    """The narrative contains an unverifiable number or claim; the template is used."""

    def __init__(self, reason: str, token: str = "") -> None:
        super().__init__(f"{reason}: {token}" if token else reason)
        self.reason = reason
        self.token = token


@dataclass(frozen=True)
class Allowed:
    values: tuple[float, ...]
    derived: tuple[float, ...]
    # Candidates a "%" may display: percentage-like cells/differences and ratios, times 100.
    percents: tuple[float, ...]
    seasons: frozenset[str]
    dates: frozenset[str]
    years: frozenset[int]
    max_rank: int
    # Result names that contain digits, such as "Philadelphia 76ers".
    labels: tuple[str, ...] = ()


def _numeric(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value) if math.isfinite(value) else None
    if isinstance(value, str):
        try:
            number = Decimal(value)
        except InvalidOperation:
            return None
        return float(number) if number.is_finite() else None
    return None


def _strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)


def _season_key(start: str, end: str) -> str:
    return f"{start}-{end[-2:]}"


def allowed_numbers(results: Sequence[OperationResult], scope: dict[str, Any]) -> Allowed:
    cells = [
        ((cell.metric, cell.unit), number)
        for result in results
        for cell in result.evidence
        if (number := _numeric(cell.value)) is not None
    ]
    derived: list[float] = []
    percents = [number * 100 for (_, unit), number in cells if unit in PERCENT_UNITS]
    bounded = cells[:MAX_DERIVED_CELLS]
    # Only comparable cells: the same metric in the same unit, e.g. two players' PPG.
    for (kind_a, a), (kind_b, b) in combinations(bounded, 2):
        if kind_a != kind_b:
            continue
        derived.extend((a + b, abs(a - b)))
        if kind_a[1] in PERCENT_UNITS:
            percents.extend((100 * (a + b), 100 * abs(a - b)))
        for ratio in (a / b if b else None, b / a if a else None):
            if ratio is not None:
                derived.append(ratio)
                percents.append(100 * ratio)
    # Scope years come from resolved selections and dates, never from version strings.
    selections = scope.get("selections") or {}
    local = scope.get("local_context") or {}
    scoped = [
        str(value)
        for value in (
            selections.get("season"),
            selections.get("before_date"),
            scope.get("as_of"),
            *(
                local.get(key)
                for key in ("season", "before_date", "coverage_start", "coverage_end")
            ),
        )
        if value
    ]
    data = [text for r in results for text in _strings(r.data)]
    texts = [*scoped, *data]
    seasons = {_season_key(m[1], m[2]) for text in texts for m in SEASON.finditer(text)}
    dates = {m[0] for text in texts for m in ISO_DATE.finditer(text)}
    years = {int(m[1]) for text in texts for m in ISO_DATE.finditer(text)}
    for season in seasons:
        start = int(season[:4])
        years.update((start, start + 1))
    return Allowed(
        values=tuple(number for _, number in cells),
        derived=tuple(derived),
        percents=tuple(percents),
        seasons=frozenset(seasons),
        dates=frozenset(dates),
        years=frozenset(years),
        max_rank=max((len(r.rows) for r in results), default=0),
        labels=tuple(
            sorted(
                {
                    text
                    for text in data
                    if len(text) <= 60
                    and re.search(r"\d", text)
                    and re.search(r"[A-Za-z]{2}", text)
                    and not SEASON.search(text)
                    and not ISO_DATE.search(text)
                },
                key=len,
                reverse=True,
            )
        ),
    )


def _matches(shown: str, candidates: Iterable[float]) -> bool:
    """Display rounding: a candidate rounded to the shown precision equals the shown value."""
    target = Decimal(shown)
    quantum = Decimal(1).scaleb(target.as_tuple().exponent)  # type: ignore[arg-type]
    for candidate in candidates:
        value = Decimal(repr(abs(candidate)))
        if any(value.quantize(quantum, rounding=mode) == target for mode in ROUNDING):
            return True
    return False


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
        if not _matches(shown, candidates):
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
        if not _matches(str(value), [*allowed.values, *allowed.derived]):
            raise NarrativeRejected("unmatched_number", match[0])
        checked.append(float(value))
    return checked
