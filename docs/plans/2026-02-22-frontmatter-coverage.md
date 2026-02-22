# Improve frontmatter.js Test Coverage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Increase `lib/frontmatter.js` line coverage from 89% to ≥90% by adding tests for untested command functions and uncovered branches.

**Architecture:** All changes are in `tests/unit/frontmatter.test.js` (add test cases) and `jest.config.js` (raise threshold). No source changes needed.

**Tech Stack:** Jest, CommonJS, Node.js fs/path mocks via fixture helpers

---

### Task 1: Import missing command functions

**Files:**
- Modify: `tests/unit/frontmatter.test.js:12-20`

**Step 1: Add `cmdFrontmatterSet` and `cmdFrontmatterMerge` to the import**

Change the destructured require at the top of the test file from:
```js
const {
  extractFrontmatter,
  reconstructFrontmatter,
  spliceFrontmatter,
  parseMustHavesBlock,
  cmdFrontmatterGet,
  cmdFrontmatterValidate,
  FRONTMATTER_SCHEMAS,
} = require('../../lib/frontmatter');
```
to:
```js
const {
  extractFrontmatter,
  reconstructFrontmatter,
  spliceFrontmatter,
  parseMustHavesBlock,
  cmdFrontmatterGet,
  cmdFrontmatterSet,
  cmdFrontmatterMerge,
  cmdFrontmatterValidate,
  FRONTMATTER_SCHEMAS,
} = require('../../lib/frontmatter');
```

**Step 2: Run tests to confirm no new failures**

```
npx jest tests/unit/frontmatter.test.js --coverage
```
Expected: all existing tests pass, coverage still ~89%.

---

### Task 2: Add `cmdFrontmatterSet` tests

**Files:**
- Modify: `tests/unit/frontmatter.test.js` (append after `cmdFrontmatterGet` describe block)

**Step 1: Write tests for `cmdFrontmatterSet`**

Add this describe block after the existing `cmdFrontmatterGet` block:

```js
// ─── cmdFrontmatterSet ──────────────────────────────────────────────────────

describe('cmdFrontmatterSet', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('sets a string value in an existing file', () => {
    const planPath = path.join(
      '.planning', 'milestones', 'anonymous', 'phases', '01-test', '01-01-PLAN.md'
    );
    const { stdout, exitCode } = captureOutput(() => {
      cmdFrontmatterSet(fixtureDir, planPath, 'type', 'research', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.updated).toBe(true);
    expect(parsed.field).toBe('type');
    expect(parsed.value).toBe('research');
  });

  test('parses JSON values (e.g., boolean true)', () => {
    const planPath = path.join(
      '.planning', 'milestones', 'anonymous', 'phases', '01-test', '01-01-PLAN.md'
    );
    const { stdout, exitCode } = captureOutput(() => {
      cmdFrontmatterSet(fixtureDir, planPath, 'autonomous', 'true', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.updated).toBe(true);
    expect(parsed.value).toBe(true); // JSON.parse('true') === true (boolean)
  });

  test('returns error for non-existent file', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdFrontmatterSet(fixtureDir, 'nonexistent.md', 'phase', 'x', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBe('File not found');
  });
});
```

**Step 2: Run and verify**

```
npx jest tests/unit/frontmatter.test.js --coverage
```
Expected: 3 new passing tests.

**Step 3: Commit**

```bash
git add tests/unit/frontmatter.test.js
git commit -m "test(frontmatter): add cmdFrontmatterSet coverage"
```

---

### Task 3: Add `cmdFrontmatterMerge` tests

**Files:**
- Modify: `tests/unit/frontmatter.test.js` (append after `cmdFrontmatterSet` describe block)

**Step 1: Write tests for `cmdFrontmatterMerge`**

```js
// ─── cmdFrontmatterMerge ────────────────────────────────────────────────────

describe('cmdFrontmatterMerge', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('merges multiple fields into existing frontmatter', () => {
    const planPath = path.join(
      '.planning', 'milestones', 'anonymous', 'phases', '01-test', '01-01-PLAN.md'
    );
    const { stdout, exitCode } = captureOutput(() => {
      cmdFrontmatterMerge(fixtureDir, planPath, '{"wave":2,"autonomous":false}', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.merged).toBe(true);
    expect(parsed.fields).toContain('wave');
    expect(parsed.fields).toContain('autonomous');
  });

  test('returns error for non-existent file', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdFrontmatterMerge(fixtureDir, 'nonexistent.md', '{"phase":"x"}', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBe('File not found');
  });

  test('calls error() for invalid JSON data', () => {
    const planPath = path.join(
      '.planning', 'milestones', 'anonymous', 'phases', '01-test', '01-01-PLAN.md'
    );
    const { exitCode } = captureOutput(() => {
      expect(() => {
        cmdFrontmatterMerge(fixtureDir, planPath, 'not-json', false);
      }).toThrow();
    });
    // captureError can also be used here if error() calls process.exit
  });
});
```

> **Note:** Check how `captureError` works in `tests/helpers/setup.js` — if `error()` calls `process.exit`, wrap in `expect(() => ...).toThrow()` or use `captureError`. Adjust as needed after reading the helper.

**Step 2: Run and verify**

```
npx jest tests/unit/frontmatter.test.js --coverage
```
Expected: 2-3 new passing tests.

**Step 3: Commit**

```bash
git add tests/unit/frontmatter.test.js
git commit -m "test(frontmatter): add cmdFrontmatterMerge coverage"
```

---

### Task 4: Cover remaining branches in existing functions

**Files:**
- Modify: `tests/unit/frontmatter.test.js`

**Step 1: Add missing `cmdFrontmatterGet` branches**

In the existing `cmdFrontmatterGet` describe block, add:

```js
test('returns error when requested field does not exist', () => {
  const planPath = path.join(
    '.planning', 'milestones', 'anonymous', 'phases', '01-test', '01-01-PLAN.md'
  );
  const { stdout, exitCode } = captureOutput(() => {
    cmdFrontmatterGet(fixtureDir, planPath, 'nonexistent_field', false);
  });
  expect(exitCode).toBe(0);
  const parsed = JSON.parse(stdout);
  expect(parsed.error).toBe('Field not found');
  expect(parsed.field).toBe('nonexistent_field');
});
```

**Step 2: Add missing `cmdFrontmatterValidate` branches**

In the existing `cmdFrontmatterValidate` describe block, add:

```js
test('returns error for non-existent file', () => {
  const { stdout, exitCode } = captureOutput(() => {
    cmdFrontmatterValidate(fixtureDir, 'nonexistent.md', 'plan', false);
  });
  expect(exitCode).toBe(0);
  const parsed = JSON.parse(stdout);
  expect(parsed.error).toBe('File not found');
});

test('calls error() for unknown schema name', () => {
  const planPath = path.join(
    '.planning', 'milestones', 'anonymous', 'phases', '01-test', '01-01-PLAN.md'
  );
  expect(() => {
    cmdFrontmatterValidate(fixtureDir, planPath, 'bogus_schema', false);
  }).toThrow();
});
```

**Step 3: Add missing `reconstructFrontmatter` branches**

In the existing `reconstructFrontmatter` describe block, add:

```js
test('writes long arrays as multi-line block list', () => {
  // >3 items triggers multi-line format
  const result = reconstructFrontmatter({ items: ['a', 'b', 'c', 'd'] });
  expect(result).toContain('items:');
  expect(result).toContain('  - a');
  expect(result).toContain('  - d');
});

test('quotes array items containing colons', () => {
  const result = reconstructFrontmatter({ items: ['key: value', 'plain'] });
  // Long enough to be multi-line (1 colon-containing item)
  expect(result).toContain('"key: value"');
});

test('quotes top-level values containing hash, bracket, or brace', () => {
  const result = reconstructFrontmatter({
    a: 'with#hash',
    b: '[array-like]',
    c: '{object-like}',
  });
  expect(result).toContain('"with#hash"');
  expect(result).toContain('"[array-like]"');
  expect(result).toContain('"{object-like}"');
});

test('handles nested object with empty subarray', () => {
  const result = reconstructFrontmatter({ outer: { inner: [] } });
  expect(result).toContain('outer:');
  expect(result).toContain('  inner: []');
});

test('handles nested object with long subarray (multi-line)', () => {
  const result = reconstructFrontmatter({ outer: { inner: ['a', 'b', 'c', 'd'] } });
  expect(result).toContain('outer:');
  expect(result).toContain('  inner:');
  expect(result).toContain('    - a');
});
```

**Step 4: Run and verify**

```
npx jest tests/unit/frontmatter.test.js --coverage
```
Expected: coverage crosses 90% lines.

**Step 5: Commit**

```bash
git add tests/unit/frontmatter.test.js
git commit -m "test(frontmatter): cover remaining branches and error paths"
```

---

### Task 5: Raise the jest.config.js threshold

**Files:**
- Modify: `jest.config.js:15`

**Step 1: Update threshold from 89 to 90**

Change:
```js
'./lib/frontmatter.js': { lines: 89, functions: 100, branches: 78 },
```
to:
```js
'./lib/frontmatter.js': { lines: 90, functions: 100, branches: 78 },
```

**Step 2: Run full test suite to confirm threshold is met**

```
npm test
```
Expected: all tests pass, no coverage threshold failures.

**Step 3: Commit**

```bash
git add jest.config.js
git commit -m "chore(coverage): raise frontmatter.js line threshold to 90"
```

---

## Notes

- `captureError` from `tests/helpers/setup.js` should be used for paths that call `error()` which likely calls `process.exit`. Check the helper's behavior before writing the invalid-input tests (Tasks 3 and 4).
- The `createFixtureDir` helper creates a temp `.planning/` tree; `cmdFrontmatterSet` and `cmdFrontmatterMerge` actually write files, so each describe block needs its own `beforeAll`/`afterAll` fixture to avoid cross-test mutation.
- Do not lower any other thresholds in `jest.config.js`.
