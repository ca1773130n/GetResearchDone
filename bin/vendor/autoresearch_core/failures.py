"""Failure classification. Parity with GRD runner.ts classifyRunFailure."""
from __future__ import annotations

import re

from .types import FailureClass

_H2_RE = re.compile(
    r"command not found|not found:|ModuleNotFoundError|ImportError", re.IGNORECASE
)
_H3_RE = re.compile(
    r"No such file or directory|ENOENT|permission denied", re.IGNORECASE
)


def classify_run_failure(stderr: str, timed_out: bool) -> FailureClass:
    """H4=timeout/other-runtime, H2=missing dep, H3=missing file/permission, none=empty."""
    if timed_out:
        return "H4"
    if _H2_RE.search(stderr):
        return "H2"
    if _H3_RE.search(stderr):
        return "H3"
    if not stderr:
        return "none"
    return "H4"
