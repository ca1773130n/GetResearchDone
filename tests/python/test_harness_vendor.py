"""Unit tests for the vendored-core fallback precedence in bin/harness_driver.py.

The driver ships a vendored copy of autoresearch-core under bin/vendor/ and uses
an installed copy ONLY when it is version-compatible (>= _REQUIRED_CORE), else
the vendored copy. GRD_HARNESS_CORE=vendored forces the vendored copy.

Run directly:  python3 -m pytest tests/python/test_harness_vendor.py
A jest wrapper runs the python suite in `npm test` and skips when python3/
autoresearch_core are unavailable.
"""
import importlib.util
import os
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
DRIVER = REPO / "bin" / "harness_driver.py"
spec = importlib.util.spec_from_file_location("hd", DRIVER)
hd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hd)


class TestVerOk(unittest.TestCase):
    """_ver_ok parses mod.__version__ and compares it against _REQUIRED_CORE."""

    def _mod(self, version):
        return types.SimpleNamespace(__version__=version)

    def test_required_core_constant(self):
        self.assertEqual(hd._REQUIRED_CORE, (0, 4, 7))

    def test_too_old_versions_rejected(self):
        self.assertFalse(hd._ver_ok(self._mod("0.4.6")))
        self.assertFalse(hd._ver_ok(self._mod("0.3.0")))

    def test_compatible_versions_accepted(self):
        self.assertTrue(hd._ver_ok(self._mod("0.4.7")))
        self.assertTrue(hd._ver_ok(self._mod("0.5.0")))

    def test_missing_or_unparseable_version_rejected(self):
        self.assertFalse(hd._ver_ok(types.SimpleNamespace()))
        self.assertFalse(hd._ver_ok(self._mod("not.a.version")))


class TestVendoredFallback(unittest.TestCase):
    """A clean subprocess with GRD_HARNESS_CORE=vendored must load the VENDORED
    copy even when a (here, editable) installed copy is importable — proving the
    forced-vendored precedence end to end."""

    def test_forced_vendored_loads_bin_vendor_copy(self):
        code = (
            "import importlib.util;"
            f"spec = importlib.util.spec_from_file_location('hd', r'{DRIVER}');"
            "mod = importlib.util.module_from_spec(spec);"
            "spec.loader.exec_module(mod);"
            "import autoresearch_core;"
            "print(autoresearch_core.__file__)"
        )
        env = {**os.environ, "GRD_HARNESS_CORE": "vendored"}
        proc = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True, text=True, env=env, timeout=60,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("bin/vendor", proc.stdout)


class TestStaleInstallFallsBackToVendored(unittest.TestCase):
    """An incompatible importable copy — too old (< _REQUIRED_CORE) OR version-ok
    but missing required symbols (a broken/partial install) — must be REJECTED in
    favour of the vendored copy and never crash the round. The failure mode that
    motivated vendoring."""

    def _assert_falls_back_to_vendored(self, init_src: str) -> None:
        with tempfile.TemporaryDirectory() as d:
            pkg = Path(d) / "autoresearch_core"
            pkg.mkdir()
            (pkg / "__init__.py").write_text(init_src)
            code = (
                "import importlib.util;"
                f"spec = importlib.util.spec_from_file_location('hd', r'{DRIVER}');"
                "mod = importlib.util.module_from_spec(spec);"
                "spec.loader.exec_module(mod);"
                "import autoresearch_core;"
                "print(autoresearch_core.__file__)"
            )
            # Prepend the fake so `import autoresearch_core` finds it FIRST;
            # _ensure_core must reject it and fall back to bin/vendor.
            env = {**os.environ, "PYTHONPATH": d}
            env.pop("GRD_HARNESS_CORE", None)
            proc = subprocess.run(
                [sys.executable, "-c", code],
                capture_output=True, text=True, env=env, timeout=60,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertIn("bin/vendor", proc.stdout)

    def test_stale_installed_copy_falls_back_to_vendored(self):
        # Too old: _ver_ok rejects it.
        self._assert_falls_back_to_vendored('__version__ = "0.4.6"\n')

    def test_incomplete_installed_copy_falls_back_to_vendored(self):
        # Version-ok but MISSING the required symbols (broken/partial install):
        # _core_usable's completeness check rejects it before the driver's import.
        self._assert_falls_back_to_vendored('__version__ = "0.4.7"\n')


if __name__ == "__main__":
    unittest.main(verbosity=2)
