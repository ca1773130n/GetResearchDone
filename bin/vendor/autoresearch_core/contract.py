"""The machine-readable experiment-result contract. Parity with GRD runner.ts."""
from __future__ import annotations

import json
import math
import re

from .types import Comparator, MetricSpec

_RESULT_RE = re.compile(r"__RESULT__\s*(\{.*\})")
_COMPARATORS: tuple[Comparator, ...] = (">=", "<=", ">", "<", "==")


def _reject_constant(token: str) -> float:
    # GRD parity: JS JSON.parse rejects NaN/Infinity/-Infinity. Mirror that.
    raise ValueError(f"non-JSON constant: {token}")


def parse_metrics_line(stdout: str) -> dict[str, float]:
    """Extract {metric: number} from the first `__RESULT__ {json}` occurrence.

    Mirrors GRD: non-numeric values are dropped. Python `bool` is an `int`
    subclass, so booleans are excluded explicitly.
    """
    match = _RESULT_RE.search(stdout)
    if not match:
        return {}
    try:
        obj = json.loads(match.group(1), parse_constant=_reject_constant)
    except (ValueError, TypeError):
        return {}
    if not isinstance(obj, dict):
        return {}
    out: dict[str, float] = {}
    for key, value in obj.items():
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)) and math.isfinite(value):
            out[str(key)] = float(value)
    return out


def validate_metric_spec(spec: MetricSpec) -> None:
    """Raise ValueError if the spec cannot drive a deterministic verdict."""
    if not isinstance(spec.metric_key, str) or not spec.metric_key:
        raise ValueError("MetricSpec.metric_key must be a non-empty string")
    if spec.comparator not in _COMPARATORS:
        raise ValueError(f"MetricSpec.comparator must be one of {_COMPARATORS}")
    if not isinstance(spec.target, (int, float)) or isinstance(spec.target, bool):
        raise ValueError("MetricSpec.target must be numeric")
    if not math.isfinite(spec.target):
        raise ValueError("MetricSpec.target must be finite")
