from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def test_cli_does_not_fallback_to_path(tmp_path):
    process = subprocess.run(
        [sys.executable, "-m", "contam_studio_core.contamx_runner", "probe", "--json"],
        cwd=Path(__file__).parents[1],
        capture_output=True,
        text=False,
    )
    assert process.returncode != 0
    assert process.stdout == b""
    stderr = process.stderr.decode("utf-8")
    payload = json.loads(stderr)
    assert payload["code"] == "contamx_solver_not_configured"
    assert "Traceback" not in stderr
