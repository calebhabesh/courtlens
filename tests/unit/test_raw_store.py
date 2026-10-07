from datetime import UTC, datetime, timedelta

from courtlens.ingestion.raw_store import RawStore


def test_raw_store_is_content_addressed_and_canonical(tmp_path) -> None:  # type: ignore[no-untyped-def]
    store = RawStore(tmp_path)
    first = store.put(
        source="fixture",
        resource="games",
        source_key="1",
        payload={"b": 2, "a": 1},
        fetched_at=datetime(2025, 1, 1, tzinfo=UTC),
    )
    second = store.put(
        source="fixture",
        resource="games",
        source_key="1",
        payload={"a": 1, "b": 2},
        fetched_at=datetime(2025, 1, 1, tzinfo=UTC) + timedelta(days=90),
    )

    assert first.checksum == second.checksum
    assert first.uri == second.uri
    assert (tmp_path / first.uri).read_bytes() == b'{"a":1,"b":2}'
