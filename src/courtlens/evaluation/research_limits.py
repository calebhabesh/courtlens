"""Kernel-enforced experiment limits for the complete process tree; no uncapped fallback."""

from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

from courtlens.domain.research_registration import ComputeBudget

THREAD_ENV = (
    "OMP_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "MKL_NUM_THREADS",
    "BLIS_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS",
    "NUMEXPR_NUM_THREADS",
)


def cgroup_usage() -> dict[str, Any]:
    line = Path("/proc/self/cgroup").read_text().strip()
    if not line.startswith("0::/"):
        raise ValueError("cgroup v2 process accounting required")
    root = Path("/sys/fs/cgroup") / line[4:]
    maximum = (root / "memory.max").read_text().strip()
    if maximum == "max":
        raise ValueError("experiment memory limit is not kernel enforced")
    return {
        "memory_limit_bytes": int(maximum),
        "aggregate_memory_peak_bytes": int((root / "memory.peak").read_text()),
        "cpu_max": (root / "cpu.max").read_text().strip(),
        "pids_max": (root / "pids.max").read_text().strip(),
        "memory_events": (root / "memory.events").read_text().strip(),
        "cpu_affinity": sorted(os.sched_getaffinity(0)),
    }


def run_limited(
    command: list[str], *, budget: ComputeBudget, output: Path, working_directory: Path
) -> dict[str, Any]:
    """A systemd user service supplies memory.max, CPU quota/affinity and wall termination.

    The memory charge includes descendants and file cache (stronger than an RSS-only cap).
    Commands are argument arrays; no shell interpolation and no API entry point.
    """
    output.mkdir(parents=True, exist_ok=False)
    unit = f"courtlens-research-{uuid4().hex}"
    cpus = sorted(os.sched_getaffinity(0))[: budget.cpu_threads]
    if len(cpus) != budget.cpu_threads:
        raise ValueError("insufficient allowed CPUs for frozen budget")
    argv = [
        "systemd-run",
        "--user",
        "--no-ask-password",
        "--wait",
        "--pipe",
        "--collect",
        f"--unit={unit}",
        f"--working-directory={working_directory.resolve()}",
        f"--property=MemoryMax={budget.max_peak_rss_mib}M",
        "--property=MemorySwapMax=0",
        f"--property=CPUQuota={100 * budget.cpu_threads}%",
        f"--property=AllowedCPUs={','.join(str(cpu) for cpu in cpus)}",
        "--property=TasksMax=16",
        f"--property=RuntimeMaxSec={budget.max_wall_seconds}s",
        "--property=KillMode=control-group",
        "--property=OOMPolicy=kill",
        "--property=Nice=10",
        "--expand-environment=no",
        *(f"--setenv={name}={budget.cpu_threads}" for name in THREAD_ENV),
        "--setenv=PYTHONHASHSEED=2501",
        "taskset",
        "--cpu-list",
        ",".join(str(cpu) for cpu in cpus),
        *command,
    ]
    started = time.monotonic()
    try:
        with (
            (output / "stdout.log").open("xb") as stdout,
            (output / "supervisor.log").open("xb") as stderr,
        ):
            process = subprocess.run(
                argv,
                stdout=stdout,
                stderr=stderr,
                timeout=budget.max_wall_seconds + 15,
                check=False,
            )
        result = {
            "status": "completed" if process.returncode == 0 else "failed_or_limited",
            "exit_code": process.returncode,
            "wall_seconds": time.monotonic() - started,
            "enforcement": "systemd_user_service_cgroup_v2",
            "cpu_threads": budget.cpu_threads,
            "max_aggregate_memory_mib": budget.max_peak_rss_mib,
            "max_wall_seconds": budget.max_wall_seconds,
            "unit": unit,
        }
    except (OSError, subprocess.TimeoutExpired) as exc:
        # Killing systemd-run itself would not kill the service. Always stop its cgroup.
        subprocess.run(["systemctl", "--user", "stop", unit], capture_output=True, check=False)
        result = {
            "status": "failed_or_limited",
            "wall_seconds": time.monotonic() - started,
            "reason": type(exc).__name__,
            "enforcement": "no_uncapped_fallback",
        }
    with (output / "limits.json").open("x") as stream:
        json.dump(result, stream, sort_keys=True, indent=2)
        stream.write("\n")
    return result
