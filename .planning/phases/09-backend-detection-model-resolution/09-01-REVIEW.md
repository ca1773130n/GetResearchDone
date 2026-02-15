---
phase: 09-backend-detection-model-resolution
wave: 1
plans_reviewed: [09-01]
timestamp: 2026-02-16T03:00:00+09:00
blockers: 0
warnings: 2
info: 5
verdict: warnings_only
---

# Code Review: Phase 09 Wave 1

## Verdict: WARNINGS ONLY

Plan 09-01 (TDD Backend Detection & Model Resolution) was executed faithfully. All plan tasks have corresponding commits, the implementation matches the research methodology, known pitfalls are correctly avoided, and code quality is high with 100% test coverage. Two warnings identified: a minor internal inconsistency in the plan's test specification for codex filesystem detection, and the mutable nature of the exported constants objects.

## Stage 1: Spec Compliance

### Plan Alignment

**All plan tasks executed with corresponding commits.**

| Plan Task | Commit | Status |
|-----------|--------|--------|
| Task 1: RED -- Write failing tests | `eb34894` (tests/unit/backend.test.js, 505 lines) | DONE |
| Task 2: GREEN+REFACTOR -- Implement lib/backend.js | `651bc1f` (lib/backend.js 188 lines, jest.config.js +5 lines) | DONE |

**must_haves.truths verification:**

| Truth | Verified |
|-------|----------|
| detectBackend() returns 'claude' when any CLAUDE_CODE_* env var is set | YES -- tests at lines 232-245 of backend.test.js |
| detectBackend() returns 'codex' when CODEX_HOME is set | YES -- test at line 247 |
| detectBackend() returns 'gemini' when GEMINI_CLI_HOME is set | YES -- test at line 257 |
| detectBackend() returns 'opencode' when OPENCODE env var is set | YES -- test at line 262 |
| detectBackend() respects config.backend override with highest priority | YES -- tests at lines 269-279 |
| detectBackend() falls back to filesystem clues when no env vars match | YES -- tests at lines 312-334 |
| detectBackend() defaults to 'claude' when no signals detected | YES -- test at line 291 |
| resolveBackendModel() maps opus/sonnet/haiku to correct backend-specific names for all 4 backends | YES -- test.each at lines 379-394 (12 parametrized cases) |
| resolveBackendModel() honors config.backend_models user overrides | YES -- test at line 398 |
| getBackendCapabilities() returns correct capability flags for each backend | YES -- tests at lines 453-495 |
| Unit tests achieve >= 80% line coverage | YES -- 100% line/branch/function coverage |

**must_haves.artifacts verification:**

| Artifact | Required | Actual | Status |
|----------|----------|--------|--------|
| lib/backend.js min_lines: 80 | 80 | 188 | PASS |
| lib/backend.js exports | 6 symbols | 6 symbols | PASS |
| tests/unit/backend.test.js min_lines: 150 | 150 | 505 | PASS |

**must_haves.key_links verification:**

| Link | Expected Pattern | Actual | Status |
|------|-----------------|--------|--------|
| lib/backend.js -> lib/utils.js via loadConfig | `require.*utils` | NOT PRESENT (by design) | SEE NOTE |
| tests/unit/backend.test.js -> lib/backend.js | `require.*backend` | `require('../../lib/backend')` at line 73 | PASS |

**NOTE on key_link from backend.js to utils.js:** The plan frontmatter lists a key_link from backend.js to utils.js via "imports loadConfig for config override detection", but both the plan Task 2 action (line 210-211) and the key_decisions in the SUMMARY explicitly state that backend.js reads config.json directly with `fs.readFileSync` to avoid circular dependency. The implementation correctly follows the task action, not the frontmatter key_link. The frontmatter key_link is stale/incorrect.

**Finding:** [INFO-1] The `must_haves.key_links` frontmatter entry for `lib/backend.js -> lib/utils.js` is incorrect. The plan body and implementation both correctly avoid this import to prevent circular dependency. The frontmatter was not updated to reflect the design decision.

### Research Methodology

**Detection waterfall matches research in `.planning/research/multi-backend-detection.md` Section 2.**

The implementation follows the recommended detection waterfall from the research document:

```
Research (Section 2):               Implementation (lib/backend.js):
1. Config override (highest)    --> Line 119-122: readConfig + VALID_BACKENDS check
2. CLAUDE_CODE_* env vars       --> Line 125: hasEnvPrefix('CLAUDE_CODE_')
3. CODEX_HOME/CODEX_THREAD_ID   --> Line 126: process.env.CODEX_HOME || CODEX_THREAD_ID
4. GEMINI_CLI_HOME              --> Line 127: process.env.GEMINI_CLI_HOME
5. OPENCODE                     --> Line 128: process.env.OPENCODE
6. Filesystem clues             --> Lines 131-134: fileExists checks
7. Default 'claude'             --> Line 137: return 'claude'
```

**Model mappings match research in `.planning/research/ARCHITECTURE.md`.**

All 12 backend/tier combinations in `DEFAULT_BACKEND_MODELS` match the values specified in ARCHITECTURE.md lines 98-103.

**Capability flags match research in `.planning/research/ARCHITECTURE.md`.**

All 20 capability values (5 flags x 4 backends) in `BACKEND_CAPABILITIES` match ARCHITECTURE.md lines 105-109.

**Intentional deviation from research (properly documented):**

The research document in multi-backend-detection.md Section 2 line 338 includes `process.env.AGENT` in OpenCode detection: `if (process.env.OPENCODE || process.env.AGENT) return 'opencode'`. The implementation correctly omits `AGENT` per PITFALLS.md P5 (too generic, collision risk). This is documented in the file header comment (line 16), the function JSDoc (line 111), and in SUMMARY.md key_decisions.

The research document in ARCHITECTURE.md line 94 lists `GEMINI_API_KEY` as a detection signal for Gemini. The implementation correctly omits this -- `GEMINI_API_KEY` can be set without Gemini CLI running (plan line 234). This is a correct application of the research caveat.

**Finding:** [INFO-2] Both research deviations (AGENT env var exclusion, GEMINI_API_KEY exclusion) are well-documented in code comments, JSDoc, and SUMMARY.md. Good practice.

### Known Pitfalls

**PITFALLS.md pitfall avoidance verified:**

| Pitfall | Relevant? | Addressed? | How |
|---------|-----------|------------|-----|
| P4: Model name drift | YES | YES | All models configurable via config.backend_models override |
| P5: OpenCode AGENT env var | YES | YES | AGENT excluded; only OPENCODE used. Test at line 367 confirms. |
| P9: Testing complexity | YES | YES | Environment save/restore in beforeEach/afterEach per P9 recommendation. Temp directories for filesystem tests. |

No pitfalls hit by the implementation.

### Eval Coverage

**09-EVAL.md is well-designed for this plan's output.**

Sanity checks S1, S3, S5, S6 can be run against the current implementation. Proxy metrics P1, P2, P5 are directly verifiable now. P3 and P4 depend on plan 09-02 (utils.js integration). D1 (real environment testing) is properly deferred to Phase 15.

**Finding:** [INFO-3] Eval plan is comprehensive. The proxy metric P1 (unit test pass rate) can now be reported as 62/62 (100%). P2 (line coverage) as 100%. P5 (model resolution) as 12/12.

## Stage 2: Code Quality

### Architecture

**Consistent with existing project patterns.**

The implementation follows the established conventions in `lib/*.js`:

1. **File header comment** -- present, matching style of `lib/utils.js` (JSDoc block with research references)
2. **Section separators** -- uses `// --- Section ---` dividers, consistent with other lib files
3. **JSDoc on exports** -- all 3 functions and 3 constants have JSDoc with `@param`, `@returns`, `@type`
4. **Module.exports at bottom** -- follows `module.exports = { ... }` pattern
5. **require() at top** -- `fs` and `path` at lines 19-20
6. **No circular dependency** -- reads config.json directly instead of importing `loadConfig` from utils.js

**Finding:** [WARNING-1] The exported constants `VALID_BACKENDS`, `DEFAULT_BACKEND_MODELS`, and `BACKEND_CAPABILITIES` are mutable objects. A consumer could do `VALID_BACKENDS.push('bad')` or `BACKEND_CAPABILITIES.claude.teams = false` and corrupt the shared state. Consider using `Object.freeze()` on the exported constants (or at minimum on `VALID_BACKENDS` since it is an array). This is not a current bug (no consumer mutates them today) but is a defensive coding concern for a foundational module that other code will depend on.

```javascript
// Current (mutable):
const VALID_BACKENDS = ['claude', 'codex', 'gemini', 'opencode'];

// Recommended (frozen):
const VALID_BACKENDS = Object.freeze(['claude', 'codex', 'gemini', 'opencode']);
```

### Reproducibility

N/A -- this is not experimental code. It is a deterministic detection module. No seeds, random state, or training involved.

### Documentation

**Adequate -- inline documentation is thorough.**

- File header references research documents with specific section numbers (line 9-16)
- Each function has JSDoc with parameter types and return types
- Key design decisions documented inline (circular dependency avoidance, AGENT exclusion)
- Constants have type annotations

**Finding:** [INFO-4] The `readConfig` helper function at line 67 has good JSDoc. The `fileExists` helper at line 91 is clean and well-documented. Both internal helpers follow the same documentation standard as exported functions.

### Deviation Documentation

**SUMMARY.md matches git history.**

| SUMMARY Claim | Git Reality | Match? |
|---------------|------------|--------|
| Commit eb34894 (RED phase) | `eb34894` -- tests/unit/backend.test.js (505 lines) | YES |
| Commit 651bc1f (GREEN phase) | `651bc1f` -- lib/backend.js (188 lines), jest.config.js (+5 lines) | YES |
| "No deviations from plan" | Implementation matches plan tasks exactly | YES |
| 62 tests pass | `npx jest` confirms 62 pass | YES |
| 100% coverage | Coverage report confirms 100% lines/branches/functions | YES |
| 656 total tests (zero regressions) | SUMMARY claims this; test run confirms 62 for this file | PLAUSIBLE |

**Files modified vs SUMMARY key_files:**

| File | In SUMMARY? | In Git? |
|------|------------|---------|
| lib/backend.js | YES (created) | YES |
| tests/unit/backend.test.js | YES (created) | YES |
| jest.config.js | YES (modified) | YES |

All files accounted for. No undocumented modifications.

**Finding:** [WARNING-2] The PLAN.md Task 1 test specification at line 117 says: "returns 'codex' when ~/.codex/config.toml exists (filesystem clue, only if HOME/.codex exists)". However, the implementation and test both check `cwd/.codex/config.toml`, not `~/.codex/config.toml`. This follows the Task 2 implementation specification (line 213) which says "Check filesystem clues in cwd" and the research document Section 2 line 342 which also uses cwd-relative paths. The test specification in Task 1 is internally inconsistent with the implementation specification in Task 2. The implementation chose the correct approach (cwd-relative), but this was not documented as a deviation in SUMMARY.md.

**Finding:** [INFO-5] The test file includes a safety check at line 60 (`cleanupTempDir` verifies the directory is under `os.tmpdir()` before deletion). This is a good defensive practice preventing accidental deletion of real directories.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 2 | Architecture | Exported constants (VALID_BACKENDS, DEFAULT_BACKEND_MODELS, BACKEND_CAPABILITIES) are mutable objects; consider Object.freeze() for defensive safety |
| 2 | WARNING | 2 | Deviation Documentation | Plan Task 1 test spec says ~/.codex/config.toml (HOME-relative) but implementation and Task 2 spec use cwd-relative; not documented as deviation |
| 3 | INFO | 1 | Plan Alignment | Frontmatter key_link from backend.js to utils.js is stale; implementation correctly avoids this import |
| 4 | INFO | 1 | Research Methodology | Both research deviations (AGENT exclusion, GEMINI_API_KEY exclusion) are well-documented |
| 5 | INFO | 1 | Eval Coverage | Eval plan is comprehensive; proxy metrics P1=62/62, P2=100%, P5=12/12 already achievable |
| 6 | INFO | 2 | Documentation | Internal helpers follow same documentation standard as exports; good consistency |
| 7 | INFO | 2 | Code Quality | Test cleanup helper has defensive tmpdir check; good safety practice |

## Recommendations

**WARNING-1 (Mutable Constants):** Add `Object.freeze()` to exported constant objects in `lib/backend.js`. This can be done in plan 09-02 or as a follow-up. Specifically:
- `Object.freeze(VALID_BACKENDS)` for the array
- Deep freeze `DEFAULT_BACKEND_MODELS` and `BACKEND_CAPABILITIES` (freeze each nested object too)
- This prevents downstream code from accidentally mutating shared configuration state

**WARNING-2 (Plan Inconsistency):** For future plans, ensure test specification (Task 1) and implementation specification (Task 2) are internally consistent regarding filesystem paths. The cwd-relative approach is correct per the research, but the test description referencing `~/.codex/config.toml` could confuse future maintainers reading the plan. No code change needed; this is a documentation-only issue.

---

*Review by: Claude (grd-code-reviewer)*
*Review date: 2026-02-16*
