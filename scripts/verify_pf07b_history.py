"""Real process restart and production browser/proxy checks on a disposable database."""

import json
import os
import subprocess
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import httpx
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from courtload.assistant_history_models import AssistantTurn
from courtload.domain.hybrid_assistant import HybridTurnRequest
from courtload.services.assistant.history import accept

DIRECTORY = Path("docs/evidence/pf07b-history")
DATABASE = "postgresql+psycopg://courtload:courtload@127.0.0.1:5432/courtload_pf07b_history"
TOKEN = "pf07b-disposable-operator"


def main() -> None:
    environment = dict(
        os.environ,
        COURTLOAD_DATABASE_URL=DATABASE,
        COURTLOAD_OPERATOR_TOKEN=TOKEN,
        COURTLOAD_GEMINI_API_KEY="",
        GEMINI_API_KEY="",
    )
    log = (DIRECTORY / "service.log").open("w")
    processes = []

    def backend():
        process = subprocess.Popen(
            [
                ".venv/bin/uvicorn",
                "courtload.api.app:create_app",
                "--factory",
                "--host",
                "127.0.0.1",
                "--port",
                "8178",
            ],
            env=environment,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        processes.append(process)
        for _ in range(100):
            try:
                if (
                    httpx.get(
                        "http://127.0.0.1:8178/api/workbench/assistant/v2/threads", timeout=1
                    ).status_code
                    == 200
                ):
                    return process
            except httpx.HTTPError:
                pass
            time.sleep(0.1)
        raise RuntimeError("Backend did not start")

    checks = []
    try:
        process = backend()
        with httpx.Client(
            base_url="http://127.0.0.1:8178/api/workbench/assistant/v2",
            headers={"X-Operator-Token": TOKEN},
        ) as client:

            def call(method, path, *, expected=200, **kwargs):
                started = time.monotonic()
                response = client.request(method, path, **kwargs)
                assert response.status_code == expected, response.text
                value = response.json()
                checks.append(
                    {
                        "method": method,
                        "path": path,
                        "status": response.status_code,
                        "elapsed_ms": round((time.monotonic() - started) * 1000, 3),
                        "response": value,
                    }
                )
                return value

            thread = call("POST", "/threads", expected=201)
            request = {
                "request_id": str(uuid4()),
                "thread_id": thread["thread_id"],
                "message": "Explain pick and roll",
            }
            answer = call("POST", "/turn", json=request)
            assert answer["accounting"]["provider_calls"] == 0
            assert call("POST", "/turn", json=request) == answer
            call("POST", "/turn", json={**request, "message": "edited"}, expected=409)
            build = Path((DIRECTORY / "build-directory.txt").read_text().strip())
            next_environment = dict(
                os.environ,
                PORT="3178",
                HOSTNAME="127.0.0.1",
                COURTLOAD_API_INTERNAL_URL="http://127.0.0.1:8178",
                COURTLOAD_OPERATOR_TOKEN=TOKEN,
            )
            next_log = (DIRECTORY / "dashboard-service.log").open("w")
            frontend = subprocess.Popen(
                ["node", "server.js"],
                cwd=build / ".next/standalone",
                env=next_environment,
                stdout=next_log,
                stderr=subprocess.STDOUT,
            )
            processes.append(frontend)
            for _ in range(100):
                try:
                    if (
                        httpx.get(
                            "http://127.0.0.1:3178/api/assistant-v2/threads", timeout=1
                        ).status_code
                        == 200
                    ):
                        break
                except httpx.HTTPError:
                    pass
                time.sleep(0.1)
            with httpx.Client(base_url="http://127.0.0.1:3178") as proxy:
                assert (
                    proxy.post(
                        "/api/assistant-v2/threads", headers={"Origin": "https://untrusted.example"}
                    ).status_code
                    == 403
                )
                assert proxy.delete("/api/assistant-v2/threads").status_code == 403
            subprocess.run(["node", "scripts/verify_pf07b_browser.cjs"], check=True)
            # Simulate durable accepted work abandoned by the process, rather than rerun it.
            engine = create_engine(DATABASE)
            with Session(engine) as session:
                pending = accept(
                    session,
                    HybridTurnRequest(
                        request_id=uuid4(),
                        thread_id=thread["thread_id"],
                        message="Explain pick and roll",
                    ),
                )
                row = session.get(AssistantTurn, str(pending.turn_id))
                row.state = "running"
                row.lease_until = datetime.now(UTC) - timedelta(seconds=1)
                session.commit()
            process.terminate()
            process.wait(timeout=10)
            backend()
            assert call("POST", "/turn", json=request) == answer
            retained = call("GET", f"/threads/{thread['thread_id']}/turns")
            assert retained["turns"][0]["response"] == answer
            assert retained["turns"][1]["state"] == "failed"
            retry = {
                "request_id": str(uuid4()),
                "thread_id": thread["thread_id"],
                "retry_of": str(pending.turn_id),
                "message": "Explain pick and roll",
            }
            assert call("POST", "/turn", json=retry)["status"] == "answered"
            with Session(engine) as session:
                stopped = accept(
                    session,
                    HybridTurnRequest(
                        request_id=uuid4(),
                        thread_id=thread["thread_id"],
                        message="Explain pick and roll",
                    ),
                )
            cancelled = call(
                "POST", f"/threads/{thread['thread_id']}/turns/{stopped.turn_id}/cancel"
            )
            assert cancelled["state"] == "cancelled"
            assert (
                call("POST", "/turn", json=stopped.request.model_dump(mode="json"))
                == cancelled["response"]
            )
            call("DELETE", f"/threads/{thread['thread_id']}")
            call("GET", f"/threads/{thread['thread_id']}/turns", expected=404)
            browser = json.loads((DIRECTORY / "browser.json").read_text())
            call("GET", f"/threads/{browser['answer']['thread_id']}/turns")
            call("DELETE", "/threads")
            assert call("GET", "/threads")["threads"] == []
            with Session(engine) as session:
                assert not session.scalars(select(AssistantTurn)).all()
            engine.dispose()
        (DIRECTORY / "http.json").write_text(
            json.dumps(
                {
                    "environment": (
                        "actual Uvicorn restart and production Next proxy; "
                        "disposable PostgreSQL 17; zero provider calls"
                    ),
                    "checks": checks,
                },
                indent=2,
            )
            + "\n"
        )
        print(f"{len(checks)} service checks and 4 browser proxy checks passed")
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
        log.close()


if __name__ == "__main__":
    import sys

    if "--retained-only" in sys.argv:
        import verify_pf07a_assistant as verifier

        verifier.DIRECTORY = DIRECTORY
        print(verifier.verify_retained())
    else:
        main()
