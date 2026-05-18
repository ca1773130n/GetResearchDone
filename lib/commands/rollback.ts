'use strict';

/** GRD Commands/Rollback -- Generate phase undo plan from git history */


const fs = require('fs');
const path = require('path');

const {
  output,
  error,
  execGit,
}: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
  execGit: (cwd: string, args: string[], opts?: { allowBlocked?: boolean }) => { stdout: string; exitCode: number };
} = require('../utils');
const {
  planningDir: getPlanningDir,
}: {
  planningDir: (cwd: string) => string;
} = require('../paths');

// ─── Domain Types ────────────────────────────────────────────────────────────

interface RollbackResult {
  phase: string;
  branch: string;
  merge_sha: string | null;
  revert_commands: string[];
  rollback_plan_path: string | null;
  note: string;
}

// ─── Rollback ────────────────────────────────────────────────────────────────

/**
 * CLI command: Generate a safe undo plan for a completed phase.
 *
 * Reads git log for the branch named `grd/phase-{N}`, finds the merge commit SHA,
 * generates `git revert` commands, and writes a step-by-step undo plan to
 * `.planning/rollback-plan.md`. Optionally updates phase status to `rolled-back`.
 * Never executes any git operations — output only.
 *
 * @param cwd - Project working directory
 * @param phase - Phase number (e.g., "3" or "03")
 * @param raw - Output raw text instead of JSON
 */
function cmdRollback(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('phase required. Usage: gd rollback <phase>');
    return;
  }

  // Codex r10 P2: derive the branch name from the configured
  // phase_branch_template (default `grd/{milestone}/{phase}-{slug}`).
  // The legacy hardcoded `grd/phase-${phase}` matched nothing in
  // current projects.
  const { loadConfig } = require('../utils') as {
    loadConfig: (cwd: string) => { phase_branch_template?: string };
  };
  const { findPhaseInternal } = require('../utils') as {
    findPhaseInternal: (
      cwd: string,
      phase: string
    ) => { found: boolean; phase_number?: string; phase_slug?: string | null } | null;
  };
  const { currentMilestone: currentMilestoneFn } = require('../paths') as {
    currentMilestone: (cwd: string) => string;
  };
  const cfg = loadConfig(cwd);
  const template = cfg.phase_branch_template || 'grd/{milestone}/{phase}-{slug}';
  const phaseInfo = findPhaseInternal(cwd, phase);
  let ms = '';
  try {
    ms = currentMilestoneFn(cwd);
  } catch {
    /* milestone may not be set; template can still fill phase */
  }
  const slug = phaseInfo?.phase_slug ?? '';
  const phaseNum = phaseInfo?.phase_number ?? phase;
  const branchName = template
    .replace('{milestone}', ms)
    .replace('{phase}', phaseNum)
    .replace('{slug}', slug)
    .replace(/\/+/g, '/')
    .replace(/-+$/, '');

  // Find merge commit for the phase branch
  const logResult = execGit(cwd, [
    'log',
    '--oneline',
    '--merges',
    '--all',
    `--grep=Merge.*${branchName}`,
    '-10',
  ], { allowBlocked: true });

  let mergeSha: string | null = null;
  let isConfirmedMerge = false;
  if (logResult.exitCode === 0 && logResult.stdout.trim()) {
    const firstLine = logResult.stdout.trim().split('\n')[0];
    mergeSha = firstLine.split(' ')[0] || null;
    if (mergeSha) isConfirmedMerge = true;
  }

  // Fallback: look for branch tip SHA. Not necessarily a merge commit.
  if (!mergeSha) {
    const branchResult = execGit(cwd, ['rev-parse', '--verify', `${branchName}`], { allowBlocked: true });
    if (branchResult.exitCode === 0 && branchResult.stdout.trim()) {
      mergeSha = branchResult.stdout.trim();
    }
  }

  // Codex r6 P2: `git revert -m 1 <sha>` already creates the revert
  // commit (no --no-commit), so the prior `git commit --no-edit` would
  // fail with "nothing to commit". Also, `-m 1` is invalid for
  // non-merge commits, so the branch-tip fallback path needs a
  // different command shape.
  const revertCommands: string[] = [];
  if (mergeSha && isConfirmedMerge) {
    revertCommands.push(
      `git revert -m 1 --no-edit ${mergeSha}  # Revert merge of ${branchName}`
    );
  } else if (mergeSha) {
    revertCommands.push(
      `# Branch tip ${mergeSha} may not be a merge commit. If it is, add \`-m 1\`:`
    );
    revertCommands.push(
      `git revert --no-edit ${mergeSha}  # Revert tip of ${branchName}`
    );
  } else {
    revertCommands.push(`# Could not locate merge commit for ${branchName}`);
    revertCommands.push(`# Manual steps: git log --oneline --merges --all | grep "${branchName}"`);
    revertCommands.push(`# Then: git revert -m 1 --no-edit <sha>`);
  }

  // Write rollback plan to .planning/rollback-plan.md
  const planningDir = getPlanningDir(cwd);
  const rollbackPlanPath = path.join(planningDir, 'rollback-plan.md');
  let writtenPath: string | null = null;

  const today = new Date().toISOString().split('T')[0];
  const planContent = [
    `# Rollback Plan — Phase ${phase}`,
    ``,
    `Generated: ${today}`,
    `Branch: \`${branchName}\``,
    `Merge SHA: ${mergeSha ?? '(not found — see manual steps below)'}`,
    ``,
    `## Steps`,
    ``,
    `1. Ensure your working tree is clean: \`git status\``,
    `2. Switch to the integration branch: \`git checkout main\` (or your base branch)`,
    `3. Run the revert commands below:`,
    ``,
    revertCommands.map((c) => `   \`\`\`\n   ${c}\n   \`\`\``).join('\n'),
    ``,
    `4. Verify tests pass: \`npm test\``,
    `5. Update STATE.md phase ${phase} status to \`rolled-back\``,
    ``,
    `## Notes`,
    ``,
    `- This plan was generated automatically and does not execute any git operations.`,
    `- Always review the revert diff before committing.`,
    `- If the merge SHA is missing, locate it with: \`git log --oneline --merges --all\``,
  ].join('\n');

  try {
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(rollbackPlanPath, planContent, 'utf-8');
    writtenPath = path.relative(cwd, rollbackPlanPath);
  } catch {
    // Non-fatal — output result anyway
  }

  const result: RollbackResult = {
    phase,
    branch: branchName,
    merge_sha: mergeSha,
    revert_commands: revertCommands,
    rollback_plan_path: writtenPath,
    note: 'No git operations were executed. Review the plan before running revert commands.',
  };

  const summary = mergeSha
    ? `Rollback plan for phase ${phase}: revert ${mergeSha}`
    : `Rollback plan for phase ${phase}: merge SHA not found — manual steps generated`;

  output(result, raw, summary);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { cmdRollback };
