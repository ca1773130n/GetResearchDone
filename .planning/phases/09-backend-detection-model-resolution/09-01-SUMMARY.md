---
phase: 09-backend-detection-model-resolution
plan: 01
subsystem: backend-detection
tags: [tdd, backend, detection, model-resolution, capabilities]
dependency_graph:
  requires: []
  provides:
    - "lib/backend.js: detectBackend(), resolveBackendModel(), getBackendCapabilities()"
    - "VALID_BACKENDS, DEFAULT_BACKEND_MODELS, BACKEND_CAPABILITIES constants"
  affects:
    - "lib/utils.js (will import from backend.js in plan 09-02)"
    - "lib/context.js (will include backend info in plan 10-01)"
tech_stack:
  added: []
  patterns:
    - "Detection waterfall: config > env vars > filesystem > default"
    - "Direct fs.readFileSync for config (avoids circular dependency)"
    - "Environment save/restore in tests per PITFALLS.md P9"
key_files:
  created:
    - lib/backend.js
    - tests/unit/backend.test.js
  modified:
    - jest.config.js
key_decisions:
  - "Read config.json directly with fs.readFileSync instead of importing loadConfig from utils.js, avoiding circular dependency"
  - "AGENT env var excluded from OpenCode detection per PITFALLS.md P5 (too generic, collision risk)"
  - "Unknown backends fall back to claude mappings (backward compatible default)"
  - "Set coverage threshold at 90%/100%/90% for lib/backend.js (actual: 100% across all metrics)"
metrics:
  duration: 3min
  completed: 2026-02-16
---

# Phase 09 Plan 01: TDD Backend Detection & Model Resolution Summary

Backend detection module with 4-step waterfall (config override > env vars > filesystem clues > default) supporting all 4 AI coding CLI backends (Claude Code, Codex CLI, Gemini CLI, OpenCode) with model resolution across 3 tiers and capability flags, achieving 100% test coverage.

## Performance Metrics

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| Test count | >= 40 | 62 | PASS |
| Line coverage (lib/backend.js) | >= 80% | 100% | PASS |
| Branch coverage (lib/backend.js) | >= 80% | 100% | PASS |
| Function coverage (lib/backend.js) | >= 80% | 100% | PASS |
| Full test suite (regression) | 594+ pass | 656 pass | PASS |
| lib/backend.js line count | >= 80 | 188 | PASS |
| tests/unit/backend.test.js line count | >= 150 | 505 | PASS |

## Accomplishments

1. **TDD RED phase:** Created comprehensive test suite with 62 test cases covering all 6 exports, detection waterfall, model resolution (12 backend/tier combos), config overrides, filesystem clues, edge cases, and pitfall avoidance (AGENT env var exclusion).

2. **TDD GREEN phase:** Implemented `lib/backend.js` with:
   - `detectBackend(cwd)`: 4-step waterfall detection (config > env > filesystem > default)
   - `resolveBackendModel(backend, tier, config)`: Maps abstract tiers to backend-specific model names with config override support
   - `getBackendCapabilities(backend)`: Returns capability flags (subagents, parallel, teams, hooks, mcp) per backend
   - `VALID_BACKENDS`: Array of 4 supported backend identifiers
   - `DEFAULT_BACKEND_MODELS`: Model mappings for all 4 backends x 3 tiers
   - `BACKEND_CAPABILITIES`: Capability flags for all 4 backends

3. **Coverage threshold:** Added `lib/backend.js` to `jest.config.js` with 90%/100%/90% threshold (lines/functions/branches).

4. **Zero regressions:** All 656 tests pass across 15 test suites.

## Task Commits

| Task | Name | Type | Commit | Key Files |
|------|------|------|--------|-----------|
| 1 | RED: Write failing tests | test | `eb34894` | tests/unit/backend.test.js |
| 2 | GREEN+REFACTOR: Implement lib/backend.js | feat | `651bc1f` | lib/backend.js, jest.config.js |

## Files Created/Modified

| File | Action | Lines | Purpose |
|------|--------|-------|---------|
| `lib/backend.js` | Created | 188 | Backend detection, model resolution, capabilities module |
| `tests/unit/backend.test.js` | Created | 505 | Comprehensive unit tests for lib/backend.js |
| `jest.config.js` | Modified | +4 | Added coverage threshold for lib/backend.js |

## Decisions Made

1. **Direct config read (no utils.js import):** `detectBackend()` reads `.planning/config.json` directly with `fs.readFileSync` and `JSON.parse` instead of calling `loadConfig()` from `lib/utils.js`. This avoids a circular dependency since `utils.js` will later import from `backend.js` in plan 09-02.

2. **AGENT env var excluded:** Per PITFALLS.md P5, the `AGENT` environment variable is not used for OpenCode detection because it is too generic and may collide with other tools. Only the `OPENCODE` env var is used.

3. **Unknown backend fallback to claude:** Both `resolveBackendModel()` and `getBackendCapabilities()` fall back to claude mappings/capabilities for unknown backends, maintaining backward compatibility.

4. **Coverage threshold set high:** Since the module achieved 100% coverage, the threshold was set at 90%/100%/90% (lines/functions/branches) to maintain quality as the module evolves.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## Deferred Validations

| ID | Description | Validates At |
|----|-------------|-------------|
| DEFER-09-01 | Backend detection accuracy across real environments (mocked in unit tests) | Phase 15 |

## Next Phase Readiness

Plan 09-02 (Wave 2) can proceed: `lib/backend.js` is fully implemented and tested. Next step is integrating `backend.js` into `utils.js`, extending `loadConfig` with backend fields, and adding integration tests.

## Self-Check: PASSED

- [x] lib/backend.js exists (188 lines, >= 80 min)
- [x] tests/unit/backend.test.js exists (505 lines, >= 150 min)
- [x] 09-01-SUMMARY.md exists
- [x] Commit eb34894 exists (RED phase)
- [x] Commit 651bc1f exists (GREEN phase)
- [x] All 6 exports present: detectBackend, resolveBackendModel, getBackendCapabilities, DEFAULT_BACKEND_MODELS, BACKEND_CAPABILITIES, VALID_BACKENDS
- [x] 62 tests pass, 100% coverage on lib/backend.js
- [x] 656 total tests pass (zero regressions)
