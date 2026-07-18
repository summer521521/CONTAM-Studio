from __future__ import annotations

import math
import re

ASCII_FLOAT_PATTERN = re.compile(
    r"^[+-]?(?:(?:[0-9]+(?:[.][0-9]*)?)|(?:[.][0-9]+))(?:[eE][+-]?[0-9]+)?$"
)


def parse_ascii_finite_float(token: str) -> float:
    if not token.isascii() or ASCII_FLOAT_PATTERN.fullmatch(token) is None:
        raise ValueError("not a supported ASCII decimal floating-point literal")
    try:
        value = float(token)
    except (ValueError, OverflowError) as error:
        raise ValueError("not safely convertible to float") from error
    if not math.isfinite(value):
        raise ValueError("not finite")
    return value
