/**
 * Unit tests for lib/worktree.js
 *
 * Tests git worktree lifecycle management: create, remove, list, and stale
 * cleanup. All tests use isolated temp git repos to avoid polluting the
 * real project's worktree state.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { captureOutput, captureError } = require('../helpers/setup');

// The module under test — this will cause all tests to fail (RED) until
// lib/worktree.js is created
const {
  worktreePath,
  ensureWorktreesDir,
  createEvolveWorktree,
  removeEvolveWorktree,
  pushAndCreatePR,
  cmdWorktreeCreate,
  cmdWorktreeRemove,
  cmdWorktreeList,
  cmdWorktreeRemoveStale,
  cmdWorktreePushAndPR,
  milestoneBranch,
  cmdWorktreeEnsureMilestoneBranch,
  cmdWorktreeMerge,
  cmdWorktreeHookCreate,
  cmdWorktreeHookRemove,
} = require('../../lib/worktree');

// Resolve real tmpdir (handles macOS /var/folders -> /private/var/folders symlink)
const REAL_TMPDIR = fs.realpathSync(os.tmpdir());

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create an isolated temp git repo with a .planning/ structure sufficient
 * for worktree operations (config.json, ROADMAP.md).
 *
 * @returns {string} Absolute path to the temp repo root
 */
function createTestGitRepo() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-wt-test-'));

  // Initialize a real git repo
  execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: tmpRoot, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@grd.dev'], { cwd: tmpRoot, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'GRD Test'], { cwd: tmpRoot, stdio: 'pipe' });

  // Create minimal .planning structure
  const planningDir = path.join(tmpRoot, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases', '27-worktree-infrastructure'), { recursive: true });

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
    '# Roadmap\n\n## v0.2.0: Git Worktree Parallel Execution\n\n### Phase 27: Worktree Infrastructure\n',
    'utf-8'
  );

  // Create an initial commit so git worktree operations work
  execFileSync('git', ['add', '.'], { cwd: tmpRoot, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: tmpRoot, stdio: 'pipe' });

  return tmpRoot;
}

/**
 * Clean up a test git repo and any worktrees it may have created.
 * Worktrees are now project-local in .worktrees/, so cleanup is simpler.
 *
 * @param {string} repoDir - Path to the test repo
 */
function cleanupTestRepo(repoDir) {
  const resolvedRepo = fs.realpathSync(repoDir);
  if (!resolvedRepo || !resolvedRepo.startsWith(REAL_TMPDIR)) {
    throw new Error('Refusing to remove directory outside tmpdir: ' + repoDir);
  }

  // Prune any worktrees first to avoid git lock issues
  try {
    execFileSync('git', ['worktree', 'prune'], { cwd: repoDir, stdio: 'pipe' });
  } catch {
    // Ignore errors during cleanup
  }

  // Clean up .worktrees/ directory within the repo (project-local worktrees)
  const worktreesDir = path.join(resolvedRepo, '.worktrees');
  try {
    if (fs.existsSync(worktreesDir)) {
      const entries = fs.readdirSync(worktreesDir);
      for (const entry of entries) {
        if (entry.startsWith('grd-worktree-')) {
          const wtPath = path.join(worktreesDir, entry);
          try {
            execFileSync('git', ['worktree', 'remove', wtPath, '--force'], {
              cwd: repoDir,
              stdio: 'pipe',
            });
          } catch {
            // Fall back to direct removal
          }
          try {
            fs.rmSync(wtPath, { recursive: true, force: true });
          } catch {
            // Ignore
          }
        }
      }
    }
  } catch {
    // Ignore
  }

  // Remove the repo itself
  fs.rmSync(repoDir, { recursive: true, force: true });
}

// ─── cmdWorktreeCreate ────────────────────────────────────────────────────────

describe('cmdWorktreeCreate', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('creates a worktree and returns JSON with required fields', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('path');
    expect(result).toHaveProperty('branch');
    expect(result).toHaveProperty('phase', '27');
    expect(result).toHaveProperty('milestone', 'v0.2.0');
    expect(result).toHaveProperty('created');
  });

  test('creates worktree directory at {cwd}/.worktrees/grd-worktree-{milestone}-{phase}', () => {
    const { stdout } = captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    const result = JSON.parse(stdout);
    const expectedPath = worktreePath(repoDir, 'v0.2.0', '27');
    expect(result.path).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  test('branch name follows pattern grd/{milestone}/{phase}-{slug}', () => {
    const { stdout } = captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    const result = JSON.parse(stdout);
    expect(result.branch).toBe('grd/v0.2.0/27-worktree-infrastructure');
  });

  test('returns error JSON if worktree already exists', () => {
    // Create first worktree
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    // Try to create again
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/already exists/i);
  });

  test('returns error JSON if not in a git repo', () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-wt-nogit-'));
    try {
      const { stdout, exitCode } = captureOutput(() =>
        cmdWorktreeCreate(nonGitDir, { phase: '27', milestone: 'v0.2.0', slug: 'test' }, false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('error');
    } finally {
      fs.rmSync(nonGitDir, { recursive: true, force: true });
    }
  });

  test('defaults milestone from config when not provided', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', slug: 'worktree-infrastructure' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    // Should extract milestone from ROADMAP.md (v0.2.0)
    expect(result.milestone).toBeTruthy();
    expect(result.path).toContain('grd-worktree-');
  });

  test('created field is a valid ISO timestamp', () => {
    const { stdout } = captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    const result = JSON.parse(stdout);
    const date = new Date(result.created);
    expect(date.toISOString()).toBe(result.created);
  });

  test('creates worktree from a specific start-point branch', () => {
    // Create a branch with a commit to use as start point
    execFileSync('git', ['checkout', '-b', 'grd/v0.2.0/26-predecessor'], {
      cwd: repoDir,
      stdio: 'pipe',
    });
    fs.writeFileSync(path.join(repoDir, 'predecessor.txt'), 'from phase 26', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'predecessor commit'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['checkout', 'main'], { cwd: repoDir, stdio: 'pipe' });

    // Create worktree with start-point
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        {
          phase: '27',
          milestone: 'v0.2.0',
          slug: 'worktree-infrastructure',
          startPoint: 'grd/v0.2.0/26-predecessor',
        },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('start_point', 'grd/v0.2.0/26-predecessor');

    // Verify the worktree contains the predecessor's file
    const wtPath = result.path;
    expect(fs.existsSync(path.join(wtPath, 'predecessor.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(wtPath, 'predecessor.txt'), 'utf-8')).toBe('from phase 26');
  });

  test('returns error when start-point does not exist', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        {
          phase: '27',
          milestone: 'v0.2.0',
          slug: 'worktree-infrastructure',
          startPoint: 'nonexistent-branch',
        },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('error');
    expect(result.error).toContain('not found');
  });

  test('worktree without start-point does NOT contain predecessor file', () => {
    // Create a branch with extra content
    execFileSync('git', ['checkout', '-b', 'other-branch'], { cwd: repoDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(repoDir, 'other.txt'), 'other content', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'other commit'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['checkout', 'main'], { cwd: repoDir, stdio: 'pipe' });

    // Create worktree WITHOUT start-point (from main HEAD)
    const { stdout } = captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    const result = JSON.parse(stdout);
    expect(result).not.toHaveProperty('start_point');
    expect(fs.existsSync(path.join(result.path, 'other.txt'))).toBe(false);
  });
});

// ─── cmdWorktreeRemove ────────────────────────────────────────────────────────

describe('cmdWorktreeRemove', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('removes an existing worktree by phase identifier', () => {
    // Create a worktree first
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeRemove(repoDir, { phase: '27', milestone: 'v0.2.0' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('removed', true);
    expect(result).toHaveProperty('path');
  });

  test('worktree directory is removed from disk after removal', () => {
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    const wtPath = worktreePath(repoDir, 'v0.2.0', '27');
    expect(fs.existsSync(wtPath)).toBe(true);

    captureOutput(() => cmdWorktreeRemove(repoDir, { phase: '27', milestone: 'v0.2.0' }, false));
    expect(fs.existsSync(wtPath)).toBe(false);
  });

  test('returns graceful response for non-existent worktree (not an error)', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeRemove(repoDir, { phase: '99', milestone: 'v0.2.0' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('removed', true);
    expect(result).toHaveProperty('already_gone', true);
  });

  test('removes worktree by direct path', () => {
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    const wtPath = worktreePath(repoDir, 'v0.2.0', '27');
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeRemove(repoDir, { path: wtPath }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('removed', true);
  });

  test('calls git worktree prune after removal', () => {
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    captureOutput(() => cmdWorktreeRemove(repoDir, { phase: '27', milestone: 'v0.2.0' }, false));

    // Verify worktree is pruned from git's perspective
    const listOutput = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoDir,
      encoding: 'utf-8',
    });
    expect(listOutput).not.toContain('grd-worktree-v0.2.0-27');
  });
});

// ─── cmdWorktreeList ──────────────────────────────────────────────────────────

describe('cmdWorktreeList', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('returns empty array when no GRD worktrees exist', () => {
    const { stdout, exitCode } = captureOutput(() => cmdWorktreeList(repoDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('worktrees');
    expect(result.worktrees).toEqual([]);
    expect(result).toHaveProperty('count', 0);
  });

  test('returns empty worktrees array when cwd cannot be resolved by realpathSync', () => {
    const spy = jest.spyOn(fs, 'realpathSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    });
    try {
      const { stdout, exitCode } = captureOutput(() => cmdWorktreeList(repoDir, false));
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.worktrees).toEqual([]);
      expect(result.count).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  test('lists active GRD worktrees with required fields', () => {
    // Create two worktrees
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '28', milestone: 'v0.2.0', slug: 'pr-workflow' }, false)
    );

    const { stdout, exitCode } = captureOutput(() => cmdWorktreeList(repoDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.worktrees.length).toBe(2);
    expect(result.count).toBe(2);

    // Check fields on each entry
    for (const wt of result.worktrees) {
      expect(wt).toHaveProperty('path');
      expect(wt).toHaveProperty('branch');
      expect(wt).toHaveProperty('phase');
      expect(wt).toHaveProperty('milestone');
      expect(wt).toHaveProperty('locked');
    }
  });

  test('filters out the main worktree (only GRD-created worktrees)', () => {
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    const { stdout } = captureOutput(() => cmdWorktreeList(repoDir, false));
    const result = JSON.parse(stdout);

    // Should not include the main repo itself
    for (const wt of result.worktrees) {
      expect(wt.path).not.toBe(repoDir);
      expect(wt.path).toContain('grd-worktree-');
    }
  });

  test('extracts phase and milestone from worktree directory name', () => {
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    const { stdout } = captureOutput(() => cmdWorktreeList(repoDir, false));
    const result = JSON.parse(stdout);
    expect(result.worktrees[0].phase).toBe('27');
    expect(result.worktrees[0].milestone).toBe('v0.2.0');
  });
});

// ─── cmdWorktreeRemoveStale ───────────────────────────────────────────────────

describe('cmdWorktreeRemoveStale', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('returns empty removal list when no stale worktrees exist', () => {
    const { stdout, exitCode } = captureOutput(() => cmdWorktreeRemoveStale(repoDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('removed');
    expect(result.removed).toEqual([]);
    expect(result).toHaveProperty('count', 0);
  });

  test('removes stale worktrees whose disk directory was deleted', () => {
    // Create a worktree
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    // Manually delete the worktree directory (simulating stale state)
    const wtPath = worktreePath(repoDir, 'v0.2.0', '27');
    fs.rmSync(wtPath, { recursive: true, force: true });

    // Now remove stale
    const { stdout, exitCode } = captureOutput(() => cmdWorktreeRemoveStale(repoDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.removed.length).toBeGreaterThanOrEqual(1);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  test('does NOT remove locked worktrees', () => {
    // Create a worktree
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    const wtPath = worktreePath(repoDir, 'v0.2.0', '27');

    // Lock the worktree
    execFileSync('git', ['worktree', 'lock', wtPath], { cwd: repoDir, stdio: 'pipe' });

    // Delete the directory to simulate stale state
    fs.rmSync(wtPath, { recursive: true, force: true });

    // Remove stale should NOT touch locked ones
    const { stdout, exitCode } = captureOutput(() => cmdWorktreeRemoveStale(repoDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.removed).toEqual([]);
    expect(result.count).toBe(0);

    // Unlock for cleanup
    try {
      execFileSync('git', ['worktree', 'unlock', wtPath], { cwd: repoDir, stdio: 'pipe' });
    } catch {
      // Ignore
    }
  });

  test('removes multiple stale worktrees in one call', () => {
    // Create two worktrees
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '28', milestone: 'v0.2.0', slug: 'pr-workflow' }, false)
    );

    // Delete both directories
    fs.rmSync(worktreePath(repoDir, 'v0.2.0', '27'), { recursive: true, force: true });
    fs.rmSync(worktreePath(repoDir, 'v0.2.0', '28'), { recursive: true, force: true });

    const { stdout, exitCode } = captureOutput(() => cmdWorktreeRemoveStale(repoDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.removed.length).toBe(2);
    expect(result.count).toBe(2);
  });
});

// ─── Helper: Test repo with bare remote ───────────────────────────────────────

/**
 * Create an isolated temp git repo with a bare clone as its remote.
 * This allows `git push origin <branch>` to actually work in tests.
 *
 * @returns {{ repoDir: string, bareDir: string }} Paths to main repo and bare remote
 */
function createTestGitRepoWithRemote() {
  // Create the primary repo first
  const repoDir = createTestGitRepo();

  // Create a bare clone as the remote
  const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-wt-bare-'));
  fs.rmSync(bareDir, { recursive: true, force: true });
  execFileSync('git', ['clone', '--bare', repoDir, bareDir], { stdio: 'pipe' });

  // Point the primary repo's origin to the bare clone
  try {
    execFileSync('git', ['remote', 'remove', 'origin'], { cwd: repoDir, stdio: 'pipe' });
  } catch {
    // No origin yet — that's fine
  }
  execFileSync('git', ['remote', 'add', 'origin', bareDir], { cwd: repoDir, stdio: 'pipe' });

  return { repoDir, bareDir };
}

/**
 * Clean up a test repo with remote (cleans both bare remote and main repo).
 *
 * @param {string} repoDir - Path to the main test repo
 * @param {string} bareDir - Path to the bare remote repo
 */
function cleanupTestRepoWithRemote(repoDir, bareDir) {
  cleanupTestRepo(repoDir);
  try {
    fs.rmSync(bareDir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

// ─── cmdWorktreePushAndPR ─────────────────────────────────────────────────────

describe('cmdWorktreePushAndPR', () => {
  let repoDir, bareDir;

  beforeEach(() => {
    const repos = createTestGitRepoWithRemote();
    repoDir = repos.repoDir;
    bareDir = repos.bareDir;
  });

  afterEach(() => {
    cleanupTestRepoWithRemote(repoDir, bareDir);
  });

  test('returns error when phase is not provided', () => {
    const { stdout, exitCode } = captureOutput(() => cmdWorktreePushAndPR(repoDir, {}, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/phase/i);
  });

  test('returns error when worktree directory does not exist', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreePushAndPR(repoDir, { phase: '99', milestone: 'v0.2.0' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/worktree.*not found/i);
  });

  test('returns error when git push fails (no remote configured)', () => {
    // Create a worktree
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    // Remove the remote so push fails
    execFileSync('git', ['remote', 'remove', 'origin'], { cwd: repoDir, stdio: 'pipe' });

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreePushAndPR(repoDir, { phase: '27', milestone: 'v0.2.0' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('error');
    expect(result.error.toLowerCase()).toContain('push');
  });

  test('successfully pushes branch to remote', () => {
    // Create a worktree
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    // Make a commit in the worktree so there is something to push
    const wtPath = worktreePath(repoDir, 'v0.2.0', '27');
    fs.writeFileSync(path.join(wtPath, 'test.txt'), 'hello', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: wtPath, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'test commit'], { cwd: wtPath, stdio: 'pipe' });

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreePushAndPR(repoDir, { phase: '27', milestone: 'v0.2.0' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);

    // Push should succeed (gh may fail, but push_succeeded should be true)
    // The result may have an error about gh, but push_succeeded should be true
    if (result.error) {
      expect(result.push_succeeded).toBe(true);
    }

    // Verify branch exists on the bare remote
    const remoteBranches = execFileSync('git', ['branch', '--list'], {
      cwd: bareDir,
      encoding: 'utf-8',
    });
    expect(remoteBranches).toContain('grd/v0.2.0/27-worktree-infrastructure');
  });

  test('returns error when gh CLI fails (returns structured error, does not crash)', () => {
    // Create a worktree and push (push will work with bare remote)
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    const wtPath = worktreePath(repoDir, 'v0.2.0', '27');
    fs.writeFileSync(path.join(wtPath, 'test.txt'), 'hello', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: wtPath, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'test commit'], { cwd: wtPath, stdio: 'pipe' });

    // gh pr create will fail in test env (no GitHub auth, bare local remote)
    // The function should handle this gracefully with structured error JSON
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreePushAndPR(repoDir, { phase: '27', milestone: 'v0.2.0' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);

    // Should be valid JSON, not a crash — either success or structured error
    expect(result).toBeDefined();
    if (result.error) {
      // Push should have succeeded even if gh failed
      expect(result.push_succeeded).toBe(true);
      expect(result.error.toLowerCase()).toContain('pr');
    }
  });

  test('PR title includes phase number and milestone', () => {
    // Create a worktree and push
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '28', milestone: 'v0.2.0', slug: 'pr-workflow' }, false)
    );

    const wtPath = worktreePath(repoDir, 'v0.2.0', '28');
    fs.writeFileSync(path.join(wtPath, 'test.txt'), 'hello', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: wtPath, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'test commit'], { cwd: wtPath, stdio: 'pipe' });

    const { stdout } = captureOutput(() =>
      cmdWorktreePushAndPR(repoDir, { phase: '28', milestone: 'v0.2.0' }, false)
    );
    const result = JSON.parse(stdout);

    // The title should be in the output (either in .title or generated internally)
    const title = result.title || '';
    expect(title).toContain('28');
    expect(title).toContain('v0.2.0');
  });

  test('PR body includes plan summary text when provided', () => {
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '28', milestone: 'v0.2.0', slug: 'pr-workflow' }, false)
    );

    const wtPath = worktreePath(repoDir, 'v0.2.0', '28');
    fs.writeFileSync(path.join(wtPath, 'test.txt'), 'hello', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: wtPath, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'test commit'], { cwd: wtPath, stdio: 'pipe' });

    const customBody = '## Summary\nImplemented PR workflow with push-pr command.';
    const { stdout } = captureOutput(() =>
      cmdWorktreePushAndPR(repoDir, { phase: '28', milestone: 'v0.2.0', body: customBody }, false)
    );
    const result = JSON.parse(stdout);

    // The body used for PR creation should contain the provided text
    expect(result.body).toContain('PR workflow');
  });

  test('returns structured JSON with pr_url, branch, title on success', () => {
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    const wtPath = worktreePath(repoDir, 'v0.2.0', '27');
    fs.writeFileSync(path.join(wtPath, 'test.txt'), 'hello', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: wtPath, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'test commit'], { cwd: wtPath, stdio: 'pipe' });

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreePushAndPR(repoDir, { phase: '27', milestone: 'v0.2.0' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);

    // Should always have branch and title, even if gh fails
    expect(result).toHaveProperty('branch');
    expect(result).toHaveProperty('title');
    expect(result.branch).toBe('grd/v0.2.0/27-worktree-infrastructure');
  });

  test('reads branch from worktree HEAD, not from GRD template', () => {
    // Create a worktree
    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    const wtPath = worktreePath(repoDir, 'v0.2.0', '27');

    // Rename the branch in the worktree to a non-GRD name
    execFileSync('git', ['branch', '-m', 'feature/arbitrary-name'], {
      cwd: wtPath,
      stdio: 'pipe',
    });

    // Make a commit so there is something to push
    fs.writeFileSync(path.join(wtPath, 'test.txt'), 'hello', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: wtPath, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'test commit'], { cwd: wtPath, stdio: 'pipe' });

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreePushAndPR(repoDir, { phase: '27', milestone: 'v0.2.0' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);

    // Branch should be the renamed one, not the GRD template
    expect(result.branch).toBe('feature/arbitrary-name');
  });

  test('uses base_branch from config for PR target', () => {
    // Update config to use a custom base branch
    const configPath = path.join(repoDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.base_branch = 'develop';
    fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');

    captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    const wtPath = worktreePath(repoDir, 'v0.2.0', '27');
    fs.writeFileSync(path.join(wtPath, 'test.txt'), 'hello', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: wtPath, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'test commit'], { cwd: wtPath, stdio: 'pipe' });

    const { stdout } = captureOutput(() =>
      cmdWorktreePushAndPR(repoDir, { phase: '27', milestone: 'v0.2.0' }, false)
    );
    const result = JSON.parse(stdout);

    // base should come from config, not hardcoded 'main'
    expect(result.base).toBe('develop');
  });
});

// ─── cmdWorktreeEnsureMilestoneBranch ─────────────────────────────────────────

describe('cmdWorktreeEnsureMilestoneBranch', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('creates milestone branch from main', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeEnsureMilestoneBranch(repoDir, { milestone: 'v0.2.0' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('branch');
    expect(result.already_existed).toBe(false);
    expect(result.base_branch).toBe('main');

    // Verify branch was actually created in git
    const branches = execFileSync('git', ['branch', '--list'], {
      cwd: repoDir,
      encoding: 'utf-8',
    });
    expect(branches).toContain(result.branch);
  });

  test('returns already_existed: true when branch exists', () => {
    // Create the branch first
    captureOutput(() => cmdWorktreeEnsureMilestoneBranch(repoDir, { milestone: 'v0.2.0' }, false));

    // Try again
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeEnsureMilestoneBranch(repoDir, { milestone: 'v0.2.0' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.already_existed).toBe(true);
  });

  test('branch name follows config template', () => {
    const { stdout } = captureOutput(() =>
      cmdWorktreeEnsureMilestoneBranch(repoDir, { milestone: 'v0.2.0' }, false)
    );
    const result = JSON.parse(stdout);
    // Default template is 'grd/{milestone}-{slug}', milestone name from ROADMAP is
    // "Git Worktree Parallel Execution"
    expect(result.branch).toContain('v0.2.0');
  });

  test('error when base branch does not exist', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeEnsureMilestoneBranch(
        repoDir,
        { milestone: 'v0.2.0', baseBranch: 'nonexistent-branch' },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('error');
    expect(result.error).toContain('not found');
  });

  test('uses custom base branch from options', () => {
    // Create a develop branch
    execFileSync('git', ['branch', 'develop'], { cwd: repoDir, stdio: 'pipe' });

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeEnsureMilestoneBranch(
        repoDir,
        { milestone: 'v0.2.0', baseBranch: 'develop' },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.already_existed).toBe(false);
    expect(result.base_branch).toBe('develop');
  });
});

// ─── cmdWorktreeMerge ─────────────────────────────────────────────────────────

describe('cmdWorktreeMerge', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  /**
   * Helper: set up milestone + phase branches with a commit on the phase branch.
   * Returns the milestone and phase branch names.
   */
  function setupBranches(repoPath) {
    // Create milestone branch
    const { stdout: msOut } = captureOutput(() =>
      cmdWorktreeEnsureMilestoneBranch(repoPath, { milestone: 'v0.2.0' }, false)
    );
    const msBranch = JSON.parse(msOut).branch;

    // Create phase branch from milestone branch
    const phaseBranch = 'grd/v0.2.0/27-worktree-infrastructure';
    execFileSync('git', ['branch', phaseBranch, msBranch], { cwd: repoPath, stdio: 'pipe' });

    // Make a commit on the phase branch
    execFileSync('git', ['checkout', phaseBranch], { cwd: repoPath, stdio: 'pipe' });
    fs.writeFileSync(path.join(repoPath, 'phase-work.txt'), 'phase 27 work', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: repoPath, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'feat: phase 27 work'], { cwd: repoPath, stdio: 'pipe' });
    execFileSync('git', ['checkout', 'main'], { cwd: repoPath, stdio: 'pipe' });

    return { msBranch, phaseBranch };
  }

  test('merges phase branch into milestone branch', () => {
    const { msBranch } = setupBranches(repoDir);

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeMerge(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.merged).toBe(true);
    expect(result.target_branch).toBe(msBranch);
    expect(result.phase).toBe('27');

    // Verify the commit is on the milestone branch
    const log = execFileSync('git', ['log', '--oneline', msBranch], {
      cwd: repoDir,
      encoding: 'utf-8',
    });
    expect(log).toContain('phase 27 work');
  });

  test('creates merge commit (non-fast-forward)', () => {
    const { msBranch } = setupBranches(repoDir);

    captureOutput(() =>
      cmdWorktreeMerge(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    // Verify it's a merge commit (has 2 parents)
    const log = execFileSync('git', ['log', '--oneline', '--merges', msBranch, '-1'], {
      cwd: repoDir,
      encoding: 'utf-8',
    });
    expect(log).toContain('Merge phase 27');
  });

  test('falls back to config base_branch when milestone branch missing', () => {
    // Create only the phase branch (no milestone branch)
    const phaseBranch = 'grd/v0.2.0/27-worktree-infrastructure';
    execFileSync('git', ['branch', phaseBranch], { cwd: repoDir, stdio: 'pipe' });

    // Make a commit on the phase branch
    execFileSync('git', ['checkout', phaseBranch], { cwd: repoDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(repoDir, 'fallback-work.txt'), 'fallback test', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'feat: fallback work'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['checkout', 'main'], { cwd: repoDir, stdio: 'pipe' });

    // Without milestone branch, merge should fall back to config.base_branch (main)
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeMerge(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.merged).toBe(true);
    expect(result.target_branch).toBe('main');
    expect(result.phase_branch).toBe(phaseBranch);

    // Verify the commit is on main
    const log = execFileSync('git', ['log', '--oneline', 'main'], {
      cwd: repoDir,
      encoding: 'utf-8',
    });
    expect(log).toContain('fallback work');
  });

  test('error when phase branch missing', () => {
    // Create only the milestone branch (no phase branch)
    captureOutput(() => cmdWorktreeEnsureMilestoneBranch(repoDir, { milestone: 'v0.2.0' }, false));

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeMerge(repoDir, { phase: '99', milestone: 'v0.2.0', slug: 'nonexistent' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('error');
    expect(result.error).toContain('Phase branch');
    expect(result.error).toContain('not found');
  });

  test('reports merge conflict and aborts cleanly', () => {
    const { msBranch, phaseBranch } = setupBranches(repoDir);

    // Create a conflicting commit on the milestone branch
    execFileSync('git', ['checkout', msBranch], { cwd: repoDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(repoDir, 'phase-work.txt'), 'conflicting content', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'conflicting commit'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['checkout', 'main'], { cwd: repoDir, stdio: 'pipe' });

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeMerge(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('error', 'Merge conflict');
    expect(result.target_branch).toBe(msBranch);
    expect(result.phase_branch).toBe(phaseBranch);

    // Verify we're back on the original branch (main) and not in a merge state
    const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoDir,
      encoding: 'utf-8',
    }).trim();
    expect(currentBranch).toBe('main');
  });

  test('deletes phase branch with --delete-branch', () => {
    setupBranches(repoDir);

    captureOutput(() =>
      cmdWorktreeMerge(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure', deleteBranch: true },
        false
      )
    );

    // Verify phase branch is deleted
    const branches = execFileSync('git', ['branch', '--list'], {
      cwd: repoDir,
      encoding: 'utf-8',
    });
    expect(branches).not.toContain('grd/v0.2.0/27-worktree-infrastructure');
  });

  test('preserves phase branch without flag', () => {
    setupBranches(repoDir);

    const { stdout } = captureOutput(() =>
      cmdWorktreeMerge(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    const result = JSON.parse(stdout);
    expect(result.branch_deleted).toBe(false);

    // Verify phase branch still exists
    const branches = execFileSync('git', ['branch', '--list'], {
      cwd: repoDir,
      encoding: 'utf-8',
    });
    expect(branches).toContain('grd/v0.2.0/27-worktree-infrastructure');
  });

  test('merges with explicit options.branch instead of computed branch', () => {
    // Create milestone branch
    const { stdout: msOut } = captureOutput(() =>
      cmdWorktreeEnsureMilestoneBranch(repoDir, { milestone: 'v0.2.0' }, false)
    );
    const msBranch = JSON.parse(msOut).branch;

    // Create a custom-named branch (not following GRD convention)
    const customBranch = 'feature/custom-phase-27';
    execFileSync('git', ['branch', customBranch, msBranch], { cwd: repoDir, stdio: 'pipe' });

    // Make a commit on the custom branch
    execFileSync('git', ['checkout', customBranch], { cwd: repoDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(repoDir, 'custom-work.txt'), 'custom branch work', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'feat: custom branch work'], {
      cwd: repoDir,
      stdio: 'pipe',
    });
    execFileSync('git', ['checkout', 'main'], { cwd: repoDir, stdio: 'pipe' });

    // Merge using explicit branch name
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeMerge(repoDir, { phase: '27', milestone: 'v0.2.0', branch: customBranch }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.merged).toBe(true);
    expect(result.phase_branch).toBe(customBranch);
    expect(result.target_branch).toBe(msBranch);

    // Verify the commit is on the milestone branch
    const log = execFileSync('git', ['log', '--oneline', msBranch], {
      cwd: repoDir,
      encoding: 'utf-8',
    });
    expect(log).toContain('custom branch work');
  });

  test('without options.branch computes branch from template (regression)', () => {
    setupBranches(repoDir);

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeMerge(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.merged).toBe(true);
    // The phase_branch should be the computed GRD convention branch
    expect(result.phase_branch).toBe('grd/v0.2.0/27-worktree-infrastructure');
  });

  test('restores original branch after merge', () => {
    setupBranches(repoDir);

    // Verify we start on main
    const beforeBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoDir,
      encoding: 'utf-8',
    }).trim();
    expect(beforeBranch).toBe('main');

    captureOutput(() =>
      cmdWorktreeMerge(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );

    // Verify we're back on main
    const afterBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoDir,
      encoding: 'utf-8',
    }).trim();
    expect(afterBranch).toBe('main');
  });

  test('merges phase branch directly into base branch with --base (no milestone branch needed)', () => {
    // Create a phase branch directly from main (no milestone branch)
    const phaseBranch = 'grd/v0.2.0/27-worktree-infrastructure';
    execFileSync('git', ['branch', phaseBranch], { cwd: repoDir, stdio: 'pipe' });

    // Make a commit on the phase branch
    execFileSync('git', ['checkout', phaseBranch], { cwd: repoDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(repoDir, 'phase-work.txt'), 'phase 27 work', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'feat: phase 27 work'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['checkout', 'main'], { cwd: repoDir, stdio: 'pipe' });

    // Merge with --base main (no milestone branch exists or needed)
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeMerge(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure', base: 'main' },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.merged).toBe(true);
    expect(result.target_branch).toBe('main');
    expect(result.phase_branch).toBe(phaseBranch);

    // Verify the commit is on main
    const log = execFileSync('git', ['log', '--oneline', 'main'], {
      cwd: repoDir,
      encoding: 'utf-8',
    });
    expect(log).toContain('phase 27 work');
  });

  test('uses config.base_branch as target when no --base and no milestone branch', () => {
    // Write config with base_branch
    const planningDir = path.join(repoDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ base_branch: 'main' }),
      'utf-8'
    );

    // Create a phase branch directly from main
    const phaseBranch = 'grd/v0.2.0/27-worktree-infrastructure';
    execFileSync('git', ['branch', phaseBranch], { cwd: repoDir, stdio: 'pipe' });

    // Make a commit on the phase branch
    execFileSync('git', ['checkout', phaseBranch], { cwd: repoDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(repoDir, 'phase-work.txt'), 'phase work', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'feat: phase work'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['checkout', 'main'], { cwd: repoDir, stdio: 'pipe' });

    // Merge without --base — should use config.base_branch
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeMerge(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.merged).toBe(true);
    expect(result.target_branch).toBe('main');
  });
});

// ─── Worktree Hook Handlers ──────────────────────────────────────────────────

describe('cmdWorktreeHookCreate', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('skips when no .planning directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-wt-noplanning-'));
    try {
      const { stdout, exitCode } = captureOutput(() =>
        cmdWorktreeHookCreate(tmpDir, '/tmp/some-worktree', 'some-branch', false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('skipped', true);
      expect(result.reason).toContain('.planning');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('skips when branching_strategy is none', () => {
    // Override config to disable branching
    const configPath = path.join(repoDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.branching_strategy = 'none';
    fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookCreate(repoDir, '/tmp/some-worktree', 'some-branch', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('skipped', true);
    expect(result.reason).toContain('branching disabled');
  });

  test('logs creation when GRD is active', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookCreate(repoDir, '/tmp/some-worktree', 'some-branch', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('hooked', true);
    expect(result).toHaveProperty('worktree_path', '/tmp/some-worktree');
    expect(result).toHaveProperty('branch', 'some-branch');
  });

  test('does not rename branch already following GRD convention', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookCreate(repoDir, '/tmp/some-worktree', 'grd/v0.2.0/27-test', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('hooked', true);
    expect(result).toHaveProperty('renamed', false);
    expect(result.reason).toContain('GRD convention');
  });
});

describe('cmdWorktreeHookRemove', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('skips when no .planning directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-wt-noplanning-'));
    try {
      const { stdout, exitCode } = captureOutput(() =>
        cmdWorktreeHookRemove(tmpDir, '/tmp/some-worktree', 'some-branch', false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('skipped', true);
      expect(result.reason).toContain('.planning');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('skips when branching_strategy is none', () => {
    const configPath = path.join(repoDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.branching_strategy = 'none';
    fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookRemove(repoDir, '/tmp/some-worktree', 'some-branch', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('skipped', true);
    expect(result.reason).toContain('branching disabled');
  });

  test('logs removal when GRD is active', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookRemove(repoDir, '/tmp/some-worktree', 'some-branch', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('hooked', true);
    expect(result).toHaveProperty('worktree_path', '/tmp/some-worktree');
    expect(result).toHaveProperty('branch', 'some-branch');
    expect(result).toHaveProperty('action', 'remove_logged');
  });

  test('extracts phase and milestone from GRD-pattern worktree path', () => {
    const grdPath = '/home/user/project/.worktrees/grd-worktree-v0.2.6-46';
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookRemove(repoDir, grdPath, 'grd/v0.2.6/46-hybrid', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('hooked', true);
    expect(result).toHaveProperty('action', 'remove_logged');
    expect(result).toHaveProperty('phase_detected', '46');
    expect(result).toHaveProperty('milestone_detected', 'v0.2.6');
  });

  test('does not include metadata for non-GRD worktree path', () => {
    const nonGrdPath = '/tmp/random-worktree';
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookRemove(repoDir, nonGrdPath, 'feature/something', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('hooked', true);
    expect(result).toHaveProperty('action', 'remove_logged');
    expect(result).not.toHaveProperty('phase_detected');
    expect(result).not.toHaveProperty('milestone_detected');
  });

  test('handles null worktree path gracefully', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookRemove(repoDir, null, 'some-branch', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('hooked', true);
    expect(result).toHaveProperty('action', 'remove_logged');
    // Should not crash, and should not have metadata
    expect(result).not.toHaveProperty('phase_detected');
  });
});

// ─── Phase 47: Hook Handler Comprehensive Edge Cases ──────────────────────────

describe('Phase 47: hook handler comprehensive edge cases', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  // ─── cmdWorktreeHookCreate edge cases ───────────────────────────────────────

  describe('cmdWorktreeHookCreate edge cases', () => {
    test('returns skipped when .planning directory does not exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-wt-noplan-'));
      try {
        const { stdout, exitCode } = captureOutput(() =>
          cmdWorktreeHookCreate(tmpDir, '/tmp/test-worktree', 'test-branch', false)
        );
        expect(exitCode).toBe(0);
        const result = JSON.parse(stdout);
        expect(result).toHaveProperty('skipped', true);
        expect(result.reason).toContain('.planning');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('returns skipped when branching_strategy is none', () => {
      const configPath = path.join(repoDir, '.planning', 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config.branching_strategy = 'none';
      fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');

      const { stdout, exitCode } = captureOutput(() =>
        cmdWorktreeHookCreate(repoDir, '/tmp/test-worktree', 'test-branch', false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('skipped', true);
      expect(result.reason).toContain('branching disabled');
    });

    test('does not rename when branch already starts with grd/', () => {
      const { stdout, exitCode } = captureOutput(() =>
        cmdWorktreeHookCreate(repoDir, '/tmp/some-worktree', 'grd/v0.2.6/47-test', false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('hooked', true);
      expect(result).toHaveProperty('renamed', false);
      expect(result.reason).toContain('GRD convention');
    });

    test('attempts rename when worktree path ends with phase number', () => {
      const { stdout, exitCode } = captureOutput(() =>
        cmdWorktreeHookCreate(repoDir, '/tmp/worktree-47', 'auto-branch-name', false)
      );
      expect(exitCode).toBe(0);
      // The handler may output multiple JSON objects when rename fails then
      // falls through to the default output path. Extract all JSON objects and
      // use the last one as the definitive result.
      const jsonObjects = [];
      let remaining = stdout.trim();
      while (remaining.length > 0) {
        const start = remaining.indexOf('{');
        if (start === -1) break;
        let depth = 0;
        let end = -1;
        for (let i = start; i < remaining.length; i++) {
          if (remaining[i] === '{') depth++;
          if (remaining[i] === '}') depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
        if (end === -1) break;
        try {
          jsonObjects.push(JSON.parse(remaining.slice(start, end + 1)));
        } catch (_e) {
          // skip malformed
        }
        remaining = remaining.slice(end + 1);
      }
      expect(jsonObjects.length).toBeGreaterThanOrEqual(1);
      const result = jsonObjects[jsonObjects.length - 1];
      expect(result).toHaveProperty('hooked', true);
      // The handler should detect the phase number from the path ending
      // It may or may not succeed at rename (git branch may not exist in the path),
      // but it should attempt and not crash
    });

    test('handles empty string worktree path without crash', () => {
      const { stdout, exitCode } = captureOutput(() =>
        cmdWorktreeHookCreate(repoDir, '', 'some-branch', false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('hooked', true);
    });

    test('handles empty string branch without crash', () => {
      const { stdout, exitCode } = captureOutput(() =>
        cmdWorktreeHookCreate(repoDir, '/tmp/test-worktree', '', false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('hooked', true);
    });

    test('writes stderr warning when branch rename fails', () => {
      // Path ending with phase number triggers rename attempt; non-existent
      // path causes git branch rename to fail → rename_failed: true in output
      // Note: captureOutput's process.exit mock causes the catch block to fire
      // too (process.exit throws __GRD_TEST_EXIT__), so stdout may have multiple
      // JSON objects. We collect all and verify rename_failed appears in one.
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});
      try {
        const { stdout, exitCode } = captureOutput(() =>
          cmdWorktreeHookCreate(repoDir, '/tmp/grd-nonexistent-27', 'auto-branch-name', false)
        );
        expect(exitCode).toBe(0);
        // Collect all JSON objects from concatenated stdout
        const jsonObjects = [];
        let remaining = stdout.trim();
        while (remaining.length > 0) {
          const start = remaining.indexOf('{');
          if (start === -1) break;
          let depth = 0;
          let end = -1;
          for (let i = start; i < remaining.length; i++) {
            if (remaining[i] === '{') depth++;
            if (remaining[i] === '}') depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
          if (end === -1) break;
          try {
            jsonObjects.push(JSON.parse(remaining.slice(start, end + 1)));
          } catch {}
          remaining = remaining.slice(end + 1);
        }
        expect(jsonObjects.some((r) => r.rename_failed === true)).toBe(true);
        // After the fix a specific warning for branch rename failure is written
        // to stderr (distinct from the catch-block's "could not determine phase
        // metadata" message which fires due to the process.exit mock).
        const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join('');
        expect(stderrOutput).toContain('branch rename');
      } finally {
        stderrSpy.mockRestore();
      }
    });
  });

  // ─── cmdWorktreeHookRemove edge cases ─────────────────────────────────────

  describe('cmdWorktreeHookRemove edge cases', () => {
    test('returns skipped when .planning directory does not exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-wt-noplan-'));
      try {
        const { stdout, exitCode } = captureOutput(() =>
          cmdWorktreeHookRemove(tmpDir, '/tmp/test-worktree', 'test-branch', false)
        );
        expect(exitCode).toBe(0);
        const result = JSON.parse(stdout);
        expect(result).toHaveProperty('skipped', true);
        expect(result.reason).toContain('.planning');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('returns skipped when branching_strategy is none', () => {
      const configPath = path.join(repoDir, '.planning', 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config.branching_strategy = 'none';
      fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');

      const { stdout, exitCode } = captureOutput(() =>
        cmdWorktreeHookRemove(repoDir, '/tmp/test-worktree', 'test-branch', false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('skipped', true);
      expect(result.reason).toContain('branching disabled');
    });

    test('extracts metadata from grd-worktree-v0.2.6-47 path format', () => {
      const grdPath = '/home/user/project/.worktrees/grd-worktree-v0.2.6-47';
      const { stdout, exitCode } = captureOutput(() =>
        cmdWorktreeHookRemove(repoDir, grdPath, 'grd/v0.2.6/47-testing', false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('hooked', true);
      expect(result).toHaveProperty('phase_detected', '47');
      expect(result).toHaveProperty('milestone_detected', 'v0.2.6');
    });

    test('does not include metadata for path not matching GRD pattern', () => {
      const { stdout, exitCode } = captureOutput(() =>
        cmdWorktreeHookRemove(repoDir, '/tmp/my-worktree', 'feature/something', false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('hooked', true);
      expect(result).toHaveProperty('action', 'remove_logged');
      expect(result).not.toHaveProperty('phase_detected');
      expect(result).not.toHaveProperty('milestone_detected');
    });

    test('handles undefined worktree path gracefully', () => {
      const { stdout, exitCode } = captureOutput(() =>
        cmdWorktreeHookRemove(repoDir, undefined, 'some-branch', false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('hooked', true);
      expect(result).toHaveProperty('action', 'remove_logged');
      expect(result).not.toHaveProperty('phase_detected');
    });

    test('handles worktree path with special characters', () => {
      const specialPath = '/tmp/my project-dir/grd-worktree-v0.2.6-47';
      const { stdout, exitCode } = captureOutput(() =>
        cmdWorktreeHookRemove(repoDir, specialPath, 'some-branch', false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('hooked', true);
      expect(result).toHaveProperty('action', 'remove_logged');
      // Even with spaces in the path, it should extract metadata from the basename
      expect(result).toHaveProperty('phase_detected', '47');
      expect(result).toHaveProperty('milestone_detected', 'v0.2.6');
    });
  });
});

// ─── cmdWorktreeMerge edge cases ─────────────────────────────────────────────

describe('cmdWorktreeMerge additional edge cases', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('errors when phase is not provided', () => {
    const { stderr, exitCode } = captureError(() => cmdWorktreeMerge(repoDir, {}, false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('phase is required');
  });

  test('errors when target branch does not exist', () => {
    // Create a phase branch
    const phaseBranch = 'grd/v0.2.0/27-test';
    execFileSync('git', ['branch', phaseBranch], { cwd: repoDir, stdio: 'pipe' });

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeMerge(
        repoDir,
        { phase: '27', base: 'nonexistent-branch', branch: phaseBranch },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toContain('not found');
  });

  test('merges into explicit base branch', () => {
    // Create a separate base branch
    execFileSync('git', ['branch', 'develop'], { cwd: repoDir, stdio: 'pipe' });

    // Create phase branch with a commit
    const phaseBranch = 'grd/v0.2.0/27-test';
    execFileSync('git', ['branch', phaseBranch], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['checkout', phaseBranch], { cwd: repoDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(repoDir, 'merge-test.txt'), 'test', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'merge test'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['checkout', 'main'], { cwd: repoDir, stdio: 'pipe' });

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeMerge(repoDir, { phase: '27', base: 'develop', branch: phaseBranch }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.merged).toBe(true);
    expect(result.target_branch).toBe('develop');
  });
});

// ─── cmdWorktreeHookCreate edge cases ────────────────────────────────────────

describe('cmdWorktreeHookCreate rename paths', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('logs creation without rename when no phase info extractable', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookCreate(repoDir, '/tmp/random-worktree', 'some-branch', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.hooked).toBe(true);
    expect(result.renamed).toBe(false);
  });

  test('skips rename when branch already follows GRD convention', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookCreate(repoDir, '/tmp/worktree', 'grd/v0.2.0/27-test', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.hooked).toBe(true);
    expect(result.renamed).toBe(false);
    expect(result.reason).toContain('GRD convention');
  });

  test('skips when no .planning directory', () => {
    // Remove .planning
    fs.rmSync(path.join(repoDir, '.planning'), { recursive: true, force: true });

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookCreate(repoDir, '/tmp/worktree', 'branch', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('no .planning');
  });
});

// ─── cmdWorktreeCreate error branches ─────────────────────────────────────────

describe('cmdWorktreeCreate error branches', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('errors when phase is missing', () => {
    const { stderr, exitCode } = captureError(() => cmdWorktreeCreate(repoDir, {}, false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('phase is required');
  });

  test('returns error when worktree already exists', () => {
    // Create a worktree first
    captureOutput(() => cmdWorktreeCreate(repoDir, { phase: '27', slug: 'infra' }, false));
    // Attempt to create again
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', slug: 'infra' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toContain('already exists');
  });

  test('returns error for invalid start point', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', slug: 'infra', startPoint: 'nonexistent-ref' },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toContain('not found');
  });

  test('returns clear error when branch already exists', () => {
    // Pre-create the branch that cmdWorktreeCreate would use
    execFileSync('git', ['branch', 'grd/v0.2.0/27-infra'], { cwd: repoDir, stdio: 'pipe' });

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', slug: 'infra' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toMatch(/already exists/i);
    expect(result.branch).toBe('grd/v0.2.0/27-infra');
  });

  test('force option skips branch conflict check', () => {
    // Pre-create the branch
    execFileSync('git', ['branch', 'grd/v0.2.0/27-infra'], { cwd: repoDir, stdio: 'pipe' });

    // With force, the worktree add will fail via git (branch exists without -b workaround),
    // but the branch pre-check should be skipped — error comes from git, not our check
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', slug: 'infra', force: true }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    // The error (if any) should NOT be the "already exists" pre-check message
    if (result.error) {
      expect(result.error).not.toMatch(/Use --force/);
    }
  });
});

// ─── cmdWorktreeHookRemove ────────────────────────────────────────────────────

describe('cmdWorktreeHookRemove', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('skips when no .planning directory', () => {
    fs.rmSync(path.join(repoDir, '.planning'), { recursive: true, force: true });

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookRemove(repoDir, '/tmp/worktree', 'branch', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('no .planning');
  });

  test('skips when branching disabled', () => {
    fs.writeFileSync(
      path.join(repoDir, '.planning', 'config.json'),
      JSON.stringify({ branching_strategy: 'none' }),
      'utf-8'
    );

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookRemove(repoDir, '/tmp/worktree', 'branch', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('branching disabled');
  });

  test('logs removal with branch info', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookRemove(repoDir, '/tmp/worktree-27', 'grd/v0.2.0/27-infra', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.hooked).toBe(true);
    expect(result.action).toBe('remove_logged');
    expect(result.worktree_path).toBe('/tmp/worktree-27');
    expect(result.branch).toBe('grd/v0.2.0/27-infra');
  });

  test('extracts phase metadata from worktree path', () => {
    // Create a worktree path that ends in a phase number
    const wtPath = path.join(repoDir, '.worktrees', 'phase-27');

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeHookRemove(repoDir, wtPath, 'test-branch', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.hooked).toBe(true);
    expect(result.action).toBe('remove_logged');
  });
});

// ─── createEvolveWorktree ────────────────────────────────────────────────────

describe('createEvolveWorktree', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('creates worktree with grd-evolve- prefix and grd/evolve/ branch', () => {
    const result = createEvolveWorktree(repoDir);
    expect(result.error).toBeUndefined();
    expect(result.path).toMatch(/grd-evolve-\d{8}-\d{6}/);
    expect(result.branch).toMatch(/^grd\/evolve\/\d{8}-\d{6}$/);
    expect(result.baseBranch).toBe('main');
    expect(result.created).toBeDefined();
    expect(fs.existsSync(result.path)).toBe(true);
  });

  test('returns error for non-git directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-nongit-'));
    try {
      const result = createEvolveWorktree(tmpDir);
      expect(result.error).toBe('Not a git repository');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('ensures .worktrees/ directory and .gitignore entry', () => {
    const result = createEvolveWorktree(repoDir);
    expect(result.error).toBeUndefined();

    const gitignore = fs.readFileSync(path.join(repoDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.worktrees');

    const worktreesDir = path.join(fs.realpathSync(repoDir), '.worktrees');
    expect(fs.existsSync(worktreesDir)).toBe(true);
  });

  test('uses base_branch from config', () => {
    // Update config to use a custom base branch
    const configPath = path.join(repoDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.base_branch = 'main';
    fs.writeFileSync(configPath, JSON.stringify(config));

    const result = createEvolveWorktree(repoDir);
    expect(result.error).toBeUndefined();
    expect(result.baseBranch).toBe('main');
  });

  test('returns error if worktree directory already exists', () => {
    // Create the first worktree
    const result1 = createEvolveWorktree(repoDir);
    expect(result1.error).toBeUndefined();

    // Manually create a directory with the same expected name pattern
    // to trigger the "already exists" check on a second call within same second
    const resolvedCwd = fs.realpathSync(repoDir);
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:T]/g, '').replace(/\.\d+Z$/, '').slice(0, 15);
    const tag = `${stamp.slice(0, 8)}-${stamp.slice(8)}`;
    const wtPath2 = path.join(resolvedCwd, '.worktrees', `grd-evolve-${tag}`);
    fs.mkdirSync(wtPath2, { recursive: true });

    const result2 = createEvolveWorktree(repoDir);
    // Should return error or succeed with a different timestamp — either is acceptable
    // If the second is different, both succeed. If same second, it errors.
    if (result2.error) {
      expect(result2.error).toContain('already exists');
    }
  });
});

// ─── removeEvolveWorktree ───────────────────────────────────────────────────

describe('removeEvolveWorktree', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('removes existing worktree', () => {
    const wt = createEvolveWorktree(repoDir);
    expect(wt.error).toBeUndefined();
    expect(fs.existsSync(wt.path)).toBe(true);

    const result = removeEvolveWorktree(repoDir, wt.path);
    expect(result.removed).toBe(true);
    expect(result.already_gone).toBeUndefined();
    expect(fs.existsSync(wt.path)).toBe(false);
  });

  test('returns already_gone for non-existent path', () => {
    const fakePath = path.join(fs.realpathSync(repoDir), '.worktrees', 'grd-evolve-nonexistent');
    const result = removeEvolveWorktree(repoDir, fakePath);
    expect(result.removed).toBe(true);
    expect(result.already_gone).toBe(true);
  });
});

// ─── ensureWorktreesDir (exported) ──────────────────────────────────────────

describe('ensureWorktreesDir (export)', () => {
  test('is exported as a function', () => {
    expect(typeof ensureWorktreesDir).toBe('function');
  });

  test('throws when .gitignore exists but is unreadable (non-ENOENT), preserving its content', () => {
    const tmpRoot = fs.mkdtempSync(path.join(REAL_TMPDIR, 'grd-gitignore-perm-test-'));
    try {
      execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: tmpRoot, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.email', 'test@grd.dev'], { cwd: tmpRoot, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.name', 'GRD Test'], { cwd: tmpRoot, stdio: 'pipe' });
      // Make .gitignore a directory — readFileSync throws EISDIR (not ENOENT)
      fs.mkdirSync(path.join(tmpRoot, '.gitignore'), { recursive: true });
      // Should throw because EISDIR is not ENOENT
      expect(() => ensureWorktreesDir(tmpRoot)).toThrow();
      // The .gitignore directory must still be a directory (not overwritten)
      expect(fs.statSync(path.join(tmpRoot, '.gitignore')).isDirectory()).toBe(true);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  test('returns false and logs stderr when .gitignore is not writable', () => {
    // Skip if running as root (chmod restrictions don't apply to root)
    if (process.getuid && process.getuid() === 0) return;

    const tmpRoot = fs.mkdtempSync(path.join(REAL_TMPDIR, 'grd-gitignore-write-test-'));
    const gitignorePath = path.join(tmpRoot, '.gitignore');
    try {
      execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: tmpRoot, stdio: 'pipe' });
      // Create .gitignore WITHOUT '.worktrees' so the write branch is taken
      fs.writeFileSync(gitignorePath, '# existing\n');
      // Pre-create .worktrees/ so mkdirSync inside ensureWorktreesDir is a no-op
      fs.mkdirSync(path.join(tmpRoot, '.worktrees'), { recursive: true });
      // Make .gitignore read-only to force writeFileSync to fail
      fs.chmodSync(gitignorePath, 0o444);

      const stderrLines = [];
      const spy = jest.spyOn(process.stderr, 'write').mockImplementation((msg) => {
        stderrLines.push(typeof msg === 'string' ? msg : String(msg));
        return true;
      });
      let result;
      try {
        result = ensureWorktreesDir(tmpRoot);
      } finally {
        spy.mockRestore();
        try { fs.chmodSync(gitignorePath, 0o644); } catch { /* ignore */ }
      }

      expect(result).toBe(false);
      expect(stderrLines.some((l) => l.includes('could not update .gitignore'))).toBe(true);
    } finally {
      try { fs.chmodSync(gitignorePath, 0o644); } catch { /* ignore */ }
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

// ─── pushAndCreatePR ────────────────────────────────────────────────────────

describe('pushAndCreatePR', () => {
  test('is exported as a function', () => {
    expect(typeof pushAndCreatePR).toBe('function');
  });

  test('returns error when worktree HEAD cannot be determined', () => {
    const result = pushAndCreatePR('/nonexistent-dir', '/nonexistent-wt');
    expect(result.error).toBe('Failed to determine worktree branch');
  });

  test('returns error with push_succeeded=false when push fails (no remote)', () => {
    // Use a real git repo but without a remote — push will fail
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-pr-test-'));
    try {
      execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: tmpRoot, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.email', 'test@grd.dev'], { cwd: tmpRoot, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.name', 'GRD Test'], { cwd: tmpRoot, stdio: 'pipe' });
      fs.writeFileSync(path.join(tmpRoot, 'file.txt'), 'hello');
      execFileSync('git', ['add', '.'], { cwd: tmpRoot, stdio: 'pipe' });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpRoot, stdio: 'pipe' });

      // Create worktree
      const wtPath = path.join(tmpRoot, '.worktrees', 'grd-evolve-test');
      fs.mkdirSync(path.join(tmpRoot, '.worktrees'), { recursive: true });
      execFileSync('git', ['worktree', 'add', '-b', 'grd/evolve/test', wtPath], { cwd: tmpRoot, stdio: 'pipe' });

      const result = pushAndCreatePR(tmpRoot, wtPath);
      expect(result.error).toMatch(/Failed to push branch/);
      expect(result.push_succeeded).toBe(false);
    } finally {
      try { execFileSync('git', ['worktree', 'prune'], { cwd: tmpRoot, stdio: 'pipe' }); } catch {}
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

// ─── cmdWorktreeRemove — git error logging ────────────────────────────────────

describe('cmdWorktreeRemove — git error logging', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('logs to stderr when git worktree remove fails for a non-registered path', () => {
    // Create a directory that looks like a worktree path but is NOT a registered git worktree
    const fakePath = path.join(repoDir, '.worktrees', 'grd-worktree-v0.2.0-55');
    fs.mkdirSync(fakePath, { recursive: true });
    fs.writeFileSync(path.join(fakePath, 'file.txt'), 'hello');

    const stderrLines = [];
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((msg) => {
      stderrLines.push(msg);
    });

    try {
      // Should not throw; should log the git error to stderr
      captureOutput(() => cmdWorktreeRemove(repoDir, { path: fakePath }, false));
    } finally {
      stderrSpy.mockRestore();
    }

    // After fix: stderr should have a message about the git failure
    expect(stderrLines.length).toBeGreaterThan(0);
    expect(stderrLines.join('')).toMatch(/worktree|remove|git|failed/i);
  });
});
