from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OFFICIAL_PRJ = REPO_ROOT / "fixtures" / "contam" / "official-contamxpy" / "test_GetPrjInfo.prj"


def _run_cli(*arguments: str) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment["PYTHONUTF8"] = "1"
    return subprocess.run(
        [sys.executable, "-m", "contam_studio_core.zone_volume_patch", *arguments],
        cwd=REPO_ROOT,
        capture_output=True,
        check=False,
        text=True,
        encoding="utf-8",
        env=environment,
        timeout=30,
    )


def test_plan_cli_outputs_only_json() -> None:
    completed = _run_cli(
        "plan",
        str(OFFICIAL_PRJ),
        "--zone-number",
        "1",
        "--new-volume",
        "650.0",
        "--json",
    )

    assert completed.returncode == 0
    assert completed.stderr == ""
    payload = json.loads(completed.stdout)
    assert payload["patch_type"] == "replace_zone_volume"
    assert payload["status"] == "planned"
    assert payload["target"]["field"] == "volume_m3"
    assert payload["preconditions"]["old_token"] == "600"
    assert payload["replacement"]["new_token"] == "650.0"


def test_plan_diff_is_separate_from_json() -> None:
    completed = _run_cli(
        "plan",
        str(OFFICIAL_PRJ),
        "--zone-number",
        "1",
        "--new-volume",
        "650.0",
        "--diff",
    )

    assert completed.returncode == 0
    assert completed.stderr == ""
    assert completed.stdout.startswith("--- test_GetPrjInfo.prj\n+++ proposed-copy.prj\n")
    assert "@@ Zone 1, source line 243, field volume_m3 @@" in completed.stdout
    assert '"patch_type"' not in completed.stdout


def test_apply_cli_creates_new_copy_and_outputs_json(tmp_path: Path) -> None:
    output = tmp_path / "copy.prj"
    completed = _run_cli(
        "apply",
        str(OFFICIAL_PRJ),
        "--zone-number",
        "1",
        "--new-volume",
        "650.0",
        "--output",
        str(output),
        "--json",
    )

    assert completed.returncode == 0
    assert completed.stderr == ""
    payload = json.loads(completed.stdout)
    assert payload["status"] == "applied"
    assert payload["source_unchanged"] is True
    assert payload["new_token"] == "650.0"
    assert payload["generated_artifacts"] == []
    assert output.is_file()


def test_cli_failure_is_structured_json_without_traceback(tmp_path: Path) -> None:
    completed = _run_cli(
        "plan",
        str(tmp_path / "missing.prj"),
        "--zone-number",
        "1",
        "--new-volume",
        "650.0",
        "--json",
    )

    assert completed.returncode == 2
    assert completed.stdout == ""
    diagnostic = json.loads(completed.stderr)
    assert diagnostic["code"] == "source_not_found"
    assert "Traceback" not in completed.stderr


def test_cli_rejects_invalid_value_without_traceback() -> None:
    completed = _run_cli(
        "plan",
        str(OFFICIAL_PRJ),
        "--zone-number",
        "1",
        "--new-volume",
        "Infinity",
        "--json",
    )

    assert completed.returncode == 20
    assert completed.stdout == ""
    diagnostic = json.loads(completed.stderr)
    assert diagnostic["code"] == "patch_new_value_invalid"
    assert "Traceback" not in completed.stderr


def test_cli_never_overwrites_existing_output(tmp_path: Path) -> None:
    output = tmp_path / "existing.prj"
    output.write_bytes(b"must remain")
    completed = _run_cli(
        "apply",
        str(OFFICIAL_PRJ),
        "--zone-number",
        "1",
        "--new-volume",
        "650.0",
        "--output",
        str(output),
        "--json",
    )

    assert completed.returncode == 25
    assert completed.stdout == ""
    assert json.loads(completed.stderr)["code"] == "patch_output_exists"
    assert output.read_bytes() == b"must remain"
    assert "Traceback" not in completed.stderr
