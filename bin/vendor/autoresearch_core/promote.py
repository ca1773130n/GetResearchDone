"""Promotion record shapes (KNOWHOW / DEAD-ENDS). Shape only; projects persist."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from .policy import should_promote_dead_end
from .types import Hypothesis, VerdictRecord


@dataclass(frozen=True)
class DeadEndRecord:
    approach_hash: str
    statement: str
    reason: str
    iteration: int
    evidence_level: str


@dataclass(frozen=True)
class KnowhowRecord:
    statement: str
    content: str
    iteration: int


def approach_hash(statement: str) -> str:
    """Stable, case/space-insensitive hash used to dedupe approaches."""
    normalized = re.sub(r"\s+", " ", statement.strip().lower())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def build_dead_end_record(hypothesis: Hypothesis, record: VerdictRecord) -> DeadEndRecord:
    if not should_promote_dead_end(record):
        raise ValueError("build_dead_end_record requires a deterministic refutation")
    return DeadEndRecord(
        approach_hash=approach_hash(hypothesis.statement),
        statement=hypothesis.statement,
        reason=record.detail,
        iteration=hypothesis.iteration,
        evidence_level=record.evidence_level,
    )


def should_skip(statement: str, dead_end_hashes: set[str]) -> bool:
    """Don't re-propose an approach already in the dead-ends set."""
    return approach_hash(statement) in dead_end_hashes
