"""AG06 fixed dev-only replay subset: real SQL and exact provider/tool drift failures."""

import gzip
import hashlib
import json
import os
from uuid import UUID, uuid4

import pytest
from agent_eval_fixture import (
    FIXTURE_DATASET,
    FIXTURE_RELEASE,
    FIXTURE_TIME,
    ROOT,
    TODAY,
    AuthoredProvider,
    history_record,
    read_record,
    replay_cases,
    request_for,
)
from fixture_data import add_workbench_dataset
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from courtlens.config import Settings
from courtlens.database import Base
from courtlens.services.assistant.agent.evaluation import load_corpus, oracle_answer, score_answer
from courtlens.services.assistant.agent.loop import run_turn
from courtlens.services.assistant.agent.providers.replay import RecordedStep, ReplayProvider
from courtlens.services.workbench_analytics import resolve_workbench_context

pytestmark = pytest.mark.postgres
CORPUS, DIGEST = load_corpus(ROOT / "evaluation/assistant/ag-v3.json")
CASES = replay_cases(CORPUS)
TRANSCRIPTS = ROOT / "evaluation/assistant/transcripts/ag-v3/fixture"


@pytest.fixture(scope="module")
def replay_db():
    url = os.environ.get("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("Use make test-python for disposable PostgreSQL")
    root = create_engine(url)
    schema = "ag06_" + uuid4().hex
    with root.begin() as connection:
        connection.execute(text(f"CREATE SCHEMA {schema}"))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as session:
            add_workbench_dataset(
                session,
                dataset_id=FIXTURE_DATASET,
                snapshot_id=FIXTURE_RELEASE,
                published_at=FIXTURE_TIME,
            )
            yield session
    finally:
        engine.dispose()
        with root.begin() as connection:
            connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        root.dispose()


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
def test_frozen_replay_against_fixture_sql(replay_db, case):
    session = replay_db
    context = resolve_workbench_context(
        session,
        release_id=FIXTURE_RELEASE,
        requested_season=case.get("season", "2025-26"),
        requested_before_date=request_for(case).context.before_date,
    )
    expected = oracle_answer(session, context, case)
    previous = []
    stages = [("setup", case["setup"]["message"])] if case.get("setup") else []
    stages.append(("answer", case["message"]))
    for stage, message in stages:
        path = TRANSCRIPTS / f"{case['id']}-{stage}.json.gz"
        request = request_for(case, message)
        if os.environ.get("AG06_CAPTURE_REPLAY") == "1":
            provider = AuthoredProvider(session, case, setup=stage == "setup")
        else:
            record = read_record(path)
            assert record["capture_mode"] == "authored_fixture_not_language_accuracy"
            assert record["corpus_sha256"] == DIGEST
            assert record["request"] == request.model_dump(mode="json")
            provider = ReplayProvider(
                record["model"],
                [RecordedStep.model_validate(s) for s in record["steps"]],
                expected_tools=record["tools"],
            )
        run = run_turn(
            session,
            request,
            provider=provider,
            settings=Settings(_env_file=None, assistant_provider="none"),
            today=TODAY,
            turn_id=UUID(int=608),
            history=previous,
        )
        if os.environ.get("AG06_CAPTURE_REPLAY") == "1":
            TRANSCRIPTS.mkdir(parents=True, exist_ok=True)
            with gzip.open(path, "xt") as handle:
                json.dump(
                    {
                        **run.transcript,
                        "request": request.model_dump(mode="json"),
                        "corpus_sha256": DIGEST,
                        "capture_mode": "authored_fixture_not_language_accuracy",
                    },
                    handle,
                )
        else:
            assert provider.exhausted
            assert (
                hashlib.sha256(path.read_bytes()).hexdigest()
                == json.loads((TRANSCRIPTS / "manifest.json").read_text())["sha256"][path.name]
            )
        if stage == "setup":
            previous.append(history_record(request, run.response))
        else:
            score = score_answer(case, expected, run.response, run.transcript)
            assert score["exact_answer"], score


def test_replay_tool_payload_mutation_is_a_failure(replay_db):
    case = CASES[0]
    path = TRANSCRIPTS / f"{case['id']}-answer.json.gz"
    record = read_record(path)
    record["tools"][0]["full_payload"]["data"]["items"][0]["metrics"]["pts_per_game"] = -999
    provider = ReplayProvider(
        record["model"],
        [RecordedStep.model_validate(s) for s in record["steps"]],
        expected_tools=record["tools"],
    )
    with pytest.raises(ValueError, match="payload drift"):
        run_turn(
            replay_db,
            request_for(case),
            provider=provider,
            settings=Settings(_env_file=None, assistant_provider="none"),
            today=TODAY,
            turn_id=UUID(int=608),
        )
