"""IM01 verifies raw immutability and independent denominators without owner data/network."""

from __future__ import annotations

import csv
import gzip
import io
import json
import lzma
import tarfile
from pathlib import Path

import httpx
import pytest

from courtlens.ingestion import impact_archive as im

REVISION = "e829d4678be1e075f99e5d41a1c5f97089be446b"


def packed(name: str, payload: bytes, *, extra: bool = False, link: bool = False) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        member = tarfile.TarInfo(name)
        member.size = len(payload)
        if link:
            member.type = tarfile.SYMTYPE
            member.linkname = "outside"
            member.size = 0
        archive.addfile(member, io.BytesIO(payload))
        if extra:
            second = tarfile.TarInfo("extra.csv")
            archive.addfile(second, io.BytesIO())
    return lzma.compress(buffer.getvalue())


def schedule_rows(year: int) -> list[dict[str, str]]:
    teams = [str(1610612700 + i) for i in range(30)]
    rows = []
    for round_index in range(82):
        for i in range(15):
            rows.append(
                {
                    "game_id": f"002{year % 100:02d}{round_index * 15 + i + 1:05d}",
                    "season": str(year + 1),
                    "season_type": "regular-season",
                    "game_date": f"{year}-11-01",
                    "home_team_id": teams[i],
                    "away_team_id": teams[-i - 1],
                    "home_pts": "110",
                    "away_pts": "105",
                    "home_wl": "W",
                    "away_wl": "L",
                }
            )
        teams = [teams[0], teams[-1], *teams[1:-1]]
    rows.append({**rows[0], "game_id": f"004{year % 100:02d}00101", "season_type": "playoffs"})
    return rows


def schedule_bytes(rows: list[dict[str, str]]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return gzip.compress(stream.getvalue().encode(), mtime=0)


def test_requested_inventory_is_phase_separated_and_no_2025_pbpstats() -> None:
    names = im.archive_names()
    assert len(names) == len(set(names)) == 28
    for year in im.STARTING_YEARS:
        for family in im.FAMILIES:
            assert f"{family}_{year}" in names
            assert f"{family}_po_{year}" in names
    assert "pbpstats_2025" not in names
    assert "pbpstats_po_2024" in names
    with pytest.raises(ValueError, match="revision"):
        im.source_url("main", "LICENSE")
    with pytest.raises(ValueError, match="unsupported"):
        im.source_url(REVISION, "../LICENSE")


def test_refetch_retains_identical_objects_and_appends_changed_version(tmp_path: Path) -> None:
    response_bytes = b"first"
    calls = []

    def respond(request: httpx.Request) -> httpx.Response:
        calls.append(request.url)
        return httpx.Response(200, content=response_bytes)

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        first = im.retain_asset(
            tmp_path, "LICENSE", im.source_url(REVISION, "LICENSE"), client=client
        )
        before = (tmp_path / first["object"]).read_bytes()
        second = im.retain_asset(tmp_path, "LICENSE", first["url"], client=client)
        assert first["content_version_id"] == second["content_version_id"]
        assert first["object"] == second["object"]
        assert not first["content_already_retained"] and second["content_already_retained"]
        assert first["observed_at"] <= second["observed_at"]
        response_bytes = b"second"
        third = im.retain_asset(tmp_path, "LICENSE", first["url"], client=client)
    assert len(calls) == 3
    assert first["observation_id"] != second["observation_id"]
    assert len(list((tmp_path / "asset-observations").glob("*.json"))) == 3
    assert third["content_version_id"] != first["content_version_id"]
    assert (tmp_path / first["object"]).read_bytes() == before == b"first"
    assert (tmp_path / third["object"]).read_bytes() == b"second"


def test_corrupt_existing_object_is_never_replaced(tmp_path: Path) -> None:
    with httpx.Client(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, content=b"ok"))
    ) as client:
        first = im.retain_asset(
            tmp_path, "LICENSE", im.source_url(REVISION, "LICENSE"), client=client
        )
        path = tmp_path / first["object"]
        path.write_bytes(b"corrupt")
        with pytest.raises(ValueError, match="corrupt"):
            im.retain_asset(tmp_path, "LICENSE", first["url"], client=client)
        assert path.read_bytes() == b"corrupt"


@pytest.mark.parametrize("failure", ["empty", "oversized", "http_error"])
def test_failed_fetch_does_not_create_an_observation(tmp_path: Path, failure: str) -> None:
    content = {"empty": b"", "oversized": b"x" * (2 * 1024 * 1024 + 1), "http_error": b"denied"}[
        failure
    ]
    status = 403 if failure == "http_error" else 200
    with (
        httpx.Client(
            transport=httpx.MockTransport(lambda _: httpx.Response(status, content=content))
        ) as client,
        pytest.raises((ValueError, httpx.HTTPStatusError)),
    ):
        im.retain_asset(tmp_path, "LICENSE", im.source_url(REVISION, "LICENSE"), client=client)
    assert not (tmp_path / "asset-observations").exists()
    assert not list(tmp_path.glob(".acquire-*"))


def test_json_install_refuses_overwrite(tmp_path: Path) -> None:
    path = tmp_path / "receipt.json"
    im.write_json(path, {"first": True})
    before = path.read_bytes()
    with pytest.raises(FileExistsError):
        im.write_json(path, {"first": False})
    assert path.read_bytes() == before


@pytest.mark.parametrize(
    "member,extra,link",
    [
        ("../nbastatsv3_2025.csv", False, False),
        ("nbastatsv3_2025.csv", True, False),
        ("nbastatsv3_2025.csv", False, True),
    ],
)
def test_unsafe_tar_members_rejected(tmp_path: Path, member: str, extra: bool, link: bool) -> None:
    path = tmp_path / "asset"
    path.write_bytes(packed(member, b"gameId\n22500001\n", extra=extra, link=link))
    with pytest.raises(ValueError, match="regular CSV"):
        list(im.archive_rows(path, "nbastatsv3_2025"))


@pytest.mark.parametrize(
    "payload", [b"gameId,gameId\n22500001,22500001\n", b"gameId,x\n22500001\n", b"gameId\n"]
)
def test_invalid_csv_rejected(tmp_path: Path, payload: bytes) -> None:
    path = tmp_path / "asset"
    path.write_bytes(packed("nbastatsv3_2025.csv", payload))
    with pytest.raises(ValueError):
        list(im.archive_rows(path, "nbastatsv3_2025"))


def test_expansion_and_row_limits_and_xz_checksum(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "asset"
    original = packed("nbastatsv3_2025.csv", b"gameId\n22500001\n22500002\n")
    path.write_bytes(original)
    monkeypatch.setattr(im, "MAX_ROWS", 1)
    with pytest.raises(ValueError, match="row budget"):
        list(im.archive_rows(path, "nbastatsv3_2025"))
    monkeypatch.setattr(im, "MAX_ROWS", 10)
    monkeypatch.setattr(im, "MAX_EXPANDED_BYTES", 512)
    with pytest.raises(ValueError, match="expanded byte"):
        list(im.archive_rows(path, "nbastatsv3_2025"))
    monkeypatch.setattr(im, "MAX_EXPANDED_BYTES", 512 * 1024 * 1024)
    path.write_bytes(original[:-5])
    with pytest.raises((EOFError, lzma.LZMAError)):
        list(im.archive_rows(path, "nbastatsv3_2025"))


def test_coverage_lists_missing_unexpected_and_other_phases(tmp_path: Path) -> None:
    path = tmp_path / "asset"
    path.write_bytes(
        packed("nbastatsv3_2025.csv", b"gameId\n22500001\n22500001\n22509999\n52500001\n")
    )
    schedules = {
        "regular_season": {
            "games": {"0022500001": {}, "0022500002": {}},
            "membership_sha256": "schedule",
        }
    }
    result = im.coverage(path, "nbastatsv3_2025", schedules)
    assert result["matched_games"] == 1
    assert result["coverage_fraction"] == 0.5
    assert result["missing_game_ids"] == ["0022500002"]
    assert result["unexpected_game_ids"] == ["0022509999"]
    assert result["outside_requested_phase_game_ids"] == ["0052500001"]
    assert result["rows_per_game"]["0022500001"] == 2
    path.write_bytes(packed("nbastatsv3_2025.csv", b"gameId\n22400001\n"))
    with pytest.raises(ValueError, match="season mismatch"):
        im.coverage(path, "nbastatsv3_2025", schedules)


@pytest.mark.parametrize(
    "defect",
    [
        "duplicate",
        "unknown_score",
        "nonreciprocal",
        "wrong_phase",
        "missing",
        "wrong_date",
        "wrong_team",
    ],
)
def test_independent_denominator_rejects_defects(tmp_path: Path, defect: str) -> None:
    rows = schedule_rows(2025)
    if defect == "duplicate":
        rows.append(rows[0])
    elif defect == "missing":
        rows.pop(0)
    else:
        key, value = {
            "unknown_score": ("home_pts", ""),
            "nonreciprocal": ("away_wl", "W"),
            "wrong_phase": ("game_id", "0042500101"),
            "wrong_date": ("game_date", "2026-07-01"),
            "wrong_team": ("home_team_id", rows[0]["away_team_id"]),
        }[defect]
        rows[0][key] = value
    path = tmp_path / "schedule"
    path.write_bytes(schedule_bytes(rows))
    with pytest.raises(ValueError):
        im.schedule_membership(path, 2025)


def test_completed_acquisitions_have_stable_content_and_new_observations(tmp_path: Path) -> None:
    policy = tmp_path / "policy.md"
    policy.write_text("review")

    def respond(request: httpx.Request) -> httpx.Response:
        name = request.url.path.rsplit("/", 1)[1]
        if name == "list_data.txt":
            payload = "\n".join(
                f"{n}=https://example.invalid/{n}" for n in im.archive_names()
            ).encode()
        elif name.startswith("nba_schedule_"):
            payload = schedule_bytes(schedule_rows(int(name.split("_")[2].split(".")[0]) - 1))
        elif name.endswith(".tar.xz"):
            stem = name.removesuffix(".tar.xz")
            year = int(stem.rsplit("_", 1)[1])
            phase = "004" if "_po_" in stem else "002"
            gid = f"{phase}{year % 100:02d}{'00101' if phase == '004' else '00001'}"
            field = {"matchups": "game_id", "shotdetail": "GAME_ID", "pbpstats": "GAMEID"}.get(
                stem.split("_")[0], "gameId"
            )
            payload = packed(stem + ".csv", f"{field}\n{gid}\n".encode())
        else:
            payload = b"retained notice"
        return httpx.Response(200, content=payload)

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        first_path = im.acquire_impact_archive(
            tmp_path / "raw", revision=REVISION, policy_path=policy, client=client
        )
        second_path = im.acquire_impact_archive(
            tmp_path / "raw", revision=REVISION, policy_path=policy, client=client
        )
    first = json.loads(first_path.read_text())
    second = json.loads(second_path.read_text())
    assert len(first["assets"]) == 37
    assert len(first["coverage"]) == 28
    assert first["content_sha256"] == second["content_sha256"]
    assert first["observation_id"] != second["observation_id"]
    assert all(asset["content_already_retained"] for asset in second["assets"])
    assert len(first["schedule_denominators"]["2025"]["regular_season"]["team_games"]) == 30
    verified = im.verify_observation(tmp_path / "raw", second_path, policy_path=policy)
    assert verified["verified_assets"] == 37
    assert verified["content_sha256"] == second["content_sha256"]
    before = second_path.read_bytes()
    for key, value in (
        ("attribution", "changed attribution"),
        ("admission_scope", "warehouse_admitted"),
        ("unavailable", []),
        ("completed_at", "2020-01-01T00:00:00+00:00"),
        ("completed_at", "2026-01-01T00:00:00"),
        ("observation_id", "../another-observation"),
    ):
        changed = {**second, key: value}
        second_path.write_text(json.dumps(changed))
        with pytest.raises(ValueError):
            im.verify_observation(tmp_path / "raw", second_path, policy_path=policy)
    second_path.write_bytes(before)
    second["coverage"][0]["matched_games"] = 1230
    second_path.write_text(json.dumps(second))
    with pytest.raises(ValueError, match="reproduced coverage"):
        im.verify_observation(tmp_path / "raw", second_path, policy_path=policy)
    second_path.write_bytes(before)
    policy.write_text("changed review")
    with pytest.raises(ValueError, match="admission policy"):
        im.verify_observation(tmp_path / "raw", second_path, policy_path=policy)
    policy.write_text("review")
    asset = second["assets"][0]
    (tmp_path / "raw" / asset["object"]).write_bytes(b"tampered source")
    with pytest.raises(ValueError, match="hash mismatch"):
        im.verify_observation(tmp_path / "raw", second_path, policy_path=policy)
