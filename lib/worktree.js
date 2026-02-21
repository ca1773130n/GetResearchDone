/**
 * GRD Worktree — Git worktree lifecycle management for phase isolation
 *
 * Provides create, remove, list, and stale cleanup for git worktrees
 * used during phase execution. Each phase executes in its own worktree
 * at {project}/.worktrees/grd-worktree-{milestone}-{phase}.
 *
 * Dependencies: utils.js (one-directional, no circular deps)
 */

'use strict';

const fs = require('fs');
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
 * Compute the worktree directory path for a given milestone and phase.
 * Uses project-local .worktrees/ directory to avoid OS temp cleanup issues.
 * Resolves cwd via realpathSync to handle macOS symlinks.
 * @param {string} cwd - Project working directory
 * @param {string} milestone - Milestone version (e.g., 'v0.2.0')
 * @param {string} phase - Phase number (e.g., '27')
 * @returns {string} Absolute path under {cwd}/.worktrees/
 */
function worktreePath(cwd, milestone, phase) {
  const resolvedCwd = fs.realpathSync(cwd);
  return path.join(resolvedCwd, '.worktrees', `grd-worktree-${milestone}-${phase}`);
}

/**
 * Ensure .worktrees/ directory exists and is listed in .gitignore.
 * @param {string} cwd - Project working directory
 */
function ensureWorktreesDir(cwd) {
  const worktreesDir = path.join(cwd, '.worktrees');
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  // Add .worktrees/ to .gitignore if not already present
  const gitignorePath = path.join(cwd, '.gitignore');
  let gitignoreContent = '';
  try {
    gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  } catch {
    // No .gitignore yet
  }
  if (!gitignoreContent.includes('.worktrees')) {
    const newline = gitignoreContent.length > 0 && !gitignoreContent.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(gitignorePath, gitignoreContent + newline + '.worktrees/\n', 'utf-8');
  }
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
 * Looks for worktrees in the project-local .worktrees/ directory.
 * @param {string} cwd - Project working directory
 * @returns {Array<{path: string, branch: string, phase: string, milestone: string, locked: boolean}>}
 */
function getGrdWorktrees(cwd) {
  const listResult = execGit(cwd, ['worktree', 'list', '--porcelain']);
  if (listResult.exitCode !== 0) return [];

  const all = parsePorcelainWorktrees(listResult.stdout);
  const resolvedCwd = fs.realpathSync(cwd);
  const worktreesDir = path.join(resolvedCwd, '.worktrees');

  return all
    .filter(
      (wt) => wt.path.startsWith(worktreesDir) && path.basename(wt.path).startsWith('grd-worktree-')
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
 * Creates a worktree at {cwd}/.worktrees/grd-worktree-{milestone}-{phase}
 * with a branch following the configured phase_branch_template pattern.
 * Ensures .worktrees/ directory exists and is listed in .gitignore.
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

  // Ensure .worktrees/ directory exists and is in .gitignore
  ensureWorktreesDir(cwd);

  const wtPath = worktreePath(cwd, milestone, phase);
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
    wtPath = worktreePath(cwd, milestone, options.phase);
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
 * GRD-created worktrees (those in .worktrees/ with grd-worktree- prefix).
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
  const wtPath = worktreePath(cwd, milestone, phase);

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
 * Merge a phase branch into the target branch.
 *
 * Target branch is determined by: options.base > config.base_branch > milestone branch.
 * When --base is provided, merges directly into that branch (no milestone branch required).
 * Otherwise falls back to the milestone branch for backward compatibility.
 *
 * Records the current branch, checks out the target branch, merges the
 * phase branch with --no-ff, and restores the original branch. On conflict,
 * aborts the merge and restores the original branch.
 *
 * @param {string} cwd - Project working directory (must be a git repo)
 * @param {Object} options
 * @param {string} options.phase - Phase number (required)
 * @param {string} [options.milestone] - Milestone version (defaults from ROADMAP.md)
 * @param {string} [options.slug] - Phase slug for branch name computation
 * @param {string} [options.branch] - Explicit phase branch name (overrides computed branch)
 * @param {string} [options.base] - Target branch to merge into (overrides milestone branch)
 * @param {boolean} [options.deleteBranch] - Delete the phase branch after merge
 * @param {boolean} raw - If true, output raw text instead of JSON
 */
function cmdWorktreeMerge(cwd, options, raw) {
  const { phase, slug, deleteBranch } = options;
  if (!phase) {
    error('phase is required for worktree merge');
  }

  const milestoneVersion = options.milestone || getMilestoneInfo(cwd).version;
  const phaseBranch = options.branch || worktreeBranch(cwd, milestoneVersion, phase, slug || phase);

  // Determine target branch: explicit --base, or milestone branch (with fallback to config base_branch)
  let targetBranch;
  if (options.base) {
    // Explicit base branch — merge directly into it (no milestone branch needed)
    targetBranch = options.base;
  } else {
    // Try milestone branch first (backward compat); fall back to config.base_branch
    const msBranch = milestoneBranch(cwd, milestoneVersion);
    const msCheck = execGit(cwd, ['rev-parse', '--verify', msBranch]);
    if (msCheck.exitCode === 0) {
      targetBranch = msBranch;
    } else {
      const config = loadConfig(cwd);
      targetBranch = config.base_branch || 'main';
    }
  }

  // Verify target branch exists
  const targetCheck = execGit(cwd, ['rev-parse', '--verify', targetBranch]);
  if (targetCheck.exitCode !== 0) {
    output({ error: `Target branch '${targetBranch}' not found` }, raw);
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

  // Checkout target branch
  const coResult = execGit(cwd, ['checkout', targetBranch]);
  if (coResult.exitCode !== 0) {
    output(
      { error: `Failed to checkout target branch '${targetBranch}'`, details: coResult.stderr },
      raw
    );
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
        target_branch: targetBranch,
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
      target_branch: targetBranch,
      phase_branch: phaseBranch,
      phase,
      branch_deleted: !!deleteBranch,
    },
    raw
  );
}

// ─── Hook Handlers ────────────────────────────────────────────────────────────

/**
 * Hook handler for WorktreeCreate events from Claude Code.
 *
 * When Claude Code creates a worktree natively (via `isolation: worktree`),
 * this hook fires to optionally rename the branch to GRD's naming convention
 * and log the lifecycle event. No-op when GRD is inactive or branching disabled.
 *
 * @param {string} cwd - Project working directory
 * @param {string} wtPath - Path to the created worktree ($WORKTREE_PATH)
 * @param {string} wtBranch - Branch name of the created worktree ($WORKTREE_BRANCH)
 * @param {boolean} raw - If true, output raw text instead of JSON
 */
function cmdWorktreeHookCreate(cwd, wtPath, wtBranch, raw) {
  // No-op when GRD is inactive
  if (!fs.existsSync(path.join(cwd, '.planning'))) {
    output({ skipped: true, reason: 'no .planning directory' }, raw);
    return;
  }

  // No-op when branching is disabled
  const config = loadConfig(cwd);
  if (config.branching_strategy === 'none') {
    output({ skipped: true, reason: 'branching disabled' }, raw);
    return;
  }

  // Check if branch already follows GRD convention (starts with 'grd/')
  if (wtBranch && wtBranch.startsWith('grd/')) {
    output(
      {
        hooked: true,
        worktree_path: wtPath,
        branch: wtBranch,
        renamed: false,
        reason: 'branch already follows GRD convention',
      },
      raw
    );
    return;
  }

  // Try to extract phase info from the worktree path for branch rename
  const dirName = path.basename(wtPath || '');
  const phaseMatch = dirName.match(/(\d+)$/);

  if (phaseMatch) {
    const phase = phaseMatch[1];
    try {
      const milestone = getMilestoneInfo(cwd);
      const phaseInfo = findPhaseInternal(cwd, phase);
      const slug = phaseInfo
        ? generateSlugInternal(phaseInfo.phase_slug || phaseInfo.phase_name)
        : phase;
      const grdBranch = worktreeBranch(cwd, milestone.version, phase, slug);

      if (grdBranch !== wtBranch) {
        const renameResult = execGit(wtPath, ['branch', '-m', wtBranch, grdBranch]);
        if (renameResult.exitCode === 0) {
          output(
            {
              hooked: true,
              worktree_path: wtPath,
              branch: grdBranch,
              renamed: true,
              original_branch: wtBranch,
            },
            raw
          );
          return;
        }
        // Rename failed — log but continue
        output(
          {
            hooked: true,
            worktree_path: wtPath,
            branch: wtBranch,
            renamed: false,
            rename_failed: true,
            reason: renameResult.stderr || 'git branch rename failed',
          },
          raw
        );
        return;
      }
    } catch (_e) {
      // Could not determine milestone/phase info — log creation without rename
    }
  }

  // Default: log creation without rename
  output(
    {
      hooked: true,
      worktree_path: wtPath,
      branch: wtBranch,
      renamed: false,
    },
    raw
  );
}

/**
 * Hook handler for WorktreeRemove events from Claude Code.
 *
 * Logs the worktree removal for tracking. Intentionally minimal —
 * Phase 46 will add state cleanup here if needed.
 * No-op when GRD is inactive or branching disabled.
 *
 * @param {string} cwd - Project working directory
 * @param {string} wtPath - Path to the removed worktree ($WORKTREE_PATH)
 * @param {string} wtBranch - Branch name of the removed worktree ($WORKTREE_BRANCH)
 * @param {boolean} raw - If true, output raw text instead of JSON
 */
function cmdWorktreeHookRemove(cwd, wtPath, wtBranch, raw) {
  // No-op when GRD is inactive
  if (!fs.existsSync(path.join(cwd, '.planning'))) {
    output({ skipped: true, reason: 'no .planning directory' }, raw);
    return;
  }

  // No-op when branching is disabled
  const config = loadConfig(cwd);
  if (config.branching_strategy === 'none') {
    output({ skipped: true, reason: 'branching disabled' }, raw);
    return;
  }

  const result = {
    hooked: true,
    worktree_path: wtPath,
    branch: wtBranch,
    action: 'remove_logged',
  };

  // Try to extract phase/milestone metadata from the worktree path
  // Expected GRD format: grd-worktree-{milestone}-{phase}
  try {
    const meta = parseWorktreeName(wtPath || '');
    if (meta) {
      result.phase_detected = meta.phase;
      result.milestone_detected = meta.milestone;
    }
  } catch (_e) {
    // Best-effort: metadata extraction failure is not an error
  }

  output(result, raw);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  worktreePath,
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
};
