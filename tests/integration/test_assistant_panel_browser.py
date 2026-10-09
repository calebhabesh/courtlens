"""AR07 rendered panels through the Next proxy to disposable PostgreSQL/FastAPI.

Opt in with COURTLENS_AR07_BROWSER_BASE_URL and COURTLENS_AR07_DASHBOARD_DIR.
The supplied Next server must target this fixture's port (4208 by default).
"""

import os
import subprocess
import threading
from unittest.mock import patch

import pytest
import uvicorn
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_conversation_postgres import postgres_conversation as _postgres_fixture

from courtlens.api.app import create_app
from courtlens.database import get_db
from courtlens.services.assistant.agent.loop import run_turn
from courtlens.services.assistant.agent.providers.base import AgentStep, ToolCall
from courtlens.workbench_models import WorkbenchPlayerGame, WorkbenchTeamGame

postgres_conversation = _postgres_fixture


@pytest.mark.skipif(
    not os.environ.get("COURTLENS_AR07_BROWSER_BASE_URL"),
    reason="isolated Next browser server required",
)
def test_rendered_panels_resolve_page_referents(postgres_conversation):
    session, context = postgres_conversation
    # The shared conversation fixture has player boxes only. Supply explicit team
    # observations so the real V3 team tool can verify its coverage requirement.
    for box in session.scalars(
        select(WorkbenchPlayerGame).where(WorkbenchPlayerGame.player_id == "1630567")
    ):
        session.add(
            WorkbenchTeamGame(
                dataset_id=box.dataset_id,
                game_id=box.game_id,
                team_id=box.team_id,
                opponent_id=box.opponent_id,
                game_date=box.game_date,
                season=box.season,
                phase=box.phase,
                side="home",
                points=100,
                opponent_points=95,
                stats_json={},
                source_version_id=box.source_version_id,
                source_observation_id=box.source_observation_id,
            )
        )
    session.commit()
    engine = session.get_bind()
    app = create_app()

    def database():
        with Session(engine) as local:
            yield local

    app.dependency_overrides[get_db] = database

    class FixtureProvider:
        model = "synthetic-browser-verification"

        def __init__(self):
            self.calls = 0

        def step(self, prompt, messages, tools, **kwargs):
            self.calls += 1
            if self.calls > 1:
                return AgentStep(text="The requested observations are shown below.")
            message = messages[-1].text
            team = "this team" in message
            return AgentStep(
                tool_calls=[
                    ToolCall(
                        id="page",
                        name="query_stats",
                        arguments={
                            "operation": "team" if team else "profile",
                            "arguments": {
                                "team_id" if team else "player_id": "this team" if team else "his"
                            },
                        },
                    )
                ]
            )

    def fixture_turn(*args, **kwargs):
        kwargs["provider"] = FixtureProvider()
        return run_turn(*args, **kwargs)

    server = uvicorn.Server(
        uvicorn.Config(
            app,
            host="127.0.0.1",
            port=int(os.environ.get("COURTLENS_AR07_API_PORT", "4208")),
            log_level="warning",
        )
    )
    worker = threading.Thread(target=server.run, daemon=True)
    with patch("courtlens.services.assistant.history.run_turn", side_effect=fixture_turn):
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
                "COURTLENS_REAL_WORKSPACE_TEST": "1",
            }
            result = subprocess.run(
                [
                    "npm",
                    "run",
                    "test:browser",
                    "--",
                    "e2e/assistant-panel-real.spec.ts",
                    "e2e/workspace-persistence.spec.ts",
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
