---
phase: 18-integration-distribution-validation
plan: 02
subsystem: distribution-validation
tags: [npm, integration-test, ci, distribution, mcp]
dependency_graph:
  requires: [package.json, bin/grd-tools.js, bin/grd-mcp-server.js, bin/postinstall.js, .claude-plugin/plugin.json]
  provides: [tests/integration/npm-pack.test.js, ci-pack-validation]
  affects: [.github/workflows/ci.yml]
tech_stack:
  added: []
  patterns: [execFileSync-with-input-for-mcp-test, npm-pack-json-introspection]
key_files:
  created:
    - tests/integration/npm-pack.test.js
  modified:
    - .github/workflows/ci.yml
decisions:
  - summary: "execFileSync with input option for MCP handshake test (not spawn)"
    rationale: "Avoids open handle warnings; synchronous approach cleaner for test assertions"
metrics:
  duration: 3min
  completed: 2026-02-16
---

# Phase 18 Plan 02: Distribution Validation Summary

npm pack/install integration test covering full distribution pipeline (pack, install, bin entries, MCP server handshake, plugin.json resolution) plus CI step running on Node 18/20/22.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create npm pack/install integration test | 5ff8b70 | tests/integration/npm-pack.test.js |
| 2 | Add pack+install CI validation step | 1b25c2b | .github/workflows/ci.yml |

## Implementation Details

### Task 1: npm pack/install integration test

Created `tests/integration/npm-pack.test.js` with 14 tests organized in 4 groups:

1. **npm pack validation** (4 tests):
   - Verifies `npm pack` produces a `.tgz` tarball
   - Checks file count is >= 20 (bin, lib, commands, agents, plugin.json)
   - Validates all required files present: bin/grd-tools.js, bin/grd-mcp-server.js, bin/postinstall.js, lib/ modules, .claude-plugin/plugin.json, agents/, commands/
   - Confirms exclusions: no tests/, .planning/, .github/, or coverage/ files

2. **npm install from tarball** (4 tests):
   - Installs tarball into temp consumer project
   - Verifies node_modules/grd-tools/ directory structure
   - Checks bin symlinks for grd-tools and grd-mcp-server
   - Validates installed directories: bin/, lib/, agents/, commands/

3. **Bin entry execution** (3 tests):
   - grd-tools.js produces usage output (exit 1 with "Usage:" is acceptable)
   - grd-mcp-server responds to MCP initialize handshake with protocolVersion
   - postinstall.js has `#!/usr/bin/env node` shebang

4. **plugin.json path resolution** (3 tests):
   - plugin.json exists at installed .claude-plugin/ path
   - Parses as valid JSON with name, version, description fields
   - Uses `${CLAUDE_PLUGIN_ROOT}` variable (no hardcoded paths)

Uses beforeAll/afterAll for one-time pack and cleanup. 30s jest timeout for npm operations.

### Task 2: CI pack+install validation step

Added "Pack and install validation" step to `.github/workflows/ci.yml` after "Test" and before "Security audit". The step:
- Runs `npm pack` to produce tarball
- Creates temp consumer project at /tmp/grd-test-install
- Runs `npm install` from tarball
- Verifies grd-tools CLI (current-timestamp --raw)
- Verifies MCP server starts (JSON-RPC initialize via stdin pipe)
- Verifies plugin.json exists at expected path
- Cleans up tarball and temp directory

Runs on the existing Node 18/20/22 matrix, so distribution is validated on all supported versions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced spawn with execFileSync for MCP handshake test**
- **Found during:** Task 1 verification
- **Issue:** spawn-based MCP test caused Jest "open handles" warning due to async process lifecycle
- **Fix:** Used `execFileSync` with `input` option to pipe initialize message synchronously via stdin
- **Files modified:** tests/integration/npm-pack.test.js
- **Commit:** 5ff8b70

## Verification

- All 14 integration tests pass: `npx jest tests/integration/npm-pack.test.js --no-coverage`
- Full test suite passes: 1272 tests, 26 suites, 0 failures
- CI workflow contains "Pack and install validation" step with npm pack, install, bin checks
- No open handle warnings

## Test Delta

+14 tests (1257 total from npm-pack.test.js; 1272 total across all suites)

## Self-Check: PASSED

- tests/integration/npm-pack.test.js: FOUND (288 lines)
- .github/workflows/ci.yml: FOUND (contains "Pack and install validation")
- Commit 5ff8b70: FOUND
- Commit 1b25c2b: FOUND
