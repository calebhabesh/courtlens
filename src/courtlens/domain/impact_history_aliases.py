"""Rule R01-H5: substitution names written in an older era (courtlens-impact-history-v2).

The NBA later renamed players in box scores and in play-by-play name fields (suffixes such as
"Ennis III", changes such as Kanter -> Freedom), but v3 substitution descriptions keep the name
used at the time ("SUB: Kanter FOR O'Quinn"). The pinned parser
(`possession_repair.normalize_events`) resolves those description names against the box and
row name fields, so it rejects the game. Short names can also collide with a teammate's first
name ("James" for LeBron James and James Jones).

This rule only resolves what the game itself attests:

- An outgoing name belongs to the substitution row's own `personId` (v3's definition of the
  row), unless the same text is attested for a different teammate.
- An incoming name belongs to the single teammate for whom the game attests that exact text:
  as the outgoing name of one of their own substitution rows, or as the leading name of one of
  their own action rows ("Kanter REBOUND ...", "MISS Kanter 3' Layup"). Only when the game
  attests the text for nobody, the single teammate whose box family name minus a generational
  suffix (Jr., Sr., II, III, IV) equals it ("Bullock" for "Bullock Jr.").

When a name resolves, the description text is replaced by one of that player's box names the
pinned parser resolves uniquely (name_i, then family name, then first name). Nothing else in
the row changes. Every rewrite is returned with the original text and evidence rows, so it can
be recorded as an override; a name that does not resolve is left as it is and the pinned parser
excludes the game as before.
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from courtlens.ingestion.native_reconstruction import name_key

RULE_ID = "R01-H5"
VERSION = "courtlens-history-name-alias-v1"
_SUB = re.compile(r"SUB: (.+) FOR (.+)")
_SUFFIX = re.compile(r"\s+(jr\.?|sr\.?|ii|iii|iv)$", re.IGNORECASE)


def _name_map(
    rows: list[dict[str, str]], boxes: list[dict[str, str]]
) -> dict[str, dict[str, set[str]]]:
    """The pinned parser's name lookup, rebuilt exactly (box names, then same-team row names)."""
    roster = {b["person_id"]: b["team_id"] for b in boxes}
    names: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for b in boxes:
        for key in ("first_name", "family_name", "name_i"):
            if b.get(key):
                names[b["team_id"]][name_key(b[key])].add(b["person_id"])
    for row in rows:
        pid, team = row.get("personId", ""), row.get("teamId", "")
        if roster.get(pid) == team:
            for key in ("playerName", "playerNameI"):
                if row.get(key):
                    names[team][name_key(row[key])].add(pid)
    return names


def _attested(rows: list[dict[str, str]], roster: dict[str, str]) -> dict[tuple[str, str], Any]:
    """(team, name text) -> {player id: evidence row indexes} from the game's own rows."""
    evidence: dict[tuple[str, str], dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
    for index, row in enumerate(rows):
        pid, team = row.get("personId", ""), row.get("teamId", "")
        if roster.get(pid) != team:
            continue
        description = row.get("description", "")
        match = _SUB.fullmatch(description)
        if row.get("actionType", "").lower().replace(" ", "") == "substitution":
            if match:
                evidence[team, match[2].strip()][pid].append(index)
            continue
        text = description.removeprefix("MISS ")
        words = text.split(" ")
        # Leading names are one to three words; record each prefix as attested text.
        for size in range(1, min(3, len(words) - 1) + 1):
            evidence[team, " ".join(words[:size])][pid].append(index)
    return evidence


def resolve_aliases(
    rows: list[dict[str, str]], boxes: list[dict[str, str]]
) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    """Rows with era names resolved (copies only where changed) and the override records."""
    roster = {b["person_id"]: b["team_id"] for b in boxes}
    names = _name_map(rows, boxes)
    attested = _attested(rows, roster)
    by_player = {b["person_id"]: b for b in boxes}

    def unique(team: str, text: str) -> str | None:
        ids = names[team].get(name_key(text), set())
        return next(iter(ids)) if len(ids) == 1 else None

    def replacement(team: str, pid: str) -> str | None:
        box = by_player[pid]
        for key in ("name_i", "family_name", "first_name"):
            if box.get(key) and unique(team, box[key]) == pid:
                return box[key]
        return None

    output: list[dict[str, str]] = []
    overrides: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        pid, team = row.get("personId", ""), row.get("teamId", "")
        match = _SUB.fullmatch(row.get("description", ""))
        if (
            row.get("actionType", "").lower().replace(" ", "") != "substitution"
            or match is None
            or roster.get(pid) != team
        ):
            output.append(row)
            continue
        incoming, outgoing = match[1], match[2]
        changed = {}
        if unique(team, outgoing) != pid:
            others = set(attested.get((team, outgoing.strip()), {})) - {pid}
            text = replacement(team, pid)
            if not others and text is not None:
                changed["outgoing"] = (outgoing, text, pid, [index])
        if unique(team, incoming) is None:
            candidates = attested.get((team, incoming.strip()), {})
            if not candidates:
                candidates = {
                    b["person_id"]: []
                    for b in boxes
                    if b["team_id"] == team
                    and b.get("family_name")
                    and _SUFFIX.search(b["family_name"])
                    and name_key(_SUFFIX.sub("", b["family_name"])) == name_key(incoming)
                }
            if len(candidates) == 1:
                ((player, evidence),) = candidates.items()
                text = replacement(team, player)
                if player != pid and text is not None:
                    changed["incoming"] = (incoming, text, player, sorted(evidence))
        if not changed:
            output.append(row)
            continue
        new_in = changed.get("incoming", (incoming, incoming))[1]
        new_out = changed.get("outgoing", (outgoing, outgoing))[1]
        output.append({**row, "description": f"SUB: {new_in} FOR {new_out}"})
        for side, (original, text, player, evidence) in sorted(changed.items()):
            overrides.append(
                {
                    "rule_id": RULE_ID,
                    "version": VERSION,
                    "row_index": int(row.get("_row_index", index)),
                    "action_number": int(row["actionNumber"]),
                    "period": int(row["period"]),
                    "team_id": team,
                    "side": side,
                    "player_id": player,
                    "original_text": original,
                    "replacement_text": text,
                    "evidence_row_indexes": [int(rows[i].get("_row_index", i)) for i in evidence],
                }
            )
    return output, overrides
