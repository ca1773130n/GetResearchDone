# Mechanical Phase Completion (Spec 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `_phaseCompleteCore` from `lib/phase.ts` into a new `lib/phase-complete.ts` module, add an autopilot-safe `completePhaseAfterPostPipeline` wrapper, and wire autopilot's post-pipeline success path to call it automatically so phases finalize without user intervention.

**Architecture:** Move `_phaseCompleteCore` (~180 lines) verbatim to `lib/phase-complete.ts` and have `lib/phase.ts` import it via a CommonJS `require` assertion (matching GRD convention). Add a new exported `completePhaseAfterPostPipeline(cwd, phaseNum)` wrapper that runs the existing core and catches any error, returning `PhaseCompleteResult | null`. Modify `lib/autopilot.ts` to call the wrapper immediately after the post-pipeline success marker and write a new `phase-finalize` status marker based on the outcome.

**Tech Stack:** TypeScript (strict), CommonJS, `tsx` at entry points, jest with ts-jest, Node 20. All new code follows GRD conventions: `'use strict'` header, JSDoc blocks, `module.exports` at EOF, underscore-prefix for private helpers, no `any`, `process.stderr.write('[prefix] ...\n')` for diagnostic logging.

**Spec reference:** `docs/superpowers/specs/2026-04-11-gsd2-mechanical-completion-design.md` (commit `8b2cd7c`)

**Worktree note:** Create a worktree before starting:

```bash
git worktree add .worktrees/gsd2-mechanical -b feat/gsd2-mechanical-completion
cd .worktrees/gsd2-mechanical
```

**Security invariant:** No shell interpolation, no new subprocess spawns, no new network calls. This spec is entirely refactor + wire-up.

---

## File Structure

**New files:**

```
lib/phase-complete.ts             # Extracted _phaseCompleteCore + completePhaseAfterPostPipeline
tests/unit/phase-complete.test.ts # 6 unit tests
```

**Modified files:**

```
lib/phase.ts                      # Remove _phaseCompleteCore body, add require import
lib/autopilot.ts                  # Add completePhaseAfterPostPipeline call after post-pipeline marker
tests/integration/phase-finalize.test.ts  # New integration test file (if autopilot.test.ts is too dense)
jest.config.js                    # Per-file coverage threshold for lib/phase-complete.ts
docs/CHANGELOG.md                 # Unreleased entry
```

**Module boundaries:**

- `lib/phase-complete.ts` owns the "what it takes to finalize a phase" logic. One clear responsibility: take `(cwd, phaseNum)` and apply the ROADMAP/STATE/quality-analysis/cleanup-plan side effects. Two exports: `_phaseCompleteCore` (used by `phase.ts` CLI wrappers) and `completePhaseAfterPostPipeline` (used by `autopilot.ts`).
- `lib/phase.ts` continues to own the CLI wrappers. It imports `_phaseCompleteCore` from the new module. No behavior change to the CLI surface.
- `lib/autopilot.ts` gains a single new call site. No new helper functions inside autopilot.ts.

---

## Task 1: Create lib/phase-complete.ts skeleton with moved _phaseCompleteCore

**Files:**
- Create: `lib/phase-complete.ts`

This task moves the existing `_phaseCompleteCore` implementation verbatim into a new file, preserving its behavior and imports. No behavior change. The file is not yet imported from `phase.ts` — Task 2 does that.

- [ ] **Step 1.1: Locate `_phaseCompleteCore` and its dependencies**

```bash
cd .worktrees/gsd2-mechanical
grep -n '^function _phaseCompleteCore\|_phaseCompleteCore' lib/phase.ts | head -5
```

Expected: shows the function definition around line 1170 and its call sites in `cmdPhaseComplete` (~line 1374) and `cmdPhaseBatchComplete` (~line 2110).

Read `lib/phase.ts` lines 1160–1350 to understand the current code. Also scan the top of `lib/phase.ts` to see which modules `_phaseCompleteCore` depends on (e.g., `runPreflightGates`, `findPhaseInternal`, `readRoadmapFile`, `writeRoadmapFile`, `readStateFile`, `writeStateFile`, `getPhasesDirPath`, `runQualityAnalysis`, `generateCleanupPlan`).

- [ ] **Step 1.2: Create `lib/phase-complete.ts` with the moved function**

Create `lib/phase-complete.ts`:

```typescript
'use strict';

/**
 * GRD Phase/Complete -- Core phase-completion logic.
 *
 * Extracted from lib/phase.ts as part of Spec 3 of the
 * gsd-2-selective-adoption milestone. This module owns the "finalize a
 * phase" side-effects: preflight gate check, ROADMAP.md checkbox +
 * progress-table rewrite, STATE.md field rewrite, quality analysis,
 * cleanup plan generation, and next-phase discovery.
 *
 * Two exports:
 *   - _phaseCompleteCore: the existing core, used by cmdPhaseComplete
 *     and cmdPhaseBatchComplete in lib/phase.ts.
 *   - completePhaseAfterPostPipeline: new autopilot-safe wrapper that
 *     catches all errors and returns null on failure instead of
 *     throwing. Used by lib/autopilot.ts after the post-pipeline step.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  PhaseCompleteOptions,
  PhaseCompleteResult,
  PhaseInfo,
  PreflightResult,
  QualityAnalysisResult,
  CleanupPlanResult,
} from './types';

const { runPreflightGates } = require('./gates') as {
  runPreflightGates: (
    cwd: string,
    command: string,
    opts?: { phase?: string },
  ) => PreflightResult;
};

const {
  findPhaseInternal,
  getPhasesDirPath,
  readRoadmapFile,
  writeRoadmapFile,
  readStateFile,
  writeStateFile,
} = require('./phase-io') as {
  findPhaseInternal: (cwd: string, phaseNum: string) => PhaseInfo | null;
  getPhasesDirPath: (cwd: string) => string;
  readRoadmapFile: (p: string) => string;
  writeRoadmapFile: (p: string, c: string) => void;
  readStateFile: (p: string) => string;
  writeStateFile: (p: string, c: string) => void;
};

const { runQualityAnalysis, generateCleanupPlan } = require('./cleanup') as {
  runQualityAnalysis: (cwd: string, phaseNum: string) => QualityAnalysisResult;
  generateCleanupPlan: (
    cwd: string,
    phaseNum: string,
    report: QualityAnalysisResult,
  ) => CleanupPlanResult;
};

/**
 * Core logic for phase completion -- shared by cmdPhaseComplete and
 * cmdPhaseBatchComplete. Moved from lib/phase.ts in Spec 3 without
 * behavior changes.
 *
 * @param cwd - Project working directory
 * @param phaseNum - Phase number to mark complete
 * @param options - Completion options (dryRun, force, skip_cleanup)
 */
export function _phaseCompleteCore(
  cwd: string,
  phaseNum: string,
  options?: PhaseCompleteOptions,
): PhaseCompleteResult {
  // [PASTE THE EXISTING BODY FROM lib/phase.ts LINES 1175-1349 HERE,
  //  UNCHANGED, INCLUDING the dry-run guard, gate check, roadmap/state
  //  mutations, quality analysis, cleanup plan generation, and return
  //  statement. DO NOT MODIFY THE LOGIC. Only change indentation if
  //  needed to match the new file's TypeScript strict settings.]
}

/**
 * Autopilot-safe wrapper around _phaseCompleteCore. Runs the existing
 * phase-complete gates and core logic, catches any error, logs it to
 * stderr, and returns null on failure instead of throwing.
 *
 * Autopilot calls this after a successful post-pipeline step; a
 * completion failure is logged as a status marker but does not crash
 * the autopilot run.
 *
 * @param cwd - project root
 * @param phaseNum - phase number string (e.g., '03' or '3')
 * @returns PhaseCompleteResult on success, null on any failure
 */
export function completePhaseAfterPostPipeline(
  cwd: string,
  phaseNum: string,
): PhaseCompleteResult | null {
  try {
    const result = _phaseCompleteCore(cwd, phaseNum);
    if (result.gate_failed) {
      const msgs = (result.gate_errors || [])
        .map((g: { message: string }) => g.message)
        .join('; ');
      process.stderr.write(
        `[autopilot] phase-finalize: gates failed for phase ${phaseNum}: ${msgs}\n`,
      );
      return null;
    }
    if (result.dry_run) {
      // Defensive: dry-run should never be set when options is undefined.
      return null;
    }
    return result;
  } catch (e) {
    process.stderr.write(
      `[autopilot] phase-finalize: error completing phase ${phaseNum}: ${(e as Error).message}\n`,
    );
    return null;
  }
}

module.exports = {
  _phaseCompleteCore,
  completePhaseAfterPostPipeline,
};
```

**CRITICAL:** The `// [PASTE THE EXISTING BODY ...]` placeholder MUST be replaced with the actual body copied verbatim from `lib/phase.ts` lines 1175–1349. Do NOT leave it as a comment. Copy the entire function body, preserving all logic, indentation, and error handling.

**IMPORTANT:** Verify that `./phase-io` actually exists. If not (the helpers may live directly in `./phase.ts`), adjust the `require` call to import from wherever they're actually defined. Possible alternative locations: `./phase`, `./utils`, or inline in `phase.ts`. Use `grep -n 'findPhaseInternal\|getPhasesDirPath\|readRoadmapFile' lib/*.ts` to find them. If they're inline in `phase.ts`, you have two options:

**Option A (preferred):** Before moving `_phaseCompleteCore`, also extract the helpers it depends on into a new `lib/phase-io.ts` helper module. But this inflates the scope.

**Option B:** Have `lib/phase-complete.ts` import these helpers from `./phase` directly:

```typescript
const {
  findPhaseInternal,
  getPhasesDirPath,
  readRoadmapFile,
  writeRoadmapFile,
  readStateFile,
  writeStateFile,
} = require('./phase') as { ... };
```

This creates a circular dependency (`phase.ts` imports `_phaseCompleteCore` from `phase-complete.ts`, which imports helpers from `phase.ts`) but Node.js CommonJS handles this correctly as long as no top-level code references unresolved exports at import time. Since `_phaseCompleteCore` only calls these helpers lazily at runtime, the cycle is safe.

**If the helpers are not exported from `./phase`** (they may be file-local with no `module.exports` entry), you have two choices:
- **Option B1:** Add them to `phase.ts`'s `module.exports` as a precursor step. Minimal disruption. Preferred.
- **Option B2:** Copy-paste the helpers into `phase-complete.ts`. Violates DRY — avoid.

**Decision rule:** Pick the option with the smallest diff. If helpers are already exported, use Option B directly. If not, use Option B1 (add exports, then use Option B). Only create `phase-io.ts` (Option A) if the implementer feels strongly that a dedicated I/O module is warranted — this adds scope.

Report the choice in your DONE status.

- [ ] **Step 1.3: Verify the new file compiles**

```bash
npm run build:check
```

Expected: the new file type-checks successfully. If there are import errors, fix them (see Option A/B/B1 above).

- [ ] **Step 1.4: Commit**

```bash
git add lib/phase-complete.ts
git commit -m "feat(phase-complete): extract _phaseCompleteCore into new module

New lib/phase-complete.ts contains _phaseCompleteCore (moved verbatim
from lib/phase.ts) plus a new completePhaseAfterPostPipeline wrapper
that catches all errors and returns null on failure for autopilot's
safety.

lib/phase.ts will switch to importing from the new module in Task 2.
Behavior is unchanged.

Part of spec 3/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 2: Switch lib/phase.ts to import _phaseCompleteCore from the new module

**Files:**
- Modify: `lib/phase.ts`

This task removes the inline `_phaseCompleteCore` body from `lib/phase.ts` and replaces it with a `require` import from the new module. `cmdPhaseComplete` and `cmdPhaseBatchComplete` continue to call `_phaseCompleteCore(...)` unchanged.

- [ ] **Step 2.1: Add the import at the top of lib/phase.ts**

Open `lib/phase.ts`. Find the existing require-style imports near the top (around lines 1–50 where other modules are imported). Add:

```typescript
const { _phaseCompleteCore } = require('./phase-complete') as {
  _phaseCompleteCore: (
    cwd: string,
    phaseNum: string,
    options?: PhaseCompleteOptions,
  ) => PhaseCompleteResult;
};
```

Place this require near the other local `require('./...')` imports to keep the import section tidy.

- [ ] **Step 2.2: Remove the inline `_phaseCompleteCore` definition**

Find the existing `function _phaseCompleteCore(...)` declaration (around line 1170 of `lib/phase.ts`) and delete the entire function body — from the leading comment block (`// ─── Phase Complete (Transition) ──────────────────────────────────────────────`) through the closing brace of `_phaseCompleteCore`.

Verify after deletion: the `cmdPhaseComplete` function (which still calls `_phaseCompleteCore(cwd, phaseNum, options)`) is still intact and now uses the imported binding.

If the existing section header comment `// ─── Phase Complete (Transition) ───` is meaningful for navigation, keep it in `lib/phase.ts` as a pointer:

```typescript
// ─── Phase Complete (Transition) ──────────────────────────────────────────────
// _phaseCompleteCore moved to lib/phase-complete.ts in Spec 3.
// cmdPhaseComplete and cmdPhaseBatchComplete below import it from there.
```

- [ ] **Step 2.3: Run existing phase tests to verify no regression**

```bash
npx jest tests/unit/phase.test.ts 2>&1 | tail -20
```

Expected: all existing phase tests pass. The refactor preserved behavior.

If tests fail with "cannot find module" or "undefined is not a function" errors, the most likely cause is missing helper exports from `lib/phase.ts` that `lib/phase-complete.ts` expects. Add them to `lib/phase.ts`'s `module.exports` block at the bottom of the file.

- [ ] **Step 2.4: Run lint and build:check**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 2.5: Commit**

```bash
git add lib/phase.ts
git commit -m "refactor(phase): import _phaseCompleteCore from phase-complete module

Removes the inline definition of _phaseCompleteCore (now in
lib/phase-complete.ts per Task 1). cmdPhaseComplete and
cmdPhaseBatchComplete continue to use the same symbol name via
require import. CLI behavior is unchanged.

Part of spec 3/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 3: Unit tests for lib/phase-complete.ts

**Files:**
- Create: `tests/unit/phase-complete.test.ts`

Six tests covering `_phaseCompleteCore` dry-run + gate failure, and `completePhaseAfterPostPipeline` success/gate-failure/throw/dry-run paths.

- [ ] **Step 3.1: Write the failing test file**

Create `tests/unit/phase-complete.test.ts`:

```typescript
'use strict';

/**
 * Unit tests for lib/phase-complete.ts.
 *
 * _phaseCompleteCore is exercised by its existing callers in
 * tests/unit/phase.test.ts; here we test the new wrapper
 * completePhaseAfterPostPipeline specifically — its success,
 * gate-failure, throw, and dry-run paths.
 */

import type { PhaseCompleteResult } from '../../lib/types';

jest.mock('../../lib/phase-complete', () => {
  const actual = jest.requireActual('../../lib/phase-complete');
  return {
    ...actual,
    _phaseCompleteCore: jest.fn(),
  };
});

const phaseComplete = require('../../lib/phase-complete') as {
  _phaseCompleteCore: jest.Mock<PhaseCompleteResult, [string, string, unknown?]>;
  completePhaseAfterPostPipeline: (
    cwd: string,
    phaseNum: string,
  ) => PhaseCompleteResult | null;
};

describe('completePhaseAfterPostPipeline', () => {
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    phaseComplete._phaseCompleteCore.mockReset();
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('returns the result on success', () => {
    const fake: PhaseCompleteResult = {
      completed_phase: '03',
      phase_name: 'Test Phase',
      plans_executed: '3/3',
      next_phase: '04',
      next_phase_name: 'Next',
      is_last_phase: false,
      date: '2026-04-11',
      roadmap_updated: true,
      state_updated: true,
    } as PhaseCompleteResult;
    phaseComplete._phaseCompleteCore.mockReturnValue(fake);

    const result = phaseComplete.completePhaseAfterPostPipeline('/tmp', '03');
    expect(result).toEqual(fake);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('returns null when gates fail', () => {
    const gateFailed: PhaseCompleteResult = {
      gate_failed: true,
      gate_errors: [{ message: 'phase not in roadmap', severity: 'error', gate: 'phase-in-roadmap' }],
      gate_warnings: [],
    } as unknown as PhaseCompleteResult;
    phaseComplete._phaseCompleteCore.mockReturnValue(gateFailed);

    const result = phaseComplete.completePhaseAfterPostPipeline('/tmp', '03');
    expect(result).toBeNull();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('phase-finalize: gates failed for phase 03'),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('phase not in roadmap'),
    );
  });

  it('returns null when the core throws', () => {
    phaseComplete._phaseCompleteCore.mockImplementation(() => {
      throw new Error('simulated mutation failure');
    });

    const result = phaseComplete.completePhaseAfterPostPipeline('/tmp', '03');
    expect(result).toBeNull();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('phase-finalize: error completing phase 03'),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('simulated mutation failure'),
    );
  });

  it('returns null on dry_run (defensive)', () => {
    phaseComplete._phaseCompleteCore.mockReturnValue({
      dry_run: true,
      would_complete_phase: '03',
      phase_found: true,
    } as unknown as PhaseCompleteResult);

    const result = phaseComplete.completePhaseAfterPostPipeline('/tmp', '03');
    expect(result).toBeNull();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('handles an empty gate_errors array gracefully', () => {
    phaseComplete._phaseCompleteCore.mockReturnValue({
      gate_failed: true,
      gate_errors: [],
      gate_warnings: [],
    } as unknown as PhaseCompleteResult);

    const result = phaseComplete.completePhaseAfterPostPipeline('/tmp', '03');
    expect(result).toBeNull();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('phase-finalize: gates failed for phase 03'),
    );
  });

  it('handles missing gate_errors (undefined) gracefully', () => {
    phaseComplete._phaseCompleteCore.mockReturnValue({
      gate_failed: true,
      gate_warnings: [],
    } as unknown as PhaseCompleteResult);

    const result = phaseComplete.completePhaseAfterPostPipeline('/tmp', '03');
    expect(result).toBeNull();
    expect(stderrSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3.2: Run the test**

```bash
npx jest tests/unit/phase-complete.test.ts 2>&1 | tail -20
```

Expected: all 6 tests pass.

**Troubleshooting:**
- If the `jest.mock` factory fails with "module not found," confirm the path `../../lib/phase-complete` is correct relative to `tests/unit/`.
- If `_phaseCompleteCore.mockReturnValue` errors with "is not a function," the mock factory isn't overriding the export properly. In GRD's CommonJS pattern, the factory needs to replace the module.exports object — use `jest.doMock` or adjust the factory to return the mocked function directly. Example:

```typescript
jest.mock('../../lib/phase-complete', () => ({
  _phaseCompleteCore: jest.fn(),
  completePhaseAfterPostPipeline: jest.requireActual('../../lib/phase-complete').completePhaseAfterPostPipeline,
}));
```

But note: `completePhaseAfterPostPipeline`'s body references `_phaseCompleteCore` via closure in the actual module. When we mock the module, the closure still refers to the ORIGINAL `_phaseCompleteCore`, not the mock. So calling the real `completePhaseAfterPostPipeline` will NOT use the mocked core.

**Resolution:** Don't mock at the module level. Instead, use dependency injection inside `completePhaseAfterPostPipeline`:

**Either:**
1. Pass `_phaseCompleteCore` as an optional second parameter with a default, and override it in tests
2. Or test `completePhaseAfterPostPipeline` by setting up a real fixture directory where the core will succeed/fail naturally

**Preferred: Option 2 — real fixtures.** It's slower but more realistic. Use the existing test fixture pattern from `tests/unit/phase.test.ts` (see `createTestProject` or equivalent). Create a temp directory, populate `.planning/ROADMAP.md` and `.planning/STATE.md` with known content, and call `completePhaseAfterPostPipeline` against it. For the throw case, make the ROADMAP file read-only so the write fails.

If real fixtures add too much ceremony, fall back to Option 1 (dependency injection). The implementer decides. Both are acceptable — document the choice in your task report.

- [ ] **Step 3.3: Run lint and build:check**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 3.4: Commit**

```bash
git add tests/unit/phase-complete.test.ts
git commit -m "test(phase-complete): add unit tests for completePhaseAfterPostPipeline

6 tests covering success, gate-failure, throw, dry-run, and defensive
paths. Tests use jest.mock or real fixtures — see tests file for the
chosen approach.

Part of spec 3/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 4: Wire autopilot's post-pipeline success path to call completePhaseAfterPostPipeline

**Files:**
- Modify: `lib/autopilot.ts`

This task adds the autopilot → phase-finalize wire-up. After the existing `writeStatusMarker(cwd, pNum, 'post-pipeline', 'completed')` call, autopilot now invokes `completePhaseAfterPostPipeline` and writes a new `phase-finalize` status marker based on the outcome.

- [ ] **Step 4.1: Add the import**

Open `lib/autopilot.ts`. Find the existing require-style imports at the top of the file. Add:

```typescript
const { completePhaseAfterPostPipeline } = require('./phase-complete') as {
  completePhaseAfterPostPipeline: (
    cwd: string,
    phaseNum: string,
  ) => PhaseCompleteResult | null;
};
```

Also add `PhaseCompleteResult` to any existing `import type` statement from `./types`:

```typescript
import type { /* existing types */, PhaseCompleteResult } from './types';
```

If there's no existing type import from `./types` in autopilot.ts, add one.

- [ ] **Step 4.2: Locate the post-pipeline success path**

```bash
grep -n "post-pipeline.*completed\|writeStatusMarker.*post-pipeline.*completed" lib/autopilot.ts
```

Expected: shows one or more lines around `writeStatusMarker(cwd, pNum, 'post-pipeline', 'completed')` — likely around line 1979.

Read the surrounding context (lines 1930–2000) to understand the control flow. The block should look roughly like:

```typescript
    try {
      // ... post-pipeline body ...
      writeStatusMarker(cwd, pNum, 'post-pipeline', 'completed');
      log(`Phase ${pNum}: post-pipeline complete — merged ${prUrl}`);
    } catch (e) {
      writeStatusMarker(cwd, pNum, 'post-pipeline', 'failed');
      log(`Phase ${pNum}: post-pipeline failed — ${(e as Error).message}`);
    }
```

- [ ] **Step 4.3: Add the phase-finalize call after the post-pipeline success marker**

Immediately after the line `writeStatusMarker(cwd, pNum, 'post-pipeline', 'completed');` (INSIDE the try block, INSIDE the success path, so it only runs when post-pipeline succeeded), insert:

```typescript
      // Spec 3: mechanical phase finalization. On a successful post-pipeline,
      // fold in phase complete (ROADMAP + STATE + quality analysis) instead
      // of leaving it for the user to run manually.
      writeStatusMarker(cwd, pNum, 'phase-finalize', 'started');
      const finalizeResult: PhaseCompleteResult | null = completePhaseAfterPostPipeline(
        cwd,
        pNum,
      );
      if (finalizeResult) {
        writeStatusMarker(cwd, pNum, 'phase-finalize', 'completed');
        log(
          `Phase ${pNum}: phase-finalize complete — ${finalizeResult.plans_executed} plans, ${finalizeResult.next_phase ? `next phase ${finalizeResult.next_phase}` : 'milestone complete'}`,
        );
      } else {
        writeStatusMarker(cwd, pNum, 'phase-finalize', 'failed');
        log(
          `Phase ${pNum}: phase-finalize failed — run 'gd phase complete ${pNum}' manually to finalize`,
        );
      }
```

**Placement clarification:** The new block MUST be inside the same try/catch where the `post-pipeline: completed` marker is written, AND must come after the post-pipeline log line. If a catch handler exists for the post-pipeline try block, the new block must NOT be inside the catch — we only finalize on post-pipeline success.

- [ ] **Step 4.4: Type check**

```bash
npm run build:check
```

Expected: zero errors. If `log` isn't the correct function name (autopilot may use `_log`, `logInfo`, or similar), grep for the logger function at the top of the file and use whatever is actually used in the surrounding block.

- [ ] **Step 4.5: Lint**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 4.6: Commit**

```bash
git add lib/autopilot.ts
git commit -m "feat(autopilot): auto-finalize phases after successful post-pipeline

Adds a phase-finalize step immediately after the post-pipeline success
marker. Calls completePhaseAfterPostPipeline (introduced in Task 1) and
writes phase-finalize: started/completed/failed status markers based on
the outcome. A finalize failure is logged and the user is advised to
run 'gd phase complete N' manually; autopilot continues to the next
phase.

This is the core Spec 3 user-observable change: autopilot is now
genuinely autonomous — it no longer stops short of ROADMAP/STATE
finalization.

Part of spec 3/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 5: Integration test for autopilot → phase-finalize wire-up

**Files:**
- Create: `tests/integration/phase-finalize.test.ts`

Two tests: (1) happy path where autopilot calls phase-finalize and the ROADMAP checkbox gets ticked, and (2) failure-recovery path where phase-finalize fails but autopilot continues.

- [ ] **Step 5.1: Check if an existing autopilot integration test fixture is reusable**

```bash
ls tests/integration/ | grep -i "autopilot\|phase"
```

Expected: shows `autopilot.test.ts` and possibly other integration files. If `autopilot.test.ts` has a reusable project-fixture helper (look for functions like `createTestProject`, `setupAutopilotFixture`, `makeMockProject`), plan to reuse it. Otherwise you'll create a minimal fixture inline.

Also check:

```bash
grep -n "writeStatusMarker\|_isAllPhasesComplete" tests/integration/*.test.ts 2>&1 | head -10
```

- [ ] **Step 5.2: Write the integration test file**

Create `tests/integration/phase-finalize.test.ts`:

```typescript
'use strict';

/**
 * Integration test for Spec 3's autopilot to phase-finalize wire-up.
 *
 * Verifies that a successful post-pipeline step triggers phase-finalize
 * and that a phase-finalize failure does not crash the autopilot run.
 *
 * Uses a temporary project directory with a minimal ROADMAP.md and
 * STATE.md to drive _phaseCompleteCore without mocking.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const {
  completePhaseAfterPostPipeline,
} = require('../../lib/phase-complete') as {
  completePhaseAfterPostPipeline: (
    cwd: string,
    phaseNum: string,
  ) => unknown;
};

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-phase-finalize-'));
  const planning = path.join(dir, '.planning');
  fs.mkdirSync(planning);
  fs.mkdirSync(path.join(planning, 'phases'));
  fs.mkdirSync(path.join(planning, 'phases', '03-test-phase'));
  fs.mkdirSync(path.join(planning, 'phases', '03-test-phase', 'plans'));
  fs.mkdirSync(path.join(planning, 'phases', '03-test-phase', 'summaries'));
  fs.mkdirSync(path.join(planning, 'phases', '04-next-phase'));
  fs.writeFileSync(
    path.join(planning, 'phases', '03-test-phase', 'plans', '01-plan.md'),
    '# Plan 1\n',
  );
  fs.writeFileSync(
    path.join(planning, 'phases', '03-test-phase', 'summaries', '01-summary.md'),
    '# Summary 1\n',
  );

  // Minimal ROADMAP.md with a Phase 3 entry
  fs.writeFileSync(
    path.join(planning, 'ROADMAP.md'),
    [
      '# Roadmap',
      '',
      '## Phases',
      '',
      '- [ ] Phase 3: Test Phase',
      '- [ ] Phase 4: Next Phase',
      '',
      '## Progress',
      '',
      '| Phase | Plans | Status | Completed |',
      '|-------|-------|--------|-----------|',
      '| 3 | 1/1 | In Progress |  |',
      '| 4 | 0/0 | Pending |  |',
      '',
      '## Phase 3',
      '',
      '**Plans:** 1/1 plans complete',
      '',
    ].join('\n'),
  );

  // Minimal STATE.md
  fs.writeFileSync(
    path.join(planning, 'STATE.md'),
    [
      '# State',
      '',
      '**Current Phase:** 3',
      '**Current Phase Name:** Test Phase',
      '**Status:** Executing',
      '**Current Plan:** 01-plan',
      '**Last Activity:** 2026-04-10',
      '**Last Activity Description:** Running phase 3',
      '',
    ].join('\n'),
  );

  // Minimal config.json
  fs.writeFileSync(
    path.join(planning, 'config.json'),
    JSON.stringify({ cleanup_threshold: 100 }),
  );

  return dir;
}

function cleanupTempProject(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('autopilot to phase-finalize wire-up (integration)', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTempProject();
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  it('completePhaseAfterPostPipeline ticks the ROADMAP.md checkbox on success', () => {
    const result = completePhaseAfterPostPipeline(projectDir, '3');
    expect(result).not.toBeNull();

    const roadmap = fs.readFileSync(
      path.join(projectDir, '.planning', 'ROADMAP.md'),
      'utf-8',
    );
    expect(roadmap).toMatch(/- \[x\] Phase 3: Test Phase/);

    const state = fs.readFileSync(
      path.join(projectDir, '.planning', 'STATE.md'),
      'utf-8',
    );
    expect(state).toMatch(/\*\*Current Phase:\*\*\s+4/);
    expect(state).toMatch(/\*\*Last Activity Description:\*\*\s+Phase 3 complete/);
  });

  it('completePhaseAfterPostPipeline returns null and does not throw when ROADMAP.md is missing', () => {
    // Remove ROADMAP.md to simulate a corrupt project state
    fs.unlinkSync(path.join(projectDir, '.planning', 'ROADMAP.md'));

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const result = completePhaseAfterPostPipeline(projectDir, '3');
      // _phaseCompleteCore silently skips ROADMAP.md when missing, so this
      // may actually succeed. The key test is that it does NOT throw.
      expect(() => result).not.toThrow();
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
```

**Note on the second test:** `_phaseCompleteCore` checks `if (fs.existsSync(roadmapPath))` before mutating, so a missing ROADMAP.md will not throw — it will silently skip the update. The test documents this behavior. To actually trigger a throw path, you'd need to make the file unreadable or corrupt the phase info. The second test is documentary — it just confirms "no throw." If you want a real throw test, delete `.planning/phases/03-test-phase/` to make `findPhaseInternal` return null, which throws `Phase 3 not found`.

**Improved second test** (if you want a real throw case):

```typescript
  it('completePhaseAfterPostPipeline returns null and does not throw when the phase directory is missing', () => {
    fs.rmSync(path.join(projectDir, '.planning', 'phases', '03-test-phase'), {
      recursive: true,
      force: true,
    });

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const result = completePhaseAfterPostPipeline(projectDir, '3');
      expect(result).toBeNull();
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('phase-finalize'),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });
```

Use whichever version of the second test exercises the error path more cleanly. The improved version is preferred.

- [ ] **Step 5.3: Run the integration test**

```bash
npx jest tests/integration/phase-finalize.test.ts 2>&1 | tail -20
```

Expected: 2/2 tests pass.

**Troubleshooting:**
- The gate check `runPreflightGates(cwd, 'phase-complete', { phase: '3' })` runs the `phase-in-roadmap` gate. That gate reads ROADMAP.md and looks for a `Phase 3` entry. Our fixture has one. If the gate fails, inspect the fixture's ROADMAP.md format against what `phase-in-roadmap` expects (see `lib/gates.ts` around the check function).
- If `runQualityAnalysis` fails because the fixture project has no source files, that's fine — the function is non-blocking. The test should still pass.
- If `findPhaseInternal` doesn't find the phase, check the expected directory name format. GRD typically uses `NN-slug` (e.g., `03-test-phase`).

- [ ] **Step 5.4: Run lint and build:check**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 5.5: Commit**

```bash
git add tests/integration/phase-finalize.test.ts
git commit -m "test(phase-finalize): add integration test for Spec 3 wire-up

Two tests using a real temporary project fixture:
1. completePhaseAfterPostPipeline ticks the ROADMAP checkbox and
   advances STATE.md on success
2. completePhaseAfterPostPipeline returns null (does not throw) when
   the phase directory is missing

Part of spec 3/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 6: Add per-file coverage threshold for lib/phase-complete.ts

**Files:**
- Modify: `jest.config.js`

- [ ] **Step 6.1: Add the threshold entry**

Open `jest.config.js`. Find the `coverageThreshold` section. Add an entry for `lib/phase-complete.ts`:

```javascript
'./lib/phase-complete.ts': { lines: 85, functions: 100, branches: 75 },
```

Rationale for 85/100/75:
- `_phaseCompleteCore` has many defensive branches (file-exists checks, dry-run, gate-failed) that are hard to cover exhaustively. 85% lines is realistic.
- `completePhaseAfterPostPipeline` has 3 distinct branches (success, gate-failed, throw) and all are covered by the 6 unit tests. 100% functions is achievable.
- 75% branches leaves headroom for defensive branches inside `_phaseCompleteCore` that weren't specifically tested by the new tests (they're tested by the existing `tests/unit/phase.test.ts`).

If actual coverage comes in higher, bump the threshold up in this same task. Do NOT leave it loose.

- [ ] **Step 6.2: Run coverage to verify the threshold is met**

```bash
npx jest tests/unit/phase-complete.test.ts tests/unit/phase.test.ts tests/integration/phase-finalize.test.ts --coverage --collectCoverageFrom='lib/phase-complete.ts' 2>&1 | tail -15
```

Expected: coverage for `lib/phase-complete.ts` meets the thresholds. If it doesn't, either:
- Add a test to cover the missed branch
- Lower the threshold to match actual coverage (but flag it in the commit message)

- [ ] **Step 6.3: Commit**

```bash
git add jest.config.js
git commit -m "test(phase-complete): add coverage threshold for lib/phase-complete.ts

Per-file threshold: 85% lines, 100% functions, 75% branches. Tested
via the new tests/unit/phase-complete.test.ts, existing
tests/unit/phase.test.ts (which exercises _phaseCompleteCore via
cmdPhaseComplete), and tests/integration/phase-finalize.test.ts.

Part of spec 3/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 7: Update docs/CHANGELOG.md

**Files:**
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 7.1: Find the Unreleased section**

```bash
grep -n "## \[Unreleased\]\|## Unreleased" docs/CHANGELOG.md | head -5
```

Expected: shows the Unreleased header with the Spec 2A entries already present.

- [ ] **Step 7.2: Add the Spec 3 entries**

Open `docs/CHANGELOG.md`. Under the existing `## [Unreleased]` section, add entries under `### Added`, `### Changed`, and `### Fixed`. Preserve all existing entries.

New entries:

```markdown
### Added
- **`lib/phase-complete.ts`** — new module containing the extracted
  `_phaseCompleteCore` (moved verbatim from `lib/phase.ts`) and a new
  autopilot-safe `completePhaseAfterPostPipeline` wrapper. The wrapper
  catches all errors and returns `null` on failure instead of throwing,
  so autopilot cannot crash on a phase-finalize failure.
- **Autopilot phase-finalize status marker step** — new
  `phase-finalize: started/completed/failed` marker written after the
  post-pipeline step. Third phase of spec 3/4 of the
  `gsd-2-selective-adoption` milestone.

### Changed
- **`gd autopilot` now auto-finalizes phases.** After a successful
  post-pipeline step, autopilot calls `completePhaseAfterPostPipeline`
  to tick the ROADMAP.md checkbox, update STATE.md's current phase,
  run quality analysis, and generate a cleanup plan if issues exceed
  threshold. Previously, autopilot stopped at the post-pipeline step
  and required the user to run `gd phase complete N` manually for
  every phase. The CLI command `gd phase complete` is unchanged and
  continues to work as a manual recovery path.

### Fixed
- **Autopilot's next-milestone transition no longer stalls.** Because
  autopilot now finalizes phases automatically, `_isAllPhasesComplete`
  (which checks `disk_status === 'complete'`) reports completion
  correctly at the end of a milestone, unblocking the
  next-milestone transition.
```

**Note:** If `### Changed` and `### Fixed` subsections already exist under Unreleased, merge the new entries into them. Do not duplicate the headers.

- [ ] **Step 7.3: Scan the docs for prompt injection markers**

```bash
node bin/gd.js scan --file docs/CHANGELOG.md
```

Expected: exit 0, no hits.

- [ ] **Step 7.4: Commit**

```bash
git add docs/CHANGELOG.md
git commit -m "docs: add Spec 3 changelog entries

- New lib/phase-complete.ts module
- New phase-finalize status marker in autopilot
- Behavior change: gd autopilot now auto-finalizes phases
- Fix: next-milestone transition no longer stalls

Part of spec 3/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 8.1: Run the full test suite**

```bash
npm test 2>&1 | tail -15
```

Expected: all tests pass. Spec 2A landed with ~8,250 tests; this spec adds approximately:
- 6 tests (phase-complete.test.ts)
- 2 tests (phase-finalize.test.ts)
= ~8 new tests, for an expected total around 8,258.

Exact totals depend on pre-existing fluctuation; what matters is that no pre-existing tests regressed.

If any test fails, diagnose. If the failure is in `tests/unit/phase.test.ts`, the most likely cause is a missed helper export when switching to the new module (Task 2).

- [ ] **Step 8.2: Run lint**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 8.3: Run type check**

```bash
npm run build:check
```

Expected: zero errors.

- [ ] **Step 8.4: Run format check**

```bash
npm run format:check
```

If format-check fails on the files this plan modified, run prettier ONLY on those files:

```bash
npx prettier --write lib/phase.ts lib/phase-complete.ts lib/autopilot.ts tests/unit/phase-complete.test.ts tests/integration/phase-finalize.test.ts jest.config.js docs/CHANGELOG.md
git add -u
git commit -m "chore: apply prettier formatting to spec 3 files"
```

**CRITICAL: Do NOT run `npm run format` without specific paths.** Format ONLY the files this plan modified.

- [ ] **Step 8.5: Run scanner sanity check**

```bash
node bin/gd.js scan --all 2>&1 | tail -5
```

Expected: `scan: clean — <N> file(s) checked (<M> ignored hit(s))`.

- [ ] **Step 8.6: Smoke-test `completePhaseAfterPostPipeline` via Node REPL**

Create a tiny temp project and invoke the wrapper to confirm end-to-end behavior:

```bash
node -e '
const fs = require("fs");
const os = require("os");
const path = require("path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grd-smoke-"));
const planning = path.join(dir, ".planning");
fs.mkdirSync(planning);
fs.mkdirSync(path.join(planning, "phases"));
fs.mkdirSync(path.join(planning, "phases", "03-smoke"));
fs.mkdirSync(path.join(planning, "phases", "03-smoke", "plans"));
fs.mkdirSync(path.join(planning, "phases", "03-smoke", "summaries"));
fs.writeFileSync(path.join(planning, "phases", "03-smoke", "plans", "01.md"), "# plan\n");
fs.writeFileSync(path.join(planning, "phases", "03-smoke", "summaries", "01.md"), "# summary\n");
fs.writeFileSync(path.join(planning, "ROADMAP.md"),
  "# Roadmap\n\n## Phases\n\n- [ ] Phase 3: Smoke\n\n| Phase | Plans | Status | Completed |\n|---|---|---|---|\n| 3 | 1/1 | In Progress |  |\n\n## Phase 3\n\n**Plans:** 1/1 plans complete\n"
);
fs.writeFileSync(path.join(planning, "STATE.md"),
  "# State\n\n**Current Phase:** 3\n**Current Phase Name:** Smoke\n**Status:** Executing\n**Current Plan:** 01\n**Last Activity:** today\n**Last Activity Description:** test\n"
);
fs.writeFileSync(path.join(planning, "config.json"), JSON.stringify({ cleanup_threshold: 100 }));
const { completePhaseAfterPostPipeline } = require("./lib/phase-complete");
const result = completePhaseAfterPostPipeline(dir, "3");
console.log("result:", result ? "success" : "null");
console.log("roadmap tick:", /- \[x\] Phase 3/.test(fs.readFileSync(path.join(planning, "ROADMAP.md"), "utf-8")));
fs.rmSync(dir, { recursive: true, force: true });
'
```

Expected: `result: success` and `roadmap tick: true`.

If the smoke test hangs, it's because `runQualityAnalysis` is trying to run ESLint on an empty project and timing out. Adjust the fixture to set `cleanup_threshold` very high so the cleanup plan doesn't run, or skip this smoke test entirely.

- [ ] **Step 8.7: Verify the commit chain**

```bash
git log --oneline main..HEAD
```

Expected: roughly 7–9 commits, one per task plus any format/fix commits.

- [ ] **Step 8.8: Final checklist**

Confirm all of the following:

- [ ] `lib/phase-complete.ts` exists with `_phaseCompleteCore` and `completePhaseAfterPostPipeline`
- [ ] `lib/phase.ts` no longer defines `_phaseCompleteCore` inline; it imports from `./phase-complete`
- [ ] `cmdPhaseComplete` and `cmdPhaseBatchComplete` in `lib/phase.ts` still work (verified by existing `tests/unit/phase.test.ts`)
- [ ] `lib/autopilot.ts` imports `completePhaseAfterPostPipeline` and calls it after the post-pipeline success marker
- [ ] A new `phase-finalize` status marker is written (`started`, `completed`, or `failed`)
- [ ] `tests/unit/phase-complete.test.ts` — 6 tests passing
- [ ] `tests/integration/phase-finalize.test.ts` — 2 tests passing
- [ ] `jest.config.js` per-file threshold for `lib/phase-complete.ts`
- [ ] `docs/CHANGELOG.md` Unreleased entry added
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run build:check` passes
- [ ] `npm run format:check` passes (or format applied to spec 3 files only)
- [ ] `gd scan --all` exits 0

---

## Out of scope (follow-up items)

These were explicitly deferred during brainstorming and must NOT be added to this plan:

- **Spec 3B: LLM fallback for mechanical completion.** Only pursue if users report mechanical completion failing in practice.
- **Further decomposition of `lib/phase.ts`.** Splitting phase lifecycle commands (add/insert/remove) into separate modules is a larger refactor worth its own spec.
- **`lib/autopilot.ts` 2,534-line monolith split.** Out of scope.
- **New "aggregation" abstraction layer.** The original spec's "post-gate aggregation" phrase does not map to any concrete need.
- **Gate registry extensions for `phase-complete`.** No new gates.
- **Retry logic for failed completions.** The user can still run `gd phase complete N` manually as a recovery path.
- **Changes to `cmdPhaseComplete`'s error handling.** The CLI wrapper continues to call `error(...)` on failure.
