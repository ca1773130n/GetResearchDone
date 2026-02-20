# Testing

**Analysis Date:** 2026-02-20

## Framework and Configuration

**Framework:** Jest 30.x (`jest` in devDependencies)

**Config file:** `jest.config.js` at project root

```js
module.exports = {
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['lib/**/*.js'],
  coverageDirectory: 'coverage',
  coverageThreshold: { ... },  // per-file thresholds (see below)
  testTimeout: 15000,          // 15 seconds per test
};
```

**Test scripts in `package.json`:**
```json
"test":            "jest --coverage",
"test:unit":       "jest tests/unit/ --coverage",
"test:integration": "jest tests/integration/",
"test:watch":      "jest --watch"
```

**Single file:** `npx jest tests/unit/state.test.js`
**Single test:** `npx jest -t "should parse frontmatter"`

---

## Test Directory Organization

```
tests/
├── unit/              # One file per lib/ module (32 test files)
│   ├── state.test.js
│   ├── commands.test.js
│   ├── cleanup.test.js
│   ├── roadmap.test.js
│   ├── roadmap-roundtrip.test.js
│   ├── phase.test.js
│   ├── verify.test.js
│   ├── frontmatter.test.js
│   ├── context.test.js
│   ├── context-backend-compat.test.js
│   ├── backend.test.js
│   ├── backend-real-env.test.js
│   ├── utils.test.js
│   ├── validation.test.js
│   ├── tracker.test.js
│   ├── paths.test.js
│   ├── worktree.test.js
│   ├── parallel.test.js
│   ├── scaffold.test.js
│   ├── mcp-server.test.js
│   ├── gates.test.js
│   ├── long-term-roadmap.test.js
│   ├── deps.test.js
│   ├── cleanup-noninterference.test.js
│   ├── coverage-gaps.test.js
│   ├── setup.test.js
│   └── postinstall.test.js
├── integration/
│   ├── cli.test.js               # End-to-end CLI via execFileSync
│   ├── e2e-workflow.test.js      # Feature chain integration test
│   ├── golden.test.js            # Golden snapshot comparisons
│   ├── npm-pack.test.js          # npm pack integrity check
│   └── worktree-parallel-e2e.test.js
├── helpers/
│   ├── fixtures.js               # createFixtureDir, cleanupFixtureDir
│   └── setup.js                  # captureOutput, captureError
├── fixtures/
│   └── planning/                 # Complete .planning/ fixture tree
│       ├── config.json
│       ├── STATE.md
│       ├── ROADMAP.md
│       ├── REQUIREMENTS.md
│       └── milestones/
│           └── anonymous/
│               ├── phases/
│               │   ├── 01-test/01-01-PLAN.md
│               │   ├── 01-test/01-01-SUMMARY.md
│               │   └── 02-build/02-01-PLAN.md
│               └── todos/
│                   └── pending/sample.md
└── golden/
    ├── capture.sh                # Script to regenerate golden outputs
    ├── output/                   # JSON/text snapshots (~50+ files)
    └── README.md
```

**Mapping rule:** `lib/{module}.js` → `tests/unit/{module}.test.js`. This 1:1 mapping is enforced by the per-file coverage thresholds in `jest.config.js`.

---

## Test Naming Conventions

**Top-level `describe` block** names the function under test:
```js
describe('stateExtractField', () => { ... });
describe('cmdStateLoad', () => { ... });
describe('cmdStatePatch', () => { ... });
```

**Individual tests** use `test()` (not `it()`) with natural-language descriptions:
```js
test('extracts Active phase field', () => { ... });
test('returns null for non-existent field', () => { ... });
test('updates STATE.md on disk', () => { ... });
test('persists changes to disk', () => { ... });
test('requires phase, plan, and duration', () => { ... });
```

**Nested `describe` for validation suites** (in `tests/unit/validation.test.js`):
```js
describe('validatePhaseArg', () => {
  describe('valid inputs', () => {
    test.each(['1', '01', '02', '10', '99'])('accepts simple number "%s"', (val) => { ... });
  });
  describe('missing inputs', () => {
    test('null throws "Phase number is required"', () => { ... });
  });
  describe('invalid formats', () => { ... });
});
```

---

## Unit Test Pattern

Unit tests import functions directly from `lib/` (not via the CLI binary) and use `captureOutput`/`captureError` to capture `process.stdout` and `process.exit` calls.

**Standard unit test structure:**
```js
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');
const { cmdStateLoad, cmdStatePatch } = require('../../lib/state');

describe('cmdStatePatch', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();   // fresh tmp copy per test
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);     // cleanup
  });

  test('updates fields in STATE.md', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStatePatch(fixtureDir, { 'Active phase': '2 (02-build)' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.updated).toContain('Active phase');
  });

  test('persists changes to disk', () => {
    captureOutput(() => {
      cmdStatePatch(fixtureDir, { 'Active phase': '3 (03-deploy)' }, false);
    });
    const content = fs.readFileSync(
      path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8'
    );
    expect(content).toContain('**Active phase:** 3 (03-deploy)');
  });
});
```

**Read-only tests use `beforeAll`/`afterAll` (shared fixture):**
```js
describe('cmdStateLoad', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns JSON with config, state, roadmap keys', () => { ... });
});
```

**Mutating tests use `beforeEach`/`afterEach` (isolated fixture per test):**
```js
describe('cmdStatePatch', () => {
  let fixtureDir;

  beforeEach(() => { fixtureDir = createFixtureDir(); });
  afterEach(() => { cleanupFixtureDir(fixtureDir); });
  ...
});
```

---

## `captureOutput` / `captureError` Pattern

`tests/helpers/setup.js` provides two utilities for testing `cmd*` functions that call `process.exit()`:

```js
const EXIT_SENTINEL = '__GRD_TEST_EXIT__';

// Capture stdout and exit code from a cmd* function
function captureOutput(fn) {
  let captured = '';
  let exitCode = null;

  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    if (exitCode === null) exitCode = code;
    const err = new Error(EXIT_SENTINEL);
    err.__EXIT__ = true;
    err.code = code;
    throw err;
  });

  const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((data) => {
    captured += data;
    return true;
  });

  try {
    fn();
  } catch (e) {
    if (e && e.__EXIT__) { /* expected */ }
    else { writeSpy.mockRestore(); exitSpy.mockRestore(); throw e; }
  } finally {
    writeSpy.mockRestore();
    exitSpy.mockRestore();
  }

  return { stdout: captured, exitCode: exitCode ?? 0 };
}

// Same pattern for stderr (error paths):
function captureError(fn) { ... }
// Returns: { stderr: captured, exitCode: exitCode ?? 1 }
```

Usage:
```js
const { stdout, exitCode } = captureOutput(() => {
  cmdStateLoad(fixtureDir, false);
});
expect(exitCode).toBe(0);
const parsed = JSON.parse(stdout);
```

---

## Fixture System

**`tests/helpers/fixtures.js`** manages temp directories with the `.planning/` structure:

```js
const FIXTURE_SOURCE = path.join(__dirname, '..', 'fixtures', 'planning');

function createFixtureDir() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-test-'));
  const dest = path.join(tmpRoot, '.planning');
  fs.cpSync(FIXTURE_SOURCE, dest, { recursive: true });
  return tmpRoot;   // returns project root (not .planning/)
}

function cleanupFixtureDir(dir) {
  if (!dir || !dir.startsWith(os.tmpdir())) {
    throw new Error('Refusing to remove directory outside of tmpdir: ' + dir);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
```

The fixture at `tests/fixtures/planning/` contains:
- `config.json` — valid balanced config
- `STATE.md` — state with phase 1 in progress
- `ROADMAP.md` — 2-phase roadmap
- `REQUIREMENTS.md`
- `milestones/anonymous/phases/01-test/01-01-PLAN.md` — complete plan with frontmatter
- `milestones/anonymous/phases/01-test/01-01-SUMMARY.md` — completed summary
- `milestones/anonymous/phases/02-build/02-01-PLAN.md` — incomplete phase (no summary)
- `milestones/anonymous/todos/pending/sample.md`

**Tests that need custom STATE.md content** mutate the fixture after `createFixtureDir()`:
```js
beforeEach(() => {
  fixtureDir = createFixtureDir();
  const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
  let content = fs.readFileSync(statePath, 'utf-8');
  content = content.replace('## Key Decisions', '## Decisions Made');
  fs.writeFileSync(statePath, content, 'utf-8');
});
```

---

## Integration Test Pattern (CLI Spawning)

`tests/integration/cli.test.js` spawns real CLI processes via `execFileSync`:

```js
const GRD_TOOLS = path.resolve(__dirname, '../../bin/grd-tools.js');

function runCLI(args, cwd) {
  try {
    const stdout = execFileSync('node', [GRD_TOOLS, ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 15000,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status || 1,
    };
  }
}
```

Integration test groups use `describe()` blocks by command category:
```js
describe('state commands', () => { ... });
describe('verify commands', () => { ... });
describe('phase commands', () => { ... });
describe('mutating state commands', () => { ... });   // isolated dir per test
describe('git-dependent commands', () => { ... });    // creates real git repo
```

**Read-only tests** share one `fixtureDir` via top-level `beforeAll`/`afterAll`.
**Mutating tests** create a fresh dir per test via `beforeEach`/`afterEach`:
```js
describe('mutating state commands', () => {
  let mutDir;

  beforeEach(() => { mutDir = createTestDir(); });
  afterEach(() => { cleanupDir(mutDir); });

  test('state patch returns update result', () => {
    const { stdout, exitCode } = runCLI(['state', 'patch', '--phase', '1'], mutDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('updated');
  });
});
```

**Git-dependent tests** initialize a real git repo:
```js
describe('git-dependent commands', () => {
  let gitDir;

  beforeEach(() => {
    gitDir = createTestDir();
    execFileSync('git', ['init', '-q'], { cwd: gitDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: gitDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: gitDir });
    execFileSync('git', ['add', '-A'], { cwd: gitDir });
    execFileSync('git', ['commit', '-q', '-m', 'Initial commit'], { cwd: gitDir });
  });
  ...
});
```

---

## Golden Snapshot Test Pattern

`tests/integration/golden.test.js` compares CLI output against pre-captured reference files in `tests/golden/output/`.

**Capturing golden files** — run `bash tests/golden/capture.sh` to regenerate. The script creates a temp fixture dir, runs each command, and saves output to `tests/golden/output/{name}.json` or `.txt`.

**Golden command mapping** (`GOLDEN_COMMANDS` in `golden.test.js`):
```js
const GOLDEN_COMMANDS = {
  'resolve-model.json':     { args: ['resolve-model', 'grd-executor'], exactKeys: true },
  'generate-slug.json':     { args: ['generate-slug', 'Hello World Test'], exactKeys: true },
  'current-timestamp.txt':  { args: ['current-timestamp', '--raw'], exactKeys: false },
  'state-load.json':        { args: ['state'], exactKeys: true },
  'state-snapshot.json':    { args: ['state-snapshot'], exactKeys: true },
  'find-phase.json':        { args: ['find-phase', '1'], exactKeys: true },
  // ...
};
```

**`exactKeys: true`**: Golden and actual must have identical top-level keys. Values are compared after normalization (timestamps replaced with `'TIMESTAMP'`).

**`exactKeys: false`**: Relaxed comparison — both must be valid JSON objects with at least one key. Used when the golden was captured from a different project state than the fixture.

**Structural integrity tests** verify golden files themselves are valid and have expected fields:
```js
test('all golden JSON files contain valid JSON', () => {
  for (const file of jsonFiles) {
    expect(() => JSON.parse(content)).not.toThrow();
  }
});
```

---

## `parseFirstJson` Utility Pattern

Some `cmd*` functions have try/catch that can produce concatenated JSON output (two `output()` calls in error paths). Tests handle this with `parseFirstJson`:

```js
function parseFirstJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    // Walk string char by char to find end of first JSON object by brace depth
    let depth = 0, inString = false, escape = false;
    for (let i = 0; i < str.length; i++) {
      // ... brace counting logic ...
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) return JSON.parse(str.slice(0, i + 1));
      }
    }
  }
}
```

Used in `tests/unit/state.test.js` and `tests/unit/commands.test.js`.

---

## Coverage Thresholds

Per-file thresholds are enforced in `jest.config.js`. **Do not lower them.** Current thresholds:

| File | Lines | Functions | Branches |
|------|-------|-----------|---------|
| `lib/utils.js` | 85% | 90% | 65% |
| `lib/state.js` | 83% | 85% | 65% |
| `lib/commands.js` | 80% | 90% | 60% |
| `lib/phase.js` | 80% | 85% | 60% |
| `lib/roadmap.js` | 80% | 80% | 60% |
| `lib/mcp-server.js` | 80% | 80% | 60% |
| `lib/scaffold.js` | 75% | 100% | 55% |
| `lib/verify.js` | 75% | 90% | 50% |
| `lib/context.js` | 70% | 60% | 60% |
| `lib/frontmatter.js` | 65% | 80% | 55% |
| `lib/backend.js` | 90% | 100% | 90% |
| `lib/paths.js` | 90% | 100% | 85% |
| `lib/tracker.js` | 30% | 35% | 30% |

Coverage is collected from `lib/**/*.js` only. Run `npm test` (which includes `--coverage`) to enforce.

**`tests/unit/coverage-gaps.test.js`** specifically targets branches not covered by primary tests — add tests there rather than lowering thresholds.

---

## Pre-commit Hook

`.git/hooks/pre-commit` runs lint before every commit:
```sh
#!/bin/sh
npm run lint
if [ $? -ne 0 ]; then
  echo ""
  echo "ERROR: Lint failed. Fix errors before committing."
  exit 1
fi
```

Commits fail if ESLint reports errors in `bin/` or `lib/`. Tests are NOT run in the pre-commit hook — only lint.

---

## Mocking Patterns

**`jest.spyOn` for process methods** (in `tests/helpers/setup.js`):
```js
jest.spyOn(process, 'exit').mockImplementation((code) => { ... throw err; });
jest.spyOn(process.stdout, 'write').mockImplementation((data) => { captured += data; return true; });
jest.spyOn(process.stderr, 'write').mockImplementation((data) => { captured += data; return true; });
```

Always call `.mockRestore()` in `finally` blocks.

**Manual module isolation for environment-dependent tests** (`tests/unit/backend-real-env.test.js`) — tests that read actual environment variables run in isolation.

**`clearModelCache()`** from `lib/backend` — called in `beforeEach` or `beforeAll` when tests touch model resolution, to prevent cache bleed between tests:
```js
const { clearModelCache } = require('../../lib/backend');

beforeEach(() => {
  clearModelCache();
});
```

---

## E2E Workflow Test Pattern

`tests/integration/e2e-workflow.test.js` imports modules directly (not CLI) and tests feature chains:

```js
describe('E2E: Backend detection', () => {
  const { detectBackend, getBackendCapabilities } = require('../../lib/backend');

  test('detectBackend returns a valid backend string', () => {
    const backend = detectBackend(fixtureDir);
    expect(['claude-code', 'opencode', 'unknown']).toContain(backend);
  });
});
```

This file tests version-specific feature interactions — it documents that the feature chain works end-to-end, not just each function in isolation.

---

## Test Helper — `createTempDir` (cleanup.test.js)

For tests that need custom config without the full fixture, `cleanup.test.js` uses a minimal temp dir:

```js
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-cleanup-test-'));
}

function removeTempDir(dir) {
  if (!dir || !dir.startsWith(os.tmpdir())) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeConfig(dir, configObj) {
  const planningDir = path.join(dir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(configObj));
}
```

Use `createTempDir` + `writeConfig` when you need a specific config shape. Use `createFixtureDir` when you need the full `.planning/` structure.

---

## Test Timeout

Global timeout is 15 seconds per test (configured in `jest.config.js`). Integration tests that spawn CLI processes or create git repos may approach this limit under load.

---

## Adding New Tests

**For a new `lib/` module** (`lib/foo.js`):
1. Create `tests/unit/foo.test.js`
2. Import functions directly from `../../lib/foo`
3. Use `captureOutput`/`captureError` for `cmd*` functions
4. Use `createFixtureDir`/`cleanupFixtureDir` for filesystem tests
5. Add coverage threshold for `./lib/foo.js` in `jest.config.js`

**For a new CLI command** (integration):
1. Add test to the appropriate `describe` block in `tests/integration/cli.test.js`
2. Use `runCLI(args, cwd)` and `parseJSON(stdout)`
3. Use `mutDir` pattern (fresh dir per test) if command mutates state

**For golden snapshots:**
1. Add entry to `GOLDEN_COMMANDS` in `tests/integration/golden.test.js`
2. Run `bash tests/golden/capture.sh` to generate the golden file
3. Commit the generated file in `tests/golden/output/`

---

*Testing analysis: 2026-02-20*
