"""autoresearch-core: pure-Python decision contracts for autoresearch loops."""

__version__ = "0.4.7"

from .types import (
    Comparator, EvidenceLevel, ExperimentResult, FailureClass, GateCheck, GateState,
    Hypothesis, MetricSpec, Takeaway, Verdict, VerdictRecord,
    AutonomyState, EvalCheck, EvalReport, Finding, PatchEntry, RoundPatch, RoundRecord,
)
from .contract import parse_metrics_line, validate_metric_spec
from .failures import classify_run_failure
from .verdict import compare, DeterministicVerdict, VerdictStrategy
from .gates import resolve_gates, check_gate
from .policy import (
    decide_branch, should_terminate, detect_plateau, should_promote_dead_end,
    measure, decide,
)
from .promote import (
    DeadEndRecord, KnowhowRecord, approach_hash, build_dead_end_record, should_skip,
)
from .ports import Spawn, Retriever, KnowledgeGraph, ExperimentRunner, Store
from .ports import Applier, FindingsSource, PatchProposer, RoundEvaluator, RoundStore
from .rounds import (
    decide_round, patch_hash, resolve_autonomy, select_evidence, should_apply,
    should_skip_patch, validate_round_patch,
)

__all__ = [
    "Comparator", "EvidenceLevel", "ExperimentResult", "FailureClass", "GateCheck", "GateState",
    "Hypothesis", "MetricSpec", "Takeaway", "Verdict", "VerdictRecord",
    "parse_metrics_line", "validate_metric_spec", "classify_run_failure",
    "compare", "DeterministicVerdict", "VerdictStrategy", "resolve_gates", "check_gate",
    "decide_branch", "should_terminate", "detect_plateau", "should_promote_dead_end",
    "measure", "decide",
    "DeadEndRecord", "KnowhowRecord", "approach_hash", "build_dead_end_record", "should_skip",
    "Spawn", "Retriever", "KnowledgeGraph", "ExperimentRunner", "Store",
    "AutonomyState", "EvalCheck", "EvalReport", "Finding", "PatchEntry", "RoundPatch", "RoundRecord",
    "resolve_autonomy", "select_evidence", "validate_round_patch",
    "patch_hash", "should_skip_patch", "should_apply", "decide_round",
    "Applier", "FindingsSource", "PatchProposer", "RoundEvaluator", "RoundStore",
]
