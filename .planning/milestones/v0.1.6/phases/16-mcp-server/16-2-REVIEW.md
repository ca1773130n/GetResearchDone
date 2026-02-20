---
phase: 16-mcp-server
wave: 2
plans_reviewed: [16-02]
timestamp: 2026-02-16T07:12:08Z
blockers: 0
warnings: 2
info: 4
verdict: warnings_only
---

# Code Review: Phase 16 Wave 2

## Verdict: WARNINGS ONLY

Plan 16-02 (MCP server unit tests) is well-executed with 170 passing tests achieving 93% line coverage, significantly exceeding the 80% target. Two minor warnings related to untested mutating tool lambdas and a stylistic inconsistency in test helper usage; neither blocks progression.

## Stage 1: Spec Compliance

### Plan Alignment

Both plan tasks have corresponding commits with accurate file scoping.

| Task | Plan Description | Commit | Status |
|------|-----------------|--------|--------|
| Task 1: Write MCP server unit tests | tests/unit/mcp-server.test.js | f68ea1a | PASS |
| Task 2: Add coverage threshold | jest.config.js | 4afcf20 | PASS |

**Task 1 cross-reference:**
- Plan specified 8 test groups; implementation delivers 11 describe blocks (the extra 3 are `captureExecution`, `McpServer constructor`, and `tool execution errors`). This is a positive deviation -- more coverage than planned.
- Plan specified 40+ tests; actual count is 170. Exceeds target by 4x due to the bulk lambda coverage strategy.
- All 8 planned test groups are present: schema generation, registry completeness, protocol handshake, notifications, tool listing, tool execution, error paths, edge cases.
- Plan truth "MCP server test suite has >= 80% line coverage" verified at 93.11%.
- Plan truth "Protocol handshake test" verified (lines 237-292 of test file).
- Plan truth "Tool listing test: tools/list returns array with 50+ tools" verified (lines 331-372).
- Plan truth "Schema generation test" verified (lines 43-165).
- Plan truth "Tool execution tests" verified (lines 374-526).
- Plan truth "Error handling tests" verified (lines 1010-1164).
- Plan truth "Server never crashes" verified via edge case tests (lines 1166-1219).

**Task 2 cross-reference:**
- Plan specified coverage thresholds of `lines: 80, functions: 80, branches: 60`. Actual `jest.config.js` entry at lines 63-67 matches exactly.
- Full test suite passes: 1208/1208 tests, 22 suites, zero regressions.

**Deviation documented in SUMMARY.md:** Addition of bulk lambda coverage tests (88 tests) to reach the 80% coverage target. This is properly documented under "Auto-fixed Issues" and is a reasonable in-flight adjustment.

No issues found.

### Research Methodology

N/A -- no research references in this plan. This is a protocol implementation (MCP JSON-RPC 2.0), not a research technique.

### Known Pitfalls

N/A -- no KNOWHOW.md exists in the project research directory.

### Eval Coverage

Checked against `16-EVAL.md`:

- **P1 (Protocol handshake):** Covered by describe block "handleMessage -- initialize" (4 tests).
- **P2 (Tool listing):** Covered by describe block "handleMessage -- tools/list" (3 tests).
- **P3 (Schema validity):** Covered by describe block "buildToolDefinitions()" (13 tests).
- **P4 (Naming convention):** Covered by test "tool names follow grd_{command}_{subcommand} convention" (line 94).
- **P5 (Tool execution):** Covered by describe block "handleMessage -- tools/call" (11 tests) plus 88 bulk lambda tests.
- **P6 (Error handling):** Covered by describe block "handleMessage -- error paths" (12 tests).
- **P7 (Test coverage):** 93.11% lines / 91.89% functions / 67.63% branches. All thresholds met.
- **P8 (No regressions):** Full suite 1208/1208 passing. Test count increased by 170 from 1038 baseline.

All 8 proxy metrics are addressable from the implementation. Eval scripts in `16-EVAL.md` reference correct paths (`tests/unit/mcp-server.test.js`, `jest.config.js`).

No issues found.

## Stage 2: Code Quality

### Architecture

**Positive observations:**
- Test file follows the established project pattern: module-level `beforeAll`/`afterAll` with `createFixtureDir`/`cleanupFixtureDir` from `tests/helpers/fixtures.js`, matching existing tests like `commands.test.js`.
- Import pattern (`require('../../lib/mcp-server')`) is consistent with other test files.
- Describe block organization is clean and mirrors the source module's structure.
- The `callTool` helper in the bulk coverage section is a good DRY pattern.

**Minor observation:** The test file imports `fs` and `path` (line 16-17) but neither is used in the test file. These are dead imports likely left over from an initial template that expected custom fixture setup.

No blocking issues.

### Reproducibility

N/A -- no experimental code. This is a deterministic unit test suite. All tests are reproducible: no random state, no external dependencies, fixture isolation via temp directories.

### Documentation

The test file header comment (lines 1-13) clearly lists all 9 test categories. Each describe block name maps to the source module's API surface. Inline comments explain non-obvious test logic (e.g., line 1064 "No id = notification -- returns null", line 1208 "Arrays pass typeof === 'object'").

No paper references needed -- this is protocol testing.

Adequate.

### Deviation Documentation

**SUMMARY.md vs git history:**

| SUMMARY claim | Git reality | Match |
|---------------|------------|-------|
| Task 1 commit: f68ea1a | Exists, modifies `tests/unit/mcp-server.test.js` | YES |
| Task 2 commit: 4afcf20 | Exists, modifies `jest.config.js` | YES |
| Key files created: `tests/unit/mcp-server.test.js` | 1388 lines, new file in f68ea1a | YES |
| Key files modified: `jest.config.js` | 5 lines added in 4afcf20 | YES |
| Coverage: 93.11% lines | Verified by `npx jest --coverage`: 93.11% | YES |
| Test count: 170 | Verified: 170 passed | YES |
| Total suite: 1208 | Verified: 1208 passed | YES |

No undocumented files modified. Commit messages are consistent with SUMMARY claims.

SUMMARY.md matches git history.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 2 | Architecture | Dead imports: `fs` and `path` are imported at lines 16-17 of `tests/unit/mcp-server.test.js` but never used |
| 2 | WARNING | 2 | Architecture | 8 mutating tool lambdas uncovered: `grd_commit`, `grd_phase_add`, `grd_phase_insert`, `grd_phase_remove`, `grd_phase_complete`, `grd_milestone_complete`, `grd_long_term_roadmap_generate`, `grd_long_term_roadmap_refine`, `grd_long_term_roadmap_promote` (lines 238, 491-529, 916-940 of `lib/mcp-server.js`). These are skipped because they perform destructive operations on fixture state, which is a reasonable tradeoff, but accounts for most of the 7% uncovered lines |
| 3 | INFO | 1 | Plan Alignment | Plan specified 8 test groups and 40+ tests; implementation delivers 11 describe blocks and 170 tests. Positive deviation -- significantly exceeds requirements |
| 4 | INFO | 1 | Eval Coverage | All 8 proxy metrics from 16-EVAL.md are fully covered by the test suite |
| 5 | INFO | 2 | Architecture | Bulk lambda coverage pattern (`callTool` helper exercising all 97 descriptors) is an effective strategy for achieving high function coverage on a registry-based module |
| 6 | INFO | 2 | Architecture | The `_executeTool` catch block (line 1285) and `buildToolDefinitions` default switch case (line 1005) remain uncovered -- these are defensive code paths that would require fault injection to trigger, which is acceptable |

## Recommendations

**For WARNING #1 (dead imports):**
Remove the unused `fs` and `path` imports from `tests/unit/mcp-server.test.js` lines 16-17. This is a trivial cleanup that can be addressed in a follow-up commit or the next plan that touches this file.

**For WARNING #2 (uncovered mutating lambdas):**
The 8 uncovered lambdas all perform destructive filesystem or git operations (`cmdCommit`, `cmdPhaseAdd`, `cmdPhaseInsert`, `cmdPhaseRemove`, `cmdPhaseComplete`, `cmdMilestoneComplete`, and 3 long-term-roadmap mutators). Skipping them in bulk tests is reasonable to avoid side effects on the shared fixture directory. If higher coverage is desired in the future, these could be tested with per-test isolated fixture directories (create in `beforeEach`, destroy in `afterEach`). This is not blocking given coverage already exceeds the 80% threshold at 93%.
