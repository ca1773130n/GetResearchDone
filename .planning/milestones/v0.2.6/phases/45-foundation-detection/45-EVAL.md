# Evaluation Plan: Phase 45 — Foundation & Detection

**Designed:** 2026-02-21
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Backend capability detection, worktree lifecycle hook registration, agent frontmatter audit
**Reference papers:** N/A — infrastructure feature (Claude Code v2.1.50 native worktree support)

## Evaluation Overview

Phase 45 implements three independent, deterministic software changes: (1) adding a capability flag to `BACKEND_CAPABILITIES` and propagating it through `cmdInitExecutePhase`, (2) registering `WorktreeCreate`/`WorktreeRemove` hooks in `plugin.json` and implementing handler functions, and (3) auditing all 20 agent frontmatter fields for CLI display quality. All three plans operate at the `verification_level: sanity` tier — this is explicitly an infrastructure and scaffolding phase, not an algorithmic or ML phase.

There are no paper-derived metrics to replicate and no performance benchmarks to hit. Correctness is the only criterion: does the code do what it says, does it not break what exists, and does it integrate into the test suite cleanly? Proxy metrics exist in the form of test coverage and lint compliance, both of which are well-evidenced (the jest.config.js enforces per-file coverage thresholds and ESLint is enforced by the pre-commit hook). Deferred validation is limited to runtime behavior that requires a live Claude Code v2.1.50+ environment.

Because all three plans are in Wave 1 (independent), this evaluation covers them as a unit. Each plan has its own sanity section and can be verified independently.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| All unit tests pass | jest.config.js + existing test baseline | Zero-regression policy; 89 backend tests + 74 context tests + 45 worktree tests must pass |
| lint passes clean | eslint.config.js + pre-commit hook | Enforced quality gate; blocks commits |
| backend.js coverage >= 90% lines | jest.config.js `./lib/backend.js` threshold | Per-file threshold; new code must stay covered |
| context.js coverage >= 70% lines | jest.config.js `./lib/context.js` threshold | Per-file threshold |
| worktree.js hook skips when inactive | Plan 45-02 success criteria | No-op guarantee is safety-critical |
| agent count == 20 | Plan 45-03 success criteria | Regression guard: no agents accidentally deleted |
| All agent names unique with grd- prefix | Plan 45-03 success criteria | Clean `claude agents` CLI display |
| All descriptions <= 200 chars | Plan 45-03 success criteria | CLI truncation avoidance |
| No template variables in descriptions | Plan 45-03 success criteria | 3 agents known to have `${...}` refs |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 12 | Basic functionality, format, zero-regression, output correctness |
| Proxy (L2) | 3 | Test coverage thresholds as indirect quality signal |
| Deferred (L3) | 2 | Live Claude Code runtime validation |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Backend capability flag present in BACKEND_CAPABILITIES

- **What:** Verify `BACKEND_CAPABILITIES.claude.native_worktree_isolation` is `true` and all other backends are `false`
- **Command:** `node -e "const {BACKEND_CAPABILITIES} = require('./lib/backend'); console.log(JSON.stringify({claude: BACKEND_CAPABILITIES.claude.native_worktree_isolation, codex: BACKEND_CAPABILITIES.codex.native_worktree_isolation, gemini: BACKEND_CAPABILITIES.gemini.native_worktree_isolation, opencode: BACKEND_CAPABILITIES.opencode.native_worktree_isolation}));"`
- **Expected:** `{"claude":true,"codex":false,"gemini":false,"opencode":false}`
- **Failure means:** Plan 45-01 Task 1 incomplete — capability flag not written to `BACKEND_CAPABILITIES`

### S2: native_worktree_available appears in cmdInitExecutePhase output

- **What:** Verify the field exists in the JSON produced by `cmdInitExecutePhase`
- **Command:** `node bin/grd-tools.js init execute-phase 45 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('has_field:', 'native_worktree_available' in d, 'value:', d.native_worktree_available);"`
- **Expected:** `has_field: true value: true` (on Claude Code backend, which is the default)
- **Failure means:** Plan 45-01 Task 2 incomplete — field not added to `cmdInitExecutePhase`

### S3: backend.test.js all tests pass including new capability tests

- **What:** Full backend test suite with zero failures
- **Command:** `npx jest tests/unit/backend.test.js --no-coverage --verbose 2>&1 | tail -5`
- **Expected:** `Tests: [N] passed, [N] total` where N >= 95 (89 baseline + at least 6 new tests)
- **Failure means:** Regression in existing backend tests or new capability tests not written/passing

### S4: context.test.js all tests pass including new native_worktree_available tests

- **What:** Full context test suite with zero failures
- **Command:** `npx jest tests/unit/context.test.js --no-coverage --verbose 2>&1 | tail -5`
- **Expected:** `Tests: [N] passed, [N] total` where N >= 77 (74 baseline + at least 3 new tests)
- **Failure means:** Regression in existing context tests or new init field tests not written/passing

### S5: plugin.json is valid JSON with all three hooks registered

- **What:** JSON validity and presence of all three expected hook keys
- **Command:** `node -e "const p=JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); console.log('SessionStart:', !!p.hooks.SessionStart, 'WorktreeCreate:', !!p.hooks.WorktreeCreate, 'WorktreeRemove:', !!p.hooks.WorktreeRemove);"`
- **Expected:** `SessionStart: true WorktreeCreate: true WorktreeRemove: true`
- **Failure means:** Plan 45-02 Task 1 incomplete, or plugin.json corrupted (invalid JSON)

### S6: plugin.json SessionStart hook is unchanged

- **What:** Verify the original SessionStart hook content was not modified
- **Command:** `node -e "const p=JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); const cmd=p.hooks.SessionStart[0].hooks[0].command; console.log('ok:', cmd.includes('verify-path-exists') && cmd.includes('.planning'));"`
- **Expected:** `ok: true`
- **Failure means:** Plan 45-02 Task 1 accidentally mutated the existing SessionStart hook

### S7: worktree.test.js all tests pass including new hook handler tests

- **What:** Full worktree test suite with zero failures
- **Command:** `npx jest tests/unit/worktree.test.js --no-coverage --verbose 2>&1 | tail -5`
- **Expected:** `Tests: [N] passed, [N] total` where N >= 52 (45 baseline + at least 7 new hook tests)
- **Failure means:** Regression in existing worktree tests or hook handler tests not written/passing

### S8: Hook handlers skip correctly when GRD is inactive

- **What:** Verify `cmdWorktreeHookCreate` and `cmdWorktreeHookRemove` output skip JSON when no `.planning/` directory exists
- **Command:** `node bin/grd-tools.js worktree-hook-create /tmp/test-worktree test-branch 2>&1 | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('skipped:', d.skipped === true);"`
- **Expected:** `skipped: true` (because the test worktree path has no `.planning/` dir)
- **Failure means:** Plan 45-02 Task 2 incorrect — hook is performing actions when GRD is inactive

### S9: agent-audit.test.js passes with all 20 agents validated

- **What:** Automated frontmatter validation test suite passes
- **Command:** `npx jest tests/unit/agent-audit.test.js --no-coverage --verbose 2>&1 | tail -10`
- **Expected:** All tests pass; specifically "agent count is 20", "all agents have unique grd- names", "all agents have descriptions under 200 characters", "no descriptions contain template variables"
- **Failure means:** Agent frontmatter fixes in Plan 45-03 Task 1 not complete, or test file not created (Plan 45-03 Task 2)

### S10: No descriptions exceed 200 characters

- **What:** Shell-level verification of all 20 agent description lengths
- **Command:** `for f in agents/grd-*.md; do desc=$(grep "^description:" "$f" | head -1 | sed 's/description: //'); len=${#desc}; if [ $len -gt 200 ]; then echo "FAIL ($len chars): $f"; fi; done; echo "check complete"`
- **Expected:** Only `check complete` printed (no FAIL lines)
- **Failure means:** One or more of the 9 over-length descriptions (grd-product-owner, grd-eval-planner, grd-baseline-assessor, grd-executor, grd-project-researcher, grd-migrator, grd-roadmapper, grd-eval-reporter, grd-code-reviewer) were not trimmed

### S11: No template variable references in descriptions

- **What:** Verify `${...}` references removed from grd-deep-diver, grd-surveyor, grd-project-researcher descriptions
- **Command:** `for f in agents/grd-*.md; do desc=$(grep "^description:" "$f" | head -1); if echo "$desc" | grep -q '\${'; then echo "FAIL: $f"; fi; done; echo "check complete"`
- **Expected:** Only `check complete` printed (no FAIL lines)
- **Failure means:** Plan 45-03 Task 1 fix incomplete — template variable references remain in agent descriptions

### S12: lint passes clean across all modified files

- **What:** ESLint zero errors on all modified source files
- **Command:** `npm run lint 2>&1 | tail -3`
- **Expected:** No output errors; exit code 0
- **Failure means:** Code style violation in Plan 45-01 or 45-02 changes; pre-commit hook would block

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to Phase 46.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: lib/backend.js coverage meets per-file threshold

- **What:** Line, function, and branch coverage for the modified `lib/backend.js`
- **How:** Run Jest with coverage collection on the module
- **Command:** `npx jest tests/unit/backend.test.js --coverage --collectCoverageFrom='lib/backend.js' 2>&1 | grep -A 5 'backend.js'`
- **Target:** Lines >= 90%, Functions >= 100%, Branches >= 90% (per jest.config.js enforced threshold)
- **Evidence:** `jest.config.js` lines 58-62 enforce these thresholds; new `native_worktree_isolation` code paths must be covered by the new tests from Plan 45-01 Task 1
- **Correlation with full metric:** HIGH — coverage threshold directly enforced by CI; uncovered branches indicate untested code paths
- **Blind spots:** Coverage measures line execution, not logical correctness of the new capability flag values. A test that reads the value without asserting it would pass coverage but not correctness.
- **Validated:** No — threshold enforcement is automatic but does not validate behavior correctness; that is covered by Sanity checks S1-S4.

### P2: lib/context.js coverage meets per-file threshold

- **What:** Line and branch coverage for the modified `lib/context.js`
- **How:** Run Jest with coverage collection on the module
- **Command:** `npx jest tests/unit/context.test.js --coverage --collectCoverageFrom='lib/context.js' 2>&1 | grep -A 5 'context.js'`
- **Target:** Lines >= 70%, Functions >= 60%, Branches >= 60% (per jest.config.js enforced threshold)
- **Evidence:** `jest.config.js` lines 43-47 enforce these thresholds; `native_worktree_available` is a simple boolean derivation from an existing pattern, so adding it should not decrease coverage
- **Correlation with full metric:** MEDIUM — the context.js threshold is relatively low (70% lines) because the module has some hard-to-test configuration paths; meeting it is necessary but not sufficient
- **Blind spots:** The threshold could be met without testing the `false` case of `native_worktree_available` (when backend is not claude)
- **Validated:** No — awaiting deferred validation at phase-47-integration

### P3: Full test suite passes with no regressions

- **What:** All 1,694+ tests across the entire test suite continue to pass
- **How:** Run the full test suite (unit + integration) without coverage for speed
- **Command:** `npm run test:unit 2>&1 | tail -8`
- **Target:** Zero test failures; total test count >= 1,694 (existing baseline from STATE.md)
- **Evidence:** STATE.md records "Total tests: 1,694" as the running baseline; this milestone adds new tests, so the count should increase
- **Correlation with full metric:** HIGH — passing all unit tests is a direct proxy for zero regressions across all modified modules; integration tests provide additional validation
- **Blind spots:** Unit tests mock filesystem and config; real-environment behavior of hooks and capability detection is not captured (see Deferred section)
- **Validated:** No — awaiting deferred validation at phase-47-integration

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: WorktreeCreate/WorktreeRemove hooks fire at Claude Code runtime — DEFER-45-01

- **What:** End-to-end validation that Claude Code v2.1.50+ actually invokes the registered hooks when it creates/removes a worktree natively via `isolation: worktree`
- **How:** Configure a test project with `isolation: worktree` in an agent definition, trigger agent execution in Claude Code, observe that `worktree-hook-create` is invoked and produces expected JSON output with correct branch information
- **Why deferred:** Requires a live Claude Code v2.1.50+ runtime environment. Hook invocation cannot be simulated in unit tests — it requires the actual Claude Code process to fire the `WorktreeCreate` event.
- **Validates at:** phase-47-integration-regression
- **Depends on:** Phase 46 (hybrid execution) must be implemented first, as it provides the `isolation: worktree` agent definition that triggers native worktree creation; live Claude Code environment
- **Target:** Hook invokes without error, `{ hooked: true, worktree_path, branch }` logged, `2>/dev/null || true` ensures no Claude Code interruption on hook failure
- **Risk if unmet:** Hook format mismatch between `plugin.json` registration and Claude Code's actual hook invocation API. This would be a silent no-op — Claude Code would not call the handlers. Mitigation: Review Claude Code v2.1.50 plugin API documentation before Phase 46 implementation.
- **Fallback:** If hook invocation format is wrong, plugin.json can be updated with correct format without changing handler logic. Low-cost fix.

### D2: `native_worktree_available: true` drives correct Phase 46 routing — DEFER-45-02

- **What:** Validate that the `native_worktree_available` boolean emitted by `cmdInitExecutePhase` is correctly consumed by the Phase 46 orchestrator to choose between native Claude Code worktree isolation and the existing manual worktree path
- **How:** In Phase 46 planning, verify that the execute-phase.md command reads `native_worktree_available` from init JSON and branches accordingly; run a complete execute-phase workflow with both `native_worktree_available: true` (claude backend) and `native_worktree_available: false` (simulated non-claude backend) to confirm routing
- **Why deferred:** Phase 46 (hybrid execution) has not been implemented yet. The Phase 45 capability detection is a prerequisite for Phase 46; correctness of the detection is only meaningful when the consuming code exists.
- **Validates at:** phase-46-hybrid-worktree-execution
- **Depends on:** Phase 46 implementation of hybrid execution routing
- **Target:** When `native_worktree_available: true`, execute-phase uses `isolation: worktree`; when `false`, execute-phase uses existing `cmdWorktreeCreate` manual path
- **Risk if unmet:** Phase 45 detection code correct but Phase 46 doesn't read `native_worktree_available` from init JSON (uses a different field name or different detection logic). Mitigation: Document the exact field name contract between Phase 45 output and Phase 46 input in Phase 46 PLAN.md.
- **Fallback:** Field name can be aliased or renamed without changing detection logic if Phase 46 requires a different key.

---

## Ablation Plan

**No ablation plan** — Phase 45 implements three independent, additive changes (new capability flag, new hook registrations, frontmatter fixes). Each plan is atomic with no sub-components to isolate. Ablation analysis is not applicable to this type of infrastructure phase.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views.

Phase 45 modifies `lib/backend.js`, `lib/context.js`, `lib/worktree.js`, `bin/grd-tools.js`, `.claude-plugin/plugin.json`, and `agents/*.md` files. None of these are frontend views (HTML, JSX, TSX, Vue, Svelte, or CSS files).

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| backend tests | Existing backend test count before Phase 45 | 89 passing | `npx jest tests/unit/backend.test.js` baseline run |
| context tests | Existing context test count before Phase 45 | 74 passing | `npx jest tests/unit/context.test.js` baseline run |
| worktree tests | Existing worktree test count before Phase 45 | 45 passing | `npx jest tests/unit/worktree.test.js` baseline run |
| total test suite | All tests across unit + integration | 1,694+ | STATE.md "Total tests: 1,694" |
| lint baseline | Lint status before Phase 45 | Clean (exit 0) | `npm run lint` passes with no output |
| agent count | Number of agent files | 20 | `ls agents/grd-*.md \| wc -l` |
| descriptions over 200 chars | Agents needing description trim | 9 agents | Measured from current agent files |
| descriptions with template vars | Agents needing template var removal | 3 agents | grd-deep-diver, grd-project-researcher, grd-surveyor |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/backend.test.js        — Plan 45-01 capability tests (new tests added here)
tests/unit/context.test.js        — Plan 45-01 init field tests (new tests added here)
tests/unit/worktree.test.js       — Plan 45-02 hook handler tests (new tests added here)
tests/unit/agent-audit.test.js    — Plan 45-03 frontmatter validation (new file created)
```

**How to run full evaluation:**
```bash
# Full unit test suite (covers all three plans)
npm run test:unit

# Per-plan targeted runs
npx jest tests/unit/backend.test.js tests/unit/context.test.js --no-coverage --verbose
npx jest tests/unit/worktree.test.js --no-coverage --verbose
npx jest tests/unit/agent-audit.test.js --no-coverage --verbose

# Lint check
npm run lint

# Coverage enforcement (blocks if thresholds unmet)
npx jest tests/unit/backend.test.js tests/unit/context.test.js --coverage

# Agent sanity checks (shell-level)
for f in agents/grd-*.md; do desc=$(grep "^description:" "$f" | head -1 | sed 's/description: //'); len=${#desc}; echo "$len $f"; done | sort -rn | head -5
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Backend capability flag | | | |
| S2: native_worktree_available in init | | | |
| S3: backend.test.js passes | | | |
| S4: context.test.js passes | | | |
| S5: plugin.json all 3 hooks present | | | |
| S6: SessionStart hook unchanged | | | |
| S7: worktree.test.js passes | | | |
| S8: Hook skip when inactive | | | |
| S9: agent-audit.test.js passes | | | |
| S10: No descriptions > 200 chars | | | |
| S11: No template vars in descriptions | | | |
| S12: lint clean | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: backend.js line coverage | >= 90% | | | |
| P2: context.js line coverage | >= 70% | | | |
| P3: Full test suite passes | >= 1,694 tests | | | |

### Ablation Results

N/A — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-45-01 | WorktreeCreate/Remove hooks fire in live Claude Code | PENDING | phase-47-integration-regression |
| DEFER-45-02 | native_worktree_available drives Phase 46 routing | PENDING | phase-46-hybrid-worktree-execution |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 12 checks covering all three plans with exact commands and measurable expected outputs. The checks are complete relative to the phase goals.
- Proxy metrics: Well-evidenced — coverage thresholds are enforced by jest.config.js with specific per-file values; regression proxy (full test suite) directly measures what it claims to measure.
- Deferred coverage: Comprehensive for this phase — both deferred items are runtime-only behaviors that genuinely cannot be tested without a live Claude Code environment. Neither is a coverage gap from lack of effort; they are structurally deferred.

**What this evaluation CAN tell us:**
- Whether `BACKEND_CAPABILITIES.claude.native_worktree_isolation` is set to `true` (S1)
- Whether `cmdInitExecutePhase` produces the new `native_worktree_available` boolean (S2)
- Whether all existing tests still pass after changes (S3, S4, S7, P3)
- Whether `plugin.json` is valid JSON with correct hook registrations (S5, S6)
- Whether hook handlers correctly no-op when GRD is inactive (S8)
- Whether all 20 agent frontmatter fields meet CLI display quality requirements (S9-S11)
- Whether code style is clean (S12)

**What this evaluation CANNOT tell us:**
- Whether Claude Code actually invokes the registered hooks at runtime (DEFER-45-01 — addressed at phase-47)
- Whether Phase 46 correctly consumes `native_worktree_available` to select the native vs. manual worktree path (DEFER-45-02 — addressed at phase-46)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-21*
