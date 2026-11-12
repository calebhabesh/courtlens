"""Seal schema v2 and the seal job (Win Probability v4, W2).

The v2 seal must leave the Original model's inputs and score exactly as v1 makes them, read v1
seals, write only on a change, and get the line's sign right against kept raw files.
"""

import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from courtlens.domain.teams import TRICODE_TO_TEAM
from courtlens.ingestion.espn_rosters import ESPN_TEAMS
from courtlens.services import win_probability_production as production
from courtlens.services import win_probability_seal as seal

LINES = json.loads(
    (Path(__file__).parents[1] / "fixtures" / "win-probability-lines" / "lines.json").read_text()
)
DAY = date(2026, 11, 11)
NOW = datetime(2026, 11, 11, 23, 0, tzinfo=UTC)
# Two scheduled games on ESPN team ids: BOS at IND, NY at TOR.
SLATE = (("401", "11", "2", "2026-11-12T00:00Z", -4.5), ("402", "28", "18", "2026-11-12T00:30Z", 2))


def nba(espn: str) -> str:
    return TRICODE_TO_TEAM[ESPN_TEAMS[espn][1]].team_id


# ---------------------------------------------------------------------------------------------
# The line.


@pytest.mark.parametrize("case", LINES["scoreboards"] + LINES["summaries"])
def test_the_favourite_is_the_team_named_in_espns_line_text(case):
    line = seal.line_from_odds(case["odds"])
    sides = {c["homeAway"]: c["team"]["abbreviation"] for c in case["competitors"]}
    assert line["details"].split()[0] == sides[line["favourite"]]
    assert line["home_margin"] == -line["spread"]
    # A favoured home team is expected to win by a positive margin.
    assert (line["home_margin"] > 0) == (line["favourite"] == "home")


@pytest.mark.parametrize("case", LINES["summaries"])
def test_the_line_has_the_closing_parquets_sign(case):
    """The parquet's home_point is the home spread too: market home margin = -home_point."""
    line = seal.line_from_odds(case["odds"])
    assert line["home_margin"] == -case["parquet_home_point"]


def test_no_line_and_a_pick_em():
    assert seal.line_from_odds(None) is None
    assert seal.line_from_odds([]) is None
    assert seal.line_from_odds([{"spread": None, "details": "OFF"}]) is None
    even = seal.line_from_odds([{"spread": 0, "details": "EVEN", "provider": {"name": "X"}}])
    assert even["favourite"] == "even" and str(even["home_margin"]) == "0.0"


# ---------------------------------------------------------------------------------------------
# A synthetic slate both seal versions can be built from.


def box_history():
    """60 days of games among the 30 teams; eight players a team, two of them bench."""
    rng = np.random.default_rng(7)
    teams = sorted({t.team_id for t in TRICODE_TO_TEAM.values()})
    games, players = [], {}
    start = DAY - timedelta(days=60)
    number = 0
    for offset in range(60):
        day = (start + timedelta(days=offset)).isoformat()
        order = rng.permutation(30)
        for i in range(0, 10, 2):
            home, away = teams[order[i]], teams[order[i + 1]]
            gid = f"g{number}"
            number += 1

            def stats(points):
                return {
                    "points": float(points),
                    "fga": 88.0,
                    "fta": 22.0,
                    "ftm": 17.0,
                    "oreb": 10.0,
                    "tov": 13.0,
                    "three_att": 35.0,
                    "three_made": 13.0,
                }

            games.append(
                {
                    "gid": gid,
                    "date": day,
                    "year": 2027,
                    "home": home,
                    "away": away,
                    "home_stats": stats(rng.integers(95, 130)),
                    "away_stats": stats(rng.integers(95, 130)),
                }
            )
            players[gid] = [
                (f"{team}-{k}", 60.0 * (36 - 3 * k), False, team)
                for team in (home, away)
                for k in range(8)
            ]
    return games, players


def ratings(day):
    rapm = {f"{t.team_id}-{k}": (k - 3.5) * 0.4 for t in TRICODE_TO_TEAM.values() for k in range(7)}
    return ("2026-11-01", rapm, -1.0)


def roster():
    rows = []
    for _, home, away, _, _ in SLATE:
        for espn in (home, away):
            tricode = ESPN_TEAMS[espn][1]
            for k in range(8):
                rows.append(
                    {
                        "tricode": tricode,
                        "name": f"Player {tricode} {k}",
                        "player_id": f"{nba(espn)}-{k}",
                    }
                )
            # On the roster, listed Out, never in a box: no expected minutes, no cost.
            rows.append(
                {"tricode": tricode, "name": f"Rookie {tricode}", "player_id": f"{espn}-new"}
            )
    return rows


class Client:
    def __init__(self, spreads=None, out=("Player IND 6",)):
        self.spreads = spreads
        self.out = out

    def get(self, kind, params):
        if kind == "injuries":
            groups = {}
            for name in [*self.out, "Rookie IND"]:
                tricode = name.split()[1]
                espn = next(k for k, v in ESPN_TEAMS.items() if v[1] == tricode)
                groups.setdefault(espn, []).append(
                    {"athlete": {"displayName": name}, "status": "Out"}
                )
            payload = {"injuries": [{"id": k, "injuries": v} for k, v in groups.items()]}
        else:
            events = []
            for gid, home, away, tip, spread in SLATE:
                spread = (self.spreads or {}).get(gid, spread)
                events.append(
                    {
                        "id": gid,
                        "date": tip,
                        "season": {"type": 2},
                        "status": {"type": {"state": "pre"}},
                        "competitions": [
                            {
                                "competitors": [
                                    {"homeAway": "home", "team": {"id": home}},
                                    {"homeAway": "away", "team": {"id": away}},
                                ],
                                "odds": [
                                    {
                                        "spread": spread,
                                        "details": f"line {spread}",
                                        "provider": {"name": "Book"},
                                    }
                                ],
                            }
                        ],
                    }
                )
            payload = {"events": events}
        return json.dumps(payload).encode(), payload


@pytest.fixture
def slate(tmp_path, monkeypatch):
    from courtlens.ingestion import espn_win_probability
    from courtlens.services import espn_rosters, win_probability_pregame

    settings = SimpleNamespace(
        win_probability_serving_dir=tmp_path, win_probability_snapshots_dir=None
    )
    monkeypatch.setattr(production, "get_settings", lambda: settings)
    monkeypatch.setattr(seal, "get_settings", lambda: settings)
    monkeypatch.setattr(espn_win_probability, "keep_raw", lambda *_: {})
    bundle = {"entry": {"players": roster(), "observed_at": "2026-11-11T17:00:00+00:00"}}
    monkeypatch.setattr(espn_rosters, "load_latest", lambda: (Path("bundle.json"), bundle))
    monkeypatch.setattr(espn_rosters, "last_checked", lambda *_: "2026-11-11T22:00:00+00:00")
    history = box_history()
    monkeypatch.setattr(win_probability_pregame, "load_box_history", lambda _: history)
    monkeypatch.setattr(win_probability_pregame, "monthly_ratings", lambda _=None: ratings)
    return tmp_path


class InputsModel:
    """Stands in for the boosters: a probability that moves with every input."""

    def predict_home(self, states, inputs):
        total = sum(vars(inputs).values())
        return 1 / (1 + np.exp(-(total / 10 + states.time / 3000 - 0.5)))


def summary(game_id):
    plays = [
        {
            "id": "1",
            "period": 1,
            "clock": "11:00",
            "type": "Jump Shot",
            "text": "",
            "side": "home",
            "shot": "field_goal",
            "scoring": True,
            "points_attempted": None,
            "player_source_id": "p1",
            "home_score": 2,
            "away_score": 0,
        },
        {
            "id": "2",
            "period": 4,
            "clock": "1:00",
            "type": "Jump Shot",
            "text": "",
            "side": "away",
            "shot": "field_goal",
            "scoring": True,
            "points_attempted": None,
            "player_source_id": "p2",
            "home_score": 90,
            "away_score": 88,
        },
    ]
    return {
        "game": {
            "source_id": game_id,
            "slate_date": DAY.isoformat(),
            "teams": [
                {"side": "home", "score": 90, "abbreviation": "IND"},
                {"side": "away", "score": 88, "abbreviation": "BOS"},
            ],
        },
        "plays": plays,
        "win_probability": [{"play_id": "1", "home": 0.55}],
    }


def test_v1_and_v2_give_the_same_inputs_and_the_same_original_score(slate):
    v1 = json.loads(production.capture_slate(DAY, Client(), NOW).read_text())
    for path in (slate / "pregame").glob("*.json"):
        path.unlink()
    report = seal.seal_slate(DAY, Client(), NOW)
    v2 = json.loads(Path(report["sealed"]).read_text())
    assert v1["schema"].endswith("-v1") and v2["schema"] == seal.SCHEMA
    assert all(v2[k] == v1[k] for k in v1 if k not in ("schema", "games"))
    for game_id, record in v1["games"].items():
        new = v2["games"][game_id]
        # Every v1 field, `inputs` included, is unchanged.
        assert {k: new[k] for k in record} == record
        rows = [
            production.score_game(
                InputsModel(), summary(game_id), r, "2026-11-04", "2026-11-12T00:00Z"
            )
            for r in (record, new)
        ]
        assert rows[0] == rows[1]


def test_v2_adds_the_line_players_absence_cost_form_split_and_ages(slate):
    report = seal.seal_slate(DAY, Client(), NOW)
    assert report["last_tip"] == "2026-11-12T00:30Z" and report["without_line"] == 0
    record = json.loads(Path(report["sealed"]).read_text())["games"]["401"]
    assert record["line"]["home_margin"] == 4.5 and record["line"]["favourite"] == "home"
    home = record["players"]["home"]
    assert len(home) == record["players_home"] == 7
    assert sum(p["minutes"] for p in home) == pytest.approx(240, abs=0.01)
    assert home[0]["minutes"] >= home[-1]["minutes"]
    assert {p["default_rating"] for p in home} == {False, True}  # player 7 has no rating
    strength = sum(p["minutes"] / 48 * p["rating"] for p in home) - sum(
        p["minutes"] / 48 * p["rating"] for p in record["players"]["away"]
    )
    assert strength == pytest.approx(record["inputs"]["strength"], abs=1e-3)
    out = {p["name"]: p for p in record["out"]["home"]}
    assert set(out) == set(record["out_home"]) == {"Player IND 6", "Rookie IND"}
    # A player whose rating beats the team's costs it points; the rookie has no minutes.
    assert out["Player IND 6"]["cost"] > 0 and out["Player IND 6"]["minutes"] > 0
    assert out["Rookie IND"]["cost"] is None and out["Rookie IND"]["minutes"] is None
    split = record["form_split"]
    assert split["team_form"] + split["home_court"] == pytest.approx(record["inputs"]["form"])
    assert record["ages"] == {
        "box_through": "2026-11-10",
        "roster_observed_at": "2026-11-11T17:00:00+00:00",
        "roster_checked_at": "2026-11-11T22:00:00+00:00",
        "injury_report_at": "2026-11-11T23:00:00+00:00",
        "rating_snapshot_cutoff": "2026-11-01",
    }
    assert record["mu4"] is None and record["w"] is None
    assert record["tip_off_home"] == {"original": None, "market_informed": None}


def test_absence_cost_is_the_change_in_the_own_forecast():
    entry = {"roster": {"away": [["p", 20.0, 2.0]]}}
    away = seal.absence_cost("away", "p", 3.0, entry, 2.0, {"p"})
    assert away["cost"] == 1.0 and away["minutes"] == 20.0 and away["default_rating"] is False
    home = seal.absence_cost("home", "q", 3.0, {"roster": {"home": [["q", 5.0, -1.0]]}}, 2.5, set())
    assert home["cost"] == -0.5 and home["default_rating"] is True


def test_a_seal_is_written_only_when_a_game_changes(slate):
    first = seal.seal_slate(DAY, Client(), NOW)
    assert first["changed"] == ["401", "402"]
    later = NOW + timedelta(minutes=30)
    same = seal.seal_slate(DAY, Client(), later)
    assert same["sealed"] is None and same["changed"] == []
    moved = seal.seal_slate(DAY, Client(spreads={"402": 3.5}), later)
    assert moved["changed"] == ["402"] and moved["sealed"]
    news = seal.seal_slate(DAY, Client(spreads={"402": 3.5}, out=()), later + timedelta(hours=1))
    assert news["changed"] == ["401"]
    assert len(list((slate / "pregame").glob("*.json"))) == 3


def test_v1_seals_still_read_and_the_newest_before_tip_off_wins(slate):
    v1 = production.capture_slate(DAY, Client(), NOW)
    record, when = production.inputs_for("401", DAY.isoformat(), "2026-11-12T00:00Z")
    assert when == NOW.isoformat(timespec="seconds") and "line" not in record
    # A v1 seal has no line, so the first v2 run counts every game as changed.
    later = NOW + timedelta(minutes=30)
    assert seal.seal_slate(DAY, Client(), later)["changed"] == ["401", "402"]
    record, when = production.inputs_for("401", DAY.isoformat(), "2026-11-12T00:00Z")
    assert record["line"]["spread"] == -4.5 and when == later.isoformat(timespec="seconds")
    after_tip = datetime(2026, 11, 12, 0, 5, tzinfo=UTC)
    seal.seal_slate(DAY, Client(spreads={"401": -9}), after_tip)
    record, _ = production.inputs_for("401", DAY.isoformat(), "2026-11-12T00:00Z")
    assert record["line"]["spread"] == -4.5
    assert v1.exists()


def test_the_job_never_refits_ratings(slate, monkeypatch):
    from courtlens.evaluation import win_probability_ratings

    def refuse(*_):
        raise AssertionError("ensure_snapshots called")

    monkeypatch.setattr(win_probability_ratings, "ensure_snapshots", refuse)
    monkeypatch.setattr(production, "get_model", lambda: InputsModel())
    monkeypatch.setattr(production, "score_date", lambda *_: {"scored": 0})
    monkeypatch.setattr(production, "write_availability_checks", lambda: {})
    monkeypatch.setattr(production, "write_wpa_summary", lambda _: None)
    monkeypatch.setattr(
        production,
        "write_summary",
        lambda: {
            "games_scored": 0,
            "prospective": {"games": 0},
            "drift": {"latest": {"status": "x"}},
        },
    )
    report = seal.run(Client(), NOW)
    assert report["date"] == "2026-11-11" and report["seal_sealed"]


def test_a_scoring_failure_still_seals(slate, monkeypatch):
    def broken(*_):
        raise ValueError("odd summary")

    monkeypatch.setattr(production, "get_model", lambda: InputsModel())
    monkeypatch.setattr(production, "score_date", broken)
    monkeypatch.setattr(production, "write_availability_checks", lambda: {})
    monkeypatch.setattr(production, "write_wpa_summary", lambda _: None)
    monkeypatch.setattr(
        production,
        "write_summary",
        lambda: {
            "games_scored": 0,
            "prospective": {"games": 0},
            "drift": {"latest": {"status": "x"}},
        },
    )
    report = seal.run(Client(), NOW)
    assert report["seal_sealed"] and "odd summary" in report["score_error"]


# ---------------------------------------------------------------------------------------------
# The schedule.


def eastern(day, clock):
    hour, minute = map(int, clock.split(":"))
    return datetime(2026, 11, day, hour, minute, tzinfo=seal.EASTERN)


@pytest.mark.parametrize(
    ("now", "last_tip", "expected"),
    [
        (eastern(11, "03:00"), None, eastern(11, "09:00")),
        (eastern(11, "09:00"), "2026-11-12T03:00Z", eastern(11, "12:25")),
        (eastern(11, "12:25"), "2026-11-12T03:00Z", eastern(11, "12:55")),
        (eastern(11, "21:01"), "2026-11-12T03:00Z", eastern(11, "21:25")),
        # The last run lands 5 minutes before the last tip (22:00 Eastern), not at it.
        (eastern(11, "21:30"), "2026-11-12T03:00Z", eastern(11, "21:55")),
        (eastern(11, "21:55"), "2026-11-12T03:00Z", eastern(12, "09:00")),
        (eastern(11, "09:01"), None, eastern(12, "09:00")),
        (eastern(11, "23:00"), None, eastern(12, "09:00")),
    ],
)
def test_next_run(now, last_tip, expected):
    assert seal.next_run(now, last_tip) == expected


def test_daylight_saving_keeps_eastern_clock_times():
    # 2027-03-14 is the spring change; 12:25 is 16:25 UTC that day, 17:25 the day before.
    before = seal.next_run(datetime(2027, 3, 13, 14, 0, tzinfo=UTC), "2027-03-14T00:00Z")
    after = seal.next_run(datetime(2027, 3, 14, 14, 0, tzinfo=UTC), "2027-03-15T00:00Z")
    assert before == datetime(2027, 3, 13, 17, 25, tzinfo=UTC)
    assert after == datetime(2027, 3, 14, 16, 25, tzinfo=UTC)


@pytest.mark.parametrize("tip", ["19:00", "19:30", "22:00", "22:30"])
def test_the_last_seal_before_a_tip_is_five_minutes_before_it(tip):
    tip_at = eastern(11, tip)
    last_tip = tip_at.astimezone(UTC).strftime("%Y-%m-%dT%H:%MZ")
    run = eastern(11, "12:00")
    runs = []
    while run.date() == tip_at.date():
        run = seal.next_run(run, last_tip).astimezone(seal.EASTERN)
        runs.append(run)
    before = [r for r in runs if r < tip_at]
    assert tip_at - before[-1] == timedelta(minutes=5)
    assert all(r.minute in {25, 55} for r in before)


# ---------------------------------------------------------------------------------------------
# The local switch.


@pytest.mark.parametrize("local", [True, False])
def test_refresh_dailys_step_seals_only_while_local_sealing_is_on(monkeypatch, local):
    from courtlens import cli
    from courtlens.evaluation import win_probability_ratings

    calls = []
    monkeypatch.setattr(
        cli,
        "get_settings",
        lambda: SimpleNamespace(
            win_probability_local_sealing=local, win_probability_snapshots_dir=Path("snapshots")
        ),
    )
    monkeypatch.setattr(cli, "refresh_win_probability_command", lambda days: calls.append(days))
    monkeypatch.setattr(
        win_probability_ratings, "ensure_snapshots", lambda *a: calls.append(a) or {"built": []}
    )
    cli._refresh_win_probability_step()
    if local:
        assert calls == [7]
    else:
        assert len(calls) == 1 and calls[0][1] == Path("snapshots")


def test_local_sealing_is_on_by_default():
    from courtlens.config import Settings

    assert Settings.model_fields["win_probability_local_sealing"].default is True
