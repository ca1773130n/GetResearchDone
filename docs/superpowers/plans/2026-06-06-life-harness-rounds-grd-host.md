# Life-Harness Rounds — GRD Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the autoresearch-core 0.2.0 round kernel into GRD: a Python driver, the `gd harness` CLI surface, and `gd evolve` deprecation.

**Architecture:** `gd harness round` (TS, thin) resolves backend/account env and shells out to `bin/harness_driver.py` (Python, ~250 lines), which binds the kernel's five ports: Tesserae compiled graph (findings), spawned codex/claude (proposal), repo checks (eval), git branch+commit (apply/revert), `.planning/harness/` (records). Canonical spec lives in autoresearch-core: `docs/superpowers/specs/2026-06-06-life-harness-rounds-design.md`; GRD cross-ref: `docs/superpowers/specs/2026-06-06-life-harness-rounds-grd-host.md`.

**Tech Stack:** TypeScript (strict, CommonJS) for CLI; Python 3.11 stdlib + `autoresearch-core>=0.2` for the driver; jest for CLI tests.

**Prerequisite:** the kernel plan (autoresearch-core repo, `docs/superpowers/plans/2026-06-06-life-harness-rounds-kernel.md`) is implemented and 0.2.0 is installable (released, or `pip install -e ~/Developer/Projects/autoresearch-core` for local dev).

**Repo conventions that apply:** zero `any`; `'use strict'` first line; typed requires; tests mirror `lib/`; never create test artifacts in the repo (use `mkdtemp` under `os.tmpdir()`); run jest with `TMPDIR` outside the repo.

---

### Task 1: The Python driver — `bin/harness_driver.py`

**Files:**
- Create: `bin/harness_driver.py`

This file is intentionally thin: every decision is a kernel call; the driver
only does I/O. There are no GRD-side unit tests for it (the repo is jest-only);
its logic is covered by the kernel's pytest suite, and Task 5 smoke-runs it.

- [ ] **Step 1: Write the driver**

```python
#!/usr/bin/env python3
"""GRD host driver for life-harness rounds.

Binds autoresearch-core's round ports to GRD's infrastructure:
  FindingsSource -> .tesserae/graph.json (Tesserae-compiled Session findings)
  PatchProposer  -> spawned backend CLI (argv via GRD_HARNESS_SPAWN_ARGV)
  RoundEvaluator -> markdown/config structural checks + npm lint/build:check/jest
  Applier        -> git branch harness/round-<id> + single commit (revert = git revert)
  RoundStore     -> .planning/harness/

Invoked by `gd harness round` — not intended to be run by agents directly.
Exit codes: 0 = round completed (any status), 2 = environment/config error.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from dataclasses import asdict
from pathlib import Path

try:
    from autoresearch_core import (
        EvalCheck, EvalReport, Finding, PatchEntry, RoundPatch, RoundRecord,
        decide_round, patch_hash, resolve_autonomy, select_evidence,
    )
except ImportError:  # pragma: no cover
    sys.stderr.write("autoresearch-core>=0.2 is required: pip install 'autoresearch-core>=0.2'\n")
    sys.exit(2)

DENY_PATHS = ("bin/harness_driver.py",)
CONFIG_PATH = ".planning/config.json"
# Session finding node types produced by Tesserae's session import/compile.
# Verified against the local tesserae version at implementation time; the
# fallback accepts a bare `kind` field carrying one of the six finding kinds.
_FINDING_KINDS = ("insight", "decision", "question", "todo", "hypothesis", "takeaway")
_FINDING_TYPE_RE = re.compile(
    r"^Session(Insight|Decision|Question|Todo|Hypothesis|Takeaway)$"
)


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _run(argv: list[str], cwd: str, timeout: int = 600) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=timeout)


# ── FindingsSource ────────────────────────────────────────────────────────────
class TesseraeFindings:
    def __init__(self, repo: Path) -> None:
        self.graph = repo / ".tesserae" / "graph.json"

    def findings(self, since: str | None) -> list[Finding]:
        if not self.graph.exists():
            raise SystemExit(
                "no .tesserae/graph.json — run `tesserae sessions-import` + `tesserae refresh` first"
            )
        data = json.loads(self.graph.read_text())
        out: list[Finding] = []
        for node in data.get("nodes", []):
            ntype = str(node.get("node_type") or node.get("type") or "")
            m = _FINDING_TYPE_RE.match(ntype)
            kind = m.group(1).lower() if m else str(node.get("kind", ""))
            if kind not in _FINDING_KINDS:
                continue
            created = str(node.get("created_at") or node.get("timestamp") or "")
            if since and created and created <= since:
                continue
            content = str(node.get("content") or node.get("description") or node.get("name") or "")
            if content:
                out.append(Finding(kind=kind, content=content,  # type: ignore[arg-type]
                                   source=str(node.get("node_id") or node.get("id") or ""),
                                   created_at=created))
        return out


# ── PatchProposer ─────────────────────────────────────────────────────────────
PROPOSAL_INSTRUCTIONS = """You are improving the GRD harness from session evidence.
Read evidence.md. Propose ONE focused patch to this repository's primitives
(commands/*.md, agents/*.md, skill markdown, .planning/config.json, lib/**.ts).
Write patch.json (and nothing else) in the current directory:
{"summary": "<one line>", "confidence": <0..1>,
 "entries": [{"path": "<repo-relative>", "kind": "markdown|config|code",
              "op": "modify|create|delete", "content": "<full post-image or null for delete>",
              "rationale": "<why>", "evidence_refs": ["<finding source>"]}]}
Rules: full file post-images (not diffs); smallest change that addresses the
evidence; never touch .git, bin/harness_driver.py, or the harness config block.
"""


class AgentProposer:
    def __init__(self, spawn_argv: list[str]) -> None:
        self.spawn_argv = spawn_argv  # e.g. ["codex", "exec", "--cd", "<replaced>"]

    def propose(self, evidence_md: str, workdir: str) -> RoundPatch:
        (Path(workdir) / "evidence.md").write_text(evidence_md)
        (Path(workdir) / "INSTRUCTIONS.md").write_text(PROPOSAL_INSTRUCTIONS)
        argv = [a.replace("{workdir}", workdir) for a in self.spawn_argv]
        proc = _run(argv + [PROPOSAL_INSTRUCTIONS], cwd=workdir, timeout=900)
        patch_file = Path(workdir) / "patch.json"
        if not patch_file.exists():
            raise ValueError(
                f"proposer wrote no patch.json (exit {proc.returncode}): {proc.stderr[-400:]}"
            )
        raw = json.loads(patch_file.read_text())
        entries = tuple(
            PatchEntry(path=str(e["path"]), kind=e["kind"], op=e["op"],
                       content=e.get("content"), rationale=str(e.get("rationale", "")),
                       evidence_refs=tuple(e.get("evidence_refs", [])))
            for e in raw.get("entries", [])
        )
        return RoundPatch(round_id=str(raw.get("round_id") or uuid.uuid4().hex[:8]),
                          entries=entries, summary=str(raw.get("summary", "")),
                          confidence=float(raw.get("confidence", 0.0)))


# ── RoundEvaluator ────────────────────────────────────────────────────────────
class RepoEvaluator:
    def __init__(self, full_eval: bool) -> None:
        self.full_eval = full_eval

    def _apply_entries(self, patch: RoundPatch, workdir: str) -> None:
        for e in patch.entries:
            target = Path(workdir) / e.path
            if e.op == "delete":
                target.unlink(missing_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(e.content or "")

    def evaluate(self, patch: RoundPatch, workdir: str) -> EvalReport:
        self._apply_entries(patch, workdir)
        checks: list[EvalCheck] = []
        touched_code = False
        for e in patch.entries:
            if e.kind == "markdown" and e.op != "delete":
                body = e.content or ""
                ok = body.startswith("---") and "description:" in body.split("---")[1] \
                    if body.count("---") >= 2 else False
                checks.append(EvalCheck(f"frontmatter:{e.path}", 0 if ok else 1,
                                        "" if ok else "missing ---/description frontmatter"))
            if e.kind == "config" and e.op != "delete":
                try:
                    json.loads(e.content or "")
                    checks.append(EvalCheck(f"json:{e.path}", 0))
                except ValueError as exc:
                    checks.append(EvalCheck(f"json:{e.path}", 1, str(exc)))
            if e.kind == "code":
                touched_code = True
        if touched_code:
            env = {**os.environ, "TMPDIR": str(Path(os.environ.get("TMPDIR", "/tmp")))}
            for name, argv in (
                ("lint", ["npm", "run", "lint"]),
                ("tsc", ["npm", "run", "build:check"]),
            ):
                p = subprocess.run(argv, cwd=workdir, capture_output=True, text=True,
                                   timeout=600, env=env)
                checks.append(EvalCheck(name, p.returncode, p.stdout[-400:] + p.stderr[-400:]))
            if self.full_eval:
                p = subprocess.run(["npm", "test"], cwd=workdir, capture_output=True,
                                   text=True, timeout=1800, env=env)
                checks.append(EvalCheck("jest", p.returncode, p.stderr[-400:]))
        return EvalReport(checks=tuple(checks))


# ── Applier ───────────────────────────────────────────────────────────────────
class GitApplier:
    def __init__(self, repo: Path) -> None:
        self.repo = repo

    def apply(self, patch: RoundPatch, workdir: str) -> str:
        rid = patch.round_id
        _run(["git", "add", "-A"], cwd=workdir)
        msg = f"harness(round-{rid}): {patch.summary}\n\n[life-harness round {rid}]"
        p = _run(["git", "commit", "-m", msg], cwd=workdir)
        if p.returncode != 0:
            raise ValueError(f"commit failed: {p.stderr[-400:]}")
        return _run(["git", "rev-parse", "HEAD"], cwd=workdir).stdout.strip()

    def revert(self, sha: str) -> str:
        p = _run(["git", "revert", "--no-edit", sha], cwd=str(self.repo))
        if p.returncode != 0:
            raise ValueError(f"revert failed: {p.stderr[-400:]}")
        return _run(["git", "rev-parse", "HEAD"], cwd=str(self.repo)).stdout.strip()


# ── RoundStore ────────────────────────────────────────────────────────────────
class FsRoundStore:
    def __init__(self, repo: Path) -> None:
        self.root = repo / ".planning" / "harness"

    def save_round(self, record: RoundRecord) -> None:
        d = self.root / "rounds" / record.round_id
        d.mkdir(parents=True, exist_ok=True)
        (d / "RECORD.json").write_text(json.dumps(asdict(record), indent=2) + "\n")
        if record.patch_hash and record.status in ("applied", "rejected"):
            with (self.root / "hashes.jsonl").open("a") as f:
                f.write(json.dumps({"hash": record.patch_hash, "round": record.round_id,
                                    "status": record.status}) + "\n")

    def load_patch_hashes(self) -> set[str]:
        f = self.root / "hashes.jsonl"
        if not f.exists():
            return set()
        return {json.loads(line)["hash"] for line in f.read_text().splitlines() if line}

    def last_round_at(self) -> str | None:
        rounds = sorted((self.root / "rounds").glob("*/RECORD.json")) \
            if (self.root / "rounds").exists() else []
        if not rounds:
            return None
        return str(json.loads(rounds[-1].read_text()).get("created_at") or "") or None


# ── Orchestration ─────────────────────────────────────────────────────────────
def run_round(repo: Path, auto: bool, dry_run: bool, full_eval: bool) -> RoundRecord:
    config = json.loads((repo / CONFIG_PATH).read_text()) if (repo / CONFIG_PATH).exists() else {}
    autonomy = resolve_autonomy(config, no_gates=auto)
    store = FsRoundStore(repo)
    rid = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%d-%H%M%S")

    if autonomy.kill_switch:
        return RoundRecord(round_id=rid, status="skipped", detail="kill switch is on",
                           created_at=_now())
    last = store.last_round_at()
    if last:
        age_h = (_dt.datetime.now(_dt.timezone.utc)
                 - _dt.datetime.strptime(last, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=_dt.timezone.utc)
                 ).total_seconds() / 3600
        if age_h < autonomy.min_interval_hours:
            return RoundRecord(round_id=rid, status="skipped", created_at=_now(),
                               detail=f"last round {age_h:.1f}h ago (< {autonomy.min_interval_hours}h)")

    h = config.get("harness") if isinstance(config.get("harness"), dict) else {}
    evidence = select_evidence(
        TesseraeFindings(repo).findings(last),
        max_items=h.get("max_evidence", 25) if isinstance(h.get("max_evidence"), int) else 25,
        min_items=h.get("min_evidence", 3) if isinstance(h.get("min_evidence"), int) else 3,
    )
    if not evidence:
        return RoundRecord(round_id=rid, status="skipped", detail="not enough evidence",
                           evidence_count=0, created_at=_now())
    evidence_md = "# Session evidence\n\n" + "\n".join(
        f"- **{f.kind}** ({f.source}): {f.content}" for f in evidence)
    if dry_run:
        sys.stdout.write(evidence_md + "\n")
        return RoundRecord(round_id=rid, status="gathered", detail="dry run",
                           evidence_count=len(evidence), created_at=_now())

    # scratch worktree on a round branch
    branch = f"harness/round-{rid}"
    workdir = Path(os.environ.get("TMPDIR", "/tmp")) / f"grd-harness-{rid}"
    _run(["git", "worktree", "add", "-b", branch, str(workdir)], cwd=str(repo))
    try:
        spawn_argv = json.loads(os.environ.get("GRD_HARNESS_SPAWN_ARGV", "[]"))
        if not spawn_argv:
            raise SystemExit("GRD_HARNESS_SPAWN_ARGV not set — invoke via `gd harness round`")
        try:
            patch = AgentProposer(spawn_argv).propose(evidence_md, str(workdir))
        except (ValueError, json.JSONDecodeError, KeyError) as exc:
            return RoundRecord(round_id=rid, status="rejected", detail=f"proposal failed: {exc}",
                               evidence_count=len(evidence), created_at=_now())
        patch = RoundPatch(round_id=rid, entries=patch.entries,
                           summary=patch.summary, confidence=patch.confidence)
        eval_report = RepoEvaluator(full_eval).evaluate(patch, str(workdir))
        status, detail = decide_round(
            patch, autonomy, store.load_patch_hashes(), eval_report,
            deny_paths=DENY_PATHS, config_path=CONFIG_PATH,
            current_harness=h if h else None,
        )
        applied_sha = None
        if status in ("applied", "evaluated"):
            applied_sha = GitApplier(repo).apply(patch, str(workdir))
            if status == "applied":
                p = _run(["git", "merge", "--no-ff", "-m",
                          f"harness: merge round {rid}", branch], cwd=str(repo))
                if p.returncode != 0:
                    status, detail = "rejected", f"merge failed: {p.stderr[-400:]}"
        return RoundRecord(round_id=rid, status=status, detail=detail,
                           evidence_count=len(evidence), patch_hash=patch_hash(patch),
                           eval_report=eval_report, applied_sha=applied_sha, created_at=_now())
    finally:
        _run(["git", "worktree", "remove", "--force", str(workdir)], cwd=str(repo))
        # keep the branch when a commit landed on it (review flow); else delete
        heads = _run(["git", "rev-parse", "--verify", branch], cwd=str(repo))
        merged = _run(["git", "merge-base", "--is-ancestor", branch, "HEAD"], cwd=str(repo))
        if heads.returncode == 0 and merged.returncode == 0:
            _run(["git", "branch", "-D", branch], cwd=str(repo))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["round", "revert"])
    ap.add_argument("--auto", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--full-eval", action="store_true")
    ap.add_argument("--sha", default="")
    ap.add_argument("--cwd", default=".")
    args = ap.parse_args()
    repo = Path(args.cwd).resolve()
    if args.action == "revert":
        if not args.sha:
            sys.stderr.write("revert requires --sha\n")
            return 2
        sha = GitApplier(repo).revert(args.sha)
        sys.stdout.write(json.dumps({"reverted_to": sha}) + "\n")
        return 0
    record = run_round(repo, args.auto, args.dry_run, args.full_eval)
    FsRoundStore(repo).save_round(record)
    sys.stdout.write(json.dumps(asdict(record), indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Syntax-check and inspect the local graph schema**

Run: `python3 -m py_compile bin/harness_driver.py && echo OK`
Expected: `OK`

Run: `python3 -c "import json; g=json.load(open('.tesserae/graph.json')); print(sorted({n.get('node_type') or n.get('type','?') for n in g['nodes']}))"`
Expected: a list of node types. If session-finding nodes exist and their type
strings do NOT match `Session(Insight|Decision|...)` or a `kind` field with the
six finding kinds, adjust `_FINDING_TYPE_RE`/the `kind` fallback in the driver
to the observed schema before proceeding (this is the spec's planned
implementation-time verification).

- [ ] **Step 3: Commit**

```bash
git add bin/harness_driver.py
git commit -m "feat(harness): Python driver binding autoresearch-core round ports to GRD infra"
```

---

### Task 2: `lib/commands/harness.ts` — the gd-side handler

**Files:**
- Create: `lib/commands/harness.ts`
- Test: `tests/unit/commands/harness.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
'use strict';
const path = require('path');
const { cmdHarnessRound, cmdHarnessStatus, _buildSpawnArgv } =
  require('../../../lib/commands/harness');
const { captureOutput, captureError } = require('../../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../../helpers/fixtures');
const fs = require('fs');

describe('harness command', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('_buildSpawnArgv composes codex argv with trust + cd', () => {
    const argv = _buildSpawnArgv('codex', '/repo');
    expect(argv[0]).toBe('codex');
    expect(argv).toContain('exec');
    expect(argv.join(' ')).toContain('/repo');
  });

  test('_buildSpawnArgv composes claude argv', () => {
    const argv = _buildSpawnArgv('claude', '/repo');
    expect(argv[0]).toBe('claude');
    expect(argv).toContain('-p');
  });

  test('round invokes the driver with env and prints its JSON', () => {
    const calls: Array<{ argv: string[]; env: Record<string, string | undefined> }> = [];
    const fakeSpawn = (cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => {
      calls.push({ argv: [cmd, ...args], env: opts.env as Record<string, string | undefined> });
      return { status: 0, stdout: '{"round_id":"x","status":"skipped"}', stderr: '' };
    };
    const { stdout, exitCode } = captureOutput(() => {
      cmdHarnessRound(fixtureDir, { auto: false, dryRun: true, fullEval: false }, false,
        { spawnSync: fakeSpawn });
    });
    expect(exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].argv.join(' ')).toContain('harness_driver.py');
    expect(calls[0].argv).toContain('--dry-run');
    expect(calls[0].env.GRD_HARNESS_SPAWN_ARGV).toBeDefined();
    expect(JSON.parse(stdout).status).toBe('skipped');
  });

  test('round errors helpfully when python is missing', () => {
    const fakeSpawn = () => ({ status: null, stdout: '', stderr: '', error: { code: 'ENOENT' } });
    const { exitCode, stderr } = captureError(() => {
      cmdHarnessRound(fixtureDir, { auto: false, dryRun: false, fullEval: false }, false,
        { spawnSync: fakeSpawn });
    });
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/python3/i);
  });

  test('status renders saved rounds', () => {
    const d = path.join(fixtureDir, '.planning', 'harness', 'rounds', '20260606-010101');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'RECORD.json'),
      JSON.stringify({ round_id: '20260606-010101', status: 'evaluated', detail: 'awaiting review' }));
    const { stdout, exitCode } = captureOutput(() => {
      cmdHarnessStatus(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.rounds).toHaveLength(1);
    expect(parsed.rounds[0].status).toBe('evaluated');
  });

  test('status with no rounds reports empty', () => {
    const { stdout } = captureOutput(() => {
      cmdHarnessStatus(fixtureDir, false);
    });
    expect(JSON.parse(stdout).rounds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `TMPDIR=$(mktemp -d) npx jest tests/unit/commands/harness.test.ts`
Expected: FAIL — `Cannot find module '../../../lib/commands/harness'`

- [ ] **Step 3: Implement `lib/commands/harness.ts`**

```typescript
'use strict';
/**
 * gd harness — life-harness rounds (evidence-driven self-improvement).
 * Thin wrapper: resolves backend/account env and shells to bin/harness_driver.py.
 * Round logic lives in the autoresearch-core Python package (pure) — see
 * docs/superpowers/specs/2026-06-06-life-harness-rounds-grd-host.md.
 */
const path = require('path') as typeof import('path');
const fs = require('fs') as typeof import('fs');
const { spawnSync: nodeSpawnSync } = require('child_process') as typeof import('child_process');
const { output, error } = require('../utils') as {
  output: (data: unknown, raw: boolean, rawText?: string) => void;
  error: (msg: string) => never;
};

interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: { code?: string };
}
interface HarnessDeps {
  spawnSync?: (cmd: string, args: string[], opts: Record<string, unknown>) => SpawnResult;
}
interface RoundOptions {
  auto: boolean;
  dryRun: boolean;
  fullEval: boolean;
}

/** Compose the proposal-agent argv for the configured backend. Exported for tests. */
function _buildSpawnArgv(backend: string, repoCwd: string): string[] {
  if (backend === 'claude') {
    return ['claude', '-p', '--dangerously-skip-permissions'];
  }
  // default: codex (account env CODEX_HOME is inherited from gd's environment)
  return [
    'codex', 'exec',
    '-c', `projects."${repoCwd}".trust_level="trusted"`,
    '--sandbox', 'workspace-write',
    '--cd', '{workdir}',
  ];
}

function _readConfig(cwd: string): Record<string, unknown> {
  const p = path.join(cwd, '.planning', 'config.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function _driverPath(): string {
  const src = path.join(__dirname, '..', '..', 'bin', 'harness_driver.py');
  if (fs.existsSync(src)) return src;
  return path.join(__dirname, '..', '..', '..', 'bin', 'harness_driver.py');
}

function cmdHarnessRound(
  cwd: string,
  opts: RoundOptions,
  raw: boolean,
  deps: HarnessDeps = {}
): void {
  const spawn = deps.spawnSync ?? (nodeSpawnSync as unknown as NonNullable<HarnessDeps['spawnSync']>);
  const config = _readConfig(cwd);
  const harness = (config.harness ?? {}) as Record<string, unknown>;
  const backend = typeof harness.backend === 'string' ? harness.backend : 'codex';

  const args = [_driverPath(), 'round', '--cwd', cwd];
  if (opts.auto) args.push('--auto');
  if (opts.dryRun) args.push('--dry-run');
  if (opts.fullEval) args.push('--full-eval');

  const result = spawn('python3', args, {
    encoding: 'utf-8',
    timeout: 3600000,
    env: {
      ...process.env,
      GRD_HARNESS_SPAWN_ARGV: JSON.stringify(_buildSpawnArgv(backend, cwd)),
    },
  });
  if (result.error?.code === 'ENOENT') {
    error('python3 not found — the harness driver requires Python 3.11+ with autoresearch-core>=0.2');
  }
  if (result.status !== 0) {
    error(`harness driver failed (exit ${result.status}): ${result.stderr.slice(-500)}`);
  }
  process.stdout.write(result.stdout);
}

function cmdHarnessStatus(cwd: string, raw: boolean): void {
  const roundsDir = path.join(cwd, '.planning', 'harness', 'rounds');
  const rounds: Array<Record<string, unknown>> = [];
  if (fs.existsSync(roundsDir)) {
    for (const id of fs.readdirSync(roundsDir).sort()) {
      const rec = path.join(roundsDir, id, 'RECORD.json');
      if (!fs.existsSync(rec)) continue;
      try {
        rounds.push(JSON.parse(fs.readFileSync(rec, 'utf-8')) as Record<string, unknown>);
      } catch {
        rounds.push({ round_id: id, status: 'unreadable' });
      }
    }
  }
  output({ rounds }, raw, rounds.map((r) => `${r.round_id}: ${r.status}`).join('\n') || 'no rounds');
}

function cmdHarnessRevert(
  cwd: string,
  roundId: string,
  raw: boolean,
  deps: HarnessDeps = {}
): void {
  if (!roundId) error('usage: gd harness revert <round-id>');
  const rec = path.join(cwd, '.planning', 'harness', 'rounds', roundId, 'RECORD.json');
  if (!fs.existsSync(rec)) error(`unknown round: ${roundId}`);
  const record = JSON.parse(fs.readFileSync(rec, 'utf-8')) as { applied_sha?: string };
  if (!record.applied_sha) error(`round ${roundId} has no applied commit to revert`);
  const spawn = deps.spawnSync ?? (nodeSpawnSync as unknown as NonNullable<HarnessDeps['spawnSync']>);
  const result = spawn('python3',
    [_driverPath(), 'revert', '--cwd', cwd, '--sha', record.applied_sha],
    { encoding: 'utf-8', timeout: 120000, env: process.env });
  if (result.status !== 0) error(`revert failed: ${result.stderr.slice(-500)}`);
  process.stdout.write(result.stdout);
}

module.exports = { cmdHarnessRound, cmdHarnessStatus, cmdHarnessRevert, _buildSpawnArgv };
```

- [ ] **Step 4: Run to verify pass**

Run: `TMPDIR=$(mktemp -d) npx jest tests/unit/commands/harness.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/commands/harness.ts tests/unit/commands/harness.test.ts
git commit -m "feat(harness): gd-side handler — round/status/revert via the Python driver"
```

---

### Task 3: Wire `harness` into the CLI router

**Files:**
- Modify: `lib/cli/index.ts` (TOOL_COMMANDS set, near line 15)
- Modify: `lib/cli/tools.ts` (runToolCommand dispatch)
- Modify: `bin/gd.ts` (help text, near line 134)
- Create: `commands/harness.md` (used by `gd harness --help`)
- Test: extend `tests/unit/commands/harness.test.ts` is NOT needed; router has its own tests — extend `tests/unit/cli.test.ts` if it asserts the command sets (check with `grep -n "TOOL_COMMANDS" tests/unit/ -r`).

- [ ] **Step 1: Add `'harness'` to `TOOL_COMMANDS` in `lib/cli/index.ts`**

Locate the `TOOL_COMMANDS = new Set([` literal (line ~15) and add `'harness',`
in alphabetical position.

- [ ] **Step 2: Dispatch in `lib/cli/tools.ts`**

Locate `runToolCommand`'s dispatch (the structure that maps command names to
`lib/commands/*` handlers — find it with `grep -n "health" lib/cli/tools.ts`)
and add, following the local pattern exactly:

```typescript
if (command === 'harness') {
  const { cmdHarnessRound, cmdHarnessStatus, cmdHarnessRevert } =
    require('../commands/harness') as {
      cmdHarnessRound: (cwd: string, opts: { auto: boolean; dryRun: boolean; fullEval: boolean }, raw: boolean) => void;
      cmdHarnessStatus: (cwd: string, raw: boolean) => void;
      cmdHarnessRevert: (cwd: string, roundId: string, raw: boolean) => void;
    };
  const raw = /* derive exactly as the neighboring 'health' case derives it */ false;
  if (subcommand === 'status') cmdHarnessStatus(cwd, raw);
  else if (subcommand === 'revert') cmdHarnessRevert(cwd, extraArgs[0] ?? '', raw);
  else if (subcommand === 'round' || subcommand === undefined)
    cmdHarnessRound(cwd, {
      auto: extraArgs.includes('--auto'),
      dryRun: extraArgs.includes('--dry-run'),
      fullEval: extraArgs.includes('--full-eval'),
    }, raw);
  else error(`unknown harness subcommand: ${subcommand}`);
  return;
}
```

IMPORTANT: gd tool commands print JSON by default and human text with `--raw`
(see CLAUDE.md). Derive the `raw` boolean exactly the way the neighboring
`health` dispatch does — copy its expression, do not invent the polarity.
Adapt the return/result convention likewise; the behavior above (which handler
gets which args) is the fixed part.

- [ ] **Step 3: Help text in `bin/gd.ts`**

Below the `evolve` line (~134) add:

```
  harness              Life-harness round: evidence-driven self-improvement (round|status|revert)
```

- [ ] **Step 4: Create `commands/harness.md`**

```markdown
---
description: Run a life-harness round — improve GRD primitives from Tesserae session evidence (eval-gated, git-reversible)
---

# gd harness

- `gd harness round [--auto] [--dry-run] [--full-eval]` — gather session findings,
  propose a patch, eval-gate it; review mode (default) leaves branch
  `harness/round-<id>` for human merge.
- `gd harness status` — list recorded rounds.
- `gd harness revert <round-id>` — git-revert an applied round.

Config: `.planning/config.json` → `harness` block (autonomy, kill_switch,
min_confidence, min_interval_hours, allowed_targets, backend, min/max_evidence).
Requires: `pip install 'autoresearch-core>=0.2'`; a compiled Tesserae project
(`tesserae sessions-import` + `tesserae refresh`).
```

- [ ] **Step 5: Verify wiring end-to-end**

Run: `node bin/gd.js harness status --json`
Expected: `{"rounds": []}` (exit 0)

Run: `node bin/gd.js harness --help`
Expected: prints the description from `commands/harness.md`

Run: `npm run build:check && npm run lint`
Expected: both exit 0

- [ ] **Step 6: Commit**

```bash
git add lib/cli/index.ts lib/cli/tools.ts bin/gd.ts commands/harness.md
git commit -m "feat(harness): wire gd harness round|status|revert into the CLI router"
```

---

### Task 4: Deprecate `gd evolve`

**Files:**
- Modify: `lib/cli/index.ts` (route evolve to tool deprecation) or `bin/gd.ts` (early intercept — pick the spot matching how DEPRECATED commands listed at `bin/gd.ts:197-199` are handled; inspect one of them, e.g. `dashboard`, with `grep -rn "dashboard" lib/cli/ | head`)
- Modify: `bin/gd.ts` help text (move `evolve` under the Deprecated note at lines 197–199)
- Modify: `docs/DEPRECATIONS.md`
- Test: `tests/unit/commands/harness.test.ts` (add one test) or the existing evolve test file (extend)

- [ ] **Step 1: Find the existing deprecation pattern**

Run: `grep -rn "DEPRECATED\|deprecat" lib/cli/index.ts lib/cli/tools.ts lib/cli/agent.ts | head -10`
Follow whichever mechanism marks `dashboard`/`health-check` as deprecated.

- [ ] **Step 2: Apply the same mechanism to `evolve`**

The behavior to implement (whatever the mechanism): `gd evolve` (bare, and any
agent-routed sub) prints:

```
gd evolve is deprecated and no longer runs.
Self-improvement moved to the life-harness:  gd harness round
(evidence from Tesserae session findings; eval-gated; git-reversible)
See docs/DEPRECATIONS.md and docs/superpowers/specs/2026-06-06-life-harness-rounds-grd-host.md
```

and exits with code 1 **without** spawning any agent. Existing
`EVOLVE_TOOL_SUBS` (read-only introspection subs) may keep working.

- [ ] **Step 3: Add a regression test**

In the test file that covers CLI routing for evolve (find with
`grep -rln "evolve" tests/unit/ | head -3`), add:

If that file is `tests/integration/cli.test.ts` (it uses the `runCLI` helper
defined at its top), the test is:

```typescript
test('gd evolve is deprecated and points to gd harness round', () => {
  const { stdout, stderr, exitCode } = runCLI(['evolve'], fixtureDir);
  expect(exitCode).toBe(1);
  expect(stdout + stderr).toMatch(/gd harness round/);
  expect(stdout + stderr).toMatch(/deprecated/i);
});
```

If the deprecation mechanism lives in a unit-tested module instead, write the
same two assertions (exit 1, pointer text) through that module's existing
test harness.

- [ ] **Step 4: Update `docs/DEPRECATIONS.md` and `bin/gd.ts` help**

DEPRECATIONS.md — add under the existing deprecation list:

```markdown
## evolve (deprecated 2026-06-06)

`gd evolve` (static-scan self-improvement) is replaced by the life-harness:
`gd harness round` — evidence from Tesserae session findings, eval-gated,
git-reversible. `lib/evolve/` stays in-tree for `gd singularity` history;
removal tracked separately.
```

bin/gd.ts — remove the `evolve` line from the main command list and append
`evolve` to the deprecated-commands note at lines 197–199.

- [ ] **Step 5: Run the affected tests + checks**

Run: `TMPDIR=$(mktemp -d) npx jest tests/unit/cli.test.ts tests/unit/commands/harness.test.ts 2>&1 | tail -5`
(plus whichever file got the deprecation test)
Expected: PASS

Run: `npm run build:check && npm run lint`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(harness)!: deprecate gd evolve — superseded by gd harness round"
```

---

### Task 5: Docs + live smoke test

**Files:**
- Modify: `CLAUDE.md` (config-keys sentence in the Autoresearch section)
- Smoke: live `gd harness round --dry-run` (read-only against this repo)

- [ ] **Step 1: CLAUDE.md**

In the `## Autoresearch loop` section where `.planning/config.json` keys are
listed, append to that sentence: `; harness (life-harness rounds: autonomy,
kill_switch, min_confidence, min_interval_hours, allowed_targets, backend,
min/max_evidence)`.

- [ ] **Step 2: Live dry-run smoke (read-only — creates no artifacts beyond `.planning/harness/`)**

Run: `pip show autoresearch-core | head -2` — confirm `Version: 0.2.0` (or `pip install -e ~/Developer/Projects/autoresearch-core`).

Run: `node bin/gd.js harness round --dry-run --json`
Expected: a RoundRecord JSON with `"status": "skipped"` (not enough evidence —
GRD's graph has no session findings yet) **or** `"status": "gathered"` with an
evidence listing if sessions have been imported. Either is success. If it
errors with the `.tesserae/graph.json` guidance, run `tesserae refresh` first.

Note: the dry-run writes `.planning/harness/rounds/<id>/RECORD.json` — commit
it or remove it deliberately; do not leave it untracked by accident.

- [ ] **Step 3: Full repo gate**

Run: `TMPDIR=$(mktemp -d) npm test 2>&1 | tail -4`
Expected: suites pass (cli.test.ts is known load-flaky — re-run solo if it
alone fails; see memory/commit 754b249 note).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md .planning/harness 2>/dev/null; git add CLAUDE.md
git commit -m "docs(harness): config keys in CLAUDE.md + first dry-run record"
```

---

## Self-review notes (done at plan time)

- Spec §4.1 (driver bindings) → Task 1; §4.2 (CLI) → Tasks 2–3; §4.3 (config) → driver `resolve_autonomy` + Task 5 docs; §7 (evolve deprecation) → Task 4; §5 lifecycle → driver `run_round`; §6 safety → kernel calls (`DENY_PATHS`, `current_harness`, kill switch, interval, single commit, revert).
- Tasks 3.2 and 4 intentionally anchor to local router patterns ("match the local shape") because `lib/cli/tools.ts` dispatch internals weren't read at plan time — the **behavior** is fully specified; the engineer adapts placement, not semantics. Everything else is complete code.
- Type/name consistency checked: `cmdHarnessRound(cwd, opts, raw, deps)` matches test + dispatch call; driver flags `--auto/--dry-run/--full-eval/--cwd/--sha` match `harness.ts` invocations; `GRD_HARNESS_SPAWN_ARGV` name matches both sides; record field `eval_report`/`applied_sha` names match the kernel.
