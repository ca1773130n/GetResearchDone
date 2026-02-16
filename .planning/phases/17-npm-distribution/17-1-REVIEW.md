---
phase: 17-npm-distribution
wave: 1
plans_reviewed: [17-01, 17-02]
timestamp: 2026-02-16T08:00:00Z
blockers: 0
warnings: 1
info: 3
verdict: warnings_only
---

# Code Review: Phase 17 Wave 1

## Verdict: WARNINGS ONLY

Both plans executed faithfully with all tasks completed, 35 tests passing, and implementation matching the plan specifications. One warning regarding the `postinstall` behavior in npm global install contexts (it runs in the package directory, not the user project). Three informational notes on commit ordering, test count discrepancy between summary claims and reality, and a minor postinstall design consideration.

## Stage 1: Spec Compliance

### Plan Alignment

**Plan 17-01** specified two tasks: (1) configure package.json for npm publishing and create postinstall script, (2) add unit tests. Both tasks are completed with corresponding commits:

- Task 1: commit `1bf2765` modifies `package.json` (added name, bin, files, keywords, repository, postinstall script reference, removed private) and creates `bin/postinstall.js` (64 lines). All plan-specified fields verified present.
- Task 2: commit `a652b31` creates `tests/unit/postinstall.test.js` (236 lines, 21 tests). Exceeds plan min_lines requirement of 40.

**Plan 17-02** specified two tasks: (1) implement cmdSetup in `lib/commands.js` and wire CLI route, (2) add unit tests. Both tasks completed:

- Task 1: commit `04e217d` adds `cmdSetup` function to `lib/commands.js` (38 lines added) and wires `setup` route in `bin/grd-tools.js` (6 lines changed). Usage string updated.
- Task 2: commit `ffd39cd` creates `tests/unit/setup.test.js` (165 lines, 14 tests). Exceeds plan min_lines requirement of 50.

All `must_haves.truths` verified:
- package.json name is `grd-tools`, version `0.1.0` matches VERSION file, `private` field is absent
- bin entries correctly map `grd-tools` to `bin/grd-tools.js` and `grd-mcp-server` to `bin/grd-mcp-server.js`
- files whitelist contains exactly: `bin/`, `lib/`, `commands/`, `agents/`, `.claude-plugin/plugin.json`
- `engines.node` is `>=18`, zero runtime dependencies
- `bin/postinstall.js` creates `.planning/` directory structure and default `config.json`
- postinstall is idempotent (exits silently if `.planning/` exists)
- `grd-tools setup` CLI command routed correctly
- setup command locates `.claude-plugin/plugin.json` via `__dirname` resolution
- setup command is idempotent (verified by tests)
- setup exits with helpful error if plugin.json not found

All `must_haves.key_links` verified:
- `package.json` references `bin/grd-tools.js` via bin entry
- `package.json` references `bin/grd-mcp-server.js` via bin entry
- `package.json` references `bin/postinstall.js` via postinstall script
- `bin/grd-tools.js` imports and routes `cmdSetup` from `lib/commands.js`
- `lib/commands.js` references `.claude-plugin/plugin.json` via path resolution

No issues found.

### Research Methodology

N/A -- no research references in plans. This is a pure infrastructure/packaging phase.

### Known Pitfalls

N/A -- no KNOWHOW.md found in `.planning/research/`. LANDSCAPE.md exists but contains no content relevant to npm packaging or CLI distribution.

### Eval Coverage

The 17-EVAL.md defines 7 sanity checks (S1-S7), 4 proxy metrics (P1-P4), and 3 deferred validations (D1-D3). Reviewing against the implementation:

- S1 (package.json valid JSON): Can be computed -- verified manually and by tests.
- S2 (bin entries point to existing files): Verified -- both files exist on disk.
- S3 (files whitelist entries exist): Verified -- all 5 entries exist.
- S4 (postinstall runs without error): Verified -- exits 0 in repo directory.
- S5 (postinstall creates directory structure): Covered by 6 directory-creation tests.
- S6 (setup command runs without error): Verified -- exits 0 with both JSON and raw output.
- S7 (setup command output contains plugin path): Verified -- output contains "plugin" and `.claude-plugin` path.
- P1 (test coverage >= 80%): Can be computed via jest --coverage.
- P2 (test suite pass rate 100%): Verified -- 35/35 tests pass (21 postinstall + 14 setup).
- P3 (package.json field completeness): Verified -- all checks pass.
- P4 (postinstall idempotency): Covered by 2 explicit idempotency tests.
- D1-D3: Appropriately deferred to Phase 18.

No issues found.

## Stage 2: Code Quality

### Architecture

The implementation follows existing project patterns consistently:

- `cmdSetup` function in `lib/commands.js` follows the `function cmdXxx(cwd, raw)` signature pattern used by all other command functions in the file.
- Uses the shared `output()` and `error()` utilities from `lib/utils.js` for JSON/raw output, consistent with all other commands.
- CLI routing in `bin/grd-tools.js` follows the established switch-case pattern with `cmdSetup` added as a top-level command (not nested under subcommands).
- `cmdSetup` is properly exported in the `module.exports` object.
- `bin/postinstall.js` is a standalone script using only Node.js built-ins (`fs`, `path`), consistent with the zero-dependency requirement.
- Test files follow the existing pattern of `describe`/`test` blocks with the same helper utilities (`captureOutput`/`captureError` from `tests/helpers/setup.js`).

No issues found.

### Reproducibility

N/A -- no experimental code. This is deterministic infrastructure code. The postinstall script and setup command produce identical output for identical inputs (verified by idempotency tests).

### Documentation

The implementation includes adequate inline documentation:

- `bin/postinstall.js` has a file-level JSDoc comment explaining purpose, idempotency contract, and error-handling philosophy (lines 2-9).
- `cmdSetup` in `lib/commands.js` has a JSDoc comment (lines 2023-2028) documenting parameters and behavior.
- Both test files have file-level comments explaining test scope.

No issues found.

### Deviation Documentation

Both SUMMARY.md files claim "None -- plan executed exactly as written." Cross-referencing with the actual git diff:

Files modified across the 4 commits:
- `package.json` (17-01 Task 1)
- `bin/postinstall.js` (17-01 Task 1)
- `tests/unit/postinstall.test.js` (17-01 Task 2)
- `bin/grd-tools.js` (17-02 Task 1)
- `lib/commands.js` (17-02 Task 1)
- `tests/unit/setup.test.js` (17-02 Task 2)

All 6 files match the `files_modified` declarations in both plan frontmatters and SUMMARY key-files sections. No undocumented file modifications.

The SUMMARY.md files also reference `tests/helpers/setup.js` implicitly through its use in setup tests, but this file was pre-existing and not modified -- this is acceptable.

No issues found.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 2 | Architecture | postinstall.js uses `process.cwd()` which resolves to the npm package install directory during `npm install -g`, not the user's project directory |
| 2 | INFO | 1 | Plan Alignment | SUMMARY 17-01 claims 21 tests but actual test count is 21 (11 pkg.json + 10 postinstall); SUMMARY 17-02 claims 14 tests; total verified at 35 |
| 3 | INFO | 2 | Architecture | Commits are interleaved across plans (17-01 Task 1, 17-02 Task 1, 17-01 Task 2, 17-02 Task 2) due to wave-parallel execution; this is expected behavior |
| 4 | INFO | 1 | Eval Coverage | The `tests/helpers/setup.js` helper (captureOutput/captureError) is a pre-existing shared test utility -- good reuse of codebase infrastructure |

## Recommendations

**WARNING #1: postinstall.js process.cwd() behavior during npm global install**

The `bin/postinstall.js` script uses `process.cwd()` (line 17) to determine where to create the `.planning/` directory. When run via `npm install -g grd-tools`, npm sets `process.cwd()` to the package installation directory (e.g., `/usr/local/lib/node_modules/grd-tools`), not the user's project directory. This means the postinstall script will create `.planning/` inside the npm package directory itself during global install, which is harmless but not the intended behavior described in the plan ("creates .planning/ directory structure in the current working directory").

This is appropriately covered by DEFER-17-02 in the EVAL.md (end-to-end npm install validation in Phase 18). The current behavior is safe -- it will not cause errors, and the `.planning/` directory created inside the npm global package is inert. However, the intent for end-user project bootstrapping will need a different trigger (e.g., `grd-tools init` or first run detection) rather than the postinstall hook.

**Recommendation:** No action required now. Flag for Phase 18 integration testing. Consider whether the postinstall script should detect global vs local install context (`npm_config_global` environment variable) and skip directory creation for global installs, or document that `grd-tools setup` (or a future `grd-tools init`) is the intended project bootstrapping entry point.
