# Risks and Bugs Audit

## Summary

Audit of the GRD codebase focusing on Spec 2A/2B/3/3B/4 additions: `lib/scheduler.ts`, `lib/scheduler-wait.ts`, `lib/phase-complete-llm.ts`, `lib/complexity.ts`, `lib/metrics.ts`, `lib/phase-io.ts`, `lib/phase-complete.ts`, and the autopilot/autoresearch inner loops. No `as any` casts found (CLAUDE.md requirement met). No silent `catch {}` blocks found. **Fourteen substantive findings: 0 Critical, 9 Important, 3 Minor, 4 Observations.**

---

## Critical

None found.

---

## Important

### I1: Orphan state object in `_spawnWithRetry` — budget accounting silently dropped for fallback backend

**Status:** Fixed in commit `74a8804` (Phase 2 of audit fix plan).

**Location:** `lib/scheduler.ts:917`

**Description:** When `states.get(stateKey)` returns `undefined` — which occurs when `resolveAccount` falls through to the free fallback with an empty `config_dir` and the key `fallbackBackend` was not pre-seeded in `createScheduler` — the expression `states.get(stateKey) || createBackendState(DEFAULT_BUDGET_TPM)` creates a fresh, anonymous state object that is never inserted into the `states` map. `markInFlight(state)` at line 921 and `markComplete(state)` inside the `close`/`error` handlers mutate this throw-away object. The real entry for this backend in `states` (if any) is never updated.

**Impact:** Token reservations and in-flight counts for the fallback backend are never recorded. Multiple concurrent dispatches can all land here without seeing each other's reservations, allowing the account to be double-booked beyond budget. Rate-limit hits on the fallback become more likely.

**Suggested fix:** After line 917, add `if (!states.has(stateKey)) states.set(stateKey, state);` to register the newly created state object so mutations are reflected in the shared map.

---

### I2: Uncleared SIGKILL escalation timers — potential kill of recycled PIDs

**Status:** Fixed in commit `74a8804` (Phase 2 of audit fix plan).

**Location:** `lib/scheduler.ts:961–965`, `lib/scheduler.ts:971–975`

**Description:** Both the idle watchdog callback and the total-timeout handler send SIGTERM and then schedule a 5-second `setTimeout` for SIGKILL escalation. Neither inner timeout is stored in a clearable variable. If the child process exits naturally within the 5-second grace window, the `close` event fires and `safeResolve` resolves the outer promise — but the SIGKILL timer remains pending. Five seconds later it fires and calls `_killProcessTree(child, 'SIGKILL')` on a PID that may have been recycled by the OS.

**Impact:** On Linux with namespace-based PID recycling (common in containerized CI environments), the stale SIGKILL can terminate an unrelated process spawned after the original child exited. Long `gd autopilot` runs spawning many subprocesses are most at risk.

**Suggested fix:** Store both escalation timers in variables (`let idleKillTimer: ReturnType<typeof setTimeout> | undefined` and `let totalKillTimer: ReturnType<typeof setTimeout> | undefined`). Clear them inside the `close` handler alongside `clearTimeout(totalTimer)`. Mirror the pattern already used correctly in `lib/autopilot.ts:1117–1136`.

---

### I3: `startHeartbeat` is exported but never called in production — dead code with timer-leak risk

**Status:** Fixed in commit `1a024c1` (Phase 4 of audit fix plan — removed dead export).

**Location:** `lib/autopilot.ts:2556–2560`

**Description:** `startHeartbeat` is defined, exported in `module.exports`, and covered by tests, but is not called anywhere in `bin/`, `lib/cli/`, or `lib/mcp-server.ts`. The function returns an uncleared `setInterval` handle. The intended feature — periodic stderr output to keep long autopilot runs visible in logs — is therefore not active.

**Impact:** The heartbeat feature is non-functional. Any future wiring that forgets to call `clearInterval` on the returned handle will prevent the Node.js event loop from exiting after autopilot completes, causing `gd autopilot` to hang.

**Suggested fix:** Wire up the heartbeat inside `runAutopilot` at the start of the main loop and call `clearInterval(heartbeatTimer)` after the loop terminates. Alternatively, remove the export and the feature if it is intentionally deferred.

---

### I4: `phase-io.ts` module-level cache never invalidated by external writes

**Status:** Fixed in commit `f57b5bb` (Phase 3 of audit fix plan).

**Location:** `lib/phase-io.ts:18–65`

**Description:** `_roadmapFileCache` and `_stateFileCache` are module-level `Map` instances with no eviction. `readRoadmapFile` returns the cached copy on every call after the first read. `lib/phase-complete-llm.ts` writes ROADMAP.md and STATE.md via `fs.readFileSync` / `fs.writeFileSync` directly (lines 118, 133 of that file), bypassing the cache. If `_phaseCompleteCore` is called in the same process after a successful LLM fallback (e.g., during `cmdPhaseBatchComplete`), `readRoadmapFile` returns the pre-LLM stale content and `writeRoadmapFile` overwrites the LLM's checkbox tick.

**Impact:** In a batch-complete workflow where the LLM fallback fires for phase N and the mechanical path then runs for phase N+1 in the same process, the LLM's edits to ROADMAP.md are silently reverted.

**Suggested fix:** Export `clearRoadmapCache(path?: string)` and `clearStateCache(path?: string)` from `lib/phase-io.ts`. Call them at the start of `_phaseCompleteCore` and in `attemptLlmFallbackCompletion` after subprocess success.

---

### I5: `phaseNum.replace('.', '\\.')` escapes only the first dot — regex wildcard in multi-level phase numbers

**Status:** Fixed in commit `ae43855` (Phase 1 of audit fix plan).

**Location:** `lib/phase-complete.ts:134`, `lib/phase-complete.ts:140`

**Description:** `String.prototype.replace` with a string first-argument only replaces the first occurrence. For `phaseNum = "1.1"` the second call `phaseNum.replace('.', '\\.')` at line 140 produces `"1\\."` — correct by coincidence. For a three-part number like `"1.1.2"` the expression produces `"1\\.1.2"` where the second dot is an unescaped regex wildcard, matching any character.

**Impact:** Phase-complete regex operations on ROADMAP.md could match a wrong phase entry when using three-part phase numbering (e.g., phase `"1.1.2"` checkbox pattern matches `"1.1X2"` in any format). The wrong phase row in the progress table or checkbox could be updated.

**Suggested fix:** Replace both occurrences of `phaseNum.replace('.', '\\.')` with `phaseNum.replace(/\./g, '\\.')`.

---

### I6: Autoresearch branch creation failure silently ignored — second same-day run operates on wrong branch

**Status:** Fixed in commit `422372b` (Phase 1 of audit fix plan).

**Location:** `lib/autoresearch.ts:441`

**Description:** `_execGit(cwd, ['checkout', '-b', branchName])` returns `{ stdout, exitCode }` but the return value is not checked. The branch name is date-based (`autoresearch/YYYYMMDD`). If the branch already exists from a same-day prior run, git exits non-zero and the loop continues on the current branch. All subsequent `git reset --hard headBefore` revert operations then affect the wrong branch.

**Impact:** Running `gd autoresearch` twice in one day: the second run silently treats the main branch as its experiment branch. Every failed-experiment revert will reset main-branch working tree changes. Potentially destructive with no warning.

**Suggested fix:** Check `_execGit` exit code after `checkout -b`. On failure (branch exists), either re-use the existing branch with `git checkout branchName` (acceptable if resuming), or append a counter suffix (`autoresearch/YYYYMMDD-2`) to create a fresh branch.

---

### I7: `_buildSyntheticResult` hardcodes `is_last_phase: false` and `next_phase: null`

**Status:** Fixed in commit `889cd31` (Phase 3 of audit fix plan).

**Location:** `lib/phase-complete-llm.ts:208–222`

**Description:** The synthetic `PhaseCompleteResult` returned on LLM fallback success always has `is_last_phase: false`, `next_phase: null`, and `plans_executed: 'N/A'`. The autopilot uses this result in its phase-finalize log at `lib/autopilot.ts:2110`. The `is_last_phase` field is not used for autopilot control flow (milestone completion is determined by `isMilestoneComplete` via roadmap analysis), but `plans_executed: 'N/A'` is logged and surfaced in the autopilot result object.

**Impact:** Users of the `gd autopilot` JSON output who inspect `plans_executed` or `next_phase` after a fallback completion receive incorrect data. For the last phase of a milestone, `is_last_phase: false` in the result JSON is actively misleading.

**Suggested fix:** After verifying fallback success, call `findPhaseInternal(cwd, phaseNum)` to determine actual plan/summary counts and `readdirSync(phasesDir)` logic to determine the real next phase — mirroring the logic at `lib/phase-complete.ts:161–188`.

---

### I8: `checkBinary` uses `which` — always returns false on Windows

**Status:** Fixed in commit `3c7145c` (Phase 1 of audit fix plan).

**Location:** `lib/scheduler.ts:659–664`

**Description:** `checkBinary` calls `execFileSync('which', [binary])`. The `which` command does not exist on Windows; the call throws `ENOENT`, which is caught and returns `false`. The scheduler's non-account-rotation path filters `backend_priority` to only available backends: `schedulerConfig.backend_priority.filter(b => availableBackends.has(b))`. On Windows `availableBackends` is always empty, so `filteredPriority` is `[]`, and `pickBackend` always returns `free_fallback`.

**Impact:** On Windows, all configured backends are silently bypassed and every dispatch goes to `free_fallback`. Token budgets and priority ordering are completely ignored. No warning is emitted.

**Suggested fix:** Use `process.platform === 'win32' ? 'where' : 'which'` in `checkBinary`, or replace with a cross-platform implementation using `PATH` splitting.

---

### I9: Rapid recursion in `_spawnWithRetry` when recovery timestamps are in the past

**Status:** Fixed in commit `74a8804` (Phase 2 of audit fix plan).

**Location:** `lib/scheduler.ts:897–911`

**Description:** The infinite-loop guard compares `recoveryTime === lastRecoveryTime`. If `computeSoonestRecovery` returns a timestamp that has already elapsed (`recoveryTime < Date.now()`), `waitUntilOrAbort` computes `delay = Math.max(0, recoveryTime - Date.now()) = 0` and resolves immediately. `_spawnWithRetry` recurses with the new `recoveryTime` as `lastRecoveryTime`. If the next call to `computeSoonestRecovery` returns a different past timestamp (the loop drops another sample), the guard is bypassed again. This repeats O(N_samples) times.

**Impact:** When all accounts are exhausted and the rolling window has fully elapsed, a burst of O(10) rapid recursive calls occurs before falling through to free_fallback. Each pass runs `resolveAccount` + `computeSoonestRecovery` (O(accounts × samples)). Not a stack-overflow risk in practice but is surprising behavior and adds unnecessary latency at the worst possible moment.

**Suggested fix:** After `waitUntilOrAbort` returns, check whether `Date.now() >= recoveryTime` before recursing. If the target has already passed, fall through to free_fallback directly without recursing.

---

## Minor

### M1: Gate check internal errors are silently swallowed

**Status:** Fixed in commit `e9378bc` (Phase 1 of audit fix plan).

**Location:** `lib/gates.ts:605–615`

**Description:** Each gate check is wrapped in `try { ... } catch { /* non-blocking */ }` with no logging or synthetic violation. A crashing gate check (e.g., OOM reading a large plan file, or a bug in `validateCrossPhase`) is completely invisible to the user.

**Impact:** A broken gate function is treated as "no violations." Blocking issues may be missed. The user has no indication that gate machinery is malfunctioning.

**Suggested fix:** Log the error to `process.stderr` and push a synthetic `GateViolation` with `severity: 'warning'` and `code: 'GATE_ERROR'` to `result.warnings`.

---

### M2: Complexity routing mixes samples across all agent types

**Status:** Fixed in commit `705cdc6` (Phase 4 of audit fix plan).

**Location:** `lib/backend.ts:1100–1130`

**Description:** `getEffectiveTierForDispatch` aggregates `tokenEstimate` from all backends and accounts, sorted by timestamp, without filtering by `agentType`. Cheap `grd-verifier` or `grd-codebase-mapper` tasks completed just before a `grd-planner` dispatch pull the tail-average down, potentially demoting the planner from `high` complexity to `medium`.

**Impact:** Model tier selection for expensive agents is systematically biased toward lower tiers when lightweight agents ran recently. The effect is subtle but compounds in `gd autopilot` runs that interleave many agent types.

**Suggested fix:** Add `agentType?: string` to `UsageSample` (stored at sample-record time in `_spawnWithRetry`), and filter `allSamples` in `getEffectiveTierForDispatch` to include only samples whose `agentType` matches `opts.agentType`.

---

### M3: `_verifyStateAdvanced` returns `true` when STATE.md is missing

**Status:** Fixed in commit `5e0f237` (Phase 1 of audit fix plan).

**Location:** `lib/phase-complete-llm.ts:134–135`

**Description:** The `catch` block for `fs.readFileSync(statePath)` returns `true` — treating a missing STATE.md as "state verification passed." The combined `ok` check at line 204 is `roadmapTicked && stateAdvanced`. A fallback subprocess that only updates ROADMAP.md and leaves STATE.md absent will be reported as fully successful.

**Impact:** If the LLM subprocess accidentally deletes STATE.md, the fallback reports success and the autopilot continues with STATE.md missing, breaking all subsequent state-dependent commands (`gd progress`, `gd health`, etc.).

**Suggested fix:** Return `false` on ENOENT rather than `true`, or add an explicit file-existence check as a required condition separate from the content check.

---

## Observations

### O1: `lib/autopilot.ts` is ~2,700 lines and continues growing

**Status:** Deferred — requires its own spec. See plan's Out of Scope section.

**Location:** `lib/autopilot.ts`

**Description:** The file contains ~14 exported command functions, 8 prompt builders, 3 pipeline orchestrators, the merge queue, file-lock logic, wave-splitting algorithms, and the multi-milestone loop. Specs 2B, 3, 3B, and 4 all added code here. It is the largest single module in the codebase.

**Suggested fix:** Extract `runPostPhasePipeline` and supporting types into `lib/autopilot-pipeline.ts`, the multi-milestone loop and `resolveNextMilestone` into `lib/autopilot-milestone.ts`, and the wave/write-intent logic into `lib/autopilot-waves.ts`, following the pattern set by `lib/phase-complete.ts` / `lib/phase-complete-llm.ts` / `lib/phase-io.ts`.

---

### O2: Duplicate `_stateFileCache` in `lib/phase-io.ts` and `lib/state.ts` — can diverge

**Status:** Fixed in commit `f57b5bb` (Phase 3 of audit fix plan).

**Location:** `lib/phase-io.ts:44–65`, `lib/state.ts:158–169`

**Description:** Both modules maintain independent module-level `_stateFileCache` Maps. A write via `phase-io.ts:writeStateFile` updates only that module's cache; `lib/state.ts`'s copy remains stale. In a single `gd` invocation that calls both (e.g., inline phase complete followed by `gd state load`), a stale read is possible from the `state.ts` path.

**Suggested fix:** Consolidate into a single cache in `lib/phase-io.ts` and have `lib/state.ts` import `readStateFile`/`writeStateFile` from `phase-io.ts`.

---

### O3: `_lastLoggedPressure` module-level map persists across multiple `createScheduler` calls

**Status:** Fixed in commit `5820813` (Phase 2 of audit fix plan).

**Location:** `lib/scheduler.ts:492`

**Description:** `_lastLoggedPressure` is keyed by `process.pid.toString()`. Both `runAutopilot` (line 1664) and `runMultiMilestoneAutopilot` (line 2262) call `createScheduler` independently and both use `process.pid` as the session key in `logPressureTransition`. The second scheduler inherits the first scheduler's terminal pressure state, suppressing the first pressure-transition log of the second session.

**Suggested fix:** Accept a unique `sessionId` parameter in `createScheduler` (e.g., a monotonic counter or UUID), and use that in `logPressureTransition` calls to isolate per-scheduler transition state.

---

### O4: `lib/scheduler-wait.ts` uses ESM `export` alongside CJS `module.exports` — mixed syntax

**Status:** Fixed in commit `8077d3d` (Phase 1 of audit fix plan).

**Location:** `lib/scheduler-wait.ts:33`, `lib/scheduler-wait.ts:58`

**Description:** `export async function waitUntilOrAbort` (ESM) at line 33 and `module.exports = { waitUntilOrAbort }` (CJS) at line 58. Under the project's `tsx`/CJS execution model, `module.exports` wins at runtime. The test imports via `import { waitUntilOrAbort }` (line 3 of `scheduler-wait.test.ts`) which works via `ts-jest` but diverges from the project's stated style (CLAUDE.md: "CommonJS (`require`/`module.exports`, not ESM)").

**Suggested fix:** Remove the `export` keyword from the function declaration and rely solely on `module.exports`. Update the test to `const { waitUntilOrAbort } = require('../../lib/scheduler-wait')`.

---

## Top 3 priorities

If only three findings are addressed before merge:

1. **I2** (`lib/scheduler.ts:961–975`) — Uncleared SIGKILL escalation timers. Low-complexity fix with real correctness impact; can kill unrelated processes in high-throughput CI environments.
2. **I1** (`lib/scheduler.ts:917`) — Orphan state object making `markInFlight`/`markComplete` no-ops for fallback backend. Silent budget accounting failure that makes the scheduler's exhaustion detection unreliable.
3. **I5** (`lib/phase-complete.ts:134,140`) — Single-char `.replace('.', '\\.')` creating unescaped regex wildcards. One-line fix (`/\./g`) that prevents the wrong phase from being marked complete under multi-level phase numbering.

---

## Cross-references

- [`OVERVIEW.md`](OVERVIEW.md) — system-level architecture overview
- [`MODULES.md`](MODULES.md) — per-module descriptions and ownership
- [`MAINTENANCE.md`](MAINTENANCE.md) — upgrade and change-management procedures
- [`TESTING.md`](TESTING.md) — test coverage map and per-file thresholds
- [`FLOWS.md`](FLOWS.md) — call sequences for the affected code paths
