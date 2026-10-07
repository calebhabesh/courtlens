"""Server civil clock and bounded verified season calendar; no dataset-driven relative dates."""

import re
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from courtlens.domain.conversation import ConversationContext
from courtlens.domain.hybrid_assistant import InterpretedScope
from courtlens.services.workbench_analytics import canonical_hash

CALENDAR_VERSION = "nba-completed-seasons-2019-2026-v1"
VERIFIED_ON = date(2026, 10, 5)
# Civil completion is the day AFTER the final game: a date-only clock cannot prove
# that the game already ended on its final-game date. Never use scheduled Game 7.
FINALS = (
    ("2018-19", "2019-06-13", "https://www.nba.com/2019-finals-game6-the-wrap"),
    ("2019-20", "2020-10-11", "https://www.nba.com/news/finals-stat-lakers-heat-6"),
    (
        "2020-21",
        "2021-07-20",
        "https://www.nba.com/news/inside-the-box-score-2021-nba-finals-game-6",
    ),
    ("2021-22", "2022-06-16", "https://www.nba.com/playoffs/2022/the-finals"),
    ("2022-23", "2023-06-12", "https://www.nba.com/game/mia-vs-den-0042200405"),
    ("2023-24", "2024-06-17", "https://www.nba.com/game/0042300405"),
    ("2024-25", "2025-06-22", "https://www.nba.com/news/2025-nba-playoffs-schedule"),
    ("2025-26", "2026-06-13", "https://www.nba.com/news/2026-nba-playoffs-schedule"),
)
CALENDAR_SHA256 = canonical_hash(
    {
        "version": CALENDAR_VERSION,
        "finals": FINALS,
        "valid_until": "2027-04-11",
        "next_season_source": "https://pr.nba.com/2026-27-nba-regular-season-schedule",
    }
)


class ScopeClarification(ValueError):
    pass


class CalendarUnavailable(ValueError):
    pass


def civil_today() -> date:
    return datetime.now(UTC).astimezone(ZoneInfo("America/New_York")).date()


def last_completed_season(as_of: date) -> str:
    # This version establishes completion only through 2026; future transitions need
    # a new verified entry. Refuse to silently return a stale season next summer.
    if as_of > date(2027, 4, 11):
        raise CalendarUnavailable("The season calendar needs an update for this date.")
    completed = [season for season, final, _ in FINALS if date.fromisoformat(final) < as_of]
    if not completed:
        raise CalendarUnavailable("This historical date precedes the verified season calendar.")
    return completed[-1]


def resolve_scope(
    message: str,
    inherited: ConversationContext | None,
    *,
    as_of: date,
) -> InterpretedScope:
    text = message.lower().replace("\u2013", "-")
    selections = inherited.model_dump() if inherited else {}
    assumptions = (
        ["Regular season unless a phase is specified."]
        if not inherited
        else ["Inherited selected scope."]
    )
    frame = re.search(r"(?:as of|on)\s+(\d{4}-\d{2}-\d{2})", text)
    reference = date.fromisoformat(frame[1]) if frame else as_of
    explicit = re.findall(r"\b(\d{4}-\d{2})\b(?!-\d{2})", text)
    explicit = list(dict.fromkeys(explicit))
    if len(explicit) > 1:
        raise ScopeClarification("Which basketball season should this turn use?")
    if "last year" in text or re.search(r"\bin \d{4}\b(?!-\d{2})", text):
        raise ScopeClarification("Do you mean a calendar year or an NBA season?")
    if "last season" in text:
        if explicit:
            raise ScopeClarification("Should I use the named season or the last completed season?")
        selections["season"] = last_completed_season(reference)
        selections["before_date"] = reference
        assumptions.append(f"Last season means the latest completed NBA season as of {reference}.")
    elif "this season" in text:
        # Before opening night there are materially different interpretations.
        if date(2026, 10, 20) <= reference <= date(2027, 4, 11):
            selections["season"] = "2026-27"
            selections["before_date"] = reference
        else:
            raise ScopeClarification(
                "Do you mean the upcoming NBA season or the most recently completed season?"
            )
    elif explicit:
        start = int(explicit[0][:4])
        if int(explicit[0][-2:]) != (start + 1) % 100:
            raise ScopeClarification("Which valid NBA season should I use (for example, 2025-26)?")
        selections["season"] = explicit[0]
        # Clear inherited cutoff when changing season; retain release, never switch pointer.
        if inherited and inherited.season != explicit[0]:
            selections["before_date"] = None
    cutoff = re.search(r"before\s+(\d{4}-\d{2}-\d{2})", text)
    if cutoff:
        selections["before_date"] = date.fromisoformat(cutoff[1])
    if "last five" in text or "last 5" in text:
        selections["window"] = "last_5"
    if "playoffs" in text or "postseason" in text:
        selections["phase"] = "playoffs"
    elif "regular season" in text:
        selections["phase"] = "regular_season"
    if "recently" in text or "recent" in text or "last ten" in text or "last 10" in text:
        selections["window"] = "last_10"
        assumptions.append(
            "Recent means the last ten observed appearances; changes use the "
            "preceding ten disjoint appearances."
        )
    elif "whole season" in text or "full season" in text:
        selections["window"] = "season"
    context = ConversationContext.model_validate(selections)
    label = (
        f"{context.season or 'Catalog default season'} · "
        f"{context.phase.replace('_', ' ')} · {context.window.replace('_', ' ')}"
    )
    return InterpretedScope(
        as_of=as_of,
        calendar_version=CALENDAR_VERSION,
        calendar_sha256=CALENDAR_SHA256,
        selections=context,
        assumptions=assumptions,
        label=label,
    )
