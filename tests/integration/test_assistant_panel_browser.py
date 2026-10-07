"""AR07 rendered panels through the Next proxy to disposable PostgreSQL/FastAPI.

Opt in with COURTLENS_AR07_BROWSER_BASE_URL and COURTLENS_AR07_DASHBOARD_DIR.
The supplied Next server must target this fixture's port (4208 by default).
"""

import json
import os
import subprocess
import threading
from unittest.mock import patch

import pytest
import uvicorn
from sqlalchemy.orm import Session
from test_conversation_postgres import postgres_conversation as _postgres_fixture

from courtlens.api.app import create_app
from courtlens.database import get_db
from courtlens.domain.conversation import AnalysisPlan, OperationStep
from courtlens.services.assistant.hybrid import run_hybrid_turn
from courtlens.services.assistant.planner import PlanningOutput

postgres_conversation = _postgres_fixture


@pytest.mark.skipif(
    not os.environ.get("COURTLENS_AR07_BROWSER_BASE_URL"),
    reason="isolated Next browser server required",
)
def test_rendered_panels_resolve_page_referents(postgres_conversation):
    session, context = postgres_conversation
    engine = session.get_bind()
    app = create_app()

    def database():
        with Session(engine) as local:
            yield local

    app.dependency_overrides[get_db] = database

    class FixtureProvider:
        def plan(self, payload, *, timeout_seconds):
            body = json.loads(payload)
            refs = body["page_referents"]
            field = "team_id" if "team_id" in refs else "player_id"
            return PlanningOutput(
                AnalysisPlan(
                    steps=[
                        OperationStep(
                            step_id="page",
                            operation="team" if field == "team_id" else "profile",
                            arguments={field: refs[field]},
                        )
                    ]
                ).model_dump(mode="json")
            )

    def fixture_turn(*args, **kwargs):
        kwargs["provider"] = FixtureProvider()
        return run_hybrid_turn(*args, **kwargs)

    server = uvicorn.Server(
        uvicorn.Config(
            app,
            host="127.0.0.1",
            port=int(os.environ.get("COURTLENS_AR07_API_PORT", "4208")),
            log_level="warning",
        )
    )
    worker = threading.Thread(target=server.run, daemon=True)
    with patch("courtlens.services.assistant.history.run_hybrid_turn", side_effect=fixture_turn):
        worker.start()
        try:
            # Browser navigation retries its API calls; a bounded event wait only covers startup.
            for _ in range(100):
                if server.started:
                    break
                threading.Event().wait(0.05)
            assert server.started
            env = {
                **os.environ,
                "PLAYWRIGHT_EXTERNAL_SERVER": "true",
                "PLAYWRIGHT_BASE_URL": os.environ["COURTLENS_AR07_BROWSER_BASE_URL"],
                "COURTLENS_AR07_RELEASE_ID": context.release_id,
            }
            result = subprocess.run(
                [
                    "npm",
                    "run",
                    "test:browser",
                    "--",
                    "e2e/assistant-panel-real.spec.ts",
                    "--workers=1",
                ],
                cwd=os.environ["COURTLENS_AR07_DASHBOARD_DIR"],
                env=env,
                capture_output=True,
                text=True,
                timeout=180,
                check=False,
            )
            print(result.stdout)
            print(result.stderr)
            assert result.returncode == 0
        finally:
            server.should_exit = True
            worker.join(timeout=10)
