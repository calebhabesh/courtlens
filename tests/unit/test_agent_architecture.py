"""Keep the agent runtime independent of the retired compatibility pipeline."""

import subprocess
import sys


def test_agent_entry_points_do_not_load_retired_pipeline() -> None:
    subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; "
            "import courtlens.services.assistant.agent.loop; "
            "import courtlens.services.assistant.status; "
            "import courtlens.services.assistant.history; "
            "import courtlens.services.assistant.streaming; "
            "assert not any(name.startswith('courtlens.services.assistant.legacy') "
            "for name in sys.modules)",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
