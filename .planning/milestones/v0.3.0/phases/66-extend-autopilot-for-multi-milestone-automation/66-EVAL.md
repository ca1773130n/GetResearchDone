# Evaluation Plan: Phase 66 — Extend Autopilot for Multi-Milestone Automation

**Designed:** 2026-03-03
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Multi-milestone autopilot orchestration (`runMultiMilestoneAutopilot`, helper functions, CLI integration)
**Reference papers:** N/A — this is a pure engineering feature (no research paper)

## Evaluation Overview

Phase 66 extends the existing single-milestone autopilot (`runAutopilot`) with multi-milestone orchestration capability. The new feature adds three layers: core orchestration logic and types (Plan 01), CLI and MCP integration (Plan 02), and comprehensive test coverage (Plan 03).

There are no benchmark datasets or reference papers for this phase — it is a deterministic systems engineering problem, not an ML/research problem. The evaluation methodology therefore derives from: (a) the plan's own success criteria, (b) existing codebase standards enforced by the CI toolchain (TypeScript strict mode, ESLint, per-file coverage thresholds), and (c) behavioral correctness of the orchestration loop itself.

The most meaningful verification available in-phase is coverage-backed unit testing with mocked subprocesses. The one validation that genuinely requires deferral is end-to-end multi-milestone execution against a real long-term roadmap — that requires an actual Claude CLI, a real LT roadmap, and multiple milestone cycles.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript strict-mode compile | Project standard (tsconfig.json, CLAUDE.md) | Zero TS errors is the gating type-safety bar for all new lib/ code |
| ESLint pass (no errors) | Project standard (eslint.config.js, CLAUDE.md) | No unused vars, no explicit any in core modules |
| Existing autopilot tests pass | Regression safety baseline | 85 tests already verify runAutopilot behavior; regressions indicate breakage |
| New test count >= 30 | Plan 03 success criteria | Minimum coverage for all new functions and scenarios |
| autopilot.ts coverage >= L93/F93/B80 | jest.config.js per-file thresholds | Existing thresholds must be maintained (or minimally adjusted) after expansion |
| CLI command executes without crash | Plan 02 success criteria | User-facing surface must be functional |
| MCP tool registration | Plan 02 success criteria | Tools must appear in tools/list for MCP consumers |
| Full suite passes (2,676+ tests) | Project baseline (STATE.md) | Zero regressions across entire codebase |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 | Compilation, lint, crash-free execution, format validation |
| Proxy (L2) | 5 | Test count, coverage thresholds, flag parsing, output shape |
| Deferred (L3) | 2 | Real multi-milestone end-to-end run, production long-term roadmap traversal |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript strict-mode compilation

- **What:** All modified and new TypeScript files (`lib/autopilot.ts`, `lib/types.ts`, `bin/grd-tools.ts`, `lib/mcp-server.ts`, `lib/context/project.ts`) compile with zero errors under strict mode.
- **Command:** `npx tsc --noEmit`
- **Expected:** Exit code 0, no output (any error messages indicate failure)
- **Failure means:** Type errors in new code — either missing interface definitions, incorrect type casts, or `any` usage that violates the zero-any rule for core lib/ modules.

### S2: ESLint passes on modified files

- **What:** No ESLint errors on the five files modified by this phase.
- **Command:** `npm run lint`
- **Expected:** Exit code 0, no error lines (warnings acceptable if not blocking)
- **Failure means:** Unused variables, no-explicit-any violation, or import style problems — all must be fixed before merge.

### S3: Existing autopilot tests pass without modification

- **What:** The 85 existing tests in `tests/unit/autopilot.test.ts` all pass. No pre-existing test may be modified to make new code pass.
- **Command:** `npx jest tests/unit/autopilot.test.ts --no-coverage`
- **Expected:** `Tests: 85 passed` (or more if runner counts differ), `0 failed`
- **Failure means:** Plan 01 or Plan 02 changes introduced a regression in existing autopilot behavior — the most critical sanity failure for this phase.

### S4: CLI command executes without crash

- **What:** The new `multi-milestone-autopilot` command can be invoked via grd-tools.js with `--dry-run` and returns structured output.
- **Command:** `node bin/grd-tools.js multi-milestone-autopilot --dry-run --raw`
- **Expected:** Non-crash exit (exit code 0 or 1 for dry-run), JSON-parseable output to stdout, no uncaught exceptions
- **Failure means:** CLI routing is broken, `cmdMultiMilestoneAutopilot` is not exported, or the pre-flight check throws unexpectedly.

### S5: Init subcommand returns JSON

- **What:** `init multi-milestone-autopilot` outputs valid JSON with pre-flight fields.
- **Command:** `node bin/grd-tools.js init multi-milestone-autopilot --raw`
- **Expected:** Valid JSON with at minimum: `claude_available`, `lt_roadmap_exists`, `current_milestone`, `milestone_complete` keys
- **Failure means:** Pre-flight context builder is broken or the subcommand routing is missing.

### S6: New exports are accessible

- **What:** All seven new exports from `lib/autopilot.ts` resolve correctly via require.
- **Command:** `node -e "const m = require('./lib/autopilot'); const keys = ['runMultiMilestoneAutopilot','isMilestoneComplete','resolveNextMilestone','buildNewMilestonePrompt','buildMilestoneCompletePrompt','cmdMultiMilestoneAutopilot','cmdInitMultiMilestoneAutopilot']; keys.forEach(k => { if (typeof m[k] !== 'function') throw new Error('Missing: ' + k); }); console.log('OK')"`
- **Expected:** Prints `OK`, exits 0
- **Failure means:** One or more functions were not added to `module.exports` in `lib/autopilot.ts`.

### S7: New types exported from types.ts

- **What:** `MultiMilestoneOptions`, `MilestoneStepResult`, and `MultiMilestoneResult` are importable as types (compile-time check only).
- **Command:** `npx tsc --noEmit` (covered by S1, but verified via grep as a secondary documentation check)
- **Command (secondary):** `grep -c 'MultiMilestoneOptions\|MilestoneStepResult\|MultiMilestoneResult' lib/types.ts`
- **Expected:** grep count >= 3
- **Failure means:** Type definitions were added to a different file or with non-exported visibility.

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to proxy evaluation or merging.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of correctness and completeness.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full end-to-end evaluation. They measure testable properties that correlate with the goal of correct multi-milestone orchestration.

### P1: New test count — minimum 30 tests

- **What:** The number of new tests added to `tests/unit/autopilot.test.ts` covering multi-milestone functions.
- **How:** Count `it(` / `test(` occurrences added for new describes (`isMilestoneComplete`, `resolveNextMilestone`, `buildNewMilestonePrompt`, `buildMilestoneCompletePrompt`, `runMultiMilestoneAutopilot`, `cmdMultiMilestoneAutopilot`, `cmdInitMultiMilestoneAutopilot`)
- **Command:** `npx jest tests/unit/autopilot.test.ts --verbose --no-coverage 2>&1 | grep '✓\|✗\|○' | wc -l`
- **Target:** >= 115 total (85 existing + 30 new minimum)
- **Evidence:** Plan 03 success criteria explicitly states 30+ new tests; this is derived from the number of new functions and their documented scenarios (isMilestoneComplete: 5+, resolveNextMilestone: 4+, runMultiMilestoneAutopilot: 5+, prompt builders: 3+ each, CLI handlers: 3+ each)
- **Correlation with full metric:** MEDIUM — test count correlates with scenario coverage but does not guarantee correctness of untested edge cases (e.g., real filesystem paths, actual LT roadmap parsing edge cases)
- **Blind spots:** Mocked subprocess tests cannot verify that the actual Claude CLI is spawned with the correct arguments under real conditions. Mock fidelity is assumed but not proven.
- **Validated:** No — awaiting deferred validation at phase-66-end-to-end

### P2: Per-file coverage thresholds met

- **What:** `lib/autopilot.ts` meets or exceeds coverage thresholds after expansion (lines >= 93%, functions >= 93%, branches >= 80%).
- **How:** Jest coverage report for autopilot.ts specifically.
- **Command:** `npx jest tests/unit/autopilot.test.ts --coverage --coveragePathPattern='lib/autopilot' 2>&1 | grep 'autopilot.ts'`
- **Target:** Lines >= 93, Functions >= 93, Branches >= 80 (matching `jest.config.js` thresholds; minimal downward adjustment of 1-2 points acceptable if documented)
- **Evidence:** These thresholds are already enforced in CI for the existing autopilot.ts (jest.config.js line 14). Maintaining them after adding ~200 lines of new code requires commensurate new test coverage — the threshold itself is the proxy.
- **Correlation with full metric:** HIGH — coverage thresholds are a strong proxy for code path exercise in unit tests, though branch coverage at 80% means 20% of branches may go untested.
- **Blind spots:** Coverage measures line/branch execution, not behavioral correctness. A test that calls a function and ignores the return value counts for coverage but proves nothing about the output.
- **Validated:** No — awaiting full suite run at Plan 03 completion

### P3: Full test suite passes with no regressions

- **What:** All 2,676+ tests in the project pass after Phase 66 changes.
- **How:** Full `npm test` run.
- **Command:** `npm test`
- **Target:** 0 failures, total test count >= 2,676 (baseline from STATE.md), all per-file coverage thresholds met
- **Evidence:** The project's baseline is 2,676 tests (STATE.md Performance Metrics). Any reduction indicates test deletion or suite corruption. Any new failures indicate regressions.
- **Correlation with full metric:** HIGH — if the full suite passes, the new feature integrates without breaking existing capabilities.
- **Blind spots:** Tests are written against mocked subprocesses. The integration with a real LT roadmap and real Claude CLI is not tested by the unit suite.
- **Validated:** No — end-to-end subprocess behavior deferred to DEFER-66-01

### P4: CLI flag parsing — all flags accepted

- **What:** All seven documented flags (`--max-milestones`, `--dry-run`, `--resume`, `--timeout`, `--max-turns`, `--model`, `--skip-plan`, `--skip-execute`) are parsed correctly by `cmdMultiMilestoneAutopilot`.
- **How:** Unit tests for `cmdMultiMilestoneAutopilot` verify that each flag is parsed and passed through to `MultiMilestoneOptions`.
- **Command:** `npx jest tests/unit/autopilot.test.ts -t "cmdMultiMilestoneAutopilot" --verbose --no-coverage`
- **Target:** All flag-parsing tests pass, output confirms correct option values
- **Evidence:** Plan 02 explicitly lists all flags that must be supported; Plans 01 and 03 confirm option interfaces and test coverage requirements.
- **Correlation with full metric:** HIGH for correct parsing; MEDIUM for correct downstream behavior (options are passed to runMultiMilestoneAutopilot but subprocess invocation is mocked).
- **Blind spots:** Correct parsing does not guarantee the flags are honored in subprocess spawning (e.g., `--model` reaching the claude CLI invocation).
- **Validated:** No — subprocess argument verification deferred to DEFER-66-01

### P5: MCP tool visible in server descriptor list

- **What:** `multi-milestone-autopilot` and `init multi-milestone-autopilot` appear as registered tool descriptors in `lib/mcp-server.ts` COMMAND_DESCRIPTORS.
- **How:** Static grep check on the source file.
- **Command:** `grep -c 'multi-milestone-autopilot' lib/mcp-server.ts`
- **Target:** >= 2 (one for the command, one for the init subcommand)
- **Evidence:** Plan 02 requires both tool descriptors to be added. This is a structural check, not a runtime check.
- **Correlation with full metric:** LOW — presence in COMMAND_DESCRIPTORS does not guarantee the MCP server routes calls correctly at runtime. However, combined with S1 (compile check) and the existing MCP server test coverage, it is a reasonable proxy.
- **Blind spots:** MCP runtime routing depends on execute handlers being correct, which requires runtime invocation to verify.
- **Validated:** No — MCP runtime verification deferred to DEFER-66-02

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring live subprocess execution or a real long-term roadmap — neither of which can be safely run in-phase.

### D1: Real multi-milestone end-to-end execution — DEFER-66-01

- **What:** `runMultiMilestoneAutopilot` correctly executes a complete milestone, detects completion, resolves the next milestone from a real LONG-TERM-ROADMAP.md, spawns `grd:new-milestone` via `claude -p`, and continues autopilot in the new milestone.
- **How:** Invoke `node bin/grd-tools.js multi-milestone-autopilot --max-milestones 2` against a real test project with a long-term roadmap that has two planned milestones, where the first milestone has one incomplete phase.
- **Why deferred:** Requires actual `claude -p` subprocess execution, a real Claude CLI, and network access. This cannot be mocked in unit tests without trivializing the subprocess behavior. Running it in-phase risks consuming significant time and resources.
- **Validates at:** Next project with a long-term roadmap where multi-milestone autopilot is invoked in production (or a dedicated end-to-end test environment)
- **Depends on:** Claude CLI available, LONG-TERM-ROADMAP.md with >= 2 planned milestones, grd-tools.js multi-milestone-autopilot command functional (S4 must pass)
- **Target:** Successful transition across 1 milestone boundary — milestone 1 completed, milestone 2 created and phases started — with correct log entries in autopilot.log
- **Risk if unmet:** If `resolveNextMilestone` or `buildNewMilestonePrompt` has a logical error, the feature silently fails by stopping after the first milestone without transitioning. This would be caught when the feature is first used in production.
- **Fallback:** Add an integration smoke test that runs `--dry-run` mode against a fixture LT roadmap to verify the resolution logic without spawning Claude. This partially covers the risk.

### D2: MCP runtime routing for multi-milestone-autopilot — DEFER-66-02

- **What:** The MCP server correctly routes `tool_call` requests for `multi-milestone-autopilot` and `init multi-milestone-autopilot` to the correct handlers, with correct parameter deserialization.
- **How:** Start the MCP server (`node bin/grd-mcp-server.js`) and send a JSON-RPC `tools/call` request for `multi-milestone-autopilot` with `dry_run: true`.
- **Why deferred:** MCP server tests in the existing suite mock the stdio transport. Verifying actual JSON-RPC dispatch requires running the server process. The existing mcp-server.ts coverage threshold (lines: 90, branches: 55) indicates known gaps in branch coverage of the dispatch logic.
- **Validates at:** Phase where MCP integration is explicitly tested (or live MCP environment per DEFER-43-02)
- **Depends on:** MCP server running, JSON-RPC client available, multi-milestone-autopilot tool registered (P5 must pass)
- **Target:** Valid JSON-RPC response from the server with `dry-run` result structure matching `MultiMilestoneResult` schema
- **Risk if unmet:** MCP consumers (e.g., Claude Code calling the tool via MCP) would silently fail to invoke multi-milestone autopilot. Users would see a tool-call-failed error.
- **Fallback:** The CLI path (`node bin/grd-tools.js multi-milestone-autopilot`) is fully functional and serves as the primary interface. MCP failure is recoverable.

---

## Ablation Plan

**No ablation plan** — This phase implements a single coherent feature (multi-milestone orchestration loop) with no sub-components that make sense to ablate independently. The individual functions (`isMilestoneComplete`, `resolveNextMilestone`, `buildNewMilestonePrompt`, `buildMilestoneCompletePrompt`) are each individually unit-tested, which serves the purpose of isolating component contributions.

One behavioral comparison is worth noting as a pseudo-ablation:

| Condition | Expected | Source |
|-----------|----------|--------|
| `--dry-run` mode | Milestone transitions logged but no Claude subprocess spawned; `stopped_at` shows intended next milestone | Plan 03 test scenario |
| `--max-milestones 1` with next milestone available | Loop exits after processing first milestone; `milestones_attempted == 1` | Plan 03 test scenario (safety cap) |
| No LONG-TERM-ROADMAP.md present | `resolveNextMilestone` returns null; loop exits gracefully with appropriate `stopped_at` | Plan 03 test scenario |

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Total tests | Current project test count | >= 2,676 | STATE.md Performance Metrics |
| autopilot.ts lines coverage | Current Jest coverage threshold | >= 93% | jest.config.js line 14 |
| autopilot.ts functions coverage | Current Jest coverage threshold | >= 93% | jest.config.js line 14 |
| autopilot.ts branches coverage | Current Jest coverage threshold | >= 80% | jest.config.js line 14 |
| Existing autopilot test count | Tests before Phase 66 | 85 | Verified by running `npx jest tests/unit/autopilot.test.ts` |
| TypeScript strict compile | Zero errors across lib/ and bin/ | 0 errors | Phase 65 DEFER-58-01 resolved |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/autopilot.test.ts  — unit tests (all three tiers exercised here)
```

**How to run full evaluation:**
```bash
# Level 1: Sanity
npx tsc --noEmit
npm run lint
npx jest tests/unit/autopilot.test.ts --no-coverage
node bin/grd-tools.js multi-milestone-autopilot --dry-run --raw
node bin/grd-tools.js init multi-milestone-autopilot --raw
node -e "const m = require('./lib/autopilot'); ['runMultiMilestoneAutopilot','isMilestoneComplete','resolveNextMilestone','buildNewMilestonePrompt','buildMilestoneCompletePrompt','cmdMultiMilestoneAutopilot','cmdInitMultiMilestoneAutopilot'].forEach(k => { if (typeof m[k] !== 'function') throw new Error('Missing: ' + k); }); console.log('OK')"
grep -c 'MultiMilestoneOptions\|MilestoneStepResult\|MultiMilestoneResult' lib/types.ts

# Level 2: Proxy
npx jest tests/unit/autopilot.test.ts --verbose --no-coverage 2>&1 | grep -c '✓\|✗\|○'
npx jest tests/unit/autopilot.test.ts --coverage --coveragePathPattern='lib/autopilot' 2>&1 | grep 'autopilot.ts'
npm test
npx jest tests/unit/autopilot.test.ts -t "cmdMultiMilestoneAutopilot" --verbose --no-coverage
grep -c 'multi-milestone-autopilot' lib/mcp-server.ts
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: tsc --noEmit | | | |
| S2: eslint | | | |
| S3: Existing 85 tests pass | | | |
| S4: CLI --dry-run no crash | | | |
| S5: Init returns JSON | | | |
| S6: New exports accessible | | | |
| S7: Types in types.ts | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Total test count | >= 115 | | | |
| P2: autopilot.ts coverage (L/F/B) | 93/93/80 | | | |
| P3: Full suite passes | 2,676+ tests, 0 fail | | | |
| P4: CLI flag parsing tests | All pass | | | |
| P5: MCP descriptor count | >= 2 | | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-66-01 | Real multi-milestone end-to-end execution | PENDING | Live production or dedicated E2E env |
| DEFER-66-02 | MCP runtime routing for multi-milestone-autopilot | PENDING | Live MCP environment (per DEFER-43-02) |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH for sanity and proxy tiers; LOW for deferred tier (fundamentally cannot test real subprocess orchestration in unit tests).

**Justification:**
- Sanity checks: Adequate — all seven checks are mechanical, fast, and fully automatable with exact commands. TypeScript strict mode and ESLint are strong gatekeepers.
- Proxy metrics: Well-evidenced — test count and coverage thresholds are project-standard metrics with known enforcement mechanisms. The correlation between mocked-subprocess unit tests and real orchestration behavior is MEDIUM, explicitly acknowledged.
- Deferred coverage: Partial — the two deferred items cover the genuinely critical paths (real subprocess execution, MCP runtime routing). Dry-run mode serves as a partial mitigation for DEFER-66-01.

**What this evaluation CAN tell us:**
- Whether new TypeScript types and functions compile correctly under strict mode
- Whether new functions are exported and accessible at runtime
- Whether the CLI and MCP integration surfaces are wired up correctly
- Whether unit-level logic (milestone completion detection, next-milestone resolution, prompt generation, flag parsing) behaves correctly against mocked inputs
- Whether the full codebase remains regression-free after the addition

**What this evaluation CANNOT tell us:**
- Whether `runMultiMilestoneAutopilot` correctly orchestrates multiple real Claude subprocesses in sequence (deferred to DEFER-66-01 — requires live Claude CLI)
- Whether `resolveNextMilestone` handles all real LONG-TERM-ROADMAP.md formats produced by the `long-term-roadmap` module in production (deferred to DEFER-66-01)
- Whether the MCP tool dispatch correctly deserializes and routes JSON-RPC parameters at runtime (deferred to DEFER-66-02 — requires live MCP environment)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-03*
