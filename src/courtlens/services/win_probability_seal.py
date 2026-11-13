"""Seal schema v2 and the seal job (Win Probability v4, block W2).

A v2 seal holds everything a v1 seal holds, with each game's `inputs` block computed exactly as
`win_probability_production.capture_slate` computes it, so the Original model's score is the
same from either. It adds what the pregame "why" needs: the betting line, the player rows behind
`strength`, each player listed Out with what their absence costs, `form` split from the
home-court term, and how old the inputs are. A seal captured after the Market-informed model's
freeze (W3b) also carries `mu4`, `w` and each model's tip-off probability; earlier seals have them
null, and scoring computes them from the seal's line.

The seal job (`run`) seals today's scheduled regular-season games, scores finished games not yet
on the scorecard and rewrites the summaries. It never refits ratings: rating snapshots, box scores
and the roster bundle come from the scheduled jobs. The rule for which seal a game uses is
unchanged (`win_probability_production.inputs_for`): the newest captured before ESPN's tip-off.
A game is graded on the first run after ESPN calls it final (`GRADING_WINDOW`).
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from courtlens.config import get_settings
from courtlens.services import win_probability_head_to_head as head_to_head
from courtlens.services import win_probability_production as production

SCHEMA = "courtlens-win-probability-pregame-v2"
EASTERN = ZoneInfo("America/New_York")
MORNING_RUN = time(9, 0)
# Runs at :25 and :55 so the last seal before a tip on the hour or half hour is taken 5 minutes
# before it, after most game-time injury decisions (a run takes about 25 s). On :00 and :30 the
# run at a tip's own time landed after it, so the seal a game used was 30 minutes old.
FIRST_SEAL = time(12, 25)
SEAL_INTERVAL = timedelta(minutes=30)
RETRY = timedelta(minutes=30)
# A game is graded on the first run after ESPN calls it final, not the next morning (the owner's
# decision of 2026-11-13). The job keeps running on the :25 and :55 grid while a game that tipped
# within this window is not on the scorecard yet; a postponed game stops counting when it ends.
GRADING_WINDOW = timedelta(hours=6)
# What a seal is compared on; the input ages and seal times are not part of a change.
COMPARED = ("inputs", "line", "out_home", "out_away", "event_time")


# ---------------------------------------------------------------------------------------------
# The line.


def line_from_odds(entries: Any) -> dict[str, Any] | None:
    """The first listed book's spread as the market's expected home margin; None when absent.

    ESPN's `spread` is the home team's spread (negative: home favoured), the same convention as
    the closing-lines parquet's `home_point`, so the market home margin is `-spread`. The
    favourite follows the dashboard's `lineFavourite`.
    """
    if not isinstance(entries, list) or not entries or not isinstance(entries[0], dict):
        return None
    first = entries[0]
    raw = first.get("spread")
    if raw is None:
        return None
    try:
        spread = float(raw)
    except (TypeError, ValueError):
        return None
    if spread != spread:
        return None
    provider = (first.get("provider") or {}).get("name")
    details = first.get("details")
    return {
        "home_margin": -spread + 0.0,
        "spread": spread,
        "book": provider if isinstance(provider, str) else None,
        "details": details if isinstance(details, str) else None,
        "favourite": "even" if spread == 0 else ("home" if spread < 0 else "away"),
    }


def lines_on_scoreboard(payload: dict[str, Any]) -> dict[str, dict[str, Any] | None]:
    return {
        str(event["id"]): line_from_odds((event.get("competitions") or [{}])[0].get("odds"))
        for event in payload.get("events") or []
    }


# ---------------------------------------------------------------------------------------------
# Building v2 records.


def out_players(
    roster_players: list[dict[str, Any]], injuries: dict[str, list[dict[str, Any]]]
) -> dict[str, list[dict[str, Any]]]:
    """Roster players ESPN lists as Out, per ESPN team, with their NBA id when known.

    The same match as `roster_availability`: a roster name equal to an Out name.
    """
    from courtlens.ingestion.espn_rosters import ESPN_TEAMS
    from courtlens.services.bref_identity import normalize_name

    out = {
        team: {normalize_name(p["name"]) for p in rows if p.get("status") == "Out"}
        for team, rows in injuries.items()
    }
    tricode_to_espn = {tricode: espn for espn, (_, tricode) in ESPN_TEAMS.items()}
    found: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for player in roster_players:
        team = tricode_to_espn.get(player["tricode"])
        if team is not None and normalize_name(player["name"]) in out.get(team, set()):
            pid = player.get("player_id")
            found[team].append({"name": player["name"], "player_id": str(pid) if pid else None})
    return dict(found)


def _player_rows(
    rows: list[list[Any]], names: dict[str, str], rated: set[str] | None
) -> list[dict[str, Any]]:
    out = [
        {
            "player_id": pid,
            "name": names.get(pid),
            "minutes": share,
            "rating": rating,
            "default_rating": None if rated is None else pid not in rated,
        }
        for pid, share, rating in rows
    ]
    out.sort(key=lambda r: (-r["minutes"], r["player_id"]))
    return out


def absence_cost(
    side: str,
    pid: str,
    base_mu: float,
    variant: dict[str, Any] | None,
    variant_mu: float | None,
    rated: set[str] | None,
) -> dict[str, Any]:
    """What one Out player would have added: minutes and rating with them back, and the cost.

    The cost is in the own forecast's points for the player's team (positive: the team is that
    much worse without them). No appearance in the window means no expected minutes and no cost.
    """
    row = next((r for r in (variant or {}).get("roster", {}).get(side, []) if r[0] == pid), None)
    if row is None or variant_mu is None or row[1] <= 0:
        return {"minutes": None, "rating": None, "default_rating": None, "cost": None}
    change = variant_mu - base_mu
    return {
        "minutes": row[1],
        "rating": row[2],
        "default_rating": None if rated is None else pid not in rated,
        "cost": change if side == "home" else -change,
    }


def build_records(
    day: date,
    games: list[dict[str, Any]],
    lines: dict[str, dict[str, Any] | None],
    roster_players: list[dict[str, Any]],
    injuries: dict[str, list[dict[str, Any]]],
    box_games: list[dict[str, Any]],
    box_players: dict[str, Any],
    ratings: Any,
    pregame: dict[str, Any],
    ages: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    """v2 records for a slate. The v1 fields are computed exactly as `capture_slate` does."""
    from courtlens.services.win_probability_pregame import (
        Target,
        build_entries,
        inputs_from_entry,
        mu_from_entry,
    )

    available, detail = production.roster_availability(roster_players, injuries)
    outs = out_players(roster_players, injuries)
    played = [g for g in box_games if g["date"] < day.isoformat()]
    espn_of_team: dict[str, str] = {}
    for game in games:
        espn_of_team[production._team_id(game["home_espn"])] = game["home_espn"]
        espn_of_team[production._team_id(game["away_espn"])] = game["away_espn"]

    # Extra targets on the same pass: one with each Out player added back, one at a neutral site
    # (whose form is the team-form part alone). Each target is computed independently.
    added: dict[str, tuple[str, str]] = {}

    def availability_for(target: dict[str, Any], team: str, _: list[Any]) -> list[str]:
        base = available.get(espn_of_team[team], [])
        extra = added.get(target["game_id"])
        if extra is not None and extra[0] == team:
            return [*base, extra[1]]
        return base

    targets = []
    for g in games:
        home, away = production._team_id(g["home_espn"]), production._team_id(g["away_espn"])
        targets.append(Target(g["espn_id"], day.isoformat(), home, away))
        targets.append(Target(f"{g['espn_id']}|neutral", day.isoformat(), home, away, True))
        for side, team in (("home", home), ("away", away)):
            for player in outs.get(g[f"{side}_espn"], []):
                if player["player_id"]:
                    key = f"{g['espn_id']}|{side}|{player['player_id']}"
                    added[key] = (team, player["player_id"])
                    targets.append(Target(key, day.isoformat(), home, away))
    entries = build_entries(
        targets, played, box_players, ratings, availability_for, int(pregame["form_half_life_days"])
    )
    chosen = ratings(day.isoformat())
    rated = set(chosen[1]) if chosen is not None else None
    names = {str(p["player_id"]): p["name"] for p in roster_players if p.get("player_id")}
    coefficients = pregame["coefficients"]

    records = {}
    for game in games:
        entry = entries[game["espn_id"]]
        inputs = inputs_from_entry(entry, coefficients)
        neutral = entries[f"{game['espn_id']}|neutral"]
        out: dict[str, list[dict[str, Any]]] = {"home": [], "away": []}
        for side in ("home", "away"):
            for player in outs.get(game[f"{side}_espn"], []):
                key = f"{game['espn_id']}|{side}|{player['player_id']}"
                variant = entries.get(key) if player["player_id"] else None
                variant_mu = (
                    mu_from_entry(variant, coefficients)
                    if variant is not None and chosen is not None
                    else None
                )
                out[side].append(
                    {
                        **player,
                        **absence_cost(
                            side, player["player_id"] or "", inputs.mu, variant, variant_mu, rated
                        ),
                    }
                )
            out[side].sort(key=lambda r: r["name"])
        records[game["espn_id"]] = {
            # v1, field for field (capture_slate).
            **game,
            "home": entry["home"],
            "away": entry["away"],
            "inputs": vars(inputs),
            "out_home": sorted(detail.get(game["home_espn"], {}).get("out", [])),
            "out_away": sorted(detail.get(game["away_espn"], {}).get("out", [])),
            "players_home": len(entry["roster"]["home"]),
            "players_away": len(entry["roster"]["away"]),
            "availability": "tip_off_capture",
            "rating_snapshot_cutoff": entry["snapshot_cutoff"],
            # v2.
            "line": lines.get(game["espn_id"]),
            "players": {
                side: _player_rows(entry["roster"][side], names, rated) for side in ("home", "away")
            },
            "out": out,
            "form_split": {
                "team_form": float(neutral["form"]),
                "home_court": float(entry["form"]) - float(neutral["form"]),
            },
            "ages": {**ages, "rating_snapshot_cutoff": entry["snapshot_cutoff"]},
            # Filled from W3 (v4's freeze); null until then.
            "mu4": None,
            "w": None,
            "tip_off_home": {"original": None, "market_informed": None},
        }
    return records


def _add_market_fields(records: dict[str, dict[str, Any]], now: datetime) -> None:
    """After v4's freeze, fill `mu4`, `w` and both tip-off probabilities (not compared)."""
    try:
        manifest = head_to_head.load_market_manifest()
    except (OSError, ValueError):
        return
    if now <= production._parse_time(manifest["frozen_at"]):
        return
    base = production.get_model()
    w = float(manifest["market"]["w"])
    for record in records.values():
        record.update(head_to_head.seal_fields(base, record, w))


# ---------------------------------------------------------------------------------------------
# Sealing.


def _compared(record: dict[str, Any]) -> dict[str, Any]:
    return {key: record.get(key) for key in COMPARED}


def changed_games(day: str, records: dict[str, dict[str, Any]]) -> list[str]:
    """Games whose inputs, line, Out list or tip time differ from their newest seal (or are new)."""
    latest: dict[str, dict[str, Any]] = {}
    for capture in production.read_captures(day):
        latest.update(capture["games"])
    return sorted(
        game_id
        for game_id, record in records.items()
        if game_id not in latest or _compared(latest[game_id]) != _compared(record)
    )


def seal_slate(day: date, client: Any, now: datetime | None = None) -> dict[str, Any]:
    """Seal a date's games that have not started, as v2, only when a game changed.

    The scoreboard fetched here also gives the day's last scheduled tip, for the run schedule.
    """
    from courtlens.domain.live import parse_injury_feed
    from courtlens.ingestion.espn_win_probability import keep_raw
    from courtlens.services.espn_rosters import last_checked, load_latest
    from courtlens.services.win_probability_pregame import load_box_history, monthly_ratings

    now = now or datetime.now(UTC)
    manifest = production.load_manifest()
    raw, payload = client.get("scoreboard", {"dates": day.strftime("%Y%m%d")})
    keep_raw(raw, "scoreboard", f"capture-{day.isoformat()}")
    games = production.scheduled_regular_games(payload)
    report: dict[str, Any] = {
        "scheduled": len(games),
        "last_tip": max((g["event_time"] for g in games), default=None),
        "sealed": None,
        "changed": [],
        "without_line": 0,
    }
    if not games:
        return report
    raw_injuries, injury_payload = client.get("injuries", {})
    keep_raw(raw_injuries, "injuries", now.isoformat(timespec="seconds"))
    injuries = parse_injury_feed(injury_payload)["teams"]
    latest = load_latest()
    if latest is None:
        raise ValueError("no ESPN roster bundle")
    roster_path, roster = latest
    end_year = day.year + 1 if day.month >= production.SEASON_START_MONTH else day.year
    box_games, box_players = load_box_history(range(end_year - 2, end_year + 1))
    box_through = max((g["date"] for g in box_games if g["date"] < day.isoformat()), default=None)
    ages = {
        "box_through": box_through,
        "roster_observed_at": roster["entry"]["observed_at"],
        "roster_checked_at": last_checked(roster_path, roster),
        "injury_report_at": now.isoformat(timespec="seconds"),
    }
    records = build_records(
        day,
        games,
        lines_on_scoreboard(payload),
        roster["entry"]["players"],
        injuries,
        box_games,
        box_players,
        monthly_ratings(get_settings().win_probability_snapshots_dir),
        manifest["pregame"],
        ages,
    )
    report["without_line"] = sum(r["line"] is None for r in records.values())
    _add_market_fields(records, now)
    report["changed"] = changed_games(day.isoformat(), records)
    if not report["changed"]:
        return report
    body = {
        "schema": SCHEMA,
        "day": day.isoformat(),
        "captured_at": now.isoformat(timespec="seconds"),
        "manifest_sha256": manifest["manifest_sha256"],
        "roster_bundle": roster_path.stem,
        "roster_observed_at": roster["entry"]["observed_at"],
        "box_through": box_through,
        "injury_report_sha256": hashlib.sha256(raw_injuries).hexdigest(),
        "games": records,
    }
    path: Path = production._seal(production.serving_root() / "pregame", day.isoformat(), body)
    report["sealed"] = str(path)
    return report


# ---------------------------------------------------------------------------------------------
# The job and its schedule.


class _Scoreboards:
    """The run's ESPN client, remembering each scoreboard it reads so nothing is fetched twice."""

    def __init__(self, client: Any) -> None:
        self.client = client
        self.seen: dict[str, dict[str, Any]] = {}

    def get(self, kind: str, params: dict[str, str]) -> tuple[bytes, dict[str, Any]]:
        raw, payload = self.client.get(kind, params)
        if kind == "scoreboard":
            self.seen[params["dates"]] = payload
        return raw, payload


def awaiting_grade(scoreboards: list[dict[str, Any]], scored: set[str], now: datetime) -> list[str]:
    """Regular-season games that tipped within the grading window and are not on the scorecard.

    A game ESPN has closed without a result (postponed or cancelled) is not waited for.
    """
    waiting = []
    for payload in scoreboards:
        for event in payload.get("events") or []:
            game_id = str(event["id"])
            status = (event.get("status") or {}).get("type", {})
            if (
                game_id in scored
                or (event.get("season") or {}).get("type") != production.REGULAR_SEASON_TYPE
                or (status.get("state") == "post" and status.get("completed") is not True)
            ):
                continue
            tip = production._parse_time(event["date"])
            if tip <= now < tip + GRADING_WINDOW:
                waiting.append(game_id)
    return sorted(set(waiting))


def run(client: Any, now: datetime | None = None, lookback_days: int = 3) -> dict[str, Any]:
    """One run: score finished games, today's included, seal today's slate, rewrite the summaries.

    Unlike `production.nightly` it never calls `ensure_snapshots`: ratings are refit by the daily
    refresh.
    """
    now = now or datetime.now(UTC)
    today = now.astimezone(EASTERN).date()
    client = _Scoreboards(client)
    manifest = production.load_manifest()
    model = production.get_model()
    done = {row["game_id"] for row in production.scorecard_rows()}
    totals: dict[str, int] = defaultdict(int)
    # The seal comes first, so grading the games that just ended never delays a seal taken five
    # minutes before a tip. Its failure still ends the run, after the scoring it used to follow.
    seal: dict[str, Any] = {}
    seal_failure: Exception | None = None
    try:
        seal = seal_slate(today, client, now)
    except Exception as error:
        seal_failure = error
    # A scoring failure must not cost tonight's seals: it is reported, and retried next run.
    score_error = None
    try:
        for offset in range(lookback_days, -1, -1):
            counts = production.score_date(
                today - timedelta(days=offset), client, model, manifest, done
            )
            for key, value in counts.items():
                totals[key] += value
    except Exception as error:
        score_error = repr(error)
    # Both models from the same seals since v4's freeze (W3b). Its failure is reported, not fatal.
    head_to_head_error = None
    try:
        market = head_to_head.load_market_manifest()
        for key, value in head_to_head.score_pending(client, model, market).items():
            totals[key] += value
    except Exception as error:
        head_to_head_error = repr(error)
    if seal_failure is not None:
        raise seal_failure
    production.write_availability_checks()
    summary = production.write_summary()
    production.write_wpa_summary(production.season_of(today.isoformat()))
    serving = None
    try:
        serving = head_to_head.write_summary(client, today, now)["serving_model"]["model"]
    except Exception as error:
        head_to_head_error = head_to_head_error or repr(error)
    recent = [
        client.seen[day.strftime("%Y%m%d")]
        for day in (today - timedelta(days=1), today)
        if day.strftime("%Y%m%d") in client.seen
    ]
    scored = {row["game_id"] for row in production.scorecard_rows()}
    return {
        "date": today.isoformat(),
        "ran_at": now.isoformat(timespec="seconds"),
        **totals,
        "awaiting_grade": awaiting_grade(recent, scored, now),
        "score_error": score_error,
        "head_to_head_error": head_to_head_error,
        "serving_model": serving,
        **{f"seal_{key}": value for key, value in seal.items()},
        "games_on_scorecard": summary["games_scored"],
        "prospective_games": summary["prospective"]["games"],
        "drift": summary["drift"]["latest"]["status"],
    }


def next_run(now: datetime, last_tip: str | None, awaiting: bool = False) -> datetime:
    """When the job runs next: every 30 minutes from 12:25 Eastern (at :25 and :55) while a run
    would still land before the day's last scheduled tip, then on the same grid while a game that
    has tipped is still to be graded, and at 09:00 Eastern to catch anything the night left.
    """
    local = now.astimezone(EASTERN)
    today = local.date()

    def at(day: date, clock: time) -> datetime:
        return datetime.combine(day, clock, EASTERN)

    candidates = [at(today, MORNING_RUN), at(today + timedelta(days=1), MORNING_RUN)]
    if awaiting:
        # The grid is anchored on the UTC half hour, so it holds across an Eastern clock change.
        grid = now.astimezone(UTC).replace(second=0, microsecond=0)
        grid += timedelta(minutes=1)
        while grid.minute not in {FIRST_SEAL.minute, (FIRST_SEAL.minute + 30) % 60}:
            grid += timedelta(minutes=1)
        candidates.append(grid.astimezone(EASTERN))
    if last_tip is not None:
        tip = production._parse_time(last_tip)
        slot = at(today, FIRST_SEAL)
        while slot < tip:
            candidates.append(slot)
            slot += SEAL_INTERVAL
    return min(c for c in candidates if c > local).astimezone(UTC)
