"""Four factors and offensive rating (Research R10, `courtlens-four-factors-inputs-v1`).

Pure rules, no I/O. Two parts:

1. Counting one game of NBA PlayByPlayV3 rows: field goals, free throws by trip kind (the R06
   classifier), turnovers, and offensive or defensive rebounds after each kind of miss. A
   rebound row's team is its `teamId`, or its `personId` when `teamId` is 0 (team rebounds and
   team turnovers carry the team there).
2. Poropudas and Halme, "Decomposing Basketball Team Efficiency Using the Four Factors and
   Shapley Values" (arXiv:2305.13032v2, 2026; v1 2023 as "Dean Oliver's Four Factors
   Revisited"), Proposition 1, Eq. (11):

       ORTG = (1 - TOV%)(FTr + 2 eFG%) / (1 - ORB%(1 - FG%) + mu FTr / FT%)

   with TOV% = TOV / (FGA + TOV - ORB + mu FTA) (Eq. 10), ORB% ~ ORB / (FGA - FGM) (Eq. 9) and
   mu the share of free throws that end a possession (Appendix A). It equals Eq. (3),
   PTS / (FGA + TOV - ORB + mu FTA), exactly; `ortg_box` and `ortg_factors` must agree.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from courtlens.domain import shot_decomposition as sd

# Free throws that end a possession: the last of a two- or three-shot trip, or a lone free throw
# that is not an and-one (the paper: "free throw attempts that can be rebounded if missed,
# excluding free throws following a made field goal"). Technical, flagrant and clear-path free
# throws keep the ball and never end a possession.
ENDING_SUB_TYPES = ("Free Throw 2 of 2", "Free Throw 3 of 3")
MISS_KINDS = ("two", "three", "ft_end", "and_one")
COUNT_KEYS = (
    "games",
    "points",
    "fga",
    "fgm",
    "fg3a",
    "fg3m",
    "fta",
    "ftm",
    "ft_end",
    "ft_end_made",
    "tov",
    "no_turnover_rows",
    *(f"ft_{kind}" for kind in sd.FREE_THROW_KINDS),
    *(f"miss_{k}" for k in MISS_KINDS),
    *(f"orb_{k}" for k in MISS_KINDS),
    *(f"drb_{k}" for k in MISS_KINDS),
    *(f"unrebounded_{k}" for k in MISS_KINDS),
    "unknown_ft_sub_types",
)


@dataclass
class GameCounts:
    """Counts by offensive team for one game; unknown free-throw text is kept, not guessed."""

    teams: dict[str, Counter[str]] = field(default_factory=dict)
    unknown_sub_types: list[str] = field(default_factory=list)
    # The game's final score (home + away) from its last row with both scores; None if absent.
    final_points: int | None = None


def is_three(row: Mapping[str, str]) -> bool:
    """`shotValue` when the archive has it (2024-25 on); else "3PT" in the description.

    The 2014-15 to 2023-24 archives have no shotValue column; their descriptions mark every
    three-point attempt "3PT" (v1 read only shotValue and counted none of them).
    """
    value = row.get("shotValue", "").strip()
    if value:
        return value == "3"
    return "3PT" in row.get("description", "")


def actor_team(row: Mapping[str, str]) -> str:
    team = row.get("teamId", "").strip()
    return row.get("personId", "").strip() if team in ("", "0") else team


def is_ending(sub_type: str, kind: str) -> bool:
    return sub_type in ENDING_SUB_TYPES or kind == sd.ONE_SHOT_OTHER


def count_game(rows: Iterable[Mapping[str, str]]) -> GameCounts:
    """Count one game in PlayByPlayV3 order.

    After a missed field goal or a missed final free throw, the next rebound row decides
    offensive (same team as the shooter) or defensive. A shot, free throw, turnover or period
    end before any rebound leaves that miss unrebounded (counted, kept out of the rates).
    Rebound rows after a missed non-final free throw are dead-ball placeholders and are skipped.
    """
    rows = list(rows)
    out = GameCounts()
    fts, unknown = sd.game_free_throws(rows)
    out.unknown_sub_types = unknown
    ft_kind = {ft.action_number: ft for ft in fts}

    def team(t: str) -> Counter[str]:
        return out.teams.setdefault(t, Counter())

    pending: tuple[str, str] | None = None  # (shooting team, miss kind)

    def drop() -> None:
        nonlocal pending
        if pending is not None:
            team(pending[0])[f"unrebounded_{pending[1]}"] += 1
            pending = None

    for row in rows:
        kind = row.get("actionType", "").strip()
        if kind in ("Made Shot", "Missed Shot"):
            drop()
            shooter = actor_team(row)
            c = team(shooter)
            c["fga"] += 1
            three = is_three(row)
            if three:
                c["fg3a"] += 1
            if kind == "Made Shot":
                c["fgm"] += 1
                c["points"] += 3 if three else 2
                if three:
                    c["fg3m"] += 1
            else:
                miss = "three" if three else "two"
                c[f"miss_{miss}"] += 1
                pending = (shooter, miss)
        elif kind == "Free Throw":
            drop()
            ft = ft_kind.get(int(row["actionNumber"]))
            shooter = actor_team(row)
            c = team(shooter)
            if ft is None:
                c["unknown_ft_sub_types"] += 1
                continue
            c["fta"] += 1
            c[f"ft_{ft.kind}"] += 1
            if ft.made:
                c["ftm"] += 1
                c["points"] += 1
            ending = is_ending(ft.sub_type, ft.kind)
            if ending:
                c["ft_end"] += 1
                c["ft_end_made"] += int(ft.made)
            if not ft.made and (ending or ft.kind == sd.AND_ONE):
                miss = "ft_end" if ending else "and_one"
                c[f"miss_{miss}"] += 1
                pending = (shooter, miss)
        elif kind == "Rebound":
            if pending is None:
                continue
            shooter, miss = pending
            side = "orb" if actor_team(row) == shooter else "drb"
            team(shooter)[f"{side}_{miss}"] += 1
            pending = None
        elif kind == "Turnover":
            drop()
            if row.get("subType", "").strip() == "No Turnover":
                team(actor_team(row))["no_turnover_rows"] += 1
                continue
            team(actor_team(row))["tov"] += 1
        elif kind == "period" and row.get("subType", "").strip() == "end":
            drop()
    drop()
    for c in out.teams.values():
        c["games"] = 1
    for row in reversed(rows):
        home, away = row.get("scoreHome", "").strip(), row.get("scoreAway", "").strip()
        if home.isdigit() and away.isdigit():
            out.final_points = int(home) + int(away)
            break
    return out


def rate(num: float, den: float) -> float | None:
    return None if den <= 0 else num / den


def factors(c: Mapping[str, float], mu: float) -> dict[str, float | None]:
    """The paper's inputs and both forms of ORTG (per 100 possessions) from season counts."""
    fga, fgm, fta, ftm = c["fga"], c["fgm"], c["fta"], c["ftm"]
    orb = sum(c[f"orb_{k}"] for k in MISS_KINDS)
    poss = fga + c["tov"] - orb + mu * fta
    efg = rate(fgm + 0.5 * c["fg3m"], fga)
    ftr = rate(ftm, fga)
    fg = rate(fgm, fga)
    ft = rate(ftm, fta)
    tov_pct = rate(c["tov"], poss)
    orb_pct = rate(orb, fga - fgm)  # Eq. (9)
    box = None if poss <= 0 else 100 * c["points"] / poss
    return {
        "possessions": poss,
        "efg": efg,
        "ftr": ftr,
        "fg": fg,
        "ft": ft,
        "tov_pct": tov_pct,
        "orb_pct": orb_pct,
        "ortg_box": box,
        "ortg_factors": ortg(efg, ftr, tov_pct, orb_pct, fg, ft, mu),
    }


def ortg(
    efg: float | None,
    ftr: float | None,
    tov_pct: float | None,
    orb_pct: float | None,
    fg: float | None,
    ft: float | None,
    mu: float,
) -> float | None:
    """Eq. (11) times 100; None when any input is unknown or FT% is 0."""
    if None in (efg, ftr, tov_pct, orb_pct, fg, ft) or not ft:
        return None
    assert efg is not None and ftr is not None and tov_pct is not None
    assert orb_pct is not None and fg is not None
    den = 1 - orb_pct * (1 - fg) + mu * ftr / ft
    return 100 * (1 - tov_pct) * (ftr + 2 * efg) / den


def marginals(inputs: Mapping[str, float], mu: float, step: float = 0.01) -> dict[str, float]:
    """Change in Eq. (11) ORTG for +1 percentage point of one input, the others fixed.

    eFG% up 1 point raises FG% by the same amount (made twos); TOV% is lowered (a gain).
    """
    base = ortg(mu=mu, **{k: inputs[k] for k in ("efg", "ftr", "tov_pct", "orb_pct", "fg", "ft")})
    if base is None:
        return {}
    moves = {
        "efg": {"efg": step, "fg": step},
        "tov_pct": {"tov_pct": -step},
        "orb_pct": {"orb_pct": step},
        "ftr": {"ftr": step},
        "ft": {"ft": step},
    }
    out = {}
    for name, delta in moves.items():
        moved = {
            k: inputs[k] + delta.get(k, 0.0)
            for k in ("efg", "ftr", "tov_pct", "orb_pct", "fg", "ft")
        }
        value = ortg(mu=mu, **moved)
        if value is not None:
            out[name] = value - base
    return out
