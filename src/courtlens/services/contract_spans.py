"""Which seasons belong to which contract, from Basketball-Reference's signing events.

The salary rows are a plain list of seasons; the source never says which contract each belongs
to. Signing events do say where contracts start, so a span is placed only where both ends are
known and never guessed:

- A signing (free agent, rookie, re-signing) starts a contract in the NBA season (July to June)
  it was signed in. An extension starts the season after the contract in force ends, so it is
  placed only when that contract's end is known.
- A contract ends after its stated length ("Signed 5-yr ..."; a rookie scale deal is four
  seasons by the CBA), or where the next contract begins if that is sooner (an opt-out, a
  release). Without a stated length it ends where the next contract begins, or, for the newest
  contract, with the last reported salary season (the current contract's last season).
- An extension whose start cannot be placed is left out of the spans; it stays a dated event. The
  contract before it then has no known end unless its length was stated, so it is left out too.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

_LENGTH = re.compile(r"\b(\d+)-yr\b")
_SIGNING_TEXT = re.compile(r"^(signed|agreed to)\b", re.IGNORECASE)
ROOKIE_SCALE_SEASONS = 4


def season_of(day: date) -> int:
    """The start year of the NBA season (July to June) a date falls in."""
    return day.year if day.month >= 7 else day.year - 1


def season_label(start_year: int) -> str:
    return f"{start_year}-{str(start_year + 1)[2:]}"


def _start_year(season: str) -> int:
    return int(season[:4])


@dataclass
class Signing:
    day: date
    extension: bool
    length: int | None
    team_code: str | None
    description: str
    descriptions: list[str] = field(default_factory=list)


def _as_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _clean(description: str) -> str:
    """'Signed 5-yr maximum salary contract on Monday, July 9, 2018.' -> without the date."""
    text = re.sub(r"\s+(on\s+)?\w+day,\s+\w+\s+\d{1,2},\s+\d{4}\.?$", "", description.strip())
    text = re.sub(r"\s+with the\s+.+?\s*\.$", "", text)
    return text.rstrip(" .")


def signings(reference: dict[str, Any]) -> list[Signing]:
    """Signing and extension events, one per date (the source often lists a date twice)."""
    by_day: dict[date, list[dict[str, Any]]] = {}
    for event in [
        *(reference.get("contract_events") or []),
        *(reference.get("transactions") or []),
    ]:
        day = _as_date(event.get("date"))
        kind = event.get("type")
        text = event.get("description") or ""
        if day is None:
            continue
        if kind in {"signed", "extended"} or (kind == "other" and _SIGNING_TEXT.match(text)):
            by_day.setdefault(day, []).append(event)
    found = []
    for day, events in sorted(by_day.items()):
        texts = [e.get("description") or "" for e in events]
        extension = any(
            e.get("type") == "extended" or "extension" in t.lower()
            for e, t in zip(events, texts, strict=True)
        )
        lengths = [int(m.group(1)) for t in texts if (m := _LENGTH.search(t))]
        rookie = any("rookie scale" in t.lower() for t in texts)
        length = lengths[0] if lengths else ROOKIE_SCALE_SEASONS if rookie else None
        # The most informative wording: a stated length, then a rookie deal, then any.
        best = (
            next((t for t in texts if _LENGTH.search(t)), None)
            or next((t for t in texts if "rookie" in t.lower()), None)
            or texts[0]
        )
        team = next((e.get("to_team_code") for e in events if e.get("to_team_code")), None)
        found.append(Signing(day, extension, length, team, _clean(best), texts))
    return found


def contract_spans(reference: dict[str, Any]) -> list[dict[str, Any]]:
    """Each placeable contract: its first and last season, how its end is known, and its signing."""
    seasons = [
        row["season"]
        for kind in ("salary_history", "current_contract")
        for row in reference.get(kind) or []
        if row.get("season")
    ]
    if not seasons:
        return []
    last_reported = max(_start_year(s) for s in seasons)
    placed: list[dict[str, Any]] = []
    for signing in signings(reference):
        signed = season_of(signing.day)
        if signing.extension:
            # It extends the contract in force when signed; it starts once that one ends.
            previous = placed[-1] if placed else None
            if previous is None or previous["end"] is None or previous["end"] < signed:
                if previous is not None and previous["end"] is None:
                    # Somewhere inside its run an extension took over: its end is unknown.
                    previous["blocked"] = True
                continue
            start = previous["end"] + 1
        else:
            start = signed
        end = start + signing.length - 1 if signing.length else None
        # An earlier contract without a known end ends where this one begins; one with a stated
        # length ends sooner if this one begins first (an opt-out or a release).
        if placed and not placed[-1].get("blocked"):
            previous = placed[-1]
            cap = max(previous["start"], start - 1)
            if previous["end"] is None or previous["end"] > cap:
                previous["end"], previous["end_basis"] = cap, "next_contract"
        placed.append(
            {
                "start": start,
                "end": end,
                "end_basis": "stated_length" if signing.length else None,
                "signing": signing,
            }
        )
    current = bool(reference.get("current_contract"))
    spans = []
    for i, span in enumerate(placed):
        if span["end"] is None:
            if i != len(placed) - 1 or span.get("blocked"):
                continue
            span["end"] = last_reported
            span["end_basis"] = "current_contract" if current else "last_reported_season"
        end = min(span["end"], last_reported)
        if span["start"] > end:
            continue
        signed_by: Signing = span["signing"]
        spans.append(
            {
                "start_season": season_label(span["start"]),
                "end_season": season_label(end),
                "end_basis": span["end_basis"],
                "signed_date": signed_by.day,
                "kind": "extension" if signed_by.extension else "signing",
                "length_stated": signed_by.length is not None,
                "team_code": signed_by.team_code,
                "description": signed_by.description,
                "current": current and i == len(placed) - 1 and end == last_reported,
            }
        )
    return spans


def unplaced_signings(
    reference: dict[str, Any], spans: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Signings no span could be placed for, with the season they were signed in."""
    placed = {span["signed_date"] for span in spans}
    return [
        {
            "signed_date": s.day,
            "season": season_label(season_of(s.day)),
            "kind": "extension" if s.extension else "signing",
            "description": s.description,
        }
        for s in signings(reference)
        if s.day not in placed
    ]
