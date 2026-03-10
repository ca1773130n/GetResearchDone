---
phase: 69-model-mappings-capabilities-deprecation
verified: 2026-03-10T11:05:19Z
status: deferred
score:
  level_1: 6/6 sanity checks passed
  level_2: N/A (no proxy metrics for constant-update phase)
  level_3: 3 deferred (tracked in STATE.md decisions)
gaps: []
deferred_validations:
  - id: DEFER-69-01
    description: "Live Gemini CLI acceptance — confirm gemini-3.1-pro and gemini-3.1-flash-lite are accepted by Gemini CLI v0.32.1+"
    metric: model_acceptance
    target: "Both model IDs accepted without error; gemini-3-pro returns error (deprecated)"
    depends_on: "Gemini CLI v0.32.1+ installed and authenticated"
    tracked_in: STATE.md
  - id: DEFER-69-02
    description: "Live Codex CLI acceptance — confirm gpt-5.4 accepted by Codex CLI v0.112.0+; hooks and teams flags active"
    metric: model_acceptance
    target: "gpt-5.4 accepted; /agent thread fork and hook invocation succeed"
    depends_on: "Codex CLI v0.112.0+ installed and authenticated"
    tracked_in: STATE.md
  - id: DEFER-69-03
    description: "Live OpenCode model listing — confirm opencode models stdout contains anthropic/claude-opus-4-6 and anthropic/claude-sonnet-4-6"
    metric: model_acceptance
    target: "Both IDs present in opencode models output; parseOpenCodeModels classifies them correctly"
    depends_on: "OpenCode v1.2.21+ (anomalyco/opencode) installed and configured"
    tracked_in: STATE.md
human_verification: []
---

# Phase 69: Model Mappings, Capabilities & Deprecation — Verification Report

**Phase Goal:** Update DEFAULT_BACKEND_MODELS and BACKEND_CAPABILITIES constants in lib/backend.ts to reflect the current AI CLI ecosystem (March 2026). Update all test assertions to match.
**Verified:** 2026-03-10T11:05:19Z
**Status:** deferred — Level 1 fully passed; Level 3 items tracked for manual CLI verification
**Re-verification:** No — initial verification

## Verification Summary by Tier

### Level 1: Sanity Checks

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| S1 | TypeScript type-check (`npm run build:check`) | PASS | Exit 0, zero errors |
| S2 | Lint clean (`npm run lint`) | PASS | Exit 0, zero errors |
| S3 | Backend test suite (102 tests) | PASS | 102 passed, 0 failures, 0 skipped |
| S4 | Constant value spot-check — model mappings | PASS | All 5 target values confirmed in lib/backend.ts lines 52–66 |
| S5 | Constant value spot-check — capability flags | PASS | All 4 target flags confirmed in lib/backend.ts lines 83–96 |
| S6 | No deprecated model IDs in lib/backend.ts | PASS | grep returned exit code 1 (zero matches) |

**Level 1 Score: 6/6 passed**

### Level 2: Proxy Metrics

Not applicable. Per EVAL.md: "No proxy metrics for constant-update phase. Success criteria are fully binary."

**Level 2 Score: N/A**

### Level 3: Deferred Validations

| # | Validation | Metric | Target | Depends On | Status |
|---|-----------|--------|--------|------------|--------|
| D1 | Gemini CLI acceptance (gemini-3.1-pro, gemini-3.1-flash-lite) | model_acceptance | Both accepted, no 400 error | Gemini CLI v0.32.1+ installed | DEFERRED |
| D2 | Codex CLI acceptance (gpt-5.4), hooks + teams flags confirmed | model_acceptance | gpt-5.4 accepted; agent+hook invocations succeed | Codex CLI v0.112.0+ installed | DEFERRED |
| D3 | OpenCode model listing (claude-opus-4-6, claude-sonnet-4-6) | model_acceptance | Both IDs in opencode models stdout | OpenCode v1.2.21+ installed | DEFERRED |

**Level 3: 3 items tracked in STATE.md decisions**

## Goal Achievement

### Observable Truths (Plan 69-01)

| # | Truth | Verification | Status | Evidence |
|---|-------|--------------|--------|----------|
| 1 | DEFAULT_BACKEND_MODELS.gemini.opus equals 'gemini-3.1-pro' | Direct source inspection + test assertion | PASS | lib/backend.ts line 58; test line 130 |
| 2 | DEFAULT_BACKEND_MODELS.gemini.haiku equals 'gemini-3.1-flash-lite' | Direct source inspection + test assertion | PASS | lib/backend.ts line 60; test line 133 |
| 3 | DEFAULT_BACKEND_MODELS.codex.opus equals 'gpt-5.4' | Direct source inspection + test assertion | PASS | lib/backend.ts line 53; test line 121-124 |
| 4 | DEFAULT_BACKEND_MODELS.opencode.opus equals 'anthropic/claude-opus-4-6' | Direct source inspection + test assertion | PASS | lib/backend.ts line 63; test line 138 |
| 5 | DEFAULT_BACKEND_MODELS.opencode.sonnet equals 'anthropic/claude-sonnet-4-6' | Direct source inspection + test assertion | PASS | lib/backend.ts line 64; test line 139 |
| 6 | BACKEND_CAPABILITIES.gemini.subagents equals true | Direct source inspection + test assertion | PASS | lib/backend.ts line 91; test line 194 |
| 7 | BACKEND_CAPABILITIES.gemini.parallel equals true | Direct source inspection + test assertion | PASS | lib/backend.ts line 92; test line 195 |
| 8 | BACKEND_CAPABILITIES.codex.hooks equals true | Direct source inspection + test assertion | PASS | lib/backend.ts line 87; test line 185 |
| 9 | BACKEND_CAPABILITIES.codex.teams equals true | Direct source inspection + test assertion | PASS | lib/backend.ts line 86; test line 184 |

**All 9 truths verified: 9/9 PASS**

### Observable Truths (Plan 69-02)

| # | Truth | Verification | Status | Evidence |
|---|-------|--------------|--------|----------|
| 1 | All backend.test.ts tests pass (zero failures) | Jest run | PASS | 102 passed, 0 failures |
| 2 | No test description references deprecated model names | grep of test descriptions | PASS | All describe/test strings use updated names |
| 3 | Test assertions match lib/backend.ts constant values exactly | Test run validates this transitively | PASS | 102/102 pass confirms exact match |

**All 3 truths verified: 3/3 PASS**

### Required Artifacts

| Artifact | Expected | Exists | Sanity | Notes |
|----------|----------|--------|--------|-------|
| `lib/backend.ts` | Updated constants | Yes | PASS | 491 lines; constants at lines 50-106 |
| `tests/unit/backend.test.ts` | Updated assertions | Yes | PASS | 902 lines; 102 tests passing |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| tests/unit/backend.test.ts | lib/backend.ts | `require('../../lib/backend')` | WIRED | Line 76 — all 10 exports destructured |

## Constant Value Audit

Verified directly from lib/backend.ts source (not from SUMMARY claims):

### DEFAULT_BACKEND_MODELS (lines 50–67)

| Backend | Tier | Value | Target | Match |
|---------|------|-------|--------|-------|
| gemini | opus | `gemini-3.1-pro` | `gemini-3.1-pro` | YES |
| gemini | sonnet | `gemini-3-flash` | unchanged | YES |
| gemini | haiku | `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` | YES |
| codex | opus | `gpt-5.4` | `gpt-5.4` | YES |
| codex | sonnet | `gpt-5.3-codex-spark` | unchanged | YES |
| codex | haiku | `gpt-5.3-codex-spark` | unchanged | YES |
| opencode | opus | `anthropic/claude-opus-4-6` | `anthropic/claude-opus-4-6` | YES |
| opencode | sonnet | `anthropic/claude-sonnet-4-6` | `anthropic/claude-sonnet-4-6` | YES |
| opencode | haiku | `anthropic/claude-haiku-4-5` | unchanged | YES |

### BACKEND_CAPABILITIES (lines 73–106)

| Backend | Flag | Value | Target | Match |
|---------|------|-------|--------|-------|
| gemini | subagents | `true` | `true` (was `'experimental'`) | YES |
| gemini | parallel | `true` | `true` (was `false`) | YES |
| codex | hooks | `true` | `true` (was `false`) | YES |
| codex | teams | `true` | `true` (was `false`) | YES |

### Deprecation String Check (S6)

Grep pattern: `gemini-3-pro|gemini-2\.5-flash|gpt-5\.3-codex'|claude-opus-4-5|claude-sonnet-4-5`

Result in lib/backend.ts: **zero matches** (exit code 1)

Note: `tests/unit/backend.test.ts` lines 570/573 contain `google/gemini-3-pro` — these are mock **input** strings for `parseOpenCodeModels` test (simulating external CLI output). They are not constant definitions and are not in scope for S6, which targets only lib/backend.ts.

## Test Assertion Spot-Check

Verified that deprecated model names no longer appear in test descriptions or expect() values:

| Old test description | New test description | Status |
|---------------------|---------------------|--------|
| `codex maps to gpt-5.3-codex, ...` | `codex maps to gpt-5.4, gpt-5.3-codex-spark, gpt-5.3-codex-spark` | UPDATED |
| `gemini maps to gemini-3-pro, gemini-3-flash, gemini-2.5-flash` | `gemini maps to gemini-3.1-pro, gemini-3-flash, gemini-3.1-flash-lite` | UPDATED |
| `opencode maps to .../claude-opus-4-5, .../claude-sonnet-4-5, ...` | `opencode maps to .../claude-opus-4-6, .../claude-sonnet-4-6, .../claude-haiku-4-5` | UPDATED |

Verified in source at test lines 120, 128, 136.

## Anti-Patterns Found

None. No TODO/FIXME/placeholder comments, no stub implementations, no hardcoded values in incorrect locations.

## Requirements Coverage

| Requirement | Truth | Status |
|-------------|-------|--------|
| REQ-82: Gemini model update (gemini-3-pro deprecated) | gemini.opus = gemini-3.1-pro, gemini.haiku = gemini-3.1-flash-lite | PASS |
| REQ-83: Codex opus to GPT-5.4 | codex.opus = gpt-5.4 | PASS |
| REQ-84: OpenCode models to Claude 4.6 | opencode.opus = claude-opus-4-6, opencode.sonnet = claude-sonnet-4-6 | PASS |
| REQ-85: Gemini subagents GA + parallel | subagents = true, parallel = true | PASS |
| REQ-86: Codex hooks + teams | hooks = true, teams = true | PASS |
| REQ-88: OpenCode model version bump | opencode.opus/sonnet updated to 4-6 | PASS |

## WebMCP Verification

WebMCP verification skipped — phase does not modify frontend views. All modified files are lib/backend.ts and tests/unit/backend.test.ts.

## Human Verification Required

None. All verification criteria are binary and fully automated.

---

_Verified: 2026-03-10T11:05:19Z_
_Verifier: Claude (grd-verifier)_
_Verification levels applied: Level 1 (sanity — all 6 checks), Level 3 (deferred — 3 items tracked)_
