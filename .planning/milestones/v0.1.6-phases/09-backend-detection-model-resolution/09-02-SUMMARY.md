---
phase: 09-backend-detection-model-resolution
plan: 02
subsystem: utils-backend-integration
tags: [backend, model-resolution, integration, utils, backward-compatible]
dependency_graph:
  requires:
    - "lib/backend.js: detectBackend(), resolveBackendModel() (from 09-01)"
  provides:
    - "lib/utils.js: backend-aware resolveModelInternal() and resolveModelForAgent()"
    - "lib/utils.js: loadConfig() with backend and backend_models fields"
  affects:
    - "lib/context.js (will use backend-aware model resolution in Phase 10)"
    - "All consumers of resolveModelInternal() get backend-specific names automatically"
tech_stack:
  added: []
  patterns:
    - "Optional cwd parameter for backward-compatible backend resolution"
    - "Pass-through config fields (backend, backend_models) with undefined defaults"
    - "CLAUDE_CODE_* env var save/restore in tests for clean backend detection"
key_files:
  created: []
  modified:
    - lib/utils.js
    - tests/unit/utils.test.js
key_decisions:
  - "resolveModelForAgent gets optional cwd param (not breaking: appended to end)"
  - "loadConfig backend fields use pass-through with undefined defaults (not null)"
  - "Tests dynamically discover and clean all CLAUDE_CODE_* env vars for clean detection"
metrics:
  duration: 3min
  completed: 2026-02-16
---

# Phase 09 Plan 02: Backend Integration into Utils Summary

Integrated `lib/backend.js` into `lib/utils.js` so that `resolveModelInternal()` and `resolveModelForAgent()` produce backend-specific model names (e.g., `gpt-5.3-codex-spark` on Codex CLI) while maintaining full backward compatibility on Claude Code backend where tier names equal model names.

## Performance Metrics

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| New integration tests | >= 15 | 18 | PASS |
| Full test suite (regression) | 656+ pass | 674 pass | PASS |
| Existing tests unchanged | 53 pass | 53 pass | PASS |
| lib/utils.js modifications | 4 modifications | 4 modifications | PASS |
| Backward compatibility | resolveModelForAgent without cwd returns tier | Verified | PASS |

## Accomplishments

1. **Modification 1: Backend require.** Added `const { detectBackend, resolveBackendModel } = require('./backend')` to lib/utils.js, establishing the dependency from utils to backend.

2. **Modification 2: loadConfig() extension.** Added `backend` and `backend_models` as pass-through fields in both the return object and defaults. When absent from config.json, both return `undefined` (not null), preserving backward compatibility.

3. **Modification 3: resolveModelInternal() update.** Now calls `detectBackend(cwd)` and `resolveBackendModel(backend, tier, config)` to produce backend-specific model names. For Claude backend, tier names ARE model names, so existing behavior is preserved.

4. **Modification 4: resolveModelForAgent() update.** Added optional `cwd` parameter. When omitted (existing callers), returns tier name. When provided, resolves to backend-specific model name via detectBackend/resolveBackendModel pipeline.

5. **18 integration tests** covering all 4 backends, config overrides, unknown agents, backward compatibility, and loadConfig backend field presence/absence.

## Task Commits

| Task | Name | Type | Commit | Key Files |
|------|------|------|--------|-----------|
| 1 | Extend loadConfig and integrate backend.js into model resolution | feat | `431ea26` | lib/utils.js |
| 2 | Add integration tests for backend-aware model resolution | test | `d56a633` | tests/unit/utils.test.js |

## Files Created/Modified

| File | Action | Lines Changed | Purpose |
|------|--------|---------------|---------|
| `lib/utils.js` | Modified | +30 -6 | Backend integration: require, loadConfig, resolveModelInternal, resolveModelForAgent |
| `tests/unit/utils.test.js` | Modified | +282 | 18 integration tests for backend-aware model resolution pipeline |

## Decisions Made

1. **Optional cwd parameter on resolveModelForAgent:** Added as the third parameter (appended, not inserted) to maintain backward compatibility. Existing callers that pass `(config, agentType)` get the original tier-name behavior unchanged.

2. **Pass-through backend fields with undefined defaults:** Used `parsed.backend || undefined` instead of `parsed.backend ?? undefined` so that falsy values (empty string, null) are normalized to undefined, consistent with "field not present" semantics.

3. **Dynamic CLAUDE_CODE_* env var cleanup in tests:** Instead of hardcoding specific CLAUDE_CODE_ variable names, tests use `Object.keys(process.env).filter(k => k.startsWith('CLAUDE_CODE_'))` to discover and clean all such variables. This ensures backend detection waterfall tests work correctly even when running inside Claude Code.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CLAUDE_CODE_* env vars interfering with backend detection tests**
- **Found during:** Task 2
- **Issue:** Tests setting CODEX_HOME/GEMINI_CLI_HOME/OPENCODE env vars still detected `claude` backend because CLAUDE_CODE_ENTRYPOINT and CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS were set in the test runner environment (inside Claude Code).
- **Fix:** Changed envVarsToClean to dynamically discover all CLAUDE_CODE_* env vars using `Object.keys(process.env).filter()` instead of hardcoding `CLAUDE_CODE_ENTRY`.
- **Files modified:** tests/unit/utils.test.js
- **Commit:** `d56a633`

## Issues Encountered

None beyond the auto-fixed CLAUDE_CODE_* env var issue above.

## Deferred Validations

| ID | Description | Validates At |
|----|-------------|-------------|
| DEFER-10-01 | Context init backward compatibility under all 4 backends | Phase 15 |

## Next Phase Readiness

Phase 09 is complete. Both plans (09-01: backend.js module, 09-02: utils.js integration) are done. The backend detection and model resolution pipeline is fully integrated into the shared utilities layer. Phase 10 can proceed to wire backend info into context initialization.

## Self-Check: PASSED

- [x] lib/utils.js exists and imports from lib/backend.js
- [x] tests/unit/utils.test.js exists with 18 new integration tests
- [x] Commit 431ea26 exists (Task 1: feat)
- [x] Commit d56a633 exists (Task 2: test)
- [x] 674 total tests pass (zero regressions from 656 baseline)
- [x] resolveModelInternal returns backend-specific names (codex: gpt-5.3-codex-spark, gemini: gemini-3-flash, etc.)
- [x] resolveModelForAgent backward compatible (no cwd = tier name)
- [x] loadConfig returns backend and backend_models (undefined when absent)
