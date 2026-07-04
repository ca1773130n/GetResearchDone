"""Core data definitions for autoresearch-core. Pure data, no logic, no I/O."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Verdict = Literal["supported", "refuted", "inconclusive"]
Comparator = Literal[">=", "<=", ">", "<", "=="]
FailureClass = Literal["H2", "H3", "H4", "none"]
EvidenceLevel = Literal["deterministic", "exit_code", "llm"]
HypothesisStatus = Literal[
    "open", "testing", "supported", "refuted", "inconclusive", "superseded"
]
TakeawayKind = Literal[
    "success_pattern", "failure_root_cause", "constraint", "domain_fact", "tool_pattern"
]


@dataclass(frozen=True)
class MetricSpec:
    """The machine-readable verdict contract a hypothesis must carry."""
    metric_key: str
    comparator: Comparator
    target: float


@dataclass(frozen=True)
class ExperimentResult:
    metrics: dict[str, float]
    exit_code: int
    failure_class: FailureClass = "none"
    runner: str = "subprocess"
    duration_ms: int = 0
    stdout_excerpt: str = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "metrics", dict(self.metrics))


@dataclass(frozen=True)
class VerdictRecord:
    verdict: Verdict
    strategy: str
    evidence_level: EvidenceLevel
    detail: str
    raw_evidence_ref: str | None = None


@dataclass(frozen=True)
class Hypothesis:
    id: str
    iteration: int
    statement: str
    predicted_outcome: str
    status: HypothesisStatus = "open"
    parent_id: str | None = None
    verdict: Verdict | None = None


@dataclass(frozen=True)
class Takeaway:
    kind: TakeawayKind
    content: str
    confidence: float
    evidence: str
    failure_class: FailureClass
    iteration: int


@dataclass(frozen=True)
class GateState:
    execute: bool = True
    kg_write: bool = True


@dataclass(frozen=True)
class GateCheck:
    proceed: bool
    pending_gate: str | None = None


FindingKind = Literal["insight", "decision", "question", "todo", "hypothesis", "takeaway"]
PatchKind = Literal["markdown", "config", "code"]
PatchOp = Literal["modify", "create", "delete"]
AutonomyMode = Literal["review", "auto"]
RoundStatus = Literal[
    "skipped", "gathered", "proposed", "validated", "evaluated", "applied", "rejected", "reverted"
]


@dataclass(frozen=True)
class Finding:
    """One Tesserae Session finding projected into the kernel."""
    kind: FindingKind
    content: str
    source: str
    created_at: str = ""


@dataclass(frozen=True)
class PatchEntry:
    path: str
    kind: PatchKind
    op: PatchOp
    content: str | None
    rationale: str
    evidence_refs: tuple[str, ...] = ()


@dataclass(frozen=True)
class RoundPatch:
    round_id: str
    entries: tuple[PatchEntry, ...]
    summary: str
    confidence: float


@dataclass(frozen=True)
class EvalCheck:
    name: str
    exit_code: int
    detail: str = ""


@dataclass(frozen=True)
class EvalReport:
    checks: tuple[EvalCheck, ...]

    @property
    def passed(self) -> bool:
        return all(c.exit_code == 0 for c in self.checks)


@dataclass(frozen=True)
class AutonomyState:
    mode: AutonomyMode = "review"
    kill_switch: bool = False
    min_confidence: float = 0.7
    min_interval_hours: int = 24
    allowed_targets: tuple[PatchKind, ...] = ("markdown", "config", "code")


@dataclass(frozen=True)
class RoundRecord:
    round_id: str
    status: RoundStatus
    detail: str = ""
    evidence_count: int = 0
    patch_hash: str | None = None
    eval_report: EvalReport | None = None
    applied_sha: str | None = None
    # Ancestor this round branched from (the prior applied_sha). Enables DGM-style
    # lineage/reseeding later; pure data, no behaviour change in the kernel.
    parent_sha: str | None = None
    created_at: str = ""
