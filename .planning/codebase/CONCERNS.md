# Technical Concerns

**Analysis Date:** 2026-03-01

---

## Summary

| Severity | Count | Key Areas |
|----------|-------|-----------|
| Critical | 2 | MCP process monkeypatching (unchanged), model name staleness (OpenCode) |
| High | 5 | process.exit in libs, empty catch blocks (151 total, growing), non-atomic writes, unescaped RegExp, path validation gap (symlink bypass) |
| Medium | 5 | commands.js god-file (25 own fns + 2,848 lines), missing requirements.js threshold, MCP version hardcoding, backward-compat migration accumulation, search scalability |
| Low | 3 | magic number bar widths (multiple formats, multiple files), duplicate progress logic, archivedPhasesDir path mismatch |
| New | 3 | evolve.js god-file (2,567 lines), context.js god-file (2,546 lines), no test file for requirements.js |

---

## Critical

### C1 — MCP Server Monkeypatches Global Process Streams

**File:** `lib/mcp-server.js:1909-1955` (`captureExecution` function), `lib/mcp-server.js:1961-2010` (`captureExecutionAsync`)

The MCP server reuses all `cmd*` functions which call `process.exit()` and write to `process.stdout`/`process.stderr`. To intercept these in a long-lived server context, `captureExecution()` replaces three global references on every tool call:

```js
process.stdout.write = function (data) { stdout += String(data); return true; };
process.stderr.write = function (data) { stderr += String(data); return true; };
process.exit = function (code) { throw new Error(EXIT_SENTINEL); };
```

An async variant `captureExecutionAsync` (`lib/mcp-server.js:1961`) extends this to async tool handlers but still uses the same global mutation approach with no concurrency guard.

**Risk:** If any `cmd*` function throws an unexpected exception (not `__MCP_EXIT__`), the `catch` block restores the originals before re-throwing — but only for the current stack frame. If a concurrent MCP call fires between the monkey-patch and the restore (e.g., two rapid tool calls), one call may write to the other call's captured buffer, producing corrupt output. There is no mutex or re-entrancy guard. The async variant has no protection against concurrent `await` yield points during which another call could mutate the same global references.

**Impact:** Silent data corruption in MCP mode. Impossible to detect without load testing.

**Fix:** Redesign `cmd*` functions to return values instead of calling `process.exit()`. Use a context object passed into each function to collect output, replacing global I/O hijacking.

---

### C2 — OpenCode Backend Model IDs Are Outdated

**File:** `lib/backend.js:42-46`

```js
opencode: {
  opus: 'anthropic/claude-opus-4-5',
  sonnet: 'anthropic/claude-sonnet-4-5',
  haiku: 'anthropic/claude-haiku-4-5',
},
```

As of 2026-03-01, the current Claude model IDs are `claude-opus-4-6` and `claude-sonnet-4-6`. The `4-5` series identifiers are outdated. Users on the OpenCode backend will receive 404 / model-not-found errors unless they override via `backend_models` in `config.json`.

The previous concern about `lib/tracker.js` coverage floor (30%) has been resolved: `jest.config.js` now sets `tracker.js` thresholds at 85% lines / 89% functions / 70% branches, and all six previously un-thresholded modules now have per-file thresholds configured.

**Impact:** Users on OpenCode backend cannot use default model resolution for any agent tier.

**Fix:** Update `DEFAULT_BACKEND_MODELS.opencode` to `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-6`. Also note: `gpt-5.3-codex` and `gemini-3-pro` are speculative identifiers that may not match real API names.

---

## High

### H1 — `process.exit()` Called from Library Modules (2 call sites in utils.js)

**File:** `lib/utils.js:662-672`

```js
function output(result, raw, rawValue) { ...; process.exit(0); }
function error(message) { ...; process.exit(1); }
```

All `cmd*` functions across `lib/` terminate the process by calling `output()` and `error()`, which call `process.exit()`. This design means `lib/` modules cannot be used as ordinary libraries and drives the C1 monkeypatching concern. The new `lib/evolve.js` (2,567 lines) and `lib/autopilot.js` (633 lines) follow this same pattern — both import and call `output()` and `error()`.

**Impact:** Architectural lock-in. Every new module added to `lib/` inherits the process-exit dependency. Unit tests require `captureOutput` helpers. The async evolve loop (`lib/evolve.js:runEvolve`) is the first long-running async function in `lib/` that does not call `output()` directly, but subsidiary `cmd*` functions (`cmdEvolveDiscover`, `cmdEvolveState`, etc.) do.

**Fix:** Refactor `output()` and `error()` to return structured results instead of calling `process.exit()`. Move exit calls to `bin/grd-tools.js` (the CLI entry point only).

---

### H2 — Empty `catch {}` Blocks Have Grown to 151 Across `lib/` (From ~110)

**Distribution by file:**

| File | Empty catch count |
|------|-------------------|
| `lib/context.js` | 29 |
| `lib/phase.js` | 21 |
| `lib/evolve.js` | 18 |
| `lib/commands.js` | 14 |
| `lib/state.js` | 13 |
| `lib/utils.js` | 12 |
| `lib/cleanup.js` | 8 |
| `lib/tracker.js` | 7 |
| `lib/gates.js` | 6 |
| `lib/verify.js` | 5 |
| other lib/ files | 18 |

The previous count was ~110; the addition of `lib/context.js` (29 instances), `lib/evolve.js` (18 instances) has raised the total to 151. Most are benign (e.g., `lib/evolve.js:175` catches `JSON.parse` errors and returns `null`, `lib/evolve.js:2389` catches `unlinkSync` when the file does not exist). However, the dangerous category in `lib/phase.js` (21 instances) is unchanged:

- `lib/phase.js` rename loops — silent catch after directory rename; if this fails, sibling phases are not renumbered but the caller receives success
- `lib/phase.js:395` — silent catch during file rename inside `cmdPhaseRemove`; partial rename is undetected

Many `lib/state.js` catches (13 instances) also silently absorb errors in STATE.md field parsing, meaning callers may receive empty/default data without any indication of failure.

**Fix (priority order):**
1. `lib/phase.js` rename loops — at minimum log errors to stderr even if non-fatal
2. `lib/state.js` — add a `// intentionally ignored: <reason>` comment pattern to distinguish silent-but-safe from silent-and-risky
3. New modules (`lib/context.js`, `lib/evolve.js`) — many catches are genuinely benign (directory-not-found fallbacks), but annotate them to distinguish from structural issues

---

### H3 — Non-Atomic File Writes on Critical Project Files

**Files:** `lib/phase.js`, `lib/state.js`, `lib/frontmatter.js`, `lib/cleanup.js`, `lib/evolve.js`, `lib/autopilot.js`, `lib/requirements.js`

All critical file mutations use direct `fs.writeFileSync()` with no temp-file-then-rename pattern:

```js
// lib/phase.js:174
fs.writeFileSync(roadmapPath, updatedContent, 'utf-8');
// lib/evolve.js:191
fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n');
// lib/requirements.js:391
fs.writeFileSync(reqFilePath, updatedContent, 'utf-8');
// lib/autopilot.js:298
fs.writeFileSync(statePath, content);
```

The new modules (`lib/evolve.js`, `lib/autopilot.js`, `lib/requirements.js`) added since the last analysis all use the same non-atomic write pattern.

**Impact:** Silent corruption of STATE.md, ROADMAP.md, REQUIREMENTS.md, or EVOLVE-STATE.json on process interruption (Ctrl+C, OOM, agent timeout). Recovery requires manual diff/repair.

**Fix:** Use write-to-temp + rename pattern:
```js
const tmp = roadmapPath + '.tmp';
fs.writeFileSync(tmp, content, 'utf-8');
fs.renameSync(tmp, roadmapPath);
```

---

### H4 — Unescaped File Content Used in `new RegExp()` (Multiple Locations)

**Files:** `lib/cleanup.js:192-195`, `lib/long-term-roadmap.js:45`, `lib/context.js:76`, `lib/evolve.js:1070`

Export names and user-controlled field names are used directly in dynamically constructed `RegExp` objects without escaping:

```js
// lib/cleanup.js:192-195
const patterns = [
  new RegExp(`\\b${exportName}\\b.*require`, 'g'),
  new RegExp(`require.*\\b${exportName}\\b`, 'g'),
  new RegExp(`\\.${exportName}\\b`, 'g'),
];

// lib/context.js:76 — phaseNum is parsed from ROADMAP.md
const phasePattern = new RegExp('## Phase ' + phaseNum + '[^#]*', 's');

// lib/evolve.js:1070 — cmd filename from filesystem
const normalizedCmd = cmd.replace(/-/g, '[- ]?');
const pattern = new RegExp(normalizedCmd, 'i');
```

`lib/context.js:76` uses `parseInt(phaseInfo.phase_number, 10)` so the value is numeric and safe. `lib/evolve.js:1070` uses a `.replace()` that introduces intentional regex syntax (`[- ]?`) but does not otherwise escape the command name, so a command file named `fix+(bug).md` would produce an invalid RegExp.

**Fix:** Escape all dynamic strings before inserting into `new RegExp()`:
```js
const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

Note: `lib/long-term-roadmap.js:496` already does this correctly (`escapedId`). Apply the same pattern to `lib/cleanup.js` and `lib/evolve.js:1070`.

---

### H5 — Path Escape Validation Uses `path.resolve` Without `realpathSync` (Symlink Bypass)

**File:** `lib/utils.js:563-569`

```js
function validateFilePath(filePath, cwd) {
  if (typeof filePath !== 'string') throw new Error('File path must be a string');
  if (filePath.includes('\0')) throw new Error('File path must not contain null bytes');
  const resolved = path.resolve(cwd, filePath);
  if (!resolved.startsWith(cwd)) throw new Error('File path must not escape project directory');
  return filePath;
}
```

`path.resolve()` does not resolve symlinks. If `cwd` itself is a symlink (e.g., on macOS `/var` → `/private/var`), or if `filePath` contains a symlink component that resolves outside `cwd`, the check passes incorrectly. The ESLint complexity analysis in `lib/cleanup.js:121` already demonstrates awareness of this issue:

```js
const realCwd = fs.realpathSync(cwd); // "handles macOS /var -> /private/var symlink"
```

But `validateFilePath` in `lib/utils.js` does not apply the same treatment. The MCP server calls `descriptor.execute(this.cwd, args)` directly without re-running path validation, so MCP tool calls that accept file arguments bypass the validation layer entirely.

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

Additionally, move `validateFileArg()` into each `cmd*` function that accepts a file path, rather than relying solely on the CLI routing layer in `bin/grd-tools.js`.

---

## Medium

### M1 — `lib/commands.js` Remains a God File (2,848 Lines, 25 Own Functions)

**File:** `lib/commands.js`

At 2,848 lines with 25 `cmd*` functions defined directly in the file (plus re-exported functions from `lib/requirements.js`), `commands.js` is still the largest source file. The partial split of requirement functions into `lib/requirements.js` (415 lines) improved isolation for that domain, but `commands.js` still spans slug generation, config management, history digestion, model resolution, progress rendering (three formats), dashboard, phase detail, health, backend detection, long-term roadmap, quality analysis, setup, search, directory migration, coverage reporting, and health checks.

The corresponding test file (`tests/unit/commands.test.js`) has grown beyond 3,000 lines.

**Fix:** Continue the split pattern established by `lib/requirements.js`:
- `lib/dashboard.js` — `cmdDashboard`, `cmdPhaseDetail`, `cmdProgressRender`, `cmdHealth`
- `lib/config-cmd.js` — `cmdConfigEnsureSection`, `cmdConfigSet`

---

### M2 — `lib/requirements.js` Has No Coverage Threshold in `jest.config.js`

**File:** `jest.config.js`, `lib/requirements.js`

`lib/requirements.js` (415 lines) contains `cmdRequirementGet`, `cmdRequirementList`, `cmdRequirementTraceability`, and `cmdRequirementUpdateStatus`. It is tested via `tests/unit/commands.test.js` (which imports and tests these functions), but there is no per-file threshold entry in `jest.config.js` for `./lib/requirements.js`. Unlike the previously uncovered modules, `requirements.js` is not listed in the `coverageThreshold` map at all.

With no threshold, coverage for this file can silently drop to 0% without breaking CI.

**Fix:** Add a threshold entry:
```js
'./lib/requirements.js': { lines: 85, functions: 100, branches: 75 },
```

---

### M3 — MCP Server Version Hardcoded and Out of Sync with `package.json`

**File:** `lib/mcp-server.js:2088-2092`

```js
serverInfo: {
  name: 'grd-mcp-server',
  version: '0.1.0',   // always 0.1.0 regardless of package version
},
```

The package is at version `0.2.8` (from `package.json`). The MCP protocol version `2024-11-05` is also hardcoded at `lib/mcp-server.js:2084`. MCP clients that inspect `serverInfo.version` will see stale data.

**Fix:** Read version dynamically:
```js
const { version } = require('../../package.json');
// ...
serverInfo: { name: 'grd-mcp-server', version }
```

---

### M4 — Backward-Compatibility Migration Code Still Accumulating

**Files:** `lib/tracker.js:37-98`, `lib/paths.js:246-262`

The `lib/tracker.js` module maintains three separate config migration paths (auto-applied on every config load):
1. `jira` → `mcp-atlassian` provider rename (line 42)
2. `epic_issue_type` → `milestone_issue_type` (line 56)
3. `github_integration` → `tracker.github` (line 77)

The `lib/paths.js:archivedPhasesDir()` function (lines 255-262) generates `{version}-phases/` paths for archived milestone phases, but the actual milestone archive layout in `.planning/milestones/` uses plain version directories (`v0.2.0/`). This function is used only by `lib/phase.js:1036` during `milestone complete` operations. Whether the archive creates `v0.2.0-phases/` or `v0.2.0/` depends on which code path is followed. The comment says "matches existing archive layout" but the layout directory structure observed is plain versioned directories.

**Fix:** Document a deprecation timeline for legacy tracker config formats. Add a `state load` or `health` warning for users still on the old layout. Remove migration code once confirmed-complete across user base.

---

### M5 — `cmdSearch` Has No Result Limit (Unbounded Memory)

**File:** `lib/commands.js:2441-2483`

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

## Low

### L1 — Progress Bar Width Is a Magic Number Repeated in Multiple Files and Formats

**Files:** `lib/commands.js:974,994,1242`, `lib/state.js:413`

The integer progress bar width appears as inline constants with different values:

```js
// lib/commands.js:974 — 'table' format
const barWidth = 10;
// lib/commands.js:994 — 'bar' format
const barWidth = 20;
// lib/commands.js:1242 — dashboard
const barWidth = 10;
// lib/state.js:413 — STATE.md progress
const barWidth = 10;
```

Three different sizes (10, 10, 20, 10) are scattered across two files with no named constants. The same progress bar rendering pattern (percent calculation → filled/empty repeat) appears four times with no shared utility.

**Fix:** Extract to named constants and a shared `renderProgressBar(completed, total, width)` function in `lib/utils.js`. Use `TABLE_BAR_WIDTH = 10` and `CLI_BAR_WIDTH = 20` as named constants.

---

### L2 — `archivedPhasesDir()` Path Pattern May Not Match Actual Archive Layout

**File:** `lib/paths.js:255-262`

```js
function archivedPhasesDir(cwd, version) {
  const milestonesBase = path.join(cwd, '.planning', 'milestones');
  const resolved = path.join(milestonesBase, version + '-phases');
  // ...
  return resolved;
}
```

This function generates paths like `.planning/milestones/v0.2.0-phases/`. However, the actual `.planning/milestones/` directory layout observed in this project uses plain version directories (e.g., `v0.2.8/`). The function is used by `lib/phase.js:1036` during `milestone complete` but may produce paths that do not match any existing directory if the archive layout has changed. No tests verify that `milestone complete` creates the expected directory structure.

**Fix:** Verify the intended archive format end-to-end. Either update or remove the function. Add an integration test for `milestone complete` that verifies the resulting directory structure.

---

### L3 — No Test Coverage for Concurrent Worktree + Roadmap Write Scenarios

**File:** `tests/integration/worktree-parallel-e2e.test.js`

The integration test tests concurrent worktree creation (different paths/branches), but there is no test verifying that two simultaneous `phase complete` or `phase add` operations on the same ROADMAP.md do not corrupt it. The `worktree` module creates isolated git worktrees, but ROADMAP.md and STATE.md live in the shared main repo — concurrent writes to them during parallel execution are a real-world scenario in the evolve loop (which spawns multiple subprocess iterations).

**Fix:** Add integration test that spawns two concurrent `phase complete` calls and verifies ROADMAP.md integrity afterward. Add a file lock or sequential queue for shared file writes in parallel mode.

---

## New Concerns (Since Last Analysis)

### N1 — `lib/evolve.js` Is a Second God File (2,567 Lines)

**File:** `lib/evolve.js`

The evolve module (2,567 lines) combines:
- State I/O (`readEvolveState`, `writeEvolveState`, `createInitialState`)
- Merge/deduplication logic (`mergeWorkItems`, `advanceIteration`)
- Codebase discovery engine (18 separate `discover*` sub-functions, ~1,200 lines total)
- AI-based discovery via `spawnClaudeAsync` (`discoverWithClaude`)
- Scoring and priority selection (`scoringHeuristic`, `pickTopItems`, `groupDiscoveredItems`)
- Iteration orchestration (`runGroupDiscovery`, `_runIterationStep`, `_handleIterationResult`, `runEvolve`)
- Evolution notes I/O (`writeEvolutionNotes`)
- Todo integration (`writeDiscoveriesToTodos`)
- CLI entry points (`cmdEvolveDiscover`, `cmdEvolveState`, `cmdEvolveAdvance`, `cmdEvolveReset`, `cmdInitEvolve`)

The discovery engine section alone (~1,200 lines) contains 18 parallel catch blocks that silently absorb errors from individual discovery dimensions. If a discovery function fails, no item is added but no warning is logged either.

**Impact:** The module is already 88% as large as `lib/commands.js`. Further growth is likely as more discovery dimensions are added.

**Fix:** Split into at least three modules:
- `lib/evolve-state.js` — state I/O, state creation, merge logic, iteration advancement
- `lib/evolve-discover.js` — all `discover*` functions and `analyzeCodebaseForItems`
- `lib/evolve.js` — orchestration (`runEvolve`, `runGroupDiscovery`), CLI entry points

---

### N2 — `lib/context.js` Is a Third God File (2,546 Lines, 29 Empty Catches)

**File:** `lib/context.js`

The context module (2,546 lines) provides init workflow context for all 21 workflow types (`cmdInitExecutePhase`, `cmdInitPlanPhase`, `cmdInitNewProject`, etc.). It contains:
- 29 empty `catch {}` blocks — the highest count in the codebase
- Inline file caching with `readCachedState` (module-level state)
- Ceremony level detection logic (`inferCeremonyLevel`)
- A shared `buildInitContext` utility
- 21 `cmdInit*` functions each loading config/state/roadmap/backend independently

The 29 silent catches in context.js are mostly benign (optional file reads for context enrichment), but the lack of any error logging means it is impossible to diagnose context loading failures in production.

**Impact:** Adding new init workflows continues to grow this file. The lack of error transparency makes debugging context failures difficult for users.

**Fix:** Extract `buildInitContext` and the ceremony detection logic to a shared base. Group related init functions (survey/deep-dive/feasibility into `lib/context-research.js`, execution/planning into `lib/context-execution.js`).

---

### N3 — `lib/requirements.js` Has No Dedicated Test File

**File:** `lib/requirements.js`, `tests/unit/commands.test.js`

`lib/requirements.js` (415 lines) contains four `cmd*` functions that are tested via `tests/unit/commands.test.js` (describes at lines 2640, 2719, 2822, 2992). This violates the project's test-mirror convention (`lib/X.js` → `tests/unit/X.test.js`). More critically, there is no per-file coverage threshold for `lib/requirements.js` in `jest.config.js`, meaning coverage can silently drop without breaking CI.

**Impact:** Coverage regressions in requirement management go undetected. The module is tested through `commands.test.js` which already exceeds 3,000 lines.

**Fix:** Create `tests/unit/requirements.test.js` with focused tests for `lib/requirements.js`. Add to `jest.config.js`:
```js
'./lib/requirements.js': { lines: 85, functions: 100, branches: 75 },
```

---

## Security Considerations

### Path Traversal — Partially Mitigated

`validateFilePath()` in `lib/utils.js:563` is called from `bin/grd-tools.js` for the `frontmatter`, `verify`, and `summary-extract` commands. However, internal lib-to-lib calls (e.g., `cmdFrontmatterSet` called from `mcp-server.js`) do not go through `bin/grd-tools.js` and therefore bypass the validation layer. The MCP server calls `descriptor.execute(this.cwd, args)` directly without re-running `validateFileArg`. Since MCP tools accept arbitrary `file` arguments from the calling agent, an agent could pass `../../etc/passwd` and reach `cmdFrontmatterGet` without path validation. The symlink bypass (H5) compounds this risk.

**Recommendation:** Move `validateFileArg()` into each `cmd*` function that accepts a file path, rather than relying on the CLI routing layer.

### Shell Injection — Mitigated

All `execFileSync` calls use argument arrays (not shell strings). `execSync` is not used anywhere in `lib/`. The new `lib/autopilot.js` and `lib/evolve.js` use `childProcess.spawnSync` and `childProcess.spawn` with array arguments. This is correct and safe.

### Regex Injection from Codebase Content — Low Risk (Growing)

The `exportName` injection in `lib/cleanup.js:192-195` and command filename injection in `lib/evolve.js:1070` affect analysis-only code that never writes files. The worst case is incorrect dead-export detection or missed integration test discovery. The fix is trivial and should be applied.

---

## Dependency Risks

### devDependencies Only — No Runtime Dependencies

The project has zero production `dependencies` in `package.json`. All tooling (`jest`, `eslint`, `prettier`, `@eslint/js`, `globals`) is in `devDependencies`. This is intentional and well-designed for a CLI tool.

**Risk:** `analyzeComplexity()` in `lib/cleanup.js` calls `npx eslint` at runtime. In a production install (`npm install --production`), eslint is not available and complexity analysis silently fails.

### jest v30 — Current Major Version

`jest: ^30.2.0` (in `devDependencies`). No known breaking changes affect the test suite. All 1,631+ tests pass.

### ESLint v10 — Recent Major Version

`eslint: ^10.0.0` and `@eslint/js: ^10.0.1` are the latest major versions. The flat config system is in use (`eslint.config.js`). No known issues, but ecosystem plugins may lag.

---

*Concerns analysis: 2026-03-01*
