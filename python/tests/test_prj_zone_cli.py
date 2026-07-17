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


def _run_cli(*arguments: str) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment["PYTHONUTF8"] = "1"
    return subprocess.run(
        [sys.executable, "-m", "contam_studio_core.prj_zone_reader", *arguments],
        cwd=REPO_ROOT,
        capture_output=True,
        check=False,
        text=True,
        encoding="utf-8",
        env=environment,
        timeout=30,
    )


def test_cli_success_outputs_only_json() -> None:
    completed = _run_cli(str(OFFICIAL_PRJ), "--json")

    assert completed.returncode == 0
    assert completed.stderr == ""
    payload = json.loads(completed.stdout)
    assert payload["reader_mode"] == "strict_contam_3_4_simple_zone_v1"
    assert payload["declared_zone_count"] == 7
    assert len(payload["zones"]) == 7
    assert payload["first_zone"]["name"] == "One"


def test_cli_failure_outputs_structured_error_to_stderr(tmp_path: Path) -> None:
    source = tmp_path / "non-ascii.prj"
    source.write_bytes(b"ContamW 3.4.0.4 0\n\xff")

    completed = _run_cli(str(source), "--json")

    assert completed.returncode == 3
    assert completed.stdout == ""
    diagnostic = json.loads(completed.stderr)
    assert diagnostic["code"] == "non_ascii_prj"
    assert diagnostic["source_line_number"] == 2


def test_cli_missing_source_has_stable_exit_code(tmp_path: Path) -> None:
    completed = _run_cli(str(tmp_path / "missing.prj"), "--json")

    assert completed.returncode == 2
    assert completed.stdout == ""
    assert json.loads(completed.stderr)["code"] == "source_not_found"


def test_cli_help_distinguishes_pure_document_reader() -> None:
    completed = _run_cli("--help")

    assert completed.returncode == 0
    assert "纯文档读取" in completed.stdout
    assert "不调用contamxpy、ContamX或仿真初始化" in completed.stdout
