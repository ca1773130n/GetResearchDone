# Phase 51: Test Coverage & Feature Discovery Research

## Coverage Analysis (2026-02-22)

### Current Line Coverage by Module

| Module | Lines% | Status | Uncovered Lines | Gap to 85% |
|--------|--------|--------|-----------------|------------|
| autopilot.js | 96.0% | OK | 40,310-318 | -- |
| backend.js | 97.4% | OK | 250,372-373 | -- |
| cleanup.js | 94.9% | OK | (8 ranges) | -- |
| commands.js | 91.1% | OK | (large set) | -- |
| context.js | 90.0% | OK | (9 ranges) | -- |
| deps.js | 96.6% | OK | 113,208,226 | -- |
| frontmatter.js | 91.6% | OK | (10 ranges) | -- |
| gates.js | 100% | OK | -- | -- |
| long-term-roadmap.js | 99.2% | OK | 137,430 | -- |
| mcp-server.js | 90.2% | OK | (3 ranges) | -- |
| **parallel.js** | **84.3%** | BELOW | 159-160,166-167,173-174,182,200,210-211,219 | +0.7% |
| paths.js | 97.9% | OK | 71 | -- |
| **phase.js** | **83.9%** | BELOW | 53,57,78,...,1166-1213 | +1.1% |
| roadmap.js | 93.6% | OK | (5 ranges) | -- |
| **scaffold.js** | **82.0%** | BELOW | 32,98,...,360 | +3.0% |
| state.js | 85.0% | BORDERLINE | (15 ranges) | +0.0% |
| **tracker.js** | **43.0%** | WELL BELOW | (massive, 600+ lines uncovered) | +42.0% |
| utils.js | 93.7% | OK | (5 ranges) | -- |
| verify.js | 86.5% | OK | (12 ranges) | -- |
| **worktree.js** | **84.7%** | BELOW | 204,220,...,788 | +0.3% |

### Modules Requiring Coverage Work

1. **tracker.js** (43% -> 85%): 12 handler functions untested (handleSyncRoadmap, handleSyncPhase, handleUpdateStatus, handleAddComment, handleSyncStatus, handlePrepareRoadmapSync, handlePreparePhaseSync, handleRecordMapping, handleRecordStatus, handleSchedule, handlePrepareReschedule). Also: createGitHubTracker methods, createTracker factory.
2. **scaffold.js** (82% -> 85%): Uncovered branches in cmdTemplateFill (line 98/101 error paths, 107 phase-not-found), cmdScaffold (lines 253-360 context/uat/verification/eval/baseline scaffold types).
3. **phase.js** (84% -> 85%): Uncovered decimal phase removal renumbering (350-394), cmdVersionBump (1166-1213), cmdPhaseComplete edge cases (879,902-903), cmdValidateConsistency plan gap/orphan checks (1107-1122).
4. **parallel.js** (84% -> 85%): Uncovered error branches in buildParallelContext (159-219) for missing roadmap, missing phase dirs, dependency validation failures.
5. **worktree.js** (85% -> 85%): Just below at 84.73%. Uncovered: cmdWorktreePushAndPR (474-482,518-532), cmdWorktreeMerge (562,588-610), hook create/remove edge cases (639-788).

### Dogfooding Friction Points

During Phases 48-50, the following friction points were identified:

1. **No coverage summary command**: To find which modules were below threshold, had to run `npx jest --coverage` and manually read the table output. A `coverage-report` subcommand that parses jest JSON output and returns structured below-threshold data would save significant time.

2. **No project health check**: When resuming work, no single command validates that the project is in a clean state (tests pass, lint clean, format clean, no stale artifacts). Had to run 3-4 separate commands (`npm test`, `npm run lint`, `npm run format:check`, `node bin/grd-tools.js validate consistency`). A `health-check` command would be valuable.

3. **Phase 48-50 bug discovery pattern**: The workflow of discovering bugs through dogfooding, cataloging them, and fixing them worked well. But there was no structured way to run a "diagnostic sweep" that exercises common GRD operations and reports issues.

### Feature Selection

For the 2 new features required by REQ-118:

**Feature 1: `coverage-report` subcommand** (high value, direct friction)
- New subcommand of `grd-tools.js`: `coverage-report [--threshold N] [--json]`
- Runs jest with `--coverage --coverageReporters=json-summary` and parses the output
- Returns structured JSON: `{ modules: [...], below_threshold: [...], overall: {...} }`
- Enables agents to programmatically identify coverage gaps without human parsing
- Implementation: ~80 lines in lib/commands.js, 3+ tests

**Feature 2: `health-check` subcommand** (high value, workflow improvement)
- New subcommand of `grd-tools.js`: `health-check [--fix]`
- Runs: test suite (jest), linter (eslint), formatter (prettier --check), consistency validation
- Returns structured JSON: `{ tests: {pass,fail,total}, lint: {errors,warnings}, format: {clean}, consistency: {passed} }`
- With `--fix`: auto-runs `eslint --fix` and `prettier --write` before reporting
- Implementation: ~100 lines in lib/commands.js, 3+ tests
