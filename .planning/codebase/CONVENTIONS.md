# Code Conventions

**Analysis Date:** 2026-02-20

## Module System

CommonJS exclusively. No ESM anywhere in the codebase.

```js
// Imports at top of every file — Node built-ins first, then local modules
const fs = require('fs');
const path = require('path');
const { output, error } = require('./utils');
const { extractFrontmatter } = require('./frontmatter');

// Single module.exports object at the bottom of each file
module.exports = {
  cmdStateLoad,
  cmdStateGet,
  stateExtractField,
  stateReplaceField,
};
```

All exports are named. No default export pattern. No ESM `import`/`export`.

**No runtime npm dependencies.** All lib/ modules use only Node.js built-ins (`fs`, `path`, `os`, `child_process`). `devDependencies` only: `jest`, `eslint`, `prettier`, `@eslint/js`, `globals`.

---

## File Header Pattern

Every `lib/` module opens with a JSDoc block stating purpose and dependencies:

```js
/**
 * GRD State Operations — STATE.md read/write/patch/progression functions
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization.
 * Depends on: lib/utils.js (safeReadFile, loadConfig, findPhaseInternal, output, error)
 *             lib/frontmatter.js (extractFrontmatter)
 */
```

`bin/grd-tools.js` uses a short one-liner:
```js
/**
 * GRD Tools — Thin CLI router. All business logic lives in lib/ modules.
 * Usage: node grd-tools.js <command> [args] [--raw]
 */
```

**`'use strict'`**: Only `lib/paths.js` and `bin/postinstall.js` include it. It is NOT a universal convention across the codebase.

---

## Function Naming

**`cmd` prefix for all CLI command handlers:**
```js
cmdStateLoad(cwd, raw)
cmdStatePatch(cwd, patches, raw)
cmdPhaseAdd(cwd, name, raw)
cmdVerifyPlanStructure(file, cwd, raw)
cmdRoadmapGetPhase(cwd, phaseNum, raw)
cmdLongTermRoadmap(cwd, args, raw)
```

**Internal/helper functions — plain camelCase, no prefix:**
```js
stateExtractField(content, fieldName)   // internal to lib/state.js
stateReplaceField(content, fieldName, newValue)
normalizePhaseName(phase)               // lib/utils.js
formatScheduleDate(date)                // internal to lib/roadmap.js
addDays(date, days)
findCodeFiles(dir, maxDepth, found, depth)
```

**Constants — SCREAMING_SNAKE_CASE:**
```js
const GIT_ALLOWED_COMMANDS = new Set([...]);
const GIT_BLOCKED_COMMANDS = new Set([...]);
const GIT_BLOCKED_FLAGS = new Set([...]);
const MODEL_PROFILES = { ... };
const CODE_EXTENSIONS = new Set(['.ts', '.js', '.py', ...]);
const FIXTURE_SOURCE = path.join(__dirname, '..', 'fixtures', 'planning');
const EXIT_SENTINEL = '__GRD_TEST_EXIT__';
```

---

## JSDoc Convention

Every exported function and most internal helpers carry JSDoc with `@param` and `@returns`:

```js
/**
 * Extract a **Field:** value from STATE.md markdown content.
 * @param {string} content - STATE.md content
 * @param {string} fieldName - Field name to extract (matched case-insensitively)
 * @returns {string|null} Trimmed field value, or null if not found
 */
function stateExtractField(content, fieldName) { ... }

/**
 * CLI command: Load full project state including config, STATE.md, and existence checks.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output key=value format instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdStateLoad(cwd, raw) { ... }
```

`cmd*` functions always have `@returns {void}` — they call `output()` or `error()` which call `process.exit()`. Notably, the `error()` function in `lib/utils.js` writes `'Error: ' + message` to stderr (plain text, not JSON).

---

## Section Separator Pattern

All `lib/` files and `bin/grd-tools.js` use ASCII box-drawing section dividers, right-padded to ~80 chars:

```js
// ─── Internal Helpers ────────────────────────────────────────────────────────

// ─── State Command Functions ─────────────────────────────────────────────────

// ─── State Progression Engine ────────────────────────────────────────────────

// ─── Exports ─────────────────────────────────────────────────────────────────
```

Test files use the same pattern:
```js
// ─── stateExtractField ──────────────────────────────────────────────────────

// ─── cmdStateLoad ───────────────────────────────────────────────────────────
```

---

## CLI Output Pattern

All `cmd*` functions use `output()` and `error()` from `lib/utils.js`:

```js
// Success — outputs JSON (pretty-printed 2-space indent) or raw text, then exits 0
function output(result, raw, rawValue) {
  if (raw && rawValue !== undefined) {
    process.stdout.write(String(rawValue));
  } else {
    process.stdout.write(JSON.stringify(result, null, 2));
  }
  process.exit(0);
}

// Error — writes plain text to stderr, exits 1
function error(message) {
  process.stderr.write('Error: ' + message + '\n');
  process.exit(1);
}
```

Call sites always pass all three args to `output()`:
```js
output({ slug }, raw, slug);
output({ timestamp }, raw, timestamp);
output({ found: true, phase_number: num }, raw, String(num));
```

---

## `--raw` Flag Pattern

Every command supports `--raw` for plain-text output (consumed by shell scripts). In `bin/grd-tools.js`, `--raw` is stripped from `args` before routing:

```js
const rawIndex = args.indexOf('--raw');
const raw = rawIndex !== -1;
if (rawIndex !== -1) args.splice(rawIndex, 1);
```

JSON mode (default): full pretty-printed JSON object to stdout.
Raw mode (`--raw`): plain text value only.

---

## Error Handling Pattern

**Catch-all at CLI entry point** (`bin/grd-tools.js`):
```js
try {
  routeCommand(command, args, cwd, raw);
} catch (e) {
  if (e && e.message) error(e.message);
  else throw e;
}
```

**Empty catch for optional reads** (ESLint allows it with `allowEmptyCatch: true`):
```js
try {
  stateRaw = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf-8');
} catch {}
```

**`safeReadFile` for defensive reads:**
```js
function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
```

**Validation helpers throw `Error`** — callers propagate or the top-level catch in `main()` converts to `error()`:
```js
function validatePhaseName(phase) {
  if (typeof phase !== 'string') throw new Error('Phase must be a string');
  if (phase.includes('..')) throw new Error('Phase name must not contain path traversal (..)');
  if (phase.includes('/') || phase.includes('\\'))
    throw new Error('Phase name must not contain directory separators');
  ...
}
```

**Return `{ error: '...' }` objects** when errors should be surfaced as JSON (not process exit):
```js
if (!stateContent) {
  return output({ error: 'STATE.md not found' }, raw, '');
}
```

---

## Unused Variable Convention

ESLint enforces `no-unused-vars`. Prefix unused function args with `_`:

```js
// ESLint config in eslint.config.js:
'no-unused-vars': ['error', {
  argsIgnorePattern: '^_',
  caughtErrors: 'none',
  ignoreRestSiblings: true
}]

// Usage:
function handler(_req, res) { ... }   // _req is unused, prefixed with _
```

`caughtErrors: 'none'` means caught error variables in catch blocks are never flagged.

---

## Validation Helpers (Security-Critical)

All input validation is centralized in `lib/utils.js`. These throw on invalid input:

- `validatePhaseArg(val)` — phase number from CLI, e.g. `'1'`, `'02.1'`, `'01-security'`
- `validateFileArg(filePath, cwd)` — prevents path traversal out of project dir
- `validateSubcommand(sub, validList, parentCmd)` — whitelist enforcement
- `validateGitRef(ref)` — prevents flag injection and path traversal in git refs
- `validatePhaseName(phase)` — low-level format check (no `..`, no `/`, no null bytes)
- `validateFilePath(filePath, cwd)` — `path.resolve` check that path stays within cwd

`bin/grd-tools.js` uses `validatePhaseArg`, `validateFileArg`, `validateSubcommand`, `validateGitRef` at routing time.

---

## Git Security Pattern

`execGit()` in `lib/utils.js` enforces a whitelist/blocklist for git operations:

```js
const GIT_ALLOWED_COMMANDS = new Set(['add','commit','log','status','diff', ...]);
const GIT_BLOCKED_COMMANDS = new Set(['config','push','clean']);
const GIT_BLOCKED_FLAGS   = new Set(['--force','-f','--hard','--delete','-D']);

function execGit(cwd, args, opts = {}) {
  const subcommand = args[0];
  if (GIT_BLOCKED_COMMANDS.has(subcommand) && !opts.allowBlocked) {
    return { exitCode: 1, stdout: '', stderr: 'Blocked: ...' };
  }
  // ... flag check ...
}
```

Pass `{ allowBlocked: true }` only when explicitly bypassing security policy.

---

## Config Loading Pattern

Always call `loadConfig(cwd)` from `lib/utils.js` — never read `config.json` inline:

```js
function cmdSomething(cwd, raw) {
  const config = loadConfig(cwd);
  const profile = config.model_profile || 'balanced';
  ...
}
```

`loadConfig` returns a full merged object with defaults (never throws). Supports both flat keys (`model_profile`) and nested legacy keys (e.g., `{ section: 'code_review', field: 'enabled' }`).

---

## Path Resolution Pattern

Use `lib/paths.js` functions instead of constructing planning paths manually:

```js
const { phasesDir, phaseDir, currentMilestone, milestonesDir, todosDir } = require('./paths');

// Usage:
const dir = phasesDir(cwd);              // .planning/milestones/{milestone}/phases/
const pd  = phaseDir(cwd, '01-test');    // .planning/milestones/{milestone}/phases/01-test/
const ms  = milestonesDir(cwd);          // .planning/milestones/
const td  = todosDir(cwd);               // .planning/milestones/{milestone}/todos/
```

All path operations use `path.join()` — never string concatenation.

---

## Code Organization Within Files

Standard file structure (all `lib/` modules follow this):
1. File-level JSDoc block
2. `require()` statements (built-ins first, then local `lib/` imports)
3. Module-level constants (SCREAMING_SNAKE_CASE)
4. Internal helpers (not exported)
5. Exported `cmd*` functions, grouped by feature area with section separators
6. `module.exports = { ... }` at the bottom

---

## Variable Naming Summary

| Scope | Convention | Example |
|-------|-----------|---------|
| Local variables | camelCase | `configPath`, `stateRaw` |
| Module-level constants | SCREAMING_SNAKE_CASE | `MODEL_PROFILES`, `GIT_BLOCKED_FLAGS` |
| Config keys | snake_case | `model_profile`, `commit_docs` |
| CLI flags | kebab-case | `--stopped-at`, `--phase`, `--raw` |
| File names | kebab-case | `grd-tools.js`, `long-term-roadmap.js` |
| CLI commands | kebab-case | `advance-plan`, `get-phase`, `record-metric` |

---

## Prettier Configuration

Prettier is applied to `bin/`, `lib/`, `tests/`, `jest.config.js`. No config file — uses Prettier defaults:
- Single quotes
- Trailing commas (ES5 mode)
- Semicolons
- 80-character print width

`npm run format` applies formatting. `npm run format:check` is CI-safe (no writes).

---

## ESLint Configuration

Defined in `eslint.config.js` as flat config:
- Extends `@eslint/js` recommended
- `ecmaVersion: 2022`
- Globals: `node` + `jest`
- Custom rules:
  - `no-unused-vars`: error with `argsIgnorePattern: '^_'`, `caughtErrors: 'none'`
  - `no-constant-condition`: error except in loops (`checkLoops: false`)
  - `no-empty`: error but `allowEmptyCatch: true`

Lint scope: `bin/` and `lib/` only. Run with `npm run lint`.

---

*Convention analysis: 2026-02-20*
