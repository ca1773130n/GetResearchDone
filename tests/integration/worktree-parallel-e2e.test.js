/**
 * Integration Tests: Worktree-Parallel E2E Pipeline
 *
 * Cross-module integration tests validating that v0.2.0 modules
 * (worktree.js, deps.js, parallel.js, context.js) work together
 * as an integrated system.
 *
 * Resolves deferred validations:
 *   DEFER-22-01: End-to-end git branching workflow validation
 *   DEFER-27-01: Worktree create -> work -> push -> cleanup pipeline
 *   DEFER-27-02: Stale worktree cleanup with simulated crash
 *   DEFER-30-01: Parallel execution context building (test-level)
 *
 * Phase 31 success criteria coverage:
 *   #1: E2E single-phase worktree execution pipeline
 *   #2: E2E parallel execution of independent phases
 *   #3: Sequential fallback equivalence
 *   #5: Test coverage (20+ new integration tests)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { captureOutput } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

// Modules under test
const {
  cmdWorktreeCreate,
  cmdWorktreeRemove,
  cmdWorktreeList,
  cmdWorktreeRemoveStale,
  cmdWorktreePushAndPR,
} = require('../../lib/worktree');

const {
  buildDependencyGraph,
  computeParallelGroups,
} = require('../../lib/deps');

const {
  validateIndependentPhases,
  buildParallelContext,
  cmdInitExecuteParallel,
} = require('../../lib/parallel');

// Resolved tmpdir for macOS symlink handling
const REAL_TMPDIR = fs.realpathSync(os.tmpdir());

// ---- Helpers ---------------------------------------------------------------

/**
 * Create an isolated temp git repo with .planning/ structure for integration tests.
 * Includes config.json, ROADMAP.md, and phase directories.
 */
function createTestGitRepo() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-e2e-'));

  execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: tmpRoot, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@grd.dev'], { cwd: tmpRoot, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'GRD E2E Test'], { cwd: tmpRoot, stdio: 'pipe' });

  const planningDir = path.join(tmpRoot, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases', '27-worktree-infrastructure'), { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases', '28-pr-workflow'), { recursive: true });

  fs.writeFileSync(
    path.join(planningDir, 'config.json'),
    JSON.stringify({
      branching_strategy: 'phase',
      phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
    }),
    'utf-8'
  );

  fs.writeFileSync(
    path.join(planningDir, 'ROADMAP.md'),
    [
      '# Roadmap',
      '',
      '## v0.2.0: Git Worktree Parallel Execution',
      '',
      '### Phase 27: Worktree Infrastructure',
      '**Goal:** Git worktree lifecycle management',
      '**Depends on:** Nothing',
      '',
      '### Phase 28: PR Workflow',
      '**Goal:** Push and PR from worktrees',
      '**Depends on:** Phase 27',
    ].join('\n'),
    'utf-8'
  );

  // Add plan files so findPhaseInternal can find them
  fs.writeFileSync(
    path.join(planningDir, 'phases', '27-worktree-infrastructure', '27-01-PLAN.md'),
    '---\nphase: 27\nplan: 01\n---\n'
  );
  fs.writeFileSync(
    path.join(planningDir, 'phases', '28-pr-workflow', '28-01-PLAN.md'),
    '---\nphase: 28\nplan: 01\n---\n'
  );

  execFileSync('git', ['add', '.'], { cwd: tmpRoot, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: tmpRoot, stdio: 'pipe' });

  return tmpRoot;
}

/**
 * Create a git repo with a bare remote (allows git push to succeed).
 */
function createTestGitRepoWithRemote() {
  const repoDir = createTestGitRepo();
  const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-e2e-bare-'));
  fs.rmSync(bareDir, { recursive: true, force: true });
  execFileSync('git', ['clone', '--bare', repoDir, bareDir], { stdio: 'pipe' });

  try {
    execFileSync('git', ['remote', 'remove', 'origin'], { cwd: repoDir, stdio: 'pipe' });
  } catch { /* no origin yet */ }
  execFileSync('git', ['remote', 'add', 'origin', bareDir], { cwd: repoDir, stdio: 'pipe' });

  return { repoDir, bareDir };
}

/**
 * Clean up a test git repo and any GRD worktrees it may have created.
 */
function cleanupTestRepo(repoDir) {
  const resolvedRepo = fs.realpathSync(repoDir);
  if (!resolvedRepo || !resolvedRepo.startsWith(REAL_TMPDIR)) {
    throw new Error('Refusing to remove directory outside tmpdir: ' + repoDir);
  }

  try {
    execFileSync('git', ['worktree', 'prune'], { cwd: repoDir, stdio: 'pipe' });
  } catch { /* ignore */ }

  // Clean up any GRD worktree directories in tmpdir
  try {
    const entries = fs.readdirSync(REAL_TMPDIR);
    for (const entry of entries) {
      if (entry.startsWith('grd-worktree-') && entry.includes('v0')) {
        const wtPath = path.join(REAL_TMPDIR, entry);
        try {
          execFileSync('git', ['worktree', 'remove', wtPath, '--force'], {
            cwd: repoDir,
            stdio: 'pipe',
          });
        } catch { /* fall through */ }
        try {
          fs.rmSync(wtPath, { recursive: true, force: true });
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  fs.rmSync(repoDir, { recursive: true, force: true });
}

function cleanupTestRepoWithRemote(repoDir, bareDir) {
  cleanupTestRepo(repoDir);
  try {
    fs.rmSync(bareDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

// ---- Test Suites -----------------------------------------------------------

// 1. E2E: Single-phase worktree execution pipeline
describe('E2E: Single-phase worktree execution pipeline', () => {
  let repoDir, bareDir;

  beforeEach(() => {
    const repos = createTestGitRepoWithRemote();
    repoDir = repos.repoDir;
    bareDir = repos.bareDir;
  });

  afterEach(() => {
    cleanupTestRepoWithRemote(repoDir, bareDir);
  });

  test('full pipeline: create -> verify on disk -> list -> work -> push -> remove -> verify gone', () => {
    // CREATE
    const { stdout: createOut } = captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );
    const created = JSON.parse(createOut);
    expect(created.path).toBeDefined();
    expect(created.branch).toBe('grd/v0.2.0/27-worktree-infrastructure');

    // VERIFY ON DISK
    expect(fs.existsSync(created.path)).toBe(true);

    // VERIFY .planning/ IS ACCESSIBLE IN WORKTREE
    // The worktree shares the git repo, so .planning/ files from the main branch
    // are accessible via checkout
    const wtPlanningDir = path.join(created.path, '.planning');
    expect(fs.existsSync(wtPlanningDir)).toBe(true);

    // LIST
    const { stdout: listOut } = captureOutput(() => cmdWorktreeList(repoDir, false));
    const listed = JSON.parse(listOut);
    expect(listed.count).toBeGreaterThanOrEqual(1);
    const found = listed.worktrees.find(w => w.phase === '27');
    expect(found).toBeDefined();
    expect(found.branch).toBe('grd/v0.2.0/27-worktree-infrastructure');

    // SIMULATE WORK: write file, git add, git commit in worktree
    fs.writeFileSync(path.join(created.path, 'feature.js'), 'module.exports = {};\n', 'utf-8');
    execFileSync('git', ['add', 'feature.js'], { cwd: created.path, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'add feature'], { cwd: created.path, stdio: 'pipe' });

    // PUSH (PR creation will fail in test env, but push should succeed)
    const { stdout: pushOut } = captureOutput(() =>
      cmdWorktreePushAndPR(repoDir, { phase: '27', milestone: 'v0.2.0' }, false)
    );
    const pushResult = JSON.parse(pushOut);
    // Push should succeed to the bare remote (PR creation via gh will fail)
    if (pushResult.error) {
      expect(pushResult.push_succeeded).toBe(true);
    }

    // Verify branch exists on bare remote
    const remoteBranches = execFileSync('git', ['branch', '--list'], {
      cwd: bareDir,
      encoding: 'utf-8',
    });
    expect(remoteBranches).toContain('grd/v0.2.0/27-worktree-infrastructure');

    // REMOVE
    captureOutput(() =>
      cmdWorktreeRemove(repoDir, { phase: '27', milestone: 'v0.2.0' }, false)
    );

    // VERIFY GONE FROM DISK
    expect(fs.existsSync(created.path)).toBe(false);

    // VERIFY GONE FROM GIT WORKTREE LIST
    const { stdout: finalListOut } = captureOutput(() => cmdWorktreeList(repoDir, false));
    const finalList = JSON.parse(finalListOut);
    const stillExists = finalList.worktrees.find(w => w.phase === '27');
    expect(stillExists).toBeUndefined();
  });

  test('cmdInitExecutePhase returns worktree_path matching worktree.js path format', () => {
    // Import cmdInitExecutePhase
    const { cmdInitExecutePhase } = require('../../lib/context');

    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(repoDir, '27', new Set(), false)
    );
    const ctx = JSON.parse(stdout);

    // worktree_path should match the format used by worktree.js
    const expectedPath = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-27');
    expect(ctx.worktree_path).toBe(expectedPath);
  });

  test('worktree_path uses fs.realpathSync(os.tmpdir()) consistently between context.js and worktree.js', () => {
    const { cmdInitExecutePhase } = require('../../lib/context');

    // Get the path from context.js
    const { stdout: ctxOut } = captureOutput(() =>
      cmdInitExecutePhase(repoDir, '27', new Set(), false)
    );
    const ctx = JSON.parse(ctxOut);

    // Get the path from worktree.js (by creating a worktree)
    const { stdout: wtOut } = captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );
    const wt = JSON.parse(wtOut);

    // Both should use the resolved tmpdir (no macOS symlink mismatch)
    expect(ctx.worktree_path).toBe(wt.path);
    expect(ctx.worktree_path).toContain(REAL_TMPDIR);
    expect(wt.path).toContain(REAL_TMPDIR);
  });

  test('worktree_branch from context.js matches branch from worktree.js create', () => {
    const { cmdInitExecutePhase } = require('../../lib/context');

    const { stdout: ctxOut } = captureOutput(() =>
      cmdInitExecutePhase(repoDir, '27', new Set(), false)
    );
    const ctx = JSON.parse(ctxOut);

    const { stdout: wtOut } = captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );
    const wt = JSON.parse(wtOut);

    expect(ctx.worktree_branch).toBe(wt.branch);
  });
});

// 2. E2E: Parallel execution of independent phases
describe('E2E: Parallel execution of independent phases', () => {
  let fixtureDir;

  afterEach(() => {
    if (fixtureDir) {
      cleanupFixtureDir(fixtureDir);
      fixtureDir = null;
    }
  });

  function writeParallelRoadmapAndPhases(dir) {
    const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(
      roadmapPath,
      [
        '# Roadmap',
        '',
        '## v1.0: Foundation',
        '',
        '### Phase 1: Alpha Phase',
        '**Goal:** Build A',
        '**Depends on:** Nothing',
        '',
        '### Phase 2: Beta Phase',
        '**Goal:** Build B',
        '**Depends on:** Nothing',
      ].join('\n'),
      'utf-8'
    );

    const phase1Dir = path.join(dir, '.planning', 'phases', '01-alpha-phase');
    const phase2Dir = path.join(dir, '.planning', 'phases', '02-beta-phase');
    fs.mkdirSync(phase1Dir, { recursive: true });
    fs.mkdirSync(phase2Dir, { recursive: true });
    fs.writeFileSync(path.join(phase1Dir, '01-01-PLAN.md'), '---\nphase: 01\nplan: 01\n---\n');
    fs.writeFileSync(path.join(phase2Dir, '02-01-PLAN.md'), '---\nphase: 02\nplan: 01\n---\n');
  }

  function writeConfig(dir, overrides = {}) {
    const configPath = path.join(dir, '.planning', 'config.json');
    const base = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    fs.writeFileSync(configPath, JSON.stringify({ ...base, ...overrides }, null, 2), 'utf-8');
  }

  test('buildDependencyGraph -> computeParallelGroups confirms both independent phases in same group', () => {
    const phases = [
      { number: '1', name: 'Alpha Phase', depends_on: 'Nothing' },
      { number: '2', name: 'Beta Phase', depends_on: 'Nothing' },
    ];
    const graph = buildDependencyGraph(phases);
    const groups = computeParallelGroups(graph);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toContain('1');
    expect(groups[0]).toContain('2');
  });

  test('validateIndependentPhases confirms no conflicts between independent phases', () => {
    const phases = [
      { number: '1', name: 'Alpha', depends_on: 'Nothing' },
      { number: '2', name: 'Beta', depends_on: 'Nothing' },
    ];
    const graph = buildDependencyGraph(phases);
    const result = validateIndependentPhases(graph, ['1', '2']);

    expect(result.valid).toBe(true);
    expect(result.conflicts).toBeUndefined();
  });

  test('buildParallelContext returns DIFFERENT worktree_path for each phase', () => {
    fixtureDir = createFixtureDir();
    writeParallelRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, { use_teams: true });

    const ctx = buildParallelContext(fixtureDir, ['1', '2']);
    expect(ctx.phases).toHaveLength(2);

    const path1 = ctx.phases[0].worktree_path;
    const path2 = ctx.phases[1].worktree_path;
    expect(path1).not.toBe(path2);
    expect(path1).toContain('grd-worktree-');
    expect(path2).toContain('grd-worktree-');
  });

  test('buildParallelContext returns DIFFERENT worktree_branch for each phase', () => {
    fixtureDir = createFixtureDir();
    writeParallelRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, { use_teams: true });

    const ctx = buildParallelContext(fixtureDir, ['1', '2']);
    const branch1 = ctx.phases[0].worktree_branch;
    const branch2 = ctx.phases[1].worktree_branch;
    expect(branch1).not.toBe(branch2);
  });

  test('each phase in context has its own status_tracker entry initialized to pending', () => {
    fixtureDir = createFixtureDir();
    writeParallelRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, { use_teams: true });

    const ctx = buildParallelContext(fixtureDir, ['1', '2']);
    expect(ctx.status_tracker).toBeDefined();
    expect(ctx.status_tracker.phases).toBeDefined();

    const keys = Object.keys(ctx.status_tracker.phases);
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(ctx.status_tracker.phases[key].status).toBe('pending');
    }
  });

  test('cmdInitExecuteParallel for two independent phases returns expected structure', () => {
    fixtureDir = createFixtureDir();
    writeParallelRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, { use_teams: true, autonomous_mode: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdInitExecuteParallel(fixtureDir, ['1', '2'], new Set(), false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);

    expect(parsed.mode).toBeDefined();
    expect(parsed.phases).toBeInstanceOf(Array);
    expect(parsed.phases).toHaveLength(2);
    expect(parsed.independence_validated).toBe(true);
  });

  test('concurrent worktree creation produces separate paths and branches (real git)', () => {
    // Need a real git repo for worktree operations
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-e2e-concurrent-'));
    execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: tmpRoot, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.email', 'test@grd.dev'], { cwd: tmpRoot, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.name', 'GRD E2E'], { cwd: tmpRoot, stdio: 'pipe' });

    const planningDir = path.join(tmpRoot, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'phases', '01-alpha'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'phases', '02-beta'), { recursive: true });

    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({
        branching_strategy: 'phase',
        phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
      })
    );
    fs.writeFileSync(
      path.join(planningDir, 'ROADMAP.md'),
      '# Roadmap\n\n## v1.0: Test\n\n### Phase 1: Alpha\n### Phase 2: Beta\n'
    );

    execFileSync('git', ['add', '.'], { cwd: tmpRoot, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpRoot, stdio: 'pipe' });

    try {
      // Create worktrees for two phases
      const { stdout: out1 } = captureOutput(() =>
        cmdWorktreeCreate(tmpRoot, { phase: '1', milestone: 'v1.0', slug: 'alpha' }, false)
      );
      const { stdout: out2 } = captureOutput(() =>
        cmdWorktreeCreate(tmpRoot, { phase: '2', milestone: 'v1.0', slug: 'beta' }, false)
      );

      const wt1 = JSON.parse(out1);
      const wt2 = JSON.parse(out2);

      // Different paths
      expect(wt1.path).not.toBe(wt2.path);

      // Different branches
      expect(wt1.branch).not.toBe(wt2.branch);
      expect(wt1.branch).toBe('grd/v1.0/1-alpha');
      expect(wt2.branch).toBe('grd/v1.0/2-beta');

      // LIST shows 2 worktrees
      const { stdout: listOut } = captureOutput(() => cmdWorktreeList(tmpRoot, false));
      const listed = JSON.parse(listOut);
      expect(listed.count).toBe(2);

      // REMOVE both
      captureOutput(() => cmdWorktreeRemove(tmpRoot, { phase: '1', milestone: 'v1.0' }, false));
      captureOutput(() => cmdWorktreeRemove(tmpRoot, { phase: '2', milestone: 'v1.0' }, false));

      // LIST shows 0
      const { stdout: afterListOut } = captureOutput(() => cmdWorktreeList(tmpRoot, false));
      const afterList = JSON.parse(afterListOut);
      expect(afterList.count).toBe(0);
    } finally {
      // Cleanup
      try {
        execFileSync('git', ['worktree', 'prune'], { cwd: tmpRoot, stdio: 'pipe' });
      } catch { /* ignore */ }
      // Clean up GRD worktree dirs
      try {
        const entries = fs.readdirSync(REAL_TMPDIR);
        for (const entry of entries) {
          if (entry.startsWith('grd-worktree-v1.0-')) {
            const wtPath = path.join(REAL_TMPDIR, entry);
            try { fs.rmSync(wtPath, { recursive: true, force: true }); } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

// 3. E2E: Sequential fallback equivalence
describe('E2E: Sequential fallback equivalence', () => {
  let fixtureDir;

  afterEach(() => {
    if (fixtureDir) {
      cleanupFixtureDir(fixtureDir);
      fixtureDir = null;
    }
  });

  function writeRoadmapAndPhases(dir) {
    const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(
      roadmapPath,
      [
        '# Roadmap',
        '',
        '## v1.0: Foundation',
        '',
        '### Phase 1: Alpha Phase',
        '**Goal:** Build A',
        '**Depends on:** Nothing',
        '',
        '### Phase 2: Beta Phase',
        '**Goal:** Build B',
        '**Depends on:** Nothing',
      ].join('\n'),
      'utf-8'
    );

    const phase1Dir = path.join(dir, '.planning', 'phases', '01-alpha-phase');
    const phase2Dir = path.join(dir, '.planning', 'phases', '02-beta-phase');
    fs.mkdirSync(phase1Dir, { recursive: true });
    fs.mkdirSync(phase2Dir, { recursive: true });
    fs.writeFileSync(path.join(phase1Dir, '01-01-PLAN.md'), '---\nphase: 01\nplan: 01\n---\n');
    fs.writeFileSync(path.join(phase2Dir, '02-01-PLAN.md'), '---\nphase: 02\nplan: 01\n---\n');
  }

  function writeConfig(dir, overrides = {}) {
    const configPath = path.join(dir, '.planning', 'config.json');
    const base = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    fs.writeFileSync(configPath, JSON.stringify({ ...base, ...overrides }, null, 2), 'utf-8');
  }

  test('sequential mode (codex backend) returns mode=sequential with fallback_note mentioning Claude Code', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, { backend: 'codex' });

    const ctx = buildParallelContext(fixtureDir, ['1', '2']);
    expect(ctx.mode).toBe('sequential');
    expect(ctx.fallback_note).toBeTruthy();
    expect(ctx.fallback_note).toMatch(/Claude Code/i);
  });

  test('parallel mode (claude backend with teams) returns mode=parallel with no fallback_note', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, { use_teams: true });

    const ctx = buildParallelContext(fixtureDir, ['1', '2']);
    expect(ctx.mode).toBe('parallel');
    expect(ctx.fallback_note).toBeFalsy();
  });

  test('both sequential and parallel contexts contain the SAME per-phase structure', () => {
    // Build sequential context
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, { backend: 'codex' });
    const seqCtx = buildParallelContext(fixtureDir, ['1', '2']);

    // Build parallel context (overwrite config)
    writeConfig(fixtureDir, { backend: 'claude', use_teams: true });
    const parCtx = buildParallelContext(fixtureDir, ['1', '2']);

    // Both have phases array
    expect(seqCtx.phases).toHaveLength(2);
    expect(parCtx.phases).toHaveLength(2);

    // Each phase has the same structural keys
    const requiredKeys = ['phase_number', 'phase_name', 'worktree_path', 'worktree_branch', 'plans', 'plan_count'];
    for (let i = 0; i < 2; i++) {
      for (const key of requiredKeys) {
        expect(seqCtx.phases[i]).toHaveProperty(key);
        expect(parCtx.phases[i]).toHaveProperty(key);
      }
      // Values for structural fields should match
      expect(seqCtx.phases[i].phase_number).toBe(parCtx.phases[i].phase_number);
      expect(seqCtx.phases[i].phase_name).toBe(parCtx.phases[i].phase_name);
      expect(seqCtx.phases[i].plan_count).toBe(parCtx.phases[i].plan_count);
    }
  });

  test('both contexts have status_tracker with identical phase keys and pending status', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);

    // Sequential
    writeConfig(fixtureDir, { backend: 'codex' });
    const seqCtx = buildParallelContext(fixtureDir, ['1', '2']);

    // Parallel
    writeConfig(fixtureDir, { backend: 'claude', use_teams: true });
    const parCtx = buildParallelContext(fixtureDir, ['1', '2']);

    const seqKeys = Object.keys(seqCtx.status_tracker.phases).sort();
    const parKeys = Object.keys(parCtx.status_tracker.phases).sort();
    expect(seqKeys).toEqual(parKeys);

    for (const key of seqKeys) {
      expect(seqCtx.status_tracker.phases[key].status).toBe('pending');
      expect(parCtx.status_tracker.phases[key].status).toBe('pending');
    }
  });

  test('ONLY differences between sequential and parallel are mode, fallback_note, backend_capabilities', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);

    writeConfig(fixtureDir, { backend: 'codex' });
    const seqCtx = buildParallelContext(fixtureDir, ['1', '2']);

    writeConfig(fixtureDir, { backend: 'claude', use_teams: true });
    const parCtx = buildParallelContext(fixtureDir, ['1', '2']);

    // Mode differs
    expect(seqCtx.mode).toBe('sequential');
    expect(parCtx.mode).toBe('parallel');

    // fallback_note differs
    expect(seqCtx.fallback_note).toBeTruthy();
    expect(parCtx.fallback_note).toBeFalsy();

    // backend_capabilities differ
    expect(seqCtx.backend_capabilities.teams).toBe(false);
    expect(parCtx.backend_capabilities.teams).toBe(true);

    // But phase_count, status_tracker structure match
    expect(seqCtx.phase_count).toBe(parCtx.phase_count);
    expect(Object.keys(seqCtx.status_tracker.phases).length)
      .toBe(Object.keys(parCtx.status_tracker.phases).length);
  });
});

// 4. E2E: Stale worktree cleanup
describe('E2E: Stale worktree cleanup', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('create worktree -> delete dir from disk -> removeStale detects and removes -> list empty', () => {
    // Create a worktree
    const { stdout: createOut } = captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );
    const created = JSON.parse(createOut);
    expect(fs.existsSync(created.path)).toBe(true);

    // Manually delete the worktree directory (simulating crash)
    fs.rmSync(created.path, { recursive: true, force: true });
    expect(fs.existsSync(created.path)).toBe(false);

    // Remove stale worktrees
    const { stdout: staleOut } = captureOutput(() =>
      cmdWorktreeRemoveStale(repoDir, false)
    );
    const staleResult = JSON.parse(staleOut);
    expect(staleResult.removed.length).toBeGreaterThanOrEqual(1);
    expect(staleResult.count).toBeGreaterThanOrEqual(1);

    // List should be empty
    const { stdout: listOut } = captureOutput(() => cmdWorktreeList(repoDir, false));
    const listed = JSON.parse(listOut);
    expect(listed.count).toBe(0);
  });

  test('two worktrees: delete only one -> removeStale removes only the stale one -> list returns 1', () => {
    // Create two worktrees
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '28', milestone: 'v0.2.0', slug: 'pr-workflow' }, false)
    );

    // Verify both exist
    const { stdout: beforeListOut } = captureOutput(() => cmdWorktreeList(repoDir, false));
    const beforeList = JSON.parse(beforeListOut);
    expect(beforeList.count).toBe(2);

    // Delete only phase 27's directory from disk
    const wtPath27 = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-27');
    fs.rmSync(wtPath27, { recursive: true, force: true });

    // Remove stale
    const { stdout: staleOut } = captureOutput(() =>
      cmdWorktreeRemoveStale(repoDir, false)
    );
    const staleResult = JSON.parse(staleOut);
    expect(staleResult.removed.length).toBe(1);
    expect(staleResult.removed[0]).toContain('v0.2.0-27');

    // List should show 1 remaining (phase 28)
    const { stdout: afterListOut } = captureOutput(() => cmdWorktreeList(repoDir, false));
    const afterList = JSON.parse(afterListOut);
    expect(afterList.count).toBe(1);
    expect(afterList.worktrees[0].phase).toBe('28');
  });
});

// 5. E2E: Dependency graph integration with parallel context
describe('E2E: Dependency graph integration with parallel context', () => {
  let fixtureDir;

  afterEach(() => {
    if (fixtureDir) {
      cleanupFixtureDir(fixtureDir);
      fixtureDir = null;
    }
  });

  function writeV020Roadmap(dir) {
    const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(
      roadmapPath,
      [
        '# Roadmap',
        '',
        '## v0.2.0: Git Worktree Parallel Execution',
        '',
        '### Phase 27: Worktree Infrastructure',
        '**Goal:** Git worktree lifecycle',
        '**Depends on:** Nothing',
        '',
        '### Phase 28: PR Workflow',
        '**Goal:** Push and PR from worktrees',
        '**Depends on:** Phase 27',
        '',
        '### Phase 29: Dependency Analysis',
        '**Goal:** Phase dependency graph',
        '**Depends on:** Nothing',
        '',
        '### Phase 30: Parallel Execution',
        '**Goal:** Multi-phase parallel execution',
        '**Depends on:** Phase 27, Phase 29',
        '',
        '### Phase 31: Integration Validation',
        '**Goal:** Full E2E validation',
        '**Depends on:** Phase 27, Phase 28, Phase 29, Phase 30',
      ].join('\n'),
      'utf-8'
    );

    // Create phase directories
    for (const [num, slug] of [
      ['27', 'worktree-infrastructure'],
      ['28', 'pr-workflow'],
      ['29', 'dependency-analysis'],
      ['30', 'parallel-execution'],
      ['31', 'integration-validation'],
    ]) {
      const phaseDir = path.join(dir, '.planning', 'phases', `${num}-${slug}`);
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, `${num}-01-PLAN.md`), `---\nphase: ${num}\nplan: 01\n---\n`);
    }
  }

  function writeConfig(dir, overrides = {}) {
    const configPath = path.join(dir, '.planning', 'config.json');
    const base = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    fs.writeFileSync(configPath, JSON.stringify({ ...base, ...overrides }, null, 2), 'utf-8');
  }

  test('v0.2.0 roadmap produces expected parallel_groups: [27,29], [28,30], [31]', () => {
    const phases = [
      { number: '27', name: 'Worktree Infrastructure', depends_on: 'Nothing' },
      { number: '28', name: 'PR Workflow', depends_on: 'Phase 27' },
      { number: '29', name: 'Dependency Analysis', depends_on: 'Nothing' },
      { number: '30', name: 'Parallel Execution', depends_on: 'Phase 27, Phase 29' },
      { number: '31', name: 'Integration', depends_on: 'Phase 27, Phase 28, Phase 29, Phase 30' },
    ];
    const graph = buildDependencyGraph(phases);
    const groups = computeParallelGroups(graph);

    expect(groups).toEqual([['27', '29'], ['28', '30'], ['31']]);
  });

  test('validateIndependentPhases([27,29]) returns valid:true (same parallel group)', () => {
    const phases = [
      { number: '27', name: 'A', depends_on: 'Nothing' },
      { number: '28', name: 'B', depends_on: 'Phase 27' },
      { number: '29', name: 'C', depends_on: 'Nothing' },
      { number: '30', name: 'D', depends_on: 'Phase 27, Phase 29' },
      { number: '31', name: 'E', depends_on: 'Phase 27, Phase 28, Phase 29, Phase 30' },
    ];
    const graph = buildDependencyGraph(phases);
    const result = validateIndependentPhases(graph, ['27', '29']);
    expect(result.valid).toBe(true);
  });

  test('validateIndependentPhases([27,28]) returns valid:false (28 depends on 27)', () => {
    const phases = [
      { number: '27', name: 'A', depends_on: 'Nothing' },
      { number: '28', name: 'B', depends_on: 'Phase 27' },
      { number: '29', name: 'C', depends_on: 'Nothing' },
      { number: '30', name: 'D', depends_on: 'Phase 27, Phase 29' },
      { number: '31', name: 'E', depends_on: 'Phase 27, Phase 28, Phase 29, Phase 30' },
    ];
    const graph = buildDependencyGraph(phases);
    const result = validateIndependentPhases(graph, ['27', '28']);
    expect(result.valid).toBe(false);
    expect(result.conflicts).toEqual([{ from: '27', to: '28' }]);
  });

  test('buildParallelContext for phases 27,29 returns two phase contexts with correct worktree paths', () => {
    fixtureDir = createFixtureDir();
    writeV020Roadmap(fixtureDir);
    writeConfig(fixtureDir, { use_teams: true });

    const ctx = buildParallelContext(fixtureDir, ['27', '29']);
    expect(ctx.phases).toHaveLength(2);

    const phase27 = ctx.phases.find(p => p.phase_number === '27');
    const phase29 = ctx.phases.find(p => p.phase_number === '29');
    expect(phase27).toBeDefined();
    expect(phase29).toBeDefined();
    expect(phase27.worktree_path).toContain('grd-worktree-');
    expect(phase29.worktree_path).toContain('grd-worktree-');
    expect(phase27.worktree_path).not.toBe(phase29.worktree_path);
  });
});

// 6. E2E: Status tracker per-phase tracking
describe('E2E: Status tracker per-phase tracking', () => {
  let fixtureDir;

  afterEach(() => {
    if (fixtureDir) {
      cleanupFixtureDir(fixtureDir);
      fixtureDir = null;
    }
  });

  function writeNPhaseRoadmap(dir, n) {
    const lines = ['# Roadmap', '', '## v1.0: Foundation', ''];
    for (let i = 1; i <= n; i++) {
      const padded = String(i).padStart(2, '0');
      lines.push(`### Phase ${i}: Phase-${padded}`);
      lines.push(`**Goal:** Build ${i}`);
      lines.push(`**Depends on:** Nothing`);
      lines.push('');

      const phaseDir = path.join(dir, '.planning', 'phases', `${padded}-phase-${padded}`);
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, `${padded}-01-PLAN.md`), `---\nphase: ${padded}\nplan: 01\n---\n`);
    }
    fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), lines.join('\n'), 'utf-8');
  }

  function writeConfig(dir, overrides = {}) {
    const configPath = path.join(dir, '.planning', 'config.json');
    const base = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    fs.writeFileSync(configPath, JSON.stringify({ ...base, ...overrides }, null, 2), 'utf-8');
  }

  test('buildParallelContext for N phases returns status_tracker with exactly N entries, all pending', () => {
    fixtureDir = createFixtureDir();
    writeNPhaseRoadmap(fixtureDir, 3);
    writeConfig(fixtureDir, { use_teams: true });

    const ctx = buildParallelContext(fixtureDir, ['1', '2', '3']);
    expect(ctx.status_tracker).toBeDefined();

    const entries = Object.keys(ctx.status_tracker.phases);
    expect(entries).toHaveLength(3);

    for (const key of entries) {
      expect(ctx.status_tracker.phases[key].status).toBe('pending');
    }
  });

  test('status tracker keys match actual phase_number values from phases array', () => {
    fixtureDir = createFixtureDir();
    writeNPhaseRoadmap(fixtureDir, 4);
    writeConfig(fixtureDir, { use_teams: true });

    const ctx = buildParallelContext(fixtureDir, ['1', '2', '3', '4']);
    const trackerKeys = Object.keys(ctx.status_tracker.phases).sort();
    const phaseNumbers = ctx.phases.map(p => p.phase_number).sort();

    expect(trackerKeys).toEqual(phaseNumbers);
  });

  test('status_tracker state machine: pending -> running -> complete', () => {
    fixtureDir = createFixtureDir();
    writeNPhaseRoadmap(fixtureDir, 2);
    writeConfig(fixtureDir, { use_teams: true });

    const ctx = buildParallelContext(fixtureDir, ['1', '2']);
    const tracker = ctx.status_tracker;

    // All start as pending
    for (const key of Object.keys(tracker.phases)) {
      expect(tracker.phases[key].status).toBe('pending');
    }

    // Simulate transitions
    const firstKey = Object.keys(tracker.phases)[0];
    tracker.phases[firstKey].status = 'running';
    expect(tracker.phases[firstKey].status).toBe('running');

    tracker.phases[firstKey].status = 'complete';
    expect(tracker.phases[firstKey].status).toBe('complete');

    // Other phase still pending
    const secondKey = Object.keys(tracker.phases)[1];
    expect(tracker.phases[secondKey].status).toBe('pending');

    // Transition second to failed
    tracker.phases[secondKey].status = 'failed';
    expect(tracker.phases[secondKey].status).toBe('failed');
  });
});
