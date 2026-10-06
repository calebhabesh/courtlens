"""Small deterministic versioned Markdown registry; explanations, never current NBA facts."""

import hashlib
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session

from courtload.domain.conversation import ConversationContext
from courtload.domain.hybrid_assistant import AnswerSource

REGISTRY_VERSION = "courtload-knowledge-v3"
VERIFIED_ON = date(2026, 10, 6)


@dataclass(frozen=True)
class KnowledgeEntry:
    key: str
    title: str
    routes: tuple[str, ...]
    keywords: frozenset[str]
    text: str
    content_sha256: str

    def source(self) -> AnswerSource:
        return AnswerSource(
            source_id=f"{REGISTRY_VERSION}:{self.key}:{self.content_sha256}",
            origin="knowledge",
            title=self.title,
            publisher="CourtLoad",
            updated_on=VERIFIED_ON,
            content_sha256=self.content_sha256,
            locator=f"guide.md#{self.key}",
            excerpt=self.text,
            verification="curated",
        )


@lru_cache(maxsize=1)
def registry() -> tuple[KnowledgeEntry, ...]:
    raw = Path(__file__).with_name("knowledge").joinpath("guide.md").read_text()
    entries = []
    for section in raw.split("\n## ")[1:]:
        header, text = section.split("\n", 1)
        key, title, routes, words = (item.strip() for item in header.split("|"))
        text = text.strip()
        digest = hashlib.sha256(section.strip().encode()).hexdigest()
        entries.append(
            KnowledgeEntry(
                key, title, tuple(routes.split(",")), frozenset(words.split(",")), text, digest
            )
        )
    return tuple(entries)


def retrieve(message: str) -> KnowledgeEntry | None:
    import re

    text = message.lower()
    # Specific concepts outrank broad overlaps such as "defense" or "shooting".
    for pattern, key in (
        (r"\bpick(?:[- ]and[- ]| & )roll\b", "pick_roll"),
        (r"\bswitch(?:ing)?\b", "switching"),
        (r"\bspacing\b", "spacing"),
        (r"\boffensive rebound(?:ing|s)?\b", "offensive_rebounding"),
        (r"\bassist\b(?! per game)", "assist_definition"),
        (r"\bpace\b", "pace"),
        (r"\busage(?: rate)?\b", "usage"),
        (r"\b(travel(?:ing|ling)|double dribble)\b", "ball_handling"),
        (r"\b(zone defense|zone defence)\b", "zone"),
    ):
        if re.search(pattern, text):
            return next(entry for entry in registry() if entry.key == key)
    words = frozenset(re.findall(r"[a-z]+(?:-[a-z]+)?", text))
    if words & {"team", "teams"} and not words & {"player", "players"}:
        return next(entry for entry in registry() if entry.key == "teams")
    scores = [(len(words & e.keywords), -index, e) for index, e in enumerate(registry())]
    score, _, entry = max(scores, key=lambda item: item[:2])
    return entry if score else None


def runtime_guidance(
    session: Session, entry: KnowledgeEntry, selections: ConversationContext | None
) -> AnswerSource | None:
    """Release-bound availability; no stats execution/model call for guidance."""
    from courtload.services.stats_catalog import stats_catalog_scope
    from courtload.services.workbench_analytics import canonical_hash, resolve_workbench_context

    required = {"players": "core_stats", "teams": "core_stats", "wowy": "on_off"}.get(entry.key)
    if required is None:
        return None
    try:
        context = resolve_workbench_context(
            session,
            release_id=selections.release_id if selections else None,
            requested_season=selections.season if selections else None,
            requested_phase=selections.phase if selections else "regular_season",
        )
        catalog = stats_catalog_scope(session, context)
        season = (
            selections.season if selections and selections.season else catalog["default_season"]
        )
        phase = selections.phase if selections else "regular_season"
        available = required == "core_stats" and any(
            row["season"] == season and row["phase"] == phase for row in catalog["stats_scopes"]
        )
        text = f"Availability for {season}, {phase.replace('_', ' ')}: " + (
            "the selected release has observed box-score coverage."
            if available
            else (
                "Required coverage is not declared in the selected release. "
                "Open the tool to inspect its source limitations."
            )
        )
        identity = {
            "release": context.release_id,
            "required": required,
            "season": season,
            "phase": phase,
            "available": available,
        }
    except Exception:
        text = "Runtime availability could not be verified. Open the tool or inspect Data status."
        identity = {"required": required, "status": "unverified"}
    digest = canonical_hash({"identity": identity, "text": text, "registry": REGISTRY_VERSION})
    return AnswerSource(
        source_id=f"runtime:{digest}",
        origin="knowledge",
        title="Runtime availability",
        publisher="CourtLoad catalog",
        updated_on=None,
        content_sha256=digest,
        locator=f"catalog:{required}",
        excerpt=text,
        verification="curated",
    )
