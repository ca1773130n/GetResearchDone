'use strict';

/**
 * GRD Autoplan -- Convert evolve discovery results into structured milestones.
 *
 * Bridges evolve's discovery (work items grouped by theme) with the new-milestone
 * skill. Takes discovered improvement groups and creates a milestone with phases,
 * requirements, and a roadmap -- entirely without human input.
 *
 * Created in Phase 67.
 *
 * @module autoplan
 */

import type { AutoplanOptions, AutoplanResult, GrdConfig, MilestoneInfo } from './types';
import type {
  WorkGroup,
  GroupDiscoveryResult,
  EvolveGroupState,
  EvolveState,
} from './evolve/types';

const { loadConfig, output, getMilestoneInfo }: {
  loadConfig: (cwd: string) => GrdConfig;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
} = require('./utils');
const { spawnClaude }: {
  spawnClaude: (
    cwd: string,
    prompt: string,
    opts?: { timeout?: number; maxTurns?: number; model?: string }
  ) => { exitCode: number; timedOut: boolean };
} = require('./autopilot');
const { runGroupDiscovery }: {
  runGroupDiscovery: (
    cwd: string,
    previousState: EvolveGroupState | EvolveState | null,
    pickPct?: number
  ) => Promise<GroupDiscoveryResult>;
} = require('./evolve/discovery');
const { readEvolveState }: {
  readEvolveState: (cwd: string) => EvolveGroupState | EvolveState | null;
} = require('./evolve/state');

// ─── Prompt Builder ──────────────────────────────────────────────────────────

/**
 * Build a prompt string for `claude -p` that instructs it to create a new milestone
 * from the discovered work groups.
 */
function buildAutoplanPrompt(groups: WorkGroup[], milestoneName?: string): string {
  const groupSummaries: string = groups
    .map((g, idx) => {
      const itemList: string = g.items
        .map((item) => `    - ${item.title}: ${item.description} (effort: ${item.effort})`)
        .join('\n');
      return `${idx + 1}. **${g.theme}** (dimension: ${g.dimension}, priority: ${g.priority}, effort: ${g.effort})\n${itemList}`;
    })
    .join('\n\n');

  const nameInstruction: string = milestoneName
    ? `Use "${milestoneName}" as the milestone name.`
    : 'Derive a concise milestone name from the dominant themes of the work groups.';

  // Detect if we have product-ideation groups
  const hasProductIdeation: boolean = groups.some((g) => g.dimension === 'product-ideation');
  const productIdeationGuidance: string = hasProductIdeation
    ? `\n\n## Product Feature Guidance\n\nSome groups are product-ideation items (creative feature proposals, not code fixes). For these:\n- Create phases that BUILD NEW FEATURES, not just refactor existing code\n- Phase names should reflect the user-facing capability being added\n- Requirements should describe user value and expected behavior\n- Verification should include user-facing acceptance criteria\n- These are higher priority than code-quality improvements`
    : '';

  return `Use the Skill tool to invoke skill "grd:new-milestone" with no additional args. Autonomous mode — make all decisions yourself, no questions.

${nameInstruction}

Use the following discovered work groups as the basis for milestone phases. Each high-priority group should map to one phase; related groups can be combined into a single phase if they share a dimension or theme.

## Discovered Work Groups

${groupSummaries}${productIdeationGuidance}

## Instructions

- Create phases for each major work group (high priority first)
- Include requirements derived from the work items
- Set appropriate verification levels based on effort estimates
- Complete all milestone creation steps including research, requirements, and roadmap setup`;
}

// ─── Core Runner ─────────────────────────────────────────────────────────────

/**
 * Run the autoplan workflow: discover work groups (or use provided ones),
 * build a prompt, and spawn a `claude -p` subprocess to create a milestone.
 */
async function runAutoplan(
  cwd: string,
  options: AutoplanOptions = {}
): Promise<AutoplanResult> {
  let groups: WorkGroup[];

  // Use provided groups or run discovery
  if (options.groups && options.groups.length > 0) {
    // Convert simplified group format to WorkGroup interface
    groups = options.groups.map((g) => ({
      id: g.id,
      theme: g.theme,
      dimension: g.dimension,
      items: g.items.map((item) => ({
        id: `${g.id}-${item.title.toLowerCase().replace(/\s+/g, '-').slice(0, 30)}`,
        dimension: g.dimension,
        slug: item.title.toLowerCase().replace(/\s+/g, '-').slice(0, 40),
        title: item.title,
        description: item.description,
        effort: item.effort as 'small' | 'medium' | 'large',
        source: 'discovery' as const,
        status: 'pending' as const,
        iteration_added: 0,
      })),
      priority: g.priority,
      effort: g.effort as 'small' | 'medium' | 'large',
    }));
  } else {
    // Run discovery
    const previousState: EvolveGroupState | EvolveState | null = readEvolveState(cwd);
    const discoveryResult: GroupDiscoveryResult = await runGroupDiscovery(
      cwd,
      previousState,
      options.pickPct
    );
    groups = discoveryResult.selected_groups;
  }

  // No groups available
  if (groups.length === 0) {
    return {
      status: 'failed',
      groups_count: 0,
      items_count: 0,
      prompt: '',
      reason: 'No work groups available for autoplan',
    };
  }

  // Derive milestone name
  const milestoneName: string =
    options.milestoneName ||
    groups.sort((a, b) => b.priority - a.priority)[0]?.theme ||
    'Improvements';

  // Count total items
  const itemsCount: number = groups.reduce((sum, g) => sum + g.items.length, 0);

  // Build the prompt
  const prompt: string = buildAutoplanPrompt(groups, milestoneName);

  // Dry run: return prompt without spawning
  if (options.dryRun) {
    return {
      status: 'dry-run',
      groups_count: groups.length,
      items_count: itemsCount,
      prompt,
      milestone_name: milestoneName,
    };
  }

  // Spawn claude -p to create the milestone
  const timeoutMs: number | undefined = options.timeout ? options.timeout * 60 * 1000 : undefined;
  const spawnResult = spawnClaude(cwd, prompt, {
    timeout: timeoutMs,
    maxTurns: options.maxTurns,
    model: options.model,
  });

  if (spawnResult.exitCode !== 0) {
    const reason: string = spawnResult.timedOut
      ? 'timeout'
      : `exit code ${spawnResult.exitCode}`;
    return {
      status: 'failed',
      groups_count: groups.length,
      items_count: itemsCount,
      prompt,
      milestone_name: milestoneName,
      reason,
    };
  }

  return {
    status: 'completed',
    groups_count: groups.length,
    items_count: itemsCount,
    prompt,
    milestone_name: milestoneName,
  };
}

// ─── CLI Entry Points ────────────────────────────────────────────────────────

/**
 * Parse CLI flags and run the autoplan workflow.
 */
async function cmdAutoplan(cwd: string, args: string[], raw: boolean): Promise<void> {
  const flag = (name: string, fallback: string | null): string | null => {
    const i: number = args.indexOf(name);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const hasFlag = (name: string): boolean => args.indexOf(name) !== -1;

  const options: AutoplanOptions = {
    dryRun: hasFlag('--dry-run'),
    timeout: hasFlag('--timeout') ? parseInt(flag('--timeout', '0')!, 10) : undefined,
    maxTurns: flag('--max-turns', null) ? parseInt(flag('--max-turns', '0')!, 10) : undefined,
    model: flag('--model', undefined as unknown as null) ?? undefined,
    pickPct: hasFlag('--pick-pct') ? parseInt(flag('--pick-pct', '50')!, 10) : undefined,
    milestoneName: flag('--name', undefined as unknown as null) ?? undefined,
  };

  const result: AutoplanResult = await runAutoplan(cwd, options);
  const rawSummary: string | undefined = raw
    ? `Autoplan: ${result.status} (${result.groups_count} groups, ${result.items_count} items)`
    : undefined;
  output(result, raw, rawSummary);
}

/**
 * Pre-flight context for autoplan initialization.
 * Returns evolve state, current milestone info, and config.
 */
function cmdInitAutoplan(cwd: string, raw: boolean): void {
  const config: GrdConfig = loadConfig(cwd);
  const evolveState: EvolveGroupState | EvolveState | null = readEvolveState(cwd);
  const milestoneInfo: MilestoneInfo = getMilestoneInfo(cwd);

  // Extract evolve state summary
  const evolveGroupState = evolveState as EvolveGroupState | null;
  const evolveExists: boolean = evolveState !== null;
  const iteration: number = evolveState?.iteration ?? 0;
  const remainingGroupsCount: number = evolveGroupState?.remaining_groups?.length ?? 0;
  const allItemsCount: number = evolveGroupState?.all_items_count ?? 0;

  const result = {
    evolve_state: {
      exists: evolveExists,
      iteration,
      remaining_groups_count: remainingGroupsCount,
      all_items_count: allItemsCount,
    },
    current_milestone: {
      version: milestoneInfo.version,
      name: milestoneInfo.name,
    },
    config: {
      model_profile: config.model_profile,
      autonomous_mode: config.autonomous_mode,
    },
  };

  output(result, raw, `Milestone: ${result.current_milestone.version}, evolve_state: iteration ${result.evolve_state.iteration}${result.evolve_state.exists ? ' (active)' : ''}`);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  buildAutoplanPrompt,
  runAutoplan,
  cmdAutoplan,
  cmdInitAutoplan,
};
