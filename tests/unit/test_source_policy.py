from pathlib import Path

from courtlens.domain.context import CapabilityStatus
from courtlens.domain.source_policy import (
    ADMITTED_SOURCES,
    NOT_YET_INGESTED,
    POLICY_DOC,
    pending_capabilities,
    sources_for,
)


def test_policy_doc_lists_every_registered_source() -> None:
    doc = Path(POLICY_DOC).read_text(encoding="utf-8")
    for source in ADMITTED_SOURCES:
        assert f"`{source.host}`" in doc, source.key


def test_crawl_delays_and_exclusions() -> None:
    by_key = {s.key: s for s in ADMITTED_SOURCES}
    assert by_key["basketball_reference"].min_interval_seconds == 3
    assert by_key["spotrac"].min_interval_seconds == 5
    hosts = " ".join(s.host for s in ADMITTED_SOURCES)
    # Policy v3: cost is the only exclusion (BallDontLie's data tier is paid).
    assert "balldontlie" not in hosts
    assert "www.darko.app" in hosts
    assert all(s.min_interval_seconds is None for s in ADMITTED_SOURCES if s.role == "manual")


def test_pending_capabilities_are_admitted_never_blocked() -> None:
    pending = pending_capabilities()
    assert set(pending) == set(NOT_YET_INGESTED)
    for name, entry in pending.items():
        assert sources_for(name), name
        assert entry.status is CapabilityStatus.NOT_YET_OBSERVED
        assert entry.limitations and "not yet ingested" in entry.limitations[0]
