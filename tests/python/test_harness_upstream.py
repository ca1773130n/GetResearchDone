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


class TestRoundWiring(unittest.TestCase):
    """save_round extra-merge + the emit/consume config gates (pure parts)."""

    def test_save_round_merges_extra_keys(self):
        from autoresearch_core import RoundRecord
        with tempfile.TemporaryDirectory() as tmp:
            store = hd.FsRoundStore(Path(tmp))
            rec = RoundRecord(round_id="r1", status="skipped", detail="x")
            store.save_round(rec, extra={"upstream_emitted": 3})
            # FsRoundStore(repo) roots at <repo>/.planning/harness (codex P1 #4)
            data = json.loads(
                (Path(tmp) / ".planning" / "harness" / "rounds" / "r1" / "RECORD.json").read_text())
            self.assertEqual(data["upstream_emitted"], 3)
            self.assertEqual(data["status"], "skipped")

    def test_composite_findings_appends_upstream_and_two_phase_consume(self):
        with tempfile.TemporaryDirectory() as tmp:
            up = hd.UpstreamStore(Path(tmp))
            up.emit("ProjA", [_f("gd harness round skipped on thin evidence")],
                    round_id="r1", round_status="evaluated",
                    gd_version="0.4.3", now="2026-06-07T01:00:00Z")
            local = [_f("local finding", kind="insight")]
            comp = hd.CompositeFindings(local_findings=lambda since: local,
                                        store=up, ttl_days=90,
                                        now="2026-06-07T02:00:00Z")
            got = comp.findings(None)
            self.assertEqual(len(got), 2)
            upstream = [g for g in got if g.source.startswith("upstream:")][0]
            self.assertIn("proja", upstream.source)
            self.assertEqual(upstream.kind, "takeaway")
            # two-phase consume: only findings that survive selection count
            self.assertEqual(len(comp.consumed_for(got)), 1)        # included
            self.assertEqual(comp.consumed_for(local), set())       # truncated away

    def test_mark_consumed_counts_deduped_candidates_not_rows(self):
        # upstream_consumed semantics = deduped candidates (codex P2 #7):
        # the same content emitted by TWO origins is ONE consumed candidate.
        with tempfile.TemporaryDirectory() as tmp:
            up = hd.UpstreamStore(Path(tmp))
            f = [_f("gd harness round skipped on thin evidence")]
            up.emit("ProjA", f, round_id="r1", round_status="evaluated",
                    gd_version="0.4.3", now="2026-06-07T01:00:00Z")
            up.emit("ProjB", f, round_id="r2", round_status="evaluated",
                    gd_version="0.4.3", now="2026-06-07T01:00:00Z")
            ids = {c["id"] for c in up.pending(ttl_days=90, now="2026-06-07T02:00:00Z")}
            self.assertEqual(up.mark_consumed(ids), 1)


class TestUpstreamCli(unittest.TestCase):
    def test_upstream_list_and_clear_json(self):
        import subprocess
        with tempfile.TemporaryDirectory() as tmp:
            env = {**os.environ, "CLAUDE_PLUGIN_DATA": tmp,
                   "PYTHONPATH": os.environ.get("PYTHONPATH", "")}
            store = hd.UpstreamStore(Path(tmp) / "harness" / "upstream")
            store.emit("ProjA", [_f("gd harness round skipped on thin evidence")],
                       round_id="r1", round_status="evaluated",
                       gd_version="0.4.3", now="2026-06-07T01:00:00Z")
            out = subprocess.run(
                [sys.executable, str(REPO / "bin" / "harness_driver.py"),
                 "upstream", "--op", "list"],
                capture_output=True, text=True, env=env)
            data = json.loads(out.stdout)
            self.assertEqual(data["pending"][0]["count"], 1)
            out = subprocess.run(
                [sys.executable, str(REPO / "bin" / "harness_driver.py"),
                 "upstream", "--op", "clear", "--origin", "ProjA"],
                capture_output=True, text=True, env=env)
            self.assertEqual(json.loads(out.stdout)["cleared"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=1)
