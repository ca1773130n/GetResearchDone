/**
 * GRD Worktree -- Git worktree lifecycle management for phase isolation
 *
 * Provides create, remove, list, and stale cleanup for git worktrees
 * used during phase execution. Each phase executes in its own worktree
 * at {project}/.worktrees/grd-worktree-{milestone}-{phase}.
 *
 * Dependencies: utils.ts (one-directional, no circular deps)
 */

'use strict';

import type { ExecGitResult, GrdConfig, PhaseInfo, MilestoneInfo } from './types';

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
}: {
  execGit: (cwd: string, args: string[], opts?: { allowBlocked?: boolean }) => ExecGitResult;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
  loadConfig: (cwd: string) => GrdConfig;
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
  generateSlugInternal: (text: string) => string | null;
} = require('./utils');

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Parsed from git worktree list --porcelain output.
 */
interface WorktreeEntry {
  path: string;
  head: string;
  branch: string;
  locked: boolean;
}

/**
 * Enriched worktree info with GRD metadata.
 */
interface GrdWorktreeEntry {
  path: string;
  branch: string;
  phase: string;
  milestone: string;
  locked: boolean;
}

/**
 * Options for cmdWorktreeCreate.
 */
interface WorktreeCreateOptions {
  phase: string;
  milestone?: string;
  slug?: string;
  startPoint?: string;
  force?: boolean;
}

/**
 * Parsed phase and milestone from a GRD worktree directory name.
 */
interface WorktreeParsedName {
  phase: string;
  milestone: string;
}

/**
 * Options for cmdWorktreeRemove.
 */
interface WorktreeRemoveOptions {
  phase?: string;
  milestone?: string;
  path?: string;
  force?: boolean;
}

/**
 * Options for cmdWorktreeMerge.
 */
interface MergeOptions {
  phase: string;
  milestone?: string;
  slug?: string;
  branch?: string;
  base?: string;
  deleteBranch?: boolean;
  strategy?: string;
}

/**
 * Result from createEvolveWorktree.
 */
interface EvolveWorktreeResult {
  path: string;
  branch: string;
  baseBranch: string;
  created: string;
}

interface EvolveWorktreeError {
  error: string;
}

/**
 * Result from removeEvolveWorktree.
 */
interface RemoveWorktreeResult {
  removed: boolean;
  already_gone?: boolean;
}

interface RemoveWorktreeError {
  error: string;
}

/**
 * Options for pushAndCreatePR programmatic helper.
 */
interface PushPROptions {
  title?: string;
  body?: string;
  base?: string;
}

/**
 * Result from programmatic pushAndCreatePR.
 */
interface PushPRSuccessResult {
  pr_url: string;
  branch: string;
  base: string;
}

interface PushPRErrorResult {
  error: string;
  push_succeeded?: boolean;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Compute the worktree directory path for a given milestone and phase.
 * Uses project-local .worktrees/ directory to avoid OS temp cleanup issues.
 * Resolves cwd via realpathSync to handle macOS symlinks.
 */
function worktreePath(cwd: string, milestone: string, phase: string): string {
  const resolvedCwd: string = fs.realpathSync(cwd);
  return path.join(resolvedCwd, '.worktrees', `grd-worktree-${milestone}-${phase}`);
}

/**
 * Ensure .worktrees/ directory exists and is listed in .gitignore.
 */
function ensureWorktreesDir(cwd: string): boolean {
  const worktreesDir: string = path.join(cwd, '.worktrees');
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  // Add .worktrees/ to .gitignore if not already present
  const gitignorePath: string = path.join(cwd, '.gitignore');
  let gitignoreContent = '';
  try {
    gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8') as string;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Non-ENOENT errors (EISDIR, EPERM, etc.) are unexpected — re-throw
      throw e;
    }
    // No .gitignore yet — will create
  }
  if (!gitignoreContent.includes('.worktrees')) {
    const newline =
      gitignoreContent.length > 0 && !gitignoreContent.endsWith('\n') ? '\n' : '';
    try {
      fs.writeFileSync(
        gitignorePath,
        gitignoreContent + newline + '.worktrees/\n',
        'utf-8'
      );
    } catch (e) {
      process.stderr.write(
        'Warning: could not update .gitignore: ' + (e as Error).message + '\n'
      );
      return false;
    }
  }
  return true;
}

/**
 * Compute the branch name for a worktree using the config template.
 */
function worktreeBranch(
  cwd: string,
  milestone: string,
  phase: string,
  slug: string
): string {
  const config: GrdConfig = loadConfig(cwd);
  const template: string = config.phase_branch_template || 'grd/{milestone}/{phase}-{slug}';
  return template
    .replace('{milestone}', milestone)
    .replace('{phase}', phase)
    .replace('{slug}', slug || phase);
}

/**
 * Compute the milestone branch name using the config template.
 */
function milestoneBranch(cwd: string, milestoneVersion?: string): string {
  const config: GrdConfig = loadConfig(cwd);
  const template: string = config.milestone_branch_template || 'grd/{milestone}-{slug}';
  const milestone: MilestoneInfo = getMilestoneInfo(cwd);
  const version: string = milestoneVersion || milestone.version;
  const slug: string = generateSlugInternal(milestone.name) || 'milestone';
  return template.replace('{milestone}', version).replace('{slug}', slug);
}

/**
 * Parse git worktree list --porcelain output into structured entries.
 * Each entry is separated by a blank line and has fields:
 *   worktree /path/to/worktree
 *   HEAD abc123
 *   branch refs/heads/branch-name
 *   (optional) locked
 */
function parsePorcelainWorktrees(porcelainOutput: string): WorktreeEntry[] {
  if (!porcelainOutput || !porcelainOutput.trim()) return [];

  const blocks: string[] = porcelainOutput.trim().split(/\n\n+/);
  const entries: WorktreeEntry[] = [];

  for (const block of blocks) {
    const lines: string[] = block.trim().split('\n');
    const entry: WorktreeEntry = { path: '', head: '', branch: '', locked: false };

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
 */
function parseWorktreeName(wtPath: string): WorktreeParsedName | null {
  const dirName: string = path.basename(wtPath);
  const match: RegExpMatchArray | null = dirName.match(/^grd-worktree-(.+)-(\d+)$/);
  if (!match) return null;
  return { milestone: match[1], phase: match[2] };
}

/**
 * Get all GRD-managed worktrees (filtering out main and non-GRD entries).
 * Looks for worktrees in the project-local .worktrees/ directory.
 */
function getGrdWorktrees(cwd: string): GrdWorktreeEntry[] {
  const listResult: ExecGitResult = execGit(cwd, ['worktree', 'list', '--porcelain']);
  if (listResult.exitCode !== 0) return [];

  const all: WorktreeEntry[] = parsePorcelainWorktrees(listResult.stdout);
  let resolvedCwd: string;
  try {
    resolvedCwd = fs.realpathSync(cwd);
  } catch {
    return [];
  }
  const worktreesDir: string = path.join(resolvedCwd, '.worktrees');

  return all
    .filter(
      (wt: WorktreeEntry) =>
        wt.path.startsWith(worktreesDir) &&
        path.basename(wt.path).startsWith('grd-worktree-')
    )
    .map((wt: WorktreeEntry): GrdWorktreeEntry => {
      const meta: WorktreeParsedName | null = parseWorktreeName(wt.path);
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
 * @param cwd - Project working directory
 * @param options - Worktree creation options (phase, milestone, slug, startPoint, force)
 * @param raw - If true, output raw text instead of JSON
 * @returns void (outputs JSON or raw text to stdout and exits)
 */
function cmdWorktreeCreate(
  cwd: string,
  options: WorktreeCreateOptions,
  raw: boolean
): void {
  const { phase, slug, startPoint } = options;
  if (!phase) {
    error('phase is required for worktree create');
    return; // unreachable — error() calls process.exit()
  }

  // Resolve milestone from options or ROADMAP.md
  const milestone: string = options.milestone || getMilestoneInfo(cwd).version;
  const branchSlug: string = slug || phase;

  // Ensure .worktrees/ directory exists and is in .gitignore
  ensureWorktreesDir(cwd);

  const wtPath: string = worktreePath(cwd, milestone, phase);
  const branch: string = worktreeBranch(cwd, milestone, phase, branchSlug);

  // Check if worktree already exists
  if (fs.existsSync(wtPath)) {
    output({ error: 'Worktree already exists', path: wtPath }, raw);
    return; // unreachable — output() calls process.exit()
  }

  // Verify we are in a git repo
  const revParse: ExecGitResult = execGit(cwd, ['rev-parse', '--git-dir']);
  if (revParse.exitCode !== 0) {
    output({ error: 'Not a git repository', details: revParse.stderr }, raw);
    return; // unreachable
  }

  // Validate start-point exists if provided
  if (startPoint) {
    const check: ExecGitResult = execGit(cwd, ['rev-parse', '--verify', startPoint]);
    if (check.exitCode !== 0) {
      output(
        { error: `Start point '${startPoint}' not found`, details: check.stderr },
        raw
      );
      return; // unreachable
    }
  }

  // Create the worktree with a new branch, optionally from a start point
  const gitArgs: string[] = ['worktree', 'add', '-b', branch, wtPath];
  if (startPoint) {
    gitArgs.push(startPoint);
  }
  // Check if branch already exists (before attempting worktree add)
  if (!options.force) {
    const branchCheck: ExecGitResult = execGit(cwd, [
      'rev-parse',
      '--verify',
      'refs/heads/' + branch,
    ]);
    if (branchCheck.exitCode === 0) {
      output({ error: `Branch '${branch}' already exists`, branch }, raw);
      return; // unreachable
    }
  }

  const result: ExecGitResult = execGit(cwd, gitArgs);
  if (result.exitCode !== 0) {
    output({ error: 'Failed to create worktree', details: result.stderr, branch }, raw);
    return; // unreachable
  }

  const out: Record<string, string> = {
    path: wtPath,
    branch,
    phase,
    milestone,
    created: new Date().toISOString(),
  };
  if (startPoint) {
    out.start_point = startPoint;
  }
  output(out, raw, `Worktree created: ${out.path} (branch: ${out.branch})`);
}

/**
 * Remove a git worktree by phase identifier or direct path.
 *
 * Gracefully handles non-existent worktrees (returns success with already_gone flag).
 * Calls git worktree prune after removal to clean git state.
 *
 * @param cwd - Project working directory
 * @param options - Removal options containing phase, milestone, path, or force flag
 * @param raw - If true, output raw text instead of JSON
 * @returns void (outputs JSON or raw text to stdout and exits)
 */
function cmdWorktreeRemove(
  cwd: string,
  options: WorktreeRemoveOptions,
  raw: boolean
): void {
  let wtPath: string;

  if (options.path) {
    wtPath = options.path;
  } else if (options.phase) {
    const milestone: string = options.milestone || getMilestoneInfo(cwd).version;
    wtPath = worktreePath(cwd, milestone, options.phase);
  } else {
    error(
      'Either --phase or --path is required for worktree remove. Specify which worktree to remove using --phase <N> or --path <worktree-path>. Example: worktree remove --phase 3. To list active worktrees: grd-tools.js worktree list'
    );
    return; // unreachable — error() calls process.exit()
  }

  // If path does not exist on disk, return graceful response
  if (!fs.existsSync(wtPath)) {
    // Also try to prune from git's perspective
    execGit(cwd, ['worktree', 'prune']);
    output({ removed: true, path: wtPath, already_gone: true }, raw);
    return; // unreachable
  }

  // Try to remove via git worktree remove (--force for GRD-managed temp worktrees)
  const removeResult: ExecGitResult = execGit(
    cwd,
    ['worktree', 'remove', wtPath, '--force'],
    { allowBlocked: true }
  );
  if (removeResult.exitCode !== 0) {
    process.stderr.write(
      'Warning: git worktree remove failed: ' +
        (removeResult.stderr || 'unknown error').trim() +
        '\n'
    );
  }

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
 * @param cwd - Project working directory
 * @param raw - If true, output raw text instead of JSON
 * @returns void (outputs JSON or raw text to stdout and exits)
 */
function cmdWorktreeList(cwd: string, raw: boolean): void {
  const worktrees: GrdWorktreeEntry[] = getGrdWorktrees(cwd);
  output({ worktrees, count: worktrees.length }, raw);
}

/**
 * Remove stale worktrees whose disk directories no longer exist.
 *
 * A worktree is stale if its path does not exist on disk or is empty.
 * Locked worktrees are never removed regardless of disk state.
 *
 * @param cwd - Project working directory
 * @param raw - If true, output raw text instead of JSON
 * @returns void (outputs JSON or raw text to stdout and exits)
 */
function cmdWorktreeRemoveStale(cwd: string, raw: boolean): void {
  const worktrees: GrdWorktreeEntry[] = getGrdWorktrees(cwd);
  const removed: string[] = [];

  for (const wt of worktrees) {
    // Never remove locked worktrees
    if (wt.locked) continue;

    // Check if path exists and is non-empty
    let isStale = false;
    try {
      if (!fs.existsSync(wt.path)) {
        isStale = true;
      } else {
        const entries: string[] = fs.readdirSync(wt.path);
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
 * @param cwd - Project working directory
 * @param options - Options object containing phase, milestone, title, body, and base branch
 * @param raw - If true, output raw text instead of JSON
 * @returns void (outputs JSON or raw text to stdout and exits)
 */
function cmdWorktreePushAndPR(
  cwd: string,
  options: Record<string, string>,
  raw: boolean
): void {
  const { phase } = options;
  if (!phase) {
    output({ error: 'phase is required for worktree push-pr' }, raw);
    return; // unreachable
  }

  // Resolve milestone
  const milestone: string = options.milestone || getMilestoneInfo(cwd).version;

  // Compute worktree path
  const wtPath: string = worktreePath(cwd, milestone, phase);

  // Verify worktree directory exists on disk
  if (!fs.existsSync(wtPath)) {
    output({ error: `Worktree not found at ${wtPath}`, phase, milestone }, raw);
    return; // unreachable
  }

  // Read the actual branch name from the worktree HEAD (more robust than recomputing)
  const headResult: ExecGitResult = execGit(wtPath, [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);
  const branch: string =
    headResult.exitCode === 0 && headResult.stdout
      ? headResult.stdout.trim()
      : worktreeBranch(cwd, milestone, phase, phase); // fallback

  // Derive slug from branch name for title generation
  const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phase);
  const slug: string =
    phaseInfo && phaseInfo.phase_slug
      ? phaseInfo.phase_slug
      : branch.split('/').pop()?.replace(/^\d+-/, '') || phase;

  // Push branch to origin from worktree directory
  const pushResult: ExecGitResult = execGit(wtPath, ['push', '-u', 'origin', branch], {
    allowBlocked: true,
  });
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
    return; // unreachable
  }

  // Resolve base branch
  const config: GrdConfig = loadConfig(cwd);
  const baseBranch: string = options.base || config.base_branch || 'main';

  // Build PR title
  const title: string = options.title || `Phase ${phase}: ${slug} (${milestone})`;

  // Build PR body
  const body: string =
    options.body ||
    `## Phase ${phase}\n\nMilestone: ${milestone}\nBranch: ${branch}\n`;

  // Create PR via gh CLI
  let ghOutput: string;
  try {
    ghOutput = execFileSync(
      'gh',
      [
        'pr',
        'create',
        '--title',
        title,
        '--body',
        body,
        '--base',
        baseBranch,
        '--head',
        branch,
      ],
      { cwd: wtPath, stdio: 'pipe', encoding: 'utf-8' }
    ) as string;
  } catch (ghErr) {
    // gh failed — return structured error with push_succeeded flag
    const stderr: string = (ghErr as { stderr?: Buffer | string }).stderr
      ? String((ghErr as { stderr?: Buffer | string }).stderr).trim()
      : (ghErr as Error).message || 'Unknown gh error';
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
    return; // unreachable
  }

  // gh pr create outputs the PR URL on stdout
  const prUrl: string = ghOutput.trim();
  const urlParts: string[] = prUrl.split('/');
  const prNumber: string | null =
    urlParts.length > 0 ? urlParts[urlParts.length - 1] : null;

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

// ─── Programmatic Helpers (evolve, autopilot) ────────────────────────────────

/**
 * Create a worktree for the evolve loop.
 * Returns a result object instead of calling output() — suitable for
 * programmatic callers that need the path/branch info.
 *
 * Worktree directory: {cwd}/.worktrees/grd-evolve-{YYYYMMDD-HHmmss}
 * Branch name: grd/evolve/{YYYYMMDD-HHmmss}
 *
 * @param cwd - Project working directory
 * @returns EvolveWorktreeResult with path, branch, baseBranch, and created timestamp, or EvolveWorktreeError with error message
 */
function createEvolveWorktree(
  cwd: string
): EvolveWorktreeResult | EvolveWorktreeError {
  // Verify git repo
  const revParse: ExecGitResult = execGit(cwd, ['rev-parse', '--git-dir']);
  if (revParse.exitCode !== 0) {
    return { error: 'Not a git repository' };
  }

  const now: Date = new Date();
  const stamp: string = now
    .toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\.\d+Z$/, '')
    .slice(0, 15);
  // stamp format: YYYYMMDD + HHmmss (15 chars)
  const tag = `${stamp.slice(0, 8)}-${stamp.slice(8)}`;

  const config: GrdConfig = loadConfig(cwd);
  const baseBranch: string = config.base_branch || 'main';

  ensureWorktreesDir(cwd);

  const resolvedCwd: string = fs.realpathSync(cwd);
  const wtPath: string = path.join(resolvedCwd, '.worktrees', `grd-evolve-${tag}`);
  const branch = `grd/evolve/${tag}`;

  if (fs.existsSync(wtPath)) {
    return { error: `Worktree already exists at ${wtPath}` };
  }

  const result: ExecGitResult = execGit(cwd, [
    'worktree',
    'add',
    '-b',
    branch,
    wtPath,
    baseBranch,
  ]);
  if (result.exitCode !== 0) {
    return { error: `Failed to create worktree: ${result.stderr}` };
  }

  return {
    path: wtPath,
    branch,
    baseBranch,
    created: now.toISOString(),
  };
}

/**
 * Remove an evolve worktree and prune git state.
 * Gracefully handles already-removed worktrees.
 */
function removeEvolveWorktree(
  cwd: string,
  wtPath: string
): RemoveWorktreeResult | RemoveWorktreeError {
  if (!fs.existsSync(wtPath)) {
    execGit(cwd, ['worktree', 'prune']);
    return { removed: true, already_gone: true };
  }

  execGit(cwd, ['worktree', 'remove', wtPath, '--force'], { allowBlocked: true });
  execGit(cwd, ['worktree', 'prune']);

  if (fs.existsSync(wtPath)) {
    fs.rmSync(wtPath, { recursive: true, force: true });
  }

  return { removed: true };
}

/**
 * Push a worktree branch to remote and create a PR via gh CLI.
 * Returns structured result instead of calling output().
 */
function pushAndCreatePR(
  cwd: string,
  wtPath: string,
  options: PushPROptions = {}
): PushPRSuccessResult | PushPRErrorResult {
  // Read branch from worktree HEAD
  const headResult: ExecGitResult = execGit(wtPath, [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);
  if (headResult.exitCode !== 0) {
    return { error: 'Failed to determine worktree branch' };
  }
  const branch: string = headResult.stdout.trim();

  const config: GrdConfig = loadConfig(cwd);
  const baseBranch: string = options.base || config.base_branch || 'main';

  // Push branch
  const pushResult: ExecGitResult = execGit(wtPath, ['push', '-u', 'origin', branch], {
    allowBlocked: true,
  });
  if (pushResult.exitCode !== 0) {
    return {
      error: `Failed to push branch: ${pushResult.stderr}`,
      push_succeeded: false,
    };
  }

  const title: string = options.title || `Evolve: improvements on ${branch}`;
  const body: string =
    options.body || `Automated improvements from the evolve loop.\n\nBranch: ${branch}\n`;

  // Create PR via gh CLI
  let ghOutput: string;
  try {
    ghOutput = execFileSync(
      'gh',
      [
        'pr',
        'create',
        '--title',
        title,
        '--body',
        body,
        '--base',
        baseBranch,
        '--head',
        branch,
      ],
      { cwd: wtPath, stdio: 'pipe', encoding: 'utf-8' }
    ) as string;
  } catch (ghErr) {
    const stderr: string = (ghErr as { stderr?: Buffer | string }).stderr
      ? String((ghErr as { stderr?: Buffer | string }).stderr).trim()
      : (ghErr as Error).message || 'Unknown gh error';
    return { error: `Failed to create PR: ${stderr}`, push_succeeded: true };
  }

  return {
    pr_url: ghOutput.trim(),
    branch,
    base: baseBranch,
  };
}

// ─── Milestone Branch Operations ──────────────────────────────────────────────

/**
 * Ensure the milestone branch exists, creating it from baseBranch if needed.
 */
function cmdWorktreeEnsureMilestoneBranch(
  cwd: string,
  options: Record<string, string>,
  raw: boolean
): void {
  const milestoneVersion: string =
    options.milestone || getMilestoneInfo(cwd).version;
  const config: GrdConfig = loadConfig(cwd);
  const baseBranch: string = options.baseBranch || config.base_branch || 'main';
  const branch: string = milestoneBranch(cwd, milestoneVersion);

  // Check if branch already exists
  const check: ExecGitResult = execGit(cwd, ['rev-parse', '--verify', branch]);
  if (check.exitCode === 0) {
    output({ branch, already_existed: true }, raw);
    return; // unreachable
  }

  // Verify base branch exists
  const baseCheck: ExecGitResult = execGit(cwd, [
    'rev-parse',
    '--verify',
    baseBranch,
  ]);
  if (baseCheck.exitCode !== 0) {
    output(
      { error: `Base branch '${baseBranch}' not found`, details: baseCheck.stderr },
      raw
    );
    return; // unreachable
  }

  // Create branch without checkout
  const result: ExecGitResult = execGit(cwd, ['branch', branch, baseBranch]);
  if (result.exitCode !== 0) {
    output(
      { error: 'Failed to create milestone branch', details: result.stderr },
      raw
    );
    return; // unreachable
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
 * @param cwd - Project working directory
 * @param options - Merge options including phase, milestone, slug, branch, base, deleteBranch, and strategy
 * @param raw - If true, output raw text instead of JSON
 * @returns void (outputs JSON or raw text to stdout and exits)
 */
function cmdWorktreeMerge(cwd: string, options: MergeOptions, raw: boolean): void {
  const { phase, slug, deleteBranch } = options;
  if (!phase) {
    error(
      'phase is required for worktree merge. Usage: worktree merge --phase <N>. Add the --phase flag, e.g.: worktree merge --phase 2'
    );
    return; // unreachable — error() calls process.exit()
  }

  const milestoneVersion: string =
    options.milestone || getMilestoneInfo(cwd).version;
  const phaseBranch: string =
    options.branch || worktreeBranch(cwd, milestoneVersion, phase, slug || phase);

  // Determine target branch: explicit --base, or milestone branch (with fallback to config base_branch)
  let targetBranch: string;
  if (options.base) {
    // Explicit base branch — merge directly into it (no milestone branch needed)
    targetBranch = options.base;
  } else {
    // Try milestone branch first (backward compat); fall back to config.base_branch
    const msBranch: string = milestoneBranch(cwd, milestoneVersion);
    const msCheck: ExecGitResult = execGit(cwd, ['rev-parse', '--verify', msBranch]);
    if (msCheck.exitCode === 0) {
      targetBranch = msBranch;
    } else {
      const config: GrdConfig = loadConfig(cwd);
      targetBranch = config.base_branch || 'main';
    }
  }

  // Verify target branch exists
  const targetCheck: ExecGitResult = execGit(cwd, [
    'rev-parse',
    '--verify',
    targetBranch,
  ]);
  if (targetCheck.exitCode !== 0) {
    output({ error: `Target branch '${targetBranch}' not found` }, raw);
    return; // unreachable
  }

  // Verify phase branch exists
  const phaseCheck: ExecGitResult = execGit(cwd, [
    'rev-parse',
    '--verify',
    phaseBranch,
  ]);
  if (phaseCheck.exitCode !== 0) {
    output({ error: `Phase branch '${phaseBranch}' not found` }, raw);
    return; // unreachable
  }

  // Record current branch
  const headResult: ExecGitResult = execGit(cwd, [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);
  const originalBranch: string =
    headResult.exitCode === 0 ? headResult.stdout.trim() : 'main';

  // Checkout target branch
  const coResult: ExecGitResult = execGit(cwd, ['checkout', targetBranch]);
  if (coResult.exitCode !== 0) {
    output(
      {
        error: `Failed to checkout target branch '${targetBranch}'`,
        details: coResult.stderr,
      },
      raw
    );
    return; // unreachable
  }

  // Get phase info for merge commit message
  const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phase);
  const phaseName: string = phaseInfo ? phaseInfo.phase_name || slug || phase : slug || phase;

  // Merge phase branch with --no-ff
  const mergeResult: ExecGitResult = execGit(cwd, [
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
    return; // unreachable
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
 * @param cwd - Project working directory
 * @param wtPath - Path to the created worktree ($WORKTREE_PATH)
 * @param wtBranch - Branch name of the created worktree ($WORKTREE_BRANCH)
 * @param raw - If true, output raw text instead of JSON
 * @returns void (outputs JSON or raw text to stdout and exits)
 */
function cmdWorktreeHookCreate(
  cwd: string,
  wtPath: string,
  wtBranch: string,
  raw: boolean
): void {

  // No-op when GRD is inactive
  if (!fs.existsSync(path.join(cwd, '.planning'))) {
    output({ skipped: true, reason: 'no .planning directory' }, raw);
    return; // unreachable
  }

  // No-op when branching is disabled
  const config: GrdConfig = loadConfig(cwd);
  if (config.branching_strategy === 'none') {
    output({ skipped: true, reason: 'branching disabled' }, raw);
    return; // unreachable
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
    return; // unreachable
  }

  // Try to extract phase info from the worktree path for branch rename
  const dirName: string = path.basename(wtPath || '');
  const phaseMatch: RegExpMatchArray | null = dirName.match(/(\d+)$/);

  if (phaseMatch) {
    const phase: string = phaseMatch[1];
    try {
      const milestone: MilestoneInfo = getMilestoneInfo(cwd);
      const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phase);
      const slug: string = phaseInfo
        ? generateSlugInternal(phaseInfo.phase_slug || phaseInfo.phase_name || '') ||
          phase
        : phase;
      const grdBranch: string = worktreeBranch(cwd, milestone.version, phase, slug);

      if (grdBranch !== wtBranch) {
        const renameResult: ExecGitResult = execGit(wtPath, [
          'branch',
          '-m',
          wtBranch,
          grdBranch,
        ]);
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
          return; // unreachable
        }
        // Rename failed — log warning to stderr and continue
        process.stderr.write(
          'Warning: branch rename failed: ' +
            (renameResult.stderr || 'git branch rename failed').trim() +
            '\n'
        );
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
        return; // unreachable
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
 * @param cwd - Project working directory
 * @param wtPath - Path to the removed worktree ($WORKTREE_PATH)
 * @param wtBranch - Branch name of the removed worktree ($WORKTREE_BRANCH)
 * @param raw - If true, output raw text instead of JSON
 * @returns void (outputs JSON or raw text to stdout and exits)
 */
function cmdWorktreeHookRemove(
  cwd: string,
  wtPath: string,
  wtBranch: string,
  raw: boolean
): void {

  // No-op when GRD is inactive
  if (!fs.existsSync(path.join(cwd, '.planning'))) {
    output({ skipped: true, reason: 'no .planning directory' }, raw);
    return; // unreachable
  }

  // No-op when branching is disabled
  const config: GrdConfig = loadConfig(cwd);
  if (config.branching_strategy === 'none') {
    output({ skipped: true, reason: 'branching disabled' }, raw);
    return; // unreachable
  }

  const result: Record<string, unknown> = {
    hooked: true,
    worktree_path: wtPath,
    branch: wtBranch,
    action: 'remove_logged',
  };

  // Try to extract phase/milestone metadata from the worktree path
  // Expected GRD format: grd-worktree-{milestone}-{phase}
  try {
    const meta: WorktreeParsedName | null = parseWorktreeName(wtPath || '');
    if (meta) {
      result.phase_detected = meta.phase;
      result.milestone_detected = meta.milestone;
    }
  } catch (_e) {
    // Best-effort: metadata extraction failure is not an error
  }

  output(result, raw, `Worktree hook: ${result.worktree_path}`);
}

// ─── Hook Handlers ────────────────────────────────────────────────────────────

/**
 * Hook handler for TeammateIdle events.
 * Called when a teammate spawned via Agent tool becomes idle.
 * Supports {continue: false, stopReason: "..."} response to stop the teammate.
 *
 * Environment variables from hook payload:
 * - AGENT_ID: unique identifier of the idle agent
 * - AGENT_TYPE: type of the agent (e.g., "task", "teammate")
 */
function cmdTeammateIdleHook(
  _cwd: string,
  raw: boolean
): void {
  const agentId = process.env.AGENT_ID || 'unknown';
  const agentType = process.env.AGENT_TYPE || 'unknown';

  // For now, allow all teammates to continue.
  // Future: filter by agent_type to stop non-GRD agents or agents that have completed their work.
  const result = {
    ok: true,
    hook: 'TeammateIdle',
    agent_id: agentId,
    agent_type: agentType,
    action: 'continue',
  };

  if (raw) {
    process.stdout.write(`TeammateIdle: agent=${agentId} type=${agentType} action=continue\n`);
  } else {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
}

/**
 * Hook handler for TaskCompleted events.
 * Called when a background task completes.
 * Supports {continue: false, stopReason: "..."} response to stop the task.
 *
 * Environment variables from hook payload:
 * - AGENT_ID: unique identifier of the completed task agent
 * - AGENT_TYPE: type of the agent
 */
function cmdTaskCompletedHook(
  _cwd: string,
  raw: boolean
): void {
  const agentId = process.env.AGENT_ID || 'unknown';
  const agentType = process.env.AGENT_TYPE || 'unknown';

  const result = {
    ok: true,
    hook: 'TaskCompleted',
    agent_id: agentId,
    agent_type: agentType,
    action: 'acknowledged',
  };

  if (raw) {
    process.stdout.write(`TaskCompleted: agent=${agentId} type=${agentType}\n`);
  } else {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
}

/**
 * Hook handler for InstructionsLoaded events.
 * Called when CLAUDE.md or rules files are loaded.
 * Used for plugin setup verification (e.g., confirm .planning/ exists).
 *
 * Environment variables from hook payload:
 * - AGENT_ID: unique identifier of the agent loading instructions
 * - AGENT_TYPE: type of the agent
 */
function cmdInstructionsLoadedHook(
  cwd: string,
  raw: boolean
): void {
  const agentId = process.env.AGENT_ID || 'unknown';
  const agentType = process.env.AGENT_TYPE || 'unknown';
  const planningDir = path.join(cwd, '.planning');
  const planningExists = fs.existsSync(planningDir);

  const result = {
    ok: true,
    hook: 'InstructionsLoaded',
    agent_id: agentId,
    agent_type: agentType,
    planning_exists: planningExists,
  };

  if (raw) {
    process.stdout.write(`InstructionsLoaded: agent=${agentId} planning=${planningExists}\n`);
  } else {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
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
  cmdTeammateIdleHook,
  cmdTaskCompletedHook,
  cmdInstructionsLoadedHook,
};
