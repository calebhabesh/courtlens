"""The hosted jobs service can run the weekly season impact (first VPS run, 2026-11-14)."""

from __future__ import annotations

import gzip
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _copied_sources() -> set[str]:
    """Every source path of a COPY instruction in the API image, line continuations joined."""
    text = (ROOT / "Dockerfile").read_text().replace("\\\n", " ")
    sources: set[str] = set()
    for line in text.splitlines():
        parts = line.split()
        if parts[:1] == ["COPY"]:
            sources.update(p for p in parts[1:-1] if not p.startswith("--"))
    return sources


def test_image_carries_every_evidence_file_the_im03_acceptance_checks() -> None:
    gate = Path("docs/evidence/im03-event-gate")
    acceptance = json.loads(gzip.decompress((ROOT / gate / "acceptance-v2.json.gz").read_bytes()))
    copied = _copied_sources()
    missing = [
        name
        for name in ["acceptance-v2.json.gz", *acceptance["evidence"]]
        if str(gate / name) not in copied
    ]
    assert missing == []


def test_hosted_manifests_the_season_impact_job_writes_are_directories() -> None:
    """`refresh-season-impact` installs new bundles, so a pinned file stops it before it starts."""
    env = (ROOT / "deploy/pinned.env").read_text()
    pinned = dict(re.findall(r"^(COURTLENS_[A-Z_]+_MANIFEST)=(.+)$", env, re.M))
    for key in (
        "COURTLENS_IMPACT_SERVING_MANIFEST",
        "COURTLENS_IMPACT_TEAM_SPLITS_MANIFEST",
        "COURTLENS_WOWY_MANIFEST",
    ):
        assert not pinned[key].endswith(".json"), key
