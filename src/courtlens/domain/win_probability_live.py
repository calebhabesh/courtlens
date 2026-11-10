"""ESPN plays as the nbastatsv3-shaped rows `win_probability_state.replay` reads (R15b).

The frozen model was trained on states replayed from nbastatsv3 rows, so Live uses the same
replay: this module only translates. It is pure and causal: each output row depends on that play
and earlier ones. ESPN does not publish the NBA's `(P2.T3)` foul markers, so team fouls are
counted here with the rules those markers follow, including two training-data habits the model
learned and Live therefore has to copy:

- an offensive foul carries no team-foul marker, so it does not count;
- a technical foul is written `(P0.T0)`, which resets the replay's team-foul count to zero and
  hands the replay's possession to the other team.
"""

from __future__ import annotations

from typing import Any

from courtlens.domain.win_probability_state import (
    END_GAME_SECONDS,
    OVERTIME_SECONDS,
    PERIOD_SECONDS,
)

HOME_ID, AWAY_ID = "home", "away"
OFFENSIVE_FOULS = {"Offensive Foul", "Offensive Charge"}
# ESPN types with no team-foul marker in the NBA's text (a `T.Foul` or a bare description).
UNMARKED_FOULS = {
    "Double Personal Foul",
    "Double Technical Foul",
    "Defensive 3-Seconds Technical",
    "Delay Technical",
    "Excess Timeout Technical",
}
TECHNICAL_RESET = {"Technical Foul"}
NOT_TURNOVERS = {"Kicked Ball", "Lane", "Double Lane", "Delay of Game", "Defensive Goaltending"}
TIMEOUTS = {"Full Timeout", "Short Timeout", "Challenge"}
SCOREBOARD_TYPES = {"End Period", "End Game"}


def clock_seconds(display: str | None) -> float | None:
    """ESPN's display clock ("11:15", "45.2") as seconds left in the period."""
    if not display:
        return None
    try:
        if ":" in display:
            minutes, seconds = display.split(":")
            return 60 * int(minutes) + float(seconds)
        return float(display)
    except ValueError:
        return None


def _clock(seconds: float) -> str:
    return f"PT{int(seconds // 60):02d}M{seconds % 60:05.2f}S"


def _period_seconds(period: int) -> float:
    return PERIOD_SECONDS if period <= 4 else OVERTIME_SECONDS


def _kind(espn_type: str) -> str:
    if espn_type == "Jumpball":
        return "Jump Ball"
    if espn_type in {"Defensive Rebound", "Offensive Rebound"}:
        return "Rebound"
    if espn_type in TIMEOUTS:
        return "Timeout"
    if espn_type == "Ejection":
        return "Ejection"
    if espn_type in NOT_TURNOVERS or espn_type == "Jump Ball":
        return "Violation"
    if "Turnover" in espn_type or espn_type == "Traveling":
        return "Turnover"
    if "Foul" in espn_type or "Technical" in espn_type:
        return "Foul"
    return "Other"


def replay_rows(plays: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Rows for `replay(rows, HOME_ID, AWAY_ID)` from `domain.live.parse_plays` output.

    Period starts are added when a play first shows the new period, because ESPN lists only period
    ends. Plays without a usable period and clock are dropped, which the replay would do anyway.
    """
    rows: list[dict[str, Any]] = []
    period = 0
    team_fouls = {HOME_ID: 0, AWAY_ID: 0}
    late_fouls = {HOME_ID: 0, AWAY_ID: 0}
    home_score = away_score = 0

    for play in plays:
        left = clock_seconds(play.get("clock"))
        number = play.get("period")
        if left is None or not isinstance(number, int) or number < 1:
            continue
        if play.get("home_score") is not None and play.get("away_score") is not None:
            new_home, new_away = int(play["home_score"]), int(play["away_score"])
        else:
            new_home, new_away = home_score, away_score
        if number != period:
            period = number
            team_fouls = {HOME_ID: 0, AWAY_ID: 0}
            late_fouls = {HOME_ID: 0, AWAY_ID: 0}
            rows.append(
                {
                    "clock": _clock(_period_seconds(number)),
                    "period": number,
                    "actionType": "period",
                    "subType": "start",
                    "description": "",
                    "teamId": "",
                    "personId": "",
                    "scoreHome": home_score,
                    "scoreAway": away_score,
                }
            )
        home_score, away_score = new_home, new_away
        espn_type = str(play.get("type") or "")
        text = str(play.get("text") or "")
        side = play.get("side")
        action, sub_type, description = "Other", "", text
        if play.get("shot") == "free_throw":
            action = "Free Throw"
            sub_type = espn_type.replace(" - ", " ")
            missed = "misses" in text.lower()
            description = f"{'MISS ' if missed else ''}{sub_type}"
        elif play.get("shot") == "field_goal":
            action = "Made Shot" if play.get("scoring") else "Missed Shot"
            sub_type = espn_type
            description = "3PT" if play.get("points_attempted") == 3 else "2PT"
        elif espn_type in SCOREBOARD_TYPES:
            action, sub_type = "period", "end"
        else:
            action = _kind(espn_type)
            sub_type = espn_type
            if action == "Foul":
                description = ""
                sub_type = "Shooting" if espn_type == "Shooting Foul" else espn_type
                if (
                    side in team_fouls
                    and espn_type not in OFFENSIVE_FOULS
                    and espn_type not in UNMARKED_FOULS
                ):
                    if espn_type in TECHNICAL_RESET:
                        description = "(P0.T0)"
                    else:
                        count = team_fouls[side] + 1
                        late = left <= END_GAME_SECONDS
                        limit = 4 if number > 4 else 5
                        penalty = count >= limit or (late and late_fouls[side] >= 1)
                        description = "(P1.PN)" if penalty else f"(P1.T{count})"
                        team_fouls[side] = max(count, 5) if penalty else count
                        late_fouls[side] += late
                    if description == "(P0.T0)":
                        team_fouls[side] = 0
        rows.append(
            {
                "clock": _clock(left),
                "period": number,
                "actionType": action,
                "subType": sub_type,
                "description": description,
                "teamId": side or "",
                "personId": play.get("player_source_id") or "",
                "scoreHome": home_score,
                "scoreAway": away_score,
            }
        )
    return rows
