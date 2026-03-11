---
phase: 72-hook-events-tool-updates
eval_version: 1
designed: 2026-03-11
designer: Claude (grd-eval-planner)
verification_level: sanity
---

# Evaluation Plan: Phase 72 — Hook Events & Tool Updates

**Designed:** 2026-03-11
**Designer:** Claude (grd-eval-planner)
**Methods evaluated:** Hook event registration (TEammateIdle, TaskCompleted, InstructionsLoaded), ExitWorktree integration, CLAUDE_SKILL_DIR audit
**Reference:** Claude Code v2.1.69-v2.1.72 changelog (accumulated in STATE.md); no external papers — this is a Claude Code platform feature sync

## Evaluation Overview

Phase 72 is a platform-sync phase, not an R&D phase with a paper to reproduce. The work falls into three categories: (1) wiring three new hook events in plugin.json and their handler functions in lib/worktree.ts and bin/grd-tools.ts, (2) adding ExitWorktree tool calls to markdown instruction files (commands/execute-phase.md, agents/grd-executor.md), and (3) a grep audit verifying no CLAUDE_SKILL_DIR migration is needed.

All three plans carry `verification_level: sanity`. The deliverables are largely structural — correct JSON, compilable TypeScript, functioning CLI commands, and correct markdown content. There are no performance regressions to measure, no quality metrics to compute, and no domain expert review required. The evaluation is therefore dominated by Level 1 sanity checks.

No meaningful proxy metrics exist for this phase (see Level 2 section for rationale). Deferred validation covers only the live runtime behavior of hooks, which requires a running Claude Code environment that cannot be simulated in CI.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compilation | Plan 72-01 verification criteria | New functions must compile without errors |
| ESLint pass | Project CLAUDE.md — pre-commit hook | Lint failures block commits |
| Unit test pass (existing) | lib/worktree.ts has 103 tests | Regressions in worktree.ts must be caught |
| plugin.json valid JSON | Plan 72-01 verification criteria | Invalid JSON prevents plugin from loading |
| Hook CLI commands produce output | Plan 72-01 verification criteria | Confirms handler dispatch is wired |
| ExitWorktree present in markdown files | Plan 72-02 verification criteria | Confirms agent instructions are updated |
| ExitWorktree conditional on native-only | Plan 72-02 verification criteria | Incorrect placement breaks non-native flows |
| Zero same-directory CLAUDE_PLUGIN_ROOT refs | Plan 72-03 verification criteria | Confirms no migration needed |
| Existing cross-directory refs unchanged | Plan 72-03 verification criteria | Confirms no accidental breakage |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 12 | Format, compilation, CLI output, content presence checks |
| Proxy (L2) | 0 | No meaningful proxy metrics for this phase |
| Deferred (L3) | 3 | Live hook firing, ExitWorktree runtime behavior, agent_type filtering |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### Plan 72-01: Hook Event Registration

#### S1: TypeScript compiles without errors
- **What:** `npm run build:check` passes after adding three new handler functions to lib/worktree.ts and three new CLI cases to bin/grd-tools.ts
- **Command:** `npm run build:check`
- **Expected:** Zero TypeScript errors, command exits 0
- **Failure means:** Function signatures, import destructuring, or type annotations are incorrect

#### S2: ESLint passes
- **What:** No lint errors introduced by new code
- **Command:** `npm run lint`
- **Expected:** Zero errors, command exits 0
- **Failure means:** Unused imports, incorrect `_` prefix on used args, or style violations

#### S3: Existing worktree unit tests still pass
- **What:** The 103 existing tests in tests/unit/worktree.test.ts are not broken by additions
- **Command:** `npx jest tests/unit/worktree.test.ts --coverage=false`
- **Expected:** 103 tests pass, 0 failures
- **Failure means:** New function code interferes with existing module logic or exports

#### S4: plugin.json is valid JSON
- **What:** File parses as valid JSON after adding three new hook entries
- **Command:** `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); console.log('valid JSON')"`
- **Expected:** Prints "valid JSON", exits 0
- **Failure means:** Missing comma between hook entries or malformed structure

#### S5: plugin.json contains all 6 hook events
- **What:** All three new hooks are registered alongside the three existing ones
- **Command:** `node -e "const p = JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); const keys = Object.keys(p.hooks); console.log(keys.join(', ')); console.log('count:', keys.length)"`
- **Expected:** Output contains SessionStart, WorktreeCreate, WorktreeRemove, TeammateIdle, TaskCompleted, InstructionsLoaded; count is 6
- **Failure means:** A hook entry was omitted or a key was misspelled

#### S6: teammate-idle-hook CLI command produces output
- **What:** Handler dispatch is correctly wired for TeammateIdle
- **Command:** `node bin/grd-tools.js teammate-idle-hook --raw`
- **Expected:** Output line containing "TeammateIdle: agent=unknown type=unknown action=continue", exits 0
- **Failure means:** CLI case is missing, import is broken, or function name is misspelled

#### S7: task-completed-hook CLI command produces output
- **What:** Handler dispatch is correctly wired for TaskCompleted
- **Command:** `node bin/grd-tools.js task-completed-hook --raw`
- **Expected:** Output line containing "TaskCompleted: agent=unknown type=unknown", exits 0
- **Failure means:** CLI case is missing or function throws unexpectedly

#### S8: instructions-loaded-hook CLI command produces output
- **What:** Handler dispatch is correctly wired for InstructionsLoaded
- **Command:** `node bin/grd-tools.js instructions-loaded-hook --raw`
- **Expected:** Output line containing "InstructionsLoaded: agent=unknown planning=", exits 0
- **Failure means:** CLI case is missing or fs.existsSync call throws

#### S9: Hook commands use graceful failure pattern
- **What:** All three new hook entries in plugin.json use `2>/dev/null || true`
- **Command:** `node -e "const p = JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); ['TeammateIdle','TaskCompleted','InstructionsLoaded'].forEach(k => { const cmd = p.hooks[k][0].hooks[0].command; console.log(k, cmd.includes('2>/dev/null || true') ? 'OK' : 'MISSING'); })"`
- **Expected:** All three print "OK"
- **Failure means:** Hook can crash the Claude Code session if grd-tools.js is unavailable

### Plan 72-02: ExitWorktree Integration

#### S10: ExitWorktree present in execute-phase.md
- **What:** The ExitWorktree tool call instruction appears in execute-phase.md
- **Command:** `grep -c "ExitWorktree" commands/execute-phase.md`
- **Expected:** Count >= 1
- **Failure means:** Task 1 of plan 72-02 was not executed or was reverted

#### S11: ExitWorktree in execute-phase.md is native-isolation-conditional
- **What:** The ExitWorktree instruction is guarded by an ISOLATION_MODE=native condition, not applied universally
- **Command:** `grep -B5 "ExitWorktree" commands/execute-phase.md | grep -i "native\|isolation"`
- **Expected:** At least one line in the surrounding context references "native" or "isolation"
- **Failure means:** ExitWorktree would be called in manual worktree or no-isolation modes, breaking those flows

#### S12: ExitWorktree present in grd-executor.md Mode A only
- **What:** ExitWorktree appears in the native isolation section, not in manual or no-isolation sections
- **Command:** `grep -c "ExitWorktree" agents/grd-executor.md`
- **Expected:** Count >= 1
- **Failure means:** Task 2 of plan 72-02 was not executed

### Plan 72-03: CLAUDE_SKILL_DIR Audit

#### S13: Zero same-directory command-to-command references
- **What:** No file in commands/ references `${CLAUDE_PLUGIN_ROOT}/commands/` (which would be a same-directory reference)
- **Command:** `grep -rn "CLAUDE_PLUGIN_ROOT/commands/" commands/ | wc -l`
- **Expected:** 0
- **Failure means:** Same-directory reference exists that could be migrated to CLAUDE_SKILL_DIR (would not be a blocker, just a finding)

#### S14: Zero same-directory agent-to-agent references
- **What:** No file in agents/ references `${CLAUDE_PLUGIN_ROOT}/agents/` (same-directory)
- **Command:** `grep -rn "CLAUDE_PLUGIN_ROOT/agents/" agents/ | wc -l`
- **Expected:** 0
- **Failure means:** Same-directory reference exists (same note as S13)

**Sanity gate:** ALL sanity checks S1-S14 must pass. S1-S9 (TypeScript, lint, tests, plugin.json) are hard blockers. S10-S12 (ExitWorktree placement) are hard blockers for correctness. S13-S14 (audit) have a pre-established baseline of 0 and a failure would be a finding, not a build failure.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance.

### No Proxy Metrics

**Rationale:** Phase 72 is a platform-sync phase with deterministic, structurally-verifiable deliverables. The correct output for each artifact is either "this JSON is valid and contains these keys" or "this file contains this text in this location." There is no quality gradient to measure indirectly.

Specific reasons proxy metrics do not apply here:

- **Hook handler quality** cannot be usefully proxied. The handlers contain ~10 lines each and either output the correct JSON structure or they do not. This is captured by S6-S8.
- **Markdown instruction quality** (ExitWorktree placement, CLAUDE_SKILL_DIR documentation) is verified by content-presence checks (S10-S12), not by downstream metrics. The "quality" of these instructions is only observable at live runtime.
- **Audit completeness** (Plan 72-03) is the audit itself — the grep results ARE the deliverable. Sanity checks S13-S14 are the complete evaluation.
- **Test coverage** for the new hook handler functions would be a natural proxy, but the new functions are thin wrappers around `process.stdout.write` and `process.env` reads. Coverage of these functions can be verified by adding unit tests (tracked as deferred), but proxy measurement of coverage is not meaningful given the trivial implementation complexity.

**Recommendation:** Rely on sanity checks (Level 1) and deferred live runtime validation (Level 3).

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring a live Claude Code environment with hook firing support.

### D1: Live hook events fire and handlers execute — DEFER-72-01
- **What:** TeammateIdle, TaskCompleted, and InstructionsLoaded hooks actually fire in a real Claude Code session and the grd-tools.js subcommands are invoked
- **How:** Start a Claude Code session in a GRD project, spawn a teammate agent, observe hook invocation in session logs or via a test hook output file
- **Why deferred:** No Claude Code test harness exists in the GRD repo. Hook invocation requires a running Claude Code process with v2.1.69+ hook support. This cannot be simulated in Jest.
- **Validates at:** First live Claude Code session after v0.3.7 ships
- **Depends on:** Claude Code v2.1.69+, a GRD project, ability to inspect hook invocation logs
- **Target:** All three hooks invoke their handlers without errors; TeammateIdle emits JSON with agent_id and agent_type fields
- **Risk if unmet:** Hooks silently fail (the `2>/dev/null || true` guard means the session continues). No user-visible breakage, but hooks provide no value. Fallback: debug with `2>&1` temporarily to capture errors.

### D2: ExitWorktree tool actually exits worktree context — DEFER-72-02
- **What:** When native isolation mode is active and the ExitWorktree tool is called per the updated execute-phase.md instructions, the agent correctly returns to the main repository context
- **How:** Run a full `/grd:execute-phase` with `git.enabled: true` in a test project, observe that after execution, the completion flow (merge/PR/keep/discard) runs without "wrong directory" git errors
- **Why deferred:** Requires native isolation mode (Claude Code-managed worktrees, `ISOLATION_MODE=native`), which is not exercised in GRD's own CI. The GRD repo uses `git.enabled: false` for its own phases.
- **Validates at:** First use of native isolation mode with a GRD-using project after v0.3.7 ships
- **Depends on:** Claude Code v2.1.72+, native worktree isolation configured in a GRD project
- **Target:** Completion flow runs without git directory errors; merge/PR operations succeed
- **Risk if unmet:** Without ExitWorktree, agents in native isolation may present completion options from within the worktree, causing git confusion. Fallback: the worktree code already handles path-based worktree switching for manual mode — similar logic could be added for native mode.

### D3: New hook handler unit tests added — DEFER-72-03
- **What:** Unit tests for cmdTeammateIdleHook, cmdTaskCompletedHook, and cmdInstructionsLoadedHook in tests/unit/worktree.test.ts
- **How:** Add test cases following the pattern of existing hook handler tests (cmdWorktreeCreateHook, cmdWorktreeRemoveHook) in the same file; run `npx jest tests/unit/worktree.test.ts`
- **Why deferred:** Phase 72-01's verification_level is sanity and plan 72-01 does not include test writing tasks. Writing tests for three new ~10-line functions is properly scoped to phase 73 (Testing & Documentation).
- **Validates at:** phase-73-testing-documentation
- **Depends on:** Phase 72 execution complete; new handler functions present in lib/worktree.ts
- **Target:** 3 new test cases pass; coverage thresholds in jest.config.js maintained (no regression from adding untested functions)
- **Risk if unmet:** Untested hook handlers could silently break if lib/worktree.ts is refactored. Medium risk — handlers are trivial. Fallback: add tests as a separate bugfix before v0.3.7 ships if jest coverage check fails.

---

## Ablation Plan

**No ablation plan** — This phase implements three independent, orthogonal features (hook registration, ExitWorktree, CLAUDE_SKILL_DIR audit). Each is a discrete deliverable with no sub-components to isolate. Plan 72-03 is itself a verification-only plan with no code changes, making ablation inapplicable.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. Files modified are `.claude-plugin/plugin.json`, `lib/worktree.ts`, `bin/grd-tools.ts`, `commands/execute-phase.md`, `agents/grd-executor.md` — none are frontend views.

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| TypeScript compilation | `npm run build:check` passes | 0 errors | Pre-execution baseline (passes as of 2026-03-11) |
| Lint | `npm run lint` passes | 0 errors | Pre-execution baseline (passes as of 2026-03-11) |
| Worktree unit tests | `npx jest tests/unit/worktree.test.ts` | 103 tests pass | Pre-execution baseline |
| plugin.json hook count | Existing hooks in plugin.json | 3 (SessionStart, WorktreeCreate, WorktreeRemove) | Current plugin.json |
| Same-directory refs | grep audit baseline | 0 same-directory refs in commands/ or agents/ | Pre-execution baseline (confirmed 0) |

---

## Evaluation Scripts

**Location of evaluation code:**
```
No dedicated eval scripts — all checks use standard CLI commands
```

**How to run full sanity evaluation:**
```bash
# TypeScript + lint
npm run build:check && npm run lint

# Existing unit tests
npx jest tests/unit/worktree.test.ts --coverage=false

# plugin.json structure
node -e "const p = JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); const keys = Object.keys(p.hooks); console.log(keys.join(', ')); console.log('count:', keys.length)"

# Hook CLI output
node bin/grd-tools.js teammate-idle-hook --raw
node bin/grd-tools.js task-completed-hook --raw
node bin/grd-tools.js instructions-loaded-hook --raw

# Hook graceful failure pattern
node -e "const p = JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); ['TeammateIdle','TaskCompleted','InstructionsLoaded'].forEach(k => { const cmd = p.hooks[k][0].hooks[0].command; console.log(k, cmd.includes('2>/dev/null || true') ? 'OK' : 'MISSING'); })"

# ExitWorktree placement
grep -c "ExitWorktree" commands/execute-phase.md
grep -c "ExitWorktree" agents/grd-executor.md
grep -B5 "ExitWorktree" commands/execute-phase.md | grep -i "native\|isolation"

# CLAUDE_SKILL_DIR audit
grep -rn "CLAUDE_PLUGIN_ROOT/commands/" commands/ | wc -l
grep -rn "CLAUDE_PLUGIN_ROOT/agents/" agents/ | wc -l
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compile | | | |
| S2: ESLint | | | |
| S3: Worktree unit tests (103) | | | |
| S4: plugin.json valid JSON | | | |
| S5: plugin.json 6 hook events | | | |
| S6: teammate-idle-hook CLI | | | |
| S7: task-completed-hook CLI | | | |
| S8: instructions-loaded-hook CLI | | | |
| S9: Graceful failure pattern | | | |
| S10: ExitWorktree in execute-phase.md | | | |
| S11: ExitWorktree native-conditional | | | |
| S12: ExitWorktree in grd-executor.md | | | |
| S13: Zero same-dir command refs | | | |
| S14: Zero same-dir agent refs | | | |

### Proxy Results

No proxy metrics for this phase.

### Ablation Results

No ablation conditions for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-72-01 | Live hook events fire | PENDING | First live session post-v0.3.7 |
| DEFER-72-02 | ExitWorktree runtime behavior | PENDING | First native isolation use post-v0.3.7 |
| DEFER-72-03 | New hook handler unit tests | PENDING | phase-73-testing-documentation |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 14 checks cover every artifact in every plan. Each check has an exact command. The checks are deterministic and fast (all run in < 2 minutes combined).
- Proxy metrics: None — this is an honest absence, not a gap. The deliverables are either structurally correct or not. No quality gradient exists to measure indirectly.
- Deferred coverage: Comprehensive for this phase's scope. The only things not covered at sanity level are live hook firing (requires Claude Code runtime), ExitWorktree runtime behavior (requires native isolation), and unit test completeness (properly deferred to phase 73).

**What this evaluation CAN tell us:**
- TypeScript changes are type-safe and lint-clean
- The CLI correctly dispatches to the three new hook handlers
- plugin.json is valid and contains the expected entries with the correct graceful-failure pattern
- ExitWorktree instruction text is present and correctly conditionalized in both markdown files
- No CLAUDE_SKILL_DIR migration is needed (zero same-directory references confirmed)

**What this evaluation CANNOT tell us:**
- Whether the hooks actually fire in a live Claude Code session (DEFER-72-01, validates at first live session)
- Whether ExitWorktree actually returns the agent to the main repo context at runtime (DEFER-72-02, validates at first native isolation use)
- Whether the new handler functions maintain test coverage thresholds (DEFER-72-03, validates at phase 73)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-11*
