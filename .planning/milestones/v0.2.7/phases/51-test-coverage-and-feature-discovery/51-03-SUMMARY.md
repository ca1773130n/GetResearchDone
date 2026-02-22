---
phase: 51-test-coverage-and-feature-discovery
plan: 03
subsystem: commands
tags: [feature, coverage-report, health-check, cli, mcp]

provides:
  - "cmdCoverageReport(cwd, options, raw) in lib/commands.js"
  - "cmdHealthCheck(cwd, options, raw) in lib/commands.js"
  - "CLI routing: coverage-report [--threshold N] and health-check [--fix]"
  - "MCP tools: grd_coverage_report and grd_health_check"
affects: [51-04-plan]

key-files:
  modified:
    - lib/commands.js
    - bin/grd-tools.js
    - lib/mcp-server.js
    - tests/unit/commands.test.js

key-decisions:
  - decision: "Use child_process module reference instead of destructured execFileSync"
    why: "Enables test mocking via child_process.execFileSync = mock"
  - decision: "cmdCoverageReport filters to lib/ files only and sorts by line coverage ascending"
    why: "Agent-friendly output focuses on the modules that need attention first"
  - decision: "cmdHealthCheck runs 4 checks sequentially: tests, lint, format, consistency"
    why: "Consolidates the 4 separate commands that were needed to verify project health"

metrics:
  tests_added: 11
  total_tests: 1951
  features_implemented: 2
  duration: "~10min"

status: complete
---

# Plan 51-03 Summary: Implement coverage-report and health-check Features

## What Was Done

Implemented 2 new CLI features discovered during Phase 48-50 dogfooding:

### cmdCoverageReport
- Runs jest with json-summary reporter, parses coverage-summary.json
- Returns structured JSON with per-module coverage and below-threshold list
- Handles jest exit non-zero gracefully (coverage file still available)
- Filters to lib/ modules only, skips bin/ and other paths
- CLI: `node bin/grd-tools.js coverage-report [--threshold N]`

### cmdHealthCheck
- Runs 4 checks: tests (jest), lint (eslint), format (prettier), consistency (validate)
- Each check captures structured data with status/counts
- `--fix` mode runs auto-fixers before checking
- Returns single JSON blob with `healthy: true/false`
- CLI: `node bin/grd-tools.js health-check [--fix]`

### MCP Registration
- `grd_coverage_report` with threshold parameter
- `grd_health_check` with fix parameter

### Tests (11 total)
- cmdCoverageReport: all above threshold, modules below threshold, missing coverage file, custom threshold, non-lib filtering
- cmdHealthCheck: all pass, test failures, lint errors, fix mode, lint parse error, consistency error

## Results
- 2 new features implemented and tested
- 11 new tests (5 for coverage-report, 6 for health-check)
- Total tests: 1,940 -> 1,951 (+11)
- Zero regressions
