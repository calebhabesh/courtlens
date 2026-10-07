"""Official NBA award and championship results from a pinned, sourced registry.

Values come only from the versioned JSON file, whose SHA-256 is pinned beside it. Each answer
cites the NBA.com page it was read from. Nothing is filled from model memory, and counts or
"all-time" questions are not answered from this partial history.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from courtload.domain.hybrid_assistant import AnswerSource, SourceFact
from courtload.services.assistant.defaults import last_completed_season

REGISTRY = Path(__file__).with_name("knowledge") / "nba-awards-v1.json"
PARSER_VERSION = "courtlens-nba-awards-v1"

# Specific names precede the generic MVP and championship patterns.
_AWARDS: tuple[tuple[str, str], ...] = (
    (r"\bfinals mvp\b|\bbill russell (?:trophy|award)\b", "finals_mvp"),
    (r"\brookie of the year\b|\broy\b", "roy"),
    (r"\bdefensive player of the year\b|\bdpoy\b", "dpoy"),
    (r"\b(?:sixth|6th) man\b|\b6moy\b|\bsmoy\b", "smoy"),
    (r"\bmost improved\b|\bmip\b", "mip"),
    (r"\bclutch player\b", "clutch"),
    (r"\bcoach of the year\b|\bcoy\b", "coy"),
    (r"\bmvp\b|\bmost valuable player\b", "mvp"),
    (
        r"\b(?:nba )?champions?(?:hip)?\b|\bwon (?:the )?(?:title|finals|ring)\b|"
        r"\bwon it all\b|\blarry o'?brien\b",
        "champion",
    ),
)
# Aggregates need the full history, which this registry does not claim to hold.
_AGGREGATE = re.compile(
    r"\b(how many|most (?:mvps|titles|championships|rings)|all[- ]time|ever|history|career|"
    r"odds|ladder|race|favou?rite|predict|will win|chances?)\b"
)


class AwardsUnavailable(ValueError):
    """The pinned registry failed its integrity check."""


@dataclass(frozen=True)
class AwardAnswer:
    season: str
    award: str
    label: str
    interpretation: str
    record: dict[str, Any] | None


@lru_cache(maxsize=1)
def _registry() -> tuple[dict[str, Any], str]:
    raw = REGISTRY.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != REGISTRY.with_suffix(".sha256").read_text().strip():
        raise AwardsUnavailable("awards registry does not match its pinned digest")
    return json.loads(raw), digest


def match_award(message: str) -> str | None:
    text = message.lower()
    if _AGGREGATE.search(text):
        return None
    return next((award for pattern, award in _AWARDS if re.search(pattern, text)), None)


def _season(text: str, as_of: date) -> tuple[str, str]:
    explicit = re.search(r"\b(\d{4})-(\d{2})\b", text)
    if explicit and int(explicit[2]) == (int(explicit[1]) + 1) % 100:
        return explicit[0], f"Season {explicit[0]} as named."
    year = re.search(r"\b(19[5-9]\d|20\d{2})\b", text)
    if year:
        end = int(year[1])
        season = f"{end - 1}-{str(end)[2:]}"
        return season, f"{end} means the {season} season, which ended in {end}."
    if "this year" in text:
        season = f"{as_of.year - 1}-{str(as_of.year)[2:]}"
        return (
            season,
            f"This year means the {season} season, which ended in {as_of.year}.",
        )
    if "this season" in text:
        start = last_completed_season(as_of)
        upcoming = f"{int(start[:4]) + 1}-{str(int(start[:4]) + 2)[2:]}"
        return upcoming, f"This season means {upcoming} as of {as_of}."
    last = last_completed_season(as_of)
    if "last season" in text or "last year" in text:
        return last, f"Last season means the latest completed NBA season as of {as_of}."
    return last, f"No season named, so the latest completed season as of {as_of}."


def lookup(message: str, as_of: date) -> AwardAnswer | None:
    award = match_award(message)
    if award is None:
        return None
    season, interpretation = _season(message.lower(), as_of)
    data, _ = _registry()
    labels = {r["award"]: r["label"] for r in data["records"]}
    record = next(
        (r for r in data["records"] if r["season"] == season and r["award"] == award), None
    )
    return AwardAnswer(season, award, labels.get(award, award), interpretation, record)


def award_source(answer: AwardAnswer) -> tuple[AnswerSource, SourceFact]:
    record = answer.record
    assert record is not None
    data, digest = _registry()
    winner = f"{record['winner']} ({record['team']})" if record["team"] else record["winner"]
    detail = f" {record['detail'][0].upper()}{record['detail'][1:]}." if record["detail"] else ""
    excerpt = f"{record['season']} {record['label']}: {winner}" + (
        f" ({record['detail']})" if record["detail"] else ""
    )
    fact = SourceFact(
        entity=f"{record['season']} {record['label']}",
        metric="award_winner",
        value=winner,
        unit="",
        period=f"{record['season']} season",
        qualifier=f"Official NBA result.{detail} {answer.interpretation}",
        locator=record["url"],
        supporting_excerpt=excerpt,
        parser_version=PARSER_VERSION,
    )
    record_digest = hashlib.sha256(
        json.dumps(record, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    source = AnswerSource(
        source_id=(
            f"{data['version']}:{digest[:12]}:{record['source']}:"
            f"{record['award']}:{record['season']}"
        ),
        origin="external",
        title=record["title"],
        publisher="NBA.com",
        url=record["url"],
        updated_on=date.fromisoformat(record["page_updated"]) if record["page_updated"] else None,
        retrieved_at=datetime.combine(
            date.fromisoformat(data["verified_on"]), datetime.min.time(), UTC
        ),
        period=fact.period,
        content_sha256=record_digest,
        locator=record["url"],
        excerpt=excerpt,
        verification="verified",
        facts=[fact],
    )
    return source, fact
