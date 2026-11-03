import io
from datetime import date
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pytest
from PIL import Image
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from courtlens.services import commons_portraits as commons
from courtlens.services.commons_portraits import (
    COMMONS_PORTRAIT_SOURCE,
    Commons,
    CommonsSummary,
    Stint,
    _acquire_stint,
    bare_arm_share,
    candidate,
    crop_box,
    in_uniform,
    nickname,
    parse_taken,
    season_of,
)
from courtlens.services.season_portraits import find_season_portrait
from courtlens.workbench_models import PlayerSeasonPortrait

STINT = Stint("2544", "LeBron James", "1610612748", "MIA", "Miami Heat", "Heat", ("2010-11",))


def _page(title: str, **meta: str) -> dict[str, Any]:
    fields = {
        "LicenseShortName": "CC BY-SA 2.0",
        "DateTimeOriginal": "2010-12-18 21:17:30",
        "Artist": '<a href="//x">Keith Allison</a>',
        "ObjectName": title,
        "ImageDescription": "LeBron James of the Miami Heat",
        "Categories": "LeBron James|Miami Heat players",
    } | meta
    return {
        "title": f"File:{title}.jpg",
        "imageinfo": [
            {
                "thumburl": f"https://upload.wikimedia.org/{title}.jpg",
                "descriptionurl": f"https://commons.wikimedia.org/wiki/File:{title}.jpg",
                "extmetadata": {key: {"value": value} for key, value in fields.items()},
            }
        ],
    }


def test_dates_place_photos_in_seasons() -> None:
    assert parse_taken("2010-12-18 21:17:30") == date(2010, 12, 18)
    assert parse_taken("Taken on 28 September 2010, 10:53:09") == date(2010, 9, 28)
    assert parse_taken("2010:12:18") == date(2010, 12, 18)
    assert parse_taken("2010") is None and parse_taken("") is None
    assert season_of(date(2010, 9, 28)) == "2010-11" and season_of(date(2011, 6, 12)) == "2010-11"
    assert nickname("Portland Trail Blazers", "Portland") == "Trail Blazers"
    assert nickname("New Orleans/Oklahoma City Hornets", "New Orleans/Oklahoma City") == "Hornets"


def test_candidate_needs_free_licence_team_name_player_and_a_stint_date() -> None:
    found = candidate(_page("LeBronJamesMiamiHeat2010"), STINT)
    assert found is not None and found.season == "2010-11" and found.artist == "Keith Allison"
    assert commons.attribution(found) == (
        "Photo: Keith Allison, CC BY-SA 2.0, via Wikimedia Commons (LeBronJamesMiamiHeat2010.jpg)"
    )
    assert candidate(_page("A", LicenseShortName="All rights reserved"), STINT) is None
    assert candidate(_page("A", DateTimeOriginal="2014-12-01"), STINT) is None  # Cavaliers again
    assert candidate(_page("A", DateTimeOriginal="2010"), STINT) is None
    assert (
        candidate(_page("A", ImageDescription="LeBron James", Categories="LeBron"), STINT) is None
    )
    assert candidate(_page("2011 NBA All-Star Game LeBron"), STINT) is None
    # Off-court settings are out: he would be out of uniform.
    for title in ("LeBron James signing autographs", "Miami Heat Championship Parade 2012"):
        assert candidate(_page(title), STINT) is None
    other = _page("Wade", ImageDescription="Dwyane Wade, Miami Heat", Categories="Heat")
    assert candidate(other, STINT) is None


def test_crop_frames_head_and_shoulders_inside_the_image() -> None:
    assert crop_box((500, 300, 100, 120), 1280, 900) == (430, 246, 670, 486)
    # A face at the edge shifts the square in, never past the frame.
    assert crop_box((0, 0, 100, 120), 1280, 900) == (0, 0, 240, 240)
    assert crop_box((1200, 850, 100, 120), 1280, 900) == (1040, 660, 1280, 900)


class _Matcher:
    """Finds a face only in photos whose top-left pixel is red."""

    def reference(self, paths: list[Path]) -> list[np.ndarray]:
        return [np.zeros(1)] if paths else []

    def find(self, image: np.ndarray, references: list[np.ndarray]) -> Any:
        return ((400.0, 200.0, 160.0, 200.0), 0.7) if image[0, 0, 2] > 200 else None


def _jpeg(red: bool) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (1280, 900), (255, 0, 0) if red else (0, 0, 255)).save(buffer, "JPEG")
    return buffer.getvalue()


def test_a_stint_records_the_matched_photo_and_misses(
    test_engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    stint = Stint(
        "2544", "LeBron James", "1610612748", "MIA", "Miami Heat", "Heat", ("2010-11", "2011-12")
    )
    pages = {
        "1": _page("Wrong face"),
        "2": _page("LeBronJamesMiamiHeat2010", DateTimeOriginal="2010-12-19"),
    }
    pages["1"]["index"], pages["2"]["index"] = 1, 2

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "commons.wikimedia.org":
            assert request.url.params["gsrsearch"] == '"LeBron James" Heat filetype:bitmap'
            return httpx.Response(200, json={"query": {"pages": pages}})
        return httpx.Response(200, content=_jpeg("LeBronJames" in request.url.path))

    monkeypatch.setattr(commons, "reference_paths", lambda session, player: [tmp_path / "ref.png"])
    client = httpx.Client(transport=httpx.MockTransport(handler))
    summary = CommonsSummary()
    _acquire_stint(
        test_engine,
        stint,
        Commons(client, 0),
        _Matcher(),
        tmp_path,
        summary,  # type: ignore[arg-type]
    )
    assert (summary.checked, summary.acquired, summary.missing) == (2, 1, 1)
    with Session(test_engine) as session:
        rows = session.scalars(select(PlayerSeasonPortrait).order_by(PlayerSeasonPortrait.season))
        got = [(r.season, r.status, r.source_name, r.width) for r in rows]
        assert got == [
            ("2010-11", "active", COMMONS_PORTRAIT_SOURCE, 384),
            ("2011-12", "missing", COMMONS_PORTRAIT_SOURCE, None),
        ]
        photo = find_season_portrait(session, "2544", "2010-11", "MIA")
        assert photo is not None and "Keith Allison" in photo.attribution
        assert photo.source_url.endswith("File:LeBronJamesMiamiHeat2010.jpg")
        # The next Heat season without its own photo takes this one, the same franchise's nearest.
        assert find_season_portrait(session, "2544", "2011-12", "MIA") == photo
        assert commons.stints(session, {"2544"}) == []


def test_credits_list_commons_photos_with_their_credit(api_client: Any, session: Session) -> None:
    from courtlens.workbench_models import WorkbenchIdentity

    credit = "Photo: Keith Allison, CC BY-SA 2.0, via Wikimedia Commons (x.jpg)"
    session.add_all(
        [
            WorkbenchIdentity(
                namespace="nba", kind="player", external_id="2544", display_name="LeBron James"
            ),
            PlayerSeasonPortrait(
                player_id="2544", team_id="1610612748", team_tricode="MIA", season="2010-11",
                source_name=COMMONS_PORTRAIT_SOURCE, source_url="https://commons.wikimedia.org/x",
                status="active", attribution=credit,
            ),
            PlayerSeasonPortrait(
                player_id="2544", team_id="1610612748", team_tricode="MIA", season="2011-12",
                source_name=COMMONS_PORTRAIT_SOURCE, source_url="search", status="missing",
                attribution="none",
            ),
        ]
    )  # fmt: skip
    session.commit()
    credits = api_client.get("/api/workbench/portrait-credits").json()["commons"]
    assert credits == [
        {
            "player_id": "2544",
            "name": "LeBron James",
            "season": "2010-11",
            "team": "MIA",
            "credit": credit,
            "source_url": "https://commons.wikimedia.org/x",
        }
    ]


SKIN, JERSEY = (176, 120, 90), (20, 40, 160)


def _figure(arms: tuple[int, int, int], size: tuple[int, int] = (1000, 900)) -> Image.Image:
    """A face at (400, 100, 200x200) over a jersey, with arms of the given colour beside it."""
    photo = Image.new("RGB", size, (90, 90, 90))
    photo.paste(JERSEY, (380, 300, 620, 900))
    photo.paste(arms, (120, 380, 380, 900))
    photo.paste(arms, (620, 380, 880, 900))
    photo.paste(SKIN, (400, 100, 600, 300))
    return photo


def test_uniform_means_bare_arms_in_his_skin_tone() -> None:
    face = (400.0, 100.0, 200.0, 200.0)
    sleeveless = _figure(SKIN)
    assert bare_arm_share(sleeveless, face) == pytest.approx(1.0, abs=0.05)
    assert in_uniform(sleeveless, face)
    # A t-shirt or warm-up covers the arms.
    assert not in_uniform(_figure(JERSEY), face)
    # Arms out of the frame can't be checked, so the photo is not used.
    assert bare_arm_share(_figure(SKIN, (1000, 420)), face) is None
    assert not in_uniform(_figure(SKIN, (1000, 420)), face)
