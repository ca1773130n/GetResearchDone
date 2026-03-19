---
phase: 76-agent-frontmatter-and-mcp-elicitation
wave: all
plans_reviewed: [76-01, 76-02]
timestamp: 2026-03-19T00:00:00Z
blockers: 0
warnings: 3
info: 3
verdict: warnings_only
---

# Code Review: Phase 76 — Agent Frontmatter and MCP Elicitation

## Verdict: WARNINGS ONLY

Both plans executed successfully. All core plan truths are satisfied: all 20 agents have the `effort` field, the `mcp_elicitation` capability flag is correct in all 7 backends, and the init context surfaces both new fields. Three warnings are raised: one undocumented deviation (grd-plan-checker maxTurns=15 vs plan spec of 10), one out-of-scope agent modification introduced by a prior phase that was not documented as a deviation, and one out-of-scope agent modification similarly undocumented.

## Stage 1: Spec Compliance

### Plan Alignment

**Plan 76-01:**

Task 1 (effort field on all 20 agents) is fully complete. All 20 `agents/grd-*.md` files have a valid `effort` field matching the `balanced` column of `EFFORT_PROFILES`. Commit `a88e2cc` added the field to 12 agents; the remaining 8 had been pre-set by a prior cross-phase commit (`f5c4d9c` from phase 77-01, which ran before 76-01 in execution order). The SUMMARY correctly documents this as a "prior partial commit" deviation.

Task 2 (maxTurns and disallowedTools on bounded/restricted agents) is substantially complete, with one value discrepancy:

- The plan `must_haves.truths` block explicitly specifies `plan-checker=10`. The SUMMARY table lists `grd-plan-checker: maxTurns: 15`. The file on disk confirms `maxTurns: 15`. The prior-phase commit (`f5c4d9c`) set plan-checker to 15; commit `401077b` corrected other values (verifier, code-reviewer, integration-checker, baseline-assessor) but left plan-checker at 15 without documenting this as a deviation from the plan's specified value of 10.
- The docs commit `8cade2b` acknowledges `plan-checker=15` in its message, confirming this is intentional, but neither SUMMARY.md nor the commit message explains why 15 was kept instead of correcting to the plan's specified 10.

**[WARNING-1]** `grd-plan-checker` has `maxTurns: 15` but plan 76-01 `must_haves.truths` specifies `plan-checker=10`. The SUMMARY does not document this deviation or justify the kept value. The EVAL.md S8 check would fail on this agent.

**Plan 76-02:**

Task 1 (types.ts and backend.ts changes) was pre-completed in Phase 74. This is correctly documented as a deviation in the SUMMARY. Verification confirms `mcp_elicitation: boolean` is present in `lib/types.ts` and appears exactly 7 times in `lib/backend.ts` with only `claude` having `true`.

Task 2 (init context fields) is fully complete. Both `mcp_elicitation_available` and `model_overrides_available` appear in both `cmdInitExecutePhase` (line 170) and `cmdInitPlanPhase` (line 419) in `lib/context/execute.ts`. Runtime verification confirms the fields appear in `grd-tools init execute-phase 76 --json` output with correct types. The IIFE pattern and settings.json waterfall detection match the plan specification exactly. The deviation from capability-based to runtime-detection for `model_overrides_available` is correctly documented.

### Research Methodology

N/A — Phase 76 has no research references. EVAL.md explicitly notes "Reference papers: None."

### Context Decision Compliance

No CONTEXT.md exists for phase 76. No locked decisions to check.

### Known Pitfalls

No KNOWHOW.md in the research directory for this phase. No pitfall check applicable.

### Eval Coverage

EVAL.md defines 14 sanity checks (S1–S14). All checks that are verifiable at code-review time pass, with one exception:

- S8 (`maxTurns` values match spec): would report `FAIL: grd-plan-checker expected=10 actual=15`. This is the same issue as WARNING-1 above.
- S1 (build:check): passes — TypeScript compiles cleanly.
- S3 (lint): passes — no ESLint violations.
- S4–S6 (effort completeness and correctness): all pass.
- S7 (bounded agents have maxTurns): passes (all 7 have the field).
- S9 (disallowedTools): passes — code-reviewer, plan-checker, integration-checker have [Edit, Write]; verifier has only [Edit].
- S11–S14 (backend capability and runtime output): all pass.

## Stage 2: Code Quality

### Architecture Consistency

**Plan 76-02:** The implementation in `lib/context/execute.ts` follows the established IIFE pattern already present in the file for complex inline detection. The settings.json detection waterfall (project-level then user-level) mirrors the pattern used elsewhere in the codebase. The comment `// MCP elicitation and model overrides awareness (REQ-105, REQ-106)` correctly references the requirements. No new dependencies introduced.

**Plan 76-01:** YAML frontmatter additions follow the established ordering: name, description, tools, color, effort, maxTurns, disallowedTools. The YAML block sequence format (`- Edit`, `- Write`) is correct for the Claude Code agent system.

**[WARNING-2]** `grd-codebase-mapper` now has `maxTurns: 25` and `disallowedTools: Edit` (added by prior-phase commit `f5c4d9c` from phase 77-01). Neither field is in the 76-01 plan scope for this agent (it is not listed among the 7 bounded agents or 4 restricted agents). Commit `401077b` did not revert or document this as an out-of-scope change. The values may be intentional (codebase-mapper is a read-only analysis agent so `disallowedTools: Edit` is sensible), but the SUMMARY does not acknowledge these fields exist on this agent.

**[WARNING-3]** `grd-eval-reporter` now has `maxTurns: 25` (added by prior-phase commit `f5c4d9c` from phase 77-01). This agent is not in the 76-01 plan's bounded agents list. Commit `401077b` did not document this as an out-of-scope change. The SUMMARY lists grd-eval-reporter only in the effort section, not the maxTurns section, which is inconsistent with the file's actual state.

### Reproducibility

N/A — No experimental or training code in this phase.

### Documentation

The `lib/context/execute.ts` changes include the required REQ comment (`// MCP elicitation and model overrides awareness (REQ-105, REQ-106)`). Agent frontmatter fields are self-documenting via YAML key names. Adequate for this type of change.

**[INFO-1]** The `model_overrides_available` IIFE uses `process.env.HOME` as the fallback for the user-level settings path. On environments where `HOME` is unset, this silently falls back to an empty string. This is handled by the outer `try/catch` so it will not throw, but a comment noting this edge case would improve maintainability.

### Deviation Documentation

**Plan 76-01 SUMMARY.md:** Documents three auto-fixed deviations: incorrect maxTurns values from the prior partial commit (verifier, code-reviewer, integration-checker, baseline-assessor corrected), incorrect disallowedTools on verifier corrected, and inline string format converted to YAML array. Does NOT document plan-checker maxTurns=15 vs spec=10. Does NOT acknowledge codebase-mapper and eval-reporter having out-of-scope maxTurns/disallowedTools fields.

**Plan 76-02 SUMMARY.md:** Documents both deviations accurately: Task 1 pre-completed in Phase 74, and the model_overrides_available implementation updated from capability-based to runtime detection. Fully consistent with git history.

**[INFO-2]** The docs commit `8cade2b` acknowledges `plan-checker=15` in the commit message, indicating the executor was aware of the value. Promoting this acknowledgment to the SUMMARY.md deviations section would make the record complete.

**[INFO-3]** The agent-audit tests use `>= 6` and `>= 4` thresholds (not exact counts) for maxTurns and disallowedTools coverage. This means the tests will not catch if additional out-of-scope agents (codebase-mapper, eval-reporter) accumulate these fields beyond the plan's intended 7 and 4 respectively. Exact count assertions would provide tighter coverage alignment.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 1 | Plan Alignment | grd-plan-checker has maxTurns=15 but 76-01 plan spec (must_haves.truths) requires plan-checker=10; SUMMARY does not document this deviation. EVAL.md S8 would fail. |
| 2 | WARNING | 2 | Deviation Documentation | grd-codebase-mapper has maxTurns=25 and disallowedTools=Edit from out-of-scope prior commit f5c4d9c; not acknowledged in 76-01 SUMMARY or corrected by 76-01 commits. |
| 3 | WARNING | 2 | Deviation Documentation | grd-eval-reporter has maxTurns=25 from out-of-scope prior commit f5c4d9c; not acknowledged in 76-01 SUMMARY. |
| 4 | INFO | 2 | Documentation | model_overrides_available IIFE uses `process.env.HOME \|\| ''` without comment; edge case where HOME is unset is safe but undocumented. |
| 5 | INFO | 2 | Deviation Documentation | docs commit 8cade2b acknowledges plan-checker=15 but SUMMARY.md deviations section omits this. |
| 6 | INFO | 2 | Architecture | agent-audit tests use >= thresholds (>= 6 maxTurns, >= 4 disallowedTools) rather than exact counts; out-of-scope field additions go undetected by tests. |

## Recommendations

**WARNING-1 — grd-plan-checker maxTurns discrepancy:**
Either correct the value to `maxTurns: 10` as specified in the plan, or add a documented deviation to the SUMMARY explaining why 15 was kept (e.g., "plan-checker was pre-set to 15 by prior phase commit; 15 is more appropriate given its actual usage patterns, and we chose not to revert"). If 15 is intentional, update the plan's `must_haves.truths` retroactively so the record is consistent.

**WARNING-2 — grd-codebase-mapper out-of-scope fields:**
Add an entry to the 76-01 SUMMARY deviations section acknowledging that codebase-mapper has `maxTurns: 25` and `disallowedTools: Edit` from the prior phase commit. If these values are correct (codebase-mapper is read-only analysis, so Edit restriction is sensible), document them as accepted. If they are not correct, correct them in a follow-on commit.

**WARNING-3 — grd-eval-reporter out-of-scope maxTurns:**
Add an entry to the 76-01 SUMMARY deviations section acknowledging that eval-reporter has `maxTurns: 25` from the prior phase commit. Confirm whether 25 turns is an appropriate bound for this agent.
