# LLM Fallback for Mechanical Completion (Spec 3B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in LLM fallback for `completePhaseAfterPostPipeline` and `cmdPhaseComplete` so that when mechanical regex-based phase completion fails, Claude is asked to perform the ROADMAP.md/STATE.md edits directly via the scheduler.

**Architecture:** One new module `lib/phase-complete-llm.ts` exporting `attemptLlmFallbackCompletion(cwd, phaseNum, scheduler, failure): Promise<PhaseCompleteResult | null>`. It reads ROADMAP.md + STATE.md, builds a structured prompt, invokes `scheduler.spawn`, and verifies success by re-reading ROADMAP.md and checking for `- [x] Phase N`. Gated by new `GrdConfig.phase_complete_llm_fallback` flag (default false, opt-in). Both `completePhaseAfterPostPipeline` (in `lib/phase-complete.ts`) and `cmdPhaseComplete` (in `lib/phase.ts`) become async and call the fallback on mechanical failure when the flag is set.

**Tech Stack:** TypeScript (strict), CommonJS, tsx at entry points, jest with ts-jest, Node 20. GRD conventions throughout.

**Spec reference:** `docs/superpowers/specs/2026-04-12-gsd2-mechanical-completion-llm-fallback-design.md` (commit `27944d5`)

**Worktree note:** Create a worktree before starting:

```bash
git worktree add .worktrees/gsd2-llm-fallback -b feat/gsd2-llm-fallback
cd .worktrees/gsd2-llm-fallback
```

**Security invariant:** The LLM prompt is constructed in-module via template literals — no shell interpolation. The scheduler.spawn call uses the standard opt args. The verification re-reads ROADMAP.md with standard `fs.readFileSync` — no shell.

---

## File Structure

**New files:**

```
lib/phase-complete-llm.ts                           # attemptLlmFallbackCompletion + helpers
tests/unit/phase-complete-llm.test.ts               # 8 unit tests
tests/integration/phase-complete-llm-flow.test.ts   # 3 integration tests
```

**Modified files:**

```
lib/types.ts                    # +GrdConfig.phase_complete_llm_fallback, +PhaseCompleteResult.llm_fallback
lib/phase-complete.ts           # completePhaseAfterPostPipeline becomes async, calls fallback
lib/autopilot.ts                # await completePhaseAfterPostPipeline call
lib/phase.ts                    # cmdPhaseComplete becomes async, calls fallback
bin/grd-tools.ts                # await cmdPhaseComplete, add settings case
lib/cli/index.ts                # route new setting
CLAUDE.md                       # short section
docs/CHANGELOG.md               # Unreleased entry
```

**Module boundaries:**

- `lib/phase-complete-llm.ts` — one responsibility: attempt LLM recovery given a cwd, phase number, scheduler, and failure context. No circular deps. ~180 lines.
- `lib/phase-complete.ts` — one new call site in `completePhaseAfterPostPipeline`, signature becomes async.
- `lib/phase.ts` — one new call site in `cmdPhaseComplete`, signature becomes async.
- Everything else is type-only or routing glue.

---

## Task 1: Type additions

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1.1: Locate GrdConfig and PhaseCompleteResult**

```bash
grep -n "interface GrdConfig\|interface PhaseCompleteResult" lib/types.ts
```

- [ ] **Step 1.2: Add phase_complete_llm_fallback to GrdConfig**

Near existing boolean config flags (e.g., `commit_docs`), add:

```typescript
  /**
   * When true, autopilot and `gd phase complete` invoke an LLM fallback
   * if the mechanical phase-completion regex-based path fails. The
   * fallback spawns Claude via the scheduler, gives it the current
   * ROADMAP.md + STATE.md contents, and asks it to perform the edits.
   *
   * Default: false. Opt-in. When disabled, mechanical failures return
   * null and log a hint advising manual recovery.
   *
   * Spec 3B of the gsd-2-selective-adoption milestone.
   */
  phase_complete_llm_fallback?: boolean;
```

- [ ] **Step 1.3: Add llm_fallback flag to PhaseCompleteResult**

In `PhaseCompleteResult`, add:

```typescript
  /**
   * True if this result was produced by the LLM fallback path (Spec 3B),
   * not the mechanical regex path. Callers may want to log differently
   * or skip certain downstream operations.
   */
  llm_fallback?: boolean;
```

- [ ] **Step 1.4: Type check and commit**

```bash
npm run build:check
git add lib/types.ts
git commit -m "feat(types): add phase_complete_llm_fallback config + result flag

Part of spec 3B follow-up of the gsd-2-selective-adoption milestone."
```

---

## Task 2: Create lib/phase-complete-llm.ts

**Files:**
- Create: `lib/phase-complete-llm.ts`
- Create: `tests/unit/phase-complete-llm.test.ts`

TDD: test first, then implementation.

- [ ] **Step 2.1: Write the failing test file**

Create `tests/unit/phase-complete-llm.test.ts`:

```typescript
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Scheduler, SchedulerSpawnResult, SpawnOpts } from '../../lib/types';

const { attemptLlmFallbackCompletion } = require('../../lib/phase-complete-llm') as {
  attemptLlmFallbackCompletion: (
    cwd: string,
    phaseNum: string,
    scheduler: Scheduler | null,
    failure: Error | { gate_errors?: { message: string }[] },
  ) => Promise<unknown>;
};

function makeFakeScheduler(
  behavior: 'success' | 'nonzero' | 'throw',
  tickRoadmapCallback?: () => void,
): Scheduler {
  const spawn = jest.fn(
    async (_prompt: string, opts: SpawnOpts): Promise<SchedulerSpawnResult> => {
      if (behavior === 'throw') throw new Error('scheduler exploded');
      if (behavior === 'nonzero') {
        return {
          exitCode: 1,
          timedOut: false,
          backend: 'claude',
          tokensUsed: 0,
          workItemId: 'fake',
        };
      }
      // success: invoke the callback to mutate the ROADMAP.md file
      if (tickRoadmapCallback) tickRoadmapCallback();
      return {
        exitCode: 0,
        timedOut: false,
        backend: 'claude',
        tokensUsed: 1000,
        workItemId: 'fake',
      };
    },
  );
  return {
    spawn,
    getState: jest.fn(() => undefined),
    getStates: jest.fn(() => new Map()),
    recordExternalSample: jest.fn(),
    persistState: jest.fn(),
    loadPersistedState: jest.fn(),
  } as unknown as Scheduler;
}

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-phase-llm-'));
  const planning = path.join(dir, '.planning');
  fs.mkdirSync(planning);
  fs.writeFileSync(
    path.join(planning, 'ROADMAP.md'),
    '# Roadmap\n\n- [ ] Phase 3: Test\n- [ ] Phase 4: Next\n',
  );
  fs.writeFileSync(
    path.join(planning, 'STATE.md'),
    '# State\n\n**Current Phase:** 3\n',
  );
  fs.writeFileSync(
    path.join(planning, 'config.json'),
    JSON.stringify({ phase_cleanup: { cleanup_threshold: 99999 } }),
  );
  return dir;
}

function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe('attemptLlmFallbackCompletion', () => {
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('returns null when scheduler is null', async () => {
    const dir = makeTempProject();
    try {
      const result = await attemptLlmFallbackCompletion(
        dir,
        '3',
        null,
        new Error('mechanical failed'),
      );
      expect(result).toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  it('invokes scheduler.spawn with a prompt containing the phase number', async () => {
    const dir = makeTempProject();
    try {
      const scheduler = makeFakeScheduler('nonzero');
      await attemptLlmFallbackCompletion(dir, '3', scheduler, new Error('test'));
      expect((scheduler.spawn as jest.Mock)).toHaveBeenCalled();
      const prompt = (scheduler.spawn as jest.Mock).mock.calls[0][0];
      expect(prompt).toContain('Phase 3');
      expect(prompt).toContain('ROADMAP.md');
      expect(prompt).toContain('STATE.md');
    } finally {
      cleanup(dir);
    }
  });

  it('returns null when scheduler.spawn throws', async () => {
    const dir = makeTempProject();
    try {
      const scheduler = makeFakeScheduler('throw');
      const result = await attemptLlmFallbackCompletion(
        dir,
        '3',
        scheduler,
        new Error('mechanical'),
      );
      expect(result).toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  it('returns null when exit code is nonzero', async () => {
    const dir = makeTempProject();
    try {
      const scheduler = makeFakeScheduler('nonzero');
      const result = await attemptLlmFallbackCompletion(
        dir,
        '3',
        scheduler,
        new Error('mechanical'),
      );
      expect(result).toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  it('returns null when verification fails (checkbox not ticked)', async () => {
    const dir = makeTempProject();
    try {
      // scheduler succeeds but does NOT modify the ROADMAP file
      const scheduler = makeFakeScheduler('success');
      const result = await attemptLlmFallbackCompletion(
        dir,
        '3',
        scheduler,
        new Error('mechanical'),
      );
      expect(result).toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  it('returns synthetic result when verification succeeds (checkbox ticked)', async () => {
    const dir = makeTempProject();
    try {
      const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
      // scheduler "succeeds" AND modifies the file to tick the checkbox
      const scheduler = makeFakeScheduler('success', () => {
        const content = fs.readFileSync(roadmapPath, 'utf-8');
        fs.writeFileSync(
          roadmapPath,
          content.replace('- [ ] Phase 3: Test', '- [x] Phase 3: Test (completed today)'),
        );
      });
      const result = await attemptLlmFallbackCompletion(
        dir,
        '3',
        scheduler,
        new Error('mechanical'),
      );
      expect(result).not.toBeNull();
      expect((result as { llm_fallback?: boolean }).llm_fallback).toBe(true);
    } finally {
      cleanup(dir);
    }
  });

  it('prompt includes the failure description', async () => {
    const dir = makeTempProject();
    try {
      const scheduler = makeFakeScheduler('nonzero');
      await attemptLlmFallbackCompletion(
        dir,
        '3',
        scheduler,
        new Error('something very specific to match'),
      );
      const prompt = (scheduler.spawn as jest.Mock).mock.calls[0][0];
      expect(prompt).toContain('something very specific to match');
    } finally {
      cleanup(dir);
    }
  });

  it('handles gate_errors shape as failure input', async () => {
    const dir = makeTempProject();
    try {
      const scheduler = makeFakeScheduler('nonzero');
      await attemptLlmFallbackCompletion(
        dir,
        '3',
        scheduler,
        { gate_errors: [{ message: 'phase-in-roadmap gate tripped' }] } as any,
      );
      const prompt = (scheduler.spawn as jest.Mock).mock.calls[0][0];
      expect(prompt).toContain('phase-in-roadmap gate tripped');
    } finally {
      cleanup(dir);
    }
  });
});
```

- [ ] **Step 2.2: Run the failing test**

```bash
npx jest tests/unit/phase-complete-llm.test.ts 2>&1 | tail -10
```

Expected: fails with `Cannot find module '../../lib/phase-complete-llm'`.

- [ ] **Step 2.3: Create lib/phase-complete-llm.ts**

Create the file with the exact content from the spec's "The fallback function" section (commit `27944d5`, `docs/superpowers/specs/2026-04-12-gsd2-mechanical-completion-llm-fallback-design.md`). Full content:

```typescript
'use strict';

/**
 * GRD Phase/Complete/LLM -- Opt-in LLM fallback for mechanical phase
 * completion failures.
 *
 * When _phaseCompleteCore throws or returns gate_failed, and the user
 * has opted in via config.phase_complete_llm_fallback = true, this
 * module asks Claude (via the scheduler) to perform the phase finalize
 * by editing ROADMAP.md and STATE.md directly.
 *
 * Verification is shallow: after the subprocess exits, we re-read
 * ROADMAP.md and check for `- [x] Phase N`. If ticked, the fallback
 * is considered successful. Otherwise returns null.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  GateViolation,
  PhaseCompleteResult,
  Scheduler,
} from './types';

const FALLBACK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max
const PROMPT_MAX_CONTEXT_BYTES = 100_000;   // 100KB ceiling

function _readFileTruncated(filePath: string, maxBytes: number): string | null {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length > maxBytes) {
      return buf.subarray(0, maxBytes).toString('utf-8') +
        `\n\n[... truncated, original ${buf.length} bytes]\n`;
    }
    return buf.toString('utf-8');
  } catch {
    return null;
  }
}

function _listPhaseDirContents(phaseDir: string): string[] {
  try {
    return fs.readdirSync(phaseDir).sort();
  } catch {
    return [];
  }
}

function _describeFailure(
  failure: Error | { gate_errors?: GateViolation[] },
): string {
  if (failure instanceof Error) return `Exception: ${failure.message}`;
  if ('gate_errors' in failure && failure.gate_errors) {
    return `Gate failures: ${failure.gate_errors.map((g) => g.message).join('; ')}`;
  }
  return 'Unknown mechanical failure';
}

function _buildPrompt(
  phaseNum: string,
  roadmapContent: string | null,
  stateContent: string | null,
  phaseDirFiles: string[],
  failureDescription: string,
): string {
  return [
    `You are finalizing GRD Phase ${phaseNum} after the mechanical regex-based`,
    `completion failed. Your job is to update .planning/ROADMAP.md and`,
    `.planning/STATE.md directly using your file-editing tools.`,
    '',
    `Failure reason: ${failureDescription}`,
    '',
    `Phase directory contents:`,
    phaseDirFiles.length > 0 ? phaseDirFiles.map((f) => `  - ${f}`).join('\n') : '  (empty or missing)',
    '',
    `## Current .planning/ROADMAP.md`,
    '',
    '```markdown',
    roadmapContent || '[MISSING]',
    '```',
    '',
    `## Current .planning/STATE.md`,
    '',
    '```markdown',
    stateContent || '[MISSING]',
    '```',
    '',
    `## Your task`,
    '',
    `1. Update ROADMAP.md so that the Phase ${phaseNum} entry is marked as`,
    `   completed. The exact format varies by project, but the canonical`,
    `   pattern is to change \`- [ ] Phase ${phaseNum}: ...\` into`,
    `   \`- [x] Phase ${phaseNum}: ... (completed ${new Date().toISOString().split('T')[0]})\`.`,
    `   If the roadmap has a progress table or status column, update that`,
    `   row to indicate Complete with today's date.`,
    '',
    `2. Update STATE.md so that Current Phase advances past ${phaseNum}`,
    `   if there is a next phase, or to "Milestone complete" if ${phaseNum}`,
    `   was the last phase. Update Last Activity to today's date and`,
    `   Last Activity Description to reflect the completion.`,
    '',
    `3. Do NOT modify any other files.`,
    '',
    `4. Do NOT run any subcommands beyond file editing (no git, no npm,`,
    `   no grd commands). Just edit the two files.`,
    '',
    `Start now. Use your file-editing tools.`,
  ].join('\n');
}

function _verifyRoadmapTick(cwd: string, phaseNum: string): boolean {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  try {
    const content = fs.readFileSync(roadmapPath, 'utf-8');
    const pattern = new RegExp(
      `-\\s*\\[x\\]\\s*Phase\\s+${phaseNum.replace('.', '\\.')}[\\s:]`,
      'i',
    );
    return pattern.test(content);
  } catch {
    return false;
  }
}

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

/**
 * Attempts to recover from a mechanical phase-completion failure by
 * asking Claude to perform the ROADMAP.md and STATE.md edits directly.
 * Returns a synthetic PhaseCompleteResult on success, null on any
 * failure or when the scheduler is null.
 */
export async function attemptLlmFallbackCompletion(
  cwd: string,
  phaseNum: string,
  scheduler: Scheduler | null,
  failure: Error | { gate_errors?: GateViolation[] },
): Promise<PhaseCompleteResult | null> {
  if (!scheduler) return null;

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const roadmap = _readFileTruncated(roadmapPath, PROMPT_MAX_CONTEXT_BYTES);
  const state = _readFileTruncated(statePath, PROMPT_MAX_CONTEXT_BYTES);

  let phaseDirFiles: string[] = [];
  try {
    const { phasesDir } = require('./paths') as {
      phasesDir: (cwd: string) => string;
    };
    const basePhasesDir = phasesDir(cwd);
    const entries = fs.readdirSync(basePhasesDir);
    const match = entries.find((e) => e.startsWith(`${phaseNum}-`));
    if (match) {
      phaseDirFiles = _listPhaseDirContents(path.join(basePhasesDir, match));
    }
  } catch {
    // ignore
  }

  const failureDescription = _describeFailure(failure);
  const prompt = _buildPrompt(
    phaseNum,
    roadmap,
    state,
    phaseDirFiles,
    failureDescription,
  );

  process.stderr.write(
    `[phase-complete-llm] attempting LLM fallback for phase ${phaseNum} ` +
      `(reason: ${failureDescription.slice(0, 200)})\n`,
  );

  try {
    const result = await scheduler.spawn(prompt, {
      cwd,
      timeout: FALLBACK_TIMEOUT_MS,
      captureOutput: false,
    });
    if (result.exitCode !== 0) {
      process.stderr.write(
        `[phase-complete-llm] fallback subprocess exited with code ${result.exitCode}\n`,
      );
      return null;
    }
  } catch (e) {
    process.stderr.write(
      `[phase-complete-llm] fallback subprocess threw: ${(e as Error).message}\n`,
    );
    return null;
  }

  if (!_verifyRoadmapTick(cwd, phaseNum)) {
    process.stderr.write(
      `[phase-complete-llm] verification failed — ROADMAP.md checkbox not ticked\n`,
    );
    return null;
  }

  process.stderr.write(
    `[phase-complete-llm] fallback succeeded for phase ${phaseNum}\n`,
  );
  return _buildSyntheticResult(phaseNum);
}

module.exports = {
  attemptLlmFallbackCompletion,
};
```

- [ ] **Step 2.4: Run the test**

```bash
npx jest tests/unit/phase-complete-llm.test.ts 2>&1 | tail -15
```

Expected: 8/8 tests pass.

**Troubleshooting:**
- If `Scheduler` type isn't found, ensure it's exported from `./types` (it is — it's in the Scheduler interface added in Spec 2A).
- If `GateViolation` isn't found, check `./types`.

- [ ] **Step 2.5: Lint, build, commit**

```bash
npm run lint && npm run build:check
git add lib/phase-complete-llm.ts tests/unit/phase-complete-llm.test.ts
git commit -m "feat(phase-complete-llm): add attemptLlmFallbackCompletion

New module lib/phase-complete-llm.ts exporting one async function
that, given a cwd + phase number + scheduler + failure context,
reads ROADMAP.md + STATE.md, builds a structured Claude prompt,
invokes scheduler.spawn, and verifies success by re-reading
ROADMAP.md and checking for the phase checkbox tick.

Returns null on any failure (null scheduler, throw, nonzero exit,
verification failure). Returns synthetic PhaseCompleteResult with
llm_fallback: true on success.

8 unit tests with mocked Scheduler cover: null scheduler, prompt
content, throw, nonzero exit, verification fail, verification
success, failure description passthrough, gate_errors shape.

Part of spec 3B follow-up of the gsd-2-selective-adoption milestone."
```

---

## Task 3: Wire fallback into completePhaseAfterPostPipeline

**Files:**
- Modify: `lib/phase-complete.ts`
- Modify: `lib/autopilot.ts`

Note: `completePhaseAfterPostPipeline` becomes async. Autopilot's caller must `await`.

- [ ] **Step 3.1: Update completePhaseAfterPostPipeline signature and body**

Open `lib/phase-complete.ts`. Find `completePhaseAfterPostPipeline`:

```bash
grep -n "completePhaseAfterPostPipeline" lib/phase-complete.ts
```

Replace its body with:

```typescript
const { attemptLlmFallbackCompletion } = require('./phase-complete-llm') as {
  attemptLlmFallbackCompletion: (
    cwd: string,
    phaseNum: string,
    scheduler: Scheduler | null,
    failure: Error | { gate_errors?: GateViolation[] },
  ) => Promise<PhaseCompleteResult | null>;
};

const { loadConfig } = require('./utils') as {
  loadConfig: (cwd: string) => GrdConfig;
};
```

Add those imports at the top of `lib/phase-complete.ts`. Import types `Scheduler`, `GrdConfig`, `GateViolation` from `./types`.

Then replace `completePhaseAfterPostPipeline`:

```typescript
export async function completePhaseAfterPostPipeline(
  cwd: string,
  phaseNum: string,
  scheduler?: Scheduler | null,
): Promise<PhaseCompleteResult | null> {
  let mechanicalFailure:
    | Error
    | { gate_errors?: GateViolation[] }
    | null = null;

  try {
    const result = _phaseCompleteCore(cwd, phaseNum);
    if (result.gate_failed) {
      mechanicalFailure = { gate_errors: result.gate_errors };
      const msgs = (result.gate_errors || [])
        .map((g: { message: string }) => g.message)
        .join('; ');
      process.stderr.write(
        `[autopilot] phase-finalize: gates failed for phase ${phaseNum}: ${msgs}\n`,
      );
    } else if (result.dry_run) {
      return null;
    } else {
      return result;
    }
  } catch (e) {
    mechanicalFailure = e as Error;
    process.stderr.write(
      `[autopilot] phase-finalize: error completing phase ${phaseNum}: ${(e as Error).message}\n`,
    );
  }

  // Mechanical failed — try LLM fallback if opted in
  if (!mechanicalFailure) return null;

  let fallbackEnabled = false;
  try {
    const config = loadConfig(cwd);
    fallbackEnabled = config.phase_complete_llm_fallback === true;
  } catch {
    // loadConfig failure — proceed without fallback
  }

  if (fallbackEnabled && scheduler) {
    return await attemptLlmFallbackCompletion(
      cwd,
      phaseNum,
      scheduler,
      mechanicalFailure,
    );
  }

  return null;
}
```

Update `module.exports` at the bottom if needed to preserve the export.

- [ ] **Step 3.2: Update autopilot to await the new async signature**

```bash
grep -n "completePhaseAfterPostPipeline" lib/autopilot.ts
```

Find the call site (added in Spec 3). The current call is:

```typescript
const finalizeResult: PhaseCompleteResult | null = completePhaseAfterPostPipeline(cwd, pNum);
```

Change to:

```typescript
const finalizeResult: PhaseCompleteResult | null = await completePhaseAfterPostPipeline(
  cwd,
  pNum,
  scheduler,
);
```

The enclosing autopilot function should already be async. Verify:

```bash
sed -n '1980,2010p' lib/autopilot.ts
```

If it's not async, you'll need to propagate async upward until you hit an existing async context. Most autopilot entry points are async, so this should be a one-line change.

- [ ] **Step 3.3: Type check and run tests**

```bash
npm run build:check && npm run lint && npx jest tests/unit/phase-complete.test.ts tests/integration/phase-finalize.test.ts tests/unit/autopilot.test.ts 2>&1 | tail -20
```

Expected: all tests pass. If `phase-finalize.test.ts` or `phase-complete.test.ts` has tests calling `completePhaseAfterPostPipeline` synchronously, they'll need `await`.

**Troubleshooting:**
- `Cannot find name 'await'` — the enclosing function must be async. Add `async` to the arrow/function.
- Test assertions checking `.toBe(...)` on an un-awaited promise — add `await`.

Update the existing tests if needed. This is the primary friction point of the async conversion.

- [ ] **Step 3.4: Commit**

```bash
git add lib/phase-complete.ts lib/autopilot.ts tests/unit/phase-complete.test.ts tests/integration/phase-finalize.test.ts
git commit -m "feat(phase-complete): wire LLM fallback into completePhaseAfterPostPipeline

completePhaseAfterPostPipeline becomes async and accepts an optional
scheduler parameter. On mechanical failure (thrown or gate_failed),
checks config.phase_complete_llm_fallback and if enabled + scheduler
provided, delegates to attemptLlmFallbackCompletion.

autopilot's post-pipeline call site is updated to await the new
async signature and pass the scheduler.

Existing tests updated to await the promise.

Part of spec 3B follow-up of the gsd-2-selective-adoption milestone."
```

---

## Task 4: Wire fallback into cmdPhaseComplete (manual CLI path)

**Files:**
- Modify: `lib/phase.ts`
- Modify: `bin/grd-tools.ts`

- [ ] **Step 4.1: Find cmdPhaseComplete and make it async**

```bash
grep -n "function cmdPhaseComplete\|async function cmdPhaseComplete" lib/phase.ts
```

Read the body. Change `function cmdPhaseComplete(...)` to `async function cmdPhaseComplete(...)` with `Promise<void>` return type.

In the catch block after the `_phaseCompleteCore(...)` call:

```typescript
} catch (e) {
  const config = loadConfig(cwd);
  if (config.phase_complete_llm_fallback === true) {
    process.stderr.write(
      `[phase-complete-llm] mechanical path failed, attempting fallback\n`,
    );
    const { createScheduler } = require('./scheduler') as {
      createScheduler: (
        config: SchedulerConfig | undefined,
        superpowersConfig?: SuperpowersConfig,
      ) => Scheduler | null;
    };
    const { attemptLlmFallbackCompletion } = require('./phase-complete-llm') as {
      attemptLlmFallbackCompletion: (
        cwd: string,
        phaseNum: string,
        scheduler: Scheduler | null,
        failure: Error,
      ) => Promise<PhaseCompleteResult | null>;
    };
    const scheduler = createScheduler(config.scheduler, undefined);
    const fallbackResult = await attemptLlmFallbackCompletion(
      cwd,
      phaseNum,
      scheduler,
      e as Error,
    );
    if (fallbackResult) {
      result = fallbackResult;
    } else {
      error((e as Error).message);
      return;
    }
  } else {
    error((e as Error).message);
    return;
  }
}
```

The variable `result` must be declared as `let result: PhaseCompleteResult;` before the try block (it probably already is — check).

Add the necessary type imports at the top: `Scheduler`, `SchedulerConfig`, `SuperpowersConfig`.

- [ ] **Step 4.2: Update bin/grd-tools.ts to await cmdPhaseComplete**

```bash
grep -n "cmdPhaseComplete" bin/grd-tools.ts
```

Find the call site. If it's currently `cmdPhaseComplete(cwd, ...)`, change to `await cmdPhaseComplete(cwd, ...)`. Ensure the enclosing function is async.

- [ ] **Step 4.3: Type check and run tests**

```bash
npm run build:check && npm run lint && npx jest tests/unit/phase.test.ts 2>&1 | tail -15
```

Expected: all existing phase tests pass.

- [ ] **Step 4.4: Commit**

```bash
git add lib/phase.ts bin/grd-tools.ts
git commit -m "feat(phase): wire LLM fallback into cmdPhaseComplete

cmdPhaseComplete becomes async. On _phaseCompleteCore failure, if
config.phase_complete_llm_fallback is true, it constructs a scheduler
and delegates to attemptLlmFallbackCompletion. If the fallback
succeeds, the result is used; otherwise the original error is
surfaced.

bin/grd-tools.ts awaits the now-async dispatch.

Part of spec 3B follow-up of the gsd-2-selective-adoption milestone."
```

---

## Task 5: gd settings phase_complete_llm_fallback CLI

**Files:**
- Modify: `bin/grd-tools.ts`
- Modify: `lib/cli/index.ts`

- [ ] **Step 5.1: Add settings case**

In `bin/grd-tools.ts`, find the `gd settings` dispatch (look for `token_profile` case added in Spec 4). Add a similar case:

```typescript
case 'phase_complete_llm_fallback': {
  const parsed = value === 'true' || value === '1';
  const config = loadConfig(cwd);
  config.phase_complete_llm_fallback = parsed;
  saveConfig(cwd, config);
  output(
    { updated: 'phase_complete_llm_fallback', value: parsed },
    raw,
    `phase_complete_llm_fallback: ${parsed}`,
  );
  break;
}
```

- [ ] **Step 5.2: Route the new setting in lib/cli/index.ts**

```bash
grep -n "SETTINGS_TOOL_SUBS\|token_profile" lib/cli/index.ts
```

Find where other settings keys are registered. Add `phase_complete_llm_fallback` to the same set/switch.

- [ ] **Step 5.3: Smoke test**

```bash
cd /tmp && rm -rf grd-smoke-3b && mkdir -p grd-smoke-3b/.planning && cd grd-smoke-3b && echo '{}' > .planning/config.json
node /Users/neo/Developer/Projects/GetResearchDone/.worktrees/gsd2-llm-fallback/bin/gd.js settings phase_complete_llm_fallback true 2>&1 | tail -5
cat .planning/config.json
```

Expected: config.json contains `"phase_complete_llm_fallback": true`.

Cleanup:
```bash
cd /Users/neo/Developer/Projects/GetResearchDone/.worktrees/gsd2-llm-fallback && rm -rf /tmp/grd-smoke-3b
```

- [ ] **Step 5.4: Commit**

```bash
git add bin/grd-tools.ts lib/cli/index.ts
git commit -m "feat(cli): add gd settings phase_complete_llm_fallback

New settings case matching the existing token_profile pattern.
Accepts 'true' or 'false'; persists to .planning/config.json.

Part of spec 3B follow-up of the gsd-2-selective-adoption milestone."
```

---

## Task 6: Integration test for the full flow

**Files:**
- Create: `tests/integration/phase-complete-llm-flow.test.ts`

- [ ] **Step 6.1: Create the integration test**

```typescript
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Scheduler, SchedulerSpawnResult, SpawnOpts } from '../../lib/types';

const { completePhaseAfterPostPipeline } = require('../../lib/phase-complete') as {
  completePhaseAfterPostPipeline: (
    cwd: string,
    phaseNum: string,
    scheduler?: Scheduler | null,
  ) => Promise<unknown>;
};

function makeProject(llmFallbackEnabled: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-llm-flow-'));
  const planning = path.join(dir, '.planning');
  fs.mkdirSync(planning);
  fs.mkdirSync(path.join(planning, 'milestones'));
  fs.mkdirSync(path.join(planning, 'milestones', 'anonymous'));
  fs.mkdirSync(path.join(planning, 'milestones', 'anonymous', 'phases'));
  // NOTE: no phase directory for Phase 3 → _phaseCompleteCore throws
  fs.writeFileSync(
    path.join(planning, 'ROADMAP.md'),
    '# Roadmap\n\n- [ ] Phase 3: Test\n\n## Phase 3: Test\n\n**Plans:** 0/0 plans complete\n',
  );
  fs.writeFileSync(
    path.join(planning, 'STATE.md'),
    '# State\n\n**Current Phase:** 3\n**Current Phase Name:** Test\n**Status:** Executing\n**Current Plan:** 01\n**Last Activity:** 2026-04-12\n**Last Activity Description:** running\n',
  );
  fs.writeFileSync(
    path.join(planning, 'config.json'),
    JSON.stringify({
      phase_cleanup: { cleanup_threshold: 99999 },
      phase_complete_llm_fallback: llmFallbackEnabled,
    }),
  );
  return dir;
}

function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function makeTickingScheduler(): Scheduler {
  return {
    spawn: jest.fn(
      async (_prompt: string, opts: SpawnOpts): Promise<SchedulerSpawnResult> => {
        const roadmapPath = path.join(opts.cwd || '', '.planning', 'ROADMAP.md');
        try {
          const content = fs.readFileSync(roadmapPath, 'utf-8');
          fs.writeFileSync(
            roadmapPath,
            content.replace('- [ ] Phase 3: Test', '- [x] Phase 3: Test (completed)'),
          );
        } catch {}
        return {
          exitCode: 0,
          timedOut: false,
          backend: 'claude',
          tokensUsed: 500,
          workItemId: 'fake',
        };
      },
    ),
    getState: jest.fn(() => undefined),
    getStates: jest.fn(() => new Map()),
    recordExternalSample: jest.fn(),
    persistState: jest.fn(),
    loadPersistedState: jest.fn(),
  } as unknown as Scheduler;
}

describe('completePhaseAfterPostPipeline + LLM fallback flow', () => {
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('returns null when mechanical fails and config flag is false', async () => {
    const dir = makeProject(false);
    try {
      const scheduler = makeTickingScheduler();
      const result = await completePhaseAfterPostPipeline(dir, '3', scheduler);
      expect(result).toBeNull();
      expect((scheduler.spawn as jest.Mock)).not.toHaveBeenCalled();
    } finally {
      cleanup(dir);
    }
  });

  it('invokes LLM fallback when mechanical fails and config flag is true', async () => {
    const dir = makeProject(true);
    try {
      const scheduler = makeTickingScheduler();
      const result = await completePhaseAfterPostPipeline(dir, '3', scheduler);
      expect(result).not.toBeNull();
      expect((result as { llm_fallback?: boolean }).llm_fallback).toBe(true);
      expect((scheduler.spawn as jest.Mock)).toHaveBeenCalledTimes(1);
    } finally {
      cleanup(dir);
    }
  });

  it('returns null when LLM fallback verification fails', async () => {
    const dir = makeProject(true);
    try {
      // Non-ticking scheduler: success exit but does NOT edit ROADMAP
      const scheduler = {
        spawn: jest.fn(
          async (): Promise<SchedulerSpawnResult> => ({
            exitCode: 0,
            timedOut: false,
            backend: 'claude',
            tokensUsed: 500,
            workItemId: 'fake',
          }),
        ),
        getState: jest.fn(),
        getStates: jest.fn(() => new Map()),
        recordExternalSample: jest.fn(),
        persistState: jest.fn(),
        loadPersistedState: jest.fn(),
      } as unknown as Scheduler;

      const result = await completePhaseAfterPostPipeline(dir, '3', scheduler);
      expect(result).toBeNull();
      expect((scheduler.spawn as jest.Mock)).toHaveBeenCalled();
    } finally {
      cleanup(dir);
    }
  });
});
```

- [ ] **Step 6.2: Run the integration test**

```bash
npx jest tests/integration/phase-complete-llm-flow.test.ts 2>&1 | tail -15
```

Expected: 3/3 tests pass.

- [ ] **Step 6.3: Lint, build, commit**

```bash
npm run lint && npm run build:check
git add tests/integration/phase-complete-llm-flow.test.ts
git commit -m "test(phase-complete-llm): integration test for full fallback flow

3 tests using mocked Scheduler:
1. Fallback is NOT invoked when config flag is false (preserves
   pre-3B behavior).
2. Fallback is invoked when mechanical fails + flag is true +
   scheduler provided. Returns synthetic result with llm_fallback: true.
3. Returns null when fallback verification fails (subprocess exits 0
   but doesn't tick the checkbox).

Part of spec 3B follow-up of the gsd-2-selective-adoption milestone."
```

---

## Task 7: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 7.1: CLAUDE.md section**

Open `CLAUDE.md`. Find the Spec 2B idle watchdog section (or the token_profile section). Add after it:

```markdown
### LLM fallback for phase completion (Spec 3B)

`phase_complete_llm_fallback` is an opt-in config flag (default `false`).
When `true`, both `gd autopilot`'s phase-finalize step and
`gd phase complete N` fall back to asking Claude to perform the ROADMAP.md
+ STATE.md edits directly via the scheduler, if the regex-based mechanical
path throws or gate-fails. Verification is shallow: ROADMAP.md is
re-read and checked for a ticked `- [x] Phase N` checkbox.

Set via `gd settings phase_complete_llm_fallback true`. Opt-in only —
existing users see no change.

The fallback respects `token_profile`, budget pressure, and the idle
watchdog just like any other scheduler spawn.
```

- [ ] **Step 7.2: CHANGELOG entry**

Merge into the existing `## [Unreleased]` section under `### Added`:

```markdown
- **LLM fallback for phase completion (Spec 3B)** — opt-in
  `GrdConfig.phase_complete_llm_fallback` flag (default false). When
  `true`, `gd autopilot` and `gd phase complete` delegate to a new
  `lib/phase-complete-llm.ts` module that invokes Claude via the
  scheduler to perform ROADMAP.md + STATE.md edits when the mechanical
  regex path fails. Verification checks for a ticked
  `- [x] Phase N` checkbox. New `gd settings phase_complete_llm_fallback
  <bool>` CLI. New `PhaseCompleteResult.llm_fallback` flag on results
  produced by this path.
```

- [ ] **Step 7.3: Scan and commit**

```bash
node bin/gd.js scan --file CLAUDE.md
node bin/gd.js scan --file docs/CHANGELOG.md
git add CLAUDE.md docs/CHANGELOG.md
git commit -m "docs: add Spec 3B LLM fallback documentation

Part of spec 3B follow-up of the gsd-2-selective-adoption milestone."
```

---

## Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 8.1: Full test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass. Pre-3B count was ~4187 in worktree. Should add 11 tests (8 unit + 3 integration). Expected ~4198.

- [ ] **Step 8.2: Lint and build**

```bash
npm run lint && npm run build:check
```

- [ ] **Step 8.3: Format check (scoped)**

```bash
npm run format:check 2>&1 | tail -5
```

If format-check fails on spec 3B files:

```bash
npx prettier --write lib/phase-complete-llm.ts lib/phase-complete.ts lib/phase.ts lib/autopilot.ts lib/types.ts bin/grd-tools.ts lib/cli/index.ts tests/unit/phase-complete-llm.test.ts tests/integration/phase-complete-llm-flow.test.ts CLAUDE.md docs/CHANGELOG.md
git add -u
git commit -m "chore: apply prettier formatting to spec 3B files"
```

- [ ] **Step 8.4: Scanner check**

```bash
node bin/gd.js scan --all 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 8.5: Verify commit chain**

```bash
git log --oneline main..HEAD
```

Expected: 7–9 commits (one per task + any format fix).

- [ ] **Step 8.6: Final checklist**

- [ ] `lib/phase-complete-llm.ts` exists with `attemptLlmFallbackCompletion`
- [ ] `lib/phase-complete.ts` `completePhaseAfterPostPipeline` is async and calls the fallback
- [ ] `lib/phase.ts` `cmdPhaseComplete` is async and calls the fallback
- [ ] `lib/autopilot.ts` awaits the now-async `completePhaseAfterPostPipeline`
- [ ] `lib/types.ts` has `GrdConfig.phase_complete_llm_fallback` and `PhaseCompleteResult.llm_fallback`
- [ ] `bin/grd-tools.ts` has `gd settings phase_complete_llm_fallback` case
- [ ] `tests/unit/phase-complete-llm.test.ts` — 8 tests passing
- [ ] `tests/integration/phase-complete-llm-flow.test.ts` — 3 tests passing
- [ ] `CLAUDE.md` has Spec 3B section
- [ ] `docs/CHANGELOG.md` has Spec 3B Unreleased entry
- [ ] All existing tests still pass (no regressions from async conversion)
- [ ] `npm run lint` passes
- [ ] `npm run build:check` passes
- [ ] Format check passes (or fixed via scoped prettier)
- [ ] `gd scan --all` exits 0

---

## Out of scope (follow-up items)

- Deeper verification beyond checkbox tick
- Rollback on verification failure
- Retry with backoff
- Telemetry on fallback usage frequency
- Dedicated agent markdown file in `agents/`
