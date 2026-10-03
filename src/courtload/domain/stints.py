"""Domain models, reconstruction algorithms, and invariants for possession and stint warehouse.

Implements Block B20:
- Continuous 5-on-5 lineup stint reconstruction from PBP events, possessions, and lineups
- Pinned policy: possession-policy-v1
- 5-player sides invariant (exactly 5 distinct players per side on every stint)
- Contiguous chronological event and clock ordering
- Overtime handling: periods 1-4 are 720.0s (12 min); periods 5+ are 300.0s (5 min)
- Minute/duration conservation: period durations sum to 720s (or 300s),
  game duration to 2880s + 300s*OT, and player-seconds sum to 5x game duration per side
- Point conservation: stint team points sum exactly to final team scores
- Box-score minute reconciliation within 30-second rounding tolerance
- Cross-lineup possession attribution: fractional possession exposure based on stint overlap
  duration preserving total possession sums
- Provenance-bearing reconstruction override registry for immutable manual/lineup corrections
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Final

from courtload.domain.rich_sources import (
    POSSESSION_POLICY_VERSION,
    NormalizedLineupStint,
    NormalizedPbpEvent,
    NormalizedPossession,
    compute_payload_hash,
)

REGULATION_PERIOD_SECONDS: Final[float] = 720.0  # 12 minutes
OVERTIME_PERIOD_SECONDS: Final[float] = 300.0  # 5 minutes
BOX_MINUTES_TOLERANCE_SECONDS: Final[float] = 30.0  # 30-second official rounding tolerance


def get_expected_period_seconds(period: int) -> float:
    """Return standard duration in seconds for given period."""
    if period <= 4:
        return REGULATION_PERIOD_SECONDS
    return OVERTIME_PERIOD_SECONDS


def format_seconds_to_clock(seconds: float) -> str:
    """Format seconds remaining as MM:SS."""
    if seconds < 0:
        seconds = 0.0
    total_sec = round(seconds)
    mins = total_sec // 60
    secs = total_sec % 60
    return f"{mins:02d}:{secs:02d}"


@dataclass(frozen=True)
class ReconstructionOverrideRecord:
    """Provenance-bearing immutable override record for lineup or possession reconstruction."""

    id: str
    game_id: str
    override_type: str  # starter_override, lineup_override, substitution_override, clock_override
    period: int | None
    action_number: int | None
    order_index: int | None
    team_id: str | None
    player_id: str | None
    original_value_json: Any
    override_value_json: Any
    reason: str
    author: str
    status: str = "active"


@dataclass(frozen=True)
class ReconstructedStint:
    """Reconstructed uninterrupted 5-on-5 continuous lineup stint."""

    game_id: str
    stint_index: int
    period: int
    start_clock: str
    end_clock: str
    start_seconds_remaining: float
    end_seconds_remaining: float
    duration_seconds: float
    home_team_id: str
    away_team_id: str
    home_lineup: list[str]  # 5 sorted player IDs
    away_lineup: list[str]  # 5 sorted player IDs
    home_lineup_key: str
    away_lineup_key: str
    start_home_score: int
    start_away_score: int
    end_home_score: int
    end_away_score: int
    home_points: int
    away_points: int
    home_possessions: float
    away_possessions: float
    total_possessions: float
    stats_json: dict[str, Any]
    player_stats_json: dict[str, dict[str, int]]
    policy_version: str = POSSESSION_POLICY_VERSION
    source_hash: str = ""
    status: str = "valid"


@dataclass(frozen=True)
class StintPlayerExposure:
    """Individual player participation and performance during a continuous stint."""

    player_id: str
    team_id: str
    opponent_team_id: str
    side: str  # 'home' or 'away'
    period: int
    duration_seconds: float
    possessions: float
    opponent_possessions: float
    points: int
    team_points: int
    points_allowed: int
    stats_json: dict[str, int]
    source_hash: str = ""


@dataclass(frozen=True)
class StintReconstructionResult:
    """Complete result of game stint reconstruction with verification status."""

    game_id: str
    stints: list[ReconstructedStint]
    stint_players: list[StintPlayerExposure]
    total_duration_seconds: float
    total_home_points: int
    total_away_points: int
    total_possessions: float
    invariants_passed: bool
    validation_errors: list[str] = field(default_factory=list)
    overrides_applied_count: int = 0


def format_lineup_key(lineup: list[str]) -> str:
    """Produce deterministic pipe-separated key from sorted player IDs."""
    return "|".join(sorted(str(p).strip() for p in lineup))


def extract_event_stats(
    event: NormalizedPbpEvent,
) -> tuple[str | None, str | None, dict[str, int]]:
    """Extract which team and player produced stats on a PBP event.

    Returns:
        (team_id, player_id, {stat_name: count})
    """
    stats: dict[str, int] = {}
    team_id = event.team_id
    player_id = event.person_id

    ev_type = (event.event_type or "").lower().strip()
    action = (event.action_type or "").lower().strip()
    desc = (event.description or "").lower().strip()

    # Points / scoring
    is_make_desc = "made" in ev_type or "make" in ev_type or "free throw make" in desc
    if event.points_total > 0 or is_make_desc:
        pts = event.points_total
        if pts == 0:
            if event.shot_value:
                pts = event.shot_value
            elif "3pt" in action or "three" in desc or "3pt" in desc:
                pts = 3
            elif "free throw" in ev_type or "free throw" in desc:
                pts = 1
            else:
                pts = 2
        stats["points"] = pts

    # Field goals
    is_fga = (
        "shot" in ev_type
        or "field goal" in ev_type
        or "jump shot" in action
        or "layup" in action
        or "dunk" in action
    )
    if is_fga:
        stats["fga"] = 1
        is_3 = event.shot_value == 3 or "3pt" in action or "three" in desc
        if is_3:
            stats["fg3a"] = 1
        is_make = "made" in ev_type or "make" in ev_type or event.points_total > 0
        if is_make:
            stats["fgm"] = 1
            if is_3:
                stats["fg3m"] = 1

    # Free throws
    if "free throw" in ev_type or "free throw" in action or "free throw" in desc:
        stats["fta"] = 1
        is_make = "made" in ev_type or "make" in ev_type or event.points_total > 0
        if is_make:
            stats["ftm"] = 1

    # Rebounds
    if "rebound" in ev_type or "rebound" in action:
        stats["reb"] = 1
        if "offensive" in action or "offensive" in desc:
            stats["oreb"] = 1
        elif "defensive" in action or "defensive" in desc:
            stats["dreb"] = 1

    # Assists, Steals, Blocks, Turnovers, Fouls
    if "assist" in ev_type or "assist" in action or "assist" in desc:
        stats["ast"] = 1
    if "steal" in ev_type or "steal" in action:
        stats["stl"] = 1
    if "block" in ev_type or "block" in action:
        stats["blk"] = 1
    if "turnover" in ev_type or "turnover" in action:
        stats["tov"] = 1
    if "foul" in ev_type or "foul" in action:
        stats["pf"] = 1

    return team_id, player_id, stats


def reconstruct_game_stints(
    *,
    game_id: str,
    home_team_id: str,
    away_team_id: str,
    events: list[NormalizedPbpEvent],
    possessions: list[NormalizedPossession],
    lineups: list[NormalizedLineupStint],
    overrides: list[ReconstructionOverrideRecord] | None = None,
    expected_final_home_score: int | None = None,
    expected_final_away_score: int | None = None,
    player_box_minutes: dict[str, float] | None = None,
) -> StintReconstructionResult:
    """Reconstruct 5-on-5 continuous lineup stints under possession-policy-v1."""
    overrides_list = overrides or []
    active_overrides = [o for o in overrides_list if o.status == "active" and o.game_id == game_id]
    overrides_applied_count = 0

    # Build override lookups
    starter_overrides: dict[tuple[int, str], list[str]] = {}
    action_lineup_overrides: dict[int, tuple[list[str] | None, list[str] | None]] = {}

    for ov in active_overrides:
        if ov.override_type == "starter_override" and ov.period is not None and ov.team_id:
            starter_overrides[(ov.period, ov.team_id)] = [
                str(p).strip() for p in ov.override_value_json
            ]
            overrides_applied_count += 1
        elif ov.override_type == "lineup_override" and ov.action_number is not None:
            val = ov.override_value_json
            home_ov = [str(p).strip() for p in val["home"]] if val.get("home") else None
            away_ov = [str(p).strip() for p in val["away"]] if val.get("away") else None
            action_lineup_overrides[ov.action_number] = (home_ov, away_ov)
            overrides_applied_count += 1

    validation_errors: list[str] = []

    # Map action numbers to raw lineups
    action_to_lineup: dict[int, tuple[list[str], list[str]]] = {}
    for lu in lineups:
        h = sorted(str(p).strip() for p in lu.home_lineup)
        a = sorted(str(p).strip() for p in lu.away_lineup)
        if lu.action_number in action_lineup_overrides:
            ov_h, ov_a = action_lineup_overrides[lu.action_number]
            if ov_h:
                h = sorted(ov_h)
            if ov_a:
                a = sorted(ov_a)
        action_to_lineup[lu.action_number] = (h, a)

    # Determine maximum period
    max_period = 4
    for ev in events:
        if ev.period > max_period:
            max_period = ev.period
    for lu in lineups:
        if lu.period > max_period:
            max_period = lu.period
    for poss in possessions:
        if poss.period > max_period:
            max_period = poss.period

    # Group events by period
    events_by_period: dict[int, list[NormalizedPbpEvent]] = {
        p: [] for p in range(1, max_period + 1)
    }
    for ev in sorted(events, key=lambda x: (x.period, x.order_index, x.action_number)):
        if ev.period in events_by_period:
            events_by_period[ev.period].append(ev)

    # Group lineups by period
    lineups_by_period: dict[int, list[NormalizedLineupStint]] = {
        p: [] for p in range(1, max_period + 1)
    }
    for lu in sorted(lineups, key=lambda x: (x.period, x.action_number)):
        if lu.period in lineups_by_period:
            lineups_by_period[lu.period].append(lu)

    # Group possessions by period
    possessions_by_period: dict[int, list[NormalizedPossession]] = {
        p: [] for p in range(1, max_period + 1)
    }
    for poss in sorted(possessions, key=lambda x: (x.period, x.possession_number)):
        if poss.period in possessions_by_period:
            possessions_by_period[poss.period].append(poss)

    reconstructed_stints: list[ReconstructedStint] = []
    global_stint_index = 1
    current_home_score = 0
    current_away_score = 0

    # Process each period
    for period in range(1, max_period + 1):
        period_seconds = get_expected_period_seconds(period)
        p_events = events_by_period[period]
        p_lineups = lineups_by_period[period]
        p_possessions = possessions_by_period[period]

        # Determine starting lineups for period
        start_h_lineup: list[str] | None = starter_overrides.get((period, home_team_id))
        start_a_lineup: list[str] | None = starter_overrides.get((period, away_team_id))

        if (not start_h_lineup or not start_a_lineup) and p_lineups:
            earliest_act = p_lineups[0].action_number
            h_lu, a_lu = action_to_lineup.get(
                earliest_act,
                (p_lineups[0].home_lineup, p_lineups[0].away_lineup),
            )
            if not start_h_lineup:
                start_h_lineup = h_lu
            if not start_a_lineup:
                start_a_lineup = a_lu

        if not start_h_lineup or not start_a_lineup:
            for ev in p_events:
                if ev.off_lineup and ev.def_lineup:
                    if ev.team_id == home_team_id:
                        if not start_h_lineup:
                            start_h_lineup = sorted(ev.off_lineup)
                        if not start_a_lineup:
                            start_a_lineup = sorted(ev.def_lineup)
                    elif ev.team_id == away_team_id:
                        if not start_h_lineup:
                            start_h_lineup = sorted(ev.def_lineup)
                        if not start_a_lineup:
                            start_a_lineup = sorted(ev.off_lineup)
                    break

        if not start_h_lineup or len(start_h_lineup) != 5:
            validation_errors.append(
                f"Period {period} missing valid 5-player home starting lineup: {start_h_lineup}"
            )
            start_h_lineup = start_h_lineup or [f"unk_h_{i}" for i in range(1, 6)]

        if not start_a_lineup or len(start_a_lineup) != 5:
            validation_errors.append(
                f"Period {period} missing valid 5-player away starting lineup: {start_a_lineup}"
            )
            start_a_lineup = start_a_lineup or [f"unk_a_{i}" for i in range(1, 6)]

        cur_h = sorted(start_h_lineup)
        cur_a = sorted(start_a_lineup)

        class StintSegment:
            def __init__(
                self,
                start_sec: float,
                end_sec: float,
                h_lineup: list[str],
                a_lineup: list[str],
            ):
                self.start_sec = start_sec
                self.end_sec = end_sec
                self.h_lineup = h_lineup
                self.a_lineup = a_lineup
                self.events: list[NormalizedPbpEvent] = []

        segments: list[StintSegment] = []

        # Build sequence of actions with clock and lineups
        actions_with_lineup: list[tuple[int, float, list[str], list[str]]] = []
        for lu in p_lineups:
            h, a = action_to_lineup.get(lu.action_number, (lu.home_lineup, lu.away_lineup))
            ev_match = next((e for e in p_events if e.action_number == lu.action_number), None)
            clock_sec = ev_match.seconds_remaining if ev_match else period_seconds

            if (period, home_team_id) in starter_overrides and clock_sec >= period_seconds - 0.01:
                h = starter_overrides[(period, home_team_id)]
            if (period, away_team_id) in starter_overrides and clock_sec >= period_seconds - 0.01:
                a = starter_overrides[(period, away_team_id)]

            actions_with_lineup.append((lu.action_number, clock_sec, sorted(h), sorted(a)))

        if not actions_with_lineup:
            segments.append(StintSegment(period_seconds, 0.0, cur_h, cur_a))
        else:
            cur_stint_start = period_seconds
            for _act_num, clk_sec, next_h, next_a in actions_with_lineup:
                if next_h != cur_h or next_a != cur_a:
                    transition_time = round(clk_sec, 2)
                    if cur_stint_start > transition_time:
                        segments.append(
                            StintSegment(cur_stint_start, transition_time, cur_h, cur_a)
                        )
                        cur_stint_start = transition_time
                    cur_h = next_h
                    cur_a = next_a

            if cur_stint_start > 0.0:
                segments.append(StintSegment(cur_stint_start, 0.0, cur_h, cur_a))
            elif not segments:
                segments.append(StintSegment(period_seconds, 0.0, cur_h, cur_a))

        # Assign events to segments
        for ev in p_events:
            ev_sec = round(ev.seconds_remaining, 2)
            matched = False
            for seg in segments:
                if seg.end_sec <= ev_sec <= seg.start_sec:
                    seg.events.append(ev)
                    matched = True
                    break
            if not matched and segments:
                if ev_sec >= segments[0].start_sec:
                    segments[0].events.append(ev)
                else:
                    segments[-1].events.append(ev)

        # Period duration check
        sum_seg_durations = sum(seg.start_sec - seg.end_sec for seg in segments)
        if abs(sum_seg_durations - period_seconds) > 0.1:
            validation_errors.append(
                f"Period {period} duration sum mismatch: {sum_seg_durations:.2f}s "
                f"!= expected {period_seconds:.2f}s"
            )

        # Build ReconstructedStint objects from segments
        for seg in segments:
            duration = round(seg.start_sec - seg.end_sec, 2)
            if duration < 0:
                validation_errors.append(
                    f"Negative stint duration in period {period}: "
                    f"start={seg.start_sec}, end={seg.end_sec}"
                )

            # Invariant: 5 distinct players per side
            if len(seg.h_lineup) != 5 or len(set(seg.h_lineup)) != 5:
                validation_errors.append(
                    f"Period {period} stint does not have 5 distinct home players: {seg.h_lineup}"
                )
            if len(seg.a_lineup) != 5 or len(set(seg.a_lineup)) != 5:
                validation_errors.append(
                    f"Period {period} stint does not have 5 distinct away players: {seg.a_lineup}"
                )

            # Scoring progression and counting stats
            seg_home_points = 0
            seg_away_points = 0
            team_stats: dict[str, dict[str, int]] = {
                home_team_id: {
                    "fgm": 0,
                    "fga": 0,
                    "fg3m": 0,
                    "fg3a": 0,
                    "ftm": 0,
                    "fta": 0,
                    "oreb": 0,
                    "dreb": 0,
                    "ast": 0,
                    "stl": 0,
                    "blk": 0,
                    "tov": 0,
                    "pf": 0,
                    "points": 0,
                },
                away_team_id: {
                    "fgm": 0,
                    "fga": 0,
                    "fg3m": 0,
                    "fg3a": 0,
                    "ftm": 0,
                    "fta": 0,
                    "oreb": 0,
                    "dreb": 0,
                    "ast": 0,
                    "stl": 0,
                    "blk": 0,
                    "tov": 0,
                    "pf": 0,
                    "points": 0,
                },
            }
            player_stats: dict[str, dict[str, int]] = {}
            for p in seg.h_lineup + seg.a_lineup:
                player_stats[p] = {
                    "fgm": 0,
                    "fga": 0,
                    "fg3m": 0,
                    "fg3a": 0,
                    "ftm": 0,
                    "fta": 0,
                    "oreb": 0,
                    "dreb": 0,
                    "ast": 0,
                    "stl": 0,
                    "blk": 0,
                    "tov": 0,
                    "pf": 0,
                    "points": 0,
                }

            # Tally from events in this stint
            for ev in seg.events:
                t_id, p_id, stats = extract_event_stats(ev)
                pts = stats.get("points", 0)
                if t_id == home_team_id:
                    seg_home_points += pts
                elif t_id == away_team_id:
                    seg_away_points += pts
                elif pts > 0:
                    if ev.score_home > current_home_score + seg_home_points:
                        seg_home_points += ev.score_home - (current_home_score + seg_home_points)
                    elif ev.score_away > current_away_score + seg_away_points:
                        seg_away_points += ev.score_away - (current_away_score + seg_away_points)

                if t_id in team_stats:
                    for k, v in stats.items():
                        team_stats[t_id][k] = team_stats[t_id].get(k, 0) + v

                if p_id and p_id in player_stats:
                    for k, v in stats.items():
                        player_stats[p_id][k] = player_stats[p_id].get(k, 0) + v

            home_poss_count = 0.0
            away_poss_count = 0.0

            for poss in p_possessions:
                poss_start = poss.start_seconds_remaining
                poss_end = poss.end_seconds_remaining
                poss_dur = round(poss_start - poss_end, 2)

                overlap_start = min(seg.start_sec, poss_start)
                overlap_end = max(seg.end_sec, poss_end)
                overlap_dur = round(overlap_start - overlap_end, 2)

                if overlap_dur > 0:
                    fraction = (overlap_dur / poss_dur) if poss_dur > 0 else 1.0
                    fraction = min(1.0, max(0.0, fraction))
                    if poss.offense_team_id == home_team_id:
                        home_poss_count += fraction
                    elif poss.offense_team_id == away_team_id:
                        away_poss_count += fraction

            home_poss_count = round(home_poss_count, 4)
            away_poss_count = round(away_poss_count, 4)
            total_poss_count = round(home_poss_count + away_poss_count, 4)

            start_h_score = current_home_score
            start_a_score = current_away_score
            end_h_score = start_h_score + seg_home_points
            end_a_score = start_a_score + seg_away_points

            h_key = format_lineup_key(seg.h_lineup)
            a_key = format_lineup_key(seg.a_lineup)

            source_hash = compute_payload_hash(
                {
                    "gid": game_id,
                    "idx": global_stint_index,
                    "period": period,
                    "start": seg.start_sec,
                    "end": seg.end_sec,
                    "h_lineup": seg.h_lineup,
                    "a_lineup": seg.a_lineup,
                    "pts_h": seg_home_points,
                    "pts_a": seg_away_points,
                }
            )

            stint_obj = ReconstructedStint(
                game_id=game_id,
                stint_index=global_stint_index,
                period=period,
                start_clock=format_seconds_to_clock(seg.start_sec),
                end_clock=format_seconds_to_clock(seg.end_sec),
                start_seconds_remaining=seg.start_sec,
                end_seconds_remaining=seg.end_sec,
                duration_seconds=duration,
                home_team_id=home_team_id,
                away_team_id=away_team_id,
                home_lineup=seg.h_lineup,
                away_lineup=seg.a_lineup,
                home_lineup_key=h_key,
                away_lineup_key=a_key,
                start_home_score=start_h_score,
                start_away_score=start_a_score,
                end_home_score=end_h_score,
                end_away_score=end_a_score,
                home_points=seg_home_points,
                away_points=seg_away_points,
                home_possessions=home_poss_count,
                away_possessions=away_poss_count,
                total_possessions=total_poss_count,
                stats_json=team_stats,
                player_stats_json=player_stats,
                policy_version=POSSESSION_POLICY_VERSION,
                source_hash=source_hash,
                status="valid",
            )
            reconstructed_stints.append(stint_obj)
            global_stint_index += 1
            current_home_score = end_h_score
            current_away_score = end_a_score

    # Total duration and point conservation invariants
    total_game_duration = sum(s.duration_seconds for s in reconstructed_stints)
    ot_count = max(0, max_period - 4)
    expected_game_duration = 4 * REGULATION_PERIOD_SECONDS + ot_count * OVERTIME_PERIOD_SECONDS
    if abs(total_game_duration - expected_game_duration) > 0.5:
        validation_errors.append(
            f"Game duration mismatch: total {total_game_duration:.1f}s "
            f"!= expected {expected_game_duration:.1f}s"
        )

    total_home_pts = sum(s.home_points for s in reconstructed_stints)
    total_away_pts = sum(s.away_points for s in reconstructed_stints)

    if expected_final_home_score is not None and total_home_pts != expected_final_home_score:
        validation_errors.append(
            f"Home score conservation failed: reconstructed {total_home_pts} "
            f"!= expected {expected_final_home_score}"
        )
    if expected_final_away_score is not None and total_away_pts != expected_final_away_score:
        validation_errors.append(
            f"Away score conservation failed: reconstructed {total_away_pts} "
            f"!= expected {expected_final_away_score}"
        )

    # Build StintPlayerExposure records
    stint_players: list[StintPlayerExposure] = []
    player_total_seconds: dict[str, float] = {}

    for stint in reconstructed_stints:
        for p in stint.home_lineup:
            p_stats = stint.player_stats_json.get(p, {})
            p_exp = StintPlayerExposure(
                player_id=p,
                team_id=home_team_id,
                opponent_team_id=away_team_id,
                side="home",
                period=stint.period,
                duration_seconds=stint.duration_seconds,
                possessions=stint.home_possessions,
                opponent_possessions=stint.away_possessions,
                points=p_stats.get("points", 0),
                team_points=stint.home_points,
                points_allowed=stint.away_points,
                stats_json=p_stats,
                source_hash=compute_payload_hash(
                    {"gid": game_id, "s_idx": stint.stint_index, "p": p, "t": home_team_id}
                ),
            )
            stint_players.append(p_exp)
            player_total_seconds[p] = player_total_seconds.get(p, 0.0) + stint.duration_seconds

        for p in stint.away_lineup:
            p_stats = stint.player_stats_json.get(p, {})
            p_exp = StintPlayerExposure(
                player_id=p,
                team_id=away_team_id,
                opponent_team_id=home_team_id,
                side="away",
                period=stint.period,
                duration_seconds=stint.duration_seconds,
                possessions=stint.away_possessions,
                opponent_possessions=stint.home_possessions,
                points=p_stats.get("points", 0),
                team_points=stint.away_points,
                points_allowed=stint.home_points,
                stats_json=p_stats,
                source_hash=compute_payload_hash(
                    {"gid": game_id, "s_idx": stint.stint_index, "p": p, "t": away_team_id}
                ),
            )
            stint_players.append(p_exp)
            player_total_seconds[p] = player_total_seconds.get(p, 0.0) + stint.duration_seconds

    # Box-score minute reconciliation
    if player_box_minutes:
        for p_id, box_mins in player_box_minutes.items():
            reconstructed_secs = player_total_seconds.get(p_id, 0.0)
            box_secs = box_mins * 60.0
            diff = abs(reconstructed_secs - box_secs)
            if diff > BOX_MINUTES_TOLERANCE_SECONDS:
                validation_errors.append(
                    f"Player {p_id} minutes discrepancy: stint {reconstructed_secs / 60.0:.2f}m "
                    f"vs box {box_mins:.2f}m (diff {diff:.1f}s > {BOX_MINUTES_TOLERANCE_SECONDS}s)"
                )

    total_possessions_game = sum(s.total_possessions for s in reconstructed_stints)

    return StintReconstructionResult(
        game_id=game_id,
        stints=reconstructed_stints,
        stint_players=stint_players,
        total_duration_seconds=total_game_duration,
        total_home_points=total_home_pts,
        total_away_points=total_away_pts,
        total_possessions=round(total_possessions_game, 4),
        invariants_passed=(len(validation_errors) == 0),
        validation_errors=validation_errors,
        overrides_applied_count=overrides_applied_count,
    )
