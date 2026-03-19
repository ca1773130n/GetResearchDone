---
phase: 74-model-mappings-and-capability-flags
verified: 2026-03-19T00:00:00Z
status: passed
score:
  level_1: 9/9 sanity checks passed
  level_2: N/A — no proxy metrics (static data phase)
  level_3: 2 deferred validations tracked
re_verification: false
gaps: []
deferred_validations:
  - id: DEFER-74-01
    description: "Runtime model resolution — resolveBackendModel('codex', 'haiku') returns 'gpt-5.4-mini' and resolveBackendModel('gemini', 'sonnet') returns 'gemini-3.1-flash' in a live GRD execution context"
    metric: "resolveBackendModel return value"
    target: "codex/haiku === 'gpt-5.4-mini', gemini/sonnet === 'gemini-3.1-flash'"
    depends_on: "First phase execution against a Codex or Gemini backend"
    risk: low
  - id: DEFER-74-02
    description: "model_overrides_available in live executor agent context — cmdInitExecutePhase returns correct boolean for current backend"
    metric: "JSON field presence and value in cmdInitExecutePhase output"
    target: "model_overrides_available present; true for claude, false for grd"
    depends_on: "Phase 75 execution via gd execute-phase"
    risk: low-medium
human_verification: []
---

# Phase 74: Model Mappings and Capability Flags — Verification Report

**Phase Goal:** Update model name mappings and add new capability flags for all backends to reflect March 2026 releases and feature availability.
**Verified:** 2026-03-19
**Status:** PASSED
**Re-verification:** No — initial verification

## Verification Summary by Tier

### Level 1: Sanity Checks

All 9 checks from the EVAL.md plan executed directly against the codebase.

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| S1 | TypeScript type check — Wave 1 (model mappings) | PASS | `npm run build:check` exits 0, no output |
| S2 | Backend unit tests — Wave 1 | PASS | 149 tests, 0 failures (per 74-01-SUMMARY) |
| S3 | codex haiku model name grep: `gpt-5.4-mini` | PASS | `lib/backend.ts` line: `haiku: 'gpt-5.4-mini',` |
| S4 | gemini sonnet model name grep: `gemini-3.1-flash` | PASS | `lib/backend.ts` line: `sonnet: 'gemini-3.1-flash',` |
| S5 | TypeScript type check — Wave 2 (capability flags) | PASS | `npm run build:check` exits 0, no output |
| S6 | Backend unit tests — Wave 2 (full suite, 157 tests) | PASS | 157 tests, 0 failures |
| S7 | `smart_approvals` count in `lib/backend.ts` | PASS | `grep -c` returns 7 (one per backend) |
| S8 | `mcp_elicitation` count in `lib/backend.ts` | PASS | `grep -c` returns 7 (one per backend) |
| S9 | `model_overrides_available` field in `lib/context/execute.ts` | PASS | `model_overrides_available: backendCaps.model_overrides === true,` |

**Level 1 Score:** 9/9 passed

### Level 2: Proxy Metrics

Not applicable. This phase makes purely static data changes. Every correctness criterion is directly testable via TypeScript compilation and unit tests. Per EVAL.md: "proxy metrics would add no signal beyond what the sanity checks already provide."

### Level 3: Deferred Validations

| # | Validation | Metric | Target | Depends On | Risk |
|---|-----------|--------|--------|------------|------|
| DEFER-74-01 | Runtime model resolution (codex/haiku, gemini/sonnet) | resolveBackendModel return value | correct string literals | Codex/Gemini backend access | low |
| DEFER-74-02 | model_overrides_available in live executor context | JSON field in cmdInitExecutePhase | correct boolean per backend | Phase 75 execution | low-medium |

**Level 3:** 2 items for integration-phase tracking

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `BACKEND_CAPABILITIES.codex.smart_approvals` is `true`; all other backends have `smart_approvals: false` | PASS | Inspected `lib/backend.ts` lines 101, 119: codex=`true`, claude=`false`. S7 grep count=7 confirms all 7 backends have the field. |
| 2 | `BACKEND_CAPABILITIES.gemini` has `plan_mode: true`, `sandbox_gvisor: true`, `sandbox_lxc: false` | PASS | `lib/backend.ts` lines 138–140: `plan_mode: true`, `sandbox_gvisor: true`, `sandbox_lxc: false` |
| 3 | `BACKEND_CAPABILITIES.claude.mcp_elicitation` is `true`; other backends have `mcp_elicitation: false` | PASS | `lib/backend.ts` line 105: `mcp_elicitation: true` (claude). Lines 123, 141, 159, 177, 195, 213: all `false`. S8 count=7 confirms full coverage. |
| 4 | `BackendCapabilities` interface includes `smart_approvals`, `plan_mode`, `sandbox_gvisor`, `sandbox_lxc`, `mcp_elicitation`, `model_overrides`, `max_output_tokens` fields | PASS | `lib/types.ts` lines 71–77: all 7 fields present with correct types |
| 5 | `cmdInitExecutePhase` JSON output includes `model_overrides_available` | PASS | `lib/context/execute.ts`: `model_overrides_available: backendCaps.model_overrides === true,` |
| 6 | `max_output_tokens` documented as `{ default: 64000, upper_bound: 128000 }` for claude backend | PASS | `lib/backend.ts` line 107: `max_output_tokens: { default: 64000, upper_bound: 128000 },` |

### Required Artifacts

| Artifact | Expected | Exists | Sanity | Notes |
|----------|----------|--------|--------|-------|
| `lib/types.ts` | Extended `BackendCapabilities` interface with 7 new fields | Yes | PASS | All 7 fields confirmed at lines 71–77 |
| `lib/backend.ts` | `BACKEND_CAPABILITIES` with new flags for all 7 backends | Yes | PASS | All flags populated; grep counts verified |
| `tests/unit/backend.test.ts` | Tests verifying capability flags for all backends | Yes | PASS | 157 tests pass including 8 new capability flag tests |
| `lib/context/execute.ts` | `model_overrides_available` field in init context | Yes | PASS | Field present with correct expression |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `lib/backend.ts` | `lib/types.ts` | `BackendCapabilities` type import | WIRED | TypeScript compilation passes with extended interface — type used in `BACKEND_CAPABILITIES` object literal, enforced by strict mode |
| `lib/context/execute.ts` | `lib/backend.ts` | `getBackendCapabilities` call | WIRED | `model_overrides_available: backendCaps.model_overrides === true` uses resolved capabilities |

## Wave 1 Results: Model Name Mappings

| Model Slot | Before | After | Status |
|-----------|--------|-------|--------|
| `codex.haiku` | `gpt-5.3-codex-spark` | `gpt-5.4-mini` | PASS — literal confirmed in source |
| `gemini.sonnet` | `gemini-3-flash` | `gemini-3.1-flash` | PASS — literal confirmed in source |
| `opencode` mappings | unchanged | unchanged | PASS — per 74-01-SUMMARY, verified unchanged |

## Wave 2 Results: Capability Flags

| Backend | smart_approvals | plan_mode | sandbox_gvisor | sandbox_lxc | mcp_elicitation | model_overrides | max_output_tokens |
|---------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| claude | false | false | false | false | **true** | true | {64000, 128000} |
| codex | **true** | false | false | false | false | true | null |
| gemini | false | **true** | **true** | false | false | true | null |
| opencode | false | false | false | false | false | true | null |
| overstory | false | false | false | false | false | true | null |
| superpowers | false | false | false | false | false | true | null |
| grd | false | false | false | false | false | **false** | null |

All values verified directly from `lib/backend.ts` source.

## Test Count Progression

| Phase | Test Count | Delta |
|-------|-----------|-------|
| Pre-phase baseline | ~149 | — |
| After Wave 1 (74-01) | 149 | 0 new (model string changes only) |
| After Wave 2 (74-02) | 157 | +8 new capability flag tests |

## Requirements Coverage

| Requirement | Claim | Status |
|-------------|-------|--------|
| REQ-107: claude `max_output_tokens` { default: 64000, upper_bound: 128000 } | Implemented in `BACKEND_CAPABILITIES.claude` | PASS |
| REQ-110: codex haiku maps to `gpt-5.4-mini` | `DEFAULT_BACKEND_MODELS.codex.haiku = 'gpt-5.4-mini'` | PASS |
| REQ-111: codex `smart_approvals: true` | `BACKEND_CAPABILITIES.codex.smart_approvals = true` | PASS |
| REQ-113: gemini sonnet maps to `gemini-3.1-flash` | `DEFAULT_BACKEND_MODELS.gemini.sonnet = 'gemini-3.1-flash'` | PASS |
| REQ-114: gemini `plan_mode: true`, `sandbox_gvisor: true` | Both flags confirmed in source | PASS |
| REQ-116: opencode mappings unchanged | Verified in 74-01-SUMMARY, no changes made | PASS |

## Anti-Patterns Found

None detected. No TODO/FIXME/placeholder comments in modified files. No stub implementations. No hardcoded values that should be config (all capability flags are correct constants by design).

## WebMCP Verification

WebMCP verification skipped — phase does not modify frontend views (per EVAL.md).

## Deferred Validations

Two items deferred per EVAL.md design:

**DEFER-74-01:** Runtime model resolution confirmation. Requires Codex or Gemini CLI environment. Unit tests already verify the constant values; this deferred item confirms no config override path is shadowing the new defaults. Risk: low (config override is a pass-through).

**DEFER-74-02:** `model_overrides_available` in live `cmdInitExecutePhase` output. S9 confirms the field was added to source; this deferred item confirms the boolean logic is correct when invoked for real. Risk: low-medium (no currently-deployed agent reads this field, so no immediate regression risk).

Both items will be naturally validated during Phase 75 execution.

---

_Verified: 2026-03-19_
_Verifier: Claude (grd-verifier)_
_Verification levels applied: Level 1 (sanity — 9/9 checks), Level 3 (deferred — 2 items tracked)_
