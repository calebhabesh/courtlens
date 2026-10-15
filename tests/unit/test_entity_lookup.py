"""Unit and contract tests for Entity Discovery and Incremental Lookup API (Block B04)."""

from __future__ import annotations

import concurrent.futures
import time

import pytest
from sqlalchemy.orm import Session

from courtlens.domain.entity_lookup import (
    LOOKUP_CATALOG_VERSION,
    STATIC_NAVIGATION_PAGES,
    damerau_levenshtein_distance,
    generate_player_aliases,
    normalize_lookup_text,
    tokenize_lookup_text,
)
from courtlens.services.entity_lookup import (
    clear_lookup_caches,
    get_or_build_entity_index,
    lookup_entities,
)
from courtlens.workbench_models import (
    WorkbenchIdentity,
)


@pytest.fixture(autouse=True)
def _reset_caches():
    """Ensure in-memory caches are reset between tests."""
    clear_lookup_caches()
    yield
    clear_lookup_caches()


@pytest.fixture
def test_db_session(test_engine):
    """Always use the same explicit identities, independent of local database contents."""
    with Session(test_engine) as session:
        session.add_all(
            [
                WorkbenchIdentity(
                    namespace="nba",
                    kind="player",
                    external_id="203999",
                    display_name="Nikola Jokić",
                    metadata_json={"aliases": ["Nikola Jokić", "The Joker"]},
                ),
                WorkbenchIdentity(
                    namespace="nba",
                    kind="player",
                    external_id="1629029",
                    display_name="Luka Dončić",
                    metadata_json={"aliases": ["Luka Dončić", "Luka Magic"]},
                ),
                WorkbenchIdentity(
                    namespace="nba",
                    kind="player",
                    external_id="1631114",
                    display_name="Jalen Williams",
                    metadata_json={"aliases": ["Jalen Williams", "J-Dub"]},
                ),
                WorkbenchIdentity(
                    namespace="nba",
                    kind="player",
                    external_id="1631119",
                    display_name="Jaylin Williams",
                    metadata_json={"aliases": ["Jaylin Williams", "Jay-Will"]},
                ),
                WorkbenchIdentity(
                    namespace="nba",
                    kind="player",
                    external_id="1628969",
                    display_name="Mikal Bridges",
                    metadata_json={"aliases": ["Mikal Bridges"]},
                ),
                WorkbenchIdentity(
                    namespace="nba",
                    kind="player",
                    external_id="1628970",
                    display_name="Miles Bridges",
                    metadata_json={"aliases": ["Miles Bridges"]},
                ),
                WorkbenchIdentity(
                    namespace="nba",
                    kind="player",
                    external_id="9999999",
                    display_name="Rookie Phenom",
                    metadata_json={"aliases": ["Rookie Phenom"]},
                ),
            ]
        )
        session.commit()
        yield session


def test_normalization_and_diacritics_folding():
    """Verify NFKD Unicode normalization and diacritic removal across international names."""
    cases = [
        ("Nikola Jokić", "nikola jokic"),
        ("Luka Dončić", "doncic"),
        ("Jonas Valančiūnas", "valanciunas"),
        ("Kristaps Porziņģis", "porzingis"),
        ("Jusuf Nurkić", "nurkic"),
        ("Dario Šarić", "saric"),
        ("Dennis Schröder", "schroder"),
        ("Alperen Şengün", "sengun"),
        ("Bogdan Bogdanović", "bogdanovic"),
        ("Božidar Maljković", "bozidar maljkovic"),
    ]
    for raw, expected_token in cases:
        norm = normalize_lookup_text(raw)
        assert expected_token in norm, (
            f"Expected {expected_token} in normalized {norm} (raw: {raw})"
        )


def test_normalization_punctuation_hyphen_apostrophe_suffixes():
    """Verify punctuation, hyphens, apostrophes, and suffixes are normalized into search aliases."""
    aliases_fox = generate_player_aliases("De'Aaron Fox")
    assert "de aaron fox" in aliases_fox
    assert "deaaron fox" in aliases_fox
    assert "fox" in aliases_fox

    aliases_towns = generate_player_aliases("Karl-Anthony Towns")
    assert "karl anthony towns" in aliases_towns
    assert "towns" in aliases_towns

    aliases_trent = generate_player_aliases("Gary Trent Jr.")
    assert "gary trent jr" in aliases_trent
    assert "gary trent" in aliases_trent  # Suffix stripped
    assert "trent" in aliases_trent

    aliases_murphy = generate_player_aliases("Trey Murphy III")
    assert "trey murphy iii" in aliases_murphy
    assert "trey murphy" in aliases_murphy  # Suffix stripped
    assert "murphy" in aliases_murphy

    aliases_cj = generate_player_aliases("C.J. McCollum")
    assert "cj mccollum" in aliases_cj
    assert "mccollum" in aliases_cj


def test_damerau_levenshtein_distance_and_early_exit():
    """Verify bounded edit distance computation and early exit on length differences."""
    assert damerau_levenshtein_distance("jokic", "jokic", max_dist=2) == 0
    assert damerau_levenshtein_distance("jokik", "jokic", max_dist=2) == 1
    assert damerau_levenshtein_distance("jok", "jokic", max_dist=2) == 2
    # len diff > 2 -> early exit
    assert damerau_levenshtein_distance("jo", "jokic", max_dist=2) == 3
    assert damerau_levenshtein_distance("celtiks", "celtics", max_dist=1) == 1
    assert damerau_levenshtein_distance("rapters", "raptors", max_dist=1) == 1


def test_exact_alias_and_diacritic_discovery(test_db_session: Session):
    """Verify both 'Jokić' and 'jokic', 'Dončić' and 'doncic' resolve with exact score."""
    res_jokic_ascii = lookup_entities(test_db_session, query="jokic")
    assert len(res_jokic_ascii.items) >= 1
    top_jokic = res_jokic_ascii.items[0]
    assert top_jokic.display_name == "Nikola Jokić"
    assert top_jokic.match_basis == "exact"
    assert top_jokic.match_score >= 0.90

    res_jokic_unicode = lookup_entities(test_db_session, query="Jokić")
    assert len(res_jokic_unicode.items) >= 1
    assert res_jokic_unicode.items[0].display_name == "Nikola Jokić"
    assert res_jokic_unicode.items[0].match_basis == "exact"

    res_doncic_ascii = lookup_entities(test_db_session, query="doncic")
    assert len(res_doncic_ascii.items) >= 1
    assert res_doncic_ascii.items[0].display_name == "Luka Dončić"
    assert res_doncic_ascii.items[0].match_basis == "exact"

    res_doncic_unicode = lookup_entities(test_db_session, query="Dončić")
    assert len(res_doncic_unicode.items) >= 1
    assert res_doncic_unicode.items[0].display_name == "Luka Dončić"


def test_team_tricode_city_nickname_discovery(test_db_session: Session):
    """Verify team discovery via tricode, city, nickname, and common aliases."""
    # 1. Toronto Raptors via tricode, city, nickname
    res_tor = lookup_entities(test_db_session, query="TOR")
    assert any(i.kind == "team" and i.display_name == "Toronto Raptors" for i in res_tor.items)
    assert res_tor.items[0].display_name == "Toronto Raptors"
    assert res_tor.items[0].match_basis == "exact"

    res_toronto = lookup_entities(test_db_session, query="Toronto")
    assert res_toronto.items[0].display_name == "Toronto Raptors"

    res_raptors = lookup_entities(test_db_session, query="Raptors")
    assert res_raptors.items[0].display_name == "Toronto Raptors"

    # 2. Golden State Warriors via dubs, GSW
    res_gsw = lookup_entities(test_db_session, query="GSW")
    assert res_gsw.items[0].display_name == "Golden State Warriors"

    res_dubs = lookup_entities(test_db_session, query="dubs")
    assert any(i.display_name == "Golden State Warriors" for i in res_dubs.items)

    # 3. Philadelphia 76ers via Sixers, PHI
    res_sixers = lookup_entities(test_db_session, query="sixers")
    assert res_sixers.items[0].display_name == "Philadelphia 76ers"

    res_phi = lookup_entities(test_db_session, query="PHI")
    assert res_phi.items[0].display_name == "Philadelphia 76ers"


def test_ambiguous_identities_returned_deterministically(test_db_session: Session):
    """Verify ambiguous names return all matching candidates in stable order."""
    # Jalen Williams vs Jaylin Williams
    res = lookup_entities(test_db_session, query="Williams", kinds=["player"], limit=10)
    names = [i.display_name for i in res.items]
    assert "Jalen Williams" in names
    assert "Jaylin Williams" in names

    # Verify both have distinct canonical IDs
    jw1 = next(i for i in res.items if i.display_name == "Jalen Williams")
    jw2 = next(i for i in res.items if i.display_name == "Jaylin Williams")
    assert jw1.id != jw2.id

    # Mikal Bridges vs Miles Bridges
    res_bridges = lookup_entities(test_db_session, query="Bridges", kinds=["player"])
    b_names = [i.display_name for i in res_bridges.items]
    assert "Mikal Bridges" in b_names
    assert "Miles Bridges" in b_names


def test_rookie_zero_game_and_empty_season_discovery(test_db_session: Session):
    """Verify players without appearances in requested season are still discovered."""
    # Ensure rookie exists in session
    existing_rookie = test_db_session.execute(
        WorkbenchIdentity.__table__.select().where(
            WorkbenchIdentity.display_name == "Rookie Phenom"
        )
    ).first()
    if existing_rookie is None:
        test_db_session.add(
            WorkbenchIdentity(
                namespace="nba",
                kind="player",
                external_id="test_rookie_phenom",
                display_name="Rookie Phenom",
                metadata_json={"aliases": ["Rookie Phenom"]},
            )
        )
        test_db_session.commit()
        clear_lookup_caches()

    # 1. Player with 0 appearances overall (Rookie)
    res_rookie = lookup_entities(test_db_session, query="Rookie Phenom")
    assert len(res_rookie.items) >= 1
    rookie = res_rookie.items[0]
    assert rookie.display_name == "Rookie Phenom"
    assert rookie.availability.has_current_season is False
    assert rookie.availability.status == "no_current_games"
    assert "No observed appearances" in (rookie.subtitle or "")

    # 2. Empty-season context (e.g. 2026-27 schedule-only season)
    res_empty_season = lookup_entities(test_db_session, query="Jokic", season="2026-27")
    assert len(res_empty_season.items) >= 1
    jokic_empty = res_empty_season.items[0]
    assert jokic_empty.display_name == "Nikola Jokić"
    assert jokic_empty.availability.has_current_season is False
    assert jokic_empty.availability.status == "no_current_games"
    assert "No observed appearances in selected scope" in (jokic_empty.subtitle or "")


def test_empty_query_returns_navigation_suggestions(test_db_session: Session):
    """Verify empty input returns bounded navigation suggestions, not full identity scans."""
    res_empty = lookup_entities(test_db_session, query="")
    assert len(res_empty.items) == 10  # default limit
    assert res_empty.total_matches == 10
    for item in res_empty.items:
        assert item.match_basis == "suggestion"
        assert item.match_score == 0.0

    # Ensure key core pages are present in suggestions
    destinations = [i.destination_url for i in res_empty.items]
    assert "/stats" in destinations
    assert "/live" in destinations
    assert "/compare" in destinations


def test_one_character_prefix_only_no_typo_explosion(test_db_session: Session):
    """Verify 1-character queries strictly return prefix matches."""
    res_j = lookup_entities(test_db_session, query="j", limit=20)
    for item in res_j.items:
        assert item.match_basis in {"exact", "prefix", "token_prefix"}
        # Must start with j in name or an alias/token
        norm = normalize_lookup_text(item.display_name)
        tokens = tokenize_lookup_text(item.display_name)
        starts_j = norm.startswith("j") or any(t.startswith("j") for t in tokens)
        assert starts_j or (item.matched_alias and item.matched_alias.startswith("j"))


def test_typo_matching_bounded(test_db_session: Session):
    """Verify typo tolerance works for queries >= 4 characters within edit distance budget."""
    # "jokik" -> Nikola Jokić (distance 1)
    res_typo = lookup_entities(test_db_session, query="jokik")
    assert len(res_typo.items) >= 1
    assert res_typo.items[0].display_name == "Nikola Jokić"
    assert res_typo.items[0].match_basis == "typo"

    # "celtiks" -> Boston Celtics (distance 1)
    res_celtics = lookup_entities(test_db_session, query="celtiks")
    assert any(i.display_name == "Boston Celtics" for i in res_celtics.items)

    # "rapters" -> Toronto Raptors (distance 1)
    res_raptors = lookup_entities(test_db_session, query="rapters")
    assert any(i.display_name == "Toronto Raptors" for i in res_raptors.items)


def test_kind_filtering(test_db_session: Session):
    """Verify kinds parameter filters results strictly to requested entity kinds."""
    res_players = lookup_entities(test_db_session, query="stats", kinds=["player"])
    assert all(i.kind == "player" for i in res_players.items)

    res_teams = lookup_entities(test_db_session, query="raptors", kinds=["team"])
    assert all(i.kind == "team" for i in res_teams.items)

    res_pages = lookup_entities(test_db_session, query="stats", kinds=["page"])
    assert all(i.kind == "page" for i in res_pages.items)
    assert any(i.canonical_id == "stats" for i in res_pages.items)


def test_merged_pages_resolve_to_their_fo07_tabs(test_db_session: Session):
    """Old page names still find the merged pages, which point at their tab URLs (FO07)."""
    expected = {
        "patch notes": "whats-new",
        "six factor": "research/rapm",
        "shot aftermath": "research/shooting",
        "shot profile twin": "similar-players/shot-profile",
        "statistical peers": "similar-players",
        "learning": "learning",
    }
    for query, canonical_id in expected.items():
        res = lookup_entities(test_db_session, query=query, kinds=["page"])
        assert res.items, query
        assert res.items[0].canonical_id == canonical_id, query

    removed = (
        "/six-factor-rapm",
        "/research/similarity",
        "/shot-profile-twin",
        "/research/expected-shots",
        "/research/adjusted-shooting",
        "/shot-aftermath",
        "/patch-notes",
        "/blog",
        "/learning",
    )
    destinations = {page["base_destination"] for page in STATIC_NAVIGATION_PAGES}
    assert not destinations.intersection(removed)
    ids = [page["id"] for page in STATIC_NAVIGATION_PAGES]
    assert len(ids) == len(set(ids))


def test_context_preservation_in_destination_urls(test_db_session: Session):
    """Verify season and release_id context are preserved in canonical destination URLs."""
    res = lookup_entities(
        test_db_session,
        query="Jokic",
        release_id="rel-2026-v1",
        season="2023-24",
    )
    assert len(res.items) >= 1
    dest = res.items[0].destination_url
    assert "season=2023-24" in dest
    assert "release_id=rel-2026-v1" in dest


def test_query_limits_and_clamping(test_db_session: Session):
    """Verify limit parameter is clamped between 1 and 20."""
    res_5 = lookup_entities(test_db_session, query="", limit=5)
    assert len(res_5.items) == 5

    res_over = lookup_entities(test_db_session, query="", limit=50)
    assert len(res_over.items) == 20  # Max clamp 20

    res_under = lookup_entities(test_db_session, query="", limit=0)
    assert len(res_under.items) == 1  # Min clamp 1


def test_lookup_performance_cardinality_and_payload_budget(test_db_session: Session):
    """Measure index cardinality, cold build time, warm latency, and payload size."""
    # 1. Measure index build time and cardinality
    clear_lookup_caches()
    t_start = time.perf_counter()
    index = get_or_build_entity_index(test_db_session)
    cold_build_ms = (time.perf_counter() - t_start) * 1000

    player_count = sum(1 for e in index if e.kind == "player")
    team_count = sum(1 for e in index if e.kind == "team")
    page_count = sum(1 for e in index if e.kind == "page")
    total_cardinality = len(index)

    assert total_cardinality >= 30, "Index must contain at least NBA teams and pages"
    assert team_count == 30, "Index must contain exactly 30 NBA teams"
    assert page_count >= 20, "Index must contain at least 20 navigation pages"

    # 2. Warm latency across multiple varied queries
    queries = [
        "jokic",
        "doncic",
        "curry",
        "williams",
        "TOR",
        "celtics",
        "stats",
        "compare",
        "de aaron fox",
        "karl anthony towns",
    ]
    warm_latencies: list[float] = []

    # Prime cache
    for q in queries:
        lookup_entities(test_db_session, query=q, limit=10)

    for _ in range(5):
        for q in queries:
            t0 = time.perf_counter()
            res = lookup_entities(test_db_session, query=q, limit=10)
            latency_ms = (time.perf_counter() - t0) * 1000
            warm_latencies.append(latency_ms)
            assert res.latency_ms is not None

    warm_latencies.sort()
    p50 = warm_latencies[len(warm_latencies) // 2]
    p95 = warm_latencies[int(len(warm_latencies) * 0.95)]

    # Warm lookup target: p95 <= 50 ms
    assert p95 <= 50.0, f"p95 warm latency {p95:.2f}ms exceeded 50ms budget"

    # 3. Payload size check (budget: roughly <= 25 KiB uncompressed JSON)
    res_max = lookup_entities(test_db_session, query="a", limit=20)
    payload_json = res_max.model_dump_json()
    payload_bytes = len(payload_json.encode("utf-8"))
    payload_kib = payload_bytes / 1024.0

    assert payload_kib <= 25.0, f"Payload size {payload_kib:.2f} KiB exceeded 25 KiB budget"

    # 4. Concurrency check (1, 2, 4 concurrent clients)
    for workers in [1, 2, 4]:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [
                executor.submit(lookup_entities, test_db_session, q, limit=10) for q in queries * 4
            ]
            results = [f.result() for f in futures]
            assert len(results) == len(queries) * 4
            for r in results:
                assert r.catalog_version == LOOKUP_CATALOG_VERSION

    # Print diagnostic measurements
    print(
        f"\n[B04 Performance Harness]\n"
        f"  Total Cardinality: {total_cardinality} "
        f"({player_count} players, {team_count} teams, {page_count} pages)\n"
        f"  Cold Build Time: {cold_build_ms:.2f} ms\n"
        f"  Warm Latency: p50={p50:.3f} ms, p95={p95:.3f} ms (budget <= 50 ms)\n"
        f"  Max Payload Size: {payload_bytes} bytes ({payload_kib:.2f} KiB, budget <= 25 KiB)\n"
    )


def test_retained_canonical_selections_resolve_without_name_input(test_db_session: Session):
    player = lookup_entities(test_db_session, query="203999", kinds=["player"], limit=1)
    assert player.items[0].canonical_id == "203999"
    assert player.items[0].display_name == "Nikola Jokić"
    team = lookup_entities(test_db_session, query="1610612761", kinds=["team"], limit=1)
    assert team.items[0].display_name == "Toronto Raptors"


def test_empty_query_never_suggests_players(test_db_session: Session):
    """Players have no meaningful order before typing; only pages and teams are suggested."""
    assert all(i.kind != "player" for i in lookup_entities(test_db_session, query="").items)
    players_only = lookup_entities(test_db_session, query="", kinds=["player"])
    assert players_only.items == [] and players_only.total_matches == 0
    assert lookup_entities(test_db_session, query="jok", kinds=["player"]).items


def test_only_basketball_reference_nicknames_are_shown_as_aka(test_db_session: Session):
    """Generated aliases match silently; a newest-profile nickname matches and is captioned."""
    from datetime import UTC, datetime

    from courtlens.reference_models import BbrefPlayerProfile
    from courtlens.workbench_models import WorkbenchAcquisition

    receipt = WorkbenchAcquisition(
        source_name="basketball_reference",
        resource="bbref_player_pages",
        source_url="https://www.basketball-reference.com/players/j/jokicni01.html",
        status="success",
    )
    test_db_session.add(receipt)
    test_db_session.flush()
    for when, version, profile in (
        (datetime(2026, 1, 1, tzinfo=UTC), "bbref-player-v2", {"honours": []}),
        (datetime(2026, 1, 1, tzinfo=UTC), "bbref-player-v3", {"nicknames": ["The Joker"]}),
    ):
        test_db_session.add(
            BbrefPlayerProfile(
                player_id="203999",
                bbref_id="jokicni01",
                match_basis="name+birth_date",
                acquisition_id=receipt.id,
                content_sha256="0" * 64,
                parser_version=version,
                observed_at=when,
                profile=profile,
            )
        )
    test_db_session.commit()

    joker = lookup_entities(test_db_session, query="joker", kinds=["player"]).items[0]
    assert (joker.display_name, joker.matched_alias) == ("Nikola Jokić", "The Joker")
    # A leading "The" is optional: "joker" is the whole nickname, not one of its later words.
    assert joker.match_basis == "exact"
    # Accent-folded names, first names and stored identity aliases are not nicknames.
    assert lookup_entities(test_db_session, query="jokic").items[0].matched_alias is None
    assert lookup_entities(test_db_session, query="jalen").items[0].matched_alias is None
    luka = lookup_entities(test_db_session, query="luka magic", kinds=["player"]).items[0]
    assert (luka.display_name, luka.matched_alias) == ("Luka Dončić", None)


def test_equally_good_matches_rank_current_then_most_games(monkeypatch: pytest.MonkeyPatch):
    """A current star's nickname or first name beats rarely seen exact first names."""
    from courtlens.domain.entity_lookup import IndexedEntity
    from courtlens.services import entity_lookup as service

    def player(
        pid: str,
        name: str,
        seasons: tuple[str, ...],
        games: int,
        nicknames: dict[str, str] | None = None,
    ) -> IndexedEntity:
        nicknames = nicknames or {}
        return IndexedEntity(
            id=pid,
            kind="player",
            canonical_id=pid,
            display_name=name,
            display_name_norm=normalize_lookup_text(name),
            aliases_norm=tuple(generate_player_aliases(name, list(nicknames.values()))),
            tokens=tuple(tokenize_lookup_text(name)),
            subtitle=None,
            portrait_url=None,
            portrait_fallback=None,
            base_destination=f"/players/{pid}",
            seasons=seasons,
            games=games,
            nicknames=nicknames,
        )

    index = [
        player("1", "Vic Law", (), 0),
        player("2", "Victor Alexander", ("1996-97",), 120),
        player("3", "Victor Oladipo", ("2012-13", "2022-23"), 600),
        player("4", "Aleksandar Radojevic", ("1999-00",), 3),
        player(
            "5",
            "Victor Wembanyama",
            ("2023-24", "2025-26"),
            181,
            nicknames={"wemby": "Wemby", "vic": "Vic", "alien": "Alien"},
        ),
        player(
            "6", "Darko Milicic", ("2003-04",), 468, nicknames={"human victory": "Human Victory"}
        ),
    ]
    monkeypatch.setattr(service, "get_or_build_entity_index", lambda *a, **k: index)
    items = service.lookup_entities(None, query="vic", kinds=["player"]).items  # type: ignore[arg-type]
    assert [i.display_name for i in items] == [
        "Victor Wembanyama",
        "Victor Oladipo",
        "Victor Alexander",
        "Vic Law",
        "Darko Milicic",
        "Aleksandar Radojevic",
    ]
    assert [i.matched_alias for i in items] == ["Vic", None, None, None, "Human Victory", None]
    wemby = next(i for i in items if i.display_name == "Victor Wembanyama")
    # Every nickname is listed, the matched one first; players without any list none.
    assert wemby.nicknames == ["Vic", "Wemby", "Alien"]
    assert next(i for i in items if i.display_name == "Vic Law").nicknames == []
    wemby = service.lookup_entities(None, query="wembanyama", kinds=["player"]).items[0]  # type: ignore[arg-type]
    assert (wemby.matched_alias, wemby.nicknames) == (None, ["Wemby", "Vic", "Alien"])
    # An exact full name still outranks prominence.
    law = service.lookup_entities(None, query="vic law", kinds=["player"]).items  # type: ignore[arg-type]
    assert law[0].display_name == "Vic Law"
