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
} = require('../../lib/worktree');

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
  if (!repoDir || !repoDir.startsWith(os.tmpdir())) {
    throw new Error('Refusing to remove directory outside tmpdir: ' + repoDir);
  }

  // Prune any worktrees first to avoid git lock issues
  try {
    execFileSync('git', ['worktree', 'prune'], { cwd: repoDir, stdio: 'pipe' });
  } catch {
    // Ignore errors during cleanup
  }

  // Clean up any GRD worktree directories in tmpdir
  try {
    const entries = fs.readdirSync(os.tmpdir());
    for (const entry of entries) {
      if (entry.startsWith('grd-worktree-') && entry.includes('v0')) {
        const wtPath = path.join(os.tmpdir(), entry);
        try {
          // Try to remove worktree via git first
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
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
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
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );
    const result = JSON.parse(stdout);
    const expectedPath = path.join(os.tmpdir(), 'grd-worktree-v0.2.0-27');
    expect(result.path).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  test('branch name follows pattern grd/{milestone}/{phase}-{slug}', () => {
    const { stdout } = captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );
    const result = JSON.parse(stdout);
    expect(result.branch).toBe('grd/v0.2.0/27-worktree-infrastructure');
  });

  test('returns error JSON if worktree already exists', () => {
    // Create first worktree
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );

    // Try to create again
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
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
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );
    const result = JSON.parse(stdout);
    const date = new Date(result.created);
    expect(date.toISOString()).toBe(result.created);
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
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
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
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );

    const wtPath = path.join(os.tmpdir(), 'grd-worktree-v0.2.0-27');
    expect(fs.existsSync(wtPath)).toBe(true);

    captureOutput(() =>
      cmdWorktreeRemove(repoDir, { phase: '27', milestone: 'v0.2.0' }, false)
    );
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
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );

    const wtPath = path.join(os.tmpdir(), 'grd-worktree-v0.2.0-27');
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeRemove(repoDir, { path: wtPath }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('removed', true);
  });

  test('calls git worktree prune after removal', () => {
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );

    captureOutput(() =>
      cmdWorktreeRemove(repoDir, { phase: '27', milestone: 'v0.2.0' }, false)
    );

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
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeList(repoDir, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('worktrees');
    expect(result.worktrees).toEqual([]);
    expect(result).toHaveProperty('count', 0);
  });

  test('lists active GRD worktrees with required fields', () => {
    // Create two worktrees
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '28', milestone: 'v0.2.0', slug: 'pr-workflow' }, false)
    );

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeList(repoDir, false)
    );
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
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );

    const { stdout } = captureOutput(() =>
      cmdWorktreeList(repoDir, false)
    );
    const result = JSON.parse(stdout);

    // Should not include the main repo itself
    for (const wt of result.worktrees) {
      expect(wt.path).not.toBe(repoDir);
      expect(wt.path).toContain('grd-worktree-');
    }
  });

  test('extracts phase and milestone from worktree directory name', () => {
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );

    const { stdout } = captureOutput(() =>
      cmdWorktreeList(repoDir, false)
    );
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
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeRemoveStale(repoDir, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('removed');
    expect(result.removed).toEqual([]);
    expect(result).toHaveProperty('count', 0);
  });

  test('removes stale worktrees whose disk directory was deleted', () => {
    // Create a worktree
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );

    // Manually delete the worktree directory (simulating stale state)
    const wtPath = path.join(os.tmpdir(), 'grd-worktree-v0.2.0-27');
    fs.rmSync(wtPath, { recursive: true, force: true });

    // Now remove stale
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeRemoveStale(repoDir, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.removed.length).toBeGreaterThanOrEqual(1);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  test('does NOT remove locked worktrees', () => {
    // Create a worktree
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );

    const wtPath = path.join(os.tmpdir(), 'grd-worktree-v0.2.0-27');

    // Lock the worktree
    execFileSync('git', ['worktree', 'lock', wtPath], { cwd: repoDir, stdio: 'pipe' });

    // Delete the directory to simulate stale state
    fs.rmSync(wtPath, { recursive: true, force: true });

    // Remove stale should NOT touch locked ones
    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeRemoveStale(repoDir, false)
    );
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
      cmdWorktreeCreate(repoDir, { phase: '27', milestone: 'v0.2.0', slug: 'worktree-infrastructure' }, false)
    );
    captureOutput(() =>
      cmdWorktreeCreate(repoDir, { phase: '28', milestone: 'v0.2.0', slug: 'pr-workflow' }, false)
    );

    // Delete both directories
    fs.rmSync(path.join(os.tmpdir(), 'grd-worktree-v0.2.0-27'), { recursive: true, force: true });
    fs.rmSync(path.join(os.tmpdir(), 'grd-worktree-v0.2.0-28'), { recursive: true, force: true });

    const { stdout, exitCode } = captureOutput(() =>
      cmdWorktreeRemoveStale(repoDir, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.removed.length).toBe(2);
    expect(result.count).toBe(2);
  });
});
