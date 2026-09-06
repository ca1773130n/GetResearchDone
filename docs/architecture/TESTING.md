# Testing Architecture

How to run, read, and add tests in GRD.

## Test Layout

```
tests/
  unit/           # 139 files — one per lib/ module (mostly)
    research/     #  43 files — autoresearch loop (lib/research/)
    scan/         #   7 files — scan subsystem unit tests
    cli/          #   5 files — CLI adapter/output/agent/tools tests
    commands/     #   4 files — lib/commands/ subsystem
    agents/       #   1 file  — agent-definition shell assertions
  integration/    # 27 files — multi-module and CLI end-to-end tests
    cli/          #   1 file  — gd CLI integration
  helpers/        #  2 files — shared utilities
    setup.ts      # captureOutput/captureError capture helpers
    fixtures.ts   # createFixtureDir / cleanupFixtureDir helpers
  fixtures/
    planning/     # Static fixture .planning/ tree (STATE.md, ROADMAP.md, config.json, etc.)
    scan/         # Static fixture files for scan tests
    research-threads/  # Fixture threads for autoresearch tests
  conformance/    # kernel-contract.json — the autoresearch-core kernel contract
  python/         # unittest suites for bin/harness_driver.py + the vendored kernel (NOT run by jest)
  golden/         # capture.sh + recorded CLI output for golden comparisons
  benchmark/      # Standalone before/after task fixtures — excluded via testPathIgnorePatterns
```

The convention is strict: `lib/state.ts` gets `tests/unit/state.test.ts`. Modules with their own subdirectory (e.g., `lib/wireup/`) get a cluster of related unit tests (`wireup.test.ts`, `wireup-state.test.ts`, `wireup-discovery.test.ts`, `wireup-scenarios.test.ts`). The `tests/unit/scan/`, `tests/unit/cli/`, `tests/unit/commands/` and `tests/unit/research/` subtrees mirror the matching `lib/` subdirectories.

**Test counts:**

| Suite | Files | Notes |
|-------|-------|-------|
| Unit | 139 | Includes the `research/`, `scan/`, `cli/`, `commands/` and `agents/` subdirs |
| Integration | 27 | Includes `cli/` subdir |
| Helpers | 2 | Shared utilities, not test files themselves |

That is 166 jest suites carrying roughly 5,700 test cases (a clean run on 2026-09-06
reported `166 passed, 166 total` suites and `3 skipped, 5728 passed, 5731 total` tests).
Rather than trusting that figure once it ages, get the current one with
`npx jest --listTests | wc -l` for suites and the `Tests:` line at the end of `npm test`.

Note that `tests/python/` is a **`unittest`** suite covering `bin/harness_driver.py` and
the vendored `autoresearch-core` kernel. Jest's `testMatch` only picks up `*.test.ts` /
`*.test.js`, so `npm test` never runs it. Invoke it separately when touching the harness
driver or the vendored kernel:

```bash
python3 -m unittest discover -s tests/python -t tests/python
```

`tests/unit/research/kernel-contract.test.ts` and `tests/python/test_kernel_contract.py`
assert the *same* fixtures in `tests/conformance/kernel-contract.json` from both
languages, so a kernel change that only satisfies one side is a real failure — run both.

## Running Tests

```bash
# Full suite with coverage — the same command release.yml runs
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

**Typical run times:** The full suite takes roughly **five and a half minutes** on a modern laptop (327 s without coverage on 2026-09-06); expect longer with `--coverage`. `tests/unit/autopilot.test.ts` is effectively the critical path — it alone took 327 s of that 327 s, so the other 165 suites finish inside its shadow. `tests/unit/worktree.test.ts` (~105 s) is next. Both spin up real subprocesses and git worktrees. The per-test timeout is **15 seconds** (set in `jest.config.js`).

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

### Temp-directory hygiene — the suite leaks, and it leaks into `$TMPDIR`

Every `mkdtempSync` call in the tree resolves through `os.tmpdir()`, so temp dirs land in
the OS temp directory and **not** in the repo — the `grd-*/` entries in `.gitignore` are
leftovers from an older arrangement, not a live hazard. (Verified: a full run leaves the
repository root clean.)

What *is* live is that many suites never clean up. A single full `npm test` on 2026-09-06
left **396 `grd-*` directories totalling 69 MB** in `$TMPDIR`, across some three dozen
prefixes (`grd-orch-`, `grd-docker-`, `grd-promote-`, `grd-tess-`, …). Nothing removes
them, so they accumulate run over run until the OS or the user clears the temp directory.

Two practical consequences:

- If you are iterating on the suite, point `TMPDIR` somewhere disposable
  (`TMPDIR=/tmp/grd-testrun npm test`) so one `rm -rf` cleans up after you.
- If you are adding a test that calls `mkdtempSync`, register the cleanup —
  `afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))` — rather than adding
  to the pile. The shared `cleanupFixtureDir()` already does this; the inline
  `makeTempProject()` pattern only does it if you write it.

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

- **Real subprocess integration tests** (worktree isolation, autopilot runs, backend spawning) require wall-clock seconds per test and dominate the suite's runtime — `tests/unit/worktree.test.ts` alone takes over 100 seconds. They are not segregated into a separate job any more (there is no CI to segregate them into); `npm run test:integration` runs `tests/integration/` without coverage enforcement if you need to skip them locally.
- **No end-to-end with real `claude -p`:** The full GRD autopilot loop requires a live Claude CLI session. These tests are non-deterministic and too slow for CI. The scheduler's subprocess-spawning path is tested only up to the point where the real binary would be exec'd.
- **MCP server transport layer:** `lib/mcp-server.ts`'s low branch threshold (55) reflects that stdin/stdout transport paths are not easily driven from Jest without a real MCP client.
- **`lib/scan/` injection patterns:** Prompt injection detection heuristics are tested with real fixture files in `tests/fixtures/scan/` and `tests/unit/scan/`. Coverage is high for the detection logic but intentionally excludes some adversarial edge cases that are documented separately in the scan subsystem.

## CI Considerations

**There is no push or pull-request CI.** `.github/workflows/ci.yml` was deleted in
`3bb573a` ("remove ci.yml during autoresearch development phase") and has not been
restored. The only workflows in the repository are:

| Workflow | Trigger | What it runs |
|---|---|---|
| `release.yml` | `workflow_dispatch` only | Version-consistency gate, then `npm test -- --coverageThreshold='{}'`, then a **draft** GitHub release |
| `npm-publish.yml` | `release: published`, or `workflow_dispatch` | `npm ci` + `npm publish` over OIDC trusted publishing |

Two consequences worth internalising:

- **Nothing checks your branch but you.** Run `npm test`, `npm run lint` and
  `npm run build:check` locally before merging. A red suite will otherwise not surface
  until someone cuts a release, at which point it blocks the release rather than the
  change that broke it. (`npm run format:check` is *not* on that list — Prettier is
  unconfigured and it fails on nearly every file; see `MAINTENANCE.md` Procedure 9.)
- **The release run clears per-file thresholds** (`--coverageThreshold='{}'`), so
  coverage regressions are invisible to it by design — some suites need binaries absent
  on the runner (`claude`, `codex`, `git`) and skip, which would fail thresholds with
  zero test failures. Thresholds are enforced only when *you* run `npm test` or
  `npm run test:unit` locally.

**If a new `lib/` file lowers an existing threshold,** your local `npm test` fails. Fix by either raising test coverage or (only for genuinely hard-to-cover paths) adding a new threshold entry at an appropriate level rather than lowering the existing one.

**Pre-commit hook (optional):** `npm run hooks:install` installs a git pre-commit hook that runs `gd scan` on staged markdown files for prompt-injection patterns. It is not installed by default, it is separate from the Jest test suite, and — with `ci.yml` gone — it is the only place that check runs at all. Suppress known false positives in `.prompt-injection-scanignore`.

See `MAINTENANCE.md` Procedure 8 for the full release and npm-publish procedure.

---

**See also:**
- [OVERVIEW.md](OVERVIEW.md) — Module map and overall codebase structure
- `docs/architecture/MAINTENANCE.md` — Conventions for adding modules and keeping thresholds aligned
- `docs/architecture/RISKS.md` — Known technical risks including test coverage gaps
