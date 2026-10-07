"""Real free-source reads and v2 HTTP/restart evidence in an isolated local database."""

import json
import os
import subprocess
import time
from dataclasses import asdict
from pathlib import Path
from uuid import uuid4

import httpx
from sqlalchemy import create_engine, text

from courtlens.domain.hybrid_assistant import HybridTurnResponse
from courtlens.services.assistant.retrieval import (
    SOURCES,
    RetrievalBudget,
    clear_cache,
    retrieve_source,
)

DIRECTORY = Path("docs/evidence/pf07c-retrieval")
DATABASE = "postgresql+psycopg://courtlens:courtlens@127.0.0.1:5432/courtlens_pf07c_retrieval"
TOKEN = "pf07c-disposable-operator"


def verify_sources() -> None:
    clear_cache()
    observations = []
    for spec in SOURCES:
        started = time.monotonic()
        budget = RetrievalBudget(started + 45)
        source = retrieve_source(spec, budget)
        assert source.verification == "verified" and source.facts
        observations.append(
            {
                "registry": asdict(spec),
                "source": source.model_dump(mode="json"),
                "requests": budget.requests,
                "response_bytes": budget.response_bytes,
                "extracted_text_bytes": budget.text_bytes,
                "elapsed_ms": round((time.monotonic() - started) * 1000, 3),
            }
        )
    (DIRECTORY / "sources.json").write_text(json.dumps(observations, indent=2) + "\n")


def verify_http() -> None:
    admin = create_engine(DATABASE.rsplit("/", 1)[0] + "/postgres", isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        if not connection.scalar(
            text("SELECT 1 FROM pg_database WHERE datname='courtlens_pf07c_retrieval'")
        ):
            connection.execute(text("CREATE DATABASE courtlens_pf07c_retrieval"))
    admin.dispose()
    environment = dict(
        os.environ,
        COURTLENS_DATABASE_URL=DATABASE,
        COURTLENS_OPERATOR_TOKEN=TOKEN,
        COURTLENS_GEMINI_API_KEY="",
        GEMINI_API_KEY="",
    )
    with (DIRECTORY / "fresh-migrations.log").open("w") as log:
        subprocess.run(
            [".venv/bin/alembic", "upgrade", "head"],
            env=environment,
            stdout=log,
            stderr=subprocess.STDOUT,
            check=True,
        )
    checks = []
    created = []
    process = None
    with (DIRECTORY / "service.log").open("w") as log:

        def start():
            child = subprocess.Popen(
                [
                    ".venv/bin/uvicorn",
                    "courtlens.api.app:create_app",
                    "--factory",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8179",
                ],
                env=environment,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            for _ in range(100):
                try:
                    if (
                        httpx.get(
                            "http://127.0.0.1:8179/api/workbench/assistant/v2/threads", timeout=0.5
                        ).status_code
                        == 200
                    ):
                        return child
                except httpx.HTTPError:
                    pass
                if child.poll() is not None:
                    raise RuntimeError("Backend exited; inspect service.log")
                time.sleep(0.1)
            child.terminate()
            child.wait(timeout=10)
            raise RuntimeError("Backend readiness failed")

        try:
            process = start()
            with httpx.Client(
                base_url="http://127.0.0.1:8179/api/workbench/assistant/v2",
                headers={"X-Operator-Token": TOKEN},
                timeout=46,
            ) as client:

                def call(method, path, **kwargs):
                    started = time.monotonic()
                    response = client.request(method, path, **kwargs)
                    response.raise_for_status()
                    value = response.json()
                    checks.append(
                        {
                            "method": method,
                            "path": path,
                            "http_status": response.status_code,
                            "elapsed_ms": round((time.monotonic() - started) * 1000, 3),
                            "response": value,
                        }
                    )
                    return value

                answers = []
                for message, expected in [
                    ("When did NBA 2023-24 regular season start?", "answered"),
                    ("When does NBA 2026-27 regular season start?", "answered"),
                    ("What is an assist?", "answered"),
                    ("Explain pick and roll", "answered"),
                    ("Who is on the roster today?", "unable"),
                    ("Read web https://127.0.0.1/secrets", "unable"),
                    ("Which point guard had the most assists per game last season?", "unable"),
                    ("When did NBA 2023-24 regular season start?; What is an assist?", "answered"),
                ]:
                    request = {"request_id": str(uuid4()), "message": message}
                    value = call("POST", "/turn", json=request)
                    answer = HybridTurnResponse.model_validate(value)
                    assert answer.status == expected and not answer.saveable
                    assert (
                        answer.accounting.provider_calls == answer.accounting.analytical_calls == 0
                    )
                    created.append(str(answer.thread_id))
                    answers.append((request, value))
                assert answers[0][1]["accounting"]["source_requests"] == 1
                assert answers[7][1]["accounting"]["source_requests"] == 0
                original, value = answers[0]
                cached = call(
                    "POST",
                    "/turn",
                    json={
                        "request_id": str(uuid4()),
                        "thread_id": value["thread_id"],
                        "message": original["message"],
                    },
                )
                assert cached["accounting"]["source_requests"] == 0
                assert cached["sources"] == value["sources"]
                assert call("POST", "/turn", json=original) == value
                retained = call("GET", f"/threads/{value['thread_id']}/turns")
                assert retained["turns"][0]["response"] == value
                process.terminate()
                process.wait(timeout=10)
                process = start()
                assert call("POST", "/turn", json=original) == value
                assert call("GET", f"/threads/{value['thread_id']}/turns") == retained
                for thread_id in created:
                    response = client.delete(f"/threads/{thread_id}")
                    response.raise_for_status()
        finally:
            if process and process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
    (DIRECTORY / "http.json").write_text(json.dumps(checks, indent=2) + "\n")
    print(f"{len(checks)} real HTTP/restart checks passed; zero model/analytical calls")


if __name__ == "__main__":
    import sys

    DIRECTORY.mkdir(exist_ok=True, parents=True)
    if "--retained-only" in sys.argv:
        import verify_pf07a_assistant as verifier

        verifier.DIRECTORY = DIRECTORY
        print(verifier.verify_retained())
    else:
        verify_sources()
        verify_http()
