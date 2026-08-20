from __future__ import annotations

import json
from pathlib import Path

import pytest

from contam_studio_core.simread_models import ResultDiagnostic
from contam_studio_core.zone_air_state_results import ZoneResultError, parse_zone_air_state


HEADER = "Date\tTime\tNode\tT (C)\tP (Pa)\tD (kg/m3)\n"


def write_nfr(path: Path, body: str) -> Path:
    path.write_text(HEADER + body, encoding="ascii", newline="")
    return path


def test_parse_zone_air_state_converts_units_and_preserves_order(tmp_path: Path) -> None:
    path = write_nfr(
        tmp_path / "model.nfr",
        "1/1\t00:00:00\t1\t  20.000  \t -1.4222e+00 \t 1.2041 \n1/1\t00:05:00\t1\t21.000\t0\t1.2\n",
    )
    samples = parse_zone_air_state(path, 1)
    assert len(samples) == 2
    assert samples[0].temperature_k == pytest.approx(293.15)
    assert samples[0].reference_pressure_pa == pytest.approx(-1.4222)
    assert samples[1].sim_time_seconds == 300
    assert samples[0].day_type is None


def test_parse_zone_air_state_accepts_official_24_hour_marker(tmp_path: Path) -> None:
    path = write_nfr(
        tmp_path / "model.nfr", "1/1\t24:00:00\t1\t20\t0\t1\n1/2\t00:05:00\t1\t20\t0\t1\n"
    )
    samples = parse_zone_air_state(path, 1)
    assert samples[-1].sim_time_seconds == 300
    assert samples[-1].day_of_year == 2


@pytest.mark.parametrize(
    "body",
    [
        "1/1\t00:00:00\t1\tNaN\t0\t1\n",
        "1/1\t00:00:00\t1\t20\t0\tInfinity\n",
        "1/1\t00:00:00\t2\t20\t0\t1\n",
        "1/1\t00:00:00\t1\t20\t0\n",
    ],
)
def test_parse_zone_air_state_rejects_unsupported_rows(tmp_path: Path, body: str) -> None:
    with pytest.raises(ZoneResultError):
        parse_zone_air_state(write_nfr(tmp_path / "bad.nfr", body), 1)


def test_diagnostic_is_json_serializable() -> None:
    assert json.dumps(ResultDiagnostic("x", "y").to_dict(), ensure_ascii=False)


@pytest.mark.parametrize(
    "content",
    [
        "",
        HEADER,
        HEADER.replace("Node", "Node\tNode"),
        HEADER + "1/1\t00:00:00\t1\t20\t0\t1\textra\n",
        HEADER + "1/1\t00:00:00\t1\t20\t0\tNaN\n",
        HEADER + "1/1\t00:00:00\t1\t1e999\t0\t1\n",
        HEADER + "2/29\t00:00:00\t1\t20\t0\t1\n",
        HEADER + "1/1\t24:01:00\t1\t20\t0\t1\n",
        HEADER + "1/1\t00:00:00\t1\t20\t0\t1\n1/1\t00:00:00\t1\t20\t0\t1\n",
        HEADER + "1/1\t00:05:00\t1\t20\t0\t1\n1/1\t00:00:00\t1\t20\t0\t1\n",
        HEADER + "1/1\t00:00:00\t1\t2 0\t0\t1\n",
        HEADER + "1/1\t00:00:00\t1\t1 .2\t0\t1\n",
    ],
)
def test_parse_zone_air_state_rejects_strict_contract_edges(tmp_path: Path, content: str) -> None:
    path = tmp_path / "edge.nfr"
    path.write_bytes(content.encode("ascii"))
    with pytest.raises(ZoneResultError):
        parse_zone_air_state(path, 1)


def test_parse_zone_air_state_accepts_crlf(tmp_path: Path) -> None:
    path = tmp_path / "crlf.nfr"
    path.write_bytes((HEADER + "1/1\t00:00:00\t1\t 20 \t 0 \t 1 \r\n").encode("ascii"))
    assert parse_zone_air_state(path, 1)[0].day_type is None


def test_parse_zone_air_state_rejects_non_ascii(tmp_path: Path) -> None:
    path = tmp_path / "non-ascii.nfr"
    path.write_bytes(
        (HEADER + "1/1\t00:00:00\t1\t20\t0\t1\xff\n").encode("ascii", errors="ignore") + b"\xff"
    )
    with pytest.raises(ZoneResultError):
        parse_zone_air_state(path, 1)


def test_day_type_is_explicitly_unavailable(tmp_path: Path) -> None:
    samples = parse_zone_air_state(
        write_nfr(tmp_path / "one.nfr", "1/1\t00:00:00\t1\t20\t0\t1\n"), 1
    )
    assert samples[0].day_type is None
