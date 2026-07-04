"""Deterministic verdict. Parity with GRD verdict.ts (compare + evaluateVerdict)."""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from .types import Comparator, ExperimentResult, MetricSpec, VerdictRecord


def compare(value: float, comparator: Comparator, target: float) -> bool:
    if comparator == ">=":
        return value >= target
    if comparator == "<=":
        return value <= target
    if comparator == ">":
        return value > target
    if comparator == "<":
        return value < target
    if comparator == "==":
        return value == target
    return False


@runtime_checkable
class VerdictStrategy(Protocol):
    name: str

    def evaluate(self, spec: MetricSpec, result: ExperimentResult) -> VerdictRecord: ...


class DeterministicVerdict:
    """Authoritative strategy: numeric metric vs target. evidence_level='deterministic'."""

    name = "deterministic"

    def evaluate(self, spec: MetricSpec, result: ExperimentResult) -> VerdictRecord:
        if result.exit_code != 0:
            return VerdictRecord(
                verdict="inconclusive",
                strategy=self.name,
                evidence_level="deterministic",
                detail=f"experiment run failed ({result.failure_class})",
            )
        if spec.metric_key not in result.metrics:
            return VerdictRecord(
                verdict="inconclusive",
                strategy=self.name,
                evidence_level="deterministic",
                detail=f'metric "{spec.metric_key}" not reported',
            )
        value = result.metrics[spec.metric_key]
        passed = compare(value, spec.comparator, spec.target)
        return VerdictRecord(
            verdict="supported" if passed else "refuted",
            strategy=self.name,
            evidence_level="deterministic",
            detail=f"{spec.metric_key}={_fmt(value)} {spec.comparator} {_fmt(spec.target)} "
            f"→ {'pass' if passed else 'fail'}",
        )


def _fmt(n: float) -> str:
    """Render 5 not 5.0; 0.9 stays 0.9. The `detail` string is human-readable and
    NOT a byte-for-byte parity guarantee with GRD — only the verdict OUTCOME is."""
    return str(int(n)) if isinstance(n, float) and n.is_integer() else str(n)
