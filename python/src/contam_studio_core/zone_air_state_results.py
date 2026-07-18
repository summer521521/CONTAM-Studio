from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

from .simread_models import ResultDiagnostic, ZoneAirStateSample

_NUMBER = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")
_DATE = re.compile(r"^(\d{1,2})/(\d{1,2})$")
_TIME = re.compile(r"^(\d{2}):(\d{2}):(\d{2})$")
HEADER = ("Date", "Time", "Node", "T (C)", "P (Pa)", "D (kg/m3)")


class ZoneResultError(Exception):
    def __init__(self, diagnostic: ResultDiagnostic, exit_code: int = 2):
        super().__init__(diagnostic.message)
        self.diagnostic = diagnostic
        self.exit_code = exit_code


def _number(token: str, field: str, line: int) -> float:
    if not _NUMBER.fullmatch(token):
        raise ZoneResultError(
            ResultDiagnostic(
                "zone_result_contract_invalid",
                "结果数值格式不受支持。",
                {"field": field, "source_line_number": line},
            )
        )
    try:
        value = float(token)
    except (ValueError, OverflowError) as exc:
        raise ZoneResultError(
            ResultDiagnostic(
                "zone_result_contract_invalid",
                "结果数值无法转换。",
                {"field": field, "source_line_number": line},
            )
        ) from exc
    if not math.isfinite(value):
        raise ZoneResultError(
            ResultDiagnostic(
                "zone_result_contract_invalid",
                "结果数值必须为有限值。",
                {"field": field, "source_line_number": line},
            )
        )
    return value


def parse_zone_air_state(path: Path, zone_number: int) -> tuple[ZoneAirStateSample, ...]:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise ZoneResultError(
            ResultDiagnostic("simread_output_missing", "SimRead输出文件无法读取。")
        ) from exc
    try:
        text = raw.decode("ascii")
    except UnicodeDecodeError as exc:
        raise ZoneResultError(
            ResultDiagnostic("simread_output_invalid", "SimRead输出不是ASCII文本。")
        ) from exc
    lines = text.splitlines()
    if not lines or tuple(lines[0].split("\t")) != HEADER:
        raise ZoneResultError(
            ResultDiagnostic("zone_result_contract_invalid", "SimRead结果表头不匹配。")
        )
    samples: list[ZoneAirStateSample] = []
    previous_key: int | None = None
    first_key: int | None = None
    for line_number, line in enumerate(lines[1:], start=2):
        if not line:
            raise ZoneResultError(
                ResultDiagnostic(
                    "zone_result_contract_invalid",
                    "SimRead结果包含空行。",
                    {"source_line_number": line_number},
                )
            )
        fields = line.split("\t")
        if len(fields) != 6:
            raise ZoneResultError(
                ResultDiagnostic(
                    "zone_result_contract_invalid",
                    "SimRead结果列数不匹配。",
                    {"source_line_number": line_number, "field_count": len(fields)},
                )
            )
        date_match = _DATE.fullmatch(fields[0])
        time_match = _TIME.fullmatch(fields[1])
        if not date_match or not time_match:
            raise ZoneResultError(
                ResultDiagnostic(
                    "zone_result_contract_invalid",
                    "SimRead时间字段不匹配。",
                    {"source_line_number": line_number},
                )
            )
        month, day = (int(value) for value in date_match.groups())
        hour, minute, second = (int(value) for value in time_match.groups())
        if hour == 24 and minute == 0 and second == 0:
            hour_for_date = 0
            day_offset = 1
        else:
            hour_for_date = hour
            day_offset = 0
        try:
            datetime(2001, month, day, hour_for_date, minute, second) + timedelta(days=day_offset)
            day_of_year = datetime(2001, month, day).timetuple().tm_yday
        except ValueError as exc:
            raise ZoneResultError(
                ResultDiagnostic(
                    "zone_result_contract_invalid",
                    "SimRead日期无效。",
                    {"source_line_number": line_number},
                )
            ) from exc
        if not fields[2].isdigit() or int(fields[2]) != zone_number:
            raise ZoneResultError(
                ResultDiagnostic(
                    "zone_result_contract_invalid",
                    "SimRead结果Zone编号不匹配。",
                    {"source_line_number": line_number},
                )
            )
        temperature_c = _number(fields[3].strip(" "), "temperature_c", line_number)
        pressure = _number(fields[4].strip(" "), "reference_pressure_pa", line_number)
        density = _number(fields[5].strip(" "), "air_density_kg_m3", line_number)
        sim_time = float(hour * 3600 + minute * 60 + second)
        key = day_of_year * 86400 + int(sim_time)
        if previous_key is not None and key <= previous_key:
            raise ZoneResultError(
                ResultDiagnostic(
                    "zone_result_contract_invalid",
                    "SimRead时间点必须严格递增。",
                    {"source_line_number": line_number},
                )
            )
        previous_key = key
        if first_key is None:
            first_key = key
        samples.append(
            ZoneAirStateSample(
                len(samples),
                day_of_year,
                "calendar",
                float(key - first_key),
                temperature_c + 273.15,
                pressure,
                density,
            )
        )
    if not samples:
        raise ZoneResultError(
            ResultDiagnostic("zone_result_not_found", "没有可用的Zone空气状态结果。")
        )
    return tuple(samples)


def _cli() -> int:
    if len(sys.argv) > 1 and sys.argv[1] in {"probe-simread", "extract"} and (
        "--result-root" in sys.argv or sys.argv[1] == "probe-simread"
    ):
        from .simread_runner import _cli as runner_cli

        return runner_cli()
    parser = argparse.ArgumentParser(prog="zone_air_state_results")
    sub = parser.add_subparsers(dest="command", required=True)
    extract = sub.add_parser("extract")
    extract.add_argument("output", type=Path)
    extract.add_argument("--zone-number", type=int, required=True)
    extract.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if args.command == "extract":
        try:
            samples = parse_zone_air_state(args.output, args.zone_number)
            payload = {
                "result_type": "zone_air_state",
                "zone_number": args.zone_number,
                "sample_count": len(samples),
                "samples": [item.to_dict() for item in samples],
            }
            print(json.dumps(payload, ensure_ascii=False, allow_nan=False))
            return 0
        except ZoneResultError as exc:
            print(json.dumps(exc.diagnostic.to_dict(), ensure_ascii=False), file=sys.stderr)
            return exc.exit_code
    return 2


if __name__ == "__main__":
    raise SystemExit(_cli())
