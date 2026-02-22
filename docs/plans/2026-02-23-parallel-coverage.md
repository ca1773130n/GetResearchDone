# Improve Test Coverage for lib/parallel.js

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Raise `lib/parallel.js` line coverage from 85% to ≥90% by covering three currently untested code paths.

**Architecture:** Add targeted tests to `tests/unit/parallel.test.js`. No source changes. Three unreachable paths exist because all current tests either set `autonomous_mode: true` (bypassing gates) or always write valid roadmaps — leaving the gate-failure branch, the empty-roadmap branch, and the gate-warnings branch unexecuted.

**Tech Stack:** Node.js, Jest, CommonJS. Test helpers: `captureOutput` (setup.js), `createFixtureDir` / `cleanupFixtureDir` (fixtures.js).

---

## Background: Uncovered Lines

Run `npx jest tests/unit/parallel.test.js --coverage` to confirm current state.

Three branches in `cmdInitExecuteParallel` (`lib/parallel.js`) are never hit:

| Lines | Code | Why never hit |
|-------|------|---------------|
| 165–167 | `gate_failed: true` block | Every test sets `autonomous_mode: true` or gates pass |
| 173–174 | roadmap empty/error block | Every test writes a valid ROADMAP with phases |
| 218–219 | `gate_warnings` block | No real gate check produces `severity: 'warning'` |

---

## Task 1 — Gate Failure Path (lines 165–167)

**Files:**
- Modify: `tests/unit/parallel.test.js`

**Step 1: Write the failing test**

Append inside the existing `describe('cmdInitExecuteParallel error paths', ...)` block
(after line 968, before the closing `}`):

```javascript
test('returns gate_failed when preflight gate finds phase with no plans', () => {
  fixtureDir = createFixtureDir();

  // Write a ROADMAP with one phase that maps to disk
  fs.writeFileSync(
    path.join(fixtureDir, '.planning', 'ROADMAP.md'),
    [
      '# Roadmap',
      '',
      '## v1.0: Foundation',
      '',
      '### Phase 3: Empty Phase',
      '**Depends on:** Nothing',
    ].join('\n'),
    'utf-8'
  );

  // Create the phase directory but leave it empty (no PLAN.md files)
  const emptyPhaseDir = path.join(
    fixtureDir,
    '.planning',
    'milestones',
    'anonymous',
    'phases',
    '03-empty-phase'
  );
  fs.mkdirSync(emptyPhaseDir, { recursive: true });
  fs.writeFileSync(path.join(emptyPhaseDir, 'README.md'), '# placeholder\n');

  // Default fixture has autonomous_mode: false — gates will run and fail
  // (checkPhaseHasPlans finds the dir but zero PLAN.md files → PHASE_NO_PLANS error)
  const { stdout, exitCode } = captureOutput(() =>
    cmdInitExecuteParallel(fixtureDir, ['3'], new Set(), false)
  );
  expect(exitCode).toBe(0);
  const result = JSON.parse(stdout);
  expect(result.gate_failed).toBe(true);
  expect(result.gate_errors).toBeInstanceOf(Array);
  expect(result.gate_errors.length).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

```
npx jest tests/unit/parallel.test.js -t "returns gate_failed when preflight gate" -v
```

Expected: FAIL — `gate_failed` is not `true` (gate passes today)

**Step 3: Verify test passes with current source**

The source already has this logic at lines 165–167. Re-run:

```
npx jest tests/unit/parallel.test.js -t "returns gate_failed" -v
```

If the test passes immediately, the path was already exercised. If it fails, double-check the roadmap format and phase directory path match what `checkPhaseHasPlans` expects (`normalizePhaseName('3')` → `'03'`, looks for dirs starting with `'03'`).

**Step 4: Run full test suite for parallel.js**

```
npx jest tests/unit/parallel.test.js --coverage
```

Expected: No regressions; coverage increases.

**Step 5: Commit**

```bash
git add tests/unit/parallel.test.js
git commit -m "test(parallel): cover gate failure path in cmdInitExecuteParallel"
```

---

## Task 2 — Roadmap Empty/Error Path (lines 173–174)

**Files:**
- Modify: `tests/unit/parallel.test.js`

**Step 1: Write the failing test**

Append inside the same `cmdInitExecuteParallel error paths` describe block:

```javascript
test('returns error when ROADMAP.md has no phase entries', () => {
  fixtureDir = createFixtureDir();

  // Overwrite ROADMAP.md with content that has no ### Phase N: headers
  fs.writeFileSync(
    path.join(fixtureDir, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\nNo phases defined yet.\n',
    'utf-8'
  );

  // autonomous_mode: true so gates pass quickly (no ROADMAP phases = no orphan violations)
  const configPath = path.join(fixtureDir, '.planning', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  fs.writeFileSync(configPath, JSON.stringify({ ...config, autonomous_mode: true }, null, 2));

  const { stdout, exitCode } = captureOutput(() =>
    cmdInitExecuteParallel(fixtureDir, ['1'], new Set(), false)
  );
  expect(exitCode).toBe(0);
  const result = JSON.parse(stdout);
  expect(result.error).toBeTruthy();
  expect(result.error).toMatch(/not found or empty/i);
});
```

**Step 2: Run test to verify it fails**

```
npx jest tests/unit/parallel.test.js -t "returns error when ROADMAP" -v
```

Expected: FAIL

**Step 3: Verify test passes**

The source at line 173 outputs `{ error: roadmapResult.error || 'ROADMAP.md not found or empty' }`. The test assertion (`/not found or empty/i`) matches.

```
npx jest tests/unit/parallel.test.js -t "returns error when ROADMAP" -v
```

Expected: PASS

**Step 4: Run full test suite**

```
npx jest tests/unit/parallel.test.js --coverage
```

Expected: coverage now ≥90% lines.

**Step 5: Commit**

```bash
git add tests/unit/parallel.test.js
git commit -m "test(parallel): cover empty roadmap path in cmdInitExecuteParallel"
```

---

## Task 3 — Gate Warnings Path (lines 218–219) *(optional)*

Only needed if Tasks 1 + 2 do not push lines coverage to ≥90%.

**Why it's tricky:** `parallel.js` uses destructured import (`const { runPreflightGates } = require('./gates')`). A standard `jest.spyOn` on the `gates` module won't intercept the local binding. The clean approach is a dedicated test file that uses `jest.mock` before `require`-ing the module under test.

**Files:**
- Create: `tests/unit/parallel-gate-warnings.test.js`

**Step 1: Write the failing test (new file)**

```javascript
'use strict';

// Must call jest.mock BEFORE requiring the module under test so the
// factory is injected into parallel.js's require('./gates') call.
jest.mock('../../lib/gates', () => ({
  runPreflightGates: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const { captureOutput } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');
const { cmdInitExecuteParallel } = require('../../lib/parallel');
const gates = require('../../lib/gates');

describe('cmdInitExecuteParallel — gate warnings injected', () => {
  let fixtureDir;

  afterEach(() => {
    if (fixtureDir) {
      cleanupFixtureDir(fixtureDir);
      fixtureDir = null;
    }
    jest.resetAllMocks();
  });

  function writeIndependentRoadmapAndPhases(dir) {
    fs.writeFileSync(
      path.join(dir, '.planning', 'ROADMAP.md'),
      [
        '# Roadmap',
        '',
        '## v1.0: Foundation',
        '',
        '### Phase 1: Alpha',
        '**Depends on:** Nothing',
      ].join('\n'),
      'utf-8'
    );
    const phaseDir = path.join(
      dir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-alpha'
    );
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '---\nphase: 01\nplan: 01\n---\n');
  }

  test('context includes gate_warnings when gates return warnings', () => {
    fixtureDir = createFixtureDir();
    writeIndependentRoadmapAndPhases(fixtureDir);

    // Inject a passing result that includes a warning
    gates.runPreflightGates.mockReturnValue({
      passed: true,
      bypassed: false,
      errors: [],
      warnings: [{ code: 'TEST_WARN', severity: 'warning', message: 'advisory notice' }],
    });

    const { stdout, exitCode } = captureOutput(() =>
      cmdInitExecuteParallel(fixtureDir, ['1'], new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.gate_warnings).toBeInstanceOf(Array);
    expect(result.gate_warnings.length).toBe(1);
    expect(result.gate_warnings[0].code).toBe('TEST_WARN');
  });
});
```

**Step 2: Run test to verify it fails**

```
npx jest tests/unit/parallel-gate-warnings.test.js -v
```

Expected: FAIL (gate_warnings not in result)

**Step 3: Verify test passes**

The mock is injected at require time, so `parallel.js`'s local `runPreflightGates` binding receives the mocked function.

```
npx jest tests/unit/parallel-gate-warnings.test.js -v
```

Expected: PASS

**Step 4: Run full coverage**

```
npx jest --coverage
```

Verify `lib/parallel.js` is ≥90% lines with no regressions in other modules.

**Step 5: Commit**

```bash
git add tests/unit/parallel-gate-warnings.test.js
git commit -m "test(parallel): cover gate_warnings injection path via mock"
```

---

## Verification

After all tasks:

```
npx jest tests/unit/parallel.test.js tests/unit/parallel-gate-warnings.test.js --coverage
```

Check the coverage table for `lib/parallel.js`:
- **Lines:** ≥90%
- **Functions:** 100% (already met)
- **Branches:** ≥80% (already met)

Then update `jest.config.js` to raise the threshold:

```javascript
'./lib/parallel.js': { lines: 90, functions: 100, branches: 80 },
```

Run `npm test` to confirm all 1,600+ tests pass and coverage thresholds are met.
