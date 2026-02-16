---
phase: 18-integration-distribution-validation
wave: 1
plans_reviewed: [18-01, 18-02]
timestamp: 2026-02-16T17:30:00+09:00
blockers: 1
warnings: 4
info: 4
verdict: blocker_found
---

# Code Review: Phase 18 Wave 1

## Verdict: BLOCKERS FOUND

Wave 1 delivers solid integration and distribution tests that closely follow both plans. However, the CI workflow's MCP server validation step uses `|| true`, which silently swallows failures and makes the step a no-op for error detection. Four warnings address unused imports, redundant npm pack calls in tests, and a test that may silently pass on success without asserting it.

## Stage 1: Spec Compliance

### Plan Alignment

**Plan 18-01 (E2E Workflow Integration Test):**

All tasks executed as planned. Commit `ce02b55` adds `tests/integration/e2e-workflow.test.js` with 340 lines and 15 tests organized into the 5 groups specified (backend detection: 3, context init enrichment: 3, quality analysis pipeline: 3, MCP server tool call: 4, sequential pipeline: 2). The full test suite passes with 1272 tests and 0 failures, exceeding both the v0.1.0 baseline of 858 and the target of 950.

All `must_haves` satisfied:
- `truths`: E2E chain validated, full suite passes at 1272 tests (>= 950), no regressions.
- `artifacts`: File exists at 340 lines (min_lines: 80 met).
- `key_links`: All four key_link patterns verified -- `require.*backend` (lines 73, 271), `require.*context` (lines 111, 273), `require.*cleanup` (lines 151, 274), `require.*mcp-server` (lines 106, 201, 272).

No issues found.

**Plan 18-02 (Distribution Validation):**

All tasks executed as planned. Commit `5ff8b70` adds `tests/integration/npm-pack.test.js` with 288 lines and 14 tests organized into 4 groups (pack validation: 4, install from tarball: 4, bin entry execution: 3, plugin.json path resolution: 3). Commit `1b25c2b` adds the "Pack and install validation" CI step to `.github/workflows/ci.yml`.

All `must_haves` satisfied:
- `truths`: Pack tarball contains required files, install works, MCP server starts from tarball, plugin.json paths resolve, CI includes pack+install step on Node 18/20/22.
- `artifacts`: `npm-pack.test.js` at 288 lines (>= 80 met); `ci.yml` contains "npm pack".
- `key_links`: `npm pack|execFileSync.*npm` pattern found in npm-pack.test.js (lines 29, 53); `npm pack` found in ci.yml (line 41).

See BLOCKER B1 for CI step issue.

### Research Methodology

N/A -- no research references in these plans. Phase 18 is integration validation, not feature implementation.

### Known Pitfalls

Checked PITFALLS.md (`/Users/edward.seo/dev/private/project/harness/GetResearchDone/.planning/research/PITFALLS.md`):

- **P3 (CLAUDE_PLUGIN_ROOT unreliable in command markdown):** The npm-pack.test.js test at line 275-284 correctly validates that `plugin.json` uses `${CLAUDE_PLUGIN_ROOT}` variable and does NOT contain hardcoded absolute paths (`/Users/` or `/home/`). This pitfall is well-addressed by the test.

- **P9 (Testing complexity):** Phase 18 tests do not attempt multi-backend CI testing; they validate distribution on the current backend only. This is appropriate given the phase scope. The CI matrix covers Node versions (18/20/22) but not multiple backends, which aligns with P9's mitigation strategy of "manual smoke testing on actual backends for initial release."

No issues found.

### Eval Coverage

Checked `18-EVAL.md` (`/Users/edward.seo/dev/private/project/harness/GetResearchDone/.planning/phases/18-integration-distribution-validation/18-EVAL.md`):

- Sanity checks S1-S6: All can be computed from current implementation. Test files exist and meet minimum line counts. Package.json has required fields.
- Proxy metrics P1-P8: All reference correct test file paths and commands. The implementation provides the interfaces needed to run all 8 proxy metrics.
- Deferred D1-D3: Appropriately deferred to post-publish.

No issues found.

## Stage 2: Code Quality

### Architecture

Both test files follow existing project conventions established in `tests/integration/cli.test.js`:

- Use `os.tmpdir()` for temp directories
- Use `fs.cpSync` for fixture copying (e2e-workflow.test.js)
- Clean up in `afterAll`
- Use `describe`/`test` (not `it`) pattern
- Use `require` (CommonJS, consistent with project)
- Follow the `// --- Section Header ---` comment style

| # | Severity | Finding |
|---|----------|---------|
| W1 | WARNING | `getCleanupConfig` is imported but never used in `e2e-workflow.test.js` line 151 |

```javascript
// Line 151 of tests/integration/e2e-workflow.test.js
const { runQualityAnalysis, generateCleanupPlan, getCleanupConfig } = require('../../lib/cleanup');
// getCleanupConfig is never referenced anywhere in the file
```

This will trigger lint warnings if ESLint's `no-unused-vars` rule covers test files.

### Reproducibility

N/A -- these are integration tests, not experimental/research code. No random seeds or stochastic behavior involved. Tests are deterministic (filesystem operations, MCP handshakes, npm pack).

One timing-related test exists (line 315-338 of e2e-workflow.test.js: "entire pipeline completes in under 10 seconds"). This is a reasonable soft assertion for integration health; the 10-second threshold is generous enough to avoid flakiness on CI runners.

### Documentation

Both test files have clear module-level JSDoc comments explaining purpose, test strategy, and requirement traceability (REQ-20 for E2E, REQ-30 for distribution). Test names are descriptive and self-documenting. No complex algorithms requiring paper references.

No issues found.

### Deviation Documentation

**SUMMARY 18-01:** Claims no deviations. Git log confirms single commit `ce02b55` modifying only `tests/integration/e2e-workflow.test.js`. SUMMARY key-files lists only `tests/integration/e2e-workflow.test.js` as created, with no modified files. Matches git diff output.

**SUMMARY 18-02:** Documents one auto-fixed deviation (spawn replaced with execFileSync for MCP handshake test). Git log confirms commits `5ff8b70` and `1b25c2b` modifying `tests/integration/npm-pack.test.js` and `.github/workflows/ci.yml` respectively. SUMMARY key-files lists npm-pack.test.js as created and ci.yml as modified. Matches git diff output.

All files modified across wave 1 (per `git diff ce02b55~1..1b25c2b --name-only`):
- `.github/workflows/ci.yml` -- documented in 18-02-SUMMARY.md
- `tests/integration/e2e-workflow.test.js` -- documented in 18-01-SUMMARY.md
- `tests/integration/npm-pack.test.js` -- documented in 18-02-SUMMARY.md

No undocumented files modified.

## Specific Findings

### B1 [BLOCKER]: CI MCP server validation swallows all errors with `|| true`

**File:** `/Users/edward.seo/dev/private/project/harness/GetResearchDone/.github/workflows/ci.yml`, line 56

```yaml
echo '...' | timeout 5 node node_modules/grd-tools/bin/grd-mcp-server.js || true
echo "grd-mcp-server: OK"
```

The `|| true` means this step will always succeed regardless of whether the MCP server actually responds correctly. If the server crashes, hangs past timeout, or returns an error response, the step still prints "grd-mcp-server: OK" and the CI passes. This defeats the purpose of distribution validation.

The plan's `must_haves.truths` states: "grd-mcp-server starts and responds to MCP initialize handshake when installed from tarball." The `|| true` makes this truth unverifiable in CI.

**Recommendation:** Remove `|| true` and validate the response content. For example:

```yaml
RESPONSE=$(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"ci-test","version":"1.0.0"}}}' | timeout 5 node node_modules/grd-tools/bin/grd-mcp-server.js)
echo "$RESPONSE" | node -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n')[0]); if(!r.result||!r.result.protocolVersion) process.exit(1);"
echo "grd-mcp-server: OK"
```

Alternatively, since the MCP server process reads stdin and writes stdout then exits when stdin closes, the `timeout` plus pipe should terminate cleanly. If it does not, that is itself a bug worth catching.

### W1 [WARNING]: Unused import `getCleanupConfig` in e2e-workflow.test.js

**File:** `/Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/integration/e2e-workflow.test.js`, line 151

```javascript
const { runQualityAnalysis, generateCleanupPlan, getCleanupConfig } = require('../../lib/cleanup');
```

`getCleanupConfig` is destructured but never used in the file. Should be removed to avoid lint warnings.

### W2 [WARNING]: npm pack `--dry-run --json` called three times redundantly

**File:** `/Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/integration/npm-pack.test.js`, lines 80-139

Three separate tests each invoke `execFileSync('npm', ['pack', '--dry-run', '--json'], ...)` independently (lines 80-88, 90-120, 122-139). Each call takes several seconds and produces identical output. This triples the time for the pack validation group unnecessarily.

**Recommendation:** Move the dry-run output into a `beforeAll` or shared variable within the `describe('npm pack validation')` block, similar to how `npm pack` and `npm install` are already executed once in the top-level `beforeAll`.

### W3 [WARNING]: `grd-tools.js` test silently passes when exit code is 0

**File:** `/Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/integration/npm-pack.test.js`, lines 177-197

```javascript
test('grd-tools.js produces usage output', () => {
    try {
      execFileSync('node', [grdToolsPath], { encoding: 'utf-8', timeout: 10000 });
      // If it exits 0, that is also fine
    } catch (err) {
      expect(err.status).toBe(1);
      expect(err.stderr).toMatch(/Usage/i);
    }
});
```

If `grd-tools.js` starts exiting with code 0 (e.g., due to a refactor), the test passes without any assertions being executed. This is a "no assertion" test path. The plan states "exit code 1 with 'Usage:' in stderr is acceptable" but does not say exit code 0 with no output is acceptable.

**Recommendation:** Add an assertion in the success path, or at minimum verify stdout/stderr contains expected output:

```javascript
try {
  const stdout = execFileSync('node', [grdToolsPath], { encoding: 'utf-8', timeout: 10000 });
  // If it exits 0, verify it still produced meaningful output
  expect(stdout.length).toBeGreaterThan(0);
} catch (err) {
  expect(err.status).toBe(1);
  expect(err.stderr).toMatch(/Usage/i);
}
```

### W4 [WARNING]: CI step uses hardcoded `/tmp/grd-test-install` path

**File:** `/Users/edward.seo/dev/private/project/harness/GetResearchDone/.github/workflows/ci.yml`, line 46

```yaml
mkdir -p /tmp/grd-test-install
```

If CI runs parallel matrix jobs on a shared runner (unlikely with GitHub Actions but possible with self-hosted runners), the fixed path could cause collisions. The Jest test file correctly uses `fs.mkdtempSync` for unique temp directories but the CI step does not.

**Recommendation:** Use `mktemp -d` for a unique temp directory:

```yaml
INSTALL_DIR=$(mktemp -d)
cd "$INSTALL_DIR"
```

### I1 [INFO]: Test counts in SUMMARY files are internally consistent

18-01-SUMMARY.md reports 1272 total tests, 26 suites. 18-02-SUMMARY.md reports 1272 total tests, 26 suites. The two summaries were written at different times but agree, confirming no regression between commits.

### I2 [INFO]: `captureExecution` pattern is well-suited for context init testing

The use of `captureExecution` from `lib/mcp-server.js` to capture stdout from context init functions is a clean testing pattern that avoids subprocess overhead. This is a good architectural decision documented in 18-01-SUMMARY.md.

### I3 [INFO]: MCP initialize handshake test using `execFileSync` with `input` option

The decision to use `execFileSync` with `input` instead of `spawn` for the MCP server handshake test (documented as an auto-fix in 18-02-SUMMARY.md) avoids Jest open-handle warnings and is the correct approach for synchronous test flows.

### I4 [INFO]: Config mutation in quality analysis tests is localized

The e2e-workflow.test.js quality analysis tests mutate the fixture config to toggle `phase_cleanup.doc_sync`. Since this uses a per-test-suite temp directory created in `beforeAll`, the mutation does not leak across test suites.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| B1 | BLOCKER | 2 | Integration Correctness | CI MCP server validation uses `\|\| true`, silently swallowing all failures |
| W1 | WARNING | 2 | Architecture | Unused import `getCleanupConfig` in e2e-workflow.test.js |
| W2 | WARNING | 2 | Code Quality | npm pack `--dry-run --json` called three times redundantly in test |
| W3 | WARNING | 2 | Integration Correctness | grd-tools.js test has a zero-assertion path when exit code is 0 |
| W4 | WARNING | 2 | Reproducibility | CI step uses hardcoded `/tmp/grd-test-install` instead of unique temp dir |
| I1 | INFO | 1 | Deviation Documentation | Test counts consistent across both SUMMARY files (1272 tests) |
| I2 | INFO | 2 | Architecture | `captureExecution` pattern is well-suited for testing context init functions |
| I3 | INFO | 2 | Code Quality | `execFileSync` with `input` option avoids Jest open-handle warnings |
| I4 | INFO | 2 | Code Quality | Config mutation in quality tests is properly isolated in temp directory |

## Recommendations

**For B1 (BLOCKER -- CI MCP validation):** Remove `|| true` from the MCP server test in `.github/workflows/ci.yml` line 56. Either parse and validate the JSON response, or at minimum allow the command to fail the step naturally. The `timeout 5` ensures the step does not hang indefinitely. If the MCP server does not exit cleanly after stdin closes, that is a separate bug that should be surfaced, not suppressed.

**For W1 (unused import):** Remove `getCleanupConfig` from the destructuring on line 151 of `e2e-workflow.test.js`.

**For W2 (redundant npm pack calls):** Hoist the `npm pack --dry-run --json` result into a `describe`-scoped variable initialized in a nested `beforeAll`, similar to the top-level setup pattern already used in the file.

**For W3 (zero-assertion path):** Add at least one assertion to the try-block success path in the grd-tools.js test.

**For W4 (hardcoded temp path):** Replace `mkdir -p /tmp/grd-test-install` with `INSTALL_DIR=$(mktemp -d)` in the CI workflow.
