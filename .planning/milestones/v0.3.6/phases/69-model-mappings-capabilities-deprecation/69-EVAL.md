# Evaluation Plan: Phase 69 — Model Mappings, Capabilities & Detection Updates

**Designed:** 2026-03-10
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Constant-update refactor (no algorithmic change, no paper methods)
**Reference papers:** None — this phase updates configuration constants to reflect March 2026 ecosystem state documented in LANDSCAPE.md

## Evaluation Overview

Phase 69 is a constant-update phase: it changes string literals and boolean flags inside `DEFAULT_BACKEND_MODELS` and `BACKEND_CAPABILITIES` in `lib/backend.ts`, then synchronizes all test assertions in `tests/unit/backend.test.ts` to match. There is no algorithmic novelty and no paper to evaluate against.

The evaluation goal is correctness: every constant must exactly match the target value specified in the phase requirements, every existing test must continue to pass, and the TypeScript compiler must accept the result. The two-wave structure means Wave 1 (Plan 69-01) intentionally breaks tests while Wave 2 (Plan 69-02) restores them — the evaluation gate is applied only after both waves complete.

No proxy metrics are needed because the success criteria are fully binary: a constant either equals the required string/boolean or it does not. There are no approximations, no regressions to measure against a baseline, and no quality gradients to sample. The only genuinely deferred validation is live invocation of each backend CLI to confirm the new model IDs are accepted — that requires external CLI installs not available in the test environment.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Constant value equality | Plan 69-01 invariants | Direct specification of correct values |
| Test suite pass rate | Plan 69-02 invariants | Regression guard for all backend logic |
| TypeScript type-check | CLAUDE.md (`npm run build:check`) | Ensures no type regressions from value changes |
| Lint pass rate | CLAUDE.md (`npm run lint`) | Pre-commit hook enforces this; blocks integration if red |
| Live model acceptance | LANDSCAPE.md (March 2026 ecosystem state) | Validates new IDs are not rejected by backend CLIs |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Confirm correctness of constants, tests, types, lint, format |
| Proxy (L2) | 0 | No proxy metrics — success criteria are fully binary |
| Deferred (L3) | 3 | Live backend CLI invocations not available in test environment |

## Level 1: Sanity Checks

**Purpose:** Verify basic correctness. These MUST ALL PASS before marking the phase complete.

### S1: TypeScript Type-Check

- **What:** Compiler accepts all value changes with zero type errors
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, no output (or only informational notes)
- **Failure means:** A value change introduced an incompatible type (e.g., assigned a non-boolean where `boolean` is required, or violated a string literal union type). Indicates the constant schema changed unexpectedly.

### S2: Lint Clean

- **What:** ESLint reports zero errors across `bin/` and `lib/`
- **Command:** `npm run lint`
- **Expected:** Exit code 0, no errors
- **Failure means:** The edit introduced a style violation (unused variable, wrong quotes, etc.) that will block the pre-commit hook.

### S3: Full Backend Test Suite Pass

- **What:** All 102 tests in `tests/unit/backend.test.ts` pass after both Wave 1 and Wave 2 complete
- **Command:** `npx jest tests/unit/backend.test.ts --no-coverage`
- **Expected:** `Tests: 102 passed, 102 total` (or higher if new tests are added in Wave 2). Zero failures. Zero skipped.
- **Failure means:** At least one test assertion was not updated in Wave 2, or a Wave 1 edit introduced a regression in logic beyond constant values. Each failing test must be diagnosed: if it is a stale assertion, fix it in Wave 2; if it exposes a logic error, re-examine the Wave 1 edit.

### S4: Constant Value Spot-Check — Model Mappings

- **What:** Key-value verification of every changed constant in `lib/backend.ts`
- **Command:** `node -e "const b = require('./lib/backend.ts'); const m = b.DEFAULT_BACKEND_MODELS; console.log(JSON.stringify({gemini_opus: m.gemini.opus, gemini_haiku: m.gemini.haiku, codex_opus: m.codex.opus, opencode_opus: m.opencode.opus, opencode_sonnet: m.opencode.sonnet}, null, 2))"`

  Alternatively, inspect directly in the test output (S3 already validates these via test assertions).

  Authoritative source of truth for this check: the test assertions in `tests/unit/backend.test.ts` after Wave 2.

- **Expected:**
  ```
  gemini.opus   = 'gemini-3.1-pro'
  gemini.haiku  = 'gemini-3.1-flash-lite'
  codex.opus    = 'gpt-5.4'
  opencode.opus = 'anthropic/claude-opus-4-6'
  opencode.sonnet = 'anthropic/claude-sonnet-4-6'
  ```
- **Failure means:** A Wave 1 task was missed or applied incorrectly.

### S5: Constant Value Spot-Check — Capability Flags

- **What:** Key-value verification of every changed capability flag in `lib/backend.ts`
- **Command:** Covered by S3 test assertions; for a direct check: inspect `BACKEND_CAPABILITIES` in `lib/backend.ts` visually or via the test output.
- **Expected:**
  ```
  BACKEND_CAPABILITIES.gemini.subagents = true   (was 'experimental')
  BACKEND_CAPABILITIES.gemini.parallel  = true   (was false)
  BACKEND_CAPABILITIES.codex.hooks      = true   (was false)
  BACKEND_CAPABILITIES.codex.teams      = true   (was false)
  ```
- **Failure means:** A Wave 1 capability task was missed or the type changed unexpectedly.

### S6: No Deprecated Model IDs in Source

- **What:** Confirm that deprecated model strings are absent from `lib/backend.ts` after Wave 1
- **Command:** `grep -n "gemini-3-pro\|gemini-2\.5-flash\|gpt-5\.3-codex'\|claude-opus-4-5\|claude-sonnet-4-5" lib/backend.ts`
- **Expected:** Zero matches (grep returns exit code 1 = no matches found)
- **Failure means:** At least one deprecated model ID was left in the constants block. The `gemini-3-pro` model is shut down as of March 9, 2026; leaving it in source causes runtime failures for Gemini backend users immediately.

**Sanity gate:** ALL six sanity checks must pass. Any failure blocks phase completion and must be diagnosed before proceeding to the next phase.

## Level 2: Proxy Metrics

### No Proxy Metrics

**Rationale:** This phase updates discrete constant values and Boolean flags. Success criteria are fully binary: each constant either equals the required value or it does not. There is no performance gradient, quality gradient, or coverage approximation that would yield meaningful proxy information beyond what the sanity checks already capture. The test suite (S3) is itself the authoritative validator of correctness for all changed values.

**Recommendation:** Rely exclusively on sanity checks (Level 1) and defer live backend validation to Level 3. Do not manufacture proxy metrics to fill this section.

## Level 3: Deferred Validations

**Purpose:** Full end-to-end validation that requires external CLI tools not available in the unit-test environment.

### D1: Gemini Model Acceptance — DEFER-69-01

- **What:** Confirm `gemini-3.1-pro` and `gemini-3.1-flash-lite` are accepted as valid model IDs by Gemini CLI v0.32.1+
- **How:** Invoke `gemini --model gemini-3.1-pro --version` (or equivalent model-listing command) and confirm no "model not found" or 400 error. Repeat for `gemini-3.1-flash-lite`.
- **Why deferred:** Gemini CLI is not installed in the test environment. Unit tests mock backend detection and do not invoke any CLI.
- **Validates at:** Manual verification by developer with Gemini CLI installed, or as part of an integration smoke-test environment
- **Depends on:** Gemini CLI v0.32.1+ installed and authenticated
- **Target:** Both model IDs accepted without error. `gemini-3-pro` returns an error (confirmed deprecated / shutdown March 9, 2026)
- **Risk if unmet:** If `gemini-3.1-pro` is not accepted, Gemini backend users get immediate runtime failures. Fallback: revert to `gemini-pro-latest` alias (which LANDSCAPE.md confirms points to 3.1 Pro as of March 6, 2026).
- **Fallback:** Use `gemini-pro-latest` alias as `opus` tier until model ID is confirmed

### D2: Codex Model Acceptance — DEFER-69-02

- **What:** Confirm `gpt-5.4` is accepted as a valid model ID by Codex CLI v0.112.0+
- **How:** Invoke `codex --model gpt-5.4 --help` or list available models; confirm `gpt-5.4` appears.
- **Why deferred:** Codex CLI is not installed in the test environment.
- **Validates at:** Manual verification by developer with Codex CLI installed
- **Depends on:** Codex CLI v0.112.0+ installed and authenticated
- **Target:** `gpt-5.4` accepted without error; capability flags `hooks: true` and `teams: true` confirmed by attempting `/agent` thread fork and a plugin-system hook invocation
- **Risk if unmet:** If `gpt-5.4` is not the correct ID, the `opus` tier silently falls back to an unknown model. LANDSCAPE.md lists it as "native computer-use, experimental 1M context" — if the ID changed in a minor release, the fallback is `gpt-5.3-codex`.
- **Fallback:** Revert `codex.opus` to `gpt-5.3-codex` (prior value, confirmed working)

### D3: OpenCode Model Acceptance — DEFER-69-03

- **What:** Confirm `anthropic/claude-opus-4-6` and `anthropic/claude-sonnet-4-6` are accepted by OpenCode v1.2.21+ (anomalyco/opencode fork)
- **How:** Run `opencode models` and confirm both model IDs appear in the output. The `parseOpenCodeModels` function in `lib/backend.ts` depends on these IDs matching `opencode models` stdout.
- **Why deferred:** OpenCode CLI is not installed in the test environment. The unit tests for `parseOpenCodeModels` use fixed mock stdout strings.
- **Validates at:** Manual verification by developer with OpenCode installed, or automated CI that provisions OpenCode
- **Depends on:** OpenCode v1.2.21+ (anomalyco/opencode) installed and configured with an Anthropic API key
- **Target:** `opencode models` stdout contains both `anthropic/claude-opus-4-6` and `anthropic/claude-sonnet-4-6`; `parseOpenCodeModels` correctly classifies them into `opus` and `sonnet` tiers
- **Risk if unmet:** If the anomalyco fork uses different default model IDs, the `resolveBackendModel` function returns wrong model IDs for OpenCode users. Low risk — LANDSCAPE.md explicitly names these as the current defaults.
- **Fallback:** GRD already supports dynamic model detection via `opencode models` CLI invocation at runtime; if static defaults are wrong, the dynamic detection path still resolves correctly.

## Ablation Plan

**No ablation plan** — this phase implements no algorithmic components and has no sub-components to isolate. The changes are atomic constant replacements; each constant is independently verifiable via the sanity checks above.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All modified files are `lib/backend.ts` and `tests/unit/backend.test.ts`.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Backend test suite | `tests/unit/backend.test.ts` pre-phase | 102 tests, 0 failures | Current test run (pre-phase) |
| TypeScript build check | `npm run build:check` pre-phase | Exit 0, 0 errors | Current repo state |
| Lint | `npm run lint` pre-phase | Exit 0, 0 errors | Current repo state |

All three baselines are green before Phase 69 begins. Wave 1 is expected to break the test baseline temporarily (S3 will show failures after 69-01 before 69-02). The evaluation gate is applied only after Wave 2 completes.

## Evaluation Scripts

**Location of evaluation code:** No dedicated evaluation scripts needed — standard project tooling covers all checks.

**How to run full evaluation (post Wave 2):**
```bash
# From project root
npm run build:check && npm run lint && npx jest tests/unit/backend.test.ts --no-coverage
```

**Deprecation string check:**
```bash
grep -n "gemini-3-pro\|gemini-2\.5-flash\|gpt-5\.3-codex'\|claude-opus-4-5\|claude-sonnet-4-5" lib/backend.ts
# expected: no output (exit code 1)
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript type-check | [PASS/FAIL] | | |
| S2: Lint clean | [PASS/FAIL] | | |
| S3: Backend test suite (102 tests) | [PASS/FAIL] | | |
| S4: Model mapping spot-check | [PASS/FAIL] | | |
| S5: Capability flags spot-check | [PASS/FAIL] | | |
| S6: No deprecated model IDs | [PASS/FAIL] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| (none) | — | — | — | No proxy metrics for constant-update phase |

### Ablation Results

| Condition | Expected | Actual | Conclusion |
|-----------|----------|--------|------------|
| (none) | — | — | No ablations applicable |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-69-01 | Gemini model acceptance (gemini-3.1-pro, gemini-3.1-flash-lite) | PENDING | Manual CLI verification |
| DEFER-69-02 | Codex model acceptance (gpt-5.4), hooks + teams flags | PENDING | Manual CLI verification |
| DEFER-69-03 | OpenCode model acceptance (claude-opus-4-6, claude-sonnet-4-6) | PENDING | Manual CLI verification |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — the six checks cover every changed value, the compiler, the linter, the full test suite, and an explicit deprecation-string grep. Together they give binary pass/fail on all specification requirements.
- Proxy metrics: None needed — correctness is fully verifiable within the sanity tier for a constant-update phase.
- Deferred coverage: Partial — live CLI invocations are genuinely not possible in the test environment. However, all three deferred items have explicit fallbacks, and the risk is low because LANDSCAPE.md provides authoritative March 2026 model ID documentation.

**What this evaluation CAN tell us:**
- Every changed constant has the exactly specified value
- No deprecated model IDs remain in `lib/backend.ts`
- All 102 existing backend tests pass without regression
- The TypeScript compiler and linter accept the result
- The pre-commit hook will not block integration

**What this evaluation CANNOT tell us:**
- Whether `gemini-3.1-pro` is actually accepted by Gemini CLI at runtime (DEFER-69-01 — manual verification)
- Whether `gpt-5.4` is the exact model ID string Codex CLI expects (DEFER-69-02 — manual verification)
- Whether OpenCode v1.2.21 (anomalyco fork) defaults match the IDs we've set (DEFER-69-03 — manual verification)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-10*
