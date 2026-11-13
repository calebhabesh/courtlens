"""The pregame "why" for one game, built from its seal alone (Win Probability v4, W4 API).

The own forecast is linear, so each row is coefficient x input and the rows add up to it exactly.
The seal keeps the strength difference but not the pace it is multiplied by, so "Players
available" is the own forecast minus every other term: exact by construction. The prediction is
the own read (W-D16): the Original's margin and tip-off chance. The market row is
`w x (line - own)`, and with it `market_informed` carries the Market-informed model's margin and
chance, shown beside the prediction. Each win chance comes from the full model at the opening
state, so it is not a straight conversion of the margin. Works for past games: nothing is read but
the seal, the frozen manifests and the scored rows.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from courtlens.services import win_probability_head_to_head as head_to_head
from courtlens.services import win_probability_production as production

# Each sealed input and the coefficient that multiplies it, grouped as the panel shows them.
REST_AND_TRAVEL = (
    ("rest", "rest", "Rest days (home minus away)"),
    ("b2b_home", "b2b_home", "Home on a back-to-back"),
    ("b2b_away", "b2b_away", "Away on a back-to-back"),
    ("games7", "games7", "Games in seven days (home minus away)"),
    ("travel_home", "travel_home_kkm", "Home travel (1,000 km)"),
    ("travel_away", "travel_away_kkm", "Away travel (1,000 km)"),
)
ALTITUDE = (("denver", "denver", "Denver altitude"), ("utah", "utah", "Utah altitude"))


def sealed(game_id: str, day: str) -> tuple[dict[str, Any], str, str] | None:
    """The seal a game uses: the newest captured before its scheduled tip. (record, captured_at,
    seal file name). Falls back to the pre-freeze replay record like `inputs_for`."""
    directory = production.serving_root() / "pregame"
    chosen = None
    for stem in (day, f"replay-{day}"):
        for path in sorted(directory.glob(f"{stem}.*.json")):
            raw = path.read_bytes()
            if hashlib.sha256(raw).hexdigest() != path.stem.split(".")[-1]:
                continue
            body = json.loads(raw)
            record = body["games"].get(game_id)
            if record is None:
                continue
            tip = record.get("event_time")
            if tip and production._parse_time(body["captured_at"]) >= production._parse_time(tip):
                continue
            if chosen is None or body["captured_at"] > chosen[1]:
                chosen = (record, body["captured_at"], path.name)
        if chosen is not None:
            return chosen
    return None


def _row(key: str, label: str, value: float, coefficient: float) -> dict[str, Any]:
    return {
        "input": key,
        "label": label,
        "value": value,
        "coefficient": coefficient,
        "contribution": coefficient * value,
    }


def own_rows(record: dict[str, Any], coefficients: dict[str, float]) -> dict[str, Any]:
    """The own forecast in the panel's groups, adding up to it exactly."""
    inputs = record["inputs"]
    city = 0.0 if inputs["neutral"] else 1.0
    split = record.get("form_split")
    form_rows = (
        [
            _row("team_form", "Team form", split["team_form"], coefficients["form"]),
            _row(
                "home_court_form",
                "Home-court part of form",
                split["home_court"],
                coefficients["form"],
            ),
        ]
        if split
        else [_row("form", "Recent form", inputs["form"], coefficients["form"])]
    )
    home_rows = [
        _row("home", "Home court", city, coefficients["home"]),
        *[_row(k, label, inputs[k], coefficients[c]) for k, c, label in ALTITUDE],
    ]
    rest_rows = [_row(k, label, inputs[k], coefficients[c]) for k, c, label in REST_AND_TRAVEL]
    recent = [r for r in form_rows if r["input"] in ("team_form", "form")]
    home_form = [r for r in form_rows if r["input"] == "home_court_form"]
    others = sum(r["contribution"] for r in [*form_rows, *home_rows, *rest_rows])
    own = float(inputs["mu"])
    players = {
        "input": "strength",
        "label": "Strength of the players available (home minus away), times pace",
        "value": inputs["strength"],
        "coefficient": coefficients["strength_x_pace"],
        "contribution": own - others,
    }

    def group(name: str, label: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "group": name,
            "label": label,
            "contribution": sum(r["contribution"] for r in rows),
            "rows": rows,
        }

    groups = [
        group("players", "Players available", [players]),
        group("form", "Recent form", recent),
        group("home_court", "Home court", [*home_rows, *home_form]),
        group("rest_travel", "Rest and travel", rest_rows),
    ]
    return {"own": own, "groups": groups}


def market_row(record: dict[str, Any], own: float, captured_at: str) -> dict[str, Any]:
    """The Market-informed model's adjustment to the own read, or why there is none."""
    try:
        manifest = head_to_head.load_market_manifest()
    except (OSError, ValueError):
        return {"status": "unavailable"}
    if production._parse_time(captured_at) <= production._parse_time(manifest["frozen_at"]):
        return {"status": "sealed_before_freeze"}
    line = head_to_head.line_of(record)
    w = float(manifest["market"]["w"])
    if line is None:
        return {"status": "no_line", "w": w}
    return {
        "status": "ok",
        "w": w,
        "line": line,
        "book": (record.get("line") or {}).get("book"),
        "details": (record.get("line") or {}).get("details"),
        "adjustment": w * (line - own),
    }


def result_of(game_id: str) -> dict[str, Any] | None:
    for row in head_to_head.rows():
        if row["game_id"] == game_id:
            return {
                "home_score": row["home_score"],
                "away_score": row["away_score"],
                "calls": row["calls"],
            }
    for row in production.scorecard_rows():
        if row["game_id"] == game_id:
            return {"home_score": row["home_score"], "away_score": row["away_score"], "calls": None}
    return None


def breakdown(game_id: str, day: str) -> dict[str, Any] | None:
    found = sealed(game_id, day)
    if found is None:
        return None
    record, captured_at, seal_name = found
    original = production.load_manifest()
    own = own_rows(record, original["pregame"]["coefficients"])
    market = market_row(record, own["own"], captured_at)
    probabilities = (record.get("tip_off_home") or {}).copy()
    if probabilities.get(head_to_head.ORIGINAL) is None:
        w = float(market.get("w", 0.0))
        probabilities = head_to_head.tip_off_probabilities(production.get_model(), record, w)
    model = head_to_head.LEAD
    with_line = (
        {
            "home_margin": own["own"] + market["adjustment"],
            "home_win": probabilities[head_to_head.MARKET],
        }
        if market["status"] == "ok"
        else None
    )
    return {
        "game_id": game_id,
        "date": day,
        "home": record["home"],
        "away": record["away"],
        "tip_off": record.get("event_time"),
        "captured_at": captured_at,
        "seal": seal_name,
        "model": model,
        "serving": model,
        "own": own,
        "market": market,
        "prediction": {"home_margin": own["own"], "home_win": probabilities[model]},
        "market_informed": with_line,
        "tip_off_home": probabilities,
        "out": record.get("out"),
        "out_lists": {"home": record.get("out_home"), "away": record.get("out_away")},
        "players": record.get("players"),
        "ages": record.get("ages"),
        "availability_note": (
            "Players ESPN lists as Out at the seal; Questionable and Doubtful players count as "
            "playing. Absence cost is an estimate in the own forecast's points."
        ),
        "result": result_of(game_id),
        "manifest_sha256": record.get("manifest_sha256") or original["manifest_sha256"],
    }


# ---------------------------------------------------------------------------------------------
# The Live card.

FIRST_SEAL_DAY = "2026-11-04"  # the Original's freeze: no game before it had a real seal
TOSS_UP = head_to_head.TOSS_UP


def card(game: dict[str, Any]) -> dict[str, Any] | None:
    """A slate game's sealed call: the own read's tip-off probability (W-D16), the favourite, and
    for a final game whether the call was right. `market_informed_home_win` is the Market-informed
    model's chance when the seal has a line. None before any real seal existed; `no_seal` after."""
    day = game.get("slate_date") or ""
    if day < FIRST_SEAL_DAY:
        return None
    found = sealed(str(game["source_id"]), day)
    if found is None or found[0].get("availability") != "tip_off_capture":
        return {"status": "no_seal"}
    record, captured_at, _ = found
    market = market_row(record, float(record["inputs"]["mu"]), captured_at)
    model = head_to_head.LEAD
    probabilities = record.get("tip_off_home") or {}
    if probabilities.get(model) is None:
        w = float(market.get("w", 0.0))
        probabilities = head_to_head.tip_off_probabilities(production.get_model(), record, w)
    home_win = probabilities[model]
    favourite = "home" if home_win >= 0.5 else "away"
    probability = home_win if favourite == "home" else 1 - home_win
    body: dict[str, Any] = {
        "status": "sealed",
        "model": model,
        "home_win": home_win,
        "market_informed_home_win": (
            probabilities[head_to_head.MARKET] if market["status"] == "ok" else None
        ),
        "favourite": favourite,
        "probability": probability,
        "toss_up": TOSS_UP[0] <= home_win <= TOSS_UP[1],
        "captured_at": captured_at,
        "right": None,
    }
    if game.get("status") == "final":
        scores = {t.get("side"): t.get("score") for t in game.get("teams", [])}
        try:
            home, away = int(scores["home"]), int(scores["away"])
        except (KeyError, TypeError, ValueError):
            return body
        body["right"] = (home > away) == (favourite == "home") if home_win != 0.5 else None
    return body


def with_cards(slate_read: dict[str, Any]) -> dict[str, Any]:
    data = slate_read.get("data")
    if not data:
        return slate_read
    games = []
    for game in data.get("games", []):
        try:
            prediction = card(game)
        except (OSError, ValueError, KeyError):
            prediction = None
        games.append({**game, "prediction": prediction})
    return {**slate_read, "data": {**data, "games": games}}
