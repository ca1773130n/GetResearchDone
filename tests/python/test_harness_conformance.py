"""Unit tests for autoresearch-core port conformance + fault handling in
bin/harness_driver.py.

Run directly:  PYTHONPATH=<autoresearch-core checkout-or-site> python3 tests/python/test_harness_conformance.py
A jest wrapper (tests/unit/harness-conformance.test.ts) runs this in `npm test`
and skips when python3/autoresearch_core are unavailable.
"""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parent.parent.parent
spec = importlib.util.spec_from_file_location("hd", REPO / "bin" / "harness_driver.py")
hd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hd)

from autoresearch_core import (  # noqa: E402
    FindingsSource, PatchProposer, RoundEvaluator, Applier, RoundStore,
)


class TestPortConformance(unittest.TestCase):
    """Explicit inheritance (not just structural isinstance) — proves the
    classes carry the Protocol in their MRO, which is the documentation/static
    -typing contract Feature 1 adds."""

    def test_explicit_inheritance(self):
        self.assertIn(FindingsSource, hd.TesseraeFindings.__mro__)
        self.assertIn(PatchProposer, hd.AgentProposer.__mro__)
        self.assertIn(RoundEvaluator, hd.RepoEvaluator.__mro__)
        self.assertIn(Applier, hd.GitApplier.__mro__)
        self.assertIn(RoundStore, hd.FsRoundStore.__mro__)
        self.assertIn(FindingsSource, hd.CompositeFindings.__mro__)

    def test_classes_still_instantiable(self):
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            self.assertIsInstance(hd.TesseraeFindings(repo), FindingsSource)
            self.assertIsInstance(hd.RepoEvaluator(False), RoundEvaluator)
            self.assertIsInstance(hd.GitApplier(repo), Applier)
            self.assertIsInstance(hd.FsRoundStore(repo), RoundStore)
            self.assertIsInstance(hd.AgentProposer([]), PatchProposer)


class TestEvaluatorFaultHandling(unittest.TestCase):
    def _code_patch(self):
        from autoresearch_core import RoundPatch, PatchEntry
        return RoundPatch(
            round_id="r1",
            entries=(PatchEntry(path="lib/x.ts", kind="code", op="modify",
                                content="export const x = 1;\n", rationale="",
                                evidence_refs=()),),
            summary="s", confidence=0.5,
        )

    def test_timeout_classified_h4_no_crash(self):
        patch = self._code_patch()
        def fake_run(argv, cwd=None, capture_output=None, text=None, timeout=None, env=None):
            raise subprocess.TimeoutExpired(argv, timeout)
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(hd.subprocess, "run", side_effect=fake_run):
                report = hd.RepoEvaluator(full_eval=False).evaluate(patch, d)
        details = " ".join(c.detail or "" for c in report.checks)
        self.assertTrue(any(c.exit_code != 0 for c in report.checks))
        self.assertIn("[H4]", details)

    def test_timeout_preserves_byte_output(self):
        patch = self._code_patch()
        def fake_run(argv, cwd=None, capture_output=None, text=None, timeout=None, env=None):
            raise subprocess.TimeoutExpired(argv, timeout, output=b"OUT-marker", stderr=b"ERR-marker")
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(hd.subprocess, "run", side_effect=fake_run):
                report = hd.RepoEvaluator(full_eval=False).evaluate(patch, d)
        details = " ".join(c.detail or "" for c in report.checks)
        self.assertIn("OUT-marker", details)
        self.assertIn("ERR-marker", details)
        self.assertIn("[H4]", details)

    def test_missing_binary_classified_no_crash(self):
        patch = self._code_patch()
        def fake_run(argv, cwd=None, capture_output=None, text=None, timeout=None, env=None):
            raise FileNotFoundError("[Errno 2] No such file or directory: 'npm'")
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(hd.subprocess, "run", side_effect=fake_run):
                report = hd.RepoEvaluator(full_eval=False).evaluate(patch, d)
        details = " ".join(c.detail or "" for c in report.checks)
        self.assertTrue(any(c.exit_code != 0 for c in report.checks))
        self.assertIn("[H3]", details)  # "No such file or directory" -> H3


class TestRunbookEvidence(unittest.TestCase):
    def _repo_with_graph(self, d):
        graph = {
            "nodes": [
                {"node_type": "SessionDecision", "content": "chose X",
                 "node_id": "s1", "created_at": "2026-06-10T00:00:00Z"},
                {"node_type": "Runbook", "content": "to do Y, run Z", "node_id": "r1"},
                {"node_type": "Gotcha", "content": "Z fails when W", "node_id": "g1"},
                {"node_type": "Event", "content": "ran Z once", "node_id": "e1"},
            ],
            "edges": [],
        }
        tdir = Path(d) / ".tesserae"
        tdir.mkdir(parents=True, exist_ok=True)
        (tdir / "graph.json").write_text(json.dumps(graph))
        return Path(d)

    def test_consumes_runbook_gotcha_not_event(self):
        with tempfile.TemporaryDirectory() as d:
            repo = self._repo_with_graph(d)
            found = hd.TesseraeFindings(repo).findings(None)
        by_src = {f.source: f for f in found}
        self.assertIn("s1", by_src)        # session finding still kept
        self.assertIn("r1", by_src)        # runbook consumed
        self.assertIn("g1", by_src)        # gotcha consumed
        self.assertNotIn("e1", by_src)     # event excluded
        self.assertEqual(by_src["r1"].kind, "takeaway")
        self.assertTrue(by_src["r1"].content.startswith("[runbook] "))
        self.assertEqual(by_src["g1"].kind, "insight")
        self.assertTrue(by_src["g1"].content.startswith("[gotcha] "))

    def test_empty_evidence_emits_config_status_hint(self):
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            (repo / ".planning").mkdir()
            (repo / ".planning" / "config.json").write_text("{}")
            tdir = repo / ".tesserae"
            tdir.mkdir()
            (tdir / "graph.json").write_text(json.dumps({"nodes": [], "edges": []}))
            rec, _ = hd.run_round(repo, auto=False, dry_run=False, full_eval=False)
        self.assertEqual(rec.status, "skipped")
        self.assertIn("tesserae config status", rec.detail)


if __name__ == "__main__":
    unittest.main(verbosity=2)
