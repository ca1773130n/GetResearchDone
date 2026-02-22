# commands.js Coverage Improvement Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Raise `lib/commands.js` line coverage from 88% to ≥90% by adding targeted tests for three wholly-untested code paths.

**Architecture:** No production code changes. All work is new test cases in `tests/unit/commands.test.js` plus a threshold bump in `jest.config.js`. The three coverage gaps (cmdSetup, shipped-milestone parsing helpers, and cmdResolveModel non-balanced profiles) together cover ~70 uncovered lines, which is more than the ~61 lines needed to cross 90%.

**Tech Stack:** Jest, CommonJS, `captureOutput`/`captureError` helpers from `tests/helpers/setup.js`, `createFixtureDir`/`cleanupFixtureDir` from `tests/helpers/fixtures.js`.

---

## Coverage Gap Analysis

| Gap | Function(s) | Estimated uncovered lines |
|-----|-------------|--------------------------|
| cmdSetup never imported/tested | `cmdSetup` (lines 2226-2252) | ~25 |
| Shipped milestones never exercised in fixture | `parseDashboardShippedMilestones` (lines 922-951), `makeShippedMilestone` (lines 905-919) | ~38 |
| Non-balanced model profiles | `cmdResolveModel` quality/budget branches (line 468) | ~6 |

**Total new coverage: ~69 lines** (need 61 to reach 90%).

---

### Task 1: Add `cmdSetup` to test file imports

**Files:**
- Modify: `tests/unit/commands.test.js:15-44`

**Step 1: Add `cmdSetup` to the destructured import**

In the `require('../../lib/commands')` destructure at the top of the test file, add `cmdSetup` alongside the existing entries (alphabetical order is conventional but not required):

```js
const {
  // ... existing entries ...
  cmdSearch,
  cmdRequirementUpdateStatus,
  cmdMigrateDirs,
  cmdCoverageReport,
  cmdHealthCheck,
  cmdSetup,        // ← ADD THIS
} = require('../../lib/commands');
```

**Step 2: Run tests to verify nothing breaks yet**

```bash
npx jest tests/unit/commands.test.js --coverage 2>&1 | tail -20
```

Expected: all existing tests pass; `cmdSetup` shows 0% coverage.

**Step 3: Commit**

```bash
git add tests/unit/commands.test.js
git commit -m "test(commands): import cmdSetup for upcoming coverage tests"
```

---

### Task 2: Add `cmdSetup` test suite

**Files:**
- Modify: `tests/unit/commands.test.js` — append new describe block near end (before or after `cmdHealthCheck`)

**Step 1: Write failing tests first**

Add this block after the `cmdHealthCheck` describe block (or wherever the file ends before `module.exports`). The function resolves paths from `__dirname`, so `cwd` is ignored — pass `'/ignored'`.

```js
// ─── cmdSetup ───────────────────────────────────────────────────────────────

describe('cmdSetup', () => {
  test('returns package_root, plugin_json and instructions when installed', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdSetup('/ignored', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('package_root');
    expect(parsed).toHaveProperty('plugin_json');
    expect(parsed.plugin_json).toContain('plugin.json');
    expect(parsed).toHaveProperty('instructions');
    expect(parsed.instructions).toContain('plugin_path');
  });

  test('raw mode outputs plain-text GRD plugin message', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdSetup('/ignored', true);
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('GRD plugin configured');
  });

  test('errors with exit 1 when plugin.json does not exist', () => {
    const origExistsSync = fs.existsSync;
    fs.existsSync = () => false;
    try {
      const { exitCode } = captureError(() => {
        cmdSetup('/ignored', false);
      });
      expect(exitCode).toBe(1);
    } finally {
      fs.existsSync = origExistsSync;
    }
  });
});
```

**Why `fs.existsSync = () => false` works:** `commands.js` uses `const fs = require('fs')` which is the same cached object. Patching it in the test is visible inside the module. Always restore in `finally`.

**Step 2: Run tests to verify they pass**

```bash
npx jest tests/unit/commands.test.js -t "cmdSetup" --verbose
```

Expected: 3 passing tests.

**Step 3: Commit**

```bash
git add tests/unit/commands.test.js
git commit -m "test(commands): add cmdSetup tests — success, raw, and error paths"
```

---

### Task 3: Add shipped-milestone coverage via `cmdDashboard`

**Files:**
- Modify: `tests/unit/commands.test.js` — add tests inside the existing `describe('cmdDashboard', ...)` block

**Step 1: Understand which lines to cover**

`parseDashboardShippedMilestones` (line 922) is called on every `cmdDashboard` invocation but exits early at line 925 (`if (!milestonesSection) return`) because the fixture ROADMAP.md has no `## Milestones` section. The inner loops (lines 932-949) and `makeShippedMilestone` (lines 905-919) are never reached.

Adding a ROADMAP with a `## Milestones` section containing a `(shipped ...)` entry exercises all of this.

**Step 2: Write the failing tests**

Add these two tests inside the existing `describe('cmdDashboard', () => { ... })` block (anywhere after the `beforeEach`/`afterEach`):

```js
  test('includes shipped milestones with phase range in milestones array', () => {
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    let roadmap = fs.readFileSync(roadmapPath, 'utf-8');
    // Append a ## Milestones section with a shipped entry that includes phase range
    roadmap +=
      '\n## Milestones\n\n' +
      '- v0.9 Early Prototype - Phases 1-3 (shipped 2025-12-01)\n';
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout, exitCode } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    const shipped = parsed.milestones.find((m) => m.version === 'v0.9');
    expect(shipped).toBeDefined();
    expect(shipped.status).toBe('shipped');
    expect(shipped.shipped_date).toBe('2025-12-01');
    expect(shipped.phase_range).toBe('1-3');
    expect(shipped.phase_count).toBe(3);
    expect(shipped.progress_percent).toBe(100);
  });

  test('includes shipped milestones without phase range', () => {
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    let roadmap = fs.readFileSync(roadmapPath, 'utf-8');
    // Entry without phase range (no "Phases N-M") — exercises the no-phases regex branch
    roadmap +=
      '\n## Milestones\n\n' +
      '- v0.8 Prototype (shipped 2025-11-01)\n';
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout, exitCode } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    const shipped = parsed.milestones.find((m) => m.version === 'v0.8');
    expect(shipped).toBeDefined();
    expect(shipped.status).toBe('shipped');
    expect(shipped.shipped_date).toBe('2025-11-01');
    expect(shipped.phase_range).toBeNull();
    expect(shipped.phase_count).toBe(0);
    expect(parsed.summary.shipped_milestones).toBe(1);
  });
```

**Note:** The fixture uses `beforeEach`/`afterEach` which recreates the fixture dir before each test, so writing to `roadmapPath` inside a test is safe — changes are discarded on cleanup.

**Step 3: Run tests to verify they pass**

```bash
npx jest tests/unit/commands.test.js -t "shipped milestone" --verbose
```

Expected: 2 passing.

**Step 4: Commit**

```bash
git add tests/unit/commands.test.js
git commit -m "test(commands): add shipped-milestone coverage for parseDashboardShippedMilestones"
```

---

### Task 4: Add `cmdResolveModel` non-balanced profile tests

**Files:**
- Modify: `tests/unit/commands.test.js` — add tests inside existing `describe('cmdResolveModel', ...)`

**Step 1: Write the failing tests**

Add two tests at the end of the existing `describe('cmdResolveModel', () => { ... })` block. Each test creates its own fixture, overrides `model_profile`, then cleans up inline (no shared `beforeEach`).

```js
  test('"quality" profile returns opus for grd-planner', () => {
    const tmpDir = createFixtureDir();
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.model_profile = 'quality';
    fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdResolveModel(tmpDir, 'grd-planner', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.model).toBe('opus');
    expect(parsed.profile).toBe('quality');
    cleanupFixtureDir(tmpDir);
  });

  test('"budget" profile returns haiku for grd-verifier', () => {
    const tmpDir = createFixtureDir();
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.model_profile = 'budget';
    fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdResolveModel(tmpDir, 'grd-verifier', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.model).toBe('haiku');
    expect(parsed.profile).toBe('budget');
    cleanupFixtureDir(tmpDir);
  });
```

**Step 2: Run tests to verify they pass**

```bash
npx jest tests/unit/commands.test.js -t "cmdResolveModel" --verbose
```

Expected: 5 passing (3 existing + 2 new).

**Step 3: Commit**

```bash
git add tests/unit/commands.test.js
git commit -m "test(commands): add quality/budget profile coverage for cmdResolveModel"
```

---

### Task 5: Verify coverage hits ≥90% and raise threshold

**Step 1: Run full test suite with coverage**

```bash
npm run test:unit -- --coverage 2>&1 | grep "commands.js"
```

Expected output shows lines ≥ 90%.

**Step 2: If ≥90%, raise the threshold in `jest.config.js`**

In `jest.config.js`, find:

```js
'./lib/commands.js': { lines: 88, functions: 95, branches: 70 },
```

Change `lines: 88` to `lines: 90`:

```js
'./lib/commands.js': { lines: 90, functions: 95, branches: 70 },
```

**Step 3: Run full test suite again to confirm threshold passes**

```bash
npm test 2>&1 | tail -30
```

Expected: all 1631+ tests pass with no coverage threshold failures.

**Step 4: Commit**

```bash
git add jest.config.js
git commit -m "chore(coverage): raise commands.js lines threshold to 90%"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `tests/unit/commands.test.js` | +`cmdSetup` import; +`cmdSetup` suite (3 tests); +2 shipped-milestone tests in `cmdDashboard`; +2 profile tests in `cmdResolveModel` |
| `jest.config.js` | `lines: 88` → `lines: 90` for `./lib/commands.js` |

No production code changes. No new files.
