# Evaluation Plan: Phase 75 — Hook Events and Plugin Infrastructure

**Designed:** 2026-03-19
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** StopFailure/PostCompact hook registration, CLAUDE_PLUGIN_DATA documentation boundary
**Reference papers:** N/A — infrastructure phase, no research papers

## Evaluation Overview

Phase 75 is a pure infrastructure phase with two work streams. Plan 75-01 registers StopFailure and PostCompact hook events in plugin.json and implements their handler functions in lib/worktree.ts with CLI routing in bin/grd-tools.ts. Plan 75-02 documents the CLAUDE_PLUGIN_DATA state boundary in lib/evolve/state.ts and lib/autopilot.ts, and adds a plugin_data_available field to the init context in lib/context/execute.ts.

All deliverables are structural code changes (new functions, JSON entries, code comments, one new boolean field). There are no algorithmic quality dimensions and no paper metrics to reproduce. The evaluation is entirely verification-oriented: do the right artifacts exist, are they correctly wired, and does the codebase remain healthy after the changes?

Because both plans have verification_level: sanity, the evaluation plan focuses on Level 1 sanity checks. A small number of Level 2 proxy checks are included where automated artifact-presence checks provide meaningful signal beyond basic runtime health. No Level 3 deferrals are required — all verifiable properties are checkable within the phase.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compile clean | Product Quality P1 (ESLint/TSC targets) | Type safety is a hard gate; new code must not break existing type-checks |
| ESLint zero errors | Product Quality P1 | Existing pre-commit hook enforces lint; regressions are blocked |
| All 3106 tests pass | Existing test suite baseline | Phase touches lib/worktree.ts and lib/context/execute.ts — both have test files |
| plugin.json is valid JSON | 75-01 plan verification | Hook registration only works if the manifest parses correctly |
| Hook handlers produce valid JSON output | 75-01 plan must_haves | Existing hooks all return JSON; new handlers must follow the same contract |
| Artifact presence checks | 75-01 and 75-02 plan must_haves | Structural deliverables are binary — they either exist or they do not |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 10 | Basic functionality, format, and structural artifact verification |
| Proxy (L2) | 3 | Automated checks that approximate integration correctness |
| Deferred (L3) | 0 | Not required — all properties checkable within phase |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript compiles without errors

- **What:** The entire codebase type-checks cleanly after all phase changes
- **Command:** `npx tsc --noEmit`
- **Expected:** Exit code 0, no output
- **Failure means:** A type error was introduced in lib/worktree.ts, lib/context/execute.ts, or a transitive dependency; must be fixed before proceeding

### S2: ESLint passes with zero errors

- **What:** All modified files pass the project linter
- **Command:** `npm run lint`
- **Expected:** Exit code 0, no lint errors or warnings
- **Failure means:** A lint rule is violated in new code (unused variable, missing 'use strict', etc.); the pre-commit hook would block the commit anyway

### S3: Full test suite still passes

- **What:** The existing 3106 tests continue to pass after modifications to lib/worktree.ts and lib/context/execute.ts
- **Command:** `npm test`
- **Expected:** 49 test suites passed, 3106 tests passed, 0 failures
- **Failure means:** A regression was introduced in an existing function; the modified files have test coverage and failures would indicate a broken export or changed behavior

### S4: plugin.json is valid JSON

- **What:** The plugin manifest parses as valid JSON after adding StopFailure and PostCompact entries
- **Command:** `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); console.log('valid')"`
- **Expected:** Prints "valid", exit code 0
- **Failure means:** A JSON syntax error was introduced during editing; Claude Code would silently ignore a malformed plugin.json

### S5: plugin.json registers exactly 8 hook events

- **What:** The manifest now contains StopFailure and PostCompact alongside the existing 6 hooks (SessionStart, WorktreeCreate, WorktreeRemove, TeammateIdle, TaskCompleted, InstructionsLoaded)
- **Command:** `node -e "const p=JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); const hooks=Object.keys(p.hooks||{}); console.log(hooks.length, hooks.join(', '))"`
- **Expected:** `8 SessionStart, WorktreeCreate, WorktreeRemove, TeammateIdle, TaskCompleted, InstructionsLoaded, StopFailure, PostCompact` (order may vary)
- **Failure means:** One or both new hooks are missing from the manifest, or an existing hook was accidentally removed

### S6: Both new handler functions exist and are exported from lib/worktree.ts

- **What:** cmdStopFailureHook and cmdPostCompactHook are defined and included in module.exports
- **Command:** `grep -c "cmdStopFailureHook\|cmdPostCompactHook" lib/worktree.ts`
- **Expected:** 4 or more (definition + export for each function; JSDoc references will add more)
- **Failure means:** Handler functions are missing or not exported; CLI routing in grd-tools.ts would fail at runtime

### S7: Both new subcommands are routed in bin/grd-tools.ts

- **What:** stop-failure-hook and post-compact-hook appear in the COMMANDS array and TOP_LEVEL_COMMANDS list
- **Command:** `grep -c "stop-failure-hook\|post-compact-hook" bin/grd-tools.ts`
- **Expected:** 4 or more (one entry in COMMANDS + one in TOP_LEVEL_COMMANDS for each command)
- **Failure means:** The CLI cannot dispatch these subcommands; calling `node bin/grd-tools.js stop-failure-hook` would return "Unknown command"

### S8: stop-failure-hook produces valid JSON output

- **What:** The CLI subcommand runs without error and returns parseable JSON with the expected shape
- **Command:** `node bin/grd-tools.js stop-failure-hook 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.ok, d.hook)"`
- **Expected:** `true StopFailure`
- **Failure means:** Handler function throws, returns malformed JSON, or is not reachable via CLI routing

### S9: post-compact-hook produces valid JSON output

- **What:** The CLI subcommand runs without error and returns parseable JSON with the expected shape
- **Command:** `node bin/grd-tools.js post-compact-hook 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.ok, d.hook, d.acknowledged)"`
- **Expected:** `true PostCompact true`
- **Failure means:** Handler function throws, returns malformed JSON, or acknowledged field is missing

### S10: CLAUDE_PLUGIN_DATA and plugin_data_available appear in expected files

- **What:** Documentation comments landed in both state files, and the new init context field is present
- **Command:** `grep -l "CLAUDE_PLUGIN_DATA" lib/evolve/state.ts lib/autopilot.ts && grep -l "plugin_data_available" lib/context/execute.ts`
- **Expected:** Three file paths printed (lib/evolve/state.ts, lib/autopilot.ts, lib/context/execute.ts)
- **Failure means:** One or more plans did not complete their documentation tasks

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Automated checks that approximate integration correctness beyond binary artifact presence.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: CLAUDE_PLUGIN_DATA occurrence density meets documented intent

- **What:** The documentation comments are substantive — not just a single mention but the full boundary explanation with cross-project path examples
- **How:** Count occurrences in each file against the plan's stated minimum
- **Command:** `grep -c "CLAUDE_PLUGIN_DATA" lib/evolve/state.ts && grep -c "CLAUDE_PLUGIN_DATA" lib/autopilot.ts`
- **Target:** lib/evolve/state.ts >= 3 occurrences; lib/autopilot.ts >= 2 occurrences (per plan 75-02 verify section)
- **Evidence:** Plan 75-02 Task 1 verify clause specifies these exact thresholds based on the documentation block structure (header comment + inline comment + path example = at least 3 for evolve/state.ts)
- **Correlation with full metric:** HIGH — occurrence count directly measures whether the full documentation block was written vs. a stub comment
- **Blind spots:** Does not verify the comments are accurate or well-written; does not verify the path examples are syntactically correct TypeScript
- **Validated:** No — this proxy stands on its own; no deferred validation needed for a documentation metric

### P2: init context contains plugin_data_available for a real phase invocation

- **What:** The init context JSON output for an actual phase init call includes the plugin_data_available field (not just that the field appears in source text)
- **How:** Invoke the init command for phase 75 and parse the output
- **Command:** `node bin/grd-tools.js init execute-phase 75 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('plugin_data_available' in d, typeof d.plugin_data_available)"`
- **Target:** `true boolean`
- **Evidence:** Plan 75-02 Task 2 verify clause specifies this exact check; it validates runtime behavior rather than just source text presence
- **Correlation with full metric:** HIGH — tests the actual runtime path that agents will consume
- **Blind spots:** Tests only phase 75; other phase init commands (plan-phase, etc.) may or may not include the field if they use a different init builder
- **Validated:** No — awaiting any future phase that verifies consistent init context shape

### P3: Hook command invocation pattern in plugin.json matches existing hook format

- **What:** The new hook entries follow the exact command template used by existing hooks (node + CLAUDE_PLUGIN_ROOT + timeout 5 + 2>/dev/null || true)
- **How:** Compare new entries to existing InstructionsLoaded entry structure
- **Command:** `node -e "const p=JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); const sf=p.hooks.StopFailure[0].hooks[0]; const pc=p.hooks.PostCompact[0].hooks[0]; console.log(sf.type, sf.timeout, pc.type, pc.timeout, sf.command.includes('stop-failure-hook'), pc.command.includes('post-compact-hook'))"`
- **Target:** `command 5 command 5 true true`
- **Evidence:** Existing hooks all use timeout: 5 and 2>/dev/null || true pattern per plan 75-01 Task 2 specification; deviating would cause inconsistent hook behavior
- **Correlation with full metric:** MEDIUM — correct format does not guarantee Claude Code invokes the hooks correctly, but it is a prerequisite
- **Blind spots:** Cannot verify the hooks actually fire in a live Claude Code session; that requires manual integration testing
- **Validated:** No — live hook firing is deferred to manual verification below

## Level 3: Deferred Validations

No deferred validations are required for this phase. All success criteria are structurally verifiable within the phase:

- Hook registration correctness can be fully checked via JSON parsing and CLI invocation
- Documentation presence can be checked via grep
- Runtime init context can be checked via CLI invocation
- Type safety and lint are enforced by the existing toolchain

The one property that cannot be automated is live hook firing in a Claude Code session (do StopFailure and PostCompact hooks actually trigger and invoke grd-tools.js?). This is noted below as a manual verification item but is not tracked as a formal DEFER item because it is low-risk (the same invocation pattern works for 6 existing hooks) and does not gate any downstream phase.

**Manual verification note (not a formal DEFER):**
After the next Claude Code session that encounters a rate limit or auth error, check `.planning/autopilot/autopilot.log` for a `STOP_FAILURE:` entry. This validates end-to-end hook firing but is opportunistic — it cannot be scripted.

## Ablation Plan

No ablation plan — this phase implements discrete infrastructure items (two handler functions, two JSON entries, documentation comments, one boolean field) with no sub-components to isolate. Each deliverable is independently verifiable via the sanity checks above.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| TypeScript compile | Clean compile before phase | 0 errors | Verified pre-phase: `npx tsc --noEmit` exits 0 |
| ESLint | Clean lint before phase | 0 errors | Verified pre-phase: `npm run lint` exits 0 |
| Test suite | All tests passing | 3106 tests pass, 49 suites | Verified pre-phase: `npm test` |
| plugin.json hook count | Hooks registered before phase | 6 hooks (SessionStart, WorktreeCreate, WorktreeRemove, TeammateIdle, TaskCompleted, InstructionsLoaded) | Verified pre-phase |
| worktree.ts exports | Hook handlers before phase | 3 exported (cmdTeammateIdleHook, cmdTaskCompletedHook, cmdInstructionsLoadedHook) | Verified pre-phase |

## Evaluation Scripts

**Location of evaluation code:** No dedicated scripts needed — all checks use standard CLI tools.

**How to run full evaluation:**
```bash
# Level 1 — all sanity checks
npx tsc --noEmit
npm run lint
npm test

node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); console.log('valid')"
node -e "const p=JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); const hooks=Object.keys(p.hooks||{}); console.log(hooks.length, hooks.join(', '))"

grep -c "cmdStopFailureHook\|cmdPostCompactHook" lib/worktree.ts
grep -c "stop-failure-hook\|post-compact-hook" bin/grd-tools.ts

node bin/grd-tools.js stop-failure-hook 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.ok, d.hook)"
node bin/grd-tools.js post-compact-hook 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.ok, d.hook, d.acknowledged)"

grep -l "CLAUDE_PLUGIN_DATA" lib/evolve/state.ts lib/autopilot.ts && grep -l "plugin_data_available" lib/context/execute.ts

# Level 2 — proxy metrics
grep -c "CLAUDE_PLUGIN_DATA" lib/evolve/state.ts
grep -c "CLAUDE_PLUGIN_DATA" lib/autopilot.ts

node bin/grd-tools.js init execute-phase 75 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('plugin_data_available' in d, typeof d.plugin_data_available)"

node -e "const p=JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); const sf=p.hooks.StopFailure[0].hooks[0]; const pc=p.hooks.PostCompact[0].hooks[0]; console.log(sf.type, sf.timeout, pc.type, pc.timeout, sf.command.includes('stop-failure-hook'), pc.command.includes('post-compact-hook'))"
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compile | | | |
| S2: ESLint | | | |
| S3: Test suite | | | |
| S4: plugin.json valid JSON | | | |
| S5: plugin.json 8 hooks | | | |
| S6: Handler functions exist | | | |
| S7: CLI routing | | | |
| S8: stop-failure-hook JSON output | | | |
| S9: post-compact-hook JSON output | | | |
| S10: Documentation artifacts | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: CLAUDE_PLUGIN_DATA occurrences (evolve/state.ts) | >= 3 | | | |
| P1: CLAUDE_PLUGIN_DATA occurrences (autopilot.ts) | >= 2 | | | |
| P2: plugin_data_available in init context | true boolean | | | |
| P3: Hook command format in plugin.json | command 5 command 5 true true | | | |

### Deferred Status

No deferred validations tracked for this phase.

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 10 checks covering compile health, lint, test regression, JSON validity, artifact presence, and runtime output for both new handlers
- Proxy metrics: Well-evidenced — all three are derived directly from the plan's own verify clauses and test runtime behavior rather than source text alone
- Deferred coverage: Not applicable — all phase properties are checkable within the phase

**What this evaluation CAN tell us:**
- Whether the codebase remains type-safe and lint-clean after the changes
- Whether both hook handlers exist, are correctly exported, and produce the expected JSON contract
- Whether plugin.json is valid and registers exactly the 8 expected hooks with the correct format
- Whether CLAUDE_PLUGIN_DATA documentation has the minimum required depth in both modules
- Whether the init context field is reachable at runtime

**What this evaluation CANNOT tell us:**
- Whether StopFailure and PostCompact hooks actually fire in a live Claude Code session (requires manual opportunistic verification after a real rate-limit event)
- Whether the CLAUDE_PLUGIN_DATA documentation comments are accurate, well-written, or pedagogically useful (requires human review)
- Whether other phase init commands (plan-phase, etc.) also include plugin_data_available if they use a different builder path

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-19*
