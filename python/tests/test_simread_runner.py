from __future__ import annotations

from pathlib import Path

import pytest

from contam_studio_core import simread_runner
from contam_studio_core.simread_models import SimReadToolInfo


def test_simread_requires_explicit_or_environment_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(simread_runner.SIMREAD_ENVIRONMENT, raising=False)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.probe_simread(None)
    assert error.value.diagnostic.code == "simread_not_configured"


def test_simread_relative_path_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._resolve_tool(Path("simread.exe"))
    assert error.value.diagnostic.code == "simread_path_invalid"


def test_simread_tool_contract_is_structured() -> None:
    tool = SimReadToolInfo("C:/simread.exe", "simread.exe", "3.4.0.3", "a" * 64, 34816,
                           "windows-x64", "NIST", "stdin_v1")
    payload = tool.to_dict()
    assert payload["name"] == "simread.exe"
    assert payload["invocation_contract"] == "stdin_v1"


def test_result_root_conflict_diagnostic_code_is_stable() -> None:
    assert "result_root_conflicts_with_source" in simread_runner.ERROR_EXIT_CODES
