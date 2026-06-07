# Life-Harness Phase E (Collective Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Downstream projects emit GRD-referencing findings as upstream candidates; the GRD repo's rounds consume them as extra evidence; `gd harness upstream list|clear` manages the queue.

**Architecture:** All new logic lives in `bin/harness_driver.py` (UpstreamStore JSONL store, heuristic classifier, CompositeFindings source, new `upstream` CLI action); `lib/commands/harness.ts` stays a thin shell-out. Store dir: `$CLAUDE_PLUGIN_DATA/harness/upstream/` with `~/.grd/harness/upstream/` fallback (the env var is plugin-runtime-only; plain-terminal `gd` needs a stable home — refinement over the sketch). Spec: `docs/superpowers/specs/2026-06-07-life-harness-phaseE-collective-design.md`.

**Tech Stack:** Python 3.11 stdlib + `autoresearch-core>=0.4.3` (no kernel changes); TypeScript strict CLI; jest; python unittest run via a jest wrapper with availability probe (CI runners may lack the kernel — skip, don't fail; mirrors release.yml's skip-absent-suites stance).

**Key constraint:** `RoundRecord` is a frozen kernel dataclass — upstream counters CANNOT be record fields. They are written by `FsRoundStore.save_round(record, extra=...)` merging extra keys into RECORD.json (additive, protocol-compatible: `RoundStore` is a runtime-checkable Protocol that only requires the method to exist).

**Working directory:** `/Users/neo/Developer/Projects/GetResearchDone` (branch `feat/life-harness-phase-e` off main).

---

### Task 1: UpstreamStore + heuristic classifier (driver) with python unit tests

**Files:**
- Modify: `bin/harness_driver.py` (append a "Phase E" section after `FsRoundStore`)
- Create: `tests/python/test_harness_upstream.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/python/test_harness_upstream.py
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
        ):
            self.assertTrue(hd._GD_REF_RE.search(text), text)

    def test_ignores_project_local_content(self):
        for text in (
            "RRF uses zero-based rank formula",
            "compression gains come from entropy coding",
            "the API returns 403 on missing 2FA",
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `PYTHONPATH=$HOME/Developer/Projects/autoresearch-core python3 tests/python/test_harness_upstream.py`
Expected: FAIL — `AttributeError: module 'hd' has no attribute '_GD_REF_RE'`

- [ ] **Step 3: Implement in `bin/harness_driver.py`** (append after the `FsRoundStore` class)

```python
# ── Phase E: upstream candidates (collective layer) ───────────────────────────
# Downstream projects emit GRD-referencing findings here; a round running in
# the upstream root (harness.upstream_root) consumes them as extra evidence.
# Spec: docs/superpowers/specs/2026-06-07-life-harness-phaseE-collective-design.md
_GD_REF_RE = re.compile(
    r"\bgd [a-z][a-z-]+|/grd:[a-z-]+|\bgrd-[a-z][a-z-]+\b|life-harness|harness round",
    re.IGNORECASE,
)


def upstream_dir() -> Path:
    """$CLAUDE_PLUGIN_DATA/harness/upstream, else ~/.grd/harness/upstream.

    The env var only exists under the plugin runtime; plain-terminal `gd`
    falls back to a stable machine-local dir so both entry points share state.
    """
    base = os.environ.get("CLAUDE_PLUGIN_DATA")
    if base:
        return Path(base) / "harness" / "upstream"
    return Path.home() / ".grd" / "harness" / "upstream"


def _candidate_id(content: str) -> str:
    import hashlib
    normalized = re.sub(r"\s+", " ", content.strip().lower())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def _origin_slug(origin: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", origin.lower()).strip("-") or "unknown"


class UpstreamStore:
    """One JSONL file per origin project under the shared upstream dir."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = root if root is not None else upstream_dir()

    def _rows(self, path: Path) -> list[dict]:
        return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]

    def emit(self, origin: str, findings, *, round_id: str, round_status: str,
             gd_version: str, now: str) -> int:
        """Append GRD-referencing findings as pending candidates. Dedup by id."""
        slug = _origin_slug(origin)
        rows = [
            {
                "id": _candidate_id(f.content), "origin": slug, "created_at": now,
                "kind": f.kind, "content": f.content, "source_session": f.source,
                "gd_version": gd_version, "round_id": round_id,
                "round_status": round_status, "status": "pending",
            }
            for f in findings if _GD_REF_RE.search(f.content)
        ]
        if not rows:
            return 0
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / f"{slug}.jsonl"
        existing = {r["id"] for r in self._rows(path)} if path.exists() else set()
        fresh, seen = [], set(existing)
        for r in rows:
            if r["id"] in seen:
                continue
            seen.add(r["id"])
            fresh.append(r)
        with path.open("a") as fh:
            for r in fresh:
                fh.write(json.dumps(r) + "\n")
        return len(fresh)

    def pending(self, *, ttl_days: int = 90, now: str) -> list[dict]:
        """Pending candidates, TTL-pruned on read, deduped across origins
        with an occurrence count (same content from N projects → count N)."""
        if not self.root.exists():
            return []
        cutoff = (
            _dt.datetime.strptime(now, "%Y-%m-%dT%H:%M:%SZ")
            - _dt.timedelta(days=ttl_days)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        out: dict[str, dict] = {}
        for path in sorted(self.root.glob("*.jsonl")):
            keep = [r for r in self._rows(path) if r.get("created_at", "") >= cutoff]
            path.write_text("".join(json.dumps(r) + "\n" for r in keep))
            for r in keep:
                if r.get("status") != "pending":
                    continue
                cur = out.get(r["id"])
                if cur:
                    cur["count"] += 1
                    cur["origins"] = sorted(set(cur["origins"] + [r["origin"]]))
                else:
                    out[r["id"]] = {**r, "count": 1, "origins": [r["origin"]]}
        return sorted(out.values(), key=lambda c: (-c["count"], c["created_at"]))

    def mark_consumed(self, ids: set[str]) -> int:
        if not self.root.exists():
            return 0
        n = 0
        for path in sorted(self.root.glob("*.jsonl")):
            rows = self._rows(path)
            changed = False
            for r in rows:
                if r["id"] in ids and r.get("status") == "pending":
                    r["status"] = "consumed"
                    changed = True
                    n += 1
            if changed:
                path.write_text("".join(json.dumps(r) + "\n" for r in rows))
        return n

    def clear(self, origin: str | None = None) -> int:
        """Delete candidate files; returns files removed."""
        if not self.root.exists():
            return 0
        n = 0
        for path in sorted(self.root.glob("*.jsonl")):
            if origin is None or path.stem == _origin_slug(origin):
                path.unlink()
                n += 1
        return n
```

Note: `import hashlib` is already at module top in the driver — drop the local
import if so (it is: `import hashlib` is NOT currently imported; keep the local
import OR add it to the top imports, your choice, but be consistent).

- [ ] **Step 4: Run to verify it passes**

Run: `PYTHONPATH=$HOME/Developer/Projects/autoresearch-core python3 tests/python/test_harness_upstream.py`
Expected: `OK` (8 tests)

Run: `python3 -m py_compile bin/harness_driver.py && echo OK`

- [ ] **Step 5: Commit**

```bash
git add bin/harness_driver.py tests/python/test_harness_upstream.py
git commit -m "feat(harness): Phase E upstream-candidate store + GRD-reference heuristic"
```

---

### Task 2: Emit + consume wiring in `run_round` (driver)

**Files:**
- Modify: `bin/harness_driver.py` (`FsRoundStore.save_round`, `run_round`, `main`)
- Modify: `tests/python/test_harness_upstream.py` (add wiring tests)

- [ ] **Step 1: Add failing tests**

```python
class TestRoundWiring(unittest.TestCase):
    """save_round extra-merge + the emit/consume config gates (pure parts)."""

    def test_save_round_merges_extra_keys(self):
        from autoresearch_core import RoundRecord
        with tempfile.TemporaryDirectory() as tmp:
            store = hd.FsRoundStore(Path(tmp))
            rec = RoundRecord(round_id="r1", status="skipped", detail="x")
            store.save_round(rec, extra={"upstream_emitted": 3})
            data = json.loads((Path(tmp) / "harness" / "rounds" / "r1" / "RECORD.json").read_text())
            self.assertEqual(data["upstream_emitted"], 3)
            self.assertEqual(data["status"], "skipped")

    def test_composite_findings_appends_upstream(self):
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
            self.assertEqual(comp.consumed_ids and len(comp.consumed_ids), 1)
```

Run: `PYTHONPATH=$HOME/Developer/Projects/autoresearch-core python3 tests/python/test_harness_upstream.py`
Expected: FAIL — `TypeError: save_round() got an unexpected keyword argument 'extra'` (or AttributeError CompositeFindings)

- [ ] **Step 2: Implement**

(a) `FsRoundStore.save_round` — change signature and the RECORD.json write:

```python
    def save_round(self, record: RoundRecord, extra: dict | None = None) -> None:
        d = self.root / "rounds" / record.round_id
        d.mkdir(parents=True, exist_ok=True)
        payload = asdict(record)
        if extra:
            payload.update(extra)
        (d / "RECORD.json").write_text(json.dumps(payload, indent=2) + "\n")
        ...  # hash-persistence block unchanged
```

(b) `CompositeFindings` (append after `UpstreamStore`):

```python
class CompositeFindings:
    """Local Tesserae findings + pending upstream candidates (upstream root only).

    `local_findings` is a callable so tests can inject; production passes
    `TesseraeFindings(repo).findings`.
    """

    def __init__(self, *, local_findings, store: UpstreamStore, ttl_days: int, now: str) -> None:
        self._local = local_findings
        self._store = store
        self._ttl = ttl_days
        self._now = now
        self.consumed_ids: set[str] = set()

    def findings(self, since: str | None):
        out = list(self._local(since))
        for c in self._store.pending(ttl_days=self._ttl, now=self._now):
            self.consumed_ids.add(c["id"])
            kind = c["kind"] if c["kind"] in _FINDING_KINDS else "insight"
            out.append(Finding(
                kind=kind, content=c["content"],
                source=f"upstream:{'+'.join(c['origins'])}:{c.get('source_session','')}",
                created_at=c.get("created_at", ""),
            ))
        return out
```

(c) `run_round` wiring — three surgical changes:

1. After the config/h read near the top, derive:
```python
    upstream_root = h.get("upstream_root") is True
    upstream_emit = h.get("upstream_emit") is not False
    ttl_days = h.get("upstream_ttl_days") if isinstance(h.get("upstream_ttl_days"), int) else 90
```
2. Evidence source selection (replacing the direct `TesseraeFindings(repo).findings(last)` call):
```python
    if upstream_root:
        source = CompositeFindings(local_findings=TesseraeFindings(repo).findings,
                                   store=UpstreamStore(), ttl_days=ttl_days, now=_now())
    else:
        source = TesseraeFindings(repo)
    evidence = select_evidence(source.findings(last), max_items=..., min_items=...)
```
3. At the end (just before `return RoundRecord(...)` for the post-worktree paths — implement by computing the record into a variable `rec` first, then):
```python
    extra: dict[str, int] = {}
    if not dry_run and rec.status in ("applied", "evaluated", "rejected"):
        if upstream_root and isinstance(source, CompositeFindings) and source.consumed_ids:
            extra["upstream_consumed"] = UpstreamStore().mark_consumed(source.consumed_ids)
        elif (not upstream_root) and upstream_emit:
            extra["upstream_emitted"] = UpstreamStore().emit(
                repo.name, evidence, round_id=rec.round_id,
                round_status=rec.status, gd_version=GD_VERSION, now=_now())
    return rec, extra
```
`run_round` now returns `tuple[RoundRecord, dict]`; `main()` becomes:
```python
    record, extra = run_round(repo, args.auto, args.dry_run, args.full_eval)
    FsRoundStore(repo).save_round(record, extra=extra or None)
    out = asdict(record); out.update(extra)
    sys.stdout.write(json.dumps(out, indent=2) + "\n")
```
All OTHER `return RoundRecord(...)` early exits (kill switch / interval / thin
evidence / dry-run) become `return RoundRecord(...), {}` — update every one.
`GD_VERSION`: read once near the top of the module:
```python
def _gd_version(repo: Path) -> str:
    try:
        return json.loads((repo / "package.json").read_text()).get("version", "unknown")
    except (OSError, ValueError):
        return "unknown"
```
and call it in `run_round` (the repo param is in scope; pass the value into the
emit call — do NOT make it a module global since `repo` is per-invocation).

- [ ] **Step 3: Run to verify**

Run: `PYTHONPATH=$HOME/Developer/Projects/autoresearch-core python3 tests/python/test_harness_upstream.py`
Expected: OK (10 tests)
Run: `python3 -m py_compile bin/harness_driver.py && echo OK`
Run (regression — dry-run still works, no upstream side effects):
`CLAUDE_PLUGIN_DATA=$(mktemp -d) PYTHONPATH=$HOME/Developer/Projects/autoresearch-core node bin/gd.js harness round --dry-run --json | python3 -c "import sys,json; j=json.load(sys.stdin); print(j['status'])"`
Expected: `skipped` or `gathered`; the mktemp dir stays empty.

- [ ] **Step 4: Commit**

```bash
git add bin/harness_driver.py tests/python/test_harness_upstream.py
git commit -m "feat(harness): wire upstream emit/consume into run_round; save_round extra keys"
```

---

### Task 3: `upstream` action in the driver CLI

**Files:**
- Modify: `bin/harness_driver.py` (`main` argparse)
- Modify: `tests/python/test_harness_upstream.py`

- [ ] **Step 1: Add failing test**

```python
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
```

Run + expect FAIL (`argparse` rejects `upstream`).

- [ ] **Step 2: Implement in `main()`**

```python
    ap.add_argument("action", choices=["round", "revert", "upstream"])
    ap.add_argument("--op", choices=["list", "clear"], default="list")
    ap.add_argument("--origin", default="")
    ap.add_argument("--ttl", type=int, default=90)
    ...
    if args.action == "upstream":
        store = UpstreamStore()
        if args.op == "clear":
            sys.stdout.write(json.dumps({"cleared": store.clear(args.origin or None)}) + "\n")
        else:
            sys.stdout.write(json.dumps(
                {"pending": store.pending(ttl_days=args.ttl, now=_now())}, indent=2) + "\n")
        return 0
```

(Place before the `revert` branch; `--sha`/`--cwd` args unchanged.)

- [ ] **Step 3: Verify** — unittest OK (11 tests), py_compile OK.

- [ ] **Step 4: Commit**

```bash
git add bin/harness_driver.py tests/python/test_harness_upstream.py
git commit -m "feat(harness): upstream list/clear driver action"
```

---

### Task 4: `gd harness upstream` TS surface

**Files:**
- Modify: `lib/commands/harness.ts`
- Modify: `lib/cli/tools.ts` (`command === 'harness'` block at line ~154)
- Modify: `commands/harness.md`
- Modify: `tests/unit/commands/harness.test.ts`

- [ ] **Step 1: Add failing jest tests** (same fake-spawn pattern as the existing round tests)

```typescript
  test('upstream list shells to the driver and prints its JSON', () => {
    const calls: Array<{ argv: string[] }> = [];
    const fakeSpawn = (cmd: string, args: string[], _opts: Record<string, unknown>) => {
      calls.push({ argv: [cmd, ...args] });
      return { status: 0, stdout: '{"pending":[]}', stderr: '' };
    };
    const { stdout, exitCode } = captureOutput(() => {
      cmdHarnessUpstream(fixtureDir, 'list', '', false, { spawnSync: fakeSpawn });
    });
    expect(exitCode).toBe(0);
    expect(calls[0].argv.join(' ')).toContain('harness_driver.py');
    expect(calls[0].argv).toContain('upstream');
    expect(calls[0].argv).toContain('list');
    expect(JSON.parse(stdout).pending).toEqual([]);
  });

  test('upstream clear passes --origin through', () => {
    const calls: Array<{ argv: string[] }> = [];
    const fakeSpawn = (cmd: string, args: string[], _opts: Record<string, unknown>) => {
      calls.push({ argv: [cmd, ...args] });
      return { status: 0, stdout: '{"cleared":1}', stderr: '' };
    };
    captureOutput(() => {
      cmdHarnessUpstream(fixtureDir, 'clear', 'ProjA', false, { spawnSync: fakeSpawn });
    });
    expect(calls[0].argv).toContain('--origin');
    expect(calls[0].argv).toContain('ProjA');
  });
```

(Import `cmdHarnessUpstream` in the existing require at the top of the test.)

- [ ] **Step 2: Implement `cmdHarnessUpstream` in `lib/commands/harness.ts`**

```typescript
function cmdHarnessUpstream(
  cwd: string,
  op: string,
  origin: string,
  raw: boolean,
  deps: HarnessDeps = {}
): void {
  if (op !== 'list' && op !== 'clear') error(`usage: gd harness upstream list|clear [--origin <slug>]`);
  const spawn = deps.spawnSync ?? (nodeSpawnSync as unknown as NonNullable<HarnessDeps['spawnSync']>);
  const args = [_driverPath(), 'upstream', '--op', op, '--cwd', cwd];
  if (origin) args.push('--origin', origin);
  const result = spawn('python3', args, { encoding: 'utf-8', timeout: 60000, env: process.env });
  if (result.error?.code === 'ENOENT') {
    error('python3 not found — the harness driver requires Python 3.11+ with autoresearch-core>=0.4.3');
  }
  if (result.status !== 0) error(`harness driver failed (exit ${result.status}): ${result.stderr.slice(-500)}`);
  process.stdout.write(result.stdout);
}
```

Export it in `module.exports`. The driver contract from Task 3 is
`upstream --op list|clear` — `'upstream'`, `'--op'`, and the op value all
appear as separate argv elements, which is what Step 1's `toContain`
assertions check.

- [ ] **Step 3: Dispatch in `lib/cli/tools.ts`** — inside the existing harness block, before the `round` branch:

```typescript
    } else if (subcommand === 'upstream') {
      const op = allArgs.find((a) => !a.startsWith('--')) ?? 'list';
      const originIdx = allArgs.indexOf('--origin');
      const origin = originIdx >= 0 ? (allArgs[originIdx + 1] ?? '') : '';
      cmdHarnessUpstream(cwd, op, origin, raw);
```

(extend the typed require accordingly).

- [ ] **Step 4: `commands/harness.md`** — add:

```markdown
- `gd harness upstream list` / `gd harness upstream clear [--origin <slug>]` —
  inspect or prune cross-project upstream candidates
  (`$CLAUDE_PLUGIN_DATA/harness/upstream`, fallback `~/.grd/harness/upstream`).
```

- [ ] **Step 5: Verify**

Run: `TMPDIR=$(mktemp -d) npx jest tests/unit/commands/harness.test.ts 2>&1 | tail -3` → all pass (12)
Run: `npm run build:check && npx eslint lib/commands/harness.ts lib/cli/tools.ts` → clean
Run: `CLAUDE_PLUGIN_DATA=$(mktemp -d) node bin/gd.js harness upstream list --json` → `{"pending": []}`

- [ ] **Step 6: Commit**

```bash
git add lib/commands/harness.ts lib/cli/tools.ts commands/harness.md tests/unit/commands/harness.test.ts
git commit -m "feat(harness): gd harness upstream list|clear"
```

---

### Task 5: jest wrapper for the python suite (skip when unavailable)

**Files:**
- Create: `tests/unit/harness-upstream.test.ts`

- [ ] **Step 1: Write the wrapper**

```typescript
'use strict';
/**
 * Runs the Phase E python unit suite (tests/python/test_harness_upstream.py)
 * inside npm test. Skips (does not fail) when python3 or autoresearch_core
 * is unavailable — mirrors release.yml's stance on absent-binary suites.
 */
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..');

function pythonReady(): boolean {
  try {
    execFileSync('python3', ['-c', 'import autoresearch_core'], {
      encoding: 'utf-8', timeout: 15000, env: process.env,
    });
    return true;
  } catch {
    return false;
  }
}

const ready = pythonReady();
(ready ? describe : describe.skip)('harness upstream python suite', () => {
  test('python unittest passes', () => {
    const out = execFileSync(
      'python3', [path.join(REPO, 'tests', 'python', 'test_harness_upstream.py')],
      { encoding: 'utf-8', timeout: 120000, env: process.env }
    );
    expect(out).toBeDefined();
  });
});

if (!ready) {
  test('python suite skipped (python3/autoresearch_core unavailable)', () => {
    expect(true).toBe(true);
  });
}
```

NOTE: developers run with the kernel importable. If the local python3 lacks
the package, set `PYTHONPATH=$HOME/Developer/Projects/autoresearch-core` in
the shell before `npm test` — the wrapper inherits `process.env`.

- [ ] **Step 2: Verify both branches**

Run: `TMPDIR=$(mktemp -d) PYTHONPATH=$HOME/Developer/Projects/autoresearch-core npx jest tests/unit/harness-upstream.test.ts 2>&1 | tail -3` → 1 passed
Run: `TMPDIR=$(mktemp -d) PYTHONPATH= npx jest tests/unit/harness-upstream.test.ts 2>&1 | tail -3` → 1 passed (the skip-marker test) IF the system python lacks the kernel; if it has it globally, both branches are the pass branch — fine.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/harness-upstream.test.ts
git commit -m "test(harness): run Phase E python suite under jest with availability skip"
```

---

### Task 6: Docs + full gate + live smoke

**Files:**
- Modify: `CLAUDE.md` (harness keys sentence: add `upstream_emit`, `upstream_root`, `upstream_ttl_days`)
- Modify: `docs/CHANGELOG.md` (`[Unreleased]` section)
- Smoke + suite

- [ ] **Step 1: CLAUDE.md** — extend the harness key list in the Autoresearch
section with `upstream_emit`, `upstream_root`, `upstream_ttl_days`.

- [ ] **Step 2: CHANGELOG `[Unreleased]`**

```markdown
### Added
- Life-harness Phase E (collective layer): downstream rounds emit
  GRD-referencing findings as upstream candidates
  (`$CLAUDE_PLUGIN_DATA/harness/upstream`, fallback `~/.grd/harness/upstream`);
  rounds in the upstream root (`harness.upstream_root: true`) consume them as
  extra evidence with cross-project occurrence counting.
  `gd harness upstream list|clear`. Config: `harness.upstream_emit` (default
  on), `harness.upstream_root`, `harness.upstream_ttl_days` (90).
```

- [ ] **Step 3: Full gate + smoke**

Run: `TMPDIR=$(mktemp -d) PYTHONPATH=$HOME/Developer/Projects/autoresearch-core npm test 2>&1 | tail -5`
Expected: pass (cli.test.ts solo-rerun rule applies if it alone flakes).
Run the end-to-end smoke (isolated plugin-data dir, no repo state touched):

```bash
PD=$(mktemp -d)
CLAUDE_PLUGIN_DATA=$PD PYTHONPATH=$HOME/Developer/Projects/autoresearch-core \
  node bin/gd.js harness upstream list --json          # {"pending": []}
python3 - <<'EOF'                                       # seed one candidate
import json, os, pathlib
root = pathlib.Path(os.environ["PD"]) / "harness" / "upstream"
root.mkdir(parents=True)
(root / "proja.jsonl").write_text(json.dumps({
  "id": "abcd1234abcd1234", "origin": "proja",
  "created_at": "2026-06-07T00:00:00Z", "kind": "takeaway",
  "content": "gd harness round rejected a good patch", "source_session": "s",
  "gd_version": "0.4.3", "round_id": "r1", "round_status": "rejected",
  "status": "pending"}) + "\n")
EOF
CLAUDE_PLUGIN_DATA=$PD ... node bin/gd.js harness upstream list --json   # count 1
CLAUDE_PLUGIN_DATA=$PD ... node bin/gd.js harness upstream clear --json  # cleared 1
rm -rf "$PD"
```

(export PD for the heredoc: `export PD`.)

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/CHANGELOG.md
git commit -m "docs(harness): Phase E config keys + changelog"
```

---

## Self-review notes (plan time)

- Spec §2 flows 1+2 → Tasks 1–3; §3 data model → Task 1 (record shape, TTL, dedupe/count); §4 config → Task 2 (gates) + Task 6 (docs); §6 surface → Tasks 3–4 (round-record extras in Task 2); §7 safety → unchanged kernel guards + emit/consume only on real rounds; flow 3 → no work (per spec).
- Frozen-RoundRecord constraint handled via `save_round(record, extra=)` — documented in header.
- Driver `upstream` action contract (`upstream --op list|clear --origin S`) is stated identically in Tasks 3 and 4 (Step 2 carries an inline correction note for the Step 1 assertion — implementer: assert on `--op`).
- Open question §8.1 (downstream dead-end propagation) deliberately NOT implemented — out of scope per spec.
