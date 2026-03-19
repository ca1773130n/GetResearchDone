# Evaluation Plan: Phase 76 — Agent Frontmatter and MCP Elicitation

**Designed:** 2026-03-19
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** YAML frontmatter extension for Claude Code agent definitions; BackendCapabilities interface extension; init context enrichment
**Reference papers:** None — implementation task based on product requirements REQ-104, REQ-105, REQ-106

## Evaluation Overview

Phase 76 is a structural metadata phase: it adds `effort`, `maxTurns`, and `disallowedTools` YAML frontmatter fields to all 20 GRD agent definitions, and extends the TypeScript backend infrastructure to surface `mcp_elicitation_available` and `model_overrides_available` in the execute-phase init context.

There is no trained model or learned metric to evaluate. Success is entirely structural — do the files contain the correct fields with the correct values? Does the TypeScript code compile and produce correct runtime output? These questions are answerable through direct inspection and automated verification, making this phase unusually well-suited to Level 1 (sanity) evaluation.

No meaningful proxy metrics exist for this phase: there is no quantitative performance dimension to approximate indirectly. All evaluation is either directly verifiable (Level 1) or deferred to live runtime conditions that cannot be exercised in the development environment (Level 3).

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| All 20 agents have `effort` field | REQ-104 success criterion 1 | Completeness — all agents must be updated |
| `effort` values match EFFORT_PROFILES balanced column | Plan 76-01 Task 1 specification | Correctness — values must be semantically right |
| 7 bounded agents have `maxTurns` | REQ-104 success criterion 2 | Completeness — turn bounding requires explicit values |
| 4 read-only agents have `disallowedTools` | REQ-104 success criterion 3 | Defense-in-depth — tool restriction |
| YAML is parseable in all 20 files | Plan 76-01 verification section | Structural validity — malformed YAML silently disables agents |
| `BackendCapabilities` has `mcp_elicitation` field | REQ-105; Plan 76-02 Task 1 | TypeScript type safety |
| `mcp_elicitation` set in all 7 backends | Plan 76-02 Task 1 specification | Completeness across backend matrix |
| `mcp_elicitation: true` only for claude backend | Plan 76-02 specification | Correctness — only Claude Code v2.1.76+ supports it |
| `cmdInitExecutePhase` outputs `mcp_elicitation_available` | REQ-105 success criterion | Runtime surfacing |
| `cmdInitExecutePhase` outputs `model_overrides_available` | REQ-106 success criterion | Runtime surfacing |
| `npm run build:check` passes | TypeScript compiler | No regressions introduced |
| `npm test` passes | Jest test suite | No behavioral regressions |
| `npm run lint` passes | ESLint | Code style maintained |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 14 | Structural correctness, type safety, runtime output |
| Proxy (L2) | 0 | Not applicable — no quantitative performance dimension |
| Deferred (L3) | 3 | Live Claude Code runtime behavior cannot be tested locally |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript Build Check

- **What:** TypeScript compiles cleanly after adding `mcp_elicitation` to `BackendCapabilities` interface and all 7 backend entries
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check`
- **Expected:** Exit code 0, no TypeScript errors printed
- **Failure means:** Type error introduced — most likely `BackendCapabilities` interface missing the field or a backend entry omitting it

### S2: Unit Tests Pass

- **What:** Existing test suite continues to pass; no behavioral regressions from context/execute.ts changes
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm test`
- **Expected:** All tests pass, no new failures, coverage thresholds met
- **Failure means:** A test exercises `cmdInitExecutePhase` output shape or backend capability flags and found a missing or incorrectly typed field

### S3: Lint Passes

- **What:** ESLint finds no violations in modified files (`lib/types.ts`, `lib/backend.ts`, `lib/context/execute.ts`)
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint`
- **Expected:** Exit code 0, no lint errors
- **Failure means:** Code style violation introduced (unused variable, `any` type, missing `'use strict'`, etc.)

### S4: All 20 Agents Have `effort` Field

- **What:** Every agent `.md` file in `agents/` has an `effort:` line in its YAML frontmatter
- **Command:**
  ```bash
  cd /Users/neo/Developer/Projects/GetResearchDone && \
  missing=0; \
  for f in agents/grd-*.md; do \
    effort=$(sed -n '/^---$/,/^---$/p' "$f" | grep '^effort:' | awk '{print $2}'); \
    if [ -z "$effort" ]; then echo "MISSING effort: $f"; missing=$((missing+1)); fi; \
  done; \
  echo "Files missing effort: $missing"
  ```
- **Expected:** "Files missing effort: 0"; count of checked files equals 20
- **Failure means:** One or more agent files were not updated in Plan 76-01 Task 1

### S5: All `effort` Values Are Valid

- **What:** Every `effort:` value is exactly `low`, `medium`, or `high` (no typos, no extra values)
- **Command:**
  ```bash
  cd /Users/neo/Developer/Projects/GetResearchDone && \
  invalid=0; \
  for f in agents/grd-*.md; do \
    effort=$(sed -n '/^---$/,/^---$/p' "$f" | grep '^effort:' | awk '{print $2}'); \
    if [[ "$effort" != "low" && "$effort" != "medium" && "$effort" != "high" ]]; then \
      echo "INVALID effort='$effort': $f"; invalid=$((invalid+1)); \
    fi; \
  done; \
  echo "Files with invalid effort: $invalid"
  ```
- **Expected:** "Files with invalid effort: 0"
- **Failure means:** Typo or incorrect value in frontmatter; check against EFFORT_PROFILES balanced column in `lib/backend.ts`

### S6: `effort` Values Match EFFORT_PROFILES Balanced Column

- **What:** Specific agents have the correct tier — high for grd-planner and grd-product-owner; low for grd-codebase-mapper and grd-verifier; medium for all others
- **Command:**
  ```bash
  cd /Users/neo/Developer/Projects/GetResearchDone && \
  check() { local f=$1 expected=$2; \
    actual=$(sed -n '/^---$/,/^---$/p' "agents/$f.md" | grep '^effort:' | awk '{print $2}'); \
    if [ "$actual" != "$expected" ]; then echo "FAIL: $f expected=$expected actual=$actual"; fi; \
  }; \
  check grd-planner high; \
  check grd-product-owner high; \
  check grd-codebase-mapper low; \
  check grd-verifier low; \
  check grd-executor medium; \
  check grd-debugger medium; \
  check grd-code-reviewer medium; \
  check grd-migrator medium; \
  echo "Spot-check complete"
  ```
- **Expected:** Only "Spot-check complete" printed (no FAIL lines)
- **Failure means:** Value copied from wrong profile column (quality or budget instead of balanced)

### S7: Bounded Agents Have `maxTurns` Set

- **What:** The 7 specified agents have a `maxTurns:` field with a positive integer value
- **Command:**
  ```bash
  cd /Users/neo/Developer/Projects/GetResearchDone && \
  fail=0; \
  for f in agents/grd-code-reviewer.md agents/grd-verifier.md agents/grd-plan-checker.md \
            agents/grd-integration-checker.md agents/grd-eval-planner.md \
            agents/grd-baseline-assessor.md agents/grd-migrator.md; do \
    turns=$(sed -n '/^---$/,/^---$/p' "$f" | grep '^maxTurns:' | awk '{print $2}'); \
    if [ -z "$turns" ] || ! [[ "$turns" =~ ^[0-9]+$ ]]; then \
      echo "FAIL: $f maxTurns='$turns'"; fail=$((fail+1)); \
    fi; \
  done; \
  echo "Failures: $fail"
  ```
- **Expected:** "Failures: 0"
- **Failure means:** A bounded agent was missed in Plan 76-01 Task 2

### S8: `maxTurns` Values Match Specification

- **What:** Each bounded agent has the exact value specified in the plan
- **Command:**
  ```bash
  cd /Users/neo/Developer/Projects/GetResearchDone && \
  check_turns() { local f=$1 expected=$2; \
    actual=$(sed -n '/^---$/,/^---$/p' "agents/$f.md" | grep '^maxTurns:' | awk '{print $2}'); \
    if [ "$actual" != "$expected" ]; then echo "FAIL: $f expected=$expected actual=$actual"; fi; \
  }; \
  check_turns grd-code-reviewer 15; \
  check_turns grd-verifier 10; \
  check_turns grd-plan-checker 10; \
  check_turns grd-integration-checker 10; \
  check_turns grd-eval-planner 20; \
  check_turns grd-baseline-assessor 15; \
  check_turns grd-migrator 15; \
  echo "maxTurns spot-check complete"
  ```
- **Expected:** Only "maxTurns spot-check complete" printed
- **Failure means:** Wrong value for at least one agent — check plan specification

### S9: Read-Only Agents Have `disallowedTools`

- **What:** `grd-code-reviewer`, `grd-plan-checker`, and `grd-integration-checker` have `disallowedTools:` containing both `Edit` and `Write`; `grd-verifier` has `disallowedTools:` containing `Edit` but NOT `Write`
- **Command:**
  ```bash
  cd /Users/neo/Developer/Projects/GetResearchDone && \
  fail=0; \
  for f in agents/grd-code-reviewer.md agents/grd-plan-checker.md agents/grd-integration-checker.md; do \
    if ! grep -q 'disallowedTools:' "$f"; then echo "FAIL: $f missing disallowedTools"; fail=$((fail+1)); continue; fi; \
    if ! grep -A5 'disallowedTools:' "$f" | grep -q 'Edit'; then echo "FAIL: $f missing Edit"; fail=$((fail+1)); fi; \
    if ! grep -A5 'disallowedTools:' "$f" | grep -q 'Write'; then echo "FAIL: $f missing Write"; fail=$((fail+1)); fi; \
  done; \
  if ! grep -q 'disallowedTools:' agents/grd-verifier.md; then echo "FAIL: verifier missing disallowedTools"; fail=$((fail+1)); fi; \
  if ! grep -A5 'disallowedTools:' agents/grd-verifier.md | grep -q 'Edit'; then echo "FAIL: verifier missing Edit"; fail=$((fail+1)); fi; \
  if grep -A5 'disallowedTools:' agents/grd-verifier.md | grep -q 'Write'; then echo "FAIL: verifier should NOT disallow Write"; fail=$((fail+1)); fi; \
  echo "disallowedTools check failures: $fail"
  ```
- **Expected:** "disallowedTools check failures: 0"
- **Failure means:** Tool restriction incorrectly applied — check grd-verifier needs Write to produce VERIFICATION.md

### S10: No YAML Parse Errors in Agent Files

- **What:** All 20 agent `.md` files have syntactically valid YAML frontmatter blocks
- **Command:**
  ```bash
  cd /Users/neo/Developer/Projects/GetResearchDone && \
  fail=0; \
  for f in agents/grd-*.md; do \
    block=$(sed -n '1,/^---$/p' "$f" | tail -n +2 | head -n -1); \
    if ! python3 -c "import yaml, sys; yaml.safe_load(sys.stdin)" <<< "$block" 2>/dev/null; then \
      echo "YAML PARSE ERROR: $f"; fail=$((fail+1)); \
    fi; \
  done; \
  echo "YAML errors: $fail"
  ```
- **Expected:** "YAML errors: 0"
- **Failure means:** Malformed YAML in at least one frontmatter block; likely an indentation error in `disallowedTools` list

### S11: `BackendCapabilities` Interface Has `mcp_elicitation` Field

- **What:** `lib/types.ts` BackendCapabilities interface contains `mcp_elicitation: boolean;`
- **Command:** `grep 'mcp_elicitation' /Users/neo/Developer/Projects/GetResearchDone/lib/types.ts`
- **Expected:** One line matching `mcp_elicitation: boolean;`
- **Failure means:** Plan 76-02 Task 1 did not update types.ts, or the field was added with wrong type

### S12: All 7 Backends Have `mcp_elicitation` Capability Entry

- **What:** `lib/backend.ts` has `mcp_elicitation:` in each of the 7 backend capability objects
- **Command:** `grep -c 'mcp_elicitation' /Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts`
- **Expected:** Output is `7` (one occurrence per backend: claude, codex, gemini, opencode, overstory, superpowers, grd)
- **Failure means:** At least one backend entry is missing the field; TypeScript would also catch this via S1

### S13: Only Claude Backend Has `mcp_elicitation: true`

- **What:** `claude` backend has `mcp_elicitation: true`; all others have `mcp_elicitation: false`
- **Command:**
  ```bash
  cd /Users/neo/Developer/Projects/GetResearchDone && \
  grep -A15 "^  claude: {" lib/backend.ts | grep 'mcp_elicitation'; \
  grep -A15 "^  codex: {" lib/backend.ts | grep 'mcp_elicitation'; \
  grep -A15 "^  gemini: {" lib/backend.ts | grep 'mcp_elicitation'
  ```
- **Expected:** `mcp_elicitation: true` for claude; `mcp_elicitation: false` for codex and gemini (and all others)
- **Failure means:** Wrong value assigned — only Claude Code v2.1.76+ supports MCP elicitation

### S14: `cmdInitExecutePhase` Outputs Both New Fields

- **What:** Running the init command for any phase produces JSON containing both `mcp_elicitation_available` and `model_overrides_available` keys
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node bin/grd-tools.js init execute-phase 76 --json 2>/dev/null | grep -E 'mcp_elicitation_available|model_overrides_available'`
- **Expected:** Two lines, one for each field, with boolean values
- **Failure means:** Plan 76-02 Task 2 did not inject the fields into the result object, or the command fails entirely

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance.

### No Proxy Metrics

**Rationale:** Phase 76 is a structural metadata and type extension task. All success criteria are binary and directly verifiable: either a frontmatter field is present with the correct value, or it is not. Either the TypeScript compiles and the runtime output contains the required fields, or it does not. There is no quantitative performance dimension that requires indirect approximation.

The distinction between "proxy" and "sanity" collapses for structural correctness tasks — every meaningful metric is directly observable, not approximated.

**Recommendation:** Rely entirely on Level 1 sanity checks (S1–S14). The coverage of those checks against the 5 success criteria from the roadmap is complete.

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: Claude Code Actually Respects `effort` Frontmatter at Runtime — DEFER-76-01

- **What:** When an agent with `effort: high` is invoked via Claude Code, it actually uses extended thinking / ultrathink mode; agents with `effort: low` run without it
- **How:** Invoke two agents with different effort values in a real Claude Code session and observe the reasoning behavior or API call parameters
- **Why deferred:** Cannot be tested outside a live Claude Code v2.1.68+ session — there is no local Claude Code binary in the CI/test environment
- **Validates at:** First live GRD autopilot run after phase 76 ships
- **Depends on:** Live Claude Code CLI, real API key, a phase that invokes both a `high` and `low` effort agent
- **Target:** Agents with `effort: high` exhibit visibly deeper reasoning chains; agents with `effort: low` return faster; no "effort not supported" errors
- **Risk if unmet:** Effort values are silently ignored — no harm done, but the feature provides no benefit; investigate whether Claude Code version meets minimum requirement (v2.1.68)
- **Fallback:** Remove effort frontmatter from agents if confirmed non-functional; document Claude Code version requirement gap

### D2: Claude Code Respects `disallowedTools` at Runtime — DEFER-76-02

- **What:** When `grd-code-reviewer` runs in a real Claude Code session, it cannot use the Edit or Write tool even if instructed to; `grd-verifier` can use Write but not Edit
- **How:** Invoke a restricted agent and verify it does not attempt prohibited tool calls; or attempt to trigger a prohibited call and observe Claude Code's refusal
- **Why deferred:** Requires a live Claude Code session — disallowedTools enforcement is done by the Claude Code runtime, not by GRD code
- **Validates at:** First live code-review or verification agent run after phase 76 ships
- **Depends on:** Live Claude Code CLI with agent frontmatter support active
- **Target:** Restricted agents do not produce Edit or Write tool calls; no "tool not allowed" errors surface to the user (the restriction should be transparent)
- **Risk if unmet:** Defense-in-depth is absent — the functional risk is low since these agents already lack Write/Edit in their `tools` field, so disallowedTools is additive; however the security intent of the design is unvalidated
- **Fallback:** Accept partial validation — tool restriction via `tools` field remains in place regardless

### D3: `model_overrides_available` Correctly Detects Production Settings Files — DEFER-76-03

- **What:** In a real user environment with `modelOverrides` configured in `.claude/settings.json`, `cmdInitExecutePhase` returns `model_overrides_available: true`; in environments without it, returns `false`
- **How:** Run `gd init execute-phase` in a repo with and without a `.claude/settings.json` containing `modelOverrides` and compare output
- **Why deferred:** The test environment does not have a production `.claude/settings.json` with `modelOverrides`; unit tests mock the filesystem, which validates the logic but not the file path resolution
- **Validates at:** First GRD run in a user environment that has modelOverrides configured
- **Depends on:** A real `.claude/settings.json` with non-empty `modelOverrides` object
- **Target:** `model_overrides_available: true` when config file is present and has non-empty `modelOverrides`; `false` otherwise
- **Risk if unmet:** Agents receive incorrect capability signal; low impact since this is informational only — agents adapt behavior but are not broken by wrong value
- **Fallback:** Add an integration test that creates a temp `.claude/settings.json` fixture and verifies the output

## Ablation Plan

**No ablation plan** — This phase implements deterministic structural changes (frontmatter field additions and TypeScript interface extensions) with no sub-components to isolate. Each field is independent; the only question is presence/absence and value correctness, which is covered by S4–S14.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| npm build:check before phase | TypeScript compiles cleanly on main branch | 0 errors | Current codebase state |
| npm test before phase | All tests pass on main branch | 100% pass rate | Current codebase state |
| Agent file count | 20 agent .md files in agents/ | 20 files | `ls agents/grd-*.md \| wc -l` |
| Agent frontmatter fields before phase | `effort`, `maxTurns`, `disallowedTools` absent | 0 occurrences | Current agent file state |

## Evaluation Scripts

**Location of evaluation code:** Inline shell commands in S4–S14 above. No separate script needed — all checks are one-liners or short loops.

**How to run full sanity gate:**
```bash
cd /Users/neo/Developer/Projects/GetResearchDone

# S1: TypeScript build
npm run build:check

# S2: Unit tests
npm test

# S3: Lint
npm run lint

# S4-S6: Agent effort completeness and correctness
for f in agents/grd-*.md; do
  effort=$(sed -n '/^---$/,/^---$/p' "$f" | grep '^effort:' | awk '{print $2}')
  if [ -z "$effort" ]; then echo "MISSING effort: $f"; fi
  if [[ "$effort" != "low" && "$effort" != "medium" && "$effort" != "high" ]]; then echo "INVALID effort='$effort': $f"; fi
done

# S7-S8: maxTurns on bounded agents
for f in agents/grd-code-reviewer.md agents/grd-verifier.md agents/grd-plan-checker.md \
          agents/grd-integration-checker.md agents/grd-eval-planner.md \
          agents/grd-baseline-assessor.md agents/grd-migrator.md; do
  turns=$(sed -n '/^---$/,/^---$/p' "$f" | grep '^maxTurns:' | awk '{print $2}')
  if [ -z "$turns" ] || ! [[ "$turns" =~ ^[0-9]+$ ]]; then echo "FAIL maxTurns: $f"; fi
done

# S9: disallowedTools
grep -l 'disallowedTools:' agents/grd-code-reviewer.md agents/grd-plan-checker.md agents/grd-integration-checker.md agents/grd-verifier.md

# S10: YAML validity
for f in agents/grd-*.md; do
  block=$(sed -n '1,/^---$/p' "$f" | tail -n +2 | head -n -1)
  if ! python3 -c "import yaml, sys; yaml.safe_load(sys.stdin)" <<< "$block" 2>/dev/null; then
    echo "YAML ERROR: $f"
  fi
done

# S11-S13: Backend capability field
grep 'mcp_elicitation' lib/types.ts lib/backend.ts
grep -c 'mcp_elicitation' lib/backend.ts

# S14: Runtime init output
node bin/grd-tools.js init execute-phase 76 --json 2>/dev/null | grep -E 'mcp_elicitation_available|model_overrides_available'
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript build | [PASS/FAIL] | | |
| S2: Unit tests | [PASS/FAIL] | | |
| S3: Lint | [PASS/FAIL] | | |
| S4: All 20 agents have effort | [PASS/FAIL] | | |
| S5: effort values valid | [PASS/FAIL] | | |
| S6: effort matches EFFORT_PROFILES | [PASS/FAIL] | | |
| S7: Bounded agents have maxTurns | [PASS/FAIL] | | |
| S8: maxTurns values match spec | [PASS/FAIL] | | |
| S9: disallowedTools correct | [PASS/FAIL] | | |
| S10: YAML parseable | [PASS/FAIL] | | |
| S11: types.ts has mcp_elicitation | [PASS/FAIL] | | |
| S12: 7 backends have mcp_elicitation | [PASS/FAIL] | | |
| S13: Only claude has mcp_elicitation: true | [PASS/FAIL] | | |
| S14: Init output has new fields | [PASS/FAIL] | | |

### Proxy Results

None — no proxy metrics applicable to this phase.

### Ablation Results

None — no ablations applicable to this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-76-01 | Claude Code respects effort frontmatter at runtime | PENDING | First live autopilot run post-phase-76 |
| DEFER-76-02 | Claude Code respects disallowedTools at runtime | PENDING | First live code-review agent run post-phase-76 |
| DEFER-76-03 | model_overrides_available detects production settings | PENDING | First user run with modelOverrides configured |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: adequate — 14 checks covering all 5 roadmap success criteria with specific commands and expected outputs
- Proxy metrics: none required — structural correctness tasks have no performance dimension to approximate
- Deferred coverage: partial but honest — 3 deferred items covering runtime enforcement that cannot be tested locally; all are low-risk (features are additive, existing safeguards remain)

**What this evaluation CAN tell us:**
- Whether all 20 agent files were updated with the correct fields and values
- Whether the TypeScript codebase compiles cleanly after the interface extension
- Whether the runtime init command produces the two new output fields
- Whether YAML frontmatter remains parseable (critical — malformed YAML would silently disable agents)

**What this evaluation CANNOT tell us:**
- Whether Claude Code actually uses extended thinking when `effort: high` is set (deferred: DEFER-76-01)
- Whether Claude Code enforces disallowedTools restrictions at runtime (deferred: DEFER-76-02)
- Whether `model_overrides_available` correctly reads production user settings files (deferred: DEFER-76-03, partially covered by unit tests)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-19*
