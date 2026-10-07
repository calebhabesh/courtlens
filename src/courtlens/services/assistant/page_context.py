"""Resolve UI referents on the server; page selections confer no evidence authority."""

import re

from sqlalchemy.orm import Session

from courtlens.domain.conversation import OperationStep
from courtlens.domain.hybrid_assistant import AssistantPageContext
from courtlens.domain.teams import get_team_info
from courtlens.services.assistant.defaults import ScopeClarification
from courtlens.services.assistant.operations import resolve_entity
from courtlens.services.workbench_analytics import ResolvedContext

PLAYER_REFERENCE = re.compile(r"\b(?:his|him|he|this player|that player)\b", re.I)
PAIR_REFERENCE = re.compile(r"\b(?:these players|both players)\b", re.I)
TEAM_REFERENCE = re.compile(r"\b(?:this team|that team)\b", re.I)


def resolve_page_message(
    session: Session, context: ResolvedContext, message: str, page: AssistantPageContext | None
) -> tuple[str, dict[str, str]]:
    if page is None:
        return message, {}
    bindings: dict[str, str] = {}
    if PLAYER_REFERENCE.search(message):
        if len(page.player_ids) != 1:
            raise ScopeClarification("Which player on this page do you mean?")
        pid = resolve_entity(session, context, page.player_ids[0], "player_id")
        bindings["player_id"] = pid
        message = PLAYER_REFERENCE.sub(f"player {pid}", message)
    if PAIR_REFERENCE.search(message):
        if len(page.player_ids) != 2:
            raise ScopeClarification("Which two players on this page should I compare?")
        for field, pid in zip(("player_a", "player_b"), page.player_ids, strict=True):
            bindings[field] = resolve_entity(session, context, pid, field)
        message = PAIR_REFERENCE.sub(
            f"players {bindings['player_a']} and {bindings['player_b']}", message
        )
    if TEAM_REFERENCE.search(message):
        if len(page.team_ids) != 1:
            raise ScopeClarification("Which team do you mean? Name it explicitly.")
        tid = page.team_ids[0]
        if get_team_info(tid) is None:
            raise ValueError("unknown canonical NBA team identity")
        bindings["team_id"] = tid
        message = TEAM_REFERENCE.sub(f"team {tid}", message)
    return message, bindings


def bind_page_step(step: OperationStep, bindings: dict[str, str]) -> OperationStep:
    """Enforce the singular referent for operations that select a single entity."""
    args = dict(step.arguments)
    for key in ("player_id", "target_player_id", "team_id", "player_a", "player_b"):
        target = bindings.get(key if key in ("team_id", "player_a", "player_b") else "player_id")
        if not target or key not in args:
            continue
        value = str(args[key])
        pattern = TEAM_REFERENCE if key == "team_id" else PLAYER_REFERENCE
        if pattern.fullmatch(value):
            args[key] = target
        elif value != target:
            raise ValueError("planner changed the server-resolved page referent")
    if step.operation == "query":
        if "team_id" in bindings:
            team_scope = args.get("team_scope") or {}
            if team_scope.get("team_id") != bindings["team_id"]:
                raise ValueError("query omitted or changed the server-resolved page team")
        if "player_id" in bindings:

            def selects_player(predicate: object) -> bool:
                if not isinstance(predicate, dict):
                    return False
                if "predicates" in predicate:
                    return predicate.get("conjunction", "and") == "and" and any(
                        selects_player(child) for child in predicate["predicates"]
                    )
                return (
                    predicate.get("field") == "player_id"
                    and predicate.get("op") == "eq"
                    and str(predicate.get("value")) == bindings["player_id"]
                )

            if not selects_player(args.get("predicates")):
                raise ValueError("query omitted or changed the server-resolved page player")
    return step.model_copy(update={"arguments": args})
