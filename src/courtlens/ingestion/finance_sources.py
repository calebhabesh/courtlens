"""Policy-v2 finance source URLs and bounded, fail-closed HTML adapters."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlsplit

from courtlens.domain.teams import NBA_TEAMS
from courtlens.ingestion.player_context import valid_season

SOURCE_KINDS = {
    "bref_contracts": "contracts",
    "spotrac_cap": "contracts",
    "spotrac_free_agents": "free_agency",
}
BREF_CODES = {"BKN": "BRK", "CHA": "CHO", "PHX": "PHO"}


def source_url(source: str, url: str, season: str) -> float:
    valid_season(season)
    if source == "bref_contracts":
        codes = {BREF_CODES.get(t.tricode, t.tricode) for t in NBA_TEAMS.values()}
        if url in {f"https://www.basketball-reference.com/contracts/{c}.html" for c in codes}:
            return 3
    if source == "spotrac_cap":
        slugs = {t.name.lower().replace(" ", "-") for t in NBA_TEAMS.values()}
        slugs.update({"los-angeles-clippers"})
        if url in {f"https://www.spotrac.com/nba/{slug}/cap/_/year/{season[:4]}" for slug in slugs}:
            return 5
    if source == "spotrac_free_agents" and url == (
        f"https://www.spotrac.com/nba/free-agents/_/year/{season[:4]}"
    ):
        return 5
    raise ValueError("finance source URL is not admitted for this kind/season")


def source_team(url: str) -> str | None:
    path = urlsplit(url).path
    for team in NBA_TEAMS.values():
        code = BREF_CODES.get(team.tricode, team.tricode)
        slug = team.name.lower().replace(" ", "-")
        if path == f"/contracts/{code}.html" or path.startswith(f"/nba/{slug}/cap/"):
            return team.team_id
        if team.tricode == "LAC" and path.startswith("/nba/los-angeles-clippers/cap/"):
            return team.team_id
    return None


PARSER_VERSION = "finance-html-v1"
MAX_HTML_BYTES = 2_000_000


@dataclass
class Node:
    tag: str
    attrs: dict[str, str]
    children: list[Node | str] = field(default_factory=list)

    def walk(self, tag: str) -> list[Node]:
        result = [self] if self.tag == tag else []
        for child in self.children:
            if isinstance(child, Node):
                result.extend(child.walk(tag))
        return result

    def text(self) -> str:
        if self.tag in {"script", "style"}:
            return ""
        return " ".join(
            " ".join(c.text() if isinstance(c, Node) else c for c in self.children).split()
        )


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("root", {})
        self.stack = [self.root]
        self.nodes = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.nodes += 1
        if self.nodes > 100_000 or len(self.stack) > 128:
            raise ValueError("HTML structure exceeds bound")
        node = Node(tag, {k: v or "" for k, v in attrs})
        self.stack[-1].children.append(node)
        if tag not in {
            "area",
            "base",
            "br",
            "col",
            "embed",
            "hr",
            "img",
            "input",
            "link",
            "meta",
            "param",
            "source",
            "track",
            "wbr",
        }:
            self.stack.append(node)

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data: str) -> None:
        self.stack[-1].children.append(data)

    def handle_comment(self, data: str) -> None:
        # Basketball-Reference also serves tables in HTML comments.
        if "<table" in data:
            nested = TableParser()
            nested.feed(data)
            self.stack[-1].children.extend(nested.root.children)


def document(raw: bytes) -> Node:
    if len(raw) > MAX_HTML_BYTES:
        raise ValueError("finance HTML exceeds byte bound")
    parser = TableParser()
    parser.feed(raw.decode("utf-8-sig"))
    return parser.root


def money(label: str) -> str | None:
    if label.strip() in {"", "-", "—", "N/A", "Unknown", "TBD"}:
        return None
    if not re.fullmatch(r"\$?(?:\d{1,3}(?:,\d{3})+|\d{1,12})(?:\.\d{1,2})?", label):
        raise ValueError(f"unsupported exact monetary label: {label[:80]}")
    return label.replace("$", "").replace(",", "")


def cells(row: Node) -> list[Node]:
    return [c for c in row.children if isinstance(c, Node) and c.tag in {"td", "th"}]


def provider_player(cell: Node, namespace: str) -> tuple[str, str | None]:
    matches = []
    for link in cell.walk("a"):
        href = link.attrs.get("href", "")
        pattern = (
            r"(?:https://www\.basketball-reference\.com)?/players/[a-z]/([a-z0-9]+)\.html"
            if namespace == "bref"
            else r"(?:https://www\.spotrac\.com)?/nba/player/(?:[^/]+/)?id/(\d+)/?"
        )
        match = re.fullmatch(pattern, href)
        if match:
            matches.append(match[1])
    if len(set(matches)) != 1:
        raise ValueError("player row lacks one stable provider identity")
    nba_id = cell.attrs.get("data-nba-id")
    if nba_id is not None and not re.fullmatch(r"\d{1,12}", nba_id):
        raise ValueError("invalid explicit NBA identity")
    return matches[0], nba_id


def parse_bref(raw: bytes, season: str, url: str) -> list[dict[str, Any]]:
    source_url("bref_contracts", url, season)
    tables = [t for t in document(raw).walk("table") if t.attrs.get("id") == "contracts"]
    if len(tables) != 1:
        raise ValueError("expected one Basketball-Reference contracts table")
    table = tables[0]
    seasons = {
        c.attrs.get("data-stat", ""): c.text()
        for head in table.walk("thead")
        for c in head.walk("th")
        if re.fullmatch(r"20\d{2}-\d{2}", c.text())
    }
    if (
        season not in seasons.values()
        or len(set(seasons.values())) != len(seasons)
        or any(not re.fullmatch(r"y[1-6]", key) for key in seasons)
    ):
        raise ValueError("contracts table does not declare requested season")
    for value in seasons.values():
        valid_season(value)
    bodies = table.walk("tbody")
    if len(bodies) != 1:
        raise ValueError("expected one contracts body")
    result = []
    seen = set()
    for index, row in enumerate(bodies[0].walk("tr")):
        columns = {c.attrs.get("data-stat"): c for c in cells(row)}
        player = columns.get("player")
        if player is None or not player.walk("a"):
            continue  # provider summary/repeated header, never a player outcome
        entity, nba_id = provider_player(player, "bref")
        if entity in seen:
            raise ValueError("duplicate contract player in team scope")
        seen.add(entity)
        common = {
            "namespace": "bref",
            "entity_id": entity,
            "nba_id": nba_id,
            "name": player.text(),
            "team_id": source_team(url),
        }
        for column, year in seasons.items():
            cell = columns.get(column)
            if cell is None:
                raise ValueError("contract row missing declared season column")
            locator = f"table#contracts/tbody/tr[{index + 1}]/{column}"
            result.append(
                {
                    **common,
                    "kind": "amount",
                    "season": year,
                    "amount_kind": "base_salary",
                    "value": money(cell.text()),
                    "locator": locator,
                    "label": cell.text() or "blank salary (unknown)",
                }
            )
            flags = set(cell.attrs.get("class", "").split()) & {"salary-pl", "salary-tm"}
            if len(flags) > 1:
                raise ValueError("contradictory contract option flags")
            if flags:
                result.append(
                    {
                        **common,
                        "kind": "option",
                        "season": year,
                        "option": "player" if "salary-pl" in flags else "team",
                        "option_state": None,
                        "locator": locator,
                        "label": (
                            f"reported {'player' if 'salary-pl' in flags else 'team'} option; "
                            "exercise state unknown"
                        ),
                    }
                )
        guaranteed = columns.get("remain_gtd")
        if guaranteed is not None:
            result.append(
                {
                    **common,
                    "kind": "amount",
                    "season": None,
                    "amount_kind": "guaranteed_value",
                    "value": money(guaranteed.text()),
                    "locator": f"table#contracts/tbody/tr[{index + 1}]/remain_gtd",
                    "label": "reported remaining guaranteed total",
                }
            )
    if not result or len(seen) > 100:
        raise ValueError("empty or over-bound contracts table")
    return result


def normalized_header(label: str) -> str:
    return re.sub(r"\s*\(\d+\)$", "", label.strip()).lower()


def team_label(label: str) -> str | None:
    aliases = {"BRK": "BKN", "CHO": "CHA", "PHO": "PHX"}
    label = aliases.get(label, label)
    if label in {"", "—", "-", "N/A"}:
        return None
    matches = [t.team_id for t in NBA_TEAMS.values() if label in {t.tricode, t.name}]
    if len(matches) != 1:
        raise ValueError("unknown provider team label")
    return matches[0]


def parse_spotrac(raw: bytes, season: str, url: str, *, free_agents: bool) -> list[dict[str, Any]]:
    source_url("spotrac_free_agents" if free_agents else "spotrac_cap", url, season)
    root = document(raw)
    titles = " ".join(n.text() for tag in ("h1", "h2") for n in root.walk(tag))
    if (str(int(season[:4])) if free_agents else season) not in titles:
        raise ValueError("Spotrac heading lacks explicit requested class/season")
    result: list[dict[str, Any]] = []
    seen = set()
    for table_index, table in enumerate(root.walk("table")):
        heads = table.walk("thead")
        if len(heads) != 1 or not heads[0].walk("tr"):
            continue
        headers = [normalized_header(c.text()) for c in cells(heads[0].walk("tr")[-1])]
        if "player" not in headers:
            continue
        if len(set(headers)) != len(headers):
            raise ValueError("duplicate Spotrac columns")
        body = table.walk("tbody")
        if len(body) != 1:
            raise ValueError("missing Spotrac table body")
        caption = " ".join(n.text() for n in table.walk("caption")).lower()
        for row_index, row in enumerate(body[0].walk("tr")):
            columns = cells(row)
            if not columns:
                continue
            if len(columns) != len(headers):
                raise ValueError("Spotrac column layout drift")
            values = dict(zip(headers, columns, strict=True))
            if not values["player"].walk("a"):
                continue
            entity, nba_id = provider_player(values["player"], "spotrac")
            key = (table_index, entity)
            if key in seen:
                raise ValueError("duplicate Spotrac identity")
            seen.add(key)
            common = {
                "namespace": "spotrac",
                "entity_id": entity,
                "nba_id": nba_id,
                "name": values["player"].text(),
                "season": season,
                "team_id": source_team(url),
                "locator": f"table[{table_index + 1}]/tbody/tr[{row_index + 1}]",
            }
            if free_agents:
                if not {"type", "prev team"} <= values.keys():
                    raise ValueError("free-agent table lacks type/previous-team columns")
                fa_type = values["type"].text().split("/")[0].strip().upper()
                if fa_type not in {"UFA", "RFA", "", "—", "-"}:
                    raise ValueError("unsupported free-agent type")
                status_label = values["status"].text().lower() if "status" in values else caption
                status = {
                    "signed": "signed",
                    "unsigned": "unsigned",
                    "available": "unsigned",
                    "returned": "returned",
                    "two-way": "two_way",
                    "pending": "unknown_review",
                }.get(status_label, "unknown_review")
                result.append(
                    {
                        **common,
                        "kind": "free_agent",
                        "free_agent_type": fa_type if fa_type in {"UFA", "RFA"} else None,
                        "previous_team_id": team_label(values["prev team"].text()),
                        "new_team_id": team_label(values["new team"].text())
                        if "new team" in values
                        else None,
                        "status": status,
                        "status_label": status_label or "not documented",
                        "average_value": money(values["aav"].text()) if "aav" in values else None,
                        "total_value": money(values["total value"].text())
                        if "total value" in values
                        else None,
                        "label": "dated Spotrac free-agent class observation",
                    }
                )
                continue
            supported = {"base salary": "base_salary", "cap hit": "cap_hit", "cash": "cash"}
            if not set(supported) & values.keys():
                raise ValueError("cap table lacks explicitly typed monetary columns")
            for header, amount_kind in supported.items():
                if header not in values:
                    continue
                if "dead cap" in caption:
                    amount_kind = "dead_money"
                    if header != "cap hit":
                        continue
                elif "cap holds" in caption:
                    amount_kind = "cap_hold"
                    if header != "cap hit":
                        continue
                result.append(
                    {
                        **common,
                        "kind": "amount",
                        "amount_kind": amount_kind,
                        "value": money(values[header].text()),
                        "label": header,
                        "locator": f"{common['locator']}/{header}",
                    }
                )
    if not result or len(result) > 5000:
        raise ValueError("empty or over-bound Spotrac table")
    return result
