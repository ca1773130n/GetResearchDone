/**
 * GRD Worktree — Git worktree lifecycle management for phase isolation
 *
 * Provides create, remove, list, and stale cleanup for git worktrees
 * used during phase execution. Each phase executes in its own worktree
 * at os.tmpdir()/grd-worktree-{milestone}-{phase}.
 *
 * Dependencies: utils.js (one-directional, no circular deps)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  execGit,
  output,
  error,
  getMilestoneInfo,
  loadConfig,
  findPhaseInternal,
  generateSlugInternal,
} = require('./utils');

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Resolve the real tmpdir path (handles macOS /tmp -> /private/tmp symlink).
 * Cached on first call for performance.
 * @returns {string} Real absolute path to the system temp directory
 */
let _realTmpDir = null;
function realTmpDir() {
  if (_realTmpDir === null) {
    _realTmpDir = fs.realpathSync(os.tmpdir());
  }
  return _realTmpDir;
}

/**
 * Compute the worktree directory path for a given milestone and phase.
 * Uses the real (resolved) tmpdir to avoid macOS symlink issues.
 * @param {string} milestone - Milestone version (e.g., 'v0.2.0')
 * @param {string} phase - Phase number (e.g., '27')
 * @returns {string} Absolute path in os.tmpdir()
 */
function worktreePath(milestone, phase) {
  return path.join(realTmpDir(), `grd-worktree-${milestone}-${phase}`);
}

/**
 * Compute the branch name for a worktree using the config template.
 * @param {string} cwd - Project working directory
 * @param {string} milestone - Milestone version
 * @param {string} phase - Phase number
 * @param {string} slug - Phase slug
 * @returns {string} Branch name (e.g., 'grd/v0.2.0/27-worktree-infrastructure')
 */
function worktreeBranch(cwd, milestone, phase, slug) {
  const config = loadConfig(cwd);
  const template = config.phase_branch_template || 'grd/{milestone}/{phase}-{slug}';
  return template
    .replace('{milestone}', milestone)
    .replace('{phase}', phase)
    .replace('{slug}', slug || phase);
}

/**
 * Compute the milestone branch name using the config template.
 * @param {string} cwd - Project working directory
 * @param {string} [milestoneVersion] - Milestone version override (defaults from ROADMAP.md)
 * @returns {string} Branch name (e.g., 'grd/v0.2.0-git-worktree-parallel-execution')
 */
function milestoneBranch(cwd, milestoneVersion) {
  const config = loadConfig(cwd);
  const template = config.milestone_branch_template || 'grd/{milestone}-{slug}';
  const milestone = getMilestoneInfo(cwd);
  const version = milestoneVersion || milestone.version;
  const slug = generateSlugInternal(milestone.name) || 'milestone';
  return template.replace('{milestone}', version).replace('{slug}', slug);
}

/**
 * Parse git worktree list --porcelain output into structured entries.
 * Each entry is separated by a blank line and has fields:
 *   worktree /path/to/worktree
 *   HEAD abc123
 *   branch refs/heads/branch-name
 *   (optional) locked
 *
 * @param {string} porcelainOutput - Raw output from git worktree list --porcelain
 * @returns {Array<{path: string, head: string, branch: string, locked: boolean}>}
 */
function parsePorcelainWorktrees(porcelainOutput) {
  if (!porcelainOutput || !porcelainOutput.trim()) return [];

  const blocks = porcelainOutput.trim().split(/\n\n+/);
  const entries = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const entry = { path: '', head: '', branch: '', locked: false };

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        entry.path = line.slice('worktree '.length);
      } else if (line.startsWith('HEAD ')) {
        entry.head = line.slice('HEAD '.length);
      } else if (line.startsWith('branch ')) {
        entry.branch = line.slice('branch '.length).replace('refs/heads/', '');
      } else if (line === 'locked') {
        entry.locked = true;
      }
    }

    if (entry.path) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Extract phase and milestone from a GRD worktree directory name.
 * Expected format: grd-worktree-{milestone}-{phase}
 *
 * @param {string} wtPath - Absolute path to the worktree
 * @returns {{phase: string, milestone: string}|null} Parsed metadata or null
 */
function parseWorktreeName(wtPath) {
  const dirName = path.basename(wtPath);
  const match = dirName.match(/^grd-worktree-(.+)-(\d+)$/);
  if (!match) return null;
  return { milestone: match[1], phase: match[2] };
}

/**
 * Get all GRD-managed worktrees (filtering out main and non-GRD entries).
 * @param {string} cwd - Project working directory
 * @returns {Array<{path: string, branch: string, phase: string, milestone: string, locked: boolean}>}
 */
function getGrdWorktrees(cwd) {
  const listResult = execGit(cwd, ['worktree', 'list', '--porcelain']);
  if (listResult.exitCode !== 0) return [];

  const all = parsePorcelainWorktrees(listResult.stdout);
  const tmpDir = realTmpDir();

  return all
    .filter(
      (wt) => wt.path.startsWith(tmpDir) && path.basename(wt.path).startsWith('grd-worktree-')
    )
    .map((wt) => {
      const meta = parseWorktreeName(wt.path);
      return {
        path: wt.path,
        branch: wt.branch,
        phase: meta ? meta.phase : '',
        milestone: meta ? meta.milestone : '',
        locked: wt.locked,
      };
    });
}

// ─── CLI Commands ─────────────────────────────────────────────────────────────

/**
 * Create a new git worktree for a phase.
 *
 * Creates a worktree at os.tmpdir()/grd-worktree-{milestone}-{phase}
 * with a branch following the configured phase_branch_template pattern.
 *
 * @param {string} cwd - Project working directory (must be a git repo)
 * @param {Object} options - Creation options
 * @param {string} options.phase - Phase number (required)
 * @param {string} [options.milestone] - Milestone version (defaults from ROADMAP.md)
 * @param {string} [options.slug] - Phase slug (optional, defaults to phase number)
 * @param {string} [options.startPoint] - Branch or commit to fork from (enables stacked PRs)
 * @param {boolean} raw - If true, output raw text instead of JSON
 * @returns {void} Outputs JSON result and exits
 */
function cmdWorktreeCreate(cwd, options, raw) {
  const { phase, slug, startPoint } = options;
  if (!phase) {
    error('phase is required for worktree create');
  }

  // Resolve milestone from options or ROADMAP.md
  const milestone = options.milestone || getMilestoneInfo(cwd).version;
  const branchSlug = slug || phase;

  const wtPath = worktreePath(milestone, phase);
  const branch = worktreeBranch(cwd, milestone, phase, branchSlug);

  // Check if worktree already exists
  if (fs.existsSync(wtPath)) {
    output({ error: 'Worktree already exists', path: wtPath }, raw);
    return;
  }

  // Verify we are in a git repo
  const revParse = execGit(cwd, ['rev-parse', '--git-dir']);
  if (revParse.exitCode !== 0) {
    output({ error: 'Not a git repository', details: revParse.stderr }, raw);
    return;
  }

  // Validate start-point exists if provided
  if (startPoint) {
    const check = execGit(cwd, ['rev-parse', '--verify', startPoint]);
    if (check.exitCode !== 0) {
      output({ error: `Start point '${startPoint}' not found`, details: check.stderr }, raw);
      return;
    }
  }

  // Create the worktree with a new branch, optionally from a start point
  const gitArgs = ['worktree', 'add', '-b', branch, wtPath];
  if (startPoint) {
    gitArgs.push(startPoint);
  }
  const result = execGit(cwd, gitArgs);
  if (result.exitCode !== 0) {
    output({ error: 'Failed to create worktree', details: result.stderr }, raw);
    return;
  }

  const out = {
    path: wtPath,
    branch,
    phase,
    milestone,
    created: new Date().toISOString(),
  };
  if (startPoint) {
    out.start_point = startPoint;
  }
  output(out, raw);
}

/**
 * Remove a git worktree by phase identifier or direct path.
 *
 * Gracefully handles non-existent worktrees (returns success with already_gone flag).
 * Calls git worktree prune after removal to clean git state.
 *
 * @param {string} cwd - Project working directory
 * @param {Object} options - Removal options
 * @param {string} [options.phase] - Phase number to identify the worktree
 * @param {string} [options.milestone] - Milestone version (needed with phase)
 * @param {string} [options.path] - Direct path to the worktree
 * @param {boolean} raw - If true, output raw text instead of JSON
 * @returns {void} Outputs JSON result and exits
 */
function cmdWorktreeRemove(cwd, options, raw) {
  let wtPath;

  if (options.path) {
    wtPath = options.path;
  } else if (options.phase) {
    const milestone = options.milestone || getMilestoneInfo(cwd).version;
    wtPath = worktreePath(milestone, options.phase);
  } else {
    error('Either --phase or --path is required for worktree remove');
  }

  // If path does not exist on disk, return graceful response
  if (!fs.existsSync(wtPath)) {
    // Also try to prune from git's perspective
    execGit(cwd, ['worktree', 'prune']);
    output({ removed: true, path: wtPath, already_gone: true }, raw);
    return;
  }

  // Try to remove via git worktree remove (--force for GRD-managed temp worktrees)
  execGit(cwd, ['worktree', 'remove', wtPath, '--force'], { allowBlocked: true });

  // Prune to clean git state
  execGit(cwd, ['worktree', 'prune']);

  // Clean up the temp directory if it still exists
  if (fs.existsSync(wtPath)) {
    fs.rmSync(wtPath, { recursive: true, force: true });
  }

  output({ removed: true, path: wtPath }, raw);
}

/**
 * List all active GRD-managed worktrees.
 *
 * Parses git worktree list --porcelain output and filters to only
 * GRD-created worktrees (those in tmpdir with grd-worktree- prefix).
 * Returns empty array if no worktrees exist.
 *
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - If true, output raw text instead of JSON
 * @returns {void} Outputs JSON result and exits
 */
function cmdWorktreeList(cwd, raw) {
  const worktrees = getGrdWorktrees(cwd);
  output({ worktrees, count: worktrees.length }, raw);
}

/**
 * Remove stale worktrees whose disk directories no longer exist.
 *
 * A worktree is stale if its path does not exist on disk or is empty.
 * Locked worktrees are never removed regardless of disk state.
 *
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - If true, output raw text instead of JSON
 * @returns {void} Outputs JSON result with removed paths and count
 */
function cmdWorktreeRemoveStale(cwd, raw) {
  const worktrees = getGrdWorktrees(cwd);
  const removed = [];

  for (const wt of worktrees) {
    // Never remove locked worktrees
    if (wt.locked) continue;

    // Check if path exists and is non-empty
    let isStale = false;
    try {
      if (!fs.existsSync(wt.path)) {
        isStale = true;
      } else {
        const entries = fs.readdirSync(wt.path);
        if (entries.length === 0) {
          isStale = true;
        }
      }
    } catch {
      isStale = true;
    }

    if (isStale) {
      // Remove from git's worktree tracking
      execGit(cwd, ['worktree', 'remove', wt.path, '--force'], { allowBlocked: true });
      removed.push(wt.path);
    }
  }

  // Final prune to clean any remaining stale references
  execGit(cwd, ['worktree', 'prune']);

  output({ removed, count: removed.length }, raw);
}

/**
 * Push worktree branch to remote and create a PR via gh CLI.
 *
 * Both error paths return structured JSON (exit 0) so callers (orchestrators,
 * MCP) receive parseable output rather than a crash.
 *
 * @param {string} cwd - Project working directory (main repo, NOT worktree)
 * @param {Object} options
 * @param {string} options.phase - Phase number (required)
 * @param {string} [options.milestone] - Milestone version (defaults from ROADMAP.md)
 * @param {string} [options.title] - PR title (defaults to "Phase {phase}: {slug} ({milestone})")
 * @param {string} [options.body] - PR body markdown
 * @param {string} [options.base] - Base branch for PR target (defaults from config)
 * @param {boolean} raw - Output raw text instead of JSON
 */
function cmdWorktreePushAndPR(cwd, options, raw) {
  const { phase } = options;
  if (!phase) {
    output({ error: 'phase is required for worktree push-pr' }, raw);
    return;
  }

  // Resolve milestone
  const milestone = options.milestone || getMilestoneInfo(cwd).version;

  // Compute worktree path
  const wtPath = worktreePath(milestone, phase);

  // Verify worktree directory exists on disk
  if (!fs.existsSync(wtPath)) {
    output({ error: `Worktree not found at ${wtPath}`, phase, milestone }, raw);
    return;
  }

  // Read the actual branch name from the worktree HEAD (more robust than recomputing)
  const headResult = execGit(wtPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch =
    headResult.exitCode === 0 && headResult.stdout
      ? headResult.stdout.trim()
      : worktreeBranch(cwd, milestone, phase, phase); // fallback

  // Derive slug from branch name for title generation
  const phaseInfo = findPhaseInternal(cwd, phase);
  const slug =
    phaseInfo && phaseInfo.phase_slug
      ? phaseInfo.phase_slug
      : branch.split('/').pop().replace(/^\d+-/, '') || phase;

  // Push branch to origin from worktree directory
  const pushResult = execGit(wtPath, ['push', '-u', 'origin', branch], { allowBlocked: true });
  if (pushResult.exitCode !== 0) {
    output(
      {
        error: 'Failed to push branch',
        details: pushResult.stderr,
        phase,
        milestone,
        branch,
      },
      raw
    );
    return;
  }

  // Resolve base branch
  const config = loadConfig(cwd);
  const baseBranch = options.base || config.base_branch || 'main';

  // Build PR title
  const title = options.title || `Phase ${phase}: ${slug} (${milestone})`;

  // Build PR body
  const body = options.body || `## Phase ${phase}\n\nMilestone: ${milestone}\nBranch: ${branch}\n`;

  // Create PR via gh CLI
  let ghOutput;
  try {
    ghOutput = execFileSync(
      'gh',
      ['pr', 'create', '--title', title, '--body', body, '--base', baseBranch, '--head', branch],
      { cwd: wtPath, stdio: 'pipe', encoding: 'utf-8' }
    );
  } catch (ghErr) {
    // gh failed — return structured error with push_succeeded flag
    const stderr = ghErr.stderr
      ? ghErr.stderr.toString().trim()
      : ghErr.message || 'Unknown gh error';
    output(
      {
        error: 'Failed to create PR via gh CLI',
        details: stderr,
        push_succeeded: true,
        phase,
        milestone,
        branch,
        base: baseBranch,
        title,
        body,
      },
      raw
    );
    return;
  }

  // gh pr create outputs the PR URL on stdout
  const prUrl = ghOutput.trim();
  const urlParts = prUrl.split('/');
  const prNumber = urlParts.length > 0 ? urlParts[urlParts.length - 1] : null;

  output(
    {
      pr_url: prUrl,
      pr_number: prNumber,
      branch,
      base: baseBranch,
      title,
      body,
      phase,
      milestone,
    },
    raw
  );
}

// ─── Milestone Branch Operations ──────────────────────────────────────────────

/**
 * Ensure the milestone branch exists, creating it from baseBranch if needed.
 *
 * @param {string} cwd - Project working directory (must be a git repo)
 * @param {Object} options
 * @param {string} [options.milestone] - Milestone version (defaults from ROADMAP.md)
 * @param {string} [options.baseBranch] - Base branch to fork from (defaults from config or 'main')
 * @param {boolean} raw - If true, output raw text instead of JSON
 */
function cmdWorktreeEnsureMilestoneBranch(cwd, options, raw) {
  const milestoneVersion = options.milestone || getMilestoneInfo(cwd).version;
  const config = loadConfig(cwd);
  const baseBranch = options.baseBranch || config.base_branch || 'main';
  const branch = milestoneBranch(cwd, milestoneVersion);

  // Check if branch already exists
  const check = execGit(cwd, ['rev-parse', '--verify', branch]);
  if (check.exitCode === 0) {
    output({ branch, already_existed: true }, raw);
    return;
  }

  // Verify base branch exists
  const baseCheck = execGit(cwd, ['rev-parse', '--verify', baseBranch]);
  if (baseCheck.exitCode !== 0) {
    output({ error: `Base branch '${baseBranch}' not found`, details: baseCheck.stderr }, raw);
    return;
  }

  // Create branch without checkout
  const result = execGit(cwd, ['branch', branch, baseBranch]);
  if (result.exitCode !== 0) {
    output({ error: 'Failed to create milestone branch', details: result.stderr }, raw);
    return;
  }

  output({ branch, already_existed: false, base_branch: baseBranch }, raw);
}

/**
 * Merge a phase branch into the milestone branch.
 *
 * Records the current branch, checks out the milestone branch, merges the
 * phase branch with --no-ff, and restores the original branch. On conflict,
 * aborts the merge and restores the original branch.
 *
 * @param {string} cwd - Project working directory (must be a git repo)
 * @param {Object} options
 * @param {string} options.phase - Phase number (required)
 * @param {string} [options.milestone] - Milestone version (defaults from ROADMAP.md)
 * @param {string} [options.slug] - Phase slug for branch name computation
 * @param {boolean} [options.deleteBranch] - Delete the phase branch after merge
 * @param {boolean} raw - If true, output raw text instead of JSON
 */
function cmdWorktreeMerge(cwd, options, raw) {
  const { phase, slug, deleteBranch } = options;
  if (!phase) {
    error('phase is required for worktree merge');
  }

  const milestoneVersion = options.milestone || getMilestoneInfo(cwd).version;
  const msBranch = milestoneBranch(cwd, milestoneVersion);
  const phaseBranch = worktreeBranch(cwd, milestoneVersion, phase, slug || phase);

  // Verify milestone branch exists
  const msCheck = execGit(cwd, ['rev-parse', '--verify', msBranch]);
  if (msCheck.exitCode !== 0) {
    output({ error: `Milestone branch '${msBranch}' not found` }, raw);
    return;
  }

  // Verify phase branch exists
  const phaseCheck = execGit(cwd, ['rev-parse', '--verify', phaseBranch]);
  if (phaseCheck.exitCode !== 0) {
    output({ error: `Phase branch '${phaseBranch}' not found` }, raw);
    return;
  }

  // Record current branch
  const headResult = execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const originalBranch = headResult.exitCode === 0 ? headResult.stdout.trim() : 'main';

  // Checkout milestone branch
  const coResult = execGit(cwd, ['checkout', msBranch]);
  if (coResult.exitCode !== 0) {
    output({ error: 'Failed to checkout milestone branch', details: coResult.stderr }, raw);
    return;
  }

  // Get phase info for merge commit message
  const phaseInfo = findPhaseInternal(cwd, phase);
  const phaseName = phaseInfo ? phaseInfo.phase_name : slug || phase;

  // Merge phase branch with --no-ff
  const mergeResult = execGit(cwd, [
    'merge',
    '--no-ff',
    phaseBranch,
    '-m',
    `Merge phase ${phase}: ${phaseName}`,
  ]);

  if (mergeResult.exitCode !== 0) {
    // Merge conflict — abort and restore
    execGit(cwd, ['merge', '--abort']);
    execGit(cwd, ['checkout', originalBranch]);
    output(
      {
        error: 'Merge conflict',
        details: mergeResult.stderr,
        milestone_branch: msBranch,
        phase_branch: phaseBranch,
      },
      raw
    );
    return;
  }

  // Optionally delete phase branch
  if (deleteBranch) {
    execGit(cwd, ['branch', '-d', phaseBranch]);
  }

  // Restore original branch
  execGit(cwd, ['checkout', originalBranch]);

  output(
    {
      merged: true,
      milestone_branch: msBranch,
      phase_branch: phaseBranch,
      phase,
      branch_deleted: !!deleteBranch,
    },
    raw
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  cmdWorktreeCreate,
  cmdWorktreeRemove,
  cmdWorktreeList,
  cmdWorktreeRemoveStale,
  cmdWorktreePushAndPR,
  milestoneBranch,
  cmdWorktreeEnsureMilestoneBranch,
  cmdWorktreeMerge,
};
