from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OFFICIAL_PRJ = (
    REPO_ROOT
    / "fixtures"
    / "contam"
    / "official-contamxpy"
    / "test_GetPrjInfo.prj"
)


def _run_cli(path: Path) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment["PYTHONUTF8"] = "1"
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "contam_studio_core.inspect_prj",
            str(path),
            "--json",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        check=False,
        text=True,
        encoding="utf-8",
        env=environment,
        timeout=90,
    )


def test_cli_success_outputs_only_json() -> None:
    completed = _run_cli(OFFICIAL_PRJ)
    assert completed.returncode == 0
    assert completed.stderr == ""
    payload = json.loads(completed.stdout)
    assert payload["source_unchanged"] is True
    assert payload["execution_mode"] == "isolated_steady_initialization"
    assert "inspection-source.sim" in payload["generated_artifacts"]
    assert payload["zone_count"] == 7
    assert payload["first_zone"]["number"] == 1
    assert payload["first_zone"]["name"] == "One"


def test_cli_missing_file_has_distinct_exit_code(tmp_path: Path) -> None:
    completed = _run_cli(tmp_path / "missing.prj")
    assert completed.returncode == 2
    assert completed.stdout == ""
    assert "source_not_found" in completed.stderr
