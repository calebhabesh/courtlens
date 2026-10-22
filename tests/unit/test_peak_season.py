from courtlens.services.history_totals import peak_of


def test_peak_is_best_bpm_among_full_seasons() -> None:
    seasons = {
        "1987-88": (82, 3311.0, {"bpm": 13.0, "ws_per_48": 0.308}),
        "1990-91": (82, 3034.0, {"bpm": 12.0, "ws_per_48": 0.321}),
        # A short season never qualifies, however good.
        "1994-95": (17, 668.0, {"bpm": 15.0, "ws_per_48": 0.4}),
    }
    assert peak_of(seasons) == ("1987-88", "bpm")


def test_mixed_eras_rank_by_one_measure() -> None:
    # 1971-72 predates BPM, so the whole career is ranked by WS/48.
    seasons = {
        "1971-72": (81, 3583.0, {"ws_per_48": 0.340}),
        "1976-77": (82, 3016.0, {"bpm": 9.0, "ws_per_48": 0.281}),
    }
    assert peak_of(seasons) == ("1971-72", "ws_per_48")


def test_before_minutes_games_qualify_and_ties_go_earlier() -> None:
    seasons = {
        "1948-49": (60, None, {"ws": 10.0}),
        "1949-50": (60, None, {"ws": 10.0}),
        "1950-51": (20, None, {"ws": 12.0}),
    }
    assert peak_of(seasons) == ("1948-49", "ws")


def test_no_qualifying_season_has_no_peak() -> None:
    assert peak_of({"2025-26": (10, 200.0, {"bpm": 5.0})}) is None
