"""Real kernel limits on synthetic children; never touches production artifacts or models."""

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from courtload.domain.research_registration import ComputeBudget
from courtload.evaluation.research_limits import run_limited


@pytest.mark.parametrize(
    "code,expected",
    [
        ('print("bounded probe")', "completed"),
        (
            "import os,subprocess,sys; assert len(os.sched_getaffinity(0)) == 1; "
            "subprocess.run([sys.executable,'-c',"
            "'import os; assert len(os.sched_getaffinity(0)) == 1'], check=True)",
            "completed",
        ),
        ("import time; time.sleep(5)", "failed_or_limited"),
        ("x=bytearray(256*1024*1024); print(len(x))", "failed_or_limited"),
        (
            "import subprocess,sys; "
            'subprocess.run([sys.executable,"-c","x=bytearray(256*1024*1024)"])',
            "failed_or_limited",
        ),
    ],
)
def test_process_and_child_time_memory_are_kernel_bounded(
    tmp_path: Path, code: str, expected: str
) -> None:
    if (
        not shutil.which("systemd-run")
        or subprocess.run(
            ["systemctl", "--user", "show-environment"], capture_output=True
        ).returncode
    ):
        pytest.skip("systemd user manager required for kernel-cap verification")
    budget = ComputeBudget(
        cpu_threads=1,
        max_peak_rss_mib=32,
        max_wall_seconds=1,
        max_rows=100,
        max_features=5,
        max_candidate_fits=2,
        sparse_lineup_matrix=True,
        breach_policy="stop_record_failure_amend_before_evaluation",
    )
    result = run_limited(
        [sys.executable, "-c", code],
        budget=budget,
        output=tmp_path / "limits",
        working_directory=Path.cwd(),
    )
    assert result["status"] == expected
    assert result["enforcement"] == "systemd_user_service_cgroup_v2"
    assert result["wall_seconds"] < 10
