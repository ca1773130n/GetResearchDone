# Technical Concerns

**Analysis Date:** 2026-02-20

---

## Summary

| Severity | Count | Key Areas |
|----------|-------|-----------|
| Critical | 2 | MCP process monkeypatching, tracker coverage floor |
| High | 6 | process.exit in libs, empty catch blocks, non-atomic writes, unescaped RegExp, path validation gap, model name staleness |
| Medium | 6 | commands.js god-file, missing coverage thresholds, mcp-server version hardcoding, backward-compat accumulation, search scalability, npx dependency |
| Low | 4 | magic number bar widths, duplicate progress logic, archivedPhasesDir mismatch, no test for concurrent writes |

---

## Critical

### C1 — MCP Server Monkeypatches Global Process Streams

**File:** `lib/mcp-server.js:1577-1622` (`captureExecution` function)

The MCP server reuses all `cmd*` functions which call `process.exit()` and write to `process.stdout`/`process.stderr`. To intercept these in a long-lived server context, `captureExecution()` replaces three global references on every tool call:

```js
process.stdout.write = function (data) { ... };
process.stderr.write = function (data) { ... };
process.exit = function (code) { throw new Error(EXIT_SENTINEL); };
```

**Risk:** If any `cmd*` function throws an unexpected exception (not `__MCP_EXIT__`), the `finally` block restores the originals — but only for the current stack frame. If a concurrent MCP call fires between the monkey-patch and the restore (e.g., two rapid tool calls), one call may write to the other call's captured buffer, producing corrupt output. There is no mutex or re-entrancy guard.

**Impact:** Silent data corruption in MCP mode. Impossible to detect without load testing.

**Fix:** Redesign `cmd*` functions to return values instead of calling `process.exit()`. Use a context object passed into each function to collect output, replacing global I/O hijacking.

---

### C2 — `lib/tracker.js` Coverage Floor Is Critically Low (30%)

**File:** `jest.config.js:38-42`, `lib/tracker.js`

The configured coverage threshold for `lib/tracker.js` is 30% lines / 35% functions / 30% branches — and the actual coverage is 40.61% lines / 44% functions / 40.46% branches. This is the lowest threshold in the project by a wide margin (next lowest is `lib/context.js` at 70%).

The tracker module (1,043 lines) contains the GitHub Issues sync logic and Jira/MCP Atlassian integration. Lines 233–380 in `tracker.js` (the core of `createGitHubTracker` — `createPhaseIssue`, `createTaskIssue`, `updateIssueStatus`, `syncRoadmap`, `syncPhase`) are entirely untested. Lines 493–1026 (Jira prepare/schedule/reschedule functions) are also untested.

**Impact:** Regressions in tracker operations will not be caught by CI. Users relying on GitHub Issues or Jira sync have no safety net.

**Fix:** Add mock-based tests for `createGitHubTracker` methods (mocking `execFileSync('gh', ...)`). Raise threshold to 60%+ lines.

---

## High

### H1 — `process.exit()` Called from Library Modules (18 call sites)

**Files:** `lib/commands.js` (lines 900, 1281, 1300, 1330, 1583, 1819), `lib/utils.js` (lines 455, 465), `lib/state.js` (line 91)

Library modules in `lib/` call `process.exit()` directly via the `output()` and `error()` helpers:

```js
// lib/utils.js:449-465
function output(result, raw, rawValue) { ...; process.exit(0); }
function error(message) { ...; process.exit(1); }
```

This design means `lib/` modules cannot be used as ordinary libraries — they terminate the process on every successful or failed call. The MCP server works around this with the global monkeypatching described in C1. Any future reuse of these functions (e.g., in tests without output capture, in a web API wrapper, or in a REPL context) will cause the process to exit unexpectedly.

**Impact:** Architectural lock-in. Drives the C1 monkeypatching concern. Makes unit testing require `captureOutput` helpers for every assertion.

**Fix:** Refactor `output()` and `error()` to return structured results instead of calling `process.exit()`. Move exit calls to `bin/grd-tools.js` (the CLI entry point only).

---

### H2 — 110+ Empty `catch {}` Blocks Silently Swallow Errors

**Files:** `lib/phase.js` (11 instances), `lib/cleanup.js` (20 instances), `lib/roadmap.js` (2 instances), `lib/state.js` (1 instance), `lib/commands.js` (4 instances)

There are 110 empty catch blocks across `lib/` (confirmed by grep). Representative examples:

- `lib/phase.js:239` — silent catch after directory rename; if this fails, sibling phases are not renumbered but the caller receives success
- `lib/phase.js:395` — silent catch during file rename inside `cmdPhaseRemove`; partial rename is undetected
- `lib/phase.js:827` — silent catch during milestone state update

Many of these silently allow partial state to persist. For example, if renaming 10 phase directories in a remove operation fails halfway, the ROADMAP.md is already updated but the filesystem is not — the project enters an inconsistent state with no error reported.

**Fix (priority order):**
1. `lib/phase.js` rename loops — at minimum log errors to stderr even if non-fatal
2. `lib/cleanup.js` — convert to `return []` with a logged warning
3. Add atomic rollback for multi-step operations (update roadmap, then rename dirs — reverse both on failure)

---

### H3 — Non-Atomic File Writes on Critical Project Files

**Files:** `lib/phase.js`, `lib/state.js`, `lib/frontmatter.js`, `lib/cleanup.js`

All critical file mutations use direct `fs.writeFileSync()` with no temp-file-then-rename pattern:

```js
// lib/phase.js:174
fs.writeFileSync(roadmapPath, updatedContent, 'utf-8');
// lib/phase.js:545
fs.writeFileSync(statePath, stateContent, 'utf-8');
```

If the process is killed (Ctrl+C, OOM, agent timeout) during a write, the file is left in a partially written state. For ROADMAP.md and STATE.md, this is project-corrupting.

**Impact:** Silent corruption of STATE.md or ROADMAP.md on process interruption. Recovery requires manual diff/repair.

**Fix:** Use write-to-temp + rename pattern:
```js
const tmp = roadmapPath + '.tmp';
fs.writeFileSync(tmp, content, 'utf-8');
fs.renameSync(tmp, roadmapPath);
```

---

### H4 — Unescaped File Content Used in `new RegExp()` (`lib/cleanup.js`)

**File:** `lib/cleanup.js:192-195`

Export names extracted from source files are used directly in dynamically constructed `RegExp` objects without escaping:

```js
// lib/cleanup.js:192-195
const patterns = [
  new RegExp(`\\b${exportName}\\b.*require`, 'g'),
  new RegExp(`require.*\\b${exportName}\\b`, 'g'),
  new RegExp(`\\.${exportName}\\b`, 'g'),
];
```

If a source file contains an exported identifier with special regex characters (e.g., `$init`, a name starting with `$`), the regex construction will throw or produce incorrect matching results. Similarly in `lib/long-term-roadmap.js:45`:

```js
// lib/long-term-roadmap.js:45
const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
```

`fieldName` comes from object iteration over user-controlled milestone fields.

**Fix:** Escape all dynamic strings before inserting into `new RegExp()`:
```js
const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

Note: `lib/long-term-roadmap.js:496` already does this correctly (`escapedId`). Apply the same pattern to `lib/cleanup.js`.

---

### H5 — Path Escape Validation Uses `path.resolve` Without `realpathSync` (Symlink Bypass)

**File:** `lib/utils.js:356-361`

```js
function validateFilePath(filePath, cwd) {
  const resolved = path.resolve(cwd, filePath);
  if (!resolved.startsWith(cwd)) throw new Error('File path must not escape project directory');
  return filePath;
}
```

`path.resolve()` does not resolve symlinks. If `cwd` itself is a symlink (e.g., on macOS `/var` → `/private/var`), or if `filePath` contains a symlink component that resolves outside `cwd`, the check passes incorrectly. The ESLint complexity analysis in `lib/cleanup.js:121` already demonstrates awareness of this issue:

```js
const realCwd = fs.realpathSync(cwd); // "handles macOS /var -> /private/var symlink"
```

But `validateFilePath` in `lib/utils.js` does not apply the same treatment.

**Fix:**
```js
function validateFilePath(filePath, cwd) {
  const realCwd = fs.realpathSync(cwd);
  const resolved = path.resolve(cwd, filePath);
  const realResolved = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
  if (!realResolved.startsWith(realCwd + path.sep) && realResolved !== realCwd) {
    throw new Error('File path must not escape project directory');
  }
  return filePath;
}
```

---

### H6 — Model Name Strings Are Hardcoded and May Become Stale

**File:** `lib/backend.js:37-46`

Model identifiers for non-Claude backends are hardcoded constants:

```js
codex: { opus: 'gpt-5.3-codex', sonnet: 'gpt-5.3-codex-spark', haiku: 'gpt-5.3-codex-spark' },
gemini: { opus: 'gemini-3-pro', sonnet: 'gemini-3-flash', haiku: 'gemini-2.5-flash' },
opencode: {
  opus: 'anthropic/claude-opus-4-5',
  sonnet: 'anthropic/claude-sonnet-4-5',
  haiku: 'anthropic/claude-haiku-4-5',
},
```

As of analysis date, `claude-opus-4-5` and `claude-sonnet-4-5` model IDs are outdated (current Claude models are `claude-opus-4-6`, `claude-sonnet-4-6`). `gpt-5.3-codex` and `gemini-3-pro` are speculative future identifiers.

**Impact:** Users on OpenCode backend will get 404/invalid model errors unless they override via `backend_models` config.

**Fix:** Document that `DEFAULT_BACKEND_MODELS` requires periodic updates. Add a config-file override path (already exists via `backend_models` in `config.json`) and document it prominently. Update OpenCode model strings to current releases.

---

## Medium

### M1 — `lib/commands.js` Is a God File (2,808 Lines, 35 Functions)

**File:** `lib/commands.js`

At 2,808 lines containing 35 `cmd*` functions spanning slug generation, config management, history digestion, model resolution, progress rendering, dashboard, phase detail, health, backend detection, long-term roadmap, quality analysis, setup, requirement CRUD, search, and directory migration — this module is the largest in the project and is growing.

The module imports from `utils`, `frontmatter`, `backend`, `long-term-roadmap`, `cleanup`, and `paths` but has no single cohesive responsibility. New CLI commands continue to be added here.

**Impact:** Difficult to navigate. Test file (`tests/unit/commands.test.js` at 3,338 lines) is correspondingly difficult to maintain. Code changes in one feature area can accidentally affect unrelated areas.

**Fix:** Split by domain:
- `lib/requirements.js` — `cmdRequirementGet`, `cmdRequirementList`, `cmdRequirementTraceability`, `cmdRequirementUpdateStatus`
- `lib/dashboard.js` — `cmdDashboard`, `cmdPhaseDetail`, `cmdProgressRender`, `cmdHealth`
- `lib/config-cmd.js` — `cmdConfigEnsureSection`, `cmdConfigSet`

---

### M2 — Six `lib/` Modules Have No Coverage Thresholds in `jest.config.js`

**File:** `jest.config.js`

The following modules have no per-file coverage threshold configured:

| Module | Lines | Actual Coverage (measured) |
|--------|-------|---------------------------|
| `lib/cleanup.js` | 1,406 | 92.33% lines |
| `lib/deps.js` | ~200 | 96.77% lines |
| `lib/gates.js` | ~280 | 96.4% lines |
| `lib/long-term-roadmap.js` | 746 | 92.03% lines |
| `lib/parallel.js` | ~470 | 84.5% lines |
| `lib/worktree.js` | 471 | 84.5% lines |

With no threshold, coverage for these files can silently drop to 0% without breaking CI. The parallel and worktree modules are particularly fragile as they orchestrate git operations.

**Fix:** Add coverage thresholds for all 6 modules. Conservative targets that match current coverage:
```js
'./lib/cleanup.js': { lines: 90, functions: 95, branches: 80 },
'./lib/deps.js': { lines: 90, functions: 100, branches: 85 },
'./lib/gates.js': { lines: 90, functions: 100, branches: 80 },
'./lib/long-term-roadmap.js': { lines: 88, functions: 90, branches: 78 },
'./lib/parallel.js': { lines: 80, functions: 100, branches: 72 },
'./lib/worktree.js': { lines: 80, functions: 100, branches: 70 },
```

---

### M3 — MCP Server Version Hardcoded and Out of Sync with `package.json`

**File:** `lib/mcp-server.js:1706-1708`

```js
serverInfo: {
  name: 'grd-mcp-server',
  version: '0.1.0',   // always 0.1.0 regardless of package version
},
```

The package is at version `0.2.2` (from `package.json`). The MCP protocol version `2024-11-05` is also hardcoded. MCP clients that inspect `serverInfo.version` will see stale data. If the MCP protocol version advances, the server will not negotiate the correct version.

**Fix:** Read version dynamically:
```js
const { version } = require('../../package.json');
// ...
serverInfo: { name: 'grd-mcp-server', version }
```

---

### M4 — Backward-Compatibility Migration Code Accumulating in `lib/paths.js` and `lib/tracker.js`

**Files:** `lib/paths.js:91-96` (fallback comment notes "transition period"), `lib/tracker.js:37-64` (three legacy format auto-migrations)

The `paths.js` module has documented a "transition period" fallback to old-style `.planning/phases/` paths. If the `cmdMigrateDirs` migration (`lib/commands.js:2674`) has already been completed for all users, the fallback branches in `phasesDir()`, `researchDir()`, `codebaseDir()`, `todosDir()`, `quickDir()` are dead code that creates confusion.

Similarly, `lib/tracker.js` maintains three separate config migration paths:
1. `jira` → `mcp-atlassian` (line 38)
2. `epic_issue_type` → `milestone_issue_type` (line 52)
3. `github_integration` → `tracker.github` (line 67)

**Fix:** Document a deprecation timeline for the old paths fallback. Add a validation check during `state load` or `health` to warn users still on the old layout. Remove the migration code once all users have migrated.

---

### M5 — `cmdSearch` Has No Result Limit (Unbounded Memory)

**File:** `lib/commands.js:2630-2657`

```js
function cmdSearch(cwd, query, raw) {
  const mdFiles = collectMarkdownFiles(planningDir);  // recursive, no depth limit
  const matches = [];
  for (const filePath of mdFiles) {
    const content = safeReadFile(filePath);           // loads entire file into memory
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(queryLower)) {
        matches.push({ file, line, content: lines[i] });
      }
    }
  }
  output({ matches, ... });                          // all matches serialized to JSON
}
```

On large projects with thousands of `.md` files, this function loads all file content into memory, collects all matching lines, and serializes the entire result. A broad query like `"the"` would produce an enormous JSON payload.

**Fix:** Add a `--limit` flag (default 100 results). Add depth limit to `collectMarkdownFiles`. Stream results instead of accumulating.

---

### M6 — ESLint Complexity Analysis Depends on `npx` Being Available

**File:** `lib/cleanup.js:90`

```js
const output = execFileSync('npx', args, { ... });
```

The `analyzeComplexity()` function spawns `npx eslint` as a subprocess. This:
1. Requires `npx` and `eslint` (a devDependency) to be present at runtime, which may not be true in a production npm install (devDependencies are excluded)
2. Has no `maxBuffer` override — the default `execFileSync` maxBuffer is 1MB, which may be exceeded on large codebases

The function does degrade gracefully (returns `[]` on failure), but complexity analysis is silently disabled in production installs.

**Fix:** Document that `phase_cleanup.refactoring: true` requires devDependencies to be installed. Alternatively, implement a lightweight complexity counter that does not require ESLint.

---

## Low

### L1 — Progress Bar Width (20 chars) Is a Magic Number Repeated in Three Places

**Files:** `lib/commands.js:844,849,861`, `lib/state.js:353`

The integer `20` representing progress bar width appears four times with no named constant:

```js
// lib/commands.js:849
const filled = Math.round((percent / 100) * 20);
const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
```

**Fix:** Extract to a named constant `const PROGRESS_BAR_WIDTH = 20` in `lib/utils.js`.

---

### L2 — Progress Rendering Logic Duplicated Between `lib/state.js` and `lib/commands.js`

**Files:** `lib/state.js:350-355`, `lib/commands.js:844-863`

Both modules contain near-identical progress bar rendering code (percent calculation, bar fill, text formatting). Changes to the display format must be applied in two places.

**Fix:** Extract to a shared `renderProgressBar(completed, total, width)` function in `lib/utils.js`.

---

### L3 — `archivedPhasesDir()` Creates a Path Pattern (`{version}-phases`) That Does Not Match Actual Archive Layout

**File:** `lib/paths.js:205-212`

```js
function archivedPhasesDir(cwd, version) {
  return path.join(cwd, '.planning', 'milestones', version + '-phases');
}
```

The comment says "matches the existing archive layout." However, the actual milestone archive layout (as visible in `.planning/milestones/`) uses plain version directories (e.g., `v0.2.0/`) not `v0.2.0-phases/`. This function is unused by any currently active code path (confirmed by grep), but if referenced it will produce wrong paths.

**Fix:** Verify the intended archive format and either update or remove the function.

---

### L4 — No Test Coverage for Concurrent Worktree + Roadmap Write Scenarios

**Files:** `tests/integration/worktree-parallel-e2e.test.js`

The integration test at line 455 tests concurrent worktree _creation_ (different paths/branches), but there is no test verifying that two simultaneous `phase complete` or `phase add` operations on the same ROADMAP.md do not corrupt it. The `worktree` module creates isolated git worktrees, but ROADMAP.md and STATE.md live in the shared main repo — concurrent writes to them during parallel execution would be a real-world scenario.

**Fix:** Add integration test that spawns two concurrent `phase complete` calls and verifies ROADMAP.md integrity afterward. Add a file lock or sequential queue for shared file writes in parallel mode.

---

## Security Considerations

### Path Traversal — Partially Mitigated

`validateFilePath()` in `lib/utils.js:356` is called from `bin/grd-tools.js` for the `frontmatter`, `verify`, and `summary-extract` commands. However, internal lib-to-lib calls (e.g., `cmdFrontmatterSet` called from `mcp-server.js`) do not go through `bin/grd-tools.js` and therefore bypass the validation layer. The MCP server calls `descriptor.execute(this.cwd, args)` directly without re-running `validateFileArg`. Since MCP tools accept arbitrary `file` arguments from the calling agent, an agent could pass `../../etc/passwd` and reach `cmdFrontmatterGet` without path validation.

**Recommendation:** Move `validateFileArg()` into each `cmd*` function that accepts a file path, rather than relying on the CLI routing layer.

### Shell Injection — Mitigated

All `execFileSync` calls use argument arrays (not shell strings). `execSync` is not used anywhere in `lib/`. This is correct and safe.

### Regex Injection from Codebase Content — Low Risk

The `exportName` injection into `new RegExp()` in `lib/cleanup.js:192-195` affects analysis-only code that never writes files. The worst case is incorrect dead-export detection, not file corruption. However the fix is trivial and should be applied.

---

## Dependency Risks

### devDependencies Only — No Runtime Dependencies

The project has zero production `dependencies` in `package.json`. All tooling (`jest`, `eslint`, `prettier`, `@eslint/js`, `globals`) is in `devDependencies`. This is intentional and well-designed for a CLI tool that bundles its own lib/.

**Risk:** `analyzeComplexity()` in `lib/cleanup.js` calls `npx eslint` at runtime. In a production install (`npm install --production`), eslint is not available and complexity analysis silently fails. This is documented at M6.

### Jest v30 — Recent Major Version

`jest: ^30.2.0` (in `devDependencies`). Jest 30 is a major version released recently. No known breaking changes affect the test suite (all 1,634 tests pass), but ecosystem plugins and coverage reporters may lag.

---

*Concerns analysis: 2026-02-20*
