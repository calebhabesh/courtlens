"Build the local G2 review from retained captures and explicit glance judgments."

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ITEMS = [
    "Header",
    "Filters",
    "First screen",
    "Alignment",
    "Identity",
    "Missing data",
    "Icons",
    "States",
    "Phone",
    "Dates",
    "First load",
    "Labeled visual",
    "Color meaning",
    "Sample + source",
]
PAGES = [
    ("Compare", "/compare", "compare", "compare"),
    ("Player Matchups", "/matchups", "matchups", "matchups"),
    ("WOWY", "/wowy", "wowy", "wowy"),
    ("Teammate Stat Shift", "/stat-line-shift", "stat-shift", "stat-line-shift"),
    (
        "Shot Profile",
        "/similar-players/shot-profile",
        "shot-profile",
        "similar-players_shot-profile",
    ),
    (
        "Shot Aftermath",
        "/research/shooting/aftermath",
        "shot-aftermath",
        "research_shooting_aftermath",
    ),
    ("Similar Players", "/similar-players", "similar-players", "similar-players"),
    ("Recent Games", "/last-games", "recent-games", "last-games"),
    ("Research Operation", "/research/operation", "operation-gallery", "research_operation"),
    ("Live", "/live", "live", "live"),
    ("Contracts", "/contracts", "contracts", "contracts"),
    ("Free Agency", "/free-agency", "free-agency", "free-agency"),
]
measurements = json.loads((HERE / "measurements.json").read_text())["rows"]
rows = []
for title, route, after, before in PAGES:
    statuses = dict.fromkeys(ITEMS, "P")
    statuses.update({"Alignment": "~", "States": "?", "Phone": "~"})
    note = (
        "Real season-minutes example and source/GP context. Remaining page"
        " geometry and touch targets are not fully re-audited."
    )
    if route == "/compare":
        statuses.update(
            {
                "Alignment": "P",
                "Identity": "-",
                "States": "?",
                "Phone": "P",
                "Labeled visual": "-",
                "Color meaning": "-",
            }
        )
        note = (
            "C5 exception: two silhouettes and an observed suggested matchup. "
            "Position leaders waits for PC05. Selected comparison has A/B "
            "chips, per-field n, source/GP and a centered table; its "
            "screenshots are additional interaction evidence."
        )
    if route in [
        "/matchups",
        "/wowy",
        "/stat-line-shift",
        "/similar-players/shot-profile",
        "/research/shooting/aftermath",
    ]:
        statuses.update(
            {"First screen": "~", "Missing data": "F", "Labeled visual": "~", "Color meaning": "~"}
        )
        note += (
            " Headline box-score context starts within 400px; the requested "
            "PBP/shot/assignment result has no admitted exposure in this scope"
            " and remains below it. Technical coverage codes and repeated "
            "missing-data details are retained issues for PC07/PC11/PC12."
        )
        if route in ["/matchups", "/wowy"]:
            statuses["States"] = "P"
    if route == "/similar-players":
        statuses.update({"Color meaning": "F", "First screen": "~"})
        note += (
            " Existing standardized-profile red/green z-scores still need PC12"
            " presentation work; the main similarity result follows the new "
            "context card."
        )
    if route == "/last-games":
        statuses["Color meaning"] = "~"
        note += (
            " Existing trajectory uses its own labeled metric colors; full "
            "v1.2 conversion is not claimed."
        )
    if route == "/research/operation":
        statuses.update(
            {
                "Filters": "-",
                "Alignment": "~",
                "Identity": "-",
                "States": "-",
                "Phone": "P",
                "Dates": "-",
                "Labeled visual": "-",
                "Color meaning": "-",
                "Sample + source": "-",
            }
        )
        note = (
            "Eight labeled operation links; static menu with no analytical "
            "result or conversation request. No subject, date filter, chart, "
            "data sample or asynchronous state applies to this menu."
        )
    if route == "/live":
        statuses.update({"States": "~", "Labeled visual": "~", "Color meaning": "~"})
        note = (
            "Parameter-free unavailable Live landing resolves the last "
            "admitted finals day, scores, observed points leaders and next "
            "retained schedule date. Explicit dated routes remain exact. Full "
            "loading geometry and presentation of the score board remain "
            "outside this default integration audit."
        )
    if route in ["/contracts", "/free-agency"]:
        statuses.update(
            {
                "Filters": "~",
                "First screen": "F",
                "Alignment": "?",
                "Identity": "-",
                "Missing data": "~",
                "States": "?",
                "Phone": "~",
                "First load": "F",
                "Labeled visual": "F",
                "Color meaning": "-",
                "Sample + source": "F",
            }
        )
        note = (
            "Still opens on book/date selection. The PC04 handoff explicitly "
            "defers financial defaults until admitted finance books land in "
            "PC06. Captured as a dependency, not a pass."
        )
    score = sum(value == "P" for value in statuses.values())
    applicable = sum(value != "-" for value in statuses.values())
    positions = {
        str(width): next(
            row["resultY"] for row in measurements if row["path"] == route and row["width"] == width
        )
        for width in [1440, 390]
    }
    rows.append(
        {
            "title": title,
            "route": route,
            "after": after,
            "before": before,
            "glance": statuses,
            "score": f"{score}/{applicable}",
            "note": note,
            "resultY": positions,
        }
    )
(HERE / "glance.json").write_text(
    json.dumps(
        {
            "legend": {
                "P": "pass",
                "~": "partial / retained issue",
                "F": "fail",
                "?": "not measured",
                "-": "not applicable",
            },
            "scope": (
                "Conservative full-page review. New default context is not proof "
                "of a populated PBP operation. A score is passes / applicable "
                "items; partial and unmeasured items are not passes."
            ),
            "rows": rows,
        },
        indent=2,
    )
    + "\n"
)
md = [
    "# PC04 extended glance test",
    "",
    (
        "Production screenshots enter without parameters at 1440x900 and "
        "390x844. Scores are conservative full-page judgments, not a claim"
        " that every page is fully polished. **PC04 stays "
        "`implemented_unverified`: G2 approval and remaining full-page "
        "glance work are pending.**"
    ),
    "",
    (
        "P = pass; ~ = partial/retained issue; F = fail; ? = not measured;"
        " - = not applicable. Scores count only P, divided by applicable "
        "items. Items 1-10 are the overhaul test, 11-14 are the clarity "
        "additions."
    ),
    "",
    "| Route | Score | " + " | ".join(str(i) for i in range(1, 15)) + " |",
    "| --- | --- | " + " | ".join("---" for _ in ITEMS) + " |",
]
for row in rows:
    md.append(
        "| `"
        + row["route"]
        + "` | "
        + row["score"]
        + " | "
        + " | ".join(row["glance"].values())
        + " |"
    )
md += [
    "",
    "Item order: " + ", ".join(f"{i + 1} {item}" for i, item in enumerate(ITEMS)) + ".",
    "",
    (
        "The default-context top is measured in `measurements.json`; it is"
        " not the top of an unavailable operation result. Compare "
        "intentionally starts on C5 placeholders. Its selected screenshots"
        " come from the one-click suggestion."
    ),
    "",
    (
        "New geometry/state probes (`interaction-measurements.json`): 16px"
        " card padding and grid gap; A/B token fills; centered Compare "
        "metric column (0px error), right-aligned tabular numbers; 40px "
        "Change targets; keyboard preset selection and focus transfer. "
        "Loading/ready WOWY cards and failed default lookup are captured "
        "separately against clearly labeled UI fixtures. These probes do "
        "not certify every legacy control, loading state or alignment on "
        "each entire page."
    ),
    "",
]
for row in rows:
    md += [f"## {row['title']}", "", row["note"], ""]
(HERE / "glance.md").write_text("\n".join(md))
DATA = json.dumps(rows).replace("</", "<\\/")
html = (HERE / "review-template.html").read_text()
(HERE / "review.html").write_text(
    html.replace("__DATA__", DATA).replace("__ITEMS__", json.dumps(ITEMS))
)
