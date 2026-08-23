from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, TypeVar

from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from courtload.ingestion.client import BalldontlieClient, FetchedPage
from courtload.ingestion.errors import ProviderSchemaError
from courtload.ingestion.raw_store import RawStore
from courtload.ingestion.schemas import (
    ProviderGame,
    ProviderModel,
    ProviderPlayer,
    ProviderPlayerStat,
    ProviderTeam,
)
from courtload.models import (
    Game,
    IngestionRun,
    Player,
    PlayerGame,
    PlayerTeamStint,
    RawObject,
    Team,
    utc_now,
)

ProviderRecord = TypeVar("ProviderRecord", bound=ProviderModel)


@dataclass
class LoadCounts:
    received: int = 0
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0

    def add(self, state: str) -> None:
        self.received += 1
        if state == "inserted":
            self.inserted += 1
        elif state == "updated":
            self.updated += 1
        else:
            self.unchanged += 1


def chunked(values: list[int], size: int) -> Iterable[list[int]]:
    for offset in range(0, len(values), size):
        yield values[offset : offset + size]


class IngestionService:
    source_name = "balldontlie"
    schema_version = "nba-openapi-1.0.0"

    def __init__(self, session: Session, raw_store: RawStore) -> None:
        self.session = session
        self.raw_store = raw_store

    def _raw_object(
        self,
        *,
        run: IngestionRun,
        resource: str,
        source_key: str,
        payload: dict[str, Any],
        status_code: int = 200,
        fetched_at: datetime | None = None,
    ) -> RawObject:
        observed = fetched_at or utc_now()
        stored = self.raw_store.put(
            source=self.source_name,
            resource=resource,
            source_key=source_key,
            payload=payload,
            fetched_at=observed,
        )
        existing = self.session.scalar(
            select(RawObject).where(
                RawObject.source_name == self.source_name,
                RawObject.resource == resource,
                RawObject.source_key == source_key,
                RawObject.content_sha256 == stored.checksum,
            )
        )
        if existing is not None:
            return existing
        raw = RawObject(
            ingestion_run_id=run.run_id,
            source_name=self.source_name,
            resource=resource,
            source_key=source_key,
            fetched_at=observed,
            http_status=status_code,
            content_sha256=stored.checksum,
            storage_uri=stored.uri,
            source_schema_version=self.schema_version,
        )
        self.session.add(raw)
        self.session.flush()
        return raw

    @staticmethod
    def _changed(instance: object, values: dict[str, Any]) -> bool:
        def comparable(value: Any) -> Any:
            if isinstance(value, datetime):
                if value.tzinfo is None:
                    value = value.replace(tzinfo=UTC)
                return value.astimezone(UTC)
            return value

        return any(
            comparable(getattr(instance, key)) != comparable(value) for key, value in values.items()
        )

    def upsert_team(self, record: ProviderTeam, raw: RawObject) -> str:
        team = self.session.get(Team, record.id)
        lineage_object_id = (
            raw.object_id if team is None or raw.resource == "teams" else team.source_object_id
        )
        values = {
            "source_team_id": record.id,
            "abbreviation": record.abbreviation,
            "city": record.city,
            "name": record.name,
            "full_name": record.full_name,
            "conference": record.conference,
            "division": record.division,
            "source_object_id": lineage_object_id,
        }
        if team is None:
            self.session.add(Team(team_key=record.id, **values))
            return "inserted"
        if not self._changed(team, values):
            return "unchanged"
        for key, value in values.items():
            setattr(team, key, value)
        return "updated"

    def upsert_player(self, record: ProviderPlayer, raw: RawObject) -> str:
        if record.team is not None:
            self.upsert_team(record.team, raw)
        player = self.session.get(Player, record.id)
        now = utc_now()
        lineage_object_id = (
            raw.object_id
            if player is None or raw.resource == "players"
            else player.source_object_id
        )
        values = {
            "source_player_id": record.id,
            "first_name": record.first_name,
            "last_name": record.last_name,
            "full_name": f"{record.first_name} {record.last_name}".strip(),
            "listed_position": record.position,
            "current_team_key": record.resolved_team_id,
            "last_seen_at": now,
            "source_object_id": lineage_object_id,
        }
        if player is None:
            self.session.add(Player(player_key=record.id, **values))
            return "inserted"
        comparison = {key: value for key, value in values.items() if key != "last_seen_at"}
        if not self._changed(player, comparison):
            player.last_seen_at = now
            return "unchanged"
        for key, value in values.items():
            setattr(player, key, value)
        return "updated"

    def upsert_game(self, record: ProviderGame, raw: RawObject) -> str:
        for team in (record.home_team, record.visitor_team):
            if team is not None:
                self.upsert_team(team, raw)
        game = self.session.get(Game, record.id)
        game_type = (
            "playoffs" if record.postseason else ("nba_cup" if record.ist_stage else "regular")
        )
        values = {
            "source_game_id": record.id,
            "season": record.season,
            "game_type": game_type,
            "scheduled_start_utc": record.scheduled_start_utc,
            "status": record.status,
            "status_state": record.normalized_status_state,
            "home_team_key": record.home_team_id,
            "away_team_key": record.visitor_team_id,
            "home_score": record.home_team_score,
            "away_score": record.visitor_team_score,
            "neutral_site": record.neutral_site,
            "postponed": record.postponed,
            "source_object_id": raw.object_id,
        }
        if game is None:
            self.session.add(Game(game_key=record.id, **values))
            return "inserted"
        if not self._changed(game, values):
            game.last_observed_at = utc_now()
            return "unchanged"
        for key, value in values.items():
            setattr(game, key, value)
        game.last_observed_at = utc_now()
        return "updated"

    def _ensure_stat_game(self, record: ProviderPlayerStat, raw: RawObject) -> None:
        game = self.session.get(Game, record.game.id)
        if game is not None:
            return
        scheduled = datetime.combine(record.game.date, datetime.min.time(), tzinfo=UTC)
        self.session.add(
            Game(
                game_key=record.game.id,
                source_game_id=record.game.id,
                season=record.game.season,
                game_type="playoffs" if record.game.postseason else "regular",
                scheduled_start_utc=scheduled,
                status=record.game.status,
                status_state=record.game.status_state or "unknown",
                home_team_key=record.game.home_team_id,
                away_team_key=record.game.visitor_team_id,
                home_score=record.game.home_team_score,
                away_score=record.game.visitor_team_score,
                postponed=record.game.postponed,
                source_object_id=raw.object_id,
            )
        )

    def upsert_stat(self, record: ProviderPlayerStat, raw: RawObject) -> str:
        self.upsert_team(record.team, raw)
        self.upsert_player(record.player, raw)
        self._ensure_stat_game(record, raw)
        home_id = record.game.home_team_id
        away_id = record.game.visitor_team_id
        opponent_id = away_id if record.team.id == home_id else home_id
        values = {
            "game_key": record.game.id,
            "player_key": record.player.id,
            "team_key": record.team.id,
            "opponent_team_key": opponent_id,
            "is_home": record.team.id == home_id,
            "minutes": record.minutes_float,
            "points": record.pts,
            "rebounds": record.reb,
            "assists": record.ast,
            "steals": record.stl,
            "blocks": record.blk,
            "turnovers": record.turnover,
            "three_pointers_made": record.fg3m,
            "field_goals_made": record.fgm,
            "field_goals_attempted": record.fga,
            "free_throws_made": record.ftm,
            "free_throws_attempted": record.fta,
            "offensive_rebounds": record.oreb,
            "defensive_rebounds": record.dreb,
            "personal_fouls": record.pf,
            "plus_minus": record.plus_minus,
            "appearance_status": "reported_zero_minutes"
            if record.minutes_float == 0
            else "reported",
            "source_object_id": raw.object_id,
        }
        stat = self.session.get(PlayerGame, record.id)
        if stat is None:
            duplicate = self.session.scalar(
                select(PlayerGame).where(
                    PlayerGame.game_key == record.game.id,
                    PlayerGame.player_key == record.player.id,
                )
            )
            if duplicate is not None:
                stat = duplicate
            else:
                self.session.add(PlayerGame(source_stat_id=record.id, **values))
                return "inserted"
        if not self._changed(stat, values):
            stat.last_observed_at = utc_now()
            return "unchanged"
        for key, value in values.items():
            setattr(stat, key, value)
        stat.last_observed_at = utc_now()
        return "updated"

    def _parse_page(
        self,
        *,
        run: IngestionRun,
        page: FetchedPage,
        model: type[ProviderRecord],
        upsert: Any,
        counts: LoadCounts,
    ) -> None:
        errors: list[str] = []
        for index, payload in enumerate(page.payload["data"]):
            try:
                record = model.model_validate(payload)
                source_id = str(record.id)
                raw = self._raw_object(
                    run=run,
                    resource=page.resource,
                    source_key=source_id,
                    payload=payload,
                    status_code=page.status_code,
                )
                counts.add(upsert(record, raw))
            except ValidationError as error:
                errors.append(f"row {index}: {error.errors(include_url=False)}")
        if errors:
            raise ProviderSchemaError(
                f"{len(errors)} invalid {page.resource} rows; first error: {errors[0]}"
            )

    def ingest(
        self,
        client: BalldontlieClient,
        *,
        start: date,
        end: date,
        include_stats: bool,
        include_players: bool = False,
    ) -> IngestionRun:
        if end < start:
            raise ValueError("end date must be on or after start date")
        run = IngestionRun(
            source_name=self.source_name,
            metadata_json={
                "start": start.isoformat(),
                "end": end.isoformat(),
                "include_stats": include_stats,
                "source_contract": "https://www.balldontlie.io/openapi/nba.yml",
            },
        )
        self.session.add(run)
        self.session.commit()
        counts = LoadCounts()
        game_ids: list[int] = []
        try:
            for page in client.teams():
                self._parse_page(
                    run=run, page=page, model=ProviderTeam, upsert=self.upsert_team, counts=counts
                )
                self.session.commit()
            if include_players:
                for page in client.players():
                    self._parse_page(
                        run=run,
                        page=page,
                        model=ProviderPlayer,
                        upsert=self.upsert_player,
                        counts=counts,
                    )
                    self.session.commit()
            for page in client.games(start=start, end=end):
                self._parse_page(
                    run=run, page=page, model=ProviderGame, upsert=self.upsert_game, counts=counts
                )
                game_ids.extend(int(row["id"]) for row in page.payload["data"])
                self.session.commit()
            if include_stats:
                for game_id_batch in chunked(game_ids, 25):
                    for page in client.stats_for_games(game_id_batch):
                        self._parse_page(
                            run=run,
                            page=page,
                            model=ProviderPlayerStat,
                            upsert=self.upsert_stat,
                            counts=counts,
                        )
                        self.session.commit()
                self.rebuild_team_stints()
                self.session.commit()
            run.status = "succeeded"
        except Exception as error:
            self.session.rollback()
            run = self.session.get(IngestionRun, run.run_id) or run
            run.status = "failed"
            run.error_summary = f"{type(error).__name__}: {error}"[:2000]
            raise
        finally:
            run.finished_at = utc_now()
            run.received_count = counts.received
            run.inserted_count = counts.inserted
            run.updated_count = counts.updated
            run.unchanged_count = counts.unchanged
            self.session.add(run)
            self.session.commit()
        return run

    def load_fixture_pages(
        self, paths: Iterable[Path], *, reset_source: bool = False
    ) -> IngestionRun:
        """Load hand-authored contract fixtures; this is intentionally not an operational ingest."""
        run = IngestionRun(source_name="fixture", metadata_json={"classification": "fixture"})
        self.session.add(run)
        self.session.commit()
        counts = LoadCounts()
        previous_source = self.source_name
        self.source_name = "fixture"
        try:
            if reset_source:
                self.session.execute(delete(PlayerTeamStint))
                self.session.execute(delete(PlayerGame))
                self.session.execute(delete(Game))
                self.session.execute(delete(Player))
                self.session.execute(delete(Team))
                self.session.commit()
            model_by_resource: dict[str, tuple[type[ProviderModel], Any]] = {
                "teams": (ProviderTeam, self.upsert_team),
                "players": (ProviderPlayer, self.upsert_player),
                "games": (ProviderGame, self.upsert_game),
                "stats": (ProviderPlayerStat, self.upsert_stat),
            }
            for path in paths:
                import json

                payload = json.loads(path.read_text(encoding="utf-8"))
                resource = str(payload["resource"])
                model, upsert = model_by_resource[resource]
                page = FetchedPage(
                    resource=resource,
                    payload={"data": payload["data"], "meta": {}},
                    status_code=200,
                    request_url=f"fixture://{path.name}",
                )
                self._parse_page(run=run, page=page, model=model, upsert=upsert, counts=counts)
                self.session.commit()
            self.rebuild_team_stints()
            run.status = "succeeded"
        except Exception as error:
            self.session.rollback()
            run.status = "failed"
            run.error_summary = f"{type(error).__name__}: {error}"[:2000]
            raise
        finally:
            self.source_name = previous_source
            run.finished_at = utc_now()
            run.received_count = counts.received
            run.inserted_count = counts.inserted
            run.updated_count = counts.updated
            run.unchanged_count = counts.unchanged
            self.session.add(run)
            self.session.commit()
        return run

    def rebuild_team_stints(self) -> None:
        rows = self.session.execute(
            select(
                PlayerGame.player_key,
                PlayerGame.team_key,
                Game.scheduled_start_utc,
                PlayerGame.source_object_id,
            )
            .join(Game, Game.game_key == PlayerGame.game_key)
            .order_by(PlayerGame.player_key, Game.scheduled_start_utc, PlayerGame.source_stat_id)
        ).all()
        self.session.execute(delete(PlayerTeamStint))
        current: PlayerTeamStint | None = None
        for player_key, team_key, tipoff, source_object_id in rows:
            played_on = tipoff.date()
            if current is None or current.player_key != player_key or current.team_key != team_key:
                if current is not None:
                    self.session.add(current)
                current = PlayerTeamStint(
                    player_key=player_key,
                    team_key=team_key,
                    valid_from=played_on,
                    valid_to=played_on,
                    first_source_object_id=source_object_id,
                    last_source_object_id=source_object_id,
                    reconstruction_status="observed_from_stats",
                )
            else:
                current.valid_to = played_on
                current.last_source_object_id = source_object_id
        if current is not None:
            self.session.add(current)
