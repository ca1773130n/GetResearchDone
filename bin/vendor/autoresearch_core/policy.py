"""Pure decision policy + facades. Parity with GRD verdict.ts + promotion-authority rule."""
from __future__ import annotations

from .types import ExperimentResult, MetricSpec, Verdict, VerdictRecord
from .verdict import DeterministicVerdict, VerdictStrategy


def decide_branch(verdict: Verdict) -> str:
    """'finalize' if supported, else 'revise'."""
    return "finalize" if verdict == "supported" else "revise"


def should_terminate(iteration: int, max_iterations: int, last_verdict: Verdict) -> tuple[bool, str]:
    """Return (done, status). supported -> supported; budget hit -> exhausted; else active."""
    if last_verdict == "supported":
        return True, "supported"
    if iteration >= max_iterations:
        return True, "exhausted"
    return False, "active"


def detect_plateau(verdicts: list[Verdict], window: int = 3) -> bool:
    """True when the last `window` verdicts are all non-supported."""
    if len(verdicts) < window:
        return False
    return all(v != "supported" for v in verdicts[-window:])


def should_promote_dead_end(record: VerdictRecord) -> bool:
    """Codex rule: only a DETERMINISTIC refutation may auto-promote a dead-end."""
    return record.verdict == "refuted" and record.evidence_level == "deterministic"


def measure(
    spec: MetricSpec, result: ExperimentResult, strategy: VerdictStrategy | None = None
) -> VerdictRecord:
    """Facade: evaluate a result under a verdict strategy (deterministic by default)."""
    return (strategy or DeterministicVerdict()).evaluate(spec, result)


def decide(iteration: int, max_iterations: int, verdict: Verdict) -> tuple[str, bool, str]:
    """Facade: (branch, done, status) from a verdict. branch in {finalize, revise}."""
    branch = decide_branch(verdict)
    done, status = should_terminate(iteration, max_iterations, verdict)
    return branch, done, status
