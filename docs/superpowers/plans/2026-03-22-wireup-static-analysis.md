# Wireup Static Analysis Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace runtime Node.js execution (`node -e require(...)`) in wireup scenarios with static import-graph analysis so wireup works on Vue/Vite/Next.js projects that use bundler-specific path aliases (`@/`, `~/`, etc.).

**Architecture:** Add a new `static` step type to the scenario/execution system. For `exported-but-uncalled` and `app-exported-but-uncalled` categories, generate `static` steps that verify export existence and import-graph connectivity via filesystem reads and regex — no subprocess needed. The existing `cli` step type remains for other categories that genuinely need runtime execution.

**Tech Stack:** TypeScript, Node.js fs API, regex-based import parsing (no external deps)

---

### Task 1: Add `static` step type to wireup types

**Files:**
- Modify: `lib/wireup/types.ts:47` (ScenarioStepType)
- Modify: `lib/wireup/types.ts:82` (StepResult.step_type)

- [ ] **Step 1: Update ScenarioStepType (line 47)**

Add `'static'` to the union type:

```typescript
export type ScenarioStepType = 'http' | 'cli' | 'browser' | 'assert' | 'static';
```

- [ ] **Step 2: Update StepResult.step_type (line 82)**

Add `'static'` to the result step type union:

```typescript
step_type: 'http' | 'cli' | 'static';
```

- [ ] **Step 3: Run type-check to verify no breaks**

Run: `npx tsc --noEmit`
Expected: Clean pass

- [ ] **Step 4: Commit**

```bash
git add lib/wireup/types.ts
git commit -m "feat(wireup): add 'static' step type for import-graph analysis"
```

---

### Task 2: Add static analysis execution to execution.ts

**Files:**
- Modify: `lib/wireup/execution.ts:318-335` (step dispatch)
- Test: `tests/unit/wireup.test.ts`

- [ ] **Step 1: Write failing tests for executeStaticStep**

Import `executeStaticStep` from `../../lib/wireup/execution` at the top of the test file.

Add to `tests/unit/wireup.test.ts`:

```typescript
describe('executeStaticStep', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes when export exists in file (ES module export)', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wireup-static-'));
    fs.writeFileSync(path.join(tmpDir, 'utils.ts'), 'export function doThing() { return 1; }');

    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'export_exists', filePath: 'utils.ts', exportName: 'doThing' },
      expected_outcome: 'Export exists',
    }, tmpDir);

    expect(result.passed).toBe(true);
    expect(result.step_type).toBe('static');
  });

  it('passes when export exists via export default', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wireup-static-'));
    fs.writeFileSync(path.join(tmpDir, 'Button.tsx'), 'export default function Button() {}');

    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'export_exists', filePath: 'Button.tsx', exportName: 'Button' },
      expected_outcome: 'Export exists',
    }, tmpDir);

    expect(result.passed).toBe(true);
  });

  it('passes when export exists via export { name }', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wireup-static-'));
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'const doThing = 1;\nexport { doThing }');

    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'export_exists', filePath: 'index.ts', exportName: 'doThing' },
      expected_outcome: 'Export exists',
    }, tmpDir);

    expect(result.passed).toBe(true);
  });

  it('fails when export does not exist in file', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wireup-static-'));
    fs.writeFileSync(path.join(tmpDir, 'utils.ts'), 'export function other() {}');

    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'export_exists', filePath: 'utils.ts', exportName: 'doThing' },
      expected_outcome: 'Export exists',
    }, tmpDir);

    expect(result.passed).toBe(false);
  });

  it('fails when file does not exist', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wireup-static-'));

    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'export_exists', filePath: 'missing.ts', exportName: 'x' },
      expected_outcome: 'Export exists',
    }, tmpDir);

    expect(result.passed).toBe(false);
  });

  it('passes import_graph_connected when export is referenced', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wireup-static-'));
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'utils.ts'), 'export function doThing() {}');
    fs.writeFileSync(path.join(srcDir, 'app.ts'), "import { doThing } from './utils';");

    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'import_graph_connected', filePath: 'src/utils.ts', exportName: 'doThing' },
      expected_outcome: 'Referenced',
    }, tmpDir);

    expect(result.passed).toBe(true);
  });

  it('fails import_graph_connected when export has no references', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wireup-static-'));
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'utils.ts'), 'export function orphan() {}');
    fs.writeFileSync(path.join(srcDir, 'app.ts'), "import { other } from './other';");

    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'import_graph_connected', filePath: 'src/utils.ts', exportName: 'orphan' },
      expected_outcome: 'Referenced',
    }, tmpDir);

    expect(result.passed).toBe(false);
  });
});
```

- [ ] **Step 2: Add fs/path imports to execution.ts**

Add at the top of `lib/wireup/execution.ts` (after the existing requires):

```typescript
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
```

- [ ] **Step 3: Add helper constants and function near the top of execution.ts**

```typescript
const STATIC_SKIP_DIRS: Set<string> = new Set([
  'node_modules', 'dist', 'build', '.next', '.nuxt', '.output',
  '.git', '.worktrees', 'coverage', '.planning',
]);

/** Recursively collect source files, skipping non-source directories. */
function _collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full: string = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!STATIC_SKIP_DIRS.has(entry.name)) {
          results.push(..._collectSourceFiles(full));
        }
      } else if (/\.(ts|js|tsx|jsx|vue|svelte)$/.test(entry.name)) {
        results.push(full);
      }
    }
  } catch {
    // Permission error or missing dir — skip
  }
  return results;
}
```

- [ ] **Step 4: Implement executeStaticStep in execution.ts**

Add before the `executeScenarios` function. Note: uses `step_type: 'static'` in results (matching the updated `StepResult` type from Task 1).

```typescript
/**
 * Execute a static analysis step — verify export existence and import connectivity
 * via filesystem reads only. No subprocess spawning, no runtime resolution.
 *
 * Supports two checks:
 * - 'export_exists': verify the named export appears in the file
 * - 'import_graph_connected': verify the export is referenced somewhere in the project
 */
function executeStaticStep(
  stepIndex: number,
  step: WireupScenario['steps'][number],
  cwd: string
): StepResult {
  const startTime = Date.now();
  const params = step.parameters as Record<string, unknown>;
  const check = typeof params['check'] === 'string' ? params['check'] : '';
  const filePath = typeof params['filePath'] === 'string' ? params['filePath'] : '';
  const exportName = typeof params['exportName'] === 'string' ? params['exportName'] : '';

  const absPath: string = path.join(cwd, filePath);

  if (check === 'export_exists') {
    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf-8');
    } catch {
      return {
        step_index: stepIndex,
        step_type: 'static',
        passed: false,
        expected: step.expected_outcome,
        actual: `File not found: ${filePath}`,
        duration_ms: Date.now() - startTime,
      };
    }

    // Match ES module exports, CJS exports, default exports, and export lists
    const exportPatterns: RegExp[] = [
      new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class|let|var)\\s+${exportName}\\b`),
      new RegExp(`export\\s+default\\s+(?:function|class)\\s+${exportName}\\b`),
      new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b`),
      new RegExp(`exports\\.${exportName}\\s*=`),
      new RegExp(`module\\.exports\\s*=\\s*\\{[^}]*\\b${exportName}\\b`),
    ];
    const found: boolean = exportPatterns.some((p) => p.test(content));

    return {
      step_index: stepIndex,
      step_type: 'static',
      passed: found,
      expected: step.expected_outcome,
      actual: found ? `Export '${exportName}' found in ${filePath}` : `Export '${exportName}' not found in ${filePath}`,
      duration_ms: Date.now() - startTime,
    };
  }

  if (check === 'import_graph_connected') {
    // Single recursive scan from cwd — _collectSourceFiles already skips non-source dirs
    const allFiles: string[] = _collectSourceFiles(cwd);

    let referenced: boolean = false;
    const namePattern: RegExp = new RegExp(`\\b${exportName}\\b`);

    for (const file of allFiles) {
      if (path.resolve(file) === path.resolve(absPath)) continue;
      try {
        const content: string = fs.readFileSync(file, 'utf-8');
        if (namePattern.test(content)) {
          referenced = true;
          break;
        }
      } catch {
        continue;
      }
    }

    return {
      step_index: stepIndex,
      step_type: 'static',
      passed: referenced,
      expected: step.expected_outcome,
      actual: referenced
        ? `Export '${exportName}' is referenced in the project`
        : `Export '${exportName}' has no references outside ${filePath}`,
      duration_ms: Date.now() - startTime,
    };
  }

  return {
    step_index: stepIndex,
    step_type: 'static',
    passed: false,
    expected: step.expected_outcome,
    actual: `Unknown static check: ${check}`,
    duration_ms: Date.now() - startTime,
  };
}
```

- [ ] **Step 5: Add executeStaticStep to module.exports**

Add `executeStaticStep` to the `module.exports` block at the bottom of `execution.ts`.

**Note (known limitation):** The `import_graph_connected` check uses a word-boundary regex (`\b{name}\b`) which may match identifiers in comments or strings. This is intentionally broad — false positives (passing when not truly imported) are safer than false negatives here. A future improvement could tighten this to match only import/require statements.

- [ ] **Step 3: Wire static step into executeScenarios dispatch**

In `executeScenarios`, update the step dispatch (around line 318):

```typescript
if (step.step_type === 'http') {
  const result = await executeHttpStep(i, step, options);
  stepResults.push(result);
} else if (step.step_type === 'cli') {
  const result = await executeCliStep(i, step, options, cwd);
  stepResults.push(result);
} else if (step.step_type === 'static') {
  const result = executeStaticStep(i, step, cwd);
  stepResults.push(result);
} else {
  // 'browser' and 'assert' — skip and mark as passed
  ...
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/unit/wireup.test.ts --silent`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add lib/wireup/execution.ts tests/unit/wireup.test.ts
git commit -m "feat(wireup): add static analysis step execution"
```

---

### Task 3: Switch scenario generators to use static steps

**Files:**
- Modify: `lib/wireup/scenarios.ts:120-140` (`_scenarioForExportedButUncalled`)
- Modify: `lib/wireup/scenarios.ts:238-258` (`_scenarioForAppExportedButUncalled`)
- Modify: `lib/wireup/scenarios.ts:289-310` (`_scenarioForAppComponent`)
- Test: `tests/unit/wireup-scenarios.test.ts`

- [ ] **Step 1: Update `_scenarioForExportedButUncalled`**

Replace the `node -e require(...)` CLI step with a static step:

```typescript
function _scenarioForExportedButUncalled(
  feature: UnwiredFeature,
  fixturePath: string
): WireupScenario {
  const steps: ScenarioStep[] = [
    {
      step_type: 'static',
      parameters: {
        check: 'export_exists',
        filePath: feature.filePath,
        exportName: feature.functionName,
      },
      expected_outcome: 'Export exists in source file',
    },
    {
      step_type: 'static',
      parameters: {
        check: 'import_graph_connected',
        filePath: feature.filePath,
        exportName: feature.functionName,
      },
      expected_outcome: 'Export is imported or referenced somewhere',
    },
  ];
  return { feature, steps, test_data_fixture: fixturePath };
}
```

- [ ] **Step 2: Update `_scenarioForAppExportedButUncalled`**

Same pattern:

```typescript
function _scenarioForAppExportedButUncalled(
  feature: UnwiredFeature,
  fixturePath: string
): WireupScenario {
  const steps: ScenarioStep[] = [
    {
      step_type: 'static',
      parameters: {
        check: 'export_exists',
        filePath: feature.filePath,
        exportName: feature.functionName,
      },
      expected_outcome: 'Export exists and is accessible',
    },
    {
      step_type: 'static',
      parameters: {
        check: 'import_graph_connected',
        filePath: feature.filePath,
        exportName: feature.functionName,
      },
      expected_outcome: 'Exported symbol is referenced in the project',
    },
  ];
  return { feature, steps, test_data_fixture: fixturePath };
}
```

- [ ] **Step 3: Update `_scenarioForAppComponent`**

Replace the `grep -r` CLI step with a static step:

```typescript
function _scenarioForAppComponent(
  feature: UnwiredFeature,
  fixturePath: string
): WireupScenario {
  const steps: ScenarioStep[] = [
    {
      step_type: 'static',
      parameters: {
        check: 'export_exists',
        filePath: feature.filePath,
        exportName: feature.functionName,
      },
      expected_outcome: 'Component is exported',
    },
    {
      step_type: 'static',
      parameters: {
        check: 'import_graph_connected',
        filePath: feature.filePath,
        exportName: feature.functionName,
      },
      expected_outcome: 'Component is imported or used somewhere',
    },
  ];
  return { feature, steps, test_data_fixture: fixturePath };
}
```

- [ ] **Step 4: Update wireup-scenarios tests**

In `tests/unit/wireup-scenarios.test.ts`, update assertions that check for `step_type: 'cli'` with `command: 'node'` to instead check for `step_type: 'static'` with `check: 'export_exists'` or `check: 'import_graph_connected'`. Similarly update component tests that check for `command: 'grep'`.

- [ ] **Step 5: Run all wireup tests**

Run: `npx jest tests/unit/wireup --silent`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add lib/wireup/scenarios.ts tests/unit/wireup-scenarios.test.ts
git commit -m "feat(wireup): switch export/component scenarios from runtime to static analysis"
```

---

### Task 4: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: Clean

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: All pass, no coverage regressions

- [ ] **Step 4: Commit any fixups**

---

### Task 5: Version bump and tag

**Files:**
- Modify: `package.json`
- Modify: `VERSION`

- [ ] **Step 1: Bump version**

Update both `package.json` and `VERSION` to `0.3.18`.

- [ ] **Step 2: Commit, tag, push**

```bash
git add package.json VERSION
git commit -m "chore: bump version to 0.3.18"
git tag v0.3.18
git push && git push origin v0.3.18
```
