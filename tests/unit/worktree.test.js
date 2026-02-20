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
  cmdWorktreeCreate,
  cmdWorktreeRemove,
  cmdWorktreeList,
  cmdWorktreeRemoveStale,
  cmdWorktreePushAndPR,
  runTestGate,
  cleanupWorktree,
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

  // Clean up worktrees owned by THIS test repo (not all grd-worktree-* dirs)
  try {
    const wtListOutput = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    const ownedPaths = wtListOutput
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length))
      .filter((p) => p !== resolvedRepo && p.includes('grd-worktree-'));

    for (const wtPath of ownedPaths) {
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

  test('creates worktree directory at os.tmpdir()/grd-worktree-{milestone}-{phase}', () => {
    const { stdout } = captureOutput(() =>
      cmdWorktreeCreate(
        repoDir,
        { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' },
        false
      )
    );
    const result = JSON.parse(stdout);
    const expectedPath = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-27');
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

    const wtPath = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-27');
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

    const wtPath = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-27');
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
    const wtPath = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-27');
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

    const wtPath = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-27');

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
    fs.rmSync(path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-27'), { recursive: true, force: true });
    fs.rmSync(path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-28'), { recursive: true, force: true });

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
    const wtPath = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-27');
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

    const wtPath = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-27');
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

    const wtPath = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-28');
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

    const wtPath = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-28');
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

    const wtPath = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-27');
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

    const wtPath = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-27');
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

// ─── runTestGate ──────────────────────────────────────────────────────────────

describe('runTestGate', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('returns passed=true when test command succeeds', () => {
    const result = runTestGate(repoDir, 'node -e "process.exit(0)"');
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  test('returns passed=false with exit code when test command fails', () => {
    const result = runTestGate(repoDir, 'node -e "process.exit(1)"');
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  test('captures stdout from test command', () => {
    const result = runTestGate(repoDir, 'node -e "console.log(\'test output\')"');
    expect(result.passed).toBe(true);
    expect(result.stdout).toContain('test output');
  });

  test('captures stderr from failing test command', () => {
    const result = runTestGate(repoDir, 'node -e "console.error(\'test error\'); process.exit(1)"');
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain('test error');
  });

  test('defaults to npm test when no command specified', () => {
    // In the test repo there is no package.json, so npm test will fail
    // but we verify it attempts to run 'npm test' (not crash)
    const result = runTestGate(repoDir);
    expect(result.passed).toBe(false);
    // The error should indicate npm or test failure, not a crash
    expect(result.exitCode).toBeTruthy();
  });
});

// ─── cleanupWorktree ──────────────────────────────────────────────────────────

describe('cleanupWorktree', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTestGitRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  test('removes an existing worktree and returns cleaned=true', () => {
    // Create a worktree first
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'test' }, false)
    );
    const wtPath = path.join(REAL_TMPDIR, 'grd-worktree-v0.2.0-27');
    expect(fs.existsSync(wtPath)).toBe(true);

    const result = cleanupWorktree(repoDir, wtPath);
    expect(result.cleaned).toBe(true);
    expect(result.error).toBeNull();
    expect(fs.existsSync(wtPath)).toBe(false);
  });

  test('succeeds silently when worktree path does not exist (idempotent)', () => {
    const fakePath = path.join(repoDir, '.worktrees', 'nonexistent-99');
    const result = cleanupWorktree(repoDir, fakePath);
    expect(result.cleaned).toBe(true);
    expect(result.error).toBeNull();
  });

  test('never throws even on unexpected errors', () => {
    // Pass an invalid cwd to trigger git errors
    const result = cleanupWorktree('/nonexistent-dir-12345', '/also/nonexistent');
    // Should not throw -- returns error info instead
    expect(result).toHaveProperty('cleaned');
    expect(result).toHaveProperty('error');
  });
});
