# Layered Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add four layers (Constitution, Ceremony, Standards Discovery, Command Consolidation) to GRD, borrowing best features from Superpowers, BMAD, Agent OS, and Spec Kit.

**Architecture:** Each layer is independent and testable. Layer 1 (Constitution) adds PRINCIPLES.md support. Layer 2 (Ceremony) adds scale-adaptive ceremony detection. Layer 3 (Standards) adds codebase standards discovery. Layer 4 (Consolidation) merges 8 overlapping commands. All changes flow through `lib/` modules with unit tests, then surface via `grd-tools.js` CLI and commands/.

**Tech Stack:** Node.js (CommonJS), Jest, ESLint, YAML parsing (js-yaml already in deps or parse manually)

---

## Task 1: Add `standardsDir` to `lib/paths.js`

**Files:**
- Modify: `lib/paths.js:209-221`
- Test: `tests/unit/paths.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/paths.test.js`:

```javascript
const { standardsDir } = require('../../lib/paths');

describe('standardsDir', () => {
  test('returns milestone-scoped path when milestone dir exists', () => {
    // Setup: create .planning/milestones/v0.1.0/ dir in tmpDir
    const msDir = path.join(tmpDir, '.planning', 'milestones', 'v0.1.0');
    fs.mkdirSync(msDir, { recursive: true });
    const result = standardsDir(tmpDir, 'v0.1.0');
    expect(result).toBe(path.join(msDir, 'standards'));
    fs.rmSync(msDir, { recursive: true });
  });

  test('falls back to .planning/standards/ when milestone dir missing', () => {
    const result = standardsDir(tmpDir, 'v99.99.99');
    expect(result).toBe(path.join(tmpDir, '.planning', 'standards'));
  });

  test('uses currentMilestone when milestone not provided', () => {
    const result = standardsDir(tmpDir);
    expect(typeof result).toBe('string');
    expect(result).toContain('standards');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/paths.test.js -t "standardsDir" -v`
Expected: FAIL — `standardsDir is not a function`

**Step 3: Write minimal implementation**

Add to `lib/paths.js` before the exports block (before line 209):

```javascript
/**
 * Milestone-scoped standards directory with backward-compatible fallback.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to standards directory
 */
function standardsDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  if (milestoneExistsOnDisk(cwd, milestone)) {
    return path.join(cwd, '.planning', 'milestones', milestone, 'standards');
  }
  return path.join(cwd, '.planning', 'standards');
}
```

Add `standardsDir` to the `module.exports` object.

**Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/paths.test.js -t "standardsDir" -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/paths.js tests/unit/paths.test.js
git commit -m "feat(paths): add standardsDir for standards discovery layer"
```

---

## Task 2: Add PRINCIPLES.md reading to `lib/context.js` init functions

**Files:**
- Modify: `lib/context.js:59-200` (cmdInitExecutePhase), `lib/context.js:231-350` (cmdInitPlanPhase), `lib/context.js:359-400` (cmdInitNewProject), `lib/context.js:540-590` (cmdInitQuick)
- Test: `tests/unit/context.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/context.test.js`:

```javascript
describe('PRINCIPLES.md integration', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    // Create a PRINCIPLES.md in the fixture
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PRINCIPLES.md'),
      '# Project Principles\n\n## Coding Philosophy\n- Prefer composition over inheritance\n'
    );
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('cmdInitExecutePhase includes principles when file exists', () => {
    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(['principles']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.principles_exists).toBe(true);
  });

  test('cmdInitPlanPhase includes principles when file exists', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['principles']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.principles_exists).toBe(true);
  });

  test('cmdInitQuick includes principles_exists field', () => {
    const { stdout } = captureOutput(() =>
      cmdInitQuick(tmpDir, 'test-task', false)
    );
    const result = JSON.parse(stdout);
    expect(result.principles_exists).toBe(true);
  });

  test('cmdInitNewProject includes principles_exists field', () => {
    const { stdout } = captureOutput(() =>
      cmdInitNewProject(tmpDir, false)
    );
    const result = JSON.parse(stdout);
    expect(result.principles_exists).toBe(true);
  });
});

describe('PRINCIPLES.md absent', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    // No PRINCIPLES.md
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('cmdInitExecutePhase sets principles_exists false', () => {
    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(), false)
    );
    const result = JSON.parse(stdout);
    expect(result.principles_exists).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/context.test.js -t "PRINCIPLES" -v`
Expected: FAIL — `principles_exists` is undefined

**Step 3: Write minimal implementation**

In `lib/context.js`, add to each `cmdInit*` function's result object:

For `cmdInitExecutePhase` (after the `state_exists` line ~line 193):
```javascript
    principles_exists: pathExistsInternal(cwd, '.planning/PRINCIPLES.md'),
```

For `cmdInitPlanPhase` (after `roadmap_exists` line ~line 279):
```javascript
    principles_exists: pathExistsInternal(cwd, '.planning/PRINCIPLES.md'),
```

For `cmdInitNewProject` (after `planning_exists` line ~line 393):
```javascript
    principles_exists: pathExistsInternal(cwd, '.planning/PRINCIPLES.md'),
```

For `cmdInitQuick` (after `planning_exists` line ~line 587):
```javascript
    principles_exists: pathExistsInternal(cwd, '.planning/PRINCIPLES.md'),
```

Add the `--include principles` handling in cmdInitExecutePhase and cmdInitPlanPhase (after the existing `includes.has('state')` blocks):
```javascript
  if (includes.has('principles')) {
    result.principles_content = safeReadFile(path.join(cwd, '.planning', 'PRINCIPLES.md'));
  }
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/context.test.js -t "PRINCIPLES" -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/context.js tests/unit/context.test.js
git commit -m "feat(context): add PRINCIPLES.md support to all init workflows"
```

---

## Task 3: Add ceremony level detection to `lib/context.js`

**Files:**
- Modify: `lib/context.js`
- Modify: `lib/utils.js` (add `loadConfig` ceremony defaults)
- Test: `tests/unit/context.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/context.test.js`:

```javascript
describe('ceremony level detection', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('cmdInitExecutePhase includes ceremony_level field', () => {
    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(), false)
    );
    const result = JSON.parse(stdout);
    expect(result.ceremony_level).toBeDefined();
    expect(['light', 'standard', 'full']).toContain(result.ceremony_level);
  });

  test('cmdInitPlanPhase includes ceremony_level field', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(), false)
    );
    const result = JSON.parse(stdout);
    expect(result.ceremony_level).toBeDefined();
    expect(['light', 'standard', 'full']).toContain(result.ceremony_level);
  });

  test('phase with 1 plan infers light ceremony', () => {
    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(), false)
    );
    const result = JSON.parse(stdout);
    // fixture has 1 plan for phase 1 -> should infer light
    expect(result.ceremony_level).toBe('light');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/context.test.js -t "ceremony level" -v`
Expected: FAIL — `ceremony_level` is undefined

**Step 3: Write minimal implementation**

Add a ceremony inference helper in `lib/context.js` (at the top, after imports):

```javascript
/**
 * Infer ceremony level from phase context signals.
 * @param {Object} config - Project config
 * @param {Object|null} phaseInfo - Phase info from findPhaseInternal
 * @param {string} cwd - Project working directory
 * @returns {string} 'light' | 'standard' | 'full'
 */
function inferCeremonyLevel(config, phaseInfo, cwd) {
  // User override: config.ceremony.default_level
  const ceremony = config.ceremony || {};
  if (ceremony.default_level && ceremony.default_level !== 'auto') {
    return ceremony.default_level;
  }

  // Per-phase override
  if (phaseInfo?.phase_number && ceremony.phase_overrides) {
    const override = ceremony.phase_overrides[phaseInfo.phase_number] ||
                     ceremony.phase_overrides[String(parseInt(phaseInfo.phase_number, 10))];
    if (override) return override;
  }

  // Auto-inference from signals
  if (!phaseInfo) return 'standard';

  const planCount = phaseInfo.plans?.length || 0;
  const hasResearch = phaseInfo.has_research || false;

  // Check for eval targets in roadmap description
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  let hasEvalTargets = false;
  try {
    const roadmap = safeReadFile(roadmapPath) || '';
    // Find the phase section and check for eval/experiment keywords
    const phasePattern = new RegExp(
      `## Phase ${parseInt(phaseInfo.phase_number, 10)}[^#]*`,
      's'
    );
    const phaseSection = roadmap.match(phasePattern)?.[0] || '';
    hasEvalTargets = /eval|experiment|metric|target|baseline/i.test(phaseSection);
  } catch {}

  if (planCount >= 5 || hasEvalTargets) return 'full';
  if (planCount >= 2 || hasResearch) return 'standard';
  return 'light';
}
```

Add `ceremony_level: inferCeremonyLevel(config, phaseInfo, cwd)` to the result objects in `cmdInitExecutePhase` and `cmdInitPlanPhase`.

**Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/context.test.js -t "ceremony level" -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/context.js tests/unit/context.test.js
git commit -m "feat(context): add ceremony level auto-inference to init workflows"
```

---

## Task 4: Add `ceremony` section to default config in `lib/commands.js`

**Files:**
- Modify: `lib/commands.js:237-278` (cmdConfigEnsureSection defaults)
- Test: `tests/unit/commands.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/commands.test.js`:

```javascript
describe('ceremony config defaults', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    // Remove existing config so ensure-section creates fresh
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('newly created config includes ceremony section', () => {
    const { stdout } = captureOutput(() => cmdConfigEnsureSection(tmpDir, false));
    const result = parseFirstJson(stdout);
    expect(result.created).toBe(true);

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.planning', 'config.json'), 'utf-8')
    );
    expect(config.ceremony).toBeDefined();
    expect(config.ceremony.default_level).toBe('auto');
    expect(config.ceremony.phase_overrides).toEqual({});
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/commands.test.js -t "ceremony config" -v`
Expected: FAIL — `config.ceremony` is undefined

**Step 3: Write minimal implementation**

In `lib/commands.js`, add to the `defaults` object in `cmdConfigEnsureSection` (after the `tracker` section, around line 277):

```javascript
    ceremony: {
      default_level: 'auto',
      phase_overrides: {},
    },
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/commands.test.js -t "ceremony config" -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/commands.js tests/unit/commands.test.js
git commit -m "feat(config): add ceremony section to default config"
```

---

## Task 5: Add standards index reading to `lib/context.js`

**Files:**
- Modify: `lib/context.js` (add standards_exists + standards auto-injection)
- Test: `tests/unit/context.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/context.test.js`:

```javascript
describe('standards integration', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    // Create standards directory with index
    const stdDir = path.join(tmpDir, '.planning', 'standards');
    fs.mkdirSync(path.join(stdDir, 'api'), { recursive: true });
    fs.writeFileSync(
      path.join(stdDir, 'index.yml'),
      'api:\n  response-format:\n    description: API response envelope\n    tags: [api, response]\n'
    );
    fs.writeFileSync(
      path.join(stdDir, 'api', 'response-format.md'),
      '---\narea: api\ntags: [response-format]\n---\n# API Response Envelope\nAll endpoints return {data, error, meta}.\n'
    );
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('cmdInitExecutePhase includes standards_exists', () => {
    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(), false)
    );
    const result = JSON.parse(stdout);
    expect(result.standards_exists).toBe(true);
  });

  test('cmdInitPlanPhase includes standards_exists', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(), false)
    );
    const result = JSON.parse(stdout);
    expect(result.standards_exists).toBe(true);
  });

  test('cmdInitQuick includes standards_exists', () => {
    const { stdout } = captureOutput(() =>
      cmdInitQuick(tmpDir, 'test-task', false)
    );
    const result = JSON.parse(stdout);
    expect(result.standards_exists).toBe(true);
  });
});

describe('standards absent', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('cmdInitExecutePhase sets standards_exists false', () => {
    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(), false)
    );
    const result = JSON.parse(stdout);
    expect(result.standards_exists).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/context.test.js -t "standards" -v`
Expected: FAIL — `standards_exists` is undefined

**Step 3: Write minimal implementation**

In `lib/context.js`:

1. Import `standardsDir` from `lib/paths.js`:
```javascript
const {
  phasesDir: getPhasesDirPath,
  researchDir: getResearchDirPath,
  codebaseDir: getCodebaseDirPath,
  todosDir: getTodosDirPath,
  quickDir: getQuickDirPath,
  milestonesDir: getMilestonesDirPath,
  standardsDir: getStandardsDirPath,  // ADD THIS
} = require('./paths');
```

2. Add to each `cmdInit*` result object:
```javascript
    standards_exists: fs.existsSync(path.join(getStandardsDirPath(cwd), 'index.yml')),
    standards_dir: path.relative(cwd, getStandardsDirPath(cwd)),
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/context.test.js -t "standards" -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/context.js tests/unit/context.test.js
git commit -m "feat(context): add standards directory detection to init workflows"
```

---

## Task 6: Create `commands/principles.md` skill

**Files:**
- Create: `commands/principles.md`

**Step 1: Write the command skill**

```markdown
---
name: principles
description: Create or edit project PRINCIPLES.md — the constitution that shapes all agent behavior
allowed_tools: [Read, Write, Edit, Bash, AskUserQuestion]
---

# Create/Edit Project Principles

<trigger>
Use this workflow when:
- User runs /grd:principles
- User wants to define coding philosophy, testing requirements, or architecture constraints
</trigger>

## Step 1: Check existing state

Run: `node $GRD_TOOLS_PATH/bin/grd-tools.js state load`

Parse the result. Check if `.planning/PRINCIPLES.md` already exists.

## Step 2: If PRINCIPLES.md exists, read and present it

Read `.planning/PRINCIPLES.md` and present its current contents. Ask the user what they want to change.

## Step 3: If PRINCIPLES.md does not exist, guide creation

Use AskUserQuestion to gather principles across these categories (ask one at a time):

1. **Coding Philosophy** — "What coding conventions matter most for this project? (e.g., composition over inheritance, functional style, no magic)"
2. **Testing Requirements** — "What testing standards should agents follow? (e.g., unit tests for all public functions, integration tests for APIs)"
3. **Architecture Constraints** — "Any architecture rules agents must respect? (e.g., no external deps without approval, event-driven state changes)"
4. **Documentation Standards** — "Documentation preferences? (e.g., JSDoc for public APIs only, no inline comments for obvious code)"
5. **Communication Style** — "Commit and PR conventions? (e.g., Conventional Commits, squash merges)"

## Step 4: Write PRINCIPLES.md

Write the file to `.planning/PRINCIPLES.md` with the gathered principles:

```markdown
# Project Principles

## Coding Philosophy
- {gathered principles}

## Testing Requirements
- {gathered principles}

## Architecture Constraints
- {gathered principles}

## Documentation Standards
- {gathered principles}

## Communication Style
- {gathered principles}
```

## Step 5: Commit

```bash
node $GRD_TOOLS_PATH/bin/grd-tools.js commit "docs: create project principles (PRINCIPLES.md)" --files .planning/PRINCIPLES.md
```
```

**Step 2: Commit**

```bash
git add commands/principles.md
git commit -m "feat(commands): add /grd:principles command for constitution layer"
```

---

## Task 7: Create `commands/discover.md` skill

**Files:**
- Create: `commands/discover.md`

**Step 1: Write the command skill**

```markdown
---
name: discover
description: Discover and extract coding standards from existing codebase patterns
allowed_tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
---

# Discover Codebase Standards

<trigger>
Use this workflow when:
- User runs /grd:discover
- User wants to extract coding patterns from their codebase
</trigger>

## Step 1: Get focus area

Use AskUserQuestion: "Which area of the codebase should I scan for patterns?"
Options: API, Database, Frontend, Testing, Configuration, Other (specify path)

If user provides an argument, use that as the area.

## Step 2: Find representative files

Use Glob to find 5-10 representative files in the specified area:
- For "api": `**/routes/**/*.{js,ts}`, `**/controllers/**/*.{js,ts}`, `**/api/**/*.{js,ts}`
- For "database": `**/models/**/*.{js,ts}`, `**/migrations/**/*.{js,ts,sql}`
- For "frontend": `**/components/**/*.{jsx,tsx,vue}`, `**/pages/**/*.{jsx,tsx}`
- For "testing": `**/tests/**/*.{test,spec}.{js,ts}`
- For other: use the provided path pattern

## Step 3: Analyze patterns

Read each file. Look for:
- Consistent naming conventions (file names, function names, variable names)
- Common import patterns
- Error handling patterns
- Response/return value structures
- Comment/documentation patterns
- Testing patterns (setup, assertions, teardown)

## Step 4: Present patterns interactively

For each distinct pattern found, present it to the user:
"I found this pattern: [description]. Is this a standard you want to enforce?"

Use AskUserQuestion with options: Yes (keep), No (skip), Modify (edit the description)

## Step 5: Write standard files

For each confirmed standard, write to `.planning/standards/{area}/{pattern-slug}.md`:

```markdown
---
area: {area}
tags: [{relevant, tags}]
---
# {Pattern Name}

{Description of the standard}

**Why:** {Rationale}
```

## Step 6: Update or create index.yml

Read existing `.planning/standards/index.yml` if it exists. Add new entries:

```yaml
{area}:
  {pattern-slug}:
    description: {one-line description}
    tags: [{tags}]
```

Write the updated index to `.planning/standards/index.yml`.

## Step 7: Commit

```bash
node $GRD_TOOLS_PATH/bin/grd-tools.js commit "docs: discover {area} standards" --files .planning/standards/
```
```

**Step 2: Commit**

```bash
git add commands/discover.md
git commit -m "feat(commands): add /grd:discover command for standards discovery"
```

---

## Task 8: Merge dashboard/health into progress command

**Files:**
- Modify: `commands/progress.md` (add dashboard and health sections)
- Remove: `commands/dashboard.md`
- Remove: `commands/health.md`
- Modify: `commands/help.md` (update command list)

**Step 1: Read current progress.md, dashboard.md, and health.md**

Read all three files to understand what each provides.

**Step 2: Merge dashboard and health into progress.md**

Update `commands/progress.md` to include:
- Default: smart routing (existing progress behavior)
- `--dashboard` or `--full`: include the TUI tree view from dashboard
- `--health`: include blockers, velocity, stale phases, risks from health
- `--phase N`: include phase detail drill-down (absorbs phase-detail command)

Update the init call to pass the `--dashboard`, `--health`, or `--phase` flag through.

**Step 3: Remove dashboard.md and health.md**

Delete `commands/dashboard.md` and `commands/health.md`.

Note: Do NOT remove `cmdDashboard`, `cmdHealth`, or `cmdPhaseDetail` from `lib/commands.js` yet — they are still used by `grd-tools.js` CLI. The CLI routes (`dashboard`, `phase-detail`, `health`) remain for backward compatibility and are called internally by the merged progress command.

**Step 4: Update help.md**

Remove `/grd:dashboard`, `/grd:health`, and `/grd:phase-detail` from the command list. Add notes that these are now part of `/grd:progress`.

**Step 5: Commit**

```bash
git add commands/progress.md commands/help.md
git rm commands/dashboard.md commands/health.md
git commit -m "feat(commands): merge dashboard and health into progress command"
```

---

## Task 9: Merge yolo and set-profile into settings command

**Files:**
- Modify: `commands/settings.md` (add yolo toggle and profile selection)
- Remove: `commands/yolo.md`
- Remove: `commands/set-profile.md`
- Modify: `commands/help.md` (update command list)

**Step 1: Read current settings.md, yolo.md, and set-profile.md**

Read all three files.

**Step 2: Add yolo and profile sections to settings.md**

Add to the settings command:
- A "Quick Toggles" section at the top that handles yolo and profile as direct arguments:
  - `/grd:settings yolo` — toggle autonomous mode (same as current yolo behavior)
  - `/grd:settings profile` — change model profile (same as current set-profile behavior)
  - `/grd:settings ceremony` — set default ceremony level
- The existing full settings flow remains for `/grd:settings` without arguments

**Step 3: Remove yolo.md and set-profile.md**

Delete the standalone commands.

**Step 4: Update help.md**

Remove `/grd:yolo` and `/grd:set-profile` from the command list. Note they're now `/grd:settings yolo` and `/grd:settings profile`.

**Step 5: Commit**

```bash
git add commands/settings.md commands/help.md
git rm commands/yolo.md commands/set-profile.md
git commit -m "feat(commands): merge yolo and set-profile into settings command"
```

---

## Task 10: Merge research-phase into plan-phase and eval-plan into plan-phase

**Files:**
- Modify: `commands/plan-phase.md` (ensure standalone research/eval are accessible)
- Remove: `commands/research-phase.md`
- Remove: `commands/eval-plan.md`
- Modify: `commands/help.md`

**Step 1: Read current research-phase.md and eval-plan.md**

Understand what standalone functionality they provide beyond what plan-phase already does.

**Step 2: Add flags to plan-phase.md**

Add documentation that:
- `/grd:plan-phase N --research-only` — runs only the researcher agent (replaces research-phase)
- `/grd:plan-phase N --eval-only` — runs only the eval planner agent (replaces eval-plan)
- These are convenience aliases for running subsets of the plan-phase pipeline

**Step 3: Remove standalone commands**

Delete `commands/research-phase.md` and `commands/eval-plan.md`.

**Step 4: Update help.md**

Remove the standalone commands. Add notes about the `--research-only` and `--eval-only` flags.

**Step 5: Commit**

```bash
git add commands/plan-phase.md commands/help.md
git rm commands/research-phase.md commands/eval-plan.md
git commit -m "feat(commands): merge research-phase and eval-plan into plan-phase"
```

---

## Task 11: Merge audit-milestone into complete-milestone

**Files:**
- Modify: `commands/complete-milestone.md` (add audit as first step)
- Remove: `commands/audit-milestone.md`
- Modify: `commands/help.md`

**Step 1: Read both commands**

Understand the audit flow and how it feeds into completion.

**Step 2: Modify complete-milestone.md**

Add audit as an automatic first step:
1. Run the integration checker agent (what audit-milestone does)
2. If audit fails, present findings and ask user whether to proceed or fix
3. If audit passes (or user overrides), proceed with milestone completion

**Step 3: Remove standalone audit command**

Delete `commands/audit-milestone.md`.

**Step 4: Update help.md**

**Step 5: Commit**

```bash
git add commands/complete-milestone.md commands/help.md
git rm commands/audit-milestone.md
git commit -m "feat(commands): merge audit-milestone into complete-milestone"
```

---

## Task 12: Remove phase-detail.md command (absorbed by progress --phase)

**Files:**
- Remove: `commands/phase-detail.md`
- Modify: `commands/help.md`

**Step 1: Verify phase-detail is fully absorbed**

Confirm that `commands/progress.md` (updated in Task 8) handles `--phase N` flag.

**Step 2: Remove standalone command**

Delete `commands/phase-detail.md`.

**Step 3: Update help.md**

**Step 4: Commit**

```bash
git rm commands/phase-detail.md
git add commands/help.md
git commit -m "feat(commands): remove phase-detail (absorbed by progress --phase)"
```

---

## Task 13: Update CLAUDE.md with new features

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md**

Add documentation for:
1. **PRINCIPLES.md** in the Planning Directory section
2. **Standards directory** (`.planning/standards/`) in the Planning Directory section
3. **Ceremony levels** (light/standard/full) in a new "Scale-Adaptive Ceremony" section
4. **Updated command count** (39 instead of 45)
5. **New commands** (`/grd:discover`, `/grd:principles`)
6. **Removed commands** with migration notes (dashboard→progress, yolo→settings, etc.)
7. **Ceremony config** section in Configuration

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new layers and consolidated commands"
```

---

## Task 14: Run full test suite and fix any regressions

**Files:**
- All modified files

**Step 1: Run full test suite**

Run: `npm test`

**Step 2: Fix any failures**

Address any regressions from the changes. The most likely failures:
- Tests that import removed commands
- Tests that check command count
- Tests that reference dashboard/health/yolo/set-profile directly

**Step 3: Run lint**

Run: `npm run lint`

**Step 4: Fix any lint issues**

Run: `npm run lint:fix` if needed.

**Step 5: Final test run**

Run: `npm test`
Expected: All 1,631+ tests pass.

**Step 6: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve test regressions from layered integration changes"
```

---

## Summary

| Task | Layer | What | Files Changed |
|------|-------|------|---------------|
| 1 | Standards | `standardsDir` in paths.js | 2 |
| 2 | Constitution | PRINCIPLES.md in init workflows | 2 |
| 3 | Ceremony | Ceremony level detection | 2 |
| 4 | Ceremony | Config defaults | 2 |
| 5 | Standards | Standards detection in init | 2 |
| 6 | Constitution | `/grd:principles` command | 1 |
| 7 | Standards | `/grd:discover` command | 1 |
| 8 | Consolidation | Merge dashboard/health → progress | 4 |
| 9 | Consolidation | Merge yolo/set-profile → settings | 4 |
| 10 | Consolidation | Merge research-phase/eval-plan → plan-phase | 4 |
| 11 | Consolidation | Merge audit → complete-milestone | 3 |
| 12 | Consolidation | Remove phase-detail | 2 |
| 13 | Docs | Update CLAUDE.md | 1 |
| 14 | QA | Full test suite + fixes | varies |

**Total: 14 tasks, ~30 files touched, net -6 command files**
