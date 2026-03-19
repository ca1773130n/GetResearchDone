# Evaluation Plan: Phase 74 — Model Mappings and Capability Flags

**Designed:** 2026-03-19
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Static data updates — DEFAULT_BACKEND_MODELS, BACKEND_CAPABILITIES, BackendCapabilities interface
**Reference papers:** None — implementation phase derived from product requirements (REQ-107, REQ-110, REQ-111, REQ-113, REQ-114, REQ-116)

## Evaluation Overview

Phase 74 makes two classes of changes: model name string updates (Wave 1, plan 74-01) and interface/flag extensions (Wave 2, plan 74-02). Both classes are purely static data — no algorithmic logic, no network calls, no probabilistic outputs. This means evaluation can be nearly exhaustive at the sanity tier: every invariant we care about is directly testable through TypeScript compilation and unit tests.

There are no proxy metrics needed for this phase. The correctness criteria are binary and verifiable locally: either `DEFAULT_BACKEND_MODELS.codex.haiku` equals `'gpt-5.4-mini'` or it does not. Either the `BackendCapabilities` interface compiles cleanly with 7 new fields or it does not. The unit test suite provides exact coverage.

Deferred validation is limited to one concern: confirming at runtime integration that `model_overrides_available` surfaces correctly in the `cmdInitExecutePhase` context payload consumed by executor agents. That requires integration-level invocation but carries low risk given the straightforward field addition.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compilation (zero type errors) | Plan verification clauses (74-01, 74-02) | Extended interface fields must be type-safe; strict mode catches missing fields in object literals |
| Unit test pass rate | Plan success criteria (74-01, 74-02) | Existing `toEqual` assertions enforce exact object shape; new tests enforce per-flag invariants |
| Lint pass rate | CLAUDE.md dev commands | Pre-commit hook blocks on lint failures; must pass before commit |
| Model name grep verification | Plan verification clauses (74-01) | Direct string match confirms the correct literal values are in source |
| Capability flag grep count | Plan verification clauses (74-02) | Count-based grep confirms all 7 backends are updated, not just one |
| model_overrides_available field presence | Plan verification clauses (74-02) | Confirms the init-context change was applied |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 9 | Compilation, lint, unit tests, and direct string/count verification |
| Proxy (L2) | 0 | Not applicable — correctness is directly verifiable, proxy metrics would add no signal |
| Deferred (L3) | 2 | Runtime integration and downstream agent context consumption |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript type check — Wave 1 (model mappings)

- **What:** `tsc --noEmit` succeeds after model name string changes in `lib/backend.ts`. No new type errors introduced.
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, zero type errors printed
- **Failure means:** A type definition was accidentally changed, or an import broke. Likely a copy-paste error in the model name strings touching adjacent code.

### S2: Backend unit tests — Wave 1 (model mapping assertions)

- **What:** All tests in `tests/unit/backend.test.ts` pass with updated `DEFAULT_BACKEND_MODELS` assertions for codex haiku and gemini sonnet.
- **Command:** `npx jest tests/unit/backend.test.ts --no-coverage`
- **Expected:** 0 failures, all pre-existing tests pass
- **Failure means:** Either the source change was not applied (`DEFAULT_BACKEND_MODELS` still has old values), or the test assertions were not updated to match the new values.

### S3: Codex haiku model name grep

- **What:** `lib/backend.ts` contains the literal string `'gpt-5.4-mini'` in the codex haiku slot.
- **Command:** `grep 'gpt-5.4-mini' /Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts`
- **Expected:** At least one match, appearing in the `codex:` block of `DEFAULT_BACKEND_MODELS`
- **Failure means:** Wave 1 task 1 was not executed or the wrong model name was written.

### S4: Gemini sonnet model name grep

- **What:** `lib/backend.ts` contains the literal string `'gemini-3.1-flash'` in the gemini sonnet slot.
- **Command:** `grep 'gemini-3.1-flash' /Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts`
- **Expected:** At least one match (sonnet slot); the `gemini-3.1-flash-lite` haiku slot will also match — acceptable
- **Failure means:** Wave 1 task 1 did not update gemini.sonnet, or it was set to the wrong value.

### S5: TypeScript type check — Wave 2 (capability flags)

- **What:** `tsc --noEmit` succeeds after `BackendCapabilities` interface is extended with 7 new fields and all 7 backend objects in `BACKEND_CAPABILITIES` are updated.
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, zero type errors
- **Failure means:** One or more backends in `BACKEND_CAPABILITIES` are missing newly-required fields, or the `max_output_tokens` nullable type is mismatched. TypeScript strict mode will catch all missing fields in object literals.

### S6: Backend unit tests — Wave 2 (full suite including new flag tests)

- **What:** All tests in `tests/unit/backend.test.ts` pass, including the 9 updated `toEqual` assertions and 8 new capability flag tests.
- **Command:** `npx jest tests/unit/backend.test.ts --no-coverage`
- **Expected:** 0 failures; test count increases by 8 new tests compared to pre-phase count
- **Failure means:** Either the `BACKEND_CAPABILITIES` objects are missing new fields (causing `toEqual` failures), or the per-flag invariants are wrong (e.g., `codex.smart_approvals` not true, `claude.mcp_elicitation` not true).

### S7: Capability flag per-backend grep count — smart_approvals

- **What:** `lib/backend.ts` contains `smart_approvals` exactly 7 times — once per backend entry.
- **Command:** `grep -c 'smart_approvals' /Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts`
- **Expected:** 7
- **Failure means:** Not all backends were updated, or the field appears elsewhere unexpectedly.

### S8: Capability flag per-backend grep count — mcp_elicitation

- **What:** `lib/backend.ts` contains `mcp_elicitation` exactly 7 times — once per backend entry.
- **Command:** `grep -c 'mcp_elicitation' /Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts`
- **Expected:** 7
- **Failure means:** Not all backends were updated. A common error would be updating only claude and forgetting the remaining 6 backends.

### S9: model_overrides_available field in execute context

- **What:** `lib/context/execute.ts` contains `model_overrides_available` as a field in the `cmdInitExecutePhase` result object.
- **Command:** `grep 'model_overrides_available' /Users/neo/Developer/Projects/GetResearchDone/lib/context/execute.ts`
- **Expected:** At least one match, in the body of `cmdInitExecutePhase`
- **Failure means:** Wave 2 task 2 was not applied, or was applied to the wrong function.

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to commit.

## Level 2: Proxy Metrics

### No Proxy Metrics

**Rationale:** This phase makes no algorithmic changes and has no probabilistic outputs. Every correctness criterion is directly testable via TypeScript compilation and unit test assertions. Proxy metrics would add no signal beyond what the sanity checks already provide — the unit tests themselves are the ground truth for correctness at this layer.

**Recommendation:** Rely entirely on sanity checks (Level 1). The unit test suite effectively serves as the acceptance test for this phase. Deferred validation handles the one concern that cannot be verified locally.

## Level 3: Deferred Validations

### D1: Runtime model resolution — codex and gemini model names — DEFER-74-01

- **What:** At runtime, `resolveBackendModel('codex', 'haiku')` returns `'gpt-5.4-mini'` and `resolveBackendModel('gemini', 'sonnet')` returns `'gemini-3.1-flash'` in a live GRD execution context.
- **How:** Run `gd state load --json` with `CODEX_HOME` set, observe the `backend_model_haiku` field in output. Alternatively, exercise an autopilot run against a Codex-connected environment.
- **Why deferred:** Requires access to a Codex or Gemini CLI environment. The unit tests verify the constant values statically, but runtime resolution also passes through config overrides and dynamic model detection, which can shadow the defaults. The deferred check confirms no override path is accidentally masking the new defaults.
- **Validates at:** phase-75-or-later (first phase that exercises Codex or Gemini backend in CI) or manual verification with `CODEX_HOME` set
- **Depends on:** Access to a Codex CLI environment, or a live test run with `CODEX_HOME` configured
- **Target:** `resolveBackendModel('codex', 'haiku')` === `'gpt-5.4-mini'`, `resolveBackendModel('gemini', 'sonnet')` === `'gemini-3.1-flash'`
- **Risk if unmet:** Low. The config override path is a pass-through; there is no code path that would transform or shadow the string literal unless `config.backend_models` is set. Unit tests already cover the default resolution path.
- **Fallback:** If runtime resolution shows the old values, check `config.json` for a `backend_models` override that is taking precedence.

### D2: model_overrides_available in live executor agent context — DEFER-74-02

- **What:** When an executor agent calls `cmdInitExecutePhase`, the returned JSON contains `model_overrides_available: true` for claude backend and `model_overrides_available: false` for backends where `model_overrides` is false (i.e., grd backend).
- **How:** Run `gd execute-phase <N> --json` on any current phase and inspect the init context output for `model_overrides_available`.
- **Why deferred:** Requires a full `cmdInitExecutePhase` invocation with a real phase directory. The grep check (S9) verifies the field was added, but does not verify the boolean logic or that the function returns the correct value for the current backend.
- **Validates at:** phase-75 execution (first phase executed after phase 74 completes)
- **Depends on:** Phase 74 complete; any subsequent phase execution via `gd execute-phase`
- **Target:** `model_overrides_available` present in JSON output; value matches `BACKEND_CAPABILITIES[currentBackend].model_overrides`
- **Risk if unmet:** Low-medium. If the field is present but always `false` or always `true`, downstream agents that branch on it will behave incorrectly. No currently-deployed agent reads this field (it is newly added), so there is no immediate regression risk.
- **Fallback:** If field is missing from live output, the grep (S9) already caught it. If field has wrong value, inspect `cmdInitExecutePhase` for the boolean expression.

## Ablation Plan

**No ablation plan** — This phase implements static data updates with no sub-components to isolate. The model names are fixed string literals; the capability flags are boolean/null constants. There are no algorithmic choices to ablate.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Pre-phase backend test pass rate | All tests in `tests/unit/backend.test.ts` pass before phase 74 changes | 100% (0 failures) | Current CI state |
| Pre-phase type check | `npm run build:check` clean before phase 74 | 0 type errors | Current CI state |
| Pre-phase test count | Count of tests in `tests/unit/backend.test.ts` | ~50 tests (baseline) | Observed from test file structure |

## Evaluation Scripts

**Location of evaluation code:** All verification is via standard project commands — no custom eval scripts needed.

**How to run full evaluation:**
```bash
# Wave 1 sanity checks
npm run build:check
npx jest tests/unit/backend.test.ts --no-coverage
grep 'gpt-5.4-mini' /Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts
grep 'gemini-3.1-flash' /Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts

# Wave 2 sanity checks (run after 74-02 completes)
npm run build:check
npx jest tests/unit/backend.test.ts --no-coverage
grep -c 'smart_approvals' /Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts
grep -c 'mcp_elicitation' /Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts
grep 'model_overrides_available' /Users/neo/Developer/Projects/GetResearchDone/lib/context/execute.ts

# Full project lint check
npm run lint
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: tsc Wave 1 | [PASS/FAIL] | | |
| S2: Jest Wave 1 | [PASS/FAIL] | | |
| S3: gpt-5.4-mini grep | [PASS/FAIL] | | |
| S4: gemini-3.1-flash grep | [PASS/FAIL] | | |
| S5: tsc Wave 2 | [PASS/FAIL] | | |
| S6: Jest Wave 2 | [PASS/FAIL] | | |
| S7: smart_approvals count | [PASS/FAIL] | Expected: 7 | |
| S8: mcp_elicitation count | [PASS/FAIL] | Expected: 7 | |
| S9: model_overrides_available grep | [PASS/FAIL] | | |

### Proxy Results

N/A — no proxy metrics for this phase.

### Ablation Results

N/A — no ablations for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-74-01 | Runtime model resolution — codex haiku and gemini sonnet | PENDING | Phase 75 or first Codex/Gemini execution |
| DEFER-74-02 | model_overrides_available in live executor context | PENDING | Phase 75 execution |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate. TypeScript strict mode + exact `toEqual` assertions in the test suite provide exhaustive coverage of every value change. The grep count checks prevent partial updates (e.g., updating only 3 of 7 backends for a new capability field).
- Proxy metrics: None needed. The changes are deterministic and directly testable — a proxy metric would be a weaker signal than the direct check.
- Deferred coverage: The two deferred items are both low-risk and will be naturally validated on the next phase execution. Neither represents a blocking risk.

**What this evaluation CAN tell us:**
- Whether all model name strings have the correct values in source
- Whether the `BackendCapabilities` interface and all 7 backend objects compile cleanly with the new fields
- Whether the per-flag invariants hold (only codex has `smart_approvals: true`, only claude has `mcp_elicitation: true`, etc.)
- Whether the `model_overrides_available` field was added to the execute context function
- Whether all existing tests still pass after the additions (no regressions)

**What this evaluation CANNOT tell us:**
- Whether the new model names (`gpt-5.4-mini`, `gemini-3.1-flash`) are actually correct as of March 2026 — this is sourced from product requirements (REQ-110, REQ-113) and requires external validation against provider documentation (deferred to product owner review)
- Whether Gemini CLI v0.34 actually enables `plan_mode` by default — the flag value is derived from REQ-114 requirements, not from live CLI testing (deferred to first Gemini backend execution)
- Whether `mcp_elicitation` in Claude Code v2.1.73+ behaves as expected in practice (deferred to integration)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-19*
