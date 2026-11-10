"""CraftedNBA's "Height and Wingspan for every player in the NBA" page.

craftednba.com/player-traits/length, free under source policy v3. The page credits no measurement
source and doesn't say whether heights are with or without shoes; CourtLens labels every value from
it "reported (CraftedNBA)" and never mixes it into combine percentiles, averages or the frozen R10
correlations.
"""

from __future__ import annotations

import html
import re
from typing import Any

URL = "https://craftednba.com/player-traits/length"
HOST = "craftednba.com"
ATTRIBUTION = "CraftedNBA, Height and Wingspan for every player in the NBA"

_ROW = re.compile(
    r'<tr[^>]*><td class="the-rank[^"]*"[^>]*><strong[^>]*>(\d+)</strong></td>'
    r'<td class="the-name[^"]*"[^>]*><a href="/players/([^"]+)"[^>]*>([^<]+)</a>'
    r"<span[^>]*>([^<]*)</span></td><td[^>]*>([^<]*)</td><td[^>]*>([^<]*)</td><td[^>]*>([^<]*)</td></tr>"
)
_FEET_INCHES = re.compile(r"^(\d)'(\d{1,2}(?:\.\d+)?)\"$")


def feet_inches(text: str) -> float | None:
    """`7'4"` or `6'11.25"` in inches; anything else is unknown."""
    match = _FEET_INCHES.fullmatch(html.unescape(text).strip())
    if match is None:
        return None
    inches = float(match[2])
    if inches >= 12:
        return None
    return int(match[1]) * 12 + inches


def parse_length_page(body: bytes) -> list[dict[str, Any]]:
    """One row per listed player in the page's order; unparseable lengths stay unknown."""
    text = body.decode("utf-8")
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for match in _ROW.finditer(text):
        rank, slug, name, team_position, height_text, wingspan_text, length_text = match.groups()
        if slug in seen:
            raise ValueError(f"duplicate CraftedNBA player {slug}")
        seen.add(slug)
        team, _, position = (part.strip() for part in html.unescape(team_position).partition("|"))
        height, wingspan = feet_inches(height_text), feet_inches(wingspan_text)
        try:
            length: float | None = float(html.unescape(length_text).strip())
        except ValueError:
            length = None
        # The page's Length column is its own rounding of wingspan minus height (8.5 shows as 9);
        # CourtLens computes the difference itself and keeps the page's figure only as a check.
        rows.append(
            {
                "rank": int(rank),
                "slug": slug,
                "name": html.unescape(name).strip(),
                "team": team or None,
                "position": position or None,
                "height": height,
                "wingspan": wingspan,
                "listed_length": length,
            }
        )
    listed = text.count('<td class="the-rank')
    if len(rows) != listed:
        raise ValueError(
            f"CraftedNBA length page: read {len(rows)} of {listed} rows; layout changed?"
        )
    if len(rows) < 100:
        raise ValueError("CraftedNBA length page has too few rows; layout changed?")
    return rows
