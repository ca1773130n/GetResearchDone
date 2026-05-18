'use strict';

/** GRD Commands/Budget -- Phase token budget estimator for pre-execution cost projection */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const {
  safeReadFile,
  output,
  error,
  findPhaseInternal,
}: {
  safeReadFile: (p: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
  findPhaseInternal: (cwd: string, phase: string) => { dir: string; phase: string } | null;
} = require('../utils');

const {
  currentMilestone,
}: {
  currentMilestone: (cwd: string) => string;
} = require('../paths');

interface PlanBudget {
  plan: string;
  task_items: number;
  code_blocks: number;
  dependency_chains: number;
  estimated_tokens_low: number;
  estimated_tokens_mid: number;
  estimated_tokens_high: number;
}

interface PhaseBudget {
  phase: string;
  plans: PlanBudget[];
  total_low: number;
  total_mid: number;
  total_high: number;
  large_plans: string[];
}

const TOKENS_PER_TASK_LOW = 800;
const TOKENS_PER_TASK_MID = 1500;
const TOKENS_PER_TASK_HIGH = 3000;
const TOKENS_PER_CODE_BLOCK = 200;
const TOKENS_PER_DEP_CHAIN = 500;
const LARGE_PLAN_THRESHOLD = 15000;

function _estimatePlan(content: string, planName: string): PlanBudget {
  const taskItems = (content.match(/^[-*]\s+\[[ x]\]/gm) ?? []).length
    + (content.match(/^\d+\.\s+/gm) ?? []).length;
  const codeBlocks = (content.match(/^```/gm) ?? []).length / 2;
  const depChains = (content.match(/\b(depends_on|requires|after|blocks|before):/gi) ?? []).length;

  const low = taskItems * TOKENS_PER_TASK_LOW + codeBlocks * TOKENS_PER_CODE_BLOCK + depChains * TOKENS_PER_DEP_CHAIN;
  const mid = taskItems * TOKENS_PER_TASK_MID + codeBlocks * TOKENS_PER_CODE_BLOCK + depChains * TOKENS_PER_DEP_CHAIN;
  const high = taskItems * TOKENS_PER_TASK_HIGH + codeBlocks * TOKENS_PER_CODE_BLOCK + depChains * TOKENS_PER_DEP_CHAIN;

  return {
    plan: planName,
    task_items: taskItems,
    code_blocks: Math.round(codeBlocks),
    dependency_chains: depChains,
    estimated_tokens_low: low,
    estimated_tokens_mid: mid,
    estimated_tokens_high: high,
  };
}

/**
 * CLI command: Estimate token budget for a phase before execution.
 *
 * Reads all PLAN.md files under .planning/milestones/{v}/phases/{N}/,
 * counts task items, code blocks, and dependency chains, then outputs
 * a projected token range (low/mid/high) per plan and for the whole phase.
 */
function cmdBudget(cwd: string, phaseArg: string, raw: boolean): void {
  if (!phaseArg) {
    error('phase required. Usage: gd budget <phase>');
  }

  try {
    currentMilestone(cwd);
  } catch {
    error('No active milestone found. Run gd init first.');
  }

  // Codex r2 P2: route numeric phase ids through findPhaseInternal so
  // `gd budget 1` resolves to `phases/01-test/` instead of looking for
  // a literal `phases/1/` directory.
  const phaseInfo = findPhaseInternal(cwd, phaseArg!);
  if (!phaseInfo) {
    error(`Phase not found: ${phaseArg}`);
  }
  const phaseDir = phaseInfo!.dir;

  let files: string[];
  try {
    files = (fs.readdirSync(phaseDir) as string[]).filter(
      (f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md'
    );
  } catch {
    error(`Cannot read phase directory: ${phaseDir}`);
  }

  if ((files! as string[]).length === 0) {
    error(`No PLAN.md files found in phase ${phaseArg}`);
  }

  const plans: PlanBudget[] = [];
  for (const file of files!) {
    const content = safeReadFile(path.join(phaseDir, file));
    if (!content) continue;
    plans.push(_estimatePlan(content, file));
  }

  const total_low = plans.reduce((s, p) => s + p.estimated_tokens_low, 0);
  const total_mid = plans.reduce((s, p) => s + p.estimated_tokens_mid, 0);
  const total_high = plans.reduce((s, p) => s + p.estimated_tokens_high, 0);
  const large_plans = plans
    .filter((p) => p.estimated_tokens_mid >= LARGE_PLAN_THRESHOLD)
    .map((p) => p.plan);

  const result: PhaseBudget = {
    phase: phaseArg!,
    plans,
    total_low,
    total_mid,
    total_high,
    large_plans,
  };

  const summary = `Phase ${phaseArg}: ${plans.length} plans, ~${Math.round(total_mid / 1000)}K tokens mid estimate` +
    (large_plans.length > 0 ? ` (${large_plans.length} large plan(s))` : '');
  output(result, raw, summary);
}

module.exports = { cmdBudget };
