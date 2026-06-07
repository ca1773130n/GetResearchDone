"""Unit tests for the Phase E upstream-candidate store in bin/harness_driver.py.

Run directly:  PYTHONPATH=<autoresearch-core checkout-or-site> python3 tests/python/test_harness_upstream.py
A jest wrapper (tests/unit/harness-upstream.test.ts) runs this in `npm test`
and skips when python3/autoresearch_core are unavailable.
"""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
spec = importlib.util.spec_from_file_location("hd", REPO / "bin" / "harness_driver.py")
hd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hd)

from autoresearch_core import Finding  # noqa: E402


def _f(content, kind="takeaway", source="s1", at="2026-06-07T00:00:00Z"):
    return Finding(kind=kind, content=content, source=source, created_at=at)


class TestHeuristic(unittest.TestCase):
    def test_matches_gd_vocabulary(self):
        for text in (
            "gd execute-phase keeps retrying on H2 failures",
            "the /grd:plan-phase skill asked twice",
            "grd-executor forgot to commit after wave 2",
            "the life-harness round rejected a good patch",
            "GRD executor prompt is too long",   # bare GRD qualifier (codex P2 #6)
        ):
            self.assertTrue(hd._GD_REF_RE.search(text), text)

    def test_ignores_project_local_content(self):
        for text in (
            "RRF uses zero-based rank formula",
            "compression gains come from entropy coding",
            "the API returns 403 on missing 2FA",
            "the test harness round-trips serialization",  # NOT a GRD ref (codex P2 #6)
        ):
            self.assertFalse(hd._GD_REF_RE.search(text), text)


class TestUpstreamStore(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = hd.UpstreamStore(Path(self.tmp.name))

    def tearDown(self):
        self.tmp.cleanup()

    def test_emit_filters_and_dedupes(self):
        findings = [
            _f("gd harness round skipped on thin evidence"),   # matches
            _f("entropy coding beats pruning"),                # no gd ref
            _f("gd harness round skipped on thin evidence"),   # duplicate content
        ]
        n = self.store.emit("ProjA", findings, round_id="r1", round_status="evaluated",
                            gd_version="0.4.3", now="2026-06-07T01:00:00Z")
        self.assertEqual(n, 1)
        # re-emit is idempotent
        n2 = self.store.emit("ProjA", findings, round_id="r2", round_status="evaluated",
                             gd_version="0.4.3", now="2026-06-07T02:00:00Z")
        self.assertEqual(n2, 0)
        rows = (Path(self.tmp.name) / "proja.jsonl").read_text().splitlines()
        self.assertEqual(len(rows), 1)
        rec = json.loads(rows[0])
        self.assertEqual(rec["status"], "pending")
        self.assertEqual(len(rec["id"]), 16)

    def test_pending_counts_across_origins_and_respects_ttl(self):
        f = [_f("gd harness round skipped on thin evidence")]
        self.store.emit("ProjA", f, round_id="r1", round_status="evaluated",
                        gd_version="0.4.3", now="2026-06-07T01:00:00Z")
        self.store.emit("ProjB", f, round_id="r9", round_status="rejected",
                        gd_version="0.4.3", now="2026-06-07T01:00:00Z")
        stale = [_f("gd autopilot stalls on phase 3", at="2020-01-01T00:00:00Z")]
        self.store.emit("ProjC", stale, round_id="r0", round_status="applied",
                        gd_version="0.4.3", now="2020-01-01T00:00:00Z")
        pending = self.store.pending(ttl_days=90, now="2026-06-07T12:00:00Z")
        self.assertEqual(len(pending), 1)               # stale one pruned
        self.assertEqual(pending[0]["count"], 2)        # same content, two origins
        self.assertEqual(pending[0]["origins"], ["proja", "projb"])

    def test_mark_consumed_excludes_from_pending(self):
        f = [_f("gd harness round skipped on thin evidence")]
        self.store.emit("ProjA", f, round_id="r1", round_status="evaluated",
                        gd_version="0.4.3", now="2026-06-07T01:00:00Z")
        ids = {c["id"] for c in self.store.pending(ttl_days=90, now="2026-06-07T02:00:00Z")}
        n = self.store.mark_consumed(ids)
        self.assertEqual(n, 1)
        self.assertEqual(self.store.pending(ttl_days=90, now="2026-06-07T02:00:00Z"), [])

    def test_clear_by_origin_and_all(self):
        f = [_f("gd harness round skipped on thin evidence")]
        self.store.emit("ProjA", f, round_id="r1", round_status="evaluated",
                        gd_version="0.4.3", now="2026-06-07T01:00:00Z")
        self.store.emit("ProjB", f, round_id="r2", round_status="evaluated",
                        gd_version="0.4.3", now="2026-06-07T01:00:00Z")
        self.assertEqual(self.store.clear(origin="proja"), 1)
        self.assertEqual(self.store.clear(), 1)
        self.assertEqual(self.store.pending(ttl_days=90, now="2026-06-07T02:00:00Z"), [])

    def test_upstream_dir_resolution(self):
        old = os.environ.get("CLAUDE_PLUGIN_DATA")
        try:
            os.environ["CLAUDE_PLUGIN_DATA"] = "/tmp/pdata"
            self.assertEqual(hd.upstream_dir(), Path("/tmp/pdata/harness/upstream"))
            del os.environ["CLAUDE_PLUGIN_DATA"]
            self.assertEqual(hd.upstream_dir(), Path.home() / ".grd" / "harness" / "upstream")
        finally:
            if old is not None:
                os.environ["CLAUDE_PLUGIN_DATA"] = old


if __name__ == "__main__":
    unittest.main(verbosity=1)
