"""Explicit acquisition / offline integrity check for the bounded NBA branding bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.request import urlopen
from xml.etree import ElementTree

from courtlens.domain.teams import NBA_TEAMS

CATALOG = Path("dashboard/lib/team-branding.json")
PUBLIC = Path("dashboard/public")
MAX_BYTES = 512_000


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--acquire", action="store_true", help="Download official assets explicitly"
    )
    args = parser.parse_args()
    if args.acquire:
        records = []
        for team in NBA_TEAMS.values():
            source = f"https://cdn.nba.com/logos/nba/{team.team_id}/primary/L/logo.svg"
            with urlopen(source, timeout=30) as response:
                data = response.read(MAX_BYTES + 1)
                assert len(data) <= MAX_BYTES, source
                assert response.headers.get_content_type() == "image/svg+xml", source
                modified = response.headers.get("Last-Modified")
            root = ElementTree.fromstring(data)
            assert root.tag == "{http://www.w3.org/2000/svg}svg", source
            # Assets served as images only. Reject active content and external references.
            for node in root.iter():
                assert node.tag.rsplit("}", 1)[-1] not in {"script", "foreignObject"}
                for key, value in node.attrib.items():
                    assert not key.lower().startswith("on")
                    if key.rsplit("}", 1)[-1] == "href":
                        assert value.startswith("#"), (source, value)
            digest = hashlib.sha256(data).hexdigest()
            asset = f"/team-logos/{team.team_id}-{digest[:16]}.svg"
            path = PUBLIC / asset.lstrip("/")
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.exists():
                assert path.read_bytes() == data
            else:
                path.write_bytes(data)
            records.append(
                {
                    "team_id": team.team_id,
                    "tricode": team.tricode,
                    "artwork_name": team.name,
                    "asset": asset,
                    "sha256": digest,
                    "bytes": len(data),
                    "source_url": source,
                    "source_page": "https://www.nba.com/teams",
                    "last_modified": modified,
                }
            )
        CATALOG.write_text(
            json.dumps(
                {
                    "version": "pf03-v1",
                    "acquired_at": datetime.now(UTC).isoformat(),
                    "identity_semantics": (
                        "Decorative current-franchise artwork; "
                        "not era-specific identity or roster evidence."
                    ),
                    "attribution": (
                        "NBA Properties, Inc. and respective NBA teams. All rights reserved."
                    ),
                    "terms_url": "https://www.nba.com/termsofuse",
                    "reuse": (
                        "Retained for this local, personal, noncommercial research workbench. "
                        "No open license or public/commercial redistribution permission asserted."
                    ),
                    "teams": records,
                },
                indent=2,
            )
            + "\n"
        )
    catalog = json.loads(CATALOG.read_text())
    assert len(catalog["teams"]) == len(NBA_TEAMS) == 30
    for record in catalog["teams"]:
        data = (PUBLIC / record["asset"].lstrip("/")).read_bytes()
        assert hashlib.sha256(data).hexdigest() == record["sha256"]
        assert len(data) == record["bytes"] <= MAX_BYTES
    print(
        json.dumps(
            {"verified_assets": 30, "total_bytes": sum(r["bytes"] for r in catalog["teams"])}
        )
    )


if __name__ == "__main__":
    main()
