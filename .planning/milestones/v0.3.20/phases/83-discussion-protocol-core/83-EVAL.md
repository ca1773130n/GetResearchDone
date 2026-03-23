# Evaluation Plan: Phase 83 — Discussion Protocol Core

**Designed:** 2026-03-23
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** `runDiscussion()` orchestration, `listDiscussions()`, `readDiscussion()`, `discussionsDir()` path helper, `DiscussionResult` / `DiscussionRoundEntry` / `RunDiscussionOptions` type definitions
**Reference papers:** None — this is a greenfield implementation of a multi-backend discussion orchestration layer against a defined spec (REQ-137, REQ-144)

## Evaluation Overview

Phase 83 builds the `runDiscussion()` orchestration function on top of the `dispatchToBackend()` primitive delivered in Phase 82. It also adds three new types to `lib/types.ts`, a new `discussionsDir()` path helper to `lib/paths.ts`, and `listDiscussions()` / `readDiscussion()` I/O helpers to `lib/discussion.ts`.

Because this phase extends a module already fully tested by Phase 82 via mocked child_process calls, meaningful proxy evaluation is available without real AI CLI binaries. The dispatch primitive is mocked; `runDiscussion()` is tested entirely by inspecting mock call counts, call arguments, and mock `fs.writeFileSync` captures. All five success criteria map directly to testable unit test conditions.

The primary evaluation risk for this phase is the `functions: 100` threshold for both `lib/discussion.ts` and `lib/paths.ts`. Every new exported function — `runDiscussion`, `listDiscussions`, `readDiscussion` in `lib/discussion.ts` and `discussionsDir` in `lib/paths.ts` — must have at least one test call. A missed export or an untested helper causes the full test suite to fail at the threshold gate. Secondary risk is the `branches: 85` threshold: the round-clamping logic, the skipped-participant branch, and the `rounds >= 2` condition all produce branches that must be exercised.

Real-backend integration and end-to-end discussion file writing in a live milestone directory remain deferred to phase-84 or later, where actual CLI binaries may be present in the environment.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compilation | Codebase standard (`tsc --noEmit`) | New types and async function signatures must compile without error |
| ESLint pass | Codebase standard (`npm run lint`) | No `any`, no unused vars, `'use strict'` enforced |
| `lib/discussion.ts` coverage: lines >= 85, functions = 100, branches >= 85 | jest.config.js per-file threshold | Mandated by project; functions: 100 means every export must be tested |
| `lib/paths.ts` coverage: lines >= 95, functions = 100, branches >= 95 | jest.config.js per-file threshold | Existing high threshold must not regress after adding `discussionsDir()` |
| runDiscussion() dispatch call count | Plan 83-02 success criteria SC1 | Verifies parallel fan-out to all participants per round |
| DiscussionResult field completeness | Plan 83-02 success criteria SC2 | All required fields present and typed |
| fs.writeFileSync called before return | Plan 83-02 success criteria SC3 | History file written is a hard behavioral contract |
| Skipped-participant entry shape | Plan 83-02 success criteria SC4 | `{ skipped: true, reason: string }` is the required graceful-failure shape |
| rounds clamping to 1-3 | Plan 83-02 success criteria SC5 | Guard must exist at function entry; out-of-range rounds are a misuse surface |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 | Compilation, lint, module exports shape, crash tests, no regressions from phase 82 |
| Proxy (L2) | 8 | Unit test coverage, all five success criteria verified via mocks, coverage thresholds |
| Deferred (L3) | 3 | Real-backend dispatch with actual CLIs, real filesystem discussions dir, DEFER-82 closures |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript Compilation

- **What:** All new types (`DiscussionResult`, `DiscussionRoundEntry`, `RunDiscussionOptions`) in `lib/types.ts` compile; `discussionsDir()` in `lib/paths.ts` compiles; `runDiscussion()`, `listDiscussions()`, `readDiscussion()` in `lib/discussion.ts` compile. No `PromiseSettledResult` narrowing errors from TypeScript strict mode.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check`
- **Expected:** Exit code 0, no type errors in stdout/stderr
- **Failure means:** A type definition is wrong (e.g., `DiscussionRoundEntry` discriminated union not typed correctly), a `Promise.allSettled()` result is accessed without narrowing, or `async` return type is mismatched. Block all testing.

### S2: ESLint Pass

- **What:** All modified files (`lib/types.ts`, `lib/paths.ts`, `lib/discussion.ts`, `tests/unit/paths.test.ts`, `tests/unit/discussion.test.ts`) pass lint with zero errors. No `any` cast, no unused vars, `'use strict'` present in all modified `.ts` files.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint`
- **Expected:** Exit code 0, no errors or warnings
- **Failure means:** `any` introduced (likely in `Promise.allSettled()` handling), missing `'use strict'`, or unused import. Block execution.

### S3: Module Exports Shape — lib/discussion.ts

- **What:** `lib/discussion.ts` exports `runDiscussion`, `listDiscussions`, and `readDiscussion` in addition to the Phase 82 exports (`dispatchToBackend`, `DISCUSSION_SONNET_MODEL`, `BACKEND_CLI_MAP`, `DEFAULT_DISPATCH_TIMEOUT_MS`).
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const d = require('./lib/discussion'); console.log(Object.keys(d).sort().join(','))"`
- **Expected:** Output includes `listDiscussions,runDiscussion,readDiscussion` (plus existing exports)
- **Failure means:** New functions were implemented but not added to `module.exports`. TypeScript will not error on a missing export — this check catches that class of oversight.

### S4: Module Exports Shape — lib/paths.ts

- **What:** `lib/paths.ts` exports `discussionsDir` in addition to all existing path helpers.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const p = require('./lib/paths'); console.log(typeof p.discussionsDir)"`
- **Expected:** `function`
- **Failure means:** `discussionsDir()` was not added to the `module.exports` block. `lib/discussion.ts` imports it and would fail at runtime.

### S5: Pipeline Crash Test — Discussion Module

- **What:** `lib/discussion.ts` loads without throwing at import time; `runDiscussion` is exported as an async function.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const { runDiscussion } = require('./lib/discussion'); console.log(typeof runDiscussion)"`
- **Expected:** `function`
- **Failure means:** Module has a top-level syntax error, a bad require path (e.g., `./paths` not found), or the export is undefined. Block all testing.

### S6: No Phase 82 Regressions

- **What:** All tests added in Phase 82 (`tests/unit/discussion.test.ts` dispatch tests, `tests/unit/backend.test.ts`, `tests/unit/paths.test.ts`) still pass after Phase 83 additions. Phase 83 may only extend these files, not break existing cases.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm test 2>&1 | tail -20`
- **Expected:** All pre-existing tests green, no new failures in backend.test.ts, no removed test cases
- **Failure means:** A change to `lib/discussion.ts` or `lib/paths.ts` broke Phase 82 behavior. Must fix before declaring phase complete.

### S7: discussionsDir() Returns Correct Path Structure

- **What:** `discussionsDir('/some/project', 'v0.3.20')` returns a string ending in `.planning/milestones/v0.3.20/discussions`.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const { discussionsDir } = require('./lib/paths'); const r = discussionsDir('/some/project', 'v0.3.20'); console.log(r.endsWith('.planning/milestones/v0.3.20/discussions'))"`
- **Expected:** `true`
- **Failure means:** Path helper produces wrong directory structure. `runDiscussion()` would write files to the wrong location.

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to Level 2.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of correctness and behavioral contracts via mocked unit tests.
**IMPORTANT:** Proxy metrics verify behavioral contracts under mocked conditions. They do not verify real CLI dispatch, real file I/O in a live project, or actual async parallelism. All of those are deferred.

### P1: SC1 — All Participants Dispatched in Round 1

- **What:** `runDiscussion('topic', ['claude', 'codex'], { rounds: 1 })` with both backends marked available results in `dispatchToBackend` being called exactly 3 times: once for 'claude' (round 1), once for 'codex' (round 1), and once for the synthesizer.
- **How:** Mock `dispatchToBackend` and `detectAvailableBackends`; count total invocations and verify argument patterns.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/discussion.test.ts --verbose 2>&1 | grep -E "PASS|FAIL|SC1|parallel|dispatch"`
- **Target:** Test case for parallel dispatch passes green; `dispatchToBackend` called 3 times for 2-participant 1-round call
- **Evidence:** Plan 83-02 success criteria SC1; 83-RESEARCH.md Experiment Design table. This is a direct behavioral contract — if dispatch count is wrong, the protocol is wrong.
- **Correlation with full metric:** HIGH — call count and argument verification exactly mirrors the spec. Mocking does not reduce fidelity here because the logic under test is the fan-out coordination, not the dispatch primitive.
- **Blind spots:** Does not verify that OS-level parallelism occurs (execFileSync is inherently sequential). Does not test behavior beyond 4 participants.
- **Validated:** No — awaiting deferred validation at phase-84-workflow-integration

### P2: SC2 — DiscussionResult Shape

- **What:** Return value of `runDiscussion()` has all six required fields with correct types: `topic` (string), `participants` (BackendId[]), `rounds` (DiscussionRoundEntry[][]), `synthesis` (BackendResponse), `duration_ms` (number > 0), `discussion_file` (string ending in `.md`).
- **How:** Inspect returned object in unit test; assert each field type and value shape.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/discussion.test.ts --verbose 2>&1 | grep -E "PASS|FAIL|result shape|DiscussionResult"`
- **Target:** Shape test passes; all 6 fields present and correctly typed
- **Evidence:** Plan 83-02 success criteria SC2; `DiscussionResult` interface defined in plan 83-02 Task 1 spec.
- **Correlation with full metric:** HIGH — any missing or mistyped field would fail TypeScript consumers of this function.
- **Blind spots:** TypeScript compile check (S1) also catches type mismatches; this test verifies runtime values, not just types.
- **Validated:** No — awaiting deferred validation at phase-84-workflow-integration

### P3: SC3 — Markdown File Written Before Return

- **What:** `fs.writeFileSync` is called exactly once during `runDiscussion()`, with a path matching the regex `/discussion-\w+-\w+-\d+\.md$/`, and is called before the promise resolves (verified by call order tracking).
- **How:** Mock `fs.writeFileSync` with `jest.fn()`; after `await runDiscussion(...)`, assert `writeFileSync.mock.calls.length === 1` and path argument matches naming pattern.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/discussion.test.ts --verbose 2>&1 | grep -E "PASS|FAIL|writeFileSync|file written|SC3"`
- **Target:** File write test passes; writeFileSync called once with correct path pattern
- **Evidence:** Plan 83-02 success criteria SC3: "Each discussion produces a markdown file at `.planning/milestones/{milestone}/discussions/discussion-{phase}-{type}-{timestamp}.md` before the function returns." This is a hard contract — callers depend on the file being there immediately after `await`.
- **Correlation with full metric:** HIGH — this test directly verifies the synchronous-before-return contract using mock call ordering.
- **Blind spots:** Does not verify file content quality (presence of all discussion rounds, topic header, etc.) beyond what the test explicitly asserts.
- **Validated:** No — awaiting deferred validation at phase-84-workflow-integration

### P4: SC4 — Skipped Participant Produces Structured Entry

- **What:** When `detectAvailableBackends` returns `{ codex: { available: false, version: null }, claude: { available: true, version: '1.x' } }`, calling `runDiscussion('topic', ['claude', 'codex'])` returns a result where `result.rounds[0]` contains one entry with `{ skipped: true, reason: string }` for 'codex' and a normal `BackendResponse` for 'claude'. The discussion does not throw.
- **How:** Mock `detectAvailableBackends` return; verify `result.rounds[0]` shape after resolution.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/discussion.test.ts --verbose 2>&1 | grep -E "PASS|FAIL|skipped|unavailable|SC4"`
- **Target:** Skipped participant test passes; entry has `skipped: true` and non-empty `reason`
- **Evidence:** Plan 83-02 success criteria SC4; 83-RESEARCH.md Pattern 2 (skipped-participant guard). This prevents hard crashes in the common case where a configured backend is not installed on the machine.
- **Correlation with full metric:** HIGH — this is a direct behavioral test of the availability-gating logic at the orchestration level.
- **Blind spots:** Does not test the case where the participant is available but the dispatch throws mid-execution (that is a separate catch path in the promise resolver).
- **Validated:** No — awaiting deferred validation at phase-84-workflow-integration

### P5: SC5 — Rounds Clamping to 1-3

- **What:** Three cases: (a) `rounds: 0` → `result.rounds.length === 1`, (b) `rounds: 4` → `result.rounds.length === 3`, (c) `rounds: 2` → `result.rounds.length === 2`. All dispatch call counts match the clamped round count.
- **How:** Three separate unit test cases, each asserting `result.rounds.length`.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/discussion.test.ts --verbose 2>&1 | grep -E "PASS|FAIL|clamp|rounds|SC5"`
- **Target:** All three clamping test cases pass green
- **Evidence:** Plan 83-02 success criteria SC5; 83-RESEARCH.md Pattern 1 (`Math.min(Math.max(rounds, 1), 3)`). Out-of-range rounds would cause infinite loop risk or ignored round-2 results.
- **Correlation with full metric:** HIGH — direct logic test of a guard that has clear correct and incorrect states.
- **Blind spots:** Does not test `rounds: 1` as a boundary (correct lower bound); add this case if the test suite omits it.
- **Validated:** No — awaiting deferred validation at phase-84-workflow-integration

### P6: Round 2 Dispatch Count Correctness

- **What:** With `rounds: 2` and 2 available participants, `dispatchToBackend` is called exactly 5 times: 2 (round 1 participants) + 1 (synthesizer) + 2 (round 2 participants). With `rounds: 1`, exactly 3 times.
- **How:** Mock `dispatchToBackend`, count `mock.calls.length` after resolution.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/discussion.test.ts --verbose 2>&1 | grep -E "PASS|FAIL|round 2|call count"`
- **Target:** Round 2 call count = 5 for 2-participant 2-round run; Round 1 call count = 3
- **Evidence:** 83-RESEARCH.md Key Metrics table: "Round 2 dispatched when rounds >= 2 — verify call count = participants.length + 1 (synthesizer) + participants.length." This verifies the round-2 fan-out was not silently skipped.
- **Correlation with full metric:** HIGH — any off-by-one in the round-2 dispatch loop would be caught here.
- **Blind spots:** Does not verify the content of the synthesis prompt passed to round-2 participants; only verifies it was called.
- **Validated:** No — awaiting deferred validation at phase-84-workflow-integration

### P7: listDiscussions() and readDiscussion() I/O Helpers

- **What:** (a) `listDiscussions(cwd, 'v0.3.20')` with mocked `fs.readdirSync` returning `['discussion-83-planning-1234.md']` returns that filename array. (b) When `fs.existsSync` returns false, `listDiscussions()` returns `[]`. (c) `readDiscussion('discussion-83-planning-1234.md', cwd)` with mocked `fs.readFileSync` returns the file content. (d) When the file doesn't exist, `readDiscussion()` returns null.
- **How:** Four unit test cases mocking `fs` methods; assert return values.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/discussion.test.ts --verbose 2>&1 | grep -E "PASS|FAIL|listDiscussions|readDiscussion"`
- **Target:** All four I/O helper test cases pass green
- **Evidence:** Plan 83-02 must_haves: "listDiscussions() returns filenames from the discussions directory" and "readDiscussion() returns the content of a specific discussion file." These are direct behavioral specs.
- **Correlation with full metric:** HIGH — these are pure function contracts; mocking is exact.
- **Blind spots:** Does not test behavior with a real filesystem directory; real path resolution and permission errors are deferred.
- **Validated:** No — awaiting deferred validation at phase-84-workflow-integration

### P8: Coverage Thresholds Not Regressed

- **What:** Full test run with coverage reports that `lib/discussion.ts` meets lines >= 85, functions = 100, branches >= 85; `lib/paths.ts` meets lines >= 95, functions = 100, branches >= 95. No other per-file thresholds regress.
- **How:** Jest coverage report.
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm test -- --coverage 2>&1 | grep -E "discussion|paths|All files|Threshold"`
- **Target:** No threshold failure messages; `lib/discussion.ts` shows functions: 100%; `lib/paths.ts` shows functions: 100%
- **Evidence:** jest.config.js per-file thresholds (confirmed above). The `functions: 100` threshold is the hardest constraint — it means any exported function that lacks a test call causes the entire coverage gate to fail.
- **Correlation with full metric:** MEDIUM — high coverage indicates all exported functions and major branches were exercised; does not guarantee correctness of behavior within those branches.
- **Blind spots:** A test can call a function and not assert its output; functions: 100 does not mean correctness: 100.
- **Validated:** No — jest.config.js threshold enforcement provides ongoing mechanical validation

---

## Level 3: Deferred Validations

**Purpose:** Full validation requiring real AI CLI binaries, real filesystem I/O in a live project directory, or downstream integration with workflow commands.

### D1: Real End-to-End Discussion With Actual CLI Backends — DEFER-83-01

- **What:** Calling `runDiscussion('Should we use TypeScript strict mode?', ['claude', 'codex'], { rounds: 1, phase: '83', type: 'planning', cwd: '/path/to/test-project' })` with real installed CLI binaries (not mocks) completes without error, returns a `DiscussionResult` with non-empty `synthesis.response_text`, and produces a readable markdown file at the expected discussions path.
- **How:** Integration test or manual script that does NOT mock `dispatchToBackend`, `detectAvailableBackends`, or `fs`. Requires at least one real backend available.
- **Why deferred:** Requires installed AI CLI binaries (claude, codex, gemini, or opencode) with valid API keys or sessions. Not guaranteed in unit test environment. Real execution takes 30s–3 minutes per round.
- **Validates at:** phase-84-workflow-integration
- **Depends on:** At least one dispatchable backend installed and authenticated; a writable `.planning/milestones/` tree
- **Target:** `result.synthesis.response_text.length > 0`, `result.discussion_file` exists on disk with content, `result.duration_ms > 0`, no exceptions thrown
- **Risk if unmet:** The orchestration layer may have a logic bug (e.g., synthesis prompt construction error, round-2 context missing) that mocks do not expose. Discovery at phase-84 leaves one phase of debugging budget.
- **Fallback:** If real dispatch produces errors, check that `BACKEND_CLI_MAP` entries still match current CLI versions (DEFER-82-01 and DEFER-82-02 may also need resolution first).

### D2: Real File Written to Milestone Discussions Directory — DEFER-83-02

- **What:** The markdown file produced by `runDiscussion()` is readable, contains the original topic in the header, includes one section per round, includes the synthesis section, and is named correctly (`discussion-{phase}-{type}-{timestamp}.md`).
- **How:** After a successful end-to-end run (DEFER-83-01), read and validate the written file with `readDiscussion()`.
- **Why deferred:** File format correctness requires a real run because the markdown builder (`buildDiscussionMarkdown()`) is not tested for content quality in unit tests — only for the fact that `writeFileSync` was called.
- **Validates at:** phase-84-workflow-integration
- **Depends on:** DEFER-83-01 completed successfully; the file exists on disk
- **Target:** File contains topic string, contains "## Round 1" heading, contains "## Synthesis" heading, filename matches `/discussion-\d+-\w+-\d+\.md/` regex
- **Risk if unmet:** History files are unreadable or malformed. REQ-144 (discussion history audit trail) would be partially unmet. Markdown format fix is a low-effort patch.
- **Fallback:** Fix `buildDiscussionMarkdown()` template and re-run. No architectural change needed.

### D3: DEFER-82-03 Closure — enabled:false Short-Circuit — DEFER-83-03

- **What:** When `config.discussion.enabled` is false, no call to `runDiscussion()` is made from any workflow entry point (planning, execution, discussion trigger). Zero spawned processes.
- **How:** Integration test in phase 84 that calls `gd execute-phase` on a test project with `"discussion": { "enabled": false }` in config, then verifies `dispatchToBackend` was never called (or via process-level inspection that no AI CLI was spawned).
- **Why deferred:** The `enabled: false` guard lives in the workflow integration layer (phase 84+), not in `runDiscussion()` itself. Phase 83 does not implement the trigger points that would call `runDiscussion()`.
- **Validates at:** phase-84-workflow-integration
- **Depends on:** Workflow integration layer (phase 84) that reads `discussion.enabled` before dispatching
- **Target:** Zero `dispatchToBackend` calls when `enabled: false`; no latency regression on standard planning/execution commands
- **Risk if unmet:** Discussions run even when disabled, causing unwanted API charges and latency for users who opted out. Medium-severity regression.
- **Fallback:** Add explicit `if (!config.discussion?.enabled) return;` guard at the workflow entry point where `runDiscussion()` would be called.

---

## Ablation Plan

**No ablation plan** — Phase 83 implements a single orchestration function with no sub-components that could be independently toggled off. The round-2 path is controlled by the `rounds` option (tested in SC5/P5), not by a sub-component. The synthesizer is a single dispatch call, not an independently ablatable module. The skipped-participant guard is a correctness requirement, not an optional feature.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. Phase 83 is pure backend TypeScript infrastructure (`lib/types.ts`, `lib/paths.ts`, `lib/discussion.ts`).

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| lib/discussion.ts coverage | Per-file threshold (new in Phase 82) | lines >= 85%, functions = 100%, branches >= 85% | jest.config.js |
| lib/paths.ts coverage | Per-file threshold (existing) | lines >= 95%, functions = 100%, branches >= 95% | jest.config.js |
| lib/backend.ts coverage | Per-file threshold (existing, must not regress) | lines >= 95%, functions = 100%, branches >= 86% | jest.config.js |
| Overall lib/ coverage | Product quality target | >= 80% line coverage | PRODUCT-QUALITY.md |
| CLI response time | Operational requirement | < 500ms for `gd` commands (discussion is not a CLI command in this phase) | PRODUCT-QUALITY.md |
| Zero runtime deps | Design principle | 0 new runtime dependencies; all Node.js built-ins | PRODUCT-QUALITY.md |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/discussion.test.ts   — extended in plan 83-02
tests/unit/paths.test.ts        — extended in plan 83-01
```

**How to run full phase evaluation:**
```bash
# Level 1 — all sanity checks in sequence
cd /Users/neo/Developer/Projects/GetResearchDone

# S1: compilation
npm run build:check

# S2: lint
npm run lint

# S3: discussion module exports
node -e "const d = require('./lib/discussion'); console.log(Object.keys(d).sort().join(','))"

# S4: paths module exports
node -e "const p = require('./lib/paths'); console.log(typeof p.discussionsDir)"

# S5: crash test
node -e "const { runDiscussion } = require('./lib/discussion'); console.log(typeof runDiscussion)"

# S6: no regressions
npm test 2>&1 | tail -20

# S7: discussionsDir path structure
node -e "const { discussionsDir } = require('./lib/paths'); const r = discussionsDir('/some/project', 'v0.3.20'); console.log(r.endsWith('.planning/milestones/v0.3.20/discussions'))"

# Level 2 — proxy metrics
npx jest tests/unit/discussion.test.ts --verbose
npx jest tests/unit/paths.test.ts --verbose
npm test -- --coverage 2>&1 | grep -E "discussion|paths|All files|Threshold"
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compilation | | | |
| S2: ESLint pass | | | |
| S3: Discussion module exports shape | | | |
| S4: Paths module exports shape | | | |
| S5: Pipeline crash test | | | |
| S6: No phase 82 regressions | | | |
| S7: discussionsDir path structure | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: SC1 — all participants dispatched round 1 | dispatchToBackend called N+1 times | | | |
| P2: SC2 — DiscussionResult shape | all 6 fields present + typed | | | |
| P3: SC3 — file written before return | writeFileSync called once with .md path | | | |
| P4: SC4 — skipped participant | `{ skipped: true, reason }` entry in rounds[0] | | | |
| P5: SC5 — rounds clamping | rounds 0→1, 4→3, 2→2 | | | |
| P6: Round 2 dispatch count | 5 calls for 2-participant 2-round run | | | |
| P7: listDiscussions / readDiscussion | filenames returned; null on missing | | | |
| P8: Coverage thresholds | discussion: lines 85/fn 100/br 85; paths: lines 95/fn 100/br 95 | | | |

### Ablation Results

No ablation conditions defined for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-83-01 | Real end-to-end discussion with actual CLI backends | PENDING | phase-84-workflow-integration |
| DEFER-83-02 | Real markdown file written to milestone discussions directory | PENDING | phase-84-workflow-integration |
| DEFER-83-03 | enabled:false short-circuit (closure of DEFER-82-03) | PENDING | phase-84-workflow-integration |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — compilation, lint, export shape, and crash checks collectively catch all structural errors before any test runs. S7 catches the most likely silent bug (wrong path returned from `discussionsDir`).
- Proxy metrics: Well-evidenced — P1 through P6 map one-to-one to the five phase success criteria plus the round-2 count check. Each proxy is a direct behavioral test with HIGH correlation to the real metric (the mock-versus-real distinction only matters for the actual CLI execution, which is correctly deferred). P8 provides the mechanical coverage gate.
- Deferred coverage: Comprehensive for this phase — DEFER-83-01 covers real dispatch, DEFER-83-02 covers file format quality, DEFER-83-03 closes the config-disable validation from Phase 82. All three have a clear `validates_at` target (phase-84-workflow-integration).

**What this evaluation CAN tell us:**
- Whether all TypeScript types compile and are importable without error
- Whether `runDiscussion()` calls `dispatchToBackend` the correct number of times for each round configuration
- Whether all six `DiscussionResult` fields are present and populated
- Whether `fs.writeFileSync` is called synchronously before the function resolves
- Whether unavailable participants produce `{ skipped: true, reason }` entries (not exceptions)
- Whether round clamping logic correctly enforces 1-3
- Whether `listDiscussions()` and `readDiscussion()` return the correct values for mocked filesystem state
- Whether all coverage thresholds are met (including the strict functions: 100 gates)

**What this evaluation CANNOT tell us:**
- Whether real `runDiscussion()` with actual installed CLIs returns non-empty synthesis responses (deferred: DEFER-83-01, phase-84)
- Whether the markdown file produced has correct structure and human-readable format (deferred: DEFER-83-02, phase-84)
- Whether the `discussion.enabled: false` config guard prevents dispatch in practice from workflow entry points (deferred: DEFER-83-03, phase-84)
- Whether `Promise.allSettled()` + `execFileSync` produces acceptable wall-clock latency for 3-4 participants across 2-3 rounds in a real session (deferred: DEFER-83-01, performance aspect)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-23*
