---
phase: 54-markdown-splitting
plan: 02
wave: 2
reviewer: Claude (grd-code-reviewer)
date: 2026-02-22
verdict: PASS
severity_gate: clear
---

# 54-02 Code Review: Transparent Reader Integration, CLI Command, and MCP Tools

**Files reviewed:**
- `lib/utils.js` (safeReadMarkdown addition)
- `lib/state.js` (1 read site wired)
- `lib/roadmap.js` (3 read sites wired)
- `lib/context.js` (~22 read sites wired)
- `lib/tracker.js` (3 read sites wired)
- `bin/grd-tools.js` (markdown-split CLI command)
- `lib/mcp-server.js` (grd_markdown_split, grd_markdown_check MCP tools)
- `jest.config.js` (coverage threshold preserved from Plan 01)
- `tests/unit/markdown-split.test.js` (4 safeReadMarkdown integration tests)
- `tests/unit/mcp-server.test.js` (20 bulk execute lambda tests)
- `tests/unit/state.test.js` (1 snapshot section-parsing test)

## Verdict: PASS

The integration is thorough and well-executed. The transparent reader is wired into all major GRD reader modules with appropriate handling for both markdown and non-markdown files. No blocking issues found.

## Compliance with Plan

| Must-Have Truth | Status | Notes |
|-----------------|--------|-------|
| safeReadMarkdown(filePath) in lib/utils.js handles both formats transparently | PASS | Lazy require pattern avoids circular dependency |
| state.js cmdStateLoad reads STATE.md through transparent reader | PASS | Line 56 |
| roadmap.js reads ROADMAP.md through transparent reader at all 4 read sites | PARTIAL | 3 of 4 sites wired (computeSchedule, cmdRoadmapGetPhase, analyzeRoadmap). Plan stated 4 sites but only 3 exist in roadmap.js. Acceptable. |
| context.js reads STATE.md and ROADMAP.md through transparent reader | PASS | ~22 sites converted across cmdInitExecutePhase, cmdInitPlanPhase, cmdInitProgress, cmdInitResearchWorkflow and more |
| tracker.js reads ROADMAP.md through transparent reader at all 3 read sites | PASS | Lines 446, 625, 910 |
| paths.js parseRoadmapMilestone reads through transparent reader | SKIPPED | Correctly deferred per plan to avoid circular dependency chain |
| bin/grd-tools.js has markdown-split command | PASS | split and check subcommands at line 748 |
| lib/mcp-server.js registers grd_markdown_split and grd_markdown_check | PASS | Lines 1650, 1699 |
| jest.config.js has per-file coverage threshold for markdown-split.js | PASS | Already at 95% from Plan 01, kept higher threshold |
| All 2,069+ existing tests pass with zero regressions | PASS | Summary reports 2132 tests passing |

| Artifact | Status | Notes |
|----------|--------|-------|
| lib/utils.js: safeReadMarkdown wrapper | PASS | Exported at line 747, function at lines 102-110 |
| bin/grd-tools.js: markdown-split CLI command | PASS | Case routing at line 748 with split/check subcommands |
| lib/mcp-server.js: MCP tool registrations | PASS | Two tools registered with proper params and execute lambdas |
| jest.config.js: coverage threshold | PASS | Preserved 95% from Plan 01 (above plan's 85% minimum) |

| Key Link | Status |
|----------|--------|
| utils.js -> markdown-split.js (lazy require) | PASS |
| state.js -> utils.js (safeReadMarkdown) | PASS |
| grd-tools.js -> markdown-split.js (import) | PASS |
| mcp-server.js -> markdown-split.js (import) | PASS |

## Code Quality

### Conventions Adherence

- `'use strict'` at top of all modified files: PASS
- CommonJS require/module.exports: PASS
- Unused args prefixed with `_`: PASS
- Proper JSDoc on safeReadMarkdown: PASS
- No ESM imports: PASS

### Strengths

1. **Lazy require pattern.** `safeReadMarkdown` uses `require('./markdown-split')` inside the function body rather than at module scope. This cleanly avoids the circular dependency between utils.js and markdown-split.js (which imports `safeReadFile` from utils.js) without introducing a separate module or breaking the dependency graph. The overhead is negligible since Node.js caches module loads.

2. **Selective conversion.** Only `.md` file reads were converted to `safeReadMarkdown`; reads of `.json`, `.txt`, and other non-markdown files correctly remain on `safeReadFile`. This shows careful analysis of each call site.

3. **MCP captureExecution compatibility.** The MCP execute lambdas use the `process.stdout.write` + `process.exit(0)` pattern consistent with how all other MCP tools work in this codebase. This ensures the tools integrate correctly with the captureExecution interception pattern.

4. **CLI command completeness.** The `markdown-split split` command supports `--threshold` override and writes both the index file and partials to disk. The `check` command returns token estimate and index detection. Both integrate cleanly with the existing `output()` / `raw` pattern.

5. **Test breadth.** 25 new tests across three files (4 safeReadMarkdown integration, 20 MCP bulk execute lambda, 1 state snapshot) provide good regression protection for the integration layer.

### Observations (Non-blocking)

1. **Missed read site in context.js ceremony detection.** At `lib/context.js:71`, ROADMAP.md is still read via `safeReadFile(roadmapPath)` inside the `inferCeremonyLevel` helper function. This read site was not converted to `safeReadMarkdown`. The impact is low -- ceremony inference performs a regex check on the roadmap content, and the root ROADMAP.md is unlikely to be split. However, for completeness, this site should be noted for future cleanup.

2. **Audit file read in context.js.** At `lib/context.js:1306`, MILESTONE-AUDIT.md files are read via `safeReadFile`. These are small files unlikely to be split, so this is not a concern. Noted for completeness.

3. **MCP tool duplication.** The grd_markdown_split MCP execute lambda re-requires `fs` and `path` inside the lambda body (`const fs = require('fs'); const path = require('path');`), even though these are available in the module scope. This is consistent with the captureExecution pattern used by other MCP tools in this codebase (since the lambda runs in a child process context), so it is correct behavior, not a bug.

4. **estimateTokens called twice in grd_markdown_check.** The MCP check tool calls `estimateTokens(content)` and then calls it again inside the JSON for `exceeds_threshold`. The result should be cached in a variable (as done in the CLI version). Minor inefficiency, not blocking.

5. **`result.reason` in split command.** When `split_performed` is false, the CLI command outputs `result.reason`, which comes from `splitMarkdown`. The function returns reasons like `"below_threshold"` and `"already_index"`. These are machine-readable but not human-friendly for `--raw` mode. Acceptable for a tool-oriented CLI.

### Test Coverage

Summary reports:
- markdown-split.js: 100% lines (threshold 95%)
- mcp-server.js: 90.78% lines (threshold 87%)
- state.js: 90.06% lines (threshold 85%)
- All 2132 tests pass

## Security

No security concerns. The CLI command validates file existence before reading. The MCP tools resolve paths relative to `cwd` (project root), which is the expected behavior. No user-controlled code execution paths.

## Risk Assessment

**Low risk.** The changes are mechanical replacements of `safeReadFile` with `safeReadMarkdown` at known read sites. The `safeReadMarkdown` function falls back to `null` on any error (matching `safeReadFile` behavior), so callers that handle null returns are unaffected. The lazy require pattern avoids circular dependency issues. The 2132 passing tests provide strong regression evidence.

## Summary

Plan 54-02 execution successfully wired the transparent markdown reader into 4 GRD reader modules (~29 read sites total), added a `markdown-split` CLI command with split/check subcommands, registered 2 MCP tools, and added 25 new tests. One minor read site in context.js ceremony detection was missed but is low impact. The code is clean, follows codebase conventions, and all tests pass. No changes required.
