"""Unit tests for autoresearch-core port conformance + fault handling in
bin/harness_driver.py.

Run directly:  PYTHONPATH=<autoresearch-core checkout-or-site> python3 tests/python/test_harness_conformance.py
A jest wrapper (tests/unit/harness-conformance.test.ts) runs this in `npm test`
and skips when python3/autoresearch_core are unavailable.
"""
import importlib.util
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
