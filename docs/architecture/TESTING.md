# Testing Architecture

How to run, read, and add tests in GRD.

## Test Layout

```
tests/
  unit/           # 68 files — one per lib/ module (mostly)
    cli/          #   5 files — CLI adapter/output/agent/tools tests
    scan/         #   7 files — scan subsystem unit tests
  integration/    # 20 files — multi-module and CLI end-to-end tests
    cli/          #   1 file  — gd CLI integration
  helpers/        #  2 files — shared utilities
    setup.ts      # captureOutput/captureError capture helpers
    fixtures.ts   # createFixtureDir / cleanupFixtureDir helpers
  fixtures/
    planning/     # Static fixture .planning/ tree (STATE.md, ROADMAP.md, config.json, etc.)
    scan/         # Static fixture files for scan tests
```

The convention is strict: `lib/state.ts` gets `tests/unit/state.test.ts`. Modules with their own subdirectory (e.g., `lib/wireup/`) get a cluster of related unit tests (`wireup.test.ts`, `wireup-state.test.ts`, `wireup-discovery.test.ts`, `wireup-scenarios.test.ts`). The `tests/unit/scan/` subtree mirrors the `lib/scan/` subdirectory.

**Approximate test counts:**

| Suite | Files | Notes |
|-------|-------|-------|
| Unit | 68 | Includes `cli/` and `scan/` subdirs |
| Integration | 20 | Includes `cli/` subdir |
| Helpers | 2 | Shared utilities, not test files themselves |

Total is approximately 2,800+ individual test cases (the test suite reports ~2,839 tests as of recent runs).

## Running Tests

```bash
# Full suite with coverage (matches CI)
npm test

# Unit tests only with coverage
npm run test:unit

# Integration tests only (no coverage enforcement)
npm run test:integration

# Watch mode during development
npm run test:watch

# Single file
npx jest tests/unit/state.test.ts

# By test name pattern
npx jest -t "should parse frontmatter"

# Scoped coverage — check one lib file in isolation
npx jest --coverage --collectCoverageFrom='lib/scheduler.ts'
```

**Typical run times:** The full `npm test` suite takes 30–60 seconds on a modern laptop. Integration tests that spin up real subprocesses (worktree, autopilot, backend, scheduler) are the slowest and are segregated in CI — see the CI section below. The per-test timeout is **15 seconds** (set in `jest.config.js`).

## Coverage Thresholds

Thresholds live in `jest.config.js` under `coverageThreshold`. There is no global threshold — every `lib/` module that has meaningful coverage has its own per-file entry.

```js
// jest.config.js (excerpt)
coverageThreshold: {
  './lib/state.ts':         { lines: 85, functions: 88, branches: 77 },
  './lib/scheduler-wait.ts':{ lines: 95, functions: 100, branches: 80 },
  './lib/gates.ts':         { lines: 100, functions: 100, branches: 81 },
  // ... one entry per module
}
```

**Pattern:** When you add a new `lib/foo.ts`, add a matching threshold entry. Start conservatively (lines: 80, functions: 85, branches: 70) and tighten once the module is well-tested. The comment in `jest.config.js` explicitly says "DO NOT MODIFY" for existing entries — only add new ones or raise thresholds, never lower them.

**Known accepted misses:** `lib/worktree.ts` carries the lowest thresholds in the file (lines: 74, functions: 80, branches: 66) because its real subprocess integration paths are exercised by the slow integration tests that run in the separate CI job, not by unit tests. Similarly, `lib/mcp-server.ts` has a low branch threshold (55) because the MCP server's subprocess-capture path (`captureExecution`) intentionally intercepts `process.exit` in a way that is difficult to fully branch-cover in unit tests without spawning real processes.

## Test Helpers

### `tests/helpers/setup.ts` — Process Output Capture

The GRD CLI calls `process.exit(0)` on success and `process.exit(1)` on error. Tests cannot let those calls kill the Jest process. `setup.ts` exports four helpers that replace `process.exit` with a sentinel throw, capture stdout/stderr via `process.stdout.write` / `process.stderr.write` spies, then restore everything:

| Helper | Use for |
|--------|---------|
| `captureOutput(fn)` | Synchronous success paths (stdout + exitCode) |
| `captureError(fn)` | Synchronous error paths (stderr + exitCode) |
| `captureOutputAsync(fn)` | Async success paths |
| `captureErrorAsync(fn)` | Async error paths |

All four return `{ stdout/stderr, exitCode }`. The sentinel error is `__GRD_TEST_EXIT__`; any other error is re-thrown after restoring the spies.

```ts
import { captureOutput, captureError } from '../../tests/helpers/setup';

it('prints JSON on success', () => {
  const { stdout, exitCode } = captureOutput(() => cmdProgress(opts));
  expect(exitCode).toBe(0);
  expect(JSON.parse(stdout)).toMatchObject({ phase: 3 });
});
```

### `tests/helpers/fixtures.ts` — Temp Project Directories

`createFixtureDir()` copies the static `tests/fixtures/planning/` tree into a `mkdtempSync` directory and returns the root path. `cleanupFixtureDir(dir)` removes it safely (refuses to remove anything outside `os.tmpdir()`).

```ts
import { createFixtureDir, cleanupFixtureDir } from '../../tests/helpers/fixtures';

let tmpDir: string;
beforeEach(() => { tmpDir = createFixtureDir(); });
afterEach(() => { cleanupFixtureDir(tmpDir); });
```

The fixture tree contains a minimal but complete `.planning/` directory: `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `config.json`, and a `milestones/` hierarchy. Tests that need custom state write additional files into `tmpDir` before calling the module under test.

### `makeTempProject` — Inline Fixture Builder

Many unit test files (phase.test.ts, phase-complete.test.ts, roadmap.test.ts, etc.) define a local `makeTempProject()` function rather than using the shared fixture helper. This inline pattern is preferred when:

- The test needs a very specific fixture shape that differs from the shared baseline.
- The test exercises failure modes (missing phase dir, stripped ROADMAP.md, etc.) that would require modifying a shared fixture.

The pattern is always the same:

```ts
function makeTempProject(opts = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-phase-test-'));
  // Build exactly what the test needs
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), '...');
  return dir;
}
```

A corresponding cleanup call (`fs.rmSync(dir, { recursive: true, force: true })`) is placed in `afterEach`.

## Test Patterns

**TDD-first:** The project follows test-driven development. The expected workflow is: write a failing test, verify it fails, implement, verify it passes. New specs (like Spec 3B) add failing tests in the first commit before touching `lib/`.

**Real fixtures over mocks for filesystem-heavy code:** Tests that exercise `phase-complete`, `roadmap`, `state`, `scaffold`, and similar modules create real temporary directories with `mkdtempSync`. This catches path-resolution bugs, file-encoding issues, and gate logic that would be invisible with mock file objects.

**Fake timers for timing/watchdog tests:** `tests/unit/scheduler-idle-watchdog.test.ts` uses `jest.useFakeTimers()` in `beforeEach` and `jest.useRealTimers()` in `afterEach`. This lets timer-based tests run in microseconds:

```ts
it('fires onIdle after idleTimeoutMs', () => {
  const onIdle = jest.fn();
  const wd = _startIdleWatchdog(2000, onIdle);
  jest.advanceTimersByTime(2500);
  expect(onIdle).toHaveBeenCalledTimes(1);
  wd.stop();
});
```

Note: `tests/unit/scheduler-wait.test.ts` explicitly does NOT use fake timers because `AbortController` event listeners interact poorly with Jest's fake timer implementation. Those tests use real 100ms delays and pass quickly.

**Mocked schedulers for integration tests:** `tests/integration/autoresearch-scheduler.test.ts` creates a `makeFakeScheduler()` that returns a `jest.fn()` implementation of `Scheduler.spawn`. This lets integration tests verify routing logic without spawning real backend subprocesses.

**`jest.mock` for module-level dependencies:** Some tests (e.g., `evolve.test.ts`, `backend.test.ts`) use top-level `jest.mock('../../lib/...')` to replace heavy I/O modules with stubs. `jest.spyOn` is used inline in tests that need to restore the original after verification.

## Adding a New Test

1. **Mirror the module:** Create `tests/unit/foo.test.ts` for `lib/foo.ts`. If `lib/foo.ts` lives in a subdirectory (`lib/evolve/`), put the test in `tests/unit/evolve.test.ts` or a subdirectory following the same naming.

2. **Add a coverage threshold:** After writing initial tests, run `npx jest --coverage --collectCoverageFrom='lib/foo.ts'` to see the real numbers, then add a `'./lib/foo.ts'` entry to `jest.config.js`. Round down slightly from the observed coverage to give room for future changes without constant threshold updates.

3. **Choose fixture strategy:**
   - Pure logic (no filesystem, no subprocesses) — use `jest.fn()` stubs and plain inputs.
   - Filesystem state — use `createFixtureDir()` or an inline `makeTempProject()`.
   - Timing behavior — use `jest.useFakeTimers()`.
   - Subprocess routing — use a fake scheduler (`jest.fn()` implementation of `Scheduler`).

4. **Follow the file header convention:** Every test file starts with `'use strict';` and a JSDoc comment block describing what it tests and any non-obvious fixture requirements.

## Coverage Gaps and Known Limitations

- **Real subprocess integration tests** (worktree isolation, autopilot runs, backend spawning) require wall-clock seconds per test. They live in `tests/integration/` and run in a separate CI job with `--coverageThreshold='{}'` so they do not gate on per-file thresholds.
- **No end-to-end with real `claude -p`:** The full GRD autopilot loop requires a live Claude CLI session. These tests are non-deterministic and too slow for CI. The scheduler's subprocess-spawning path is tested only up to the point where the real binary would be exec'd.
- **MCP server transport layer:** `lib/mcp-server.ts`'s low branch threshold (55) reflects that stdin/stdout transport paths are not easily driven from Jest without a real MCP client.
- **`lib/scan/` injection patterns:** Prompt injection detection heuristics are tested with real fixture files in `tests/fixtures/scan/` and `tests/unit/scan/`. Coverage is high for the detection logic but intentionally excludes some adversarial edge cases that are documented separately in the scan subsystem.

## CI Considerations

CI is defined in `.github/workflows/ci.yml` and runs on Node 18, 20, and 22 in a matrix. The pipeline has four jobs:

| Job | What it runs |
|-----|-------------|
| `lint` | ESLint, tsc type-check, Prettier format check |
| `test-unit` | `npm run test:unit` — fast unit tests with coverage thresholds enforced |
| `test-integration` | Slow tests (worktree, autopilot, backend, integration) — coverage collected but thresholds not enforced (`--coverageThreshold='{}'`) |
| `validate` | `npm pack` install smoke test + MCP server probe + `npm audit` |

There is also a `docs-check` job that runs `npx gd scan --diff origin/main` on every PR to check staged markdown files for prompt injection patterns. This is the same check the optional local pre-commit hook performs.

**If a new `lib/` file lowers an existing threshold,** `test-unit` will fail. Fix by either raising test coverage or (only for genuinely hard-to-cover paths) adding a new threshold entry at an appropriate level rather than lowering the existing one.

**Pre-commit hook (optional):** `npm run hooks:install` installs a git pre-commit hook that runs `gd scan` on staged markdown files. It is not installed by default and is separate from the Jest test suite.

---

**See also:**
- [OVERVIEW.md](OVERVIEW.md) — Module map and overall codebase structure
- `docs/architecture/MAINTENANCE.md` — Conventions for adding modules and keeping thresholds aligned
- `docs/architecture/RISKS.md` — Known technical risks including test coverage gaps
