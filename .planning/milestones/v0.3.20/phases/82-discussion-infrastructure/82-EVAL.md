# Evaluation Plan: Phase 82 — Discussion Infrastructure

**Designed:** 2026-03-23
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Cross-backend dispatch primitive, backend availability detection, discussion config validation
**Reference papers:** None — this is a greenfield implementation of a multi-backend dispatch layer against a defined spec (REQ-134, REQ-135, REQ-136, REQ-143, REQ-149)

## Evaluation Overview

Phase 82 implements the foundational infrastructure for cross-backend discussions: TypeScript types, config validation for `backend_roles` and `discussion` sections, `detectAvailableBackends()` with TTL caching, `dispatchToBackend()` as the core dispatch primitive, and `DISCUSSION_SONNET_MODEL` ceiling enforcement. There are no benchmark datasets or paper results to reproduce — quality is measured entirely against the behavioral spec in plans 82-01 through 82-03.

Because this phase is pure TypeScript infrastructure with no external side effects beyond spawning CLI processes, meaningful evaluation is available at all three tiers without requiring downstream integration. The dispatch function can be fully tested via mocked process-spawning, availability detection can be validated via a mocked PATH, and config validation can be exercised directly. Deferred validation is limited to real-world cross-backend dispatch behavior, which requires actual AI CLI binaries installed in the test environment.

The primary evaluation risk is false confidence from unit tests that mock the wrong CLI behavior. The test suite must verify exact flag sequences (`--print -p` for claude, `-q` for codex) against the spec — not just that the function returns something. Mocking discipline matters more than coverage percentage here.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript type compilation | Codebase standard (`tsc --noEmit`) | All new types must compile without error |
| ESLint pass | Codebase standard (`npm run lint`) | No `any`, no unused vars, `'use strict'` enforced |
| Unit test pass rate | Plan 82-03 spec; product quality target >= 80% coverage | Directly measures correct behavior of all dispatch paths |
| Coverage for lib/discussion.ts | Product quality target >= 80% (`lib/` modules) | New module must meet same standard as existing modules |
| Coverage for lib/backend.ts | Existing threshold in jest.config.js: lines 95, functions 100, branches 86 | Must not regress below existing threshold |
| Coverage for lib/utils.ts | Existing threshold in jest.config.js: lines 92, functions 95, branches 85 | Config validation additions must stay above threshold |
| CLI flag correctness | Plan 82-02 spec; REQ-136 | Each backend's flag set is a hard behavioral contract |
| Timeout structured return | Plan 82-02 spec; REQ-136 | Timeout must return `BackendResponse`, not throw |
| Unavailability structured return | Plan 82-02 spec; REQ-136 | Unavailable backend must return `BackendResponse`, not throw |
| SONNET_MODEL constant value | REQ-149; consistent with `lib/wireup/state.ts` and `lib/evolve/` pattern | Enforces sonnet-tier ceiling for primary backend spawns |
| 5-minute cache TTL | Plan 82-01 spec; REQ-135 | Availability probe must not re-run on every call |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Compilation, lint, format, module structure, no regressions |
| Proxy (L2) | 7 | Unit test coverage, behavioral contract verification via mocks |
| Deferred (L3) | 3 | Real-backend dispatch, full integration smoke test, production PATH probing |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript Compilation

- **What:** All new types (`DiscussionRole`, `DiscussionConfig`, `BackendRolesConfig`, `BackendAvailability`, `DispatchOptions`, `BackendResponse`) compile without error; `GrdConfig` extensions compile; `lib/discussion.ts` compiles; `lib/backend.ts` additions compile.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check`
- **Expected:** Exit code 0, no type errors in stdout/stderr
- **Failure means:** A type was defined incorrectly, an import is broken, or the `GrdConfig` extension has a field type mismatch. Block execution until resolved.

### S2: ESLint Pass

- **What:** All modified and new files (`lib/types.ts`, `lib/utils.ts`, `lib/backend.ts`, `lib/discussion.ts`, `tests/unit/discussion.test.ts`, `tests/unit/backend.test.ts`) pass lint with zero errors.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint`
- **Expected:** Exit code 0, no lint errors or warnings
- **Failure means:** `any` type introduced, unused variable, missing `'use strict'`, or `_` prefix missing on intentionally unused function argument. Block execution.

### S3: Module Exports Shape

- **What:** `lib/discussion.ts` exports `dispatchToBackend`, `DISCUSSION_SONNET_MODEL`, `BACKEND_CLI_MAP`, `DEFAULT_DISPATCH_TIMEOUT_MS`; `lib/backend.ts` exports `detectAvailableBackends` and `clearAvailabilityCache`.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const d = require('./lib/discussion'); console.log(Object.keys(d).join(','))"` and `node -e "const b = require('./lib/backend'); console.log(typeof b.detectAvailableBackends, typeof b.clearAvailabilityCache)"`
- **Expected:** Discussion exports: `dispatchToBackend,DISCUSSION_SONNET_MODEL,BACKEND_CLI_MAP,DEFAULT_DISPATCH_TIMEOUT_MS`; backend: `function function`
- **Failure means:** Module export list is incomplete or export names are wrong. Tests cannot run without this.

### S4: SONNET_MODEL Constant Value

- **What:** `DISCUSSION_SONNET_MODEL` equals `'sonnet'`, matching the pattern from `lib/wireup/state.ts` and `lib/evolve/`.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const { DISCUSSION_SONNET_MODEL } = require('./lib/discussion'); console.log(DISCUSSION_SONNET_MODEL)"`
- **Expected:** `sonnet`
- **Failure means:** REQ-149 violated — primary backend spawns would use a wrong or higher-tier model.

### S5: No Existing Test Regressions (Pre-wave-2)

- **What:** All existing tests pass after wave-1 changes (types, config, backend detection added). New code must not break existing test suite.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm test -- --testPathIgnorePatterns=tests/unit/discussion`
- **Expected:** All tests green, exit code 0, no new failures in backend.test.ts or utils.test.ts
- **Failure means:** Wave-1 changes broke something in config loading or backend detection. Must fix before wave-2 proceeds.

### S6: Pipeline Crash Test (Discussion Module)

- **What:** `lib/discussion.ts` loads without throwing and `dispatchToBackend` is callable (not a crash on import).
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const { dispatchToBackend } = require('./lib/discussion'); console.log(typeof dispatchToBackend)"`
- **Expected:** `function`
- **Failure means:** Module has a top-level error (bad require, syntax error, invalid export). Block all testing.

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to Level 2.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of correctness and robustness via unit tests with controlled mocks.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for real-backend integration testing. They verify behavioral contracts under mocked conditions; real dispatch is deferred.

### P1: CLI Flag Contract — Claude Backend

- **What:** When `dispatchToBackend('claude', prompt, options)` is called, the spawned process receives `'claude'` as the binary and an args array containing `'--print'`, `'-p'`, and the prompt text. When `options.model` is set, args also include `'--model'` and the model name.
- **How:** Unit test that mocks the Node.js spawn function and captures call arguments.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/discussion.test.ts --verbose`
- **Target:** Test cases for claude args pass green
- **Evidence:** Plan 82-02 spec explicitly requires `['--print', '-p', prompt, '--model', model]` flags; REQ-136 specifies correct CLI invocation per backend.
- **Correlation with full metric:** HIGH — if flags are wrong, real dispatch either fails or produces wrong output. Mocked test catches flag bugs exactly.
- **Blind spots:** Does not verify that the real `claude` CLI accepts these flags in this version. Real-world test required for that.
- **Validated:** No — awaiting deferred validation at phase-83-discussion-workflows (real dispatch test)

### P2: CLI Flag Contract — Codex, Gemini, Opencode Backends

- **What:** `dispatchToBackend('codex', prompt)` spawns `codex` with `['-q', prompt]`. `dispatchToBackend('gemini', prompt)` spawns `gemini` with `[prompt]`. `dispatchToBackend('opencode', prompt)` spawns `opencode` with `[prompt]`.
- **How:** Unit tests that mock the spawn function and verify args per backend.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/discussion.test.ts --verbose`
- **Target:** All three backend flag test cases pass green
- **Evidence:** Plan 82-02 spec defines exact flag map per backend; plan 82-03 explicitly requires verifying each.
- **Correlation with full metric:** HIGH — flag bugs cause silent dispatch failures or wrong model invocations.
- **Blind spots:** Gemini and opencode invocation conventions may evolve; mocked tests will not detect API drift.
- **Validated:** No — awaiting deferred validation at phase-83-discussion-workflows

### P3: Timeout Returns Structured Response (Not Thrown Exception)

- **What:** When the underlying spawn throws an error with `killed: true` (simulating timeout), `dispatchToBackend` returns a `BackendResponse` object with `response_text: ''` and `stderr` containing `'timed out'`. It does NOT re-throw.
- **How:** Unit test mocks the spawn to throw `{ killed: true, message: 'SIGTERM' }`.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/discussion.test.ts --verbose`
- **Target:** Timeout test case passes; no unhandled exception; returned object matches shape
- **Evidence:** Plan 82-02 spec; REQ-136. Callers in higher-level workflows depend on structured errors — a thrown exception would crash the entire discussion orchestration.
- **Correlation with full metric:** HIGH — this is a direct behavioral test of the specified error contract.
- **Blind spots:** Does not test the actual OS-level SIGTERM delivery for long-running processes.
- **Validated:** No — awaiting deferred validation at phase-83-discussion-workflows

### P4: Unavailable Backend Returns Structured Response

- **What:** When `detectAvailableBackends()` returns `{ codex: { available: false, version: null } }`, calling `dispatchToBackend('codex', prompt)` returns a `BackendResponse` with `response_text: ''` and `stderr` mentioning unavailability. It does NOT attempt to spawn.
- **How:** Unit test mocks `detectAvailableBackends` return value.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/discussion.test.ts --verbose`
- **Target:** Unavailability test case passes; spawn function not called; response shape correct
- **Evidence:** Plan 82-02 spec. This prevents hard crashes when a backend is not installed.
- **Correlation with full metric:** HIGH — structural test of the availability-gating logic.
- **Blind spots:** Does not test the availability probe itself under this path.
- **Validated:** No — awaiting deferred validation at phase-83-discussion-workflows

### P5: detectAvailableBackends Cache and TTL Behavior

- **What:** (a) `detectAvailableBackends()` called twice in sequence results in the version probe called 4 times total (not 8) — cache hit on second call. (b) After advancing `Date.now` past 5 minutes, a third call results in 4 more probes — cache miss after TTL.
- **How:** Unit test uses `jest.spyOn(Date, 'now')` to advance time; counts probe invocations.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/backend.test.ts --verbose`
- **Target:** Cache test passes; probe call count matches expected (4 then 0 then 4)
- **Evidence:** Plan 82-01 spec requires 5-minute TTL caching matching the `_modelCache` pattern in `lib/backend.ts`. Without caching, every `dispatchToBackend` call would probe PATH — 4 probes per dispatch call is unacceptable overhead.
- **Correlation with full metric:** HIGH — this is a direct test of the caching implementation.
- **Blind spots:** Does not test cache behavior under concurrent calls.
- **Validated:** No — awaiting deferred validation at phase-83-discussion-workflows

### P6: Config Validation — backend_roles and discussion Section

- **What:** (a) Config `{ "backend_roles": { "reviewer": "invalid_backend" } }` triggers a stderr warning and drops the invalid entry. (b) Config `{ "discussion": { "max_rounds": 10 } }` clamps to 3. (c) Config `{ "discussion": { "enabled": false } }` loads without error.
- **How:** Unit tests in `tests/unit/backend.test.ts` (or `tests/unit/utils.test.ts`) call `loadConfig()` on temp directories with crafted config files.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/utils.test.ts tests/unit/backend.test.ts --verbose`
- **Target:** All config validation test cases pass green
- **Evidence:** Plan 82-01 spec; REQ-134. Accepting invalid backend IDs silently would allow misconfigured `backend_roles` to dispatch to non-existent CLIs.
- **Correlation with full metric:** MEDIUM — validates the validation layer exists; does not verify the full config loading path end-to-end including file I/O for all edge cases.
- **Blind spots:** Config written by real users may have more exotic invalid inputs not covered by these specific test cases.
- **Validated:** No — awaiting deferred validation at phase-83-discussion-workflows

### P7: Coverage Thresholds Not Regressed

- **What:** `npm test` with coverage reports that `lib/backend.ts` >= 95% lines / 100% functions / 86% branches, `lib/utils.ts` >= 92% lines / 95% functions / 85% branches (existing thresholds). `lib/discussion.ts` >= 85% lines / 90% functions / 75% branches (new module, consistent with other infrastructure modules).
- **How:** Jest coverage report from full test run.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm test -- --coverage 2>&1 | grep -E "discussion|backend|utils|All files"`
- **Target:** No threshold failures in coverage output; `lib/discussion.ts` shows >= 85% line coverage
- **Evidence:** Existing thresholds in `jest.config.js`; product quality target >= 80% for all `lib/` modules. New modules must enter at project standard.
- **Correlation with full metric:** MEDIUM — high coverage indicates all branches are exercised; does not guarantee correctness of behavior in those branches.
- **Blind spots:** Coverage does not measure test quality — a test can hit a line without asserting the result.
- **Validated:** No — jest.config.js threshold enforcement provides ongoing validation once set

---

## Level 3: Deferred Validations

**Purpose:** Full validation requiring real AI CLI binaries or downstream integration with discussion orchestration.

### D1: Real-Backend Dispatch Smoke Test — DEFER-82-01

- **What:** Calling `dispatchToBackend('claude', 'Reply with: DISPATCH_OK')` (or whichever backend is available) returns a `BackendResponse` where `response_text` contains `'DISPATCH_OK'` and `duration_ms > 0`.
- **How:** Integration test that does NOT mock the spawn layer. Runs against actual installed CLI binary. Gated on at least one backend being available.
- **Why deferred:** Requires an installed AI CLI (claude, codex, gemini, or opencode) with a valid API key/session. This is not guaranteed in the unit test environment and would make tests flaky or require network access.
- **Validates at:** phase-83-discussion-workflows (integration phase)
- **Depends on:** At least one AI CLI binary installed and authenticated in the test/dev environment
- **Target:** `response_text` non-empty, `duration_ms > 0`, `stderr` empty on success, exit code 0
- **Risk if unmet:** CLI flag definitions in `BACKEND_CLI_MAP` may be wrong for the installed CLI version. If codex's `-q` flag changed or claude's `--print` was removed, unit tests pass but real dispatch fails silently.
- **Fallback:** If dispatch fails, consult installed CLI `--help` output and update `BACKEND_CLI_MAP` accordingly. Budget: 1 task in phase 83.

### D2: PATH Availability Probe Accuracy — DEFER-82-02

- **What:** `detectAvailableBackends()` called without mocks on a developer machine returns `available: true` for all CLIs actually on PATH, and `available: false` for all that are not. Version strings are non-empty for available CLIs.
- **How:** Manual verification script: run `detectAvailableBackends()` in a Node REPL, compare against `which claude codex gemini opencode` output.
- **Why deferred:** Unit tests mock the version probe — they cannot verify that the correct binary name is used for each CLI or that `--version` is the right flag. Binary names and version flags are hardcoded and must be verified against actual CLI behavior.
- **Validates at:** phase-83-discussion-workflows (any phase with real CLI access)
- **Depends on:** At least one AI CLI installed to verify correct binary name and `--version` flag
- **Target:** 100% agreement between `detectAvailableBackends()` result and actual PATH state
- **Risk if unmet:** Wrong binary name (e.g., opencode installs as `opencode-cli`) means `available: false` even when installed. Discussion workflows would silently skip configured backends.
- **Fallback:** If binary names are wrong, update the probe table in `detectAvailableBackends()`. Low effort fix once identified.

### D3: End-to-End Discussion Short-Circuit When Disabled — DEFER-82-03

- **What:** When `discussion.enabled: false` is set in config, all discussion-triggered code paths return immediately without calling `dispatchToBackend` or `detectAvailableBackends`. No CLI processes are spawned.
- **How:** Integration test in phase 83 that stubs discussion trigger points and verifies no dispatch occurs with `enabled: false`.
- **Why deferred:** The short-circuit behavior at `discussion.enabled: false` lives in higher-level orchestration code (phase 83+), not in `lib/discussion.ts` itself. Phase 82 only validates that the config loads the `enabled` field correctly.
- **Validates at:** phase-83-discussion-workflows
- **Depends on:** Discussion orchestration layer (phase 83) that reads `discussion.enabled` before calling `dispatchToBackend`
- **Target:** Zero spawned processes when `enabled: false`; no latency added to planning/execution paths
- **Risk if unmet:** `enabled: false` config is silently ignored, causing unwanted AI API calls on every planning or execution step for users who disabled discussions.
- **Fallback:** Add explicit guard at discussion entry point in phase 83 orchestration layer.

---

## Ablation Plan

**No ablation plan** — Phase 82 implements a single dispatch primitive with no sub-components to isolate. The four backend variants in `BACKEND_CLI_MAP` are configuration, not architectural branches. The caching layer in `detectAvailableBackends` is the only separable component but its value is not in doubt (it is a performance primitive with a clear correctness test at P5).

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. Phase 82 is pure backend TypeScript infrastructure (`lib/types.ts`, `lib/utils.ts`, `lib/backend.ts`, `lib/discussion.ts`).

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| lib/backend.ts coverage | Existing per-file threshold | lines >= 95%, functions >= 100%, branches >= 86% | jest.config.js |
| lib/utils.ts coverage | Existing per-file threshold | lines >= 92%, functions >= 95%, branches >= 85% | jest.config.js |
| Overall lib/ coverage | Product quality target | >= 80% line coverage | PRODUCT-QUALITY.md |
| CLI response time | Operational requirement | < 500ms for `gd` commands | PRODUCT-QUALITY.md |
| Zero runtime deps | Design principle | 0 new runtime dependencies | PRODUCT-QUALITY.md |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/discussion.test.ts   — created in plan 82-03
tests/unit/backend.test.ts      — extended in plan 82-03
```

**How to run full phase evaluation:**
```bash
# Level 1 — all sanity checks in sequence
cd /Users/neo/Developer/Projects/GetResearchDone

# S1: compilation
npm run build:check

# S2: lint
npm run lint

# S3: module exports
node -e "const d = require('./lib/discussion'); console.log(Object.keys(d).join(','))"
node -e "const b = require('./lib/backend'); console.log(typeof b.detectAvailableBackends, typeof b.clearAvailabilityCache)"

# S4: SONNET_MODEL constant
node -e "const { DISCUSSION_SONNET_MODEL } = require('./lib/discussion'); console.log(DISCUSSION_SONNET_MODEL)"

# S5: no regressions
npm test -- --testPathIgnorePatterns=tests/unit/discussion

# S6: crash test
node -e "const { dispatchToBackend } = require('./lib/discussion'); console.log(typeof dispatchToBackend)"

# Level 2 — proxy metrics
npx jest tests/unit/discussion.test.ts --verbose
npx jest tests/unit/backend.test.ts --verbose
npm test -- --coverage 2>&1 | grep -E "discussion|backend|utils|All files"
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compilation | | | |
| S2: ESLint pass | | | |
| S3: Module exports shape | | | |
| S4: SONNET_MODEL constant | | | |
| S5: No regressions (pre-wave-2) | | | |
| S6: Pipeline crash test | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Claude CLI flags | args include --print, -p, prompt | | | |
| P2: Codex/Gemini/Opencode flags | args match spec per backend | | | |
| P3: Timeout structured return | BackendResponse, not throw | | | |
| P4: Unavailable backend structured return | BackendResponse, not throw | | | |
| P5: Cache + TTL | 4 probes then 0, then 4 after TTL | | | |
| P6: Config validation | invalid IDs warned; max_rounds clamped | | | |
| P7: Coverage thresholds | lib/discussion >= 85% lines; existing files not regressed | | | |

### Ablation Results

No ablation conditions defined for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-82-01 | Real-backend dispatch smoke test | PENDING | phase-83-discussion-workflows |
| DEFER-82-02 | PATH availability probe accuracy | PENDING | phase-83-discussion-workflows |
| DEFER-82-03 | End-to-end short-circuit when disabled | PENDING | phase-83-discussion-workflows |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — compilation, lint, and export shape checks catch all structural errors before any testing begins.
- Proxy metrics: Well-evidenced — the behavioral contracts being tested (CLI flag sequences, structured error returns, cache TTL) are exactly specified in plans 82-01 through 82-03. Mocked unit tests are the right tool for this class of contract.
- Deferred coverage: Comprehensive for this phase — the three deferred items cover every dimension (real dispatch, real availability probing, real config-driven short-circuit) that cannot be tested without external dependencies. All three have a clear `validates_at` target.

**What this evaluation CAN tell us:**
- Whether all TypeScript types compile and import correctly
- Whether CLI flag arguments per backend match the spec exactly (via mocked spawn call capture)
- Whether timeout and unavailability produce structured `BackendResponse` returns instead of exceptions
- Whether cache TTL behavior is correct
- Whether config validation rejects invalid backend IDs and clamps `max_rounds`
- Whether coverage thresholds are met for all modified modules

**What this evaluation CANNOT tell us:**
- Whether real `claude --print` / `codex -q` / `gemini` / `opencode` invocations succeed with current installed CLI versions (deferred: DEFER-82-01, phase-83)
- Whether binary names in `BACKEND_CLI_MAP` match actual installed binary names on developer and CI machines (deferred: DEFER-82-02, phase-83)
- Whether the `enabled: false` short-circuit in discussion orchestration prevents unwanted API calls in practice (deferred: DEFER-82-03, phase-83)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-23*
