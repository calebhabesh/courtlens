from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from PIL import Image
from sqlalchemy.orm import Session

from courtlens.services import wikidata_portraits as wd
from courtlens.services.wikidata_portraits import (
    WIKIDATA_PORTRAIT_SOURCE,
    Photo,
    Target,
    WikidataEntry,
    WikidataSummary,
    _choose,
    _row,
    dominant_face,
    file_page,
    file_title,
    ordered,
    parse_sparql,
    photo,
)
from courtlens.workbench_models import PlayerPortrait

TARGET = Target("1729", "Ricky Davis", "davisri01", 1998)
RED, BLUE, GREEN = (255, 0, 0), (0, 0, 255), (0, 255, 0)


def _cell(value: str) -> dict[str, str]:
    return {"type": "literal", "value": value}


def test_sparql_rows_key_by_nba_and_bbref_id() -> None:
    by_nba, by_bref = parse_sparql(
        [
            {
                "nba": _cell("1002"),
                "bref": _cell("g/gearyre01"),
                "image": _cell(
                    "http://commons.wikimedia.org/wiki/Special:FilePath/Reggie%20Geary.jpg"
                ),
            },
            {"nba": _cell("1002"), "category": _cell("Reggie Geary")},
            {"bref": _cell("n/nancela01"), "category": _cell("Larry Nance")},
        ]
    )
    assert by_nba["1002"] == WikidataEntry("File:Reggie Geary.jpg", "Reggie Geary")
    assert by_bref["gearyre01"].image == "File:Reggie Geary.jpg"
    assert by_bref["nancela01"] == WikidataEntry(None, "Larry Nance")
    assert file_title("http://x/Special:FilePath/A_B%28c%29.jpg") == "File:A B(c).jpg"
    credit = "Photo: Jane Doe, CC BY 2.0, via Wikimedia Commons (Ricky Davis 2004.jpg)"
    assert file_page(credit) == "https://commons.wikimedia.org/wiki/File:Ricky_Davis_2004.jpg"
    assert file_page("no file") is None


def _face(width: float) -> np.ndarray:
    return np.array([10.0, 10.0, width, width * 1.2])


def test_the_reference_face_must_dominate_the_wikidata_image() -> None:
    assert dominant_face([]) is None
    assert dominant_face([_face(30)]) is None  # too small to learn from
    assert dominant_face([_face(120)]) is not None
    assert dominant_face([_face(120), _face(70)]) is not None  # a fan far behind him
    assert dominant_face([_face(120), _face(100)]) is None  # a team photo


def _page(title: str, **meta: str) -> dict[str, Any]:
    fields = {"LicenseShortName": "CC BY 2.0", "Artist": "Jane Doe"} | meta
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


def test_photos_need_a_free_licence_and_career_years_come_first() -> None:
    assert photo(_page("A", LicenseShortName="All rights reserved")) is None
    assert photo(_page("Ricky Davis at a charity gala")) is None
    found = photo(_page("A", DateTimeOriginal="2004-01-02"))
    assert found is not None and found.taken == date(2004, 1, 2)

    def dated(title: str, year: int | None) -> Photo:
        return Photo(title, "", "", "CC BY 2.0", "x", date(year, 1, 1) if year else None)

    got = ordered([dated("undated", None), dated("2024", 2024), dated("2004", 2004)], 1998)
    assert [p.title for p in got] == ["2004", "2024", "undated"]


class _Files:
    """Commons stand-in: the image's colour says what it shows (red: him in uniform, blue: him
    in a suit, green: nobody)."""

    def __init__(self, lead: str | None, category: list[str]) -> None:
        self.lead = lead
        self.members = category
        self.downloads: list[str] = []

    def file(self, title: str) -> dict[str, Any] | None:
        return _page(self.lead) if self.lead else None

    def category(self, name: str) -> list[dict[str, Any]]:
        return [_page(title) for title in self.members]

    def image(self, url: str) -> Image.Image:
        self.downloads.append(url)
        colour = RED if "uniform" in url else BLUE if "suit" in url else GREEN
        return Image.new("RGB", (640, 640), colour)


class _Matcher:
    def faces(self, image: np.ndarray) -> list[np.ndarray]:
        return [] if image[0, 0, 1] > 200 else [np.array([200.0, 100.0, 120.0, 150.0])]

    def embedding(self, image: np.ndarray, face: np.ndarray) -> np.ndarray:
        return np.zeros(1)

    def find(self, image: np.ndarray, references: list[np.ndarray]) -> Any:
        found = self.faces(image)
        return (tuple(float(v) for v in found[0]), 0.8) if found else None


@pytest.fixture(autouse=True)
def _uniform_is_red(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wd, "in_uniform", lambda image, face: image.getpixel((0, 0)) == RED)


def _pick(files: _Files, own: list[np.ndarray] | None = None) -> Any:
    summary = WikidataSummary()
    entry = WikidataEntry("File:lead.jpg" if files.lead else None, "Ricky Davis")
    result = _choose(TARGET, entry, own or [], files, _Matcher(), summary)  # type: ignore[arg-type]
    return result, summary


def test_a_uniform_photo_from_his_category_beats_the_wikidata_suit_photo() -> None:
    files = _Files("Davis suit 2019", ["nobody", "Davis uniform 2004"])
    (found, square, uniform), summary = _pick(files)
    assert (found.title, uniform, square.width) == ("File:Davis uniform 2004.jpg", True, 288)
    assert summary.checked == 2


def test_the_wikidata_photo_stands_in_out_of_uniform_and_in_uniform_first() -> None:
    (found, _square, uniform), _ = _pick(_Files("Davis suit 2019", ["nobody"]))
    assert (found.title, uniform) == ("File:Davis suit 2019.jpg", False)
    files = _Files("Davis uniform 2003", ["Davis uniform 2004"])
    (found, _square, uniform), summary = _pick(files)
    assert (found.title, uniform, summary.checked) == ("File:Davis uniform 2003.jpg", True, 0)


def test_without_a_face_to_learn_from_nothing_is_chosen() -> None:
    result, summary = _pick(_Files(None, ["Davis uniform 2004"]))
    assert result is None and summary.no_reference == 1
    # His own season headshot is enough to search the category.
    (found, _square, uniform), _ = _pick(_Files(None, ["Davis uniform 2004"]), own=[np.zeros(1)])
    assert (found.title, uniform) == ("File:Davis uniform 2004.jpg", True)


def test_rows_record_the_photo_or_a_miss(tmp_path: Path) -> None:
    summary = WikidataSummary()
    miss = _row(TARGET, None, None, tmp_path, summary)
    assert (miss.status, miss.source_name, summary.missing) == (
        "missing",
        WIKIDATA_PORTRAIT_SOURCE,
        1,
    )
    found = Photo("File:Davis.jpg", "page", "thumb", "CC BY 2.0", "Jane Doe", None)
    row = _row(TARGET, None, (found, Image.new("RGB", (200, 200)), False), tmp_path, summary)
    assert row.status == "active" and Path(row.storage_path).exists()
    assert row.attribution == "Photo: Jane Doe, CC BY 2.0, via Wikimedia Commons (Davis.jpg)"
    assert summary.out_of_uniform == 1


def _portrait(
    tmp_path: Path, player: str, source: str, colour: tuple[int, int, int]
) -> PlayerPortrait:
    path = tmp_path / f"{player}-{source}.png"
    Image.new("RGB", (64, 64), colour).save(path)
    return PlayerPortrait(
        player_id=player, source_name=source, content_sha256=source.ljust(64, "0")[:64],
        storage_path=str(path), mime_type="image/png", bytes=path.stat().st_size,
        attribution="Photo: Jane Doe, CC BY 2.0, via Wikimedia Commons (Davis.jpg)",
        status="active",
    )  # fmt: skip


def test_the_commons_career_photo_is_the_last_resort_and_is_credited(
    api_client: Any, session: Session, tmp_path: Path
) -> None:
    session.add_all(
        [
            _portrait(tmp_path, "1729", WIKIDATA_PORTRAIT_SOURCE, RED),
            _portrait(tmp_path, "2544", WIKIDATA_PORTRAIT_SOURCE, RED),
            _portrait(tmp_path, "2544", "nba_cdn_1040x760", BLUE),
        ]
    )
    session.commit()
    only = api_client.get("/api/workbench/players/1729/portrait")
    assert (
        only.status_code == 200
        and only.content == Path(tmp_path / "1729-wikidata_commons.png").read_bytes()
    )
    nba = api_client.get("/api/workbench/players/2544/portrait")
    assert nba.content == Path(tmp_path / "2544-nba_cdn_1040x760.png").read_bytes()
    credits = api_client.get("/api/workbench/portrait-credits").json()["commons"]
    assert {(c["player_id"], c["season"], c["source_url"]) for c in credits} == {
        ("1729", None, "https://commons.wikimedia.org/wiki/File:Davis.jpg"),
        ("2544", None, "https://commons.wikimedia.org/wiki/File:Davis.jpg"),
    }
