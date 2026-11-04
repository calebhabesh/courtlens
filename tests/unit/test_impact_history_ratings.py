"""R01 ratings on synthetic stints: the compact form, time decay, bootstrap and snapshots."""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.evaluation import impact_history_fits as fits
from courtlens.evaluation import impact_history_ratings as h
from courtlens.evaluation.impact_ratings import Stint, fit_target


def cohort(year: int, games: int, seed: int) -> dict[str, Any]:
    rng = np.random.default_rng(seed)
    teams = {"A": [f"a{i}" for i in range(8)], "B": [f"b{i}" for i in range(8)]}
    stints = []
    start = date(year, 11, 1)
    for g in range(games):
        gid = f"002{str(year)[-2:]}{g:05d}"
        day = (start + timedelta(days=2 * g)).isoformat()
        home, away = ("A", "B") if g % 2 == 0 else ("B", "A")
        for _ in range(6):
            factors: list[dict[str, float]] = []
            for _side in (0, 1):
                fga = int(rng.integers(3, 12))
                factors.append(
                    {
                        "fga": fga,
                        "fta": int(rng.integers(0, 5)),
                        "turnovers": int(rng.integers(0, 3)),
                        "orb": int(rng.integers(0, 3)),
                        "orb_opportunities": int(rng.integers(3, 8)),
                    }
                )
            stints.append(
                Stint(
                    gid,
                    day,
                    fits.season_label(year),
                    home,
                    away,
                    tuple(rng.choice(teams[home], 5, replace=False).tolist()),
                    tuple(rng.choice(teams[away], 5, replace=False).tolist()),
                    float(rng.integers(60, 400)),
                    float(rng.integers(0, 25)),
                    float(rng.integers(0, 25)),
                    float(rng.integers(1, 12)),
                    float(rng.integers(1, 12)),
                    factors[0],
                    factors[1],
                )
            )
    return {
        "season": fits.season_label(year),
        "phase": fits.PHASE,
        "stints": stints,
        "games": {
            s.game: {"sha256": f"{s.game}-sha", "day": s.day, "quality": "patched"} for s in stints
        },
    }


def test_compact_form_reproduces_the_pinned_fit() -> None:
    data = cohort(2015, 30, 1)
    compact = h.compact_all({"2015-16:regular_season": data})
    for target in fits.TARGETS:
        pinned = fit_target(data["stints"], target, 100.0)
        mine = h.fit_compact(compact, target, 100.0)
        ids = [compact.players[i] for i in mine["vocab"]]
        assert ids == sorted(pinned["players"])
        for i, p in enumerate(ids):
            assert abs(mine["offense"][i] - pinned["players"][p]["offense"]) < 1e-6
            assert abs(mine["defense"][i] - pinned["players"][p]["defense"]) < 1e-6


def test_snapshot_ignores_games_on_or_after_its_cutoff() -> None:
    early = cohort(2015, 30, 2)
    later = cohort(2016, 30, 3)
    cutoff = "2016-07-01"
    alone = h.compact_all({"2015-16:regular_season": early})
    both = h.compact_all({"2015-16:regular_season": early, "2016-17:regular_season": later})
    first = h.decay_artifact(h.decay_fit(alone, cutoff), "snapshot")
    second = h.decay_artifact(h.decay_fit(both, cutoff), "snapshot")
    assert first == second
    json.dumps(first, allow_nan=False)  # artifacts are canonical JSON (no numpy scalars)
    assert first["latest_game_date"] < cutoff
    assert first["alpha"] in h.decay_parameters()["alpha_grid"]


def test_decay_weights_halve_every_half_life() -> None:
    data = h.compact_all({"2015-16:regular_season": cohort(2015, 30, 4)})
    cutoff = date.fromordinal(int(data.day.max()) + 550).isoformat()
    sub, weights, _, _ = h.decay_window(data, cutoff)
    last = sub.day == sub.day.max()
    assert np.allclose(weights[last], 0.5)  # exactly one half-life old


def test_bootstrap_is_seeded_and_its_point_fit_matches() -> None:
    data = h.compact_all({"2015-16:regular_season": cohort(2015, 20, 5)})
    point = h.fit_compact(data, "rapm", 100.0)
    kwargs: dict[str, Any] = {
        "stint_weights": np.ones(len(data.day)),
        "home": np.zeros(len(data.day), dtype=np.int64),
        "columns": 1,
        "seed": [2501, 2015, 1],
        "point": {"rapm": {"offense": point["offense"], "defense": point["defense"]}},
    }
    first = h.bootstrap(data, {"rapm": 100.0}, **kwargs)
    second = h.bootstrap(data, {"rapm": 100.0}, **kwargs)
    assert first == second
    assert first["point_check"]["rapm"] < 1e-9
    band = next(iter(first["players"].values()))["rapm_total"]
    assert band["p10"] <= band["p90"] and band["replicates"] > 150


def test_snapshot_cutoffs_run_monthly_past_the_last_game() -> None:
    data = h.compact_all({"2015-16:regular_season": cohort(2015, 30, 6)})
    cutoffs = h.snapshot_cutoffs(data, range(2015, 2016))["2015-16"]
    assert cutoffs[0] == "2015-11-01"  # the opener
    assert cutoffs[1:] == ["2015-12-01", "2016-01-01"]


def test_history_install_carries_entries_and_moves_current(tmp_path: Path) -> None:
    from courtlens.evaluation import impact_history_serving as serving
    from courtlens.evaluation.impact_rating_inputs import write_artifact
    from courtlens.services import served_bundle

    sealed, digest = write_artifact(tmp_path, {"version": "v", "entries": {"sealed": {"x": 1}}})
    path = serving.install(
        tmp_path, lambda base: {**base, "entries": {**base["entries"], "history": {"x": 2}}}
    )
    body = json.loads(path.read_bytes())
    assert body["entries"] == {"sealed": {"x": 1}, "history": {"x": 2}}
    assert served_bundle.resolve(tmp_path) == path
    assert sealed.exists() and sealed.stem == digest  # nothing pruned; rollback is a pointer move
