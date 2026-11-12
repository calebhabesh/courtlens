"""The Market-informed model's freeze (v4, W3a): the committed manifest and its refusals."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest

from courtlens.evaluation import win_probability_v4 as v4
from courtlens.evaluation import win_probability_v4_freeze as freeze
from courtlens.services import win_probability_market as market
from courtlens.services.win_probability_serving import manifest_hash


def _manifest() -> dict:
    return json.loads(freeze.MANIFEST_PATH.read_text())


def test_committed_manifest_is_intact_and_pins_what_v4_reads() -> None:
    manifest = _manifest()
    assert manifest_hash(manifest) == manifest["manifest_sha256"]
    assert manifest["schema"] == freeze.SCHEMA
    assert manifest["registration"] == "courtlens-win-probability-v4"
    assert manifest["registration_sha256"] == v4.receipt()["content_sha256"]
    # K1 serves the Original's files unchanged, against the Original's manifest as frozen.
    v2 = json.loads(freeze.V2_MANIFEST_PATH.read_text())
    assert manifest["reference"]["manifest_sha256"] == v2["manifest_sha256"]
    assert manifest["reference"]["manifest_sha256"].startswith("b2b0db82")
    assert manifest["models"] == v2["models"]
    # The line's weight, as fitted in stage F and checked on arm64. Changing it needs a new version.
    assert manifest["market"]["w"] == 1.0
    assert manifest["market"]["w_fit_seasons"] == ["2022-23", "2023-24", "2024-25", "2025-26"]
    for name, digest in manifest["evidence"].items():
        path = v4.EVIDENCE / name
        assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, name
    assert all(check["passed"] for check in manifest["checks"].values())
    assert manifest["checks"]["arm64_parity"]["max_abs_difference"] <= 1e-9


def test_the_frozen_rule_is_the_served_rule() -> None:
    w = _manifest()["market"]["w"]
    assert market.market_mu(3.0, 7.0, w) == 7.0
    assert market.market_mu(3.0, None, w) == 3.0


def _evidence(tmp_path: Path) -> Path:
    target = tmp_path / "evidence"
    target.mkdir()
    for name in freeze.EVIDENCE_FILES:
        shutil.copyfile(v4.EVIDENCE / name, target / name)
    return target


def test_a_failed_freeze_check_refuses_the_freeze(tmp_path: Path) -> None:
    evidence = _evidence(tmp_path)
    arm64 = json.loads((evidence / "platform-arm64.json").read_text())
    arm64["passed"] = False
    (evidence / "platform-arm64.json").write_text(json.dumps(arm64))
    with pytest.raises(ValueError, match="freeze checks failed"):
        freeze.manifest_body("2026-11-12T00:00:00+00:00", evidence)


def test_an_arm64_check_at_another_weight_refuses_the_freeze(tmp_path: Path) -> None:
    evidence = _evidence(tmp_path)
    arm64 = json.loads((evidence / "platform-arm64.json").read_text())
    arm64["w"] = 0.9
    (evidence / "platform-arm64.json").write_text(json.dumps(arm64))
    with pytest.raises(ValueError, match="different w"):
        freeze.manifest_body("2026-11-12T00:00:00+00:00", evidence)


def test_the_freeze_refuses_to_run_twice() -> None:
    assert freeze.MANIFEST_PATH.exists()
    with pytest.raises(ValueError, match="does not change"):
        freeze.freeze()
