"""Cross-language conformance (Python side).

The vendored autoresearch-core kernel must produce the outcomes in
tests/conformance/kernel-contract.json — the SAME fixtures the TS suite
(tests/unit/research/kernel-contract.test.ts) asserts. If the kernel drifts from the
contract (or from the TS loop), a case here fails. Pins verdict + gates parity.
See docs/kernel-contract.md.
"""
import json
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# Prepend the vendored kernel so `autoresearch_core` resolves to bin/vendor/ (no pip install).
sys.path.insert(0, str(REPO / "bin" / "vendor"))
FIXTURES = json.loads((REPO / "tests" / "conformance" / "kernel-contract.json").read_text())

from autoresearch_core.verdict import DeterministicVerdict, compare  # noqa: E402
from autoresearch_core.gates import check_gate, resolve_gates  # noqa: E402
from autoresearch_core.types import ExperimentResult, GateState, MetricSpec  # noqa: E402


class TestKernelContract(unittest.TestCase):
    def test_compare(self):
        for c in FIXTURES["compare"]:
            self.assertEqual(
                compare(c["value"], c["comparator"], c["target"]), c["expect"], c
            )

    def test_evaluate_verdict(self):
        strat = DeterministicVerdict()
        for c in FIXTURES["evaluateVerdict"]:
            spec = MetricSpec(
                metric_key=c["metricKey"], comparator=c["comparator"], target=c["target"]
            )
            result = ExperimentResult(
                metrics=c["metrics"], exit_code=c["exitCode"], failure_class=c["failureClass"]
            )
            self.assertEqual(strat.evaluate(spec, result).verdict, c["expect"], c["name"])

    def test_resolve_gates(self):
        for c in FIXTURES["resolveGates"]:
            gs = resolve_gates(c["config"], c["noGates"])
            self.assertEqual(
                {"execute": gs.execute, "kg_write": gs.kg_write}, c["expect"], c["name"]
            )

    def test_check_gate(self):
        for c in FIXTURES["checkGate"]:
            state = {"execute": True, "kg_write": True}
            state[c["gate"]] = c["gateEnabled"]
            gs = GateState(execute=state["execute"], kg_write=state["kg_write"])
            self.assertEqual(
                check_gate(gs, c["gate"], c["approved"]).proceed, c["expectProceed"], c["name"]
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
