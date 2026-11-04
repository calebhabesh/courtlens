"""R01 history backfill: rule R01-H5 name aliases, per-season schedules and registrations.

Rows follow the shapes of real archived games (named per case); no owner data or network.
"""

from __future__ import annotations

import csv
import gzip
import json
from pathlib import Path

import pytest

from courtlens.domain.impact_history_aliases import RULE_ID, resolve_aliases
from courtlens.domain.possession_repair import normalize_events
from courtlens.domain.research_registry import (
    REGISTRY,
    ResearchRegistration,
    load_registration,
)
from courtlens.ingestion import impact_history

NYK, ORL = "1610612752", "1610612753"


def box(pid: str, team: str, first: str, family: str, name_i: str) -> dict[str, str]:
    return {
        "person_id": pid,
        "team_id": team,
        "first_name": first,
        "family_name": family,
        "name_i": name_i,
    }


def row(
    index: int, pid: str, team: str, kind: str, description: str, name: str = ""
) -> dict[str, str]:
    return {
        "_row_index": str(index),
        "actionNumber": str(index + 1),
        "actionId": str(index + 1),
        "period": "1",
        "clock": f"PT{11 - index // 10:02d}M00.00S",
        "teamId": team,
        "personId": pid,
        "playerName": name,
        "playerNameI": "",
        "actionType": kind,
        "subType": "",
        "description": description,
        "shotResult": "",
    }


# 0021700073: the NBA renamed Enes Kanter to Freedom in boxes and name fields, but the
# descriptions keep "Kanter".
KNICKS = [
    box("202683", NYK, "Enes", "Freedom", "E. Freedom"),
    box("203124", NYK, "Kyle", "O'Quinn", "K. O'Quinn"),
    box("201584", NYK, "Courtney", "Lee", "C. Lee"),
    box("202696", ORL, "Nikola", "Vucevic", "N. Vucevic"),
]


def test_era_name_resolves_from_the_games_own_rows() -> None:
    rows = [
        row(0, "202683", NYK, "Rebound", "Kanter REBOUND (Off:0 Def:1)", "Freedom"),
        row(1, "202683", NYK, "Substitution", "SUB: O'Quinn FOR Kanter", "Freedom"),
        row(2, "203124", NYK, "Substitution", "SUB: Kanter FOR O'Quinn", "O'Quinn"),
    ]
    output, overrides = resolve_aliases(rows, KNICKS)
    assert [r["description"] for r in output] == [
        "Kanter REBOUND (Off:0 Def:1)",
        "SUB: O'Quinn FOR E. Freedom",
        "SUB: E. Freedom FOR O'Quinn",
    ]
    assert [(o["side"], o["player_id"], o["original_text"]) for o in overrides] == [
        ("outgoing", "202683", "Kanter"),
        ("incoming", "202683", "Kanter"),
    ]
    assert {o["rule_id"] for o in overrides} == {RULE_ID}
    assert overrides[1]["evidence_row_indexes"] == [0, 1]  # his action and his own sub-out
    # The pinned parser rejected the original rows; it accepts the resolved ones.
    with pytest.raises(ValueError, match="substitution"):
        normalize_events(rows, source="v3", source_sha256="0" * 64, boxes=KNICKS)
    events = normalize_events(output, source="v3", source_sha256="0" * 64, boxes=KNICKS)
    assert events[2].incoming == ("202683",) and events[2].outgoing == ("203124",)


def test_resolvable_rows_are_left_untouched() -> None:
    rows = [row(0, "203124", NYK, "Substitution", "SUB: Lee FOR O'Quinn", "O'Quinn")]
    output, overrides = resolve_aliases(rows, KNICKS)
    assert output == rows and overrides == []
    assert output[0] is rows[0]


def test_first_name_collision_uses_attested_action_rows() -> None:
    # 2014-15 Cavaliers: "James" is LeBron James's family name and James Jones's first name.
    cavs = "1610612739"
    boxes = [
        box("2544", cavs, "LeBron", "James", "L. James"),
        box("2592", cavs, "James", "Jones", "J. Jones"),
        box("202684", cavs, "Tristan", "Thompson", "T. Thompson"),
    ]
    rows = [
        row(0, "2544", cavs, "Made Shot", "James 26' 3PT Jump Shot (3 PTS)", "James"),
        row(1, "2592", cavs, "Missed Shot", "MISS Jones 24' 3PT Jump Shot", "Jones"),
        row(2, "202684", cavs, "Substitution", "SUB: James FOR Thompson", "Thompson"),
    ]
    output, overrides = resolve_aliases(rows, boxes)
    assert output[2]["description"] == "SUB: L. James FOR Thompson"
    assert overrides[0]["player_id"] == "2544"


def test_generational_suffix_fallback_only_without_game_evidence() -> None:
    # 0021400745: "Bullock" enters for Dragic; the box now says "Bullock Jr.".
    mia = "1610612748"
    boxes = [
        box("203493", mia, "Reggie", "Bullock Jr.", "R. Bullock Jr."),
        box("201609", mia, "Goran", "Dragic", "G. Dragic"),
    ]
    rows = [row(0, "201609", mia, "Substitution", "SUB: Bullock FOR G. Dragic", "Dragic")]
    output, overrides = resolve_aliases(rows, boxes)
    assert output[0]["description"] == "SUB: R. Bullock Jr. FOR G. Dragic"
    assert overrides[0]["evidence_row_indexes"] == []


def test_names_no_box_name_can_identify_stay_unresolved() -> None:
    # 0021900040: Cody Martin shares "C. Martin"/"Martin" with Caleb Martin and "Cody" with
    # Cody Zeller, so no text the pinned parser accepts names him; the game stays excluded.
    cha = "1610612766"
    boxes = [
        box("1628998", cha, "Cody", "Martin", "C. Martin"),
        box("1628997", cha, "Caleb", "Martin", "C. Martin"),
        box("203469", cha, "Cody", "Zeller", "C. Zeller"),
        box("1628407", cha, "Dwayne", "Bacon", "D. Bacon"),
    ]
    rows = [
        row(0, "1628998", cha, "Made Shot", "Co. Martin 2' Driving Layup (2 PTS)", "Martin"),
        row(1, "1628407", cha, "Substitution", "SUB: Co. Martin FOR Bacon", "Bacon"),
    ]
    output, overrides = resolve_aliases(rows, boxes)
    assert output == rows and overrides == []


def test_outgoing_text_attested_for_a_teammate_is_not_rewritten() -> None:
    # 0021401069: two Robinsons on the 76ers; "FOR Robinson" cannot be checked against the id.
    phi = "1610612755"
    boxes = [
        box("203922", phi, "Glenn", "Robinson III", "G. Robinson III"),
        box("203080", phi, "Thomas", "Robinson", "T. Robinson"),
        box("203924", phi, "Jerami", "Grant", "J. Grant"),
    ]
    rows = [
        row(0, "203080", phi, "Rebound", "Robinson REBOUND (Off:1 Def:0)", "Robinson"),
        row(1, "203922", phi, "Substitution", "SUB: Grant FOR Robinson", "Robinson III"),
    ]
    output, overrides = resolve_aliases(rows, boxes)
    assert output == rows and overrides == []


def write_schedule(path: Path, year: int, games: int, *, teams: int = 30) -> None:
    columns = [
        "game_id",
        "season",
        "season_type",
        "game_date",
        "home_team_id",
        "away_team_id",
        "home_pts",
        "away_pts",
        "home_wl",
        "away_wl",
    ]
    with gzip.open(path, "wt", newline="") as stream:
        writer = csv.DictWriter(stream, columns)
        writer.writeheader()
        for i in range(games):
            home, away = 1610612737 + i % teams, 1610612737 + (i + 1) % teams
            writer.writerow(
                {
                    "game_id": f"002{str(year)[-2:]}{i + 1:05d}",
                    "season": str(year + 1),
                    "season_type": "regular-season",
                    # The bubble's seeding games ran in August, after the 1 July IM01 cap.
                    "game_date": f"{year + 1}-08-0{1 + i % 9}",
                    "home_team_id": str(home),
                    "away_team_id": str(away),
                    "home_pts": "101",
                    "away_pts": "99",
                    "home_wl": "W",
                    "away_wl": "L",
                }
            )


def test_schedule_denominator_per_season(tmp_path: Path) -> None:
    bubble = tmp_path / "2020.csv.gz"
    write_schedule(bubble, 2019, 1059)
    membership = impact_history.schedule_membership(bubble, 2019)
    assert len(membership["games"]) == 1059
    short = tmp_path / "short.csv.gz"
    write_schedule(short, 2016, 1059)
    with pytest.raises(ValueError, match="denominator 1059 != 1230"):
        impact_history.schedule_membership(short, 2016)


def test_archive_families_follow_the_pinned_index() -> None:
    names = set(impact_history.archive_names())
    assert "nbastatsv3_2014" in names and "pbpstats_2014" in names
    assert "cdnnba_2019" not in names and "cdnnba_2020" in names
    assert "matchups_2016" not in names and "matchups_2017" in names
    with pytest.raises(ValueError, match="unsupported"):
        impact_history.source_url("datasets/nbastatsv3_2025.tar.xz")


def test_every_registration_loads_by_identity() -> None:
    paths = sorted(REGISTRY.glob("*.json"))
    assert {p.stem for p in paths} >= {
        "courtlens-impact-history-v1",
        "courtlens-impact-history-v2",
        "courtlens-rapm-time-decay-v1",
        "courtlens-impact-intervals-v1",
        "courtlens-six-factor-reconstruction-v1",
        "courtlens-rating-snapshots-v1",
    }
    for path in paths:
        assert load_registration(path.stem).identity == path.stem


def test_registrations_must_publish_negative_results() -> None:
    body = json.loads((REGISTRY / "courtlens-rapm-time-decay-v1.json").read_text())
    body["negative_result_policy"] = "Keep quiet."
    with pytest.raises(ValueError, match="negative results"):
        ResearchRegistration.model_validate(body)
