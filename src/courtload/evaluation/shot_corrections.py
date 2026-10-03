"""Reviewed exclusions bound to original bytes and complete official NBA game observations."""

from __future__ import annotations

import json
import re
from dataclasses import replace
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Literal, Self

from pydantic import AwareDatetime, Field, model_validator

from courtload.domain.research_registration import SHA256, FrozenContract, Text
from courtload.domain.rich_sources import classify_shot_zone, compute_payload_hash
from courtload.domain.shotchart import ShotAttempt
from courtload.ingestion.sportsdataverse import hash_file


class OfficialEvidence(FrozenContract):
    name: str = Field(pattern=r"^[A-Za-z0-9_-]+\.html$")
    url: str = Field(
        pattern=r"^https://www\.nba\.com/game/[a-z]{3}-vs-[a-z]{3}-[0-9]{10}/play-by-play$"
    )
    sha256: SHA256
    bytes: int = Field(gt=0, le=2 * 1024 * 1024)
    observed_at: AwareDatetime


class ShotCorrection(FrozenContract):
    game_id: str = Field(pattern=r"^002[0-9]{7}$")
    event_id: int = Field(gt=0)
    raw_fields_sha256: SHA256 | None = None
    operation: Literal[
        "exclude_not_official_attempt",
        "replace_observed_shot_type",
        "replace_observed_clock",
        "append_official_attempt",
    ]
    replacement_shot_value: Literal[2, 3] | None = None
    replacement_seconds_remaining: int | None = Field(default=None, ge=0, le=720)
    original_game_membership_sha256: SHA256 | None = None
    official_raw_action: dict[str, Any] | None = None
    evidence: OfficialEvidence
    review_locator: Text
    reason: Text


class CorrectionLedger(FrozenContract):
    schema_version: Literal[
        "courtload-shot-correction-ledger-v1",
        "courtload-shot-correction-ledger-v2",
        "courtload-shot-correction-ledger-v3",
    ]
    archive_sha256: SHA256
    quality_contract_sha256: SHA256
    correction_contract_sha256: SHA256
    reviewer: Text
    reviewed_at: AwareDatetime
    entries: tuple[ShotCorrection, ...] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def coherent_review(self) -> Self:
        keys = [(e.game_id, e.event_id) for e in self.entries]
        if len(keys) != len(set(keys)):
            raise ValueError("duplicate correction key")
        for entry in self.entries:
            if entry.operation == "append_official_attempt":
                if (
                    self.schema_version != "courtload-shot-correction-ledger-v3"
                    or entry.raw_fields_sha256 is not None
                    or entry.original_game_membership_sha256 is None
                    or entry.official_raw_action is None
                ):
                    raise ValueError(
                        "supplement requires v3 and original-game/official-row provenance"
                    )
            elif entry.raw_fields_sha256 is None:
                raise ValueError("existing-row correction requires exact original row hash")
            elif (
                entry.official_raw_action is not None
                or entry.original_game_membership_sha256 is not None
            ):
                raise ValueError("existing-row correction cannot synthesize an official supplement")
            if entry.operation == "replace_observed_clock":
                if (
                    self.schema_version != "courtload-shot-correction-ledger-v3"
                    or entry.replacement_seconds_remaining is None
                ):
                    raise ValueError("clock correction requires v3 and observed seconds")
            elif entry.replacement_seconds_remaining is not None:
                raise ValueError("unregistered clock replacement")
            if entry.operation == "replace_observed_shot_type":
                if (
                    self.schema_version == "courtload-shot-correction-ledger-v1"
                    or entry.replacement_shot_value is None
                ):
                    raise ValueError("observed type correction requires registered ledger v2")
            elif entry.replacement_shot_value is not None:
                raise ValueError("exclusion cannot replace a shot type")
        if any(e.evidence.observed_at > self.reviewed_at for e in self.entries):
            raise ValueError("review predates evidence observation")
        if self.reviewed_at > datetime.now(UTC):
            raise ValueError("review cannot be backfilled from a future timestamp")
        return self


class _NextData(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.active = False
        self.count = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "script" and dict(attrs).get("id") == "__NEXT_DATA__":
            self.active = True
            self.count += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self.active = False

    def handle_data(self, data: str) -> None:
        if self.active:
            self.parts.append(data)


def official_attempts(payload: bytes, game_id: str) -> dict[int, dict[str, Any]]:
    """Use actionNumber (NBA event key), never the separate actionId display index."""
    if not 0 < len(payload) <= 2 * 1024 * 1024:
        raise ValueError("official observation byte limit")
    parser = _NextData()
    parser.feed(payload.decode("utf-8"))
    if parser.count != 1:
        raise ValueError("require one complete official page data script")
    page = json.loads("".join(parser.parts))["props"]["pageProps"]
    game, pbp = page["game"], page["playByPlay"]
    if game["gameId"] != game_id or pbp["gameId"] != game_id or game["gameStatus"] != 3:
        raise ValueError("official observation wrong/nonfinal game")
    actions = pbp["actions"]
    if not isinstance(actions, list) or not 100 <= len(actions) <= 2000:
        raise ValueError("official complete-game action budget")
    result = {}
    for action in actions:
        if type(action["isFieldGoal"]) is not int or action["isFieldGoal"] not in (0, 1):
            raise ValueError("unknown official attempted flag")
        if action["isFieldGoal"] == 0:
            continue
        key = action["actionNumber"]
        if type(key) is not int or key <= 0 or key in result:
            raise ValueError("duplicate/invalid official field-goal event key")
        if action["shotResult"] not in ("Made", "Missed") or action["shotValue"] not in (2, 3):
            raise ValueError("unknown official shot outcome/type")
        clock = re.fullmatch(r"PT([0-9]+)M([0-9]+(?:\.[0-9]+)?)S", action["clock"])
        if clock is None or float(clock[2]) >= 60:
            raise ValueError("malformed official clock")
        # The retained ShotChartDetail grain has whole-second clocks.
        remaining = int(clock[1]) * 60 + int(float(clock[2]))
        period = action["period"]
        if (
            type(period) is not int
            or not 1 <= period <= 20
            or remaining > (720 if period <= 4 else 300)
        ):
            raise ValueError("invalid official period/clock")
        if any(type(action[k]) is not int or action[k] <= 0 for k in ("personId", "teamId")):
            raise ValueError("unknown official shot identity")
        result[key] = {
            "player_id": str(action["personId"]),
            "team_id": str(action["teamId"]),
            "period": period,
            "seconds_remaining": remaining,
            "shot_value": action["shotValue"],
            "made": action["shotResult"] == "Made",
            "game_date": game["gameCode"][:8],
        }
    if not result:
        raise ValueError("empty official game shot extract")
    return result


def load_ledger(
    path: Path, *, archive_sha256: str, contract_sha256: str
) -> tuple[CorrectionLedger, dict[str, dict[int, dict[str, Any]]]]:
    if not 0 < path.stat().st_size <= 64 * 1024:
        raise ValueError("correction ledger byte limit")
    ledger = CorrectionLedger.model_validate_json(path.read_bytes())
    if ledger.archive_sha256 != archive_sha256 or ledger.quality_contract_sha256 != contract_sha256:
        raise ValueError("correction ledger source/policy mismatch")
    if (
        ledger.correction_contract_sha256
        != hash_file(Path(f"docs/design/shot-correction-ledger-{ledger.schema_version[-2:]}.md"))[0]
    ):
        raise ValueError("correction contract hash mismatch")
    official: dict[str, dict[int, dict[str, Any]]] = {}
    for entry in ledger.entries:
        evidence = entry.evidence
        source = path.parent / evidence.name
        if source.is_symlink() or not source.is_file() or source.stat().st_size != evidence.bytes:
            raise ValueError("missing/invalid official evidence bytes")
        digest, size = hash_file(source)
        if digest != evidence.sha256 or size != evidence.bytes:
            raise ValueError("official evidence checksum mismatch")
        if evidence.url.removesuffix("/play-by-play").rsplit("-", 1)[-1] != entry.game_id:
            raise ValueError("official evidence URL game mismatch")
        observed = official_attempts(source.read_bytes(), entry.game_id)
        if entry.operation == "exclude_not_official_attempt":
            if entry.event_id in observed:
                raise ValueError("correction target remains an official field-goal attempt")
        elif entry.operation == "replace_observed_shot_type" and (
            entry.event_id not in observed
            or observed[entry.event_id]["shot_value"] != entry.replacement_shot_value
        ):
            raise ValueError("replacement type lacks exact official event evidence")
        elif entry.operation == "replace_observed_clock" and (
            entry.event_id not in observed
            or observed[entry.event_id]["seconds_remaining"] != entry.replacement_seconds_remaining
        ):
            raise ValueError("replacement clock lacks exact official event evidence")
        elif entry.operation == "append_official_attempt":
            parser = _NextData()
            parser.feed(source.read_text())
            actions = json.loads("".join(parser.parts))["props"]["pageProps"]["playByPlay"][
                "actions"
            ]
            matched = [
                a for a in actions if a["isFieldGoal"] == 1 and a["actionNumber"] == entry.event_id
            ]
            if len(matched) != 1 or matched[0] != entry.official_raw_action:
                raise ValueError("supplement does not match exact retained official action")
        if entry.game_id in official and official[entry.game_id] != observed:
            raise ValueError("conflicting official game evidence")
        official[entry.game_id] = observed
    return ledger, official


def apply_reviewed_corrections(
    shots: list[ShotAttempt], ledger: CorrectionLedger, official: dict[int, dict[str, Any]]
) -> tuple[list[ShotAttempt], list[ShotAttempt]]:
    if not shots:
        raise ValueError("missing correction target game")
    entries = [e for e in ledger.entries if e.game_id == shots[0].game_id]
    keys = {e.event_id: e for e in entries}
    existing = {e.event_id: e for e in entries if e.operation != "append_official_attempt"}
    removed = [s for s in shots if s.event_id in existing]
    if len(removed) != len(existing) or len({s.event_id for s in removed}) != len(existing):
        raise ValueError("correction must match exactly one original row")
    for shot in removed:
        if shot.raw_fields_sha256 != keys[shot.event_id].raw_fields_sha256:
            raise ValueError("correction original row hash mismatch")
    retained = []
    for shot in shots:
        entry = keys.get(shot.event_id)
        if entry is None:
            retained.append(shot)
        elif entry.operation == "replace_observed_shot_type":
            assert entry.replacement_shot_value is not None
            if shot.shot_value == entry.replacement_shot_value:
                raise ValueError("replacement type does not change original observed type")
            zone = (
                classify_shot_zone(
                    shot.x_feet, shot.y_feet, shot.distance_feet, entry.replacement_shot_value
                )[0]
                if not shot.geometry_exclusions
                else "Unknown"
            )
            retained.append(replace(shot, shot_value=entry.replacement_shot_value, zone=zone))
        elif entry.operation == "replace_observed_clock":
            if shot.seconds_remaining == entry.replacement_seconds_remaining:
                raise ValueError("clock correction must change observed clock")
            assert entry.replacement_seconds_remaining is not None
            retained.append(replace(shot, seconds_remaining=entry.replacement_seconds_remaining))
        elif entry.operation == "append_official_attempt":
            raise ValueError("supplement event already exists in original archive")
    membership = compute_payload_hash(
        [s.payload() for s in sorted(shots, key=lambda s: s.event_id)]
    )
    for entry in entries:
        if entry.operation != "append_official_attempt":
            continue
        if entry.original_game_membership_sha256 != membership:
            raise ValueError("supplement original complete-game membership mismatch")
        observed = official[entry.event_id]
        assert entry.official_raw_action is not None
        raw_date = observed["game_date"]
        retained.append(
            ShotAttempt(
                entry.game_id,
                entry.event_id,
                observed["player_id"],
                observed["team_id"],
                f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:]}",
                observed["period"],
                observed["seconds_remaining"],
                observed["shot_value"],
                observed["made"],
                None,
                None,
                None,
                shots[0].home_tricode,
                shots[0].away_tricode,
                entry.event_id,
                compute_payload_hash(entry.official_raw_action),
                ("official_pbp_geometry_unadmitted",),
                "Unknown",
            )
        )
    if len({s.event_id for s in retained}) != len(retained) or set(official) != {
        s.event_id for s in retained
    }:
        raise ValueError("corrected full-game official event membership mismatch")
    for shot in retained:
        expected = {k: shot.payload()[k] for k in official[shot.event_id] if k != "game_date"}
        expected["game_date"] = shot.game_date.replace("-", "")
        if expected != official[shot.event_id]:
            raise ValueError("corrected official shot identity/outcome/clock mismatch")
    return retained, removed
