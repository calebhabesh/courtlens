import json
from pathlib import Path
from typing import Any

import pytest
from fastapi import HTTPException

from courtlens.domain.player_twins import (
    BASE_POSSESSIONS,
    DIMENSIONS,
    MIN_ATTEMPTS,
    compare,
    league_average,
    min_overlap,
    nearest,
    next_season,
    percentile,
    projection,
    same_position,
    season_table,
)
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.services import player_twins, shot_zones
from courtlens.services.shot_zones import season_players, team_rows, validate_url


def _row(pid: str, scale: float = 1.0, **overrides: float) -> dict[str, Any]:
    """Counts grow with `scale`; makes grow faster, so percentages vary too."""
    row: dict[str, Any] = {
        "player_id": pid,
        "name": f"Player {pid}",
        "teams": [{"team_id": "1610612747", "tricode": "LAL", "off_poss": 2000}],
        "games": 60,
        "off_poss": 2000.0,
        "def_poss": 2000.0,
        "points": 1000 * scale,
        "rim_fga": 200 * scale,
        "rim_fgm": 130 * scale**1.2,
        "short_mid_fga": 80 * scale,
        "short_mid_fgm": 32 * scale**1.2,
        "long_mid_fga": 70 * scale,
        "long_mid_fgm": 28 * scale**1.2,
        "fg3a": 150 * scale,
        "fg3m": 54 * scale**1.2,
        "fta": 120 * scale,
        "ftm": 90 * scale**1.2,
        "assists": 200 * scale,
        "turnovers": 80 * scale,
        "oreb": 40 * scale,
        "dreb": 150 * scale,
        "steals": 40 * scale,
        "blocks": 20 * scale,
    }
    return row | overrides


def test_volume_is_per_100_offensive_possessions_and_mid_sums_both_ranges() -> None:
    table = season_table("shot", "2005-06", [_row("1"), _row("2", 1.5)])
    one = table.profiles["1"]
    assert one.values["rim_vol"] == pytest.approx(10.0)
    assert one.values["mid_vol"] == pytest.approx(7.5)
    assert one.values["mid_eff"] == pytest.approx(60 / 150)
    assert one.values["ft_eff"] == pytest.approx(0.75)


def test_league_average_is_pooled_not_a_mean_of_rates() -> None:
    small = _row("1", off_poss=500.0)
    big = _row("2", 2.0)
    rim = DIMENSIONS["shot"][2]
    # (200 + 400) attempts over (500 + 2000) possessions, not the mean of 40 and 20.
    assert league_average(rim, [small, big]) == pytest.approx(600 / 2500 * 100)


def test_a_percentage_below_the_attempt_floor_is_unknown() -> None:
    table = season_table("shot", "2005-06", [_row("1", fg3a=MIN_ATTEMPTS - 1, fg3m=5)])
    assert table.profiles["1"].values["three_eff"] is None
    assert table.profiles["1"].values["three_vol"] is not None


def test_identical_profiles_match_100_and_overlap_floor_holds() -> None:
    rows = [_row("1"), _row("2"), _row("3", 1.4), _row("4", 0.7)]
    table = season_table("shot", "2005-06", rows)
    same = compare(table.profiles["1"], table.profiles["2"])
    assert same is not None and same.match == pytest.approx(100.0) and same.overlap == 8
    # Three unknown percentages leave five shared dimensions: below the six-of-eight floor.
    sparse = season_table(
        "shot", "2005-06", [*rows, _row("5", ftm=0, fta=5, fg3a=5, fg3m=0, rim_fga=5, rim_fgm=1)]
    )
    assert compare(sparse.profiles["1"], sparse.profiles["5"]) is None


def test_nearest_excludes_the_same_season_and_honours_the_floor_and_own_seasons() -> None:
    a = season_table("box", "2005-06", [_row("1"), _row("2", 1.1), _row("3", 2.0)])
    # The same season shape, so player 1's 2006-07 profile standardizes exactly like 2005-06's.
    b = season_table(
        "box",
        "2006-07",
        [_row("1"), _row("5", 1.1), _row("6", 2.0), _row("4", 0.5, off_poss=400.0)],
    )
    pool = [*a.profiles.values(), *b.profiles.values()]
    target = a.profiles["1"]
    found = nearest(target, pool, min_possessions=1000, exclude_own=False)
    keys = [(m.profile.player_id, m.profile.season) for m in found]
    assert ("1", "2005-06") not in keys and ("4", "2006-07") not in keys
    assert keys[0] == ("1", "2006-07")
    assert [m.distance for m in found] == sorted(m.distance for m in found)
    own = nearest(target, pool, min_possessions=0, exclude_own=True)
    assert all(m.profile.player_id != "1" for m in own)


def test_standardization_pool_ignores_small_samples() -> None:
    rows = [_row("1"), _row("2", 1.2), _row("3", 9.0, off_poss=BASE_POSSESSIONS - 1)]
    with_small = season_table("shot", "2005-06", rows)
    without = season_table("shot", "2005-06", rows[:2])
    assert with_small.profiles["1"].z["rim_vol"] == pytest.approx(
        without.profiles["1"].z["rim_vol"]
    )


def test_validate_url_admits_only_one_team_regular_season_player_totals() -> None:
    url = shot_zones.team_url("2005-06", "1610612747")
    assert validate_url("pbpstats", url, "2005-06") == shot_zones.INTERVAL_SECONDS
    for bad in (
        url.replace("Player", "Lineup"),
        url.replace("1610612747", "1"),
        url.replace("Regular%2BSeason", "Playoffs"),
        url + "&StartDate=2005-11-01",
    ):
        with pytest.raises(ValueError):
            validate_url("pbpstats", bad, "2005-06")
    with pytest.raises(ValueError):
        validate_url("pbpstats", url, "2006-07")


def _payload(team: str, *rows: dict[str, Any]) -> bytes:
    return json.dumps({"multi_row_table_data": [{"TeamId": team, **r} for r in rows]}).encode()


def test_traded_players_sum_and_one_team_season_is_never_counted_twice() -> None:
    lal = team_rows(
        _payload(
            "1610612747",
            {"EntityId": "7", "Name": "X", "TeamAbbreviation": "LAL", "OffPoss": 300, "FG3A": 10},
        ),
        "1610612747",
    )
    bos = team_rows(
        _payload(
            "1610612738",
            {"EntityId": "7", "Name": "X", "TeamAbbreviation": "BOS", "OffPoss": 900, "FG3A": 5},
        ),
        "1610612738",
    )
    (player,) = season_players(lal + bos)
    assert player["off_poss"] == 1200 and player["fg3a"] == 15
    assert [team["tricode"] for team in player["teams"]] == ["BOS", "LAL"]
    with pytest.raises(ValueError):
        season_players(lal + lal)
    with pytest.raises(ValueError):
        team_rows(_payload("1610612738", {"EntityId": "7"}), "1610612747")


def test_view_defaults_and_versus(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    bundle = {
        "version": shot_zones.VERSION,
        "source": shot_zones.ATTRIBUTION,
        "sealed_at": "2026-10-21T00:00:00+00:00",
        "seasons": {
            "2004-05": {
                "raw_sha256": [],
                "players": [_row("1", off_poss=3000.0), _row("9", 1.1), _row("8", 1.9)],
            },
            "2005-06": {
                "raw_sha256": [],
                "players": [_row("1", off_poss=3000.0), _row("2", 1.1), _row("3", 1.9)],
            },
        },
    }
    path, _ = write_artifact(tmp_path, bundle)
    settings = shot_zones.get_settings()
    monkeypatch.setattr(settings, "shot_zones_manifest", path)
    view = player_twins.player_twins_view()
    assert view["season"] == "2005-06" and view["seasons"] == ["2004-05", "2005-06"]
    assert view["player"]["player_id"] == "1" and view["focus_rule"]
    assert view["twin"]["rank"] == 1 and view["matches"][0]["player_id"] == "1"
    same = player_twins.player_twins_view(player_id="1", pool="same")
    assert {m["season"] for m in same["matches"]} == {"2005-06"}
    versus = player_twins.player_twins_view(player_id="1", versus="9:2004-05", min_possessions=0)
    assert versus["twin"]["player_id"] == "9" and versus["twin"]["season"] == "2004-05"


def test_same_position_is_exact_for_estimates_and_by_group_for_listings() -> None:
    table = season_table("shot", "2005-06", [_row("1"), _row("2", 1.1), _row("3", 1.3)])
    a, b, c = (table.profiles[pid] for pid in ("1", "2", "3"))
    a.position, a.position_basis = "SF", "estimated"
    b.position, b.position_basis = "SF", "estimated"
    c.position, c.position_basis = "F", "listed"
    assert same_position(a, b) and not same_position(a, c)
    assert same_position(c, a)
    b.position = "PF"
    assert not same_position(a, b) and same_position(c, b)
    found = nearest(a, [b, c], min_possessions=0, exclude_own=False, by_position=True)
    assert found == []


def test_weights_drop_or_double_a_measure_and_scale_the_overlap_floor() -> None:
    rows = [_row("1"), _row("2", 1.2), _row("3", 1.5), _row("4", 0.8, fg3a=400)]
    table = season_table("shot", "2005-06", rows)
    a, d = table.profiles["1"], table.profiles["4"]
    plain = compare(a, d)
    no_threes = compare(a, d, {"three_vol": 0, "three_eff": 0})
    assert plain is not None and no_threes is not None
    assert "three_vol" not in no_threes.gaps and no_threes.overlap == 6
    assert no_threes.distance < plain.distance
    doubled = compare(a, d, {"three_vol": 2})
    assert doubled is not None and doubled.distance > plain.distance
    assert min_overlap(DIMENSIONS["shot"]) == 6 and min_overlap(a.z, {"ft_vol": 0}) == 6
    assert min_overlap([d.key for d in DIMENSIONS["all"]]) == 12
    assert min_overlap(["a", "b", "c", "d"], {"a": 0, "b": 0, "c": 0}) == 1


def test_the_vector_ranking_matches_pairwise_compare() -> None:
    rows = [_row(str(i), 0.6 + i / 10, fg3a=100 + 13 * i) for i in range(1, 12)]
    table = season_table("all", "2005-06", rows)
    target = table.profiles["3"]
    weights = {"ft_eff": 0, "blk": 2, "pts": 0.5}
    ranked = nearest(
        target, table.profiles.values(), min_possessions=0, exclude_own=False, weights=weights
    )
    pairwise = sorted(
        (
            m
            for p in table.profiles.values()
            if p is not target
            if (m := compare(target, p, weights)) is not None
        ),
        key=lambda m: (m.distance, m.profile.player_id),
    )
    assert [m.profile.player_id for m in ranked] == [m.profile.player_id for m in pairwise]
    for left, right in zip(ranked, pairwise, strict=True):
        assert left.distance == pytest.approx(right.distance)
        assert left.gaps == pytest.approx(right.gaps)


def test_combined_mode_reads_all_sixteen_measures() -> None:
    table = season_table("all", "2005-06", [_row("1"), _row("2", 1.3)])
    assert len(table.profiles["1"].values) == 16
    assert table.profiles["1"].values["pts"] == pytest.approx(50.0)


def test_percentile_counts_ties_half_and_unknown_stays_unknown() -> None:
    assert percentile([1.0, 2.0, 3.0, 4.0], 4.0) == pytest.approx(87.5)
    assert percentile([1.0, 2.0, 2.0, 3.0], 2.0) == pytest.approx(50.0)
    assert percentile([1.0], None) is None and percentile([], 1.0) is None
    table = season_table("shot", "2005-06", [_row("1"), _row("2", 1.5), _row("3", 2.0)])
    assert table.profiles["3"].percentile["rim_vol"] == pytest.approx(5 / 6 * 100)


def test_next_season_and_projection_axes() -> None:
    assert next_season("1999-00") == "2000-01" and next_season("2012-13") == "2013-14"
    rows = [_row(str(i), 0.6 + i / 10, fg3a=100 + 37 * (i % 4)) for i in range(1, 9)]
    table = season_table("shot", "2005-06", rows)
    base = list(table.profiles.values())
    fitted = projection(base, [d.key for d in DIMENSIONS["shot"]])
    assert fitted is not None and len(fitted.explained) == 2
    assert 0 < fitted.explained[1] <= fitted.explained[0] <= 1
    xs = [fitted.at(p)[0] for p in base]
    assert sum(xs) == pytest.approx(0.0, abs=1e-9)
    # Fewer than two weighted measures can't make a plane.
    assert projection(base, ["rim_vol", "ft_vol"], {"ft_vol": 0}) is None


def test_view_weights_career_next_and_map(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    bundle = {
        "version": shot_zones.VERSION,
        "source": shot_zones.ATTRIBUTION,
        "sealed_at": "2026-10-21T01:00:00+00:00",
        "seasons": {
            "2004-05": {
                "raw_sha256": [],
                "players": [_row("1", off_poss=3000.0), _row("9", 1.1), _row("8", 1.9)],
            },
            "2005-06": {
                "raw_sha256": [],
                "players": [
                    _row("1", off_poss=3000.0, points=1400),
                    _row("2", 1.1),
                    _row("3", 1.9),
                ],
            },
        },
    }
    path, _ = write_artifact(tmp_path, bundle)
    monkeypatch.setattr(shot_zones.get_settings(), "shot_zones_manifest", path)
    view = player_twins.player_twins_view(player_id="1", season="2004-05", weights="ft_eff:0")
    assert view["weights"] == {"ft_eff": 0.0} and view["method"]["measures"] == 7
    assert view["player"]["next"]["status"] == "recorded"
    assert view["player"]["next"]["pts_change"] == pytest.approx(400 / 60)
    assert {m["next"]["status"] for m in view["matches"]} <= {
        "beyond_data",
        "no_record",
        "recorded",
    }
    assert [c["season"] for c in view["career"]] == ["2004-05", "2005-06"]
    assert all(c["twin"] is None or c["twin"]["player_id"] != "1" for c in view["career"])
    assert view["map"]["player"]["player_id"] == "1"
    assert all(p["player_id"] != "1" for p in view["map"]["points"])
    index = {p["player_id"]: p for p in player_twins.player_index()["players"]}
    assert index["1"] | {} == {
        "player_id": "1", "name": "Player 1", "first_season": "2004-05",
        "last_season": "2005-06", "last_team": "LAL", "seasons": 2,
    }  # fmt: skip
    assert index["9"]["last_season"] == "2004-05"
    later = player_twins.player_twins_view(player_id="1", season="2005-06")
    assert later["player"]["next"] == {"season": "2006-07", "status": "beyond_data"}
    for bad in ("nope:1", "ft_eff:3", "ft_eff:x"):
        with pytest.raises(HTTPException):
            player_twins.player_twins_view(weights=bad)
    everything_off = ",".join(f"{d.key}:0" for d in DIMENSIONS["shot"])
    with pytest.raises(HTTPException):
        player_twins.player_twins_view(weights=everything_off)
