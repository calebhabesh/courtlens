"""Deterministic fallback planner for common question shapes when the language planner fails.

It emits the same registered operations a provider plan would, and those plans pass the same
server validation. It plans only unambiguous leaderboards, single-player stats, two-player
comparisons, team summaries, forecasts and simple follow-ups. Anything else returns None, so
the caller reports the provider failure rather than guessing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.domain.conversation import AnalysisPlan, OperationStep
from courtlens.domain.entity_lookup import normalize_lookup_text
from courtlens.domain.teams import NBA_TEAMS
from courtlens.workbench_models import WorkbenchIdentity, WorkbenchPlayerGame

RULE_PLANNER_VERSION = "courtload-rule-planner-v1"
RULE_NOTE = "Planned by CourtLens rules because the AI planner was unavailable."

# Specific phrases precede generic ones ("offensive rebounds" before "rebounds").
_METRICS: tuple[tuple[str, str], ...] = (
    (r"\btotal points\b|\bpoints total\b|\bmost points\b(?! per)", "pts"),
    (r"\btotal assists\b", "ast"),
    (r"\btotal rebounds\b", "reb"),
    (r"\btotal steals\b", "stl"),
    (r"\btotal blocks\b", "blk"),
    (r"\btotal minutes\b", "min"),
    (r"\bgames played\b|\bmost games\b", "gp"),
    (r"\bpoints per 36\b", "pts_per_36"),
    (r"\brebounds per 36\b", "reb_per_36"),
    (r"\bassists per 36\b", "ast_per_36"),
    (r"\btrue shooting\b|\bts ?%|\bts pct\b", "ts_pct"),
    (r"\beffective field goal\b|\befg\b", "efg_pct"),
    (
        r"\bthree[- ]point (?:percentage|pct|shooting)\b|\b3 ?pt? ?%|\b3p ?pct\b",
        "fg3_pct",
    ),
    (r"\bfree[- ]throw (?:percentage|pct)\b|\bft ?%", "ft_pct"),
    (r"\bfield[- ]goal (?:percentage|pct)\b|\bfg ?%", "fg_pct"),
    (r"\bthrees\b|\bthree[- ]pointers?\b|\b3s\b|\b3pm\b|\bthrees made\b", "fg3m"),
    (r"\boffensive rebounds?\b|\boreb\b", "oreb_per_game"),
    (r"\bdefensive rebounds?\b|\bdreb\b", "dreb_per_game"),
    (r"\bturnovers?\b|\btov\b", "tov_per_game"),
    (r"\bfouls?\b", "pf_per_game"),
    (r"\bsteals?\b|\bspg\b", "stl_per_game"),
    (r"\bblocks?\b|\bbpg\b|\bshot[- ]blockers?\b", "blk_per_game"),
    (r"\bminutes\b|\bmpg\b", "min_per_game"),
    (r"\bassists?\b|\bapg\b|\bplaymakers?\b|\bpassers?\b", "ast_per_game"),
    (r"\brebounds?\b|\brebounding\b|\brebounders?\b|\brpg\b|\bboards\b", "reb_per_game"),
    (r"\bpoints\b|\bppg\b|\bscoring\b|\bscorers?\b", "pts_per_game"),
)
# Rate rankings need volume, or a 1-for-1 shooter leads. Labelled where applied.
_VOLUME: dict[str, tuple[str, int, str]] = {
    "fg3_pct": ("fg3a", 100, "three-point attempts"),
    "ft_pct": ("fta", 100, "free-throw attempts"),
    "fg_pct": ("fga", 300, "field-goal attempts"),
    "efg_pct": ("fga", 300, "field-goal attempts"),
    "ts_pct": ("fga", 300, "field-goal attempts"),
}
_POSITIONS: tuple[tuple[str, str], ...] = (
    (r"\b(?:point|shooting|combo) guards?\b|\b(?:pg|sg)s?\b|\bguards?\b", "guard"),
    (r"\b(?:small|power) forwards?\b|\b(?:sf|pf)s?\b|\bwings?\b|\bforwards?\b", "forward"),
    (r"\bcent(?:er|re)s?\b|\bbig ?men\b|\bbigs\b", "center"),
)
# Meanings the planner contract requires a clarification for.
_CLARIFY: tuple[tuple[str, str], ...] = (
    (r"\b(best|better|top|great) (?:\w+ )?defen(?:ders?|sive players?)\b", "defense_metric"),
    (r"\bmost consistent\b|\bconsistency\b", "consistency"),
    (r"\bwithout\b|\bon[- ]court\b|\bon/off\b|\bwith or without\b", "floor_or_game"),
)
# Outputs CourtLens never produces (zero inferred claims), whatever the planner.
_PROHIBITED = re.compile(
    r"\b(win(?:ner|ning)? (?:probability|odds|chances?)|probability (?:of|that)|"
    r"start(?: or |/)sit|who will win|betting|spread pick|"
    # Requests to run code, SQL or tools are refused, never reinterpreted as a query.
    r"execute|run (?:a |the |this |some )?(?:code|python|sql|script|query)|python|javascript|"
    r"sql|shell|script|api key|credentials?|password|refresh|download|scrape|internet|web)\b"
)
# Other meanings the rules cannot resolve; the provider failure is reported instead.
_AMBIGUOUS = re.compile(
    r"\b(defen[cs]e|defensive(?! rebound)|defenders?|consistent|consistency|without|"
    r"on[- ]court|on/off|together|clutch|best player|better player|greatest|underrated|"
    r"overrated|should|will|predict|prediction|probability|odds|why|injur(?:y|ies|ed)|"
    r"trades?|traded|salary|salaries|contracts?|mvps?|awards?|champion\w*|titles?|rings?|"
    r"all[- ]stars?|all[- ]nba|rookie of the year)\b"
)
# Common English words that are also unique NBA surnames; never treat them as a player.
_SURNAME_STOPWORDS = frozenset(
    [
        "young",
        "green",
        "brown",
        "white",
        "black",
        "smart",
        "love",
        "rose",
        "hill",
        "house",
        "king",
        "little",
        "wright",
        "holiday",
        "price",
        "banks",
        "early",
        "strong",
        "cash",
        "best",
        "hunter",
        "porter",
        "walker",
        "george",
        "james",
        "paul",
        "wall",
        "bell",
        "mills",
        "ball",
        "hood",
        "castle",
        "wells",
        "ford",
        "bridges",
        "jackson",
        "johnson",
        "williams",
        "thompson",
        "harris",
        "allen",
        "davis",
        "martin",
        "murray",
        "holmes",
        "jones",
        "miller",
        "lee",
        "wood",
        "morris",
        "brooks",
        "cook",
        "reed",
        "powell",
        "grant",
        "gay",
        "case",
        "sharpe",
        "hart",
        "duke",
        "jerome",
        "butler",
        "carter",
        "collins",
        # Basketball vocabulary that could collide with a surname.
        "player",
        "guard",
        "center",
        "forward",
        "points",
        "games",
        "season",
        "leader",
        "scorer",
        "shooter",
        "rookie",
    ]
)


@dataclass(frozen=True)
class RulePlan:
    plan: AnalysisPlan
    notes: list[str] = field(default_factory=list)


@lru_cache(maxsize=4)
def _player_index(
    names: tuple[str, ...],
) -> tuple[dict[str, str], dict[str, str], frozenset[str]]:
    full: dict[str, str] = {}
    surnames: dict[str, list[str]] = {}
    for name in names:
        key = normalize_lookup_text(name)
        if len(key.split()) < 2:
            continue
        full.setdefault(key, name)
        stripped = re.sub(r"\s+(jr|sr|ii|iii|iv)$", "", key)
        full.setdefault(stripped, name)
        surnames.setdefault(stripped.split()[-1], []).append(name)
    unique = {
        last: names_[0]
        for last, names_ in surnames.items()
        if len(set(names_)) == 1 and len(last) >= 5 and last not in _SURNAME_STOPWORDS
    }
    shared = frozenset(
        last
        for last, names_ in surnames.items()
        if len(set(names_)) > 1 and len(last) >= 4 and last not in _SURNAME_STOPWORDS
    )
    return full, unique, shared


def _players(session: Session, text: str, dataset_id: str | None) -> tuple[list[str], bool]:
    """Named players in message order, and whether a bare surname matched several players.

    Only players observed in the release are candidates, so unrelated identities never match.
    """
    query = select(WorkbenchIdentity.display_name).where(
        WorkbenchIdentity.namespace == "nba", WorkbenchIdentity.kind == "player"
    )
    if dataset_id:
        query = query.where(
            WorkbenchIdentity.external_id.in_(
                select(WorkbenchPlayerGame.player_id)
                .where(WorkbenchPlayerGame.dataset_id == dataset_id)
                .distinct()
            )
        )
    names = tuple(sorted(session.scalars(query.limit(10001))))
    full, unique, shared = _player_index(names)
    found: list[tuple[int, str]] = []
    remaining = f" {text} "
    for key in sorted(full, key=len, reverse=True):
        position = remaining.find(f" {key} ")
        if position >= 0 and full[key] not in [name for _, name in found]:
            found.append((position, full[key]))
            remaining = remaining.replace(f" {key} ", " " + "#" * len(key) + " ", 1)
    ambiguous = False
    for token in set(remaining.split()):
        token = token if token in unique or token in shared else re.sub(r"s$", "", token)
        if token in unique and unique[token] not in [name for _, name in found]:
            found.append((remaining.find(f" {token}"), unique[token]))
        ambiguous = ambiguous or token in shared
    return [name for _, name in sorted(found)], ambiguous


def _team(text: str) -> str | None:
    matches = set()
    for team in NBA_TEAMS.values():
        nickname = normalize_lookup_text(team.name.removeprefix(team.city).strip())
        if re.search(rf"\b{re.escape(normalize_lookup_text(team.name))}\b", text) or (
            nickname and re.search(rf"\b{re.escape(nickname)}\b", text)
        ):
            matches.add(team.team_id)
    return matches.pop() if len(matches) == 1 else None


def _metric(text: str) -> str | None:
    for pattern, key in _METRICS:
        if re.search(pattern, text):
            return key
    return None


def _query(metric: str, limit: int, direction: str, **extra: Any) -> dict[str, Any]:
    query: dict[str, Any] = {
        "metric_selectors": [{"key": metric}],
        "sort": [{"field": metric, "direction": direction}],
        "page": {"limit": limit},
    }
    query.update(extra)
    return query


def _clarify(kind: str) -> AnalysisPlan:
    return AnalysisPlan.model_validate({"status": "clarification_required", "clarification": kind})


def _plan(operation: str, arguments: dict[str, Any], kind: str = "table") -> AnalysisPlan:
    return AnalysisPlan(
        steps=[OperationStep(step_id="rule", operation=operation, arguments=arguments)],
        output_kind=kind,
    )


def rule_plan(
    session: Session,
    message: str,
    previous_plan: AnalysisPlan | None = None,
    page_bindings: dict[str, str] | None = None,
    dataset_id: str | None = None,
) -> RulePlan | None:
    text = normalize_lookup_text(re.sub(r"^\s*now\b[,:]?\s*", "", message.lower()))
    raw = message.lower()
    notes = [RULE_NOTE]
    # Ask the same question the planner contract requires, rather than guessing a meaning.
    for pattern, clarification in _CLARIFY:
        if re.search(pattern, raw):
            return RulePlan(_clarify(clarification), notes)
    if _PROHIBITED.search(raw):
        return RulePlan(
            AnalysisPlan.model_validate({"status": "unsupported", "clarification": "capability"}),
            notes,
        )
    if _AMBIGUOUS.search(raw):
        return None
    metric = _metric(raw)
    position = next((pos for pattern, pos in _POSITIONS if re.search(pattern, raw)), None)
    top = re.search(r"\b(?:top|best|first)\s+(\d{1,3})\b|\b(\d{1,3})\s+(?:players|leaders)\b", raw)
    limit = min(100, int(top.group(1) or top.group(2))) if top else 10
    direction = "asc" if re.search(r"\b(fewest|lowest|least|worst)\b", raw) else "desc"
    players, ambiguous = _players(session, text, dataset_id)
    if ambiguous and not players:
        return RulePlan(_clarify("identity"), notes)
    bindings = page_bindings or {}
    by_id = False
    if not players and "player_a" in bindings and "player_b" in bindings:
        players, by_id = [bindings["player_a"], bindings["player_b"]], True
    elif not players and "player_id" in bindings:
        players, by_id = [bindings["player_id"]], True
    team = bindings.get("team_id") or _team(text)

    if len(players) > 2:
        return None
    if re.search(r"\b(forecast|projection|projected)\b", raw):
        if len(players) != 1:
            return None
        return RulePlan(_plan("forecast", {"player_id": players[0]}), notes)
    if len(players) == 2:
        if position or team:
            return None
        return RulePlan(
            _plan("compare", {"player_a": players[0], "player_b": players[1]}, "comparison"),
            notes,
        )
    if len(players) == 1:
        if metric is None:
            return RulePlan(_plan("profile", {"player_id": players[0]}), notes)
        selected = {"field": "player_id", "op": "eq", "value": players[0]}
        selection: dict[str, Any] = (
            {"predicates": {"predicates": [selected]}} if by_id else {"name": players[0]}
        )
        query = _query(metric, 10, "desc", **selection)
        return RulePlan(_plan("query", query), notes)

    leader = re.search(
        r"\b(top|leaders?|led|leads?|leading|most|highest|best|rank(?:ed|ing|s)?|fewest|"
        r"lowest|least|who (?:had|has|averaged|averages)|show)\b",
        raw,
    )
    if team and metric is None and not position:
        if re.search(r"\b(record|wins|losses|team|how (?:did|are|is)|summary|stats)\b", raw):
            return RulePlan(_plan("team", {"team_id": team}), notes)
        return None
    if metric is None:
        # A follow-up may only change the count, position or direction of a prior ranking.
        return _follow_up(previous_plan, top, limit, position, notes) if top or position else None
    if not leader and previous_plan is None:
        return None
    extra: dict[str, Any] = {}
    if team:
        extra["team_scope"] = {"team_id": team}
    if metric in _VOLUME:
        field, minimum, label = _VOLUME[metric]
        extra["predicates"] = {"predicates": [{"field": field, "op": "gte", "value": minimum}]}
        notes.append(f"Percentage rankings include players with at least {minimum} {label}.")
    elif direction == "asc":
        extra["sample_filters"] = {"min_games": 20, "min_avg_minutes": 20}
        notes.append(
            "Lowest-value rankings include players with at least 20 games and 20 minutes a game."
        )
    query = _query(metric, limit, direction, **extra)
    if position:
        return RulePlan(_plan("position_query", {"position": position, "query": query}), notes)
    return RulePlan(_plan("query", query), notes)


def _follow_up(
    previous: AnalysisPlan | None,
    top: re.Match[str] | None,
    limit: int,
    position: str | None,
    notes: list[str],
) -> RulePlan | None:
    if previous is None or len(previous.steps) != 1:
        return None
    step = previous.steps[0]
    if step.operation == "query":
        query = dict(step.arguments)
    elif step.operation == "position_query":
        query = dict(step.arguments["query"])
        position = position or step.arguments["position"]
    else:
        return None
    if top:
        query["page"] = {**(query.get("page") or {}), "limit": limit}
    if position:
        return RulePlan(_plan("position_query", {"position": position, "query": query}), notes)
    return RulePlan(_plan("query", query), notes)
