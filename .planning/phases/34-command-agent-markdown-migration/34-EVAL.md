# Evaluation Plan: Phase 34 — Command & Agent Markdown Migration

**Designed:** 2026-02-20
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Markdown text migration — replacing hardcoded `.planning/` subdirectory paths with init-context-derived variable references
**Reference papers:** N/A (code migration phase, no research papers)

## Evaluation Overview

Phase 34 is a structural migration: 28 command markdown files and 16 agent markdown files currently contain 293 total hardcoded occurrences of `.planning/phases/`, `.planning/research/`, `.planning/codebase/`, `.planning/todos/`, and `.planning/quick/` in operational bash commands. After Phase 33 added milestone-scoped path fields to all `cmdInit*` function outputs, Phase 34 migrates the markdown layer to consume those variables (`${research_dir}`, `${phases_dir}`, `${phase_dir}`, `${codebase_dir}`, `${todos_dir}`, `${quick_dir}`) instead of constructing paths with hardcoded strings.

This phase has no model performance metrics, no benchmarks, and no numerical quality targets. The evaluation is entirely structural: either a hardcoded path string appears in an operational context or it does not. This makes the sanity tier the primary and most informative verification level. The grep sweeps in Plan 34-04 are themselves the evaluation instrument.

No meaningful proxy metrics exist for this phase. Markdown files have no unit tests — the test suite (1,577 tests) covers `lib/` and `bin/` JavaScript modules, not the content of command or agent markdown files. The only available proxy would be indirect test suite regression, which validates that the migration did not corrupt the system but says nothing about migration completeness. Deferred validation at Phase 36 will confirm end-to-end runtime correctness when integration tests exercise commands with the new path variables.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Zero hardcoded `.planning/phases/` in commands/*.md | REQ-57 (Phase 34 success criterion 1) | Direct requirement — hardcoded paths break milestone-scoped hierarchy |
| Zero hardcoded `.planning/research/` in commands/*.md | REQ-57 (Phase 34 success criterion 1) | Direct requirement |
| Zero hardcoded `.planning/codebase/`, `.planning/todos/`, `.planning/quick/` in commands/*.md | REQ-57 (Phase 34 success criterion 1) | Direct requirement |
| Zero hardcoded `.planning/(phases\|research\|codebase\|todos\|quick)/` in agents/*.md | REQ-58 (Phase 34 success criterion 2) | Direct requirement |
| All 45 command + 19 agent files have valid YAML frontmatter | Phase 34 success criterion 3 | Invalid frontmatter breaks skill registration in Claude Code |
| npm test — 1,577+ tests pass | Phase 34 success criterion 4 | Zero regressions confirm migration did not corrupt JS modules |
| All 28 affected command files migrated | Phase 34 success criterion 3 ("20+ command markdown files updated") | Coverage completeness |
| All 16 affected agent files migrated | Phase 34 success criterion 3 ("14+ agent markdown files updated") | Coverage completeness |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 checks | Hardcoded path elimination, frontmatter validity, test regression, file coverage |
| Proxy (L2) | 0 metrics | No meaningful proxy exists — see rationale below |
| Deferred (L3) | 1 validation | End-to-end command execution with milestone-scoped paths |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Zero hardcoded subdirectory paths in commands/*.md

- **What:** No operational bash command in any of the 45 command markdown files constructs a path starting with `.planning/phases/`, `.planning/research/`, `.planning/codebase/`, `.planning/todos/`, or `.planning/quick/`
- **Command:**
  ```bash
  grep -rn "\.planning/phases/\|\.planning/research/\|\.planning/codebase/\|\.planning/todos/\|\.planning/quick/" commands/*.md
  ```
- **Expected:** Zero matching lines. Any output is a failure.
- **Failure means:** One or more command files still use hardcoded paths. REQ-57 is not satisfied. Phase 34 is incomplete.

### S2: Zero hardcoded subdirectory paths in agents/*.md

- **What:** No operational instruction in any of the 19 agent markdown files constructs a path starting with `.planning/phases/`, `.planning/research/`, `.planning/codebase/`, `.planning/todos/`, or `.planning/quick/`
- **Command:**
  ```bash
  grep -rn "\.planning/phases/\|\.planning/research/\|\.planning/codebase/\|\.planning/todos/\|\.planning/quick/" agents/*.md
  ```
- **Expected:** Zero matching lines. Any output is a failure.
- **Failure means:** One or more agent files still use hardcoded paths. REQ-58 is not satisfied. Phase 34 is incomplete.

### S3: All command and agent markdown files have valid YAML frontmatter

- **What:** Every file in `commands/*.md` and `agents/*.md` begins with `---` and has a well-formed YAML frontmatter block ending with `---`
- **Command:**
  ```bash
  for f in commands/*.md agents/*.md; do
    head=$(head -1 "$f")
    if [ "$head" != "---" ]; then
      echo "INVALID FRONTMATTER: $f"
    fi
  done
  ```
- **Expected:** No output (all files start with `---`). The Claude Code plugin reads frontmatter to register skills; broken frontmatter silently disables commands and agents.
- **Failure means:** At least one file had its YAML frontmatter corrupted by the migration (e.g., the `---` delimiter was removed or content was prepended before it). Fix immediately before committing.

### S4: Test suite passes with zero regressions

- **What:** The full test suite (1,577 tests across 31 suites) continues to pass after all markdown migrations
- **Command:**
  ```bash
  npm test
  ```
- **Expected:** `Tests: 1577 passed, 1577 total` (or higher if tests were added during phase). Zero failures. Zero test suites failing.
- **Failure means:** The markdown migration inadvertently modified a JavaScript source file, or a pre-commit hook or validation script that reads markdown content is now failing. Investigate immediately.

### S5: File count coverage — all 28 affected command files migrated

- **What:** Every command file that had hardcoded paths before Phase 34 now has zero hardcoded paths. No file is accidentally skipped.
- **Command:**
  ```bash
  # Before-migration baseline (28 files with hardcoded paths):
  # add-phase, add-todo, check-todos, compare-methods, complete-milestone,
  # deep-dive, discuss-phase, eval-plan, eval-report, execute-phase,
  # feasibility, help, insert-phase, iterate, map-codebase, new-milestone,
  # new-project, pause-work, plan-milestone-gaps, plan-phase, product-plan,
  # progress, quick, remove-phase, research-phase, resume-project,
  # survey, verify-work
  #
  # After migration, verify count of files with remaining hardcoded paths is 0:
  grep -rl "\.planning/phases/\|\.planning/research/\|\.planning/codebase/\|\.planning/todos/\|\.planning/quick/" commands/*.md | wc -l
  ```
- **Expected:** `0` — all 28 previously-affected command files are now clean.
- **Failure means:** Some files were processed by only some of the plans (34-01 or 34-02) but not fully swept by 34-04.

### S6: File count coverage — all 16 affected agent files migrated

- **What:** Every agent file that had hardcoded paths before Phase 34 now has zero hardcoded paths
- **Command:**
  ```bash
  # Before-migration baseline (16 files with hardcoded paths):
  # grd-baseline-assessor, grd-code-reviewer, grd-codebase-mapper,
  # grd-deep-diver, grd-eval-planner, grd-eval-reporter, grd-executor,
  # grd-feasibility-analyst, grd-integration-checker, grd-phase-researcher,
  # grd-planner, grd-product-owner, grd-project-researcher,
  # grd-research-synthesizer, grd-surveyor, grd-verifier
  #
  # After migration:
  grep -rl "\.planning/phases/\|\.planning/research/\|\.planning/codebase/\|\.planning/todos/\|\.planning/quick/" agents/*.md | wc -l
  ```
- **Expected:** `0` — all 16 previously-affected agent files are now clean.
- **Failure means:** Plan 34-03 missed one or more agent files.

**Sanity gate:** ALL six sanity checks must pass. Any failure blocks progression to Phase 35.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### No Proxy Metrics

**Rationale:** No meaningful proxy metric exists for this phase. The migration goal is binary: either hardcoded path strings are present in the markdown files or they are not. The sanity tier (S1, S2) directly measures this goal using grep — there is no indirect approximation that would add signal beyond the direct measurement.

The one candidate proxy (test suite pass rate as a proxy for migration correctness) is already included as a sanity check (S4) because it's a required baseline confirmation, not an indirect measure. Treating it as a "proxy" for migration completeness would be misleading — the test suite does not test markdown file content and cannot detect an uncorrected hardcoded path.

**Recommendation:** Rely on sanity checks (Level 1) as the primary evaluation instrument. The grep sweeps in S1 and S2 are both precise and complete — they directly measure REQ-57 and REQ-58 compliance.

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: End-to-end command execution with milestone-scoped paths — DEFER-34-01

- **What:** Commands that were migrated in Phase 34 execute correctly in a real Claude Code session with an active milestone, producing output paths that resolve to the correct milestone-scoped directories (e.g., `.planning/milestones/v0.2.1/research/` instead of `.planning/research/`)
- **How:** Run integration tests in Phase 36 that exercise the full command lifecycle: init call returns milestone-scoped path fields, command uses those fields in bash commands, files are written to the correct milestone-scoped location, git add succeeds on the correct path
- **Why deferred:** Validating runtime path resolution requires: (a) a live Claude Code session that can actually execute markdown command files, (b) an active GRD project with a defined milestone in STATE.md, and (c) integration tests that exercise each of the ~12 init subcommands and verify output paths. None of these are available during Phase 34 execution, which is a file-content migration only.
- **Validates at:** phase-36-test-updates-documentation-integration
- **Depends on:** Phase 35 (migration script to move existing directories to new hierarchy), Phase 36 integration test infrastructure
- **Target:** All migrated commands write planning artifacts to `${research_dir}/`, `${phases_dir}/`, `${codebase_dir}/`, `${todos_dir}/`, `${quick_dir}/` paths that match the milestone-scoped paths returned by `grd-tools.js init`; zero commands write to legacy flat paths
- **Risk if unmet:** Command markdown files may have used `${research_dir}` syntax in a way that the LLM agent does not correctly resolve from the PATHS block in spawn prompts. This would mean the variable substitution convention (semantic placeholders in agent markdown, filled by orchestrator PATHS blocks) fails in practice. Mitigation: Phase 36 tests should catch this early; the fix would be to adjust the PATHS block injection format or the variable reference syntax in agent files.
- **Fallback:** If the semantic placeholder convention proves unreliable, individual agent files can be updated to call `grd-tools.js init` themselves (similar to grd-executor and grd-planner) to resolve paths directly rather than depending on orchestrator injection.

## Ablation Plan

**No ablation plan** — This phase implements a single migration change (hardcoded strings to variable references) with no sub-components to isolate. Each plan (34-01 through 34-03) is a wave of the same operation applied to different file sets, not an independent design choice that could be ablated.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Hardcoded paths in commands (pre-migration) | Total grep matches for `.planning/(phases\|research\|codebase\|todos\|quick)/` in commands/*.md | 156 occurrences across 28 files | Pre-execution grep sweep (2026-02-20) |
| Hardcoded paths in agents (pre-migration) | Total grep matches for same pattern in agents/*.md | 137 occurrences across 16 files | Pre-execution grep sweep (2026-02-20) |
| Test suite passing count | npm test — number of passing tests before Phase 34 | 1,577 tests | STATE.md performance metrics |
| Files with valid frontmatter | All commands/*.md and agents/*.md files start with `---` | 64/64 files (45 commands + 19 agents) | Pre-execution validation sweep |

## Evaluation Scripts

**Location of evaluation code:**
```
No dedicated evaluation scripts — evaluation uses standard shell commands and npm test.
The comprehensive sweep in 34-04-PLAN.md tasks are the evaluation instrument.
```

**How to run full evaluation:**
```bash
# Run from project root

# S1: Zero hardcoded paths in commands
grep -rn "\.planning/phases/\|\.planning/research/\|\.planning/codebase/\|\.planning/todos/\|\.planning/quick/" commands/*.md

# S2: Zero hardcoded paths in agents
grep -rn "\.planning/phases/\|\.planning/research/\|\.planning/codebase/\|\.planning/todos/\|\.planning/quick/" agents/*.md

# S3: Frontmatter validity
for f in commands/*.md agents/*.md; do
  head=$(head -1 "$f")
  if [ "$head" != "---" ]; then echo "INVALID FRONTMATTER: $f"; fi
done

# S4: Test suite
npm test

# S5: Command file coverage
grep -rl "\.planning/phases/\|\.planning/research/\|\.planning/codebase/\|\.planning/todos/\|\.planning/quick/" commands/*.md | wc -l

# S6: Agent file coverage
grep -rl "\.planning/phases/\|\.planning/research/\|\.planning/codebase/\|\.planning/todos/\|\.planning/quick/" agents/*.md | wc -l
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Zero hardcoded paths in commands | [PASS/FAIL] | [grep output or "0 matches"] | |
| S2: Zero hardcoded paths in agents | [PASS/FAIL] | [grep output or "0 matches"] | |
| S3: YAML frontmatter valid | [PASS/FAIL] | [output or "All 64 files valid"] | |
| S4: npm test — zero regressions | [PASS/FAIL] | [test count] | |
| S5: Command file coverage | [PASS/FAIL] | [count] | Target: 0 files with remaining paths |
| S6: Agent file coverage | [PASS/FAIL] | [count] | Target: 0 files with remaining paths |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| (none) | — | — | — | No proxy metrics designed for this phase |

### Ablation Results

| Condition | Expected | Actual | Conclusion |
|-----------|----------|--------|------------|
| (none) | — | — | No ablation plan for this phase |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-34-01 | End-to-end command execution with milestone-scoped paths | PENDING | phase-36-test-updates-documentation-integration |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — grep sweeps directly and completely measure REQ-57 and REQ-58. The only thing grep cannot verify is whether variable references are semantically correct at runtime (e.g., whether the LLM agent resolves `${research_dir}` correctly from the PATHS block). That gap is covered by the deferred validation.
- Proxy metrics: None designed — this is the correct and honest assessment. The migration goal is binary and directly measurable; no proxy is needed or appropriate.
- Deferred coverage: Partial but acceptable — the one deferred item (runtime correctness) is a real gap, but it is explicitly acknowledged with a validates_at reference and a fallback plan. The risk is LOW because the variable reference convention (`${research_dir}`) is a widely-understood bash variable syntax that LLM agents already handle correctly in similar contexts throughout the codebase.

**What this evaluation CAN tell us:**
- Whether all hardcoded path strings have been removed from all 45 command and 19 agent markdown files (S1, S2, S5, S6)
- Whether the migration corrupted YAML frontmatter in any file (S3)
- Whether the migration accidentally modified JavaScript source files and broke the test suite (S4)
- The total migration completeness — zero residual occurrences is a binary pass/fail with no ambiguity

**What this evaluation CANNOT tell us:**
- Whether commands correctly resolve `${research_dir}` to the right milestone-scoped path at runtime (requires Phase 36 integration validation — DEFER-34-01)
- Whether the PATHS block convention in orchestrator spawn prompts (added in Plans 34-01/34-02) is reliably picked up by agent LLMs (requires Phase 36 runtime testing — DEFER-34-01)
- Whether any documentation-only references to old paths (non-operational, excluded from grep) confuse users or future maintainers (acceptable trade-off; deferred to documentation review in Phase 36)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-20*
