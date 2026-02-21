# Evaluation Plan: Phase 44 — WebMCP Workflow Integration

**Designed:** 2026-02-21
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Markdown prompt modification — additive changes to three LLM agent instruction files
**Reference papers:** None — this is a workflow automation phase, not ML research. All evaluation criteria are derived from REQ-97, REQ-98, REQ-99 and the ROADMAP phase success criteria.

## Evaluation Overview

Phase 44 modifies three LLM agent prompt files (`commands/execute-phase.md`, `agents/grd-verifier.md`, `agents/grd-eval-planner.md`) to integrate WebMCP tool calls into GRD's execution, verification, and evaluation workflows. There are no compiled artifacts, no runtime tests, and no benchmark datasets. The output artifacts are Markdown files whose correctness is determined entirely by their textual content.

This means evaluation is fundamentally different from ML research phases. There is no PSNR/SSIM to measure, no loss curve to inspect, and no model to benchmark. Instead, we evaluate whether the instruction files contain the correct tokens in the correct structural positions, with the correct conditional guards and output format sections.

**What can be verified immediately (Levels 1 and 2):** File existence, keyword presence, structural positioning of new sections, presence of conditional guards, output template sections, and cross-file consistency (eval-planner defines what verifier consumes). These checks are fast, cheap, and precise — a grep that fails means the modification was not made.

**What must be deferred (Level 3):** Runtime behavior — whether a real Claude instance reading these files actually behaves correctly when Chrome DevTools MCP is or is not present. This requires a live execution environment with MCP tooling configured. It cannot be verified by static analysis of the Markdown files alone.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Token presence (`webmcp_available`) | REQ-97, REQ-98, REQ-99 | Conditional guard is a hard requirement; absence means the feature will break without MCP |
| Token presence (`hive_get_health_status`, `hive_check_console_errors`, `hive_get_page_info`) | REQ-97 (specific tool names), ROADMAP success criteria #1 | These are the exact tool names required; wrong names → wrong tool calls at runtime |
| Token presence (`hive_list_registered_tools`) | REQ-98 | Tool discovery is the entry point for verifier WebMCP; its absence means discovery step missing |
| Token presence (`useWebMcpTool`) | REQ-99 | Eval planner output syntax; its absence means no tool definitions will flow to verifier |
| Section positioning | ROADMAP success criteria #1-5, PLAN must_haves.truths | Correct positioning determines whether the step runs at the right point in the workflow |
| Conditional guard structure | REQ-97, REQ-98, REQ-99, PLAN must_haves.truths | Skip-when-false behavior is a P0 correctness requirement for backward compatibility |
| Cross-file consistency | REQ-98, REQ-99 — verifier consumes EVAL.md from planner | If planner doesn't write what verifier expects, the integration loop breaks |
| Output template sections present | PLAN 44-02 must_haves.key_links | VERIFICATION.md and EVAL.md templates must include new sections for results to surface |
| Retry/halt logic tokens (`retry`) | REQ-97, ROADMAP success criteria #2 | Missing retry logic means second failure silently continues or produces wrong halt behavior |
| Existing content preservation | PLAN 44-01 and 44-02 must_haves.truths | Changes are purely additive; regressions in existing functionality are P0 failures |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 12 | File existence, keyword presence, structural tokens — binary pass/fail |
| Proxy (L2) | 6 | Content quality — correct positioning, structural integrity, cross-file consistency |
| Deferred (L3) | 3 | Runtime behavior with live MCP environment |

---

## Level 1: Sanity Checks

**Purpose:** Verify the files exist and contain the required tokens. These are binary — either the token is present or the modification was not made. ALL must pass before proceeding.

### S1: execute-phase.md exists and is non-empty

- **What:** The target file for Plan 44-01 exists on disk and has content
- **Command:** `wc -l /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md`
- **Expected:** Output shows a line count > 300 (file was ~676 lines before modification; must be larger after additive change)
- **Failure means:** File was deleted or overwritten with empty content — catastrophic regression

### S2: grd-verifier.md exists and is non-empty

- **What:** The target file for Plan 44-02 (Task 1) exists on disk with content
- **Command:** `wc -l /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-verifier.md`
- **Expected:** Output shows a line count > 700 (file was ~735 lines before modification; must be larger after additive change)
- **Failure means:** File was deleted or overwritten — catastrophic regression

### S3: grd-eval-planner.md exists and is non-empty

- **What:** The target file for Plan 44-02 (Task 2) exists on disk with content
- **Command:** `wc -l /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-eval-planner.md`
- **Expected:** Output shows a line count > 700 (file was ~712 lines before modification; must be larger after additive change)
- **Failure means:** File was deleted or overwritten — catastrophic regression

### S4: execute-phase.md contains webmcp_available

- **What:** The conditional guard token is present in execute-phase.md, indicating the new step reads this field from init JSON
- **Command:** `grep -c "webmcp_available" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md`
- **Expected:** Count >= 2 (must appear in the initialize step field list AND in the conditional guard of the new step; ideally 3+ if both flow variants reference it)
- **Failure means:** The conditional guard was not written — MCP-unavailable graceful skip behavior is absent; every execution would try to call MCP tools unconditionally

### S5: execute-phase.md contains all three health check tool names

- **What:** The three tool names required by REQ-97 are present in execute-phase.md
- **Command:** `grep -c "hive_get_health_status\|hive_check_console_errors\|hive_get_page_info" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md`
- **Expected:** Count >= 3 (at minimum one occurrence per tool name; likely more since both flow variants should reference them)
- **Failure means:** One or more health check tool calls are missing — the sanity check step is incomplete and won't catch regressions

### S6: execute-phase.md contains retry logic token

- **What:** The retry/halt pattern from REQ-97 is documented in execute-phase.md
- **Command:** `grep -c "retry\|Retry" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md`
- **Expected:** Count >= 2 (retry logic description in new step; existing classifyHandoffIfNeeded section also uses "Retry" so baseline count ≥ 1 before modification)
- **Failure means:** Retry logic was not written; second failure would not halt execution correctly

### S7: grd-verifier.md contains hive_list_registered_tools

- **What:** Tool discovery entry point is present in grd-verifier.md
- **Command:** `grep -c "hive_list_registered_tools" /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-verifier.md`
- **Expected:** Count >= 1
- **Failure means:** Tool discovery step (Step 5b-1) is missing — verifier will not discover registered tools; entire WebMCP verification loop is absent

### S8: grd-verifier.md contains WebMCP Verification output section

- **What:** The VERIFICATION.md template section is present in grd-verifier.md
- **Command:** `grep -c "WebMCP Verification" /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-verifier.md`
- **Expected:** Count >= 1
- **Failure means:** Results will not surface in VERIFICATION.md output — the feature is implemented but invisible to users

### S9: grd-verifier.md contains webmcp_available conditional guard

- **What:** The skip-when-false guard is present in grd-verifier.md
- **Command:** `grep -c "webmcp_available" /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-verifier.md`
- **Expected:** Count >= 1
- **Failure means:** Verifier would attempt MCP tool calls even when Chrome DevTools MCP is not configured — runtime errors in non-MCP environments

### S10: grd-eval-planner.md contains design_webmcp_tools step

- **What:** The new execution flow step is present in grd-eval-planner.md
- **Command:** `grep -c "design_webmcp_tools\|WebMCP Tool Definitions" /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-eval-planner.md`
- **Expected:** Count >= 2 (step name in execution_flow AND section name in output_format template)
- **Failure means:** Eval planner will not generate tool definitions; the eval-planner → verifier integration loop is broken at the source

### S11: grd-eval-planner.md contains useWebMcpTool syntax

- **What:** The tool definition syntax that verifier consumes is present in grd-eval-planner.md
- **Command:** `grep -c "useWebMcpTool" /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-eval-planner.md`
- **Expected:** Count >= 2 (at minimum one in the step definition and one in the output template example)
- **Failure means:** Even if the step runs, it won't produce machine-readable definitions that grd-verifier can parse for page-specific tool matching

### S12: grd-eval-planner.md contains webmcp_available conditional guard

- **What:** The skip-when-false guard is present in grd-eval-planner.md
- **Command:** `grep -c "webmcp_available" /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-eval-planner.md`
- **Expected:** Count >= 1
- **Failure means:** Eval planner would generate WebMCP sections unconditionally — producing meaningless output in non-MCP environments

**Sanity gate:** ALL 12 sanity checks must pass. Any failure indicates the modification in the corresponding plan was not made correctly and blocks progression.

---

## Level 2: Proxy Metrics

**Purpose:** Content quality verification — correct positioning, structural integrity, cross-file consistency, and flow-variant coverage. These go beyond token presence to verify the tokens are in the right structural context.

**IMPORTANT:** These proxy metrics verify structural correctness of Markdown instruction files, not ML model quality. Correlation with the real metric (correct runtime behavior) is HIGH for structural checks but cannot be 1.0 — an LLM could theoretically ignore well-structured instructions.

### P1: Correct structural position in execute-phase.md — step 4b placement

- **What:** The WebMCP sanity check step in the standard `execute_waves` flow is positioned after spot-check (step 4) and before failure handling (step 5), not elsewhere in the file
- **How:** Read execute-phase.md, locate step 4 ("Report completion — spot-check claims first") and step 5 ("Handle failures"), verify the new WebMCP step appears between them in the `execute_waves` section
- **Command:** `grep -n "spot-check\|Report completion\|Handle failures\|WebMCP sanity\|webmcp_sanity\|4b\|Step 4b" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md`
- **Target:** The grep output shows WebMCP-related lines at line numbers between the spot-check lines and the failure-handling lines within the `execute_waves` step block
- **Evidence:** Plan 44-01 Task 1 action explicitly specifies "After step 4... and BEFORE step 5, insert a new step 4b". Correct positioning is a correctness requirement — wrong position means wrong execution order.
- **Correlation with full metric (correct runtime behavior):** HIGH — if the step is in the wrong position, it will run at the wrong time regardless of what it says
- **Blind spots:** Does not verify that the step text correctly describes retry logic in sufficient detail for an LLM to follow it; does not verify the teams flow variant positioning
- **Validated:** No — awaiting deferred validation at phase-45-or-later-runtime-test

### P2: Both flow variants covered in execute-phase.md

- **What:** The WebMCP sanity check appears in BOTH `execute_waves` (standard) and `execute_waves_teams` (teams) flow variants
- **How:** Identify the line ranges of each flow section, confirm WebMCP content exists within both ranges
- **Command:** `grep -n "execute_waves_teams\|execute_waves\|webmcp_available\|WebMCP\|hive_get_health" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md`
- **Target:** WebMCP-related tokens appear at line numbers that fall within both the `execute_waves_teams` section (approximately lines 108-236 per plan) and the `execute_waves` section (approximately lines 238-356 per plan). At minimum, token occurrences should span both halves of the file.
- **Evidence:** Plan 44-01 success criteria item 1 ("contains WebMCP sanity check step in BOTH flow variants") and must_haves.truths item 6 ("exists in BOTH execute_waves and execute_waves_teams")
- **Correlation with full metric:** HIGH — if one variant is missing, 50% of execute-phase invocations (the teams path) will lack health checks
- **Blind spots:** Does not verify the teams variant content is as complete as the standard variant (it may be a brief reference rather than full duplication per plan spec)
- **Validated:** No — awaiting deferred validation at phase-45-or-later-runtime-test

### P3: Step 5b positioning in grd-verifier.md

- **What:** The new WebMCP verification step is positioned between Step 5 (Deferred Verification Tracking) and Step 6 (Experiment Verification) in grd-verifier.md's verification_process section
- **How:** Read grd-verifier.md, locate "Step 5:" and "Step 6:" headers, verify WebMCP step appears between them
- **Command:** `grep -n "Step 5\|Step 6\|Step 5b\|WebMCP Verification\|hive_list_registered" /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-verifier.md`
- **Target:** The grep output shows "Step 5b" or "WebMCP Verification" at line numbers between "Step 5:" and "Step 6:" lines
- **Evidence:** Plan 44-02 Task 1 action explicitly specifies "Insert after Step 5... and before Step 6". Correct positioning is critical — Step 5b must run after standard tiered checks but before experiment verification.
- **Correlation with full metric:** HIGH — wrong position means wrong execution order in the agent's verification process
- **Blind spots:** Does not verify the substep structure (5b-1 through 5b-4) is complete and internally consistent
- **Validated:** No — awaiting deferred validation at phase-45-or-later-runtime-test

### P4: design_webmcp_tools step positioning in grd-eval-planner.md

- **What:** The new design_webmcp_tools step is positioned after design_ablation_plan and before write_eval_md in the execution_flow section
- **How:** Read grd-eval-planner.md, locate the `<step name="design_ablation_plan">` and `<step name="write_eval_md">` tags, verify design_webmcp_tools appears between them
- **Command:** `grep -n "design_ablation_plan\|design_webmcp_tools\|write_eval_md" /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-eval-planner.md`
- **Target:** The grep output shows `design_webmcp_tools` at a line number between `design_ablation_plan` and `write_eval_md`
- **Evidence:** Plan 44-02 Task 2 action explicitly specifies "Insert after design_ablation_plan and before write_eval_md". Correct positioning ensures the tool definitions are generated before EVAL.md is written, so they appear in the output file.
- **Correlation with full metric:** HIGH — if this step runs after write_eval_md, tool definitions will never appear in EVAL.md
- **Blind spots:** Does not verify the frontend detection heuristic content is complete and sensible
- **Validated:** No — awaiting deferred validation at phase-45-or-later-runtime-test

### P5: Cross-file consistency — verifier references EVAL.md useWebMcpTool definitions

- **What:** The grd-verifier.md step 5b explicitly references EVAL.md as the source of page-specific tool definitions, creating the eval-planner → verifier integration link
- **How:** Check grd-verifier.md for a reference to EVAL.md and useWebMcpTool in the context of the verifier's tool-matching logic
- **Command:** `grep -n "EVAL.md\|useWebMcpTool" /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-verifier.md`
- **Target:** At least one occurrence of `useWebMcpTool` in grd-verifier.md, appearing in the Step 5b section, indicating the verifier knows to look for these definitions in EVAL.md
- **Evidence:** Plan 44-02 key_links entry: "from: agents/grd-eval-planner.md, to: agents/grd-verifier.md, via: useWebMcpTool() definitions consumed by verifier". This link is the P1 integration requirement; without it, REQ-99 produces output that nothing consumes.
- **Correlation with full metric:** MEDIUM — the token presence tells us the instructions reference the link, but not that an LLM will correctly parse EVAL.md at runtime
- **Blind spots:** Cannot verify the actual parsing logic will work for arbitrary useWebMcpTool() definitions generated by eval-planner
- **Validated:** No — awaiting deferred validation at phase-45-or-later-runtime-test

### P6: Existing step numbering preserved in both agent files

- **What:** No existing steps were removed or renumbered during the additive modifications
- **How:** Check that the original step numbers 0-11 in grd-verifier.md and all original steps in grd-eval-planner.md still exist
- **Command:** `grep -c "## Step [0-9]" /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-verifier.md && grep -c "<step name=" /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-eval-planner.md`
- **Target:** grd-verifier.md shows >= 12 step headers (Steps 0-11 original plus Step 5b new = 13 total); grd-eval-planner.md shows >= 8 step names (7 original plus design_webmcp_tools new = 8 minimum)
- **Evidence:** Both plans include "CRITICAL PRESERVATION RULES: Do NOT remove or modify any existing steps" — preservation is a hard correctness requirement since existing steps perform other essential verifier/planner functions
- **Correlation with full metric:** HIGH — missing steps mean lost functionality in other parts of the workflow
- **Blind spots:** Does not verify individual step content was not accidentally modified (only counts steps)
- **Validated:** No — awaiting deferred validation at phase-45-or-later-runtime-test

---

## Level 3: Deferred Validations

**Purpose:** Runtime behavior validation requiring a live Chrome DevTools MCP environment. These cannot be verified by static analysis of the Markdown files.

### D1: execute-phase WebMCP health checks fire correctly at runtime — DEFER-44-01

- **What:** When execute-phase runs with Chrome DevTools MCP available (`webmcp_available=true`), the three health check tool calls (`hive_get_health_status`, `hive_check_console_errors`, `hive_get_page_info`) actually execute after each plan's spot-check, and the retry/halt logic triggers on the second failure
- **How:** Run an actual `/grd:execute-phase` invocation with Chrome DevTools MCP configured, on a phase with at least one plan, with a simulated MCP tool failure on the second attempt
- **Why deferred:** Requires a live Claude Code session with Chrome DevTools MCP configured and active (`webmcp_available=true` in init JSON). Static analysis of the Markdown instruction file cannot verify LLM behavior.
- **Validates at:** Manual runtime test — any future phase execution where Chrome DevTools MCP is available
- **Depends on:** Chrome DevTools MCP installed and configured in `.claude-plugin/plugin.json` or equivalent; a project with at least one execute-phase invocation to observe
- **Target:** Zero uncaught runtime errors; health checks fire after each plan in both standard and teams flows; retry fires on first failure; halt fires on second consecutive failure with clear error message containing the failed check name and error details
- **Risk if unmet:** REQ-97 is implemented but not validated — health checks may fire at wrong time, retry logic may be ignored by LLM, or halt message may be missing key information. User would not know their app is unhealthy.
- **Fallback:** Manual inspection of the next execute-phase invocation where MCP is available; if behavior is wrong, create gap plan to revise the step wording

### D2: grd-verifier WebMCP verification runs and populates VERIFICATION.md — DEFER-44-02

- **What:** When grd-verifier runs with Chrome DevTools MCP available, it calls `hive_list_registered_tools`, invokes generic health checks, matches page-specific tools from EVAL.md, and writes a "## WebMCP Verification" section in VERIFICATION.md
- **How:** Run `/grd:verify-work` on a phase that has an EVAL.md with `useWebMcpTool()` definitions, with Chrome DevTools MCP active. Inspect the resulting VERIFICATION.md for the WebMCP section.
- **Why deferred:** Requires a live grd-verifier invocation with Chrome DevTools MCP available AND a completed EVAL.md containing `useWebMcpTool()` definitions. Both conditions depend on runtime context not available during plan evaluation.
- **Validates at:** First frontend phase that runs full execute/verify cycle with WebMCP enabled
- **Depends on:** Chrome DevTools MCP active; an EVAL.md with `useWebMcpTool()` definitions (produced by grd-eval-planner after Plan 44-02 ships); grd-verifier invocation
- **Target:** VERIFICATION.md contains "## WebMCP Verification" section with Tool Discovery table, Health Check Results table, and Page-Specific Tool Results table populated with actual tool call results
- **Risk if unmet:** REQ-98 is implemented but not validated — verifier may not parse EVAL.md correctly, tool discovery may fail silently, or output section may be empty
- **Fallback:** Manual verification of VERIFICATION.md content on first usage; if output section is missing or malformed, create gap plan to fix step 5b wording

### D3: grd-eval-planner generates correct useWebMcpTool definitions for frontend phases — DEFER-44-03

- **What:** When grd-eval-planner runs for a phase that modifies frontend files (e.g., `.tsx`, `src/pages/`, `src/views/`), it generates a "## WebMCP Tool Definitions" section in EVAL.md with `useWebMcpTool()` calls that correctly identify the modified pages
- **How:** Run `/grd:eval-plan` on a phase with frontend files in `files_modified`, with `webmcp_available=true`. Inspect the resulting EVAL.md for the WebMCP Tool Definitions section and verify the generated tool names match the pages modified.
- **Why deferred:** Requires a frontend phase to plan. No current phases in v0.2.5 modify frontend files — this is infrastructure for future use. The detection heuristic (file extensions, path patterns, keywords) can only be validated against real frontend phases.
- **Validates at:** First frontend phase planned after v0.2.5 ships
- **Depends on:** A phase with frontend files in `files_modified`; grd-eval-planner invocation with `webmcp_available=true`
- **Target:** EVAL.md contains "## WebMCP Tool Definitions" section with: generic checks table (3 tools), page-specific tools table with tool names following `hive_check_{page_slug}_{aspect}` convention, and `useWebMcpTool()` code block with correct syntax
- **Risk if unmet:** REQ-99 is implemented but not validated — eval-planner may not trigger frontend detection correctly, or generated tool names may not match conventions, breaking the eval-planner → verifier integration link
- **Fallback:** Manual review of first generated EVAL.md with WebMCP section; if output is wrong, create gap plan to refine frontend detection heuristic or output template

---

## Ablation Plan

**No ablation plan** — This phase makes additive changes to three Markdown instruction files with no sub-components to isolate. There is no component hierarchy to ablate, and no baseline to compare against (no prior WebMCP integration exists). Each plan targets a distinct file with distinct functionality, and they are not interchangeable.

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Pre-phase execute-phase.md | No WebMCP tokens present | 0 occurrences of `webmcp_available`, `hive_get_health_status` | Static analysis before Phase 44 execution |
| Pre-phase grd-verifier.md | No WebMCP tokens present | 0 occurrences of `hive_list_registered_tools`, `WebMCP Verification` | Static analysis before Phase 44 execution |
| Pre-phase grd-eval-planner.md | No WebMCP tokens present | 0 occurrences of `design_webmcp_tools`, `useWebMcpTool` | Static analysis before Phase 44 execution |

All baselines are zero — this is new functionality. Any non-zero count after execution confirms the modification was made. Any zero count after execution is a direct failure.

---

## Evaluation Scripts

**Location of evaluation code:** No separate evaluation scripts — all checks use `grep` and `wc -l` directly against the modified files. All commands are specified inline in each sanity and proxy check above.

**How to run all Level 1 sanity checks:**

```bash
EXEC_PHASE=/Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md
VERIFIER=/Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-verifier.md
EVAL_PLANNER=/Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-eval-planner.md

echo "=== S1: execute-phase.md line count ===" && wc -l "$EXEC_PHASE"
echo "=== S2: grd-verifier.md line count ===" && wc -l "$VERIFIER"
echo "=== S3: grd-eval-planner.md line count ===" && wc -l "$EVAL_PLANNER"
echo "=== S4: webmcp_available in execute-phase ===" && grep -c "webmcp_available" "$EXEC_PHASE"
echo "=== S5: three health tool names in execute-phase ===" && grep -c "hive_get_health_status\|hive_check_console_errors\|hive_get_page_info" "$EXEC_PHASE"
echo "=== S6: retry logic in execute-phase ===" && grep -c "retry\|Retry" "$EXEC_PHASE"
echo "=== S7: hive_list_registered_tools in grd-verifier ===" && grep -c "hive_list_registered_tools" "$VERIFIER"
echo "=== S8: WebMCP Verification section in grd-verifier ===" && grep -c "WebMCP Verification" "$VERIFIER"
echo "=== S9: webmcp_available in grd-verifier ===" && grep -c "webmcp_available" "$VERIFIER"
echo "=== S10: design_webmcp_tools or WebMCP Tool Definitions in grd-eval-planner ===" && grep -c "design_webmcp_tools\|WebMCP Tool Definitions" "$EVAL_PLANNER"
echo "=== S11: useWebMcpTool in grd-eval-planner ===" && grep -c "useWebMcpTool" "$EVAL_PLANNER"
echo "=== S12: webmcp_available in grd-eval-planner ===" && grep -c "webmcp_available" "$EVAL_PLANNER"
```

**How to run all Level 2 proxy checks:**

```bash
EXEC_PHASE=/Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md
VERIFIER=/Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-verifier.md
EVAL_PLANNER=/Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-eval-planner.md

echo "=== P1: Step 4b positioning in execute-phase ===" && grep -n "spot-check\|Report completion\|Handle failures\|WebMCP sanity\|webmcp_sanity\|4b\|Step 4b" "$EXEC_PHASE"
echo "=== P2: Both flow variants covered ===" && grep -n "execute_waves_teams\|execute_waves\|webmcp_available\|WebMCP\|hive_get_health" "$EXEC_PHASE"
echo "=== P3: Step 5b positioning in grd-verifier ===" && grep -n "## Step 5\|## Step 6\|Step 5b\|WebMCP Verification\|hive_list_registered" "$VERIFIER"
echo "=== P4: design_webmcp_tools positioning in grd-eval-planner ===" && grep -n "design_ablation_plan\|design_webmcp_tools\|write_eval_md" "$EVAL_PLANNER"
echo "=== P5: Cross-file consistency — verifier references useWebMcpTool ===" && grep -n "EVAL.md\|useWebMcpTool" "$VERIFIER"
echo "=== P6: Existing step counts ===" && grep -c "## Step [0-9]" "$VERIFIER" && grep -c "<step name=" "$EVAL_PLANNER"
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results (Level 1)

| Check | Target | Actual Count | Status | Notes |
|-------|--------|-------------|--------|-------|
| S1: execute-phase.md line count | > 300 lines | | | |
| S2: grd-verifier.md line count | > 700 lines | | | |
| S3: grd-eval-planner.md line count | > 700 lines | | | |
| S4: `webmcp_available` in execute-phase | >= 2 occurrences | | | |
| S5: Three health tool names in execute-phase | >= 3 occurrences | | | |
| S6: Retry logic in execute-phase | >= 2 occurrences | | | |
| S7: `hive_list_registered_tools` in grd-verifier | >= 1 occurrence | | | |
| S8: `WebMCP Verification` section in grd-verifier | >= 1 occurrence | | | |
| S9: `webmcp_available` in grd-verifier | >= 1 occurrence | | | |
| S10: `design_webmcp_tools` or `WebMCP Tool Definitions` in grd-eval-planner | >= 2 occurrences | | | |
| S11: `useWebMcpTool` in grd-eval-planner | >= 2 occurrences | | | |
| S12: `webmcp_available` in grd-eval-planner | >= 1 occurrence | | | |

**Level 1 Score:** [N]/12 passed

### Proxy Results (Level 2)

| Metric | Target | Status | Evidence |
|--------|--------|--------|---------|
| P1: Step 4b positioned after spot-check, before failure handling | Line numbers confirm ordering | | |
| P2: Both execute_waves and execute_waves_teams covered | WebMCP tokens in both section ranges | | |
| P3: Step 5b between Step 5 and Step 6 in grd-verifier | Line numbers confirm ordering | | |
| P4: design_webmcp_tools between design_ablation_plan and write_eval_md | Line numbers confirm ordering | | |
| P5: grd-verifier references useWebMcpTool from EVAL.md | >= 1 occurrence of useWebMcpTool in verifier | | |
| P6: Existing step counts preserved | >= 13 in verifier, >= 8 in eval-planner | | |

**Level 2 Score:** [N]/6 passed

### Ablation Results

Not applicable — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-44-01 | execute-phase WebMCP health checks fire at runtime with correct retry/halt | PENDING | First execute-phase run with Chrome DevTools MCP active |
| DEFER-44-02 | grd-verifier populates VERIFICATION.md WebMCP section | PENDING | First verify-phase run with Chrome DevTools MCP active |
| DEFER-44-03 | grd-eval-planner generates useWebMcpTool definitions for frontend phases | PENDING | First frontend phase eval-plan with webmcp_available=true |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** MEDIUM-HIGH

**Justification:**

- **Sanity checks:** Adequate — 12 binary token-presence and line-count checks cover all required tokens from all three requirements (REQ-97, REQ-98, REQ-99). Each check maps directly to a specific requirement or PLAN must_have. These checks are reproducible, fast, and unambiguous.

- **Proxy metrics:** Well-evidenced for what they measure (structural positioning and cross-file consistency), but the domain limits their ceiling. Correlation between "step is in the right place in Markdown" and "LLM follows the step in the right order at runtime" is HIGH but not 1.0. This is an inherent limitation of evaluating LLM instruction files via static analysis.

- **Deferred coverage:** Comprehensive given the constraints. All three deferred items correspond to the three requirements, and each specifies a concrete validation event (a real invocation with Chrome DevTools MCP). The validates_at references are honest — they cannot be made more specific because no future phase currently uses Chrome DevTools MCP.

**What this evaluation CAN tell us:**

- Whether all three files were modified (non-zero token counts confirm the changes were made)
- Whether the new steps are in the correct structural positions within each file (proxy checks confirm ordering)
- Whether the eval-planner → verifier integration link is expressed in both files (cross-file consistency check)
- Whether existing functionality was preserved (step count checks and line count checks)
- Whether all three requirements' key terms appear in the correct files (sanity checks map one-to-one with REQ-97/98/99)

**What this evaluation CANNOT tell us:**

- Whether a real Claude LLM instance will correctly interpret and follow the new instructions at runtime (deferred to DEFER-44-01, DEFER-44-02, DEFER-44-03)
- Whether the retry/halt wording is clear enough for an LLM to implement correctly without ambiguity (deferred to DEFER-44-01)
- Whether the frontend detection heuristic in grd-eval-planner will correctly identify real frontend phases (deferred to DEFER-44-03 — no current phases test this)
- Whether the useWebMcpTool() parsing logic in grd-verifier will handle edge cases in planner output (deferred to DEFER-44-02)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-21*
