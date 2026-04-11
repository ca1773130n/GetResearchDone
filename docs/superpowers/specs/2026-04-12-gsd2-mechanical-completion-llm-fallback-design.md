---
milestone: gsd-2-selective-adoption
spec: 3B (follow-up)
status: approved
date: 2026-04-12
owner: cameleon-x
---

# LLM fallback for mechanical phase completion

## Milestone context

Follow-up to Spec 3 (mechanical phase completion, commit `02e9d5e`). The original Spec 3 deferred the LLM-fallback half of ADR-003 pending observation of whether mechanical completion was brittle in practice. The user directed completion of all deferred specs, so this spec proceeds without an empirical trigger.

This is the final spec in the `gsd-2-selective-adoption` milestone. After it ships:
- Spec 1 (complete): Prompt injection scanner
- Spec 2A (complete): Autopilot rate-limit hang fix + autoresearch routing
- Spec 2B (complete): Idle timeout watchdog
- Spec 3 (complete): Mechanical phase completion
- Spec 3B (this spec): LLM fallback for mechanical completion
- Spec 4 (complete): Token optimization system

## Problem

Spec 3's `_phaseCompleteCore` uses regex-based rewrites of `ROADMAP.md` and `STATE.md` to finalize a phase. It assumes:

- A checkbox in a standard `- [ ] Phase N: Title` format
- A progress table with specific column headings
- A `**Plans:**` marker at the start of a phase section
- STATE.md fields like `**Current Phase:**` and `**Status:**`

When those assumptions don't hold — because the user hand-edited the files, used a non-standard template, or imported a roadmap from another system — the regex replacements silently do nothing, or `findPhaseInternal` fails to locate the phase directory, or the sort for "next phase" misidentifies successor. `completePhaseAfterPostPipeline` catches any thrown error and returns `null`, logs a stderr message advising the user to run `gd phase complete N` manually — but running it manually uses the same regex code, so the user is stuck.

For users who have these non-standard formats, there's no recovery path other than hand-editing the markdown files. That's not autonomous.

## Goals

1. **Add an opt-in LLM fallback** that fires when `_phaseCompleteCore` throws (or returns a `gate_failed` result) AND a new config flag `phase_complete_llm_fallback: boolean` is set to `true`.

2. **Create a new module `lib/phase-complete-llm.ts`** with one exported function:
   ```typescript
   export function attemptLlmFallbackCompletion(
     cwd: string,
     phaseNum: string,
     scheduler: Scheduler | null,
     failure: Error | { gate_errors?: GateViolation[] },
   ): PhaseCompleteResult | null;
   ```
   Returns a `PhaseCompleteResult`-shaped object on success, `null` on any failure or when the fallback is disabled or unavailable.

3. **Prompt construction:** the function reads the current `.planning/ROADMAP.md` and `.planning/STATE.md`, the phase directory contents (plan/summary names), and builds a structured Claude prompt that describes what needs to happen. The prompt instructs Claude to use its file-editing tools to update both files in place.

4. **Verification** (shallow but sufficient): after the subprocess exits, the function re-reads `ROADMAP.md` and checks for `- [x] Phase N` where N is the phase number. If the checkbox is now ticked, the fallback is considered successful and returns a synthetic `PhaseCompleteResult`. If not, returns `null`.

5. **Wire `completePhaseAfterPostPipeline` in `lib/phase-complete.ts`** to call the fallback when the mechanical path fails and the config flag is set. The fallback is passed the current cwd, phase number, the scheduler (may be null — fallback returns null in that case), and the failure reason. It does NOT call the fallback on successful mechanical completion.

6. **Add `GrdConfig.phase_complete_llm_fallback: boolean`** as an optional field defaulting to `false`. Opt-in only; existing users see no behavior change.

7. **Add a CLI setting** `gd settings phase_complete_llm_fallback true|false` following the pattern used for `model_profile` and `token_profile`.

8. **Ship with tests:**
   - Unit tests for the verification logic (check-roadmap-ticked) with various input states
   - Unit test for prompt construction (exact prompt string shape given known input)
   - Integration test for `completePhaseAfterPostPipeline` flow with a mocked scheduler that simulates both successful and failed LLM edits

## Non-goals

- **Deeper verification beyond the checkbox tick.** Checking STATE.md mutations, progress-table updates, or cleanup-plan generation is out of scope. The checkbox is the load-bearing user-visible signal.
- **Retry if the LLM fallback fails.** One attempt; if it fails, log and return null. User recovery is manual file editing.
- **Automatic detection of "non-standard format."** The fallback fires only when the mechanical path threw or gate-failed. It does not try to pre-emptively decide "this ROADMAP looks weird, use LLM instead."
- **A dedicated agent markdown file** in `agents/`. The prompt is inline in the new module. Adding a markdown definition is speculative curation work.
- **Token budget handling** beyond what the scheduler already provides. The fallback invokes `scheduler.spawn` like any other agent dispatch. Spec 4's adaptive routing applies unchanged.
- **Quality analysis after LLM fallback.** Skipping quality analysis on the fallback path is OK — the feature's purpose is to recover a stuck finalization, not to exhaustively re-run the mechanical pipeline.
- **Handling partial LLM edits.** If Claude ticks the checkbox but doesn't update STATE.md, we accept it as success (the verification only checks the checkbox). A follow-up spec can add deeper verification.
- **Multi-provider fallback.** Uses whatever `resolveModelForAgent` returns for a fake agent type. If the scheduler's current backend is claude, codex, gemini, etc., the fallback uses that backend's model.
- **Changing `cmdPhaseComplete` (the CLI wrapper).** The CLI wrapper still calls `_phaseCompleteCore` and errors out on failure. The fallback path is only triggered via `completePhaseAfterPostPipeline` (autopilot's path). Users who manually invoke `gd phase complete N` on a stuck phase get the old error behavior — they can opt into the fallback by setting the config flag and using `gd autopilot` instead.

  Actually — reconsider this. Users running `gd phase complete N` manually should ALSO benefit from the fallback if they've opted in. **Revised:** `cmdPhaseComplete` also calls the fallback when the config flag is set and the mechanical path throws. This is a small additional call site; the wire-up pattern is identical.

- **Rolling back on LLM fallback success verification failure.** If the LLM edited ROADMAP.md but the checkbox check fails, we do NOT roll back the edits. Whatever state the LLM left the files in is what the user gets. A future spec could add a filesystem snapshot + restore mechanism.

## Architecture

### Overview

One new file, one modified module, one new config field, one new CLI setting. The fallback is a thin wrapper around `scheduler.spawn` that reads context, builds a prompt, runs Claude, and verifies the output. All three entry points (autopilot via `completePhaseAfterPostPipeline`, manual via `cmdPhaseComplete`) share the same fallback code.

```
┌──────────────────────────┐
│ cmdPhaseComplete (manual)│
└───────────┬──────────────┘
            │
            v
┌──────────────────────────┐      ┌──────────────────────────┐
│ _phaseCompleteCore       │<─────│ completePhaseAfterPost-  │
│ (mechanical)             │      │ Pipeline (autopilot)     │
└───────────┬──────────────┘      └──────────────┬───────────┘
            │ throw                              │
            v                                    v
      ┌──────────────────────────────────────────────┐
      │ attemptLlmFallbackCompletion                 │
      │ (lib/phase-complete-llm.ts)                  │
      │                                              │
      │  1. Check config.phase_complete_llm_fallback │
      │  2. Check scheduler !== null                 │
      │  3. Read ROADMAP.md + STATE.md + phase dir   │
      │  4. Build prompt                             │
      │  5. await scheduler.spawn(prompt, ...)       │
      │  6. Re-read ROADMAP.md, verify checkbox      │
      │  7. Return PhaseCompleteResult or null       │
      └──────────────────────────────────────────────┘
```

### File structure

**New files:**

```
lib/phase-complete-llm.ts                       # attemptLlmFallbackCompletion
tests/unit/phase-complete-llm.test.ts           # ~8 unit tests
tests/integration/phase-complete-llm-flow.test.ts  # ~3 integration tests
```

**Modified files:**

```
lib/phase-complete.ts    # completePhaseAfterPostPipeline calls fallback on failure
lib/phase.ts             # cmdPhaseComplete calls fallback on failure when opted in
lib/types.ts             # GrdConfig.phase_complete_llm_fallback
bin/grd-tools.ts         # gd settings phase_complete_llm_fallback
lib/cli/index.ts         # CLI routing for the new setting
CLAUDE.md                # short section documenting the opt-in flag
docs/CHANGELOG.md        # Unreleased entry
```

### Module boundaries

- **`lib/phase-complete-llm.ts`** — one responsibility: given a failure context, attempt an LLM-driven recovery. Does not know about autopilot, cmdPhaseComplete, or the scheduler's internals — only needs a `spawn` function and a cwd. ~150 lines.
- **`lib/phase-complete.ts`** (modified) — gets a new call site inside `completePhaseAfterPostPipeline`'s catch block. ~15 lines added.
- **`lib/phase.ts`** (modified) — `cmdPhaseComplete` similarly catches the `_phaseCompleteCore` error and invokes the fallback. ~20 lines added.
- **`lib/types.ts`** (modified) — one new optional field on `GrdConfig`.
- **`bin/grd-tools.ts`** + **`lib/cli/index.ts`** (modified) — new `gd settings phase_complete_llm_fallback` case matching the existing pattern.

## The fallback function

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
  ComplexityLevel,
} from './types';

const FALLBACK_AGENT_TYPE = 'grd-phase-finalizer';
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
    // Match `- [x] Phase N` or `- [x] Phase N:` with some tolerance
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
  } as PhaseCompleteResult & { llm_fallback?: boolean };
}

/**
 * Attempts to recover from a mechanical phase-completion failure by
 * asking Claude to perform the ROADMAP.md and STATE.md edits directly.
 * Returns a synthetic PhaseCompleteResult on success, null on any
 * failure.
 *
 * @param cwd - project root
 * @param phaseNum - phase number string (e.g., '03')
 * @param scheduler - active scheduler (null disables the fallback)
 * @param failure - the mechanical failure that triggered this fallback
 * @returns synthetic PhaseCompleteResult on success, null otherwise
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

  // Find the phase directory so we can include its contents in the prompt.
  // Best-effort — missing is OK, the prompt handles it.
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
    // Ignore — phaseDirFiles stays empty
  }

  const prompt = _buildPrompt(
    phaseNum,
    roadmap,
    state,
    phaseDirFiles,
    _describeFailure(failure),
  );

  process.stderr.write(
    `[phase-complete-llm] attempting LLM fallback for phase ${phaseNum} ` +
    `(reason: ${_describeFailure(failure).slice(0, 200)})\n`,
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

Constants at the top: timeout, context truncation ceiling, agent type label. Pure helper functions for reading, prompt construction, and verification. One exported async function. No surprises.

## Wiring the fallback into completePhaseAfterPostPipeline

In `lib/phase-complete.ts`, `completePhaseAfterPostPipeline` currently:

```typescript
export function completePhaseAfterPostPipeline(
  cwd: string,
  phaseNum: string,
): PhaseCompleteResult | null {
  try {
    const result = _phaseCompleteCore(cwd, phaseNum);
    if (result.gate_failed) { /* log + return null */ }
    if (result.dry_run) return null;
    return result;
  } catch (e) { /* log + return null */ }
}
```

**Extended version (async):**

```typescript
export async function completePhaseAfterPostPipeline(
  cwd: string,
  phaseNum: string,
  scheduler?: Scheduler | null,
): Promise<PhaseCompleteResult | null> {
  const config = loadConfig(cwd);
  const fallbackEnabled = config.phase_complete_llm_fallback === true;

  let mechanicalFailure: Error | { gate_errors?: GateViolation[] } | null = null;
  let mechanicalResult: PhaseCompleteResult | null = null;

  try {
    const result = _phaseCompleteCore(cwd, phaseNum);
    if (result.gate_failed) {
      mechanicalFailure = { gate_errors: result.gate_errors };
      process.stderr.write(
        `[autopilot] phase-finalize: gates failed for phase ${phaseNum}\n`,
      );
    } else if (result.dry_run) {
      return null;
    } else {
      mechanicalResult = result;
    }
  } catch (e) {
    mechanicalFailure = e as Error;
    process.stderr.write(
      `[autopilot] phase-finalize: error completing phase ${phaseNum}: ${(e as Error).message}\n`,
    );
  }

  if (mechanicalResult) return mechanicalResult;

  // Mechanical path failed — try the LLM fallback if enabled
  if (fallbackEnabled && scheduler && mechanicalFailure) {
    const fallbackResult = await attemptLlmFallbackCompletion(
      cwd,
      phaseNum,
      scheduler,
      mechanicalFailure,
    );
    if (fallbackResult) return fallbackResult;
  }

  return null;
}
```

**Breaking change:** the function signature becomes `async` and returns `Promise<PhaseCompleteResult | null>`. Callers must `await`.

The existing caller is `lib/autopilot.ts`. Update it to `await`:

```typescript
const finalizeResult = await completePhaseAfterPostPipeline(cwd, pNum, scheduler);
```

The enclosing function is already async (autopilot's post-pipeline step), so this is a minimal change.

## Wiring the fallback into cmdPhaseComplete

`lib/phase.ts` `cmdPhaseComplete` currently calls `_phaseCompleteCore` synchronously and calls `error(...)` on exception. Extend it:

```typescript
async function cmdPhaseComplete(
  cwd: string,
  phaseNum: string,
  raw: boolean,
  options?: PhaseCompleteOptions,
): Promise<void> {
  if (!phaseNum) { error('phase number required...'); }

  let result: PhaseCompleteResult;
  try {
    result = _phaseCompleteCore(cwd, phaseNum, options);
  } catch (e) {
    const config = loadConfig(cwd);
    if (config.phase_complete_llm_fallback === true) {
      process.stderr.write(
        `[phase-complete-llm] mechanical path failed, attempting fallback\n`,
      );
      // Need a scheduler here — construct one like autopilot does
      const scheduler = createScheduler(
        config.scheduler,
        /* superpowersConfig */ undefined,
      );
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

  // ... existing output logic ...
}
```

**Breaking change:** `cmdPhaseComplete` becomes async. Its caller in `bin/grd-tools.ts` must `await` it. Most CLI dispatches in GRD are already in async contexts, so this is minor.

## New config field

`lib/types.ts`:

```typescript
export interface GrdConfig {
  // ... existing fields ...
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
}
```

Extend `PhaseCompleteResult` with an optional `llm_fallback?: boolean` flag so callers can distinguish mechanical vs. LLM successes:

```typescript
export interface PhaseCompleteResult {
  // ... existing fields ...
  /**
   * True if this result was produced by the LLM fallback path, not
   * the mechanical regex path. Spec 3B.
   */
  llm_fallback?: boolean;
}
```

## New CLI setting

`bin/grd-tools.ts` `gd settings` dispatch. Add a case matching the existing pattern:

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

Also add routing in `lib/cli/index.ts` if required (following the Spec 4 pattern for `token_profile`).

## Testing strategy

### Unit tests

**`tests/unit/phase-complete-llm.test.ts`** (~8 tests):

1. `attemptLlmFallbackCompletion returns null when scheduler is null`
2. `attemptLlmFallbackCompletion reads ROADMAP.md and STATE.md from cwd/.planning`
3. `attemptLlmFallbackCompletion constructs a prompt containing the phase number, roadmap content, state content, and failure reason`
4. `attemptLlmFallbackCompletion invokes scheduler.spawn with the built prompt`
5. `attemptLlmFallbackCompletion returns null when scheduler.spawn exitCode is nonzero`
6. `attemptLlmFallbackCompletion returns null when scheduler.spawn throws`
7. `attemptLlmFallbackCompletion returns null when the verification check fails (checkbox not ticked after subprocess)`
8. `attemptLlmFallbackCompletion returns a synthetic PhaseCompleteResult when the checkbox is ticked after subprocess`

Uses a mocked `Scheduler` via `jest.fn()` and a temporary project fixture.

### Integration tests

**`tests/integration/phase-complete-llm-flow.test.ts`** (~3 tests):

1. `completePhaseAfterPostPipeline bypasses the LLM fallback when config flag is false (even if mechanical fails)`
2. `completePhaseAfterPostPipeline invokes the LLM fallback when mechanical throws AND config flag is true AND scheduler is provided`
3. `completePhaseAfterPostPipeline returns null when the LLM fallback itself fails verification`

Uses a real temporary project fixture + mocked scheduler.

### Coverage gaps explicitly accepted

- No end-to-end test with a real Claude subprocess. Too slow and requires authentication.
- No test for the 100KB context truncation path. The truncation logic is trivial and tested indirectly.
- No test for the `cmdPhaseComplete` CLI path with fallback. The CLI wrapper's scheduler construction differs from autopilot's, and testing the CLI path would require mocking `createScheduler`. The unit tests cover the fallback function directly; the CLI wiring is verified by lint/build.

## Error handling

- **`scheduler` is null:** fallback returns null immediately. Autopilot's existing "run manually" hint still applies.
- **Config flag is false:** fallback is not called. Behavior is identical to pre-3B.
- **`scheduler.spawn` throws:** fallback logs and returns null.
- **`scheduler.spawn` returns nonzero exit code:** fallback logs and returns null.
- **Verification fails (checkbox not ticked):** fallback logs and returns null. The files may be in a partially-edited state — see Non-goals.
- **`ROADMAP.md` or `STATE.md` missing:** `_readFileTruncated` returns null, the prompt includes `[MISSING]` markers, Claude is asked to handle it. If Claude creates the files, the verification may or may not succeed depending on its work. Acceptable edge case.
- **Phase directory missing:** `phaseDirFiles` stays empty, prompt includes an "(empty or missing)" marker.
- **LLM hallucinates and edits other files:** out of scope. The prompt explicitly instructs "Do NOT modify any other files." A malicious or misaligned LLM could still do it; this is acceptable given the opt-in nature.
- **Circular dependency risk:** `lib/phase-complete.ts` imports `attemptLlmFallbackCompletion` from `./phase-complete-llm`. That module imports types and uses `require('./paths')` but does NOT depend on `./phase-complete` — no cycle.

No silent fallbacks beyond the documented opt-in.

## Rollout checklist

1. Add `GrdConfig.phase_complete_llm_fallback` and `PhaseCompleteResult.llm_fallback` to `lib/types.ts`.
2. Create `lib/phase-complete-llm.ts` with `attemptLlmFallbackCompletion` + helpers.
3. Create `tests/unit/phase-complete-llm.test.ts` with 8 tests.
4. Update `lib/phase-complete.ts` `completePhaseAfterPostPipeline` to be async and call the fallback.
5. Update `lib/autopilot.ts` to `await` the new async `completePhaseAfterPostPipeline` call.
6. Update `lib/phase.ts` `cmdPhaseComplete` to be async and call the fallback on failure when opted in.
7. Update `bin/grd-tools.ts` to `await cmdPhaseComplete` (if not already) and add the `token_profile`-style case for `phase_complete_llm_fallback`.
8. Update `lib/cli/index.ts` if needed to route the new setting correctly.
9. Create `tests/integration/phase-complete-llm-flow.test.ts` with 3 integration tests.
10. Update `CLAUDE.md` with a short section on the opt-in flag.
11. Update `docs/CHANGELOG.md` with an Unreleased entry.
12. Run `npm test`, lint, build:check, format:check (scoped), gd scan --all.

## Out of scope (follow-up items)

- **Deeper verification beyond checkbox tick.** A future spec can add STATE.md field checks and cleanup plan verification.
- **Rollback on verification failure.** File snapshot + restore mechanism.
- **Retry with exponential backoff.** One attempt only.
- **Telemetry** showing how often the fallback fires in practice.
- **Multiple fallback strategies** (e.g., different prompt templates per failure mode).
- **Agent markdown definition** for `grd-phase-finalizer` in `agents/`.
- **LLM-driven cleanup plan generation** when quality analysis fails.

## Attribution

Pattern loosely inspired by gsd-2's ADR-003 "mechanical completion with LLM fallback" idea. gsd-2's implementation was built on the Pi SDK extension model (in-process LLM invocation, SQLite event logs); this spec adapts the idea to GRD's subprocess-spawn scheduler model using opt-in config + minimal verification.

No code is ported. The pattern is the contribution.

## Related specs

- Spec 3 (complete, on main): `2026-04-11-gsd2-mechanical-completion-design.md` — mechanical phase completion
- Spec 2A (complete): scheduler rate-limit recovery — the fallback uses the same scheduler
- Spec 4 (complete): token optimization — applies to the fallback's spawn like any other agent dispatch
- Spec 2B (complete): idle watchdog — protects the fallback's subprocess from hangs
