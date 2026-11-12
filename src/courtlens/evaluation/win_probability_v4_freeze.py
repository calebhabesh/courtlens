"""Freeze the Market-informed model (`courtlens-win-probability-v4`, W3a step 2).

Writes the committed manifest `evaluation/research/frozen/courtlens-win-probability-v4.json`. It
fits nothing: it reads stage F's weight and the committed freeze-check evidence, refuses unless
every registered freeze check passed, and records their hashes.

K1 serves the Original's three model files unchanged (their digests are v2's, already in the
artifact store and pinned by v2's manifest), so no model file is copied. What v4 adds is the
line's weight `w` and the rule `mu4 = own + w x (line - own)`, own-only when there is no line.

The freeze refuses to run twice: a frozen model does not change. Any refit needs a new version.
The registration defines the prospective test as 2026-27 regular-season games tipping after this
freeze that have a seal.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from courtlens.evaluation import win_probability_v4 as v4
from courtlens.services.win_probability_serving import manifest_hash

MANIFEST_PATH = Path("evaluation/research/frozen/courtlens-win-probability-v4.json")
V2_MANIFEST_PATH = Path("evaluation/research/frozen/courtlens-win-probability-v2.json")
SCHEMA = "courtlens-win-probability-v4-frozen-v1"
FROZEN_VERSION = "courtlens-win-probability-v4-frozen-2026-27"
# Committed copies of the freeze evidence (docs/evidence/win-probability-v4).
EVIDENCE_FILES = (
    "final-fit.json",
    "freeze-parity.json",
    "freeze-latency.json",
    "platform-reference.json",
    "platform-arm64.json",
)


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _read(path: Path) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(path.read_text())
    return body


def checks(evidence: Path = v4.EVIDENCE) -> dict[str, Any]:
    """The registered freeze checks, read from the committed evidence; all must pass."""
    parity = _read(evidence / "freeze-parity.json")
    latency = _read(evidence / "freeze-latency.json")
    arm64 = _read(evidence / "platform-arm64.json")
    out = {
        "espn_state_parity": {
            "passed": bool(parity["passed"]),
            "limit": parity["limit"],
            "w": parity["w"],
        },
        "p95_latency": {
            "passed": bool(latency["passed"]),
            "seconds_p95": latency["seconds_p95"],
            "limit_seconds": latency["limit_seconds"],
        },
        "arm64_parity": {
            "passed": bool(arm64["passed"]),
            "machine": arm64["machine"],
            "states": arm64["states"],
            "max_abs_difference": arm64["max_abs_difference"],
            "limit": arm64["limit"],
        },
    }
    failed = [name for name, check in out.items() if not check["passed"]]
    if failed:
        raise ValueError(f"freeze checks failed: {failed}; v4 is not frozen")
    return out


def manifest_body(now: str, evidence: Path = v4.EVIDENCE) -> dict[str, Any]:
    final = _read(evidence / "final-fit.json")
    v2 = _read(V2_MANIFEST_PATH)
    if final["selected"] != "K1" or final["stage"] != "F":
        raise ValueError("the freeze covers stage F's K1 only")
    if final["reference_manifest_sha256"] != v2["manifest_sha256"]:
        raise ValueError("stage F was fitted against a different Original manifest")
    if final["models"] != v2["models"]:
        raise ValueError("K1 must serve the Original's model files unchanged")
    w = float(final["weight"]["w"])
    if not 0.0 <= w <= 1.0:
        raise ValueError("the line's weight must lie in 0..1")
    arm64 = _read(evidence / "platform-arm64.json")
    if float(arm64["w"]) != w:
        raise ValueError("the arm64 check ran at a different w")
    body: dict[str, Any] = {
        "schema": SCHEMA,
        "version": FROZEN_VERSION,
        "registration": v4.REGISTRATION,
        "registration_sha256": v4.receipt()["content_sha256"],
        "frozen_at": now,
        "selected": "K1: the Original's boosters, baseline and end-game specialist reading mu4",
        "reference": {
            "registration": v2["registration"],
            "manifest_sha256": v2["manifest_sha256"],
        },
        "models": v2["models"],
        "market": {
            "rule": "mu4 = own + w * (line - own); mu4 = own when the seal has no line",
            "w": w,
            "w_unclipped": final["weight"]["unclipped"],
            "w_bounds": [0.0, 1.0],
            "w_fit_seasons": final["weight"]["seasons"],
            "w_fit_games": final["weight"]["games"],
            "weights_by_stage": final["weights_by_stage"],
            "own": "the Original's expected home margin, its frozen coefficients unchanged",
            "line_training": "hoopR-nba-data consensus closing spread, home margin = -home_point",
            "line_serving": "ESPN's line in the seal, home margin = -spread; null when none",
        },
        "prospective": (
            "2026-27 regular-season games tipping after frozen_at that have a seal; a game "
            "sealed with no line counts, with mu4 = own"
        ),
        "checks": checks(evidence),
        "evidence": {name: file_sha256(evidence / name) for name in EVIDENCE_FILES},
    }
    body["manifest_sha256"] = manifest_hash(body)
    return body


def freeze(evidence: Path = v4.EVIDENCE) -> dict[str, Any]:
    if MANIFEST_PATH.exists():
        raise ValueError(f"{MANIFEST_PATH} exists: a frozen model does not change")
    body = manifest_body(datetime.now(UTC).isoformat(timespec="seconds"), evidence)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    body = freeze()
    print(json.dumps({k: body[k] for k in ("version", "frozen_at", "manifest_sha256", "market")}))


if __name__ == "__main__":
    main()
