# Improve context.js Test Coverage — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Increase `lib/context.js` line coverage from 87% to ≥90% by adding targeted tests for uncovered branches.

**Architecture:** All changes go in `tests/unit/context.test.js`. No source changes needed — the gaps are purely untested code paths, not missing functionality. Each new describe block targets a specific uncovered area identified by static analysis.

**Tech Stack:** Jest, Node.js, existing `createFixtureDir`/`cleanupFixtureDir` helpers, `captureOutput` helper.

---

## Background: What's Covered vs. Not

Current thresholds in `jest.config.js`:
```
'./lib/context.js': { lines: 87, functions: 83, branches: 77 }
```
Target: raise `lines` to ≥90. The function and branch thresholds should also rise as a side-effect.

**Untested paths identified (no source changes required):**

| Area | Untested path |
|------|--------------|
| `inferCeremonyLevel` | `ceremony.default_level` config override; `phase_overrides`; `hasResearch → standard`; `planCount ≥ 5 → full` |
| `cmdInitPlanPhase` includes | `context`, `research`, `verification`, `uat`, `requirements` content loading |
| `cmdInitResearchWorkflow` includes | `landscape`, `papers`, `knowhow`, `baseline`, `state`, `roadmap`, `config` content; `compare-methods`/`feasibility` workflows |
| `cmdInitProgress` includes | `roadmap`, `project`, `config` content; `paused_at` regex match |
| `cmdInitResume` | `has_interrupted_agent: true` (current-agent-id.txt present) |
| `cmdInitMapCodebase` | `has_maps: true` (existing .md files in codebase dir) |
| `cmdInitMilestoneOp` | archived milestones present; `all_phases_complete: true` |
| `cmdInitPlanMilestoneGaps` | dedicated tests (currently only in spot-check) |

---

## Task 1: `inferCeremonyLevel` config override branches

**Files:**
- Modify: `tests/unit/context.test.js` — add new describe block after the existing `ceremony level detection` describe

**Step 1: Write the failing tests**

Add a new describe block at the end of the `ceremony level detection` describe (after the existing three tests):

```js
describe('inferCeremonyLevel config overrides', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('ceremony.default_level=full returns full regardless of plan count', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        model_profile: 'balanced',
        branching_strategy: 'phase',
        phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
        milestone_branch_template: 'grd/{milestone}-{slug}',
        ceremony: { default_level: 'full' },
      })
    );
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.ceremony_level).toBe('full');
  });

  test('ceremony.default_level=standard returns standard regardless of plan count', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        model_profile: 'balanced',
        branching_strategy: 'phase',
        phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
        milestone_branch_template: 'grd/{milestone}-{slug}',
        ceremony: { default_level: 'standard' },
      })
    );
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.ceremony_level).toBe('standard');
  });

  test('ceremony.phase_overrides for matching phase returns override value', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        model_profile: 'balanced',
        branching_strategy: 'phase',
        phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
        milestone_branch_template: 'grd/{milestone}-{slug}',
        ceremony: { default_level: 'auto', phase_overrides: { '1': 'full' } },
      })
    );
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.ceremony_level).toBe('full');
  });

  test('phase with 5+ plans infers full ceremony', () => {
    // Create a phase dir with 5 PLAN.md files (no summaries)
    const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '03-heavy');
    fs.mkdirSync(phaseDir, { recursive: true });
    for (let i = 1; i <= 5; i++) {
      fs.writeFileSync(path.join(phaseDir, `03-0${i}-PLAN.md`), `# Plan ${i}`);
    }
    // Also add phase to ROADMAP.md so findPhaseInternal can find it
    const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
    const roadmap = fs.readFileSync(roadmapPath, 'utf-8');
    fs.writeFileSync(
      roadmapPath,
      roadmap + '\n### Phase 3: Heavy Phase -- Many plans\n- **Plans:** 5 plans\n'
    );
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '3', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.ceremony_level).toBe('full');
    expect(result.plan_count).toBe(5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/context.test.js -t "inferCeremonyLevel config overrides" --no-coverage`
Expected: Tests pass (the code paths exist, they just weren't called before).

**Step 3: Run full test file with coverage**

Run: `npx jest tests/unit/context.test.js --coverage`

**Step 4: Commit**

```bash
git add tests/unit/context.test.js
git commit -m "test(context): add inferCeremonyLevel config override coverage"
```

---

## Task 2: `cmdInitPlanPhase` includes content loading

**Files:**
- Modify: `tests/unit/context.test.js` — add tests inside the existing `cmdInitPlanPhase` describe

**Step 1: Write the failing tests**

Add to the existing `cmdInitPlanPhase` describe block:

```js
test('includes context_content when context file exists and requested', () => {
  const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
  fs.writeFileSync(path.join(phaseDir, '01-CONTEXT.md'), '# Context\n\nUser decisions here.\n');
  const { stdout } = captureOutput(() =>
    cmdInitPlanPhase(tmpDir, '1', new Set(['context']), false)
  );
  const result = JSON.parse(stdout);
  expect(result.context_content).toContain('User decisions here');
  // cleanup
  fs.unlinkSync(path.join(phaseDir, '01-CONTEXT.md'));
});

test('includes research_content when research file exists and requested', () => {
  const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
  fs.writeFileSync(path.join(phaseDir, '01-RESEARCH.md'), '# Research\n\nPaper findings.\n');
  const { stdout } = captureOutput(() =>
    cmdInitPlanPhase(tmpDir, '1', new Set(['research']), false)
  );
  const result = JSON.parse(stdout);
  expect(result.research_content).toContain('Paper findings');
  fs.unlinkSync(path.join(phaseDir, '01-RESEARCH.md'));
});

test('includes verification_content when verification file exists and requested', () => {
  const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
  fs.writeFileSync(path.join(phaseDir, '01-VERIFICATION.md'), '# Verification\n\nChecks passed.\n');
  const { stdout } = captureOutput(() =>
    cmdInitPlanPhase(tmpDir, '1', new Set(['verification']), false)
  );
  const result = JSON.parse(stdout);
  expect(result.verification_content).toContain('Checks passed');
  fs.unlinkSync(path.join(phaseDir, '01-VERIFICATION.md'));
});

test('includes uat_content when UAT file exists and requested', () => {
  const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
  fs.writeFileSync(path.join(phaseDir, '01-UAT.md'), '# UAT\n\nAcceptance test results.\n');
  const { stdout } = captureOutput(() =>
    cmdInitPlanPhase(tmpDir, '1', new Set(['uat']), false)
  );
  const result = JSON.parse(stdout);
  expect(result.uat_content).toContain('Acceptance test results');
  fs.unlinkSync(path.join(phaseDir, '01-UAT.md'));
});

test('includes requirements_content when requested', () => {
  const { stdout } = captureOutput(() =>
    cmdInitPlanPhase(tmpDir, '1', new Set(['requirements']), false)
  );
  const result = JSON.parse(stdout);
  // REQUIREMENTS.md exists in fixture
  expect(result.requirements_content).toBeDefined();
});
```

**Step 2: Run and verify**

Run: `npx jest tests/unit/context.test.js -t "cmdInitPlanPhase" --no-coverage`
Expected: All pass.

**Step 3: Commit**

```bash
git add tests/unit/context.test.js
git commit -m "test(context): add cmdInitPlanPhase include content coverage"
```

---

## Task 3: `cmdInitResearchWorkflow` includes and additional workflows

**Files:**
- Modify: `tests/unit/context.test.js` — extend the existing `cmdInitResearchWorkflow` describe

**Step 1: Write the failing tests**

Add to the existing `cmdInitResearchWorkflow` describe block:

```js
test('includes landscape_content when requested', () => {
  const researchDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'research');
  fs.mkdirSync(researchDir, { recursive: true });
  fs.writeFileSync(path.join(researchDir, 'LANDSCAPE.md'), '# Landscape\n\nSoTA methods.\n');
  const { stdout } = captureOutput(() =>
    cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(['landscape']), false)
  );
  const result = JSON.parse(stdout);
  expect(result.landscape_content).toContain('SoTA methods');
});

test('includes papers_content when requested', () => {
  const researchDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'research');
  fs.mkdirSync(researchDir, { recursive: true });
  fs.writeFileSync(path.join(researchDir, 'PAPERS.md'), '# Papers\n\nKey papers.\n');
  const { stdout } = captureOutput(() =>
    cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(['papers']), false)
  );
  const result = JSON.parse(stdout);
  expect(result.papers_content).toContain('Key papers');
});

test('includes state_content and roadmap_content when requested', () => {
  const { stdout } = captureOutput(() =>
    cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(['state', 'roadmap']), false)
  );
  const result = JSON.parse(stdout);
  expect(result.state_content).toBeDefined();
  expect(result.roadmap_content).toBeDefined();
});

test('includes config_content when requested', () => {
  const { stdout } = captureOutput(() =>
    cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(['config']), false)
  );
  const result = JSON.parse(stdout);
  expect(result.config_content).toBeDefined();
});

test('compare-methods workflow includes deep_dives list', () => {
  const { stdout } = captureOutput(() =>
    cmdInitResearchWorkflow(tmpDir, 'compare-methods', null, new Set(), false)
  );
  const result = JSON.parse(stdout);
  expect(result.workflow).toBe('compare-methods');
  expect(Array.isArray(result.deep_dives)).toBe(true);
});

test('feasibility workflow includes deep_dives list', () => {
  const { stdout } = captureOutput(() =>
    cmdInitResearchWorkflow(tmpDir, 'feasibility', 'approach-x', new Set(), false)
  );
  const result = JSON.parse(stdout);
  expect(result.workflow).toBe('feasibility');
  expect(Array.isArray(result.deep_dives)).toBe(true);
});
```

**Step 2: Run and verify**

Run: `npx jest tests/unit/context.test.js -t "cmdInitResearchWorkflow" --no-coverage`
Expected: All pass.

**Step 3: Commit**

```bash
git add tests/unit/context.test.js
git commit -m "test(context): add cmdInitResearchWorkflow include content coverage"
```

---

## Task 4: `cmdInitProgress` additional includes and `paused_at`

**Files:**
- Modify: `tests/unit/context.test.js` — extend the existing `cmdInitProgress` describe

**Step 1: Write the failing tests**

Add to the existing `cmdInitProgress` describe block:

```js
test('includes roadmap_content when requested', () => {
  const { stdout } = captureOutput(() =>
    cmdInitProgress(tmpDir, new Set(['roadmap']), false)
  );
  const result = JSON.parse(stdout);
  expect(result.roadmap_content).toBeDefined();
  expect(result.roadmap_content).toContain('Phase');
});

test('includes project_content when requested (returns null if absent)', () => {
  const { stdout } = captureOutput(() =>
    cmdInitProgress(tmpDir, new Set(['project']), false)
  );
  const result = JSON.parse(stdout);
  // PROJECT.md not in fixture, safeReadMarkdown returns null
  expect(result).toHaveProperty('project_content');
});

test('includes config_content when requested', () => {
  const { stdout } = captureOutput(() =>
    cmdInitProgress(tmpDir, new Set(['config']), false)
  );
  const result = JSON.parse(stdout);
  expect(result.config_content).toBeDefined();
});

test('detects paused_at from STATE.md when present', () => {
  // Add "Paused At:" line to STATE.md
  const statePath = path.join(tmpDir, '.planning', 'STATE.md');
  const state = fs.readFileSync(statePath, 'utf-8');
  fs.writeFileSync(statePath, state + '\n**Paused At:** Phase 2, Plan 1\n');
  const { stdout } = captureOutput(() =>
    cmdInitProgress(tmpDir, new Set(), false)
  );
  const result = JSON.parse(stdout);
  expect(result.paused_at).toBe('Phase 2, Plan 1');
  // Restore
  fs.writeFileSync(statePath, state);
});
```

**Step 2: Run and verify**

Run: `npx jest tests/unit/context.test.js -t "cmdInitProgress" --no-coverage`

**Step 3: Commit**

```bash
git add tests/unit/context.test.js
git commit -m "test(context): add cmdInitProgress includes and paused_at coverage"
```

---

## Task 5: `cmdInitResume` interrupted agent, `cmdInitMapCodebase` maps, `cmdInitMilestoneOp` archives

**Files:**
- Modify: `tests/unit/context.test.js` — extend existing describe blocks for these three functions

**Step 1: Write the tests**

Extend `cmdInitResume` describe:
```js
test('reports has_interrupted_agent true when current-agent-id.txt exists', () => {
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'current-agent-id.txt'),
    'agent-abc123\n'
  );
  const { stdout } = captureOutput(() => cmdInitResume(tmpDir, false));
  const result = JSON.parse(stdout);
  expect(result.has_interrupted_agent).toBe(true);
  expect(result.interrupted_agent_id).toBe('agent-abc123');
  fs.unlinkSync(path.join(tmpDir, '.planning', 'current-agent-id.txt'));
});
```

Extend `cmdInitMapCodebase` describe:
```js
test('reports has_maps true when codebase dir contains .md files', () => {
  const { codebaseDir } = require('../../lib/paths');
  const cbDir = codebaseDir(tmpDir);
  fs.mkdirSync(cbDir, { recursive: true });
  fs.writeFileSync(path.join(cbDir, 'TECH.md'), '# Tech Map\n');
  const { stdout } = captureOutput(() => cmdInitMapCodebase(tmpDir, false));
  const result = JSON.parse(stdout);
  expect(result.has_maps).toBe(true);
  expect(result.existing_maps).toContain('TECH.md');
  fs.unlinkSync(path.join(cbDir, 'TECH.md'));
});
```

Extend `cmdInitMilestoneOp` describe:
```js
test('reports archived milestones when archive directory has entries', () => {
  const archiveDir = path.join(tmpDir, '.planning', 'archive', 'v0.1.0');
  fs.mkdirSync(archiveDir, { recursive: true });
  const { stdout } = captureOutput(() => cmdInitMilestoneOp(tmpDir, false));
  const result = JSON.parse(stdout);
  expect(result.archive_count).toBeGreaterThan(0);
  expect(result.archived_milestones).toContain('v0.1.0');
  expect(result.archive_exists).toBe(true);
  fs.rmSync(archiveDir, { recursive: true, force: true });
});

test('reports all_phases_complete true when all phases have summaries', () => {
  // Phase 1 has summary (in fixture), phase 2 has no summary. 
  // To test all_phases_complete we need a fresh dir with only phase 1
  const completeTmpDir = createFixtureDir();
  try {
    // Remove phase 2 so only phase 1 (with summary) exists
    fs.rmSync(
      path.join(completeTmpDir, '.planning', 'milestones', 'anonymous', 'phases', '02-build'),
      { recursive: true, force: true }
    );
    const { stdout } = captureOutput(() => cmdInitMilestoneOp(completeTmpDir, false));
    const result = JSON.parse(stdout);
    expect(result.all_phases_complete).toBe(true);
  } finally {
    cleanupFixtureDir(completeTmpDir);
  }
});
```

**Step 2: Run and verify**

Run: `npx jest tests/unit/context.test.js -t "(cmdInitResume|cmdInitMapCodebase|cmdInitMilestoneOp)" --no-coverage`

**Step 3: Commit**

```bash
git add tests/unit/context.test.js
git commit -m "test(context): add cmdInitResume/MapCodebase/MilestoneOp missing path coverage"
```

---

## Task 6: Dedicated `cmdInitPlanMilestoneGaps` tests

**Files:**
- Modify: `tests/unit/context.test.js` — add a new dedicated describe block (currently only covered in the 14-function spot check)

**Step 1: Write the tests**

```js
// ─── cmdInitPlanMilestoneGaps ─────────────────────────────────────────────────

describe('cmdInitPlanMilestoneGaps', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns context with milestone info and phase counts', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitPlanMilestoneGaps(tmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.milestone_version).toBeDefined();
    expect(typeof result.phase_count).toBe('number');
    expect(typeof result.highest_phase).toBe('number');
    expect(result.audit_file).toBeNull(); // no audit file in fixture
    expect(result.audit_gaps).toBeNull();
    expect(typeof result.requirements_exists).toBe('boolean');
  });

  test('detects REQUIREMENTS.md when present', () => {
    const { stdout } = captureOutput(() => cmdInitPlanMilestoneGaps(tmpDir, false));
    const result = JSON.parse(stdout);
    // fixture has REQUIREMENTS.md
    expect(result.requirements_exists).toBe(true);
  });

  test('detects audit file when present and extracts gaps from frontmatter', () => {
    const auditContent =
      '---\ngaps:\n  - Missing eval phase\n  - No integration test\n---\n# Audit\n\nFindings.\n';
    const auditPath = path.join(tmpDir, '.planning', `v1.0-MILESTONE-AUDIT.md`);
    fs.writeFileSync(auditPath, auditContent);
    try {
      const { stdout } = captureOutput(() => cmdInitPlanMilestoneGaps(tmpDir, false));
      const result = JSON.parse(stdout);
      expect(result.audit_file).toBe('v1.0-MILESTONE-AUDIT.md');
      expect(Array.isArray(result.audit_gaps)).toBe(true);
      expect(result.audit_gaps).toContain('Missing eval phase');
    } finally {
      fs.unlinkSync(auditPath);
    }
  });
});
```

**Step 2: Run and verify**

Run: `npx jest tests/unit/context.test.js -t "cmdInitPlanMilestoneGaps" --no-coverage`

**Step 3: Commit**

```bash
git add tests/unit/context.test.js
git commit -m "test(context): add dedicated cmdInitPlanMilestoneGaps test suite"
```

---

## Task 7: Update jest.config.js thresholds

After all tests pass and coverage is measured:

**Step 1: Measure coverage**

Run: `npx jest tests/unit/context.test.js --coverage`

Look at the `lib/context.js` line in the output.

**Step 2: Raise thresholds**

Edit `jest.config.js` to raise `lib/context.js` thresholds based on measured actuals:

```js
// Before:
'./lib/context.js': { lines: 87, functions: 83, branches: 77 },
// After (adjust numbers to match actual coverage, targeting ≥90 lines):
'./lib/context.js': { lines: 90, functions: 87, branches: 79 },
```

Only raise to what's actually achieved — do not set thresholds above measured coverage.

**Step 3: Run full test suite to confirm no regressions**

Run: `npm test`
Expected: All tests pass, no threshold failures.

**Step 4: Commit**

```bash
git add jest.config.js tests/unit/context.test.js
git commit -m "test(context): raise coverage thresholds to reflect improved coverage"
```

---

## Verification

After all tasks:

1. `npm test` must pass with zero failures
2. `npx jest tests/unit/context.test.js --coverage` must show `lib/context.js` lines ≥ 90%
3. No test timeout violations (all new tests use in-process function calls, not CLI spawning)
4. No new files created — all changes are additions to `tests/unit/context.test.js` and a threshold bump in `jest.config.js`
