"""Which seasons belong to which contract, from Basketball-Reference's signing events and the
contract terms the player's Wikipedia article states.

The salary rows are a plain list of seasons; the source never says which contract each belongs
to. Signing events do say where contracts start, so a span is placed only where both ends are
known and never guessed:

- A signing (free agent, rookie, re-signing) starts a contract in the NBA season (July to June)
  it was signed in. An extension starts the season after the contract in force ends, so it is
  placed only when that contract's end is known.
- A contract ends after its stated length ("Signed 5-yr ..."; by the CBA a rookie scale deal is
  four seasons, as is a first-round pick's first signing in his draft season since 1999, and a
  10-day or Exhibit 10 contract one), or where the next contract begins if
  that is sooner (an opt-out, a release, an extension that replaced an option year). Without a
  stated length it ends where the next contract begins, or, for the newest contract, with the
  last reported salary season (the current contract's last season).
- Counting forward can overrun the current contract when an extension replaced the final year of
  the deal before it (Durant's 2021 extension took over his 2022-23 option year). Only then are
  the trailing extensions counted back from the current contract's last season, which the source
  reports, as far as their lengths are stated. Which extension replaced the option year is not
  stated; a reading that puts a raise no contract allows inside one contract (Embiid's 42% in
  2023-24) is passed over for one counting back fewer, and the contract just before the
  counted-back ones ends where they begin.
- An extension whose start cannot be placed is left out of the spans; it stays a dated note. The
  contract before it then has no known end unless its length was stated, so it is left out too.

Wikipedia (services/wikipedia_contracts.py) fills three gaps, and Basketball-Reference's own
wording stays primary wherever it states a term:

- A statement within three weeks of a Basketball-Reference signing (or, undated, in its season or
  calendar year), naming that season's team when it names one, gives that signing its length when
  the source left it out, or when the source's stated length would put the yearly average above
  the CBA's maximum salary (35% of the cap), which only a typo can.
- A dated statement calling a signing an extension makes it one, when the source's wording is
  generic ("Signed a multi-year contract", no stated length): Giannis Antetokounmpo's 2016 deal
  started in 2017-18, not 2016-17. Articles also say "extension" for a re-signing after the
  contract before ended; one signed after that contract's end stays a new contract.
- A dated statement with a length adds a signing the source does not list, only when the team it
  names paid him that season and the source lists no signing with that team that season.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from datetime import date
from typing import Any

_LENGTH = re.compile(r"\b(\d+)-yr\b")
_SIGNING_TEXT = re.compile(r"^(signed|agreed to)\b", re.IGNORECASE)
ROOKIE_SCALE_SEASONS = 4
# Since the 1999 CBA a first-round pick's rookie scale contract runs at most four seasons.
ROOKIE_SCALE_SINCE = 1999
# The CBA's maximum salary is 35% of the cap; a stated length implying more is a typo.
MAX_SHARE_OF_CAP = 0.35
_STATED_VALUE = re.compile(r"\b(\d+)-yr/\$(\d+(?:\.\d+)?)M\b")
# Inside one contract a season's salary rises at most 12.5% (the CBA since 1999) plus a trade
# bonus (at most 15%); a larger rise means a new contract began that season.
MAX_RISE_IN_CONTRACT = 1.125 * 1.15
# A matched statement may be dated this far from the source's signing (announcement vs. official).
MATCH_DAYS = 21
MONTH_MATCH_DAYS = 35
# A statement this close to a listed signing is that signing, never a second one.
DUPLICATE_DAYS = 30


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
    # stated (the source's "N-yr"), rookie_scale, ten_day, exhibit_10, wikipedia
    length_source: str | None = None
    source: str = "basketball_reference"  # or wikipedia: a signing the source does not list
    terms: str | None = None  # "4-yr/$164.3M", Wikipedia's terms for a source signing
    source_url: str | None = None  # the Wikipedia article when it supplied anything
    # wikipedia: the source lists a plain signing and the article calls it an extension
    extension_source: str | None = None


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


def _source_length(texts: list[str]) -> tuple[int | None, str | None]:
    """A length the source's wording states, or one the CBA fixes for that kind of contract."""
    lengths = [int(m.group(1)) for t in texts if (m := _LENGTH.search(t))]
    if lengths:
        return lengths[0], "stated"
    lowered = " ".join(texts).lower()
    if "rookie scale" in lowered:
        return ROOKIE_SCALE_SEASONS, "rookie_scale"
    if re.search(r"\b(10|ten)-day\b", lowered):
        return 1, "ten_day"
    if re.search(r"\bexhibit 10\b", lowered):
        return 1, "exhibit_10"
    return None, None


def _is_extension(events: list[dict[str, Any]]) -> bool:
    return any(
        e.get("type") == "extended" or "extension" in (e.get("description") or "").lower()
        for e in events
    )


def _source_signings(reference: dict[str, Any]) -> list[Signing]:
    """Signing and extension events, one per deal. The source often lists a deal twice: on one
    date, or as a transaction and a contract event (no team) a day apart (Zach Collins's 2023
    extension, Oct 22 and 23)."""
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
    groups: list[tuple[date, list[dict[str, Any]]]] = []
    for day, events in sorted(by_day.items()):
        if groups and (day - groups[-1][0]).days == 1:
            earlier = groups[-1][1]
            teams = [{e.get("to_team_code") for e in g} - {None} for g in (earlier, events)]
            if (not teams[0] or not teams[1]) and _is_extension(earlier) == _is_extension(events):
                earlier.extend(events)
                continue
        groups.append((day, events))
    found = []
    for day, events in groups:
        texts = [e.get("description") or "" for e in events]
        extension = _is_extension(events)
        length, length_source = _source_length(texts)
        # The most informative wording: a stated length, then a rookie deal, then any.
        best = (
            next((t for t in texts if _LENGTH.search(t)), None)
            or next((t for t in texts if "rookie" in t.lower()), None)
            or texts[0]
        )
        team = next((e.get("to_team_code") for e in events if e.get("to_team_code")), None)
        found.append(
            Signing(day, extension, length, team, _clean(best), texts, length_source=length_source)
        )
    return found


def _rookie_scale(found: list[Signing], draft: dict[str, Any] | None) -> None:
    """A first-round pick's first signing, in his draft season, is his rookie scale contract."""
    if not draft or draft.get("round") != 1 or not draft.get("year"):
        return
    year = int(draft["year"])
    if year < ROOKIE_SCALE_SINCE or not found:
        return
    first = found[0]
    if first.extension or season_of(first.day) != year:
        return
    if first.length is None:
        first.length, first.length_source = ROOKIE_SCALE_SEASONS, "rookie_scale"
    elif first.source == "wikipedia":
        # Articles often state only a rookie deal's guaranteed years ("a two-year contract").
        first.length, first.length_source = ROOKIE_SCALE_SEASONS, "rookie_scale"
        first.description, first.terms = "Signed rookie scale contract", None


def _caps(reference: dict[str, Any]) -> dict[int, float]:
    """Each season's salary cap, from a salary and its share of the cap where both are known."""
    caps: dict[int, float] = {}
    for kind in ("salary_history", "current_contract"):
        for row in reference.get(kind) or []:
            share, salary = row.get("share_of_cap"), row.get("salary")
            if row.get("season") and share and salary:
                caps[_start_year(row["season"])] = float(salary) / float(share)
    return caps


def _implausible(signing: Signing, caps: dict[int, float]) -> bool:
    """A stated "N-yr/$XM" whose yearly average would exceed the maximum salary that season."""
    match = _STATED_VALUE.search(signing.description)
    if not match or not caps:
        return False
    years, millions = int(match[1]), float(match[2])
    season = season_of(signing.day)
    cap = caps.get(season + 1) or caps.get(season) or caps[min(caps, key=lambda y: abs(y - season))]
    return millions * 1_000_000 / years > MAX_SHARE_OF_CAP * cap


def _salary_teams(reference: dict[str, Any]) -> dict[int, set[str]]:
    teams: dict[int, set[str]] = {}
    for kind in ("salary_history", "current_contract"):
        for row in reference.get(kind) or []:
            if row.get("season") and row.get("team_code"):
                teams.setdefault(_start_year(row["season"]), set()).add(row["team_code"])
    return teams


def _statement_dates(statement: dict[str, Any]) -> list[tuple[date, int]]:
    """Each date a statement could carry, with how far from it a match may be."""
    value = statement.get("date")
    month, day = statement.get("month"), statement.get("day")
    if value and len(value) == 10:
        return [(date.fromisoformat(value), MATCH_DAYS)]
    if value and len(value) == 7:
        return [(date(int(value[:4]), int(value[5:7]), 15), MONTH_MATCH_DAYS)]
    span = statement.get("year_range")
    if span and month:
        out = []
        for year in range(span[0], span[1] + 1):
            try:
                out.append((date(year, month, day or 15), MATCH_DAYS if day else MONTH_MATCH_DAYS))
            except ValueError:
                continue
        return out
    return []


def _terms(statement: dict[str, Any]) -> str | None:
    years, value = statement.get("years"), statement.get("value")
    if years and value:
        return f"{years}-yr/{value}"
    return f"{years}-yr" if years else None


def _teams_fit(statement: dict[str, Any], signing: Signing, paid: dict[int, set[str]]) -> bool:
    """A statement naming teams must name the signing's team or a team that paid him then."""
    named = set(statement.get("teams") or [])
    if not named:
        return True
    season = season_of(signing.day)
    known = {signing.team_code} if signing.team_code else set()
    known |= paid.get(season, set()) | paid.get(season + 1, set())
    return not known or bool(named & known)


def _match(signing: Signing, statement: dict[str, Any], paid: dict[int, set[str]]) -> int | None:
    """Days between a signing and a statement that may describe it, or None."""
    if not _teams_fit(statement, signing, paid):
        return None
    gaps = [abs((day - signing.day).days) for day, limit in _statement_dates(statement)]
    limits = [limit for _, limit in _statement_dates(statement)]
    best = min((gap for gap, limit in zip(gaps, limits, strict=True) if gap <= limit), default=None)
    if best is not None:
        return best
    # Undated: "before the 2010-11 season" matches a signing in that season; a year alone, one
    # signed that calendar year. Both rank behind every dated match.
    if statement.get("season") is not None and statement["season"] == season_of(signing.day):
        return MONTH_MATCH_DAYS + 1
    if statement.get("year") is not None and statement["year"] == signing.day.year:
        return MONTH_MATCH_DAYS + 2
    return None


def _addition(
    statement: dict[str, Any], url: str | None, paid: dict[int, set[str]]
) -> Signing | None:
    """A signing the source does not list: dated to the day, a stated length, a paying team."""
    value = statement.get("date")
    years = statement.get("years")
    if (
        not value
        or len(value) != 10
        or not years
        or statement.get("year_basis") not in ("sentence", "narrative", "heading")
        or statement.get("teams_basis") not in ("sentence", "heading")
        or statement.get("term") == "rest_of_season"
    ):
        return None
    day = date.fromisoformat(value)
    if day > date.today():
        return None
    payers = paid.get(season_of(day), set()) & set(statement.get("teams") or [])
    if len(payers) != 1:
        return None
    extension = statement.get("kind") == "extension"
    noun = "two-way contract" if statement.get("term") == "two_way" else "contract"
    terms = _terms(statement)
    description = f"Signed {terms} {'contract extension' if extension else noun}"
    return Signing(
        day,
        extension,
        int(years),
        next(iter(payers)),
        description,
        [str(statement.get("text") or "")],
        length_source="wikipedia",
        source="wikipedia",
        source_url=url,
    )


def signings(
    reference: dict[str, Any],
    wikipedia: dict[str, Any] | None = None,
    draft: dict[str, Any] | None = None,
) -> list[Signing]:
    """The source's signings, completed by the CBA and the player's Wikipedia statements."""
    found = _source_signings(reference)
    _rookie_scale(found, draft)
    statements = list((wikipedia or {}).get("statements") or [])
    if not statements:
        return found
    url = (wikipedia or {}).get("article_url")
    paid = _salary_teams(reference)
    caps = _caps(reference)
    used: set[int] = set()
    for signing in found:
        options = [
            (gap, i)
            for i, statement in enumerate(statements)
            if i not in used and (gap := _match(signing, statement, paid)) is not None
        ]
        if not options:
            continue
        gap, chosen = min(options)
        used.add(chosen)
        statement = statements[chosen]
        if (
            not signing.extension
            and signing.length_source is None
            and statement.get("kind") == "extension"
            and gap <= MONTH_MATCH_DAYS
        ):
            # The source's wording is generic ("Signed a multi-year contract"); a dated article
            # statement calling it an extension says it starts after the contract in force.
            signing.extension, signing.extension_source = True, "wikipedia"
            signing.source_url = url
        years = statement.get("years")
        if not years or statement.get("term") == "rest_of_season":
            continue
        # The source's own length stays primary unless it is impossible under the maximum.
        overrides = (
            signing.length_source == "stated"
            and signing.length != int(years)
            and _implausible(signing, caps)
        )
        if signing.length is None or overrides:
            signing.length, signing.length_source = int(years), "wikipedia"
            signing.terms, signing.source_url = _terms(statement), url
        if overrides:
            # Drop the impossible "1-yr/$105M" from the label; the article's terms follow it.
            signing.description = re.sub(r"\s*\b\d+-yr(?:/\$[\d.]+[MB])?", "", signing.description)
    added: list[Signing] = []
    for i, statement in enumerate(statements):
        if i in used:
            continue
        extra = _addition(statement, url, paid)
        if extra is None:
            continue
        if any(abs((s.day - extra.day).days) <= DUPLICATE_DAYS for s in [*found, *added]):
            continue
        # The source already lists a signing with that team that season: a second would be the
        # same deal dated differently.
        if any(
            season_of(s.day) == season_of(extra.day) and s.team_code in (None, extra.team_code)
            for s in found
        ):
            continue
        added.append(extra)
    merged = sorted([*found, *added], key=lambda s: s.day)
    _rookie_scale(merged, draft)
    return merged


@dataclass
class _Placed:
    signing: Signing
    start: int
    end: int | None
    end_basis: str | None
    # signed (the season it was signed in), previous_contract (after the one in force ended),
    # current_contract (counted back from the current contract's last season)
    start_basis: str
    blocked: bool = False


def _salaries(reference: dict[str, Any]) -> dict[int, float]:
    """Each season's reported salary (the larger where two rows share a season)."""
    out: dict[int, float] = {}
    for kind in ("salary_history", "current_contract"):
        for row in reference.get(kind) or []:
            if row.get("season") and row.get("salary"):
                year = _start_year(row["season"])
                out[year] = max(out.get(year, 0.0), float(row["salary"]))
    return out


def _new_contract(salaries: dict[int, float], year: int) -> bool:
    """A salary rising more than any one contract allows: a new contract began that season."""
    before, now = salaries.get(year - 1), salaries.get(year)
    return (
        year >= ROOKIE_SCALE_SINCE
        and before is not None
        and now is not None
        and now > before * MAX_RISE_IN_CONTRACT
    )


def _forward(found: list[Signing], salaries: dict[int, float]) -> list[_Placed]:
    placed: list[_Placed] = []
    for signing in found:
        signed = season_of(signing.day)
        previous = placed[-1] if placed else None
        # The article's "extension" for a deal signed after the contract before it had ended
        # (or with none before it) is a new contract in loose wording.
        loose = signing.extension_source == "wikipedia" and (
            previous is None or (previous.end is not None and previous.end < signed)
        )
        if loose:
            signing.extension, signing.extension_source = False, None
        if signing.extension:
            # It extends the contract in force when signed; it starts once that one ends.
            if previous is None or previous.end is None or previous.end < signed:
                if previous is not None and previous.end is None:
                    # Somewhere inside its run an extension took over: its end is unknown.
                    previous.blocked = True
                continue
            start, start_basis = previous.end + 1, "previous_contract"
            # A rise no contract allows, after it was signed and before that, is where it took
            # over the rest of the contract before (Mitchell's 2024 extension, 2025-26).
            rise = next((y for y in range(signed + 1, start) if _new_contract(salaries, y)), None)
            if rise is not None:
                start, start_basis = rise, "salary_rise"
        else:
            start, start_basis = signed, "signed"
        end = start + signing.length - 1 if signing.length else None
        # An earlier contract without a known end ends where this one begins; one with a stated
        # length ends sooner if this one begins first (an opt-out or a release).
        if placed and not placed[-1].blocked:
            previous = placed[-1]
            cap = max(previous.start, start - 1)
            if previous.end is None or previous.end > cap:
                previous.end, previous.end_basis = cap, "next_contract"
        placed.append(
            _Placed(signing, start, end, "stated_length" if signing.length else None, start_basis)
        )
    return placed


def _raise_fits(span: _Placed, salaries: dict[int, float]) -> bool:
    """No season inside one contract rises more than the CBA's raises (12.5% since 1999) plus
    the largest trade bonus (15%) allow; a larger rise is where a new contract began."""
    if span.end is None or span.start < ROOKIE_SCALE_SINCE:
        return True
    return not any(_new_contract(salaries, y) for y in range(span.start + 1, span.end + 1))


def _count_back(
    found: list[Signing], placed: list[_Placed], last: int, salaries: dict[int, float]
) -> list[_Placed]:
    """Place the extensions after the newest signing back from the current contract's end.

    Counting forward overran the current contract, so some extension replaced the final season
    of the deal before it. Which one is not stated: counting back all of them assumes the oldest
    did (Durant's 2021 extension), counting back only the newest assumes it did (Embiid's 2024
    one). The deepest reading whose re-placed contracts show no impossible raise is used.
    """
    newest_signing = max((i for i, s in enumerate(found) if not s.extension), default=-1)
    tail = found[newest_signing + 1 :]
    if not tail:
        return placed
    # Only when counting forward contradicts the reported current contract. Where it is merely
    # blocked (a contract before has no length), counting back would assume the newest listed
    # extension is the current contract, and a signing neither source lists would misplace it.
    if not placed or placed[-1].end is None or placed[-1].end <= last:
        return placed
    chain: list[_Placed] = []
    end = last
    for signing in reversed(tail):
        if signing.length is None:
            break
        start = end - signing.length + 1
        # An extension takes over after the season it was signed in.
        if start <= season_of(signing.day):
            break
        chain.append(_Placed(signing, start, end, "stated_length", "current_contract"))
        end = start - 1
    fallback: list[_Placed] | None = None
    for depth in range(len(chain), 0, -1):
        reading = _counted_back(found, placed, chain[:depth][::-1], newest_signing, salaries)
        if reading is None:
            continue
        spans, changed = reading
        if all(_raise_fits(span, salaries) for span in changed):
            return spans
        fallback = fallback or spans
    return fallback or placed


def _start_known(span: _Placed, salaries: dict[int, float]) -> bool:
    """Signed in the season it began, began the season after it was signed, or began where the
    salary rose more than one contract allows."""
    return (
        span.start_basis in ("signed", "salary_rise")
        or span.start == season_of(span.signing.day) + 1
        or _new_contract(salaries, span.start)
    )


def _counted_back(
    found: list[Signing],
    placed: list[_Placed],
    back: list[_Placed],
    newest_signing: int,
    salaries: dict[int, float],
) -> tuple[list[_Placed], list[_Placed]] | None:
    """The spans with these extensions counted back, and the spans that reading re-placed."""
    first = back[0].start
    if newest_signing >= 0 and season_of(found[newest_signing].day) >= first:
        return None  # It would begin before the newest signing: the lengths do not fit.
    backed = {id(p.signing) for p in back}
    kept = [replace(p) for p in placed if id(p.signing) not in backed and p.start < first]
    index = found.index(back[0].signing)
    before = found[index - 1] if index > 0 else None
    changed = list(back)
    if kept and kept[-1].signing is before and not _start_known(kept[-1], salaries):
        # Its start rests on the contract before it running its full length, which an option
        # year it replaced would also cut short: it stays a note (Holiday's 2021 extension).
        kept.pop()
    if kept and before is not None and kept[-1].signing is before:
        # The contract just before ends where the counted-back one begins.
        previous = kept[-1]
        if previous.end is None or previous.blocked or previous.end >= first:
            previous.end, previous.end_basis, previous.blocked = first - 1, "next_contract", False
            changed.append(previous)
    elif kept and (kept[-1].end is None or kept[-1].end >= first):
        # An unplaced extension sits between them: the earlier contract's end is unknown.
        kept[-1].end, kept[-1].blocked = None, True
    return kept + back, changed


def _place(
    found: list[Signing], salaries: dict[int, float], last: int, current: bool
) -> list[_Placed]:
    """Count forward, then back where that overran the current contract. An article's
    "extension" that leaves the current contract overrun with no reading that fits is read as
    the source's plain signing instead (Harden's 2026 deal, a new contract from 2026-27)."""
    placed = _forward(found, salaries)
    if current:
        placed = _count_back(found, placed, last, salaries)
    for signing in reversed(found):
        if not (current and placed and placed[-1].end is not None and placed[-1].end > last):
            break
        if signing.extension_source != "wikipedia":
            continue
        signing.extension, signing.extension_source = False, None
        retry = _count_back(found, _forward(found, salaries), last, salaries)
        if retry and retry[-1].end is not None and retry[-1].end <= last:
            placed = retry
        else:
            signing.extension, signing.extension_source = True, "wikipedia"
    return placed


def contract_spans(
    reference: dict[str, Any],
    wikipedia: dict[str, Any] | None = None,
    draft: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Each placeable contract: its first and last season, how its ends are known, its signing."""
    seasons = [
        row["season"]
        for kind in ("salary_history", "current_contract")
        for row in reference.get(kind) or []
        if row.get("season")
    ]
    if not seasons:
        return []
    last_reported = max(_start_year(s) for s in seasons)
    current = bool(reference.get("current_contract"))
    found = signings(reference, wikipedia, draft)
    salaries = _salaries(reference)
    placed = _place(found, salaries, last_reported, current)
    spans = []
    for i, span in enumerate(placed):
        if span.end is None:
            if i != len(placed) - 1 or span.blocked:
                continue
            span.end = last_reported
            span.end_basis = "current_contract" if current else "last_reported_season"
        end = min(span.end, last_reported)
        if span.start > end:
            continue
        signed_by = span.signing
        spans.append(
            {
                "start_season": season_label(span.start),
                "end_season": season_label(end),
                "end_basis": span.end_basis,
                "start_basis": span.start_basis,
                "signed_date": signed_by.day,
                "kind": "extension" if signed_by.extension else "signing",
                "length_stated": signed_by.length is not None,
                "length_source": signed_by.length_source,
                "team_code": signed_by.team_code,
                "description": signed_by.description,
                "terms": signed_by.terms,
                "source": signed_by.source,
                "source_url": signed_by.source_url,
                "extension_source": signed_by.extension_source,
                "current": current and i == len(placed) - 1 and end == last_reported,
            }
        )
    return spans


def unplaced_signings(
    reference: dict[str, Any],
    spans: list[dict[str, Any]],
    wikipedia: dict[str, Any] | None = None,
    draft: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Signings no span could be placed for, with the season they were signed in."""
    placed = {span["signed_date"] for span in spans}
    return [
        {
            "signed_date": s.day,
            "season": season_label(season_of(s.day)),
            "kind": "extension" if s.extension else "signing",
            "description": s.description,
            "years": s.length,
            "length_source": s.length_source,
            "terms": s.terms,
            "source": s.source,
            "source_url": s.source_url,
            "extension_source": s.extension_source,
        }
        for s in signings(reference, wikipedia, draft)
        if s.day not in placed
    ]
