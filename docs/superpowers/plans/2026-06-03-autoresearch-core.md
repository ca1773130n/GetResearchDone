# autoresearch-core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `autoresearch-core`, a pure-Python *decision-contracts* library that ports GRD's deterministic verdict/gate/failure/promotion logic so HypePaper and Agented can adopt it without duplicating their existing loops/infra.

**Architecture:** Pure functions + frozen dataclasses + structural `Protocol`s. No I/O, no network, no DB. Each project binds the protocols to its own infra and calls `measure/decide/should_promote` from its existing loop. Behaviour is parity-tested against GRD's TypeScript (`lib/research/verdict.ts`, `runner.ts`, `gates.ts`, `types.ts`).

**Tech Stack:** Python 3.11+, `dataclasses`, `typing.Protocol`, `pytest`. Build backend `hatchling`. No runtime dependencies.

**Source of truth (GRD):** `/Users/neo/Developer/Projects/GetResearchDone/lib/research/{verdict.ts,runner.ts,gates.ts,types.ts}`.

**Design:** `docs/superpowers/specs/2026-06-03-autoresearch-core-shared-kernel-design.md` (§4 + §10 v1 cut line).

---

## File Structure

Created under `/Users/neo/Developer/Projects/autoresearch-core/` (new repo):

```
pyproject.toml                 # hatchling build, py3.11, pytest dev dep
README.md
autoresearch_core/
  __init__.py                  # re-exports the public surface
  types.py                     # literals + frozen dataclasses (no logic)
  contract.py                  # parse_metrics_line(), validate_metric_spec()
  failures.py                  # classify_run_failure()
  verdict.py                   # compare(), VerdictStrategy, DeterministicVerdict
  gates.py                     # resolve_gates(), check_gate()
  policy.py                    # decide_branch/should_terminate/detect_plateau/should_promote_dead_end
  promote.py                   # DeadEndRecord/KnowhowRecord, approach_hash, build_dead_end_record, should_skip
  ports.py                     # Spawn/Retriever/KnowledgeGraph/ExperimentRunner/Store protocols
tests/
  test_contract.py  test_failures.py  test_verdict.py
  test_gates.py     test_policy.py     test_promote.py
  test_parity.py                # consolidated GRD parity vectors
```

Each module has one responsibility; `types.py` holds only data, logic lives in the verb-named modules.

---

## Task 1: Scaffold the package

**Files:**
- Create: `/Users/neo/Developer/Projects/autoresearch-core/pyproject.toml`
- Create: `/Users/neo/Developer/Projects/autoresearch-core/autoresearch_core/__init__.py`
- Create: `/Users/neo/Developer/Projects/autoresearch-core/README.md`

- [ ] **Step 1: Create the repo and package directories**

```bash
mkdir -p /Users/neo/Developer/Projects/autoresearch-core/autoresearch_core
mkdir -p /Users/neo/Developer/Projects/autoresearch-core/tests
cd /Users/neo/Developer/Projects/autoresearch-core && git init
```

- [ ] **Step 2: Write `pyproject.toml`**

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "autoresearch-core"
version = "0.1.0"
description = "Decision-contracts library: deterministic verdict/gate/failure/promotion logic for autoresearch loops."
requires-python = ">=3.11"
dependencies = []

[project.optional-dependencies]
dev = ["pytest>=8.0"]

[tool.hatch.build.targets.wheel]
packages = ["autoresearch_core"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 3: Write a placeholder `__init__.py`**

```python
"""autoresearch-core: pure-Python decision contracts for autoresearch loops."""

__version__ = "0.1.0"
```

- [ ] **Step 4: Write `README.md`**

```markdown
# autoresearch-core

Pure-Python decision-contracts library extracted from GRD's autoresearch loop:
deterministic verdict, failure classification, gates, and promotion record shapes.
No I/O — bind the `ports.py` protocols to your project's infra and call
`measure`/`decide`/`should_promote` from your existing loop.
```

- [ ] **Step 5: Create venv and verify the package imports**

Run:
```bash
cd /Users/neo/Developer/Projects/autoresearch-core
python3.11 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
python -c "import autoresearch_core; print(autoresearch_core.__version__)"
```
Expected: `0.1.0`

- [ ] **Step 6: Add `.gitignore` and commit**

```bash
printf '.venv/\n__pycache__/\n*.pyc\n.pytest_cache/\n*.egg-info/\n' > .gitignore
git add -A && git commit -m "chore: scaffold autoresearch-core package"
```

---

## Task 2: `types.py` — data definitions

**Files:**
- Create: `/Users/neo/Developer/Projects/autoresearch-core/autoresearch_core/types.py`
- Test: `/Users/neo/Developer/Projects/autoresearch-core/tests/test_types.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_types.py
from autoresearch_core.types import (
    MetricSpec, ExperimentResult, VerdictRecord, Hypothesis, Takeaway, GateState,
)

def test_dataclasses_construct_and_are_frozen():
    spec = MetricSpec(metric_key="recall", comparator=">=", target=0.8)
    assert spec.metric_key == "recall" and spec.comparator == ">=" and spec.target == 0.8
    res = ExperimentResult(metrics={"recall": 0.9}, exit_code=0)
    assert res.failure_class == "none" and res.runner == "subprocess"
    rec = VerdictRecord(verdict="supported", strategy="deterministic",
                        evidence_level="deterministic", detail="ok")
    assert rec.raw_evidence_ref is None
    gates = GateState()
    assert gates.execute is True and gates.kg_write is True
    import dataclasses, pytest
    with pytest.raises(dataclasses.FrozenInstanceError):
        spec.target = 0.5  # type: ignore[misc]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/neo/Developer/Projects/autoresearch-core && pytest tests/test_types.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'autoresearch_core.types'`

- [ ] **Step 3: Write `types.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_types.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add autoresearch_core/types.py tests/test_types.py
git commit -m "feat: add core data types"
```

---

## Task 3: `contract.py` — result parsing + spec validation

Parity with GRD `runner.ts:parseMetricsLine` (regex `/__RESULT__\s*(\{.*\})/`, numeric values only) — note Python `bool` is an `int` subclass and must be excluded.

**Files:**
- Create: `/Users/neo/Developer/Projects/autoresearch-core/autoresearch_core/contract.py`
- Test: `/Users/neo/Developer/Projects/autoresearch-core/tests/test_contract.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_contract.py
import pytest
from autoresearch_core.contract import parse_metrics_line, validate_metric_spec
from autoresearch_core.types import MetricSpec


def test_parses_first_result_line_numeric_only():
    assert parse_metrics_line('noise\n__RESULT__ {"latency_ms": 180, "ok": "yes"}\nmore') == {
        "latency_ms": 180.0
    }


def test_excludes_bool_values():
    # bool is a subclass of int in Python; must not leak in as 1.0/0.0
    assert parse_metrics_line('__RESULT__ {"passed": true, "n": 3}') == {"n": 3.0}


def test_missing_marker_or_bad_json_returns_empty():
    assert parse_metrics_line("no marker here") == {}
    assert parse_metrics_line("__RESULT__ {not json}") == {}


def test_rejects_nan_and_infinity_like_js():
    # JS JSON.parse rejects these tokens; GRD returns {} — match that.
    assert parse_metrics_line('__RESULT__ {"x": NaN}') == {}
    assert parse_metrics_line('__RESULT__ {"x": Infinity}') == {}


def test_first_of_multiple_result_lines():
    assert parse_metrics_line('__RESULT__ {"a": 1}\n__RESULT__ {"a": 2}') == {"a": 1.0}


def test_validate_metric_spec():
    validate_metric_spec(MetricSpec("recall", ">=", 0.8))  # no raise
    with pytest.raises(ValueError):
        validate_metric_spec(MetricSpec("", ">=", 0.8))
    with pytest.raises(ValueError):
        validate_metric_spec(MetricSpec("x", "!=", 0.8))  # type: ignore[arg-type]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_contract.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'autoresearch_core.contract'`

- [ ] **Step 3: Write `contract.py`**

```python
"""The machine-readable experiment-result contract. Parity with GRD runner.ts."""
from __future__ import annotations

import json
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
        if isinstance(value, (int, float)):
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_contract.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add autoresearch_core/contract.py tests/test_contract.py
git commit -m "feat: add __RESULT__ parser and metric-spec validation"
```

---

## Task 4: `failures.py` — failure classification

Parity with GRD `runner.ts:classifyRunFailure`.

**Files:**
- Create: `/Users/neo/Developer/Projects/autoresearch-core/autoresearch_core/failures.py`
- Test: `/Users/neo/Developer/Projects/autoresearch-core/tests/test_failures.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_failures.py
from autoresearch_core.failures import classify_run_failure


def test_classify():
    assert classify_run_failure("", True) == "H4"                       # timeout wins
    assert classify_run_failure("ModuleNotFoundError: x", False) == "H2"
    assert classify_run_failure("ImportError: bad", False) == "H2"
    assert classify_run_failure("bash: foo: command not found", False) == "H2"
    assert classify_run_failure("not found: foo", False) == "H2"
    assert classify_run_failure("ENOENT: no such file", False) == "H3"
    assert classify_run_failure("permission denied", False) == "H3"
    assert classify_run_failure("", False) == "none"                    # empty stderr
    assert classify_run_failure("segfault boom", False) == "H4"         # other runtime


def test_h2_takes_precedence_over_h3_when_both_present():
    # GRD checks H2 before H3
    assert classify_run_failure("ImportError and No such file or directory", False) == "H2"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_failures.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write `failures.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_failures.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add autoresearch_core/failures.py tests/test_failures.py
git commit -m "feat: add failure classifier (H2/H3/H4)"
```

---

## Task 5: `verdict.py` — comparator + deterministic verdict

Parity with GRD `verdict.ts:compare` + `evaluateVerdict`, wrapped in the design's evidence-carrying `VerdictRecord` and a `VerdictStrategy` protocol.

**Files:**
- Create: `/Users/neo/Developer/Projects/autoresearch-core/autoresearch_core/verdict.py`
- Test: `/Users/neo/Developer/Projects/autoresearch-core/tests/test_verdict.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_verdict.py
from autoresearch_core.verdict import compare, DeterministicVerdict
from autoresearch_core.types import MetricSpec, ExperimentResult


def test_compare_all_operators():
    assert compare(0.8, ">=", 0.8) is True
    assert compare(199, "<", 200) is True
    assert compare(5, "==", 5) is True
    assert compare(5, ">", 5) is False
    assert compare(5, "<=", 4) is False


def test_deterministic_supported_and_refuted():
    strat = DeterministicVerdict()
    spec = MetricSpec("recall", ">=", 0.8)
    rec = strat.evaluate(spec, ExperimentResult(metrics={"recall": 0.9}, exit_code=0))
    assert rec.verdict == "supported" and rec.evidence_level == "deterministic"
    assert rec.detail == "recall=0.9 >= 0.8 → pass"
    rec2 = strat.evaluate(spec, ExperimentResult(metrics={"recall": 0.5}, exit_code=0))
    assert rec2.verdict == "refuted"


def test_deterministic_inconclusive_paths():
    strat = DeterministicVerdict()
    spec = MetricSpec("recall", ">=", 0.8)
    bad = strat.evaluate(spec, ExperimentResult(metrics={}, exit_code=1, failure_class="H2"))
    assert bad.verdict == "inconclusive" and "H2" in bad.detail
    missing = strat.evaluate(spec, ExperimentResult(metrics={"other": 1.0}, exit_code=0))
    assert missing.verdict == "inconclusive" and "not reported" in missing.detail
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_verdict.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write `verdict.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_verdict.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add autoresearch_core/verdict.py tests/test_verdict.py
git commit -m "feat: add comparator and DeterministicVerdict strategy"
```

---

## Task 6: `gates.py` — gate resolution

Parity with GRD `gates.ts`. **Config sub-key is `experiment_execution`** (controls the runtime `execute` gate), `kg_write` for the other. Absent/non-`false` → gate on.

**Files:**
- Create: `/Users/neo/Developer/Projects/autoresearch-core/autoresearch_core/gates.py`
- Test: `/Users/neo/Developer/Projects/autoresearch-core/tests/test_gates.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_gates.py
from autoresearch_core.gates import resolve_gates, check_gate
from autoresearch_core.types import GateState


def test_resolve_defaults_on():
    g = resolve_gates({}, no_gates=False)
    assert g.execute is True and g.kg_write is True


def test_resolve_disable_execute_via_experiment_execution_key():
    g = resolve_gates({"research_gates": {"experiment_execution": False}}, no_gates=False)
    assert g.execute is False and g.kg_write is True


def test_no_gates_disables_all():
    g = resolve_gates({"research_gates": {"experiment_execution": True}}, no_gates=True)
    assert g.execute is False and g.kg_write is False


def test_check_gate_pause_vs_proceed():
    gates = GateState(execute=True, kg_write=True)
    paused = check_gate(gates, "execute", approved=False)
    assert paused.proceed is False and paused.pending_gate == "execute"
    assert check_gate(gates, "execute", approved=True).proceed is True
    assert check_gate(GateState(execute=False), "execute", approved=False).proceed is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_gates.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write `gates.py`**

```python
"""Gate model. Parity with GRD gates.ts.

The config sub-key is `experiment_execution` (NOT `execute`); it controls the
runtime gate named `execute`. Any value other than literal False leaves it on.
"""
from __future__ import annotations

from typing import Any, Mapping

from .types import GateCheck, GateState


def resolve_gates(config: Mapping[str, Any], no_gates: bool) -> GateState:
    if no_gates:
        return GateState(execute=False, kg_write=False)
    rg = config.get("research_gates") or {}
    return GateState(
        execute=rg.get("experiment_execution") is not False,
        kg_write=rg.get("kg_write") is not False,
    )


def check_gate(gates: GateState, gate: str, approved: bool) -> GateCheck:
    """Decide whether to proceed or pause at `gate`. Parity with GRD checkGate
    (which also sets thread.status='paused'/pendingGate — the caller does that)."""
    current = getattr(gates, gate)
    if (not current) or approved:
        return GateCheck(proceed=True, pending_gate=None)
    return GateCheck(proceed=False, pending_gate=gate)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_gates.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add autoresearch_core/gates.py tests/test_gates.py
git commit -m "feat: add gate resolution (experiment_execution/kg_write)"
```

---

## Task 7: `policy.py` — decide/terminate/plateau/promotion-authority

Parity with GRD `verdict.ts` (`decideBranch`, `shouldTerminate`, `detectPlateau`) plus the Codex promotion-authority rule (only deterministic refutation auto-promotes a dead-end).

**Files:**
- Create: `/Users/neo/Developer/Projects/autoresearch-core/autoresearch_core/policy.py`
- Test: `/Users/neo/Developer/Projects/autoresearch-core/tests/test_policy.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_policy.py
from autoresearch_core.policy import (
    decide_branch, should_terminate, detect_plateau, should_promote_dead_end,
    measure, decide,
)
from autoresearch_core.types import MetricSpec, ExperimentResult, VerdictRecord


def test_decide_branch():
    assert decide_branch("supported") == "finalize"
    assert decide_branch("refuted") == "revise"
    assert decide_branch("inconclusive") == "revise"


def test_should_terminate():
    assert should_terminate(2, 8, "supported") == (True, "supported")
    assert should_terminate(8, 8, "refuted") == (True, "exhausted")
    assert should_terminate(3, 8, "refuted") == (False, "active")


def test_detect_plateau():
    assert detect_plateau(["refuted", "refuted"], window=3) is False       # too few
    assert detect_plateau(["refuted", "inconclusive", "refuted"]) is True
    assert detect_plateau(["refuted", "supported", "refuted"]) is False


def test_promotion_authority_deterministic_only():
    det = VerdictRecord("refuted", "deterministic", "deterministic", "x<y")
    llm = VerdictRecord("refuted", "reviewer", "llm", "looks wrong")
    ok = VerdictRecord("supported", "deterministic", "deterministic", "x>=y")
    assert should_promote_dead_end(det) is True
    assert should_promote_dead_end(llm) is False    # advisory only
    assert should_promote_dead_end(ok) is False      # supported never promotes


def test_measure_and_decide_facades():
    spec = MetricSpec("recall", ">=", 0.8)
    rec = measure(spec, ExperimentResult(metrics={"recall": 0.9}, exit_code=0))
    assert rec.verdict == "supported" and rec.evidence_level == "deterministic"
    assert decide(2, 8, rec.verdict) == ("finalize", True, "supported")
    assert decide(3, 8, "refuted") == ("revise", False, "active")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_policy.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write `policy.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_policy.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add autoresearch_core/policy.py tests/test_policy.py
git commit -m "feat: add decision policy + deterministic-only promotion authority"
```

---

## Task 8: `promote.py` — dead-end/knowhow record shapes

Record shapes + `should_skip` (don't re-propose a falsified approach). Shape only — projects persist via their own `Store`.

**Files:**
- Create: `/Users/neo/Developer/Projects/autoresearch-core/autoresearch_core/promote.py`
- Test: `/Users/neo/Developer/Projects/autoresearch-core/tests/test_promote.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_promote.py
from autoresearch_core.promote import (
    approach_hash, build_dead_end_record, should_skip, DeadEndRecord,
)
from autoresearch_core.types import Hypothesis, VerdictRecord


def test_approach_hash_is_normalized_and_stable():
    a = approach_hash("  Memoize The Tokenizer  ")
    b = approach_hash("memoize the tokenizer")
    assert a == b and len(a) == 16


def test_build_dead_end_record():
    h = Hypothesis(id="h1", iteration=2, statement="cache embeddings",
                   predicted_outcome="faster")
    rec = VerdictRecord("refuted", "deterministic", "deterministic", "latency=300 < 200 -> fail")
    de = build_dead_end_record(h, rec)
    assert isinstance(de, DeadEndRecord)
    assert de.statement == "cache embeddings" and de.iteration == 2
    assert de.evidence_level == "deterministic" and de.reason.endswith("fail")


def test_should_skip_against_known_hashes():
    seen = {approach_hash("cache embeddings")}
    assert should_skip("Cache Embeddings", seen) is True
    assert should_skip("use a bloom filter", seen) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_promote.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write `promote.py`**

```python
"""Promotion record shapes (KNOWHOW / DEAD-ENDS). Shape only; projects persist."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

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
    normalized = statement.strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def build_dead_end_record(hypothesis: Hypothesis, record: VerdictRecord) -> DeadEndRecord:
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_promote.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add autoresearch_core/promote.py tests/test_promote.py
git commit -m "feat: add dead-end/knowhow record shapes and approach dedupe"
```

---

## Task 9: `ports.py` — adapter protocols

Structural `Protocol`s the projects implement. A fake in the test proves they're satisfiable.

**Files:**
- Create: `/Users/neo/Developer/Projects/autoresearch-core/autoresearch_core/ports.py`
- Test: `/Users/neo/Developer/Projects/autoresearch-core/tests/test_ports.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ports.py
from autoresearch_core.ports import ExperimentRunner, Store
from autoresearch_core.types import ExperimentResult


class FakeRunner:
    def run(self, plan: dict, workdir: str) -> ExperimentResult:
        return ExperimentResult(metrics={"x": 1.0}, exit_code=0)


class FakeStore:
    def __init__(self):
        self.dead_ends: dict[str, list] = {}

    def save_verdict(self, thread_id: str, record) -> None:
        pass

    def load_dead_end_hashes(self, scope: str) -> set[str]:
        return set()

    def save_dead_end(self, scope: str, record) -> None:
        self.dead_ends.setdefault(scope, []).append(record)


def test_fakes_satisfy_protocols():
    assert isinstance(FakeRunner(), ExperimentRunner)
    assert isinstance(FakeStore(), Store)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_ports.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write `ports.py`**

```python
"""Adapter protocols. Each project binds these to its own infra (no impl here)."""
from __future__ import annotations

from typing import Any, Protocol, Sequence, runtime_checkable

from .types import ExperimentResult


@runtime_checkable
class Spawn(Protocol):
    async def __call__(self, prompt: str) -> str: ...


@runtime_checkable
class Retriever(Protocol):
    async def retrieve(self, query: str, k: int = 8) -> Sequence[dict[str, Any]]: ...


@runtime_checkable
class KnowledgeGraph(Protocol):
    async def prior_findings(self, query: str) -> Sequence[dict[str, Any]]: ...
    async def write_finding(self, finding: dict[str, Any]) -> None: ...


@runtime_checkable
class ExperimentRunner(Protocol):
    def run(self, plan: dict[str, Any], workdir: str) -> ExperimentResult: ...


@runtime_checkable
class Store(Protocol):
    def save_verdict(self, thread_id: str, record: Any) -> None: ...
    def load_dead_end_hashes(self, scope: str) -> set[str]: ...
    def save_dead_end(self, scope: str, record: Any) -> None: ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_ports.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add autoresearch_core/ports.py tests/test_ports.py
git commit -m "feat: add adapter protocols (Spawn/Retriever/KG/Runner/Store)"
```

---

## Task 10: Public surface + GRD parity suite

Re-export the public API from `__init__.py` and add one consolidated parity test that encodes GRD's known input→output vectors, so future edits can't silently diverge.

**Files:**
- Modify: `/Users/neo/Developer/Projects/autoresearch-core/autoresearch_core/__init__.py`
- Test: `/Users/neo/Developer/Projects/autoresearch-core/tests/test_parity.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_parity.py
"""Vectors transcribed from GRD lib/research/{verdict.ts,runner.ts,gates.ts}.
If GRD changes these behaviors, update here deliberately — do not loosen."""
import autoresearch_core as ac
from autoresearch_core.types import MetricSpec, ExperimentResult


def test_public_surface_exports():
    for name in [
        "MetricSpec", "ExperimentResult", "VerdictRecord", "GateState", "GateCheck",
        "parse_metrics_line", "classify_run_failure", "compare",
        "DeterministicVerdict", "resolve_gates", "check_gate",
        "decide_branch", "should_terminate", "detect_plateau",
        "should_promote_dead_end", "measure", "decide",
        "approach_hash", "build_dead_end_record",
    ]:
        assert hasattr(ac, name), f"missing public export: {name}"


def test_end_to_end_supported_path():
    spec = MetricSpec("recall_at_10", ">=", 0.8)
    stdout = 'log line\n__RESULT__ {"recall_at_10": 0.83}\n'
    metrics = ac.parse_metrics_line(stdout)
    result = ExperimentResult(metrics=metrics, exit_code=0)
    rec = ac.DeterministicVerdict().evaluate(spec, result)
    assert rec.verdict == "supported"
    assert ac.decide_branch(rec.verdict) == "finalize"
    assert ac.should_promote_dead_end(rec) is False


def test_end_to_end_refuted_then_promote():
    spec = MetricSpec("latency_ms", "<", 200)
    result = ExperimentResult(metrics={"latency_ms": 300.0}, exit_code=0)
    rec = ac.DeterministicVerdict().evaluate(spec, result)
    assert rec.verdict == "refuted"
    assert ac.decide_branch(rec.verdict) == "revise"
    assert ac.should_promote_dead_end(rec) is True


def test_end_to_end_failed_run_is_inconclusive():
    spec = MetricSpec("x", ">=", 1)
    err = ExperimentResult(metrics={}, exit_code=127, failure_class="H2")
    rec = ac.DeterministicVerdict().evaluate(spec, err)
    assert rec.verdict == "inconclusive"
    assert ac.should_promote_dead_end(rec) is False  # inconclusive never promotes


def test_invalid_comparator_returns_false():
    assert ac.compare(1, "!=", 1) is False  # type: ignore[arg-type]


def test_exit_code_precedence_over_metrics():
    # non-zero exit -> inconclusive even when a metric is present
    spec = MetricSpec("x", ">=", 1)
    rec = ac.DeterministicVerdict().evaluate(
        spec, ExperimentResult(metrics={"x": 5.0}, exit_code=1, failure_class="H4")
    )
    assert rec.verdict == "inconclusive"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_parity.py -v`
Expected: FAIL with `AssertionError` (public exports not yet wired)

- [ ] **Step 3: Wire the public surface in `__init__.py`**

```python
"""autoresearch-core: pure-Python decision contracts for autoresearch loops."""

__version__ = "0.1.0"

from .types import (
    Comparator, EvidenceLevel, ExperimentResult, FailureClass, GateCheck, GateState,
    Hypothesis, MetricSpec, Takeaway, Verdict, VerdictRecord,
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

__all__ = [
    "Comparator", "EvidenceLevel", "ExperimentResult", "FailureClass", "GateCheck", "GateState",
    "Hypothesis", "MetricSpec", "Takeaway", "Verdict", "VerdictRecord",
    "parse_metrics_line", "validate_metric_spec", "classify_run_failure",
    "compare", "DeterministicVerdict", "VerdictStrategy", "resolve_gates", "check_gate",
    "decide_branch", "should_terminate", "detect_plateau", "should_promote_dead_end",
    "measure", "decide",
    "DeadEndRecord", "KnowhowRecord", "approach_hash", "build_dead_end_record", "should_skip",
    "Spawn", "Retriever", "KnowledgeGraph", "ExperimentRunner", "Store",
]
```

- [ ] **Step 4: Run the full suite**

Run: `pytest -v`
Expected: PASS (all test files green)

- [ ] **Step 5: Commit**

```bash
git add autoresearch_core/__init__.py tests/test_parity.py
git commit -m "feat: wire public surface + GRD parity suite"
```

---

## Task 11: Coverage gate + finalize

**Files:**
- Modify: `/Users/neo/Developer/Projects/autoresearch-core/pyproject.toml`

- [ ] **Step 1: Add coverage dev dep + run with coverage**

```bash
pip install pytest-cov
pytest --cov=autoresearch_core --cov-report=term-missing --cov-fail-under=95
```
Expected: PASS, coverage ≥ 95% (pure logic, fully testable).

- [ ] **Step 2: Record the dev dep**

Edit `pyproject.toml` `[project.optional-dependencies]`:
```toml
dev = ["pytest>=8.0", "pytest-cov>=5.0"]
```

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml
git commit -m "chore: add coverage tooling"
```

---

## Self-Review

**Spec coverage (design §4 + §10 core cut line):**
- `MetricSpec` → Task 2 ✓ · `__RESULT__` parser → Task 3 ✓ · failure classifier (H2/H3/H4) → Task 4 ✓
- `compare` + deterministic verdict w/ `{strategy, evidence_level}` → Task 5 ✓
- gates (`experiment_execution`/`kg_write`) → Task 6 ✓
- `measure/decide/should_promote` (decide_branch/should_terminate/detect_plateau/should_promote_dead_end) → Task 7 ✓
- promotion record shapes + dedupe → Task 8 ✓ · protocols → Task 9 ✓ · parity fixtures → Task 10 ✓
- "no I/O / pure" → enforced (no module imports os/network; only `json`, `re`, `hashlib`, `dataclasses`) ✓
- Verdict-authority rule (deterministic-only auto-promote) → Task 7 `should_promote_dead_end` ✓

**Placeholder scan:** none — every code step has complete source.

**Type consistency:** `MetricSpec.metric_key`, `VerdictRecord.{verdict,strategy,evidence_level,detail,raw_evidence_ref}`, `GateState.{execute,kg_write}`, `ExperimentResult.{metrics,exit_code,failure_class}` are used identically across Tasks 2–10. `should_promote_dead_end` (Task 7) and `build_dead_end_record` (Task 8) both read `record.evidence_level`/`record.detail` consistently.

**Out of scope (later cycles):** HypePaper integration plan, Agented integration plan (each its own spec→plan→execute, per design §8).

**Codex plan-review (2026-06-03) incorporated:** NaN/Infinity rejected to match JS `JSON.parse` (Task 3); `check_gate` → `GateCheck{proceed,pending_gate}` (Tasks 2/6); `measure()`/`decide()` facades added + exported (Tasks 7/10); verdict detail arrow `→` + detail-string scoped as non-parity (Task 5); Task 10 red-step expects `AssertionError`; coverage gated `--cov-fail-under=95` (Task 11); added parity vectors — NaN, multi-`__RESULT__`, ImportError/`not found:`, H2-before-H3, invalid comparator, exit-code precedence.
