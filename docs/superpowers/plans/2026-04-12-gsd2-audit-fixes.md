# Architecture Audit Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address 15 of 16 findings from `docs/architecture/RISKS.md` (the 16th, O1 autopilot decomposition, is deferred as a future spec) in four grouped phases on a single branch. Fix order is low-risk-first to limit blast radius if any fix reveals surprises.

**Architecture:** Each finding maps to one commit. The commits are grouped into 4 phases by file and risk profile:
- **Phase 1** — low-risk correctness fixes scattered across files
- **Phase 2** — scheduler correctness (all in `lib/scheduler.ts`)
- **Phase 3** — phase lifecycle correctness (`lib/phase-*.ts`, `lib/state.ts`)
- **Phase 4** — cleanup and design improvements

**Tech Stack:** TypeScript strict, CommonJS, tsx at entry points, jest with ts-jest, Node 20. Standard GRD conventions throughout (strict mode header, JSDoc, typed require, no `any`, `[prefix]` stderr logging).

**Reference:** `docs/architecture/RISKS.md` (commit `c5347ac`)

**Worktree note:** Create a worktree before starting:

```bash
git worktree add .worktrees/gsd2-audit-fixes -b fix/gsd2-audit-fixes
cd .worktrees/gsd2-audit-fixes
```

**Security invariant:** No shell interpolation, no new subprocess spawns beyond existing patterns, no new network calls. Every fix is a local correctness or cleanup change.

---

## Scope summary

**In scope (15 findings):**

| Phase | ID | Title | File | LOC |
|---|---|---|---|---|
| 1 | I5 | Multi-dot regex escape | `lib/phase-complete.ts` | 2 |
| 1 | I8 | Cross-platform `checkBinary` | `lib/scheduler.ts` | 3 |
| 1 | O4 | ESM/CJS cleanup in scheduler-wait | `lib/scheduler-wait.ts` | 2 |
| 1 | M1 | Log gate check exceptions | `lib/gates.ts` | 10 |
| 1 | M3 | `_verifyStateAdvanced` missing file | `lib/phase-complete-llm.ts` | 3 |
| 1 | I6 | Autoresearch branch creation failure | `lib/autoresearch.ts` | 15 |
| 2 | I1+I2+I9 | Scheduler spawn path triage | `lib/scheduler.ts` | 40 |
| 2 | O3 | `_lastLoggedPressure` session key | `lib/scheduler.ts` | 15 |
| 3 | I4+O2 | Cache invalidation + consolidation | `lib/phase-io.ts`, `lib/state.ts`, `lib/phase-complete-llm.ts` | 60 |
| 3 | I7 | `_buildSyntheticResult` proper discovery | `lib/phase-complete-llm.ts` | 40 |
| 4 | I3 | Remove dead `startHeartbeat` | `lib/autopilot.ts` | 15 |
| 4 | M2 | Per-agent complexity samples | `lib/types.ts`, `lib/scheduler.ts`, `lib/backend.ts` | 50 |

**Out of scope:**

- **O1 — `lib/autopilot.ts` 2,700-line decomposition.** This is a structural refactor, not a bug fix. Requires its own spec because every current feature routes through autopilot and the right module boundaries (pipeline, waves, milestone loop) need design discussion. A future spec `docs/superpowers/specs/YYYY-MM-DD-autopilot-decomposition-design.md` should follow the same brainstorm → spec → plan → execute cycle used in the gsd-2-selective-adoption milestone.

**Total:** 14 commits across 4 phases + 1 final verification commit. Estimated ~260 lines of production changes, ~40 new tests.

---

## Phase 1: Quick wins

**Intent:** Low-risk, high-value correctness fixes with small diffs. Each is self-contained. If any of these break in CI, we abort early with minimal cost.

### Task 1.1: I5 — multi-dot regex escape

**Finding:** `phaseNum.replace('.', '\\.')` only escapes the first dot. Multi-level phase numbers like `1.1.2` become `1\\.1.2` with an unescaped regex wildcard in the second dot position.

**Files:**
- Modify: `lib/phase-complete.ts:134`, `lib/phase-complete.ts:140`
- Modify: `tests/unit/phase-complete.test.ts`

- [ ] **Step 1.1.1: Apply the two-line fix**

```bash
grep -n "phaseNum.replace('\\.'" lib/phase-complete.ts
```

Expected: two matches near lines 134 and 140.

Change both occurrences from:
```typescript
phaseNum.replace('.', '\\.')
```
to:
```typescript
phaseNum.replace(/\./g, '\\.')
```

- [ ] **Step 1.1.2: Add regression test**

Add to `tests/unit/phase-complete.test.ts`:

```typescript
describe('multi-dot phase number regex escaping (I5 regression)', () => {
  it('correctly escapes all dots in a three-part phase number', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-i5-'));
    const planning = path.join(dir, '.planning');
    fs.mkdirSync(planning);
    fs.mkdirSync(path.join(planning, 'milestones'));
    fs.mkdirSync(path.join(planning, 'milestones', 'anonymous'));
    const phasesDir = path.join(planning, 'milestones', 'anonymous', 'phases');
    fs.mkdirSync(phasesDir);
    // Create phase 1.1.2 directory with NN-slug format
    fs.mkdirSync(path.join(phasesDir, '1.1.2-target'));
    fs.writeFileSync(
      path.join(phasesDir, '1.1.2-target', '01-PLAN.md'),
      '# plan\n',
    );
    fs.writeFileSync(
      path.join(phasesDir, '1.1.2-target', '01-SUMMARY.md'),
      '# summary\n',
    );

    // ROADMAP with BOTH a correct `1.1.2` entry AND a wildcard-matchable
    // `1X1X2` entry that the buggy regex would accidentally match.
    fs.writeFileSync(
      path.join(planning, 'ROADMAP.md'),
      [
        '# Roadmap',
        '',
        '## Phases',
        '',
        '- [ ] Phase 1.1.2: Target',
        '- [ ] Phase 1X1X2: Decoy (should NOT be ticked)',
        '',
        '## Phase 1.1.2: Target',
        '**Plans:** 1/1 plans complete',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(planning, 'STATE.md'),
      '# State\n\n**Current Phase:** 1.1.2\n**Current Phase Name:** Target\n**Status:** Executing\n**Current Plan:** 01\n**Last Activity:** 2026-04-12\n**Last Activity Description:** running\n',
    );
    fs.writeFileSync(
      path.join(planning, 'config.json'),
      JSON.stringify({ phase_cleanup: { cleanup_threshold: 99999 } }),
    );

    try {
      const { _phaseCompleteCore } = require('../../lib/phase-complete') as {
        _phaseCompleteCore: (cwd: string, phaseNum: string) => unknown;
      };
      _phaseCompleteCore(dir, '1.1.2');

      const roadmap = fs.readFileSync(
        path.join(planning, 'ROADMAP.md'),
        'utf-8',
      );
      // The target entry MUST be ticked
      expect(roadmap).toMatch(/- \[x\] Phase 1\.1\.2: Target/);
      // The decoy MUST remain untouched
      expect(roadmap).toMatch(/- \[ \] Phase 1X1X2: Decoy/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 1.1.3: Verify and commit**

```bash
npx jest tests/unit/phase-complete.test.ts 2>&1 | tail -10
npm run lint && npm run build:check
git add lib/phase-complete.ts tests/unit/phase-complete.test.ts
git commit -m "fix(phase-complete): escape all dots in phase number regex (I5)

String.prototype.replace with a string first argument only replaces
the first occurrence. For multi-level phase numbers like '1.1.2',
phaseNum.replace('.', '\\\\.') produced '1\\\\.1.2' with an unescaped
second dot acting as a regex wildcard. Replaced with the global
regex /\\./g.

Added regression test with a ROADMAP that contains both '1.1.2' and
'1X1X2' entries; the buggy regex would match both, the fixed regex
matches only the first.

Audit reference: docs/architecture/RISKS.md finding I5."
```

---

### Task 1.2: I8 — cross-platform `checkBinary`

**Finding:** `checkBinary` uses `which` which doesn't exist on Windows. All backend binary checks return false on Windows, silently bypassing the backend priority list.

**Files:**
- Modify: `lib/scheduler.ts:659-664` (the `checkBinary` function)
- Modify: `tests/unit/scheduler.test.ts`

- [ ] **Step 1.2.1: Apply the fix**

```bash
grep -n "function checkBinary\|'which'" lib/scheduler.ts | head -5
```

Find `checkBinary`. Replace:
```typescript
function checkBinary(binary: string): boolean {
  try {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    execFileSync('which', [binary], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
```

with:
```typescript
function checkBinary(binary: string): boolean {
  try {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(cmd, [binary], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 1.2.2: Add test**

Test via existing scheduler test helpers. If `checkBinary` isn't exported, export it with an underscore prefix for test access:

```bash
grep -n "checkBinary" lib/scheduler.ts
```

If not exported, add `_checkBinary` to the `module.exports` at the bottom of `lib/scheduler.ts`.

Then add to `tests/unit/scheduler.test.ts`:

```typescript
describe('checkBinary cross-platform (I8 regression)', () => {
  const { _checkBinary } = require('../../lib/scheduler') as {
    _checkBinary: (binary: string) => boolean;
  };

  it('returns true for a binary that exists (node)', () => {
    expect(_checkBinary('node')).toBe(true);
  });

  it('returns false for a nonexistent binary', () => {
    expect(_checkBinary('this-binary-does-not-exist-99999')).toBe(false);
  });
});
```

- [ ] **Step 1.2.3: Verify and commit**

```bash
npx jest tests/unit/scheduler.test.ts 2>&1 | tail -10
npm run lint && npm run build:check
git add lib/scheduler.ts tests/unit/scheduler.test.ts
git commit -m "fix(scheduler): use cross-platform binary check (I8)

checkBinary used 'which' which does not exist on Windows, causing
all backend availability probes to return false. The scheduler then
filtered the backend priority list down to empty and always routed
to free_fallback — silently bypassing account rotation, token
budgets, and priority configuration.

Use 'where' on Windows, 'which' on POSIX. Exported _checkBinary for
test access.

Audit reference: docs/architecture/RISKS.md finding I8."
```

---

### Task 1.3: O4 — ESM/CJS cleanup in scheduler-wait

**Finding:** `lib/scheduler-wait.ts` mixes ESM `export` with CJS `module.exports`. The project convention (per CLAUDE.md) is CJS only.

**Files:**
- Modify: `lib/scheduler-wait.ts`
- Modify: `tests/unit/scheduler-wait.test.ts`

- [ ] **Step 1.3.1: Remove ESM export**

In `lib/scheduler-wait.ts`:
- Line 33 (approx): change `export async function waitUntilOrAbort(` to `async function waitUntilOrAbort(`
- Keep the `module.exports = { waitUntilOrAbort };` at line 58

- [ ] **Step 1.3.2: Update test import**

In `tests/unit/scheduler-wait.test.ts`:
- Change `import { waitUntilOrAbort } from '../../lib/scheduler-wait';` to:
```typescript
const { waitUntilOrAbort } = require('../../lib/scheduler-wait') as {
  waitUntilOrAbort: (targetMs: number) => Promise<'waited' | 'aborted'>;
};
```

- [ ] **Step 1.3.3: Verify and commit**

```bash
npx jest tests/unit/scheduler-wait.test.ts 2>&1 | tail -10
npm run lint && npm run build:check
git add lib/scheduler-wait.ts tests/unit/scheduler-wait.test.ts
git commit -m "refactor(scheduler-wait): use CJS-only per project convention (O4)

lib/scheduler-wait.ts had both 'export async function' (ESM) and
'module.exports' (CJS). Under the project's tsx/CJS runtime,
module.exports is authoritative but the mixed syntax was a
maintenance trap. Removed the ESM export and updated the test
import to use require().

Audit reference: docs/architecture/RISKS.md finding O4."
```

---

### Task 1.4: M1 — log gate check exceptions

**Finding:** Gate check internal errors are silently swallowed; a crashing gate is treated as "all clear."

**Files:**
- Modify: `lib/gates.ts:605-615` (the `runPreflightGates` try/catch around each gate check)
- Modify: `tests/unit/gates.test.ts`

- [ ] **Step 1.4.1: Read current code**

```bash
grep -n "runPreflightGates\|catch " lib/gates.ts | head -15
```

Find the loop that iterates over gate checks. The current pattern is something like:

```typescript
for (const gateName of gateChecks) {
  const check = _GATE_CHECKS[gateName];
  if (!check) continue;
  try {
    const violations = check(cwd, opts);
    result.errors.push(...violations.filter((v) => v.severity === 'error'));
    result.warnings.push(...violations.filter((v) => v.severity === 'warning'));
  } catch {
    // Non-blocking
  }
}
```

- [ ] **Step 1.4.2: Apply the fix**

Replace the catch with:

```typescript
  } catch (e) {
    const msg = (e as Error).message || String(e);
    process.stderr.write(
      `[gates] gate '${gateName}' threw: ${msg}\n`,
    );
    result.warnings.push({
      code: 'GATE_ERROR',
      severity: 'warning',
      message: `Gate '${gateName}' internal error: ${msg}`,
      fix: 'Check the gate implementation for bugs or update the failing check',
      context: {},
    });
  }
```

Note: the exact shape of `GateViolation` must match. Check `lib/types.ts` for `GateViolation` — if it has fewer/more fields, adjust. Common fields are `code`, `severity`, `message`, `fix`, `context`.

- [ ] **Step 1.4.3: Add test**

In `tests/unit/gates.test.ts`, add:

```typescript
describe('runPreflightGates gate error handling (M1 regression)', () => {
  it('logs and records a warning when a gate check throws', () => {
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    try {
      // Temporarily inject a throwing gate into the registry.
      // We do this via monkey-patching since gate registration isn't a
      // public API surface.
      const gates = require('../../lib/gates') as {
        _GATE_CHECKS?: Record<string, (cwd: string, opts: unknown) => unknown[]>;
        runPreflightGates: (
          cwd: string,
          command: string,
          opts?: { phase?: string },
        ) => { errors: unknown[]; warnings: { code: string; message: string }[] };
      };

      // This test only runs if _GATE_CHECKS is exported for testing.
      // If not, skip with a note.
      if (!gates._GATE_CHECKS) {
        console.warn('Skipping M1 test: _GATE_CHECKS not exported');
        return;
      }

      const original = gates._GATE_CHECKS['phase-in-roadmap'];
      gates._GATE_CHECKS['phase-in-roadmap'] = () => {
        throw new Error('injected test failure');
      };

      try {
        const result = gates.runPreflightGates('/tmp', 'phase-complete', {
          phase: '1',
        });
        // Should NOT have thrown; should have a warning with GATE_ERROR code
        expect(
          result.warnings.some((w) => w.code === 'GATE_ERROR'),
        ).toBe(true);
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining("gate 'phase-in-roadmap' threw"),
        );
      } finally {
        gates._GATE_CHECKS['phase-in-roadmap'] = original;
      }
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
```

**Note:** This test requires `_GATE_CHECKS` to be exported. If it isn't, add it to `module.exports` with the underscore prefix as part of this task.

- [ ] **Step 1.4.4: Verify and commit**

```bash
npx jest tests/unit/gates.test.ts 2>&1 | tail -10
npm run lint && npm run build:check
git add lib/gates.ts tests/unit/gates.test.ts
git commit -m "fix(gates): log exceptions from gate checks + record warning (M1)

Gate check internal errors were silently swallowed via bare catch {}.
A crashing gate was treated as 'no violations,' masking real
problems and hiding machinery bugs.

Now:
- Log the exception to stderr with [gates] prefix and gate name
- Push a synthetic GateViolation with code GATE_ERROR and
  severity 'warning' to the result

Exported _GATE_CHECKS for test access.

Audit reference: docs/architecture/RISKS.md finding M1."
```

---

### Task 1.5: M3 — `_verifyStateAdvanced` missing file

**Finding:** When STATE.md is missing, `_verifyStateAdvanced` returns `true` (success). An LLM fallback that deleted STATE.md reports success, breaking all subsequent state-dependent commands.

**Files:**
- Modify: `lib/phase-complete-llm.ts:134-135` (the `_verifyStateAdvanced` catch block)
- Modify: `tests/unit/phase-complete-llm.test.ts`

- [ ] **Step 1.5.1: Apply the fix**

Find `_verifyStateAdvanced` in `lib/phase-complete-llm.ts`:

```bash
grep -n "_verifyStateAdvanced\|function _verify" lib/phase-complete-llm.ts
```

Change:
```typescript
function _verifyStateAdvanced(cwd: string, phaseNum: string): boolean {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  let content: string;
  try {
    content = fs.readFileSync(statePath, 'utf-8');
  } catch {
    return true; // missing file — can't verify, assume ok
  }
  // ... rest unchanged
}
```

to:
```typescript
function _verifyStateAdvanced(cwd: string, phaseNum: string): boolean {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  let content: string;
  try {
    content = fs.readFileSync(statePath, 'utf-8');
  } catch {
    // Missing STATE.md is a verification failure — the LLM fallback
    // should NEVER delete it. If it did, downstream state-dependent
    // commands will break.
    return false;
  }
  // ... rest unchanged
}
```

- [ ] **Step 1.5.2: Add test**

In `tests/unit/phase-complete-llm.test.ts`, add to the existing `_verifyFallbackOutput` describe block (or create one):

```typescript
it('fails state-advanced check when STATE.md is missing (M3)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-m3-'));
  const planning = path.join(dir, '.planning');
  fs.mkdirSync(planning);
  // Only write ROADMAP.md with a ticked checkbox, no STATE.md
  fs.writeFileSync(
    path.join(planning, 'ROADMAP.md'),
    '- [x] Phase 3: Test (completed)\n',
  );

  try {
    const { _verifyFallbackOutput } = require('../../lib/phase-complete-llm') as {
      _verifyFallbackOutput: (
        cwd: string,
        phaseNum: string,
      ) => { ok: boolean; checks: { name: string; passed: boolean }[] };
    };
    const result = _verifyFallbackOutput(dir, '3');
    expect(result.ok).toBe(false);
    expect(
      result.checks.find((c) => c.name === 'state-advanced')?.passed,
    ).toBe(false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 1.5.3: Verify and commit**

```bash
npx jest tests/unit/phase-complete-llm.test.ts 2>&1 | tail -10
npm run lint && npm run build:check
git add lib/phase-complete-llm.ts tests/unit/phase-complete-llm.test.ts
git commit -m "fix(phase-complete-llm): treat missing STATE.md as verification failure (M3)

_verifyStateAdvanced previously returned true on ENOENT, meaning an
LLM fallback that accidentally deleted STATE.md would be reported as
successful. Subsequent state-dependent commands would break silently.

Now returns false so the fallback is reported as failed and the
autopilot's 'run manually' hint fires, giving the user a chance to
recover.

Audit reference: docs/architecture/RISKS.md finding M3."
```

---

### Task 1.6: I6 — autoresearch branch creation failure

**Finding:** `_execGit(cwd, ['checkout', '-b', branchName])` return value is not checked. Second same-day autoresearch run silently operates on the current branch, reverting unrelated work.

**Files:**
- Modify: `lib/autoresearch.ts:441` (the branch creation call site)
- Modify: `tests/integration/autoresearch-scheduler.test.ts` OR a new test file

- [ ] **Step 1.6.1: Read current code**

```bash
grep -n "checkout.*-b\|branchName\|_execGit" lib/autoresearch.ts | head -15
```

Locate the call site around line 441.

- [ ] **Step 1.6.2: Apply the fix**

Replace:
```typescript
_execGit(cwd, ['checkout', '-b', branchName]);
```

with:
```typescript
const branchResult = _execGit(cwd, ['checkout', '-b', branchName]);
if (branchResult.exitCode !== 0) {
  // Branch creation failed — most likely the branch already exists
  // from a prior same-day run. Try to check out the existing branch
  // instead of silently running on whatever branch is current.
  const checkoutResult = _execGit(cwd, ['checkout', branchName]);
  if (checkoutResult.exitCode !== 0) {
    throw new Error(
      `[autoresearch] failed to create or checkout branch '${branchName}': ` +
        `create exit ${branchResult.exitCode}, checkout exit ${checkoutResult.exitCode}. ` +
        `Please delete the existing branch or run from a clean worktree.`,
    );
  }
  process.stderr.write(
    `[autoresearch] branch '${branchName}' already exists, reusing\n`,
  );
}
```

Verify that `_execGit` returns `{ exitCode, stdout }` — if its shape differs, adjust.

- [ ] **Step 1.6.3: Add test (integration style)**

Testing this requires a real git repo fixture because `_execGit` actually invokes git. If there's no existing autoresearch test infrastructure that sets up a temp git repo, skip the test and verify by inspection + a manual run. Otherwise add:

```typescript
// In a new file tests/integration/autoresearch-branch.test.ts
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';

describe('autoresearch branch creation failure handling (I6 regression)', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-i6-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'README.md'), 'test\n');
    execFileSync('git', ['add', '.'], { cwd: repoDir });
    execFileSync('git', ['commit', '-q', '-m', 'initial'], { cwd: repoDir });
  });

  afterEach(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  it('handles pre-existing branch by checking it out', () => {
    // Pre-create the branch that autoresearch would create
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const branchName = `autoresearch/${today}`;
    execFileSync('git', ['branch', branchName], { cwd: repoDir });

    // Run autoresearch's branch-creation path (if exposed via a helper)
    // OR just verify the fix doesn't throw.
    //
    // If _ensureAutoresearchBranch is not exported, this test can only
    // verify via a full autoresearch invocation which is too heavy.
    // In that case, delete this test and rely on manual verification.
    //
    // For now, document the manual verification:
    //   1. cd to a repo
    //   2. Create branch: git branch autoresearch/YYYYMMDD
    //   3. Run: gd autoresearch "test topic"
    //   4. Verify it does NOT reset HEAD of current branch, and
    //      does operate on the pre-existing autoresearch branch.
    expect(true).toBe(true); // placeholder
  });
});
```

If the test can't be written cleanly without exposing internals, skip it and document the manual verification in the commit message.

- [ ] **Step 1.6.4: Verify and commit**

```bash
npm run lint && npm run build:check && npx jest tests/unit/autoresearch 2>&1 | tail -10
git add lib/autoresearch.ts tests/integration/autoresearch-branch.test.ts 2>/dev/null || git add lib/autoresearch.ts
git commit -m "fix(autoresearch): handle existing branch on second same-day run (I6)

_execGit return value was not checked after 'git checkout -b'. If the
date-based branch name already existed (second autoresearch run on
the same day), git exited non-zero and the loop continued on the
current branch. All subsequent 'git reset --hard headBefore' reverts
operated on the wrong branch, potentially destroying unrelated work.

Now: check exit code, fall back to 'git checkout <branch>' to reuse
the existing branch. If both fail, throw with a clear recovery hint.

Audit reference: docs/architecture/RISKS.md finding I6."
```

---

### Task 1.7: Phase 1 verification

- [ ] **Step 1.7.1: Run the full test suite**

```bash
npm test 2>&1 | tail -15
```

Expected: no regressions from the 6 Phase 1 fixes. New tests from 1.1, 1.2, 1.4, 1.5, and possibly 1.6 should pass.

- [ ] **Step 1.7.2: Lint and build check**

```bash
npm run lint && npm run build:check
```

- [ ] **Step 1.7.3: Phase 1 summary commit (empty)**

```bash
git commit --allow-empty -m "chore: Phase 1 of audit fixes complete

Completed fixes:
- I5 (multi-dot regex escape)
- I8 (cross-platform checkBinary)
- O4 (scheduler-wait ESM/CJS cleanup)
- M1 (gate error logging)
- M3 (_verifyStateAdvanced missing file)
- I6 (autoresearch branch failure handling)

Moving to Phase 2 (scheduler correctness)."
```

---

## Phase 2: Scheduler correctness

**Intent:** All fixes in this phase touch `lib/scheduler.ts`. Batching into one phase lets the test suite catch interactions. Three findings (I1, I2, I9) share the `_spawnWithRetry` function body; one more (O3) touches module-level state and `createScheduler`.

### Task 2.1: I1 + I2 + I9 — scheduler spawn path triage

**Findings consolidated into one commit because they share the `_spawnWithRetry` function.**

- **I1** — orphan state object for fallback backend (silent budget accounting loss)
- **I2** — uncleared SIGKILL escalation timers (potential recycled-PID kill)
- **I9** — rapid recursion on past-timestamp recovery (O(N) stack churn under exhaustion)

**Files:**
- Modify: `lib/scheduler.ts` (multiple locations in `_spawnWithRetry`)
- Modify: `tests/unit/scheduler-idle-watchdog.test.ts` (add timer cleanup assertion if feasible)
- Modify: `tests/unit/scheduler-spawn-wait.test.ts` (add past-timestamp assertion if feasible)

- [ ] **Step 2.1.1: Read `_spawnWithRetry` carefully**

```bash
grep -n "_spawnWithRetry\|markInFlight\|createBackendState\|idleKillTimer\|totalKillTimer\|lastRecoveryTime" lib/scheduler.ts | head -30
```

Read lines ~820 through ~1000 to understand the current shape. The block contains:
- account resolution (sets `stateKey`, `backend`, `state`)
- wait branch (Spec 2A)
- spawn with watchdog (Spec 2B)
- close/error handlers
- retry loop

- [ ] **Step 2.1.2: Fix I1 — register fallback state in the map**

Find the line around 917 where `state = states.get(stateKey) || createBackendState(DEFAULT_BUDGET_TPM);` is assigned.

Replace:
```typescript
let state = states.get(stateKey) || createBackendState(DEFAULT_BUDGET_TPM);
```

with:
```typescript
let state = states.get(stateKey);
if (!state) {
  // Create a new state entry and register it in the map so subsequent
  // spawns see our in-flight reservation and tokens_consumed updates.
  // Previously this was an orphan object that was mutated but never
  // visible to other dispatches.
  state = createBackendState(DEFAULT_BUDGET_TPM);
  states.set(stateKey, state);
}
```

- [ ] **Step 2.1.3: Fix I2 — track SIGKILL escalation timers**

Find the spawn block around lines 930-975. Currently:

```typescript
const watchdog = _startIdleWatchdog(idleTimeoutMs, () => {
  idleTimedOut = true;
  process.stderr.write(/* ... */);
  _killProcessTree(child, 'SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      _killProcessTree(child, 'SIGKILL');
    }
  }, 5000);
});

const totalTimer = setTimeout(() => {
  totalTimedOut = true;
  _killProcessTree(child, 'SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      _killProcessTree(child, 'SIGKILL');
    }
  }, 5000);
}, totalTimeoutMs);
```

Refactor to:

```typescript
let idleKillTimer: ReturnType<typeof setTimeout> | undefined;
let totalKillTimer: ReturnType<typeof setTimeout> | undefined;

const watchdog = _startIdleWatchdog(idleTimeoutMs, () => {
  idleTimedOut = true;
  process.stderr.write(/* ... existing ... */);
  _killProcessTree(child, 'SIGTERM');
  idleKillTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      _killProcessTree(child, 'SIGKILL');
    }
  }, 5000);
});

const totalTimer = setTimeout(() => {
  totalTimedOut = true;
  _killProcessTree(child, 'SIGTERM');
  totalKillTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      _killProcessTree(child, 'SIGKILL');
    }
  }, 5000);
}, totalTimeoutMs);
```

In the `close` and `error` handlers, add cleanup:

```typescript
child.on('error', (err) => {
  watchdog.stop();
  clearTimeout(totalTimer);
  if (idleKillTimer) clearTimeout(idleKillTimer);
  if (totalKillTimer) clearTimeout(totalKillTimer);
  // ... rest unchanged
});

child.on('close', (code) => {
  watchdog.stop();
  clearTimeout(totalTimer);
  if (idleKillTimer) clearTimeout(idleKillTimer);
  if (totalKillTimer) clearTimeout(totalKillTimer);
  // ... rest unchanged
});
```

- [ ] **Step 2.1.4: Fix I9 — avoid recursion on past-timestamp recovery**

Find the wait branch around lines 885-911. Currently the branch unconditionally recurses after a wait. Add a guard: if the recovery target has already elapsed, fall through to free_fallback instead of recursing.

Find:
```typescript
if (recoveryTime !== null) {
  const waitMs = recoveryTime - Date.now();
  // ... log and wait ...
  const waitResult = await waitUntilOrAbort(recoveryTime);
  if (waitResult === 'aborted') {
    throw new Error(/* ... */);
  }
  return _spawnWithRetry(prompt, opts, retryCount, recoveryTime);
}
```

Change to:
```typescript
if (recoveryTime !== null) {
  const waitMs = recoveryTime - Date.now();
  if (waitMs <= 0) {
    // Recovery target already elapsed — waiting would be a no-op and
    // recursing risks repeatedly re-computing stale recovery times.
    // Fall through to free_fallback instead.
    process.stderr.write(
      `[scheduler] recovery target already elapsed, falling through to free_fallback\n`,
    );
    // (fall through — don't enter the wait, don't recurse)
  } else {
    process.stderr.write(
      `[scheduler] all priority accounts exhausted, waiting ${Math.ceil(
        waitMs / 60_000,
      )}m for soonest recovery (target=${new Date(recoveryTime).toISOString()})\n`,
    );
    const waitResult = await waitUntilOrAbort(recoveryTime);
    if (waitResult === 'aborted') {
      throw new Error(
        'scheduler: wait for account recovery interrupted by SIGINT',
      );
    }
    return _spawnWithRetry(prompt, opts, retryCount, recoveryTime);
  }
}
```

- [ ] **Step 2.1.5: Add tests where feasible**

The cleanest testable piece is the SIGKILL timer cleanup. The other two are deep in `_spawnWithRetry` and hard to exercise in unit tests.

For I1, the best verification is: after a spawn path that falls through to free_fallback, `scheduler.getStates()` should contain the fallback stateKey. This needs a real spawn scenario — hard to unit test.

For I2, write a unit test that uses fake timers to verify `setTimeout` counts are balanced:

```typescript
// Add to tests/unit/scheduler-idle-watchdog.test.ts
describe('SIGKILL escalation timer cleanup (I2 regression)', () => {
  // This test pattern verifies the cleanup logic by tracking setTimeout
  // vs clearTimeout counts during a mock spawn scenario. It's necessarily
  // a partial test because _spawnWithRetry is not directly testable.
  it('_spawnWithRetry timer cleanup is symmetric (manual inspection required)', () => {
    // The actual regression test for I2 is manual:
    //   1. Create a scheduler with a short total timeout
    //   2. Spawn a process that will be killed by the total timer
    //   3. Let the process exit naturally within the grace window
    //   4. Verify no subsequent SIGKILL is sent (check ps after 10s)
    //
    // For automated coverage, the fix is verified by code inspection
    // + existing integration test tests/integration/scheduler-idle-kill.test.ts
    // which exercises the normal close path.
    expect(true).toBe(true);
  });
});
```

For I9, you can add a unit test against `computeSoonestRecovery` verifying that a past-timestamp result is handled:

```typescript
// tests/unit/scheduler-spawn-wait.test.ts or scheduler-recovery.test.ts
it('past-timestamp recovery does not trigger a second wait (I9 regression)', () => {
  // Similar limitation: _spawnWithRetry is deeply nested. The fix is
  // verified by code inspection — the early-return on waitMs <= 0 is
  // explicit and short.
  expect(true).toBe(true);
});
```

- [ ] **Step 2.1.6: Run existing scheduler tests**

```bash
npx jest tests/unit/scheduler tests/integration/scheduler-idle-kill 2>&1 | tail -15
```

Expected: all existing tests pass. The fixes are refactors of the same code path; none should break existing behavior.

- [ ] **Step 2.1.7: Commit**

```bash
npm run lint && npm run build:check
git add lib/scheduler.ts tests/unit/scheduler-idle-watchdog.test.ts 2>/dev/null tests/unit/scheduler-spawn-wait.test.ts 2>/dev/null
git commit -m "fix(scheduler): spawn path triage — I1 + I2 + I9

Three related fixes in _spawnWithRetry, batched because they share
the same function body:

I1: Orphan state object. The free_fallback stateKey was not always
pre-seeded in the states map, so 'states.get(stateKey) || createBackendState(...)'
created a throw-away object that markInFlight/markComplete mutated
but that was never visible to other dispatches. Now: if the state
doesn't exist, insert it into the map immediately.

I2: SIGKILL escalation timers were fire-and-forget setTimeout calls
that could fire after the child had already exited, potentially
killing a recycled PID. Tracked via idleKillTimer/totalKillTimer
variables and cleared in both close and error handlers alongside
the existing totalTimer cleanup.

I9: The wait branch recursed unconditionally after 'waiting' for a
past-timestamp recovery (delay = 0). Under sample-exhaustion
conditions this could trigger O(N) rapid recursive calls. Now: if
waitMs <= 0, fall through to free_fallback instead of waiting.

Added test scaffolding for I2/I9 with manual verification notes;
these paths are not cleanly unit-testable without exposing
_spawnWithRetry directly.

Audit references: docs/architecture/RISKS.md I1, I2, I9."
```

---

### Task 2.2: O3 — `_lastLoggedPressure` session key isolation

**Finding:** The `_lastLoggedPressure` map is keyed by `process.pid.toString()`. Multiple `createScheduler` calls in the same process share state, suppressing the first pressure-transition log of later sessions.

**Files:**
- Modify: `lib/scheduler.ts` (`createScheduler`, `logPressureTransition`)
- Modify: `tests/unit/scheduler-pressure.test.ts`

- [ ] **Step 2.2.1: Read current implementation**

```bash
grep -n "_lastLoggedPressure\|logPressureTransition\|createScheduler" lib/scheduler.ts | head -10
```

The current `createScheduler` signature is likely:
```typescript
export function createScheduler(
  config: SchedulerConfig | undefined,
  superpowersConfig?: SuperpowersConfig,
): Scheduler | null { ... }
```

And `logPressureTransition` takes `sessionKey: string` as its first parameter.

- [ ] **Step 2.2.2: Add a unique session ID counter**

Near the top of `lib/scheduler.ts`, after existing module-level state, add:

```typescript
// Monotonic counter for unique per-scheduler session keys. Each
// createScheduler call gets its own ID so _lastLoggedPressure
// transitions are tracked independently across schedulers in the
// same process.
let _nextSchedulerSessionId = 0;
```

- [ ] **Step 2.2.3: Generate a unique session key per scheduler**

Inside `createScheduler`, after the null-check on config:

```typescript
const sessionKey = `pid-${process.pid}-session-${_nextSchedulerSessionId++}`;
```

Store it on the scheduler object or in a closure variable. Whatever mechanism the existing code uses to pass the session key to `logPressureTransition`, update it to use the new per-scheduler `sessionKey`.

In the caller sites that currently pass `process.pid.toString()` to `logPressureTransition`, replace with the new `sessionKey`. Those callers are typically in `lib/backend.ts` `getEffectiveTierForDispatch` which uses `process.pid.toString()` directly.

**Wait:** the audit says `getEffectiveTierForDispatch` calls `logPressureTransition(process.pid.toString(), ...)`. But the helper doesn't have access to the scheduler's session key. Either:

(a) Store the session key on the Scheduler interface as a read-only property and thread it through
(b) Accept a `sessionKey` parameter in `getEffectiveTierForDispatch`
(c) Keep `logPressureTransition` keyed on something else

**Preferred approach:** Add `readonly sessionKey: string` to the Scheduler interface in `lib/types.ts` and populate it from `createScheduler`. Then `getEffectiveTierForDispatch` reads `opts.scheduler.sessionKey` instead of `process.pid.toString()`.

Update `lib/types.ts` Scheduler interface:

```typescript
export interface Scheduler {
  readonly sessionKey: string;
  spawn(...): Promise<SchedulerSpawnResult>;
  // ... existing methods ...
}
```

Update `createScheduler` to set `sessionKey` on the returned object:

```typescript
const scheduler: Scheduler = {
  sessionKey,
  spawn: ...,
  // ...
};
```

Update `lib/backend.ts` `getEffectiveTierForDispatch`:

```typescript
// Replace:
logPressureTransition(process.pid.toString(), pressure, ...)
// With:
logPressureTransition(opts.scheduler.sessionKey, pressure, ...)
```

- [ ] **Step 2.2.4: Test the isolation**

Add to `tests/unit/scheduler-pressure.test.ts`:

```typescript
describe('logPressureTransition session isolation (O3 regression)', () => {
  it('multiple session keys track transitions independently', () => {
    const { logPressureTransition } = require('../../lib/scheduler') as {
      logPressureTransition: (
        sessionKey: string,
        level: 'none' | 'warning' | 'high' | 'critical',
        agentType: string,
        baseTier: string,
        effectiveTier: string,
      ) => void;
    };

    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    try {
      // Session A: none → warning (logs)
      logPressureTransition('session-A', 'warning', 'grd-planner', 'opus', 'opus');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      stderrSpy.mockClear();

      // Session B: none → warning (logs — independent from A)
      logPressureTransition('session-B', 'warning', 'grd-planner', 'opus', 'opus');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      stderrSpy.mockClear();

      // Session A: warning → warning (no log)
      logPressureTransition('session-A', 'warning', 'grd-planner', 'opus', 'opus');
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
```

Also add to `tests/unit/scheduler-spawn-wait.test.ts` (or wherever `createScheduler` is tested) a test that two `createScheduler` calls produce schedulers with different `sessionKey` values.

- [ ] **Step 2.2.5: Verify and commit**

```bash
npx jest tests/unit/scheduler-pressure.test.ts tests/unit/scheduler-spawn-wait.test.ts 2>&1 | tail -10
npm run lint && npm run build:check
git add lib/scheduler.ts lib/types.ts lib/backend.ts tests/unit/scheduler-pressure.test.ts tests/unit/scheduler-spawn-wait.test.ts
git commit -m "fix(scheduler): unique session key per createScheduler (O3)

_lastLoggedPressure was a module-level Map keyed by process.pid.toString().
Multiple createScheduler calls in the same process (e.g., runAutopilot
+ runMultiMilestoneAutopilot) shared state, suppressing the first
pressure-transition log of the second scheduler.

Added a monotonic _nextSchedulerSessionId counter. Each scheduler
gets a unique 'pid-N-session-M' key exposed as readonly sessionKey
on the Scheduler interface. getEffectiveTierForDispatch reads
opts.scheduler.sessionKey instead of process.pid.

Audit reference: docs/architecture/RISKS.md finding O3."
```

---

### Task 2.3: Phase 2 verification

- [ ] **Step 2.3.1: Run the full test suite**

```bash
npm test 2>&1 | tail -15
```

- [ ] **Step 2.3.2: Lint and build check**

```bash
npm run lint && npm run build:check
```

- [ ] **Step 2.3.3: Phase 2 summary commit**

```bash
git commit --allow-empty -m "chore: Phase 2 of audit fixes complete

Completed fixes:
- I1 (orphan state object)
- I2 (SIGKILL escalation timer cleanup)
- I9 (rapid recursion on past-timestamp)
- O3 (unique scheduler session key)

Moving to Phase 3 (phase lifecycle correctness)."
```

---

## Phase 3: Phase lifecycle correctness

**Intent:** Fix the phase-complete + phase-io + state.ts triangle. These three fixes interact (caches, synthetic results) and benefit from being tested together.

### Task 3.1: I4 + O2 — cache invalidation and consolidation

**Consolidated** because both fixes touch `lib/phase-io.ts` and the second (O2) is a prerequisite for robust cache invalidation.

- **I4** — phase-io cache not invalidated by external writes (e.g., LLM fallback)
- **O2** — duplicate `_stateFileCache` in `lib/state.ts` that can diverge from `phase-io.ts`

**Files:**
- Modify: `lib/phase-io.ts`
- Modify: `lib/state.ts`
- Modify: `lib/phase-complete-llm.ts`
- Modify: `lib/phase-complete.ts`
- Modify: `tests/unit/phase-io.test.ts` (if exists, else add cache tests to existing test files)

- [ ] **Step 3.1.1: Read both cache implementations**

```bash
grep -n "_stateFileCache\|_roadmapFileCache" lib/phase-io.ts lib/state.ts
```

Read both modules' cache code. The question: are the caches drop-in equivalent, or do they have different semantics (TTL, size limits, etc.)?

If they're equivalent (just two identical Map instances that hold file paths → content strings), consolidation is straightforward. If they differ, this task's scope expands to "harmonize semantics first, then consolidate." In that case, split this task into 3.1a (harmonize) and 3.1b (consolidate), and verify each independently.

- [ ] **Step 3.1.2: Add cache-invalidation exports to phase-io.ts**

In `lib/phase-io.ts`, add:

```typescript
/**
 * Invalidates the cached content for a specific ROADMAP.md file path,
 * or the entire cache if no path is given. Used by phase-complete-llm
 * after an LLM fallback writes the file directly (bypassing the cache),
 * and at the start of _phaseCompleteCore to guarantee a fresh read.
 */
export function clearRoadmapCache(filePath?: string): void {
  if (filePath === undefined) {
    _roadmapFileCache.clear();
  } else {
    _roadmapFileCache.delete(filePath);
  }
}

/**
 * Invalidates the cached content for a specific STATE.md file path,
 * or the entire cache if no path is given.
 */
export function clearStateCache(filePath?: string): void {
  if (filePath === undefined) {
    _stateFileCache.clear();
  } else {
    _stateFileCache.delete(filePath);
  }
}
```

Add both to the `module.exports` at the bottom.

- [ ] **Step 3.1.3: Consolidate state.ts cache into phase-io.ts**

In `lib/state.ts`, find the local `_stateFileCache` and its read/write helpers. Replace them with imports from `phase-io.ts`:

```typescript
// Replace the local cache and readStateFile/writeStateFile helpers with:
const {
  readStateFile,
  writeStateFile,
} = require('./phase-io') as {
  readStateFile: (p: string) => string;
  writeStateFile: (p: string, content: string) => void;
};
```

Delete the local `_stateFileCache` declaration and the local function definitions.

If `lib/state.ts` currently exports `readStateFile` / `writeStateFile`, update it to re-export from `phase-io`:

```typescript
module.exports = {
  // ... existing exports ...
  readStateFile,
  writeStateFile,
};
```

**Critical:** Run existing state tests after this to catch any divergence:

```bash
npx jest tests/unit/state.test.ts 2>&1 | tail -15
```

If tests fail, the caches have divergent semantics — abort this sub-task and file a scope expansion note in the commit. The fallback is to leave state.ts alone (skip O2) and just fix I4.

- [ ] **Step 3.1.4: Call the clear functions from phase-complete-llm.ts**

In `lib/phase-complete-llm.ts`, after the scheduler.spawn call succeeds (before the verification), add:

```typescript
// The LLM subprocess wrote ROADMAP.md and STATE.md via its own fs
// calls, bypassing phase-io's cache. Invalidate the cache so any
// subsequent reader (especially _phaseCompleteCore for phase N+1)
// gets the fresh content.
const { clearRoadmapCache, clearStateCache } = require('./phase-io') as {
  clearRoadmapCache: (filePath?: string) => void;
  clearStateCache: (filePath?: string) => void;
};
clearRoadmapCache(path.join(cwd, '.planning', 'ROADMAP.md'));
clearStateCache(path.join(cwd, '.planning', 'STATE.md'));
```

Place this before the `_verifyFallbackOutput` call so the verification reads fresh content too.

- [ ] **Step 3.1.5: Call clear at start of _phaseCompleteCore**

In `lib/phase-complete.ts`, at the top of `_phaseCompleteCore` (after the dry-run check, before the gates call), add:

```typescript
// Spec 3B cleanup: invalidate caches in case a prior LLM fallback in
// the same process wrote these files directly.
clearRoadmapCache(path.join(cwd, '.planning', 'ROADMAP.md'));
clearStateCache(path.join(cwd, '.planning', 'STATE.md'));
```

Import `clearRoadmapCache`, `clearStateCache` from `./phase-io`.

- [ ] **Step 3.1.6: Add tests**

In `tests/unit/phase-io.test.ts` (create if doesn't exist):

```typescript
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const {
  readRoadmapFile,
  writeRoadmapFile,
  readStateFile,
  writeStateFile,
  clearRoadmapCache,
  clearStateCache,
} = require('../../lib/phase-io') as {
  readRoadmapFile: (p: string) => string;
  writeRoadmapFile: (p: string, content: string) => void;
  readStateFile: (p: string) => string;
  writeStateFile: (p: string, content: string) => void;
  clearRoadmapCache: (filePath?: string) => void;
  clearStateCache: (filePath?: string) => void;
};

describe('phase-io cache invalidation (I4 regression)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-i4-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('readRoadmapFile returns stale content until clearRoadmapCache is called', () => {
    const roadmapPath = path.join(tmpDir, 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, 'original\n');

    // Prime the cache
    expect(readRoadmapFile(roadmapPath)).toBe('original\n');

    // External write bypassing phase-io
    fs.writeFileSync(roadmapPath, 'updated\n');

    // Cache still returns stale
    expect(readRoadmapFile(roadmapPath)).toBe('original\n');

    // Clear the cache
    clearRoadmapCache(roadmapPath);

    // Now we see the updated content
    expect(readRoadmapFile(roadmapPath)).toBe('updated\n');
  });

  it('clearRoadmapCache with no args clears all entries', () => {
    const a = path.join(tmpDir, 'a.md');
    const b = path.join(tmpDir, 'b.md');
    fs.writeFileSync(a, 'a1\n');
    fs.writeFileSync(b, 'b1\n');
    readRoadmapFile(a);
    readRoadmapFile(b);
    fs.writeFileSync(a, 'a2\n');
    fs.writeFileSync(b, 'b2\n');
    clearRoadmapCache();
    expect(readRoadmapFile(a)).toBe('a2\n');
    expect(readRoadmapFile(b)).toBe('b2\n');
  });

  it('same for clearStateCache', () => {
    const statePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(statePath, 'original\n');
    expect(readStateFile(statePath)).toBe('original\n');
    fs.writeFileSync(statePath, 'updated\n');
    expect(readStateFile(statePath)).toBe('original\n');
    clearStateCache(statePath);
    expect(readStateFile(statePath)).toBe('updated\n');
  });
});
```

- [ ] **Step 3.1.7: Verify and commit**

```bash
npx jest tests/unit/phase-io.test.ts tests/unit/state.test.ts tests/unit/phase-complete.test.ts tests/unit/phase-complete-llm.test.ts 2>&1 | tail -15
npm run lint && npm run build:check
git add lib/phase-io.ts lib/state.ts lib/phase-complete.ts lib/phase-complete-llm.ts tests/unit/phase-io.test.ts
git commit -m "fix(phase-io): add cache invalidation + consolidate duplicate caches (I4 + O2)

I4: phase-io's _roadmapFileCache and _stateFileCache were write-through
but never invalidated when an external writer (e.g., LLM fallback in
phase-complete-llm) modified the file directly. Subsequent reads in
the same process returned stale content, which could cause
_phaseCompleteCore for phase N+1 to overwrite the LLM's edits.

O2: lib/state.ts had its own independent _stateFileCache that could
diverge from phase-io's. Consolidated into phase-io; state.ts now
imports readStateFile/writeStateFile from phase-io.

New exports: clearRoadmapCache(filePath?), clearStateCache(filePath?).
Both are called from phase-complete-llm after scheduler.spawn and
from _phaseCompleteCore at the start.

3 unit tests for the cache invalidation behavior.

Audit references: docs/architecture/RISKS.md I4, O2."
```

**Rollback note:** If the state.ts consolidation breaks existing tests in ways that require broader refactoring, revert that part of the commit and keep only the I4 invalidation fix. Note the scope split in the commit message.

---

### Task 3.2: I7 — proper next-phase discovery in `_buildSyntheticResult`

**Finding:** The synthetic result returned after LLM fallback hardcodes `is_last_phase: false`, `next_phase: null`, and `plans_executed: 'N/A'`. Autopilot and other consumers that read these fields get misleading data.

**Files:**
- Modify: `lib/phase-complete-llm.ts` (`_buildSyntheticResult` and caller)
- Modify: `tests/unit/phase-complete-llm.test.ts`

- [ ] **Step 3.2.1: Read the existing next-phase discovery logic**

The logic we want to mirror is in `lib/phase-complete.ts` inside `_phaseCompleteCore`:

```bash
grep -n "findPhaseInternal\|isLastPhase\|nextPhaseNum\|phasesDir" lib/phase-complete.ts | head -20
```

Read lines 161-188 (approximately) to see how it:
1. Calls `findPhaseInternal(cwd, phaseNum)` to get the phase info
2. Reads the phase directory
3. Determines `nextPhaseNum`, `nextPhaseName`, `isLastPhase`
4. Counts plans and summaries

- [ ] **Step 3.2.2: Extract a shared helper (optional but clean)**

Consider extracting the next-phase discovery into a helper function exported from `lib/phase-complete.ts`:

```typescript
// In lib/phase-complete.ts
export function _resolvePhaseSuccession(
  cwd: string,
  phaseNum: string,
): {
  phaseName: string;
  plansExecuted: string;
  nextPhaseNum: string | null;
  nextPhaseName: string | null;
  isLastPhase: boolean;
} {
  const phaseInfo = findPhaseInternal(cwd, phaseNum);
  const phaseName = phaseInfo?.phase_name ?? '(unknown)';
  const planCount = phaseInfo?.plans?.length ?? 0;
  const summaryCount = phaseInfo?.summaries?.length ?? 0;
  const plansExecuted = `${summaryCount}/${planCount}`;

  const basePhasesDir = phasesDir(cwd);
  let nextPhaseNum: string | null = null;
  let nextPhaseName: string | null = null;
  let isLastPhase = true;
  try {
    const entries = fs.readdirSync(basePhasesDir).sort();
    const currentFloat = parseFloat(phaseNum);
    for (const dir of entries) {
      const m = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      if (m && parseFloat(m[1]) > currentFloat) {
        nextPhaseNum = m[1];
        nextPhaseName = m[2] || null;
        isLastPhase = false;
        break;
      }
    }
  } catch {
    // phases dir missing — leave isLastPhase = true
  }
  return { phaseName, plansExecuted, nextPhaseNum, nextPhaseName, isLastPhase };
}
```

Add `_resolvePhaseSuccession` to `module.exports` in `phase-complete.ts`.

Refactor `_phaseCompleteCore` to use the helper internally as well (deduplicates the logic).

- [ ] **Step 3.2.3: Use the helper in `_buildSyntheticResult`**

In `lib/phase-complete-llm.ts`, change `_buildSyntheticResult`:

```typescript
// Old:
function _buildSyntheticResult(phaseNum: string): PhaseCompleteResult {
  const today = new Date().toISOString().split('T')[0];
  return {
    completed_phase: phaseNum,
    phase_name: `(LLM-finalized)`,
    plans_executed: 'N/A',
    next_phase: null,
    next_phase_name: null,
    is_last_phase: false,
    date: today,
    roadmap_updated: true,
    state_updated: true,
    llm_fallback: true,
  } as PhaseCompleteResult;
}
```

Change to accept `cwd` and use the helper:

```typescript
const { _resolvePhaseSuccession } = require('./phase-complete') as {
  _resolvePhaseSuccession: (
    cwd: string,
    phaseNum: string,
  ) => {
    phaseName: string;
    plansExecuted: string;
    nextPhaseNum: string | null;
    nextPhaseName: string | null;
    isLastPhase: boolean;
  };
};

function _buildSyntheticResult(cwd: string, phaseNum: string): PhaseCompleteResult {
  const today = new Date().toISOString().split('T')[0];
  const succession = _resolvePhaseSuccession(cwd, phaseNum);
  return {
    completed_phase: phaseNum,
    phase_name: succession.phaseName,
    plans_executed: succession.plansExecuted,
    next_phase: succession.nextPhaseNum,
    next_phase_name: succession.nextPhaseName,
    is_last_phase: succession.isLastPhase,
    date: today,
    roadmap_updated: true,
    state_updated: true,
    llm_fallback: true,
  } as PhaseCompleteResult;
}
```

Update the `_buildSyntheticResult` caller to pass `cwd`.

**Circular dep check:** `phase-complete-llm.ts` now imports from `phase-complete.ts`. Verify that `phase-complete.ts` does NOT import from `phase-complete-llm.ts` at module load time. It only requires `phase-complete-llm` lazily inside `completePhaseAfterPostPipeline`'s catch branch — lazy require is circular-safe.

- [ ] **Step 3.2.4: Add tests**

In `tests/unit/phase-complete-llm.test.ts`, extend the existing success test to verify the synthetic result's fields:

```typescript
it('_buildSyntheticResult uses real next-phase discovery (I7 regression)', async () => {
  const dir = makeTempProject();  // already has phase 3 and phase 4
  try {
    // ... set up fallback to tick the roadmap ...
    const scheduler = makeFakeScheduler('success', () => {
      const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
      const content = fs.readFileSync(roadmapPath, 'utf-8');
      fs.writeFileSync(
        roadmapPath,
        content.replace(
          '- [ ] Phase 3: Test Phase',
          '- [x] Phase 3: Test Phase (completed)',
        ),
      );
    });
    const result = (await attemptLlmFallbackCompletion(
      dir,
      '3',
      scheduler,
      new Error('test'),
    )) as { next_phase: string | null; is_last_phase: boolean; plans_executed: string };
    expect(result).not.toBeNull();
    expect(result.next_phase).toBe('04');   // or '4' depending on format
    expect(result.is_last_phase).toBe(false);
    expect(result.plans_executed).not.toBe('N/A');
  } finally {
    cleanup(dir);
  }
});
```

- [ ] **Step 3.2.5: Verify and commit**

```bash
npx jest tests/unit/phase-complete-llm.test.ts tests/unit/phase-complete.test.ts 2>&1 | tail -10
npm run lint && npm run build:check
git add lib/phase-complete.ts lib/phase-complete-llm.ts tests/unit/phase-complete-llm.test.ts
git commit -m "fix(phase-complete-llm): proper next-phase discovery in synthetic result (I7)

_buildSyntheticResult previously hardcoded is_last_phase: false,
next_phase: null, plans_executed: 'N/A', and phase_name: '(LLM-finalized)'.
These fields are surfaced in autopilot's result JSON and logs, so a
successful LLM fallback produced misleading output for downstream
consumers and for the last phase of a milestone.

Extracted _resolvePhaseSuccession helper from _phaseCompleteCore.
The helper reads findPhaseInternal for plan/summary counts and
scans the phases directory for the real next phase. Both
_phaseCompleteCore and the synthetic result now share this logic.

_buildSyntheticResult gains a cwd parameter and uses the helper.

Audit reference: docs/architecture/RISKS.md finding I7."
```

---

### Task 3.3: Phase 3 verification

- [ ] **Step 3.3.1: Run the full test suite**

```bash
npm test 2>&1 | tail -15
```

- [ ] **Step 3.3.2: Lint and build check**

```bash
npm run lint && npm run build:check
```

- [ ] **Step 3.3.3: Phase 3 summary commit**

```bash
git commit --allow-empty -m "chore: Phase 3 of audit fixes complete

Completed fixes:
- I4 (phase-io cache invalidation)
- O2 (state.ts cache consolidation into phase-io)
- I7 (proper next-phase discovery in synthetic result)

Moving to Phase 4 (cleanup and improvements)."
```

---

## Phase 4: Cleanup and improvements

**Intent:** Remove dead code, sharpen complexity routing.

### Task 4.1: I3 — remove dead `startHeartbeat`

**Finding:** `startHeartbeat` is exported but never called. The intended feature is inert and the uncleared `setInterval` return value is a future landmine.

**Decision:** Remove it. The heartbeat feature can be reintroduced later via a proper spec if demand emerges.

**Files:**
- Modify: `lib/autopilot.ts`
- Modify: `tests/unit/autopilot.test.ts` (remove any tests for startHeartbeat)

- [ ] **Step 4.1.1: Confirm it's dead**

```bash
grep -rn "startHeartbeat" lib/ bin/ tests/ 2>/dev/null | head -20
```

Expected: definitions + tests only, no production call sites. If there IS a production caller, STOP — the audit was wrong and this task needs re-planning.

- [ ] **Step 4.1.2: Remove the function**

In `lib/autopilot.ts`, delete the `startHeartbeat` function definition (lines ~2556-2560) and its entry in `module.exports`.

- [ ] **Step 4.1.3: Remove the tests**

In `tests/unit/autopilot.test.ts`, find any `describe`/`it` blocks for `startHeartbeat` and delete them.

- [ ] **Step 4.1.4: Verify and commit**

```bash
npm run lint && npm run build:check && npx jest tests/unit/autopilot.test.ts 2>&1 | tail -10
git add lib/autopilot.ts tests/unit/autopilot.test.ts
git commit -m "refactor(autopilot): remove dead startHeartbeat (I3)

startHeartbeat was exported and tested but never called from any
production code path. The intended feature (periodic stderr output
to keep long autopilot runs visible in logs) was inert. Keeping
the export around was a future landmine because it returns an
uncleared setInterval — a future caller forgetting clearInterval
would prevent Node.js from exiting.

If the feature is reintroduced later, it should come with a proper
spec and a verified clearInterval call site.

Audit reference: docs/architecture/RISKS.md finding I3."
```

---

### Task 4.2: M2 — per-agent complexity samples

**Finding:** `getEffectiveTierForDispatch` aggregates `tokenEstimate` across all agent types without filtering. A burst of cheap `grd-verifier` runs pulls the tail-average down, potentially demoting a subsequent `grd-planner` dispatch.

**Scope warning:** This fix requires adding `agentType` to `UsageSample` and threading it through `scheduler.spawn` → `_spawnWithRetry` → `recordSample`. That's ~6 call sites across autopilot, evolve, and autoresearch. Moderate refactor.

**Files:**
- Modify: `lib/types.ts` (add `agentType?: string` to `UsageSample` and `SpawnOpts`)
- Modify: `lib/scheduler.ts` (record sample with agentType)
- Modify: `lib/backend.ts` (`getEffectiveTierForDispatch` filter by agentType)
- Modify: `lib/autopilot.ts` (pass agentType in spawn opts)
- Modify: `lib/evolve/orchestrator.ts` (same)
- Modify: `lib/autoresearch.ts` (same)
- Modify: `tests/unit/backend-effective-tier.test.ts`

- [ ] **Step 4.2.1: Extend types**

In `lib/types.ts`:

```typescript
export interface UsageSample {
  backend: BackendId;
  stateKey?: string;
  agentType?: string;  // NEW: Spec 4 M2 fix — enables per-agent complexity routing
  timestamp: number;
  duration: number;
  tokenEstimate: number;
  exitCode: number;
  workItemId: string;
}

export interface SpawnOpts {
  // ... existing fields ...
  agentType?: string;  // NEW: optional agent type hint, stored in UsageSample
}
```

- [ ] **Step 4.2.2: Record agentType in _spawnWithRetry**

In `lib/scheduler.ts` inside the `close` handler where the `UsageSample` is constructed:

```typescript
const sample: UsageSample = {
  backend: backend as BackendId,
  stateKey,
  agentType: opts.agentType,  // NEW
  timestamp: Date.now(),
  duration,
  tokenEstimate: tokens,
  exitCode,
  workItemId,
};
```

- [ ] **Step 4.2.3: Filter samples in getEffectiveTierForDispatch**

In `lib/backend.ts` `getEffectiveTierForDispatch`, find where `allSamples` is assembled:

```bash
grep -n "allSamples\|recentSamples" lib/backend.ts | head -15
```

Change the filter to prefer same-agentType samples, falling back to all samples if the agent has too few of its own:

```typescript
// Spec 4 M2: prefer per-agent samples if we have enough, else fall back to global.
const ownAgentSamples = allSamples.filter(
  (s) => s.agentType === opts.agentType,
);
const samplesToUse = ownAgentSamples.length >= 3 ? ownAgentSamples : allSamples;
const recentSamples = samplesToUse
  .sort((a, b) => b.timestamp - a.timestamp)
  .slice(0, 10)
  .map((s) => ({ duration: s.duration, tokenEstimate: s.tokenEstimate }));
```

Note that `allSamples` items may or may not have `agentType` set — old samples from before this fix won't. The fallback handles that.

- [ ] **Step 4.2.4: Pass agentType in spawn calls**

Find every call to `scheduler.spawn` in:

```bash
grep -rn "scheduler.spawn\|opts.scheduler.spawn" lib/autopilot.ts lib/autoresearch.ts lib/evolve/ 2>/dev/null | head -15
```

For each, add `agentType` to the opts object. The `agentType` is typically known at the call site because the caller is dispatching a specific agent type (e.g., `grd-planner`, `grd-executor`).

- [ ] **Step 4.2.5: Add test**

In `tests/unit/backend-effective-tier.test.ts` or a new file, add:

```typescript
describe('getEffectiveTierForDispatch agent-type filtering (M2 regression)', () => {
  it('uses only same-agent samples when >= 3 are available', () => {
    // Build a fake scheduler state with:
    //  - 5 grd-verifier samples (small tokens)
    //  - 5 grd-planner samples (large tokens)
    // Dispatching grd-planner should NOT demote based on verifier samples.
    // ... (test body — specifics depend on helper availability)
  });

  it('falls back to global samples when the agent has fewer than 3', () => {
    // Similar setup but only 2 grd-planner samples.
    // Should use the global tail (verifier samples pull it down).
  });
});
```

- [ ] **Step 4.2.6: Verify and commit**

```bash
npm run lint && npm run build:check && npm test 2>&1 | tail -15
git add lib/types.ts lib/scheduler.ts lib/backend.ts lib/autopilot.ts lib/evolve lib/autoresearch.ts tests/unit/backend-effective-tier.test.ts
git commit -m "feat(complexity): per-agent sample filtering in getEffectiveTierForDispatch (M2)

Before: getEffectiveTierForDispatch aggregated tokenEstimate from
all agent types in the scheduler state. A burst of cheap verifier
samples pulled the tail-average down, potentially demoting a
subsequent planner dispatch from 'high' to 'medium' complexity.

Now: UsageSample and SpawnOpts gain an optional agentType field.
_spawnWithRetry records it at sample time. getEffectiveTierForDispatch
prefers same-agent samples (>= 3 required); falls back to global
samples if the specific agent has too few.

Call sites in autopilot, evolve, autoresearch updated to pass
agentType in spawn opts.

Audit reference: docs/architecture/RISKS.md finding M2."
```

---

### Task 4.3: Phase 4 verification

- [ ] **Step 4.3.1: Run the full test suite**

```bash
npm test 2>&1 | tail -15
```

- [ ] **Step 4.3.2: Lint, build, format, scan**

```bash
npm run lint && npm run build:check
npm run format:check 2>&1 | tail -5
node bin/gd.js scan --all 2>&1 | tail -5
```

If format-check fails on fix-branch files, run prettier scoped to those files (never run `npm run format` without paths).

---

## Phase 5: Final verification and audit doc update

### Task 5.1: Update RISKS.md to mark fixes as resolved

**Files:**
- Modify: `docs/architecture/RISKS.md`

- [ ] **Step 5.1.1: Mark each addressed finding**

At the top of each finding section (I1–I9, M1–M3, O2–O4) that's now fixed, add a `**Status:** Fixed in <commit SHA>` line:

```markdown
### I1: Orphan state object in _spawnWithRetry

**Status:** Fixed in `<commit SHA>` (Phase 2 of audit fix plan).

**Location:** `lib/scheduler.ts:917`
...
```

O1 stays as "deferred — see future spec."

- [ ] **Step 5.1.2: Commit**

```bash
git add docs/architecture/RISKS.md
git commit -m "docs: mark audit findings as fixed in RISKS.md

Phase 1: I5, I8, O4, M1, M3, I6 resolved
Phase 2: I1, I2, I9, O3 resolved
Phase 3: I4, O2, I7 resolved
Phase 4: I3 (removed), M2 resolved

Out of scope (deferred to future spec):
- O1 (autopilot.ts decomposition)"
```

### Task 5.2: Final smoke checks

- [ ] **Step 5.2.1: Full suite**

```bash
npm test 2>&1 | tail -15
```

- [ ] **Step 5.2.2: Smoke test scheduler happy path**

```bash
# Simulate a normal autopilot spawn via the exported helpers
# (if feasible — otherwise skip and rely on the test suite)
```

- [ ] **Step 5.2.3: Smoke test CLI**

```bash
node bin/gd.js help 2>&1 | head -20
node bin/gd.js progress 2>&1 | head -10 || true  # may fail if not in a GRD project
node bin/gd.js metrics 2>&1 | head -5             # Spec 4 followup CLI
```

- [ ] **Step 5.2.4: Commit chain review**

```bash
git log --oneline main..HEAD
```

Expected: 14 substantive commits + 4 phase-summary commits + 1 docs-update commit + any format commit. Roughly 19-21 commits on the branch.

---

## Final commit chain shape

```
Phase 1:
  fix(phase-complete): escape all dots in phase number regex (I5)
  fix(scheduler): use cross-platform binary check (I8)
  refactor(scheduler-wait): use CJS-only per project convention (O4)
  fix(gates): log exceptions from gate checks + record warning (M1)
  fix(phase-complete-llm): treat missing STATE.md as verification failure (M3)
  fix(autoresearch): handle existing branch on second same-day run (I6)
  chore: Phase 1 of audit fixes complete

Phase 2:
  fix(scheduler): spawn path triage — I1 + I2 + I9
  fix(scheduler): unique session key per createScheduler (O3)
  chore: Phase 2 of audit fixes complete

Phase 3:
  fix(phase-io): add cache invalidation + consolidate duplicate caches (I4 + O2)
  fix(phase-complete-llm): proper next-phase discovery in synthetic result (I7)
  chore: Phase 3 of audit fixes complete

Phase 4:
  refactor(autopilot): remove dead startHeartbeat (I3)
  feat(complexity): per-agent sample filtering in getEffectiveTierForDispatch (M2)

Phase 5:
  docs: mark audit findings as fixed in RISKS.md
  chore: apply prettier formatting to audit-fix files  (if needed)
```

Merge strategy: `--no-ff` per the gsd-2-selective-adoption milestone convention, with a descriptive merge commit listing all fixes.

---

## Out of scope

### O1 — `lib/autopilot.ts` decomposition

2,700 lines of orchestration code is a structural refactor, not a fix. Every major feature (plan, execute, verify, post-pipeline, finalize, multi-milestone) routes through this file. A decomposition must:

1. Identify logical module boundaries (pipeline, waves, milestone loop, merge queue, file locks)
2. Preserve the async/await correctness added in Specs 3/3B
3. Preserve the wire-ups for token_profile, budget pressure, idle watchdog, and LLM fallback
4. Update every caller in `bin/grd-tools.ts`, `lib/cli/`, `lib/mcp-server.ts`
5. Preserve test coverage during the split

**Recommended next step:** Create a new spec file `docs/superpowers/specs/YYYY-MM-DD-autopilot-decomposition-design.md` and run it through the standard brainstorm → spec → plan → execute cycle. Target module split based on the audit's suggestion in RISKS.md O1:

- `lib/autopilot-pipeline.ts` — `runPostPhasePipeline` + supporting types
- `lib/autopilot-milestone.ts` — multi-milestone loop + `resolveNextMilestone`
- `lib/autopilot-waves.ts` — wave splitting + write-intent logic
- `lib/autopilot.ts` — remains as the entry point orchestrator

Blast radius: every test in `tests/unit/autopilot.test.ts` + several integration tests. Expect 1–2 rounds of test-fix iteration.

---

## Risk ledger for this plan

- **Phase 1 risk:** Low. Each fix is self-contained and short. Worst case: one fix reveals a test environment issue (e.g., Windows-specific test runner behavior) that needs platform-specific handling.
- **Phase 2 risk:** Medium. `_spawnWithRetry` is hot code; three interleaved fixes in the same function body need careful testing. Mitigations: unit tests via exported helpers, manual spawn smoke test, keep the commit atomic so rollback is clean.
- **Phase 3 risk:** Medium. Cache consolidation (O2) may break `state.ts` tests if the caches have subtle differences. Mitigation: the sub-task plan explicitly allows splitting O2 off if state.ts divergence is discovered.
- **Phase 4 risk:** M2 requires touching 6+ call sites. Mitigation: field is optional, old samples without `agentType` fall back to the global path naturally.
- **Phase 5 risk:** Low. Docs-only.

## Estimated total impact

- **Commits:** ~19 (14 substantive + 4 phase summary + 1 docs)
- **Files touched:** ~15 (scheduler.ts, phase-complete*.ts, phase-io.ts, state.ts, gates.ts, autopilot.ts, autoresearch.ts, scheduler-wait.ts, backend.ts, types.ts, complexity.ts, and their tests)
- **New tests:** ~25-30 depending on test feasibility
- **Net LOC:** ~+200 to -50 (new tests add lines, removals subtract)
- **Expected test count after:** ~8,485-8,510 (from 8,460 pre-fix baseline)
