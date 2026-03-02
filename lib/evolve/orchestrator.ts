'use strict';

/**
 * GRD Evolve -- Orchestrator
 *
 * Main evolve iteration loop, iteration step handling, evolution notes,
 * and todos integration. Prompt templates are in ./_prompts.ts.
 *
 * @dependencies ./types, ./state, ./discovery, ./scoring, ./_prompts,
 *              ../utils, ../autopilot, ../worktree
 */

import type {
  WorkItem,
  WorkGroup,
  EvolveState,
  EvolveGroupState,
  EvolveOptions,
  EvolveResult,
  GroupOutcome,
  GroupDiscoveryResult,
  IterationResult,
  DryRunIterationResult,
  IterationContext,
  IterationStepResult,
  HandleIterationReturn,
  WorktreeInfo,
  EvolutionNotesData,
  HistoryEntry,
  InfiniteEvolveOptions,
  InfiniteEvolveResult,
  InfiniteEvolveCycleResult,
} from './types';
import type { AutoplanOptions, AutoplanResult, MultiMilestoneOptions, MultiMilestoneResult, GrdConfig } from '../types';

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../utils') as {
  loadConfig: (cwd: string) => GrdConfig;
};
const { execGit } = require('../utils') as {
  execGit: (
    cwd: string,
    args: string[],
    opts?: { allowBlocked?: boolean }
  ) => { exitCode: number; stdout: string; stderr: string };
};
const { spawnClaudeAsync } = require('../autopilot') as {
  spawnClaudeAsync: (
    cwd: string,
    prompt: string,
    opts?: {
      captureOutput?: boolean;
      model?: string;
      maxTurns?: number;
      timeout?: number;
      outputFormat?: string;
      captureStderr?: boolean;
    }
  ) => Promise<{
    exitCode: number;
    stdout?: string;
    stderr?: string;
    timedOut: boolean;
  }>;
};
const { createEvolveWorktree, removeEvolveWorktree, pushAndCreatePR } =
  require('../worktree') as {
    createEvolveWorktree: (cwd: string) => {
      path: string;
      branch: string;
      baseBranch: string;
      error?: string;
    };
    removeEvolveWorktree: (
      cwd: string,
      wtPath: string
    ) => { removed: boolean; error?: string };
    pushAndCreatePR: (
      cwd: string,
      wtPath: string,
      opts?: { base?: string }
    ) => { pr_url?: string; error?: string };
  };
const { SONNET_MODEL, DEFAULT_PICK_PCT, readEvolveState, writeEvolveState } =
  require('./state') as {
    SONNET_MODEL: string;
    DEFAULT_PICK_PCT: number;
    readEvolveState: (cwd: string) => EvolveGroupState | EvolveState | null;
    writeEvolveState: (cwd: string, state: EvolveGroupState | EvolveState) => void;
  };
const { runGroupDiscovery } = require('./discovery') as {
  runGroupDiscovery: (
    cwd: string,
    previousState: EvolveGroupState | EvolveState | null,
    pickPct?: number
  ) => Promise<GroupDiscoveryResult>;
};
const { buildBatchExecutePrompt, buildBatchReviewPrompt } = require('./_prompts') as {
  buildBatchExecutePrompt: (groups: WorkGroup[]) => string;
  buildBatchReviewPrompt: (groups: WorkGroup[]) => string;
};
const { runAutoplan } = require('../autoplan') as {
  runAutoplan: (cwd: string, options?: AutoplanOptions) => Promise<AutoplanResult>;
};
const { runMultiMilestoneAutopilot } = require('../autopilot') as {
  runMultiMilestoneAutopilot: (cwd: string, options?: MultiMilestoneOptions) => Promise<MultiMilestoneResult>;
};

// ─── Evolve Loop Helpers ─────────────────────────────────────────────────────

/**
 * Run a single iteration step: discover groups, set up worktree if needed,
 * batch-execute, and batch-review.
 */
async function _runIterationStep(iterCtx: IterationContext): Promise<IterationStepResult> {
  const {
    discoveryCwd,
    state,
    effectivePickPct,
    dryRun,
    timeoutMs,
    maxTurns,
    cwd,
    log,
  } = iterCtx;

  let { useWorktree, worktreeInfo, executionCwd } = iterCtx;

  // 1. Discover and group (always from original cwd)
  const discovery: GroupDiscoveryResult = await runGroupDiscovery(
    discoveryCwd,
    state,
    effectivePickPct
  );
  log(
    `Discovered ${discovery.all_items_count} new + ${discovery.merged_items_count - discovery.all_items_count} carried-over = ${discovery.merged_items_count} total items, ${discovery.groups_count} groups, selected ${discovery.selected_groups.length}`
  );

  if (dryRun) {
    return { discovery, outcomes: [], worktreeInfo, executionCwd, useWorktree, isDryRun: true };
  }

  if (discovery.selected_groups.length === 0) {
    return { discovery, outcomes: null, worktreeInfo, executionCwd, useWorktree, isDryRun: false };
  }

  // Create worktree on first non-dry-run iteration if enabled
  if (useWorktree && !worktreeInfo) {
    const wtResult = createEvolveWorktree(cwd);
    if (wtResult.error) {
      log(`Worktree creation failed: ${wtResult.error}. Continuing without isolation.`);
      useWorktree = false;
    } else {
      worktreeInfo = wtResult;
      executionCwd = wtResult.path;
      log(`Created worktree at ${wtResult.path} (branch: ${wtResult.branch})`);
    }
  }

  // 2. Batch-execute ALL selected groups in one subprocess, then review once
  const outcomes: GroupOutcome[] = [];
  const allGroups: WorkGroup[] = discovery.selected_groups;
  const totalItems: number = allGroups.reduce((sum, g) => sum + g.items.length, 0);
  log(`Batch-executing ${allGroups.length} groups (${totalItems} items) in one subprocess`);

  const executePrompt: string = buildBatchExecutePrompt(allGroups);
  const execResult = await spawnClaudeAsync(executionCwd, executePrompt, {
    model: SONNET_MODEL,
    timeout: timeoutMs,
    maxTurns,
  });

  if (execResult.exitCode !== 0) {
    const reason: string = execResult.timedOut ? 'timeout' : `exit ${execResult.exitCode}`;
    log(`Batch execute FAILED (${reason})`);
    for (const group of allGroups) {
      outcomes.push({ group: group.id, status: 'fail', step: 'execute', reason });
    }
  } else {
    log(`Batch execute completed`);

    log(`Running single review for all ${allGroups.length} groups`);
    const reviewPrompt: string = buildBatchReviewPrompt(allGroups);
    const reviewResult = await spawnClaudeAsync(executionCwd, reviewPrompt, {
      model: SONNET_MODEL,
      timeout: timeoutMs,
      maxTurns,
    });

    if (reviewResult.exitCode !== 0) {
      const reason: string = reviewResult.timedOut ? 'timeout' : `exit ${reviewResult.exitCode}`;
      log(`Batch review FAILED (${reason}) — execution changes kept`);
    } else {
      log(`Batch review completed`);
    }

    for (const group of allGroups) {
      outcomes.push({ group: group.id, status: 'pass' });
    }
  }

  return { discovery, outcomes, worktreeInfo, executionCwd, useWorktree, isDryRun: false };
}

/**
 * Process the result of a single iteration step.
 */
function _handleIterationResult(
  stepResult: IterationStepResult,
  prevState: EvolveGroupState | null,
  iterNum: number,
  effectivePickPct: number,
  cwd: string
): HandleIterationReturn {
  const { discovery, outcomes } = stepResult;

  // Write evolution notes (always to original cwd)
  writeEvolutionNotes(cwd, {
    iteration: iterNum,
    items: discovery.selected_groups.flatMap((g) => g.items),
    outcomes: (outcomes || []).map((o) => ({
      item: o.group,
      status: o.status,
      step: o.step,
      reason: o.reason,
    })),
    decisions: [],
    patterns: [],
    takeaways: [],
  });

  // Compute completed and failed groups
  const milestone: string = prevState ? prevState.milestone : '';
  const completedGroups: WorkGroup[] = (outcomes || [])
    .filter((o) => o.status === 'pass')
    .map((o) => discovery.selected_groups.find((g) => g.id === o.group))
    .filter((g): g is WorkGroup => g !== undefined)
    .map((g) => ({ ...g, status: 'completed' }));
  const failedGroups: WorkGroup[] = (outcomes || [])
    .filter((o) => o.status === 'fail')
    .map((o) => discovery.selected_groups.find((g) => g.id === o.group))
    .filter((g): g is WorkGroup => g !== undefined)
    .map((g) => ({ ...g, status: 'failed' }));

  // Build new state
  const historyEntry: HistoryEntry = {
    iteration: iterNum,
    timestamp: new Date().toISOString(),
    selected_count: discovery.selected_groups.length,
    completed_count: completedGroups.length,
    failed_count: failedGroups.length,
  };
  const newState: EvolveGroupState = {
    iteration: iterNum,
    timestamp: new Date().toISOString(),
    milestone,
    pick_pct: effectivePickPct,
    selected_groups: discovery.selected_groups,
    remaining_groups: discovery.remaining_groups,
    completed_groups: completedGroups,
    failed_groups: failedGroups,
    all_items_count: discovery.all_items_count,
    groups_count: discovery.groups_count,
    history: prevState ? [...(prevState.history || []), historyEntry] : [historyEntry],
  };

  const iterResult: IterationResult = {
    iteration: iterNum,
    status: 'completed',
    groups_attempted: (outcomes || []).length,
    groups_passed: completedGroups.length,
    groups_failed: failedGroups.length,
    remaining_groups: discovery.remaining_groups.length,
  };

  return { newState, iterResult };
}

// ─── Todos Integration ───────────────────────────────────────────────────────

/**
 * Create or append evolution notes to .planning/EVOLUTION.md.
 */
function writeEvolutionNotes(cwd: string, iterationData: EvolutionNotesData): void {
  const filePath: string = path.join(cwd, '.planning', 'EVOLUTION.md');
  const { iteration, items, outcomes, decisions, patterns, takeaways } = iterationData;

  // Create file with header if it doesn't exist
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '# Evolution Notes\n\n');
  }

  const lines: string[] = [];
  lines.push(`## Iteration ${iteration}`);
  lines.push(`_${new Date().toISOString()}_\n`);

  // Items Attempted
  lines.push('### Items Attempted\n');
  if (items.length === 0) {
    lines.push('None\n');
  } else {
    for (let i = 0; i < items.length; i++) {
      const item: WorkItem = items[i];
      process.stderr.write(`[evolve] Writing item ${i + 1}/${items.length}: ${item.title}\n`);
      const outcome = outcomes.find((o) => o.item === item.title);
      const status: string = outcome ? outcome.status : 'unknown';
      lines.push(`- **${item.title}** — ${status}`);
    }
    lines.push('');
  }

  // Decisions Made
  lines.push('### Decisions Made\n');
  if (decisions.length === 0) {
    lines.push('None\n');
  } else {
    for (let i = 0; i < decisions.length; i++) {
      process.stderr.write(`[evolve] Writing decision ${i + 1}/${decisions.length}\n`);
      lines.push(`- ${decisions[i]}`);
    }
    lines.push('');
  }

  // Patterns Discovered
  lines.push('### Patterns Discovered\n');
  if (patterns.length === 0) {
    lines.push('None\n');
  } else {
    for (let i = 0; i < patterns.length; i++) {
      process.stderr.write(`[evolve] Writing pattern ${i + 1}/${patterns.length}\n`);
      lines.push(`- ${patterns[i]}`);
    }
    lines.push('');
  }

  // Takeaways
  lines.push('### Takeaways\n');
  if (takeaways.length === 0) {
    lines.push('None\n');
  } else {
    for (let i = 0; i < takeaways.length; i++) {
      process.stderr.write(`[evolve] Writing takeaway ${i + 1}/${takeaways.length}\n`);
      lines.push(`- ${takeaways[i]}`);
    }
    lines.push('');
  }

  lines.push('---\n');

  fs.appendFileSync(filePath, lines.join('\n'));
}

// ─── Main Orchestrator ──────────────────────────────────────────────────────

/**
 * Main evolve orchestration loop.
 */
async function runEvolve(cwd: string, options: EvolveOptions = {}): Promise<EvolveResult> {
  const { iterations = 1, pickPct, timeout, maxTurns, dryRun = false } = options;
  const effectivePickPct: number = pickPct !== undefined ? pickPct : DEFAULT_PICK_PCT;
  const timeoutMs: number | undefined = timeout ? timeout * 60 * 1000 : undefined;
  const unlimited: boolean = iterations === 0;

  // Auto-detect worktree usage from config if not explicitly set
  let useWorktree: boolean = options.useWorktree !== undefined ? options.useWorktree : false;
  if (options.useWorktree === undefined) {
    const config: GrdConfig = loadConfig(cwd);
    useWorktree = config.branching_strategy !== 'none';
  }

  // Set up logging (same pattern as autopilot.js)
  const logFile: string = path.join(cwd, '.planning', 'autopilot', 'evolve.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = (msg: string): void => {
    const line: string = `[${new Date().toISOString()}] ${msg}\n`;
    process.stderr.write(`[evolve] ${msg}\n`);
    fs.appendFileSync(logFile, line);
  };

  // Two cwd variables: discovery always scans the original cwd,
  // execution may run in a worktree
  const discoveryCwd: string = cwd;
  let executionCwd: string = cwd;
  let worktreeInfo: WorktreeInfo | null = null;

  const results: Array<IterationResult | DryRunIterationResult> = [];
  let state: EvolveGroupState | EvolveState | null = readEvolveState(cwd);
  let iterCount: number = 0;

  while (unlimited || iterCount < iterations) {
    const iterNum: number = state ? state.iteration + 1 : 1;
    log(`Starting iteration ${iterNum}`);

    const stepResult: IterationStepResult = await _runIterationStep({
      discoveryCwd,
      executionCwd,
      state,
      useWorktree,
      worktreeInfo,
      effectivePickPct,
      dryRun,
      timeoutMs,
      maxTurns,
      cwd,
      log,
    });

    // Propagate mutable worktree state back from the step
    useWorktree = stepResult.useWorktree;
    worktreeInfo = stepResult.worktreeInfo;
    executionCwd = stepResult.executionCwd;

    if (stepResult.isDryRun) {
      const { discovery } = stepResult;
      const groupsPerIter: number = discovery.selected_groups.length;
      results.push({
        iteration: iterNum,
        status: 'dry-run' as const,
        groups: discovery.groups.map((g) => ({
          id: g.id,
          priority: g.priority,
          item_count: g.items.length,
          effort: g.effort,
        })),
        total_items: discovery.all_items_count,
        total_groups: discovery.groups_count,
        groups_per_iteration: groupsPerIter,
        estimated_iterations:
          groupsPerIter > 0 ? Math.ceil(discovery.groups_count / groupsPerIter) : 0,
      });
      break; // dry-run always exits after one iteration
    }

    if (stepResult.outcomes === null) {
      log('No groups to process. Done.');
      break;
    }

    const { newState, iterResult } = _handleIterationResult(
      stepResult,
      state as EvolveGroupState | null,
      iterNum,
      effectivePickPct,
      cwd
    );

    state = newState;
    writeEvolveState(cwd, state);
    results.push(iterResult);

    iterCount++;
  }

  // Post-loop: push + PR + cleanup if worktree was used
  let prInfo: { pr_url?: string; error?: string } | null = null;
  if (worktreeInfo) {
    // Check if there are any commits on the worktree branch
    const logResult = execGit(worktreeInfo.path, [
      'log',
      `${worktreeInfo.baseBranch}..HEAD`,
      '--oneline',
    ]);
    const hasCommits: boolean = logResult.exitCode === 0 && logResult.stdout.trim().length > 0;

    if (hasCommits) {
      log(`Pushing worktree branch and creating PR...`);
      prInfo = pushAndCreatePR(cwd, worktreeInfo.path, {
        base: worktreeInfo.baseBranch,
      });
      if (prInfo.error) {
        log(`PR creation failed: ${prInfo.error}`);
      } else {
        log(`PR created: ${prInfo.pr_url}`);
      }
    } else {
      log('No commits on worktree branch, skipping PR.');
    }

    // Clean up worktree
    const removeResult = removeEvolveWorktree(cwd, worktreeInfo.path);
    log(`Worktree cleanup: ${removeResult.removed ? 'removed' : 'failed'}`);
  }

  log(`Done: ${results.length} iteration(s) completed`);
  const returnValue: EvolveResult = {
    iterations_completed: results.length,
    results,
    evolution_notes_path: path.join('.planning', 'EVOLUTION.md'),
  };
  if (worktreeInfo) {
    returnValue.worktree = { path: worktreeInfo.path, branch: worktreeInfo.branch };
  }
  if (prInfo && !prInfo.error) {
    returnValue.pr = prInfo;
  }
  return returnValue;
}

/**
 * Write discovered groups as todo files into .planning/milestones/anonymous/todos/pending/.
 */
function writeDiscoveriesToTodos(cwd: string, groups: WorkGroup[]): number {
  if (!groups || groups.length === 0) return 0;

  const pendingDir: string = path.join(
    cwd,
    '.planning',
    'milestones',
    'anonymous',
    'todos',
    'pending'
  );
  fs.mkdirSync(pendingDir, { recursive: true });

  // Get existing files to support idempotency
  let existingFiles: Set<string>;
  try {
    existingFiles = new Set(fs.readdirSync(pendingDir) as string[]);
  } catch {
    existingFiles = new Set();
  }

  let created: number = 0;
  const now: string = new Date().toISOString();

  for (const group of groups) {
    // Derive a stable filename from the group id (replace / with -)
    const idSlug: string = group.id.replace(/\//g, '-').replace(/[^a-z0-9-]/gi, '-');
    const filename: string = `evolve-${idSlug}.md`;

    if (existingFiles.has(filename)) {
      continue; // Already exists — skip
    }

    const itemCount: number = Array.isArray(group.items) ? group.items.length : 0;
    const itemList: string = Array.isArray(group.items)
      ? group.items.map((i) => `- **${i.title}**: ${i.description}`).join('\n')
      : '';

    const content: string = [
      '---',
      `title: "${group.theme || group.id}"`,
      `created: "${now}"`,
      `area: "${group.dimension || 'unknown'}"`,
      `source: evolve-discovery`,
      '---',
      '',
      `## ${group.theme || group.id}`,
      '',
      `**${itemCount} item${itemCount !== 1 ? 's' : ''}** discovered by evolve loop.`,
      '',
      itemList,
    ].join('\n');

    fs.writeFileSync(path.join(pendingDir, filename), content + '\n');
    existingFiles.add(filename);
    created++;
  }

  return created;
}

// ─── Infinite Evolve Loop ────────────────────────────────────────────────────

/**
 * Run the infinite evolve loop: discover -> autoplan -> autopilot -> repeat.
 *
 * Each cycle:
 * 1. Discover improvements via evolve's discovery engine
 * 2. Create a milestone from discoveries via autoplan
 * 3. Execute all phases in that milestone via autopilot
 * 4. Repeat until maxCycles reached, time budget exhausted, or no discoveries remain
 *
 * Safety: maxCycles cap (default 10), optional timeBudget, dry-run preview.
 */
async function runInfiniteEvolve(
  cwd: string,
  options: InfiniteEvolveOptions = {}
): Promise<InfiniteEvolveResult> {
  const maxCycles: number = options.maxCycles ?? 10;
  const timeBudget: number = options.timeBudget ?? 0; // 0 = unlimited
  const effectivePickPct: number = options.pickPct ?? DEFAULT_PICK_PCT;
  const dryRun: boolean = options.dryRun ?? false;
  const maxTurns: number | undefined = options.maxTurns;
  const model: string | undefined = options.model;
  const maxMilestones: number = options.maxMilestones ?? 1;

  // Set up logging
  const logFile: string = path.join(cwd, '.planning', 'autopilot', 'infinite-evolve.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = (msg: string): void => {
    const line: string = `[${new Date().toISOString()}] ${msg}\n`;
    process.stderr.write(`[infinite-evolve] ${msg}\n`);
    fs.appendFileSync(logFile, line);
  };

  const startTime: number = Date.now();
  const cycleResults: InfiniteEvolveCycleResult[] = [];
  let totalGroupsDiscovered: number = 0;
  let totalItemsDiscovered: number = 0;
  let stoppedAt: string | null = null;

  log(`Starting infinite evolve loop: maxCycles=${maxCycles}, timeBudget=${timeBudget}min, pickPct=${effectivePickPct}, dryRun=${dryRun}`);

  for (let cycle = 0; cycle < maxCycles; cycle++) {
    // Check time budget
    if (timeBudget > 0) {
      const elapsedMs: number = Date.now() - startTime;
      if (elapsedMs > timeBudget * 60 * 1000) {
        stoppedAt = `Time budget exhausted (${Math.round(elapsedMs / 60000)}min of ${timeBudget}min)`;
        log(stoppedAt);
        break;
      }
    }

    log(`=== Cycle ${cycle + 1}/${maxCycles} ===`);

    // Step 1: Discovery
    log('Step 1: Running discovery...');
    const state: EvolveGroupState | EvolveState | null = readEvolveState(cwd);
    let discovery: GroupDiscoveryResult;
    try {
      discovery = await runGroupDiscovery(cwd, state, effectivePickPct);
    } catch (err) {
      const reason: string = `Discovery failed: ${(err as Error).message}`;
      log(reason);
      cycleResults.push({
        cycle: cycle + 1,
        discovery_groups: 0,
        discovery_items: 0,
        autoplan_status: 'skipped',
        autopilot_status: 'skipped',
        reason,
      });
      stoppedAt = reason;
      break;
    }

    const groupCount: number = discovery.selected_groups.length;
    const itemCount: number = discovery.selected_groups.reduce((sum, g) => sum + g.items.length, 0);
    totalGroupsDiscovered += groupCount;
    totalItemsDiscovered += itemCount;
    log(`Discovered ${groupCount} groups (${itemCount} items)`);

    if (groupCount === 0) {
      stoppedAt = 'No improvements discovered';
      log(stoppedAt);
      cycleResults.push({
        cycle: cycle + 1,
        discovery_groups: 0,
        discovery_items: 0,
        autoplan_status: 'skipped',
        autopilot_status: 'skipped',
        reason: stoppedAt,
      });
      break;
    }

    if (dryRun) {
      log(`[DRY RUN] Would create milestone from ${groupCount} groups (${itemCount} items)`);
      cycleResults.push({
        cycle: cycle + 1,
        discovery_groups: groupCount,
        discovery_items: itemCount,
        autoplan_status: 'dry-run',
        autopilot_status: 'dry-run',
      });
      // Dry run exits after one cycle to show what would happen
      break;
    }

    // Step 2: Autoplan -- create milestone from discoveries
    log('Step 2: Running autoplan...');
    const autoplanGroups: AutoplanOptions['groups'] = discovery.selected_groups.map((g) => ({
      id: g.id,
      theme: g.theme,
      dimension: g.dimension,
      items: g.items.map((item) => ({
        title: item.title,
        description: item.description,
        effort: item.effort,
      })),
      priority: g.priority,
      effort: g.effort,
    }));

    let autoplanResult: AutoplanResult;
    try {
      autoplanResult = await runAutoplan(cwd, {
        groups: autoplanGroups,
        dryRun: false,
        timeout: options.timeout,
        maxTurns,
        model,
      });
    } catch (err) {
      const reason: string = `Autoplan failed: ${(err as Error).message}`;
      log(reason);
      cycleResults.push({
        cycle: cycle + 1,
        discovery_groups: groupCount,
        discovery_items: itemCount,
        autoplan_status: 'failed',
        autopilot_status: 'skipped',
        reason,
      });
      continue; // Try next cycle
    }

    if (autoplanResult.status === 'failed') {
      const reason: string = `Autoplan failed: ${autoplanResult.reason || 'unknown'}`;
      log(reason);
      cycleResults.push({
        cycle: cycle + 1,
        discovery_groups: groupCount,
        discovery_items: itemCount,
        autoplan_status: 'failed',
        autopilot_status: 'skipped',
        reason,
      });
      continue; // Try next cycle
    }

    log(`Autoplan completed: milestone "${autoplanResult.milestone_name}" (${autoplanResult.groups_count} groups, ${autoplanResult.items_count} items)`);

    // Step 3: Autopilot -- execute newly created milestone phases
    log('Step 3: Running multi-milestone autopilot...');
    let autopilotResult: MultiMilestoneResult;
    try {
      autopilotResult = await runMultiMilestoneAutopilot(cwd, {
        dryRun: false,
        timeout: options.timeout,
        maxTurns,
        model,
        maxMilestones,
      });
    } catch (err) {
      const reason: string = `Autopilot failed: ${(err as Error).message}`;
      log(reason);
      cycleResults.push({
        cycle: cycle + 1,
        discovery_groups: groupCount,
        discovery_items: itemCount,
        autoplan_status: 'completed',
        autopilot_status: 'failed',
        reason,
      });
      continue; // Try next cycle
    }

    const autopilotStatus: string = autopilotResult.stopped_at ? 'failed' : 'completed';
    if (autopilotResult.stopped_at) {
      log(`Autopilot stopped: ${autopilotResult.stopped_at} (${autopilotResult.milestones_completed}/${autopilotResult.milestones_attempted} milestones)`);
    } else {
      log(`Autopilot completed: ${autopilotResult.milestones_completed} milestones, ${autopilotResult.total_phases_completed} phases`);
    }

    cycleResults.push({
      cycle: cycle + 1,
      discovery_groups: groupCount,
      discovery_items: itemCount,
      autoplan_status: 'completed',
      autopilot_status: autopilotStatus,
      reason: autopilotResult.stopped_at ?? undefined,
    });
  }

  // Summary
  const cyclesCompleted: number = cycleResults.filter(
    (c) => c.autoplan_status === 'completed' && c.autopilot_status === 'completed'
  ).length;

  log(`Infinite evolve done: ${cyclesCompleted}/${cycleResults.length} cycles completed, ${totalGroupsDiscovered} groups, ${totalItemsDiscovered} items`);

  return {
    cycles_completed: cyclesCompleted,
    cycles_attempted: cycleResults.length,
    stopped_at: stoppedAt,
    cycle_results: cycleResults,
    total_groups_discovered: totalGroupsDiscovered,
    total_items_discovered: totalItemsDiscovered,
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  _runIterationStep,
  _handleIterationResult,
  writeEvolutionNotes,
  writeDiscoveriesToTodos,
  runEvolve,
  runInfiniteEvolve,
};
